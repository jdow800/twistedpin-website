import { normalizeCountUnit } from "./count-definition";
import { formatQty } from "./quantity";

/**
 * The "package size" question on the food speech review (2026-10-14).
 *
 * The counter said a unit the catalog has no conversion for ("cheese curds,
 * three pounds" on a product counted in bags). The old question was always
 * "<count units> per <spoken unit>?", which for a weight read "bags per lb?".
 * This asks it the way a size is said, "How many lb in one bag?", and works out
 * from the two units which way the typed number converts.
 */

/** bit: each, slice. noun: the item's own noun (shell, patty). measure: a
 *  weight or volume. package: anything that holds the others. */
type Kind = "bit" | "noun" | "measure" | "package";

// Weight and volume words, each with the spoken forms that mean it and its
// size in ounces or fluid ounces (to tell which of two is bigger). "oz" is a
// weight; a fluid ounce has to say so ("fl oz").
const MEASURES: Record<string, { kind: "weight" | "volume"; shown: string; size: number; spoken: string[] }> = {
  lb: { kind: "weight", shown: "lb", size: 16, spoken: ["lb", "lbs", "pound", "pounds"] },
  oz: { kind: "weight", shown: "oz", size: 1, spoken: ["oz", "ounce", "ounces"] },
  g: { kind: "weight", shown: "g", size: 0.035, spoken: ["g", "gram", "grams"] },
  kg: { kind: "weight", shown: "kg", size: 35.27, spoken: ["kg", "kilo", "kilos", "kilogram", "kilograms"] },
  gal: { kind: "volume", shown: "gal", size: 128, spoken: ["gal", "gallon", "gallons"] },
  qt: { kind: "volume", shown: "qt", size: 32, spoken: ["qt", "quart", "quarts"] },
  pt: { kind: "volume", shown: "pt", size: 16, spoken: ["pt", "pint", "pints"] },
  floz: { kind: "volume", shown: "fl oz", size: 1, spoken: ["floz", "fl oz", "fluid ounce", "fluid ounces"] },
  ml: { kind: "volume", shown: "ml", size: 0.034, spoken: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"] },
  l: { kind: "volume", shown: "l", size: 33.8, spoken: ["l", "liter", "liters", "litre", "litres"] },
};
const MEASURE_BY_WORD = new Map(Object.entries(MEASURES).flatMap(([key, m]) => m.spoken.map(w => [w, key] as const)));

// Things that hold other things, in the singular. A heavy single piece (a cake,
// a loaf, a block) is here too: it holds slices and weighs more than a pound.
const PACKAGES = new Set(["bag", "sack", "pouch", "packet", "pack", "package", "sleeve", "bundle", "box", "carton", "crate",
  "case", "flat", "tray", "tub", "jug", "bottle", "can", "jar", "container", "bin", "bucket", "pail", "bib", "bunch", "head",
  "pan", "tote", "pot", "rack", "stack", "pallet", "drum", "keg", "barrel", "tin", "canister", "clamshell",
  "cake", "loaf", "wheel", "block", "slab", "log"]);
// The smallest things: always the contents, never the container.
const BITS = new Set(["each", "unit", "piece", "slice", "portion", "serving", "item"]);
// The "each" a product is counted in when the catalog gives it no noun.
const BARE = new Set(["each", "unit", "item"]);
// Food pieces that come inside a package. Any other word the counter says that
// is not on the item's own name is taken to be a container, as the old question did.
const PIECES = new Set(["patty", "shell", "wing", "tender", "bun", "roll", "cookie", "biscuit", "nugget", "strip", "stick",
  "slider", "burger", "sandwich", "wrap", "pizza", "pie", "pretzel", "taco", "tortilla", "flatbread", "crust", "circle",
  "cup", "lid", "plate", "bowl", "napkin", "straw", "fork", "knife", "spoon", "glove", "sheet", "skewer", "link", "sausage"]);
// A bag, box or tub of a known weight gets an example; a head or a case does not.
const WEIGHT_PACKS = new Set(["bag", "sack", "pack", "package", "pouch", "box", "tub"]);

/** Exact US-customary sizes in the smallest unit of their kind (ounce, fluid
 *  ounce). Metric is left out on purpose: its pound and gallon factors do not
 *  end, and a count must not carry a rounded one. */
const EXACT_SIZE: Record<string, number> = { oz: 1, lb: 16, floz: 1, pt: 16, qt: 32, gal: 128 };

/** The canonical word for a unit as the counter said it ("Pounds" -> "lb",
 *  "trays" -> "tray", "fluid ounces" -> "floz"). */
function foodUnitWord(word: string): string {
  const raw = word.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  return MEASURE_BY_WORD.get(raw) ?? normalizeCountUnit(raw);
}

/** "tray" -> "trays", "patty" -> "patties". A word already plural stays. */
function plural(word: string): string {
  if (MEASURES[word]) return MEASURES[word].shown;
  if (word === "each" || word === "dozen" || /[^s]s$/.test(word)) return word;
  if (word === "loaf") return "loaves";
  if (/(?:ss|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}
// Food words that end in "ie", whose plural must not turn back into "-y".
const IE_WORDS = new Set(["cookie", "brownie", "pie", "smoothie", "veggie", "hoagie"]);
/** A unit the counter typed or said in the plural, made singular for "in one ___"
 *  and for matching: "cartons" -> "carton", "patties" -> "patty", "cookies" -> "cookie". */
function singular(word: string): string {
  if (MEASURES[word]) return MEASURES[word].shown;
  if (word === "loaves") return "loaf";
  if (word.length < 4 || !/s$/.test(word) || /(?:ss|us)$/.test(word)) return word;
  if (/ies$/.test(word)) return IE_WORDS.has(word.slice(0, -1)) || word.length < 5 || /[aeiou]ies$/.test(word) ? word.slice(0, -1) : `${word.slice(0, -3)}y`;
  if (/(?:ch|sh|x|z|ss)es$/.test(word)) return word.slice(0, -2);
  return word.slice(0, -1);
}

/** The words that name the item itself: its name and its counting label. */
function itemNouns(itemName: string, countWord: string): Set<string> {
  const nouns = new Set([singular(countWord)]);
  for (const token of itemName.toLowerCase().split(/[^a-z]+/)) if (token.length > 2) nouns.add(singular(token));
  return nouns;
}

/** `side` is where the word came from: the catalog's counting label (unknown
 *  means the item's noun: bun, cookie) or what the counter said (unknown means a
 *  container, which is how the old question read every word). */
function kindOf(word: string, nouns: Set<string>, side: "count" | "spoken"): Kind {
  if (MEASURES[word]) return "measure";
  const w = singular(word), last = singular(word.split(" ").pop() ?? word);   // "hotel pans" -> pan, "#10 can" -> can
  if (PACKAGES.has(w) || PACKAGES.has(last)) return "package";
  if (BITS.has(w)) return "bit";
  if (side === "count" || nouns.has(w) || PIECES.has(w)) return "noun";
  return "package";
}
/** Bigger holds smaller: a slice is in a pound, a pound is in a package; of two
 *  measures, the larger (a pound is more than a fluid ounce). The counting unit
 *  is the bigger only when it ranks higher; a tie goes to the spoken unit, which
 *  is how the old question read every pair. */
const RANK: Record<Kind, number> = { bit: 0, noun: 1, measure: 2, package: 3 };
function holds(big: string, bigKind: Kind, small: string, smallKind: Kind): boolean {
  const a = RANK[bigKind], b = RANK[smallKind];
  return a !== b ? a > b : bigKind === "measure" && MEASURES[big].size > MEASURES[small].size;
}

/** A conversion that is plain physics, so nobody is asked: pounds counted and
 *  ounces said, gallons counted and quarts or fluid ounces said, or the same
 *  measure said with a stray period. The same kind of measure only; weight to
 *  volume depends on the product. */
export function foodMeasureMultiplier(countWord: string, spokenUnit: string): number | null {
  const count = foodUnitWord(countWord), said = foodUnitWord(spokenUnit);
  const a = MEASURES[count], b = MEASURES[said];
  if (!a || !b || a.kind !== b.kind) return null;
  if (count === said) return 1;
  return EXACT_SIZE[count] == null || EXACT_SIZE[said] == null ? null : EXACT_SIZE[said] / EXACT_SIZE[count];
}

export interface FoodUnitSizeAsk {
  /** "How many lb in one bag?" */
  question: string;
  /** "Example: for a 5 lb bag, enter 5." Only where the answer is a weight in a bag, box or tub. */
  example: string | null;
  /** The smallest number that can be right. 1 where a package holds a count of
   *  things (a bag holds at least one shell); anything above 0 for a weight. */
  minimum: number;
  /** What the typed number means for the row: its unitMultiplier, the count
   *  units in one spoken unit. */
  multiplier: (typed: number) => number;
  /** The answer said back from a stored multiplier: "1 bag = 5 lb". */
  said: (multiplier: number) => string;
}

/**
 * Which way round to ask. The question is always "how many <smaller> in one
 * <bigger>?", since that is how a size is said, and the typed number n is the
 * smaller per one bigger:
 *  - the spoken unit is the bigger (4 trays of buns, 2 jugs of syrup counted by
 *    the gallon): n counting units per spoken unit, multiplier n;
 *  - the counting unit is the bigger (3 lb of curds counted in bags, anything
 *    counted in cases): n spoken units per counting unit, multiplier 1/n.
 * Bigger is by kind (piece, weight or volume, package); a tie goes to the
 * spoken unit, as before. A product counted in cases always has the case bigger.
 * A product counted in a bare "each" and said in pounds or gallons is asked what
 * one weighs or holds, since the each is the container (a flat, a jar).
 *
 * `count.unit` is the catalog's counting unit; `one` and `many` are the label
 * the screen shows for it ("bag", "bags"; "each" when it has none). `itemName`
 * tells the item's own nouns ("Taco Shells") from a container the counter said.
 */
export function foodUnitSizeAsk(count: { unit: string; one: string; many: string }, spokenUnit: string, itemName = ""): FoodUnitSizeAsk {
  const countWord = foodUnitWord(count.one), spokenWord = foodUnitWord(spokenUnit);
  const nouns = itemNouns(itemName, countWord);
  const countKind = kindOf(countWord, nouns, "count"), spokenKind = kindOf(spokenWord, nouns, "spoken");
  const countsCases = foodUnitWord(count.unit) === "case";
  // A bib or a lb has the same word for one and many; any other count label that
  // does is only short of a plural ("bib" -> "bibs").
  const countMany = count.many === count.one && !MEASURES[countWord] && !BARE.has(countWord) ? plural(count.one) : count.many;
  const countSide = { word: countWord, one: count.one, many: countMany, kind: countKind };
  const spokenSide = { word: spokenWord, one: singular(spokenWord), many: plural(spokenWord), kind: spokenKind };

  // Counted in a bare "each" and said as a weight or volume: the each holds it.
  if (!countsCases && BARE.has(countWord) && spokenKind === "measure") {
    const m = MEASURES[spokenWord], verb = m.kind === "weight" ? "weigh" : "hold";
    return {
      question: `How many ${m.shown} does one ${verb}?`, example: null, minimum: 0.001,
      multiplier: n => 1 / n,
      said: mult => `1 ${count.one} = ${formatQty(Number((1 / mult).toPrecision(12)))} ${m.shown}`,
    };
  }

  const countHolds = countsCases || holds(countWord, countKind, spokenWord, spokenKind);
  const [big, small] = countHolds ? [countSide, spokenSide] : [spokenSide, countSide];
  let example: string | null = null;
  if ((small.word === "lb" || small.word === "oz") && WEIGHT_PACKS.has(singular(big.word))) {
    const eg = small.word === "lb" ? 5 : 16;
    example = `Example: for a ${eg} ${small.word} ${big.one}, enter ${eg}.`;
  } else if (small.word === "oz" && MEASURES[big.word]?.kind === "volume" && EXACT_SIZE[big.word] != null) {
    // A bare "oz" for something counted by volume is not guessed to be fluid ounces.
    example = `If you mean fluid ounces, enter ${EXACT_SIZE[big.word] / EXACT_SIZE.floz}.`;
  }
  return {
    question: small.many === "each" ? `How many in one ${big.one}?` : `How many ${small.many} in one ${big.one}?`,
    example,
    // A package holds at least one of the things counted in it; a weight can be a fraction.
    minimum: big.kind === "package" && small.kind !== "measure" ? 1 : 0.001,
    multiplier: n => countHolds ? 1 / n : n,
    said: m => {
      const n = Number((countHolds ? 1 / m : m).toPrecision(12));
      return `1 ${big.one} = ${formatQty(n)} ${n === 1 ? small.one : small.many}`;
    },
  };
}
