import type { BarSkuItem, VoiceMatch } from "./api";
import { currentCountDefinition, definedUnitMultiplier, normalizeCountUnit } from "./count-definition";
import { formatQty } from "./quantity";
import { foodPhysicalUnit, preciseFoodQty } from "./food-quantity";

export interface FoodReviewItem {
  key: string;
  spoken: string;
  quantityWords?: string;
  quantityNeedsReview?: boolean;
  identityNeedsReview?: boolean;
  quantityReviewReason?: "source_already_used" | "source_revised" | "unquantified_remainder" | "source_not_returned";
  invalidQuantityFields?: ("cases" | "units")[];
  /** Components of an ungrounded model quantity still awaiting human input. */
  unconfirmedQuantityFields?: ("cases" | "units")[];
  /** Product/unit changes must restate originally uncertain quantities. */
  quantityWasUncertain?: boolean;
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
  /** The counter's answer to "Add to the N already here, or replace?", and
   *  the N it answered. A different N asks again. */
  restateAnswer?: "add" | "replace";
  restateBefore?: number;
}

/**
 * Jon, 2026-10-09: "Ask: add or replace." A heard row for a product the take's
 * shelf already holds, from an earlier take or an earlier row of this review,
 * asks before it is counted (a re-recorded shelf had added two takes into one:
 * pizza sauce 41 from two takes of about 26, draft 81309ef9). `before` is
 * what is there once the earlier ready rows are added, in the product's count
 * unit; an earlier "replace" starts over from that row. Asked once its own
 * number is known.
 */
export function foodRestatement(
  rows: readonly FoodReviewItem[], i: number, onShelf: (skuId: string) => number,
  quantity: (r: FoodReviewItem) => { ready: boolean; qty: number },
): { before: number } | null {
  const r = rows[i];
  if (!r?.chosenSkuId || !quantity(r).ready) return null;
  let before = onShelf(r.chosenSkuId);
  for (const x of rows.slice(0, i)) {
    if (x.chosenSkuId !== r.chosenSkuId) continue;
    const q = quantity(x);
    if (!q.ready) continue;
    const answer = before > 0 ? foodRestateAnswer(x, { before: preciseFoodQty(before) }) : undefined;
    before = (answer === "replace" ? 0 : before) + q.qty;
  }
  before = preciseFoodQty(before);
  return before > 0 ? { before } : null;
}

/** An add-or-replace amount (in the product's count unit) in the words the
 *  row was heard in: "3 buns" for slider buns counted by the case, rather than
 *  "0.016 cases". A row heard in its count unit, or in cases, keeps that unit. */
export function foodRestateAmount(sku: BarSkuItem | undefined, q: ReturnType<typeof foodReviewQuantity>, n: number): string {
  const m = q.unitMultiplier;
  if (q.cases === 0 && q.inputUnit && q.inputUnit !== "case" && m != null && m > 0 && m !== 1) {
    const said = formatQty(n / m);
    return `${said} ${foodPhysicalUnit({ quantity: said, unit: q.inputUnit, numerator: "1", denominator: "1" })}`;
  }
  return `${formatQty(n)} ${foodUnitLabel(sku, n)}`;
}

/** The answer still stands only for the amount it was given against. */
export function foodRestateAnswer(r: FoodReviewItem, restate: { before: number } | null): "add" | "replace" | undefined {
  return restate && r.restateAnswer && r.restateBefore != null && Math.abs(r.restateBefore - restate.before) < 1e-9
    ? r.restateAnswer : undefined;
}

export function foodQuantityFieldsToConfirm(r: FoodReviewItem): ("cases" | "units")[] {
  return r.unconfirmedQuantityFields ?? (r.quantityNeedsReview || !r.quantityKnown ? ["cases", "units"] : []);
}

/** Editing one component cannot certify the model's other component. A
 * single answer explicitly replaces the whole quantity, including loose. */
export function confirmFoodQuantity(r: FoodReviewItem, field: "cases" | "units", value: number | null, replacesAll = false): Partial<FoodReviewItem> {
  const invalid = new Set(r.invalidQuantityFields ?? []);
  const unconfirmed = new Set(foodQuantityFieldsToConfirm(r));
  const valid = value != null && Number.isFinite(value) && value >= 0;
  if (valid) { invalid.delete(field); unconfirmed.delete(field); }
  else { invalid.add(field); unconfirmed.add(field); }
  if (valid && replacesAll) { invalid.clear(); unconfirmed.clear(); }
  return { invalidQuantityFields: [...invalid], unconfirmedQuantityFields: [...unconfirmed],
    quantityKnown: valid && invalid.size === 0 && unconfirmed.size === 0,
    quantityNeedsReview: unconfirmed.size > 0,
      ...(valid ? { [field]: value, ...(replacesAll ? { [field === "cases" ? "units" : "cases"]: 0 } : {}) } : {}) };
}

export function foodUnitLabel(sku: BarSkuItem | undefined, n: number): string {
  let u = currentCountDefinition(sku)?.unitLabel ?? sku?.countUnit ?? "each";
  if (u === "each" && /\bbottled\b/i.test(sku?.name ?? "")) u = "bottle";
  if (n === 1 || ["each", "lb", "gal", "bib"].includes(u)) return u;
  if (u === "loaf") return "loaves";
  if (/(?:s|x|z|ch|sh)$/.test(u)) return `${u}es`;
  if (/[^aeiou]y$/.test(u)) return `${u.slice(0, -1)}ies`;
  return `${u}s`;
}

/** What a unitless count means for this product, in physical count units. */
export function foodImplicitUnit(sku: BarSkuItem | undefined): string {
  const definition = currentCountDefinition(sku);
  const base = normalizeCountUnit(sku?.countUnit ?? "each");
  const defaultUnit = definition?.defaultSpokenUnit && normalizeCountUnit(definition.defaultSpokenUnit);
  // A canonical word such as "each" still names the confirmed physical bag,
  // can or head. A distinct default package, such as case, keeps its basis.
  return defaultUnit && defaultUnit !== base ? defaultUnit : normalizeCountUnit(definition?.unitLabel ?? base);
}

/** Current human package vocabulary can establish an otherwise missing UPC. */
export function foodCaseSize(sku: BarSkuItem | undefined): number | null {
  if (sku?.countUnit === "case") return 1;
  if ((sku?.unitsPerCase ?? 0) > 0) return sku!.unitsPerCase!;
  const mapped = currentCountDefinition(sku)?.spokenUnits?.case;
  return mapped != null && Number.isInteger(mapped) && mapped > 0 && mapped <= 10000 ? mapped : null;
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
  const definition = currentCountDefinition(sku);
  const caseSize = foodCaseSize(sku);
  const rawInputUnit = r.unitNeedsReview ? null : r.spokenUnit ?? definition?.defaultSpokenUnit ?? null;
  const inputUnit = rawInputUnit ? normalizeCountUnit(rawInputUnit) : null;
  const unitMultiplier = r.unitNeedsReview ? null
    : inputUnit === "case" ? caseSize
      : r.unitMultiplier ?? definedUnitMultiplier(sku, r.spokenUnit)
        ?? (sameUnit(base, r.spokenUnit) && (!definition || !r.spokenUnit || normalizeCountUnit(r.spokenUnit) === normalizeCountUnit(base)) ? 1 : null);
  const needsCaseSize = (r.cases > 0 || (r.units > 0 && inputUnit === "case")) && caseSize == null;
  const needsUnitSize = r.units > 0 && unitMultiplier == null && !r.unitNeedsReview && !needsCaseSize;
  const needsUnitChoice = !!r.unitNeedsReview
    || (!r.unitChoiceConfirmed && r.units > 0 && r.units < 1 && !inputUnit && (caseSize ?? 0) > 1);
  const caseMapping = definition?.spokenUnits?.case;
  const catalogConflict = base === "case" && (sku?.unitsPerCase ?? 1) > 1
    || (r.cases > 0 || inputUnit === "case") && caseSize != null && caseMapping != null && caseMapping !== caseSize;
  const unitsAreCases = inputUnit === "case" && unitMultiplier === caseSize;
  const cases = r.cases + (unitsAreCases ? r.units : 0);
  const units = unitsAreCases ? 0 : r.units * (unitMultiplier ?? 0);
  const qty = preciseFoodQty(cases * (caseSize ?? 0) + units);
  return { cases, caseSize, inputUnit, unitMultiplier, units, qty, needsCaseSize, needsUnitSize, needsUnitChoice, catalogConflict,
    ready: !!sku && !r.identityNeedsReview && r.quantityKnown && !r.quantityNeedsReview && !foodQuantityFieldsToConfirm(r).length && !(r.invalidQuantityFields?.length) && Number.isFinite(r.cases) && Number.isFinite(r.units) && Number.isFinite(qty) && r.cases >= 0 && r.units >= 0 && qty >= 0 && !needsCaseSize && !needsUnitSize && !needsUnitChoice && !catalogConflict };
}

/** Deliberately broad warning thresholds: history can miss deliveries and stock
 * may build up. A warning always offers an explicit keep-as-entered action. */
export function foodCountWarning(r: FoodReviewItem, sku: BarSkuItem | undefined, existingQty = 0): string | null {
  if (!sku) return null;
  const q = foodReviewQuantity(r, sku);
  if (!q.ready) return null;
  const history = sku.countHistory;
  const high = Math.max(history?.maxCount ?? 0, history?.maxDelivery ?? 0);
  const usualMaxCases = currentCountDefinition(sku)?.usualMaxCases;
  const totalText = `${formatQty(q.qty + existingQty)} ${foodUnitLabel(sku, q.qty + existingQty)}`;
  // A confirmed operating range is stronger evidence than sparse early history.
  // It only asks for confirmation; the spoken amount is never silently changed.
  if (usualMaxCases != null && q.caseSize != null && q.caseSize > 0
    && (q.qty + existingQty) / q.caseSize > usualMaxCases) {
    return `${totalText} total exceeds the usual ${formatQty(usualMaxCases)} cases. Check the unit; keep if correct.`;
  }
  if (usualMaxCases == null && high > 0 && q.qty + existingQty > 4 * high && q.qty + existingQty - high >= Math.max(10, q.caseSize ?? 1)) {
    const historyText = (n: number) => formatQty(n);
    const evidence = [history?.maxCount != null ? `largest count ${historyText(history.maxCount)}` : "",
      history?.maxDelivery != null ? `largest delivery ${historyText(history.maxDelivery)}` : ""].filter(Boolean).join("; ");
    return `${totalText} is unusually high (${evidence}, last ${history?.days ?? 90} days). Check the unit.`;
  }
  if (usualMaxCases == null && q.cases >= 10) return sku.countUnit === "case"
    ? `${formatQty(q.cases)} cases is a large count. Check quantity and unit.`
    : `${formatQty(q.cases)} cases is a large count. Cases or ${foodUnitLabel(sku, 2)}${q.caseSize ? ` (${formatQty(q.cases * q.caseSize)} ${foodUnitLabel(sku, q.cases * q.caseSize)})` : ""}?`;
  if (r.cases > 0 && q.inputUnit !== "case" && (q.caseSize ?? 0) > 1 && q.units >= q.caseSize!) {
    return "Loose units include a full case. Already included in the case count?";
  }
  return null;
}
