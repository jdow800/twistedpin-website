import React from 'react';
import {createRoot} from 'react-dom/client';
import FoodVariance from 'qa:food-variance';
import {versionChanges, unitWord, amount} from 'qa:food-variance-report';
import 'qa:styles';

// The actual FoodVariance screen with synthetic food counts and reports, every
// request intercepted. ?mode=empty | error | rerun-fail, ?admin=0 for a
// manager, ?count=<id> for the deep link.
const params = new URL(location.href).searchParams;
const mode = params.get('mode') || 'reports';
const calls = [];
window.fvQa = {calls, versionChanges, unitWord, amount};

const A = 'count-a', B = 'count-b', C = 'count-c', D = 'count-d', E = 'count-e';
const at = {A: '2026-10-06T15:00:00.000Z', B: '2026-10-13T15:00:00.000Z', C: '2026-10-20T15:00:00.000Z',
  D: '2026-10-21T15:00:00.000Z', E: '2026-10-22T15:00:00.000Z'};

const line = (p) => ({foodClass: 'protein_cheese', unit: 'bag', start: 0, purchased: 0, end: 0, used: 0, theoretical: 0,
  variance: 0, variancePct: 0, varianceDollars: 0, costPerCountUnit: 15.45, recipeUnit: 'oz', yieldUsed: 80, flags: [],
  clean: true, band: 'normal', caseSizeChanged: false, drivers: [], ...p});
const wings = line({skuId: 'wings', name: 'Wings, Jumbo', unit: 'case', start: 4, purchased: 6, end: 3, used: 7,
  theoretical: 5.8, variance: 1.2, variancePct: 20.7, varianceDollars: 162, costPerCountUnit: 135, recipeUnit: 'each',
  yieldUsed: 160, band: 'look', drivers: [{label: 'Wings: 8 Bone-In Wings', units: 4.1, estimate: false},
    {label: 'Stars & Strikes Buffet', units: 1.7, estimate: true}]});
const cheese = (theo, variance, pct, dollars, yieldUsed = 80) => line({skuId: 'grande', name: 'Cheese, Mozzarella, Grande',
  start: 10, end: 4, used: 6, theoretical: theo, variance, variancePct: pct, varianceDollars: dollars, yieldUsed,
  drivers: [{label: 'Large Pizza', units: 6, estimate: false}, {label: 'Large Pizza: Extra Cheese', units: 0.5, estimate: false}]});
const rings = line({skuId: 'rings', name: 'Onion Rings', foodClass: 'bakery_frozen', start: 5, end: 1, used: 4,
  theoretical: 3.75, variance: 0.25, variancePct: 6.7, varianceDollars: 2.19, costPerCountUnit: 8.75, yieldUsed: 40,
  drivers: [{label: 'Beer Battered Onion Rings', units: 3.75, estimate: false}]});
const olives = line({skuId: 'olives', name: 'Olives, Ripe, Sliced', unit: 'can', start: null, end: 2, used: null,
  theoretical: 0.4, variance: null, variancePct: null, varianceDollars: null, costPerCountUnit: null, yieldUsed: 15,
  flags: ['not_in_start', 'no_cost'], clean: false, band: null,
  drivers: [{label: 'Large Pizza: Black Olive', units: 0.4, estimate: true}]});
// Recipes use it, but with no yield the core can't put their share in jugs,
// so it carries no drivers.
const honey = line({skuId: 'honey', name: 'Sauce, Hot Honey', unit: 'jug', start: 2, end: 1, used: 1, theoretical: null,
  variance: null, variancePct: null, varianceDollars: null, costPerCountUnit: 24, recipeUnit: 'floz', yieldUsed: null,
  flags: ['no_yield'], clean: false, band: null});
const report = (grande, net, extra = {}) => ({
  lines: [wings, grande, rings, olives, honey],
  noRecipe: [{skuId: 'oil', name: 'Fryer Oil', unit: 'jug', used: 2, usedDollars: 86.02}],
  totals: {usedDollars: 1162.7, theoreticalDollars: 1162.7 - net, netVarianceDollars: net, variancePct: 14.6,
    cleanLines: 3, flaggedLines: 2},
  completeness: {mappedSalesPct: 96.2, cleanTheoreticalPct: null, incomplete: true,
    reasons: ['1 item(s) sold with no recipe', '2 ingredient(s) left out of the totals', '1 ingredient(s) with no known value']},
  caveats: ['Food rung at the front desk (Brunswick) has no reader yet, so it isn\'t in theoretical.'],
  ...extra,
});
const basis = (md5) => ({engine: 1, computedAt: at.B, window: {start: at.A, end: at.B, days: 7},
  recipes: {md5, dishes: 524, options: 400, problems: 0}, graded: ['grande', 'olives', 'rings', 'wings'],
  purchases: {unsettled: 1, unconverted: [{skuId: 'romaine', name: 'Lettuce, Romaine', lines: 1, deliveries: 1,
    dollars: 32.5, reasons: ['billed by the case with no case size']}]},
  valuation: {grande: 'count_end', rings: 'count_end', wings: 'count_end', olives: 'today'},
  sales: {gotabRows: 812, foodSalesCents: 1450000}, catering: {rows: 3, served: 1, stranded: [], estimates: 1}});

const v = (version, p) => ({version, priorSessionId: A, periodStart: at.A, periodEnd: at.B, status: 'final',
  catchUp: false, reason: null, computedBy: null, createdAt: at.B, finalizedAt: '2026-10-13T18:00:00.000Z', ...p});
let versionsB = [
  v(1, {report: report(cheese(6.5, -0.5, -7.7, -7.73), 156.46), basis: basis('aaa')}),
  v(2, {report: report(cheese(7.25, -1.25, -17.2, -19.31, 71.03), 144.88), basis: basis('bbb'), reason: 'Grande yield corrected',
    computedBy: 'Jon Dow', createdAt: '2026-10-15T14:00:00.000Z', finalizedAt: '2026-10-15T14:00:00.000Z'}),
];
const versionsC = [{version: 1, priorSessionId: B, periodStart: at.B, periodEnd: at.C, status: 'draft', catchUp: false,
  report: report(cheese(6.5, -0.5, -7.7, -7.73), 12), basis: basis('bbb'), reason: null, computedBy: null,
  createdAt: at.C, finalizedAt: null}];
const versionsA = [{version: 1, priorSessionId: null, periodStart: null, periodEnd: at.A, status: 'final', catchUp: false,
  report: {baseline: true}, basis: {baseline: true}, reason: null, computedBy: null, createdAt: at.A, finalizedAt: at.A}];

const summary = (sessionId, vs) => {
  const one = vs[0];
  const base = 'baseline' in one.report;
  return {sessionId, priorSessionId: one.priorSessionId, periodStart: one.periodStart, periodEnd: one.periodEnd,
    baseline: base, status: one.status, catchUp: one.catchUp,
    netVarianceDollars: base ? null : one.report.totals.netVarianceDollars, incomplete: base ? null : one.report.completeness.incomplete,
    mappedSalesPct: base ? null : one.report.completeness.mappedSalesPct, cleanTheoreticalPct: base ? null : one.report.completeness.cleanTheoreticalPct,
    versions: vs.length, createdAt: one.createdAt, finalizedAt: one.finalizedAt};
};
const counts = [
  {id: E, countedBy: 'Sam', isFullCount: false, startedAt: at.E, submittedAt: at.E, lineCount: 4},
  {id: D, countedBy: 'Sam', isFullCount: true, startedAt: at.D, submittedAt: at.D, lineCount: 180},
  {id: C, countedBy: 'Sam', isFullCount: true, startedAt: at.C, submittedAt: at.C, lineCount: 176},
  {id: B, countedBy: 'Sam', isFullCount: true, startedAt: at.B, submittedAt: at.B, lineCount: 171},
  {id: A, countedBy: 'Sam', isFullCount: true, startedAt: at.A, submittedAt: at.A, lineCount: 165},
];

const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.origin);
  const path = url.pathname.replace(/^\/mock/, '').replace(/\/$/, '');
  calls.push({method: init.method || 'GET', path, query: url.search, body: init.body ? JSON.parse(init.body) : null});
  if (path === '/admin/bar/food-variance') {
    if (mode === 'error') return json({error: 'down'}, 500);
    if (mode === 'empty') return json({reports: []});
    return json({reports: [summary(C, versionsC), summary(B, versionsB), summary(A, versionsA)]});
  }
  if (path === '/admin/bar/counts/history') return json({counts: mode === 'empty' ? [] : counts});
  const rerun = path.match(/^\/admin\/bar\/food-variance\/([^/]+)\/rerun$/);
  if (rerun) {
    if (mode === 'rerun-fail') return json({error: 'no_gotab'}, 503);
    const next = versionsB.length + 1;
    versionsB = [...versionsB, v(next, {report: report(cheese(7.25, -1.25, -17.2, -19.31, 71.03), 140.1), basis: basis('ccc'),
      reason: JSON.parse(init.body).reason, computedBy: 'Jon Dow', createdAt: '2026-10-16T14:00:00.000Z',
      finalizedAt: '2026-10-16T14:00:00.000Z'})];
    return json({version: next}, 201);
  }
  const one = path.match(/^\/admin\/bar\/food-variance\/([^/]+)$/);
  if (one) {
    const vs = {[A]: versionsA, [B]: versionsB, [C]: versionsC}[one[1]];
    return vs ? json({sessionId: one[1], versions: vs}) : json({error: 'not_found'}, 404);
  }
  throw new Error('Unexpected fixture request: ' + path);
};

createRoot(document.getElementById('root')).render(<div className="lq-app">
  <header className="lq-header">LOCAL TEST: food variance</header>
  <main className="lq-main">
    <FoodVariance onDone={() => {}} canRerun={params.get('admin') !== '0'} initialCountId={params.get('count')} />
  </main>
</div>);
