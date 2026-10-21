/** Actual local Astro route; all API responses are synthetic. No live bookings. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:55612';
assert.equal(new URL(base).hostname, '127.0.0.1');
const out = new URL('../.astro/nye-public-page/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [320, 390, 430, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' });
    const calls = [], errors = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.startsWith('/tprs-api')) {
        calls.push(url.pathname);
        if (url.pathname.replace(/\/$/, '') === '/tprs-api/api/checkout/attempt-active') return route.fulfill({ json: { attempt: null } });
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-10-21T20:00:00Z') });
    await page.goto(`${base}/reserve/nye/`, { waitUntil: 'networkidle' });
    await page.locator('.nye-public-opening-label').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('.nye-public-opening time').innerText(), 'Nov 18th @ 9am');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: no horizontal overflow`);
    assert.equal(/\$\d|Choose your lanes|Owner rehearsal|test booking/i.test(await page.locator('body').innerText()), false);
    assert.equal(calls.every(path => path.includes('/checkout/attempt-active')), true, 'no catalog, hold, quote or payment before opening');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: new URL(`closed-${width}.png`, out).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    results.push({ width, state: 'closed', errors, calls });
    await page.clock.setSystemTime(new Date('2027-01-01T06:30:00Z'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText("This New Year's Eve event has ended.").waitFor();
    assert.equal(await page.getByRole('link', { name: 'Plan your next visit' }).getAttribute('href'), '/reserve/');
    assert.equal(await page.locator('.nye-public-countdown').count(), 0);
    await context.close();
  }
  const outage = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await outage.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    return url.pathname.startsWith('/tprs-api') ? route.fulfill({ status: 503, json: { error: 'synthetic unavailable' } }) : route.continue();
  });
  const page = await outage.newPage();
  await page.clock.install({ time: new Date('2026-10-21T20:00:00Z') });
  await page.goto(`${base}/reserve/nye/`, { waitUntil: 'networkidle' });
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('.nye-public-opening time').innerText(), 'Nov 18th @ 9am', 'discovery failure does not hide the opening date');
  assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 1);
  assert.equal(await page.locator('.room-choice, .brand-continue').count(), 0, 'failure cannot enter a new checkout');
  await outage.close();
  await writeFile(new URL('results.json', out), JSON.stringify(results, null, 2));
  console.log('Public NYE Astro route: 4 responsive closed/end checks and discovery outage passed; synthetic API only.');
} finally { await browser.close(); }
