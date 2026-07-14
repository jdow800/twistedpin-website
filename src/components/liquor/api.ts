// Typed client for the bar-inventory `/admin/bar/*` JSON API, consumed by the
// staff /liquor SPA. Same-origin model identical to src/tprs/client.ts: the SPA
// fetches relative `/tprs-api/...`, which the Vite dev proxy (astro.config.mjs)
// and the prod Vercel middleware forward to the TPRS backend, so the signed
// `tprs_session` cookie is same-origin (no CORS). Every call carries
// `credentials: "include"`.
//
// Auth signal: the session middleware answers a no-session GET with a 302 → the
// browser fetch (and the prod proxy) would FOLLOW it to the HTML login page,
// breaking JSON parsing. Sending `HX-Request: true` makes the middleware answer
// with a clean 401 instead (its documented fetch-client path) — which survives
// the proxy. So gated calls send that header and treat 401 = not-logged-in,
// 403 = logged-in-but-no-bar-permission.

const API_BASE: string =
  (import.meta.env.PUBLIC_TPRS_API_BASE as string | undefined)?.replace(/\/$/, "") ??
  "/tprs-api";
const USING_DEV_PROXY = API_BASE === "/tprs-api";

/** Dev proxy needs a trailing slash before the query (trailingSlash:'always'); prod passes through. */
function buildUrl(path: string): string {
  if (!USING_DEV_PROXY) return `${API_BASE}${path}`;
  const qIdx = path.indexOf("?");
  const pathname = qIdx === -1 ? path : path.slice(0, qIdx);
  const query = qIdx === -1 ? "" : path.slice(qIdx);
  const slashed = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${API_BASE}${slashed}${query}`;
}

/** Not logged in (no/expired session) — the SPA shows the PIN login. */
export class NotAuthedError extends Error {
  constructor() {
    super("not authenticated");
    this.name = "NotAuthedError";
  }
}
/** Logged in but the staffer lacks bar.* permission. */
export class ForbiddenError extends Error {
  constructor() {
    super("forbidden");
    this.name = "ForbiddenError";
  }
}
/** Any other non-2xx / network failure. */
export class BarApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "BarApiError";
  }
}

const HX = { "HX-Request": "true" } as const;

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(buildUrl(path), {
      credentials: "include",
      ...init,
      headers: { Accept: "application/json", ...HX, ...(init.headers ?? {}) },
    });
  } catch (err) {
    throw new BarApiError(`Network error reaching ${path}: ${(err as Error).message}`, 0);
  }
}

/** Gated call: throws NotAuthed on 401, Forbidden on 403, BarApiError otherwise; returns parsed JSON on 2xx. */
async function gatedJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await rawFetch(path, init);
  if (res.status === 401) throw new NotAuthedError();
  if (res.status === 403) throw new ForbiddenError();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BarApiError(`${init.method ?? "GET"} ${path} failed (${res.status})`, res.status, body);
  }
  return (await res.json()) as T;
}

/** Public call (pin routes): returns {ok,status,json} without throwing on 4xx (a bad PIN is a 401 JSON we read). */
async function publicJson(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await rawFetch(path, init);
  const json = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, json };
}

const jsonBody = (payload: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

// ── types (light — our own backend shapes) ──
export type KegCategory = "beer" | "red_wine" | "white_wine" | "non_alcoholic" | "other";
export interface BarActor {
  id: string;
  displayName: string;
  roleName: string;
  permissions: string[];
}
export interface PinUser {
  id: string;
  displayName: string;
}
export interface BarSkuItem {
  id: string;
  name: string;
  category: string | null;
  sizeMl: number | null;
  trackingMode: "variance" | "stock_count";
  wacCost: string | null;
}
export interface BarZoneItem {
  id: string;
  name: string;
  walkOrder: number;
}
export interface KegKnownItem {
  name: string;
  category: KegCategory;
}
export interface CountLineInput {
  zoneId: string;
  skuId: string;
  qtyUnits: number;
  source: "grid" | "voice";
  rawUtterance?: string;
}
export interface KegLineInput {
  kegName: string;
  category: KegCategory;
  qty: number;
  source: "grid" | "voice";
  rawUtterance?: string;
}

// ── auth ──
export async function getMe(): Promise<BarActor> {
  const { actor } = await gatedJson<{ actor: BarActor | null }>("/admin/bar/me");
  if (!actor) throw new NotAuthedError();
  return actor;
}
export async function listPinUsers(): Promise<PinUser[]> {
  const { json } = await publicJson("/admin/bar/pin-users");
  return ((json as { users?: PinUser[] } | undefined)?.users ?? []) as PinUser[];
}
export async function pinLogin(
  userId: string,
  pin: string,
): Promise<{ ok: true; actor: PinUser } | { ok: false; error: string; message?: string }> {
  const { ok, json } = await publicJson("/admin/bar/pin-login", jsonBody({ userId, pin }));
  if (ok) {
    const j = json as { actor: PinUser };
    return { ok: true, actor: j.actor };
  }
  const j = (json ?? {}) as { error?: string; message?: string };
  return { ok: false, error: j.error ?? "error", message: j.message };
}
export async function logout(): Promise<void> {
  await publicJson("/admin/bar/logout", { method: "POST" });
}

// ── catalog + zones ──
export async function getCatalog(): Promise<BarSkuItem[]> {
  const { items } = await gatedJson<{ items: BarSkuItem[] }>("/admin/bar/catalog");
  return items;
}
export async function getZones(): Promise<BarZoneItem[]> {
  const { zones } = await gatedJson<{ zones: BarZoneItem[] }>("/admin/bar/zones");
  return zones;
}

// ── liquor counts ──
export async function createCount(isFullCount: boolean): Promise<string> {
  const { sessionId } = await gatedJson<{ sessionId: string }>(
    "/admin/bar/counts",
    jsonBody({ isFullCount }),
  );
  return sessionId;
}
export async function saveCountLines(sessionId: string, lines: CountLineInput[]): Promise<void> {
  if (lines.length === 0) return;
  await gatedJson(`/admin/bar/counts/${sessionId}/lines`, { ...jsonBody({ lines }), method: "PUT" });
}
export async function submitCount(sessionId: string): Promise<number> {
  const { lineCount } = await gatedJson<{ lineCount: number }>(
    `/admin/bar/counts/${sessionId}/submit`,
    { method: "POST" },
  );
  return lineCount;
}

// ── keg counts ──
export async function getKegKnown(): Promise<KegKnownItem[]> {
  const { kegs } = await gatedJson<{ kegs: KegKnownItem[] }>("/admin/bar/keg-known");
  return kegs;
}
export async function createKegCount(): Promise<string> {
  const { sessionId } = await gatedJson<{ sessionId: string }>("/admin/bar/keg-counts", {
    method: "POST",
  });
  return sessionId;
}
export async function saveKegLines(sessionId: string, lines: KegLineInput[]): Promise<void> {
  await gatedJson(`/admin/bar/keg-counts/${sessionId}/lines`, { ...jsonBody({ lines }), method: "PUT" });
}
export async function submitKegCount(sessionId: string): Promise<number> {
  const { lineCount } = await gatedJson<{ lineCount: number }>(
    `/admin/bar/keg-counts/${sessionId}/submit`,
    { method: "POST" },
  );
  return lineCount;
}

// ── invoice upload (compress client-side; the Vercel proxy caps bodies ~4.5MB) ──
const PROXY_SAFE_RAW_BYTES = 3 * 1024 * 1024;

/**
 * Downscale + re-encode to JPEG in the browser (max edge 2400, q0.85). Also
 * converts iOS HEIC → JPEG (Safari decodes HEIC via createImageBitmap), which
 * the backend requires (the extraction worker only accepts jpeg/png/webp/gif).
 * Returns null when the file can't be decoded → caller surfaces an error.
 */
async function compressToJpeg(file: File): Promise<{ blob: Blob } | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return null;
    }
  }
  try {
    const MAX_EDGE = 2400; // invoices are text-dense; keep more detail than a photo
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff"; // flatten any alpha to white (thermal receipts)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = 0.85;
    let blob: Blob | null = null;
    // Step quality down until it fits under the proxy ceiling.
    for (let i = 0; i < 4; i++) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob || blob.size <= PROXY_SAFE_RAW_BYTES) break;
      quality -= 0.15;
    }
    return blob ? { blob } : null;
  } finally {
    bitmap.close();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      resolve(r.slice(r.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/** Max pages per invoice — mirrors the backend's images/pages max(6). */
export const MAX_INVOICE_PAGES = 6;

/**
 * Upload an invoice's page photos → a pending bar_invoice. Uploads ONE page per
 * request (each stays under the ~4.5 MB Vercel proxy body cap — batching all
 * pages in one POST would overflow it), then creates the invoice from the staged
 * page keys. Returns the invoice id.
 */
export async function uploadInvoice(files: File[]): Promise<string> {
  if (files.length === 0) throw new BarApiError("Add at least one page.", 0);
  if (files.length > MAX_INVOICE_PAGES) {
    throw new BarApiError(
      `Up to ${MAX_INVOICE_PAGES} pages per invoice — send these, then start another for the rest.`,
      0,
    );
  }
  const pages: { storageKey: string; contentType: "image/jpeg"; pageNumber: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const compressed = await compressToJpeg(files[i]!);
    if (!compressed) {
      throw new BarApiError(`Couldn't read page ${i + 1} — try re-taking that photo.`, 0);
    }
    if (compressed.blob.size > PROXY_SAFE_RAW_BYTES) {
      throw new BarApiError(`Page ${i + 1} is too large even after shrinking — retake it closer.`, 413);
    }
    const data = await blobToBase64(compressed.blob);
    const { pageKey } = await gatedJson<{ pageKey: string }>(
      "/admin/bar/invoice-pages",
      jsonBody({ contentType: "image/jpeg", data }),
    );
    pages.push({ storageKey: pageKey, contentType: "image/jpeg", pageNumber: i + 1 });
  }
  const { invoiceId } = await gatedJson<{ invoiceId: string }>(
    "/admin/bar/invoices",
    jsonBody({ pages }),
  );
  return invoiceId;
}
