/** Offline NYE schedule/component checks. Node 24; no server or external calls.
 * Run: node scripts/check-nye-opening.mjs
 * Render the real Astro component, then run its real client with controlled
 * browser clocks. Keep checkout's availability authority outside this test.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transform as compileAstro } from "@astrojs/compiler";
import { experimental_AstroContainer } from "astro/container";
import { transform as stripTypes } from "esbuild";
import { chromium } from "playwright";
import { NYE_OPENING_AT, NYE_EVENT_END_AT } from "../src/config/nye-opening.ts";
import { nyeOpeningState } from "../src/scripts/nye-opening.client.ts";

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const opensAt = Date.parse("2026-11-18T15:00:00Z");
const endsAt = Date.parse("2027-01-01T06:30:00Z");
check(NYE_OPENING_AT, "2026-11-18T15:00:00Z", "approved opening has an explicit UTC offset");
check(NYE_EVENT_END_AT, "2027-01-01T06:30:00Z", "the final party ends at 12:30am Central January 1");
const state = (instant) => nyeOpeningState(Date.parse(instant));
check(state("2026-10-31T17:00:00Z"), { phase: "before", days: 17, hours: 22, minutes: 0, seconds: 0 }, "fall-back adds one elapsed hour to the civil-date difference");
check(state("2026-11-01T06:59:59Z"), { phase: "before", days: 17, hours: 8, minutes: 0, seconds: 1 }, "last second before Central falls back");
check(state("2026-11-01T07:00:00Z"), { phase: "before", days: 17, hours: 8, minutes: 0, seconds: 0 }, "the repeated local hour never adds an hour to the countdown");
check(nyeOpeningState(opensAt - 1), { phase: "before", days: 0, hours: 0, minutes: 0, seconds: 1 }, "never show all-zero countdown before opening");
check(nyeOpeningState(opensAt).phase, "open", "exact opening instant");
check(nyeOpeningState(endsAt - 1).phase, "open", "last millisecond of the final party");
check(nyeOpeningState(endsAt).phase, "ended", "exact event end");

const componentUrl = new URL("../src/components/NyeOpening.astro", import.meta.url);
const configUrl = new URL("../src/config/nye-opening.ts", import.meta.url);
const clientUrl = new URL("../src/scripts/nye-opening.client.ts", import.meta.url);
const filename = fileURLToPath(componentUrl).replaceAll("\\", "/");
const compiled = await compileAstro(await readFile(componentUrl, "utf8"), {
  filename, sourcemap: false, internalURL: "astro/compiler-runtime", resolvePath: async (specifier) => specifier,
});
check(compiled.diagnostics.filter(d => d.severity === 1), [], "Astro component compiles");
// Resolve the two real imports without a site build. CSS is placed in the test
// document; the client is injected separately so no-JS/pre-hydration is testable.
const serverSource = compiled.code
  .replaceAll('"astro/compiler-runtime"', JSON.stringify(import.meta.resolve("astro/compiler-runtime")))
  .replace(/(["'])\.\.\/config\/nye-opening\1/g, JSON.stringify(configUrl.href))
  .replace(/^import ["'][^\n]+\?astro&type=style[^\n]+\n/mg, "");
const serverJs = await stripTypes(serverSource, { loader: "ts", format: "esm" });
const component = await import(`data:text/javascript;base64,${Buffer.from(serverJs.code).toString("base64")}`);
const container = await experimental_AstroContainer.create({ manifest: {
  inlinedScripts: new Map([[`${filename}?astro&type=script&index=0&lang.ts`, ""]]),
} });
const rendered = await container.renderToString(component.default, { props: { class: "test-layout" } });
const configSource = await readFile(configUrl, "utf8");
const clientSource = (await readFile(clientUrl, "utf8"))
  .replace(/^import[^\n]+from "\.\.\/config\/nye-opening\.ts";\r?\n/, "")
  .replace(/^export \{ nyeOpeningState \} from "\.\.\/config\/nye-opening\.ts";\r?\n/m, "");
check(/^import /m.test(clientSource), false, "offline bundle includes the actual single config import");
const clientJs = (await stripTypes(`${configSource}\n${clientSource}`, { loader: "ts", format: "iife" })).code;
const font = await readFile(new URL("../node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff2", import.meta.url));
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
@font-face {font-family:Montserrat;font-weight:700;src:url(data:font/woff2;base64,${font.toString("base64")}) format("woff2")}
body{margin:0;padding:16px;--font-ui:Montserrat,sans-serif}a{display:block;margin:12px 0}[hidden]{display:none!important} ${compiled.css.join("\n")}
</style></head><body>
<span data-nye-before-only>Opens Nov 18th @ 9am</span>
<a href="/reserve/nye/" data-reservation-action data-nye-after-opening hidden><span data-reservation-action-label>Book NYE lanes</span><svg aria-hidden="true"></svg></a>
${rendered}
<a href="/reserve/nye/" data-nye-booking-cta data-nye-after-opening hidden>Book NYE lanes</a>
<a href="/reserve/nye/" data-nye-booking-cta data-nye-open-only hidden><span data-nye-booking-cta-label>Book NYE lanes</span><svg aria-hidden="true"></svg></a>
<p data-nye-opening-reminder>Reservations open Nov 18th @ 9am.</p>
<span data-nye-opening-reminder>Nov 18th @ 9am</span>
<a href="/events/" data-unrelated>Plan an event</a><section id="nye-times" data-nye-open-only hidden>Party times and prices</section>
</body></html>`;

const browser = await chromium.launch({ headless: true });
const requests = [];
const errors = [];
async function pageFor(options = {}) {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 }, reducedMotion: "reduce", ...options });
  await context.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  return { context, page };
}
const links = page => page.locator("a[data-nye-booking-cta], a[data-reservation-action]").evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute("href"), text: node.textContent })));
const numbers = page => page.locator("[data-nye-unit]").allTextContents();
const visibleCount = (page, selector) => page.locator(selector).evaluateAll(nodes => nodes.filter(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden").length);
async function checkPhaseVisibility(page, phase) {
  check(await visibleCount(page, "[data-nye-before-only]"), phase === "before" ? 1 : 0, `${phase}: quiet pre-opening notice has correct visibility`);
  check(await visibleCount(page, "[data-nye-after-opening]"), phase === "before" ? 0 : 2, `${phase}: header and hero booking links have correct visibility`);
  check(await visibleCount(page, "[data-nye-open-only]"), phase === "open" ? 2 : 0, `${phase}: times, prices and their booking action have correct visibility`);
}
async function install(page, now) {
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now));
  await page.setContent(html);
  await page.evaluate(() => {
    const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
    window.__nyeTimers = new Map();
    window.setTimeout = (fn, delay, ...args) => {
      const id = set(() => { window.__nyeTimers.delete(id); fn(...args); }, delay);
      window.__nyeTimers.set(id, delay); return id;
    };
    window.clearTimeout = id => { window.__nyeTimers.delete(id); clear(id); };
  });
  await page.addScriptTag({ content: clientJs });
}

try {
  const { context: nojs, page: plain } = await pageFor({ javaScriptEnabled: false });
  await plain.setContent(html);
  check(await plain.locator("time").innerText(), "Nov 18th @ 9am", "no-JS uses Jon's exact simple opening copy");
  check(await plain.locator("time").getAttribute("datetime"), NYE_OPENING_AT, "simple visible date retains unambiguous machine-readable instant");
  check(await plain.locator("[data-nye-opening-heading]").textContent(), "Reservations open", "no-JS keeps the selected opening heading");
  check(await plain.locator("[data-nye-opening-date]").isVisible(), true, "no-JS retains the opening date");
  check(await plain.locator("[data-nye-event-date]").isVisible(), false, "no-JS cannot confuse opening with the event date");
  check(await plain.locator("[data-nye-countdown]").isVisible(), false, "no-JS never displays empty or zero digits");
  check(await plain.locator("noscript a").getAttribute("href"), "/reserve/nye/", "no-JS can check the authoritative booking page after opening");
  check(await plain.locator("noscript a").isVisible(), true, "no-JS fallback is visible");
  await checkPhaseVisibility(plain, "before");
  await nojs.close();

  for (const timezoneId of ["America/Chicago", "America/Los_Angeles", "Europe/London", "Asia/Tokyo"]) {
    const { context, page } = await pageFor({ timezoneId });
    await page.setContent(html);
    check(await page.locator("[data-nye-countdown]").isVisible(), false, `${timezoneId}: no placeholder flicker before hydration`);
    await install(page, opensAt - 1001);
    check(await numbers(page), ["00", "00", "00", "02"], `${timezoneId}: same UTC countdown`);
    await checkPhaseVisibility(page, "before");
    check(await visibleCount(page, "a[data-nye-booking-cta], a[data-reservation-action]"), 0, `${timezoneId}: no visible booking-like action before opening`);
    check(await page.locator("[data-nye-opening-date]").innerText(), "Nov 18th @ 9am", "countdown retains the selected simple opening date");
    check(await page.locator("[data-nye-opening-date]").isVisible(), true, "opening date remains visible before opening");
    check(await page.locator("[data-nye-event-date]").isVisible(), false, "event date waits until opening");
    await page.clock.runFor(1000);
    check(await numbers(page), ["00", "00", "00", "01"], `${timezoneId}: final millisecond does not show zero`);
    check(await page.locator("[data-nye-status]").textContent(), "", "ticks never update the live region");
    await page.clock.runFor(1);
    check(await page.locator("[data-nye-countdown]").isVisible(), false, `${timezoneId}: countdown disappears exactly on time`);
    check(await page.locator("[data-nye-status]").textContent(), "Choose your party time.", "opening makes no stock promise");
    check(await links(page), Array(3).fill({ href: "/reserve/nye/", text: "Book NYE lanes" }), `${timezoneId}: every tagged CTA opens the NYE flow`);
    await checkPhaseVisibility(page, "open");
    check(await page.locator("[data-nye-opening-reminder]").allTextContents(), Array(2).fill("Choose your party time and lane type."), "full and compact opening reminders retire together");
    check(await page.locator("[data-nye-opening-heading]").textContent(), "NYE reservations", "opening label is no longer future-tense");
    check(await page.locator("[data-nye-opening-date]").isVisible(), false, "historical opening date disappears when booking opens");
    check(await page.locator("[data-nye-event-date]").isVisible(), true, "the event date replaces the opening date");
    check(await page.locator("[data-nye-event-date]").innerText(), "Thursday, December 31, 2026", "open card shows the party date");
    check(await page.locator("a svg").count(), 2, "label replacement preserves CTA icons");
    check(await page.locator("[data-unrelated]").textContent(), "Plan an event", "unrelated actions stay unchanged");
    check(await page.evaluate(() => [...window.__nyeTimers.values()].every(delay => delay > 1000)), true, "per-second timer stops once open");
    check(page.url(), "about:blank", "opening never navigates automatically");
    if (timezoneId === "America/Chicago") {
      // Playwright's clock accepts bounded millisecond jumps like browser timers.
      await page.clock.fastForward(20 * 86_400_000);
      await page.clock.fastForward(endsAt - opensAt - 20 * 86_400_000 - 1);
      check(await page.locator("[data-nye-opening]").getAttribute("data-nye-state"), "open", "long-lived tab remains current until final party ends");
      await page.clock.runFor(1);
      check(await links(page), [{ href: "/reserve/", text: "Reserve a lane" }, ...Array(2).fill({ href: "/reserve/", text: "Plan your next visit" })], "event end restores ordinary reservation links");
      check(await page.locator("[data-nye-opening-reminder]").allTextContents(), Array(2).fill("New Year’s Eve 2026 has ended."), "event-ended reminders");
      await checkPhaseVisibility(page, "ended");
      check(await page.locator("[data-nye-opening-date]").isVisible(), false, "event-ended card keeps the opening date hidden");
      check(await page.locator("[data-nye-event-date]").isVisible(), true, "event-ended card retains the event date");
      check(await page.locator("[data-nye-status]").textContent(), "This New Year's Eve event has ended.", "event-ended card reports completion");
      check(await page.evaluate(() => window.__nyeTimers.size), 0, "event-ended page has no running timer");
      await page.clock.setSystemTime(new Date(opensAt - 86_400_000));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      check(await numbers(page), ["01", "00", "00", "00"], "focus resynchronizes after a changed clock");
      check(await page.locator("[data-nye-opening-date]").isVisible(), true, "clock resync restores the opening date before opening");
      check(await page.locator("[data-nye-event-date]").isVisible(), false, "clock resync hides the event date before opening");
      check(await page.locator("[data-nye-opening-reminder]").allTextContents(), ["Reservations open Nov 18th @ 9am.", "Nov 18th @ 9am"], "clock resync preserves each original reminder style");
      await checkPhaseVisibility(page, "before");
    }
    await context.close();
  }

  for (const now of [opensAt, endsAt]) {
    const { context, page } = await pageFor();
    await install(page, now);
    check(await page.locator("[data-nye-countdown]").isVisible(), false, "first load after a deadline has no stale countdown");
    check(await page.locator("[data-nye-opening-date]").isVisible(), false, "fresh post-opening load hides the historical opening date");
    check(await page.locator("[data-nye-event-date]").innerText(), "Thursday, December 31, 2026", "fresh post-opening load has the readable event date");
    check(await page.locator("[data-nye-opening]").getAttribute("data-nye-state"), now === opensAt ? "open" : "ended", "first-load state is current");
    await checkPhaseVisibility(page, now === opensAt ? "open" : "ended");
    await context.close();
  }

  const { context, page } = await pageFor();
  await install(page, Date.parse("2026-10-31T17:00:00Z"));
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator("[data-nye-opening]").evaluate(card => ({
      overflow: card.scrollWidth > card.clientWidth,
      width: card.getBoundingClientRect().width,
      fonts: [...card.querySelectorAll("p, time, time span, [data-nye-unit], .nye-opening__unit-label")].map(el => Number.parseFloat(getComputedStyle(el).fontSize)),
      animated: [card, ...card.querySelectorAll("*")].some(el => getComputedStyle(el).animationName !== "none"),
    }));
    check(layout.overflow, false, `${width}px: no card overflow`);
    check(layout.width <= Math.min(400, width - 32), true, `${width}px: full-width card respects maximum`);
    check(layout.fonts.every(size => size >= 12), true, `${width}px: minimum 12px text`);
    check(layout.animated, false, `${width}px: no countdown animations`);
  }
  await context.close();
  check(requests, [], "no API or external resource requests");
  check(errors, [], "no browser script errors");
  console.log(`NYE opening: ${checks} checks passed (boundaries, DST, four browser time zones, no-JS, timers and responsive component).`);
} finally {
  await browser.close();
}
