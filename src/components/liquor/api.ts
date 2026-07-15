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
/** PIN-only login — the PIN itself identifies the staffer (no name pick). */
export async function pinLogin(
  pin: string,
): Promise<{ ok: true; actor: PinUser } | { ok: false; error: string; message?: string }> {
  const { ok, json } = await publicJson("/admin/bar/pin-login", jsonBody({ pin }));
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
export interface OpenCountLine {
  zoneId: string;
  skuId: string;
  qtyUnits: string; // numeric → JSON string
  source: "grid" | "voice";
  rawUtterance: string | null;
}
export interface OpenCount {
  id: string;
  startedAt: string;
  lines: OpenCountLine[];
}
/** The staffer's most recent in-progress draft (to resume across logout/reload), or null. */
export async function getOpenCount(): Promise<OpenCount | null> {
  const { session } = await gatedJson<{ session: OpenCount | null }>("/admin/bar/counts/open");
  return session;
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

// ── run-on voice extraction (browser transcribes → server maps to catalog) ──
export interface VoiceMatch {
  id: string;
  name: string;
  sizeMl: number | null;
}
export interface VoiceExtractItem {
  spoken: string;
  qty: number;
  match: VoiceMatch | null; // set when exactly one bottle matched
  candidates: VoiceMatch[]; // 2+ when the name was ambiguous (counter picks one)
}

/** Send a zone's dictation transcript → catalog-mapped {bottle, qty} items with
 *  ambiguous names flagged. Surfaces the server's friendly message on 502/503. */
export async function extractVoice(transcript: string): Promise<VoiceExtractItem[]> {
  try {
    const { items } = await gatedJson<{ items: VoiceExtractItem[] }>(
      "/admin/bar/voice-extract",
      jsonBody({ transcript }),
    );
    return items;
  } catch (e) {
    if (e instanceof BarApiError && typeof e.body === "string") {
      let msg: string | undefined;
      try {
        msg = (JSON.parse(e.body) as { message?: string }).message;
      } catch {
        /* body wasn't JSON */
      }
      if (msg) throw new BarApiError(msg, e.status, e.body);
    }
    throw e;
  }
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
export interface OpenKegLine {
  kegName: string;
  category: KegCategory;
  qty: number;
  source: "grid" | "voice";
  rawUtterance: string | null;
}
export interface OpenKegCount {
  id: string;
  startedAt: string;
  lines: OpenKegLine[];
}
/** The staffer's most recent in-progress keg draft (to resume across reload), or null. */
export async function getOpenKegCount(): Promise<OpenKegCount | null> {
  const { session } = await gatedJson<{ session: OpenKegCount | null }>("/admin/bar/keg-counts/open");
  return session;
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
export interface KegVoiceItem {
  kegName: string;
  qty: number;
  category: KegCategory;
}
/** Run-on keg dictation → {kegName, qty, category} items (open-vocab, learns from prior counts). */
export async function extractKegVoice(transcript: string): Promise<KegVoiceItem[]> {
  try {
    const { items } = await gatedJson<{ items: KegVoiceItem[] }>(
      "/admin/bar/keg-voice-extract",
      jsonBody({ transcript }),
    );
    return items;
  } catch (e) {
    if (e instanceof BarApiError && typeof e.body === "string") {
      let msg: string | undefined;
      try {
        msg = (JSON.parse(e.body) as { message?: string }).message;
      } catch {
        /* not json */
      }
      if (msg) throw new BarApiError(msg, e.status, e.body);
    }
    throw e;
  }
}

// ── invoice history (read-only review list) ──
export type BarInvoiceStatus = "pending" | "extracted" | "flagged" | "confirmed";
export interface InvoiceSummary {
  id: string;
  vendorText: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  status: BarInvoiceStatus;
  printedTotal: string | null;
  pageCount: number;
  createdAt: string;
}
export interface InvoiceLine {
  id: string;
  lineType: "product" | "deposit" | "fee" | "return" | "keg" | "unknown";
  rawDescription: string | null;
  sizeText: string | null;
  qtyUnits: string | null;
  unitCost: string | null;
  extendedAmount: string;
  needsReview: boolean;
  matchedName: string | null;
}
export interface InvoiceImageRef {
  id: string;
  pageNumber: number | null;
  contentType: string | null;
}
export interface InvoiceDetail {
  invoice: InvoiceSummary & { extractedTotal: string | null };
  lines: InvoiceLine[];
  images: InvoiceImageRef[];
}
export async function getInvoiceHistory(): Promise<InvoiceSummary[]> {
  const { invoices } = await gatedJson<{ invoices: InvoiceSummary[] }>("/admin/bar/invoices/history");
  return invoices;
}
export async function getInvoiceDetail(id: string): Promise<InvoiceDetail> {
  return gatedJson<InvoiceDetail>(`/admin/bar/invoices/${id}`);
}
/** Confirm a needs-review invoice line → a SKU. Learns the vendor alias + refreshes
 *  the SKU cost server-side; returns whether the whole invoice is now confirmed. */
export async function matchInvoiceLine(
  invoiceId: string,
  lineId: string,
  skuId: string,
): Promise<{ matchedName: string; aliasLearned: boolean; invoiceConfirmed: boolean }> {
  return gatedJson(`/admin/bar/invoices/${invoiceId}/lines/${lineId}/match`, jsonBody({ skuId }));
}
/** Create a NEW bottle from an unmatched invoice line (new product or new size),
 *  match the line to it, and learn the alias + seed its cost. */
export async function newSkuFromLine(
  invoiceId: string,
  lineId: string,
  name: string,
  sizeMl: number | null,
): Promise<{ skuId: string; matchedName: string; invoiceConfirmed: boolean }> {
  return gatedJson(`/admin/bar/invoices/${invoiceId}/lines/${lineId}/new-sku`, jsonBody({ name, sizeMl }));
}
/** Same-origin URL for an invoice page image — the <img>/link request carries the
 *  session cookie (the staffer is already authed), so no header is needed. */
export function invoiceImageUrl(imageId: string): string {
  const path = `/admin/bar/invoices/images/${imageId}`;
  return USING_DEV_PROXY ? `${API_BASE}${path}/` : `${API_BASE}${path}`;
}

// ── completed-inventory history ──
export interface CountSummary {
  id: string;
  countedBy: string | null;
  isFullCount: boolean;
  startedAt: string;
  submittedAt: string | null;
  lineCount: number;
}
export interface CountDetailLine {
  zoneId: string;
  zoneName: string | null;
  skuId: string;
  skuName: string | null;
  sizeMl: number | null;
  qtyUnits: string;
  source: "grid" | "voice";
}
export interface CountDetail {
  session: {
    id: string;
    status: "draft" | "submitted" | "reconciled";
    isFullCount: boolean;
    note: string | null;
    startedAt: string;
    submittedAt: string | null;
    countedBy: string | null;
  };
  lines: CountDetailLine[];
}
export async function getCountHistory(): Promise<CountSummary[]> {
  const { counts } = await gatedJson<{ counts: CountSummary[] }>("/admin/bar/counts/history");
  return counts;
}
export async function getCountDetail(id: string): Promise<CountDetail> {
  return gatedJson<CountDetail>(`/admin/bar/counts/${id}`);
}
export interface KegCountSummary {
  id: string;
  countedBy: string | null;
  startedAt: string;
  submittedAt: string | null;
  totalKegs: number;
  lineCount: number;
}
export interface KegCountDetailLine {
  kegName: string;
  category: KegCategory;
  qty: number;
}
export interface KegCountDetail {
  session: {
    id: string;
    status: "draft" | "submitted" | "reconciled";
    startedAt: string;
    submittedAt: string | null;
    countedBy: string | null;
  };
  lines: KegCountDetailLine[];
}
export async function getKegCountHistory(): Promise<KegCountSummary[]> {
  const { counts } = await gatedJson<{ counts: KegCountSummary[] }>("/admin/bar/keg-counts/history");
  return counts;
}
export async function getKegCountDetail(id: string): Promise<KegCountDetail> {
  return gatedJson<KegCountDetail>(`/admin/bar/keg-counts/${id}`);
}

// ── price watch (liquor $/oz movers) ──
export interface PriceMover {
  skuId: string;
  name: string;
  sizeMl: number;
  oldPpo: number;
  newPpo: number;
  oldCost: number;
  newCost: number;
  pct: number;
  oldAt: string;
  newAt: string;
}
export async function getPriceWatch(): Promise<PriceMover[]> {
  const { movers } = await gatedJson<{ movers: PriceMover[] }>("/admin/bar/price-watch");
  return movers;
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

export const isPdfFile = (f: File): boolean =>
  f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/**
 * Upload an invoice's pages → a pending bar_invoice. Photos are compressed to
 * JPEG; a PDF (emailed / desktop) is sent as-is (Claude reads it natively). One
 * request per file (each stays under the ~4.5 MB Vercel proxy body cap), then
 * the invoice is created from the staged keys. Returns the invoice id.
 */
export async function uploadInvoice(files: File[]): Promise<string> {
  if (files.length === 0) throw new BarApiError("Add at least one page.", 0);
  if (files.length > MAX_INVOICE_PAGES) {
    throw new BarApiError(
      `Up to ${MAX_INVOICE_PAGES} pages per invoice — send these, then start another for the rest.`,
      0,
    );
  }
  const pages: { storageKey: string; contentType: "image/jpeg" | "application/pdf"; pageNumber: number }[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    let blob: Blob;
    let contentType: "image/jpeg" | "application/pdf";
    if (isPdfFile(file)) {
      blob = file; // PDFs go through as-is
      contentType = "application/pdf";
    } else {
      const compressed = await compressToJpeg(file);
      if (!compressed) {
        throw new BarApiError(`Couldn't read page ${i + 1} — try re-taking that photo.`, 0);
      }
      blob = compressed.blob;
      contentType = "image/jpeg";
    }
    if (blob.size > PROXY_SAFE_RAW_BYTES) {
      throw new BarApiError(
        contentType === "application/pdf"
          ? "That PDF is too large (max ~3 MB) — try a smaller/compressed export."
          : `Page ${i + 1} is too large even after shrinking — retake it closer.`,
        413,
      );
    }
    const data = await blobToBase64(blob);
    const { pageKey } = await gatedJson<{ pageKey: string }>(
      "/admin/bar/invoice-pages",
      jsonBody({ contentType, data }),
    );
    pages.push({ storageKey: pageKey, contentType, pageNumber: i + 1 });
  }
  const { invoiceId } = await gatedJson<{ invoiceId: string }>(
    "/admin/bar/invoices",
    jsonBody({ pages }),
  );
  return invoiceId;
}
