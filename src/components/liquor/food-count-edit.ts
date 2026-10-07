import type { BarSkuItem, CountLineInput } from "./api";
import { normalizeCountUnit, currentCountDefinition } from "./count-definition";
import { roundQty } from "./quantity";

export type FoodCell = {
  cases: number | null; units: number | null; qty: number; caseSize: number | null;
  packs?: number | null; packSize?: number | null; source: "grid" | "voice";
  raw?: string; none?: boolean;
};

export const readFoodNumber = (raw: string): number | null => {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};
export const foodCellQty = (c: FoodCell): number => roundQty((c.units ?? 0) + (c.cases ?? 0) * (c.caseSize ?? 0) + (c.packs ?? 0) * (c.packSize ?? 0));
const sum = (a: number, b: number) => Number((a + b).toPrecision(15));

/** Keep the original excerpts, including explicit evidence when older speech
 * has to be shortened. This is a count audit trail, not a new transcript. */
export function appendFoodSource(before?: string, after?: string): string | undefined {
  const parts = [before, after].filter((x): x is string => !!x);
  if (!parts.length) return undefined;
  const full = parts.join("; ");
  const limit = 2000;
  if (full.length <= limit) return full;
  const marker = " [earlier source shortened] ";
  return `${full.slice(0, 650)}${marker}${full.slice(-(limit - 650 - marker.length))}`;
}

/** A count label refines what an each/pack means. Two different labels still
 * need a fresh amount; kilograms, pounds and packs cannot share a number. */
export function compatibleFoodUnits(a: BarSkuItem, b: BarSkuItem): boolean {
  const label = (s: BarSkuItem) => normalizeCountUnit(currentCountDefinition(s)?.unitLabel ?? s.countUnit ?? "each");
  return normalizeCountUnit(a.countUnit ?? "each") === normalizeCountUnit(b.countUnit ?? "each") && label(a) === label(b);
}

export function mergeFoodCells(source: FoodCell, target: FoodCell): FoodCell {
  const cases = sum(source.cases ?? 0, target.cases ?? 0);
  const packs = sum(source.packs ?? 0, target.packs ?? 0);
  const caseSize = (target.cases ?? 0) > 0 ? target.caseSize : (source.cases ?? 0) > 0 ? source.caseSize : target.caseSize ?? source.caseSize;
  const packSize = (target.packs ?? 0) > 0 ? target.packSize : (source.packs ?? 0) > 0 ? source.packSize : target.packSize ?? source.packSize;
  const keepCases = !(source.cases && target.cases) || source.caseSize === target.caseSize;
  const keepPacks = !(source.packs && target.packs) || source.packSize === target.packSize;
  const qty = roundQty(source.qty + target.qty);
  return { qty, cases: keepCases ? cases : null, caseSize: keepCases ? caseSize : null,
    packs: keepPacks ? packs : null, packSize: keepPacks ? packSize : null,
    units: roundQty(qty - (keepCases ? cases * (caseSize ?? 0) : 0) - (keepPacks ? packs * (packSize ?? 0) : 0)),
    source: "grid", none: qty === 0, raw: appendFoodSource(target.raw, source.raw) };
}

/** Zero-case/pack stamps are editing metadata omitted from wire payloads.
 * Preserve only when the adopted canonical cell still equals the local one;
 * positive remote package answers and restored correction endpoints win. */
export function retainFoodStamps(previous: FoodCell | undefined, adopted: FoodCell, sameWire: boolean, restored: boolean): void {
  if (!previous || !sameWire || restored) return;
  if (adopted.caseSize == null && previous.caseSize != null && !(previous.cases ?? 0)) {
    adopted.cases = previous.cases; adopted.caseSize = previous.caseSize;
  }
  if (adopted.packSize == null && previous.packSize != null && !(previous.packs ?? 0)) {
    adopted.packs = previous.packs; adopted.packSize = previous.packSize;
  }
}

export const foodLineKey = (l: Pick<CountLineInput, "zoneId" | "skuId">) => `${l.zoneId}:${l.skuId}`;
