/** Offline checks of the real bundled TPRS client, with fake time and fetch.
 * No network, database, provider, cart mutation or payment calls.
 * Run: node scripts/check-availability-read-deadline.mjs
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../', import.meta.url));
const bundled = await build({
  entryPoints: [site + 'src/tprs/client.ts'], bundle: true, write: false,
  platform: 'browser', format: 'iife', globalName: 'TprsClient',
  define: { 'import.meta.env.PUBLIC_TPRS_API_BASE': '"/tprs-api"', 'import.meta.env.DEV': 'false' },
});
const productId = '00000000-0000-4000-8000-000000000005';
const attemptId = '00000000-0000-4000-8000-000000000090';
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function observe(promise) {
  const state = { status: 'pending' };
  promise.then(value => Object.assign(state, { status: 'fulfilled', value }),
    error => Object.assign(state, { status: 'rejected', error }));
  return state;
}
function trackedSignal() {
  const controller = new AbortController(), signal = controller.signal;
  const listeners = new Set();
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (type, callback, options) => {
    if (type === 'abort') listeners.add(callback);
    return add(type, callback, options);
  };
  signal.removeEventListener = (type, callback, options) => {
    if (type === 'abort') listeners.delete(callback);
    return remove(type, callback, options);
  };
  return { controller, signal, listeners };
}
function harness(transport) {
  let now = 0, nextId = 0;
  const timers = new Map(), calls = [];
  const context = createContext({
    AbortController, URL, console,
    setTimeout(callback, milliseconds) {
      const id = ++nextId;
      timers.set(id, { at: now + milliseconds, callback });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, init) {
      const path = new URL(url, 'https://offline.example.invalid').pathname;
      const method = init?.method ?? 'GET';
      assert.ok(method === 'GET' || (method === 'POST' &&
        ['/tprs-api/api/checkout/attempt-active/', '/tprs-api/api/checkout/attempt-status/'].includes(path)),
      `Unexpected mutation/provider request: ${method} ${path}`);
      assert.ok(String(url).startsWith('/tprs-api/api/'), 'Only the synthetic local API is permitted');
      calls.push({ url, init });
      return transport(url, init);
    },
  });
  runInContext(bundled.outputFiles[0].text, context, { timeout: 5_000 });
  return {
    client: context.TprsClient, calls, timers,
    async advance(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const due = [...timers].filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
        await flush();
      }
      now = target;
      await flush();
    },
  };
}
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
async function check(name, run) {
  await run();
  checks++;
  console.log(`PASS ${name}`);
}
function timedOut(h, state) {
  assert.equal(state.status, 'rejected');
  assert.ok(state.error instanceof h.client.TprsApiError);
  assert.equal(state.error.status, 0);
  assert.match(state.error.message, /timed out.*try again/i);
  assert.equal(h.calls[0].init.signal.aborted, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls.length, 1, 'The deadline must not automatically retry');
}

const bounded = [
  ['curated products', c => c.getProducts([4, 5])],
  ['bookable products', c => c.getBookableProducts()],
  ['day availability', c => c.getAvailability(productId, '2026-10-23')],
  ['day policy envelope', c => c.getAvailabilityDetails(productId, '2026-10-23')],
  ['month availability', c => c.getMonthAvailability(productId, '2026-10')],
  ['month policy envelope', c => c.getMonthAvailabilityDetails(productId, '2026-10')],
  ['selected time capacity', c => c.getSlotMaxUnits(productId, '2026-10-23', '16:00')],
];
for (const [name, call] of bounded) await check(`${name}: hanging headers stop at eight seconds`, async () => {
  const h = harness(() => new Promise(() => {})); // Deliberately ignores AbortSignal.
  assert.equal(h.client.AVAILABILITY_READ_TIMEOUT_MS, 8_000);
  const state = observe(call(h.client));
  await h.advance(7_999);
  assert.equal(state.status, 'pending');
  await h.advance(1);
  timedOut(h, state);
});

await check('successful response preserves schema, credentials and cleanup', async () => {
  const h = harness(async () => json({ products: [] })), caller = trackedSignal();
  const result = await h.client.getProducts([4, 5], caller.signal);
  assert.deepEqual(plain(result), { products: [] });
  assert.equal(h.calls[0].url, '/tprs-api/api/products/?codes=4%2C5');
  assert.equal(h.calls[0].init.credentials, 'include');
  assert.equal(h.calls[0].init.headers.Accept, 'application/json');
  assert.equal(h.calls[0].init.signal.aborted, false);
  assert.equal(h.timers.size, 0);
  assert.equal(caller.listeners.size, 0);
  await h.advance(9_000);
  caller.controller.abort();
  assert.equal(h.calls[0].init.signal.aborted, false, 'Completed request no longer follows caller');
});

await check('headers at four seconds do not restart the full-body deadline', async () => {
  const headers = deferred(), body = deferred(), caller = trackedSignal();
  let bodyStarted = false;
  const h = harness(() => headers.promise);
  const state = observe(h.client.getAvailability(productId, '2026-10-23', caller.signal));
  await h.advance(4_000);
  headers.resolve({ ok: true, json() { bodyStarted = true; return body.promise; } });
  await flush();
  assert.equal(bodyStarted, true);
  await h.advance(3_999);
  assert.equal(state.status, 'pending');
  await h.advance(1);
  timedOut(h, state);
  assert.equal(caller.listeners.size, 0);
  body.resolve([{ time: '16:00', priceCents: 100, available: true }]);
  await flush();
  timedOut(h, state); // Late data cannot replace the settled timeout.
});

await check('unsuccessful response with a hanging text body also reaches deadline', async () => {
  let bodyStarted = false;
  const h = harness(async () => ({ ok: false, status: 503,
    text() { bodyStarted = true; return new Promise(() => {}); } }));
  const state = observe(h.client.getBookableProducts());
  await flush();
  assert.equal(bodyStarted, true);
  await h.advance(8_000);
  timedOut(h, state);
});

for (const phase of ['headers', 'body']) await check(`deadline abort during ${phase} remains an actionable timeout`, async () => {
  const h = harness(async (_url, init) => {
    const waitForAbort = () => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
    return phase === 'headers' ? waitForAbort() : { ok: true, json: waitForAbort };
  });
  const state = observe(h.client.getAvailability(productId, '2026-10-23'));
  await flush();
  await h.advance(8_000);
  timedOut(h, state);
});

for (const phase of ['headers', 'body']) await check(`caller abort during ${phase} propagates and clears deadline`, async () => {
  const caller = trackedSignal(), reason = new DOMException('Navigation changed', 'AbortError');
  let requestSignal;
  const h = harness(async (_url, init) => {
    requestSignal = init.signal;
    const waitForAbort = () => new Promise((_resolve, reject) => {
      if (init.signal.aborted) reject(init.signal.reason);
      else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
    return phase === 'headers' ? waitForAbort() : { ok: true, json: waitForAbort };
  });
  const state = observe(h.client.getAvailability(productId, '2026-10-23', caller.signal));
  await flush();
  caller.controller.abort(reason);
  await flush();
  assert.equal(state.status, 'rejected');
  assert.equal(requestSignal.aborted, true);
  assert.equal(requestSignal.reason, reason);
  assert.doesNotMatch(state.error.message, /timed out/i);
  assert.equal(h.timers.size, 0);
  assert.equal(caller.listeners.size, 0);
});

await check('already-aborted caller is forwarded without a leftover timer', async () => {
  const caller = trackedSignal(), reason = new DOMException('Already cancelled', 'AbortError');
  caller.controller.abort(reason);
  const h = harness((_url, init) => {
    assert.equal(init.signal.aborted, true);
    assert.equal(init.signal.reason, reason);
    return Promise.reject(reason);
  });
  const state = observe(h.client.getProducts([4], caller.signal));
  await flush();
  assert.equal(state.status, 'rejected');
  assert.equal(h.timers.size, 0);
  assert.equal(caller.listeners.size, 0);
});

for (const [name, response, expected] of [
  ['HTTP error', () => new Response('Temporarily unavailable', { status: 503 }), { status: 503 }],
  ['malformed JSON', () => new Response('{broken'), { name: 'SyntaxError' }],
  ['invalid response schema', () => json({ products: 'not-an-array' }), { name: 'ZodError' }],
]) await check(`${name} is preserved and clears timer/listener`, async () => {
  const caller = trackedSignal(), h = harness(async () => response());
  const state = observe(h.client.getProducts([4], caller.signal));
  await flush();
  assert.equal(state.status, 'rejected');
  for (const [key, value] of Object.entries(expected)) assert.equal(state.error[key], value);
  if (expected.status) assert.equal(state.error.body, 'Temporarily unavailable');
  assert.equal(h.timers.size, 0);
  assert.equal(caller.listeners.size, 0);
});

const unbounded = [
  ['cart read', (c, signal) => c.getCart(signal), { cartToken: 'synthetic', holds: [], holdExpiresAt: null }],
  ['product forms', (c, signal) => c.getProductForms(productId, signal), { forms: [] }],
  ['accepted-attempt discovery', c => c.getActiveCheckoutAttempt(), { attempt: null }],
  ['accepted-attempt status', c => c.getCheckoutAttemptStatus({ attemptId, recoveryToken: 'synthetic' }),
    { attemptId, status: 'processing' }],
];
for (const [name, call, body] of unbounded) await check(`${name} retains existing behavior beyond eight seconds`, async () => {
  const headers = deferred(), caller = trackedSignal(), h = harness(() => headers.promise);
  const state = observe(call(h.client, caller.signal));
  await h.advance(80_000);
  assert.equal(state.status, 'pending');
  assert.equal(h.timers.size, 0);
  assert.equal(caller.listeners.size, 0);
  if (name === 'cart read' || name === 'product forms') assert.equal(h.calls[0].init.signal, caller.signal);
  headers.resolve(json(body));
  await flush();
  assert.equal(state.status, 'fulfilled');
  assert.equal(h.calls.length, 1);
});

console.log(`Availability read deadline: ${checks} offline checks passed; no network or mutation calls.`);
