import { compressToJpeg, blobToBase64, PROXY_SAFE_RAW_BYTES } from "./document-photo";
import { foodQuantityKey, type FoodQuantity, type FoodUnitRatio } from "./food-quantity";

/**
 * Which catalog a call is about (migration 0166). Defined HERE because it is a
 * property of the API contract, not of any one screen.
 *
 * Every section-aware endpoint defaults to "bar" server-side when the param is
 * absent, so an older cached bundle and every alert email already sitting in
 * someone's inbox keep working untouched.
 */
export type Section = "bar" | "food";
export const SECTIONS: readonly Section[] = ["bar", "food"];

export interface InvoiceAnswerCorrection {
  unitsPerCase: number; countUnit: string; currentCost: number | null; previousCost: number | null;
  costCorrected: boolean; costInvoiceId: string | null; currentCostSource: string | null;
  countingDefinitionChanged: boolean; countCaseSize: number | null;
  /** stale_estimate: its food cost estimate used a price this answer wrote (TPRS #338). */
  affectedCounts: { id: string; status: string; started_at: string; old_cases?: string; has_unpriced_lines?: boolean; stale_estimate?: boolean }[];
}
export interface AutomaticInvoiceAnswer {
  id: string; name: string; skuId: string; lineId: string | null; token: string;
  status: "active" | "corrected" | "superseded"; unitsPerCase: number; countUnit: string; unitLabel: string;
  costPerUnit: number; sourcePack: number; sourceSize: string; defaultSpokenUnit: string | null;
  canCorrect: boolean; definitionEditable: boolean; correction: InvoiceAnswerCorrection | null;
}
export const getAutomaticInvoiceAnswers = (id: string) =>
  gatedJson<{ answers: AutomaticInvoiceAnswer[] }>(`/admin/bar/invoices/${id}/automatic-answers`);
export const correctAutomaticInvoiceAnswer = (id: string, actionId: string, body: {
  token: string; lineId: string; unitsPerCase: number; defaultSpokenUnit?: "case" | "base";
}) => gatedJson<{ resolved: true; result: InvoiceAnswerCorrection }>(`/admin/bar/invoices/${id}/automatic-answers/${actionId}/correct`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

// Typed client for the bar-inventory `/admin/bar/*` JSON API, consumed by the
// staff /cogs SPA. Same-origin model identical to src/tprs/client.ts: the SPA
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
export async function gatedJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await rawFetch(path, init);
  if (res.status === 401) throw new NotAuthedError();
  if (res.status === 403) throw new ForbiddenError();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BarApiError(`${init.method ?? "GET"} ${path} failed (${res.status})`, res.status, body);
  }
  return (await res.json()) as T;
}

/** Voice reads and read-only submission recovery get a deadline. Never
 * automatically retry a timed-out write. Race the whole JSON read as well as
 * aborting fetch, so a stalled response body cannot leave the screen waiting. */
async function deadlineJson<T>(path: string, init: RequestInit, timeoutMs: number, message: string, errorCode = "voice_timeout"): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new BarApiError(message, 408, JSON.stringify({ error: errorCode, message })));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([gatedJson<T>(path, { ...init, signal: controller.signal }), deadline]);
  } finally {
    clearTimeout(timer);
  }
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
  section?: Section;
  cogsBucket?: CogsBucket | null;
  id: string;
  name: string;
  category: string | null;
  /** Stored spoken names, also available to manual bottle search. */
  aliases?: string[];
  sizeMl: number | null;
  trackingMode: "variance" | "stock_count";
  wacCost: string | null;
  /** Containers per purchase case. null = unknown — the UI must ASK, never
   *  assume (a wrong multiplier silently scales the whole count). */
  unitsPerCase: number | null;
  /** What a human counts this as on a shelf — 'bottle' | 'each' | 'case' |
   *  'lb' | 'gal' | 'pack' | 'box' | 'sack' | 'bib'. The FOOD grid labels every
   *  cell with it; the liquor grid ignores it because everything there is a
   *  bottle. Optional so older cached bundles keep parsing. */
  countUnit?: string;
  /** Confirmed spoken package conversions; ignored when the physical unit changes. */
  countDefinition?: import("./count-definition").CountDefinition | null;
  /** Approved exact food conversions, bound to the current count definition. */
  foodUnitRatios?: Record<string, FoodUnitRatio>;
  /** Confirmed observations, used only to ask about an unusually large count. */
  countHistory?: { maxCount: number | null; maxDelivery: number | null; deliverySamples: number; days: number } | null;
  /** Discontinued (tprs 0196): no longer ordered, leftovers still counted.
   *  Listed last on its shelf under "Discontinued, count leftovers", never
   *  flagged missing; "None left" archives it. Optional so older cached
   *  bundles keep parsing. */
  discontinuedAt?: string | null;
  /** What a plain mention means now that this is discontinued. */
  replacedBySkuId?: string | null;
}
export interface BarZoneItem {
  id: string;
  name: string;
  walkOrder: number;
  /** SKUs Opsi lists on this shelf (0169). A HINT, never a constraint: the grid
   *  pre-populates these and search-to-add still reaches anything, so a line
   *  counted in a non-member zone counts exactly as it always did. Empty for
   *  every liquor zone by construction — 0169 seeded no bottle memberships. */
  memberSkuIds?: string[];
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
  /** Entered physical loose amounts and frozen conversions, food protocol 6. */
  foodQuantity?: FoodQuantity | null;
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
//
// Both take the active section (migration 0166). The server defaults to 'bar'
// when the param is absent, so an older cached bundle keeps working unchanged
// — the two catalogs are separate namespaces, and asking for the wrong one
// would show a liquor counter 108 food items they never walk.
export async function getCatalog(section: Section = "bar"): Promise<BarSkuItem[]> {
  const { items } = await gatedJson<{ items: BarSkuItem[] }>(
    `/admin/bar/catalog?section=${section}`,
  );
  return items;
}
/** The invoice screen's reads end in a message, never an endless spinner: on
 * 2026-10-06 the list request sat at the proxy for its full 300 s, twice. */
export const INVOICE_READ_TIMEOUT_MS = 25_000;
const invoiceRead = <T,>(path: string, message: string) =>
  deadlineJson<T>(path, {}, INVOICE_READ_TIMEOUT_MS, message, "invoice_read_timeout");
/** Mixed invoices can contain items from either inventory. Never use this for counts. */
export async function getInvoiceCatalog(): Promise<BarSkuItem[]> {
  const items = (section: Section) =>
    invoiceRead<{ items: BarSkuItem[] }>(`/admin/bar/catalog?section=${section}`, "The item list took too long to load.").then(r => r.items);
  const [bar, food] = await Promise.all([items("bar"), items("food")]);
  return [...new Map([...bar, ...food].map(item => [item.id, item])).values()];
}
export async function getZones(section: Section = "bar", walk?: "liquor"): Promise<BarZoneItem[]> {
  const { zones } = await gatedJson<{ zones: BarZoneItem[] }>(
    `/admin/bar/zones?section=${section}${walk ? `&walk=${walk}` : ""}`,
  );
  return zones;
}

/** A zone already has that name (any case, active or not, either walk). */
export class ZoneNameTakenError extends Error {
  constructor(readonly zone: { id: string; name: string; active: boolean; section: Section }) {
    super(`"${zone.name}" is already a zone`);
    this.name = "ZoneNameTakenError";
  }
}
/**
 * "+ New spot" on the food walk (Jon, 2026-10-03): a zone placed AFTER the one
 * given (null = first). The server picks the walk order, so the new zone sorts
 * into `getZones` exactly where the counter said they reach it.
 */
export async function createZone(name: string, afterZoneId: string | null): Promise<BarZoneItem> {
  try {
    const { zone } = await gatedJson<{ zone: BarZoneItem }>(
      "/admin/bar/zones",
      jsonBody({ name, section: "food", afterZoneId }),
    );
    return zone;
  } catch (err) {
    if (err instanceof BarApiError && err.status === 409) {
      const body = (() => { try { return JSON.parse(String(err.body)); } catch { return null; } })();
      if (body?.zone) throw new ZoneNameTakenError(body.zone);
    }
    throw err;
  }
}

// ── liquor counts ──
/** Start a count. `section` decides WHICH WALK it is — the kitchen and the bar
 *  are separate sessions with separate catalogs, zones and brackets (0166).
 *  Defaults to "bar" so every existing caller is unchanged. */
export async function createCount(isFullCount: boolean, section: Section = "bar"): Promise<string> {
  const { sessionId } = await gatedJson<{ sessionId: string }>(
    "/admin/bar/counts",
    jsonBody({ isFullCount, section }),
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
  foodQuantity?: FoodQuantity | null;
  qtyNumerator?: string;
  qtyDenominator?: string;
  source: "grid" | "voice";
  rawUtterance: string | null;
}
export interface OpenCountBatch {
  zoneId: string;
  batchId: string;
  fullEquivalents: string; // numeric → JSON string
}
export interface OpenCount {
  id: string;
  isFullCount: boolean;
  section: Section;
  startedAt: string;
  lines: OpenCountLine[];
  /** The fingerprint of `lines`; the screen's next save says it was built on
   *  it. Absent from a server that predates it. */
  linesHash?: string;
  /** Batch rows resume alongside the lines — a draft that came back without
   *  them would look like nobody walked the prep shelf, and the next save
   *  (authoritative, not a patch) would erase them for real. */
  batches?: OpenCountBatch[];
  /** The fingerprint of `batches`, for the next batch save (TPRS 2026-10-03). */
  batchesHash?: string;
}
/** A named prep batch and what ONE FULL container holds. */
export interface BarBatchItem {
  id: string;
  name: string;
  notes: string | null;
  components: { skuId: string; skuName: string; oz: number }[];
}
export async function getBatches(): Promise<BarBatchItem[]> {
  const { batches } = await gatedJson<{ batches: BarBatchItem[] }>("/admin/bar/batches");
  return batches;
}
/** Replace the draft's batch rows with exactly these.
 *
 *  A ZERO is a real answer and must be sent — "we looked, there are none" is
 *  what makes a bracket symmetric, and the server refuses to expand a bracket
 *  where either end has no rows at all. An EMPTY ARRAY therefore means
 *  something different from a list of zeros: it means nobody walked the prep
 *  shelf. Only the counter can say which he means, so the screen sends a row
 *  for every batch he has touched and nothing for the ones he has not. */
export async function saveBatchCounts(
  sessionId: string,
  batches: { zoneId: string; batchId: string; fullEquivalents: number }[],
  /** The fingerprint of the batch rows this save was built on (TPRS
   *  countBatchesHash). Without it the save replaces them unconditionally. */
  baseHash: string | null = null,
): Promise<{ batchesHash?: string }> {
  try {
    return await gatedJson<{ batchesHash?: string }>(`/admin/bar/counts/${sessionId}/batches`,
      { ...jsonBody({ batches, ...(baseHash ? { baseHash } : {}) }), method: "PUT" });
  } catch (e) {
    if (e instanceof BarApiError && e.status === 409) {
      const body = (() => { try { return JSON.parse(String(e.body)); } catch { return null; } })();
      if (body?.error === "batches_changed" && Array.isArray(body.batches)) throw new BatchesChangedError(body.batches, body.batchesHash);
    }
    throw e;
  }
}
/** The batch rows changed elsewhere since this screen's last save (TPRS PUT /batches). */
export class BatchesChangedError extends Error {
  constructor(
    readonly batches: OpenCountBatch[],
    readonly batchesHash: string,
  ) {
    super("The batch counts changed somewhere else since this screen loaded them.");
  }
}
/** The staffer's most recent in-progress draft (to resume across logout/reload), or null. */
export async function getOpenCount(full = true, section: Section = "bar", options: { includeOlder?: boolean } = {}): Promise<OpenCount | null> {
  // `full` picks WHICH kind of draft to resume. The liquor count owns full
  // drafts, the bottled-beer section owns partial ones; without the split one
  // screen resumes the other screen's draft and a full count lands in a session
  // the variance worker never reads.
  //
  // `section` is the same idea one level up, and it matters more: /lines is
  // AUTHORITATIVE, so a screen that resumed the other walk's draft would not
  // merely display it — the next save would replace its rows with lines
  // pointing at the wrong catalog.
  const { session } = await gatedJson<{ session: OpenCount | null }>(
    `/admin/bar/counts/open?full=${full ? "true" : "false"}&section=${section}${options.includeOlder ? "&includeOlder=true" : ""}`,
  );
  if (session && (session.isFullCount !== full || session.section !== section)) {
    throw new BarApiError("This draft belongs to a different count. Reopen the count to continue.", 409);
  }
  return session;
}
/** Replace the draft's lines with exactly these. An EMPTY array is meaningful —
 *  it means the counter removed everything — so it is sent, not skipped. */
export async function saveCountLines(
  sessionId: string,
  lines: CountLineInput[],
  isFullCount = true,
  section: Section = "bar",
  /** The fingerprint of the draft these lines were built on (draftSync.ts).
   *  Without it the save replaces the draft unconditionally, as before. */
  baseHash: string | null = null,
): Promise<{ linesHash?: string }> {
  try {
    return await gatedJson<{ linesHash?: string }>(`/admin/bar/counts/${sessionId}/lines`, {
      ...jsonBody({ lines, isFullCount, section, ...(section === "food" ? { foodUnitsVersion: 6 } : {}), ...(baseHash ? { baseHash } : {}) }), method: "PUT",
    });
  } catch (e) {
    if (e instanceof BarApiError && e.status === 409) {
      const body = (() => { try { return JSON.parse(String(e.body)); } catch { return null; } })();
      if (body?.error === "draft_changed" && Array.isArray(body.lines)) throw new DraftChangedError(body.lines, body.linesHash);
    }
    throw e;
  }
}
/** Resolve an ambiguous food write by reading its exact draft. This performs
 * no retry or mutation: a different count, field or unavailable read is held. */
export async function confirmCountDraftSave(
  sessionId: string, lines: CountLineInput[], section: Section = "food", isFullCount = true,
): Promise<{ linesHash: string } | null> {
  try {
    const { session } = await deadlineJson<{ session: OpenCount | null }>(
      `/admin/bar/counts/open?full=${isFullCount ? "true" : "false"}&section=${section}`,
      {}, 15_000, "Couldn't confirm the saved count. Retry when the connection returns.", "count_save_unknown",
    );
    if (!session || session.id !== sessionId || session.section !== section || session.isFullCount !== isFullCount ||
      !/^[a-f0-9]{16,64}$/i.test(session.linesHash ?? "") || !Array.isArray(session.lines) || session.lines.length !== lines.length) return null;
    const canonical = (line: CountLineInput | OpenCountLine) => {
      const values = [line.qtyUnits, line.enteredCases, line.caseSizeAtEntry, line.enteredPacks, line.packSizeAtEntry]
        .map((value) => value == null ? null : Number(value));
      if (values.some((value) => value != null && !Number.isFinite(value))) return null;
      return JSON.stringify([...values, foodQuantityKey(line.foodQuantity), line.source, line.rawUtterance ?? null]);
    };
    const saved = new Map(session.lines.map((line) => [`${line.zoneId}:${line.skuId}`, canonical(line)]));
    const wanted = new Set(lines.map((line) => `${line.zoneId}:${line.skuId}`));
    if (saved.size !== lines.length || wanted.size !== lines.length || !lines.every((line) => {
      const value = canonical(line);
      return value != null && saved.get(`${line.zoneId}:${line.skuId}`) === value;
    })) return null;
    return { linesHash: session.linesHash! };
  } catch { return null; }
}
/** The draft changed elsewhere since this screen's last save (TPRS PUT /lines). */
export class DraftChangedError extends Error {
  constructor(
    readonly lines: OpenCountLine[],
    readonly linesHash: string,
  ) {
    super("This count changed somewhere else since this screen loaded it.");
    this.name = "DraftChangedError";
  }
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
   *  demonstrably stocked and was missed on EVERY session this period.
   *  batch_not_counted = nobody walked the prep shelf. Unlike every other
   *  finding this cannot be inferred after the fact: the server refuses to
   *  expand a bracket unless BOTH ends carry batch rows, so the period goes
   *  silently un-correctable rather than wrong-and-visible. Fires on ABSENCE
   *  of rows, never on a zero — a zero IS the answer. */
  kind:
    | "impossible"
    | "not_counted"
    | "overuse"
    | "zone_missed"
    | "first_count"
    | "sibling_swap"
    | "big_loss"
    | "beer_not_counted"
    | "batch_not_counted"
    /** Counted on a shelf that is not one of its usual spots — or, when
     *  `homeless`, on a SKU that has no usual spots recorded at all.
     *  THE ONE FINDING THAT DOES NOT WAIT FOR HISTORY: a location question
     *  needs no prior count, and the FIRST walk is exactly when the seeded
     *  checklist gets corrected. Membership is a hint, never a restriction,
     *  so the count itself is already valid either way — this only asks
     *  whether next month's checklist should list the shelf. */
    | "zone_unexpected"
    /** Deliveries landed this period and the SKU has no count line at all,
     *  ever. The invoice gives it standing (a never-counted SKU with no
     *  invoice stays silent). How a newly tracked consumable gets its first
     *  count instead of staying dark (2026-09-04, Boylan). */
    | "purchased_not_counted"
    /** Listed on a shelf this walk VISITED, and given no answer at all — not a
     *  number, not a zero. THE ONLY COMPLETENESS CHECK A BASELINE CAN RUN:
     *  not_counted needs a prior count, purchased_not_counted needs an invoice,
     *  zone_missed needs a bracket, and the untouched-shelf warning needs an
     *  EMPTY shelf. Answer it on ANY shelf and it goes quiet, because a product
     *  legitimately sits in two places. Keyed on membership rather than section,
     *  so it also catches bar stock kept on a kitchen shelf. */
    | "zone_members_uncounted"
    /** One size of a product up by more than its own deliveries allow while
     *  another size went down (TPRS 2026-10-03): a bottle counted under the
     *  wrong size, or a delivery logged under the wrong one. The 10-02 count's
     *  open rail liter, saved as 1.2 of a 750. `skuId` is `family:<key>`. */
    | "size_mixup";
  skuId: string;
  /** The SKU identities involved in a paired variety or bottle-size finding. */
  relatedSkuIds?: string[];
  /** Aggregate basis for a finding spanning different food package sizes. */
  quantityUnit?: string;
  name: string;
  /** zone_unexpected only — which shelf, so the answer can be written. */
  zoneId?: string;
  zoneName?: string;
  /** zone_unexpected only — no usual spots anywhere, so the ask changes
   *  from "does it live here too?" to "where does this live?" */
  homeless?: boolean;
  counted: number | null;
  prior: number;
  purchased: number;
  used: number | null;
  unitsPerCase: number | null;
  dollars: number;
  detail: string;
}
/** One product that looks like we have stopped carrying it. */
export interface RetiringSku {
  skuId: string;
  name: string;
  daysSinceStock: number;
  daysSincePurchase: number | null;
  lastCountedQty: number | null;
  /** What retiring it takes off the books. Informational — NOT the rank. */
  dollars: number;
}
export interface BottleSizeWarning {
  skuId: string;
  name: string;
  sizeMl: number;
  receivedQty: number;
  receivedAt: string;
  counted: number | null;
  otherSizes: { sizeMl: number; counted: number }[];
}
export interface PrecheckResult {
  /** No prior submitted count; delivery and location checks can still run. */
  baseline: boolean;
  findings: PrecheckFinding[];
  truncated?: number;
  /** The findings past the cap, same order, behind "Show N more". Absent
   *  from a server that predates it; the screen then keeps "+N more". */
  more?: PrecheckFinding[];
  /** Recent delivery size missing/zero while another size was counted.
   *  Independent of the dollar-ranked cap; optional for deployment ordering. */
  sizeWarnings?: BottleSizeWarning[];
  /**
   * Products nobody has seen stock of, or bought, in months.
   *
   * ⚠ SEPARATE FROM `findings` ON PURPOSE. Findings are ranked by dollars
   * and capped at six, which is right for a missed shelf and backwards
   * here: a retired bottle's warning is worth `prior x cost`, so it shouts
   * while stock remains and falls to $0 the moment the bottle is actually
   * gone — where the cap buries it. This list is ranked by how long the
   * thing has been gone instead.
   */
  retiring?: RetiringSku[];
  /** "Things we think you have" (food only, 2026-10-03): items on no zone,
   *  so no walk asks about them, bought in 90 days or in a recipe. Optional
   *  for deployment ordering, like everything added here. */
  unplaced?: UnplacedItem[];
  /** The rest past the cap of 25, same order, behind "Show N more". */
  unplacedMore?: UnplacedItem[];
  /** What this check looked at (TPRS 2026-10-03). Hand both back to submit,
   *  which refuses a count that moved since, so it gets checked again. */
  linesHash?: string;
  batchesHash?: string;
}
export interface UnplacedItem {
  skuId: string;
  name: string;
  countUnit: string;
  unitLabel: string | null;
  unitsPerCase: number | null;
  /** The newest delivery in the last 90 days, ISO. */
  lastBoughtAt: string | null;
  lastVendor: string | null;
  inRecipe: boolean;
  reason: "bought" | "recipe" | "both";
}
/** Sanity-check an OPEN draft before submit. Read-only on the server; it must
 *  never write bar_variance_report (see the route's docstring — the report is a
 *  one-way door and a stray row there would kill the real one). */
export async function precheckCount(sessionId: string): Promise<PrecheckResult> {
  return gatedJson<PrecheckResult>(`/admin/bar/counts/${sessionId}/precheck`);
}
/**
 * Close a count.
 *
 * `isFullCount` declares what this walk WAS, at the end, when the counter
 * knows. Omit it and the session keeps whatever it was created as — which is
 * what the liquor screen does, so its behaviour is unchanged.
 *
 * ⚠ A full count becomes the BRACKET BASELINE. A trial walk of a few zones
 * submitted as a full count becomes the opening balance for the first real
 * bracket, and every zone nobody walked reads as stock that vanished.
 */
export async function submitCount(
  sessionId: string,
  isFullCount?: boolean,
  /** The check the counter just read (PrecheckResult linesHash/batchesHash). */
  checked?: { linesHash?: string; batchesHash?: string } | null,
): Promise<number> {
  // ALWAYS an object body, same as createKegCount: a bodyless POST arrives at
  // the backend as JSON null via the proxy, and the submit route's body schema
  // rejects null (400). 2026-10-02: the liquor screen omits isFullCount, so
  // every liquor submit 400'd and showed "Save failed" — the first on-screen
  // liquor submit since that schema landed (the 9/18 count closed by script).
  try {
    const { lineCount } = await deadlineJson<{ lineCount: number }>(
      `/admin/bar/counts/${sessionId}/submit`,
      jsonBody({
        ...(isFullCount === undefined ? {} : { isFullCount }),
        ...(checked?.linesHash ? { checkedLinesHash: checked.linesHash } : {}),
        ...(checked?.batchesHash ? { checkedBatchesHash: checked.batchesHash } : {}),
      }),
      60_000, "Couldn't confirm Submit before the connection timed out.", "submission_timeout",
    );
    if (!Number.isInteger(lineCount) || lineCount < 0) throw new SubmissionUnknownError();
    return lineCount;
  } catch (e) {
    if (e instanceof BarApiError && e.status === 409) {
      const body = (() => { try { return JSON.parse(String(e.body)); } catch { return null; } })();
      if (body?.error === "changed_since_check") throw new ChangedSinceCheckError();
    }
    // A lost response is not proof that Submit failed. Read its status before
    // offering another write; the request may already have closed the count.
    if (!(e instanceof NotAuthedError) && !(e instanceof ForbiddenError) &&
      (!(e instanceof BarApiError) || e.status === 0 || e.status === 408 || e.status === 409 || e.status >= 500)) {
      try {
        const status = await getCountSubmissionStatus(sessionId);
        if (status.submitted) return status.lineCount;
      } catch {
        throw new SubmissionUnknownError();
      }
    }
    throw e;
  }
}
/** Submit may have reached the server, but its status could not be read. */
export class SubmissionUnknownError extends Error {
  constructor() {
    super("The count was saved, but submission could not be confirmed.");
  }
}
/** Read only; a broken or stalled status response must not invite another Submit. */
export async function getCountSubmissionStatus(sessionId: string): Promise<{ submitted: boolean; lineCount: number }> {
  const detail = await deadlineJson<CountDetail>(`/admin/bar/counts/${sessionId}`, {}, 15_000,
    "Couldn't check submission yet.", "submission_status_timeout");
  if (detail.session?.status === "draft") return { submitted: false, lineCount: detail.lines.length };
  if ((detail.session?.status === "submitted" || detail.session?.status === "reconciled") && Array.isArray(detail.lines)) {
    return { submitted: true, lineCount: detail.lines.length };
  }
  throw new SubmissionUnknownError();
}
/** The count changed after the pre-submit check ran: check it again. */
export class ChangedSinceCheckError extends Error {
  constructor() {
    super("The count changed after the check ran.");
  }
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
  /** Exact source words for the proposed quantity, when supplied by the server. */
  quantityWords?: string;
  /** Source cannot safely establish the number; a human quantity answer is required. */
  quantityNeedsReview?: boolean;
  /** Food: source identity is unresolved, even if a legacy rule offers a match. */
  identityNeedsReview?: boolean;
  /** A specific source question still awaiting a human count. */
  quantityReviewReason?: "source_already_used" | "source_revised" | "unquantified_remainder" | "source_not_returned";
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
  /** Food extraction preserves actual package words; older bar replies omit these. */
  spokenUnit?: string | null;
  quantityKnown?: boolean;
  unitNeedsReview?: boolean;
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

/** Add or remove one of a product's USUAL storage locations.
 *
 * ⚠ TOUCHES THE CHECKLIST ONLY, NEVER A COUNT. Quantities already recorded
 * stay exactly where they were entered — per location, summed per product.
 * Adding a location does not unseat another: the same pizza dough lives in
 * the walk-in AND the stand-up freezer, and both get counted. */
/**
 * Archive (or restore) a product.
 *
 * ⚠ ARCHIVING IS NOT DELETING AND IT TOUCHES NO COUNT. Every quantity ever
 * recorded stays exactly as recorded, in every past count and every past
 * bracket — retiring an item must never change a period already measured.
 * It only takes the item off the checklist so it stops being asked about.
 */
export async function setSkuActive(skuId: string, active: boolean): Promise<void> {
  await gatedJson<{ active: boolean; name: string }>(`/admin/bar/skus/${skuId}/active`, {
    ...jsonBody({ active }),
    method: "PATCH",
  });
}

/**
 * Discontinue a product (no longer ordered, leftovers still counted), or say
 * we carry it again (tprs 0196). Carrying it again also un-archives it.
 */
export async function setSkuDiscontinued(skuId: string, discontinued: true, replacedBySkuId: string | null = null): Promise<void> {
  await gatedJson<{ active: boolean; name: string; discontinuedAt: string | null; replacedBySkuId: string | null }>(
    `/admin/bar/skus/${skuId}/discontinued`,
    { ...jsonBody({ discontinued, replacedBySkuId }), method: "PATCH" },
  );
}

/** The state an invoice's "we carry it again" card was drawn against. The answer
 *  also puts an archived item back on the walk, so the server refuses it (409
 *  state_changed) when the date, replacement or archive flag has moved since. */
export interface DiscontinuedCardState { discontinuedAt: string; replacedBySkuId: string | null; active: boolean }
export async function carrySkuAgain(skuId: string, expected: DiscontinuedCardState): Promise<void> {
  await gatedJson(`/admin/bar/skus/${skuId}/discontinued`, { ...jsonBody({ discontinued: false, expected }), method: "PATCH" });
}

export async function setSkuZone(
  skuId: string,
  zoneId: string,
  usual: boolean,
): Promise<void> {
  await gatedJson<{ zoneId: string; usual: boolean; zoneName: string }>(
    `/admin/bar/skus/${skuId}/zones`,
    { ...jsonBody({ zoneId, usual }), method: "PUT" },
  );
}

/** Transcribe one recorded audio clip (a whole take or one rotation
 *  segment) server-side. `vocabulary` picks the keyterm bias: liquor SKU names
 *  vs recent keg names. Returns plain text; "" when the clip was silence. */
export async function transcribeAudio(
  contentType: string,
  base64Data: string,
  vocabulary: "liquor" | "kegs",
  /**
   * Which walk, and which shelf the counter is standing on.
   *
   * The server spends a fixed Deepgram keyterm budget FRONT TO BACK, so
   * this is what lets the shelf in front of the counter claim it first.
   * Both optional: omitted means every active SKU alphabetically, which is
   * what shipped before and is measurably worse (48% coverage vs 94-100%).
   * takeId and piece only label the stored clip (TPRS 0200), for replays.
   */
  scope?: { section?: "bar" | "food"; zoneId?: string; takeId?: string; piece?: number },
): Promise<string> {
  const { transcript } = await deadlineJson<{ transcript: string }>(
    "/admin/bar/transcribe-audio",
    jsonBody({ contentType, data: base64Data, vocabulary, ...(scope ?? {}) }),
    45_000,
    "Transcription took too long. Record the missing items again or type them.",
  );
  return transcript;
}

/** Send a zone's dictation transcript → catalog-mapped {bottle, qty} items with
 *  ambiguous names flagged. Surfaces the server's friendly message on 502/503. */
/** Map a spoken run-on to catalog SKUs. `section` picks WHICH catalog —
 *  absent means "bar", so the liquor screen is unchanged. Unscoped, the food
 *  seed would silently enlarge the liquor matcher's candidate set, and a bar
 *  SKU could come back into a food count. */
export async function extractVoice(
  transcript: string,
  section: Section = "bar",
): Promise<VoiceExtractItem[]> {
  try {
    const { items } = await deadlineJson<{ items: VoiceExtractItem[] }>(
      "/admin/bar/voice-extract",
      jsonBody({ transcript, section, ...(section === "food" ? { foodUnitsVersion: 6 } : {}) }),
      section === "food" ? 60_000 : 120_000,
      "Reading the items took too long. Your transcript is still available to retry.",
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
  /** Unresolved unit questions on this invoice (BUILD-SPEC 11.7c). A hold does
   *  NOT change `status` — 'flagged' invoices are excluded from variance
   *  purchases server-side, so flagging one to surface a cost question would
   *  silently drop its purchases from the bracket. This count is the only way
   *  to find a held cost until the shared ops inbox exists. */
  heldCount?: number;
  /** Current review attention, including completed excluded-copy comparisons. */
  needsAttention?: boolean;
  unmatchedCount?: number;
  reviewCount?: number;
  source?: "email" | "scan";
  duplicateOf?: string | null;
  landedOf?: string | null;
}
export interface InvoiceLine {
  id: string;
  /** The vendor's own item number — SUPC on Sysco. The supplier identity half. */
  vendorCode?: string | null;
  /** From our matched SKU. Wins over the supplier where both speak. */
  ourBucket?: CogsBucket | null;
  /** From the supplier's own record for its own code. */
  supplierBucket?: CogsBucket | null;
  supplierDescription?: string | null;
  lineType: "product" | "deposit" | "fee" | "return" | "keg" | "unknown";
  rawDescription: string | null;
  sizeText: string | null;
  qtyUnits: string | null;
  unitCost: string | null;
  extendedAmount: string;
  /** Product amount after a confirmed delivery shortage; original amount stays above. */
  receivedAmount?: string;
  shortageAmount?: string;
  /** What actually arrived, when someone said it differed from the bill. null =
   *  nobody has said otherwise, so billed IS received. Never pre-filled — a
   *  confirmed delivery and an unexamined one must not look the same. */
  receivedQty: string | null;
  /** Handwriting or marks on this printed row, DESCRIBED not interpreted.
   *  Null for a clean row. Never a number — it exists to send someone to the
   *  shelf, because a short marked by the driver is the one discrepancy where
   *  the invoice and the vendor order email agree and are both wrong. */
  annotation: string | null;
  /** Server triage; null means the source annotation is informational. */
  reviewAnnotation?: string | null;
  needsReview: boolean;
  reviewReasons?: ("identity" | "amount" | "quantity")[];
  nonInventory?: boolean;
  printedLineTotal?: string | null;
  lineTax?: string | null;
  printedUnitPrice?: string | null;
  pack?: number | null;
  qtyCases?: string | null;
  canRememberUnit?: boolean;
  packageKey?: string | null;
  /** Fingerprint of the supplier rule on file when this card was drawn, or null
   *  when none was saved. Sent back with a package answer so an older card cannot
   *  overwrite a newer rule. Always present from the server (tprs answers-safe). */
  countRuleFingerprint: string | null;
  /** Whether the matched item is still on the walk (not archived). */
  matchedActive: boolean;
  matchedName: string | null;
  /** Why this line's COST is waiting on a human — "billed by LB, counted by
   *  each". Prose, written server-side by one module; the units below are the
   *  structured form, so nothing here parses this string. null = no hold. */
  costHoldReason: string | null;
  /** The SKU the hold was computed against. Sent back on resolve so a stale tab
   *  cannot authorise a cost against a SKU the line was since re-matched to. */
  matchedSkuId: string | null;
  matchedCountUnit: string | null;
  /** Matched an item discontinued before this invoice's date (tprs 0196). A
   *  question, never a hold: "we carry it again", or "that's <replacement>"
   *  (a rematch). Either answer makes it null. */
  discontinued?: { since: string; replacedBySkuId: string | null; replacementName: string | null } | null;
}
export interface InvoiceImageRef {
  id: string;
  pageNumber: number | null;
  contentType: string | null;
}
export type CogsBucket =
  | "food" | "na_beverage" | "bar_consumable" | "liquor"
  | "beer_draft" | "beer_bottled" | "wine" | "paper" | "supplies";

/**
 * One bucket's dollars, with the three classification sources kept APART.
 *
 * `matched` + `vendorItem` are CONFIRMED — our catalog said so, or the supplier
 * said so about its own item code. `estimated` is apportioned from that
 * vendor's historical mix. Never add them together and print one number as
 * actual COGS; that is the failure the split exists to prevent.
 */
/**
 * THREE sources, and they are not equally trustworthy. Keep them apart.
 *
 * - `matched`    — OUR catalog said so, either on this line or through the
 *                  learned (vendor, item code) link. Internally confirmed.
 * - `vendorItem` — the SUPPLIER classified its own code and nobody here has
 *                  ruled on it yet. Awaiting our classification, NOT ours.
 * - `estimated`  — apportioned from that vendor's historical mix.
 *
 * The middle one is the trap: it looks authoritative because a real supplier
 * said it, and it is still the wrong department whenever their chart differs
 * from ours. Sysco files a lime under Produce.
 */
export interface BucketAmount {
  matched: number;
  vendorItem: number;
  estimated: number;
}

/** A line still waiting on a human, and what kind of waiting it is. */
export interface BucketAttentionLine {
  lineId: string;
  description: string | null;
  amount: string;
  supplierBucket?: CogsBucket | null;
  supplierDescription?: string | null;
  ourBucket?: CogsBucket | null;
  ourSku?: string | null;
  /** True when it resolved through the learned (vendor, code) link rather than
   *  a match on this line — i.e. nobody had to do anything today. */
  viaLearnedLink?: boolean;
}

export interface InvoiceBuckets {
  byBucket: Partial<Record<CogsBucket, BucketAmount>>;
  unattributed: number;
  nonGoods: number;
  shortageDollars?: number;
  matchedDollars: number;
  residualDollars: number;
  residualBasis: "none" | "vendor_mix" | "unattributed";
  mixVendor: string | null;
  mixInvoices: number | null;
  warnings: string[];
  /** Which figure the split was measured against. `extracted_total` is one WE
   *  computed, not one printed on the invoice — the screen must not claim otherwise. */
  totalBasis: "product_subtotal" | "grand_total" | "extracted_total" | "none";
  needsAttention: {
    /** Neither source has an opinion — these ride the vendor mix as an estimate. */
    unresolved: BucketAttentionLine[];
    /** The SUPPLIER bucketed it and our catalog was never asked. Garnishes hide
     *  here: Sysco calls a lime Produce (food); we count it against liquor. */
    supplierOnly: BucketAttentionLine[];
    /** Both spoke and differ. Ours won — say so rather than hiding it. */
    disagreement: BucketAttentionLine[];
  };
}

export interface InvoiceCopyReview {
  originalId: string; copyId: string; invoiceNumber: string | null;
  expected: { id: string; source: "email"; printedTotal: string | null };
  delivered: { id: string; source: "scan"; printedTotal: string | null };
  rows: Array<{ code: string; description: string; originalLineIds: string[]; issues: string[]; information?: string[];
    expected: { quantity: number | null; cases: number | null; amount: string; packages: string[] } | null;
    delivered: { quantity: number | null; cases: number | null; amount: string; packages: string[] } | null;
    sourceDelivered?: { quantity: number | null; amount: string } | null;
  }>;
  reasons: string[]; differenceCount: number; feeDifference: number; reviewHash: string;
  reviewed: boolean; reviewedAt: string | null; ready: boolean; automaticallyReconciled?: boolean;
  automaticBasis?: "supplier_final" | "matching_copies" | "source_checked_packages" | "source_checked_scan" | null;
  sourceCheck?: {
    id: string; evidenceHash: string; kind?: "package_fields" | "scan_recovery";
    status: "queued" | "running" | "resolved" | "unresolved" | "rejected";
    attempts: number; reason: string | null;
    corrections: { vendorCode: string; originalReading: string; correctedReading: string }[];
    recoveredLineCount?: number; originalLineCount?: number;
  };
  questions?: string[];
  readingIncomplete?: boolean;
}
/** An answer card was drawn against a question that has since changed (another
 *  tab, another person, a re-read). The server said 409 with one of these codes;
 *  the control keeps what was typed and shows STALE_ANSWER_MESSAGE. */
const STALE_ANSWER_CODES = new Set(["line_changed", "sku_changed", "unit_changed", "rule_changed", "supplier_item_changed",
  "match_changed", "received_changed", "state_changed", "no_hold"]);
export const STALE_ANSWER_MESSAGE = "This question changed while you were answering. Reload to see the latest. Your number is kept.";
export function isStaleAnswer(err: unknown): boolean {
  if (!(err instanceof BarApiError) || err.status !== 409) return false;
  try { return STALE_ANSWER_CODES.has((JSON.parse(String(err.body ?? "")) as { error?: string }).error ?? ""); } catch { return false; }
}
export async function reviewInvoiceCopy(id: string, reviewHash: string): Promise<void> {
  await gatedJson(`/admin/bar/invoices/${id}/copy-review`, jsonBody({ reviewHash }));
}
/** Reopen only the source-reading explanation; this never changes a purchase. */
export async function rejectInvoicePackageSourceCheck(id: string, evidenceHash: string): Promise<void> {
  await gatedJson(`/admin/bar/invoices/${id}/source-check/reject`, jsonBody({ evidenceHash }));
}
export interface InvoiceDetail {
  copyReviews?: InvoiceCopyReview[];
  explanationToken?: string;
  depositResolution?: InvoiceDepositResolution | null;
  invoice: InvoiceSummary & {
    extractedTotal: string | null;
    printedProductTotal?: string | null;
    handwrittenNotes?: string[] | null;
    /** Same triage as the extraction alert; routine sign-offs remain in the source notes. */
    reviewNotes?: string[];
    duplicateOf?: string | null;
  };
  lines: InvoiceLine[];
  images: InvoiceImageRef[];
  buckets: InvoiceBuckets;
}

export interface InvoiceDepositResolution {
  id: string;
  source: "automatic" | "staff";
  explanation: string;
  original_total: string;
  credit: string;
  total: string;
  remaining_questions: boolean;
}
export async function explainInvoice(id: string, token: string, text: string): Promise<{ applied: boolean; result: InvoiceDepositResolution }> {
  return gatedJson(`/admin/bar/invoices/${id}/explanation`, jsonBody({ token, text }));
}

/** Dollars OUR catalog placed. The only figure that is our department by our
 *  own say-so — do not fold the supplier's into it. */
export const confirmedIn = (a: BucketAmount | undefined): number =>
  a ? Math.round(a.matched * 100) / 100 : 0;
/** Dollars the SUPPLIER placed, awaiting our classification. */
export const awaitingIn = (a: BucketAmount | undefined): number =>
  a ? Math.round(a.vendorItem * 100) / 100 : 0;
/** Every dollar placed, confirmed and estimated. Show `confirmedIn` beside it. */
export const totalIn = (a: BucketAmount | undefined): number =>
  a ? Math.round((a.matched + a.vendorItem + a.estimated) * 100) / 100 : 0;
export async function getInvoiceHistory(): Promise<InvoiceSummary[]> {
  const { invoices } = await invoiceRead<{ invoices: InvoiceSummary[] }>("/admin/bar/invoices/history",
    "The invoice list took too long to load.");
  return invoices;
}
export async function getInvoiceDetail(id: string): Promise<InvoiceDetail> {
  return invoiceRead<InvoiceDetail>(`/admin/bar/invoices/${id}`, "The invoice took too long to load.");
}
/** What a match card was drawn against: the item the line is matched to right
 *  now (null when unmatched) and whether it was marked as a supply expense. An
 *  expensed line has no match either, so the pair is what tells them apart. A
 *  re-match retires the supplier's saved case size, so the server refuses
 *  (409 match_changed) when someone else has changed the line since. */
export interface MatchCardState { matchedSkuId: string | null; nonInventory: boolean }
export function matchCardState(line: Pick<InvoiceLine, "matchedSkuId" | "nonInventory">): MatchCardState {
  return { matchedSkuId: line.matchedSkuId ?? null, nonInventory: line.nonInventory === true };
}
/** Confirm a needs-review invoice line → a SKU. Learns the vendor alias + refreshes
 *  the SKU cost server-side; returns whether the whole invoice is now confirmed. */
export async function matchInvoiceLine(
  invoiceId: string,
  lineId: string,
  skuId: string,
  shown: MatchCardState,
): Promise<{
  matchedName: string;
  aliasLearned: boolean;
  invoiceConfirmed: boolean;
  /** Set when the match landed but the COST did not: confirming IDENTITY is not
   *  answering the UNIT question (BUILD-SPEC 11.7c). */
  costHeld: string | null;
  matchedSkuId: string | null;
  matchedCountUnit: string | null;
}> {
  return gatedJson(`/admin/bar/invoices/${invoiceId}/lines/${lineId}/match`, jsonBody({ skuId, expectedMatchedSkuId: shown.matchedSkuId, expectedNonInventory: shown.nonInventory }));
}

/** The part of a line a price or package answer is checked against: the item,
 *  its count unit, the printed package and the supplier rule on file. A typed
 *  answer sends the basis it was STARTED against (Invoices.tsx useStartedFrom),
 *  not whatever a later re-read put on the line. */
export type AnswerBasis = Pick<InvoiceLine, "id" | "matchedSkuId" | "matchedCountUnit" | "packageKey" | "countRuleFingerprint">;
export function answerBasis(line: InvoiceLine): AnswerBasis {
  return { id: line.id, matchedSkuId: line.matchedSkuId, matchedCountUnit: line.matchedCountUnit,
    packageKey: line.packageKey, countRuleFingerprint: line.countRuleFingerprint };
}

/** Answer the unit question a held cost is asking: what does ONE count unit
 *  cost? (BUILD-SPEC 11.7c)
 *
 *  DOLLARS, not a conversion ratio, and that narrowing is deliberate — the
 *  invoice's own `unit_cost` is already rewritten by the nested-pack rule
 *  before it is stored, and a size token like Greco's "1/5#Bg" (a pack of FIVE
 *  pounds) cannot be reduced to a bare unit without inventing a factor. The
 *  dollar figure is the thing being authorised.
 *
 *  Resolves COST only — quantity is untouched. */
export async function applyHeldCost(
  invoiceId: string,
  line: AnswerBasis,
  costPerCountUnit: number,
): Promise<{ skuId: string; costPerCountUnit: number; costWritten: boolean; costNotWrittenBecause: string | null }> {
  // The price was typed against ONE count unit and the printed package shown on
  // the card; the server refuses (409) if either has changed since.
  return gatedJson(
    `/admin/bar/invoices/${invoiceId}/lines/${line.id}/apply-cost`,
    jsonBody({ expectedSkuId: line.matchedSkuId, expectedCountUnit: line.matchedCountUnit,
      expectedPackageKey: line.packageKey ?? null, costPerCountUnit }),
  );
}
export async function expenseInvoiceLine(invoiceId: string, lineId: string): Promise<{ resolved: boolean }> {
  return gatedJson(`/admin/bar/invoices/${invoiceId}/lines/${lineId}/expense`, jsonBody({}));
}
export async function rememberInvoiceUnit(invoiceId: string, line: AnswerBasis, unitsPerBilledUnit: number): Promise<{ resolved: boolean }> {
  return gatedJson(`/admin/bar/invoices/${invoiceId}/lines/${line.id}/remember-unit`, jsonBody({
    expectedSkuId: line.matchedSkuId, expectedCountUnit: line.matchedCountUnit,
    expectedPackageKey: line.packageKey, expectedRuleFingerprint: line.countRuleFingerprint, unitsPerBilledUnit,
  }));
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
  /** What the line showed when the person STARTED typing: null = nothing
   *  recorded. The server refuses (409 received_changed) if someone recorded a
   *  different figure since, including one that arrived in a re-read mid-edit. */
  expectedReceivedQty: number | null,
): Promise<{ receivedQty: number | null; billedQty: number | null; shortBy: number | null; creditDue: number | null }> {
  return gatedJson(`/admin/bar/invoices/${invoiceId}/lines/${lineId}/received`, jsonBody({ receivedQty, expectedReceivedQty }));
}
/** Retry a failed, empty invoice read. Existing saved invoice lines are protected. */
export async function reextractInvoice(
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await gatedJson(`/admin/bar/invoices/${invoiceId}/reextract`, { method: "POST" });
    return { ok: true };
  } catch (err) {
    if (err instanceof BarApiError && err.status === 409) {
      try {
        const body = JSON.parse(String(err.body));
        return { ok: false, error: typeof body.error === "string" ? body.error : "unknown" };
      } catch { return { ok: false, error: "unknown" }; }
    }
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
/** Why the server will not confirm a flagged invoice: it re-checks everything the
 *  review screen hides the button for, so a stale tab gets a reason, not a yes. */
export const CLEAR_FLAG_REFUSALS = [
  "lines_need_match", "not_flagged", "duplicate", "no_lines", "cost_questions_open", "delivery_marks_open", "deposit_explanation_open",
] as const;
export type ClearFlagRefusal = (typeof CLEAR_FLAG_REFUSALS)[number];
export async function clearInvoiceFlag(
  invoiceId: string,
): Promise<
  { ok: true } | { ok: false; error: ClearFlagRefusal | "unknown" }
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
          reason && (CLEAR_FLAG_REFUSALS as readonly string[]).includes(reason) ? (reason as ClearFlagRefusal) : "unknown",
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
  settings: { section: Section; countUnit: string; cogsBucket: CogsBucket } | undefined,
  /** What the card was drawn against (see matchInvoiceLine). */
  shown: MatchCardState,
): Promise<{
  skuId: string;
  matchedName: string;
  invoiceConfirmed: boolean;
  /** A brand-new size-less SKU is created counted by the EACH, so a line billed
   *  by the pound holds its cost here too — this route is how such a SKU comes
   *  into existence at all (BUILD-SPEC 11.7c). */
  costHeld: string | null;
  /** The count unit of the SKU this actually landed on — which is NOT always
   *  the one this route would have created, because find-or-create may have
   *  matched an existing row with a different unit. Never guess it client-side:
   *  it names the denominator of the dollar figure a human then authorises. */
  countUnit: string;
}> {
  return gatedJson(`/admin/bar/invoices/${invoiceId}/lines/${lineId}/new-sku`, jsonBody({ name, sizeMl, ...settings, expectedMatchedSkuId: shown.matchedSkuId, expectedNonInventory: shown.nonInventory }));
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
  /** "correction": changed after the report locked (TPRS 2026-10-03). */
  source: "grid" | "voice" | "correction" | "edit";
}
/** One correction made after the report locked, as the audit row has it. */
export interface CountCorrection {
  at: string;
  by: string | null;
  reason: string;
  changes: { zone_name: string; sku_name: string; before: number | null; after: number | null }[];
  /** Recorded after the fact for a correction made before this existed (10-02). */
  retrospective: boolean;
  correctedAt: string | null;
}
export interface CountDetail {
  session: {
    id: string;
    /** Actual walk identity; absent from a legacy backend. */
    section?: Section;
    status: "draft" | "submitted" | "reconciled";
    isFullCount: boolean;
    note: string | null;
    startedAt: string;
    submittedAt: string | null;
    countedBy: string | null;
  };
  lines: CountDetailLine[];
  /** Absent from a server older than 2026-10-03. */
  corrections?: CountCorrection[];
  /** The latest submitted full liquor count: the only one a correction may touch. */
  correctable?: boolean;
  /** correctable, and this person is an admin (bar.manage). */
  canCorrect?: boolean;
}
export interface CountCorrectionChange {
  zoneId: string;
  skuId: string;
  /** What the screen showed; null for a bottle with no line on that shelf. */
  before: number | null;
  /** The corrected quantity; null takes the line out. */
  after: number | null;
}
/** The count changed after this screen loaded it; reload and check again. */
export class CorrectionStaleError extends Error {}
/** Correct the latest locked full count (admins only). The locked report, its
 *  grade and the order guide already sent stay as they are. */
export async function correctCount(id: string, reason: string, changes: CountCorrectionChange[]): Promise<void> {
  try {
    await gatedJson(`/admin/bar/counts/${id}/corrections`, jsonBody({ reason, changes }));
  } catch (e) {
    if (e instanceof BarApiError && e.status === 409) {
      const body = (() => { try { return JSON.parse(String(e.body)); } catch { return null; } })();
      if (body?.error === "correction_stale") throw new CorrectionStaleError("This count changed since you opened it.");
      if (body?.error === "not_correctable") {
        throw new BarApiError("A newer full count has been submitted, so this one can't be corrected now.", 409);
      }
    }
    throw e;
  }
}
/** Submitted counts, newest first. Food counts only when asked for: the
 *  server's default is the liquor list. */
export async function getCountHistory(section: Section = "bar"): Promise<CountSummary[]> {
  const query = section === "bar" ? "" : `?section=${section}`;
  const { counts } = await gatedJson<{ counts: CountSummary[] }>(`/admin/bar/counts/history${query}`);
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
/** One product counted in more than one bottle size, graded as one by the
 *  ounce at one price (TPRS variance.ts sizeFamilies). Its sizes stay in
 *  `lines`. Reports from before 2026-10-03 have none. */
export interface VarianceFamily {
  key: string;
  name: string; // "Tanqueray London Dry Gin (750 ml + 1 L)"
  category: string | null;
  skuIds: string[]; // the sizes, smallest first
  sizes: number[]; // ml, ascending
  startOz: number;
  purchasedOz: number;
  endOz: number;
  usedOz: number;
  soldOz: number;
  lossOz: number;
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
    /** The grade and totals read these in place of their sizes' lines. */
    families?: VarianceFamily[];
    familyVersion?: number;
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

// ── food variance (per submitted full FOOD count; TPRS migration 0202) ──
// A food count's report compares it with the food count before it: what the
// kitchen used against what the bracket's sales and catering say it should
// have. Version 1 is the original and stays the default; an admin re-run adds
// a version beside it. Shapes mirror TPRS bar/food-variance.ts and
// bar/food-variance-period.ts.
export type FoodVarianceFlag =
  | "not_in_start"
  | "not_in_end"
  | "unit_unrecorded"
  | "unit_changed"
  | "package_changed"
  | "recipe_unit_mismatch"
  | "no_yield"
  | "no_cost"
  | "negative_used"
  | "negative_theoretical"
  | "purchase_unconverted";
export type FoodVarianceBand = "normal" | "watch" | "look";
export interface FoodVarianceLine {
  skuId: string;
  name: string;
  foodClass: "protein_cheese" | "produce" | "sauce_dry" | "bakery_frozen" | null;
  /** What start, end, used and theoretical are counted in ("bag"). */
  unit?: string | null;
  start: number | null;
  purchased: number;
  end: number | null;
  used: number | null;
  theoretical: number | null;
  /** used − theoretical: positive = more went out than sold. */
  variance: number | null;
  variancePct: number | null;
  varianceDollars: number | null;
  costPerCountUnit: number | null;
  recipeUnit: string | null;
  yieldUsed: number | null;
  flags: FoodVarianceFlag[];
  /** Flagged lines are left out of every total. */
  clean: boolean;
  band: FoodVarianceBand | null;
  caseSizeChanged: boolean;
  /** The dishes behind theoretical, in count units, biggest first. */
  drivers: { label: string; units: number; estimate: boolean }[];
  /** Same-product package sizes pooled by measure; original count provenance.
   *  Absent on reports made before food size pooling. */
  sizeMembers?: {
    skuId: string; name: string; unit: string | null;
    start: number | null; purchased: number; end: number | null;
    yieldUsed: number | null; costPerCountUnit: number | null;
  }[];
}
export interface FoodVarianceReportBody {
  lines: FoodVarianceLine[];
  noRecipe: { skuId: string; name: string; unit?: string | null; used: number | null; usedDollars: number | null }[];
  totals: {
    usedDollars: number;
    theoreticalDollars: number;
    netVarianceDollars: number;
    variancePct: number | null;
    cleanLines: number;
    flaggedLines: number;
  };
  completeness: {
    mappedSalesPct: number | null;
    cleanTheoreticalPct: number | null;
    incomplete: boolean;
    reasons: string[];
  };
  caveats: string[];
}
export interface FoodVarianceBasis {
  engine: number;
  computedAt: string;
  window: { start: string; end: string; days: number };
  recipes: { md5: string; dishes: number; options: number; problems: number };
  graded: string[];
  purchases: {
    unsettled: number;
    unconverted: { skuId: string; name: string; lines: number; deliveries: number; dollars: number; reasons: string[] }[];
  };
  valuation: Record<string, "count_end" | "count_start" | "today">;
  sales: { gotabRows: number; foodSalesCents: number };
  catering: { rows: number; served: number; stranded: { bookingId: string; reason: string }[]; estimates: number };
}
/** The first food count has nothing to compare with: its report is this. */
export interface FoodVarianceBaseline {
  baseline: true;
}
export interface FoodVarianceVersion {
  version: number;
  priorSessionId: string | null;
  periodStart: string | null;
  periodEnd: string;
  /** A draft settles for 3 hours (late invoices), then freezes. */
  status: "draft" | "final";
  /** First computed after that window, so final at once. */
  catchUp: boolean;
  report: FoodVarianceReportBody | FoodVarianceBaseline;
  basis: FoodVarianceBasis | FoodVarianceBaseline;
  /** A re-run's reason and who ran it; null on version 1. */
  reason: string | null;
  computedBy: string | null;
  createdAt: string;
  finalizedAt: string | null;
}
export interface FoodVarianceSummary {
  sessionId: string;
  priorSessionId: string | null;
  periodStart: string | null;
  periodEnd: string;
  baseline: boolean;
  status: "draft" | "final";
  catchUp: boolean;
  netVarianceDollars: number | null;
  incomplete: boolean | null;
  mappedSalesPct: number | null;
  cleanTheoreticalPct: number | null;
  versions: number;
  createdAt: string;
  finalizedAt: string | null;
}
/** Every food count with a report, newest first, by version 1's headline. */
export async function getFoodVarianceList(): Promise<FoodVarianceSummary[]> {
  const { reports } = await gatedJson<{ reports: FoodVarianceSummary[] }>("/admin/bar/food-variance");
  return reports;
}
/** One food count's report, every version, the original first. null = none yet. */
export async function getFoodVariance(sessionId: string): Promise<FoodVarianceVersion[] | null> {
  try {
    const { versions } = await gatedJson<{ versions: FoodVarianceVersion[] }>(`/admin/bar/food-variance/${sessionId}`);
    return versions;
  } catch (e) {
    if (e instanceof BarApiError && e.status === 404) return null;
    throw e;
  }
}
/** Re-read a frozen bracket with today's recipes, yields and purchases, as a
 *  new version beside the original (admin only). 409 = a baseline or a draft;
 *  503 = GoTab can't be read. */
export async function rerunFoodVariance(sessionId: string, reason: string): Promise<{ version: number }> {
  return gatedJson(`/admin/bar/food-variance/${sessionId}/rerun`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

// ── food cost (the food COGS report) ──
// Each food bracket's cost of goods: opening + purchases − closing, by report
// line, against food + NA sales (TPRS migration 0206; Opsi BUILD-SPEC
// §11.125–§11.127). Shapes mirror TPRS bar/food-cogs.ts and
// bar/food-cogs-period.ts. Money is integer cents.
export type FoodCostLineKey = "food_na" | "paper" | "supplies" | "bar_produce" | "unbucketed";
export type FoodCostItemFlag = "counted_one_end" | "unpriced" | "negative_usage" | "unit_switch" | "rebucketed" | "cost_jump";
export interface FoodCostItem {
  skuId: string;
  name: string;
  line: FoodCostLineKey;
  bucket: string;
  /** What it's counted in ("bag"); absent from reports written before 2026-10-03's unit field. */
  unit?: string | null;
  /** qty null: not in that count. cents null: some of it has no cost. */
  opening: { qty: number | null; cents: number | null; pricedCents: number };
  purchased: { qty: number | null; cents: number };
  closing: { qty: number | null; cents: number | null; pricedCents: number };
  usedQty: number | null;
  usedCents: number | null;
  usedQtyPerDay: number | null;
  usedCentsPerDay: number | null;
  unitCost: { opening: number | null; closing: number | null; purchased: number | null };
  flags: FoodCostItemFlag[];
  /** A cost more than 3x off: out of the line's totals until a revalue. */
  excluded: boolean;
}
export type FoodCostReason =
  | { code: "unpriced"; items: { skuId: string; name: string; end: "opening" | "closing"; qty: number }[] }
  | { code: "counted_one_end"; items: { skuId: string; name: string; missing: "opening" | "closing" }[] }
  | { code: "cost_jump"; items: { skuId: string; name: string; unitCost: FoodCostItem["unitCost"] }[] }
  | { code: "estimated_purchases"; estimatedCents: number; goodsCents: number }
  | { code: "unbucketed"; cents: number }
  | { code: "rebates_unknown"; dates: { salesDate: string; why: string }[] }
  | { code: "brunswick_sales_unknown"; dates: { salesDate: string; why: string }[] }
  | { code: "catering_pending"; bookingIds: string[] }
  | { code: "pending_invoices"; invoiceIds: string[] }
  | { code: "unattributed_purchases"; cents: number };
export interface FoodCostTotals {
  openingCents: number;
  purchasesCents: number;
  closingCents: number;
  cogsCents: number;
}
export interface FoodCostLine extends FoodCostTotals {
  key: FoodCostLineKey;
  cogsPerDayCents: number;
  byBucket: Record<string, FoodCostTotals>;
  purchases: { matched: number; vendorItem: number; estimated: number; freight: number; discounts: number; flaggedCents: number };
  items: FoodCostItem[];
  reasons: FoodCostReason[];
}
export interface FoodCostReportBody {
  period: { start: string; end: string; days: number };
  lines: Record<FoodCostLineKey, FoodCostLine>;
  foodNa: {
    cogsBeforeRebatesCents: number;
    rebateCents: number;
    cogsAfterRebatesCents: number;
    sales: {
      gotabCents: number;
      cateringCents: number;
      brunswickCents?: number;
      brunswickCoverage?: { knownDays: number; unknownDays: number };
      totalCents: number;
      mocktailsOutCents: number;
      beside: { stream: string; name: string; cents: number }[];
    };
    pct: number | null;
    target: number;
    band: [number, number];
    inBand: boolean | null;
    usar: {
      cogsCents: number;
      pct: number | null;
      staffMealsCents: number;
      staffTrainingCompsCents: number;
      guestRecoveryCompsCents: number;
      provisional: boolean;
      unvalued: { name: string; qty: number; why: string }[];
    } | null;
  };
  covers: number;
  paperPerCoverCents: number | null;
  provisional: boolean;
  reasons: FoodCostReason[];
  caveats: string[];
  evidence: { openingCountId: string; closingCountId: string; invoiceIds: string[]; rebateDocIds: string[]; estimateRefs: string[] };
}
export interface FoodCostBasis {
  engine: 1;
  computedAt: string;
  window: { start: string; end: string };
  counts: { openingId: string; closingId: string; openingResolved: boolean; closingResolved: boolean; transientEstimates: number };
  firstCountAt: string | null;
  invoices: { counted: string[]; pending: string[]; beforeFirstCount: string[] };
  rebates: { docs: string[]; unknownDates: string[] };
  catering: { recognised: string[]; pending: string[]; stranded: string[] };
  recipes: { md5: string; dishes: number; options: number };
  ledger: { rows: number; adjustments: number };
}
/** Why a version exists: the sweep's first, a person's re-run or revalue, or
 *  the sweep again when a provisional input arrived. */
export type FoodCostTrigger = "sweep" | "rerun" | "revalue" | "cleared";
export interface FoodCostVersion {
  version: number;
  priorSessionId: string | null;
  periodStart: string | null;
  periodEnd: string;
  status: "draft" | "final";
  catchUp: boolean;
  trigger: FoodCostTrigger;
  report: FoodCostReportBody | FoodVarianceBaseline;
  basis: FoodCostBasis | FoodVarianceBaseline;
  reason: string | null;
  computedBy: string | null;
  createdAt: string;
  finalizedAt: string | null;
}
export interface FoodCostSummary {
  sessionId: string;
  priorSessionId: string | null;
  periodStart: string | null;
  periodEnd: string;
  baseline: boolean;
  /** The latest version: trends read the latest. */
  version: number;
  versions: number;
  status: "draft" | "final";
  catchUp: boolean;
  trigger: FoodCostTrigger;
  provisional: boolean | null;
  foodNaCogsPct: number | null;
  foodNaSalesCents: number | null;
  foodNaCogsCents: number | null;
  createdAt: string;
  finalizedAt: string | null;
}
/** One line of a food count as the report values it. */
export interface CountCostLine {
  lineId: string;
  skuId: string;
  name: string;
  zoneName: string | null;
  qty: number;
  countUnit: string | null;
  unitLabel: string | null;
  /** Per count unit; null = unpriced. */
  cost: number | null;
  basis: "observed" | "estimated" | "unpriced";
  estimateSource: "cost_history" | "other_count" | "revalue" | null;
  /** An estimate a draft computed and didn't store. */
  transient: boolean;
  valueCents: number | null;
  /** For a still-unpriced line: the price TPRS would give it now. */
  suggestion: { cost: number; source: "cost_history" | "other_count" } | null;
}
/** Every food bracket with a COGS report, newest first, at its latest version. */
export async function getFoodCostList(): Promise<FoodCostSummary[]> {
  const { reports } = await gatedJson<{ reports: FoodCostSummary[] }>("/admin/bar/food-cogs");
  return reports;
}
/** One bracket's report, every version, newest first. null = none yet. */
export async function getFoodCost(sessionId: string): Promise<FoodCostVersion[] | null> {
  try {
    const { versions } = await gatedJson<{ versions: FoodCostVersion[] }>(`/admin/bar/food-cogs/${sessionId}`);
    return versions;
  } catch (e) {
    if (e instanceof BarApiError && e.status === 404) return null;
    throw e;
  }
}
/** Re-read a frozen bracket as it stands today, as a new version (admin only).
 *  409 = a baseline or a draft; 503 = GoTab can't be read. */
export async function rerunFoodCost(sessionId: string, reason: string): Promise<{ version: number }> {
  return gatedJson(`/admin/bar/food-cogs/${sessionId}/rerun`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}
/** A food count's line costs, with a suggested price for each unpriced line. Writes nothing. */
export async function getCountCosts(countId: string): Promise<{ resolved: boolean; lines: CountCostLine[] }> {
  return gatedJson<{ resolved: boolean; lines: CountCostLine[] }>(`/admin/bar/counts/${countId}/costs`);
}
/** Price a food count's lines (admin only). Both brackets the count bounds get
 *  a new version together. 400 = a line not on the count; 503 = GoTab can't
 *  be read (nothing changed). */
export async function revalueFoodCount(
  countId: string,
  reason: string,
  changes: { lineId: string; cost: number }[],
): Promise<{ revalued: number; versions: { sessionId: string; version: number }[] }> {
  return gatedJson(`/admin/bar/counts/${countId}/revalue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, changes }),
  });
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
  recipeName?: string;
  sources?: { productId: string; productName: string | null; optionLabel: string; categoryName: string | null }[];
  components: RecipeTemplateComponent[];
}
/** Same-named recipes, including options saved under another menu item. */
export async function getRecipeTemplates(label: string): Promise<RecipeTemplate[]> {
  return (await getRecipeTemplateSuggestions(label)).matches;
}
export async function getRecipeTemplateSuggestions(label: string, productId?: string): Promise<{
  matches: RecipeTemplate[]; targetCategory?: string | null;
}> {
  const params = new URLSearchParams({ label });
  if (productId) params.set("productId", productId);
  return gatedJson(`/admin/bar/recipe-templates?${params}`);
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

// ── Teacher Group Organizer (/admin/bar/teacher-group/*, TPRS migration 0194) ──
// Staff upload the organizer's Word doc(s) or pasted text; TPRS reads it twice,
// resizes that night's lane holds when everything checks out, and emails the
// printable packet. Reading takes a minute or two, so the upload returns an id
// at once and the screen polls it.
export type TeacherGroupStatus = "pending" | "processing" | "done" | "failed";
export interface TeacherGroupIssue {
  kind: string;
  text: string;
  /** Shifts whose lane update this held back; "*" = every shift on the upload. */
  blocks: string[];
}
export interface TeacherGroupLaneOutcome {
  key: string;
  bowl: string;
  status: "applied" | "unchanged" | "skipped";
  invoice: string;
  text: string;
}
export interface TeacherGroupLine {
  n: number;
  file: string;
  text: string;
  /** How the reader placed the line; null = it wasn't accounted for. */
  kind: string | null;
  reading: string | null;
}
export interface TeacherGroupUpload {
  id: string;
  status: TeacherGroupStatus;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  eventDate: string | null;
  emailTo: string[];
  runnerTickets: boolean;
  lines: TeacherGroupLine[];
  issues: TeacherGroupIssue[];
  /** Choices the sheet left out (wing size, sauce), for staff to ask at the lane. */
  confirms?: string[];
  /** What staff added on top of their doc; `applied` is what was done (null = nothing yet). */
  instructions?: { n: number; text: string; applied: string | null; needsPerson?: boolean }[];
  /** Exact issued-packet summary. Missing on older uploads/backends. */
  packetReview?: {
    foodDecisionCount: number;
    managerLines: string[];
    reservationStatus: "checked" | "needs_review" | "not_checked";
  } | null;
  laneOutcomes: TeacherGroupLaneOutcome[];
  pdfReady: boolean;
}
export interface TeacherGroupUploadSummary {
  id: string;
  createdAt: string;
  status: TeacherGroupStatus;
  eventDate: string | null;
  by: string;
  fileNames: string[];
}

/** Mirrors the backend's files max(6). */
export const MAX_TEACHER_GROUP_FILES = 6;
export const TEACHER_GROUP_EMAIL_DOMAIN = "@twistedpin.com";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The backend answers a refused upload with {error, message}; show its message. */
function withServerMessage(e: unknown): unknown {
  if (e instanceof BarApiError && typeof e.body === "string") {
    try {
      const msg = (JSON.parse(e.body) as { message?: string }).message;
      if (msg) return new BarApiError(msg, e.status, e.body);
    } catch {
      /* body wasn't JSON */
    }
  }
  return e;
}

export async function uploadTeacherGroupSheet(args: {
  files: File[];
  /** Added instructions, one per line; applied on top of their doc. */
  instructions: string;
  eventDate: string;
  emailTo: string[];
  runnerTickets: boolean;
}): Promise<string> {
  // One request carries every file, and the site proxy caps a body at ~4.5 MB.
  const total = args.files.reduce((n, f) => n + f.size, 0);
  if (total > PROXY_SAFE_RAW_BYTES) {
    throw new BarApiError("Those files add up to more than 3 MB. Send them one at a time.", 413);
  }
  const files: { name: string; contentType: string; data: string }[] = [];
  for (const f of args.files) {
    const contentType = f.type || (/\.txt$/i.test(f.name) ? "text/plain" : DOCX_TYPE);
    files.push({ name: f.name, contentType, data: await blobToBase64(f) });
  }
  try {
    const { uploadId } = await gatedJson<{ uploadId: string }>(
      "/admin/bar/teacher-group/uploads",
      jsonBody({
        files,
        instructions: args.instructions.trim() || undefined,
        eventDate: args.eventDate || undefined,
        emailTo: args.emailTo,
        runnerTickets: args.runnerTickets,
      }),
    );
    return uploadId;
  } catch (e) {
    throw withServerMessage(e);
  }
}

export async function getTeacherGroupUpload(id: string): Promise<TeacherGroupUpload> {
  return gatedJson<TeacherGroupUpload>(`/admin/bar/teacher-group/uploads/${id}`);
}

export async function listTeacherGroupUploads(): Promise<TeacherGroupUploadSummary[]> {
  const { uploads } = await gatedJson<{ uploads: TeacherGroupUploadSummary[] }>("/admin/bar/teacher-group/uploads");
  return uploads;
}

/** Same-origin URL for the packet PDF; the link carries the session cookie. */
export function teacherGroupPdfUrl(id: string): string {
  const path = `/admin/bar/teacher-group/uploads/${id}/pdf`;
  return USING_DEV_PROXY ? `${API_BASE}${path}/` : `${API_BASE}${path}`;
}
