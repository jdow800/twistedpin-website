/**
 * Event Builder estimate — client for the GAS pricing engine.
 *
 * ONE brain: this is the same Apps Script deployment WF2's `Call Pricing
 * Engine` node hits for Avery's quotes, called with the same config shape
 * (`all_bowling: true`, no `food_qty`, `mode: "customer"`), so an estimate and
 * the quote Avery later delivers for the same inputs are identical by
 * construction. Never compute a price here; when the one-brain cutover to
 * TPRS happens, this module is the only thing that changes.
 *
 * Transport facts (why the browser can't call the engine itself):
 *   - GAS answers a POST with a 302 to script.googleusercontent.com — follow it.
 *   - GAS never answers a CORS preflight.
 *   - The /exec URL is the only credential; it lives in `GAS_PRICING_URL`.
 *   - Every call appends a row to the AveryLog sheet, tagged by `source`.
 *
 * Pure module: no env, no `astro:*` imports.
 */
import type { AddOn, BarSelection, EstimateRequest, FoodPackage, Hours, LaneType } from "./rules.ts";

export const ENGINE_BATCH_MAX = 4;
export const ENGINE_SOURCE = "website_builder";

export interface EngineConfig {
  event_date: string;
  /** "HH:MM" 24h. */
  start_time: string;
  guest_count: number;
  lane_type: LaneType;
  duration: Hours;
  food_package: FoodPackage | "none";
  bar_selection: BarSelection;
  bar_qty: number;
  add_ons: AddOn[];
  /** Matches WF2's default (TRUE unless the event row says false) — see brief §2.4. */
  all_bowling: true;
  mode: "customer";
}

/** The slice of an engine quote this code reads. Everything else is internal and never exposed. */
export interface EngineQuote {
  success: boolean;
  error?: string;
  error_message?: string;
  escalation_flags?: string[];
  avery_total?: {
    estimated_total: number;
    deposit_amount: number;
    per_person_estimate?: number;
  };
  aihub_breakdown?: {
    bowling_lanes?: { lane_type?: string; lane_count?: number; duration_requested?: number };
    food?: {
      package?: string;
      price_per_person?: number;
      qty?: number;
      food_floor?: number | null;
      service_fee_18?: number;
      sales_tax?: number;
    };
    bar?: { selection?: string; price_per_person?: number; qty?: number; service_fee_18?: number; sales_tax?: number };
    food_add_ons?: { line_items?: EngineAddOnLine[]; service_fee_18?: number; sales_tax?: number };
    non_food_add_ons?: { line_items?: EngineAddOnLine[] };
    service_fee?: { rate?: string };
    tax_summary?: { rate?: string };
    totals?: {
      bowling_lanes?: number;
      shoes_pre_tax?: number;
      shoe_tax?: number;
      ops_fee?: number;
      food?: number;
      bar?: number;
      food_add_ons?: number;
      non_food_add_ons?: number;
      service_fee_18?: number;
      food_bev_tax?: number;
      estimated_total?: number;
    };
  };
  flags?: {
    recommend_escalate?: boolean;
    escalation_reasons?: string[];
    slot_blocked?: boolean;
    pizza_pop_vip_blocked?: boolean;
    seating_warning?: boolean;
    squeeze_detected?: boolean;
  };
  calculation_context?: { engine_version?: string };
  batch_index?: number;
  is_primary?: boolean;
}

export interface EngineAddOnLine {
  item: string;
  name?: string;
  qty?: number;
  unit_price?: number;
  line_total?: number;
  error?: string;
}

interface EngineBatchResponse {
  success: boolean;
  error?: string;
  error_message?: string;
  quotes?: EngineQuote[];
}

export class EngineError extends Error {
  // Plain field, not a TS parameter property: Node's type-stripping runs
  // these modules directly (scripts/check-estimate.mjs) and only erasable
  // syntax survives that.
  readonly detail: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "EngineError";
    this.detail = detail;
  }
}

export function buildConfig(
  req: Pick<EstimateRequest, "date" | "start_hhmm" | "guests" | "food" | "bar" | "bar_qty" | "add_ons">,
  spec: { lane_type: LaneType; hours: Hours },
): EngineConfig {
  return {
    event_date: req.date.key,
    start_time: req.start_hhmm,
    guest_count: req.guests,
    lane_type: spec.lane_type,
    duration: spec.hours,
    food_package: req.food,
    bar_selection: req.bar,
    bar_qty: req.bar === "none" ? 0 : req.bar_qty,
    add_ons: req.add_ons,
    all_bowling: true,
    mode: "customer",
  };
}

export interface CallOptions {
  /** Per-attempt budget. Vercel's function ceiling is the outer limit — keep the sum under it. */
  timeoutMs?: number;
  /** Retry once only when the first attempt failed FAST (network refusal), never after a timeout. */
  retryIfFailedWithinMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * POST one batch (≤ 4 configs) and return the quotes in request order.
 * Throws EngineError on transport failure, non-JSON, or a batch-level failure.
 * Per-config failures (`success: false`) are returned in place, not thrown —
 * one option failing must not take the others down.
 */
export async function callEngine(
  url: string,
  quotes: EngineConfig[],
  sourceMessage: string,
  opts: CallOptions = {},
): Promise<EngineQuote[]> {
  if (quotes.length === 0) return [];
  if (quotes.length > ENGINE_BATCH_MAX) {
    throw new EngineError(`batch of ${quotes.length} exceeds the engine cap of ${ENGINE_BATCH_MAX}`);
  }
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const retryIfFailedWithinMs = opts.retryIfFailedWithinMs ?? 2_500;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = JSON.stringify({
    quotes,
    source: ENGINE_SOURCE,
    source_message: sourceMessage.slice(0, 500),
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const startedAt = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        redirect: "follow",
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new EngineError(`engine HTTP ${res.status}`, text.slice(0, 300));
      let parsed: EngineBatchResponse;
      try {
        parsed = JSON.parse(text) as EngineBatchResponse;
      } catch {
        // GAS returns an HTML page for quota / auth problems.
        throw new EngineError("engine returned non-JSON", text.slice(0, 300));
      }
      if (!parsed.success || !Array.isArray(parsed.quotes)) {
        throw new EngineError(parsed.error || "engine batch failed", parsed.error_message);
      }
      return parsed.quotes;
    } catch (err) {
      lastErr = err;
      const elapsed = Date.now() - startedAt;
      const structural = err instanceof EngineError && err.message !== "engine returned non-JSON";
      if (structural || elapsed > retryIfFailedWithinMs) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof EngineError
    ? lastErr
    : new EngineError("engine unreachable", lastErr instanceof Error ? lastErr.message : lastErr);
}

// ---------------------------------------------------------------------------
// Rate card — derived from the engine, never typed here.
// ---------------------------------------------------------------------------

export interface PackageRate {
  per_head: number;
  floor: number;
}

export interface RateCard {
  step: number;
  service_fee_rate: number;
  tax_rate: number;
  packages: Record<FoodPackage, PackageRate>;
  /** "engine" when read from a live probe; "fallback" when the constants below served. */
  source: "engine" | "fallback";
  engine_version?: string;
}

/**
 * Last-known-good constants, used ONLY when the engine can't be probed. They
 * match engine v2.9.1 (getFoodPrice / FOOD_FLOORS / 18% / 8.75%). If the
 * `--live` check ever reports a mismatch, the engine changed — update these
 * AND the Zite cards' expectations in the same session.
 */
export const FALLBACK_RATES: RateCard = {
  step: 5,
  service_fee_rate: 0.18,
  tax_rate: 0.0875,
  packages: {
    pizza_pop: { per_head: 10, floor: 10 },
    stars_strikes: { per_head: 20, floor: 15 },
    italiano: { per_head: 25, floor: 15 },
    burrito_bowl: { per_head: 30, floor: 15 },
  },
  source: "fallback",
};

/**
 * A priceable probe date: ~5 weeks out, moved to a Wednesday (the plainest
 * rate tier, never a closure). Rates don't vary by date, so any priceable
 * day works; a fixed weekday keeps the AveryLog rows recognisable.
 */
export function probeDateKey(now: Date = new Date()): string {
  const base = new Date(now.getTime() + 35 * 86_400_000);
  const dow = base.getUTCDay();
  const shift = (3 - dow + 7) % 7;
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + shift));
  return d.toISOString().slice(0, 10);
}

function parsePercent(s: string | undefined, fallback: number): number {
  if (!s) return fallback;
  const n = Number(String(s).replace("%", "").trim());
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n * 10000) / 1_000_000 : fallback;
}

/**
 * Read per-head prices, floors, and the fee/tax rates off one engine batch
 * (one config per package). Returns null when anything is missing, so the
 * caller falls back rather than serving a half-read card.
 */
export function rateCardFromQuotes(quotes: EngineQuote[], packages: readonly FoodPackage[]): RateCard | null {
  if (quotes.length !== packages.length) return null;
  const out = {} as Record<FoodPackage, PackageRate>;
  let fee = FALLBACK_RATES.service_fee_rate;
  let tax = FALLBACK_RATES.tax_rate;
  let version: string | undefined;
  for (let i = 0; i < packages.length; i++) {
    const q = quotes[i];
    const food = q?.aihub_breakdown?.food;
    if (!q?.success || !food || typeof food.price_per_person !== "number" || food.price_per_person <= 0) {
      return null;
    }
    const floor = typeof food.food_floor === "number" && food.food_floor > 0 ? food.food_floor : null;
    if (!floor) return null;
    out[packages[i]] = { per_head: food.price_per_person, floor };
    fee = parsePercent(q.aihub_breakdown?.service_fee?.rate, fee);
    tax = parsePercent(q.aihub_breakdown?.tax_summary?.rate, tax);
    version = q.calculation_context?.engine_version ?? version;
  }
  return { step: 5, service_fee_rate: fee, tax_rate: tax, packages: out, source: "engine", engine_version: version };
}

export function rateProbeConfigs(packages: readonly FoodPackage[], now: Date = new Date()): EngineConfig[] {
  const date = probeDateKey(now);
  return packages.map((food) => ({
    event_date: date,
    start_time: "18:00",
    guest_count: 20,
    lane_type: "traditional",
    duration: 2,
    food_package: food,
    bar_selection: "none",
    bar_qty: 0,
    add_ons: [],
    all_bowling: true,
    mode: "customer",
  }));
}
