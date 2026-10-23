/** Bounded /reserve/ observation; clicks one package, NEVER a time or quantity.
 * Usage: node scripts/measure-reserve-loading.mjs <url> <label> [--clock=ISO] [--stay-main]
 * Optional TP_PREVIEW_OBSERVATION_TOKEN is sent only to the exact target origin.
 * Fresh browser; no cookies, credentials, request bodies or customer data saved.
 * Routing disables the browser HTTP cache; use this same harness for both sides.
 * --clock changes CLIENT Date only; the live server clock and inventory do not change.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const [targetArg, label, ...flags] = process.argv.slice(2);
if (!targetArg || !label || flags.some(flag => flag !== '--stay-main' && !flag.startsWith('--clock='))) {
  console.error('Usage: node scripts/measure-reserve-loading.mjs <url> <label> [--clock=ISO] [--stay-main]');
  process.exit(2);
}
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(label)) throw new Error('Invalid observation label');
const target = new URL(targetArg);
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || !/^\/reserve\/?$/.test(target.pathname)) {
  throw new Error('Use an HTTP(S) /reserve/ URL without embedded credentials');
}
const clockFlags = flags.filter(flag => flag.startsWith('--clock='));
const clientClock = clockFlags[0]?.slice('--clock='.length);
if (clockFlags.length > 1 || (clockFlags.length && (!clientClock || !/(?:Z|[+-]\d{2}:\d{2})$/.test(clientClock) || !Number.isFinite(Date.parse(clientClock))))) {
  throw new Error('--clock requires one ISO timestamp with an explicit timezone');
}
const stayMain = flags.includes('--stay-main');
const token = process.env.TP_PREVIEW_OBSERVATION_TOKEN;
const preferredName = /^2 Hour.*VIP Suite/i;
const output = resolve(fileURLToPath(new URL('../', import.meta.url)), '.astro/reserve-comparison');
const filename = resolve(output, `${label}.json`);
const started = performance.now();
const elapsed = () => Math.round(performance.now() - started);
const durationLimitMs = 60_000;
const errors = [], blockedRequests = [], requests = [], jobs = [];
const requestRows = new Map();
const receipt = {
  label, target: `${target.origin}${target.pathname}`, startedUtc: new Date().toISOString(),
  mode: stayMain ? 'browse only; no package click' : 'one VIP two-hour package click; no time selection',
  environment: {
    browser: 'fresh headless Chromium', viewport: '390x844', deviceScaleFactor: 1,
    mobile: true, timezone: 'America/Chicago', reducedMotion: 'no-preference',
    cpuNetworkThrottling: false, prewarming: false, serviceWorkers: 'blocked',
    browserHttpCache: 'disabled by Playwright request routing on every comparison',
    clientClock: clientClock ?? 'real time', serverClock: 'unchanged/live',
    previewAuthenticationConfigured: Boolean(token), durationLimitMs,
    authenticatedTransport: token ? 'target-origin requests fetched with redirect following disabled, then fulfilled; use the same token mode for both sides' : 'normal browser requests through the read-only route guard',
  },
  preferredProduct: { name: '2 Hour w/ Shoes (VIP Suite)', code: 123 },
  milestones: {}, dateTransitions: [], errors, blockedRequests, requests,
};
let browser, context, page, watchdog, stage = 'launch';
let timedOut = false;
const bounded = maximum => Math.max(1, Math.min(maximum, durationLimitMs - elapsed()));
function errorMessage(error) {
  let text = String(error?.message ?? error).split('\n')[0];
  if (token) text = text.split(token).join('[redacted]');
  return text.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 220);
}
function apiPath(url) {
  return url.pathname.replace(/^\/(?:tprs-api|nye-rehearsal-api)(?=\/|$)/, '').replace(/\/+$/, '');
}
function isApi(url) {
  return /\/(?:api|tprs-api|nye-rehearsal-api)(?:\/|$)/.test(url.pathname) || url.hostname.startsWith('api.');
}
function allowedRequest(url, method) {
  const path = apiPath(url);
  if (method === 'POST' && path === '/api/checkout/attempt-active') return true;
  // Even a GET to these routes is outside this observation's contract.
  if (/(?:^|\/)(?:carts?|checkout|quotes?|payments?|payment[-_]intents?|holds?|sessions?)(?:\/|$)/i.test(path)) return false;
  if (!isApi(url)) return true; // Normal page assets and analytics are unchanged.
  if (!['GET', 'HEAD'].includes(method)) return false;
  return /^\/api\/(?:products(?:\/bookable|\/[0-9a-f-]{36}(?:\/forms)?)?|availability(?:\/month|\/slot)?)$/i.test(path);
}
function publicRequestInfo(url, method) {
  const path = apiPath(url);
  const permittedPath = /^\/api\/(?:products(?:\/bookable|\/[0-9a-f-]{36}(?:\/forms)?)?|availability(?:\/month|\/slot)?|checkout\/attempt-active)$/i.test(path);
  const query = {};
  for (const [key, value] of url.searchParams) {
    if ((['product_id', 'productId'].includes(key) && /^[0-9a-f-]{36}$/i.test(value)) ||
      (key === 'codes' && /^\d+(?:,\d+)*$/.test(value)) ||
      (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
      (key === 'month' && /^\d{4}-\d{2}$/.test(value)) ||
      (key === 'include_policy' && /^(?:true|false)$/.test(value))) query[key] = value;
  }
  return { origin: url.origin, path: permittedPath ? path : '[outside read-only allowlist]', method, query };
}
const headerNames = ['server-timing', 'x-availability-cache', 'cache-control', 'age', 'x-vercel-cache', 'x-render-origin-server'];
async function captureDom() {
  if (!page || page.isClosed()) return;
  const snapshot = await page.evaluate(() => {
    const data = window.__reserveLoadingObservation;
    return data ? { ...data, navigation: performance.getEntriesByType('navigation').map(entry => ({
      responseStartMs: entry.responseStart, responseEndMs: entry.responseEnd,
      domContentLoadedMs: entry.domContentLoadedEventEnd, loadMs: entry.loadEventEnd,
      transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize,
    })) } : null;
  });
  if (!snapshot) return;
  receipt.browserMilestones = snapshot.milestones;
  receipt.dateTransitions = snapshot.dateTransitions;
  receipt.lastUiState = snapshot.lastUiState;
  receipt.navigation = snapshot.navigation;
}
try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    timezoneId: 'America/Chicago', reducedMotion: 'no-preference', serviceWorkers: 'block',
  });
  watchdog = setTimeout(() => {
    timedOut = true;
    errors.push({ stage, message: 'Overall 60-second observation deadline reached' });
    void context.close().catch(() => {});
  }, bounded(durationLimitMs));
  await context.route('**/*', async route => {
    try {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (!allowedRequest(url, method)) {
      blockedRequests.push({ atMs: elapsed(), ...publicRequestInfo(url, method), reason: 'outside read-only observation contract' });
      return route.abort('blockedbyclient');
    }
    if (token && url.origin === target.origin) {
      // continue({headers}) propagates header overrides through redirects.
      // Never allow the bypass secret to follow a redirect to another origin.
      const response = await route.fetch({
        headers: { ...request.headers(), 'x-vercel-protection-bypass': token },
        maxRedirects: 0, timeout: bounded(20_000),
      });
      return route.fulfill({ response });
    }
    return route.continue();
    } catch (error) {
      if (!timedOut) errors.push({ stage: 'request transport', message: errorMessage(error) });
      await route.abort('failed').catch(() => {});
    }
  });
  await context.addInitScript(() => {
    const data = window.__reserveLoadingObservation = { milestones: {}, dateTransitions: [], lastUiState: {} };
    const now = () => Math.round(performance.now());
    const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const text = element => (element?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    let previousDate = '', previousMainChip = '';
    function sample() {
      const cards = [...document.querySelectorAll('.tprs-card-list button:not([disabled])')].filter(visible);
      const preferred = cards.find(button => /^2 Hour.*VIP Suite/i.test(button.getAttribute('aria-label') || text(button.querySelector('.tprs-card-name')) || text(button)));
      const times = [...document.querySelectorAll('.tprs-slot:not([disabled]), .tprs-time:not([disabled]), .tprs-times button:not([disabled]), .tprs-time-grid button:not([disabled])')].filter(visible);
      const detail = Boolean(document.querySelector('.tprs-detail-head'));
      const chip = document.querySelector('.tprs-datestrip .tprs-chip[aria-pressed="true"]');
      const month = document.querySelector('.tprs-datestrip-month');
      const monthText = month ? [...month.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() : '';
      if (document.querySelector('.tprs-card-list') && data.milestones.mainMountedMs === undefined) data.milestones.mainMountedMs = now();
      if (cards.length && data.milestones.firstAnyCardMs === undefined) data.milestones.firstAnyCardMs = now();
      if (preferred && data.milestones.preferredCardMs === undefined) data.milestones.preferredCardMs = now();
      if (times.length && data.milestones.firstExactTimeMs === undefined) data.milestones.firstExactTimeMs = now();
      const selected = chip ? { stage: detail ? 'detail' : 'main', month: monthText, chip: text(chip) } : null;
      const key = JSON.stringify(selected);
      if (selected && key !== previousDate) {
        data.dateTransitions.push({ atMs: now(), ...selected });
        if (!detail) {
          if (/Today/i.test(previousMainChip) && !/Today/i.test(selected.chip) && data.milestones.autoForwardMs === undefined) data.milestones.autoForwardMs = now();
          previousMainChip = selected.chip;
        }
      }
      previousDate = key;
      data.lastUiState = {
        stage: detail ? 'detail' : 'main', selectedDate: selected, enabledPackageCount: cards.length,
        enabledTimeCount: times.length, preferredProductHeading: detail ? text(document.querySelector('.tprs-detail-head h2')) : null,
        readError: Boolean(document.querySelector('.tprs-read-error')), empty: Boolean(document.querySelector('.tprs-empty')),
      };
    }
    new MutationObserver(sample).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    document.addEventListener('DOMContentLoaded', sample, { once: true });
  });
  page = await context.newPage();
  if (clientClock) await page.clock.setFixedTime(clientClock);
  page.on('pageerror', error => errors.push({ stage: 'page', message: errorMessage(error) }));
  page.on('request', request => {
    const url = new URL(request.url());
    if (!isApi(url)) return;
    const row = { startMs: elapsed(), ...publicRequestInfo(url, request.method()) };
    requests.push(row); requestRows.set(request, row);
  });
  page.on('requestfailed', request => {
    const row = requestRows.get(request);
    if (row) { row.endMs = elapsed(); row.failure = errorMessage(request.failure()?.errorText ?? 'request failed'); }
  });
  page.on('response', response => {
    const row = requestRows.get(response.request());
    if (!row) return;
    jobs.push((async () => {
      row.status = response.status(); row.headersMs = elapsed();
      const headers = response.headers();
      row.headers = Object.fromEntries(headerNames.filter(name => headers[name]).map(name => [name, headers[name]]));
      await response.finished(); row.endMs = elapsed();
      if (row.method !== 'GET' || !/^\/api\/(?:products|availability)(?:\/|$)/.test(row.path)) return;
      try {
        const body = await response.json();
        const days = Array.isArray(body.days) ? body.days : row.path.endsWith('/month') && Array.isArray(body) ? body : null;
        const slots = Array.isArray(body.slots) ? body.slots : row.path === '/api/availability' && Array.isArray(body) ? body : null;
        if (days) row.days = { total: days.length, available: days.filter(day => day.available === true).length };
        if (slots) row.slots = { total: slots.length, available: slots.filter(slot => slot.available === true).length };
        const products = Array.isArray(body.products) ? body.products : Array.isArray(body.categories) ? body.categories.flatMap(category => category.products ?? []) : [];
        const preferred = products.find(product => Number(product.code) === 123 && preferredName.test(product.name));
        if (preferred) receipt.preferredProduct = { id: preferred.id, code: preferred.code, name: preferred.name };
      } catch { row.publicMetadataUnavailable = true; }
    })().catch(error => { row.observationError = errorMessage(error); }));
  });
  stage = 'navigation'; receipt.milestones.navigationStartMs = elapsed();
  const navigationResponse = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: bounded(30_000) });
  receipt.navigationStatus = navigationResponse?.status() ?? null;
  receipt.milestones.domContentLoadedMs = elapsed();
  if (!navigationResponse?.ok()) throw new Error('Navigation did not return a successful response (check preview authorization)');
  stage = 'first package';
  await page.locator('.tprs-card-list button:not([disabled])').first().waitFor({ state: 'visible', timeout: bounded(16_000) });
  receipt.milestones.firstAnyCardMs = elapsed();
  stage = 'preferred VIP two-hour package';
  const preferredCard = page.getByRole('button', { name: preferredName }).and(page.locator('.tprs-card-list button:not([disabled])'));
  await preferredCard.waitFor({ state: 'visible', timeout: bounded(16_000) });
  receipt.milestones.preferredCardMs = elapsed();
  await captureDom();
  receipt.selectedDateBeforeClick = receipt.lastUiState?.selectedDate ?? null;
  if (!stayMain) {
    stage = 'one package click';
    receipt.milestones.packageClickMs = elapsed();
    await preferredCard.click({ timeout: bounded(5_000) });
    stage = 'exact times';
    await page.locator('.tprs-slot:not([disabled]), .tprs-time:not([disabled]), .tprs-times button:not([disabled]), .tprs-time-grid button:not([disabled])').first().waitFor({ state: 'visible', timeout: bounded(12_000) });
    receipt.milestones.exactTimesReadyMs = elapsed();
  }
  stage = 'bounded settling';
  await page.waitForTimeout(bounded(4_000));
  await captureDom();
} catch (error) {
  if (!timedOut) errors.push({ stage, message: errorMessage(error) });
  try { await captureDom(); } catch { /* A closed page has no additional snapshot. */ }
} finally {
  clearTimeout(watchdog);
  await browser?.close().catch(() => {});
  await Promise.allSettled(jobs);
  receipt.finishedUtc = new Date().toISOString(); receipt.elapsedMs = elapsed();
  receipt.milestones.bootstrapStartMs = requests.find(row => row.path === '/api/checkout/attempt-active')?.startMs ?? requests[0]?.startMs ?? null;
  const bootstrap = receipt.milestones.bootstrapStartMs;
  receipt.fromBootstrapMs = Object.fromEntries(['firstAnyCardMs', 'preferredCardMs', 'exactTimesReadyMs'].map(key => [key,
    bootstrap !== null && receipt.milestones[key] !== undefined ? receipt.milestones[key] - bootstrap : null]));
  const browserNavigation = receipt.milestones.navigationStartMs;
  if (receipt.browserMilestones && browserNavigation !== undefined) {
    receipt.browserMilestoneClock = 'milliseconds since browser document navigation; node milestones use process observation start';
  }
  receipt.summary = {
    apiRequests: requests.length, availabilityRequests: requests.filter(row => row.path.startsWith('/api/availability')).length,
    cacheStates: requests.filter(row => row.path.startsWith('/api/availability')).reduce((counts, row) => {
      const timingState = row.headers?.['server-timing']?.match(/(?:^|,)\s*cache\s*;[^,]*?\bdesc\s*=\s*"?([a-z][a-z0-9_-]*)/i)?.[1]?.toLowerCase();
      const state = row.headers?.['x-availability-cache'] ?? timingState ?? 'unreported'; counts[state] = (counts[state] ?? 0) + 1; return counts;
    }, {}),
    blockedRequests: blockedRequests.length, failedRequests: requests.filter(row => row.failure || row.status >= 400).length,
  };
  receipt.error = errors[0]?.message ?? (blockedRequests.length ? 'Read-only guard blocked an unexpected request' : null);
  await mkdir(output, { recursive: true });
  await writeFile(filename, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ filename, label, ...receipt.milestones, fromBootstrapMs: receipt.fromBootstrapMs,
    preferredProduct: receipt.preferredProduct, selectedDate: receipt.lastUiState?.selectedDate ?? receipt.selectedDateBeforeClick,
    autoForwardMs: receipt.browserMilestones?.autoForwardMs ?? null, ...receipt.summary, error: receipt.error }, null, 2));
  if (receipt.error) process.exitCode = 1;
}
