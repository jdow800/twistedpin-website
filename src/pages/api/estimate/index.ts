export const prerender = false;

import type { APIRoute } from "astro";
import {
  MAX_GUESTS,
  MESSAGES,
  MIN_GUESTS,
  isValidStart,
  optionSpec,
  planFor,
  validateEstimateQuery,
  weekdayName,
  type OptionKey,
} from "../../../lib/estimate/rules.ts";
import { EngineError, buildConfig, callEngine, type EngineQuote } from "../../../lib/estimate/engine.ts";
import { describeFailure, neighborEntries, shapeOption, type EstimateOption } from "../../../lib/estimate/shape.ts";
import {
  CACHE_NONE,
  CACHE_OK,
  clientIp,
  corsHeaders,
  jsonResponse,
  originAllowed,
  parseAllowedOrigins,
  rateLimited,
} from "../../../lib/estimate/http.ts";

/**
 * GET /api/estimate/?d=YYYY-MM-DD&t=HH:MM&g=40&f=stars_strikes[&b=10|15|none|interested][&bq=40][&a=item:qty,…][&n=1]
 *
 * The Event Builder's price step (Marketing Avery/zite-event-builder-brief-2026-08-30.md §2.1).
 * One engine batch prices every option the guest can toggle between —
 * {VIP, traditional} × {2 h, 3 h}, minus whatever the regime removes — so the
 * page switches instantly without another round trip. The engine is the
 * same brain Avery quotes from; this route owns only the fence around it
 * (rules.ts) and the guest-facing shape (shape.ts).
 *
 * Keep the query in that canonical order on the page: the edge cache keys on
 * the full URL, and a re-ordered query is a cache miss that reaches the engine.
 *
 * Errors (`ok: false`): invalid · closed · too_soon · too_far · too_large ·
 * outside_hours · engine_unavailable · forbidden · rate_limited. Every
 * `message` is written for the guest and safe to render as-is.
 */
export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: corsHeaders() });

export const GET: APIRoute = async ({ request, url }) => {
  const origin = request.headers.get("origin");
  if (!originAllowed(origin, parseAllowedOrigins(import.meta.env.ESTIMATE_ALLOWED_ORIGINS))) {
    return jsonResponse({ ok: false, code: "forbidden", message: MESSAGES.forbidden }, 403, CACHE_NONE);
  }
  if (rateLimited(clientIp(request))) {
    return jsonResponse({ ok: false, code: "rate_limited", message: MESSAGES.rate_limited }, 429, CACHE_NONE);
  }

  const v = validateEstimateQuery(url.searchParams);
  if (!v.ok) {
    return jsonResponse({ ok: false, code: v.code, message: v.message }, v.status, CACHE_NONE);
  }
  const req = v.req;

  const engineUrl = import.meta.env.GAS_PRICING_URL as string | undefined;
  if (!engineUrl) {
    console.error("[estimate] GAS_PRICING_URL is not set");
    return jsonResponse(
      { ok: false, code: "engine_unavailable", message: MESSAGES.engine_unavailable },
      503,
      CACHE_NONE,
    );
  }

  // Regime → which options exist; a start the window can't hold for 3 hours
  // drops the 3-hour options individually (the 2-hour validity was checked).
  const plan = planFor(req.guests);
  const keys = plan.keys.filter((k) => isValidStart(req.date.dow, req.start, optionSpec(k).hours));
  if (keys.length === 0) {
    return jsonResponse({ ok: false, code: "outside_hours", message: MESSAGES.outside_hours }, 422, CACHE_NONE);
  }
  const defaultKey: OptionKey = keys.includes(plan.default) ? plan.default : keys[0];

  const sourceMessage = `/build ${req.date.key} ${req.start_hhmm} g=${req.guests} f=${req.food} b=${req.bar}`;
  const mainConfigs = keys.map((k) => buildConfig(req, optionSpec(k)));

  // Optional ±5 strip (`n=1`): the default option re-priced at g−5 and g+5.
  // Off unless asked — it is a second engine call per estimate. The response
  // field is ALWAYS an array (empty when off): the page reads `.length`.
  const wantNeighbors = url.searchParams.get("n") === "1";
  const neighborRequests = (
    wantNeighbors ? [req.guests - 5, req.guests + 5].filter((g) => g >= MIN_GUESTS && g <= MAX_GUESTS) : []
  ).map((g) => {
    const p = planFor(g);
    const k = keys.includes(p.default) ? p.default : (p.keys.find((x) => keys.includes(x)) ?? p.default);
    return { guests: g, key: k, spec: optionSpec(k) };
  });
  const neighborConfigs = neighborRequests.map((r) => buildConfig({ ...req, guests: r.guests }, r.spec));

  let main: EngineQuote[];
  let neighborQuotes: EngineQuote[] = [];
  try {
    [main, neighborQuotes] = await Promise.all([
      callEngine(engineUrl, mainConfigs, sourceMessage),
      neighborConfigs.length ? callEngine(engineUrl, neighborConfigs, `${sourceMessage} neighbors`) : Promise.resolve([]),
    ]);
  } catch (err) {
    const detail = err instanceof EngineError ? `${err.message} ${JSON.stringify(err.detail ?? "")}` : String(err);
    console.error("[estimate] engine call failed:", detail.slice(0, 500));
    return jsonResponse(
      { ok: false, code: "engine_unavailable", message: MESSAGES.engine_unavailable },
      502,
      CACHE_NONE,
    );
  }

  const options: Record<OptionKey, EstimateOption | null> = {
    vip_2h: null,
    vip_3h: null,
    trad_2h: null,
    trad_3h: null,
  };
  keys.forEach((k, i) => {
    const shaped = shapeOption(k, optionSpec(k), main[i], req);
    options[k] = shaped;
    if (!shaped) console.warn(`[estimate] option ${k} unavailable: ${describeFailure(main[i])}`);
  });

  const available = keys.filter((k) => options[k]);
  if (available.length === 0) {
    // Every config failed. The engine's own hours check is the likeliest
    // cause; anything else is a genuine outage.
    const first = main[0];
    if (first && !first.success && first.error === "start_time_outside_hours") {
      return jsonResponse({ ok: false, code: "outside_hours", message: MESSAGES.outside_hours }, 422, CACHE_NONE);
    }
    console.error("[estimate] every option failed:", main.map(describeFailure).join(" | "));
    return jsonResponse(
      { ok: false, code: "engine_unavailable", message: MESSAGES.engine_unavailable },
      502,
      CACHE_NONE,
    );
  }

  const neighbors = neighborEntries(neighborRequests, neighborQuotes, req.food);

  const engineVersion = main.find((q) => q?.calculation_context?.engine_version)?.calculation_context?.engine_version;

  return jsonResponse(
    {
      ok: true,
      planned_for: req.guests,
      date: req.date.key,
      weekday: weekdayName(req.date.dow),
      start: req.start_hhmm,
      days_out: req.days_out,
      deposit_shown: req.deposit_shown,
      regime: plan.regime,
      default: available.includes(defaultKey) ? defaultKey : available[0],
      vip_ask: plan.vip_ask,
      notices: plan.notices,
      food: req.food,
      bar: req.bar_raw,
      options,
      neighbors,
      engine_version: engineVersion ?? null,
    },
    200,
    CACHE_OK,
  );
};
