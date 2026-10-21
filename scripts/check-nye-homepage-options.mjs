/** Isolated visual/interaction review. Only localhost requests, no checkout. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:55616';
assert.equal(new URL(base).hostname, '127.0.0.1');
const reviewPassword = process.env.JINGLE_REVIEW_PASSWORD;
assert.ok(reviewPassword, 'Set the local synthetic review password used by the isolated dev server');
const out = new URL('../.astro/nye-homepage-options/', import.meta.url);
await mkdir(out, { recursive: true });
const file = name => new URL(name, out).pathname.replace(/^\/(.:)/, '$1');
const browser = await chromium.launch();
const results = [], errors = [], denied = [];
let checks = 0;
const check = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
async function pageFor(width, reducedMotion = 'reduce', javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width <= 430, hasTouch: width <= 430, reducedMotion, javaScriptEnabled });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base && !url.pathname.startsWith('/tprs-api')) return route.continue();
    denied.push(url.pathname); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const anonymous = await context.request.get(`${base}/nye-homepage-concepts/`);
  check(anonymous.status(), 401, 'anonymous local review is protected');
  const login = await context.request.post(`${base}/nye-homepage-concepts/`, { headers: { Origin: base }, form: { password: reviewPassword }, maxRedirects: 0 });
  check(login.status(), 303, 'normal local password login succeeds');
  await page.goto(`${base}/nye-homepage-concepts/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}
async function geometry(page, name) {
  const measured = await page.evaluate(() => {
    const get = selector => document.querySelector(selector).getBoundingClientRect();
    const frame = get('.nye-home-frame'), nav = get('.nye-home-nav'), promo = get('.nye-invitation'), copy = get('.nye-home-copy'), booking = get('.nye-home-booking');
    const texts = [...document.querySelectorAll('.nye-invitation-link, .nye-home-copy, .nye-home-nav')].map(el => ({ overflow: el.scrollWidth > el.clientWidth + 1 }));
    return { viewportOverflow: document.documentElement.scrollWidth > innerWidth, frameWidth: frame.width, promoHeight: promo.height, clearNav: promo.top >= nav.bottom, clearCopy: promo.bottom < copy.top, clearBooking: booking.width === 0 || copy.bottom < booking.top, texts, noRunning: document.querySelector('.nye-home-frame').getAnimations({ subtree: true }).every(animation => animation.playState !== 'running') };
  });
  check(measured.viewportOverflow, false, `${name}: no page overflow`);
  check(measured.texts.every(row => !row.overflow), true, `${name}: no clipped text`);
  check(measured.clearNav && measured.clearCopy && measured.clearBooking, true, `${name}: promo never overlaps nav, headline or booking`);
  check(measured.promoHeight <= 150, true, `${name}: settled invitation stays compact`);
  check(measured.noRunning, true, `${name}: reduced-motion preview has no animated element`);
  return measured;
}
try {
  for (const width of [320, 390, 430, 1440]) {
    const { context, page } = await pageFor(width);
    check(await page.locator('h1').count(), 1, 'one review heading');
    if (width === 1440) await page.locator('[data-nye-wide]').click();
    for (const mode of ['disco', 'midnight', 'spark']) {
      await page.locator(`[data-nye-option="${mode}"]`).click();
      await page.locator('.nye-home-frame').scrollIntoViewIfNeeded();
      check(await page.locator('.nye-home-frame').getAttribute('data-nye-mode'), mode, 'selected treatment');
      check(await page.locator('[data-nye-option][aria-pressed=true]').count(), 1, 'one selected treatment');
      check(await page.locator('[data-nye-promo-link]').getAttribute('href'), '/new-years-eve/', 'invitation points at NYE information');
      check(await page.locator('video').evaluate(video => video.paused), true, 'reduced motion uses poster');
      const measured = await geometry(page, `${mode}-${width}`);
      await page.locator('.nye-home-frame').screenshot({ path: file(`${mode}-${width}.png`) });
      results.push({ mode, width, ...measured });
    }
    await page.locator('.nye-dismiss').click();
    check(await page.locator('[data-nye-invitation]').isVisible(), false, 'dismiss removes invitation');
    check(await page.locator('[data-nye-replay]').evaluate(el => el === document.activeElement), true, 'dismiss returns focus to replay');
    await page.locator('[data-nye-replay]').click();
    check(await page.locator('[data-nye-invitation]').isVisible(), true, 'replay restores dismissed invitation');
    await page.locator('.nye-home-menu').click();
    check(await page.locator('.nye-menu-panel').isVisible(), true, 'preview menu opens');
    await page.keyboard.press('Escape');
    check(await page.locator('.nye-menu-panel').isVisible(), false, 'Escape closes menu');
    check(await page.locator('.nye-home-booking a').first().getAttribute('href'), '/reserve/', 'ordinary booking remains ordinary');
    await context.close();
  }
  const { context, page } = await pageFor(390, 'no-preference');
  await page.locator('.nye-home-frame').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => { const video = document.querySelector('video'); return !video.paused && video.currentTime > 0; });
  check(await page.locator('video').evaluate(video => /\/hero\/hero-mobile-(av1|h264)-540\.mp4$/.test(video.currentSrc)), true, 'actual existing mobile video plays with supported codec');
  await page.locator('[data-nye-pause]').click();
  check(await page.locator('video').evaluate(video => video.paused), true, 'pause stops video');
  check(await page.locator('.nye-home-frame').getAttribute('data-nye-paused'), 'true', 'pause also freezes entrance animation');
  await page.locator('[data-nye-pause]').click();
  await page.locator('.nye-home-frame').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelector('video').paused);
  await page.locator('[data-nye-reduce]').check();
  check(await page.locator('video').evaluate(video => video.paused), true, 'reduced-motion preview stops video');
  check(await page.locator('.nye-home-frame').getAttribute('data-nye-entrance'), 'settled', 'reduced-motion preview settles entrance');
  await context.close();
  const plain = await pageFor(390, 'reduce', false);
  check(await plain.page.locator('[data-nye-invitation]').isVisible(), true, 'no-JS retains a static invitation');
  check(await plain.page.locator('[data-nye-promo-link]').getAttribute('href'), '/new-years-eve/', 'no-JS retains usable link');
  await plain.context.close();
  const tablet = await pageFor(820);
  check(await tablet.page.locator('[data-nye-wide]').isVisible(), false, 'desktop control waits for its actual 1000px layout breakpoint');
  await tablet.context.close();
  const route = await readFile(new URL('../src/pages/nye-homepage-concepts.astro', import.meta.url), 'utf8');
  check(route.includes('export const prerender = false'), true, 'review is server-rendered behind the shared gate');
  check(errors, [], 'no browser runtime errors');
  await writeFile(file('results.json'), JSON.stringify({ checks, results, errors, deniedExternalRequests: [...new Set(denied)], noProductionActions: true }, null, 2));
  console.log(`NYE homepage options: ${checks} checks passed, three treatments at320/390/430/1440, actual video playback, pause, dismiss, menu, reduced motion and no-JS. Local only.`);
} finally { await browser.close(); }
