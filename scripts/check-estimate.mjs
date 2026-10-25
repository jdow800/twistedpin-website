/**
 * Verifies src/lib/estimate/* — the fence around the pricing engine behind
 * /api/estimate/ (the Event Builder on menu.twistedpin.com/build).
 *
 * Worth having because two of these rules MIRROR the Avery brain (closures,
 * the Pizza & Pop day/time gate) and a drift between them is silent: the
 * page would offer a package Avery then refuses, or refuse a date she'd
 * happily quote. The shaping test guards the other invariant — the four
 * guest-facing lines always sum to the engine's own rounded total.
 *
 * Node 24 strips TypeScript natively, so this imports the real modules.
 *
 * Run:   node scripts/check-estimate.mjs            (pure, runs in prebuild)
 *        GAS_PRICING_URL=… node scripts/check-estimate.mjs --live
 *   --live also hits the engine (a few AveryLog rows tagged website_builder),
 *   prints shaped options, checks the gate against the engine's own flag,
 *   and captures scripts/fixtures/estimate-engine-sample.json if missing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FOOD_PACKAGES,
  closureFor,
  daysOut,
  isValidStart,
  optionSpec,
  parseAddOns,
  parseBar,
  parseDateKey,
  pizzaPopBlocked,
  planFor,
  startWindow,
  validateEstimateQuery,
} from "../src/lib/estimate/rules.ts";
import {
  FALLBACK_RATES,
  buildConfig,
  callEngine,
  probeDateKey,
  rateCardFromQuotes,
  rateProbeConfigs,
} from "../src/lib/estimate/engine.ts";
import { LANE_COUNT_IN_LABEL, neighborEntries, roundTo5, shapeOption } from "../src/lib/estimate/shape.ts";
import { CACHE_OK, estimateCacheControl, originAllowed, rateLimited } from "../src/lib/estimate/http.ts";
import { getEstimateResponse } from "../src/pages/api/estimate/index.ts";
import { getMenuResponse } from "../src/pages/api/estimate/menu.ts";

let failures = 0;
let passes = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passes++;
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
console.log("dates");
check("parses a real date", eq(parseDateKey("2027-01-01")?.dow, 5), "2027-01-01 is a Friday");
check("rejects Feb 30", parseDateKey("2026-02-30") === null);
check("rejects garbage", parseDateKey("12/12/2026") === null);
check("daysOut counts civil days", daysOut("2026-09-02", new Date("2026-08-30T23:30:00-05:00")) === 3);
check("daysOut ignores UTC rollover", daysOut("2026-09-02", new Date("2026-08-31T03:30:00Z")) === 3, "10:30 PM CT Aug 30");

console.log("closures (mirror of pre-assemble-context.js closureFor)");
check("July 4", closureFor("2026-07-04")?.type === "closed");
check("Thanksgiving 2026 = Nov 26", closureFor("2026-11-26")?.label === "Thanksgiving");
check("Nov 19 2026 is not Thanksgiving", closureFor("2026-11-19") === null);
check("Christmas Eve escalates", closureFor("2026-12-24")?.type === "escalate");
check("Christmas closed", closureFor("2026-12-25")?.type === "closed");
check("NYE is its own product", closureFor("2026-12-31")?.type === "nye");
check("one-off closure list", closureFor("2026-07-28")?.type === "closed");
check("ordinary day open", closureFor("2026-10-10") === null);

console.log("start windows (open + 30 → close − length; engine rate coverage)");
check("Sunday 2h = 12:30–8:00", eq(startWindow(0, 2), { earliest: 750, latest: 1200 }));
check("Friday 3h = 2:30–10:00", eq(startWindow(5, 3), { earliest: 870, latest: 1320 }));
check("Saturday 2h latest 11 PM", startWindow(6, 2).latest === 1380);
check("Monday 2h = 3:30–8:00", eq(startWindow(1, 2), { earliest: 930, latest: 1200 }));
check("Sunday noon is too early", !isValidStart(0, 720, 2));
check("Sunday 12:30 is the floor", isValidStart(0, 750, 2));
check("Friday 11 PM holds 2h", isValidStart(5, 1380, 2));
check("Friday 11 PM does not hold 3h", !isValidStart(5, 1380, 3));
check("Saturday 11:30 PM is past the window", !isValidStart(6, 1410, 2));
check("off-grid minute rejected", !isValidStart(1, 945, 2));
check("Saturday 11:30 AM ok", isValidStart(6, 690, 2));

console.log("Pizza & Pop gate (mirror of the brain's slot_blocked block)");
const gate = (d, hhmm) => {
  const p = parseDateKey(d);
  const [h, m] = hhmm.split(":").map(Number);
  return pizzaPopBlocked(d, p.dow, h * 60 + m);
};
check("Sat Dec 12 3:00 PM blocked", gate("2026-12-12", "15:00"));
check("Sat Dec 12 2:00 PM allowed (strict >)", !gate("2026-12-12", "14:00"));
check("Sat Dec 12 2:30 PM blocked", gate("2026-12-12", "14:30"));
check("Sat Dec 12 8:30 PM blocked", gate("2026-12-12", "20:30"));
check("Sat Dec 12 9:00 PM allowed (strict <)", !gate("2026-12-12", "21:00"));
check("Fri Dec 11 4:00 PM blocked", gate("2026-12-11", "16:00"));
check("Fri Dec 11 3:30 PM allowed (strict >)", !gate("2026-12-11", "15:30"));
check("Sun Dec 13 5:00 PM blocked", gate("2026-12-13", "17:00"));
check("Sun Dec 13 6:30 PM allowed", !gate("2026-12-13", "18:30"));
check("Sun Dec 13 12:30 PM blocked", gate("2026-12-13", "12:30"));
check("Sat Nov 14 (pre-season) allowed", !gate("2026-11-14", "15:00"));
check("Sat Nov 21 (in season) blocked", gate("2026-11-21", "15:00"));
check("Tue Nov 17 not a gated day", !gate("2026-11-17", "18:00"));
check("Sat Mar 27 2027 blocked", gate("2027-03-27", "15:00"));
check("Sat Apr 3 2027 (post-season) allowed", !gate("2027-04-03", "15:00"));
check("Sat May 2 allowed", !gate("2026-05-02", "15:00"));

console.log("regimes");
check("10 → four options, VIP 2h default", eq(planFor(10).keys, ["vip_2h", "vip_3h", "trad_2h", "trad_3h"]) && planFor(10).default === "vip_2h");
// Re-banding 2026-09-02: 3h RECOMMENDED from 43 (never required - all four options priced),
// VIP to 75 for everyone, traditional-only from 76.
check("42 → four options, VIP 2h default, no notice", planFor(42).keys.length === 4 && planFor(42).default === "vip_2h" && planFor(42).notices.length === 0);
check("43 → four options still (2h stays priceable), VIP 3h default", planFor(43).keys.length === 4 && planFor(43).default === "vip_3h");
check("43 → 3-hour recommendation notice", planFor(43).notices.length === 1 && /recommend/i.test(planFor(43).notices[0]));
check("60 still standard, VIP priced", planFor(60).regime === "standard" && planFor(60).keys.includes("vip_3h"));
check("75 still standard, VIP priced", planFor(75).regime === "standard" && planFor(75).keys.includes("vip_2h"));
check("76 → traditional only + ask", planFor(76).regime === "traditional_only" && planFor(76).vip_ask === true);
check("80 → ask", planFor(80).vip_ask === true);
check("85 → no ask", planFor(85).vip_ask === false);
check("100 → traditional only", eq(planFor(100).keys, ["trad_2h", "trad_3h"]));
check("optionSpec trad_3h", eq(optionSpec("trad_3h"), { lane_type: "traditional", hours: 3 }));

console.log("query validation (now = Sun 2026-08-30 CT)");
const NOW = new Date("2026-08-30T15:00:00-05:00");
const q = (s) => validateEstimateQuery(new URLSearchParams(s), NOW);
for (const [date, days] of [["2026-08-31", 1], ["2026-09-01", 2], ["2026-09-02", 3], ["2026-09-08", 9]]) {
  const result = q("d=" + date + "&t=18:00&g=40&f=stars_strikes");
  check("day +" + days + " prices without deposit instructions", result.ok && result.req.days_out === days && result.req.deposit_shown === false);
}
check("same day -> too_soon with venue phone", q("d=2026-08-30&t=18:00&g=40&f=stars_strikes").code === "too_soon" && q("d=2026-08-30&t=18:00&g=40&f=stars_strikes").message.includes("(815) 782-7790"));
check("past date -> too_soon", q("d=2026-08-29&t=18:00&g=40&f=stars_strikes").code === "too_soon");
check("nonexistent date -> invalid", q("d=2026-02-30&t=18:00&g=40&f=stars_strikes").code === "invalid");
check("spring DST counts civil days", daysOut("2026-03-09", new Date("2026-03-08T00:01:00-06:00")) === 1);
check("fall DST counts civil days", daysOut("2026-11-02", new Date("2026-11-01T00:01:00-05:00")) === 1);
const three = q("d=2026-09-02&t=18:00&g=40&f=stars_strikes");
check("3 days out is allowed", three.ok === true);
check("3 days out hides the deposit", three.ok && three.req.deposit_shown === false);
const ten = q("d=2026-09-09&t=18:00&g=40&f=stars_strikes");
check("10 days out shows the deposit", ten.ok && ten.req.deposit_shown === true);
check("9 → under-min invalid", q("d=2026-10-10&t=18:00&g=9&f=italiano").code === "invalid");
check("101 → too_large", q("d=2026-10-10&t=18:00&g=101&f=italiano").code === "too_large");
check("July 4 2027 → closed", q("d=2027-07-04&t=18:00&g=40&f=italiano").code === "closed");
check("Dec 24 → closed (Christmas Eve copy)", q("d=2026-12-24&t=18:00&g=40&f=italiano").message.includes("Christmas Eve"));
check("Dec 31 → closed (NYE pointer)", q("d=2026-12-31&t=18:00&g=40&f=italiano").message.includes("new-years-eve"));
check("> 365 days → too_far", q("d=2027-09-15&t=18:00&g=40&f=italiano").code === "too_far");
check("Sunday noon → outside_hours", q("d=2026-10-11&t=12:00&g=40&f=italiano").code === "outside_hours");
check("Sunday 12:30 ok", q("d=2026-10-11&t=12:30&g=40&f=italiano").ok === true);
check("P&P on Sat Dec 12 3 PM → invalid", q("d=2026-12-12&t=15:00&g=20&f=pizza_pop").message.includes("Pizza & Pop"));
check("P&P on Sat Dec 12 1 PM ok", q("d=2026-12-12&t=13:00&g=20&f=pizza_pop").ok === true);
check("bad add-on → invalid", q("d=2026-10-10&t=18:00&g=40&f=italiano&a=bogus:1").code === "invalid");
const full = q("d=2026-10-10&t=18:00&g=40&f=stars_strikes&b=15&bq=30&a=traditional_wings:2,cheese_curds:1");
check("bar 15 → 15_card, qty honoured", full.ok && full.req.bar === "15_card" && full.req.bar_qty === 30);
check("add-ons parsed", full.ok && eq(full.req.add_ons, [{ item: "traditional_wings", qty: 2 }, { item: "cheese_curds", qty: 1 }]));
const notSure = q("d=2026-10-10&t=18:00&g=40&f=stars_strikes&b=interested");
check("'interested' prices as none but is remembered", notSure.ok && notSure.req.bar === "none" && notSure.req.bar_raw === "interested" && notSure.req.bar_qty === 0);
check("parseBar rejects junk", parseBar("20") === null);
check("parseAddOns empty ok", eq(parseAddOns(""), []));
check("start_hhmm zero-padded", full.ok && full.req.start_hhmm === "18:00");

console.log("engine config");
if (full.ok) {
  const cfg = buildConfig(full.req, optionSpec("vip_2h"));
  check("config shape matches WF2 (all_bowling true, customer, no food_qty)", cfg.all_bowling === true && cfg.mode === "customer" && !("food_qty" in cfg));
  check("bar_qty rides for cards", cfg.bar_qty === 30 && cfg.bar_selection === "15_card");
}
check("probe date is a Wednesday", parseDateKey(probeDateKey(NOW)).dow === 3);
check("probe configs cover every package", rateProbeConfigs(FOOD_PACKAGES, NOW).map((c) => c.food_package).join() === FOOD_PACKAGES.join());
check("fallback rates are the v2.9.1 card", FALLBACK_RATES.tax_rate === 0.0875 && FALLBACK_RATES.packages.pizza_pop.floor === 10);

console.log("shaping (hand-built engine quote: 6 VIP lanes, S&S ×40, $10 cards ×40, wings ×2)");
const sample = {
  success: true,
  avery_total: { estimated_total: 2735, deposit_amount: 1370 },
  aihub_breakdown: {
    bowling_lanes: { lane_type: "vip", lane_count: 6 },
    food: { package: "stars_strikes", price_per_person: 20, qty: 40, food_floor: 15, service_fee_18: 144, sales_tax: 70 },
    bar: { selection: "10_card", price_per_person: 10, qty: 40, service_fee_18: 72, sales_tax: 35 },
    food_add_ons: { line_items: [{ item: "traditional_wings", name: "50 Traditional Wings", qty: 2, line_total: 150 }], service_fee_18: 27, sales_tax: 13.13 },
    non_food_add_ons: { line_items: [] },
    service_fee: { rate: "18%" },
    tax_summary: { rate: "8.75%" },
    totals: { bowling_lanes: 660, shoes_pre_tax: 214.2, shoe_tax: 18.74, ops_fee: 131.13, food: 800, bar: 400, food_add_ons: 150, non_food_add_ons: 0, estimated_total: 2735.2 },
  },
  flags: {},
  calculation_context: { engine_version: "2.9.1" },
};
const opt = shapeOption("vip_2h", optionSpec("vip_2h"), sample, { guests: 40, food: "stars_strikes" });
check("shapes", !!opt);
if (opt) {
  const sum = opt.lines.reduce((s, l) => s + l.amount, 0);
  check("four lines", opt.lines.map((l) => l.key).join() === "bowling,food,drinks,addons");
  check("lines sum to the engine total", sum === opt.total, `${sum} vs ${opt.total}`);
  check("every line is a $5 figure", opt.lines.every((l) => l.amount % 5 === 0));
  check("whole suite detected", opt.whole_suite === true && opt.lanes === 6);
  check("deposit passes through", opt.deposit === 1370);
  if (!LANE_COUNT_IN_LABEL) {
    check("space-first label", opt.lines[0].label === "The whole VIP Suite — 2 hours, for up to 40 guests", opt.lines[0].label);
    check("no lane number in any label", !opt.lines.some((l) => /\b\d+ lanes?\b/.test(l.label)));
  }
  check("food label carries the request count", opt.lines[1].label === "Food — Stars & Strikes, planned for up to 40", opt.lines[1].label);
  check("drinks label", opt.lines[2].label === "Drinks — 40 × $10 beer wall cards", opt.lines[2].label);
  check("add-on items named", eq(opt.lines[3].items, ["2 × 50 Traditional Wings"]));
}
const floorSample = JSON.parse(JSON.stringify(sample));
floorSample.aihub_breakdown.food.qty = 15;
const floorOpt = shapeOption("trad_2h", optionSpec("trad_2h"), floorSample, { guests: 10, food: "italiano" });
check("floor case drops the count", floorOpt && floorOpt.lines[1].label === "Food — Twisted Italiano", floorOpt?.lines[1].label);
check("traditional label", floorOpt && floorOpt.lines[0].label === "Traditional lanes — 2 hours, for up to 10 guests", floorOpt?.lines[0].label);
check("failed quote → null", shapeOption("vip_2h", optionSpec("vip_2h"), { success: false, error: "x" }, { guests: 40, food: "italiano" }) === null);
check("residual lands in bowling", (() => {
  const s = JSON.parse(JSON.stringify(sample));
  s.avery_total.estimated_total = 2740; // pretend the engine rounded up
  const o = shapeOption("vip_2h", optionSpec("vip_2h"), s, { guests: 40, food: "stars_strikes" });
  return o && o.lines[0].amount === 1030 && o.lines.reduce((a, l) => a + l.amount, 0) === 2740;
})());
check("roundTo5", roundTo5(2426.5) === 2425 && roundTo5(1367.5) === 1370);
check("option carries lane_label (the page compares by it)", opt && opt.lane_label === opt.lines[0].label);
check("neighbors is an EMPTY ARRAY when not requested — null crashed the live panel 8/31", Array.isArray(neighborEntries([], [], "stars_strikes")) && neighborEntries([], [], "stars_strikes").length === 0);
check("neighbors entries carry guests/total/lane_label", (() => {
  const n = neighborEntries([{ guests: 35, key: "vip_2h", spec: optionSpec("vip_2h") }], [sample], "stars_strikes");
  return n.length === 1 && n[0].guests === 35 && n[0].total === 2735 && typeof n[0].lane_label === "string";
})());
check("neighbors skips a failed quote instead of emitting null", neighborEntries([{ guests: 35, key: "vip_2h", spec: optionSpec("vip_2h") }], [{ success: false }], "stars_strikes").length === 0);

const fixturePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "estimate-engine-sample.json");
if (fs.existsSync(fixturePath)) {
  console.log("shaping (captured engine fixture)");
  const fx = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  fx.quotes.forEach((quote, i) => {
    const key = fx.keys[i];
    const o = shapeOption(key, optionSpec(key), quote, fx.req);
    check(`fixture ${key} shapes`, !!o);
    if (o) check(`fixture ${key} sums`, o.lines.reduce((s, l) => s + l.amount, 0) === o.total);
  });
}

console.log("http");
check("menu origin allowed", originAllowed("https://menu.twistedpin.com"));
check("zite preview allowed", originAllowed("https://something.zite.so"));
check("random origin refused", !originAllowed("https://evil.example"));
check("no origin allowed", originAllowed(null));
check("http origin refused", !originAllowed("http://menu.twistedpin.com"));
check("rate limiter lets 60 through then blocks", (() => {
  let blocked = false;
  for (let i = 0; i < 61; i++) blocked = rateLimited("test-ip", 1_000_000);
  return blocked;
})());

console.log("estimate cache and request rollover (mocked engine, no network)");
const cacheSeconds = (header) => Number(/(?:^|, )s-maxage=(\d+)/.exec(header)?.[1] ?? 0);
for (const [instant, seconds] of [
  ["2026-10-23T23:59:58-05:00", 2],
  ["2026-10-23T23:59:59.500-05:00", 0],
  ["2026-10-24T00:00:00-05:00", 86400],
  ["2026-03-08T00:00:00-06:00", 82800],
  ["2026-11-01T00:00:00-05:00", 86400],
  ["2026-11-01T01:30:00-05:00", 84600],
  ["2026-11-01T01:30:00-06:00", 81000],
]) {
  const header = estimateCacheControl(new Date(instant));
  check("cache lifetime at " + instant, cacheSeconds(header) === seconds, header);
  check("cache forbids stale serving at " + instant, !header.includes("stale-") && (header === "no-store" || header.includes("must-revalidate")));
}
check("menu rate-card cache unchanged", CACHE_OK === "public, s-maxage=86400, stale-while-revalidate=3600");

let requestCounter = 0;
function requestContext(query) {
  const url = new URL("https://www.twistedpin.com/api/estimate/?" + query);
  const request = new Request(url, { headers: { "x-real-ip": "offline-estimate-" + ++requestCounter } });
  return { url, request };
}
function mockedQuotes(configs) {
  return configs.map((config) => {
    const quote = structuredClone(sample);
    quote.aihub_breakdown.bowling_lanes.lane_type = config.lane_type;
    quote.aihub_breakdown.food.package = config.food_package;
    return quote;
  });
}
const fixedNow = new Date("2026-10-23T10:00:00-05:00");
for (const food of FOOD_PACKAGES) {
  const { request, url } = requestContext("d=2026-10-24&t=18:00&g=40&f=" + food + "&b=15&bq=30&a=traditional_wings:2,cheese_curds:1");
  let configsSeen;
  const response = await getEstimateResponse(request, url, {
    engineUrl: "mock://engine", now: () => fixedNow,
    quote: async (_url, configs) => { configsSeen = configs; return mockedQuotes(configs); },
  });
  const body = await response.json();
  check("tomorrow " + food + ": successful total, short-notice policy", response.status === 200 && body.days_out === 1 && body.deposit_shown === false);
  check("tomorrow " + food + ": both lanes and durations retained", Object.values(body.options).length === 4 && Object.values(body.options).every((option) => option && option.total === sample.avery_total.estimated_total && option.lines.reduce((sum, line) => sum + line.amount, 0) === option.total));
  check("tomorrow " + food + ": engine inputs preserved", configsSeen.length === 4 && configsSeen.every((config) => config.food_package === food && config.event_date === "2026-10-24" && config.bar_selection === "15_card" && config.bar_qty === 30 && config.add_ons.length === 2));
}
for (const [date, food, time, guests, expected] of [
  ["2026-10-23", "stars_strikes", "18:00", 40, "too_soon"],
  ["2026-10-22", "stars_strikes", "18:00", 40, "too_soon"],
  ["2026-02-30", "stars_strikes", "18:00", 40, "invalid"],
  ["2026-12-25", "stars_strikes", "18:00", 40, "closed"],
  ["2026-11-21", "pizza_pop", "18:00", 40, "invalid"],
  ["2026-10-24", "stars_strikes", "10:00", 40, "outside_hours"],
  ["2026-10-24", "stars_strikes", "18:00", 101, "too_large"],
]) {
  const { request, url } = requestContext("d=" + date + "&t=" + time + "&g=" + guests + "&f=" + food);
  let calls = 0;
  const response = await getEstimateResponse(request, url, { engineUrl: "mock://engine", now: () => fixedNow, quote: async () => { calls++; return []; } });
  check("route rejects " + expected + ": " + date + " " + food + " " + time + " g=" + guests, response.status === 422 && (await response.json()).code === expected && calls === 0 && response.headers.get("cache-control") === "no-store");
}

const beforeMidnight = new Date("2026-10-23T23:59:58-05:00");
const afterMidnight = new Date("2026-10-24T00:00:01-05:00");
for (const date of ["2026-10-24", "2026-11-02"]) {
  const { request, url } = requestContext("d=" + date + "&t=18:00&g=40&f=stars_strikes");
  const response = await getEstimateResponse(request, url, { engineUrl: "mock://engine", now: () => beforeMidnight, quote: async (_url, configs) => mockedQuotes(configs) });
  const body = await response.json();
  const expires = Date.parse(response.headers.get("date")) + cacheSeconds(response.headers.get("cache-control")) * 1000;
  check("cached " + date + " success expires by midnight", response.status === 200 && expires === Date.parse("2026-10-24T00:00:00-05:00") && expires <= afterMidnight.getTime());
  check("cached " + date + " has original day policy", body.days_out === (date === "2026-10-24" ? 1 : 10) && body.deposit_shown === (date === "2026-11-02"));

  let clock = beforeMidnight;
  let completeEngine;
  let calls = 0;
  const pending = getEstimateResponse(request, url, {
    engineUrl: "mock://engine", now: () => clock,
    quote: (_url, configs) => { calls++; return new Promise((resolve) => { completeEngine = () => resolve(mockedQuotes(configs)); }); },
  });
  check(date + " engine started before midnight", calls === 1 && typeof completeEngine === "function");
  clock = afterMidnight;
  completeEngine();
  const finished = await pending;
  const result = await finished.json();
  if (date === "2026-10-24") {
    check("in-flight tomorrow becomes same-day: reject without price/cache", finished.status === 422 && result.code === "too_soon" && !result.options && finished.headers.get("cache-control") === "no-store");
  } else {
    check("in-flight day +10 becomes +9: same total, deposit hidden", finished.status === 200 && result.days_out === 9 && result.deposit_shown === false && result.options.vip_2h.total === sample.avery_total.estimated_total);
    check("in-flight +9 cache derives from the new day", cacheSeconds(finished.headers.get("cache-control")) === 86399 && finished.headers.get("date") === afterMidnight.toUTCString());
  }
  check(date + " is never repriced for policy rollover", calls === 1);
}

// The optional neighbor batch must finish before the final policy check too.
{
  const { request, url } = requestContext("d=2026-11-02&t=18:00&g=40&f=stars_strikes&n=1");
  let clock = beforeMidnight;
  let completeNeighbors;
  let calls = 0;
  const pending = getEstimateResponse(request, url, {
    engineUrl: "mock://engine", now: () => clock,
    quote: async (_url, configs) => {
      calls++;
      if (calls === 1) return mockedQuotes(configs);
      return new Promise((resolve) => { completeNeighbors = () => resolve(mockedQuotes(configs)); });
    },
  });
  clock = afterMidnight;
  completeNeighbors();
  const body = await (await pending).json();
  check("late neighbor batch uses current policy and preserves neighbors", calls === 2 && body.days_out === 9 && body.deposit_shown === false && body.neighbors.length === 2);
}

console.log("menu date restriction (mocked rates, no network)");
const mockRates = { ...FALLBACK_RATES, source: "engine" };
for (const tier of ["es", "el", "elevated"]) {
  for (const time of ["", "&t=18:00", "&t=10:00"]) {
    for (const [date, message] of [["2026-12-25", "Christmas Day"], ["2026-12-24", "Christmas Eve"], ["2026-12-31", "new-years-eve"]]) {
      const { request, url } = requestContext("d=" + date + "&tier=" + tier + time);
      const response = await getMenuResponse(request, url, { getRateCard: async () => mockRates });
      const body = await response.json();
      check("menu date restriction independent of tier/time: " + date + " " + tier + time, response.status === 200 && body.date === date && body.date_restriction?.code === "closed" && body.date_restriction.message.includes(message));
      check("menu keeps its rate-card cache: " + date + " " + tier + time, response.headers.get("cache-control") === CACHE_OK);
    }
  }
}
for (const [date, expectedDate] of [["2026-10-24", "2026-10-24"], ["2026-02-30", null], ["", null]]) {
  const { request, url } = requestContext("d=" + date + "&tier=el");
  const body = await (await getMenuResponse(request, url, { getRateCard: async () => mockRates })).json();
  check("menu nonrestricted/malformed date: " + date, body.date === expectedDate && body.date_restriction === null && body.pizza_pop.reason === "link_tier");
}

// ---------------------------------------------------------------------------
if (process.argv.includes("--live")) {
  const url = process.env.GAS_PRICING_URL;
  if (!url) {
    console.log("--live: GAS_PRICING_URL not set; skipping");
  } else {
    console.log("live engine");
    const live = validateEstimateQuery(new URLSearchParams("d=2026-10-17&t=18:00&g=40&f=stars_strikes&b=10&a=traditional_wings:2"), NOW);
    if (!live.ok) throw new Error("live query invalid: " + live.message);
    const plan = planFor(40);
    const configs = plan.keys.map((k) => buildConfig(live.req, optionSpec(k)));
    const t0 = Date.now();
    const quotes = await callEngine(url, configs, "check-estimate --live", { timeoutMs: 20_000 });
    console.log(`  engine answered ${quotes.length} configs in ${Date.now() - t0} ms; version ${quotes[0]?.calculation_context?.engine_version}; tax ${quotes[0]?.aihub_breakdown?.tax_summary?.rate}; fee ${quotes[0]?.aihub_breakdown?.service_fee?.rate}`);
    check("live: tax rate is 8.75% (deployed v2.9.1)", quotes[0]?.aihub_breakdown?.tax_summary?.rate === "8.75%", String(quotes[0]?.aihub_breakdown?.tax_summary?.rate));
    plan.keys.forEach((k, i) => {
      const o = shapeOption(k, optionSpec(k), quotes[i], live.req);
      check(`live ${k} shapes`, !!o, quotes[i]?.error_message);
      if (o) {
        const sum = o.lines.reduce((s, l) => s + l.amount, 0);
        check(`live ${k} sums`, sum === o.total, `${sum} vs ${o.total}`);
        console.log(`  ${k}: total $${o.total} deposit $${o.deposit} lanes ${o.lanes}${o.whole_suite ? " (whole suite)" : ""}`);
        for (const l of o.lines) console.log(`     ${l.label.padEnd(58)} $${l.amount}`);
      }
    });
    if (!fs.existsSync(fixturePath)) {
      fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
      const scrub = quotes.map((qq) => {
        const { input_received, recovery, ...rest } = qq;
        return rest;
      });
      fs.writeFileSync(fixturePath, JSON.stringify({ captured_at: new Date().toISOString(), keys: plan.keys, req: { guests: 40, food: "stars_strikes" }, quotes: scrub }, null, 2));
      console.log(`  captured fixture → ${path.relative(process.cwd(), fixturePath)}`);
    }

    console.log("live: Pizza & Pop gate vs engine flags.slot_blocked");
    const probes = [
      ["2026-12-12", "15:00"], // Sat in season, blocked
      ["2026-12-12", "13:00"], // Sat in season, allowed
      ["2026-12-13", "17:00"], // Sun in season — brain blocks; engine may not
      ["2026-11-14", "15:00"], // Sat before Nov 17 — brain allows; whole-month engine would block
    ];
    const probeConfigs = probes.map(([d, t]) => ({
      event_date: d, start_time: t, guest_count: 20, lane_type: "vip", duration: 2,
      food_package: "pizza_pop", bar_selection: "none", bar_qty: 0, add_ons: [], all_bowling: true, mode: "customer",
    }));
    const pq = await callEngine(url, probeConfigs, "check-estimate --live gate parity", { timeoutMs: 20_000 });
    probes.forEach(([d, t], i) => {
      const local = gate(d, t);
      const engine = pq[i]?.flags?.slot_blocked;
      const mark = local === engine ? "=" : "≠";
      console.log(`  ${d} ${t}: brain-mirror ${local} ${mark} engine ${engine}`);
    });

    console.log("live: rate card probe");
    const card = rateCardFromQuotes(await callEngine(url, rateProbeConfigs(FOOD_PACKAGES), "check-estimate --live rates", { timeoutMs: 20_000 }), FOOD_PACKAGES);
    check("live: rate card readable", !!card);
    if (card) {
      check("live: rate card matches fallback constants", eq({ ...card, source: "fallback", engine_version: undefined }, { ...FALLBACK_RATES, engine_version: undefined }), JSON.stringify(card));
      console.log(`  ${JSON.stringify(card)}`);
    }
  }
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
