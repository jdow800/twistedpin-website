import type { BarSkuItem, FoodHeardAmount, FoodUnitReading, FoodUsualRange, VoiceMatch } from "./api";
import { currentCountDefinition, definedUnitMultiplier, normalizeCountUnit } from "./count-definition";
import { formatQty } from "./quantity";
import { foodPhysicalUnit, preciseFoodQty } from "./food-quantity";
import { foodMeasureMultiplier, foodUnitSizeAsk, type FoodUnitSizeAsk } from "./food-unit-size";

export interface FoodReviewItem {
  key: string;
  spoken: string;
  quantityWords?: string;
  quantityNeedsReview?: boolean;
  identityNeedsReview?: boolean;
  quantityReviewReason?: "source_already_used" | "source_revised" | "unquantified_remainder" | "source_not_returned";
  invalidQuantityFields?: ("cases" | "units")[];
  /** Components of an ungrounded model quantity still awaiting human input. */
  unconfirmedQuantityFields?: ("cases" | "units")[];
  /** Product/unit changes must restate originally uncertain quantities. */
  quantityWasUncertain?: boolean;
  cases: number;
  units: number;
  chosenSkuId: string | null;
  candidates: VoiceMatch[];
  spokenUnit: string | null;
  quantityKnown: boolean;
  unitNeedsReview?: boolean;
  unitDraft?: string;
  /** A human-supplied conversion, held on this utterance only. */
  unitMultiplier?: number;
  unitChoiceConfirmed?: boolean;
  largeCountConfirmed?: string;
  search?: string;
  /** The counter's answer to "Add to the N already here, or replace?", and
   *  the N it answered. A different N asks again. */
  restateAnswer?: "add" | "replace";
  restateBefore?: number;
  /** The server read this bare number as pieces from history (2026-10-10).
   *  Shown with its reason and "Use N cases"; cleared by any human change to
   *  the product, unit or number, since it no longer describes the row. */
  unitReading?: FoodUnitReading;
  /** The reading the counter turned down with "Use N cases", kept while the
   *  row still holds those N cases so one tap brings it back (review
   *  2026-10-10: a product counted in cases had no way back). Cleared by any
   *  other change to the product, unit or number. */
  declinedReading?: FoodUnitReading;
  /** A held product's amounts the recording proved, per offered candidate
   *  (Jon 2026-10-15: "Tapping a suggested product fills in the amount the
   *  recording proved for THAT product"). Picking a candidate with an entry
   *  applies it; any other pick still asks. */
  ifChosen?: Record<string, FoodHeardAmount>;
  /** The candidate whose `ifChosen` amount the row now holds. Cleared by a
   *  typed number, which makes the amount the counter's. */
  heardAmountFor?: string;
  /** The counter typed in this row's box. From then on the number is theirs:
   *  suggestions show no amount and a tap never replaces it (review
   *  2026-10-15: a re-tap silently swapped a typed 7 for the heard 2). */
  typedAmount?: boolean;
  /** The server's held amount, put back when a pick has no proved amount of
   *  its own, so another product never inherits one product's proof. */
  heldAmount?: Pick<FoodReviewItem, "cases" | "units" | "spokenUnit" | "unitNeedsReview" | "quantityWords">;
  /** The matched product's amount the recording proved where the model
   *  returned none (a "source_not_returned" row). Offered as one tap, only
   *  while the row is held on the product it was proved for. */
  proposed?: FoodHeardAmount;
  proposedSkuId?: string;
}

/** Whether a server-proved amount (`ifChosen`) may stand on a row with this
 *  reason. A row whose words were already counted, that the counter
 *  corrected, or that has an extra no number covers keeps asking: a tap must
 *  never count those words a second time (review 2026-10-15). */
export function foodHeardAmountStands(reason: FoodReviewItem["quantityReviewReason"]): boolean {
  return !reason || reason === "source_not_returned";
}

/** A proved amount applied to a review row: ready, with nothing left to
 *  confirm, so neither the restate step nor "Which unit?" fires. */
function heardPatch(a: FoodHeardAmount): Partial<FoodReviewItem> {
  return { cases: a.cases, units: a.units, spokenUnit: a.spokenUnit, quantityWords: a.quantityWords,
    unitReading: a.unitReading, quantityKnown: true, quantityNeedsReview: false, unconfirmedQuantityFields: [],
    invalidQuantityFields: [], unitNeedsReview: false, unitMultiplier: undefined };
}

/** A server-proved amount for `sku` on this row, with its patch and its
 *  words ("4 containers"), or null. The page reads the amount through the
 *  same rules it saves with; one it would still ask about (a missing case
 *  size, an unknown unit) is not offered, so the row asks as before. */
export function foodHeardAmount(r: FoodReviewItem, a: FoodHeardAmount | undefined, sku: BarSkuItem | undefined):
  { patch: Partial<FoodReviewItem>; qty: number; words: string } | null {
  if (!a || !sku || !foodHeardAmountStands(r.quantityReviewReason)) return null;
  const n = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0;
  if (!n(a.cases) || !n(a.units) || (a.spokenUnit != null && typeof a.spokenUnit !== "string")) return null;
  const patch = heardPatch({ ...a, quantityWords: typeof a.quantityWords === "string" ? a.quantityWords : "" });
  const q = foodReviewQuantity({ ...r, ...patch, chosenSkuId: sku.id, identityNeedsReview: false, unitChoiceConfirmed: false }, sku);
  if (!q.ready) return null;
  return { patch, qty: q.qty, words: `${formatQty(q.qty)} ${foodUnitLabel(sku, q.qty)}` };
}

/** "10 cookies", "30 dough": the amount a piece reading read, in the server's
 *  own words (its reason opens "Read as 10 cookies."), for the button that
 *  brings the reading back. */
export function foodReadingAmount(reading: FoodUnitReading): string {
  const said = /^Read as (\d[\d,]*(?:\.\d+)? [^.;]+)\./.exec(reading.reason)?.[1];
  return said ?? `${formatQty(reading.n)} ${reading.noun}`;
}

/** This count's totals per product on every shelf except the take's, in
 *  count units: the `countedSoFar` a food voice read is judged against
 *  (2026-10-10). The take's own shelf is left out; its add-or-replace
 *  question is not answered yet, and leaving it out keeps the server's
 *  switch to pieces conservative. Only products with a history ceiling are
 *  sent, since only those use it, which also keeps the request small. */
export function foodCountedSoFar(
  counts: Readonly<Record<string, Readonly<Record<string, { qty: number }>>>>, takeZoneId: string,
  hasCeiling: (skuId: string) => boolean,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [zoneId, cells] of Object.entries(counts)) {
    if (zoneId === takeZoneId) continue;
    for (const [skuId, cell] of Object.entries(cells)) {
      if (!hasCeiling(skuId) || !Number.isFinite(cell.qty) || cell.qty <= 0) continue;
      out[skuId] = preciseFoodQty((out[skuId] ?? 0) + cell.qty);
    }
  }
  return out;
}

/** A usable history ceiling, or null (no ceiling: today's behavior). */
export function foodUsualRange(sku: BarSkuItem | undefined): FoodUsualRange | null {
  const usual = sku?.countHistory?.usual;
  return usual && Number.isFinite(usual.ceiling) && usual.ceiling > 0 ? usual : null;
}

/** Whole cases, or tenths under half a case: "about 1 case", "2 to 4 cases". */
function roundCases(n: number): number {
  return n >= 0.5 ? Math.round(n) : Math.round(n * 10) / 10;
}
function casesWords(n: number): string {
  return `${formatQty(n)} ${n === 1 ? "case" : "cases"}`;
}

/** "usually 1 to 4 cases; biggest delivery 3 cases", from the ceiling's own
 *  evidence. A tier-2 product (bought often, rarely counted) also says what
 *  was bought in 4 weeks, which is what its ceiling rests on. */
function usualEvidence(usual: FoodUsualRange): string {
  const parts: string[] = [];
  const valid = (n: number | null): n is number => n != null && Number.isFinite(n) && n >= 0;
  const onHand = valid(usual.onHandMedianCases) && valid(usual.onHandMaxCases);
  if (onHand) {
    const lo = roundCases(usual.onHandMedianCases!), hi = roundCases(usual.onHandMaxCases!);
    parts.push(lo >= hi ? `usually about ${casesWords(hi)}` : `usually ${formatQty(lo)} to ${casesWords(hi)}`);
  }
  if ((usual.tier === 2 || !onHand) && valid(usual.maxBought28Cases)) {
    parts.push(`never more than ${casesWords(roundCases(usual.maxBought28Cases))} bought in 4 weeks`);
  }
  if (valid(usual.maxDeliveryCases)) parts.push(`biggest delivery ${casesWords(roundCases(usual.maxDeliveryCases))}`);
  return parts.join("; ");
}

/**
 * Jon, 2026-10-09: "Ask: add or replace." A heard row for a product the take's
 * shelf already holds, from an earlier take or an earlier row of this review,
 * asks before it is counted (a re-recorded shelf had added two takes into one:
 * pizza sauce 41 from two takes of about 26, draft 81309ef9). `before` is
 * what is there once the earlier ready rows are added, in the product's count
 * unit; an earlier "replace" starts over from that row. Asked once its own
 * number is known.
 */
export function foodRestatement(
  rows: readonly FoodReviewItem[], i: number, onShelf: (skuId: string) => number,
  quantity: (r: FoodReviewItem) => { ready: boolean; qty: number },
): { before: number } | null {
  const r = rows[i];
  if (!r?.chosenSkuId || !quantity(r).ready) return null;
  let before = onShelf(r.chosenSkuId);
  for (const x of rows.slice(0, i)) {
    if (x.chosenSkuId !== r.chosenSkuId) continue;
    const q = quantity(x);
    if (!q.ready) continue;
    const answer = before > 0 ? foodRestateAnswer(x, { before: preciseFoodQty(before) }) : undefined;
    before = (answer === "replace" ? 0 : before) + q.qty;
  }
  before = preciseFoodQty(before);
  return before > 0 ? { before } : null;
}

/** An add-or-replace amount (in the product's count unit) in the words the
 *  row was heard in: "3 buns" for slider buns counted by the case, rather than
 *  "0.016 cases". A row heard in its count unit, or in cases, keeps that unit. */
export function foodRestateAmount(sku: BarSkuItem | undefined, q: ReturnType<typeof foodReviewQuantity>, n: number): string {
  const m = q.unitMultiplier;
  if (q.cases === 0 && q.inputUnit && q.inputUnit !== "case" && m != null && m > 0 && m !== 1) {
    const said = formatQty(n / m);
    return `${said} ${foodPhysicalUnit({ quantity: said, unit: q.inputUnit, numerator: "1", denominator: "1" })}`;
  }
  return `${formatQty(n)} ${foodUnitLabel(sku, n)}`;
}

/** The answer still stands only for the amount it was given against. */
export function foodRestateAnswer(r: FoodReviewItem, restate: { before: number } | null): "add" | "replace" | undefined {
  return restate && r.restateAnswer && r.restateBefore != null && Math.abs(r.restateBefore - restate.before) < 1e-9
    ? r.restateAnswer : undefined;
}

export function foodQuantityFieldsToConfirm(r: FoodReviewItem): ("cases" | "units")[] {
  return r.unconfirmedQuantityFields ?? (r.quantityNeedsReview || !r.quantityKnown ? ["cases", "units"] : []);
}

/** Editing one component cannot certify the model's other component. A
 * single answer explicitly replaces the whole quantity, including loose. */
export function confirmFoodQuantity(r: FoodReviewItem, field: "cases" | "units", value: number | null, replacesAll = false): Partial<FoodReviewItem> {
  const invalid = new Set(r.invalidQuantityFields ?? []);
  const unconfirmed = new Set(foodQuantityFieldsToConfirm(r));
  const valid = value != null && Number.isFinite(value) && value >= 0;
  if (valid) { invalid.delete(field); unconfirmed.delete(field); }
  else { invalid.add(field); unconfirmed.add(field); }
  if (valid && replacesAll) { invalid.clear(); unconfirmed.clear(); }
  return { invalidQuantityFields: [...invalid], unconfirmedQuantityFields: [...unconfirmed],
    quantityKnown: valid && invalid.size === 0 && unconfirmed.size === 0,
    quantityNeedsReview: unconfirmed.size > 0,
      ...(valid ? { [field]: value, ...(replacesAll ? { [field === "cases" ? "units" : "cases"]: 0 } : {}) } : {}) };
}

export function foodUnitLabel(sku: BarSkuItem | undefined, n: number): string {
  let u = currentCountDefinition(sku)?.unitLabel ?? sku?.countUnit ?? "each";
  if (u === "each" && /\bbottled\b/i.test(sku?.name ?? "")) u = "bottle";
  if (n === 1 || ["each", "lb", "gal", "bib"].includes(u)) return u;
  if (u === "loaf") return "loaves";
  if (/(?:s|x|z|ch|sh)$/.test(u)) return `${u}es`;
  if (/[^aeiou]y$/.test(u)) return `${u.slice(0, -1)}ies`;
  return `${u}s`;
}

/** The package-size question for a unit with no conversion: "How many lb in one
 *  bag?", and what the typed number means (see food-unit-size.ts). */
export function foodUnitSizeQuestion(sku: BarSkuItem, spokenUnit: string): FoodUnitSizeAsk {
  return foodUnitSizeAsk({ unit: sku.countUnit ?? "each", one: foodUnitLabel(sku, 1), many: foodUnitLabel(sku, 2) }, spokenUnit, sku.name);
}

/** The conversion on this row came from a person's answer, not the catalog or
 *  a same-unit rule, so the readback can say what was answered. */
export function foodUnitSizeAnswered(r: FoodReviewItem, sku: BarSkuItem | undefined): boolean {
  return r.unitMultiplier != null && !!r.spokenUnit && foodReviewQuantity({ ...r, unitMultiplier: undefined }, sku).unitMultiplier == null;
}

/** What a unitless count means for this product, in physical count units. */
export function foodImplicitUnit(sku: BarSkuItem | undefined): string {
  const definition = currentCountDefinition(sku);
  const base = normalizeCountUnit(sku?.countUnit ?? "each");
  const defaultUnit = definition?.defaultSpokenUnit && normalizeCountUnit(definition.defaultSpokenUnit);
  // A canonical word such as "each" still names the confirmed physical bag,
  // can or head. A distinct default package, such as case, keeps its basis.
  return defaultUnit && defaultUnit !== base ? defaultUnit : normalizeCountUnit(definition?.unitLabel ?? base);
}

/** Current human package vocabulary can establish an otherwise missing UPC. */
export function foodCaseSize(sku: BarSkuItem | undefined): number | null {
  if (sku?.countUnit === "case") return 1;
  if ((sku?.unitsPerCase ?? 0) > 0) return sku!.unitsPerCase!;
  const mapped = currentCountDefinition(sku)?.spokenUnits?.case;
  return mapped != null && Number.isInteger(mapped) && mapped > 0 && mapped <= 10000 ? mapped : null;
}

function sameUnit(base: string, said: string | null): boolean {
  if (!said) return true;
  const aliases: Record<string, string> = {
    bottles: "bottle", cans: "can", jars: "jar", containers: "container", bags: "bag",
    packs: "pack", packets: "packet", boxes: "box", sacks: "sack", cases: "case",
    pounds: "lb", pound: "lb", lbs: "lb", gallons: "gal", gallon: "gal", ea: "each",
  };
  const unit = aliases[said.toLowerCase()] ?? said.toLowerCase();
  if (unit === base) return true;
  if (base === "each") return ["bottle", "can", "jar", "container"].includes(unit);
  if (base === "bottle") return unit === "each";
  if (base === "pack") return ["bag", "packet"].includes(unit);
  if (base === "sack") return unit === "bag";
  return false;
}

export function foodReviewQuantity(r: FoodReviewItem, sku: BarSkuItem | undefined) {
  const base = sku?.countUnit ?? "each";
  const definition = currentCountDefinition(sku);
  const caseSize = foodCaseSize(sku);
  const rawInputUnit = r.unitNeedsReview ? null : r.spokenUnit ?? definition?.defaultSpokenUnit ?? null;
  const inputUnit = rawInputUnit ? normalizeCountUnit(rawInputUnit) : null;
  const defined = definedUnitMultiplier(sku, r.spokenUnit);
  const same = sameUnit(base, r.spokenUnit) && (!definition || !r.spokenUnit || normalizeCountUnit(r.spokenUnit) === normalizeCountUnit(base)) ? 1 : null;
  // Pounds counted and ounces said (or gallons and quarts) is arithmetic.
  const measure = r.spokenUnit ? foodMeasureMultiplier(foodUnitLabel(sku, 1), r.spokenUnit) : null;
  const unitMultiplier = r.unitNeedsReview ? null
    : inputUnit === "case" ? caseSize
      : r.unitMultiplier ?? defined ?? same ?? measure;
  // Only this arithmetic made the conversion, so the row says so (8 ounces = 0.5 lb).
  const unitFromMeasure = !r.unitNeedsReview && inputUnit !== "case" && r.unitMultiplier == null && defined == null && same == null
    && measure != null && measure !== 1;
  const needsCaseSize = (r.cases > 0 || (r.units > 0 && inputUnit === "case")) && caseSize == null;
  const needsUnitSize = r.units > 0 && unitMultiplier == null && !r.unitNeedsReview && !needsCaseSize;
  const needsUnitChoice = !!r.unitNeedsReview
    || (!r.unitChoiceConfirmed && r.units > 0 && r.units < 1 && !inputUnit && (caseSize ?? 0) > 1);
  const caseMapping = definition?.spokenUnits?.case;
  const catalogConflict = base === "case" && (sku?.unitsPerCase ?? 1) > 1
    || (r.cases > 0 || inputUnit === "case") && caseSize != null && caseMapping != null && caseMapping !== caseSize;
  const unitsAreCases = inputUnit === "case" && unitMultiplier === caseSize;
  const cases = r.cases + (unitsAreCases ? r.units : 0);
  const units = unitsAreCases ? 0 : r.units * (unitMultiplier ?? 0);
  const qty = preciseFoodQty(cases * (caseSize ?? 0) + units);
  return { cases, caseSize, inputUnit, unitMultiplier, unitFromMeasure, units, qty, needsCaseSize, needsUnitSize, needsUnitChoice, catalogConflict,
    ready: !!sku && !r.identityNeedsReview && r.quantityKnown && !r.quantityNeedsReview && !foodQuantityFieldsToConfirm(r).length && !(r.invalidQuantityFields?.length) && Number.isFinite(r.cases) && Number.isFinite(r.units) && Number.isFinite(qty) && r.cases >= 0 && r.units >= 0 && qty >= 0 && !needsCaseSize && !needsUnitSize && !needsUnitChoice && !catalogConflict };
}

/** Deliberately broad warning thresholds: history can miss deliveries and stock
 * may build up. A warning always offers an explicit keep-as-entered action. */
export function foodCountWarning(r: FoodReviewItem, sku: BarSkuItem | undefined, existingQty = 0): string | null {
  if (!sku) return null;
  const q = foodReviewQuantity(r, sku);
  if (!q.ready) return null;
  const history = sku.countHistory;
  const high = Math.max(history?.maxCount ?? 0, history?.maxDelivery ?? 0);
  const usualMaxCases = currentCountDefinition(sku)?.usualMaxCases;
  const totalText = `${formatQty(q.qty + existingQty)} ${foodUnitLabel(sku, q.qty + existingQty)}`;
  // A confirmed operating range is stronger evidence than sparse early history.
  // It only asks for confirmation; the spoken amount is never silently changed.
  if (usualMaxCases != null && q.caseSize != null && q.caseSize > 0
    && (q.qty + existingQty) / q.caseSize > usualMaxCases) {
    return `${totalText} total exceeds the usual ${formatQty(usualMaxCases)} cases. Check the unit; keep if correct.`;
  }
  // Loose units of a full case or more beside cases: most likely that case
  // was counted twice. The question that says so comes first wherever it
  // applies, including above the history ceiling (review 2026-10-10).
  const looseHasCase = r.cases > 0 && q.inputUnit !== "case" && (q.caseSize ?? 0) > 1 && q.units >= q.caseSize!;
  const looseText = "Loose units include a full case. Already included in the case count?";
  // Above the history ceiling, on every product (Jon 2026-10-10: also the
  // single-reading ones, "Beans, three"). The total is the whole store's, so
  // it re-checks after every edit with the same ceiling the server read with.
  const usual = foodUsualRange(sku);
  const total = preciseFoodQty(q.qty + existingQty);
  if (usual && total > usual.ceiling + 1e-9) {
    // Cases to the tenth: "19 bags (about 3.2 cases)", never "3.167 cases".
    const exactCases = q.caseSize != null && q.caseSize > 1 ? total / q.caseSize : null;
    const tenths = exactCases == null ? null : Math.round(exactCases * 10) / 10;
    const inCases = exactCases == null || tenths == null ? ""
      : ` (${Math.abs(tenths - exactCases) < 1e-9 ? "" : "about "}${casesWords(tenths)})`;
    const evidence = usualEvidence(usual);
    const above = `${totalText}${inCases} is more than we've ever had on hand${evidence ? ` (${evidence})` : ""}.`;
    return looseHasCase ? `${looseText} ${above}` : `${above} Check the unit.`;
  }
  // Where history gives a ceiling, it is the only "too many" check (Jon,
  // 2026-10-10: "Replace it where history exists"). The 90-day and 10-case
  // proxies below are for products without one; otherwise they asked about
  // counts the history says are normal ("Cookies, five") and contradicted a
  // reading the server made from that history.
  if (usual) return looseHasCase ? looseText : null;
  if (usualMaxCases == null && high > 0 && q.qty + existingQty > 4 * high && q.qty + existingQty - high >= Math.max(10, q.caseSize ?? 1)) {
    const historyText = (n: number) => formatQty(n);
    const evidence = [history?.maxCount != null ? `largest count ${historyText(history.maxCount)}` : "",
      history?.maxDelivery != null ? `largest delivery ${historyText(history.maxDelivery)}` : ""].filter(Boolean).join("; ");
    return `${totalText} is unusually high (${evidence}, last ${history?.days ?? 90} days). Check the unit.`;
  }
  if (usualMaxCases == null && q.cases >= 10) return sku.countUnit === "case"
    ? `${formatQty(q.cases)} cases is a large count. Check quantity and unit.`
    : `${formatQty(q.cases)} cases is a large count. Cases or ${foodUnitLabel(sku, 2)}${q.caseSize ? ` (${formatQty(q.cases * q.caseSize)} ${foodUnitLabel(sku, q.cases * q.caseSize)})` : ""}?`;
  if (looseHasCase) return looseText;
  return null;
}
