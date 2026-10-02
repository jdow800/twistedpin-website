import type { VoiceExtractItem } from "./api";

/**
 * Checks on the liquor voice review sheet, from the 2026-10-02 count and its
 * replay (Alcohol Pricing/incidents/2026-10-02/stt-bakeoff).
 */

/** A number that is part of a bottle's name ("Seagram's 7", "Dewar's 12 Year",
 *  "Tanqueray No. Ten", "Don Julio 1942"), not its size ("750ml", "1L", "5oz").
 *  A spelled number counts only after "No."/"Number", so "Ketel One" has none. */
export function nameNumbers(name: string): number[] {
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const out: number[] = [];
  for (const m of name.matchAll(/\b(\d+(?:\.\d+)?)(?!\s*(?:ml|l|lt|ltr|liters?|litres?|oz|g|pk|packs?|ct)\b)\b/gi)) out.push(Number(m[1]));
  for (const m of name.toLowerCase().matchAll(/\b(?:no\.?|number|#)\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g)) {
    out.push(words[m[1]!]!);
  }
  return out;
}

export type NameCheck = { n: number; alt: number | null };

/**
 * "Seagram's, seven point nine" reached the matcher as 7.9 bottles. The 7 is
 * the name and 0.9 the count. "Dewar's twelve, one" read as 12. When the loose
 * count equals the bottle's name number, or starts with it, the row asks before
 * it can be added. `alt` is the count with the name taken out (7.9 → 0.9), or
 * null when nothing is left to offer (12 → ask).
 */
export function nameNumberCheck(units: number, cases: number, skuName: string | null | undefined): NameCheck | null {
  if (!skuName || cases > 0 || units < 1) return null;
  for (const n of nameNumbers(skuName)) {
    if (units === n) return { n, alt: null };
    if (Math.floor(units) === n) return { n, alt: Math.round((units - n) * 100) / 100 };
  }
  return null;
}

/**
 * Jon, 2026-10-02: the same bottle said back to back is a correction. The
 * server merges repeats inside one piece; this merges the pair that a piece
 * boundary separated (the last row of one piece, the first of the next). The
 * later quantity wins and both phrases stay visible. A case row next to a
 * loose-only row adds ("a case … and two").
 */
export function mergeAdjacentRepeats(items: VoiceExtractItem[]): VoiceExtractItem[] {
  const out: VoiceExtractItem[] = [];
  for (const it of items) {
    const prev = out.at(-1);
    if (!prev || !it.match || prev.match?.id !== it.match.id) {
      out.push(it);
      continue;
    }
    const caseOnly = (x: VoiceExtractItem) => x.cases > 0 && x.units === 0;
    const looseOnly = (x: VoiceExtractItem) => x.cases === 0;
    const spoken = `${prev.spoken} … ${it.spoken}`;
    out[out.length - 1] = (caseOnly(prev) && looseOnly(it)) || (looseOnly(prev) && caseOnly(it))
      ? { ...it, spoken, cases: prev.cases + it.cases, units: prev.units + it.units, qty: prev.qty + it.qty,
          needsCaseSize: prev.needsCaseSize || it.needsCaseSize }
      : { ...it, spoken };
  }
  return out;
}
