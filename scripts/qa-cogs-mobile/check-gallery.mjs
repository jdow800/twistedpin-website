import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { browser } from "./cdp.mjs";

const root = resolve(process.env.COGS_QA_GALLERY_OUTPUT || fileURLToPath(new URL("./output/", import.meta.url)));
const out = join(root, "gallery-review");
await mkdir(out, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!path.toLowerCase().startsWith(`${root}${sep}`.toLowerCase())) {
      response.writeHead(403).end();
      return;
    }
    const mime = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".json": "application/json" };
    const data = await readFile(path);
    response.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const b = await browser();
const checks = [];
async function check(name, expression) {
  assert.ok(await b.evaluate(expression), name);
  checks.push(name);
}
async function filter(value) {
  await b.evaluate(`(() => { const input = document.querySelector('input'); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}
async function screenshot(name) {
  await b.evaluate(`document.querySelector('article:not([hidden])')?.scrollIntoView({ block: 'start' })`);
  const { data } = await b.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(out, `${name}.png`), Buffer.from(data, "base64"));
}
try {
  await b.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1300, deviceScaleFactor: 1, mobile: false });
  await b.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/index.html` });
  await b.until(`document.querySelectorAll('article').length === 81`);
  await b.evaluate(`Promise.all([...document.images].map(image => { image.loading = 'eager'; return image.decode(); }))`);
  await check("All 162 gallery images decode successfully", `document.images.length === 162 && [...document.images].every(i => i.complete && i.naturalWidth > 0)`);
  await check("Samsung-sized selector shows exactly 27 comparisons", `document.querySelectorAll('article:not([hidden])').length === 27 && [...document.querySelectorAll('article:not([hidden])')].every(a => a.dataset.viewport === 's24-ultra')`);
  for (const [term, file] of [["food shelf", "food-shelf-pair"], ["food speech review", "food-speech-pair"], ["bottled beer", "beer-pair"]]) {
    await filter(term);
    await check(`Filter finds one ${term} comparison`, `document.querySelectorAll('article:not([hidden])').length === 1`);
    await screenshot(file);
  }
  await b.evaluate(`document.querySelector('[data-view="small-phone"]').click()`);
  await filter("liquor speech review");
  await check("Narrow-phone selector and active state work", `document.querySelector('[data-view="small-phone"]').getAttribute('aria-pressed') === 'true' && document.querySelector('article:not([hidden])').dataset.viewport === 'small-phone'`);
  await screenshot("narrow-liquor-pair");
  await b.evaluate(`document.querySelector('[data-view="desktop"]').click()`);
  await filter("");
  await check("Desktop selector shows exactly 27 comparisons", `document.querySelectorAll('article:not([hidden])').length === 27 && [...document.querySelectorAll('article:not([hidden])')].every(a => a.dataset.viewport === 'desktop')`);
  await b.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  await b.evaluate(`document.querySelector('[data-view="s24-ultra"]').click()`);
  await filter("food shelf");
  await check("Gallery fits a 360px viewport without horizontal overflow", `document.documentElement.scrollWidth <= 360`);
  await check("Phone comparisons stack at a readable width", `(() => { const figures = [...document.querySelector('article:not([hidden])').querySelectorAll('figure')]; const first = figures[0].getBoundingClientRect(); const second = figures[1].getBoundingClientRect(); return first.width >= 270 && second.top >= first.bottom; })()`);
  await screenshot("gallery-on-phone");
  await filter("no such screen");
  await check("An unmatched filter shows no comparisons", `document.querySelectorAll('article:not([hidden])').length === 0`);
  await filter("");
  await check("Clearing the filter restores all 27 selected comparisons", `document.querySelectorAll('article:not([hidden])').length === 27`);
  assert.equal(b.blocked.length, 0, "No blocked/external requests");
  checks.push("Gallery verification made no external requests");
  await writeFile(join(out, "results.json"), JSON.stringify({ checks, blocked: b.blocked, failures: [] }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, output: out }));
} finally {
  await b.close();
  await new Promise(resolve => server.close(resolve));
}
