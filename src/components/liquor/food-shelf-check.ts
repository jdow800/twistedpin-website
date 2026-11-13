import type { BarSkuItem, ShelfCeiling } from "./api";
import { foodUnitLabel } from "./food-voice-review";
import { formatQty } from "./quantity";

/**
 * THE COUNT GUARD AT THE SHELF (2026-11-12, Opsi BUILD-SPEC §11.177).
 *
 * On 11/12 the GM typed 1 into yellow onion's "cases ×10" box meaning one bag
 * (10 bags saved) and 17 into sugar's bag box meaning 17 lb (17 bags saved).
 * The Submit check knew both were impossible, but said so at Finish, about
 * fifteen cards at once after a 3¾ hour walk. Jon: "Flagging that prior to
 * submission might have been useful."
 *
 * So the screen asks as the number is typed, against numbers TPRS handed it
 * once per walk (GET /counts/:id/shelf-ceilings, the precheck's own rules):
 *   - higher than possible: the item's total on every shelf of this walk is
 *     above the last count plus deliveries by more than `slack`;
 *   - more than ever: else, above the history ceiling (with its margin).
 * Nothing else. A decimal in the cases box is never a reason: a partial case
 * is how packets, cups and lids are counted (the GM, 2026-11-12: "I dont like
 * only cases, I want .7 ect if needed. Not counting 100 packets or cups.").
 * When the shelf's entry used the cases box, the question leads with what
 * that box made of it ("1 case = 10 bags"): the onion slip in plain words.
 *
 * The last count is never shown beside a box (blind counts are deliberate:
 * on 11/12 barbacoa read 35 lb on both walks). It is named only once a typed
 * total is already above it. Pure.
 */

export type ShelfConcernKind = "shelf_impossible" | "shelf_most_ever";

export interface ShelfConcern {
  skuId: string;
  kind: ShelfConcernKind;
  /** The walk's total for the item, every shelf, count units. */
  total: number;
  /** What looks wrong, in plain words. */
  text: string;
  /** When keeping it is right. */
  hint: string;
}

const EPS = 1e-9;
const amount = (sku: BarSkuItem | undefined, n: number) => `${formatQty(n)} ${foodUnitLabel(sku, n)}`;

export function shelfConcern(args: {
  sku: BarSkuItem | undefined;
  /** The item's total across every shelf of this walk, unsaved typing included. */
  total: number;
  ceiling: ShelfCeiling | undefined;
  slack: number;
  /** This shelf's cases box for the item, when it holds a positive number. */
  caseEntry?: { cases: number; caseSize: number | null } | null;
  /** Whether other shelves hold some of the total. */
  otherShelves?: boolean;
}): ShelfConcern | null {
  const { sku, total, ceiling, slack } = args;
  if (!sku || !ceiling || !Number.isFinite(total) || total <= 0) return null;
  const all = args.otherShelves ? `${amount(sku, total)} across shelves` : amount(sku, total);
  const box = args.caseEntry && args.caseEntry.cases > 0 && (args.caseEntry.caseSize ?? 0) > 1
    ? `${formatQty(args.caseEntry.cases)} ${args.caseEntry.cases === 1 ? "case" : "cases"} = ${amount(sku, args.caseEntry.cases * args.caseEntry.caseSize!)}. `
    : "";
  if (ceiling.possible != null && total > ceiling.possible + slack + EPS) {
    const was = ceiling.prior == null
      ? `only ${amount(sku, ceiling.bought)} came in, and it wasn't on the last count`
      : ceiling.bought > 0
        ? `last count plus deliveries is ${amount(sku, ceiling.possible)}`
        : `last count was ${amount(sku, ceiling.possible)} and nothing came in`;
    return {
      skuId: sku.id, kind: "shelf_impossible", total,
      text: `${box}${all} is more than possible: ${was}.`,
      hint: "Keep it if a delivery isn't scanned yet.",
    };
  }
  if (ceiling.usualMax != null && total > ceiling.usualMax + EPS) {
    return {
      skuId: sku.id, kind: "shelf_most_ever", total,
      text: `${box}${all} is more than we've ever had on hand.`,
      hint: "Keep it if it's right.",
    };
  }
  return null;
}

/** A Keep answers the question for the total it was given at; any other
 *  total asks again. */
export function shelfConcernAnswered(c: ShelfConcern, kept: { total: number } | undefined): boolean {
  return !!kept && Math.abs(kept.total - c.total) < 1e-9;
}
