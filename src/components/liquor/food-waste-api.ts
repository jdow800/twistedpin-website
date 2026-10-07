import { BarApiError, gatedJson, type BarSkuItem } from "./api";
import { compressToJpeg, blobToBase64, PROXY_SAFE_RAW_BYTES } from "./document-photo";

const ROOT = "/admin/bar/food-waste";
export type WasteStatus = "draft" | "queued" | "processing" | "review" | "error" | "posted" | "void";
export interface WastePeriod { openingSessionId: string | null; closingSessionId: string | null; start: string | null; end: string | null; label: string }
export interface WasteOption { id: string; name: string; optionLabel: string | null; kind: "variant" | "change" | "instruction"; revision: string }
export interface WasteRecipe { id: string; name: string; revision: string; options: WasteOption[]; issues: string[]; requiredVariant: boolean }
export interface WasteCatalog { items: BarSkuItem[]; recipes: WasteRecipe[] }
export interface WasteReviewLine {
  id: string; decision: "include" | "discard"; targetType: "sku" | "recipe" | null;
  skuId: string | null; recipeId: string | null; optionRecipeIds: string[];
  quantity: number | null; unitText: string | null; occurredDate: string | null;
  reason: string | null; duplicateDecision: "keep" | "discard" | null; acknowledged: boolean;
  manualSource?: { pageId: string | null; rawText: string };
}
export interface WasteIngredient { skuId: string; name: string; quantity: number; countUnit: string; unitLabel: string | null; costPerCountUnit: number | null; valueCents: number | null }
export interface WasteLine extends WasteReviewLine {
  pageId: string | null; rowNumber: number; rawText: string; itemText: string;
  quantityText: string | null; sourceUnitText: string | null; sourceOccurredDate: string | null; sourceReason: string | null;
  reviewNotes: string[]; issues: string[]; candidateSkuIds: string[]; candidateRecipeIds: string[]; duplicateLineIds: string[];
  ingredients: WasteIngredient[]; valueCents: number | null;
}
export interface WasteSummary {
  openingSessionId: string | null; closingSessionId: string | null; start: string | null; end: string | null;
  valuedCents: number; totalCents: number | null; unvaluedCount: number; lineCount: number;
  wastePct: number | null; salesCents: number | null;
  salesStatus: "awaiting_closing_count" | "awaiting_food_report" | "ready" | "provisional" | "no_baseline";
  valuation: "reviewed_post_time_estimate"; basis: unknown;
}
export interface WasteImportSummary { id: string; ownerId: string; status: WasteStatus; revision: number; createdAt: string; postedAt: string | null; openingSessionId: string | null; pageCount: number; lineCount: number }
export interface WasteImport {
  id: string; ownerId: string; status: WasteStatus; revision: number; openingSessionId: string | null;
  createdAt: string; postedAt: string | null; error: string | null; warnings: string[]; warningsAcknowledged: boolean;
  pages: { id: string; pageNumber: number; contentType: string; sizeBytes: number; imageUrl: string }[];
  lines: WasteLine[]; summary?: WasteSummary;
}
const write = <T,>(path: string, method: string, body: unknown) => gatedJson<T>(ROOT + path, {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
export const getWasteCatalog = () => gatedJson<WasteCatalog>(ROOT + "/catalog");
export const getWastePeriods = () => gatedJson<{ periods: WastePeriod[] }>(ROOT + "/periods");
export const getWasteImports = () => gatedJson<{ imports: WasteImportSummary[] }>(ROOT + "/imports");
export const getWasteImport = (id: string) => gatedJson<WasteImport>(ROOT + "/imports/" + encodeURIComponent(id));
export const createWasteImport = (requestId: string, openingSessionId: string | null) => write<WasteImport>("/imports", "POST", { requestId, openingSessionId });
export async function addWastePhoto(id: string, file: File): Promise<WasteImport> {
  const prepared = await compressToJpeg(file);
  if (!prepared) throw new BarApiError("This photo could not be read. Choose a JPEG or retake it.", 0);
  if (prepared.blob.size > PROXY_SAFE_RAW_BYTES) throw new BarApiError("This photo is too large after shrinking. Retake it closer.", 413);
  return write<WasteImport>("/imports/" + encodeURIComponent(id) + "/pages", "POST", {
    contentType: "image/jpeg", data: await blobToBase64(prepared.blob),
  });
}
export const removeWastePage = (id: string, pageId: string, expectedRevision: number) => write<WasteImport>(`/imports/${encodeURIComponent(id)}/pages/${encodeURIComponent(pageId)}`, "DELETE", { expectedRevision });
export const extractWaste = (id: string, expectedRevision: number) => write<WasteImport>(`/imports/${encodeURIComponent(id)}/extract`, "POST", { expectedRevision });
export const saveWasteReview = (id: string, expectedRevision: number, openingSessionId: string | null, lines: WasteReviewLine[], warningsAcknowledged: boolean) =>
  write<WasteImport>(`/imports/${encodeURIComponent(id)}/review`, "PUT", { expectedRevision, openingSessionId, lines, warningsAcknowledged });
export const postWasteImport = (id: string, expectedRevision: number, requestId: string) => write<WasteImport>(`/imports/${encodeURIComponent(id)}/post`, "POST", { expectedRevision, requestId });
export const voidWasteImport = (id: string, expectedRevision: number, reason: string) => write<WasteImport>(`/imports/${encodeURIComponent(id)}/void`, "POST", { expectedRevision, reason });
export const getWasteSummary = (openingSessionId: string | null) => gatedJson<WasteSummary>(ROOT + "/summary" + (openingSessionId ? "?openingSessionId=" + encodeURIComponent(openingSessionId) : ""));
export function wastePageUrl(importId: string, pageId: string): string {
  const base = (import.meta.env.PUBLIC_TPRS_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "/tprs-api";
  return `${base}${ROOT}/imports/${encodeURIComponent(importId)}/pages/${encodeURIComponent(pageId)}${base === "/tprs-api" ? "/" : ""}`;
}
export function wasteReviewFields(line: WasteLine): WasteReviewLine {
  const { id, decision, targetType, skuId, recipeId, optionRecipeIds, quantity, unitText, occurredDate, reason, duplicateDecision, acknowledged, manualSource } = line;
  return { id, decision, targetType, skuId, recipeId, optionRecipeIds, quantity, unitText, occurredDate, reason, duplicateDecision, acknowledged, ...(manualSource ? { manualSource } : {}) };
}
