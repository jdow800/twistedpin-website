/**
 * Carry-forward for pause-cut voice pieces. A counter's rhythm is "Name,
 * quantity." When a piece's last phrase is not a quantity ("…Baileys, two.
 * Frangelico,"), or is a quantity cut off at "point", that phrase waits and
 * leads the next piece, so the bottle meets its number. On 2026-10-02 the
 * counter paused after a bottle's name about as often as after its number: 8 to
 * 11 of 21 pause cuts fell between the two. In the replay, carrying them lifted
 * the pause design from 94 to 102 products right with Deepgram, and from 98 to
 * 107 with Grok (Alcohol Pricing/incidents/2026-10-02/stt-bakeoff).
 *
 * Liquor's rule. Food says "we have five boxes of gloves", product last, so
 * this rhythm would hold back every food phrase; food uses splitFoodTail.
 */
const QUANTITY_WORDS = new Set(
  ("zero oh one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen " +
   "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand point " +
   "half a an and quarter quarters case cases cs bottle bottles can cans each").split(" "),
);

/** Held text longer than this goes out anyway, so a run with no punctuation
 *  can't hold back matching for the rest of the take. */
export const MAX_HELD_WORDS = 12;

const isQuantity = (phrase: string) =>
  phrase.split(/[\s-]+/).filter(Boolean).every((w) => QUANTITY_WORDS.has(w.toLowerCase()) || /^\d*\.?\d+$/.test(w));

/** A comma, or a sentence end that isn't a decimal point ("1.1" stays whole). */
function phrasesOf(text: string): { start: number; text: string }[] {
  const marks = [...text.matchAll(/,|[.!?](?=\s|$)/g)].map((m) => m.index!);
  const bounds = [-1, ...marks, text.length];
  const phrases: { start: number; text: string }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const phrase = text.slice(bounds[i]! + 1, bounds[i + 1]).trim();
    if (phrase) phrases.push({ start: bounds[i]! + 1, text: phrase });
  }
  return phrases;
}

/** Split a piece into what can be matched now (head) and an unfinished last
 *  phrase that should lead the next piece (tail). */
export function splitUnfinished(text: string): { head: string; tail: string } {
  const phrases = phrasesOf(text);
  const last = phrases.at(-1);
  if (!last) return { head: text.trim(), tail: "" };
  let from: number | null = null;
  if (!isQuantity(last.text)) from = last.start;
  else if (/^(point|and|a)$/i.test(last.text.split(/\s+/).at(-1)!)) from = phrases.at(-2)?.start ?? last.start;
  if (from == null) return { head: text.trim(), tail: "" };
  // ASR can punctuate inside a multiword bottle name: "Indigo, gin," or
  // "Casamigos, repo, point". Every adjacent uncounted name phrase belongs
  // in the unfinished tail; emitting the brand alone can invent implicit one
  // before its actual quantity arrives. A prior quantity finishes its item.
  let at = phrases.findIndex((phrase) => phrase.start === from);
  while (at > 0 && !isQuantity(phrases[at - 1]!.text) && !hasNumber(phrases[at - 1]!.text)) at--;
  from = phrases[at]!.start;
  const tail = text.slice(from).trim();
  if (tail.split(/\s+/).length > MAX_HELD_WORDS) return { head: text.trim(), tail: "" };
  return { head: text.slice(0, from).trim(), tail };
}

const NUMBER_WORDS = new Set(
  ("zero oh one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen " +
   "seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand point " +
   "half quarter quarters third thirds dozen couple few").split(" "),
);
/** Words that never name a food product: numbers, packages and filler. When
 *  one is missing here the extension below still keeps the item whole. */
const NOT_A_FOOD_NAME = new Set([
  ...QUANTITY_WORDS,
  ...NUMBER_WORDS,
  ...("bag bags box boxes pack packs packet packets package packages container containers jar jars jug jugs " +
    "tub tubs tray trays sleeve sleeves roll rolls bundle bundles pouch pouches piece pieces pound pounds lb lbs " +
    "ounce ounces oz gallon gallons gal of the we have got there theres is are it its that this these those " +
    "about around roughly maybe like uh um no yes actually so okay ok then plus another more left over " +
    "full open opened partial loose whole extra just only single total all empty none nothing").split(" "),
]);
const wordsOf = (phrase: string) => phrase.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9.]+/).filter(Boolean);
const namesFood = (phrase: string) => wordsOf(phrase).some((w) => /[a-z]/.test(w) && !NOT_A_FOOD_NAME.has(w));
const hasNumber = (phrase: string) => wordsOf(phrase).some((w) => /\d/.test(w) || NUMBER_WORDS.has(w));

// A package size is part of a name, not evidence that this item already has
// its inventory count. Otherwise "24 ounce cups. Point nine. Lids" strands
// the cups and moves their 0.9 onto the next item. Keep liquor's rule separate.
const SIZE_ONES = "(?:one|two|three|four|five|six|seven|eight|nine)";
const SIZE_SMALL = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)";
const SIZE_TENS = `(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -]+${SIZE_ONES})?`;
const SIZE_FRACTION = `(?:[ -]+point(?:[ -]+(?:zero|oh|${SIZE_ONES}))+)?`;
const SIZE_NUMBER = `(?:\\d+(?:\\.\\d+)?|(?:${SIZE_TENS}|${SIZE_SMALL})${SIZE_FRACTION})`;
const SIZE_DESCRIPTION = "(?:(?:clear|plastic|paper|foam|hot|cold|soup|coffee|thin|round|square)[ -]+)*";
const PACKAGE_NAME = "(?:cups?|lids?|bottles?|containers?|bowls?|cans?|jars?|tubs?)";
const DIMENSION_NAME = "(?:flatbreads?|crusts?|pizza|dough|shells?|circles?|plates?|pans?|trays?|liners?)";
const PACKAGE_SIZE = new RegExp(`\\b${SIZE_NUMBER}[ -]*(?:ounces?|oz)\\b(?=[ -]*${SIZE_DESCRIPTION}${PACKAGE_NAME}\\b)`, "gi");
const PACKAGE_SIZE_AFTER_NAME = new RegExp(`(\\b${PACKAGE_NAME}[ -]+${SIZE_DESCRIPTION})${SIZE_NUMBER}[ -]*(?:ounces?|oz)\\b`, "gi");
const FOOD_DIAMETER = new RegExp(`\\b${SIZE_NUMBER}[ -]*(?:inch(?:es)?|in|["″])(?:[ -]*)(?=${SIZE_DESCRIPTION}${DIMENSION_NAME}\\b)`, "gi");
const FOOD_DIAMETER_AFTER_NAME = new RegExp(`(\\b${DIMENSION_NAME}[ -]+${SIZE_DESCRIPTION})${SIZE_NUMBER}[ -]*(?:inch(?:es)?\\b|in\\b|["″])`, "gi");
const FOOD_DIMENSIONS = new RegExp(`\\b${SIZE_NUMBER}\\s*["″]?\\s*(?:x|by)\\s*${SIZE_NUMBER}\\s*(?:inch(?:es)?\\b|in\\b|["″])?`, "gi");
const withoutFoodSize = (phrase: string) => {
  const blank = (text: string) => " ".repeat(text.length);
  // Keep offsets stable so catalog spans can be masked after the existing
  // name-bound size rules have seen the complete phrase.
  let result = phrase.replace(PACKAGE_SIZE, blank).replace(FOOD_DIAMETER, blank)
    .replace(PACKAGE_SIZE_AFTER_NAME, (text, name: string) => name + blank(text.slice(name.length)))
    .replace(FOOD_DIAMETER_AFTER_NAME, (text, name: string) => name + blank(text.slice(name.length)));
  if (new RegExp(`\\b${DIMENSION_NAME}\\b`, "i").test(result)) result = result.replace(FOOD_DIMENSIONS, blank);
  return result;
};

/** A food item can take more words than a bottle ("we have point five of a
 *  case of salsa"). */
export const MAX_HELD_FOOD_WORDS = 16;

type FoodCarryName = { name: string; aliases?: readonly string[] };
const NAME_SMALL = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const NAME_TENS = "zero ten twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const escapeName = (text: string) => text.replace(/[\\^.*+?()[\]{}|$]/g, "\\$&");
function nameNumberWords(n: number): string {
  if (n < 20) return NAME_SMALL[n]!;
  if (n < 100) return NAME_TENS[Math.floor(n / 10)]! + (n % 10 ? " " + NAME_SMALL[n % 10] : "");
  if (n < 1000) return NAME_SMALL[Math.floor(n / 100)]! + " hundred" + (n % 100 ? " " + nameNumberWords(n % 100) : "");
  return nameNumberWords(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + nameNumberWords(n % 1000) : "");
}
function nameTokenPattern(token: string): string {
  if (/^\d+(?:\.\d+)?$/.test(token) && Number(token) < 10000) {
    const [whole, decimal] = token.split(".");
    const words = nameNumberWords(Number(whole)) + (decimal ? " point " + [...decimal].map(d => NAME_SMALL[Number(d)]).join(" ") : "");
    const spoken = words.split(" ").map(escapeName).join("[ -]+").replace(/(hundred|thousand)\[ -\]\+/g, "$1[ -]+(?:and[ -]+)?");
    return "(?:" + escapeName(token) + "|" + spoken + ")";
  }
  const units: Record<string, string> = { oz: "(?:oz|ounces?)", lb: "(?:lb|lbs|pounds?)", gal: "(?:gal|gallons?)",
    inch: '(?:inch(?:es)?|in|["″])', inches: '(?:inch(?:es)?|in|["″])', x: "(?:x|by)",
    '"': '(?:["″]|inch(?:es)?)?', "″": '(?:["″]|inch(?:es)?)?' };
  return units[token] ?? escapeName(token);
}

/** Catalog names bound size numbers, Zero Fat and package-only fragments to
 * their product. Actual counts outside those exact spans remain quantities.
 * Bare generic aliases are omitted; they must not turn a unit into a name. */
export function createFoodCarrySplitter(catalog: readonly FoodCarryName[]): (text: string) => { head: string; tail: string } {
  const patterns = new Set<string>();
  for (const sku of catalog) for (const [i, name] of [sku.name, ...(sku.aliases ?? [])].entries()) {
    const tokens = name.toLowerCase().match(/\d+(?:\.\d+)?(?:\/\d+)?|\p{L}+|["″]/gu) ?? [];
    if (!tokens.some(t => /^\p{L}+$/u.test(t) && !NOT_A_FOOD_NAME.has(t)) || i > 0 && tokens.length < 2) continue;
    patterns.add("(?<![\\p{L}\\p{N}])" + tokens.map(nameTokenPattern).join("[\\s,./()'’\"″-]*") + "(?![\\p{L}\\p{N}])");
  }
  const names = [...patterns].map(p => new RegExp(p, "giu"));
  return text => splitFoodTailWithNames(text, names);
}

/**
 * Food's rule. The product comes before OR after its number ("Bacon bits, one
 * case." / "We have four point two cases of pizza sauce."), so a cut can strand
 * either half. On 2026-10-02 the 20 s clock split "We have 4.2 cases" from
 * "Pizza sauce": one row with no product, one with no number. So the last item
 * always waits: everything from the last phrase that names something, plus any
 * name just before it still waiting for its number ("Bacon bits, full case").
 * A piece that names nothing waits whole.
 */
export function splitFoodTail(text: string): { head: string; tail: string } {
  return splitFoodTailWithNames(text, []);
}
function splitFoodTailWithNames(text: string, names: readonly RegExp[]): { head: string; tail: string } {
  const phrases = phrasesOf(text);
  if (!phrases.length) return { head: "", tail: "" };
  const found = names.flatMap(pattern => [...text.matchAll(pattern)].map(m => ({ start: m.index!, end: m.index! + m[0].length })))
    .sort((a, b) => b.end - b.start - (a.end - a.start));
  const spans: typeof found = [];
  for (const span of found) if (!spans.some(s => span.start < s.end && span.end > s.start)) spans.push(span);
  const parts = phrases.map(p => {
    const start = p.start + (text.slice(p.start).match(/^\s*/)?.[0].length ?? 0), end = start + p.text.length;
    const owned = spans.filter(s => s.start < end && s.end > start);
    const outside = withoutFoodSize(p.text).split("");
    for (const s of owned) for (let i = Math.max(s.start, start) - start; i < Math.min(s.end, end) - start; i++) outside[i] = " ";
    return { named: owned.length > 0 || namesFood(p.text), counted: hasNumber(outside.join("")), owned };
  });
  // A count before/after a multi-comma catalog name finishes the entire name,
  // not just its first fragment ("two Butter, Alternative Liquid, Zero Fat").
  for (const span of spans) {
    const owned = parts.filter(p => p.owned.includes(span));
    if (owned.some(p => p.counted)) for (const part of owned) part.counted = true;
  }
  let at = parts.findLastIndex(p => p.named);
  if (at < 0) at = 0;
  while (at > 0 && parts[at - 1]!.named && !parts[at - 1]!.counted) at--;
  // A quantity-first phrase may end with punctuation inserted by ASR before
  // the following name. Keep that orphan quantity with the unfinished item;
  // never swallow an earlier phrase that already names a different product.
  let quantityStart = at;
  while (quantityStart > 0 && !parts[quantityStart - 1]!.named) {
    // A comma separates a name/size/count within one item. A sentence end
    // can strand a quantity before its product; only extend over that end.
    const separator = text.slice(phrases[quantityStart - 1]!.start, phrases[quantityStart]!.start).trim().at(-1);
    if (quantityStart > 1 && !/[.!?]/.test(separator ?? "")) break;
    quantityStart--;
  }
  if (quantityStart < at) {
    // In "Oreos, one case. Zero point seven. Spanish rice", the first
    // quantity finishes Oreos; only the orphan second quantity leads rice.
    const previous = parts[quantityStart - 1];
    if (previous?.named && !previous.counted) quantityStart++;
    at = Math.min(at, quantityStart);
  }
  const from = phrases[at]!.start;
  const tail = text.slice(from).trim();
  if (tail.split(/\s+/).length > MAX_HELD_FOOD_WORDS) return { head: text.trim(), tail: "" };
  return { head: text.slice(0, from).trim(), tail };
}

/**
 * Feeds pieces through the split rule (liquor's splitUnfinished by default) in
 * SPOKEN order. Transcripts arrive in the order they finish, so a piece waits
 * for the one before it. `send` gets each piece's matchable text under that
 * piece's index; `flush` at Stop sends whatever is left (pieces after a failed
 * one, and the last held phrase).
 */
export function createCarry(
  send: (text: string, index: number) => void,
  split: (text: string) => { head: string; tail: string } = splitUnfinished,
) {
  const waiting = new Map<number, string | null>();
  let next = 0;
  let held = "";
  let hasGaps = false;
  const reset = () => {
    waiting.clear();
    held = "";
    next = 0;
    hasGaps = false;
  };
  const boundary = (index: number) => {
    hasGaps = true;
    // This index has no successful extraction, so it is a distinct destination
    // for the orphan held text, even when the previous piece emitted a head.
    if (held) send(held, index);
    held = "";
  };
  const consume = () => {
    while (waiting.has(next)) {
      const text = waiting.get(next)!;
      waiting.delete(next);
      if (text === null) boundary(next);
      else {
        const { head, tail } = split(`${held} ${text}`.trim());
        held = tail;
        if (head) send(head, next);
      }
      next++;
    }
  };
  return {
    add(text: string, index: number) {
      if (index < next) return;
      waiting.set(index, text);
      consume();
    },
    /** A permanently failed clip advances the queue without joining speech. */
    fail(index: number) {
      if (index < next) return;
      waiting.set(index, null);
      consume();
    },
    /** Stop: partition queued speech at every unreported/failed index. Returns
     * whether any gap was found, so a caller cannot retry the joined transcript. */
    flush(lastIndex: number) {
      for (const index of [...waiting.keys()].sort((a, b) => a - b)) {
        if (index > next) { boundary(next); next = index; }
        consume();
      }
      if (held) send(held, lastIndex);
      const missing = hasGaps;
      reset();
      return missing;
    },
    /** A new take starts at piece 0 with nothing held. */
    reset,
  };
}
