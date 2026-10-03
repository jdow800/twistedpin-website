// Food cost layout at 320, 390 and 960px: no sideways scroll, nothing under
// the 12px floor, line rows tall enough to tap. Same headless Chromium
// approach as check-food-variance-layout.mjs; synthetic reports only.
// Run `node serve.mjs --food-cost` first, then set FOOD_QA_CHROME (or
// INVOICE_QA_CHROME) to a Chromium executable.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const executable = process.env.FOOD_QA_CHROME ?? process.env.INVOICE_QA_CHROME;
assert.ok(executable, 'Set FOOD_QA_CHROME to the Chromium executable');
const dist = fileURLToPath(new URL('./dist/', import.meta.url));
const profile = await mkdtemp(join(dist, 'food-cost-browser-'));
const chrome = spawn(executable, ['--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank'], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Browser startup timed out')), 15000);
    chrome.once('error', reject);
    chrome.stderr.on('data', data => {
      output += data;
      const m = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = e => {
    const m = JSON.parse(e.data), r = pending.get(m.id);
    if (r) { pending.delete(m.id); m.error ? r.reject(Error(JSON.stringify(m.error))) : r.resolve(m.result); }
  };
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, {resolve, reject});
    socket.send(JSON.stringify({id: n, method, params, ...(sessionId ? {sessionId} : {})}));
  });
  const {targetId} = await command('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await command('Target.attachToTarget', {targetId, flatten: true});
  const send = (method, params) => command(method, params, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = selector => evaluate(`new Promise((resolve, reject) => { let n = 0; const tick = () => {
    if (document.querySelector(${JSON.stringify(selector)})) return resolve();
    if (++n > 150) return reject(Error('Missing ' + ${JSON.stringify(selector)}));
    setTimeout(tick, 20); }; tick(); })`);
  const clickText = text => evaluate(`(() => { const b = [...document.querySelectorAll('button, summary')]
    .find(x => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) throw Error('Missing ' + ${JSON.stringify(text)});
    b.click(); })()`);
  const settle = () => evaluate('new Promise(resolve => setTimeout(resolve, 60))');
  await send('Page.enable');

  // Each state: how to reach it from a fresh load.
  const openAll = () => evaluate(`document.querySelectorAll('details').forEach(d => d.open = true)`);
  const states = {
    list: async () => {},
    report: async () => {
      await clickText('Oct 6 → Oct 13');
      await waitFor('.lq-fco');
      // Every line opened, so the longest item rows are measured.
      await openAll();
    },
    original: async () => {
      await clickText('Oct 6 → Oct 13');
      await waitFor('.lq-fco');
      await clickText('Original');
      await openAll();
    },
    fix: async () => {
      await clickText('Oct 13 → Oct 20');
      await waitFor('.lq-fco');
      await clickText('Fix costs');
      await waitFor('.lq-fco-price');
    },
  };
  for (const width of [320, 390, 960]) {
    for (const [state, reach] of Object.entries(states)) {
      await send('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: width < 600});
      await send('Page.navigate', {url: 'http://127.0.0.1:4177/'});
      await waitFor('.lq-fv');
      await reach();
      await settle();
      const overflow = await evaluate('document.documentElement.scrollWidth > innerWidth + 1');
      assert.equal(overflow, false, `${width}px ${state}: horizontal overflow`);
      const small = await evaluate(`[...document.querySelectorAll('.lq-fv *')].filter(el =>
        el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
        && el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.textContent.trim().slice(0, 40))`);
      assert.deepEqual(small, [], `${width}px ${state}: text under 12px`);
      const short = await evaluate(`[...document.querySelectorAll('.lq-fv-line > summary, .lq-invrow, .lq-fv-rerun > summary, .lq-fco-price input')]
        .filter(el => el.getClientRects().length && el.getBoundingClientRect().height < 44).length`);
      assert.equal(short, 0, `${width}px ${state}: a tap row under 44px`);
      const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true});
      await writeFile(join(dist, `food-cost-${state}-${width}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`PASS ${width}px ${state}: no sideways scroll, nothing under 12px, rows tall enough to tap`);
    }
  }
} finally {
  socket?.close();
  chrome.kill();
}
process.exit(0);
