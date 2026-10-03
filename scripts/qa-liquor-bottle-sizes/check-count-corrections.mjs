// Correcting a count after its report locked (CountCorrections.tsx): the real
// components in jsdom, every request stubbed. The 10-02 Tanqueray recount is
// the case: the rail 750 from 1.2 to 0, and a 1 L of 1.3 added on the rail.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const require = createRequire(new URL('../../package.json', import.meta.url));
const {build} = require('esbuild');
const entry = `
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {CorrectionEditor, CorrectionHistory} from './src/components/liquor/CountCorrections';
window.renderHistory = (corrections) => createRoot(document.getElementById('root')).render(createElement(CorrectionHistory, {corrections}));
window.renderEditor = (detail, onSaved) => createRoot(document.getElementById('root'))
  .render(createElement(CorrectionEditor, {detail, onSaved, onCancel() {}}));
`;
const {outputFiles} = await build({
  stdin: {contents: entry, resolveDir: fileURLToPath(new URL('../../', import.meta.url)), loader: 'tsx'},
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: {'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"'},
});
const bundle = outputFiles[0].text;

const pause = () => new Promise(r => setTimeout(r, 10));
async function until(fn, what) { for (let i = 0; i < 200; i++) { if (fn()) return; await pause(); } throw new Error(`timed out: ${what}`); }
let passed = 0;
async function run(name, fn) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true});
  const {window} = dom;
  window.Response = Response;
  const calls = [];
  let respond = () => ({status: 200, body: {ok: true, corrected: 2}});
  window.fetch = async (input, init = {}) => {
    // The client calls through the site's proxy (/tprs-api/...) with a trailing slash.
    const path = new URL(String(input), 'http://localhost/').pathname.replace(/\/$/, '');
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({path, method: init.method || 'GET', body});
    const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});
    if (path.endsWith('/catalog')) return json({items: [
      {id: 'tq750', name: 'Tanqueray London Dry Gin', sizeMl: 750, category: 'Gin', unitsPerCase: 12},
      {id: 'tq1l', name: 'TANQUERAY LONDON DRY GIN 1L', sizeMl: 1000, category: 'Gin', unitsPerCase: 12},
    ]});
    if (path.endsWith('/zones')) return json({zones: [{id: 'back', name: 'Backstock Room', walkOrder: 20}, {id: 'rail', name: 'Speedrails', walkOrder: 30}]});
    if (path.endsWith('/corrections')) { const r = respond(); return json(r.body, r.status); }
    throw new Error('unexpected request ' + path);
  };
  window.eval(bundle);
  const doc = window.document;
  const set = (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
  };
  const button = (text) => [...doc.querySelectorAll('button')].find(b => (text instanceof RegExp ? text.test(b.textContent) : b.textContent === text));
  try {
    await fn({window, doc, calls, set, button, setRespond: (f) => { respond = f; }});
    passed++;
    console.log('PASS', name);
  } catch (e) {
    console.log('FAIL', name, '|', e.message, '| page:', doc.body.textContent.slice(0, 300), '| calls:', JSON.stringify(calls.map(c => c.path)));
    throw e;
  } finally { window.close(); }
}

const detail = {
  session: {id: 'count-1002', status: 'submitted', isFullCount: true, note: null, startedAt: '', submittedAt: '', countedBy: 'John'},
  lines: [
    {zoneId: 'rail', zoneName: 'Speedrails', skuId: 'tq750', skuName: 'Tanqueray London Dry Gin', sizeMl: 750, qtyUnits: '1.200', enteredCases: null, caseSizeAtEntry: null, source: 'voice'},
    {zoneId: 'back', zoneName: 'Backstock Room', skuId: 'tq1l', skuName: 'TANQUERAY LONDON DRY GIN 1L', sizeMl: 1000, qtyUnits: '3.000', enteredCases: null, caseSizeAtEntry: null, source: 'voice'},
  ],
  corrections: [], correctable: true, canCorrect: true,
};

await run('the 10-02 recount: one quantity changed and one bottle added, with a reason, in one save', async ({window, doc, calls, set, button}) => {
  let saved = false;
  window.renderEditor(detail, async () => { saved = true; });
  await until(() => doc.querySelector('select option'), 'shelves loaded');
  assert.ok(button('Save correction').disabled, 'nothing changed yet');
  set(doc.querySelector('input[aria-label="Tanqueray London Dry Gin on Speedrails"]'), '0');
  set(doc.querySelector('input[aria-label="Search bottles to add"]'), '1l');
  await until(() => button(/^\+ TANQUERAY/), 'search hit');
  button(/^\+ TANQUERAY/).click(); await pause();
  set(doc.querySelector('select[aria-label="Shelf for the added bottle"]'), 'rail');
  set(doc.querySelector('input[aria-label="How many of the added bottle"]'), '1.3');
  button('Add').click(); await pause();
  assert.ok(button('Save 2 corrections').disabled, 'a reason is required');
  set(doc.querySelector('textarea'), 'Recounted Tanqueray: the open rail bottle was a liter');
  await until(() => !button('Save 2 corrections').disabled, 'save enabled');
  button('Save 2 corrections').click();
  await until(() => saved, 'saved');
  const post = calls.find(c => c.path.endsWith('/corrections'));
  assert.ok(post.path.endsWith('/admin/bar/counts/count-1002/corrections'), post.path);
  assert.equal(post.method, 'POST');
  assert.equal(post.body.reason, 'Recounted Tanqueray: the open rail bottle was a liter');
  assert.deepEqual(JSON.parse(JSON.stringify(post.body.changes)), [
    {zoneId: 'rail', skuId: 'tq750', before: 1.2, after: 0},
    {zoneId: 'rail', skuId: 'tq1l', before: null, after: 1.3},
  ]);
});

await run('a count that moved since the screen opened is refused, with a way forward', async ({window, doc, set, button, setRespond}) => {
  setRespond(() => ({status: 409, body: {error: 'correction_stale', current: [{zoneId: 'rail', skuId: 'tq750', qty: 1.5}]}}));
  window.renderEditor(detail, async () => { throw new Error('must not save'); });
  await until(() => doc.querySelector('select option'), 'shelves loaded');
  set(doc.querySelector('input[aria-label="Tanqueray London Dry Gin on Speedrails"]'), '0');
  set(doc.querySelector('textarea'), 'Recount');
  await until(() => !button('Save 1 correction').disabled, 'save enabled');
  button('Save 1 correction').click();
  await until(() => /changed since you opened it/.test(doc.body.textContent), 'stale message');
});

await run('the count shows what was corrected, and that the grade and order guide stayed', async ({window, doc}) => {
  window.renderHistory([{at: '2026-10-03T20:00:00Z', by: 'Jon', reason: 'Recounted Tanqueray', retrospective: false, correctedAt: null, changes: [
    {zone_name: 'Speedrails', sku_name: 'Tanqueray London Dry Gin', before: 1.2, after: 0},
    {zone_name: 'Speedrails', sku_name: 'TANQUERAY LONDON DRY GIN 1L', before: null, after: 1.3},
  ]}]);
  await until(() => /Corrected after the report locked/.test(doc.body.textContent), 'history');
  const text = doc.body.textContent;
  assert.match(text, /Tanqueray London Dry Gin · Speedrails: 1\.2 → 0/);
  assert.match(text, /TANQUERAY LONDON DRY GIN 1L · Speedrails: none → 1\.3/);
  assert.match(text, /Jon: Recounted Tanqueray/);
  assert.match(text, /The locked grade and the order guide already sent stay as they were/);
});

console.log(`${passed} count-correction checks passed`);
process.exit(0);
