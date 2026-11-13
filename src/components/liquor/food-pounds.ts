import type { BarSkuItem } from "./api";
import { currentCountDefinition, definedUnitMultiplier, normalizeCountUnit } from "./count-definition";
import { legacyFoodQuantity, mergeFoodQuantity, physicalFoodQuantity, foodQuantityBasis, type FoodLooseQuantity, type FoodQuantity } from "./food-quantity";

/**
 * POUNDS IN THE TYPED BOXES (count guard, 2026-11-12).
 *
 * The GM asked to count bagged items by the pound on 10-14, and 21 of them
 * gained a pounds conversion (Opsi §11.155). Every line on 11/12 was typed,
 * though, and typed entry had only "cases" and the count unit, so that
 * conversion reached nobody: sugar's 17 lb went into the bag box as 17 bags.
 *
 * An item gets a pounds box when its confirmed count definition says how many
 * count units one pound is AND the catalog sends the exact ratio for it
 * (`foodUnitRatios.lb`): the same two facts a spoken "17 lb" is saved with,
 * so a typed 17 lb saves exactly as the spoken one does, as a pounds part of
 * the cell. An item counted in pounds already has its own box. Sugar gets its
 * box only once its pounds factor is written (a separate catalog change).
 */
export function foodPoundsFactor(sku: BarSkuItem | undefined): number | null {
  if (!sku) return null;
  const label = currentCountDefinition(sku)?.unitLabel;
  if (normalizeCountUnit(sku.countUnit ?? "each") === "lb" || (label && normalizeCountUnit(label) === "lb")) return null;
  const factor = definedUnitMultiplier(sku, "lb");
  const ratio = sku.foodUnitRatios?.lb;
  if (factor == null || !(factor > 0) || !ratio) return null;
  const exact = Number(ratio.numerator) / Number(ratio.denominator);
  return Number.isFinite(exact) && Math.abs(exact - factor) <= Math.max(1, factor) * 1e-12 ? factor : null;
}

/** A pounds part saved at the catalog's ratio today: the one the pounds box
 *  owns. A pounds part frozen at an older ratio (a spoken "17 lb" before the
 *  pound size changed) is a different entry and keeps its own box, so typing
 *  in the pounds box never rescales or drops it (review 2026-11-12, round 2). */
export function isCurrentPoundsPart(part: FoodLooseQuantity, sku: BarSkuItem | undefined): boolean {
  const ratio = sku?.foodUnitRatios?.lb;
  if (!ratio || normalizeCountUnit(part.unit) !== "lb") return false;
  try {
    return BigInt(part.numerator) * BigInt(ratio.denominator) === BigInt(ratio.numerator) * BigInt(part.denominator);
  } catch {
    return false;
  }
}

/** The cell's pounds-box amount: its current-ratio pounds part, or null. */
export function foodPoundsOf(q: FoodQuantity | undefined, sku: BarSkuItem | undefined): number | null {
  const part = q?.loose.find((p) => isCurrentPoundsPart(p, sku));
  return part ? Number(part.quantity) : null;
}

/** The cell's quantity with its pounds part set to `pounds` (replacing any
 *  earlier pounds part, keeping every other part). Null when the item has no
 *  pounds box or the number is not a count. */
export function withFoodPounds(sku: BarSkuItem, current: FoodQuantity | undefined, legacyUnits: number | null, pounds: number): FoodQuantity | null {
  const factor = foodPoundsFactor(sku);
  if (factor == null || !Number.isFinite(pounds) || pounds < 0) return null;
  const basis = foodQuantityBasis(sku);
  const base = current ?? legacyFoodQuantity(legacyUnits ?? 0, basis);
  const rest: FoodQuantity = { ...base, loose: base.loose.filter((p) => !isCurrentPoundsPart(p, sku)) };
  const lb = physicalFoodQuantity(pounds, "lb", factor, sku.foodUnitRatios, basis);
  // physicalFoodQuantity falls back to a plain count when the ratio is not the
  // catalog's; foodPoundsFactor already required it, so this is a pounds part.
  if (lb.loose.length !== 1) return null;
  try {
    return mergeFoodQuantity(rest, lb);
  } catch {
    return null; // the item's counting unit changed since this cell was entered
  }
}
