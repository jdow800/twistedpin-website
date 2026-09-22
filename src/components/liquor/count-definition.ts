/** A human-confirmed vocabulary bound to the SKU's current physical count unit. */
export interface CountDefinition {
  countUnit: string;
  unitsPerCase: number | null;
  unitLabel?: string;
  spokenUnits?: Record<string, number>;
  usualMaxCases?: number;
  confirmedBy: string;
  confirmedAt: string;
}
export interface CountDefinitionSku {
  countUnit?: string | null;
  unitsPerCase?: number | null;
  countDefinition?: CountDefinition | null;
}
export function currentCountDefinition(sku: CountDefinitionSku | undefined): CountDefinition | null {
  const d = sku?.countDefinition;
  if (!d || d.countUnit !== sku?.countUnit || d.unitsPerCase !== (sku?.unitsPerCase ?? null)) return null;
  if (d.spokenUnits && Object.values(d.spokenUnits).some(n => !Number.isFinite(n) || n <= 0)) return null;
  if (d.usualMaxCases != null && (!Number.isFinite(d.usualMaxCases) || d.usualMaxCases <= 0)) return null;
  return d;
}
export function normalizeCountUnit(unit: string): string {
  const raw = unit.trim().toLowerCase();
  const aliases: Record<string, string> = {
    bottles: "bottle", cans: "can", jars: "jar", containers: "container", bags: "bag",
    packs: "pack", packets: "packet", boxes: "box", sacks: "sack", cases: "case",
    pounds: "lb", pound: "lb", lbs: "lb", gallons: "gal", gallon: "gal", ea: "each",
    buns: "bun", pieces: "piece", plates: "plate", sleeves: "sleeve",
  };
  return aliases[raw] ?? raw;
}
export function definedUnitMultiplier(sku: CountDefinitionSku | undefined, unit: string | null): number | null {
  if (!unit) return null;
  return currentCountDefinition(sku)?.spokenUnits?.[normalizeCountUnit(unit)] ?? null;
}
