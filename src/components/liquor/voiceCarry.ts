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

/** A food item can take more words than a bottle ("we have point five of a
 *  case of salsa"). */
export const MAX_HELD_FOOD_WORDS = 16;

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
  const phrases = phrasesOf(text);
  if (!phrases.length) return { head: "", tail: "" };
  let at = phrases.findLastIndex((p) => namesFood(p.text));
  if (at < 0) at = 0;
  while (at > 0 && namesFood(phrases[at - 1]!.text) && !hasNumber(phrases[at - 1]!.text)) at--;
  // A quantity-first phrase may end with punctuation inserted by ASR before
  // the following name. Keep that orphan quantity with the unfinished item;
  // never swallow an earlier phrase that already names a different product.
  let quantityStart = at;
  while (quantityStart > 0 && !namesFood(phrases[quantityStart - 1]!.text)) {
    // A comma separates a name/size/count within one item. A sentence end
    // can strand a quantity before its product; only extend over that end.
    const separator = text.slice(phrases[quantityStart - 1]!.start, phrases[quantityStart]!.start).trim().at(-1);
    if (quantityStart > 1 && !/[.!?]/.test(separator ?? "")) break;
    quantityStart--;
  }
  if (quantityStart < at) {
    // In "Oreos, one case. Zero point seven. Spanish rice", the first
    // quantity finishes Oreos; only the orphan second quantity leads rice.
    const previous = phrases[quantityStart - 1];
    if (previous && namesFood(previous.text) && !hasNumber(previous.text)) quantityStart++;
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
