// Reads the pour a GoTab option label states: "Tanqueray 2oz" → 2 oz.
//
// MIRRORS parsePourLabel() in TPRS apps/backend/src/bar/gotab-sales.ts, which
// reads the same labels when it works out what each sale should have poured.
// Keep the two in step: a change to one is a change to both. The QA harness's
// check-pour-label.mjs compares them label by label.

export interface ParsedPour {
  label: string; // original option label
  bottleText: string; // label minus the size fragment — the thing to match to bar_sku
  oz: number | null; // parsed pour size, null when the label names no single clear oz
}

/**
 * "Tito's (W) (1.5oz)"           → { bottleText: "Tito's (W)", oz: 1.5 }
 * "Prosecco (2oz pour)"          → { bottleText: "Prosecco", oz: 2 }
 * "Carp Sweet Vermouth (.5oz)"   → { bottleText: "Carp Sweet Vermouth", oz: 0.5 }
 * "1oz Well Vodka"               → { bottleText: "Well Vodka", oz: 1 }
 * "Red Bull"                     → { bottleText: "Red Bull", oz: null }  (not a pour)
 * "Tito's 1/2 oz", "Tito's 1-2 oz", "Tito's 1 oz + 2 oz" → oz: null (no single pour)
 *
 * The number pattern MUST allow a bare leading dot: ".5oz" is a real POS label
 * and a digit-first regex reads it as FIVE oz.
 */
const OZ_NUM = "(?:\\d*\\.\\d+|\\d+)"; // "1.5" | ".5" | "2"
const OZ_UNIT = "(?:oz|ounces?)\\b";
const OZ_AMOUNT = `${OZ_NUM}\\s*(?:-\\s*)?${OZ_UNIT}`;
export function parsePourLabel(label: string): ParsedPour {
  const matches = [...label.matchAll(new RegExp(`(?<![\\d./])(${OZ_NUM})\\s*(?:-\\s*)?${OZ_UNIT}`, "gi"))];
  const candidate = matches.length === 1 ? matches[0] : undefined;
  // A range, fraction, or multiple measures needs review, never the final
  // number interpreted as the whole pour ("1/2 oz" must not become 2 oz).
  const m = candidate && !/[\d.]\s*[-–—/]\s*$/.test(label.slice(0, candidate.index)) &&
    Number(candidate[1]) > 0 ? candidate : undefined;
  const oz = m ? Number(m[1]) : null;
  let bottleText = label;
  if (m) {
    bottleText = bottleText
      .replace(new RegExp(`\\(\\s*${OZ_AMOUNT}[^)]*\\)`, "i"), " ")
      .replace(new RegExp(`${OZ_AMOUNT}(\\s+pour)?`, "i"), " ");
  }
  bottleText = bottleText.replace(/\s+/g, " ").trim().replace(/^[-–—:,]+|[-–—:,]+$/g, "").trim();
  return { label, bottleText: bottleText || label.trim(), oz };
}
