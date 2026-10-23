/** Browse-only first visit + ordinary reload in ONE fresh browser context.
 * Usage: node scripts/measure-reserve-browser-cache.mjs <url> <label> [--clock=ISO]
 * NEVER clicks a package/time or submits a form. No Playwright request routing:
 * Chromium's HTTP cache remains enabled. CDP Network is observation only.
 * Optional TP_PREVIEW_OBSERVATION_TOKEN bootstraps Vercel's bypass cookie with
 * one exact-origin GET and maxRedirects:0; no secret header reaches page requests.
 * No cookies, credentials, bodies, storage state, or customer data are saved.
 * --clock changes CLIENT Date only; server time and inventory remain live.
 * Docs: https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const [targetArg, label, ...flags] = process.argv.slice(2);
if (!targetArg || !label || flags.length > 1 || flags.some(flag => !flag.startsWith('--clock='))) {
  console.error('Usage: node scripts/measure-reserve-browser-cache.mjs <url> <label> [--clock=ISO]');
  process.exit(2);
}
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(label)) throw new Error('Invalid observation label');
const target = new URL(targetArg);
if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.search || target.hash || !/^\/reserve\/?$/.test(target.pathname)) {
  throw new Error('Use a clean HTTP(S) /reserve/ URL without credentials, query, or fragment');
}
const clientClock = flags[0]?.slice('--clock='.length);
if (flags.length && (!clientClock || !/(?:Z|[+-]\d{2}:\d{2})$/.test(clientClock) || !Number.isFinite(Date.parse(clientClock)))) {
  throw new Error('--clock requires one ISO timestamp with an explicit timezone');
}
const token = process.env.TP_PREVIEW_OBSERVATION_TOKEN;
const output = resolve(fileURLToPath(new URL('../', import.meta.url)), '.astro/reserve-comparison');
const filename = resolve(output, `${label}.json`);
const started = performance.now();
const elapsed = () => Math.round(performance.now() - started);
const durationLimitMs = 75_000;
const bounded = maximum => Math.max(1, Math.min(maximum, durationLimitMs - elapsed()));
const headerNames = ['server-timing', 'x-availability-cache', 'cache-control', 'age', 'x-vercel-cache', 'x-render-origin-server'];
const receipt = {
  label, target: target.href, startedUtc: new Date().toISOString(),
  mode: 'browse only: first visit, then ordinary reload in the same context; no interaction',
  environment: {
    browser: 'fresh headless Chromium', viewport: '390x844', deviceScaleFactor: 1,
    mobile: true, timezone: 'America/Chicago', reducedMotion: 'no-preference',
    cpuNetworkThrottling: false, serviceWorkers: 'blocked', durationLimitMs,
    browserHttpCache: 'enabled; no routing/interception; ordinary reload may revalidate cached entries',
    moduleMemoryCache: 'new document on each visit',
    backendCache: 'live shared state; not reset or assumed cold on first visit',
    clientClock: clientClock ?? 'real time', serverClock: 'unchanged/live',
    previewAuthenticationConfigured: Boolean(token),
    writeProtection: 'fresh context; no clicks; fetch/XHR/beacon and form guards; audited MainStep browse path',
  },
  preferredProduct: { name: '2 Hour w/ Shoes (VIP Suite)', code: 123 },
  visits: [], errors: [], guardErrors: [],
};
let browser, context, page, watchdog, activeVisit, stage = 'launch', timedOut = false;
const rowsById = new Map();
function errorMessage(error) {
  let message = String(error?.message ?? error).split('\n')[0];
  if (token) message = message.split(token).join('[redacted]');
  return message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 220);
}
function publicApiInfo(rawUrl, method) {
  const url = new URL(rawUrl);
  if (!/\/(?:api|tprs-api|nye-rehearsal-api)(?:\/|$)/.test(url.pathname) && !url.hostname.startsWith('api.')) return null;
  const path = url.pathname.replace(/^\/(?:tprs-api|nye-rehearsal-api)(?=\/|$)/, '').replace(/\/+$/, '');
  const permitted = /^\/api\/(?:products(?:\/bookable)?|availability(?:\/month)?|checkout\/attempt-active)$/.test(path);
  const query = {};
  for (const [key, value] of url.searchParams) {
    if ((['product_id', 'productId'].includes(key) && /^[0-9a-f-]{36}$/i.test(value)) ||
        (key === 'codes' && /^\d+(?:,\d+)*$/.test(value)) ||
        (key === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
        (key === 'month' && /^\d{4}-\d{2}$/.test(value)) ||
        (key === 'include_policy' && /^(?:true|false)$/.test(value))) query[key] = value;
  }
  return { origin: url.origin, path: permitted ? path : '[outside browse allowlist]', method, query };
}
function browserCached(row) {
  return Boolean(row.requestServedFromCache || row.fromDiskCache || row.fromPrefetchCache || row.fromServiceWorker);
}
function cacheState(row) {
  return row.headers?.['x-availability-cache'] ?? row.headers?.['server-timing']?.match(/(?:^|,)\s*cache\s*;[^,]*?\bdesc\s*=\s*"?([a-z][a-z0-9_-]*)/i)?.[1]?.toLowerCase() ?? 'unreported';
}
function countStates(rows) {
  return rows.reduce((counts, row) => { const state = cacheState(row); counts[state] = (counts[state] ?? 0) + 1; return counts; }, {});
}
async function snapshot(visit) {
  if (!page || page.isClosed()) return;
  const data = await page.evaluate(() => {
    const observation = window.__reserveCacheObservation;
    return observation ? { ...observation, navigation: performance.getEntriesByType('navigation').map(entry => ({
      type: entry.type, responseStartMs: entry.responseStart, responseEndMs: entry.responseEnd,
      domContentLoadedMs: entry.domContentLoadedEventEnd, loadMs: entry.loadEventEnd,
      transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize,
    })) } : null;
  });
  if (data) Object.assign(visit, data);
}
try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    timezoneId: 'America/Chicago', reducedMotion: 'no-preference', serviceWorkers: 'block',
  });
  watchdog = setTimeout(() => {
    timedOut = true;
    receipt.errors.push({ stage, message: 'Overall 75-second observation deadline reached' });
    void context.close().catch(() => {});
  }, bounded(durationLimitMs));
  if (token) {
    stage = 'preview cookie bootstrap';
    // BrowserContext.request shares its cookie jar with the browser. Never
    // follow redirects with this header, and never save Set-Cookie or cookies.
    const response = await context.request.get(target.href, {
      headers: { 'x-vercel-protection-bypass': token, 'x-vercel-set-bypass-cookie': 'true' },
      maxRedirects: 0, timeout: bounded(15_000),
    });
    receipt.authenticationBootstrap = {
      status: response.status(), cookieReceived: (await context.cookies(target.href)).length > 0,
      method: 'one exact-origin GET, redirect following disabled; shared context cookie jar',
    };
    await response.dispose();
    if (receipt.authenticationBootstrap.status >= 400 ||
        (receipt.authenticationBootstrap.status >= 300 && !receipt.authenticationBootstrap.cookieReceived)) {
      throw new Error('Preview cookie bootstrap failed; no page navigation attempted');
    }
  }
  // Playwright's fixed Date clock also virtualizes performance.now across
  // navigations. Receive one event per milestone on Node's real clock so a
  // reload is measured from its own navigation, not the prior document.
  await context.exposeBinding('__reserveCacheMilestone', (_source, name) => {
    if (activeVisit && typeof name === 'string' && activeVisit.realMilestones[name] === undefined)
      activeVisit.realMilestones[name] = elapsed() - activeVisit.startMs;
  });
  await context.addInitScript(() => {
    const data = window.__reserveCacheObservation = { browserMilestones: {}, dateTransitions: [], lastUiState: {}, blockedRequests: [] };
    const now = () => Math.round(performance.now());
    const mark = name => {
      if (data.browserMilestones[name] !== undefined) return;
      data.browserMilestones[name] = now();
      void window.__reserveCacheMilestone(name);
    };
    const allowed = (rawUrl, rawMethod = 'GET') => {
      const method = String(rawMethod).toUpperCase();
      let url;
      try { url = new URL(rawUrl, location.href); } catch { return false; }
      const path = url.pathname.replace(/^\/(?:tprs-api|nye-rehearsal-api)(?=\/|$)/, '').replace(/\/+$/, '');
      const api = /\/(?:api|tprs-api|nye-rehearsal-api)(?:\/|$)/.test(url.pathname) || url.hostname.startsWith('api.');
      if (api && method === 'POST' && path === '/api/checkout/attempt-active') return true; // Read-only discovery.
      if (!['GET', 'HEAD'].includes(method)) return false;
      if (/(?:^|\/)(?:carts?|checkout|quotes?|payments?|payment[-_]intents?|holds?|sessions?)(?:\/|$)/i.test(path)) return false;
      return !api || /^\/api\/(?:products(?:\/bookable)?|availability(?:\/month)?)$/.test(path);
    };
    const blocked = (rawUrl, method, transport) => {
      let diagnostic = { bookingApi: false, category: 'invalid-url', hostname: null, path: '[redacted]' };
      try {
        const url = new URL(rawUrl, location.href);
        const path = url.pathname.replace(/^\/(?:tprs-api|nye-rehearsal-api)(?=\/|$)/, '').replace(/\/+$/, '');
        const bookingApi = /\/(?:api|tprs-api|nye-rehearsal-api)(?:\/|$)/.test(url.pathname) || url.hostname.startsWith('api.')
          || /(?:^|\/)(?:carts?|checkout|quotes?|payments?|payment[-_]intents?|holds?|sessions?)(?:\/|$)/i.test(path);
        const analytics = !bookingApi && (
          /(?:^|\.)(?:clarity\.ms|google-analytics\.com|analytics\.google\.com|googletagmanager\.com|googleadservices\.com|googlesyndication\.com|doubleclick\.net|facebook\.com|facebook\.net|vercel-insights\.com)$/.test(url.hostname)
          || (url.hostname === 'www.google.com' && String(method).toUpperCase() === 'POST')
          || (url.origin === location.origin && /^\/_vercel\/(?:insights|speed-insights)(?:\/|$)/.test(path))
        );
        const knownPath = /^\/(?:api\/(?:products|availability)(?:\/bookable|\/month|\/slot)?|api\/checkout\/attempt-active|(?:g\/|ccm\/)?collect|tr|_vercel\/insights\/event|_vercel\/speed-insights\/vitals)$/.test(path);
        const bookingPrefix = path.match(/^\/(?:api\/)?(?:carts?|checkout|quotes?|payments?|payment[-_]intents?|holds?|sessions?)(?=\/|$)/i)?.[0];
        diagnostic = { bookingApi, category: bookingApi ? 'booking-api' : analytics ? 'analytics' : url.origin === location.origin ? 'public-site' : 'third-party',
          hostname: url.hostname, path: knownPath ? path : bookingPrefix ? `${bookingPrefix}/[redacted]` : '[redacted]' };
      } catch { /* Invalid URLs remain blocked without retaining their text. */ }
      data.blockedRequests.push({ atMs: now(), method: String(method).toUpperCase(), transport, ...diagnostic, reason: 'outside browse-only contract' });
    };
    const guardError = () => new TypeError('ReserveBrowserCacheGuard: blocked request');
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      const url = input instanceof Request ? input.url : String(input);
      if (!allowed(url, method)) {
        blocked(url, method, 'fetch'); return Promise.reject(guardError());
      }
      return originalFetch.call(this, input, init);
    };
    const xhrInfo = new WeakMap(), originalOpen = XMLHttpRequest.prototype.open, originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      xhrInfo.set(this, { method, url }); return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function(body) {
      const request = xhrInfo.get(this);
      if (!request || !allowed(request.url, request.method)) {
        blocked(request?.url, request?.method ?? 'unknown', 'xhr'); throw guardError();
      }
      return originalSend.call(this, body);
    };
    navigator.sendBeacon = function(url) { blocked(url, 'POST', 'beacon'); return false; };
    document.addEventListener('submit', event => { event.preventDefault(); blocked(event.target?.action, event.target?.method ?? 'POST', 'form'); }, true);
    HTMLFormElement.prototype.submit = function() { blocked(this.action, this.method, 'form.submit'); };
    HTMLFormElement.prototype.requestSubmit = function() { blocked(this.action, this.method, 'form.requestSubmit'); };
    const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const text = element => (element?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    let previousDate = '', previousChip = '';
    function sample() {
      const cards = [...document.querySelectorAll('.tprs-card-list button:not([disabled])')].filter(visible);
      const preferred = cards.some(button => /^2 Hour.*VIP Suite/i.test(button.getAttribute('aria-label') || text(button.querySelector('.tprs-card-name')) || text(button)));
      const month = document.querySelector('.tprs-datestrip-month');
      const monthText = month ? [...month.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() : '';
      const chip = document.querySelector('.tprs-datestrip .tprs-chip[aria-pressed="true"]');
      const selectedDate = chip ? { month: monthText, chip: text(chip) } : null;
      if (document.querySelector('.tprs-card-list')) mark('mainMountedMs');
      if (cards.length) mark('firstAnyCardMs');
      if (preferred) mark('preferredCardMs');
      const key = JSON.stringify(selectedDate);
      if (selectedDate && key !== previousDate) {
        data.dateTransitions.push({ atMs: now(), ...selectedDate });
        if (/Today/i.test(previousChip) && !/Today/i.test(selectedDate.chip)) mark('autoForwardMs');
        previousChip = selectedDate.chip;
      }
      previousDate = key;
      data.lastUiState = { selectedDate, enabledPackageCount: cards.length, preferredCardReady: preferred,
        detailVisible: Boolean(document.querySelector('.tprs-detail-head')), readError: Boolean(document.querySelector('.tprs-read-error')) };
    }
    new MutationObserver(sample).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
    document.addEventListener('DOMContentLoaded', sample, { once: true });
  });
  page = await context.newPage();
  if (clientClock) await page.clock.setFixedTime(clientClock);
  page.on('pageerror', error => {
    const item = { stage: activeVisit?.name ?? stage, message: errorMessage(error) };
    // Deliberate guard rejections are instrumentation, not application errors.
    // Their destination classification below still fails unexpected booking calls.
    if (item.message === 'ReserveBrowserCacheGuard: blocked request') receipt.guardErrors.push(item);
    else receipt.errors.push(item);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  cdp.on('Network.requestWillBeSent', event => {
    if (!activeVisit) return;
    const row = { startMs: elapsed() - activeVisit.startMs, resourceType: event.type ?? 'Other' };
    const api = publicApiInfo(event.request.url, event.request.method);
    if (api) Object.assign(row, api);
    activeVisit.resources.push(row); rowsById.set(event.requestId, { row, visit: activeVisit });
  });
  cdp.on('Network.requestServedFromCache', event => {
    const item = rowsById.get(event.requestId); if (item) item.row.requestServedFromCache = true;
  });
  cdp.on('Network.responseReceived', event => {
    const item = rowsById.get(event.requestId); if (!item) return;
    const { row, visit } = item, response = event.response;
    Object.assign(row, { headersMs: elapsed() - visit.startMs, status: response.status,
      fromDiskCache: Boolean(response.fromDiskCache), fromPrefetchCache: Boolean(response.fromPrefetchCache), fromServiceWorker: Boolean(response.fromServiceWorker) });
    if (row.path) {
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
      row.headers = Object.fromEntries(headerNames.filter(name => headers[name]).map(name => [name, headers[name]]));
    }
  });
  cdp.on('Network.responseReceivedExtraInfo', event => {
    // CDP's ordinary response can expose the cached 200 after a 304 validation.
    // Retain the actual network status separately; never copy extra headers.
    const item = rowsById.get(event.requestId);
    if (item) item.row.networkStatus = event.statusCode;
  });
  cdp.on('Network.loadingFinished', event => {
    const item = rowsById.get(event.requestId);
    if (item) Object.assign(item.row, { endMs: elapsed() - item.visit.startMs, encodedDataLength: event.encodedDataLength });
  });
  cdp.on('Network.loadingFailed', event => {
    const item = rowsById.get(event.requestId);
    if (item) Object.assign(item.row, { endMs: elapsed() - item.visit.startMs, failure: errorMessage(event.errorText) });
  });
  for (const name of ['first-visit', 'same-context-reload']) {
    activeVisit = { name, startedUtc: new Date().toISOString(), startMs: elapsed(), realMilestones: {}, resources: [] };
    receipt.visits.push(activeVisit);
    stage = `${name}: navigation`;
    const response = name === 'first-visit'
      ? await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: bounded(25_000) })
      : await page.reload({ waitUntil: 'domcontentloaded', timeout: bounded(25_000) });
    activeVisit.navigationStatus = response?.status() ?? null;
    if (!response?.ok()) throw new Error('Navigation failed (check preview authorization)');
    if (new URL(page.url()).origin !== target.origin) throw new Error('Navigation left the target origin');
    stage = `${name}: package readiness`;
    await page.waitForFunction(() => window.__reserveCacheObservation?.browserMilestones.preferredCardMs !== undefined, null, { timeout: bounded(16_000) });
    stage = `${name}: bounded settling`;
    await page.waitForTimeout(bounded(4_000));
    await snapshot(activeVisit);
    activeVisit.finishedUtc = new Date().toISOString();
    activeVisit.elapsedMs = elapsed() - activeVisit.startMs;
    if (activeVisit.lastUiState?.detailVisible) throw new Error('Unexpected detail screen during browse-only observation');
  }
} catch (error) {
  if (!timedOut) receipt.errors.push({ stage, message: errorMessage(error) });
  if (activeVisit) try { await snapshot(activeVisit); } catch { /* Context may already be closed. */ }
} finally {
  clearTimeout(watchdog);
  await browser?.close().catch(() => {});
  for (const visit of receipt.visits) {
    const resources = visit.resources, api = resources.filter(row => row.path), availability = api.filter(row => row.path.startsWith('/api/availability'));
    visit.requests = api;
    visit.summary = {
      resourceRequests: resources.length, browserCachedResources: resources.filter(browserCached).length,
      apiRequests: api.length, browserCachedApi: api.filter(browserCached).length,
      availabilityRequests: availability.length, browserCachedAvailability: availability.filter(browserCached).length,
      revalidatedAvailability: availability.filter(row => row.networkStatus === 304).length,
      networkAvailabilityCacheHeaders: countStates(availability.filter(row => !browserCached(row) && row.networkStatus !== 304)),
      reusedAvailabilityCacheHeaders: countStates(availability.filter(row => browserCached(row) || row.networkStatus === 304)),
      blockedRequests: visit.blockedRequests?.length ?? 0,
      expectedBlockedAnalytics: visit.blockedRequests?.filter(row => row.category === 'analytics').length ?? 0,
      unexpectedBookingRequests: visit.blockedRequests?.filter(row => row.bookingApi).length ?? 0,
      unclassifiedBlockedRequests: visit.blockedRequests?.filter(row => !row.bookingApi && row.category !== 'analytics').length ?? 0,
      failedApiRequests: api.filter(row => row.failure || row.status >= 400).length,
    };
    delete visit.resources;
  }
  receipt.cacheHeaderCaution = 'Browser-cached or 304-revalidated responses can retain old Server-Timing headers; reused headers do not prove a new backend computation. Cache flags show body reuse, not necessarily zero network validation. Ordinary reload can revalidate or bypass some HTTP entries.';
  receipt.browserMilestoneClock = 'Raw browserMilestones use performance.now and can carry the fixed-clock offset across reload. realMilestones use Node elapsed time from each navigation call, received via a browser binding; use these for comparisons.';
  receipt.blockedAnalyticsCondition = 'Known analytics writes remain blocked and are reported as a measurement condition. Synthetic guard errors are separate from page errors. Unexpected booking or unclassified requests still fail this observation.';
  receipt.finishedUtc = new Date().toISOString(); receipt.elapsedMs = elapsed();
  receipt.error = receipt.errors[0]?.message
    ?? (receipt.visits.some(visit => visit.summary.unexpectedBookingRequests) ? 'Read-only guard blocked an unexpected booking request' : null)
    ?? (receipt.visits.some(visit => visit.summary.unclassifiedBlockedRequests) ? 'Read-only guard blocked an unclassified request; inspect sanitized diagnostics' : null);
  await mkdir(output, { recursive: true });
  await writeFile(filename, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ filename, label, visits: receipt.visits.map(visit => ({
    name: visit.name, ...visit.realMilestones, selectedDate: visit.lastUiState?.selectedDate,
    ...visit.summary,
  })), error: receipt.error }, null, 2));
  if (receipt.error) process.exitCode = 1;
}
