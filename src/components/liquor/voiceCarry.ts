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

/** A phrase that opens with its own count: "Point seven Casamigos Blanco",
 *  "Two bottles of Barsol". A bare whole number may be the name or a size
 *  ("Four Roses", "1800 Reposado", "One liter Tito's"), so it is not. */
function opensWithCount(phrase: string): boolean {
  const words = phrase.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const at = words.findIndex((w) => !QUANTITY_WORDS.has(w) && !/^\d*\.?\d+$/.test(w));
  return at > 0 && words.slice(0, at).some((w) => /^(?:point|bottles?|cases?|cs|cans?)$/.test(w) || /\./.test(w));
}

/**
 * Count-first speech: "One case, Morgan. Two bottles, Don Julio Anejo." A pure
 * count at phrase i leads the NEXT name only when it starts a sentence and the
 * item before it already has its count (a finished "Name, two.", a phrase that
 * opened with its count, or a name led by "One case,"). After "Name, number"
 * the number finishes that name; 341efa1 broke that and was reverted (10/9).
 */
function leadsNextName(text: string, phrases: { start: number; text: string }[], i: number): boolean {
  const mark = (k: number) => (k > 0 ? text[phrases[k]!.start - 1] : ".");
  if (!isQuantity(phrases[i]!.text) || !/[.!?]/.test(mark(i))) return false;
  if (i === 0) return true;
  const before = phrases[i - 1]!.text;
  if (isQuantity(before) || opensWithCount(before)) return true;
  if (hasNumber(before)) return false;
  let k = i - 1;
  while (k > 0 && mark(k) === "," && !isQuantity(phrases[k - 1]!.text) && !hasNumber(phrases[k - 1]!.text)) k--;
  return k > 0 && mark(k) === "," && isQuantity(phrases[k - 1]!.text) && /[.!?]/.test(mark(k - 1));
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
  // "Captain Morgan, two. Two bottles," then "Don Julio Anejo.": the count
  // waits for its name. Its own item is already counted, so nothing extends.
  else if (/,\s*$/.test(text) && leadsNextName(text, phrases, phrases.length - 1)) return cut(text, last.start);
  if (from == null) return { head: text.trim(), tail: "" };
  // ASR can punctuate inside a multiword bottle name: "Indigo, gin," or
  // "Casamigos, repo, point". Every adjacent uncounted name phrase belongs
  // in the unfinished tail; emitting the brand alone can invent implicit one
  // before its actual quantity arrives. A prior quantity finishes its item.
  let at = phrases.findIndex((phrase) => phrase.start === from);
  while (at > 0 && !isQuantity(phrases[at - 1]!.text) && !hasNumber(phrases[at - 1]!.text)) at--;
  // "One bottle, Don Julio Anejo." The leading count stays with its name.
  if (at > 0 && !isQuantity(phrases[at]!.text) && text[phrases[at]!.start - 1] === "," && leadsNextName(text, phrases, at - 1)) at--;
  return cut(text, phrases[at]!.start);
}

function cut(text: string, from: number): { head: string; tail: string } {
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
 *  one is missing here the extension below still keeps the item whole.
 *  Correction and greeting words (sorry, wait, I mean, make that, alright,
 *  hello) are here so "Sorry. Half a case." reads as a count, not a product;
 *  the correction rule below then keeps it with the item it corrects. */
const NOT_A_FOOD_NAME = new Set([
  ...QUANTITY_WORDS,
  ...NUMBER_WORDS,
  ...("bag bags box boxes pack packs packet packets package packages container containers jar jars jug jugs " +
    "tub tubs tray trays sleeve sleeves roll rolls bundle bundles pouch pouches piece pieces pound pounds lb lbs " +
    "ounce ounces oz gallon gallons gal of the we have got there theres is are it its that this these those " +
    "about around roughly maybe like uh um no yes actually so okay ok then plus another more left over " +
    "full open opened partial loose whole extra just only single total all empty none nothing " +
    "alright right hello hey sorry wait oh nope nah mean meant make scratch correction i").split(" "),
]);
const wordsOf = (phrase: string) => phrase.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9.]+/).filter(Boolean);
const namesFood = (phrase: string) => wordsOf(phrase).some((w) => /[a-z]/.test(w) && !NOT_A_FOOD_NAME.has(w));
const hasNumber = (phrase: string) => wordsOf(phrase).some((w) => /\d/.test(w) || NUMBER_WORDS.has(w));
/** A phrase that takes back the count just said: "No. Half of a case.",
 *  "Sorry, three", "Make that two", "No wait". A bare "Oh" only when nothing
 *  follows it, since "oh" is also a spoken zero ("one point oh five"). */
const CORRECTION_LEAD = /^(?:no|nope|nah|actually|sorry|wait|hold on|i mean|i meant|make (?:that|it)|scratch that|correction|oh(?=[\s!.?]*$|\s+(?:no|wait|sorry|actually)\b))\b/i;
/** A request that opens with a conjunction ("and one Diet Pepsi.") reads, to
 *  the server, as the remainder of an item it never saw. */
const CONJUNCTION_LEAD = /^(?:and|plus|also)\b/i;

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
// A size said as an adjective inside a product name: "Two ounce patties",
// "Third pound patties", "Thirty three gallon trash bags". Singular units only,
// and only when a product word follows: "five pounds", "twenty four ounces of
// milk" and "five pound bags" stay counts. (S19, 2026-10-09 food review: the
// patties' own size read as a finished count, so "half a case" moved on.)
const SIZE_PART = "(?:(?:a|one)[ -]+)?(?:half|third|quarter)";
const NAME_SIZE = new RegExp(`\\b(?:${SIZE_NUMBER}|${SIZE_PART})(?:[ -]+and[ -]+a[ -]+half)?[ -]*(?:ounce|oz|pound|lb|inch|gallon|gal|quart|qt)\\b(?=[ -]+([a-z]+))`, "gi");
const withoutFoodSize = (phrase: string) => {
  const blank = (text: string) => " ".repeat(text.length);
  // Keep offsets stable so catalog spans can be masked after the existing
  // name-bound size rules have seen the complete phrase.
  let result = phrase.replace(PACKAGE_SIZE, blank).replace(FOOD_DIAMETER, blank)
    .replace(PACKAGE_SIZE_AFTER_NAME, (text, name: string) => name + blank(text.slice(name.length)))
    .replace(FOOD_DIAMETER_AFTER_NAME, (text, name: string) => name + blank(text.slice(name.length)));
  if (new RegExp(`\\b${DIMENSION_NAME}\\b`, "i").test(result)) result = result.replace(FOOD_DIMENSIONS, blank);
  return result.replace(NAME_SIZE, (text, next: string) => (NOT_A_FOOD_NAME.has(next.toLowerCase()) ? text : blank(text)));
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
  const from = foodTailStart(text, names, true);
  if (from == null) return { head: "", tail: "" };
  const tail = text.slice(from).trim();
  if (tail.split(/\s+/).length > MAX_HELD_FOOD_WORDS) return { head: text.trim(), tail: "" };
  return { head: text.slice(0, from).trim(), tail };
}

/**
 * Where the last food item starts. `pieceEnd` is false when this is the text
 * before an "and"-led item (the next words are known), so a trailing count
 * there is not waiting for a name in a later piece.
 *
 * The 2026-10-09 food review's split repairs (Alcohol Pricing incidents/
 * 2026-10-09/food-voice-review, findings 3, 5, 6 and 11):
 *  · a correction ("No. Half of a case.") stays with the item it corrects,
 *    and never leads the next item;
 *  · a number never moves onto an item that already has one;
 *  · "and one Diet Pepsi." is sent with the item before it, so the server
 *    sees the list the counter said, not an orphan "and";
 *  · count-first with a comma ("Two cases, sausage.") keeps the count with
 *    the name after it, as liquor's leadsNextName does;
 *  · a size in a name ("Two ounce patties") is not a count.
 */
function foodTailStart(text: string, names: readonly RegExp[], pieceEnd: boolean): number | null {
  const phrases = phrasesOf(text);
  if (!phrases.length) return null;
  const found = names.flatMap(pattern => [...text.matchAll(pattern)].map(m => ({ start: m.index!, end: m.index! + m[0].length })))
    .sort((a, b) => b.end - b.start - (a.end - a.start));
  const spans: typeof found = [];
  for (const span of found) if (!spans.some(s => span.start < s.end && span.end > s.start)) spans.push(span);
  const parts = phrases.map(p => {
    const start = p.start + (text.slice(p.start).match(/^\s*/)?.[0].length ?? 0), end = start + p.text.length;
    const owned = spans.filter(s => s.start < end && s.end > start);
    const outside = withoutFoodSize(p.text).split("");
    for (const s of owned) for (let i = Math.max(s.start, start) - start; i < Math.min(s.end, end) - start; i++) outside[i] = " ";
    const named = owned.length > 0 || namesFood(p.text);
    return { named, counted: hasNumber(outside.join("")), owned, correction: !named && CORRECTION_LEAD.test(p.text), led: false };
  });
  // A count before/after a multi-comma catalog name finishes the entire name,
  // not just its first fragment ("two Butter, Alternative Liquid, Zero Fat").
  // `led` marks a name a count-first number led.
  const finishName = (named: (typeof parts)[number]) => {
    for (const part of parts) if (part === named || part.owned.some(s => named.owned.includes(s))) { part.counted = true; part.led = true; }
  };
  for (const span of spans) {
    const owned = parts.filter(p => p.owned.includes(span));
    if (owned.some(p => p.counted)) for (const part of owned) part.counted = true;
  }
  // The mark that ends the phrase before phrase k ("." for the first).
  const markBefore = (k: number) => (k > 0 ? text[phrases[k]!.start - 1] : ".");
  /** A count with no product: "Two cases", "Three", "Half a case". */
  const pure = (k: number) => !parts[k]!.named && parts[k]!.counted && !parts[k]!.correction;
  /** The item ending at phrase j has its number ("Sausage, two", "Bananas
   *  eighteen", or a name a count-first number led). */
  const finished = (j: number) => pure(j) || (parts[j]!.named && parts[j]!.counted);
  /** A count that opens a sentence after a finished item, or the text. */
  const leads = (k: number) => pure(k) && (k === 0 || (/[.!?]/.test(markBefore(k)) && finished(k - 1)));
  const sameName = (a: number, b: number) => parts[a]!.owned.some(s => parts[b]!.owned.includes(s));
  /** Name j's own sentence gives it a number ("Yellow mustard, three
   *  bottles."): a count before the next product's name does not. */
  const nameHasNumber = (j: number) => {
    for (let i = j + 1; i < parts.length && markBefore(i) === ","; i++) {
      if (parts[i]!.named && !sameName(i, j)) return false;
      if (parts[i]!.counted) return true;
    }
    return false;
  };
  /** The item just before phrase k was said count-first ("One case,
   *  pepperoni."): somewhere in its sentence a count led a name. */
  const countFirstBefore = (k: number) => {
    for (let j = k - 1; j >= 0; j--) {
      if (parts[j]!.led) return true;
      if (/[.!?]/.test(markBefore(j))) return false;
    }
    return false;
  };
  // Count-first with a comma: "One case, pepperoni. Two cases, sausage." The
  // count leads the name after it. After an uncounted name ("Pizza sauce. Two
  // cases, sausage.") the number finishes that name instead, as in liquor.
  // A name that has its own number was said name-first, so after a name-first
  // item the count before it is that item's remainder: "Ketchup, one case.
  // Two bottles, yellow mustard, three bottles." keeps the two bottles with
  // ketchup (held, as on live) instead of sending "Ketchup, one case." ready
  // at 16 for 18 (2026-10-09 client review, K1). A counter already counting
  // count-first ("One case, pepperoni. Two cases, sausage, one bag.") still
  // leads the name, remainder and all.
  const ledBy = parts.map((): number | null => null);
  for (let k = 0; k + 1 < parts.length; k++) {
    if (!leads(k) || markBefore(k + 1) !== "," || !parts[k + 1]!.named || parts[k + 1]!.counted) continue;
    if (k > 0 && nameHasNumber(k + 1) && !countFirstBefore(k)) continue;
    ledBy[k + 1] = k;
    finishName(parts[k + 1]!);
  }
  const filler = (k: number) => !parts[k]!.named && !parts[k]!.counted && !parts[k]!.correction;
  let at = parts.findLastIndex(p => p.named);
  if (at < 0) at = 0;
  while (at > 0) {
    if (parts[at - 1]!.named && (!parts[at - 1]!.counted || sameName(at - 1, at))) { at--; continue; }
    // "Um," or "Alright." between names still waiting for numbers is part
    // of the wait, as it was before those words stopped naming a product.
    let k = at - 1;
    while (k >= 0 && filler(k)) k--;
    if (k >= 0 && k < at - 1 && parts[k]!.named && !parts[k]!.counted) { at = k; continue; }
    break;
  }
  if (ledBy[at] != null) {
    const k = ledBy[at]!;
    // At a cut just after a led name ("…three and a half ounces. Two cases,
    // two ounce patties," | "five,"), the name's own number may still come,
    // and then the count was the remainder of the name-first item before it.
    // That item waits too, so the next piece decides with the number in view
    // (sent alone, "Two cases, two ounce patties, five" proved 192 for 5).
    if (pieceEnd && k > 0 && !countFirstBefore(k) && /,\s*$/.test(text) && !/[.!?](?=\s|$)/.test(text.slice(phrases[at]!.start))) {
      const before = foodTailStart(text.slice(0, phrases[k]!.start), names, false) ?? 0;
      if (text.slice(before).trim().split(/\s+/).length <= MAX_HELD_FOOD_WORDS) return before;
    }
    at = k;
  }
  // A bare cue ("No wait,", "Sorry,") takes back the count before it; its new
  // number is in the phrase after it, even when ASR runs that into the next
  // name ("French fries, three bags. No wait, four bags chicken tenders,").
  // Sent apart, the server reads a cue with nothing after it and proves the
  // first count (three bags for four), so the corrected item waits with it.
  let cue = at - 1;
  while (cue >= 0 && filler(cue)) cue--;
  if (cue > 0 && parts[cue]!.correction && !parts[cue]!.counted) {
    const before = foodTailStart(text.slice(0, phrases[cue]!.start), names, false) ?? 0;
    if (!pieceEnd || text.slice(before).trim().split(/\s+/).length <= MAX_HELD_FOOD_WORDS) return before;
  }
  // A quantity-first phrase may end with punctuation inserted by ASR before
  // the following name. Keep that orphan quantity with the unfinished item;
  // never swallow an earlier phrase that already names a different product.
  // An item that already has its number takes no second one ("Pizza sauce,
  // three cases. Two cans. Jalapenos, four cans.": the two cans stay). Its
  // number is in the name's own sentence ("Jalapenos, four cans", "Bananas
  // eighteen"); "Mozzarella. Three cases." may be count-first, so a number
  // after a sentence end does not count.
  const ownNumber = (k: number): boolean => parts[k]!.counted
    || (k + 1 < parts.length && !/[.!?]/.test(markBefore(k + 1)) && ownNumber(k + 1));
  if (!ownNumber(at)) {
    let quantityStart = at;
    while (quantityStart > 0 && !parts[quantityStart - 1]!.named) {
      // A comma separates a name/size/count within one item. A sentence end
      // can strand a quantity before its product; only extend over that end.
      const separator = text.slice(phrases[quantityStart - 1]!.start, phrases[quantityStart]!.start).trim().at(-1);
      if (quantityStart > 1 && !/[.!?]/.test(separator ?? "")) break;
      quantityStart--;
    }
    // "Jalapenos, one case. No. Half of a case." The corrected number belongs
    // to the item it corrects, whatever comes next.
    if (parts.slice(Math.max(0, quantityStart - 1), at).some(p => p.correction)) quantityStart = at;
    if (quantityStart < at) {
      // In "Oreos, one case. Zero point seven. Spanish rice", the first
      // quantity finishes Oreos; only the orphan second quantity leads rice.
      const previous = parts[quantityStart - 1];
      if (previous?.named && !previous.counted) quantityStart++;
      at = Math.min(at, quantityStart);
    }
  }
  // "One case, sausage. Two cases," at a cut: the count waits for its name in
  // the next piece; the finished item before it goes now. Only after a
  // count-first item: after "Ketchup, one case." the trailing "Two bottles,"
  // may be ketchup's remainder, so the whole item waits for the next piece
  // and the rule above decides with the next name in view.
  const last = parts.length - 1;
  if (pieceEnd && last > at && /,\s*$/.test(text) && leads(last) && countFirstBefore(last)) at = last;
  // "Alright." or "Um," alone is never a request of its own.
  if (parts.slice(0, at).every(p => !p.named && !p.counted)) at = 0;
  // "Fry seasoning, one container, and one Diet Pepsi.": a held item that
  // opens with "and" (after any "um") goes with the item before it.
  let open = at;
  while (open > 0 && !parts[open - 1]!.named && !parts[open - 1]!.counted && !parts[open - 1]!.correction) open--;
  if (open > 0 && phrases.slice(open, at + 1).some(p => CONJUNCTION_LEAD.test(p.text))) {
    const joined = foodTailStart(text.slice(0, phrases[open]!.start), names, false) ?? 0;
    // A chain of "and" items past the held limit would go out at once, an
    // unfinished last item's name in one request and its number in the next
    // ("…and four bags of cheese" | "curds."). Then the "and" item waits on
    // its own, as it did before the join.
    if (!pieceEnd || text.slice(joined).trim().split(/\s+/).length <= MAX_HELD_FOOD_WORDS) return joined;
  }
  return phrases[at]!.start;
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
