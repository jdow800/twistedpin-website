import type { BarSkuItem, VoiceMatch } from "./api";
import { currentCountDefinition, definedUnitMultiplier, normalizeCountUnit } from "./count-definition";

export interface FoodReviewItem {
  key: string;
  spoken: string;
  cases: number;
  units: number;
  chosenSkuId: string | null;
  candidates: VoiceMatch[];
  spokenUnit: string | null;
  quantityKnown: boolean;
  unitNeedsReview?: boolean;
  unitDraft?: string;
  /** A human-supplied conversion, held on this utterance only. */
  unitMultiplier?: number;
  unitChoiceConfirmed?: boolean;
  largeCountConfirmed?: string;
  search?: string;
}

export function foodUnitLabel(sku: BarSkuItem | undefined, n: number): string {
  let u = currentCountDefinition(sku)?.unitLabel ?? sku?.countUnit ?? "each";
  if (u === "each" && /\bbottled\b/i.test(sku?.name ?? "")) u = "bottle";
  if (n === 1 || ["each", "lb", "gal", "bib"].includes(u)) return u;
  if (/(?:s|x|z|ch|sh)$/.test(u)) return `${u}es`;
  if (/[^aeiou]y$/.test(u)) return `${u.slice(0, -1)}ies`;
  return `${u}s`;
}

/** Jon's case-only policy belongs to these ingredients, even if a later pack
 *  change invalidates their stored vocabulary. Case size is still confirmed
 *  separately. Vegetable Cauliflower and other foods keep their own units. */
export function foodCasesOnly(sku: BarSkuItem | undefined): boolean {
  const name = sku?.name.toLowerCase().replace(/[\\"“”]/g, "").replace(/\s+/g, " ").trim();
  return !!sku && ["cauliflower crust", "flatbread", "flatbread, 4.5x12"].includes(name ?? "")
    && sku.countUnit === "each";
}

function sameUnit(base: string, said: string | null): boolean {
  if (!said) return true;
  const aliases: Record<string, string> = {
    bottles: "bottle", cans: "can", jars: "jar", containers: "container", bags: "bag",
    packs: "pack", packets: "packet", boxes: "box", sacks: "sack", cases: "case",
    pounds: "lb", pound: "lb", lbs: "lb", gallons: "gal", gallon: "gal", ea: "each",
  };
  const unit = aliases[said.toLowerCase()] ?? said.toLowerCase();
  if (unit === base) return true;
  if (base === "each") return ["bottle", "can", "jar", "container"].includes(unit);
  if (base === "bottle") return unit === "each";
  if (base === "pack") return ["bag", "packet"].includes(unit);
  if (base === "sack") return unit === "bag";
  return false;
}

export function foodReviewQuantity(r: FoodReviewItem, sku: BarSkuItem | undefined) {
  const base = sku?.countUnit ?? "each";
  const caseSize = base === "case" ? 1 : (sku?.unitsPerCase ?? 0) > 0 ? sku!.unitsPerCase : null;
  const casesOnly = foodCasesOnly(sku);
  const rawInputUnit = r.unitNeedsReview ? null : r.spokenUnit ?? (casesOnly ? "case" : currentCountDefinition(sku)?.defaultSpokenUnit ?? null);
  const inputUnit = rawInputUnit ? normalizeCountUnit(rawInputUnit) : null;
  const unitMultiplier = r.unitNeedsReview ? null
    : casesOnly && inputUnit === "case" ? caseSize
      : r.unitMultiplier ?? definedUnitMultiplier(sku, r.spokenUnit) ?? (sameUnit(base, r.spokenUnit) ? 1 : null);
  const needsCaseSize = (r.cases > 0 || (casesOnly && r.units > 0 && inputUnit === "case")) && caseSize == null;
  const needsUnitSize = r.units > 0 && unitMultiplier == null && !r.unitNeedsReview && !needsCaseSize;
  const needsUnitChoice = !!r.unitNeedsReview || (casesOnly && ((!!r.spokenUnit && inputUnit !== "case") || (r.cases > 0 && r.units > 0)))
    || (!r.unitChoiceConfirmed && r.units > 0 && r.units < 1 && !inputUnit && (caseSize ?? 0) > 1);
  const catalogConflict = base === "case" && (sku?.unitsPerCase ?? 1) > 1;
  const unitsAreCases = inputUnit === "case" && unitMultiplier === caseSize;
  const cases = r.cases + (unitsAreCases ? r.units : 0);
  const units = unitsAreCases ? 0 : r.units * (unitMultiplier ?? 0);
  const qty = Math.round((cases * (caseSize ?? 0) + units) * 1000) / 1000;
  return { cases, caseSize, inputUnit, unitMultiplier, units, qty, needsCaseSize, needsUnitSize, needsUnitChoice, catalogConflict,
    ready: !!sku && r.quantityKnown && !needsCaseSize && !needsUnitSize && !needsUnitChoice && !catalogConflict };
}

/** Deliberately broad warning thresholds: history can miss deliveries and stock
 * may build up. A warning always offers an explicit keep-as-entered action. */
export function foodCountWarning(r: FoodReviewItem, sku: BarSkuItem | undefined, existingQty = 0): string | null {
  if (!sku) return null;
  const q = foodReviewQuantity(r, sku);
  const history = sku.countHistory;
  const high = Math.max(history?.maxCount ?? 0, history?.maxDelivery ?? 0);
  const usualMaxCases = currentCountDefinition(sku)?.usualMaxCases;
  const casesOnly = foodCasesOnly(sku);
  const totalText = casesOnly ? `${(q.qty + existingQty) / q.caseSize!} cases`
    : `${q.qty + existingQty} ${foodUnitLabel(sku, q.qty + existingQty)}`;
  // A confirmed operating range is stronger evidence than sparse early history.
  // It only asks for confirmation; the spoken amount is never silently changed.
  if (q.ready && usualMaxCases != null && q.caseSize != null && q.caseSize > 0
    && (q.qty + existingQty) / q.caseSize > usualMaxCases) {
    return `${totalText} total exceeds the usual ${usualMaxCases} cases. Check the ${casesOnly ? "case quantity" : "unit"} and keep this count if correct.`;
  }
  if (usualMaxCases == null && q.ready && high > 0 && q.qty + existingQty > 4 * high && q.qty + existingQty - high >= Math.max(10, q.caseSize ?? 1)) {
    const historyText = (n: number) => casesOnly ? `${n / q.caseSize!} cases` : String(n);
    const evidence = [history?.maxCount != null ? `largest count ${historyText(history.maxCount)}` : "",
      history?.maxDelivery != null ? `largest delivery ${historyText(history.maxDelivery)}` : ""].filter(Boolean).join("; ");
    return `${totalText} total is unusually high (${evidence}, last ${history?.days ?? 90} days). Check the ${casesOnly ? "case quantity" : "unit"}.`;
  }
  if (usualMaxCases == null && q.cases >= 10) return casesOnly ? `${q.cases} cases is a large count. Confirm the number of cases.` : sku.countUnit === "case"
    ? `${q.cases} cases is a large count. Confirm the quantity and package unit.`
    : `${q.cases} cases is a large count. Confirm cases versus ${foodUnitLabel(sku, 2)}${q.caseSize ? ` (${q.cases * q.caseSize} ${foodUnitLabel(sku, q.cases * q.caseSize)})` : ""}.`;
  if (r.cases > 0 && q.inputUnit !== "case" && (q.caseSize ?? 0) > 1 && q.units >= q.caseSize!) {
    return "The loose quantity is at least a full case. Check that cases have not already been multiplied into it.";
  }
  return null;
}
