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
 * Liquor's seam join. A pause cut between a bottle and its number leaves the
 * cut's own punctuation at the seam: "…Ketel One Citron, three. Belvedere." |
 * "Two Tito's twenty". Joined as written, "Two" reads as Tito's leading count
 * (to the model and to the server's source guard alike) and Belvedere has no
 * number: 10/16 saved Belvedere 1 for 2, and 10/2 had the same seam ("Belvedere,"
 * | "Two Tito's 14"). So when the held tail names a bottle with no number, and
 * the next piece opens with a bare count that runs straight into a product
 * whose own count follows it ("Tito's twenty", "Woodford Reserve, point
 * three"), the opening count is the held bottle's. It is joined the way the
 * counter said it: "Belvedere, Two. Tito's twenty". Anything else joins exactly
 * as before (Alcohol Pricing incidents/2026-10-16/liquor-count-review/
 * piece-split-number; review round 2 re-cut every comma: w2-branch/
 * virtual-cuts.mjs).
 *
 * Every other shape keeps the plain join, which is today's text:
 *  · a unit word after the count, in the product's name or in the held tail
 *    ("Two cases Tito's twenty", "One case and six …", "three clay cases plus
 *    eight cans", "case of Bulleit Bourbon," | "two Oban …"): a count-first
 *    item, and moving "Two" alone would hand the held bottle a loose count the
 *    guard proves;
 *  · a size or a name-number after the count: a size word ("Tanqueray," |
 *    "one liter, two.", "one thousand"), a count longer than a bottle count
 *    ("Carpano dry," | "three seventy five, two.", "Worthy Park," | "one zero
 *    nine, one bottle.", "nineteen forty two Don Julio", "1942"), or a count
 *    a comma cut ("twenty | two, point five"). It is the bottle's size or
 *    name, not its count;
 *  · a hedge or a correction after the count ("Three or four.", "Seventeen or
 *    sixteen and a half.", "Two no three"), or a list word in the name ("Two
 *    Tito's and three …"): the counter has not settled on one number;
 *  · a count-first list ("two Oban fourteens, one Basil Hayden", "Point four
 *    Malibu, Bacardi Superior, point nine"). The product's own count must be
 *    in its own phrase ("Tito's twenty") or be the whole next phrase
 *    ("Woodford Reserve, point three");
 *  · a held tail of filler only ("Alright."), which is no bottle;
 *  · the same brand again ("Bullet Bourbon," | "One bullet bourbon point
 *    one"), a re-say the server's back-to-back merge already reads.
 * A held name with a number word in it ("Ketel One.", "Dewar's twelve") also
 * keeps the plain join, because hasNumber cannot tell the name from a count.
 * Known risk, with zero real takes: "Kahlua." | "Three Dewar's twelve." moves
 * the three onto Kahlua, and the guard proves it there. A product whose name
 * ends in a number reads exactly like "Tito's twenty". The same goes for one
 * whose name starts with a single number ("Belvedere." | "7 Leguas, two");
 * the transcripts write "Siete".
 */
const SEAM_COUNT = new Set(("zero oh one two three four five six seven eight nine ten eleven twelve thirteen fourteen " +
  "fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred point").split(" "));
const SEAM_UNIT = /^(?:cases?|cs|bottles?|cans?|of|and|a)$/;
const SEAM_UNIT_WORD = /^(?:cases?|cs|bottles?|cans?)$/;
const SEAM_TENS = /^(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)$/;
const SEAM_UNIT_COUNT = /^(?:one|two|three|four|five|six|seven|eight|nine)$/;
const SEAM_SIZE = /^(?:thousand|liters?|litres?|ml|milliliters?|fifths?|handles?|magnums?)$/;
// Hedges, corrections and list joins: no single number for the held bottle.
const SEAM_HEDGE = new Set("or no nope nah actually maybe probably plus sorry wait and then next".split(" "));
const SEAM_FILLER = new Set("alright okay ok um uh so next and then now".split(" "));
const seamWord = (w: string) => w.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9.]/g, "");
const seamBare = (w: string) => w.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]/g, "");
const seamCount = (w: string) => SEAM_COUNT.has(seamWord(w)) || /^\d*\.?\d+$/.test(seamWord(w));
const seamPhraseEnd = (w: string) => /[,;:]$/.test(w);
export function joinSeam(held: string, text: string): string {
  const plain = `${held} ${text}`.trim();
  const next = text.trim();
  if (!held.trim() || !next) return plain;
  // Only a held bottle with no number at all ("Belvedere.", "Elijah Craig,",
  // "Clase Azul, tequila Reposado."); a held "point" or a count-first lead
  // keeps today's join.
  const heldPhrases = phrasesOf(held);
  if (!heldPhrases.length || heldPhrases.some((p) => hasNumber(p.text))) return plain;
  const heldWords = heldPhrases.flatMap((p) => p.text.split(/\s+/)).map(seamBare).filter(Boolean);
  if (heldWords.every((w) => SEAM_FILLER.has(w))) return plain;
  if (heldWords.some((w) => SEAM_UNIT_WORD.test(w))) return plain; // "case of Bulleit Bourbon," leads a count-first list
  const end = next.search(/[.!?](?=\s|$)/);
  const sentence = end < 0 ? next : next.slice(0, end);
  const words = sentence.split(/\s+/).filter(Boolean);
  // The opening count: number words or digits, with no punctuation inside it.
  let n = 0;
  while (n < words.length && seamCount(words[n]!) && !seamPhraseEnd(words[n]!)) n++;
  if (n === 0 || n === words.length) return plain; // no count, or a count alone ("One.", "Three")
  if (/^(?:point|and|a)$/i.test(seamWord(words[n - 1]!))) return plain; // "point" waits for its digit
  // A bottle count is one word, a tens and a unit ("twenty one"), or two digits
  // before any "point". "nineteen forty two", "one oh nine", "three seventy five"
  // and "1942" are a name or a size.
  const whole = words.slice(0, n).map(seamWord);
  const point = whole.indexOf("point");
  const wholePart = point < 0 ? whole : whole.slice(0, point);
  if (wholePart.length > 2 || (wholePart.length === 2 && !(SEAM_TENS.test(wholePart[0]!) && SEAM_UNIT_COUNT.test(wholePart[1]!)))) return plain;
  if (wholePart.some((w) => /^\d{3,}/.test(w))) return plain;
  const rest = words.slice(n);
  const first = seamBare(rest[0]!);
  if (!/[a-z]/i.test(rest[0]!)) return plain;
  // "one liter, two", "one thousand": the count ran into a size. (When a comma
  // cut it, "twenty | two, point five", the name check below finds no real
  // word in "two,".)
  if (SEAM_SIZE.test(first)) return plain;
  if (SEAM_UNIT.test(first)) return plain; // "Two cases …", "One case and six …"
  // "Bullet Bourbon," | "One bullet bourbon …" (a leading "Um," is not the brand).
  if (first === heldWords.find((w) => !SEAM_FILLER.has(w))) return plain;
  // The product's own count: in its own phrase ("Tito's twenty", "baileys two
  // frangelico two"), or the whole next phrase ("Woodford Reserve, point
  // three"). Then the opening count cannot be that product's. "Seventeen bottles
  // Fever Tree tonic water." (no count after) and "two Oban fourteens, one
  // Basil Hayden" (the next count leads the next bottle) are left alone.
  const comma = rest.findIndex(seamPhraseEnd);
  const phrase = comma < 0 ? rest : rest.slice(0, comma + 1);
  let own = phrase.findIndex((w, i) => i > 0 && seamCount(w));
  if (own < 0) {
    if (comma < 0) return plain;
    const after = rest.slice(comma + 1);
    const close = after.findIndex(seamPhraseEnd);
    const quantity = close < 0 ? after : after.slice(0, close + 1);
    const isCount = (w: string) => seamCount(w) || QUANTITY_WORDS.has(seamBare(w));
    if (!quantity.length || !quantity.some(seamCount) || !quantity.every(isCount)) return plain;
    own = comma + 1;
  }
  // The product's name, from the word after the count: a real word ("Two um
  // three.", "twenty | two, point five" have none), with no unit, hedge or
  // list word in it ("three clay cases plus eight cans", "Three or four.",
  // "Two Tito's and three …").
  const name = rest.slice(0, own).map(seamBare).filter(Boolean);
  if (name.some((w) => SEAM_UNIT_WORD.test(w) || SEAM_HEDGE.has(w))) return plain;
  if (!name.some((w) => /[a-z]/.test(w) && !SEAM_FILLER.has(w) && !QUANTITY_WORDS.has(w))) return plain;
  return `${held.trim().replace(/[.!?,]$/, "")}, ${words.slice(0, n).join(" ")}. ${rest.join(" ")}${next.slice(sentence.length)}`;
}

/**
 * Feeds pieces through the split rule (liquor's splitUnfinished by default) in
 * SPOKEN order. Transcripts arrive in the order they finish, so a piece waits
 * for the one before it. `send` gets each piece's matchable text under that
 * piece's index; `flush` at Stop sends whatever is left (pieces after a failed
 * one, and the last held phrase).
 *
 * `join` puts the held tail in front of the next piece. The default is the
 * plain `held text`; liquor passes joinSeam (CountLiquor.tsx, off with
 * ?seamjoin=0). Food never does.
 */
export function createCarry(
  send: (text: string, index: number) => void,
  split: (text: string) => { head: string; tail: string } = splitUnfinished,
  join: (held: string, text: string) => string = (held, text) => `${held} ${text}`.trim(),
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
        const { head, tail } = split(held ? join(held, text) : text.trim());
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
