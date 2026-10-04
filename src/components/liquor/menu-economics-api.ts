import { gatedJson } from "./api";

export interface MenuProduct { productId: string; productUuid: string | null; name: string; category: string | null;
  basePriceCents: number | null; archived: boolean; orderEnabled: boolean | null }
export interface IngredientPrice { skuId: string; name: string; countUnit: string; unitLabel: string | null; unitsPerCase: number | null;
  recipeUnit: string | null; yieldPerCount: number | null; costUsd: number | null; costSourceId: string | null; revision: string }
export interface MenuEconomicsRow { product: MenuProduct; physicalMadeQty: number; financialNetQty: number; netRevenueCents: number;
  knownRecipeCostCents: number; completeRecipeCostCents: number | null; recipeCostPerMadeCents: number | null; grossProfitCents: number | null;
  costPct: number | null; ingredients: { skuId: string; qty: number; unit: string }[]; missing: string[]; paidOptions: boolean }
export interface PricingPolicy { productId: string; productUuid: string; revision: number; targetCostPct: number | null;
  shrinkMultiplier: number | null; marketCeilingCents: number | null; programCapCents: number | null; floorCents: number | null; reason: string }
export interface PriceProposal { kind: "raise" | "margin_gained" | "over_target" | "within_policy" | "policy_needed" | "cost_incomplete" | "manual_structure" | "suppressed";
  proposedCents: number | null; liveCents: number | null; gapPct: number | null; overTarget: boolean; profitGainCents: number | null;
  breakEvenVolumeDropPct: number | null; capped: boolean; missing: string[] }
export interface PriceRecommendation { id: string; runId: string; productId: string; productUuid: string | null; policyRevision: number | null;
  payload: { economics: MenuEconomicsRow; proposal: PriceProposal; policy: PricingPolicy | null }; status: string; revision: number;
  appliedCents: number | null; readbackCents: number | null; decidedAt: string | null; verifiedAt: string | null }
export interface MenuEconomicsRun { id: string; month: string; periodStart: string; periodEnd: string; createdAt: string; fingerprint: string;
  basis: { products: MenuProduct[]; prices: IngredientPrice[]; recipeRevision: string; sourceRevision: string; ledgerRows: number; salesBasis: string };
  rows: MenuEconomicsRow[] }
export interface MenuEconomicsData { run: MenuEconomicsRun | null; recommendations: PriceRecommendation[];
  policies: { productId: string; revision: number; policy: PricingPolicy }[]; pending: { recommendation: PriceRecommendation; run: MenuEconomicsRun; writeAttemptId: string | null }[];
  writer: { mode: "off"; sandboxVerified: boolean; message: string } }
export interface PriceDecision { requestId: string; expectedRevision: number; runFingerprint: string; action: "accept" | "custom" | "ignore";
  priceCents?: number; capOverride?: boolean; reason: string }
export interface PriceScenario { rows: { productId: string; name: string; costDeltaCents: number; newRecipeCostCents: number | null;
  grossProfitDeltaCents: number | null }[]; fixedMix: true; fixedRecipeBasis: true; runId: string }
const post = <T,>(path: string, body: unknown) => gatedJson<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const getMenuEconomics = () => gatedJson<MenuEconomicsData>("/admin/bar/menu-economics");
export const refreshMenuEconomics = () => post<{ run: MenuEconomicsRun }>("/admin/bar/menu-economics/run", {});
export const saveMenuPricingPolicy = (body: Omit<PricingPolicy, "revision"> & { expectedRevision: number }) => post<{ policy: PricingPolicy }>("/admin/bar/price-policies", body);
export const decideMenuPrice = (id: string, body: PriceDecision) => post<{ recommendation: PriceRecommendation; replayed: boolean }>(`/admin/bar/price-recommendations/${encodeURIComponent(id)}/decision`, body);
export const verifyMenuPrice = (id: string, expectedRevision: number) => post<{ recommendation: PriceRecommendation; verified: boolean }>(`/admin/bar/price-recommendations/${encodeURIComponent(id)}/verify`, { expectedRevision });
export const withdrawMenuPrice = (id: string, expectedRevision: number, reason: string) =>
  post<{ recommendation: PriceRecommendation }>(`/admin/bar/price-recommendations/${encodeURIComponent(id)}/withdraw`, { expectedRevision, reason });
export const reconcileMenuPrice = (id: string, expectedRevision: number, reason: string) =>
  post<{ recommendation: PriceRecommendation; verified: boolean }>(`/admin/bar/price-recommendations/${encodeURIComponent(id)}/reconcile`, { expectedRevision, reason, confirmedNoPendingWrite: true });
export const previewIngredientPrice = (run: MenuEconomicsRun, ingredient: IngredientPrice, newCostUsd: number) =>
  post<PriceScenario>(`/admin/bar/menu-economics/${encodeURIComponent(run.id)}/ingredient-scenario`, { skuId: ingredient.skuId, expectedRevision: ingredient.revision, newCostUsd });
