/** Actual homepage, controlled browser dates, localhost assets only. No checkout. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:55706';
assert.equal(new URL(base).hostname, '127.0.0.1', 'local rehearsal only');
const out = new URL('../.astro/homepage-campaign/', import.meta.url);
await mkdir(out, { recursive: true });
const output = name => fileURLToPath(new URL(name, out));
const browser = await chromium.launch();
const start = Date.parse('2026-12-07T06:00:00Z'), end = Date.parse('2027-01-01T03:30:00Z');
const jingleStart = Date.parse('2026-10-22T05:00:00Z'), jingleEnd = Date.parse('2026-12-06T21:15:00Z');
let checks = 0;
const errors = [], blocked = [], captures = [];
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
async function open({ at = start, width = 390, height = 844, motion = 'reduce', zone = 'America/Chicago', js = true, installedClock = false, storageFails = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width <= 1024, hasTouch: width <= 1024,
    reducedMotion: motion, timezoneId: zone, javaScriptEnabled: js });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === base && ['GET','HEAD'].includes(request.method()) && !/^\/(?:tprs-api|fixture-api|api)\//.test(url.pathname)) return route.continue();
    blocked.push({ path: url.pathname, method: request.method() }); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  if (js) {
    if (installedClock) { await page.clock.install({ time: new Date(at) }); await page.clock.pauseAt(new Date(at)); }
    else await page.clock.setFixedTime(new Date(at));
    await page.addInitScript(({ storageFails }) => {
      window.__mirrorEntrances = 0;
      document.addEventListener('animationstart', e => { if (e.animationName === 'homepage-mirrorball-drop') window.__mirrorEntrances++; }, true);
      if (storageFails) for (const method of ['getItem','setItem','removeItem']) Object.defineProperty(Storage.prototype, method, { value() { throw new Error('Synthetic unavailable storage'); } });
    }, { storageFails });
  }
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  if (js) await page.evaluate(() => document.fonts.ready);
  return { context, page };
}
async function advance(page, at, event = 'focus') {
  await page.clock.setFixedTime(new Date(at));
  await page.evaluate(event => {
    if (event === 'visibilitychange') document.dispatchEvent(new Event(event));
    else window.dispatchEvent(new Event(event));
  }, event);
}
async function layout(page, label, event = 'nye') {
  const measured = await page.evaluate(event => {
    const box = s => { const r = document.querySelector(s).getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
    const card = box(`[data-homepage-${event}]`), art = box(`.homepage-${event}-art`), nav = box('.site-chrome'), copy = box('.hero-copy'), sticky = box('[data-cta-bar]');
    const intersects = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const text = [...document.querySelectorAll(`.homepage-${event}-link,.homepage-${event}-link strong,.homepage-${event}-action`)].map(el => el.scrollWidth <= el.clientWidth + 1);
    return { width:innerWidth, scrollWidth:document.documentElement.scrollWidth, card, art, nav, copy, sticky,
      navClear:art.top >= nav.bottom - 1, headlineClear:!intersects(card,copy), stickyClear:!sticky.width || !intersects(card,sticky), textClear:text.every(Boolean) };
  }, event);
  await page.screenshot({ path: output(`${label}.png`) });
  check(measured.scrollWidth <= measured.width, true, `${label}: no viewport overflow`);
  check(measured.navClear && measured.headlineClear && measured.stickyClear, true, `${label}: artwork/card clear navigation, headline and sticky booking ${JSON.stringify(measured)}`);
  check(measured.textClear, true, `${label}: complete text`);
  check(measured.card.height <= 150, true, `${label}: compact invitation`);
  check(await page.locator(`[data-homepage-${event}-link]`).getAttribute('href'), event === 'jingle' ? '/jingle-bowl/' : '/new-years-eve/', 'approved landing destination');
  check(await page.locator('[data-homepage-fallback]').isVisible(), false, 'generic bar does not compete');
  check(await page.locator('[data-cta-bar] a').first().getAttribute('href'), '/reserve/', 'ordinary booking CTA preserved');
  captures.push({ label, ...measured });
}
try {
  for (const [width,height] of [[320,568],[390,844],[430,932],[844,390],[1280,900]]) {
    const { context, page } = await open({ at:jingleStart, width, height });
    await layout(page, `jingle-${width}x${height}`, 'jingle');
    check(await page.locator('[data-homepage-nye]').isVisible(), false, 'Jingle never competes with NYE');
    check(await page.locator('[data-hero] video').count(), 2, 'Jingle retains both existing hero videos');
    check((await page.locator('#hero-h1').innerText()).replace(/\s+/g,' ').toLowerCase(), 'built for adults. fine, bring the kids.', 'Jingle retains the homepage headline');
    await context.close();
  }
  const jingleCutoff = await open({ at:jingleEnd-1, installedClock:true });
  check(await jingleCutoff.page.locator('[data-homepage-jingle]').isVisible(), true, 'Jingle visible through last eligible millisecond');
  await jingleCutoff.page.clock.runFor(1);
  check(await jingleCutoff.page.locator('[data-homepage-jingle]').isVisible(), false, 'Jingle retires exactly at 3:15pm Chicago without reload');
  check(await jingleCutoff.page.locator('[data-homepage-fallback]').isVisible(), true, 'generic promotion fills the post-cutoff gap');
  await advance(jingleCutoff.page, start);
  check(await jingleCutoff.page.locator('[data-homepage-nye]').isVisible(), true, 'same mounted page hands off to NYE at Dec 7 midnight');
  await jingleCutoff.context.close();
  const jingleDismissed = await open({ at:jingleStart, storageFails:true });
  await jingleDismissed.page.locator('[data-homepage-jingle] [data-homepage-campaign-dismiss]').click();
  check(await jingleDismissed.page.locator('[data-homepage-jingle]').isVisible(), false, 'Jingle dismissal persists without storage');
  check(await jingleDismissed.page.locator('[data-homepage-fallback]').isVisible(), false, 'dismissed Jingle does not expose a competing promotion');
  await advance(jingleDismissed.page, start);
  check(await jingleDismissed.page.locator('[data-homepage-nye]').isVisible(), true, 'dismissing Jingle never dismisses the later NYE campaign');
  await jingleDismissed.context.close();
  const rotating = await open({ at:jingleStart, motion:'no-preference', installedClock:true });
  const card = rotating.page.locator('[data-homepage-jingle]');
  await rotating.page.clock.runFor(4000);
  await card.waitFor({ state:'visible' });
  // CSS animations use the compositor clock, independent of Playwright timers.
  await rotating.page.waitForFunction(() => document.querySelector('[data-homepage-jingle]').dataset.entrance === 'settled');
  const initialBox = await card.boundingBox();
  await rotating.page.clock.runFor(12_000);
  check(await card.getAttribute('data-character'), 'santa', 'approved ornament and Santa alternate after a readable dwell');
  await rotating.page.waitForFunction(() => { const img=document.querySelector('.homepage-jingle-santa'); return img.naturalWidth > 0 && Number(getComputedStyle(img).opacity) === 1; });
  await rotating.page.screenshot({ path:output('jingle-santa-390x844.png') });
  check(await card.boundingBox(), initialBox, 'only decorative artwork moves, never the invitation');
  await card.locator('[data-homepage-campaign-pause]').click();
  await rotating.page.clock.runFor(24_000);
  check(await card.getAttribute('data-character'), 'santa', 'pause stops decorative rotation');
  check(await rotating.page.locator('.hero-video-mobile').evaluate(v => v.paused), true, 'Jingle pause stops the actual hero video');
  await card.locator('[data-homepage-campaign-pause]').click();
  await rotating.page.locator('.site-logo').focus();
  await rotating.page.mouse.move(1,500);
  await rotating.page.clock.runFor(11_999);
  check(await card.getAttribute('data-character'), 'santa', 'resume gives a full fresh dwell');
  await rotating.page.clock.runFor(1);
  check(await card.getAttribute('data-character'), 'ornament', 'rotation resumes after the full dwell');
  await rotating.page.evaluate(() => document.querySelector('.snap').scrollTo({ top:innerHeight, behavior:'instant' }));
  await rotating.page.waitForFunction(() => document.querySelector('[data-homepage-jingle]').getBoundingClientRect().bottom <= 0);
  await rotating.page.clock.runFor(24_000);
  check(await card.getAttribute('data-character'), 'ornament', 'offscreen Jingle rotation stays suspended');
  await rotating.page.evaluate(() => document.querySelector('.snap').scrollTo({ top:0, behavior:'instant' }));
  await rotating.page.waitForFunction(() => document.querySelector('[data-homepage-jingle]').getBoundingClientRect().top > 0);
  await rotating.page.clock.runFor(11_000);
  check(await card.getAttribute('data-character'), 'ornament', 'returning to the hero gets a full fresh dwell');
  await card.locator('a').focus();
  const focusedCharacter = await card.getAttribute('data-character');
  await rotating.page.clock.runFor(24_000);
  check(await card.getAttribute('data-character'), focusedCharacter, 'keyboard interaction pauses decorative rotation');
  await rotating.page.locator('.site-logo').focus();
  await rotating.page.emulateMedia({ reducedMotion:'reduce' });
  await rotating.page.clock.runFor(24_000);
  check(await card.getAttribute('data-character'), focusedCharacter, 'reduced motion keeps the artwork still');
  check(await card.locator('[data-homepage-campaign-pause]').isDisabled(), true, 'Jingle reduced-motion control is explicit');
  await rotating.context.close();
  const desktopSanta = await open({ at:jingleStart, width:1280, height:900, motion:'no-preference', installedClock:true });
  await desktopSanta.page.clock.runFor(4000);
  await desktopSanta.page.waitForFunction(() => document.querySelector('[data-homepage-jingle]').dataset.entrance === 'settled');
  await desktopSanta.page.clock.runFor(12_000);
  check(await desktopSanta.page.locator('[data-homepage-jingle]').getAttribute('data-character'), 'santa', 'desktop retains the same approved character rotation');
  await desktopSanta.page.waitForFunction(() => { const img=document.querySelector('.homepage-jingle-santa'); return img.naturalWidth > 0 && Number(getComputedStyle(img).opacity) === 1; });
  await desktopSanta.page.screenshot({ path:output('jingle-santa-1280x900.png') });
  await desktopSanta.context.close();
  // The original headline begins immediately below the header on the smallest
  // phone landscape; hide this decoration instead of altering the hero layout.
  const cramped = await open({ width:568, height:320, motion:'no-preference' });
  await cramped.page.waitForTimeout(1300);
  check(await cramped.page.locator('[data-homepage-nye]').isVisible(), false, '568x320 preserves original hero without invitation collision');
  check(await cramped.page.locator('[data-homepage-fallback]').isVisible(), false, 'cramped NYE layout does not expose a competing bar');
  check(await cramped.page.locator('#hero-h1').isVisible(), true, 'small landscape retains hero headline');
  check(await cramped.page.locator('[data-cta-bar] a').first().getAttribute('href'), '/reserve/', 'small landscape retains ordinary booking');
  await cramped.page.waitForFunction(() => { const v = document.querySelector('.hero-video-mobile'); return !v.paused && v.currentTime > 0; });
  await cramped.page.screenshot({ path:output('mirrorball-568x320.png') });
  await cramped.page.setViewportSize({ width:844, height:390 });
  await cramped.page.locator('[data-homepage-nye]').waitFor({ state:'visible' });
  await cramped.page.locator('[data-homepage-nye-pause]').click();
  check(await cramped.page.locator('.hero-video-mobile').evaluate(v => v.paused), true, 'landscape motion control applies while visible');
  await cramped.page.setViewportSize({ width:568, height:320 });
  await cramped.page.locator('[data-homepage-nye]').waitFor({ state:'hidden' });
  await cramped.page.waitForFunction(() => !document.querySelector('.hero-video-mobile').paused);
  check(await cramped.page.locator('[data-homepage-nye-pause]').isVisible(), false, 'hidden landscape invitation leaves no invisible motion control');
  await cramped.context.close();
  for (const [width,height] of [[320,568],[390,844],[430,932],[768,1024],[844,390],[1280,900],[1440,900]]) {
    const { context, page } = await open({ width, height });
    await layout(page, `mirrorball-${width}x${height}`);
    check(await page.locator('[data-hero] video').count(), 2, 'both original hero video elements retained');
    check(await page.locator('[data-hero] .hero-video-mobile source').first().getAttribute('src'), '/hero/hero-mobile-av1-540.mp4', 'mobile video source retained');
    check(await page.locator('[data-hero] .hero-video-desktop source').first().getAttribute('src'), '/hero/hero-desktop-av1.mp4', 'desktop video source retained');
    check((await page.locator('#hero-h1').innerText()).replace(/\s+/g,' ').toLowerCase(), 'built for adults. fine, bring the kids.', 'homepage headline preserved');
    await context.close();
  }
  // Exact mounted boundary, with an HTML document produced before this campaign.
  for (const zone of ['America/Los_Angeles','Asia/Tokyo']) {
    const { context, page } = await open({ at:start-2000, zone, installedClock:true });
    check(await page.locator('[data-homepage-nye]').isVisible(), false, 'no pre-midnight NYE treatment');
    check(await page.locator('[data-homepage-fallback]').isVisible(), true, 'existing promotion remains before lead');
    await page.clock.runFor(1999);
    check(await page.locator('[data-homepage-nye]').isVisible(), false, 'no early boundary appearance');
    await page.clock.runFor(1);
    check(await page.locator('[data-homepage-nye]').isVisible(), true, `${zone}: exact venue midnight without reload`);
    await context.close();
  }
  const cutoff = await open({ at:end-1, installedClock:true });
  check(await cutoff.page.locator('[data-homepage-nye]').isVisible(), true, 'visible through final eligible millisecond');
  await cutoff.page.clock.runFor(1);
  check(await cutoff.page.locator('[data-homepage-nye]').isVisible(), false, 'retires exactly at 9:30pm Chicago');
  check(await cutoff.page.locator('[data-homepage-fallback] [data-active]').innerText().then(s => /karaoke/i.test(s)), true, 'retirement restores only current generic copy');
  await cutoff.context.close();
  for (const event of ['focus','pageshow','visibilitychange']) {
    const { context, page } = await open({ at:start-1 });
    await advance(page, start, event);
    check(await page.locator('[data-homepage-nye]').isVisible(), true, `${event}: sleeping page activates`);
    await advance(page, end, event);
    check(await page.locator('[data-homepage-nye]').isVisible(), false, `${event}: sleeping page retires`);
    await context.close();
  }
  const dismissed = await open({ storageFails:true });
  await dismissed.page.locator('[data-homepage-nye-dismiss]').click();
  check(await dismissed.page.locator('[data-homepage-nye]').isVisible(), false, 'dismiss removes invitation');
  check(await dismissed.page.locator('[data-homepage-fallback]').isVisible(), false, 'dismissal does not expose competing bar');
  check(await dismissed.page.locator('.site-logo').evaluate(el => el === document.activeElement), true, 'dismiss returns focus to navigation');
  await advance(dismissed.page, start+10_000);
  check(await dismissed.page.locator('[data-homepage-nye]').isVisible(), false, 'focus does not undo dismissal; storage failure is harmless');
  await dismissed.context.close();
  const generic = await open({ at:start-1 });
  await generic.page.locator('[data-promo-dismiss]').click();
  check(await generic.page.locator('[data-homepage-fallback]').isVisible(), false, 'ordinary promotion dismiss still works');
  await advance(generic.page, start);
  check(await generic.page.locator('[data-homepage-nye]').isVisible(), true, 'ordinary dismissal does not suppress a distinct event');
  await advance(generic.page, end);
  check(await generic.page.locator('[data-homepage-fallback]').isVisible(), false, 'ordinary dismissal survives campaign retirement');
  await generic.context.close();
  for (const width of [390,1440]) {
    const { context, page } = await open({ width, motion:'no-preference' });
    const video = page.locator(width < 1025 ? '.hero-video-mobile' : '.hero-video-desktop');
    await page.locator('[data-homepage-nye]').waitFor({ state:'visible' });
    await page.waitForFunction(selector => { const v = document.querySelector(selector); return !v.paused && v.currentTime > 0; }, width < 1025 ? '.hero-video-mobile' : '.hero-video-desktop');
    await page.locator('[data-homepage-nye-pause]').click();
    check(await video.evaluate(v => v.paused), true, 'explicit pause stops actual hero video');
    await page.locator('[data-homepage-nye-pause]').click();
    await page.waitForFunction(selector => !document.querySelector(selector).paused, width < 1025 ? '.hero-video-mobile' : '.hero-video-desktop');
    await page.waitForTimeout(1900);
    check(await page.locator('[data-homepage-nye]').getAttribute('data-entrance'), 'settled', 'one entrance settles');
    check(await page.evaluate(() => window.__mirrorEntrances), 1, 'one mirrorball entrance');
    await page.locator('[data-nav-toggle]').click();
    check(await page.locator('[data-nav-toggle]').getAttribute('aria-expanded'), 'true', 'real menu still opens');
    await page.keyboard.press('Escape');
    check(await page.locator('[data-nav-toggle]').getAttribute('aria-expanded'), 'false', 'real menu Escape remains');
    await page.evaluate(() => document.querySelector('.snap').scrollTo({ top:innerHeight, behavior:'instant' }));
    await page.waitForFunction(() => document.querySelector('[data-homepage-nye]').getBoundingClientRect().bottom <= 0, { timeout:3000 });
    check(await page.locator('[data-homepage-nye]').evaluate(el => el.getBoundingClientRect().bottom <= 0), true, 'invitation scrolls away with hero');
    await page.evaluate(() => document.querySelector('.snap').scrollTo({ top:0, behavior:'instant' }));
    await page.waitForTimeout(200);
    check(await page.evaluate(() => window.__mirrorEntrances), 1, 'returning to hero never replays entrance');
    await page.emulateMedia({ reducedMotion:'reduce' });
    check(await video.evaluate(v => v.paused), true, 'reduced-motion change stops hero video');
    check(await page.locator('[data-homepage-nye-pause]').isDisabled(), true, 'reduced-motion pause state is clear');
    await context.close();
  }
  const nojs = await open({ js:false });
  check(await nojs.page.locator('[data-homepage-nye]').isVisible(), false, 'no-JS never shows a stale scheduled invitation');
  check(await nojs.page.locator('#hero-h1').isVisible(), true, 'no-JS keeps ordinary homepage content');
  check(await nojs.page.locator('[data-cta-bar] a').first().getAttribute('href'), '/reserve/', 'no-JS ordinary booking still usable');
  await nojs.context.close();
  check(blocked.some(r => /^\/(?:tprs-api|fixture-api)\//.test(r.path)), false, 'campaign makes no booking API call');
  check(errors, [], 'no browser application errors');
  await writeFile(output('results.json'), JSON.stringify({ checks, captures, errors, blockedExternalRequests:blocked, localOnly:true }, null, 2));
  console.log(`Homepage campaign: ${checks} actual-route checks passed; local clocks/assets only.`);
} finally { await browser.close(); }
