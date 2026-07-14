// Client-side voice → SKU matcher + spoken-quantity parser. The "no-LLM happy
// path" for voice count entry: staff say "Tito's four" / "Grey Goose two point
// five" / "Jameson half"; we fuzzy-match the brand to a catalog SKU (symmetric
// Jaccard over name tokens, mirroring the backend invoice-reconcile matcher) and
// parse the number. Always a SUGGESTION the staffer confirms — never silently
// applied — so a mis-hear can't write a wrong count.

import type { BarSkuItem } from "./api";

// Category/filler words that carry no brand identity — dropped from both sides
// before scoring so "Casamigos Reposado" and a spoken "casamigos" still align.
// Superset of the backend NOISE plus spoken quantity/filler words.
const NOISE = new Set([
  "tequila", "teq", "vodka", "rum", "gin", "whiskey", "whisky", "bourbon", "bbn",
  "scotch", "cognac", "liqueur", "spirits", "mixers", "llc", "inc", "the",
  "bottle", "bottles", "full", "of", "and", "a", "an", "point", "decimal",
  "half", "quarter", "quarters", "third", "thirds",
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty",
  "fifty", "sixty", "seventy", "eighty", "ninety",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NOISE.has(t) && !/^\d+$/.test(t));
}

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const FRACTIONS: Record<string, number> = {
  half: 0.5, quarter: 0.25, quarters: 0.25, third: 1 / 3, thirds: 1 / 3,
};

/**
 * Parse a spoken/typed quantity from a transcript. Handles digits ("4", "2.5"),
 * number words ("four", "twenty four"), decimals ("four point five"), and
 * fractions ("half", "three and a half", "a quarter"). Returns null if none.
 * Additive by design — bar counts are single small numbers, not multi-digit
 * sequences, so "twenty four" → 24 and stray words don't compound.
 */
export function parseQuantity(text: string): number | null {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  let whole: number | null = null;
  let frac = 0;
  let sawPoint = false;
  let decimals = "";
  for (const w of words) {
    if (!w) continue;
    if (/^\d+(\.\d+)?$/.test(w)) {
      whole = (whole ?? 0) + parseFloat(w);
    } else if (w === "point" || w === "decimal") {
      sawPoint = true;
    } else if (w in ONES) {
      if (sawPoint) decimals += String(ONES[w]);
      else whole = (whole ?? 0) + ONES[w]!;
    } else if (w in TENS) {
      whole = (whole ?? 0) + TENS[w]!;
    } else if (w in FRACTIONS) {
      frac += FRACTIONS[w]!;
    }
    // "a"/"and"/"an"/other words are ignored
  }
  if (sawPoint && decimals) whole = (whole ?? 0) + parseFloat("0." + decimals);
  if (whole === null && frac === 0) return null;
  return Math.round(((whole ?? 0) + frac) * 1000) / 1000;
}

export interface SkuCandidate {
  sku: BarSkuItem;
  score: number;
}

/** Rank catalog SKUs against a spoken brand phrase. Returns the top few (with the
 *  number words already stripped by tokenize) so the UI can pre-select #1 and
 *  offer alternatives for a confirm. Empty when nothing meaningful was heard. */
export function matchSkus(transcript: string, catalog: BarSkuItem[], limit = 4): SkuCandidate[] {
  const desc = new Set(tokenize(transcript));
  if (desc.size === 0) return [];
  const scored: SkuCandidate[] = [];
  for (const sku of catalog) {
    const name = new Set(tokenize(sku.name));
    if (name.size === 0) continue;
    let inter = 0;
    for (const t of name) if (desc.has(t)) inter++;
    if (inter === 0) continue;
    const union = new Set([...name, ...desc]).size;
    const j = inter / union;
    scored.push({ sku, score: Math.round(j * 100) / 100 });
  }
  scored.sort((a, b) => b.score - a.score);
  // Keep only real candidates (a single shared generic token is weak).
  return scored.filter((c) => c.score >= 0.2).slice(0, limit);
}

/** Best-effort parse of a full "brand + number" utterance for the count grid. */
export function parseCountUtterance(
  transcript: string,
  catalog: BarSkuItem[],
): { candidates: SkuCandidate[]; qty: number | null; transcript: string } {
  return {
    candidates: matchSkus(transcript, catalog),
    qty: parseQuantity(transcript),
    transcript: transcript.trim(),
  };
}
