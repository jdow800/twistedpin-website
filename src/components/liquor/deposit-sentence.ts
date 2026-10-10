// The one-number empty-keg form (InvoiceExplanation) turns a count into the sentence the server already reads.
//
// The explanation route is unchanged: it takes free text and parses it with writtenDepositReturn (tprs
// apps/backend/src/bar/invoice-deposit-return.ts). This module is the Website half of that contract, kept pure so it can be
// checked without a browser. The tprs test invoice-deposit-sentence-contract.test.ts holds a COPY of composeSentence and
// proves the server reads every sentence it makes; the golden lists in both repos' tests must stay identical (see
// scripts/qa-liquor-bottle-sizes/check-deposit-sentence.mjs). Change a sentence here and in the tprs copy together.
// Only erasable TypeScript here (no enums), so the Node-run check can import this file directly.

export interface DepositLineFacts { lineType: string; qtyUnits: string | null; unitCost: string | null; extendedAmount: string }
/** What a one-number answer is made of: one deposit rate, the kegs billed a deposit, and the original bill. */
export interface DepositPlan { rateCents: number; kegsBilled: number; originalCents: number }
export type KegCount = { kegs: number } | { over: number } | { invalid: true };

const toCents = (value: string | number | null | undefined): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

/** A printed total counts as read only when it is a positive amount. Null and 0.00 mean the reader found no total. */
export const printedTotalRead = (printedTotal: string | number | null | undefined): boolean => (toCents(printedTotal) ?? 0) > 0;

/** A negative deposit line is a credit already on the invoice (an earlier answer, or one read from the paper). */
export const hasDepositCredit = (lines: readonly DepositLineFacts[]): boolean =>
  lines.some(line => line.lineType === "deposit" && (toCents(line.extendedAmount) ?? 0) < 0);

/**
 * The single-rate shape this form handles: every positive deposit line is whole kegs at one rate, and the whole deposit fits
 * inside the original bill. Anything else (mixed rates, no deposit line, an unread total, a line that does not add up) is null
 * and the screen asks in words instead. A missing quantity or rate is worked out only when the line divides exactly.
 */
export function depositPlan(lines: readonly DepositLineFacts[], originalTotal: string | number | null | undefined): DepositPlan | null {
  const originalCents = toCents(originalTotal);
  if (originalCents == null || originalCents <= 0) return null;
  const deposits = lines.filter(line => line.lineType === "deposit" && (toCents(line.extendedAmount) ?? 0) > 0);
  if (!deposits.length) return null;
  const rates = new Set<number>();
  let kegsBilled = 0;
  for (const line of deposits) {
    const extended = toCents(line.extendedAmount)!;
    let qty: number | null = line.qtyUnits == null || line.qtyUnits === "" ? null : Number(line.qtyUnits);
    let rate = toCents(line.unitCost);
    if (rate != null && rate <= 0) return null;
    if (qty == null && rate != null && extended % rate === 0) qty = extended / rate;
    if (rate == null && qty != null && qty > 0 && extended % qty === 0) rate = extended / qty;
    if (qty == null || rate == null || !Number.isInteger(qty) || qty < 1 || qty * rate !== extended) return null;
    rates.add(rate);
    kegsBilled += qty;
  }
  if (rates.size !== 1) return null;
  const rateCents = [...rates][0]!;
  if (kegsBilled * rateCents > originalCents) return null;
  return { rateCents, kegsBilled, originalCents };
}

/**
 * The plan the number box is built on, or null when this invoice needs words: an answer is already saved (a correction is
 * written out), a credit is already on the invoice, or the deposit is not one rate of whole kegs on a read total.
 */
export const countPlan = (lines: readonly DepositLineFacts[], printedTotal: string | number | null | undefined, answered: boolean): DepositPlan | null =>
  answered || hasDepositCredit(lines) ? null : depositPlan(lines, printedTotal);

/** The typed count: a whole number from 1 up to the kegs billed a deposit. Never above; an invoice cannot credit more than it billed. */
export function parseKegCount(text: string, kegsBilled: number): KegCount {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return { invalid: true };
  const kegs = Number(trimmed);
  if (kegs < 1) return { invalid: true };
  return kegs > kegsBilled ? { over: kegs } : { kegs };
}

export const depositAmounts = (kegs: number, rateCents: number, originalCents: number) =>
  ({ creditCents: kegs * rateCents, dueCents: originalCents - kegs * rateCents });

/** "60" for $60.00 and "27.50" for $27.50: whole dollars stay whole, cents appear only when there are cents. No commas. */
export const sentenceDollars = (cents: number): string => cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
/** "$1,234.56": the screen's own figures always show cents. */
export const formatMoney = (cents: number): string =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
function composeSentence(kegs: number, rateCents: number, originalCents: number, spelled: boolean): string {
  const { creditCents, dueCents } = depositAmounts(kegs, rateCents, originalCents);
  const count = spelled && kegs < WORDS.length ? WORDS[kegs] : String(kegs);
  return `Returned ${count} empty ${kegs === 1 ? "keg" : "kegs"}. Deposit credit $${sentenceDollars(creditCents)}; total due $${sentenceDollars(dueCents)}.`;
}
/** What the Record button sends: "Returned 2 empty kegs. Deposit credit $60; total due $210." */
export const composeDepositSentence = (kegs: number, rateCents: number, originalCents: number) => composeSentence(kegs, rateCents, originalCents, false);
/** The same sentence with the count spelled out to ten, for the example a person reads. */
export const composeDepositExample = (kegs: number, rateCents: number, originalCents: number) => composeSentence(kegs, rateCents, originalCents, true);

/** Mirrors the server's dollar-amount token: a "$" or "-" straight before a number. Without one the server can only ask again. */
export const hasDollarAmount = (text: string): boolean => /(?:\$\s*|-\s*)\d/.test(text);

const LEFT_TO_SAY = "This records the credit. If a full keg was missing, record that on its item below.";
/** The example under the free-text box. With no single rate to compute from, it names what to say and shows no dollar figure. */
export const exampleText = (plan: DepositPlan | null): string => plan
  ? `For example: “${composeDepositExample(plan.kegsBilled, plan.rateCents, plan.originalCents)}” ${LEFT_TO_SAY}`
  : `Say how many empty kegs went back, the deposit credit in dollars and the total due after it. ${LEFT_TO_SAY}`;

/** The reply to free text that has no dollar amount, in place of the server's generic question. */
export const noAmountMessage = (plan: DepositPlan | null): string => plan
  ? `Add the credit in dollars, like: ${composeDepositExample(plan.kegsBilled, plan.rateCents, plan.originalCents)}`
  : "Add the credit in dollars and the total due after it, and say how many empty kegs went back.";

/** Under the number box when what is typed cannot be recorded. */
export function rangeHint(count: Exclude<KegCount, { kegs: number }>, kegsBilled: number): string {
  if ("over" in count) return `A deposit was billed on ${kegsBilled} keg${kegsBilled === 1 ? "" : "s"}, so no more than ${kegsBilled} can be credited.`;
  return kegsBilled === 1 ? "Enter 1." : `Enter a number from 1 to ${kegsBilled}.`;
}
