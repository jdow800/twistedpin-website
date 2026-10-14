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

type Kind = "piece" | "weight" | "volume" | "package";

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

// Things that hold other things. Any other word is the item's own noun
// ("shell", "patty", "each"): what is counted inside a package.
const PACKAGES = new Set(["bag", "sack", "pouch", "packet", "pack", "package", "sleeve", "bundle", "box", "carton", "crate",
  "case", "flat", "tray", "tub", "jug", "bottle", "can", "jar", "container", "bin", "bucket", "pail", "bib", "bunch", "head", "roll"]);

/** Exact US-customary sizes in the smallest unit of their kind (ounce, fluid
 *  ounce). Metric is left out on purpose: its pound and gallon factors do not
 *  end, and a count must not carry a rounded one. */
const EXACT_SIZE: Record<string, number> = { oz: 1, lb: 16, floz: 1, pt: 16, qt: 32, gal: 128 };

/** The canonical word for a unit as the counter said it ("Pounds" -> "lb",
 *  "trays" -> "tray", "fluid ounces" -> "floz"). */
export function foodUnitWord(word: string): string {
  const raw = word.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  return MEASURE_BY_WORD.get(raw) ?? normalizeCountUnit(raw);
}

function kindOf(word: string): Kind {
  return MEASURES[word]?.kind ?? (PACKAGES.has(word) ? "package" : "piece");
}
/** Bigger holds smaller: pieces are in a pound, a pound is in a gallon, a
 *  gallon is in a package; of two weights or two volumes, the larger. */
const RANK: Record<Kind, number> = { piece: 0, weight: 1, volume: 2, package: 3 };
function holds(big: string, small: string): boolean {
  const a = RANK[kindOf(big)], b = RANK[kindOf(small)];
  return a !== b ? a > b : !!MEASURES[big] && !!MEASURES[small] && MEASURES[big].size > MEASURES[small].size;
}

/** A conversion that is plain physics, so nobody is asked: pounds counted and
 *  ounces said, gallons counted and quarts or fluid ounces said. The same kind
 *  of measure only; weight to volume depends on the product. */
export function foodMeasureMultiplier(countWord: string, spokenUnit: string): number | null {
  const count = foodUnitWord(countWord), said = foodUnitWord(spokenUnit);
  const a = EXACT_SIZE[count], b = EXACT_SIZE[said];
  return a == null || b == null || count === said || kindOf(count) !== kindOf(said) ? null : b / a;
}

/** "tray" -> "trays", "patty" -> "patties". A word already plural stays. */
function plural(word: string): string {
  if (MEASURES[word]) return MEASURES[word].shown;
  if (word === "each" || /[^s]s$/.test(word)) return word;
  if (word === "loaf") return "loaves";
  if (/(?:ss|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}
/** A unit the counter typed or said in the plural, made singular for "in one ___". */
function singular(word: string): string {
  if (MEASURES[word]) return MEASURES[word].shown;
  if (word.length < 4 || !/s$/.test(word) || /(?:ss|us)$/.test(word)) return word;
  if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(?:ch|sh|x|z|ss)es$/.test(word)) return word.slice(0, -2);
  return word.slice(0, -1);
}

export interface FoodUnitSizeAsk {
  /** "How many lb in one bag?" */
  question: string;
  /** "For a 5 lb bag, enter 5." Only for pounds or ounces inside a package. */
  example: string | null;
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
 * Bigger is by kind (piece, weight, volume, package); a tie goes to the spoken
 * unit, as before. A product counted in cases always has the case bigger.
 *
 * `count.unit` is the catalog's counting unit; `one` and `many` are the label
 * the screen shows for it ("bag", "bags"; "each" when it has none).
 */
export function foodUnitSizeAsk(count: { unit: string; one: string; many: string }, spokenUnit: string): FoodUnitSizeAsk {
  const countWord = foodUnitWord(count.one), spokenWord = foodUnitWord(spokenUnit);
  const countsCases = foodUnitWord(count.unit) === "case";
  const countHolds = countsCases || holds(countWord, spokenWord);
  const countSide = { word: countWord, one: count.one, many: count.many };
  const spokenSide = { word: spokenWord, one: singular(spokenWord), many: plural(spokenWord) };
  const [big, small] = countHolds ? [countSide, spokenSide] : [spokenSide, countSide];
  const eg = small.word === "lb" ? 5 : small.word === "oz" ? 16 : 0;
  const example = eg && (countsCases || kindOf(big.word) === "package") ? `For a ${eg} ${small.word} ${big.one}, enter ${eg}.` : null;
  return {
    question: small.many === "each" ? `How many in one ${big.one}?` : `How many ${small.many} in one ${big.one}?`,
    example,
    multiplier: n => countHolds ? 1 / n : n,
    said: m => {
      const n = Number((countHolds ? 1 / m : m).toPrecision(12));
      return `1 ${big.one} = ${formatQty(n)} ${n === 1 ? small.one : small.many}`;
    },
  };
}
