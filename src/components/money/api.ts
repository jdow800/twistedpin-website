// Typed client for the Money Hub `/admin/cash/*` JSON API, consumed by the
// staff /money SPA. Transport identical to the /liquor client (same-origin
// /tprs-api proxy, tprs_session cookie, HX-Request → clean 401). PIN login
// reuses the bar pin-login route — the PIN identifies the staffer and the
// cookie it issues is the SAME session both apps trust.

const API_BASE: string =
  (import.meta.env.PUBLIC_TPRS_API_BASE as string | undefined)?.replace(/\/$/, "") ??
  "/tprs-api";
const USING_DEV_PROXY = API_BASE === "/tprs-api";

function buildUrl(path: string): string {
  if (!USING_DEV_PROXY) return `${API_BASE}${path}`;
  const qIdx = path.indexOf("?");
  const pathname = qIdx === -1 ? path : path.slice(0, qIdx);
  const query = qIdx === -1 ? "" : path.slice(qIdx);
  const slashed = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${API_BASE}${slashed}${query}`;
}

export class NotAuthedError extends Error {
  constructor() {
    super("not authenticated");
    this.name = "NotAuthedError";
  }
}
export class ForbiddenError extends Error {
  constructor() {
    super("forbidden");
    this.name = "ForbiddenError";
  }
}
export class CashApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "CashApiError";
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
    throw new CashApiError(`Network error reaching ${path}: ${(err as Error).message}`, 0);
  }
}

async function gatedJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await rawFetch(path, init);
  if (res.status === 401) throw new NotAuthedError();
  if (res.status === 403) throw new ForbiddenError();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CashApiError(`${init.method ?? "GET"} ${path} failed (${res.status})`, res.status, body);
  }
  return (await res.json()) as T;
}

const jsonBody = (payload: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

// ── auth (shared with /liquor — bar pin routes issue the shared session) ──────

export async function pinLogin(pin: string): Promise<{ ok: boolean; message?: string }> {
  const res = await rawFetch("/admin/bar/pin-login", jsonBody({ pin }));
  if (res.ok) return { ok: true };
  const json = (await res.json().catch(() => undefined)) as { message?: string } | undefined;
  return { ok: false, message: json?.message };
}

export async function logout(): Promise<void> {
  await rawFetch("/admin/bar/logout", jsonBody({}));
}

export interface CashActor {
  id: string;
  displayName: string | null;
  canCount: boolean;
  isAdmin: boolean;
}

export function getMe(): Promise<CashActor> {
  return gatedJson<CashActor>("/admin/cash/me");
}

// ── types ─────────────────────────────────────────────────────────────────────

export type RegisterKey = "brunswick" | "gotab" | "arcade" | "kiosk";

export interface WorklistResponse {
  registers: { key: RegisterKey; displayName: string; takesChecks: boolean }[];
  uncounted: { registerKey: RegisterKey; salesDate: string; hasCash: boolean }[];
  zeroDays: { registerKey: RegisterKey; salesDate: string }[];
  counted: { registerKey: RegisterKey; salesDate: string }[];
  kiosk: { windowStart: string; lastPullEnd: string | null };
}

export interface CheckItem {
  payer: string;
  cents: number;
}

export interface BagView {
  id: string;
  registerKey: RegisterKey;
  salesDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  billsCents: number;
  coinCents: number;
  checks: CheckItem[];
  totalCents: number;
  expectedCents: number | null;
  varianceCents: number | null;
  verifyStatus: "verified" | "unverified";
  note: string | null;
  recountOf: string | null;
  countedAt: string;
}

export interface Reveal {
  expectedCents?: number;
  varianceCents?: number;
  severity?: { severity: "even" | "minor" | "notable" | "major"; pct: number | null } | null;
  offset?: { neighborDate: string; neighborVarianceCents: number } | null;
  kioskCaveat?: string | null;
  snapshot?: unknown;
  unverified?: boolean;
  message?: string;
}

export interface CommitResponse {
  bag: BagView;
  reveal: Reveal;
}

export interface ReviewRow extends BagView {
  offset: { neighborDate: string; neighborVarianceCents: number } | null;
}

/** No deposit/totals here by design — each count stands alone for the GM. */
export interface ReviewResponse {
  rows: ReviewRow[];
}

export interface DayDetail {
  registerKey: RegisterKey;
  salesDate: string;
  tender: {
    cashCents: number;
    checksCents: number;
    checkCount: number;
    refundsCashCents: number;
    payouts: { name: string; cents: number }[];
    gratuityPaidOutCents: number;
    paymentLines: { label: string; cents: number; class: string }[];
    source: string;
  } | null;
  doc: { id: string; status: string; checksumOk: boolean | null; hasPdf: boolean } | null;
  adjustments: {
    source: string;
    kind: string;
    reason: string | null;
    amountCents: number;
    occurredAt: string | null;
    device: string | null;
    productName: string | null;
  }[];
  counts: BagView[];
}

export interface HistorySession {
  id: string;
  startedAt: string;
  submittedAt: string | null;
  bagCount: number;
}

// ── calls ─────────────────────────────────────────────────────────────────────

export function getWorklist(): Promise<WorklistResponse> {
  return gatedJson<WorklistResponse>("/admin/cash/worklist");
}

export function openSession(): Promise<{ sessionId: string; resumed: boolean }> {
  return gatedJson("/admin/cash/sessions", jsonBody({}));
}

export function getOpenSession(): Promise<{ session: { id: string; startedAt: string } | null; bags: BagView[] }> {
  return gatedJson("/admin/cash/sessions/open");
}

export interface CommitBagInput {
  registerKey: RegisterKey;
  salesDate?: string;
  billsCents: number;
  coinCents: number;
  checks: CheckItem[];
  note?: string;
  recountOf?: string;
}

export function commitBag(sessionId: string, input: CommitBagInput): Promise<CommitResponse> {
  return gatedJson(`/admin/cash/sessions/${sessionId}/bags`, jsonBody(input));
}

export function saveBagNote(bagId: string, note: string): Promise<{ ok: true }> {
  return gatedJson(`/admin/cash/bags/${bagId}/note`, jsonBody({ note }));
}

export function getReview(sessionId: string): Promise<ReviewResponse> {
  return gatedJson(`/admin/cash/sessions/${sessionId}/review`);
}

export function submitSession(sessionId: string): Promise<{ sealed: true }> {
  return gatedJson(`/admin/cash/sessions/${sessionId}/submit`, jsonBody({}));
}

export function getDayDetail(registerKey: Exclude<RegisterKey, "kiosk">, salesDate: string): Promise<DayDetail> {
  return gatedJson(`/admin/cash/day/${registerKey}/${salesDate}`);
}

export function getHistory(): Promise<{ sessions: HistorySession[] }> {
  return gatedJson("/admin/cash/sessions/history");
}

export function docPdfUrl(docId: string): string {
  return buildUrl(`/admin/cash/docs/${docId}/pdf`);
}

// ── admin layer (cash.admin — Jon only) ──────────────────────────────────────

export interface AdminDeposit {
  id: string;
  sealedAt: string;
  currencyCents: number;
  coinCents: number;
  checksCents: number;
  totalCents: number;
  status: "sealed" | "banked" | "mismatch";
  bankCreditedCents: number | null;
  bankedAt: string | null;
  note: string | null;
}

export function getDeposits(): Promise<{ deposits: AdminDeposit[] }> {
  return gatedJson("/admin/cash/deposits");
}

export interface MonthlySummaryMonth {
  month: string;
  registers: {
    registerKey: string;
    expectedCashCents: number | null;
    countedCashCents: number | null;
    varianceCents: number | null;
    bagsCounted: number | null;
    bagsExpected: number | null;
    offsettingPairs: number | null;
    compsVoidsCents: number | null;
    refundsCents: number | null;
  }[];
  total: { expectedCashCents: number; varianceCents: number; pct: number | null };
}

export function getMonthlySummary(): Promise<{ months: MonthlySummaryMonth[] }> {
  return gatedJson("/admin/cash/monthly-summary");
}

export function monthlySummaryCsvUrl(): string {
  return buildUrl("/admin/cash/monthly-summary?format=csv");
}

export function bankConfirm(
  depositId: string,
  bankCreditedCents: number,
  note?: string,
): Promise<{ status: "banked" | "mismatch"; diffCents: number }> {
  return gatedJson(`/admin/cash/deposits/${depositId}/bank`, jsonBody({ bankCreditedCents, ...(note ? { note } : {}) }));
}

// ── formatting helpers (shared by views) ─────────────────────────────────────

export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const n = Math.abs(cents) / 100;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function signedMoney(cents: number): string {
  return `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${money(cents)}`;
}

/** "2026-07-16" → "Wed 7/16" */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
  return `${wd} ${m}/${d}`;
}

export const REGISTER_LABEL: Record<RegisterKey, string> = {
  brunswick: "Bowling",
  gotab: "Bar",
  arcade: "Arcade",
  kiosk: "Kiosks",
};

/**
 * Collapse recounts: latest count per bag identity (register+day, or kiosk
 * window). A recounted bag is ONE bag — the recount supersedes the original.
 */
export function dedupeBags(bags: BagView[]): BagView[] {
  const sorted = [...bags].sort((a, b) => b.countedAt.localeCompare(a.countedAt));
  const map = new Map<string, BagView>();
  for (const b of sorted) {
    const key = b.registerKey === "kiosk" ? `kiosk|${b.windowStart}|${b.windowEnd}` : `${b.registerKey}|${b.salesDate}`;
    if (!map.has(key)) map.set(key, b);
  }
  return [...map.values()].sort((a, b) =>
    (a.salesDate ?? a.windowStart ?? "").localeCompare(b.salesDate ?? b.windowStart ?? ""),
  );
}

/** Dollars text input → integer cents (null on unparseable). */
export function dollarsToCents(text: string): number | null {
  const t = text.trim().replace(/[$,]/g, "");
  if (!t) return 0;
  if (!/^\d*(\.\d{0,2})?$/.test(t)) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
