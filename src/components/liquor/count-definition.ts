/** A human-confirmed vocabulary bound to the SKU's current physical count unit. */
export interface CountDefinition {
  countUnit: string;
  unitsPerCase: number | null;
  unitLabel?: string;
  spokenUnits?: Record<string, number>;
  /** Only a human can choose what a unitless spoken count means. */
  defaultSpokenUnit?: string;
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
  if (d.defaultSpokenUnit && d.spokenUnits?.[normalizeCountUnit(d.defaultSpokenUnit)] == null) return null;
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
    bunches: "bunch", pouches: "pouch", heads: "head", trays: "tray",
    jugs: "jug", tubs: "tub", rolls: "roll", packages: "package",
    circles: "circle", flatbreads: "flatbread", crusts: "crust", wraps: "wrap",
  };
  return aliases[raw] ?? raw;
}
export function definedUnitMultiplier(sku: CountDefinitionSku | undefined, unit: string | null): number | null {
  const definition = currentCountDefinition(sku);
  const inputUnit = unit ?? definition?.defaultSpokenUnit;
  if (!inputUnit) return null;
  const normalized = normalizeCountUnit(inputUnit);
  const explicit = definition?.spokenUnits?.[normalized];
  if (explicit != null) return explicit;
  // The confirmed label names ONE canonical count unit. Keep explicit package
  // vocabulary authoritative: a packet can still mean a case of pizza circles.
  return definition?.unitLabel && normalized === normalizeCountUnit(definition.unitLabel) ? 1 : null;
}
