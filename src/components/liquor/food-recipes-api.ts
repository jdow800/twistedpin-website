import { gatedJson } from "./api";

export interface FoodRecipeIngredient {
  id: string; name: string; active: boolean; discontinuedAt: string | null;
  countUnit: string; unitLabel: string | null; unitsPerCase: number | null;
  recipeUnit: string | null; yield: number | null; costPerCountUnit: number | null; yieldRevision: string;
  physicalBasisValid?: boolean;
  costBasisProblem?: string | null; costRevision?: string;
}
export interface FoodRecipeLine {
  id?: string; skuId: string; skuName?: string | null; qty: number; unit: string;
  via: string; basis?: string | null; note?: string | null;
}
export interface FoodRecipe {
  id: string; namespace: "gotab" | "tprs"; productKey: string; optionLabel: string;
  labelText: string | null; kind: "dish" | "variant" | "change" | "instruction";
  productName: string | null; basis: string | null; note: string | null;
  active: boolean; revision: string; name: string; key: string; lines: FoodRecipeLine[];
}
export interface FoodRecipeCatalog { recipes: FoodRecipe[]; items: FoodRecipeIngredient[]; problems: unknown[] }
export interface FoodYieldBasis { countUnit: string | null; unitLabel: string | null; unitsPerCase: number | null; recipeUnit: string | null; yield: number | null }
export interface FoodYieldCorrectionItem {
  skuId: string; name: string; opening: FoodYieldBasis | null; closing: FoodYieldBasis | null; current: FoodYieldBasis;
  previous: { id: string; revision: number; basis: FoodYieldBasis; reason: string } | null;
  canCorrect: boolean; unavailableReason: string | null; revision: string;
}
export interface FoodYieldCorrectionContext {
  sessionId: string; priorSessionId: string; periodStart: string; periodEnd: string;
  varianceVersion: number; cogsVersion: number; revision: string; items: FoodYieldCorrectionItem[];
}
const ROOT = "/admin/bar/food-recipes";
const write = <T,>(path: string, method: string, body: unknown) => gatedJson<T>(path, {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
export const getFoodRecipes = () => gatedJson<FoodRecipeCatalog>(ROOT);
export const saveFoodRecipe = (recipe: {
  namespace: FoodRecipe["namespace"]; productKey: string; optionLabel: string; kind: FoodRecipe["kind"];
  productName?: string; basis?: string; note?: string;
  lines: (Omit<FoodRecipeLine, "basis" | "note"> & { basis?: string; note?: string })[];
  recipeId?: string; expectedRevision?: string; reason: string;
}) => write<{ recipe: FoodRecipe }>(ROOT, "PUT", recipe);
export const setFoodRecipeActive = (id: string, active: boolean, expectedRevision: string, reason: string) =>
  write<{ id: string; active: boolean; revision: string }>(`${ROOT}/${encodeURIComponent(id)}/active`, "PATCH", { active, expectedRevision, reason });
export const setFoodIngredientYield = (item: FoodRecipeIngredient, recipeUnit: string, yieldValue: number | null, reason: string) =>
  write<unknown>(`/admin/bar/skus/${encodeURIComponent(item.id)}/yield`, "PATCH", { recipeUnit, yield: yieldValue, expectedRevision: item.yieldRevision, reason });
export const confirmFoodIngredientCost = (item: FoodRecipeIngredient, costPerCountUnit: number, reason: string) =>
  write<{ costRevision: string; costPerCountUnit: number | null; costBasisProblem: string | null }>(`/admin/bar/skus/${encodeURIComponent(item.id)}/food-cost`, "PATCH", {
    expectedRevision: item.costRevision, expectedCountUnit: item.countUnit, expectedUnitLabel: item.unitLabel,
    expectedUnitsPerCase: item.unitsPerCase, physicalBasisConfirmed: true, costPerCountUnit, reason,
  });
export const getFoodYieldCorrection = (sessionId: string) => gatedJson<FoodYieldCorrectionContext>(`${ROOT}/report-corrections/${encodeURIComponent(sessionId)}`);
export const correctFoodYieldReports = (context: FoodYieldCorrectionContext,
  changes: { skuId: string; expectedRevision: string; recipeUnit: string; yield: number }[], reason: string) =>
  write<{ ok: boolean; varianceVersion: number; cogsVersion: number }>(`${ROOT}/report-corrections/${encodeURIComponent(context.sessionId)}`, "POST", {
    expectedRevision: context.revision, physicalBasisConfirmed: true, changes, reason,
  });
