export const prerender = false;

import type { APIRoute } from "astro";
import {
  FOOD_LABELS,
  FOOD_PACKAGES,
  MESSAGES,
  TRADITIONAL_ONLY_FLOOR,
  VIP_ASK_CEILING,
  VIP_THREE_HOUR_FLOOR,
  VIP_THREE_HOUR_RECOMMENDED_FROM,
  closureFor,
  parseClock,
  parseDateKey,
  pizzaPopBlocked,
  type FoodPackage,
} from "../../../lib/estimate/rules.ts";
import {
  FALLBACK_RATES,
  callEngine,
  rateCardFromQuotes,
  rateProbeConfigs,
  type RateCard,
} from "../../../lib/estimate/engine.ts";
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
 * GET /api/estimate/menu/[?d=YYYY-MM-DD&t=HH:MM][&tier=es|el]
 *
 * Which food packages the builder may show for a date/time, plus the rate
 * card the package cards multiply for their live "About $1,775 for up to 70"
 * figure (brief §1 Food, §2.1 "menu check").
 *
 *   - The three tiered packages always show.
 *   - Pizza & Pop shows only when BOTH a date and a start time are known,
 *     the link tier permits it (`el` = elevated links never do), and the
 *     day/time gate allows it. Without d/t it is simply not listed — the
 *     page never has to explain the schedule, and neither does Avery.
 *   - `rates` comes from a live engine probe (one config per package,
 *     cached for a day), so the cards can never drift from the estimate.
 *     If the engine can't be probed the last-known-good constants serve,
 *     flagged `source: "fallback"`.
 */
export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: corsHeaders() });

const RATES_TTL_MS = 24 * 60 * 60 * 1000;
let ratesCache: { at: number; card: RateCard } | null = null;
let ratesInflight: Promise<RateCard> | null = null;

async function getRates(engineUrl: string | undefined): Promise<RateCard> {
  const now = Date.now();
  if (ratesCache && now - ratesCache.at < RATES_TTL_MS) return ratesCache.card;
  if (!engineUrl) return FALLBACK_RATES;
  if (!ratesInflight) {
    ratesInflight = (async () => {
      try {
        const quotes = await callEngine(engineUrl, rateProbeConfigs(FOOD_PACKAGES), "/build rate card probe", {
          timeoutMs: 8_000,
        });
        const card = rateCardFromQuotes(quotes, FOOD_PACKAGES);
        if (!card) {
          console.warn("[estimate/menu] rate probe unreadable; serving fallback rates");
          return FALLBACK_RATES;
        }
        ratesCache = { at: Date.now(), card };
        return card;
      } catch (err) {
        console.warn("[estimate/menu] rate probe failed; serving fallback rates:", String(err).slice(0, 300));
        return FALLBACK_RATES;
      } finally {
        ratesInflight = null;
      }
    })();
  }
  return ratesInflight;
}

export const GET: APIRoute = async ({ request, url }) => {
  const origin = request.headers.get("origin");
  if (!originAllowed(origin, parseAllowedOrigins(import.meta.env.ESTIMATE_ALLOWED_ORIGINS))) {
    return jsonResponse({ ok: false, code: "forbidden", message: MESSAGES.forbidden }, 403, CACHE_NONE);
  }
  if (rateLimited(clientIp(request))) {
    return jsonResponse({ ok: false, code: "rate_limited", message: MESSAGES.rate_limited }, 429, CACHE_NONE);
  }

  const tier = (url.searchParams.get("tier") ?? "").trim().toLowerCase();
  const date = parseDateKey(url.searchParams.get("d"));
  const start = parseClock(url.searchParams.get("t"));

  let pizzaPop: { offered: boolean; reason: "no_date_time" | "link_tier" | "not_at_that_time" | "closed" | null };
  if (tier === "el" || tier === "elevated") {
    pizzaPop = { offered: false, reason: "link_tier" };
  } else if (!date || start === null) {
    pizzaPop = { offered: false, reason: "no_date_time" };
  } else if (closureFor(date.key)) {
    pizzaPop = { offered: false, reason: "closed" };
  } else if (pizzaPopBlocked(date.key, date.dow, start)) {
    pizzaPop = { offered: false, reason: "not_at_that_time" };
  } else {
    pizzaPop = { offered: true, reason: null };
  }

  const packages: FoodPackage[] = FOOD_PACKAGES.filter((p) => p !== "pizza_pop" || pizzaPop.offered);
  const rates = await getRates(import.meta.env.GAS_PRICING_URL as string | undefined);

  return jsonResponse(
    {
      ok: true,
      packages,
      labels: FOOD_LABELS,
      pizza_pop: pizzaPop,
      rates: {
        step: rates.step,
        service_fee_rate: rates.service_fee_rate,
        tax_rate: rates.tax_rate,
        packages: rates.packages,
      },
      rates_source: rates.source,
      // Band thresholds the page used to hard-code (Zite plan 2026-09-01 reads
      // these at mount and falls back to its literals 49/60/80 when absent).
      // Key names are Zite's; values are the proxy's own constants, so a bands
      // change is a value edit in rules.ts and needs no page redeploy.
      //   vip_3h_floor    - from this count the 3-hour option is the default/suggested
      //   trad_only_floor - from this count the VIP tile greys and Traditional is selected
      //   vip_ceiling     - above this count the VIP tile is hidden entirely
      //   vip_3h_recommended_from (2026-09-02, re-banding) - from this count 3h is
      //                     PRESELECTED + labelled "Recommended for your group size";
      //                     2h stays selectable. Replaces vip_3h_floor once the page
      //                     reads it (Paste B); vip_3h_floor is frozen at 49 until then.
      rules: {
        vip_3h_floor: VIP_THREE_HOUR_FLOOR,
        vip_3h_recommended_from: VIP_THREE_HOUR_RECOMMENDED_FROM,
        trad_only_floor: TRADITIONAL_ONLY_FLOOR,
        vip_ceiling: VIP_ASK_CEILING,
      },
    },
    200,
    rates.source === "engine" ? CACHE_OK : "public, s-maxage=300",
  );
};
