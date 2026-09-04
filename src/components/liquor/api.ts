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
  /** Containers per purchase case. null = unknown — the UI must ASK, never
   *  assume (a wrong multiplier silently scales the whole count). */
  unitsPerCase: number | null;
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
  /** ALWAYS individual containers — the canonical unit. Cases are expanded
   *  before this is sent, and the server re-derives it from the two fields
   *  below when they're present (it owns the conversion, not the client). */
  qtyUnits: number;
  source: "grid" | "voice";
  rawUtterance?: string;
  /** What the counter actually typed, so the count round-trips on resume. */
  enteredCases?: number;
  /** The multiplier FROZEN at entry — never re-read from the catalog later. */
  caseSizeAtEntry?: number | null;
  /** The intermediate pack tier — a six-pack of beer, a four-pack of Owen's.
   *  Same (count x size) shape as the case pair, one rung down. */
  enteredPacks?: number;
  packSizeAtEntry?: number | null;
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
  enteredCases: string | null; // numeric → JSON string
  caseSizeAtEntry: number | null;
  enteredPacks: string | null; // numeric → JSON string
  packSizeAtEntry: number | null;
  source: "grid" | "voice";
  rawUtterance: string | null;
}
export interface OpenCount {
  id: string;
  startedAt: string;
  lines: OpenCountLine[];
}
/** The staffer's most recent in-progress draft (to resume across logout/reload), or null. */
export async function getOpenCount(full = true): Promise<OpenCount | null> {
  // `full` picks WHICH kind of draft to resume. The liquor count owns full
  // drafts, the bottled-beer section owns partial ones; without the split one
  // screen resumes the other screen's draft and a full count lands in a session
  // the variance worker never reads.
  const { session } = await gatedJson<{ session: OpenCount | null }>(
    `/admin/bar/counts/open?full=${full ? "true" : "false"}`,
  );
  return session;
}
/** Replace the draft's lines with exactly these. An EMPTY array is meaningful —
 *  it means the counter removed everything — so it is sent, not skipped. */
export async function saveCountLines(sessionId: string, lines: CountLineInput[]): Promise<void> {
  await gatedJson(`/admin/bar/counts/${sessionId}/lines`, { ...jsonBody({ lines }), method: "PUT" });
}
/** One flagged bottle from the pre-submit sanity check. */
export interface PrecheckFinding {
  /** impossible = more on the shelf than you started with plus deliveries (the
   *  case-vs-bottle slip, or an unscanned invoice — the two are indistinguishable,
   *  which is why the copy must offer both). not_counted = had it last period,
   *  no line this time. overuse = the mirror slip; nearly everything gone.
   *  zone_missed = counted SOMEWHERE this time, but a zone that held >=1 unit
   *  last period has no line now AND the total dropped — the walked-past-shelf
   *  signature (Casamigos backstock, 2026-08-07: $321 of fake shrinkage that
   *  SKU-level checks structurally cannot see). first_count = never counted
   *  before but DELIVERIES exist this period and the first count exceeds them
   *  (Antica 375ml, 2026-08-17: 6 counted, 2 delivered — old stock finally
   *  cataloged and a double-spoken bottle look identical from here).
   *  sibling_swap = one variant of a brand impossibly OVER while a sibling
   *  dropped by a similar amount — a variant mix-up wearing a shrinkage
   *  costume (the Añejo counted as a second Reposado, 2026-08-17).
   *  big_loss = the sales-aware question: the variance brain (GoTab sales +
   *  purchases) expected meaningfully more left than this count found. The
   *  server computes it fail-open with a time budget, so it may be absent on
   *  a slow pull — the arithmetic kinds above always run.
   *  beer_not_counted = bottled beer has its own count surface (the keg check)
   *  and its own report, so every SKU rule above is structurally blind to it —
   *  no prior full-count line, and the never-counted gate keeps first_count
   *  quiet. On 2026-09-04, 168 bottles arrived and none were counted, and
   *  nothing said so. Fires once for the category, only when beer is
   *  demonstrably stocked and was missed on EVERY session this period. */
  kind:
    | "impossible"
    | "not_counted"
    | "overuse"
    | "zone_missed"
    | "first_count"
    | "sibling_swap"
    | "big_loss"
    | "beer_not_counted";
  skuId: string;
  name: string;
  counted: number | null;
  prior: number;
  purchased: number;
  used: number | null;
  unitsPerCase: number | null;
  dollars: number;
  detail: string;
}
export interface PrecheckResult {
  /** No prior submitted count — nothing to compare against, so no findings. */
  baseline: boolean;
  findings: PrecheckFinding[];
  truncated?: number;
}
/** Sanity-check an OPEN draft before submit. Read-only on the server; it must
 *  never write bar_variance_report (see the route's docstring — the report is a
 *  one-way door and a stray row there would kill the real one). */
export async function precheckCount(sessionId: string): Promise<PrecheckResult> {
  return gatedJson<PrecheckResult>(`/admin/bar/counts/${sessionId}/precheck`);
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
  unitsPerCase: number | null;
}
export interface VoiceExtractItem {
  spoken: string;
  /** Whole cases heard ("two cases" → 2). 0 when none were spoken. */
  cases: number;
  /** Loose containers heard, incl. fractions ("point eight" → 0.8). */
  units: number;
  /** The matched SKU's case size, or null when we don't know it. */
  unitsPerCase: number | null;
  /** Server-computed containers = cases × unitsPerCase + units. When
   *  needsCaseSize is true this carries the LOOSE units only — the cases are
   *  deliberately NOT converted, because guessing is what produced 93, 27
   *  and 1 from three case utterances on 2026-07-24. */
  qty: number;
  /** Cases were spoken but we have no case size for this bottle. The row is
   *  NOT applyable until the counter answers "how many in a case?". */
  needsCaseSize: boolean;
  /** The model appears to have multiplied cases out despite being told not to
   *  (it returned cases AND a units figure ≥ a full case). Strand, don't add. */
  suspectPreMultiplied: boolean;
  match: VoiceMatch | null; // set when exactly one bottle matched
  candidates: VoiceMatch[]; // 2+ when the name was ambiguous (counter picks one)
}

/** Answer "how many in a case?" for a SKU. Persists, so the ask happens ONCE
 *  per bottle ever; marks the value 'manual', which invoice learning will
 *  never overwrite. Pass null to clear it back to unknown. */
export async function setCaseSize(skuId: string, unitsPerCase: number | null): Promise<number | null> {
  const res = await gatedJson<{ unitsPerCase: number | null }>(
    `/admin/bar/skus/${skuId}/case-size`,
    { ...jsonBody({ unitsPerCase }), method: "PATCH" },
  );
  return res.unitsPerCase;
}

/** Transcribe one recorded audio clip (a whole take or one ~60s rotation
 *  segment) server-side. `vocabulary` picks the keyterm bias: liquor SKU names
 *  vs recent keg names. Returns plain text; "" when the clip was silence. */
export async function transcribeAudio(
  contentType: string,
  base64Data: string,
  vocabulary: "liquor" | "kegs",
): Promise<string> {
  const { transcript } = await gatedJson<{ transcript: string }>(
    "/admin/bar/transcribe-audio",
    jsonBody({ contentType, data: base64Data, vocabulary }),
  );
  return transcript;
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
  // Explicit {} body: a bodyless POST arrives at the backend as JSON null via
  // the proxy, and the route's body schema rejects null (400) — seen in prod.
  const { sessionId } = await gatedJson<{ sessionId: string }>(
    "/admin/bar/keg-counts",
    jsonBody({}),
  );
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

// ── empty-keg reports ──
// The owner's weekly verbal question ("a lot of empties from any one brand?")
// as a 30-second flow. Deliberately separate from the keg COUNT above: that one
// counts full backup stock, this one reports which brands are piling up spent.
// The amount is a band, not a number — nobody counts the stack.

export type EmptyAmount = "a_few" | "some" | "a_lot";

export interface KegBrand {
  id: string;
  name: string;
  brewery: string;
  isOnTap: boolean;
  lastOnTap: string | null;
}
export interface KegBrandList {
  brands: KegBrand[];
  /** When the PourMyBeer export was last imported — shown so a stale list is visible. */
  importedAt: string | null;
}
/** Tap-wall brands, most-recently-pulled first (the likeliest empties). */
export async function getKegBrands(): Promise<KegBrandList> {
  return gatedJson<KegBrandList>("/admin/bar/keg-brands");
}

export interface EmptyKegLineInput {
  brandId?: string | null;
  label: string;
  brewery?: string | null;
  amount: EmptyAmount;
  qty?: number | null;
  source: "grid" | "voice";
  rawUtterance?: string;
}
export async function createEmptyKegReport(): Promise<string> {
  // Explicit {} body — same proxy/null-body trap as createKegCount above.
  const { sessionId } = await gatedJson<{ sessionId: string }>(
    "/admin/bar/empty-kegs",
    jsonBody({}),
  );
  return sessionId;
}
export interface OpenEmptyKegLine {
  brandId: string | null;
  label: string;
  brewery: string | null;
  amount: EmptyAmount;
  qty: number | null;
  source: "grid" | "voice";
  rawUtterance: string | null;
}
export interface OpenEmptyKegReport {
  id: string;
  startedAt: string;
  lines: OpenEmptyKegLine[];
}
/** The staffer's in-progress empties draft (to resume across a reload), or null. */
export async function getOpenEmptyKegReport(): Promise<OpenEmptyKegReport | null> {
  const { session } = await gatedJson<{ session: OpenEmptyKegReport | null }>(
    "/admin/bar/empty-kegs/open",
  );
  return session;
}
export async function saveEmptyKegLines(
  sessionId: string,
  lines: EmptyKegLineInput[],
): Promise<void> {
  await gatedJson(`/admin/bar/empty-kegs/${sessionId}/lines`, {
    ...jsonBody({ lines }),
    method: "PUT",
  });
}
export async function submitEmptyKegReport(sessionId: string): Promise<number> {
  const { brandCount } = await gatedJson<{ brandCount: number }>(
    `/admin/bar/empty-kegs/${sessionId}/submit`,
    { method: "POST" },
  );
  return brandCount;
}
/**
 * Close both halves of a keg check and send ONE email. Either id may be null —
 * a backups-only or empties-only trip is normal. This exists because two
 * independent submits can't produce one email: send-on-first means the second
 * is silent, so the merge has to happen at submit time.
 */
export async function submitKegCheck(args: {
  kegCountId: string | null;
  emptyReportId: string | null;
  beerCountId?: string | null;
}): Promise<{ totalKegs: number; brandCount: number; totalBottles: number; emailed: boolean }> {
  return gatedJson<{
    totalKegs: number;
    brandCount: number;
    totalBottles: number;
    emailed: boolean;
  }>("/admin/bar/keg-check/submit", jsonBody(args));
}

export interface EmptyKegVoiceItem {
  brandId: string | null;
  label: string;
  amount: EmptyAmount;
  qty: number | null;
}
/** Run-on empties dictation → brand-matched {label, amount} items. */
export async function extractEmptyKegVoice(transcript: string): Promise<EmptyKegVoiceItem[]> {
  try {
    const { items } = await gatedJson<{ items: EmptyKegVoiceItem[] }>(
      "/admin/bar/empty-keg-voice-extract",
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
  /** What actually arrived, when someone said it differed from the bill. null =
   *  nobody has said otherwise, so billed IS received. Never pre-filled — a
   *  confirmed delivery and an unexamined one must not look the same. */
  receivedQty: string | null;
  /** Handwriting or marks on this printed row, DESCRIBED not interpreted.
   *  Null for a clean row. Never a number — it exists to send someone to the
   *  shelf, because a short marked by the driver is the one discrepancy where
   *  the invoice and the vendor order email agree and are both wrong. */
  annotation: string | null;
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
/** Record what a delivery ACTUALLY contained, when it came up short (or over).
 *  Pass null to clear it back to "as billed".
 *
 *  This is what keeps a short shipment from reading as theft: purchases feed the
 *  variance grade as used = start + purchased − end, so stock billed but never
 *  delivered shows up later as consumption with no sales behind it. The server
 *  returns the credit the short is worth, so the UI never computes money. */
export async function setInvoiceLineReceived(
  invoiceId: string,
  lineId: string,
  receivedQty: number | null,
): Promise<{ receivedQty: number | null; billedQty: number | null; shortBy: number | null; creditDue: number | null }> {
  return gatedJson(`/admin/bar/invoices/${invoiceId}/lines/${lineId}/received`, jsonBody({ receivedQty }));
}
/** Re-run extraction on a flagged/extracted invoice (re-reads the stored images
 *  with current logic). Returns 'images_purged' when the 30-day images are gone. */
export async function reextractInvoice(
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await gatedJson(`/admin/bar/invoices/${invoiceId}/reextract`, { method: "POST" });
    return { ok: true };
  } catch (err) {
    if (err instanceof BarApiError && err.status === 409) return { ok: false, error: "images_purged" };
    throw err; // NotAuthed / Forbidden / other bubble to the caller
  }
}
/**
 * Settle a flag that has nothing left to act on — the only way out of
 * `flagged` for an invoice whose lines are all matched (a count flag from
 * handwriting or an order divergence). Matters because a flagged invoice is
 * excluded from the variance purchase math AND the pre-submit check, so a
 * stuck flag quietly erases the delivery from inventory.
 */
export async function clearInvoiceFlag(
  invoiceId: string,
): Promise<
  { ok: true } | { ok: false; error: "lines_need_match" | "not_flagged" | "duplicate" | "unknown" }
> {
  try {
    await gatedJson(`/admin/bar/invoices/${invoiceId}/clear-flag`, { method: "POST" });
    return { ok: true };
  } catch (err) {
    if (err instanceof BarApiError && err.status === 409) {
      // gatedJson stashes the RAW TEXT body, not parsed JSON — parse it here.
      let reason: string | undefined;
      try {
        reason = (JSON.parse(String(err.body ?? "")) as { error?: string }).error;
      } catch {
        reason = undefined;
      }
      return {
        ok: false,
        error:
          reason === "lines_need_match" || reason === "not_flagged" || reason === "duplicate"
            ? reason
            : "unknown",
      };
    }
    throw err; // NotAuthed / Forbidden / other bubble to the caller
  }
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
  /** How the counter EXPRESSED it. The backend has always sent these; showing
   *  them is the only place a wrong case multiplier is visible after submit. */
  enteredCases: string | null;
  caseSizeAtEntry: number | null;
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

// ── variance report (per submitted full count) ──
export interface VarianceLine {
  skuId: string;
  name: string;
  sizeMl: number | null;
  startOz: number;
  purchasedOz: number;
  endOz: number;
  usedOz: number;
  soldOz: number;
  lossOz: number; // positive = loss/overpour
  costPerOz: number | null;
  missingCost: number | null;
  gradePct: number | null;
  flags: string[];
  cleanForRollup: boolean;
}
export interface VarianceReport {
  priorSessionId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  gradePct: string | null; // numeric → string over the wire
  missingCost: string | null;
  report: {
    baseline?: boolean;
    lines?: VarianceLine[];
    gradePct?: number | null;
    totals?: {
      usedOz: number;
      soldOz: number;
      lossOz: number;
      missingCost: number;
      underpourCredit: number;
      cleanLines: number;
      flaggedLines: number;
    };
    caveats?: string[];
  };
  /** Review gate (0136): 'draft' = correctable — fix count lines, then finalize
   *  (which RECOMPUTES from the corrected lines and freezes). Auto-finalizes
   *  3h after the draft landed. Baselines and pre-gate history are 'final'. */
  status: "draft" | "final";
  finalizedAt: string | null;
  createdAt: string;
}
/** null = no report yet (the worker sweep writes it within ~a tick of submit). */
export async function getCountVariance(id: string): Promise<VarianceReport | null> {
  try {
    return await gatedJson<VarianceReport>(`/admin/bar/counts/${id}/variance`);
  } catch (e) {
    if (e instanceof BarApiError && e.status === 404) return null;
    throw e;
  }
}
/** Freeze a DRAFT variance report. The server RECOMPUTES from the count lines
 *  as they stand now, then locks — so fix any wrong lines FIRST; after this
 *  there is no second chance (409 = already final). */
export async function finalizeCountReport(
  id: string,
): Promise<{ ok: boolean; gradePct: number | null; missingCost: number }> {
  return gatedJson(`/admin/bar/counts/${id}/report/finalize`, { method: "POST" });
}

// ── recipe gaps (the fix-it queue behind the daily alerts) ──
export interface UnmappedPour {
  alertKey: string;
  label: string;
  bottleText: string; // label minus the pour size — what gets written as the alias
  oz: number | null;
  count: number;
  products: string[];
  detectedAt: string;
}
export interface MissingRecipe {
  productId: string;
  name: string;
  category: string | null;
  detectedAt: string;
}
/**
 * A choose-your-spirit OPTION (Bar Mods → "Vegas Bomb") that sold but isn't
 * classified yet — either build it a recipe or mark it a no-liquor mixer.
 * productId lives only in the alert key (recovered server-side); optionLabel is
 * the raw label to write back.
 */
export interface NeedsClassifyOption {
  alertKey: string;
  productId: string;
  productName: string;
  optionLabel: string;
  count: number;
  netCents: number;
  detectedAt: string;
  /**
   * The server's read that this option is a SPIRIT SWAP on a drink that
   * already has a recipe — a $0 option naming a bottle we stock, matched to
   * the one same-category component it stood in for. Advisory: it pre-fills
   * the confirm, it never writes on its own. Null when the label names no
   * bottle (a real mixer), carries an upcharge, or the parent pours two of
   * that category and the label can't say which.
   */
  likelySubstitution: {
    skuId: string;
    skuName: string;
    replacesSkuId: string;
    replacesSkuName: string;
    oz: number;
  } | null;
}
export async function getRecipeGaps(): Promise<{
  pours: UnmappedPour[];
  missingRecipes: MissingRecipe[];
  needsClassify: NeedsClassifyOption[];
}> {
  return gatedJson("/admin/bar/recipe-gaps");
}
export async function addSkuAlias(skuId: string, alias: string): Promise<string[]> {
  const { aliases } = await gatedJson<{ aliases: string[] }>(
    `/admin/bar/skus/${skuId}/aliases`,
    { method: "POST", ...jsonBody({ alias }) },
  );
  return aliases;
}

// ── recipe builder (write path to bar_recipe — options + whole-product) ──
export interface RecipeComponentInput {
  skuId: string;
  oz: number;
}
/** Build/replace a recipe. optionLabel '' = a whole-product recipe (a cocktail). */
export async function saveRecipe(
  productId: string,
  optionLabel: string,
  productName: string | null,
  components: RecipeComponentInput[],
): Promise<void> {
  await gatedJson("/admin/bar/option-recipes", {
    method: "POST",
    ...jsonBody({ productId, optionLabel, productName, components }),
  });
}
/** Mark an option as a no-liquor mixer (Red Bull) — attribute nothing. */
export async function markOptionMixer(
  productId: string,
  optionLabel: string,
  productName: string | null,
): Promise<void> {
  await gatedJson("/admin/bar/option-recipes/mixer", {
    method: "POST",
    ...jsonBody({ productId, optionLabel, productName }),
  });
}
/**
 * Classify an option as a spirit SUBSTITUTION: it poured `components` instead
 * of the parent recipe's `substitutesSkuId`, not on top of it. Neither of the
 * other two verbs fits — a recipe would double-count the drink and a mixer
 * would leave the parent's bottle wearing a pour that never happened.
 */
export async function markOptionSubstitution(
  productId: string,
  optionLabel: string,
  productName: string | null,
  substitutesSkuId: string,
  components: RecipeComponentInput[],
): Promise<void> {
  await gatedJson("/admin/bar/option-recipes/substitution", {
    method: "POST",
    ...jsonBody({ productId, optionLabel, productName, substitutesSkuId, components }),
  });
}
/** Undo a classification — delete the row so the item returns to the queue. */
export async function unclassifyOption(productId: string, optionLabel: string): Promise<void> {
  await gatedJson("/admin/bar/option-recipes/unclassify", {
    method: "POST",
    ...jsonBody({ productId, optionLabel }),
  });
}
export interface RecipeTemplateComponent {
  skuId: string;
  skuName: string;
  sizeMl: number | null;
  oz: number;
}
export interface RecipeTemplate {
  recipeId: string;
  productName: string | null;
  components: RecipeTemplateComponent[];
}
/** Same-named standalone recipe(s) to prefill from (e.g. an existing Strawberry Limeade). */
export async function getRecipeTemplates(label: string): Promise<RecipeTemplate[]> {
  const { matches } = await gatedJson<{ matches: RecipeTemplate[] }>(
    `/admin/bar/recipe-templates?label=${encodeURIComponent(label)}`,
  );
  return matches;
}

/** A pour label the daily check mapped on its own (migration 0106). */
export interface AutoAlias {
  id: string;
  alias: string;
  sourceLabel: string;
  createdAt: string;
  skuId: string;
  skuName: string;
}
export async function getAutoAliases(): Promise<AutoAlias[]> {
  const { autoAliases } = await gatedJson<{ autoAliases: AutoAlias[] }>("/admin/bar/auto-aliases");
  return autoAliases;
}
/** Undo an auto-map. Tombstoned server-side so the next check won't redo it. */
export async function revertAutoAlias(id: string): Promise<void> {
  await gatedJson<{ reverted: boolean }>(`/admin/bar/auto-aliases/${id}/revert`, {
    method: "POST",
  });
}

// ── pour cost (recipe COGS ÷ menu price, live) ──
export interface PourCostComponent {
  skuName: string;
  oz: number;
  costUsd: number | null; // null = SKU missing size or cost (row incomplete)
}
export interface PourCostRow {
  productId: string;
  name: string;
  priceUsd: number | null;
  costUsd: number;
  pourCostPct: number | null;
  overCeiling: boolean;
  incomplete: boolean;
  components: PourCostComponent[];
}
export async function getPourCosts(): Promise<{ ceiling: number; rows: PourCostRow[] }> {
  return gatedJson<{ ceiling: number; rows: PourCostRow[] }>("/admin/bar/pour-costs");
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
 * Upload a batch of files as invoices, grouped by what they physically are:
 * PHOTOS are pages of ONE paper invoice (you photograph page 1, page 2, …);
 * each PDF is a COMPLETE invoice of its own (emailed invoices arrive one per
 * PDF — nobody splits one invoice across PDF files). So a mixed selection of
 * 3 photos + 2 PDFs becomes 3 invoices: [photos], [pdf1], [pdf2]. Returns the
 * created invoice ids.
 */
export async function uploadInvoices(files: File[]): Promise<string[]> {
  const photos = files.filter((f) => !isPdfFile(f));
  const pdfs = files.filter(isPdfFile);
  const groups: File[][] = [];
  if (photos.length > 0) groups.push(photos);
  for (const pdf of pdfs) groups.push([pdf]);
  const ids: string[] = [];
  for (const g of groups) ids.push(await uploadInvoice(g));
  return ids;
}

/**
 * Upload ONE invoice's pages → a pending bar_invoice. Photos are compressed to
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
