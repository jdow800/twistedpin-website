/** Local-only rendered landing review. Never enter checkout or call production. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:55610';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Use an isolated local preview');
const out = new URL('../.astro/nye-landing/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const visibleCount = (page, selector) => page.locator(selector).evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden').length);
async function assertPhase(page, phase) {
  assert.equal(await page.locator('[data-nye-opening]').getAttribute('data-nye-state'), phase);
  assert.equal(await visibleCount(page, '.nye-times-section'), phase === 'open' ? 1 : 0, `${phase}: full schedule is only available during sales`);
  assert.equal(await visibleCount(page, '.nye-from'), phase === 'open' ? 2 : 0, `${phase}: room starting prices are only available during sales`);
  assert.equal(await visibleCount(page, '[data-nye-open-only]'), phase === 'open' ? await page.locator('[data-nye-open-only]').count() : 0, `${phase}: all sales-only content follows the same gate`);
  if (phase === 'before') {
    assert.equal(await visibleCount(page, '[data-nye-booking-cta], [data-reservation-action]'), 0, 'no bright booking action or preview-time action before opening');
    assert.equal(await page.locator('[data-nye-opening-date]').innerText(), 'Nov 18th @ 9am');
    assert.equal(await page.locator('[data-nye-opening-heading]').innerText(), 'Reservations open');
    const visibleText = await page.locator('body').innerText();
    assert.equal(/See party times|NYE party times|\$\d/.test(visibleText), false, 'no visible schedule call-to-action or prices before opening');
  } else {
    for (const anchor of await page.locator('[data-nye-booking-cta], [data-reservation-action]').all()) assert.equal(await anchor.getAttribute('href'), phase === 'open' ? '/reserve/nye/' : '/reserve/');
    assert.equal(await visibleCount(page, '[data-nye-before-only]'), 0, 'pre-opening notices retire with the countdown');
  }
}
try {
  for (const width of [320, 390, 430, 768, 1025, 1280, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width > 1000 ? 1000 : 844 }, isMobile: width <= 430, hasTouch: width <= 430, reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === base && !route.request().url().includes('/tprs-api') ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date('2026-10-21T18:30:00Z') });
    await page.goto(`${base}/new-years-eve/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('[data-nye-opening][data-nye-state="before"]').waitFor();
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('.nye-times tbody tr').count(), 6);
    assert.equal(await page.locator('.nye-times tbody td').count(), 12);
    assert.equal(await page.locator('.nye-times tbody td').first().evaluate(el => getComputedStyle(el).fontSize), '16px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${width}`);
    if (width >= 1025) {
      const bounds = await page.evaluate(() => {
        const nav = document.querySelector('.site-nav li:last-child a').getBoundingClientRect();
        const cta = document.querySelector('.site-cta-cluster').getBoundingClientRect();
        const menu = document.querySelector('.header-right button').getBoundingClientRect();
        return { navRight: nav.right, ctaLeft: cta.left, menuRight: menu.right, width: innerWidth };
      });
      assert.ok(bounds.navRight <= bounds.ctaLeft, `header collision ${width}`);
      assert.ok(bounds.menuRight <= bounds.width, `menu clipped ${width}`);
    }
    await assertPhase(page, 'before');
    await page.screenshot({ path: new URL(`after-${width}.png`, out).pathname.replace(/^\/(.:)/, '$1'), fullPage: true });
    if (width === 390 || width === 1440) {
      for (const section of ['hero', 'rooms', 'faq']) await page.locator(`.nye-${section}`).screenshot({ path: new URL(`${section}-${width}.png`, out).pathname.replace(/^\/(.:)/, '$1') });
    }
    await page.getByText('How many lanes should we book?', { exact: true }).click();
    assert.equal(await page.getByText('Example: 5 bowlers + 3 spectators = 8 guests. Book 2 lanes.', { exact: true }).isVisible(), true);
    assert.equal(await page.locator('.nye-contact').getAttribute('href'), 'tel:+18157827790');
    await page.clock.setSystemTime(new Date('2026-11-18T15:00:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await assertPhase(page, 'open');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `open state overflow ${width}`);
    if (width === 390 || width === 1440) {
      await page.locator('.nye-times-section').screenshot({ path: new URL(`times-section-${width}.png`, out).pathname.replace(/^\/(.:)/, '$1') });
      await page.evaluate(() => scrollTo(0,0));
      await page.screenshot({ path: new URL(`open-${width}.png`, out).pathname.replace(/^\/(.:)/, '$1') });
    }
    await page.clock.setSystemTime(new Date('2027-01-01T06:30:00Z'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await assertPhase(page, 'ended');
    assert.deepEqual(errors, []);
    results.push({ width, overflow: false, priceFont: 16, renderedChecks: 'passed' });
    await context.close();
  }
  // Default header destination must stay ordinary outside the NYE campaign.
  const ordinary = await browser.newPage();
  await ordinary.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await ordinary.goto(`${base}/bowl/`, { waitUntil: 'networkidle' });
  assert.equal(await ordinary.locator('[data-reservation-action]').getAttribute('href'), '/reserve/');
  await ordinary.close();
  await writeFile(new URL('render-results.json', out), JSON.stringify({ base, results, ordinaryHeaderPreserved: true, productionBookingActions: false }, null, 2));
  console.log('NYE landing passed: seven widths, hidden pre-opening schedule/prices/actions, exact simple opening copy, automatic opening/end visibility, header bounds, no overflow, 16px prices, six parties/twelve prices, FAQ, phone, ordinary header unchanged. No production requests.');
} finally { await browser.close(); }
