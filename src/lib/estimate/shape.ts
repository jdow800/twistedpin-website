/**
 * Event Builder estimate — shape one engine quote into what a guest sees.
 *
 * Jon, 2026-08-30: four ALL-IN lines (bowling, food, drinks, add-ons) and one
 * total. No fee line, no tax line, no dwell line, never a per-person figure,
 * and — same day's ruling — NO LANE COUNT on the guest surface: the count is
 * derived by policy (seats, not bowlers) and printing it next to the inputs
 * invites "we only need 2 lanes" before the guest has committed. The bowling
 * line is labelled by the SPACE instead. `lanes` still rides in the
 * structured payload so Avery knows the configuration behind the number.
 *
 * Built from the penny-exact `aihub_breakdown` (not the $5-rounded
 * `avery_breakdown`, whose lines are rounded independently and don't sum).
 * Each line is rounded to $5 and the residual is pushed into bowling, so the
 * four lines add up to `avery_total.estimated_total` exactly — the same
 * rounded figure Avery's quote will say.
 *
 * Pure module: no env, no `astro:*` imports.
 */
import type { EngineQuote } from "./engine.ts";
import { FOOD_LABELS, type FoodPackage, type Hours, type LaneType, type OptionKey } from "./rules.ts";

/** Flip to true to return to "Bowling — N lanes in the VIP Suite" labels. One line, no Zite change. */
export const LANE_COUNT_IN_LABEL = false;

export const BOWLING_SUB = "Unlimited bowling for your whole group, shoes included. Everyone gets a seat; bowling rotates.";
export const WHOLE_SUITE_SUB = "You'd have the whole space to yourselves. Unlimited bowling, shoes included.";
export const LEGACY_BOWLING_SUB = "Unlimited bowling during your event (shoes included)";

export interface EstimateLine {
  key: "bowling" | "food" | "drinks" | "addons";
  label: string;
  sub?: string;
  amount: number;
  items?: string[];
}

export interface EstimateOption {
  key: OptionKey;
  lane_type: LaneType;
  hours: Hours;
  /** Engine lane count — for the Send payload and Avery, not for display. */
  lanes: number;
  whole_suite: boolean;
  lines: EstimateLine[];
  /** avery_total.estimated_total — already rounded to $5 by the engine. */
  total: number;
  /** avery_total.deposit_amount — 50%, rounded to $5 by the engine. */
  deposit: number;
  includes_service_and_tax: true;
  /** Food billed at the package floor (10 guests + a 15-floor package): count dropped from the label. */
  food_billed_for: number;
}

export function roundTo5(v: number): number {
  return Math.round(v / 5) * 5;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function bowlingLabel(
  lane_type: LaneType,
  hours: Hours,
  guests: number,
  lanes: number,
  whole_suite: boolean,
): { label: string; sub: string } {
  if (LANE_COUNT_IN_LABEL) {
    if (whole_suite) {
      return {
        label: "Bowling — all six lanes in our VIP Suite (you'd have the whole space to yourselves)",
        sub: LEGACY_BOWLING_SUB,
      };
    }
    return {
      label: lane_type === "vip" ? `Bowling — ${lanes} lanes in the VIP Suite` : `Bowling — ${lanes} traditional lanes`,
      sub: LEGACY_BOWLING_SUB,
    };
  }
  const span = `${hours} hours, for up to ${guests} guests`;
  if (whole_suite) return { label: `The whole VIP Suite — ${span}`, sub: WHOLE_SUITE_SUB };
  if (lane_type === "vip") return { label: `VIP Suite — ${span}`, sub: BOWLING_SUB };
  return { label: `Traditional lanes — ${span}`, sub: BOWLING_SUB };
}

export function foodLabel(food: FoodPackage, guests: number, billedFor: number): string {
  const name = FOOD_LABELS[food];
  return billedFor > guests ? `Food — ${name}` : `Food — ${name}, planned for up to ${guests}`;
}

/**
 * Returns null when the quote failed or lacks the fields we sum from — the
 * caller treats a null option as "not offered" and never invents a number.
 */
export function shapeOption(
  key: OptionKey,
  spec: { lane_type: LaneType; hours: Hours },
  quote: EngineQuote | undefined,
  req: { guests: number; food: FoodPackage },
): EstimateOption | null {
  if (!quote || !quote.success || !quote.avery_total || !quote.aihub_breakdown?.totals) return null;
  const a = quote.aihub_breakdown;
  const t = a.totals!;
  const total = num(quote.avery_total.estimated_total);
  const deposit = num(quote.avery_total.deposit_amount);
  if (total <= 0) return null;

  const bowlingExact = num(t.bowling_lanes) + num(t.shoes_pre_tax) + num(t.shoe_tax) + num(t.ops_fee);
  const foodExact = num(t.food) + num(a.food?.service_fee_18) + num(a.food?.sales_tax);
  const barExact = num(t.bar) + num(a.bar?.service_fee_18) + num(a.bar?.sales_tax);
  const addonsExact =
    num(t.food_add_ons) +
    num(a.food_add_ons?.service_fee_18) +
    num(a.food_add_ons?.sales_tax) +
    num(t.non_food_add_ons);

  const lanes = num(a.bowling_lanes?.lane_count);
  const whole_suite = spec.lane_type === "vip" && lanes === 6;
  const billedFor = num(a.food?.qty) || req.guests;

  const lines: EstimateLine[] = [];
  const bl = bowlingLabel(spec.lane_type, spec.hours, req.guests, lanes, whole_suite);
  lines.push({ key: "bowling", label: bl.label, sub: bl.sub, amount: roundTo5(bowlingExact) });
  lines.push({ key: "food", label: foodLabel(req.food, req.guests, billedFor), amount: roundTo5(foodExact) });
  if (barExact > 0) {
    const qty = num(a.bar?.qty);
    const price = num(a.bar?.price_per_person);
    lines.push({ key: "drinks", label: `Drinks — ${qty} × $${price} beer wall cards`, amount: roundTo5(barExact) });
  }
  if (addonsExact > 0) {
    const items = [...(a.food_add_ons?.line_items ?? []), ...(a.non_food_add_ons?.line_items ?? [])]
      .filter((li) => !li.error && li.name)
      .map((li) => `${li.qty ?? 1} × ${li.name}`);
    lines.push({ key: "addons", label: "Add-ons", items, amount: roundTo5(addonsExact) });
  }

  // Make the shown lines sum to the engine's own rounded total.
  const shown = lines.reduce((s, l) => s + l.amount, 0);
  lines[0].amount += total - shown;

  return {
    key,
    lane_type: spec.lane_type,
    hours: spec.hours,
    lanes,
    whole_suite,
    lines,
    total,
    deposit,
    includes_service_and_tax: true,
    food_billed_for: billedFor,
  };
}

/** For logs only — why an option came back null. Never sent to the browser. */
export function describeFailure(quote: EngineQuote | undefined): string {
  if (!quote) return "missing";
  if (quote.success) return "unshapeable";
  return `${quote.error ?? "error"}${quote.error_message ? `: ${quote.error_message}` : ""}`;
}
