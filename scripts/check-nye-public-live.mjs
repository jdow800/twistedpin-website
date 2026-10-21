/** Read-only production smoke, before sales open. No holds, purchases or emails.
 * Fresh browser context; only GET and bodyless payment-discovery POST permitted.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { NYE_OPENING_AT } from '../src/config/nye-opening.ts';

assert(Date.now() < Date.parse(NYE_OPENING_AT), 'This smoke is intentionally limited to pre-opening presentation.');
const base = 'https://www.twistedpin.com';
const out = new URL('../.astro/nye-public-live/', import.meta.url);
await mkdir(out, { recursive: true });
const evidence = { checkedAt: new Date().toISOString(), responses: [], screens: [] };
for (const [path, expected] of [['/tprs-api/health/', 200], ['/reserve/', 200], ['/reserve/nye/', 200], ['/new-years-eve/', 200], ['/jingle-bowl/', 401]]) {
  const response = await fetch(base + path);
  assert.equal(response.status, expected, path);
  evidence.responses.push({ path, status: response.status, ...(path.includes('/health/') ? { health: await response.json() } : {}) });
}
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const calls = [], errors = [];
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) return route.abort();
      if (url.pathname.startsWith('/tprs-api')) {
        calls.push({ path: url.pathname, method: request.method() });
        if (url.pathname.replace(/\/$/, '') !== '/tprs-api/api/checkout/attempt-active' || request.method() !== 'POST' || request.postData()) return route.abort();
      } else if (request.method() !== 'GET' || url.pathname.startsWith('/_vercel/')) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/reserve/nye/', { waitUntil: 'networkidle' });
    await page.locator('.nye-public-opening-label').waitFor();
    assert.equal(await page.locator('.nye-public-opening time').innerText(), 'Nov 18th @ 9am');
    assert.equal(await page.locator('.nye-public-recovery-note').count(), 0, 'production discovery succeeded');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(/\$\d|Choose your lanes|Owner rehearsal|test booking/i.test(await page.locator('body').innerText()), false);
    assert.equal(calls.every(call => call.path.includes('/checkout/attempt-active')), true);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: new URL(`closed-${width}.png`, out).pathname.replace(/^\/(\w:)/, '$1'), fullPage: true });
    evidence.screens.push({ width, calls, errors });
    await context.close();
  }
  await writeFile(new URL('results.json', out), JSON.stringify(evidence, null, 2));
  console.log('Production pre-opening smoke passed: NYE countdown, ordinary reservation page, API health and Jingle gate. No holds, payments or emails.');
} finally { await browser.close(); }
