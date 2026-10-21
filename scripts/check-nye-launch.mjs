/** Actual local Astro pages with a controlled browser clock and synthetic API.
 * Start Astro with PUBLIC_TPRS_API_BASE=/fixture-api on 127.0.0.1:4356.
 * No provider, production API, booking write or email is reachable.
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const base = process.argv.find(a => a.startsWith('--base='))?.slice(7) ?? 'http://127.0.0.1:4356';
assert.equal(new URL(base).hostname, '127.0.0.1');
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const site = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(site, '.astro/nye-launch');
await mkdir(out, { recursive: true });
const fixture = await build({ stdin: { contents: `import {installFixture} from './scripts/fixtures/nye-brand.mjs'; installFixture();`, resolveDir: site }, bundle: true, write: false, platform: 'browser', format: 'iife' });
const fixtureJs = fixture.outputFiles[0].text;
const OPEN = Date.parse('2026-11-18T15:00:00.000Z');
const browser = await chromium.launch({ headless: true });
const results = [], unexpected = [], errors = [];
async function scenario(name, run) {
  if (only && !name.includes(only)) return;
  await run(); results.push(name); console.log(`PASS ${name}`);
}
async function fresh(path, { now = OPEN - 1000, width = 390, timezoneId = 'America/Chicago', settings = {}, faults = {}, delayedHydration = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId, reducedMotion: 'reduce' });
  let releaseHydration;
  const hydration = new Promise(r => { releaseHydration = r; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith('/tprs-api') || url.pathname.startsWith('/fixture-api')) {
      unexpected.push(`${request.method()} ${url.pathname}`); return route.abort();
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Synthetic rehearsal: unrelated service disabled' } });
    if (request.method() !== 'GET') { unexpected.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if (delayedHydration && url.pathname.includes('/src/components/tprs/nye/NyePublicCheckout.tsx')) await hydration;
    return route.continue();
  });
  await context.addInitScript(({ settings, faults, fixtureJs }) => {
    sessionStorage.setItem('fixture-settings', JSON.stringify(settings));
    (0, eval)(fixtureJs);
    const delegate = window.fetch;
    let discovery = 0, releaseFirst;
    window.launchCalls = [];
    window.releaseFirstDiscovery = () => releaseFirst?.();
    window.launchFaults = faults;
    window.fetch = async (url, options) => {
      const target = new URL(String(url), location.href);
      if (!target.pathname.startsWith('/fixture-api/')) return delegate(url, options);
      const path = target.pathname.slice('/fixture-api'.length);
      window.launchCalls.push({ path, at: Date.now() });
      if (path === '/api/checkout/attempt-active' && ++discovery === 1 && faults.delayFirstDiscovery) {
        let captured;
        if (faults.firstDiscoveryHasAttempt) {
          window.configure({ ordinaryActive: true });
          captured = await delegate(url, options);
          window.configure({ ordinaryActive: false });
        }
        await new Promise(resolve => { releaseFirst = resolve; });
        if (faults.firstDiscoveryFails) throw new Error('Synthetic late discovery failure');
        if (captured) return captured;
      }
      if (window.launchFaults.failCatalog && path === '/api/products') return new Response('{}', { status: 503 });
      if (window.launchFaults.failAvailability && path === '/api/availability') return new Response('{}', { status: 503 });
      if (window.launchFaults.failDiscovery && path === '/api/checkout/attempt-active') return new Response('{}', { status: 503 });
      if (window.launchFaults.serverBeforeOpening && path === '/api/availability') {
        const response = await delegate(url, options);
        return new Response(JSON.stringify((await response.json()).map(time => ({ ...time, available: false }))), { headers: { 'Content-Type': 'application/json' } });
      }
      return delegate(url, options);
    };
  }, { settings, faults, fixtureJs });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now));
  await page.goto(base + path, { waitUntil: delayedHydration ? 'domcontentloaded' : 'networkidle' });
  return { context, page, releaseHydration };
}
const calls = page => page.evaluate(() => window.launchCalls);
const rooms = page => page.getByRole('heading', { name: 'Choose your lanes.', exact: true });
async function opened(page) { await rooms(page).waitFor(); await page.locator('.room-choice').nth(1).waitFor(); }
async function boundary(page, event) {
  await page.clock.setSystemTime(new Date(OPEN));
  if (event) await page.evaluate(name => (name === 'visibilitychange' ? document : window).dispatchEvent(new Event(name)), event);
  else await page.clock.runFor(1000);
}
async function noPurchase(page) {
  assert.equal((await calls(page)).some(c => /cart\/(replace|items)|payment-intents|checkout\/convert/.test(c.path)), false, 'opening does not reserve lanes or issue payment');
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: resolve(out, name + '.png'), fullPage: true });
}
try {
  for (const failing of [false, true]) await scenario(`late pre-opening discovery ${failing ? 'failure' : 'success'} cannot overwrite opened checkout`, async () => {
    const { context, page } = await fresh('/reserve/nye/', { faults: { delayFirstDiscovery: true, firstDiscoveryFails: failing } });
    await page.getByText('Reservations open', { exact: true }).waitFor();
    assert.deepEqual((await calls(page)).map(c => c.path), ['/api/checkout/attempt-active']);
    await boundary(page, 'focus'); await opened(page);
    await page.evaluate(() => window.releaseFirstDiscovery());
    await page.waitForTimeout(100);
    assert.equal(await rooms(page).isVisible(), true, 'late closed bootstrap must not strand the open checkout');
    assert.equal(await page.getByText(/could not safely restore/).count(), 0);
    await noPurchase(page); await context.close();
  });

  for (const event of [null, 'focus', 'visibilitychange', 'pageshow']) await scenario(`mounted checkout opens through ${event ?? 'timer'}`, async () => {
    const { context, page } = await fresh('/reserve/nye/', { timezoneId: 'Pacific/Honolulu' });
    await page.getByText('Reservations open', { exact: true }).waitFor();
    assert.equal(await page.locator('.room-choice').count(), 0);
    assert.equal((await calls(page)).every(c => c.path === '/api/checkout/attempt-active'), true);
    await boundary(page, event); await opened(page); await noPurchase(page);
    if (!event) await shot(page, 'checkout-open-390');
    await context.close();
  });

  await scenario('late accepted-payment evidence remains a recovery barrier after newer empty discovery', async () => {
    const { context, page } = await fresh('/reserve/nye/', { faults: { delayFirstDiscovery: true, firstDiscoveryHasAttempt: true } });
    await page.getByText('Reservations open', { exact: true }).waitFor();
    await boundary(page, 'focus'); await opened(page);
    await page.evaluate(() => window.releaseFirstDiscovery());
    await page.getByRole('heading', { name: 'Your saved reservation.', exact: true }).waitFor();
    assert.equal(await page.locator('.room-choice').count(), 0);
    await noPurchase(page); await context.close();
  });

  for (const fault of ['read', 'malformed', 'write']) await scenario(`late accepted-payment evidence survives ${fault} storage failure`, async () => {
    const { context, page } = await fresh('/reserve/nye/', { faults: { delayFirstDiscovery: true, firstDiscoveryHasAttempt: true } });
    await page.getByText('Reservations open', { exact: true }).waitFor();
    await boundary(page, 'focus'); await opened(page);
    // Fail storage only after the newer empty discovery has opened checkout.
    // The delayed positive result must lock in memory before touching storage.
    await page.evaluate(kind => {
      const key = 'tprs:checkout:discovered:v1';
      const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
      window.launchStorageHits = 0;
      if (kind === 'read') Storage.prototype.getItem = function (name) {
        if (this === sessionStorage && name === key) { window.launchStorageHits++; throw new Error('Synthetic storage read failure'); }
        return read.call(this, name);
      };
      if (kind === 'malformed') write.call(sessionStorage, key, '{not valid JSON');
      if (kind === 'write') Storage.prototype.setItem = function (name, value) {
        if (this === sessionStorage && name === key) { window.launchStorageHits++; throw new Error('Synthetic storage write failure'); }
        return write.call(this, name, value);
      };
      window.releaseFirstDiscovery();
    }, fault);
    await page.getByRole('heading', { name: 'Your saved reservation.', exact: true }).waitFor();
    await page.clock.runFor(1000);
    assert.equal(await page.locator('.room-choice').count(), 0);
    assert.equal(await page.locator('.brand-continue').count(), 0);
    if (fault !== 'malformed') assert.ok(await page.evaluate(() => window.launchStorageHits > 0), 'the late storage fault was exercised');
    await noPurchase(page); await context.close();
  });

  for (const now of [OPEN, OPEN + 30000]) await scenario(`cold checkout after opening ${now - OPEN}ms`, async () => {
    const { context, page } = await fresh('/reserve/nye/', { now, timezoneId: 'Asia/Tokyo' });
    await opened(page); await noPurchase(page); await context.close();
  });

  await scenario('slow hydration after opening uses the current clock', async () => {
    const { context, page, releaseHydration } = await fresh('/reserve/nye/', { delayedHydration: true });
    await page.clock.setSystemTime(new Date(OPEN + 30000)); releaseHydration();
    await opened(page); await noPurchase(page); await context.close();
  });

  for (const fault of ['failCatalog', 'failAvailability', 'failDiscovery']) await scenario(`${fault} is retryable and never sold out`, async () => {
    const { context, page } = await fresh('/reserve/nye/', { now: OPEN + 1000, faults: { [fault]: true } });
    if (fault === 'failAvailability') {
      await opened(page); await page.locator('.room-choice').first().click();
      await page.locator('.brand-continue').click();
      await page.getByText('Party times are not available right now.', { exact: false }).waitFor();
    }
    const retry = page.getByRole('button', { name: fault === 'failAvailability' ? 'Check again' : 'Try again', exact: true }).first();
    await retry.waitFor();
    assert.equal(/sold out/i.test(await page.locator('body').innerText()), false);
    await noPurchase(page);
    await page.evaluate(key => { window.launchFaults[key] = false; }, fault);
    await retry.click();
    if (fault === 'failAvailability') await page.locator('.time-choice').nth(5).waitFor();
    else await opened(page);
    await noPurchase(page); await context.close();
  });

  await scenario('retained ordinary payment keeps precedence across opening', async () => {
    const { context, page } = await fresh('/reserve/nye/', { settings: { ordinaryActive: true } });
    await page.getByRole('heading', { name: 'Your saved reservation.', exact: true }).waitFor();
    await boundary(page, 'focus');
    await page.getByText('Original two-hour bowling × 2', { exact: true }).waitFor();
    assert.equal(await page.locator('.room-choice').count(), 0);
    assert.equal((await calls(page)).every(c => /checkout\/attempt-(active|status)/.test(c.path)), true);
    await noPurchase(page); await context.close();
  });

  await scenario('fast device clock cannot turn server-closed parties into a purchase', async () => {
    const { context, page } = await fresh('/reserve/nye/', { now: OPEN + 60000, faults: { serverBeforeOpening: true } });
    await opened(page); await page.locator('.room-choice').first().click(); await page.locator('.brand-continue').click();
    await page.locator('.time-choice').nth(5).waitFor();
    assert.equal(await page.locator('.time-choice:disabled').count(), 6);
    assert.equal(await page.locator('.brand-continue').isDisabled(), true);
    assert.equal(/sold out/i.test(await page.locator('body').innerText()), false);
    await noPurchase(page); await context.close();
  });

  for (const width of [390, 1280]) await scenario(`actual marketing page cached HTML opens at ${width}px`, async () => {
    const { context, page } = await fresh('/new-years-eve/', { width, timezoneId: 'Europe/London' });
    await page.locator('[data-nye-opening][data-nye-state="before"]').waitFor();
    assert.equal(await page.locator('#nye-times').isVisible(), false);
    assert.equal(await page.locator('[data-nye-unit="seconds"]').innerText(), '01');
    await page.clock.runFor(1000);
    await page.locator('[data-nye-opening][data-nye-state="open"]').waitFor();
    assert.equal(await page.locator('#nye-times').isVisible(), true);
    assert.equal(await page.locator('[data-nye-opening-date]').isVisible(), false);
    assert.equal(await page.locator('[data-nye-booking-cta]').first().getAttribute('href'), '/reserve/nye/');
    assert.deepEqual(await calls(page), []);
    await shot(page, `marketing-open-${width}`); await context.close();
  });

  await scenario('marketing tab resumes after opening without a reload', async () => {
    const { context, page } = await fresh('/new-years-eve/');
    await page.locator('[data-nye-opening][data-nye-state="before"]').waitFor();
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.setSystemTime(new Date(OPEN + 60000));
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.locator('[data-nye-opening][data-nye-state="open"]').waitFor();
    assert.equal(await page.locator('#nye-times').isVisible(), true);
    assert.deepEqual(await calls(page), []); await context.close();
  });

  await scenario('cold marketing visit computes current phase from pre-rendered HTML', async () => {
    const { context, page } = await fresh('/new-years-eve/', { now: OPEN + 60000 });
    await page.locator('[data-nye-opening][data-nye-state="open"]').waitFor();
    assert.equal(await page.locator('#nye-times').isVisible(), true);
    assert.equal(await page.locator('[data-nye-opening-date]').isVisible(), false);
    assert.deepEqual(await calls(page), []); await context.close();
  });

  await scenario('ordinary Dec31 handoff changes its invitation at opening', async () => {
    const { context, page } = await fresh('/reserve/?date=2026-12-31');
    await page.getByRole('heading', { name: "New Year's Eve parties only.", exact: true }).waitFor();
    await page.getByRole('link', { name: 'See NYE opening countdown', exact: true }).waitFor();
    await boundary(page, 'focus');
    assert.equal(await page.getByRole('link', { name: 'Choose your NYE party', exact: true }).getAttribute('href'), '/reserve/nye/');
    assert.equal(await page.locator('.tprs-sticky').count(), 0);
    await noPurchase(page); await context.close();
  });
  assert.deepEqual(unexpected, [], 'all API responses remain inside the synthetic fixture');
  assert.deepEqual(errors, [], 'no browser errors');
  await writeFile(resolve(out, 'results.json'), JSON.stringify({ base, results, unexpected, errors }, null, 2));
  console.log(`NYE launch: ${results.length} actual-route browser scenarios passed.`);
} finally { await browser.close(); }
