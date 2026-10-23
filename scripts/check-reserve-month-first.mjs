/** /reserve parallel day/month discovery: real booking components and typed HTTP client.
 * Deliberately separate from the unchanged legacy first-day regression suite.
 * No backend, customer data, holds, payment provider or external requests.
 * Run: node scripts/check-reserve-month-first.mjs
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const site = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(site, '.astro/reserve-month-first');
await mkdir(output, { recursive: true });
const id = code => `00000000-0000-4000-8000-${String(code).padStart(12, '0')}`;
const products = [
  [4, 'Traditional 1 hour', 60], [5, 'Traditional 2 hours', 120],
  [121, 'VIP 1 hour', 60], [123, 'VIP 2 hours', 120],
  [109, 'Traditional Birthday', 120], [118, 'Suite Birthday', 150],
].map(([code, name, durationMinutes]) => ({
  id: id(code), code, name, durationMinutes, defaultPriceCents: 9995,
  description: '', shortDescription: '', minQuantityPerBooking: 1,
  maxQuantityPerBooking: code >= 109 && code <= 118 ? 1 : 3,
  salesCutoffMinutesBefore: 45, thumbnailUrl: null, heroImageUrl: null, addOnProducts: [],
}));
const categories = [
  { slug: 'traditional_lanes', label: 'Traditional lanes', subtitle: 'Shoes included', products: products.filter(p => [4, 5].includes(p.code)) },
  { slug: 'vip_suite', label: 'VIP suite', subtitle: 'Shoes included', products: products.filter(p => [121, 123].includes(p.code)) },
  { slug: 'birthday_parties', label: 'Birthday parties', subtitle: 'Celebrate together', products: products.filter(p => [109, 118].includes(p.code)) },
];
const source = `
import React, {useState,useCallback} from 'react';import {createRoot} from 'react-dom/client';
import './src/styles/global.css';import './src/components/tprs/tprs.css';
import BookingWizard from './src/components/tprs/BookingWizard.tsx';
import MainStep from './src/components/tprs/steps/MainStep.tsx';
import {bookingPageConfig,birthdaysPageConfig} from './src/tprs/pageConfig.ts';
const settings=JSON.parse(sessionStorage.getItem('fixture-settings')||'{}');
const config=settings.birthday?birthdaysPageConfig:bookingPageConfig;
window.fixturePicks=[];
function MainFixture(){const[date,setDate]=useState(settings.date??'2026-10-22');window.fixtureSetDate=setDate;window.fixtureDate=date;
 const pickDate=useCallback(next=>{window.fixturePicks.push(next);setDate(next);},[]);
 return <div className="tprs-wizard"><MainStep reserveFastStart={settings.reserveFastStart??true} reserveMonthFirst={settings.reserveMonthFirst??true} specialDates={settings.specialDates} productCodes={config.productCodes} tileCards={config.tileCards} selectedDate={date} partySize={null} onPartySize={()=>{}} onPickDate={pickDate} onSelectProduct={()=>{}}/></div>;}
const root=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>root.unmount();
let mountVersion=0;window.fixtureRemount=()=>root.render(<MainFixture key={++mountVersion}/>);
root.render(settings.mode==='main'?<MainFixture/>:<BookingWizard config={config} reserveFastStart={settings.reserveFastStart??true} reserveMonthFirst={settings.reserveMonthFirst??true}/>);
`;
const built = await build({
  stdin: { contents: source, loader: 'tsx', resolveDir: site },
  bundle: true, platform: 'browser', format: 'iife', write: false, jsx: 'automatic', outdir: output,
  external: ['/snap/*', '/pattern/*'], loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
  define: { 'import.meta.env.PUBLIC_TPRS_API_BASE': '"/tprs-api"', 'import.meta.env.PUBLIC_NYE_REHEARSAL': 'false', 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'offline-stripe', setup(b) {
    b.onResolve({ filter: /^@stripe\/react-stripe-js$/ }, () => ({ path: 'react', namespace: 'offline-stripe' }));
    b.onResolve({ filter: /^\.\.?\/stripe$/ }, () => ({ path: 'stripe', namespace: 'offline-stripe' }));
    b.onLoad({ filter: /.*/, namespace: 'offline-stripe' }, args => ({ loader: 'tsx', resolveDir: site, contents: args.path === 'stripe'
      ? 'export const STRIPE_AVAILABLE=false;export const STRIPE_APPEARANCE={};export function getStripe(){return null;}'
      : `import React from 'react';export function Elements({children}){return children;}export function PaymentElement(){return null;}export function useStripe(){return null;}export function useElements(){return null;}` }));
  } }],
});
const js = built.outputFiles.find(f => f.path.endsWith('.js')).text;
const css = built.outputFiles.find(f => f.path.endsWith('.css')).text;
const html = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Availability regression fixture</title><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>';
const localArtwork = /^\/(snap|pattern)\/[a-z0-9_/-]+\.(avif|webp|png|svg|jpg)$/i;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  if (localArtwork.test(path)) {
    try {
      const bytes = await readFile(resolve(site, 'public', path.slice(1)));
      res.setHeader('Content-Type', path.endsWith('.svg') ? 'image/svg+xml' : `image/${path.split('.').pop()}`);
      res.end(bytes); return;
    } catch { res.writeHead(404); res.end(); return; }
  }
  res.setHeader('Content-Type', path === '/fixture.js' ? 'text/javascript' : path === '/fixture.css' ? 'text/css' : 'text/html; charset=utf-8');
  res.end(path === '/fixture.js' ? js : path === '/fixture.css' ? css : html);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const results = [], pageErrors = [], unexpected = [], timings = [];
let browser, activeFixture;
const delay = ms => new Promise(done => setTimeout(done, ms));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function monthData(month, options = {}) {
  const count = new Date(`${month}-01T12:00:00Z`); count.setUTCMonth(count.getUTCMonth() + 1); count.setUTCDate(0);
  return { days: Array.from({ length: count.getUTCDate() }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { date, available: options.openDates ? options.openDates.includes(date) : date >= '2026-10-22' && (options.birthday || date <= '2026-11-03'), priceCents: 9995 };
  }), policiesByDate: options.policiesByDate ?? {} };
}

const TODAY = '2026-10-22', TOMORROW = '2026-10-23', LATER = '2026-10-24';
const CODES = [4, 5, 121, 123];
const productButton = (page, name = 'Traditional 2 hours') => page.locator('.tprs-cats').getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\b|$)`) });
const dayCalls = (state, date, code) => state.calls.filter(c => c.path.endsWith('/availability') && (!date || c.date === date) && (!code || c.id === id(code)));
const monthCalls = state => state.calls.filter(c => c.path.endsWith('/availability/month'));
const flatCalls = state => state.calls.filter(c => c.path.endsWith('/products'));
const catalogCalls = state => state.calls.filter(c => c.path.endsWith('/products/bookable'));
async function waitFor(check, message, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!check() && Date.now() < deadline) await delay(20);
  assert.ok(check(), message);
}
async function ready(page, name) { await productButton(page, name).click({ trial: true }); }
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow'); }

// Entirely synthetic accepted order; no processor SDK is initialized by this harness.
const accepted = {
  attemptId: id(90), recoveryToken: 'synthetic-recovery', paymentIntentId: 'pi_fixture', status: 'processing', paymentReady: true,
  originalRequest: { customer: { firstName: 'Test', lastName: 'Guest', email: 'synthetic@example.invalid', phone: '8155550100', zip: '60544', smsMarketingOptIn: false }, eventDate: TODAY, startTime: `${TODAY}T15:00:00-05:00`, items: [{ productId: id(5), quantity: 1, cartLineRef: 'lane' }], attemptKey: 'synthetic-key', acceptedTerms: true },
  originalOrder: { cartToken: 'synthetic-cart', eventDate: TODAY, startTime: `${TODAY}T15:00:00-05:00`, paymentType: 'full', items: [{ productId: id(5), quantity: 1, cartLineRef: 'lane' }], paymentIntentId: 'pi_fixture', acceptedTerms: true },
  financialSnapshot: { subtotalExcludingTax: 9995, totalIncludingTax: 9995, taxBreakdown: { shoesRentalSubtotal: 0, shoesRentalTax: 0, foodBeverageSubtotal: 0, foodBeverageTax: 0, untaxedSubtotal: 9995, totalTax: 0 }, lineItems: [{ name: 'Accepted bowling', quantity: 1, unitPrice: 9995, lineTotal: 9995, isFee: false }] },
  endTime: `${TODAY}T22:00:00.000Z`,
};

async function fresh(settings = {}, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'America/Chicago', reducedMotion: 'reduce' });
  const state = { calls: [], gates: new Map(), monthGate: settings.holdMonth ? deferred() : null, discoveryGate: settings.holdDiscovery ? deferred() : null, catalogVariants: [...settings.catalogVariants ?? []], flatVariants: [...settings.flatVariants ?? []], monthGates: new Map(), monthVariants: structuredClone(settings.monthVariants ?? {}), dayVariants: structuredClone(settings.dayVariants ?? {}), monthPolicies: settings.policiesByDate ?? {} };
  for (const hold of settings.holdDays ?? []) for (const code of hold.codes ?? CODES) state.gates.set(`${hold.date}:${code}`, deferred());
  for (const code of settings.holdMonthCodes ?? []) state.monthGates.set(code, deferred());
  state.releaseMonth = (codes = CODES) => codes.forEach(code => { state.monthGates.get(code)?.resolve(); state.monthGates.delete(code); });
  state.release = (date, codes = CODES) => codes.forEach(code => { state.gates.get(`${date}:${code}`)?.resolve(); state.gates.delete(`${date}:${code}`); });
  await context.addInitScript(settings => { sessionStorage.setItem('fixture-settings', JSON.stringify(settings)); }, settings);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace(/\/$/, '');
    if (url.origin !== base) { unexpected.push(url.href); return route.abort(); }
    if (!path.startsWith('/tprs-api/')) {
      if (['/', '/fixture.js', '/fixture.css'].includes(path) || path.startsWith('/reserve') || localArtwork.test(path)) return route.continue();
      return route.fulfill({ status: 204, body: '' });
    }
    const call = { path, method: request.method(), date: url.searchParams.get('date'), month: url.searchParams.get('month'), id: url.searchParams.get('product_id'), started: Date.now(), completed: false };
    state.calls.push(call);
    if (settings.delayMs) await delay(path.endsWith('/availability/month') ? settings.delayMs.month ?? 0 : path.endsWith('/availability') ? settings.delayMs.day ?? 0 : settings.delayMs.other ?? 0);
    const respond = async (body, status = 200) => {
      try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); call.completed = true; }
      catch { /* Closing a fixture is allowed to cancel deliberately held reads. */ }
    };
    if (path.endsWith('/checkout/attempt-active') && call.method === 'POST') {
      if (state.discoveryGate) await state.discoveryGate.promise;
      if (settings.discoveryError) return respond({ error: 'Synthetic recovery read failure' }, 503);
      return respond({ attempt: settings.accepted ? accepted : null });
    }
    if (call.method !== 'GET') { unexpected.push(`${call.method} ${path}`); return respond({ error: 'Mutation forbidden by fixture' }, 500); }
    if (path.endsWith('/products/bookable')) {
      const variant = state.catalogVariants.shift();
      if (variant === 'error') return respond({ error: 'Synthetic grouped catalog failure' }, 503);
      if (variant === 'empty') return respond({ categories: [] });
      if (variant === 'partial') return respond({ categories: categories.map(cat => ({ ...cat, products: cat.products.filter(p => p.code !== 5) })) });
      return respond({ categories });
    }
    if (path.endsWith('/products')) {
      const codes = url.searchParams.get('codes').split(',').map(Number);
      const variant = state.flatVariants.shift();
      if (variant === 'empty') return respond({ products: [] });
      const omitted = variant === 'partial' ? 5 : variant === 'missing-group-member' ? 123 : null;
      return respond({ products: products.filter(p => codes.includes(p.code) && p.code !== omitted) });
    }
    if (path.endsWith('/availability/month')) {
      if (state.monthGate) await state.monthGate.promise;
      const code = Number(call.id.slice(-12));
      const gate = state.monthGates.get(code); if (gate) await gate.promise;
      if (state.monthVariants[code]?.shift() === 'error') return respond({ error: 'Synthetic month failure' }, 503);
      return respond(monthData(call.month, { ...settings, policiesByDate: state.monthPolicies, openDates: settings.monthByCode?.[code] ?? settings.monthOpenDates ?? [TODAY, TOMORROW, LATER] }));
    }
    if (path.endsWith('/availability')) {
      const code = Number(call.id.slice(-12));
      const gate = state.gates.get(`${call.date}:${code}`); if (gate) await gate.promise;
      const next = state.dayVariants[call.date + ':' + code]?.shift();
      const rule = next === 'error' ? { error: true } : next === 'normal' ? {} : settings.days?.[call.date] ?? {};
      if (rule.errorCodes?.includes(code) || rule.error) return respond({ error: 'Synthetic date read failure' }, 503);
      const available = rule.availableCodes ? rule.availableCodes.includes(code) : rule.available ?? true;
      const policy = rule.policies?.[code] ?? null;
      return respond({ slots: [{ time: call.date === TOMORROW ? '16:00' : '15:00', priceCents: 9995, available }], policy });
    }
    if (/\/products\/[^/]+\/forms$/.test(path)) return respond({ forms: [] });
    if (path.endsWith('/availability/slot')) return respond({ maxUnits: 3 });
    unexpected.push(`Unstubbed ${call.method} ${path}`); return respond({ error: 'Unstubbed read' }, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.clock.setFixedTime(new Date(settings.now ?? '2026-10-22T17:00:00Z'));
  state.navigationStarted = performance.now();
  await page.goto(`${base}/reserve/${settings.query ?? ''}`);
  activeFixture = { page, state, close: async () => {
    state.gates.forEach(gate => gate.resolve()); state.monthGates.forEach(gate => gate.resolve()); state.monthGate?.resolve(); state.discoveryGate?.resolve(); await context.close();
  } };
  return activeFixture;
}

async function record(name, run) {
  await run(); results.push(name); console.log(`PASS ${name}`);
}
const chip = (page, day) => page.locator('.tprs-chip').filter({ has: page.locator('.tprs-chip-day', { hasText: new RegExp(`^${Number(day.slice(-2))}$`) }) });
const settled = (calls) => calls.length > 0 && calls.every(call => call.completed);
async function selectDate(f, date) {
  await chip(f.page, date).click();
  await f.page.waitForFunction(value => window.fixtureDate === value, date);
}
async function noAutomaticMove(f, date = TODAY) {
  await delay(120);
  assert.equal(await f.page.evaluate(() => window.fixtureDate), date);
  assert.equal(dayCalls(f.state).some(call => call.date !== date), false, 'no automatic exact-date scanning');
}

try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });

  await record('startup starts four exact days and four months before either group can settle', async () => {
    const f = await fresh({ mode: 'main', holdMonth: true, holdDays: [{ date: TODAY }] });
    await waitFor(() => monthCalls(f.state).length === 4 && dayCalls(f.state, TODAY).length === 4, 'both initial groups start independently');
    await delay(1400);
    assert.equal(dayCalls(f.state).length, 4, 'exact requests are immediate and never duplicated by a timer');
    assert.equal(dayCalls(f.state).some(call => call.completed), false);
    assert.equal(monthCalls(f.state).some(call => call.completed), false);
    assert.equal(flatCalls(f.state).length, 0, 'complete grouped catalog supplies identities');
    assert.equal(f.state.calls.length, 9, 'one catalog plus four exact days and four months');
    assert.equal(await productButton(f.page).isEnabled(), false);
    f.state.release(TODAY, [5]); await ready(f.page);
    assert.equal(monthCalls(f.state).some(call => call.completed), false, 'an early exact positive reveals a card before month results');
    f.state.monthGate.resolve();
    await ready(f.page);
    assert.equal(dayCalls(f.state, TODAY).length, 4, 'month verdicts reuse the already running exact group');
    assert.equal(dayCalls(f.state).filter(call => call.completed).length, 1, 'month-positive siblings do not wait for remaining exact reads');
    await ready(f.page, 'VIP 2 hours');
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    await f.close();
  });

  await record('month results reveal progressively while the immediate exact group remains pending', async () => {
    const f = await fresh({ mode: 'main', holdMonthCodes: CODES, holdDays: [{ date: TODAY }], monthByCode: { 4: [], 5: [TODAY], 121: [], 123: [] } });
    await waitFor(() => monthCalls(f.state).length === 4 && dayCalls(f.state, TODAY).length === 4, 'parallel groups started');
    f.state.releaseMonth([5]); await ready(f.page);
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1, 'positive product already has an exact request');
    assert.equal(monthCalls(f.state).filter(call => call.completed).length, 1);
    assert.equal(dayCalls(f.state).length, 4);
    f.state.releaseMonth(); await waitFor(() => settled(monthCalls(f.state)), 'negative siblings settled');
    await delay(100);
    assert.equal(dayCalls(f.state).length, 4, 'month settlement adds no duplicate exact reads');
    assert.equal(await productButton(f.page, 'Traditional 1 hour').count(), 0);
    await f.close();
  });

  await record('after-hours Thursday advances after exact denials and reveals Friday before its exact reads settle', async () => {
    const f = await fresh({ mode: 'main', now: '2026-10-23T04:30:00Z', holdMonth: true, holdDays: [{ date: TODAY }, { date: TOMORROW }], monthOpenDates: [TOMORROW, LATER], days: { [TODAY]: { available: false } } });
    await waitFor(() => monthCalls(f.state).length === 4 && dayCalls(f.state, TODAY).length === 4, 'parallel groups started');
    f.state.monthGate.resolve();
    await waitFor(() => settled(monthCalls(f.state)), 'month verdicts available');
    await delay(100);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY, 'monthly denial cannot preempt unresolved exact today');
    assert.equal(dayCalls(f.state, TOMORROW).length, 0);
    f.state.release(TODAY);
    await f.page.waitForFunction(date => window.fixtureDate === date, TOMORROW);
    await ready(f.page);
    await waitFor(() => dayCalls(f.state, TOMORROW).length === 4, 'Friday exact prefetch');
    assert.equal(dayCalls(f.state, TODAY).length, 4, 'one exact today group, with no duplicate');
    assert.equal(dayCalls(f.state, TOMORROW).some(call => call.completed), false, 'Friday card does not wait for exact responses');
    assert.doesNotMatch(await f.page.locator('.tprs-datestrip-note').innerText(), /booked out|sold out/i);
    await noOverflow(f.page);
    await f.page.screenshot({ path: resolve(output, 'friday-ready-390.png'), fullPage: true });
    await f.close();
  });

  await record('monthly-negative today waits for a late exact positive and keeps the selected date', async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TODAY }], monthOpenDates: [TOMORROW, LATER], days: { [TODAY]: { availableCodes: [5] } } });
    await waitFor(() => settled(monthCalls(f.state)) && dayCalls(f.state, TODAY).length === 4, 'negative month arrives before exact results');
    await delay(100);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    assert.equal(dayCalls(f.state, TOMORROW).length, 0);
    f.state.release(TODAY, [5]); await ready(f.page);
    f.state.release(TODAY); await waitFor(() => settled(dayCalls(f.state, TODAY)), 'exact siblings settled');
    await noAutomaticMove(f);
    assert.deepEqual(await f.page.evaluate(() => window.fixturePicks), []);
    await f.close();
  });

  await record('recovery discovery gates startup, and a card click joins its in-flight exact prefetch', async () => {
    const f = await fresh({ holdDiscovery: true, holdDays: [{ date: TODAY }] });
    await waitFor(() => f.state.calls.length === 1, 'payment recovery discovery');
    await delay(100); assert.equal(f.state.calls.length, 1);
    f.state.discoveryGate.resolve(); await ready(f.page);
    await waitFor(() => dayCalls(f.state, TODAY).length === 4, 'month-positive prefetch group');
    await productButton(f.page).click();
    await f.page.getByText('Loading times…', { exact: true }).waitFor();
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1, 'click joins existing request');
    assert.equal(await f.page.getByRole('option').count(), 0, 'month truth never invents time choices');
    f.state.release(TODAY, [5]);
    await f.page.getByRole('option', { name: /3:00/ }).waitFor();
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1);
    assert.equal(dayCalls(f.state).some(call => call.date !== TODAY), false, 'no detail week prefetch');
    assert.equal(f.state.calls.some(call => call.path.endsWith('/availability/slot')), false);
    await noOverflow(f.page); await f.close();
  });

  await record('settled exact prefetch is reused on detail at narrow mobile width', async () => {
    const f = await fresh({}, 320);
    await ready(f.page);
    await waitFor(() => settled(dayCalls(f.state, TODAY)), 'prefetch complete');
    await productButton(f.page).click();
    await f.page.getByRole('option', { name: /3:00/ }).waitFor();
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1);
    assert.equal(monthCalls(f.state).length, 4, 'detail reuses month cache');
    assert.equal(dayCalls(f.state).some(call => call.date !== TODAY), false);
    await noOverflow(f.page);
    await f.page.screenshot({ path: resolve(output, 'detail-ready-320.png'), fullPage: true });
    await f.close();
  });

  for (const kind of ['negative', 'policy']) await record(`late exact ${kind} overrides the earlier positive month card`, async () => {
    const rule = kind === 'negative' ? { availableCodes: [4, 121, 123] }
      : { policies: { 5: { code: 'date_removed', message: 'Synthetic exact-date restriction.' } } };
    const f = await fresh({ mode: 'main', holdDays: [{ date: TODAY }], days: { [TODAY]: rule } });
    await ready(f.page); await waitFor(() => dayCalls(f.state, TODAY, 5).length === 1, 'target exact read pending');
    f.state.release(TODAY, [5]);
    await waitFor(() => settled(dayCalls(f.state, TODAY, 5)), 'exact denial delivered');
    await productButton(f.page).waitFor({ state: 'detached' });
    if (kind === 'policy') await f.page.getByText('Synthetic exact-date restriction.', { exact: true }).waitFor();
    await ready(f.page, 'VIP 2 hours');
    await noAutomaticMove(f);
    await f.close();
  });

  await record('an early exact negative remains unavailable when a positive month arrives later', async () => {
    const f = await fresh({ mode: 'main', holdMonth: true, days: { [TODAY]: { availableCodes: [4, 121, 123] } } });
    await waitFor(() => settled(dayCalls(f.state, TODAY)), 'exact results arrive before months');
    await ready(f.page, 'VIP 2 hours');
    assert.equal(await productButton(f.page).count(), 0, 'exact denial removes the target card');
    f.state.monthGate.resolve(); await waitFor(() => settled(monthCalls(f.state)), 'later monthly positives delivered');
    await delay(100);
    assert.equal(await productButton(f.page).count(), 0, 'later monthly positive cannot replace exact negative truth');
    await noAutomaticMove(f); await f.close();
  });

  await record('all late exact negatives keep today selected and offer working next-day rows', async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TODAY }, { date: TOMORROW }], days: { [TODAY]: { available: false } } });
    await ready(f.page);
    await waitFor(() => dayCalls(f.state, TODAY).length === 4, 'monthly-positive cards have started exact prefetch');
    f.state.release(TODAY);
    await waitFor(() => settled(dayCalls(f.state, TODAY)), 'all exact results deny today');
    await f.page.getByText('Sitting this one out', { exact: true }).waitFor();
    await noAutomaticMove(f);
    assert.equal(await f.page.locator('.tprs-cats .tprs-card').count(), 0, 'late exact denials remove every bookable card');
    assert.equal(await f.page.locator('.tprs-datestrip-checking').count(), 0, 'resolved denials do not leave a checking state');
    const nextRows = f.page.locator('button.tprs-not-today-row');
    assert.equal(await nextRows.count(), 4);
    for (const row of await nextRows.all()) {
      assert.equal(await row.isEnabled(), true, 'each unavailable product offers its next verified date');
      assert.match(await row.innerText(), /Next: Friday, October 23/);
    }
    await nextRows.filter({ hasText: 'Traditional 2 hours' }).click();
    await f.page.waitForFunction(date => window.fixtureDate === date, TOMORROW);
    await ready(f.page);
    await waitFor(() => dayCalls(f.state, TOMORROW).length === 4, 'manual next-day row starts selected-date prefetch');
    assert.deepEqual(await f.page.evaluate(() => window.fixturePicks), [TOMORROW], 'only the guest action changes the date');
    f.state.release(TOMORROW);
    await waitFor(() => settled(dayCalls(f.state, TOMORROW)), 'next date verifies successfully');
    await ready(f.page); await f.close();
  });

  await record('failed exact prefetch becomes honest Retry and repeats only the failed product', async () => {
    const f = await fresh({ mode: 'main', dayVariants: { [`${TODAY}:5`]: ['error', 'normal'] } });
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    assert.equal(await productButton(f.page).isEnabled(), false, 'failed exact read is unknown despite monthly positive');
    assert.match(await productButton(f.page).innerText(), /another check/i);
    assert.equal(await productButton(f.page).getAttribute('aria-busy'), null);
    await noAutomaticMove(f);
    f.state.gates.set(`${TODAY}:5`, deferred());
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).click();
    await waitFor(() => dayCalls(f.state, TODAY, 5).length === 2, 'held exact retry started');
    await delay(100);
    assert.equal(await productButton(f.page).isEnabled(), false, 'retry never re-enables the failed card from older positive month evidence');
    assert.equal(await productButton(f.page).getAttribute('aria-busy'), null);
    f.state.release(TODAY, [5]);
    await ready(f.page);
    assert.equal(dayCalls(f.state, TODAY, 5).length, 2);
    for (const code of [4, 121, 123]) assert.equal(dayCalls(f.state, TODAY, code).length, 1);
    assert.equal(monthCalls(f.state).length, 4);
    await f.close();
  });

  await record('one month failure preserves verified exact-day cards and retries only the failed month', async () => {
    const f = await fresh({ mode: 'main', monthVariants: { 5: ['error', 'normal'] } });
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    await ready(f.page, 'VIP 2 hours'); await ready(f.page);
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1, 'exact result independently validates the selected-day card');
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).click();
    await ready(f.page);
    assert.equal(monthCalls(f.state).length, 5, 'only failed month repeats');
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1);
    await f.close();
  });

  await record('failed month and exact groups stop checking, do not forward, and recover through explicit Retry', async () => {
    const f = await fresh({ mode: 'main', monthVariants: Object.fromEntries(CODES.map(code => [code, ['error', 'normal']])), dayVariants: Object.fromEntries(CODES.map(code => [`${TODAY}:${code}`, ['error', 'normal']])) });
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    await waitFor(() => settled(monthCalls(f.state)) && settled(dayCalls(f.state)), 'both failed groups settled');
    assert.equal(await f.page.locator('.tprs-datestrip-checking').count(), 0);
    assert.equal(dayCalls(f.state).length, 4);
    assert.equal(await f.page.locator('.tprs-datestrip-note').count(), 0);
    await noAutomaticMove(f);
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).click();
    await ready(f.page);
    assert.equal(monthCalls(f.state).length, 8);
    assert.equal(dayCalls(f.state, TODAY).length, 8);
    await f.close();
  });

  await record('completed exact failures can use a later monthly negative to forward safely', async () => {
    const f = await fresh({ mode: 'main', holdMonth: true, holdDays: [{ date: TOMORROW }], monthOpenDates: [TOMORROW, LATER], days: { [TODAY]: { error: true } } });
    await waitFor(() => settled(dayCalls(f.state, TODAY)), 'exact failures arrive first');
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY, 'failure alone cannot forward');
    f.state.monthGate.resolve();
    await f.page.waitForFunction(date => window.fixtureDate === date, TOMORROW);
    await ready(f.page); await waitFor(() => dayCalls(f.state, TOMORROW).length === 4, 'forwarded selected-date exact group');
    assert.equal(await f.page.getByRole('button', { name: 'Retry availability', exact: true }).count(), 0, 'verified monthly negative is an unavailable verdict, not a retained transport error');
    assert.equal(dayCalls(f.state, TODAY).length, 4, 'no automatic retry of failed earlier-date requests');
    await f.close();
  });

  await record('manual date wins over a late exact restriction from the previous date', async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TODAY }, { date: LATER }], days: { [TODAY]: { policies: { 5: { code: 'date_removed', message: 'Stale date policy must not leak.' } } } } });
    await ready(f.page); await selectDate(f, LATER); await ready(f.page);
    await waitFor(() => dayCalls(f.state, LATER).length === 4, 'manual date prefetch');
    f.state.release(TODAY);
    await waitFor(() => settled(dayCalls(f.state, TODAY)), 'old responses settled');
    await delay(100);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), LATER);
    assert.equal(await f.page.getByText('Stale date policy must not leak.', { exact: true }).count(), 0);
    assert.equal(dayCalls(f.state, TOMORROW).length, 0);
    f.state.release(LATER); await ready(f.page); await f.close();
  });

  await record('revisiting a date after the shared ninety-second TTL requests fresh exact availability', async () => {
    const f = await fresh({ mode: 'main' });
    await ready(f.page); await waitFor(() => settled(dayCalls(f.state, TODAY)), 'initial exact results cached');
    await selectDate(f, LATER); await ready(f.page);
    await waitFor(() => settled(dayCalls(f.state, LATER)), 'other selected date settled');
    await f.page.clock.setFixedTime(new Date('2026-10-22T17:01:31Z'));
    await f.page.locator('.tprs-chip').getByText('Today', { exact: true }).click();
    await f.page.waitForFunction(date => window.fixtureDate === date, TODAY);
    await waitFor(() => dayCalls(f.state, TODAY).length === 8, 'expired selected-day results are fetched again');
    for (const code of CODES) assert.equal(dayCalls(f.state, TODAY, code).length, 2);
    await f.close();
  });

  await record('a late month policy veto overrides already displayed exact-positive cards', async () => {
    const f = await fresh({ mode: 'main', date: LATER, holdMonth: true, policiesByDate: { [LATER]: { code: 'date_removed', message: 'Fresh monthly restriction.' } } });
    await ready(f.page); await waitFor(() => settled(dayCalls(f.state, LATER)), 'positive exact responses arrive first');
    assert.equal(monthCalls(f.state).some(call => call.completed), false);
    f.state.monthGate.resolve(); await waitFor(() => settled(monthCalls(f.state)), 'later month policy arrives');
    await f.page.getByText('Fresh monthly restriction.', { exact: true }).waitFor();
    assert.equal(await productButton(f.page).count(), 0, 'cached positive exact data cannot offer a policy-blocked card');
    assert.equal(await f.page.evaluate(() => window.fixtureDate), LATER, 'deliberate future date is preserved');
    assert.equal(dayCalls(f.state, LATER).length, 4, 'policy veto does not start duplicate exact reads');
    await f.close();
  });

  await record('automatic December search skips Jingle even with a falsely positive ordinary fixture', async () => {
    const start = '2026-12-05', special = '2026-12-06', next = '2026-12-07';
    const f = await fresh({ mode: 'main', date: start, now: `${start}T17:00:00Z`, specialDates: { [special]: 'Jingle Bowl' }, monthOpenDates: [special, next], holdDays: [{ date: next }], days: { [start]: { available: false } } });
    await f.page.waitForFunction(date => window.fixtureDate === date, next);
    await ready(f.page);
    assert.equal(dayCalls(f.state, start).length, 4);
    assert.equal(dayCalls(f.state, special).length, 0, 'special date is a destination, never an ordinary auto-forward');
    await f.close();
  });

  for (const [date, heading] of [['2026-12-06', /Jingle Bowl/i], ['2026-12-31', /New Year's Eve parties only/i]]) await record(`intentional ${date} entry retains its event handoff`, async () => {
    const f = await fresh({ query: `?date=${date}` });
    await f.page.getByRole('heading', { name: heading }).waitFor();
    assert.equal(await productButton(f.page).count(), 0);
    assert.equal(await f.page.getByRole('option').count(), 0);
    assert.equal(dayCalls(f.state, date).length, 0);
    assert.equal(f.state.calls.some(call => !['GET', 'POST'].includes(call.method)), false);
    await noOverflow(f.page); await f.close();
  });

  await record('intentional NYE handoff and Back preserve the ordinary selected date, time and quantity', async () => {
    const f = await fresh();
    await ready(f.page); await productButton(f.page).click();
    const time = f.page.getByRole('option', { name: /3:00/ }); await time.click();
    await f.page.getByRole('button', { name: 'More lanes', exact: true }).first().click();
    const before = await f.page.getByRole('group', { name: 'Lane quantity', exact: true }).innerText();
    await f.page.getByRole('button', { name: 'Open full calendar', exact: true }).click();
    await f.page.getByRole('button', { name: 'Next month', exact: true }).click();
    await f.page.getByRole('button', { name: 'Next month', exact: true }).click();
    await f.page.getByRole('button', { name: '2026-12-31: NYE packages', exact: true }).click();
    await f.page.getByRole('heading', { name: "New Year's Eve parties only." }).waitFor();
    await f.page.getByRole('button', { name: 'Back to regular reservations', exact: true }).click();
    await time.waitFor();
    assert.equal(await time.getAttribute('aria-selected'), 'true');
    assert.equal(await f.page.getByRole('group', { name: 'Lane quantity', exact: true }).innerText(), before);
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1);
    assert.equal(dayCalls(f.state, '2026-12-31').length, 0);
    await f.close();
  });

  await record('month-boundary calendar honors the server ten-day verdict including day ten', async () => {
    const start = '2026-10-29', last = '2026-11-08';
    const dates = Array.from({ length: 11 }, (_, i) => new Date(Date.UTC(2026, 9, 29 + i, 12)).toISOString().slice(0, 10));
    const f = await fresh({ mode: 'main', date: start, now: `${start}T17:00:00Z`, monthOpenDates: dates });
    await ready(f.page); await waitFor(() => monthCalls(f.state).length === 8, 'visible strip crosses two months');
    await f.page.getByRole('button', { name: 'Open full calendar', exact: true }).click();
    await f.page.getByRole('button', { name: 'Next month', exact: true }).click();
    const cells = f.page.getByRole('dialog').locator('.tprs-cal-cell');
    const tenth = cells.filter({ has: f.page.locator('.tprs-cal-day', { hasText: /^8$/ }) });
    const beyond = cells.filter({ has: f.page.locator('.tprs-cal-day', { hasText: /^9$/ }) });
    await tenth.click({ trial: true }); assert.equal(await beyond.isEnabled(), false);
    await tenth.click(); await f.page.waitForFunction(date => window.fixtureDate === date, last);
    await ready(f.page);
    assert.equal(dayCalls(f.state).some(call => call.date > last), false);
    assert.equal(monthCalls(f.state).length, 8, 'modal reuses already loaded boundary month');
    await f.close();
  });

  for (const flat of ['partial', 'normal']) await record(`legitimate grouped omission uses ${flat} flat fallback without inventing a card`, async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['partial'], flatVariants: [flat] });
    await ready(f.page, 'Traditional 1 hour'); await ready(f.page, 'VIP 2 hours');
    assert.equal(await productButton(f.page).count(), 0);
    assert.equal(await f.page.getByRole('button', { name: 'Retry packages', exact: true }).count(), 0);
    assert.equal(flatCalls(f.state).length, 1);
    assert.equal(monthCalls(f.state).length, flat === 'partial' ? 3 : 4);
    assert.equal(dayCalls(f.state, TODAY, 5).length, flat === 'partial' ? 0 : 1, 'legacy fallback probes the flat identities without inventing a displayed card');
    await f.close();
  });

  await record('partial catalog retains failed exact truth throughout a held retry', async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['partial'], flatVariants: ['partial'], dayVariants: { [`${TODAY}:123`]: ['error', 'normal'] } });
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    await ready(f.page, 'Traditional 1 hour');
    assert.equal(await productButton(f.page, 'VIP 2 hours').isEnabled(), false);
    f.state.gates.set(`${TODAY}:123`, deferred());
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).click();
    await waitFor(() => dayCalls(f.state, TODAY, 123).length === 2, 'partial catalog exact retry started');
    await delay(100);
    assert.equal(await productButton(f.page, 'VIP 2 hours').isEnabled(), false, 'older positive month never re-enables the failed partial-catalog card');
    assert.equal(catalogCalls(f.state).length, 1, 'valid grouped catalog does not need refetching');
    assert.equal(flatCalls(f.state).length, 1, 'matching flat identities remain valid');
    assert.equal(monthCalls(f.state).length, 3);
    f.state.release(TODAY, [123]); await ready(f.page, 'VIP 2 hours');
    for (const code of [4, 121]) assert.equal(dayCalls(f.state, TODAY, code).length, 1);
    await f.close();
  });

  await record('grouped transport failure stays finite and retries before availability', async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['error', 'normal'] });
    await f.page.getByRole('button', { name: 'Retry packages', exact: true }).waitFor();
    assert.equal(await f.page.locator('.tprs-datestrip-checking').count(), 0);
    assert.equal(await f.page.getByText(/No lanes are bookable online right now/i).count(), 0);
    assert.equal(dayCalls(f.state).length + monthCalls(f.state).length, 0);
    await f.page.getByRole('button', { name: 'Retry packages', exact: true }).click();
    await ready(f.page); assert.equal(catalogCalls(f.state).length, 2);
    await f.close();
  });

  for (const state of ['accepted', 'error']) await record(`saved-payment ${state} keeps the inventory barrier`, async () => {
    const f = await fresh({ accepted: state === 'accepted', discoveryError: state === 'error', query: '?date=2026-12-31' });
    if (state === 'accepted') await f.page.getByRole('heading', { name: 'Your saved reservation' }).waitFor();
    else await f.page.getByRole('button', { name: 'Check saved payment', exact: true }).waitFor();
    await delay(100);
    assert.equal(f.state.calls.length, 1);
    assert.equal(await f.page.getByRole('heading', { name: "New Year's Eve parties only." }).count(), 0, 'payment takes precedence over a destination');
    await f.close();
  });

  for (const afterHours of [false, true]) await record(`controlled ${afterHours ? 'after-hours' : 'daytime'} comparison uses identical synthetic latency`, async () => {
    for (const reserveMonthFirst of [false, true]) {
      const opened = afterHours ? TOMORROW : TODAY;
      const options = { reserveMonthFirst, delayMs: { other: 25, month: 180, day: 450 },
        now: afterHours ? '2026-10-23T04:30:00Z' : '2026-10-22T17:00:00Z',
        monthOpenDates: afterHours ? [TOMORROW, LATER] : [TODAY, TOMORROW, LATER],
        days: afterHours ? { [TODAY]: { available: false } } : {} };
      const f = await fresh(options); const started = f.state.navigationStarted; await ready(f.page);
      const firstCardMs = Math.round(performance.now() - started);
      const clickAt = performance.now(); await productButton(f.page).click();
      await f.page.getByRole('option', { name: opened === TOMORROW ? /4:00/ : /3:00/ }).waitFor();
      const clickToTimesMs = Math.round(performance.now() - clickAt);
      timings.push({ scenario: afterHours ? 'after-hours' : 'daytime', strategy: reserveMonthFirst ? 'parallel-day-month' : 'current-fast-start', syntheticDelaysMs: options.delayMs,
        firstCardMs, clickToTimesMs, totalToTimesMs: Math.round(performance.now() - started), dayReads: dayCalls(f.state).length, monthReads: monthCalls(f.state).length });
      assert.equal(dayCalls(f.state, opened, 5).length, 1, 'selected-product exact response is coalesced');
      if (reserveMonthFirst && afterHours) assert.equal(dayCalls(f.state, TODAY).length, 4);
      await f.close();
    }
  });

  assert.deepEqual(pageErrors, [], 'browser runtime errors');
  assert.deepEqual(unexpected, [], 'all traffic is synthetic loopback and read-only recovery discovery');
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ groups: results.length, results, timings,
    timingLimit: 'Controlled browser fixture only; fixed synthetic HTTP delays, not a production benchmark.', network: 'synthetic loopback only', liveMutations: 0 }, null, 2));
  console.table(timings.map(({ syntheticDelaysMs, ...row }) => row));
  console.log(`Reserve parallel day/month: ${results.length} behavior groups passed. No backend calls, holds, payments or external requests.`);
} catch (error) {
  if (activeFixture && !activeFixture.page.isClosed()) {
    await writeFile(resolve(output, 'failure.json'), JSON.stringify({ completed: results, timings, calls: activeFixture.state.calls, pageErrors, unexpected, body: await activeFixture.page.locator('body').innerText() }, null, 2));
    await activeFixture.page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
    await activeFixture.close();
  }
  throw error;
} finally {
  await browser?.close(); await new Promise(done => server.close(done));
}
