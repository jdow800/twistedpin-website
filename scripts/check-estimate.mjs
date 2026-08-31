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
import { LANE_COUNT_IN_LABEL, roundTo5, shapeOption } from "../src/lib/estimate/shape.ts";
import { originAllowed, rateLimited } from "../src/lib/estimate/http.ts";

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
check("48 → four options", planFor(48).keys.length === 4);
check("49 → VIP 3h only", eq(planFor(49).keys, ["vip_3h", "trad_2h", "trad_3h"]) && planFor(49).default === "vip_3h");
check("49 → 3-hour notice", planFor(49).notices.length === 1);
check("59 still standard", planFor(59).regime === "standard");
check("60 → traditional only + ask", planFor(60).regime === "traditional_only" && planFor(60).vip_ask === true);
check("80 → ask", planFor(80).vip_ask === true);
check("85 → no ask", planFor(85).vip_ask === false);
check("100 → traditional only", eq(planFor(100).keys, ["trad_2h", "trad_3h"]));
check("optionSpec trad_3h", eq(optionSpec("trad_3h"), { lane_type: "traditional", hours: 3 }));

console.log("query validation (now = Sun 2026-08-30 CT)");
const NOW = new Date("2026-08-30T15:00:00-05:00");
const q = (s) => validateEstimateQuery(new URLSearchParams(s), NOW);
check("tomorrow → too_soon", q("d=2026-08-31&t=18:00&g=40&f=stars_strikes").code === "too_soon");
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
