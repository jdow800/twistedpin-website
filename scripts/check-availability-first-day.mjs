/** Real booking components + typed HTTP client, synthetic local responses only.
 * No backend, customer data, holds, payment provider or external requests.
 * Run: node scripts/check-availability-first-day.mjs
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const site = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(site, '.astro/availability-first-day');
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
import React, {useState} from 'react';import {createRoot} from 'react-dom/client';
import './src/styles/global.css';import './src/components/tprs/tprs.css';
import BookingWizard from './src/components/tprs/BookingWizard.tsx';
import MainStep from './src/components/tprs/steps/MainStep.tsx';
import {bookingPageConfig,birthdaysPageConfig} from './src/tprs/pageConfig.ts';
const settings=JSON.parse(sessionStorage.getItem('fixture-settings')||'{}');
const config=settings.birthday?birthdaysPageConfig:bookingPageConfig;
function MainFixture(){const[date,setDate]=useState(settings.date??'2026-10-24');window.fixtureSetDate=setDate;window.fixtureDate=date;
 return <div className="tprs-wizard"><MainStep productCodes={config.productCodes} tileCards={config.tileCards} selectedDate={date} partySize={null} onPartySize={()=>{}} onPickDate={setDate} onSelectProduct={()=>{}}/></div>;}
createRoot(document.getElementById('root')).render(settings.mode==='main'?<MainFixture/>:<BookingWizard config={config}/>);
`;
const built = await build({
  stdin: { contents: source, loader: 'tsx', resolveDir: site },
  bundle: true, platform: 'browser', format: 'iife', write: false, jsx: 'automatic', outdir: output,
  external: ['/snap/*', '/pattern/*'], loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
  define: { 'import.meta.env.PUBLIC_TPRS_API_BASE': '"/tprs-api"', 'import.meta.env.PUBLIC_NYE_REHEARSAL': 'false' },
  plugins: [{ name: 'offline-stripe', setup(b) {
    b.onResolve({ filter: /^@stripe\/react-stripe-js$/ }, () => ({ path: 'react', namespace: 'offline-stripe' }));
    b.onResolve({ filter: /^\.\.?\/stripe$/ }, () => ({ path: 'stripe', namespace: 'offline-stripe' }));
    b.onLoad({ filter: /.*/, namespace: 'offline-stripe' }, args => ({ loader: 'tsx', resolveDir: site, contents: args.path === 'stripe'
      ? 'export const STRIPE_AVAILABLE=false;export const STRIPE_APPEARANCE={};export function getStripe(){return null;}'
      : `import React from 'react';export function Elements({children}){return children;}export function PaymentElement(){throw Error('Payment UI must not mount in read-only tests');}export function useStripe(){return null;}export function useElements(){return null;}` }));
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
async function fresh(settings = {}, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'America/Chicago', reducedMotion: 'reduce' });
  const state = { calls: [], held: [], options: settings, dayGate: settings.holdDay ? deferred() : null, monthGate: settings.holdMonth ? deferred() : null, discoveryGate: settings.holdDiscovery ? deferred() : null, catalogFailures: settings.catalogFailures ?? 0, probeFailures: settings.probeFailures ?? 0, monthFailures: settings.monthFailures ?? 0, dayFailures: settings.dayFailures ?? 0, emptyProbes: settings.emptyProbes ?? 0, partialProbes: settings.partialProbes ?? 0, dayFailuresByDate: { ...settings.dayFailuresByDate } };
  await context.addInitScript(settings => { sessionStorage.setItem('fixture-settings', JSON.stringify(settings)); }, settings);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace(/\/$/, '');
    if (url.origin !== base) { unexpected.push(url.href); return route.abort(); }
    if (!path.startsWith('/tprs-api/')) {
      if (['/', '/fixture.js', '/fixture.css'].includes(path) || path.startsWith('/reserve') || localArtwork.test(path)) return route.continue();
      return route.fulfill({ status: 204, body: '' }); // No photo/font requests leave the fixture.
    }
    const call = { path, method: request.method(), date: url.searchParams.get('date'), month: url.searchParams.get('month'), id: url.searchParams.get('product_id'), started: Date.now(), completed: false };
    state.calls.push(call);
    const respond = async (body, status = 200) => { try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); call.completed = true; } catch { /* Context closed after an intentionally held request. */ } };
    if (path.endsWith('/checkout/attempt-active') && call.method === 'POST') { if (state.discoveryGate) await state.discoveryGate.promise; return respond({ attempt: null }); }
    if (call.method !== 'GET') { unexpected.push(`${call.method} ${path}`); return respond({ error: 'Mutation forbidden by fixture' }, 500); }
    if (path.endsWith('/products/bookable')) {
      if (settings.holdCatalog) { state.held.push(route); return; }
      if (state.catalogFailures-- > 0) return respond({ error: 'Synthetic catalog failure' }, 503);
      return respond({ categories });
    }
    if (path.endsWith('/products')) {
      if (state.probeFailures-- > 0) return respond({ error: 'Synthetic probe failure' }, 503);
      const codes = url.searchParams.get('codes').split(',').map(Number);
      if (state.emptyProbes-- > 0) return respond({ products: [] });
      const partial = state.partialProbes-- > 0;
      return respond({ products: products.filter(p => codes.includes(p.code) && (!partial || p.code !== 5)) });
    }
    if (path.endsWith('/availability/month')) {
      if (state.monthGate) await state.monthGate.promise;
      if (state.monthFailures-- > 0) return respond({ error: 'Synthetic month failure' }, 503);
      return respond(monthData(call.month, settings));
    }
    if (path.endsWith('/availability')) {
      if (state.dayGate && call.date === (settings.date ?? '2026-10-24')) await state.dayGate.promise;
      if (settings.failedDayDates?.includes(call.date)) return respond({ error: 'Synthetic date offline' }, 503);
      if (state.dayFailures-- > 0) return respond({ error: 'Synthetic day failure' }, 503);
      if (state.dayFailuresByDate[call.date] > 0) { state.dayFailuresByDate[call.date]--; return respond({ error: 'Synthetic date read failure' }, 503); }
      const code = Number(call.id.slice(-12));
      const policy = settings.dayPolicies?.[code] ?? (settings.oldDatePolicy && call.date === settings.date ? { code: 'date_removed', message: 'Choose another date.' } : null);
      const available = settings.dayUnavailable ? false : settings.openDates ? settings.openDates.includes(call.date) : [109, 118].includes(code) || call.date <= '2026-11-03';
      return respond({ slots: [{ time: call.date === '2026-10-25' ? '16:00' : '15:00', priceCents: 9995, available }], policy });
    }
    if (/\/products\/[^/]+\/forms$/.test(path)) return respond({ forms: [] });
    if (path.endsWith('/availability/slot')) return respond({ maxUnits: 3 });
    unexpected.push(`Unstubbed ${call.method} ${path}`); return respond({ error: 'Unstubbed read' }, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.clock.setFixedTime(new Date(settings.now ?? '2026-10-24T17:00:00Z'));
  await page.goto(`${base}/reserve/${settings.query ?? ''}`);
  activeFixture = { page, state, close: async () => { state.dayGate?.resolve(); state.monthGate?.resolve(); state.discoveryGate?.resolve(); await context.close(); } };
  return activeFixture;
}
const productButton = (page, name) => page.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\b|$)`) });
async function ready(locator) { await locator.click({ trial: true }); }
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'horizontal overflow'); }
function selectedDayCalls(state, code = 5, date = '2026-10-24') { return state.calls.filter(c => c.path.endsWith('/availability') && c.id === id(code) && c.date === date); }

try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  for (const birthday of [false, true]) for (const width of [320, 390]) {
    const { page, state, close } = await fresh({ birthday, holdMonth: true, holdDay: true, holdDiscovery: true }, width);
    await page.waitForFunction(() => document.body.innerText.includes('Checking'));
    await delay(100);
    assert.equal(state.calls.length, 1, 'only payment discovery may run before the recovery barrier settles');
    assert.equal(state.calls[0].path.endsWith('/checkout/attempt-active'), true);
    state.discoveryGate.resolve();
    const name = birthday ? 'Traditional Birthday' : 'Traditional 2 hours';
    await page.getByText(name, { exact: true }).first().waitFor();
    assert.equal(await page.locator('.tprs-card--pending').filter({ hasText: name }).isDisabled(), true, 'pending product is not actionable');
    const count = birthday ? 2 : 4;
    await page.waitForFunction(() => document.querySelectorAll('.tprs-card--pending').length > 0);
    assert.equal(state.calls.filter(c => c.path.endsWith('/availability')).length, count, 'one selected-day read per curated product');
    await page.screenshot({ path: resolve(output, `${birthday ? 'birthday' : 'regular'}-pending-${width}.png`), fullPage: true });
    state.dayGate.resolve();
    await ready(productButton(page, name));
    assert.equal(state.calls.filter(c => c.path.endsWith('/availability/month') && c.completed).length, 0, 'selected day ready before any month response');
    assert.equal(await page.locator('a[href*="jingle-bowl"]').count(), 0, 'protected Jingle is not advertised');
    await noOverflow(page);
    await page.screenshot({ path: resolve(output, `${birthday ? 'birthday' : 'regular'}-${width}.png`), fullPage: true });
    const code = birthday ? 109 : 5;
    await productButton(page, name).click();
    await page.getByRole('option', { name: /3:00/ }).waitFor();
    assert.equal(selectedDayCalls(state, code).length, 1, 'detail reuses the selected-day response rather than refetching');
    assert.equal(state.calls.some(c => c.method !== 'GET' && !c.path.endsWith('/checkout/attempt-active')), false);
    await noOverflow(page); await close(); results.push(`day-first, cache reuse, recovery barrier, width ${width}, ${birthday ? 'birthday' : 'regular'}`);
  }

  {
    const f = await fresh({ mode: 'main', holdDay: true, holdMonth: true });
    await f.page.locator('.tprs-card--pending').first().waitFor();
    assert.equal(f.state.calls.filter(c => c.path.endsWith('/availability/month')).length, 0, 'month reads initially yield to the bounded selected-day group');
    await f.page.getByRole('button', { name: 'Open full calendar', exact: true }).click();
    for (let i = 0; i < 20 && f.state.calls.filter(c => c.path.endsWith('/availability/month')).length !== 4; i++) await delay(25);
    assert.equal(f.state.calls.filter(c => c.path.endsWith('/availability/month')).length, 4, 'explicit calendar interest releases one month read per product');
    f.state.monthGate.resolve();
    await f.page.getByRole('button', { name: 'Close calendar', exact: true }).click();
    assert.equal(await productButton(f.page, 'Traditional 2 hours').isEnabled(), false, 'positive month cannot prematurely enable pending selected-day choices');
    f.state.dayGate.resolve(); await ready(productButton(f.page, 'Traditional 2 hours'));
    await f.close(); results.push('bounded day group, explicit calendar interest, no optimistic month fallback');
  }

  {
    const f = await fresh({ mode: 'main', holdMonth: true, dayPolicies: { 4: { code: 'holiday_removed', message: 'This reservation length is unavailable on the selected date.' } } });
    await ready(productButton(f.page, 'Traditional 2 hours'));
    await f.page.getByText('One-hour reservations are unavailable on this date. Choose a two-hour reservation or another date.', { exact: true }).waitFor();
    assert.equal(await productButton(f.page, 'Traditional 1 hour').count(), 0, 'day policy overrides optimistic slots');
    f.state.monthGate.resolve(); await delay(100);
    assert.equal(await productButton(f.page, 'Traditional 1 hour').count(), 0, 'later positive month cannot undo exact-day policy');
    await f.close(); results.push('exact-day policy overrides slots and later month');
  }
  {
    const f = await fresh({ mode: 'main', holdMonth: true, openDates: ['2026-10-25'] });
    await f.page.getByText(/not running|sitting this one out|No times/i).first().waitFor();
    assert.equal(await f.page.evaluate(() => window.fixtureDate), '2026-10-24');
    f.state.monthGate.resolve();
    await f.page.waitForFunction(() => window.fixtureDate === '2026-10-25');
    await ready(productButton(f.page, 'Traditional 2 hours'));
    await f.close(); results.push('unavailable day waits for authoritative smart-forward');
  }
  {
    const f = await fresh({ mode: 'main', holdDay: true, holdMonth: true, date: '2026-10-24', oldDatePolicy: true });
    await f.page.waitForFunction(() => typeof window.fixtureSetDate === 'function');
    await f.page.getByText('Traditional 2 hours', { exact: true }).first().waitFor();
    await f.page.evaluate(() => window.fixtureSetDate('2026-10-25'));
    await ready(productButton(f.page, 'Traditional 2 hours'));
    f.state.dayGate.resolve(); await delay(100);
    assert.equal(await f.page.evaluate(() => window.fixtureDate), '2026-10-25');
    assert.equal(await productButton(f.page, 'Traditional 2 hours').isEnabled(), true, 'late prior-date denial does not hide current choices');
    await f.close(); results.push('changed date ignores late prior-date response');
  }
  for (const kind of ['catalog', 'probe', 'month']) {
    const f = await fresh({ mode: 'main', [`${kind}Failures`]: kind === 'month' ? 4 : 1 });
    await f.page.getByRole('button', { name: /retry/i }).first().waitFor();
    if (kind === 'month') {
      assert.notEqual(await f.page.locator('.tprs-chip.is-error .tprs-chip-day').first().evaluate(el => getComputedStyle(el).textDecorationLine), 'line-through', 'failed dates must not look sold out');
      await f.page.getByRole('button', { name: 'Open full calendar', exact: true }).click();
      assert.notEqual(await f.page.locator('.tprs-cal-cell.is-error .tprs-cal-day').first().evaluate(el => getComputedStyle(el).textDecorationLine), 'line-through');
      await f.page.getByRole('button', { name: 'Close calendar', exact: true }).click();
    }
    assert.equal(f.state.calls.some(c => c.path.endsWith('/availability') && c.completed && kind === 'probe'), false, 'probe failure must not mark the calendar unrestricted');
    await f.page.getByRole('button', { name: /retry/i }).first().click();
    await ready(productButton(f.page, 'Traditional 2 hours'));
    if (kind === 'month') await f.page.waitForFunction(() => !document.querySelector('.tprs-datestrip-checking'));
    await f.close(); results.push(`${kind} failure explicit retry`);
  }
  for (const kind of ['empty', 'partial']) {
    const f = await fresh({ mode: 'main', [`${kind}Probes`]: 1 });
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    assert.equal(await productButton(f.page, 'Traditional 2 hours').isEnabled(), false, `${kind} probe keeps missing product unknown`);
    if (kind === 'partial') await ready(productButton(f.page, 'Traditional 1 hour'));
    for (const width of [320, 390]) {
      await f.page.setViewportSize({ width, height: 844 }); await noOverflow(f.page);
      await f.page.screenshot({ path: resolve(output, `${kind}-retry-${width}.png`), fullPage: true });
    }
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).click();
    await ready(productButton(f.page, 'Traditional 2 hours'));
    await f.close(); results.push(`${kind} flat/grouped catalog mismatch explicit retry`);
  }
  {
    const f = await fresh({ mode: 'main', dayFailures: 4 });
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).waitFor();
    await f.page.waitForFunction(() => !document.querySelector('.tprs-datestrip-checking'));
    assert.equal(await productButton(f.page, 'Traditional 2 hours').isEnabled().catch(() => false), false, 'failed priority day is not activated by a positive month');
    await f.page.getByRole('button', { name: 'Retry availability', exact: true }).click();
    await ready(productButton(f.page, 'Traditional 2 hours'));
    await f.close(); results.push('failed day stays unknown despite positive month, then retries');
  }
  {
    const f = await fresh({ mode: 'main', holdCatalog: true });
    const started = Date.now();
    await f.page.getByRole('button', { name: /retry/i }).first().waitFor({ timeout: 11000 });
    assert.ok(Date.now() - started < 10500, 'catalog read gets a finite timeout');
    f.state.options.holdCatalog = false;
    await f.page.getByRole('button', { name: 'Retry packages', exact: true }).click();
    await ready(productButton(f.page, 'Traditional 2 hours'));
    await f.close(); results.push('catalog header timeout has a finite Retry state');
  }
  {
    const f = await fresh({ failedDayDates: ['2026-10-25'] });
    await ready(productButton(f.page, 'Traditional 2 hours'));
    await productButton(f.page, 'Traditional 2 hours').click();
    await f.page.getByRole('option', { name: /3:00/ }).waitFor();
    await f.page.locator('.tprs-chip').filter({ hasText: '25' }).click();
    await f.page.getByRole('button', { name: 'Retry times', exact: true }).waitFor();
    assert.equal(await f.page.getByRole('option').count(), 0, 'a failed new date does not invent selectable times');
    f.state.options.failedDayDates = [];
    await f.page.getByRole('button', { name: 'Retry times', exact: true }).click();
    await f.page.getByRole('option', { name: /4:00/ }).waitFor();
    assert.equal(f.state.calls.some(c => c.path.endsWith('/availability/slot')), false, 'retry never chooses a time');
    await f.close(); results.push('detail date failure retries without selecting a time');
  }
  {
    const f = await fresh({ query: '?date=2026-12-31', holdMonth: true });
    await f.page.getByRole('heading', { name: "New Year's Eve parties only." }).waitFor();
    assert.equal(await f.page.getByRole('link', { name: 'See NYE opening countdown' }).getAttribute('href'), '/reserve/nye/');
    assert.equal(f.state.calls.filter(c => c.path.includes('/availability')).length, 0, 'NYE handoff precedes ordinary availability');
    await f.close(); results.push('NYE handoff retains precedence');
  }
  for (const birthday of [false, true]) {
    const f = await fresh({ mode: 'main', birthday, date: '2026-11-07', holdMonth: true });
    const name = birthday ? 'Traditional Birthday' : 'Traditional 2 hours';
    if (birthday) {
      await ready(productButton(f.page, name));
      assert.equal(f.state.calls.some(c => c.path.endsWith('/availability') && c.date === '2026-11-07'), true, 'birthday can check beyond ordinary advance cap');
    } else {
      await f.page.getByText('Sitting this one out', { exact: true }).waitFor();
      assert.equal(await productButton(f.page, name).isEnabled(), false, 'ordinary beyond-cap server denial remains unavailable');
    }
    await f.close(); results.push(`${birthday ? 'birthday farther date' : 'ordinary advance limit'} uses server eligibility`);
  }
  assert.deepEqual(pageErrors, [], 'browser runtime errors');
  assert.deepEqual(unexpected, [], 'external requests or mutations');
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ groups: results.length, results }, null, 2));
  console.log(`Availability first day: ${results.length} behavior groups passed. Synthetic APIs only; no holds, checkout mutations or external requests.`);
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
