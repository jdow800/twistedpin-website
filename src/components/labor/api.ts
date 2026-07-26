// Typed client for the `/admin/labor/*` JSON API behind the staff /labor
// surface. Same-origin model identical to the liquor SPA's api.ts: the browser
// fetches relative `/tprs-api/...`, which the Vite dev proxy (astro.config.mjs)
// and the prod Vercel middleware forward to the TPRS backend, so the signed
// `tprs_session` cookie rides along with no CORS.
//
// The `HX-Request: true` header is load-bearing: without it the session
// middleware answers a no-session GET with a 302 to the HTML login page, which
// the browser fetch would FOLLOW and then fail to parse as JSON. With it the
// middleware returns a clean 401 that survives the proxy.

const API_BASE: string =
  (import.meta.env.PUBLIC_TPRS_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "/tprs-api";
const USING_DEV_PROXY = API_BASE === "/tprs-api";

/** Dev proxy needs a trailing slash before the query (trailingSlash:'always'). */
function buildUrl(path: string): string {
  if (!USING_DEV_PROXY) return `${API_BASE}${path}`;
  const qIdx = path.indexOf("?");
  const pathname = qIdx === -1 ? path : path.slice(0, qIdx);
  const query = qIdx === -1 ? "" : path.slice(qIdx);
  const slashed = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${API_BASE}${slashed}${query}`;
}

export class NotAuthedError extends Error {
  constructor() { super("not authenticated"); this.name = "NotAuthedError"; }
}
export class ForbiddenError extends Error {
  constructor() { super("forbidden"); this.name = "ForbiddenError"; }
}
export class LaborApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "LaborApiError"; }
}

const HX = { "HX-Request": "true" } as const;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path), {
      ...init,
      credentials: "include",
      headers: { ...HX, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new LaborApiError("network error", 0);
  }
  if (res.status === 401) throw new NotAuthedError();
  if (res.status === 403) throw new ForbiddenError();
  if (!res.ok) throw new LaborApiError(`request failed (${res.status})`, res.status);
  return (await res.json()) as T;
}

export interface LaborActor {
  id: string;
  displayName: string | null;
  roleName: string | null;
  permissions: string[];
}

export type NoteKind = "one_off" | "new_normal";
export type NoteCategory =
  | "training" | "deep_clean" | "inventory" | "callout" | "event" | "weather" | "other";

export interface ExistingNote {
  kind: NoteKind;
  category: NoteCategory | null;
  reasonText: string | null;
  createdAt: string;
}
export interface DayDept {
  dept: string;
  deptLabel: string;
  hours: number;
  norm: number;
  overHours: number;
  summary: string;
  note: ExistingNote | null;
}
export interface FlaggedDay {
  date: string;
  label: string;
  depts: DayDept[];
}

export interface ProposedNote {
  kind: NoteKind | "unclear";
  category: NoteCategory | null;
  reasonText: string;
  depts: string[];
  confident: boolean;
}

export const getMe = () => call<{ actor: LaborActor | null }>("/admin/labor/me").then((r) => r.actor);

export const getDays = () => call<{ days: FlaggedDay[] }>("/admin/labor/days").then((r) => r.days);

export const extractNote = (salesDate: string, transcript: string) =>
  call<{ proposed: ProposedNote; degraded?: boolean }>("/admin/labor/notes/extract", {
    method: "POST",
    body: JSON.stringify({ salesDate, transcript }),
  });

export const saveNote = (body: {
  salesDate: string;
  depts: string[];
  kind: NoteKind;
  category?: NoteCategory | null;
  reasonText?: string | null;
  transcript?: string | null;
  source: "voice" | "typed";
}) => call<{ ok: true; groupId: string; count: number }>("/admin/labor/notes", {
  method: "POST",
  body: JSON.stringify(body),
});

export const undoNote = (groupId: string) =>
  call<{ ok: true }>("/admin/labor/notes/undo", { method: "POST", body: JSON.stringify({ groupId }) });

export async function logout(): Promise<void> {
  try {
    await fetch(buildUrl("/admin/logout"), { method: "POST", credentials: "include", headers: HX });
  } catch { /* best effort */ }
}
