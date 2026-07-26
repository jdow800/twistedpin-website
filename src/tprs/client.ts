// Typed client for the TPRS customer-flow HTTP API (ADR-0025) consumed by the
// /tprs booking islands. Every call fetches then parses through the vendored
// zod schema (src/tprs/schemas) so the island only ever touches validated,
// typed data — the schema is the contract, never a hand-rolled shape.
//
// API base resolution (ADR-0029 §3 cross-origin story):
//   - Dev: defaults to `/tprs-api`, a same-origin path the Vite dev proxy
//     (astro.config.mjs) forwards to the backend on localhost:3000. Same-origin
//     sidesteps CORS + the Secure/Domain-pinned cart cookie on localhost http.
//   - Deployed preview: set PUBLIC_TPRS_API_BASE to a real API host
//     (e.g. https://api.twistedpin.com) — which then needs CORS allowlisting of
//     the Website origin (a backend/infra step, see src/tprs/README.md).
//
// Reads + coupon-preview + quote, plus the Slice-2 write surface: cart-hold
// (addCartItems / removeCartLine), createPaymentIntent, and convertCheckout —
// the real cart → PaymentIntent → convert checkout. All carry credentials so the
// cart-token cookie rides along (must be same-origin via the dev proxy).

import {
  bookableProductsResponseSchema,
  productsResponseSchema,
  availabilityResponseSchema,
  slotAvailabilityResponseSchema,
  monthAvailabilityResponseSchema,
  productFormsResponseSchema,
  couponPreviewResponseSchema,
  optInRewardPreviewResponseSchema,
  quoteResponseSchema,
  cartStateSchema,
  paymentIntentCreateResponseSchema,
  bookingConvertedResponseSchema,
  type BookableProductsResponse,
  type ProductsResponse,
  type AvailabilityResponse,
  type SlotAvailabilityResponse,
  type MonthAvailabilityResponse,
  type ProductFormsResponse,
  type CouponPreviewResponse,
  type CouponPreviewRequest,
  type OptInRewardPreviewResponse,
  type OptInRewardPreviewRequest,
  type QuoteRequest,
  type QuoteResponse,
  type CartAddRequest,
  type CartState,
  type PaymentIntentCreateRequest,
  type PaymentIntentCreateResponse,
  type CheckoutPayload,
  type BookingConvertedResponse,
} from "./schemas";

/** Resolved once at module load. `import.meta.env` is inlined at build time. */
const API_BASE: string =
  (import.meta.env.PUBLIC_TPRS_API_BASE as string | undefined)?.replace(
    /\/$/,
    "",
  ) ?? "/tprs-api";

/** True when hitting the same-origin Vite dev proxy (vs. a real API host). */
const USING_DEV_PROXY = API_BASE === "/tprs-api";

/**
 * Build the request URL. Through the dev proxy we must insert a trailing slash
 * before the query string: the site runs `trailingSlash: 'always'`, so Astro's
 * dev server 404s a non-slash path before the Vite proxy can forward it. The
 * proxy `rewrite` (astro.config.mjs) strips the slash back off so the backend's
 * no-trailing-slash Fastify routes still match. Against a real API host
 * (PUBLIC_TPRS_API_BASE) we pass the path through untouched.
 */
function buildUrl(path: string): string {
  if (!USING_DEV_PROXY) return `${API_BASE}${path}`;
  const qIdx = path.indexOf("?");
  const pathname = qIdx === -1 ? path : path.slice(0, qIdx);
  const query = qIdx === -1 ? "" : path.slice(qIdx);
  const slashed = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${API_BASE}${slashed}${query}`;
}

/** Thrown for any non-2xx response or network failure; carries the status. */
export class TprsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "TprsApiError";
  }
}

/**
 * Thrown for a structured checkout 4xx (cart / payment-intents / convert). Carries
 * the backend's typed `code` (e.g. `coupon_rejected`, `cart_hold_expired`,
 * `capacity_exhausted`, `terms_not_accepted`, `payment_intent_invalid`) +
 * `couponReason`/`failureReason` so the SPA can branch the inline retry UX.
 */
export class TprsCheckoutError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly couponReason: string | undefined,
    readonly failureReason: string | undefined,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "TprsCheckoutError";
  }
}

/** Map a non-2xx checkout response body → a typed TprsCheckoutError (always throws). */
function throwCheckout(status: number, json: unknown): never {
  const b = (json ?? {}) as Record<string, unknown>;
  throw new TprsCheckoutError(
    typeof b.error === "string" ? b.error : `checkout request failed (${status})`,
    status,
    typeof b.code === "string" ? b.code : undefined,
    typeof b.couponReason === "string" ? b.couponReason : undefined,
    typeof b.failureReason === "string" ? b.failureReason : undefined,
    json,
  );
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      headers: { Accept: "application/json" },
      // Carry the cart-token cookie when it exists (Slice 2); harmless on reads.
      credentials: "include",
      signal,
    });
  } catch (err) {
    throw new TprsApiError(
      `Network error reaching ${path}: ${(err as Error).message}`,
      0,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TprsApiError(
      `GET ${path} failed (${res.status})`,
      res.status,
      body,
    );
  }
  return res.json();
}

async function postJson(
  path: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    throw new TprsApiError(
      `Network error reaching ${path}: ${(err as Error).message}`,
      0,
    );
  }
  const json = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, json };
}

async function deleteJson(
  path: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      method: "DELETE",
      headers: { Accept: "application/json" },
      credentials: "include",
      signal,
    });
  } catch (err) {
    throw new TprsApiError(
      `Network error reaching ${path}: ${(err as Error).message}`,
      0,
    );
  }
  const json = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, json };
}

/** Serve URL for a stored upload — use as an `<img src>` (admin + SPA preview). */
export function formUploadUrl(id: string): string {
  return buildUrl(`/api/forms/upload/${id}`);
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1)); // strip data: prefix
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * The upload POST transits the Vercel middleware proxy, which hard-caps
 * request bodies at ~4.5 MB (FUNCTION_PAYLOAD_TOO_LARGE — not configurable).
 * Base64 adds +33%, so the raw image must stay under ~3 MB on the wire. The
 * backend's own limit (20 MB direct) is NOT the constraint.
 */
const PROXY_SAFE_RAW_BYTES = 3 * 1024 * 1024;

/**
 * Downscale + re-encode a photo in the browser (max edge 2000px, JPEG q0.85).
 * A 12 MB phone photo becomes a few hundred KB — these images render on lane
 * screens, not billboards. Returns null when the file can't be decoded
 * (caller falls back to the original bytes). GIFs are skipped by the caller
 * (canvas would flatten the animation).
 */
async function compressImageForUpload(
  file: File,
): Promise<{ blob: Blob; contentType: string } | null> {
  let bitmap: ImageBitmap;
  try {
    // from-image = honor EXIF orientation (phone portraits).
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return null;
    }
  }
  try {
    const MAX_EDGE = 2000;
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return blob ? { blob, contentType: "image/jpeg" } : null;
  } finally {
    bitmap.close();
  }
}

/**
 * Upload a guest image for a `file` form field. Photos are downscaled
 * client-side first (see PROXY_SAFE_RAW_BYTES — the proxy, not the backend,
 * is the size ceiling), then POSTed as base64; returns the stored upload id
 * (the field's answer value). Throws `TprsApiError` on rejection.
 */
export async function uploadFormImage(file: File): Promise<string> {
  let payload: Blob = file;
  let contentType = file.type;
  let filename = file.name;
  if (file.type !== "image/gif") {
    const compressed = await compressImageForUpload(file);
    // Use the re-encode when it's smaller OR the original can't fit through
    // the proxy anyway (a tiny already-small JPEG keeps its original bytes).
    if (
      compressed &&
      (compressed.blob.size < file.size || file.size > PROXY_SAFE_RAW_BYTES)
    ) {
      payload = compressed.blob;
      contentType = compressed.contentType;
      filename = filename.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    }
  }
  if (payload.size > PROXY_SAFE_RAW_BYTES) {
    throw new TprsApiError(
      "That photo is too large to send — try a smaller image (or a screenshot of it).",
      413,
    );
  }
  const data = await fileToBase64(payload);
  const { ok, status, json } = await postJson("/api/forms/upload", {
    filename,
    contentType,
    data,
  });
  if (!ok) {
    const msg =
      (json as { message?: string } | undefined)?.message ??
      (status === 413
        ? "That photo is too large to send — try a smaller image."
        : "Upload failed.");
    throw new TprsApiError(msg, status);
  }
  return (json as { id: string }).id;
}

/** GET /api/products/bookable — all bookable products, grouped by category. */
export async function getBookableProducts(
  signal?: AbortSignal,
): Promise<BookableProductsResponse> {
  return bookableProductsResponseSchema.parse(
    await getJson("/api/products/bookable", signal),
  );
}

/** GET /api/products?codes= — the curated per-URL Product set (pageConfig). */
export async function getProducts(
  codes: number[],
  signal?: AbortSignal,
): Promise<ProductsResponse> {
  const qs = encodeURIComponent(codes.join(","));
  return productsResponseSchema.parse(
    await getJson(`/api/products?codes=${qs}`, signal),
  );
}

/** GET /api/availability/month — per-day boolean availability for a month. */
export async function getMonthAvailability(
  productId: string,
  month: string, // YYYY-MM
  signal?: AbortSignal,
): Promise<MonthAvailabilityResponse> {
  return monthAvailabilityResponseSchema.parse(
    await getJson(
      `/api/availability/month?product_id=${productId}&month=${month}`,
      signal,
    ),
  );
}

/** GET /api/availability — per-slot price + boolean availability for one date. */
export async function getAvailability(
  productId: string,
  date: string, // YYYY-MM-DD
  signal?: AbortSignal,
): Promise<AvailabilityResponse> {
  return availabilityResponseSchema.parse(
    await getJson(
      `/api/availability?product_id=${productId}&date=${date}`,
      signal,
    ),
  );
}

/**
 * GET /api/availability/slot — max bookable UNITS at one selected slot, for the
 * "How many lanes?" stepper cap. Returns `maxUnits` (uncapped at the online
 * max — the caller does `min(onlineCap, maxUnits)`). Advisory; checkout's strict
 * check stays authoritative. The grid endpoint stays boolean (AH-7).
 */
export async function getSlotMaxUnits(
  productId: string,
  date: string, // YYYY-MM-DD
  time: string, // HH:MM
  signal?: AbortSignal,
): Promise<SlotAvailabilityResponse> {
  return slotAvailabilityResponseSchema.parse(
    await getJson(
      `/api/availability/slot?product_id=${productId}&date=${date}&time=${time}`,
      signal,
    ),
  );
}

/** GET /api/products/:id/forms — renderable booking-question forms (ADR-0030). */
export async function getProductForms(
  productId: string,
  signal?: AbortSignal,
): Promise<ProductFormsResponse> {
  return productFormsResponseSchema.parse(
    await getJson(`/api/products/${productId}/forms`, signal),
  );
}

/**
 * POST /api/checkout/coupon-preview — read-only "what would this code save me"
 * check (ADR-0028 §4). Returns the parsed response on 200; on a 4xx the body is
 * still the coupon-preview shape (`{ valid: false, reason }`), so we parse it
 * too rather than throwing — the caller surfaces `reason` inline on the field.
 */
export async function previewCoupon(
  req: CouponPreviewRequest,
  signal?: AbortSignal,
): Promise<CouponPreviewResponse> {
  const { ok, status, json } = await postJson(
    "/api/checkout/coupon-preview",
    req,
    signal,
  );
  // Try the coupon-preview shape regardless of status (some validators bounce
  // an invalid code as a 4xx carrying the same { valid:false, reason } body).
  const parsed = couponPreviewResponseSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  throw new TprsApiError(
    `coupon-preview failed (${status})`,
    status,
    ok ? json : json,
  );
}

/**
 * POST /api/checkout/optin-reward-preview — is the SMS-marketing opt-in reward
 * still available to this guest, for this cart?
 *
 * NEVER THROWS. Every failure — network, 4xx, 5xx, an older backend that 404s
 * because this endpoint isn't deployed yet — resolves to
 * `{ available: false }`, which renders the plain opt-in box. Failing closed is
 * the entire point: not showing a $10 offer is a non-event, while showing one we
 * then withdraw at payment is the support call we are designing this to avoid.
 */
export async function previewOptInReward(
  req: OptInRewardPreviewRequest,
  signal?: AbortSignal,
): Promise<OptInRewardPreviewResponse> {
  const unavailable = { available: false, amountCents: 0 };
  try {
    const { json } = await postJson(
      "/api/checkout/optin-reward-preview",
      req,
      signal,
    );
    const parsed = optInRewardPreviewResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : unavailable;
  } catch {
    return unavailable;
  }
}

/**
 * POST /api/checkout/quote — server-authoritative subtotal + tax + total. The
 * SPA renders these verbatim (never computes tax itself). Throws on non-2xx
 * (e.g. 404 while the backend endpoint is still being built — the caller falls
 * back to the pre-tax display).
 */
export async function getQuote(
  req: QuoteRequest,
  signal?: AbortSignal,
): Promise<QuoteResponse> {
  const { ok, status, json } = await postJson("/api/checkout/quote", req, signal);
  if (!ok) throw new TprsApiError(`quote failed (${status})`, status, json);
  return quoteResponseSchema.parse(json);
}

/* ── Slice 2: cart-hold → payment-intent → convert ─────────────────────────
 * The real checkout. All four send `credentials: 'include'` (postJson/deleteJson
 * already do) so the cart-token cookie set by addCartItems rides along — the
 * payment-intents amount is sized server-side from that cookie, never the client
 * total. MUST be same-origin via the dev proxy for the Secure/Domain cookie to
 * stick (see API_BASE note above). */

/**
 * POST /api/cart/items — batch-add (acquires a soft capacity hold per resource-
 * consuming line) + sets the cart-token cookie on first add. Returns the thin
 * cart state, including `cartToken` (carried to convert) + the hold expiry.
 * Throws `TprsCheckoutError` (`capacity_exhausted` / `invalid_item` /
 * `missing_start_time`).
 */
export async function addCartItems(
  items: CartAddRequest,
  signal?: AbortSignal,
): Promise<CartState> {
  const { ok, status, json } = await postJson("/api/cart/items", items, signal);
  if (!ok) throwCheckout(status, json);
  return cartStateSchema.parse(json);
}

/**
 * GET /api/cart — the current cart (existing holds + earliest expiry) WITHOUT
 * acquiring anything. The payment step calls this on mount to ADOPT a live hold
 * on refresh / re-entry instead of POSTing another add (which stacks a duplicate
 * hold per call; `holdExpiresAt` is the earliest, so stacking made the countdown
 * jump to the oldest hold's seconds-left). Empty cart → { cartToken:"",
 * holds:[], holdExpiresAt:null }.
 */
export async function getCart(signal?: AbortSignal): Promise<CartState> {
  return cartStateSchema.parse(await getJson("/api/cart", signal));
}

/** DELETE /api/cart/items/:id (:id = cartLineRef) — release a line's hold; returns the updated cart. */
export async function removeCartLine(
  cartLineRef: string,
  signal?: AbortSignal,
): Promise<CartState> {
  const { ok, status, json } = await deleteJson(
    `/api/cart/items/${encodeURIComponent(cartLineRef)}`,
    signal,
  );
  if (!ok) throwCheckout(status, json);
  return cartStateSchema.parse(json);
}

/**
 * POST /api/checkout/payment-intents — captures customer identity + creates the
 * rail PaymentIntent, sizing the amount server-side from the cart cookie. Returns
 * `{ clientSecret, paymentIntentId }`. An invalid coupon throws a
 * `TprsCheckoutError` with `code: 'coupon_rejected'` + `couponReason` (no intent
 * created); `cart_hold_expired` if the cookie is gone.
 */
export async function createPaymentIntent(
  req: PaymentIntentCreateRequest,
  signal?: AbortSignal,
): Promise<PaymentIntentCreateResponse> {
  const { ok, status, json } = await postJson(
    "/api/checkout/payment-intents",
    req,
    signal,
  );
  if (!ok) throwCheckout(status, json);
  return paymentIntentCreateResponseSchema.parse(json);
}

/**
 * POST /api/checkout/convert — after `stripe.confirmPayment` succeeds, materializes
 * the Booking from the (already-confirmed) PaymentIntent. Idempotent + race-hardened
 * against the webhook. Returns `{ bookingId, paymentRecordId, customerId,
 * invoiceNumber, railStatus }`. Throws `TprsCheckoutError` with the typed `code`
 * (`coupon_rejected` / `cart_hold_expired` / `capacity_exhausted` /
 * `terms_not_accepted` / `payment_intent_invalid` / …) on a 4xx.
 */
export async function convertCheckout(
  req: CheckoutPayload,
  signal?: AbortSignal,
): Promise<BookingConvertedResponse> {
  const { ok, status, json } = await postJson(
    "/api/checkout/convert",
    req,
    signal,
  );
  if (!ok) throwCheckout(status, json);
  return bookingConvertedResponseSchema.parse(json);
}
