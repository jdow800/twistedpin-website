import type { LineEditedBy, QuantityHeard, VoiceExtractItem } from "./api";
import { personEdited, sourceRefsOf } from "./lineEvents";
import { formatQty } from "./quantity";

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
    const caseAndLoose = (caseOnly(prev) && looseOnly(it)) || (looseOnly(prev) && caseOnly(it));
    const proved = (x: VoiceExtractItem) => x.quantityKnown !== false && !x.quantityNeedsReview;
    // Match the API's source-owner boundary. A held component stays separate
    // so its independently proved neighbor can be applied. A reused source
    // row must not replace the valid occurrence as a same-unit correction.
    if (caseAndLoose && (!proved(prev) || !proved(it)) ||
      prev.quantityReviewReason === "source_already_used" || it.quantityReviewReason === "source_already_used") {
      out.push(it);
      continue;
    }
    const spoken = `${prev.spoken} … ${it.spoken}`;
    // Both server rows stay findable from the merged one (TPRS 0226 retention).
    const refs = [...sourceRefsOf(prev), ...sourceRefsOf(it)];
    const { sourceRef: _ref, ...later } = it;
    out[out.length - 1] = caseAndLoose
      ? { ...later, spoken, cases: prev.cases + it.cases, units: prev.units + it.units, qty: prev.qty + it.qty,
          needsCaseSize: prev.needsCaseSize || it.needsCaseSize,
          ...((prev.quantityNeedsReview || it.quantityNeedsReview) ? { quantityNeedsReview: true } : {}),
          ...((prev.quantityWords || it.quantityWords) ? { quantityWords: [prev.quantityWords, it.quantityWords].filter(Boolean).join(" + ") } : {}),
          ...(refs.length ? { sourceRefs: refs } : {}) }
      : { ...later, spoken, ...(refs.length ? { sourceRefs: refs } : {}) };
  }
  return out;
}

export type CountHistory = { maxCount: number | null; maxDelivery: number | null; days: number };
export type HighCheck = { total: number; maxCount: number | null; maxDelivery: number | null; days: number };

/**
 * A total far above anything this bottle has been counted at or delivered in
 * (TPRS bar-count-history.ts, 90 days) asks before it can be added. On
 * 2026-10-02 a heard "48" became 48 cases of tonic, 1,152 cans, against a
 * record of 72. "Far above" is more than three times the record and at least
 * a case (or six bottles) over it, so a slow bottle's new case doesn't ask.
 * `total` is the whole venue: this row, the shelves already counted, and
 * earlier rows of the same take. A bottle with no history never asks.
 */
export function historyCheck(rowQty: number, otherQty: number, history: CountHistory | null | undefined,
  unitsPerCase: number | null | undefined): HighCheck | null {
  if (!history || rowQty <= 0) return null;
  const record = Math.max(history.maxCount ?? 0, history.maxDelivery ?? 0);
  const total = Math.round((rowQty + otherQty) * 100) / 100;
  if (record <= 0 || total <= 3 * record || total - record < Math.max(6, unitsPerCase ?? 6)) return null;
  return { total, maxCount: history.maxCount, maxDelivery: history.maxDelivery, days: history.days };
}

type Sized = { name: string; sizeMl?: number | null };
const brandOf = (name: string) => name.toLowerCase().replace(/['’]/g, "").match(/[a-z]+/)?.[0];

/**
 * The API holds a lone number that may be the bottle's size, not a count
 * ("Ketel One 0.75", "Tanqueray 750", "Elijah Craig 1.75") and asks for both
 * (tprs liquor-voice-quantity possibleBareSize). Its DTO sends no reason, so
 * the review mirrors the rule: one numeric word equal to a size of this brand
 * (the row's bottles, or a catalog bottle sharing their first word), in ml or
 * as liters with a decimal point. Such a number is never prefilled.
 */
export function possibleBareSize(quantityWords: string | undefined, bottles: Sized[], catalog: Sized[] = []): boolean {
  const words = (quantityWords ?? "").toLowerCase().match(/-?(?:\d+(?:\.\d+)?|\.\d+)|[a-z]+|\p{N}|[/\-+$£€%]/gu) ?? [];
  const word = words.length === 1 ? words[0]! : "";
  if (!/^\d+(?:\.\d+)?$/.test(word)) return false;
  const n = Number(word);
  const brands = new Set(bottles.map((b) => brandOf(b.name)));
  return [...bottles, ...catalog.filter((s) => brands.has(brandOf(s.name)))].some(({ sizeMl: ml }) =>
    ml != null && (ml === n || (word.includes(".") && ml === Math.round(n * 1000))));
}

/**
 * A held row whose excerpt is part of another row of the same bottle in this
 * take ("Captain Morgan" beside "Captain Morgan, one case and two bottles"),
 * or repeats an earlier row word for word, may be the same spoken source.
 * The API marks that source_already_used only when the other row was proved
 * and came first. Prefilling it could count the bottle twice.
 */
export function repeatedSources(items: VoiceExtractItem[]): boolean[] {
  const words = (s: string) => ` ${s.toLowerCase().replace(/['’]/g, "").match(/[a-z0-9]+(?:\.\d+)?/g)?.join(" ") ?? ""} `;
  return items.map((it, i) => it.quantityNeedsReview === true && !it.quantityReviewReason && !!it.match &&
    items.some((other, j) => j !== i && other.match?.id === it.match!.id && words(other.spoken).includes(words(it.spoken)) &&
      (j < i || words(other.spoken) !== words(it.spoken))));
}

/**
 * The Amaretto fixes (2026-10-16 count review, Jon's fix 3). "Luxardo Amaretto
 * di Serradura, two cases" asked for a case size, the row was removed, and a
 * bare re-say of the name got the model's no-number default of 1. A removed
 * row's spoken number is now remembered for its shelf and bottle, and a later
 * bare re-say there OFFERS it back as chips. Nothing here changes a number,
 * adds a hold or asks a question: the re-said row keeps its own number, amber
 * edge and ready state until the counter taps a chip (Jon 10/9).
 */

/** A removed review row's number, remembered for this session. */
export type SetAside = {
  zoneId: string;
  skuId: string;
  cases: number;
  units: number;
  unitsPerCase: number | null;
  quantityWords: string;
  spoken: string;
};
export type RestoreChip = { label: string; cases: number; units: number };
export type RestoreOffer = { hint: string; chips: RestoreChip[] };

/** The memory is keyed by the take's shelf and the bottle. */
export const setAsideKey = (zoneId: string, skuId: string) => `${zoneId}:${skuId}`;

type AsideRow = {
  chosenSkuId: string | null;
  quantityWords?: string;
  cases: number;
  units: number;
  unitsPerCase: number | null;
  spoken: string;
  quantityReviewReason?: string;
  keepBlank?: boolean;
};

/**
 * What ✕ or Discard remembers for one row: only a matched row with spoken
 * number words and a number above zero. A number the review refused to
 * prefill (a reused source or another row's copy, a possible bottle size) is
 * not remembered, so it can never come back as an offer.
 */
export function setAsideEntry(row: AsideRow, zoneId: string): SetAside | null {
  const quantityWords = (row.quantityWords ?? "").trim();
  if (!row.chosenSkuId || !quantityWords || !(row.cases + row.units > 0)) return null;
  if (row.quantityReviewReason || row.keepBlank) return null;
  return { zoneId, skuId: row.chosenSkuId, cases: row.cases, units: row.units, unitsPerCase: row.unitsPerCase,
    quantityWords, spoken: row.spoken };
}

/** Nothing was said for this bottle: the server read it as a bare name. */
const bareName = (heard: QuantityHeard | undefined) => heard === "implicit_one" || heard === "guessed";
/** No number words on the row. A client seam merge ("Belvedere, a case" |
 *  "Belvedere", mergeAdjacentRepeats) takes the later piece's label but keeps
 *  the earlier words, so the label alone can call a spoken case count bare. */
const noWords = (words: string | undefined) => !(words ?? "").trim();
const noun = (n: number, one: string, many: string) => `${formatQty(n)} ${n === 1 ? one : many}`;

/**
 * The offer on a re-said bottle: only a row with no number heard for it
 * (implicit_one or guessed, and no number words), of the same bottle,
 * recorded on the same shelf as the remembered row. Chips only; each carries
 * the cases and units a tap fills in. A remembered "two cases" of a bottle
 * with no case size offers both readings, and only the "2 cases" tap leads to
 * the case question.
 */
export function restoreOffer(row: { chosenSkuId: string | null; quantityHeard?: QuantityHeard; quantityWords?: string },
  zoneId: string, memory: ReadonlyMap<string, SetAside>): RestoreOffer | null {
  if (!row.chosenSkuId || !bareName(row.quantityHeard) || !noWords(row.quantityWords)) return null;
  const e = memory.get(setAsideKey(zoneId, row.chosenSkuId));
  if (!e || e.zoneId !== zoneId || e.skuId !== row.chosenSkuId) return null;
  let chips: RestoreChip[];
  if (e.cases > 0 && e.unitsPerCase == null) {
    chips = e.units === 0
      ? [{ label: `Use ${noun(e.cases, "bottle", "bottles")}`, cases: 0, units: e.cases },
          { label: noun(e.cases, "case", "cases"), cases: e.cases, units: 0 }]
      // Cases and loose bottles were both said: the cases reading only.
      : [{ label: `${noun(e.cases, "case", "cases")} + ${formatQty(e.units)}`, cases: e.cases, units: e.units }];
  } else if (e.cases > 0) {
    chips = [{ label: `Use ${formatQty(e.cases * e.unitsPerCase! + e.units)}`, cases: e.cases, units: e.units }];
  } else {
    chips = [{ label: `Use ${formatQty(e.units)}`, cases: 0, units: e.units }];
  }
  return { hint: `Heard "${e.quantityWords}" earlier.`, chips };
}

/**
 * The earlier-take answers a re-said bottle gets, in button order, judged on
 * ALL of the take's rows of that bottle. Keep (the earlier count stands) only
 * when nothing gave the bottle a number this time: every row is a bare name
 * (label implicit_one or guessed, no number words) that nobody answered.
 * applyReview's Keep skips every row of the bottle in the take, so a single
 * row with a spoken, typed or restored number would otherwise be dropped.
 */
export function restateChoices(rows: ReadonlyArray<{ quantityHeard?: QuantityHeard; quantityWords?: string; editedBy?: LineEditedBy }>):
  Array<"keep" | "replace" | "add"> {
  const bare = rows.length > 0 && rows.every((r) => bareName(r.quantityHeard) && noWords(r.quantityWords) && !personEdited(r.editedBy));
  return bare ? ["keep", "replace", "add"] : ["replace", "add"];
}
