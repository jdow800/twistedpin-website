/**
 * Event Builder estimate — the rules the pricing engine does NOT own.
 *
 * The estimate itself always comes from the GAS pricing engine — the same
 * brain Avery quotes from — so the number a guest sees on menu.twistedpin.com
 * /build is the number Avery will say. Everything in this file is the fence
 * AROUND that call:
 *
 *   - which dates can be priced at all (closures, lead time, horizon)
 *   - which start times exist for a weekday (venue hours + the engine's own
 *     rate-table coverage, so we never send a start it can't price)
 *   - the guest-count regimes (VIP 3-hour floor at 49, traditional-only at 60,
 *     the 100 ceiling, the under-10 lane off-ramp)
 *   - the Pizza & Pop day/time gate
 *
 * Two of these MIRROR the Avery brain and must stay in lockstep with it:
 *
 *   closureFor()      <-> Marketing Avery/brain/checks/pre-assemble-context.js  closureFor()
 *   pizzaPopBlocked() <-> Marketing Avery/brain/checks/pre-assemble-context.js  slot_blocked block
 *
 * When one side changes, change the other in the same session. The case
 * table in scripts/check-estimate.mjs is the guard; `--live` also compares
 * the gate against the engine's `flags.slot_blocked` for the same instants.
 *
 * Pure module: no env, no `astro:*` imports. scripts/check-estimate.mjs runs
 * it directly under Node (type-stripped), exactly like check-recurrence.mjs.
 */
import { ctDateKey } from "../recurrence.ts";

export type LaneType = "vip" | "traditional";
export type FoodPackage = "pizza_pop" | "stars_strikes" | "italiano" | "burrito_bowl";
/** Engine bar selections. The page's "Not sure" arrives as `interested` and is priced as `none`. */
export type BarSelection = "none" | "10_card" | "15_card";
export type OptionKey = "vip_2h" | "vip_3h" | "trad_2h" | "trad_3h";
export type Hours = 2 | 3;

export const FOOD_PACKAGES: readonly FoodPackage[] = [
  "pizza_pop",
  "stars_strikes",
  "italiano",
  "burrito_bowl",
];

/** Display names exactly as the engine's formatFoodLabel() renders them. */
export const FOOD_LABELS: Record<FoodPackage, string> = {
  pizza_pop: "Pizza & Pop",
  stars_strikes: "Stars & Strikes",
  italiano: "Twisted Italiano",
  burrito_bowl: "Burrito Bowl",
};

/**
 * Engine add-on catalog keys (calculateAddOns). The engine silently DROPS an
 * unknown key ("Excluded from calculation"), which would make an estimate
 * quietly cheaper than the order — so unknown keys are refused here instead.
 */
export const ADD_ON_ITEMS: ReadonlySet<string> = new Set([
  "boneless_wings",
  "traditional_wings",
  "meat_cheese_board",
  "cheese_curds",
  "naan_veggie",
  "tortilla_chips",
  "chocolate_cake",
  "lemon_cake",
  "tiramisu",
  "coffee_service",
  "arcade_cards",
  "guest_of_honor",
  "goodie_bags",
  "extra_host",
]);

export const MIN_GUESTS = 10;
export const MAX_GUESTS = 100;
/** KB density rule: 49+ in the suite runs 3 hours (vip_2h is not offered). */
export const VIP_THREE_HOUR_FLOOR = 49;
/** Jon, 2026-08-30: 60+ estimates run on the traditional lanes only. */
export const TRADITIONAL_ONLY_FLOOR = 60;
/** 60–80: VIP chip greyed with "sometimes possible at this size. Ask Avery." */
export const VIP_ASK_CEILING = 80;
export const MIN_LEAD_DAYS = 3;
/** Under 10 days out the total is shown without the word "deposit" (KB short-lead rule). */
export const DEPOSIT_LEAD_DAYS = 10;
export const MAX_LEAD_DAYS = 365;
export const STEP_MINUTES = 30;
export const EARLIEST_START_AFTER_OPEN = 30;
export const AVERY_PHONE_DISPLAY = "779-303-0261";

/**
 * Venue hours the page's time list is built from (brief §1), minutes from
 * midnight; a close past 1440 is the next morning. Sunday index 0.
 *
 * Deliberately the STATIC table, not the daily Google snapshot: the engine's
 * rate table (below) has no summer-weekday-11am tier, so a live 11 AM Monday
 * open would offer starts the engine rejects. Anything outside this table is
 * the page's "A time outside regular hours" mode — Avery builds it by hand.
 */
export const VENUE_HOURS: Record<number, { open: number; close: number }> = {
  0: { open: 12 * 60, close: 22 * 60 },
  1: { open: 15 * 60, close: 22 * 60 },
  2: { open: 15 * 60, close: 22 * 60 },
  3: { open: 15 * 60, close: 22 * 60 },
  4: { open: 15 * 60, close: 22 * 60 },
  5: { open: 14 * 60, close: 25 * 60 },
  6: { open: 11 * 60, close: 25 * 60 },
};

/** Engine lookupRate() coverage by start HOUR, [from, to). Outside → "start_time_outside_hours". */
const ENGINE_START_HOURS: Record<number, [number, number]> = {
  0: [12, 22],
  1: [15, 23],
  2: [15, 23],
  3: [15, 23],
  4: [15, 23],
  5: [14, 25],
  6: [11, 25],
};

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface DateParts {
  key: string;
  y: number;
  m: number;
  d: number;
  /** 0 = Sunday … 6 = Saturday (calendar weekday of the civil date). */
  dow: number;
}

/** "YYYY-MM-DD" → parts, or null for anything malformed or non-existent (2026-02-30). */
export function parseDateKey(s: string | null | undefined): DateParts | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return { key: s, y, m, d, dow: dt.getUTCDay() };
}

/** "HH:MM" (24h) → minutes from midnight, or null. */
export function parseClock(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 18:30 → "6:30 PM"; 13:00 → "1 PM". Guest-facing. */
export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ap = h24 < 12 ? "AM" : "PM";
  return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function weekdayName(dow: number): string {
  return WEEKDAY_NAMES[dow] ?? "";
}

/** Whole days from today (venue-local, Central) to the civil date. Negative = past. */
export function daysOut(dateKey: string, now: Date = new Date()): number {
  const [Y, M, D] = ctDateKey(now).split("-").map(Number);
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(Y, M - 1, D)) / 86_400_000);
}

export type Closure = { type: "closed" | "escalate" | "nye"; label: string };

/** Mirror of the brain's ONE_OFF_CLOSURES. Past dates are harmless; keep the lists identical. */
const ONE_OFF_CLOSURES: ReadonlySet<string> = new Set(["2026-07-27", "2026-07-28", "2026-07-29"]);

/**
 * Mirror of pre-assemble-context.js closureFor(). Thanksgiving = 4th Thursday
 * of November; Christmas Eve escalates (hours vary); NYE is its own product.
 */
export function closureFor(dateKey: string): Closure | null {
  if (!dateKey || dateKey.length < 10) return null;
  const d = dateKey.slice(0, 10);
  if (ONE_OFF_CLOSURES.has(d)) return { type: "closed", label: "scheduled closure" };
  const mmdd = d.slice(5);
  if (mmdd === "07-04") return { type: "closed", label: "July 4th" };
  if (mmdd === "12-25") return { type: "closed", label: "Christmas Day" };
  if (mmdd === "12-24") return { type: "escalate", label: "Christmas Eve" };
  if (mmdd === "12-31") return { type: "nye", label: "New Year's Eve" };
  if (mmdd.slice(0, 2) === "11") {
    const parts = parseDateKey(d);
    if (parts && parts.dow === 4 && Math.ceil(parts.d / 7) === 4) {
      return { type: "closed", label: "Thanksgiving" };
    }
  }
  return null;
}

/** Earliest/latest valid start (minutes) for a weekday and event length. */
export function startWindow(dow: number, hours: Hours): { earliest: number; latest: number } {
  const day = VENUE_HOURS[dow];
  return {
    earliest: day.open + EARLIEST_START_AFTER_OPEN,
    latest: day.close - hours * 60,
  };
}

/**
 * A start is valid when it sits on the 30-minute grid, inside the venue's
 * window for that length, AND inside the engine's rate coverage for the hour.
 */
export function isValidStart(dow: number, minutes: number, hours: Hours): boolean {
  if (minutes % STEP_MINUTES !== 0) return false;
  const { earliest, latest } = startWindow(dow, hours);
  if (minutes < earliest || minutes > latest) return false;
  const [from, to] = ENGINE_START_HOURS[dow];
  const hour = Math.floor(minutes / 60);
  return hour >= from && hour < to;
}

/**
 * Mirror of the brain's slot_blocked block (pre-assemble-context.js ~723-759).
 * Season Nov 17 – Apr 1 INCLUSIVE (MM-DD string compare, owner table
 * 2026-07-21). Saturday start after 2:00 PM and before 9:00 PM; Friday start
 * after 3:30 PM and before 9:00 PM; Sunday start before 6:30 PM. Strict
 * inequalities on purpose: a 2:00 PM Saturday start is allowed, 2:30 is not.
 * Lane-independent since engine v2.7. Never explain the schedule to a guest —
 * the answer is "isn't offered at that day and time".
 */
export function pizzaPopBlocked(dateKey: string, dow: number, minutes: number): boolean {
  const md = dateKey.slice(5, 10);
  const inSeason = md >= "11-17" || md <= "04-01";
  if (!inSeason) return false;
  const h = minutes / 60;
  if (dow === 6) return h > 14.0 && h < 21.0;
  if (dow === 5) return h > 15.5 && h < 21.0;
  if (dow === 0) return h < 18.5;
  return false;
}

export type Regime = "standard" | "traditional_only";

export interface RegimePlan {
  regime: Regime;
  /** Which of the four options get priced, in engine batch order. */
  keys: OptionKey[];
  default: OptionKey;
  /** 60–80: show the greyed VIP chip with "Ask Avery". */
  vip_ask: boolean;
  notices: string[];
}

export const TRADITIONAL_NOTICE =
  "Estimates at this size run on the traditional lanes. We'll confirm the exact layout — and whether the VIP Suite can be part of it.";
export const VIP_THREE_HOUR_NOTICE = "Groups this size run 3 hours in the suite.";

export function planFor(guests: number): RegimePlan {
  if (guests >= TRADITIONAL_ONLY_FLOOR) {
    return {
      regime: "traditional_only",
      keys: ["trad_2h", "trad_3h"],
      default: "trad_2h",
      vip_ask: guests <= VIP_ASK_CEILING,
      notices: [TRADITIONAL_NOTICE],
    };
  }
  if (guests >= VIP_THREE_HOUR_FLOOR) {
    return {
      regime: "standard",
      keys: ["vip_3h", "trad_2h", "trad_3h"],
      default: "vip_3h",
      vip_ask: false,
      notices: [VIP_THREE_HOUR_NOTICE],
    };
  }
  return {
    regime: "standard",
    keys: ["vip_2h", "vip_3h", "trad_2h", "trad_3h"],
    default: "vip_2h",
    vip_ask: false,
    notices: [],
  };
}

export function optionSpec(key: OptionKey): { lane_type: LaneType; hours: Hours } {
  switch (key) {
    case "vip_2h":
      return { lane_type: "vip", hours: 2 };
    case "vip_3h":
      return { lane_type: "vip", hours: 3 };
    case "trad_2h":
      return { lane_type: "traditional", hours: 2 };
    case "trad_3h":
      return { lane_type: "traditional", hours: 3 };
  }
}

// ---------------------------------------------------------------------------
// Query validation
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "invalid"
  | "closed"
  | "too_soon"
  | "too_far"
  | "too_large"
  | "outside_hours"
  | "engine_unavailable"
  | "forbidden"
  | "rate_limited";

/**
 * Guest-facing copy. No "slot" / "window", no schedule explanations, no
 * discount vocabulary. VOICE (Jon, 2026-08-31): the page speaks as the venue
 * ("we"), never as Avery — she is the person who signs the reply, not a
 * feature of the page. Don't reintroduce "text Avery" / "send to Avery" here.
 */
export const MESSAGES = {
  bad_date: "Pick a date to see an estimate.",
  bad_time: "Pick a start time to see an estimate.",
  bad_guests: "Tell us how many guests to plan for.",
  under_min: `Groups under ${MIN_GUESTS} book lanes directly at twistedpin.com/reserve/.`,
  too_large: `For groups over ${MAX_GUESTS}, send your picks over and we'll build it by hand.`,
  too_soon: `For dates this close, text us at ${AVERY_PHONE_DISPLAY} and we'll build it with you.`,
  too_far: `We book events up to a year out. For anything later, text us at ${AVERY_PHONE_DISPLAY}.`,
  outside_hours: "That start time is outside our regular hours for that day.",
  closed: (label: string) => `We're closed on ${label}. Pick another date.`,
  christmas_eve: `Christmas Eve hours vary — text us at ${AVERY_PHONE_DISPLAY} and we'll sort it out.`,
  nye: "New Year's Eve is a ticketed night — see twistedpin.com/new-years-eve/.",
  bad_food: "Pick a food package to see an estimate.",
  pizza_pop_blocked:
    "Pizza & Pop isn't offered at that day and time. Pick another package, or a different time.",
  bad_bar: "That drink option isn't one we offer.",
  bad_addon: "One of those add-ons isn't on our list.",
  engine_unavailable:
    "Our pricing engine didn't answer. Try again in a moment — or send your picks over and we'll price it for you.",
  forbidden: "This estimate service is only available from twistedpin.com.",
  rate_limited: "Slow down a touch — try again in a minute.",
} as const;

export interface AddOn {
  item: string;
  qty: number;
}

export interface EstimateRequest {
  date: DateParts;
  /** Minutes from midnight. */
  start: number;
  /** "HH:MM" as the engine wants it. */
  start_hhmm: string;
  guests: number;
  food: FoodPackage;
  /** What the engine prices. `interested` / `individual` collapse to `none`. */
  bar: BarSelection;
  /** What the page said, for the payload. */
  bar_raw: string;
  bar_qty: number;
  add_ons: AddOn[];
  days_out: number;
  deposit_shown: boolean;
}

export type Validation =
  | { ok: true; req: EstimateRequest }
  | { ok: false; code: ErrorCode; message: string; status: number };

function fail(code: ErrorCode, message: string, status = 422): Validation {
  return { ok: false, code, message, status };
}

/** Maps the page's `b=` values onto the engine's bar selections. */
export function parseBar(raw: string | null | undefined): { bar: BarSelection; bar_raw: string } | null {
  const v = (raw ?? "none").trim().toLowerCase();
  switch (v) {
    case "":
    case "none":
    case "individual":
    case "interested":
    case "not_sure":
      return { bar: "none", bar_raw: v === "" ? "none" : v };
    case "10":
    case "10_card":
      return { bar: "10_card", bar_raw: "10_card" };
    case "15":
    case "15_card":
      return { bar: "15_card", bar_raw: "15_card" };
    default:
      return null;
  }
}

/** `a=traditional_wings:2,cheese_curds:1` → validated list, or null on any bad entry. */
export function parseAddOns(raw: string | null | undefined): AddOn[] | null {
  const s = (raw ?? "").trim();
  if (!s) return [];
  const out: AddOn[] = [];
  for (const part of s.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const [item, qtyStr = "1"] = p.split(":");
    if (!ADD_ON_ITEMS.has(item)) return null;
    const qty = Number(qtyStr);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) return null;
    out.push({ item, qty });
  }
  return out;
}

/**
 * Validate the page's query. Order matters for the messages a guest sees:
 * the date and count questions come before the time question, and a closure
 * outranks a bad time on the same date.
 */
export function validateEstimateQuery(params: URLSearchParams, now: Date = new Date()): Validation {
  const date = parseDateKey(params.get("d"));
  if (!date) return fail("invalid", MESSAGES.bad_date);

  const guestsRaw = params.get("g");
  const guests = guestsRaw && /^\d+$/.test(guestsRaw) ? Number(guestsRaw) : NaN;
  if (!Number.isInteger(guests)) return fail("invalid", MESSAGES.bad_guests);
  if (guests < MIN_GUESTS) return fail("invalid", MESSAGES.under_min);
  if (guests > MAX_GUESTS) return fail("too_large", MESSAGES.too_large);

  const closure = closureFor(date.key);
  if (closure) {
    if (closure.type === "escalate") return fail("closed", MESSAGES.christmas_eve);
    if (closure.type === "nye") return fail("closed", MESSAGES.nye);
    return fail("closed", MESSAGES.closed(closure.label));
  }

  const out = daysOut(date.key, now);
  if (out < MIN_LEAD_DAYS) return fail("too_soon", MESSAGES.too_soon);
  if (out > MAX_LEAD_DAYS) return fail("too_far", MESSAGES.too_far);

  const start = parseClock(params.get("t"));
  if (start === null) return fail("invalid", MESSAGES.bad_time);
  // Valid for at least the 2-hour length; the 3-hour options drop out
  // individually when the window can't hold them (see the route).
  if (!isValidStart(date.dow, start, 2)) return fail("outside_hours", MESSAGES.outside_hours);

  const food = (params.get("f") ?? "").trim().toLowerCase() as FoodPackage;
  if (!FOOD_PACKAGES.includes(food)) return fail("invalid", MESSAGES.bad_food);
  if (food === "pizza_pop" && pizzaPopBlocked(date.key, date.dow, start)) {
    return fail("invalid", MESSAGES.pizza_pop_blocked);
  }

  const bar = parseBar(params.get("b"));
  if (!bar) return fail("invalid", MESSAGES.bad_bar);
  const bqRaw = params.get("bq");
  let bar_qty = guests;
  if (bar.bar !== "none" && bqRaw && /^\d+$/.test(bqRaw)) {
    bar_qty = Math.min(300, Math.max(1, Number(bqRaw)));
  }

  const add_ons = parseAddOns(params.get("a"));
  if (!add_ons) return fail("invalid", MESSAGES.bad_addon);

  return {
    ok: true,
    req: {
      date,
      start,
      start_hhmm: toHHMM(start),
      guests,
      food,
      bar: bar.bar,
      bar_raw: bar.bar_raw,
      bar_qty: bar.bar === "none" ? 0 : bar_qty,
      add_ons,
      days_out: out,
      deposit_shown: out >= DEPOSIT_LEAD_DAYS,
    },
  };
}
