/** /reserve opt-in month browsing: real booking components and typed HTTP client.
 * Deliberately separate from the unchanged legacy/fast-start regression suites.
 * No backend, customer data, holds, payment provider or external requests.
 * Run: node scripts/check-reserve-browse-first.mjs
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const site = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(site, '.astro/reserve-browse-first');
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
import {initialState} from './src/components/tprs/state.ts';
import {saveCheckoutRecovery} from './src/components/tprs/checkoutRecovery.ts';
const settings=JSON.parse(sessionStorage.getItem('fixture-settings')||'{}');
const config=settings.birthday?birthdaysPageConfig:bookingPageConfig;
if(settings.savedRecovery){const p=settings.products.find(p=>p.code===5);saveCheckoutRecovery(sessionStorage,{version:1,
 draft:{...initialState,step:'payment',date:settings.today,product:p,category:settings.categories[0],slot:{time:'15:00',priceCents:9995,available:true},
 guest:{firstName:'Test',lastName:'Guest',email:'synthetic@example.invalid',phone:'8155550100',zip:'60544'},checkoutLocked:true},
 quote:settings.acceptedFixture.financialSnapshot,request:settings.acceptedFixture.originalRequest,cartToken:'synthetic-cart',confirmStarted:true,status:'processing'});}
window.fixturePicks=[];
function MainFixture(){const[date,setDate]=useState(settings.date??'2026-10-22');window.fixtureSetDate=setDate;window.fixtureDate=date;
 const[browse,setBrowse]=useState(settings.reserveBrowseFirst??true);window.fixtureSetBrowse=setBrowse;
 const pickDate=useCallback(next=>{window.fixturePicks.push(next);setDate(next);},[]);
 return <div className="tprs-wizard"><MainStep reserveBrowseFirst={browse} reserveFastStart={settings.reserveFastStart??true} specialDates={settings.specialDates} productCodes={config.productCodes} tileCards={config.tileCards} selectedDate={date} partySize={null} onPartySize={()=>{}} onPickDate={pickDate} onSelectProduct={()=>{}}/></div>;}
const root=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>root.unmount();
root.render(settings.mode==='main'?<MainFixture/>:<BookingWizard config={config} reserveBrowseFirst={settings.reserveBrowseFirst??true} reserveFastStart={settings.reserveFastStart??true}/>);
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
    return { date, available: options.openDates ? options.openDates.includes(date) : date >= '2026-10-22' && (options.birthday || date <= '2026-11-03'), priceCents: 9995 };
  }), policiesByDate: options.policiesByDate ?? {} };
}

const TODAY = '2026-10-22', TOMORROW = '2026-10-23', LATER = '2026-10-24';
const CODES = [4, 5, 121, 123];
const productButton = (page, name = 'Traditional 2 hours') => page.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\b|$)`) });
const dayCalls = (state, date, code) => state.calls.filter(c => c.path.endsWith('/availability') && (!date || c.date === date) && (!code || c.id === id(code)));
const monthCalls = state => state.calls.filter(c => c.path.endsWith('/availability/month'));
const summaryCalls = state => monthCalls(state).filter(c => !c.policy);
const policyMonthCalls = state => monthCalls(state).filter(c => c.policy);
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
  const state = { calls: [], gates: new Map(), monthGate: settings.holdMonth ? deferred() : null, discoveryGate: settings.holdDiscovery ? deferred() : null, catalogVariants: [...settings.catalogVariants ?? []], flatVariants: [...settings.flatVariants ?? []], discoveryVariants: [...settings.discoveryVariants ?? []], monthVariants: [...settings.monthVariants ?? []], settings };
  for (const hold of settings.holdDays ?? []) for (const code of hold.codes ?? CODES) state.gates.set(`${hold.date}:${code}`, deferred());
  state.release = (date, codes = CODES) => codes.forEach(code => { state.gates.get(`${date}:${code}`)?.resolve(); state.gates.delete(`${date}:${code}`); });
  await context.addInitScript(settings => {
    sessionStorage.setItem('fixture-settings', JSON.stringify(settings));
    if(settings.savedDiscovered)sessionStorage.setItem('tprs:checkout:discovered:v1',JSON.stringify(settings.acceptedFixture));
    if(settings.damagedRecovery)sessionStorage.setItem('tprs:checkout:active:v1','{broken');
    if(settings.damagedDiscovered)sessionStorage.setItem('tprs:checkout:discovered:v1','{broken');
    if(settings.emptyRecovery)sessionStorage.setItem('tprs:checkout:active:v1','');
    if(settings.emptyDiscovered)sessionStorage.setItem('tprs:checkout:discovered:v1','');
    if(settings.storageThrows){const getItem=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key.startsWith('tprs:checkout:'))throw Error('Synthetic blocked storage');return getItem.call(this,key);};}
  }, { ...settings, today: TODAY, products, categories, acceptedFixture: accepted });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace(/\/$/, '');
    if (url.origin !== base) { unexpected.push(url.href); return route.abort(); }
    if (!path.startsWith('/tprs-api/')) {
      if (['/', '/fixture.js', '/fixture.css'].includes(path) || path.startsWith('/reserve') || localArtwork.test(path)) return route.continue();
      return route.fulfill({ status: 204, body: '' });
    }
    const call = { path, method: request.method(), policy: url.searchParams.get('include_policy') === 'true', date: url.searchParams.get('date'), month: url.searchParams.get('month'), id: url.searchParams.get('product_id'), started: Date.now(), completed: false };
    state.calls.push(call);
    const respond = async (body, status = 200) => {
      try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); call.completed = true; }
      catch { /* Closing a fixture is allowed to cancel deliberately held reads. */ }
    };
    if (path.endsWith('/checkout/attempt-active') && call.method === 'POST') {
      if (state.discoveryGate) await state.discoveryGate.promise;
      const variant = state.discoveryVariants.shift();
      if (variant === 'error' || settings.discoveryError) return respond({ error: 'Synthetic recovery read failure' }, 503);
      return respond({ attempt: variant === 'accepted' || settings.accepted ? accepted : null });
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
      if (state.monthVariants.shift() === 'error' || settings.monthError) return respond({ error: 'Synthetic month failure' }, 503);
      const data = monthData(call.month, { ...settings, openDates: settings.monthOpenDates ?? [TODAY, TOMORROW, LATER] });
      return respond(call.policy ? data : data.days);
    }
    if (path.endsWith('/availability')) {
      const code = Number(call.id.slice(-12));
      const gate = state.gates.get(`${call.date}:${code}`); if (gate) await gate.promise;
      const rule = settings.days?.[call.date] ?? {};
      if (rule.errorCodes?.includes(code) || rule.error) return respond({ error: 'Synthetic date read failure' }, 503);
      const available = rule.availableCodes ? rule.availableCodes.includes(code) : rule.available ?? true;
      const policy = rule.policies?.[code] ?? null;
      const slots = [{ time: call.date === TOMORROW ? '16:00' : '15:00', priceCents: 9995, available }];
      return respond(call.policy ? { slots, policy } : slots);
    }
    if (/\/products\/[^/]+\/forms$/.test(path)) return respond({ forms: [] });
    if (path.endsWith('/availability/slot')) return respond({ maxUnits: 3 });
    unexpected.push(`Unstubbed ${call.method} ${path}`); return respond({ error: 'Unstubbed read' }, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(7000);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.clock.setFixedTime(new Date(settings.now ?? '2026-10-22T17:00:00Z'));
  await page.goto(`${base}/reserve/${settings.query ?? ''}`);
  activeFixture = { page, state, close: async () => {
    state.gates.forEach(gate => gate.resolve()); state.monthGate?.resolve(); state.discoveryGate?.resolve(); await context.close();
  } };
  return activeFixture;
}

async function record(name, run) {
  await run(); results.push(name); console.log(`PASS ${name}`);
}

const discoveryCalls = state => state.calls.filter(c => c.path.endsWith('/checkout/attempt-active'));
const inventoryCalls = state => state.calls.filter(c => /\/(products|availability)(\/|$)/.test(c.path));
function noFreshCheckout(state) {
  assert.equal(state.calls.some(c => c.method !== 'GET' && !c.path.endsWith('/checkout/attempt-active')), false, 'no quote, hold, payment, cancel or conversion request');
  assert.equal(state.calls.some(c => c.path.endsWith('/availability/slot')), false, 'no time selection or live quantity request');
}
async function stillMain(page) { assert.equal(await page.evaluate(() => history.state?.tprsStep), 'main', 'no premature Detail history entry'); }

try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });

  await record('bare months start alongside held discovery; no exact wave before month verdicts', async () => {
    const f = await fresh({ holdDiscovery: true, holdMonth: true, holdDays: [{ date: TODAY }] });
    await waitFor(() => summaryCalls(f.state).length === 4 && discoveryCalls(f.state).length === 1, 'four summary months and discovery started');
    assert.equal(discoveryCalls(f.state)[0].completed, false);
    assert.equal(catalogCalls(f.state).length, 1);
    assert.equal(flatCalls(f.state).length, 0);
    assert.equal(dayCalls(f.state).length, 0, 'no initial selected-day wave');
    assert.equal(policyMonthCalls(f.state).length, 0);
    f.state.monthGate.resolve(); await ready(f.page);
    await waitFor(() => dayCalls(f.state, TODAY).length === 4, 'month-positive exact prefetch begins');
    assert.ok(dayCalls(f.state).every(c => c.policy && !c.completed), 'exact prefetch carries policy and remains held');
    assert.equal(await productButton(f.page).isEnabled(), true, 'month positive makes cards usable before exact reads');
    await stillMain(f.page); noFreshCheckout(f.state); await noOverflow(f.page);
    await f.page.screenshot({ path: resolve(output, 'main-pending-discovery-390.png'), fullPage: true });
    await f.close();
  });

  await record('exhausted Thursday advances from month directly to Friday without an exact Thursday request', async () => {
    const f = await fresh({ mode: 'main', monthOpenDates: [TOMORROW, LATER], holdDays: [{ date: TOMORROW }] });
    await f.page.waitForFunction(date => window.fixtureDate === date, TOMORROW);
    await ready(f.page);
    assert.equal(summaryCalls(f.state).length, 4);
    assert.equal(dayCalls(f.state, TODAY).length, 0);
    assert.equal(dayCalls(f.state, TOMORROW).length, 4);
    assert.equal(dayCalls(f.state).filter(c => c.completed).length, 0, 'Friday cards do not wait for exact prefetch');
    assert.match(await f.page.locator('.tprs-datestrip-note').innerText(), /No more online times today/);
    await noOverflow(f.page); await f.close();
  });

  await record('early package intent waits without Detail/history/checkout and resumes into shared exact read after clean discovery', async () => {
    const f = await fresh({ holdDiscovery: true, holdDays: [{ date: TODAY }] });
    await ready(f.page); await productButton(f.page).click();
    await f.page.getByText('Checking your reservation…', { exact: true }).waitFor();
    await stillMain(f.page);
    assert.equal(await f.page.getByRole('option').count(), 0);
    noFreshCheckout(f.state);
    f.state.discoveryGate.resolve();
    await f.page.waitForFunction(() => history.state?.tprsStep === 'detail');
    f.state.release(TODAY, [5]);
    await f.page.getByRole('option', { name: /3:00/ }).waitFor();
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1, 'Detail joins one prefetch');
    assert.equal(policyMonthCalls(f.state).length, 0, 'ordinary Detail reuses summary months');
    await delay(100);
    assert.equal(dayCalls(f.state).some(c => c.date !== TODAY), false, 'no next-week prefetch');
    noFreshCheckout(f.state); await f.close();
  });

  await record('late accepted-payment discovery discards early product intent and late availability cannot reclaim the flow', async () => {
    const f = await fresh({ holdDiscovery: true, accepted: true, holdDays: [{ date: TODAY }] });
    await ready(f.page); await productButton(f.page).click(); await stillMain(f.page);
    f.state.discoveryGate.resolve();
    await f.page.getByRole('heading', { name: 'Your saved reservation' }).waitFor();
    f.state.release(TODAY); await delay(150);
    assert.equal(await f.page.getByRole('option').count(), 0);
    assert.notEqual(await f.page.evaluate(() => history.state?.tprsStep), 'detail');
    assert.equal(await f.page.evaluate(() => JSON.parse(sessionStorage.getItem('tprs:checkout:discovered:v1')).attemptId), accepted.attemptId);
    noFreshCheckout(f.state); await f.close();
  });

  await record('discovery failure blocks queued Detail and retry preserves the selected package until a clean answer', async () => {
    const f = await fresh({ holdDiscovery: true, discoveryVariants: ['error', 'clear'] });
    await ready(f.page); await productButton(f.page).click(); await stillMain(f.page);
    f.state.discoveryGate.resolve();
    await f.page.getByRole('button', { name: 'Check saved payment', exact: true }).waitFor();
    assert.equal(await f.page.getByRole('option').count(), 0);
    await stillMain(f.page); noFreshCheckout(f.state);
    await f.page.getByRole('button', { name: 'Check saved payment', exact: true }).click();
    await f.page.getByRole('option', { name: /3:00/ }).waitFor();
    assert.equal(discoveryCalls(f.state).length, 2);
    assert.equal(dayCalls(f.state, TODAY, 5).length, 1);
    noFreshCheckout(f.state); await f.close();
  });

  for (const storage of ['savedDiscovered', 'savedRecovery']) await record(`${storage} owns the flow before any ordinary catalog or availability`, async () => {
    const f = await fresh({ [storage]: true, holdDiscovery: true });
    if (storage === 'savedDiscovered') await f.page.getByRole('heading', { name: 'Your saved reservation' }).waitFor();
    else await f.page.getByRole('heading', { name: "How you'll pay" }).waitFor();
    await delay(100);
    assert.equal(catalogCalls(f.state).length, 0); assert.equal(monthCalls(f.state).length, 0); assert.equal(dayCalls(f.state).length, 0);
    assert.equal(discoveryCalls(f.state).length, 0, 'saved capability is already known');
    noFreshCheckout(f.state); await f.close();
  });

  for (const storage of ['damagedRecovery', 'damagedDiscovered', 'storageThrows']) await record(`${storage} never flashes ordinary browsing and remains blocked after null discovery`, async () => {
    const f = await fresh({ [storage]: true, holdDiscovery: true });
    await waitFor(() => discoveryCalls(f.state).length === 1, 'recovery attempted');
    await delay(100);
    assert.equal(inventoryCalls(f.state).length, 0);
    f.state.discoveryGate.resolve();
    await f.page.getByRole('button', { name: 'Check saved payment', exact: true }).waitFor();
    assert.equal(inventoryCalls(f.state).length, 0); noFreshCheckout(f.state); await f.close();
  });

  await record('Stripe return parameters retain the recovery barrier even without saved browser state', async () => {
    const f = await fresh({ holdDiscovery: true, query: '?payment_intent_client_secret=synthetic_return&payment_intent=pi_fixture&redirect_status=succeeded' });
    await waitFor(() => discoveryCalls(f.state).length === 1, 'payment return discovery');
    await delay(100); assert.equal(inventoryCalls(f.state).length, 0);
    f.state.discoveryGate.resolve();
    await f.page.getByRole('button', { name: 'Check saved payment', exact: true }).waitFor();
    assert.equal(inventoryCalls(f.state).length, 0); noFreshCheckout(f.state); await f.close();
  });

  for (const verdict of ['negative', 'policy']) await record(`exact ${verdict} blocks selectable times despite a positive month card`, async () => {
    const policy = { code: 'holiday_removed', message: 'Synthetic date policy restriction.' };
    const f = await fresh({ days: { [TODAY]: verdict === 'negative' ? { available: false } : { available: true, policies: { 5: policy } } } });
    await ready(f.page); await productButton(f.page).click();
    await waitFor(() => dayCalls(f.state, TODAY, 5).some(c => c.completed), 'selected day verdict settled');
    if (verdict === 'policy') await f.page.getByText(policy.message, { exact: true }).waitFor();
    else await f.page.getByText(/No times left for this date/i).first().waitFor();
    assert.equal(await f.page.getByRole('option').count(), 0);
    noFreshCheckout(f.state); await f.close();
  });

  await record('exact read failure is retryable and never becomes a selectable month-derived time', async () => {
    const f = await fresh({ days: { [TODAY]: { error: true } } });
    await ready(f.page); await productButton(f.page).click();
    await f.page.getByRole('button', { name: /Retry/i }).first().waitFor();
    assert.equal(await f.page.getByRole('option').count(), 0); noFreshCheckout(f.state);
    const attemptsBeforeRetry = dayCalls(f.state, TODAY, 5).length;
    f.state.settings.days[TODAY] = { available: true };
    await f.page.getByRole('button', { name: /Retry/i }).first().click();
    await f.page.getByRole('option', { name: /3:00/ }).waitFor();
    assert.equal(dayCalls(f.state, TODAY, 5).length, attemptsBeforeRetry + 1, 'explicit retry adds one request after any failed prefetch');
    await f.close();
  });

  await record('failed month summaries stop checking, preserve unknown and retry only the summary request group', async () => {
    const f = await fresh({ mode: 'main', monthError: true });
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    assert.equal(dayCalls(f.state).length, 0);
    assert.equal(await productButton(f.page).isEnabled(), false);
    assert.equal(await f.page.locator('.tprs-datestrip-checking').count(), 0);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), TODAY);
    f.state.settings.monthError = false;
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).click();
    await ready(f.page); assert.equal(summaryCalls(f.state).length, 8);
    await f.close();
  });

  for (const flat of ['partial', 'normal']) await record(`legitimate grouped omission uses ${flat} flat fallback without an invented package or empty grid`, async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['partial'], flatVariants: [flat] });
    await ready(f.page, 'Traditional 1 hour'); await ready(f.page, 'VIP 2 hours');
    assert.equal(await productButton(f.page).count(), 0, 'omitted 2-hour traditional product stays omitted');
    assert.equal(await f.page.getByRole('button', { name: 'Retry packages', exact: true }).count(), 0);
    assert.equal(flatCalls(f.state).length, 1);
    assert.equal(summaryCalls(f.state).length, flat === 'partial' ? 3 : 4);
    assert.equal(dayCalls(f.state, TODAY, 5).length, 0, 'hidden product is not prefetched as a displayed choice');
    await f.close();
  });

  await record('catalog transport failure stays explicit and retries the grouped source', async () => {
    const f = await fresh({ mode: 'main', catalogVariants: ['error', 'normal'] });
    await f.page.getByRole('button', { name: /Retry/i }).first().waitFor();
    assert.equal(monthCalls(f.state).length, 0);
    assert.equal(await f.page.locator('.tprs-datestrip-checking').count(), 0);
    await f.page.getByRole('button', { name: /Retry/i }).first().click();
    await ready(f.page); assert.equal(catalogCalls(f.state).length, 2);
    await f.close();
  });

  await record('bare and explanatory month caches stay distinct when the same mounted flow changes mode', async () => {
    const f = await fresh({ mode: 'main', policiesByDate: { [TODAY]: { code: 'date_removed', message: 'Synthetic richer policy.' } } });
    await ready(f.page);
    assert.equal(summaryCalls(f.state).length, 4); assert.equal(policyMonthCalls(f.state).length, 0);
    await f.page.evaluate(() => window.fixtureSetBrowse(false));
    await waitFor(() => policyMonthCalls(f.state).length === 4 && policyMonthCalls(f.state).every(c => c.completed), 'rich consumers fetch their own metadata');
    await f.page.evaluate(() => window.fixtureSetBrowse(true)); await ready(f.page);
    assert.equal(summaryCalls(f.state).length, 4, 'bare mode reuses only its own cached response');
    await f.close();
  });

  await record('manual verified date remains selected after later month and exact results', async () => {
    const f = await fresh({ mode: 'main', holdDays: [{ date: TODAY }] });
    await ready(f.page);
    await f.page.locator('.tprs-chip').filter({ hasText: '24' }).click();
    await f.page.waitForFunction(date => window.fixtureDate === date, LATER);
    f.state.release(TODAY); await delay(150);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), LATER);
    assert.equal(summaryCalls(f.state).length, 4); await f.close();
  });

  for (const [today, special, next, label] of [['2026-12-05', '2026-12-06', '2026-12-07', 'Jingle Bowl'], ['2026-12-30', '2026-12-31', '2027-01-01', 'NYE']]) {
    await record(`${label} is excluded from automatic ordinary forwarding even with an erroneous positive summary`, async () => {
      const f = await fresh({ mode: 'main', date: today, now: `${today}T17:00:00Z`, specialDates: { [special]: label }, monthOpenDates: [special, next] });
      await f.page.waitForFunction(date => window.fixtureDate === date, next);
      assert.equal(dayCalls(f.state, special).length, 0); await f.close();
    });
    await record(`intentional ${label} selection still opens the dedicated event handoff`, async () => {
      const f = await fresh({ now: `${today}T17:00:00Z`, monthOpenDates: [today] });
      await ready(f.page);
      await f.page.locator('.tprs-chip').filter({ hasText: label }).click();
      await f.page.getByRole('heading', { name: label === 'NYE' ? "New Year's Eve parties only." : /Jingle Bowl/ }).waitFor();
      assert.equal(dayCalls(f.state, special).length, 0); noFreshCheckout(f.state); await f.close();
    });
    await record(`direct ${label} date query bypasses ordinary browsing while discovery is held and when it clears`, async () => {
      const f = await fresh({ holdDiscovery: true, query: `?date=${special}`, now: `${today}T17:00:00Z` });
      await waitFor(() => discoveryCalls(f.state).length === 1, 'event-query discovery');
      await delay(100); assert.equal(inventoryCalls(f.state).length, 0);
      f.state.discoveryGate.resolve();
      await f.page.getByRole('heading', { name: label === 'NYE' ? "New Year's Eve parties only." : /Jingle Bowl/ }).waitFor();
      assert.equal(inventoryCalls(f.state).length, 0, 'no ordinary Main flash before event handoff');
      noFreshCheckout(f.state); await f.close();
    });
  }

  for (const width of [320, 390]) await record(`summary cards and policy-verified Detail fit ${width}px`, async () => {
    const f = await fresh({}, width); await ready(f.page); await noOverflow(f.page);
    await f.page.screenshot({ path: resolve(output, `main-${width}.png`), fullPage: true });
    await productButton(f.page).click(); await f.page.getByRole('option', { name: /3:00/ }).waitFor();
    await noOverflow(f.page); noFreshCheckout(f.state);
    await f.page.screenshot({ path: resolve(output, `detail-${width}.png`), fullPage: true });
    await f.close();
  });

  await record('browse opt-out preserves the existing hard recovery barrier and policy-bearing first-day flow', async () => {
    const f = await fresh({ reserveBrowseFirst: false, holdDiscovery: true });
    await waitFor(() => discoveryCalls(f.state).length === 1, 'legacy discovery');
    await delay(100); assert.equal(inventoryCalls(f.state).length, 0);
    f.state.discoveryGate.resolve(); await ready(f.page);
    assert.equal(dayCalls(f.state, TODAY).length, 4);
    await waitFor(() => policyMonthCalls(f.state).length === 4, 'existing fast-start background month policy reads');
    assert.equal(summaryCalls(f.state).length, 0); await f.close();
  });

  for (const storage of ['emptyRecovery', 'emptyDiscovered']) await record(`${storage} is not treated as an absent key while discovery is pending`, async () => {
    const f = await fresh({ [storage]: true, holdDiscovery: true });
    await waitFor(() => discoveryCalls(f.state).length === 1, 'empty-key discovery');
    await delay(100); assert.equal(inventoryCalls(f.state).length, 0);
    noFreshCheckout(f.state); await f.close();
  });

  await record('removing an event date query during held discovery cannot strand the ordinary page behind a spinner', async () => {
    const f = await fresh({ holdDiscovery: true, query: '?date=2026-12-06', now: '2026-12-05T17:00:00Z', monthOpenDates: ['2026-12-05'] });
    await waitFor(() => discoveryCalls(f.state).length === 1, 'event-query discovery started');
    assert.equal(inventoryCalls(f.state).length, 0);
    await f.page.evaluate(() => { history.replaceState(history.state, '', '/reserve/'); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); });
    f.state.discoveryGate.resolve(); await ready(f.page);
    assert.equal(summaryCalls(f.state).length, 4);
    assert.equal(await f.page.getByText('Checking your reservation…', { exact: true }).count(), 0);
    noFreshCheckout(f.state); await f.close();
  });

  for (const [date, label] of [['2026-12-06', 'Jingle Bowl'], ['2026-12-31', 'NYE']]) await record(`browse opt-out preserves direct ${label} intent across failed discovery and successful retry`, async () => {
    const f = await fresh({ reserveBrowseFirst: false, query: `?date=${date}`, discoveryVariants: ['error', 'clear'] });
    await f.page.getByRole('button', { name: 'Check saved payment', exact: true }).waitFor();
    assert.equal(discoveryCalls(f.state).length, 1);
    assert.equal(inventoryCalls(f.state).length, 0, 'failed discovery never starts ordinary inventory');
    await f.page.getByRole('button', { name: 'Check saved payment', exact: true }).click();
    await f.page.getByRole('heading', { name: label === 'NYE' ? "New Year's Eve parties only." : /Jingle Bowl/ }).waitFor();
    await delay(100);
    assert.equal(discoveryCalls(f.state).length, 2);
    // Flag-off keeps its existing render timing: a transient catalog read can
    // start between recovery completion and the handoff effect. The regression
    // is lost event intent, so require the actual handoff and no lasting editor.
    assert.equal(await productButton(f.page).count(), 0, 'ordinary package controls do not persist after event routing');
    assert.equal(await f.page.getByRole('option').count(), 0, 'ordinary times are not selectable on the event handoff');
    noFreshCheckout(f.state); await f.close();
  });

  assert.deepEqual(pageErrors, [], 'browser runtime errors');
  assert.deepEqual(unexpected, [], 'all traffic is synthetic local reads or stubbed recovery discovery');
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ groups: results.length, results, network: 'synthetic loopback only', liveMutations: 0 }, null, 2));
  console.log(`Reserve browse first: ${results.length} behavior groups passed. No live APIs, holds, payments or external requests.`);
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
