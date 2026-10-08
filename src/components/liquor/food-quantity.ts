import { currentCountDefinition, normalizeCountUnit, type CountDefinitionSku } from "./count-definition";

export interface FoodUnitRatio { numerator: string; denominator: string }
export interface FoodLooseQuantity extends FoodUnitRatio { quantity: string; unit: string }
export interface FoodQuantityBasis { countUnit: string; unitLabel: string | null }
export interface FoodQuantity extends FoodQuantityBasis { version: 1; legacyQtyUnits: string; loose: FoodLooseQuantity[] }
export function foodQuantityBasis(sku: CountDefinitionSku): FoodQuantityBasis { const label = currentCountDefinition(sku)?.unitLabel; return { countUnit: normalizeCountUnit(sku.countUnit ?? "each"), unitLabel: label ? normalizeCountUnit(label) : null }; }
export function sameFoodQuantityBasis(a: FoodQuantityBasis, b: FoodQuantityBasis): boolean { return a.countUnit === b.countUnit && a.unitLabel === b.unitLabel; }
type Fraction = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a || 1n; };
const fraction = (n: bigint, d = 1n): Fraction => { if (!d) throw new Error("Invalid food quantity factor"); if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const add = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
const multiply = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);
export function foodDecimalFraction(value: string | number): Fraction {
  const text = String(value).trim(), match = text.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match || !(match[2] || match[3])) throw new Error("Invalid food quantity");
  const digits = (match[2] || "0") + (match[3] || ""), scale = (match[3]?.length ?? 0) - Number(match[4] || 0);
  if (Math.abs(scale) > 100) throw new Error("Food quantity exceeds supported precision");
  return fraction(BigInt((match[1] === "-" ? "-" : "") + digits) * (scale < 0 ? 10n ** BigInt(-scale) : 1n), scale > 0 ? 10n ** BigInt(scale) : 1n);
}
const numeric = (r: Fraction) => Number(r.n) / Number(r.d);
function decimalText(r: Fraction): string {
  let scale = 0, denominator = r.d;
  while (denominator % 2n === 0n) { denominator /= 2n; scale++; }
  let fives = 0;
  while (denominator % 5n === 0n) { denominator /= 5n; fives++; }
  scale = Math.max(scale, fives);
  if (denominator !== 1n) throw new Error("Food amount must be a decimal");
  const value = r.n * (10n ** BigInt(scale)) / r.d, negative = value < 0n;
  const digits = String(negative ? -value : value).padStart(scale + 1, "0");
  const text = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/0+$/, "").replace(/\.$/, "") : digits;
  return (negative ? "-" : "") + text;
}
export function foodRatio(value: string | number): FoodUnitRatio { const r = foodDecimalFraction(value); return { numerator: String(r.n), denominator: String(r.d) }; }
function looseFraction(q: FoodQuantity): Fraction { return q.loose.reduce((sum, part) => add(sum, multiply(foodDecimalFraction(part.quantity), fraction(BigInt(part.numerator), BigInt(part.denominator)))), foodDecimalFraction(q.legacyQtyUnits)); }
export const foodLooseQty = (q: FoodQuantity): number => numeric(looseFraction(q));

/** Arithmetic precision is independent of the deliberately short display. */
export const preciseFoodQty = (value: number): number => Number(value.toPrecision(15));
export function foodCanonicalQty(c: { cases: number | null; caseSize: number | null; packs?: number | null; packSize?: number | null; units: number | null; foodQuantity?: FoodQuantity }): number {
  const loose = c.foodQuantity ? looseFraction(c.foodQuantity) : foodDecimalFraction(c.units ?? 0);
  const cases = multiply(foodDecimalFraction(c.cases ?? 0), foodDecimalFraction(c.caseSize ?? 0));
  const packs = multiply(foodDecimalFraction(c.packs ?? 0), foodDecimalFraction(c.packSize ?? 0));
  return numeric(add(add(loose, cases), packs));
}
export function legacyFoodQuantity(units: number | string, basis: FoodQuantityBasis): FoodQuantity { return { version: 1, countUnit: basis.countUnit, unitLabel: basis.unitLabel, legacyQtyUnits: String(units), loose: [] }; }
export function storedFoodQuantity(qty: string | number, cases: string | number | null, caseSize: number | null, packs: string | number | null, packSize: number | null, basis: FoodQuantityBasis): FoodQuantity {
  const casePart = multiply(foodDecimalFraction(cases ?? 0), foodDecimalFraction(caseSize ?? 0));
  const packPart = multiply(foodDecimalFraction(packs ?? 0), foodDecimalFraction(packSize ?? 0));
  const residual = add(add(foodDecimalFraction(qty), fraction(-casePart.n, casePart.d)), fraction(-packPart.n, packPart.d));
  return legacyFoodQuantity(decimalText(residual), basis);
}
export function physicalFoodQuantity(quantity: number, unit: string, multiplier: number, ratios: Record<string, FoodUnitRatio> | undefined, basis: FoodQuantityBasis): FoodQuantity {
  const normalized = normalizeCountUnit(unit), approved = ratios?.[normalized];
  // A manual conversion has no right to borrow a catalog factor. Exact ratios
  // apply only to the same conversion the resolved review actually used.
  const ratio = approved && Math.abs(numeric(fraction(BigInt(approved.numerator), BigInt(approved.denominator))) - multiplier) <= Math.max(1, Math.abs(multiplier)) * 1e-12 ? approved : null;
  // A reviewed custom size still counts, but cannot claim to be an approved
  // catalog conversion. Keep its precise canonical residual and source text.
  if (!ratio) return legacyFoodQuantity(preciseFoodQty(quantity * multiplier), basis);
  return { version: 1, countUnit: basis.countUnit, unitLabel: basis.unitLabel, legacyQtyUnits: "0", loose: [{ quantity: String(quantity), unit: normalized, ...ratio }] };
}
export function mergeFoodQuantity(a: FoodQuantity, b: FoodQuantity): FoodQuantity {
  if (!sameFoodQuantityBasis(a, b)) throw new Error("The product's counting unit changed. Clear and recount this amount.");
  const legacy = decimalText(add(foodDecimalFraction(a.legacyQtyUnits), foodDecimalFraction(b.legacyQtyUnits)));
  const loose: FoodLooseQuantity[] = [];
  for (const part of [...a.loose, ...b.loose]) {
    const r = fraction(BigInt(part.numerator), BigInt(part.denominator)), unit = normalizeCountUnit(part.unit);
    const same = loose.find(p => p.unit === unit && p.numerator === String(r.n) && p.denominator === String(r.d));
    if (same) same.quantity = decimalText(add(foodDecimalFraction(same.quantity), foodDecimalFraction(part.quantity)));
    else loose.push({ quantity: part.quantity, unit, numerator: String(r.n), denominator: String(r.d) });
  }
  return { version: 1, countUnit: a.countUnit, unitLabel: a.unitLabel, legacyQtyUnits: String(legacy), loose };
}
export function foodQuantityKey(q: FoodQuantity | null | undefined): string | null {
  if (!q) return null;
  const normalized = mergeFoodQuantity(legacyFoodQuantity(0, q), q);
  normalized.loose.sort((a, b) => `${a.unit}:${a.numerator}/${a.denominator}`.localeCompare(`${b.unit}:${b.numerator}/${b.denominator}`));
  return JSON.stringify(normalized);
}
export function singleFoodLoose(q: FoodQuantity | undefined): FoodLooseQuantity | null { return q && foodDecimalFraction(q.legacyQtyUnits).n === 0n && q.loose.length === 1 ? q.loose[0]! : null; }
export function replaceFoodLoose(q: FoodQuantity, index: number, quantity: number): FoodQuantity { return { ...q, loose: q.loose.map((part, i) => i === index ? { ...part, quantity: String(quantity) } : part) }; }
export function foodPhysicalUnit(part: FoodLooseQuantity, plural = true): string {
  const unit = part.unit;
  if (!plural || Number(part.quantity) === 1) return unit;
  if (["lb", "oz", "gal", "each", "floz"].includes(unit)) return unit;
  return unit === "loaf" ? "loaves" : unit.endsWith("s") ? unit : unit + "s";
}
