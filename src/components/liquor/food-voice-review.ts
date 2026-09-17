import type { BarSkuItem, VoiceMatch } from "./api";

export interface FoodReviewItem {
  key: string;
  spoken: string;
  cases: number;
  units: number;
  chosenSkuId: string | null;
  candidates: VoiceMatch[];
  spokenUnit: string | null;
  quantityKnown: boolean;
  /** A human-supplied conversion, held on this utterance only. */
  unitMultiplier?: number;
  unitChoiceConfirmed?: boolean;
  largeCountConfirmed?: string;
  search?: string;
}

export function foodUnitLabel(sku: BarSkuItem | undefined, n: number): string {
  let u = sku?.countUnit ?? "each";
  if (u === "each" && /\bbottled\b/i.test(sku?.name ?? "")) u = "bottle";
  if (n === 1 || ["each", "lb", "gal", "bib"].includes(u)) return u;
  return u === "box" ? "boxes" : `${u}s`;
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
  const caseSize = base === "case" ? 1 : sku?.unitsPerCase ?? null;
  const unitMultiplier = r.unitMultiplier ?? (sameUnit(base, r.spokenUnit) ? 1 : null);
  const needsCaseSize = r.cases > 0 && caseSize == null;
  const needsUnitSize = r.units > 0 && unitMultiplier == null;
  const needsUnitChoice = !r.unitChoiceConfirmed && r.units > 0 && r.units < 1 && !r.spokenUnit && (caseSize ?? 0) > 1;
  const catalogConflict = base === "case" && (sku?.unitsPerCase ?? 1) > 1;
  const units = r.units * (unitMultiplier ?? 0);
  const qty = Math.round((r.cases * (caseSize ?? 0) + units) * 1000) / 1000;
  return { caseSize, unitMultiplier, units, qty, needsCaseSize, needsUnitSize, needsUnitChoice, catalogConflict,
    ready: !!sku && r.quantityKnown && !needsCaseSize && !needsUnitSize && !needsUnitChoice && !catalogConflict };
}

/** Deliberately broad warning thresholds: history can miss deliveries and stock
 * may build up. A warning always offers an explicit keep-as-entered action. */
export function foodCountWarning(r: FoodReviewItem, sku: BarSkuItem | undefined, existingQty = 0): string | null {
  if (!sku) return null;
  const q = foodReviewQuantity(r, sku);
  const history = sku.countHistory;
  const high = Math.max(history?.maxCount ?? 0, history?.maxDelivery ?? 0);
  if (q.ready && high > 0 && q.qty + existingQty > 4 * high && q.qty + existingQty - high >= Math.max(10, q.caseSize ?? 1)) {
    const evidence = [history?.maxCount != null ? `largest count ${history.maxCount}` : "",
      history?.maxDelivery != null ? `largest delivery ${history.maxDelivery}` : ""].filter(Boolean).join("; ");
    return `${q.qty + existingQty} ${foodUnitLabel(sku, q.qty + existingQty)} total is unusually high (${evidence}, last ${history?.days ?? 90} days). Check the unit.`;
  }
  if (r.cases >= 10) return sku.countUnit === "case"
    ? `${r.cases} cases is a large count. Confirm the quantity and package unit.`
    : `${r.cases} cases is a large count. Confirm cases versus ${foodUnitLabel(sku, 2)}${q.caseSize ? ` (${r.cases * q.caseSize} ${foodUnitLabel(sku, r.cases * q.caseSize)})` : ""}.`;
  if (r.cases > 0 && (q.caseSize ?? 0) > 1 && q.units >= q.caseSize!) {
    return "The loose quantity is at least a full case. Check that cases have not already been multiplied into it.";
  }
  return null;
}
