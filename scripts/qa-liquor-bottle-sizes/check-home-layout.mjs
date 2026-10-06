// The /cogs landing page at phone and desktop widths, for a manager (John V) and an admin.
// Builds home-fixture.jsx against the Home.tsx + liquor.css in HOME_QA_SRC (default: this
// checkout's src/components/liquor), renders it in headless Chromium and checks: no sideways
// scroll; every tile title sits in its own column at a readable width (the 2026-10-06
// "My / recipe / questions" wrap); nothing under 12px; tiles tall enough to tap; the waiting
// badge shows; tiles navigate. Screenshots go to dist/home-<label>-<role>-<width>.png.
// HOME_QA_LABEL=before only saves screenshots (for the old page). Set FOOD_QA_CHROME (or
// INVOICE_QA_CHROME) to a Chromium executable.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const base = fileURLToPath(new URL('.', import.meta.url)), website = fileURLToPath(new URL('../../', import.meta.url));
const src = process.env.HOME_QA_SRC ?? join(website, 'src/components/liquor');
const label = process.env.HOME_QA_LABEL ?? 'after';
const strict = label === 'after';
const dist = join(base, 'dist');
await mkdir(dist, {recursive: true});
const require = createRequire(join(website, 'package.json'));
await require('esbuild').build({entryPoints: [join(base, 'home-fixture.jsx')], outfile: join(dist, `home-${label}.js`), bundle: true,
  jsx: 'automatic', platform: 'browser', nodePaths: [join(website, 'node_modules')], define: {'import.meta.env': '{"PUBLIC_TPRS_API_BASE":"/mock"}'},
  plugins: [{name: 'home-sources', setup(build) {
    build.onResolve({filter: /^qa:home$/}, () => ({path: join(src, 'views/Home.tsx')}));
    build.onResolve({filter: /^qa:home-css$/}, () => ({path: join(src, 'liquor.css')}));
  }}]});
await writeFile(join(dist, `home-${label}.html`), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="home-${label}.css"><style>body{margin:0;background:#0e0a1f}</style></head><body><div id="root"></div><script src="home-${label}.js"></script></body></html>`);
const page = pathToFileURL(join(dist, `home-${label}.html`)).href;

const executable = process.env.FOOD_QA_CHROME ?? process.env.INVOICE_QA_CHROME;
assert.ok(executable, 'Set FOOD_QA_CHROME to the Chromium executable');
const profile = await mkdtemp(join(dist, 'home-browser-'));
const chrome = spawn(executable, ['--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', '--allow-file-access-from-files',
  `--user-data-dir=${profile}`, 'about:blank'], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Browser startup timed out')), 15000);
    chrome.once('error', reject);
    chrome.stderr.on('data', data => { output += data; const m = output.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = e => { const m = JSON.parse(e.data), r = pending.get(m.id); if (r) { pending.delete(m.id); m.error ? r.reject(Error(JSON.stringify(m.error))) : r.resolve(m.result); } };
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, {resolve, reject}); socket.send(JSON.stringify({id: n, method, params, ...(sessionId ? {sessionId} : {})}));
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
    if (document.querySelector(${JSON.stringify(selector)})) return resolve(); if (++n > 150) return reject(Error('Missing ' + ${JSON.stringify(selector)}));
    setTimeout(tick, 20); }; tick(); })`);
  await send('Page.enable');
  for (const role of ['manager', 'admin']) {
    for (const width of [320, 360, 390, 412, 1280]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: width < 600});
      await send('Page.navigate', {url: `${page}?role=${role}&waiting=3`});
      await waitFor('.lq-home');
      await evaluate('new Promise(resolve => setTimeout(resolve, 150))');
      const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true});
      await writeFile(join(dist, `home-${label}-${role}-${width}.png`), Buffer.from(shot.data, 'base64'));
      if (!strict) { console.log(`saved ${label} ${role} ${width}px`); continue; }
      assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, `${role} ${width}px: sideways scroll`);
      // Every title is readable: beside (never inside) the icon column, at most two lines on a big tile and three on a compact one.
      const squeezed = await evaluate(`[...document.querySelectorAll('.lq-action, .lq-home-tile')].map(tile => {
        const title = tile.querySelector('.lq-action-title, .lq-home-tile-title'), icon = tile.querySelector('.lq-action-emoji, .lq-home-tile-icon');
        const t = title.getBoundingClientRect(), box = tile.getBoundingClientRect(), i = icon?.getBoundingClientRect();
        const big = tile.classList.contains('lq-action'), lines = Math.round(t.height / parseFloat(getComputedStyle(title).lineHeight));
        const placed = big ? t.left >= (i ? i.right : box.left) - 1 : t.left >= box.left && t.right <= box.right + 1;
        return placed && lines <= (big ? 2 : 3) ? null : title.textContent + ' (' + Math.round(t.width) + 'px, ' + lines + ' lines)';
      }).filter(Boolean)`);
      assert.deepEqual(squeezed, [], `${role} ${width}px: squeezed tile titles`);
      const small = await evaluate(`[...document.querySelectorAll('.lq-home *')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
        && el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.textContent.trim().slice(0, 40))`);
      assert.deepEqual(small, [], `${role} ${width}px: text under 12px`);
      const short = await evaluate(`[...document.querySelectorAll('.lq-action, .lq-home-tile')].filter(el => el.getBoundingClientRect().height < 44).length`);
      assert.equal(short, 0, `${role} ${width}px: a tile under 44px`);
      assert.match(await evaluate(`document.querySelector('.lq-action-badge')?.textContent ?? ''`), /3 waiting/, `${role} ${width}px: waiting badge`);
      const sections = await evaluate(`[...document.querySelectorAll('.lq-home-section .lq-section-label')].map(h => h.textContent)`);
      assert.deepEqual(sections, ['To do', 'Count', 'Invoices', 'Reports', 'Recipes & setup'], `${role} ${width}px: sections`);
      const todo = await evaluate(`[...document.querySelectorAll('.lq-home-section:first-of-type .lq-action-title')].map(t => t.textContent)`);
      assert.deepEqual(todo, role === 'admin' ? ['My recipe questions', 'Operations inbox'] : ['My recipe questions'], `${role} ${width}px: to-do tiles`);
      const tiles = await evaluate(`document.querySelectorAll('.lq-action, .lq-home-tile').length`);
      assert.equal(tiles, 21, `${role} ${width}px: every destination keeps a tile`);
      await evaluate(`[...document.querySelectorAll('.lq-home-tile')].find(b => b.textContent.includes('Tap inventory')).click()`);
      assert.equal(await evaluate('document.body.dataset.went'), 'tapinventory', `${role} ${width}px: a compact tile navigates`);
      console.log(`PASS ${role} ${width}px: no sideways scroll, titles readable, nothing under 12px, tiles tappable, badge, sections`);
    }
  }
} finally {
  socket?.close();
  chrome.kill();
}
process.exit(0);
