/** /reserve opt-in fast start: real booking components and typed HTTP client.
 * Deliberately separate from the unchanged legacy first-day regression suite.
 * No backend, customer data, holds, payment provider or external requests.
 * Run: node scripts/check-reserve-fast-start.mjs
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const site = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(site, '.astro/reserve-fast-start');
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
function MainFixture(){const[date,setDate]=useState(settings.date??'2026-10-24');window.fixtureSetDate=setDate;window.fixtureDate=date;
 const pickDate=useCallback(next=>{window.fixturePicks.push(next);setDate(next);},[]);
 return <div className="tprs-wizard"><MainStep reserveFastStart={settings.reserveFastStart??true} specialDates={settings.specialDates} productCodes={config.productCodes} tileCards={config.tileCards} selectedDate={date} partySize={null} onPartySize={()=>{}} onPickDate={pickDate} onSelectProduct={()=>{}}/></div>;}
const root=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>root.unmount();
root.render(settings.mode==='main'?<MainFixture/>:<BookingWizard config={config} reserveFastStart={settings.reserveFastStart??true}/>);
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
const results = [], pageErrors = [], unexpected = [];
let browser, activeFixture;
const delay = ms => new Promise(done => setTimeout(done, ms));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function monthData(month, options = {}) {
  const count = new Date(`${month}-01T12:00:00Z`); count.setUTCMonth(count.getUTCMonth() + 1); count.setUTCDate(0);
  return { days: Array.from({ length: count.getUTCDate() }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { date, available: options.openDates ? options.openDates.includes(date) : date >= '2026-10-24' && (options.birthday || date <= '2026-11-03'), priceCents: 9995 };
  }), policiesByDate: options.policiesByDate ?? {} };
}

const TODAY = '2026-10-24', TOMORROW = '2026-10-25', LATER = '2026-10-26';
const CODES = [4, 5, 121, 123];
const productButton = (page, name = 'Traditional 2 hours') => page.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\b|$)`) });
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
  const state = { calls: [], gates: new Map(), monthGate: settings.holdMonth ? deferred() : null, discoveryGate: settings.holdDiscovery ? deferred() : null, catalogVariants: [...settings.catalogVariants ?? []], flatVariants: [...settings.flatVariants ?? []] };
  for (const hold of settings.holdDays ?? []) for (const code of hold.codes ?? CODES) state.gates.set(`${hold.date}:${code}`, deferred());
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
      return respond(monthData(call.month, { ...settings, openDates: settings.monthOpenDates ?? [TODAY, TOMORROW, LATER] }));
    }
    if (path.endsWith('/availability')) {
      const code = Number(call.id.slice(-12));
      const gate = state.gates.get(`${call.date}:${code}`); if (gate) await gate.promise;
      const rule = settings.days?.[call.date] ?? {};
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
  await page.clock.setFixedTime(new Date(settings.now ?? '2026-10-24T17:00:00Z'));
  await page.goto(`${base}/reserve/${settings.query ?? ''}`);
  activeFixture = { page, state, close: async () => {
    state.gates.forEach(gate => gate.resolve()); state.monthGate?.resolve(); state.discoveryGate?.resolve(); await context.close();
  } };
  return activeFixture;
}

async function record(name, run) {
  await run(); results.push(name); console.log(`PASS ${name}`);
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });

  await record('slow today never overlaps automatic month; grouped catalog removes duplicate discovery', async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TODAY }], holdMonth: true });
    await waitFor(() => dayCalls(f.state, TODAY).length === 4, 'four selected-day reads started');
    await delay(1400);
    assert.equal(monthCalls(f.state).length, 0, 'no former 1,200ms release while today is pending');
    assert.equal(flatCalls(f.state).length, 0, 'grouped catalog supplies IDs');
    assert.equal(f.state.calls.length, 5, 'one grouped catalog + four exact selected-day reads before settlement');
    assert.equal(await productButton(f.page).isEnabled(), false, 'pending is not bookable');
    f.state.release(TODAY);
    await ready(f.page); await delay(100);
    await waitFor(() => monthCalls(f.state).length === 4, 'background months release after selected-day group settles');
    assert.equal(f.state.calls.length, 9, 'one catalog + four exact days + four background months');
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    await f.close();
  });

  await record('tomorrow starts only after all four today results; first positive advances and reuses every request', async () => {
    const f = await fresh({ mode: 'main', holdMonth: true, holdDays: [{ date: TODAY }, { date: TOMORROW }], days: { [TODAY]: { available: false }, [TOMORROW]: { availableCodes: [5] } } });
    await waitFor(() => dayCalls(f.state, TODAY).length === 4, 'today reads started');
    f.state.release(TODAY, [4, 5, 121]);
    await waitFor(() => dayCalls(f.state, TODAY).filter(c => c.completed).length === 3, 'three today denials settled');
    await delay(100);
    assert.equal(dayCalls(f.state, TOMORROW).length, 0, 'three denials do not prove today unavailable');
    f.state.release(TODAY, [123]);
    await waitFor(() => dayCalls(f.state, TOMORROW).length === 4, 'one bounded tomorrow group');
    assert.equal(monthCalls(f.state).length, 0, 'tomorrow takes priority over months');
    f.state.release(TOMORROW, [5]);
    await f.page.waitForFunction(date => window.fixtureDate === date, TOMORROW);
    await ready(f.page);
    assert.equal(dayCalls(f.state, TOMORROW).filter(c => c.completed).length, 1, 'one verified positive is enough to reveal tomorrow');
    assert.equal(monthCalls(f.state).length, 0);
    f.state.release(TOMORROW); await waitFor(() => dayCalls(f.state, TOMORROW).every(c => c.completed), 'all tomorrow reads settled');
    await delay(100);
    assert.equal(dayCalls(f.state, TOMORROW).length, 4, 'advance joins cached/in-flight reads, no duplicate');
    await waitFor(() => monthCalls(f.state).length === 4, 'background months release after tomorrow group settles');
    assert.equal(f.state.calls.length, 13, 'one catalog + four today + four tomorrow + four months');
    assert.equal(flatCalls(f.state).length, 0);
    await f.close();
  });

  await record('unmount while tomorrow is pending prevents late date changes', async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TOMORROW }], days: { [TODAY]: { available: false } } });
    await waitFor(() => dayCalls(f.state, TOMORROW).length === 4, 'tomorrow group is pending');
    const picksBefore = await f.page.evaluate(() => [...window.fixturePicks]);
    await f.page.evaluate(() => window.fixtureUnmount());
    assert.equal(await f.page.locator('#root').evaluate(root => root.childElementCount), 0, 'actual React root unmounted');
    f.state.release(TOMORROW);
    await waitFor(() => dayCalls(f.state, TOMORROW).every(c => c.completed), 'late tomorrow responses delivered after unmount');
    await delay(100);
    assert.deepEqual(await f.page.evaluate(() => window.fixturePicks), picksBefore, 'no onPick callback after unmount');
    assert.equal(monthCalls(f.state).length, 0, 'unmounted flow starts no month work');
    await f.close();
  });

  for (const width of [320, 390]) await record(`first-positive tomorrow shows neutral main-screen note without overflow at ${width}px`, async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TOMORROW }], days: { [TODAY]: { available: false }, [TOMORROW]: { availableCodes: [5] } } }, width);
    await waitFor(() => dayCalls(f.state, TOMORROW).length === 4, 'tomorrow reads waiting');
    f.state.release(TOMORROW, [5]);
    await f.page.waitForFunction(date => window.fixtureDate === date, TOMORROW);
    await ready(f.page);
    const note = f.page.locator('.tprs-datestrip-note');
    await note.waitFor();
    assert.match(await note.innerText(), /No more online times today/);
    assert.doesNotMatch(await note.innerText(), /booked out|sold out/i, 'no unsupported sellout claim');
    assert.equal(dayCalls(f.state, TOMORROW).filter(call => call.completed).length, 1, 'screenshot captures progressive first positive');
    await noOverflow(f.page);
    await f.page.screenshot({ path: resolve(output, `main-tomorrow-${width}.png`), fullPage: true });
    await f.close();
  });

  for (const outcome of ['unavailable', 'error']) await record(`tomorrow ${outcome} releases month fallback without daily scanning`, async () => {
    const f = await fresh({ mode: 'main', holdMonth: true, monthOpenDates: [LATER], days: { [TODAY]: { available: false }, [TOMORROW]: outcome === 'error' ? { error: true } : { available: false } } });
    await waitFor(() => monthCalls(f.state).length === 4, 'four month fallback reads');
    assert.equal(dayCalls(f.state, TODAY).length, 4);
    assert.equal(dayCalls(f.state, TOMORROW).length, 4);
    assert.equal(dayCalls(f.state, LATER).length, 0, 'no day-by-day fallback scan');
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY, 'unverified tomorrow does not become selected');
    f.state.monthGate.resolve();
    await f.page.waitForFunction(date => window.fixtureDate === date, LATER);
    await ready(f.page);
    assert.equal(dayCalls(f.state, LATER).length, 4, 'exact reads verify the month-suggested date');
    await f.close();
  });

  for (const shape of ['one error', 'all errors', 'one positive']) await record(`today ${shape} never triggers tomorrow and preserves background calendar`, async () => {
    const rule = shape === 'one positive' ? { availableCodes: [5] } : shape === 'all errors' ? { error: true } : { available: false, errorCodes: [123] };
    const f = await fresh({ mode: 'main', holdMonth: true, days: { [TODAY]: rule } });
    await waitFor(() => dayCalls(f.state, TODAY).length === 4 && dayCalls(f.state, TODAY).every(c => c.completed), 'today reads settled');
    if (shape === 'one positive') await ready(f.page); else await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    await delay(100);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    assert.equal(dayCalls(f.state, TOMORROW).length, 0);
    assert.equal(monthCalls(f.state).length, 4);
    f.state.monthGate.resolve();
    await waitFor(() => monthCalls(f.state).every(c => c.completed), 'positive month metadata settled');
    await delay(100);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY, 'positive month cannot override exact-day error or chosen positive day');
    await f.close();
  });

  await record('partial positive today is usable before siblings settle and never initiates next-day scan', async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TODAY }], days: { [TODAY]: { availableCodes: [5] } } });
    await waitFor(() => dayCalls(f.state, TODAY).length === 4, 'four day reads started');
    f.state.release(TODAY, [5]); await ready(f.page); await delay(1400);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    assert.equal(monthCalls(f.state).length, 0);
    assert.equal(dayCalls(f.state, TOMORROW).length, 0);
    f.state.release(TODAY); await f.close();
  });

  await record('manual calendar-verified date ignores a late positive tomorrow', async () => {
    const f = await fresh({ mode: 'main', holdMonth: true, holdDays: [{ date: TOMORROW }], days: { [TODAY]: { available: false }, [LATER]: { available: false } } });
    await waitFor(() => dayCalls(f.state, TOMORROW).length === 4, 'tomorrow check pending');
    const chip = f.page.locator('.tprs-chip').filter({ hasText: '26' });
    assert.equal(await chip.isEnabled(), false, 'unverified chips retain existing disabled behavior');
    await f.page.getByRole('button', { name: 'Open full calendar', exact: true }).click();
    await waitFor(() => monthCalls(f.state).length === 4, 'explicit calendar releases month reads');
    f.state.monthGate.resolve();
    await waitFor(() => monthCalls(f.state).every(c => c.completed), 'month choices available');
    await f.page.getByRole('button', { name: 'Close calendar', exact: true }).click();
    await chip.click();
    await f.page.waitForFunction(date => window.fixtureDate === date, LATER);
    await waitFor(() => dayCalls(f.state, LATER).length === 4 && dayCalls(f.state, LATER).every(c => c.completed), 'manual date checked exactly');
    f.state.release(TOMORROW);
    await waitFor(() => dayCalls(f.state, TOMORROW).every(c => c.completed), 'late tomorrow finished');
    await delay(150);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), LATER, 'manual choice wins even when it is unavailable');
    assert.equal(dayCalls(f.state, LATER).length, 4);
    await f.close();
  });

  await record('unverified date remains disabled; selecting verified month date checks four exact products', async () => {
    const f = await fresh({ mode: 'main', holdMonth: true, holdDays: [{ date: LATER }] });
    await ready(f.page);
    const chip = f.page.locator('.tprs-chip').filter({ hasText: '26' });
    assert.equal(await chip.isEnabled(), false);
    await waitFor(() => monthCalls(f.state).length === 4, 'background months began');
    f.state.monthGate.resolve();
    await waitFor(() => monthCalls(f.state).every(c => c.completed), 'background months settled');
    await chip.click();
    await waitFor(() => dayCalls(f.state, LATER).length === 4, 'selected date starts four exact reads');
    assert.equal(await productButton(f.page).isEnabled(), false, 'pending exact date never inherits prior-date availability');
    assert.equal(monthCalls(f.state).length, 4);
    f.state.release(LATER); await ready(f.page); await f.close();
  });

  await record('explicit calendar bypasses priority wait but cannot activate pending selected-day cards', async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TODAY }], holdMonth: true });
    await waitFor(() => dayCalls(f.state, TODAY).length === 4, 'today requests pending');
    await f.page.getByRole('button', { name: 'Open full calendar', exact: true }).click();
    await waitFor(() => monthCalls(f.state).length === 4, 'explicit interest releases calendar');
    f.state.monthGate.resolve();
    await waitFor(() => monthCalls(f.state).every(c => c.completed), 'month settled');
    await f.page.getByRole('button', { name: 'Close calendar', exact: true }).click();
    assert.equal(await productButton(f.page).isEnabled(), false, 'month cannot claim pending exact day is bookable');
    f.state.release(TODAY); await ready(f.page); await f.close();
  });

  await record('already loaded explicit month cannot win the final-today/tomorrow-probe race', async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TODAY }, { date: TOMORROW }], monthOpenDates: [LATER], days: { [TODAY]: { available: false } } });
    await waitFor(() => dayCalls(f.state, TODAY).length === 4, 'selected-day group waiting');
    await f.page.getByRole('button', { name: 'Open full calendar', exact: true }).click();
    await waitFor(() => monthCalls(f.state).length === 4 && monthCalls(f.state).every(c => c.completed), 'later date already available from month');
    await f.page.getByRole('button', { name: 'Close calendar', exact: true }).click();
    f.state.release(TODAY);
    await waitFor(() => dayCalls(f.state, TOMORROW).length === 4, 'tomorrow priority group started');
    await delay(100);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY, 'loaded later date does not preempt the nearer exact probe');
    f.state.release(TOMORROW, [5]);
    await f.page.waitForFunction(date => window.fixtureDate === date, TOMORROW);
    await ready(f.page); await f.close();
  });

  await record('selected-day policy skips ordinary tomorrow shortcut', async () => {
    const f = await fresh({ mode: 'main', holdMonth: true, days: { [TODAY]: { available: false, policies: { 4: { code: 'holiday_removed', message: 'Synthetic policy restriction.' } } } } });
    await waitFor(() => monthCalls(f.state).length === 4, 'policy uses existing calendar path');
    assert.equal(dayCalls(f.state, TOMORROW).length, 0);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    await f.close();
  });

  await record('grouped catalog transport failure retries the grouped endpoint', async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['error', 'normal'] });
    await f.page.getByRole('button', { name: /retry/i }).first().waitFor();
    assert.equal(await f.page.locator('.tprs-datestrip-checking').count(), 0, 'failed catalog has no endless checking banner');
    assert.equal(await f.page.getByText(/No lanes are bookable online right now/i).count(), 0, 'failed catalog is unknown, not proof of no lanes');
    assert.equal(dayCalls(f.state).length, 0);
    assert.equal(flatCalls(f.state).length, 0);
    await f.page.getByRole('button', { name: /retry/i }).first().click();
    await ready(f.page);
    assert.equal(catalogCalls(f.state).length, 2);
    assert.equal(dayCalls(f.state, TODAY).length, 4);
    await f.close();
  });

  for (const flat of ['partial', 'normal']) await record(`grouped catalog with one omitted product uses ${flat === 'partial' ? 'matching three-product' : 'four-product'} legacy probe without inventing a card`, async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['partial'], flatVariants: [flat] });
    await ready(f.page, 'Traditional 1 hour');
    await ready(f.page, 'VIP 1 hour'); await ready(f.page, 'VIP 2 hours');
    assert.equal(await productButton(f.page, 'Traditional 2 hours').count(), 0, 'omitted grouped product is not displayed');
    assert.equal(await f.page.getByRole('button', { name: 'Retry packages', exact: true }).count(), 0, 'legitimate catalog omission is not a package error');
    assert.equal(catalogCalls(f.state).length, 1);
    assert.equal(flatCalls(f.state).length, 1, 'incomplete grouped catalog falls back to the established flat probe');
    assert.equal(dayCalls(f.state, TODAY).length, flat === 'partial' ? 3 : 4);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    await f.close();
  });

  await record('incomplete grouped catalog never uses the four-product tomorrow shortcut', async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['partial'], flatVariants: ['partial'], holdMonth: true, days: { [TODAY]: { available: false } } });
    await waitFor(() => monthCalls(f.state).length === 3, 'legacy month reads cover the three actual products');
    assert.equal(dayCalls(f.state, TODAY).length, 3);
    assert.equal(dayCalls(f.state, TOMORROW).length, 0, 'incomplete configured set does not invoke tomorrow shortcut');
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    await f.close();
  });

  await record('legacy flat probe missing a displayed grouped product remains an explicit retry', async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['partial', 'partial'], flatVariants: ['missing-group-member', 'partial'] });
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    assert.equal(await productButton(f.page, 'VIP 2 hours').isEnabled(), false, 'missing probe member never becomes bookable');
    assert.equal(dayCalls(f.state, TOMORROW).length, 0);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).click();
    await ready(f.page, 'VIP 2 hours');
    assert.equal(flatCalls(f.state).length, 2, 'retry refreshes the legacy flat probe');
    assert.equal(catalogCalls(f.state).length, 2, 'retry reconciles grouped and flat catalog evidence');
    await f.close();
  });

  await record('empty grouped and flat catalogs preserve legacy availability error without automatic advancement', async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['empty'], flatVariants: ['empty'] });
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    assert.equal(await f.page.getByRole('button', { name: 'Retry packages', exact: true }).count(), 0, 'valid empty grouped response is not a transport failure');
    assert.equal(await f.page.locator('.tprs-datestrip-checking').count(), 0, 'empty failed probe has finite error state');
    assert.equal(catalogCalls(f.state).length, 1);
    assert.equal(flatCalls(f.state).length, 1);
    assert.equal(dayCalls(f.state).length, 0);
    assert.equal(monthCalls(f.state).length, 0);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    await f.close();
  });

  for (const [today, special, label] of [['2026-12-05', '2026-12-06', 'Jingle Bowl'], ['2026-12-30', '2026-12-31', 'NYE']]) await record(`${label} tomorrow skips ordinary shortcut even if synthetic API would say available`, async () => {
    const f = await fresh({ mode: 'main', date: today, now: `${today}T17:00:00Z`, specialDates: { [special]: label }, holdMonth: true, days: { [today]: { available: false } } });
    const expectedMonths = today === '2026-12-30' ? 8 : 4; // Four mobile chips cross into January.
    await waitFor(() => monthCalls(f.state).length === expectedMonths, 'special tomorrow uses normal month/event handling');
    assert.equal(dayCalls(f.state, today).length, 4);
    assert.equal(dayCalls(f.state, special).length, 0, 'no ordinary exact-day probe on special destination');
    assert.equal(await f.page.evaluate(() => window.fixtureDate), today);
    await f.close();
  });

  for (const width of [320, 390, 1280]) await record(`wizard discovery barrier, selected-day reuse and no seven-day prefetch at ${width}px`, async () => {
    const f = await fresh({ holdDiscovery: true, holdMonth: true }, width);
    await waitFor(() => f.state.calls.length === 1, 'payment recovery discovery started');
    await delay(100);
    assert.equal(f.state.calls.length, 1, 'no catalog or availability before payment recovery clears');
    assert.equal(f.state.calls[0].path.endsWith('/checkout/attempt-active'), true);
    f.state.discoveryGate.resolve(); await ready(f.page);
    assert.equal(flatCalls(f.state).length, 0);
    await waitFor(() => monthCalls(f.state).length === 4, 'background dates load after selected date settles');
    await noOverflow(f.page);
    await productButton(f.page).click();
    await f.page.getByRole('option', { name: /3:00/ }).waitFor();
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1, 'detail uses already loaded selected-day response');
    f.state.monthGate.resolve(); await delay(300);
    assert.equal(dayCalls(f.state).filter(c => c.date !== TODAY).length, 0, 'reserve flag disables seven-day detail prefetch');
    assert.equal(f.state.calls.some(c => c.path.endsWith('/availability/slot')), false, 'loading detail does not choose a time');
    await noOverflow(f.page);
    await f.page.screenshot({ path: resolve(output, `detail-${width}.png`), fullPage: true });
    await f.close();
  });

  for (const state of ['accepted', 'error']) await record(`payment recovery ${state} blocks editable inventory`, async () => {
    const f = await fresh({ accepted: state === 'accepted', discoveryError: state === 'error' });
    if (state === 'accepted') await f.page.getByRole('heading', { name: 'Your saved reservation' }).waitFor();
    else await f.page.getByRole('button', { name: 'Check saved payment', exact: true }).waitFor();
    await delay(150);
    assert.equal(f.state.calls.length, 1, 'only the recovery read occurs');
    assert.equal(catalogCalls(f.state).length, 0);
    assert.equal(dayCalls(f.state).length, 0);
    await f.close();
  });

  for (const birthday of [false, true]) await record(`flag false retains legacy catalog/month behavior for ${birthday ? 'birthday' : 'ordinary'}`, async () => {
    const f = await fresh({ mode: 'main', reserveFastStart: false, birthday, holdDays: [{ date: TODAY, codes: birthday ? [109, 118] : CODES }], holdMonth: true });
    const count = birthday ? 2 : 4;
    await waitFor(() => dayCalls(f.state, TODAY).length === count, 'legacy selected-day reads');
    await waitFor(() => monthCalls(f.state).length === count, 'legacy 1,200ms month-release behavior remains', 4000);
    assert.equal(flatCalls(f.state).length, 1);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    await f.close();
  });

  await record('flag false retains the legacy detail future-date prefetch', async () => {
    const f = await fresh({ reserveFastStart: false });
    await ready(f.page); await productButton(f.page).click();
    await f.page.getByRole('option', { name: /3:00/ }).waitFor();
    await waitFor(() => dayCalls(f.state, TOMORROW, 5).length === 1, 'legacy detail still prefetches a verified next date');
    assert.equal(flatCalls(f.state).length, 1);
    await f.close();
  });

  assert.deepEqual(pageErrors, [], 'browser runtime errors');
  assert.deepEqual(unexpected, [], 'all requests are synthetic local reads, apart from read-only recovery discovery');
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ groups: results.length, results, network: 'synthetic loopback only', liveMutations: 0 }, null, 2));
  console.log(`Reserve fast start: ${results.length} behavior groups passed. No backend calls, holds, payments or external requests.`);
} catch (error) {
  if (activeFixture && !activeFixture.page.isClosed()) {
    await writeFile(resolve(output, 'failure.json'), JSON.stringify({ completed: results, calls: activeFixture.state.calls, pageErrors, unexpected, body: await activeFixture.page.locator('body').innerText() }, null, 2));
    await activeFixture.page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
    await activeFixture.close();
  }
  throw error;
} finally {
  await browser?.close(); await new Promise(done => server.close(done));
}
