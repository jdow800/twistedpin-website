import { gatedJson } from "./api";
export interface OpsFinding { key: string; source: string; title: string; detail: string; href: string; capability: "bar.read" | "bar.manage"; since: string | null; evidence: string;
  impact: { cents: number | null; basis: string; window: string | null } }
export interface OpsPage { findings: OpsFinding[]; total: number; nextOffset: number | null; sources: { name: string; state: "ready" | "unavailable"; checkedAt: string; error?: string }[]; allClear: boolean; note: string }
export const getOpsInbox = (offset = 0, impact = "all") => gatedJson<OpsPage>(`/admin/bar/ops-inbox?offset=${offset}&impact=${impact}`);
type Summary = { brackets: number; usableBrackets: number; costCents: string; salesCents: string; pct: number | null;
  usar: { brackets: number; costCents: string; salesCents: string; pct: number | null }; paper: { brackets: number; costCents: string; covers: string; perCoverCents: number | null } };
export interface Trends { computedAt: string; basis: string; ranges: { months: number; cutoffDate: string; all: Summary; reliable: Summary; draft: number; provisional: number;
  points: { sessionId: string; version: number; periodStart: string; periodEnd: string; status: string; provisional: boolean; costCents: number; salesCents: number; pct: number | null }[] }[] }
export const getFoodTrends = () => gatedJson<Trends>("/admin/bar/food-trends");
export interface DepartmentRow { label: string; amount: number; classification: "food_na" | "other" }
export interface BrunswickDoc { id: string; salesDate: string; status: string; checksumOk: boolean | null; sourceRevision: string; reviewRevision: string;
  result: { cents: number | null; why: string | null; basis: string | null; rows: DepartmentRow[] };
  departments: { complete: boolean; total: number | null; rows: { label: string; amount: number | null }[] } | null;
  review: { complete: boolean; total: number; rows: DepartmentRow[] } | null }
export const getBrunswickDocs = (offset = 0) => gatedJson<{ documents: BrunswickDoc[]; nextOffset: number | null }>(`/admin/bar/brunswick-food?offset=${offset}`);
export const reviewBrunswickDoc = (doc: BrunswickDoc, reason: string, total: number, rows: DepartmentRow[]) => gatedJson(`/admin/bar/brunswick-food/${doc.id}/review`, {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceRevision: doc.sourceRevision, reviewRevision: doc.reviewRevision, reason, answer: { complete: true, total, rows } }) });
