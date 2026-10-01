// Promo presentation for online-only add-ons on the booking flow's add-on step.
//
// Jon, 2026-10-01 (the arcade card "v2"): online pre-purchases converted far
// below Roller's, and the step read as "skip this" — a bright Skip over a faint
// "+", the value buried in fine print. He approved a promo treatment where
// "free" leads and the online-only scarcity is explicit. Mock + reviews:
// TP F's/reviews/2026-10/arcade-addon/.
//
// Keyed by the ADD-ON product's TPRS integer `code` (122 = the $15 arcade card
// sold with every lane product). The PRICE always comes from the catalog
// (`defaultPriceCents`); the bonus is DERIVED (play value − price), so a price
// change can't print stale "free" math — a non-positive bonus turns the promo
// off and the add-on falls back to the plain row.
//
// `title` / `description` set the copy on the add-on step only. The TPRS
// product name still drives the cart line, receipts and emails — rename it in
// TPRS admin to keep them in step.

import { formatUsd } from "../components/tprs/format";

export interface AddOnPromo {
  /** What ONE unit loads, in cents (the $15 card loads $20 of play → 2000). */
  playValueCents: number;
  /** Step heading. `{bonus}` renders highlighted as e.g. "$5 free". */
  heading: string;
  /** Card title on the add-on step. */
  title: string;
  /** Card copy. `{price}` and `{play}` fill from the catalog price + play value. */
  description: string;
  /** Scarcity line under the copy (keep it TRUE — Jon: the kiosks have deals, not this one). */
  fomo?: string;
  /** Small pill on the card. */
  badge?: string;
  /** Unit noun for the Add button and the "added" note. */
  unit: { one: string; many: string };
  /** Sticky-bar label while none are added (quiet, still one tap). */
  skipLabel: string;
}

export const ADD_ON_PROMOS: Record<number, AddOnPromo> = {
  122: {
    playValueCents: 2000,
    heading: "Get {bonus} arcade play",
    title: "Arcade card",
    description: "Pay {price}, play {play}. This bonus is only online.",
    fomo: "You won't find this bonus at our kiosks.",
    badge: "Online only",
    unit: { one: "card", many: "cards" },
    skipLabel: "Skip arcade",
  },
};

export interface ResolvedPromo extends AddOnPromo {
  priceCents: number;
  bonusCents: number;
}

/** The promo for an add-on, or null when none is configured or the math no longer gives a bonus. */
export function promoFor(addOn: { code: number; defaultPriceCents: number }): ResolvedPromo | null {
  const promo = ADD_ON_PROMOS[addOn.code];
  if (!promo) return null;
  const bonusCents = promo.playValueCents - addOn.defaultPriceCents;
  if (!(addOn.defaultPriceCents > 0) || !(bonusCents > 0)) return null;
  return { ...promo, priceCents: addOn.defaultPriceCents, bonusCents };
}

/** Fill `{price}` / `{play}` in promo copy. */
export function fillPromo(text: string, promo: ResolvedPromo): string {
  return text
    .split("{price}").join(formatUsd(promo.priceCents))
    .split("{play}").join(formatUsd(promo.playValueCents));
}

/** "card" / "cards". */
export function promoUnit(promo: ResolvedPromo, qty: number): string {
  return qty === 1 ? promo.unit.one : promo.unit.many;
}
