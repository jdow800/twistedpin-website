import React from 'react';
import {createRoot} from 'react-dom/client';
import FoodCost, {itemsToPrice, versionLabel, foodCostRows, revalueMessage} from 'qa:food-cost';
import {reasonText, money, pctText, itemMovement} from 'qa:food-cost-report';
import 'qa:styles';

// The actual FoodCost screen with synthetic food brackets, every request
// intercepted. ?mode=empty | error | rerun-fail | revalue-fail, ?admin=0 for a
// manager, ?count=<id> for the deep link.
const params = new URL(location.href).searchParams;
const mode = params.get('mode') || 'reports';
const calls = [];
window.fcQa = {calls, itemsToPrice, versionLabel, foodCostRows, revalueMessage, reasonText, money, pctText, itemMovement};

const A = 'count-a', B = 'count-b', C = 'count-c', D = 'count-d', E = 'count-e';
const at = {A: '2026-10-06T15:00:00.000Z', B: '2026-10-13T15:00:00.000Z', C: '2026-10-20T15:00:00.000Z',
  D: '2026-10-21T15:00:00.000Z', E: '2026-10-22T15:00:00.000Z'};

const item = (p) => ({line: 'food_na', bucket: 'food', unit: 'bag', usedQtyPerDay: null, usedCentsPerDay: null,
  unitCost: {opening: null, closing: null, purchased: null}, flags: [], excluded: false, ...p});
const fries = item({skuId: 'fries', name: 'Fries, Shoestring', opening: {qty: 10, cents: 20000, pricedCents: 20000},
  purchased: {qty: 6, cents: 12000}, closing: {qty: 4, cents: 8000, pricedCents: 8000}, usedQty: 12, usedCents: 24000,
  usedQtyPerDay: 1.714, usedCentsPerDay: 3429, unitCost: {opening: 20, closing: 20, purchased: 20}});
const carnitasJump = item({skuId: 'carnitas', name: 'Pork Carnitas', unit: 'lb', opening: {qty: 10, cents: 4250, pricedCents: 4250},
  purchased: {qty: 0, cents: 0}, closing: {qty: 10, cents: 131750, pricedCents: 131750}, usedQty: 0, usedCents: -127500,
  unitCost: {opening: 4.25, closing: 131.75, purchased: null}, flags: ['cost_jump'], excluded: true});
const salsaUnpriced = item({skuId: 'salsa', name: 'Salsa, Mild', unit: 'jar', opening: {qty: 3, cents: null, pricedCents: 0},
  purchased: {qty: 0, cents: 0}, closing: {qty: 1, cents: 250, pricedCents: 250}, usedQty: 2, usedCents: null, flags: ['unpriced']});
const syrup = item({skuId: 'syrup', name: 'Syrup, Pepsi BIB', bucket: 'na_beverage', unit: 'bib', opening: {qty: 2, cents: 23190, pricedCents: 23190},
  purchased: {qty: 2, cents: 23190}, closing: {qty: 1, cents: 11595, pricedCents: 11595}, usedQty: 3, usedCents: 34785});
const napkins = item({skuId: 'napkins', name: 'Napkins, Dinner', line: 'paper', bucket: 'paper', unit: 'case',
  opening: {qty: 2, cents: 10000, pricedCents: 10000}, purchased: {qty: 1, cents: 5000}, closing: {qty: 1.4, cents: 7000, pricedCents: 7000},
  usedQty: 1.6, usedCents: 8000});
const limes = item({skuId: 'limes', name: 'Limes, Fresh', line: 'bar_produce', bucket: 'bar_consumable', unit: 'each',
  opening: {qty: 50, cents: 500, pricedCents: 500}, purchased: {qty: 100, cents: 1000}, closing: {qty: 30, cents: 300, pricedCents: 300},
  usedQty: 120, usedCents: 1200});

const totals = (o, p, c) => ({openingCents: o, purchasesCents: p, closingCents: c, cogsCents: o + p - c});
const zeroLine = (key) => ({key, ...totals(0, 0, 0), cogsPerDayCents: 0, byBucket: {},
  purchases: {matched: 0, vendorItem: 0, estimated: 0, freight: 0, discounts: 0, flaggedCents: 0}, items: [], reasons: []});
const BRUNSWICK = 'Brunswick front-desk food has no reader yet: about 4.7% of F&B, roughly 1.4 points on a 30% line.';

/** A bracket's report; `fixed` = after the carnitas and salsa were revalued. */
const report = ({fixed = false, rebatesKnown = false, pct = 30.71, usarPct = 29.46, extraReasons = [], reasons = []} = {}) => {
  const carnitas = fixed
    ? {...carnitasJump, closing: {qty: 10, cents: 4392, pricedCents: 4392}, usedCents: -142, unitCost: {opening: 4.25, closing: 4.39, purchased: null}, flags: [], excluded: false}
    : carnitasJump;
  const salsa = fixed ? {...salsaUnpriced, opening: {qty: 3, cents: 750, pricedCents: 750}, usedCents: 500, flags: []} : salsaUnpriced;
  const foodReasons = [
    ...(fixed ? [] : [{code: 'unpriced', items: [{skuId: 'salsa', name: 'Salsa, Mild', end: 'opening', qty: 3}]},
      {code: 'cost_jump', items: [{skuId: 'carnitas', name: 'Pork Carnitas', unitCost: carnitasJump.unitCost}]}]),
    ...(rebatesKnown ? [] : [{code: 'rebates_unknown', dates: [{salesDate: '2026-10-08', why: 'no_document'}, {salesDate: '2026-10-09', why: 'no_document'}]}]),
    ...extraReasons,
  ];
  const provisional = foodReasons.length > 0 || reasons.length > 0;
  return {
    period: {start: at.A, end: at.B, days: 7},
    lines: {
      food_na: {key: 'food_na', ...totals(52000, 150000, 30000), cogsPerDayCents: 24571,
        byBucket: {food: totals(20000, 110000, 8250), na_beverage: totals(32000, 40000, 21750)},
        purchases: {matched: 140000, vendorItem: 5000, estimated: 3000, freight: 2500, discounts: -500, flaggedCents: 4000},
        items: [fries, carnitas, salsa, syrup], reasons: foodReasons},
      paper: {key: 'paper', ...totals(10000, 5000, 7000), cogsPerDayCents: 1143, byBucket: {paper: totals(10000, 5000, 7000)},
        purchases: {matched: 5000, vendorItem: 0, estimated: 0, freight: 0, discounts: 0, flaggedCents: 0}, items: [napkins], reasons: []},
      supplies: {...zeroLine('supplies'), ...totals(0, 2500, 0), cogsPerDayCents: 357,
        purchases: {matched: 0, vendorItem: 2500, estimated: 0, freight: 0, discounts: 0, flaggedCents: 0}},
      bar_produce: {key: 'bar_produce', ...totals(500, 1000, 300), cogsPerDayCents: 171, byBucket: {bar_consumable: totals(500, 1000, 300)},
        purchases: {matched: 1000, vendorItem: 0, estimated: 0, freight: 0, discounts: 0, flaggedCents: 0}, items: [limes], reasons: []},
      unbucketed: zeroLine('unbucketed'),
    },
    foodNa: {cogsBeforeRebatesCents: 172000, rebateCents: 0, cogsAfterRebatesCents: 172000,
      sales: {gotabCents: 520000, cateringCents: 40000, totalCents: 560000, mocktailsOutCents: 4008,
        beside: [{stream: 'Discounts', name: 'Employees 50% off', cents: -9886}, {stream: 'Open Discounts', name: 'Happy Hour: 30% off $15+, up to $7', cents: -1010}]},
      pct, target: 30, band: [28, 34], inBand: true,
      usar: {cogsCents: 165000, pct: usarPct, staffMealsCents: 4000, staffTrainingCompsCents: 1500, guestRecoveryCompsCents: 1500,
        provisional: !fixed, unvalued: fixed ? [] : [{name: 'Icees', qty: 3, why: 'no recipe'}]}},
    covers: 400, paperPerCoverCents: 20, provisional, reasons,
    caveats: [BRUNSWICK, "1 invoice(s) aren't settled: purchased quantities leave them out, their dollars don't."],
    evidence: {openingCountId: A, closingCountId: B, invoiceIds: ['inv-1'], rebateDocIds: [], estimateRefs: []},
  };
};
const basis = {engine: 1, computedAt: at.B, window: {start: at.A, end: at.B},
  counts: {openingId: A, closingId: B, openingResolved: true, closingResolved: true, transientEstimates: 0}, firstCountAt: at.A,
  invoices: {counted: ['inv-1'], pending: [], beforeFirstCount: []}, rebates: {docs: [], unknownDates: ['2026-10-08', '2026-10-09']},
  catering: {recognised: [], pending: [], stranded: []}, recipes: {md5: 'aaa', dishes: 315, options: 400}, ledger: {rows: 812, adjustments: 40}};

const v = (version, p) => ({version, priorSessionId: A, periodStart: at.A, periodEnd: at.B, status: 'final', catchUp: false,
  trigger: 'sweep', report: report(), basis, reason: null, computedBy: null, createdAt: at.B, finalizedAt: '2026-10-13T18:00:00.000Z', ...p});
let versionsB = [
  v(3, {trigger: 'cleared', report: report({fixed: true, rebatesKnown: true, pct: 31.02, usarPct: 29.79}), reason: 'Brunswick read for 2026-10-08, 2026-10-09.',
    createdAt: '2026-10-16T14:00:00.000Z', finalizedAt: '2026-10-16T14:00:00.000Z'}),
  v(2, {trigger: 'revalue', report: report({fixed: true, pct: 31.02, usarPct: 29.79}), reason: 'case price frozen as a pound price',
    computedBy: 'Jon Dow', createdAt: '2026-10-15T14:00:00.000Z', finalizedAt: '2026-10-15T14:00:00.000Z'}),
  v(1, {}),
];
const draftReport = () => {
  const r = report({extraReasons: [{code: 'catering_pending', bookingIds: ['bk-1']}], reasons: [{code: 'pending_invoices', invoiceIds: ['inv-9']}]});
  r.lines.food_na.reasons[0] = {code: 'unpriced', items: [{skuId: 'salsa', name: 'Salsa, Mild', end: 'closing', qty: 2}]};
  return r;
};
const versionsC = [{version: 1, priorSessionId: B, periodStart: at.B, periodEnd: at.C, status: 'draft', catchUp: false, trigger: 'sweep',
  report: draftReport(), basis, reason: null, computedBy: null, createdAt: at.C, finalizedAt: null}];
const versionsA = [{version: 1, priorSessionId: null, periodStart: null, periodEnd: at.A, status: 'final', catchUp: false, trigger: 'sweep',
  report: {baseline: true}, basis: {baseline: true}, reason: null, computedBy: null, createdAt: at.A, finalizedAt: at.A}];

const summary = (sessionId, vs) => {
  const latest = vs[0];
  const base = 'baseline' in latest.report;
  return {sessionId, priorSessionId: latest.priorSessionId, periodStart: latest.periodStart, periodEnd: latest.periodEnd,
    baseline: base, version: latest.version, versions: vs.length, status: latest.status, catchUp: latest.catchUp, trigger: latest.trigger,
    provisional: base ? null : latest.report.provisional, foodNaCogsPct: base ? null : latest.report.foodNa.pct,
    foodNaSalesCents: base ? null : latest.report.foodNa.sales.totalCents, foodNaCogsCents: base ? null : latest.report.foodNa.cogsAfterRebatesCents,
    createdAt: latest.createdAt, finalizedAt: latest.finalizedAt};
};
const counts = [
  {id: E, countedBy: 'Sam', isFullCount: false, startedAt: at.E, submittedAt: at.E, lineCount: 4},
  {id: D, countedBy: 'Sam', isFullCount: true, startedAt: at.D, submittedAt: at.D, lineCount: 180},
  {id: C, countedBy: 'Sam', isFullCount: true, startedAt: at.C, submittedAt: at.C, lineCount: 176},
  {id: B, countedBy: 'Sam', isFullCount: true, startedAt: at.B, submittedAt: at.B, lineCount: 171},
  {id: A, countedBy: 'Sam', isFullCount: true, startedAt: at.A, submittedAt: at.A, lineCount: 165},
];
const costLine = (p) => ({zoneName: 'Walk in Cooler', countUnit: 'each', unitLabel: 'bag', basis: 'observed', estimateSource: null,
  transient: false, suggestion: null, ...p});
const costs = {
  [B]: [
    costLine({lineId: 'b-fries', skuId: 'fries', name: 'Fries, Shoestring', qty: 4, cost: 20, valueCents: 8000}),
    costLine({lineId: 'b-carnitas-1', skuId: 'carnitas', name: 'Pork Carnitas', qty: 6, unitLabel: 'lb', cost: 4.25, valueCents: 2550}),
  ],
  [C]: [
    costLine({lineId: 'c-salsa', skuId: 'salsa', name: 'Salsa, Mild', qty: 2, unitLabel: 'jar', cost: null, basis: 'unpriced', valueCents: null,
      suggestion: {cost: 2.5, source: 'cost_history'}}),
    costLine({lineId: 'c-carnitas-1', skuId: 'carnitas', name: 'Pork Carnitas', qty: 6, unitLabel: 'lb', cost: 131.75, valueCents: 79050}),
    costLine({lineId: 'c-carnitas-2', skuId: 'carnitas', name: 'Pork Carnitas', qty: 4, unitLabel: 'lb', zoneName: 'Walk in Freezer', cost: 131.75, valueCents: 52700}),
    costLine({lineId: 'c-fries', skuId: 'fries', name: 'Fries, Shoestring', qty: 3, cost: 20, valueCents: 6000}),
  ],
};

const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.origin);
  const path = url.pathname.replace(/^\/mock/, '').replace(/\/$/, '');
  calls.push({method: init.method || 'GET', path, query: url.search, body: init.body ? JSON.parse(init.body) : null});
  if (path === '/admin/bar/food-cogs') {
    if (mode === 'error') return json({error: 'down'}, 500);
    if (mode === 'empty') return json({reports: []});
    return json({reports: [summary(C, versionsC), summary(B, versionsB), summary(A, versionsA)]});
  }
  if (path === '/admin/bar/counts/history') return json({counts: mode === 'empty' ? [] : counts});
  const rerun = path.match(/^\/admin\/bar\/food-cogs\/([^/]+)\/rerun$/);
  if (rerun) {
    if (mode === 'rerun-fail') return json({error: 'no_gotab'}, 503);
    const next = versionsB[0].version + 1;
    versionsB = [v(next, {trigger: 'rerun', report: report({fixed: true, rebatesKnown: true, pct: 30.95, usarPct: 29.7}),
      reason: JSON.parse(init.body).reason, computedBy: 'Jon Dow', createdAt: '2026-10-17T14:00:00.000Z', finalizedAt: '2026-10-17T14:00:00.000Z'}), ...versionsB];
    return json({version: next}, 201);
  }
  const one = path.match(/^\/admin\/bar\/food-cogs\/([^/]+)$/);
  if (one) {
    const vs = {[A]: versionsA, [B]: versionsB, [C]: versionsC}[one[1]];
    return vs ? json({sessionId: one[1], versions: vs}) : json({error: 'not_found'}, 404);
  }
  const cost = path.match(/^\/admin\/bar\/counts\/([^/]+)\/costs$/);
  if (cost) return costs[cost[1]] ? json({sessionId: cost[1], resolved: cost[1] === B, lines: costs[cost[1]]}) : json({error: 'not_found'}, 404);
  const revalue = path.match(/^\/admin\/bar\/counts\/([^/]+)\/revalue$/);
  if (revalue) {
    if (mode === 'revalue-fail') return json({error: 'no_gotab'}, 503);
    const body = JSON.parse(init.body);
    // C closes a draft: nothing re-versions. B closes a frozen bracket: it gets a new version.
    return json({revalued: body.changes.length, versions: revalue[1] === B ? [{sessionId: B, version: versionsB[0].version + 1}] : []});
  }
  throw new Error('Unexpected fixture request: ' + path);
};

createRoot(document.getElementById('root')).render(<div className="lq-app">
  <header className="lq-header">LOCAL TEST: food cost</header>
  <main className="lq-main">
    <FoodCost onDone={() => {}} canManage={params.get('admin') !== '0'} initialCountId={params.get('count')} />
  </main>
</div>);
