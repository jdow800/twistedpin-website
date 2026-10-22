/** Read-only browser smoke. Start Astro locally, then run this script.
 * PRICING_BASE_URL may target production; no bookings, payments or form writes.
 * PRICING_ARTIFACT_DIR optionally saves screenshots outside the repository.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PRICING_BASE_URL || 'http://127.0.0.1:4362';
const origin = new URL(base).origin;
const browser = await chromium.launch({ headless: true });
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  // No analytics, third-party pixels or external API requests in this smoke.
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function visit(date, kind, rates) {
    const response = await page.goto(`${base}/pricing/?date=${date}`, { waitUntil: 'networkidle' });
    check(response.status(), 200, `${date}: HTTP`);
    check(response.headers()['cache-control'].includes('no-store'), true, `${date}: not cached across dates`);
    check(await page.locator('.pricing-calendar').getAttribute('data-pricing-kind'), kind, `${date}: kind`);
    check(await page.locator('.today-rate-num').allTextContents(), rates, `${date}: rates`);
  }
  await visit('2026-11-25', 'ordinary', ['$50','$70']);
  check(await page.locator('[data-penny="excluded"]').count(), 1, 'Break Wednesday excludes Penny');
  check(await page.locator('[data-two-hours]').count(), 1, 'Two-hour reservation note');
  check(await page.locator('.pricing-exclusion-dates li').count(), 4, 'Four forthcoming Penny exclusions');
  check(await page.locator('.pricing-exceptions li').count(), 21, '21 forthcoming hourly dates');
  for (const width of [320,390,1280]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px: no horizontal overflow`);
    check(await page.locator('.today-table :is(th,td)').evaluateAll(cells => cells.filter(cell => cell.scrollWidth > cell.clientWidth + 1).map(cell => ({text: cell.textContent, width: cell.clientWidth, scroll: cell.scrollWidth}))), [], `${width}px: table text fits each cell`);
    if (process.env.PRICING_ARTIFACT_DIR) {
      await mkdir(process.env.PRICING_ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: `${process.env.PRICING_ARTIFACT_DIR}/pricing-holiday-${width}.png`, fullPage: true });
      await page.locator('.today-table').evaluate(el => el.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: `${process.env.PRICING_ARTIFACT_DIR}/pricing-holiday-detail-${width}.png` });
    }
  }
  await page.locator('#pricing-date').fill('2026-11-28');
  await Promise.all([page.waitForURL('**/pricing/?date=2026-11-28'), page.getByRole('button', { name: 'See rates' }).click()]);
  check(await page.locator('.today-rate-num').allTextContents(), ['$45','$65','$55','$75'], 'Date form preserves normal Saturday rates');
  await visit('2026-12-06', 'event', []);
  check(await page.locator('.pricing-event h3').textContent(), 'Jingle Bowl reservations only.', 'Jingle title');
  check(await page.locator('.pricing-event a').getAttribute('href'), 'https://www.twistedpin.com/jingle-bowl/', 'Jingle public link');
  check(await page.locator('.today-quick-actions').count(), 0, 'No ordinary walk-in actions on Jingle');
  check((await page.locator('.pricing-event').textContent()).includes('Closed for regular visits'), true, 'Public closure distinction');
  if (process.env.PRICING_ARTIFACT_DIR) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${process.env.PRICING_ARTIFACT_DIR}/pricing-jingle-390.png`, fullPage: true });
    await page.locator('.pricing-event').evaluate(el => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `${process.env.PRICING_ARTIFACT_DIR}/pricing-jingle-detail-390.png` });
  }
  await visit('2026-12-31', 'event', []);
  check(await page.locator('.pricing-event h3').textContent(), "New Year's Eve bowling is by reservation only.", 'NYE scope is bowling');
  check((await page.locator('.pricing-event').textContent()).includes('Closed for regular visits'), false, 'NYE does not claim building-wide closure');
  for (const date of ['2026-11-26','2026-12-25']) {
    await visit(date, 'closed', []);
    check(await page.locator('.today-quick-actions').count(), 0, `${date}: no ordinary actions`);
  }
  await visit('2027-03-28', 'ordinary', ['$45','$65','$35','$55']);
  await visit('2027-04-07', 'ordinary', ['$35','$55']);
  check(await page.locator('[data-penny="regular"]').count(), 1, 'Ordinary Wednesday restores Penny');
  check(await page.locator('[data-two-hours]').count(), 0, 'Ordinary duration restored');
  check(await page.getByRole('link', { name: 'Choose your date in booking' }).getAttribute('href'), '/reserve/', 'Booking handoff does not imply preselection');
  await visit('2027-11-24', 'ordinary', ['$35','$55']);
  check(await page.locator('[data-penny="unconfirmed"]').count(), 1, 'Next-season Penny eligibility is unconfirmed');
  check(await page.locator('[data-penny="regular"]').count(), 0, 'No affirmative next-season Penny offer');
  await page.goto(`${base}/pricing/?date=2026-02-30`);
  check(await page.locator('.pricing-date-error').count(), 1, 'Invalid date recovered');
  await page.goto(`${base}/pricing/?day=wed`);
  check(await page.locator('[data-penny="regular"]').count(), 1, 'Legacy weekday link');
  await page.goto(`${base}/pricing/#wed`);
  await page.waitForURL('**/pricing/?day=wed');
  check(await page.locator('[data-penny="regular"]').count(), 1, 'Legacy hash link');
  check(errors, [], 'No browser JavaScript errors');
  await context.close();
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noJs.newPage();
  await plain.goto(`${base}/pricing/?date=2026-11-27`);
  check(await plain.locator('.today-rate-num').allTextContents(), ['$50','$70'], 'Pricing works without client JavaScript');
  await noJs.close();
  console.log(`${checks} pricing browser checks passed (${origin}).`);
} finally { await browser.close(); }
