import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { browser } from '../qa-cogs-mobile/cdp.mjs';

const output = fileURLToPath(new URL('./.qa/', import.meta.url));
await mkdir(output, { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('./fixture.jsx', import.meta.url))], outfile: output + 'fixture.js',
  bundle: true, jsx: 'automatic', platform: 'browser', define: { 'import.meta.env': '{"PUBLIC_TPRS_API_BASE":"/mock"}' } });
const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>';
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/fixture.js' || path === '/fixture.css') {
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/css');
    res.end(await readFile(output + path.slice(1)));
  } else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let b, passed = 0;
const report = [];
try {
  b = await browser();
  const text = () => b.evaluate('document.body.textContent');
  const clicks = label => b.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Missing button ' + ${JSON.stringify(label)}); button.click(); })()`);
  const writes = () => b.evaluate("window.fixture.calls.filter(call => call.method === 'POST')");
  async function load(mode, width = 390) {
    await b.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await b.send('Page.navigate', { url: `${url}/?mode=${mode}` });
    await b.until("document.querySelector('.lq-invd')");
    await b.evaluate("document.querySelector('.lq-invd-secondary')?.setAttribute('open', '')");
  }
  async function run(name, mode, fn) {
    await load(mode); await fn(); passed++; report.push(name); console.log('PASS', name);
  }
  async function screenshot(name) {
    const { cssContentSize: size } = await b.send('Page.getLayoutMetrics');
    await writeFile(output + name + '.png', Buffer.from((await b.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
    })).data, 'base64'));
  }
  await run('resolved proof shows original/source readings and no supplier-final claim', 'resolved', async () => {
    const content = await text();
    assert.match(content, /First scan reading: 2 × 42OZ/); assert.match(content, /Source-checked reading: 24 × 2OZ/);
    assert.ok(!content.includes("supplier's final invoice")); assert.equal((await writes()).length, 0);
  });
  for (const mode of ['queued', 'running']) await run(`${mode} stays open without a completion action`, mode, async () => {
    const content = await text(); assert.match(content, /Checking the package reading/);
    assert.ok(!content.includes('all caught up')); assert.ok(!content.includes('Both copies checked; corrections recorded'));
    assert.ok(!content.includes('Review purchase item')); assert.ok(!content.includes('Pack or size readings differ'));
    assert.ok(!content.includes('Copies agree automatically')); assert.equal((await writes()).length, 0);
  });
  await run('latest-status read adopts resolved proof without a write', 'queued-completes', async () => {
    await clicks('Check latest status'); await b.until("document.body.textContent.includes('Copies agree automatically')");
    assert.equal((await writes()).length, 0);
  });
  await run('reopen sends the source fingerprint and restores raw questions', 'resolved', async () => {
    await clicks('Reopen package review'); await b.until("document.body.textContent.includes('automatic package explanation was rejected')");
    const post = (await writes())[0]; assert.equal(post.path, '/mock/admin/bar/invoices/demo-copy/source-check/reject');
    assert.deepEqual(post.body, { evidenceHash: 'a'.repeat(64) }); assert.equal((await writes()).length, 1);
    assert.match(await text(), /Pack or size readings differ/);
  });
  await run('lost accepted response reads back rejection instead of sending it again', 'lost-response', async () => {
    await clicks('Reopen package review'); await b.until("document.body.textContent.includes('automatic package explanation was rejected')");
    assert.equal((await writes()).length, 1); assert.equal(await b.evaluate("document.querySelector('[role=alert]') === null"), true);
  });
  await run('failed read retains old proof and blocks retry until exact reload', 'read-failure', async () => {
    await clicks('Reopen package review'); await b.until("document.body.textContent.includes('Could not verify whether')");
    assert.match(await text(), /First scan reading/);
    assert.equal(await b.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Reopen package review').disabled"), true);
    await clicks('Reload comparison'); await b.until("document.body.textContent.includes('automatic package explanation was rejected')");
    assert.equal((await writes()).length, 1);
  });
  await run('409 reloads changed evidence before another deliberate request', 'stale', async () => {
    await clicks('Reopen package review'); await b.until("document.body.textContent.includes('This source check changed')");
    assert.match(await text(), /Source-checked reading: 12 × 4OZ/); assert.equal((await writes()).length, 1);
    await clicks('Reopen package review'); await b.until('window.fixture.calls.filter(call => call.method === "POST").length === 2');
    assert.equal((await writes())[1].body.evidenceHash, 'b'.repeat(64));
  });
  await run('write refusal keeps proof and shows a deliberate retry', 'write-failure', async () => {
    await clicks('Reopen package review'); await b.until("document.body.textContent.includes('does not show a reopened review')");
    assert.match(await text(), /First scan reading/); assert.equal((await writes()).length, 1);
  });
  await run('authoritative refresh drops a removed source check and its stale control', 'source-disappears', async () => {
    await clicks('Reopen package review'); await b.until("document.body.textContent.includes('This source check changed')");
    assert.ok(!(await text()).includes('First scan reading'));
    assert.equal(await b.evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Reopen package review')"), false);
    assert.equal((await writes()).length, 1);
  });
  await run('two taps while saving consume one request', 'double', async () => {
    await b.evaluate("(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Reopen package review'); button.click(); button.click(); })()");
    await b.until('window.fixture.calls.filter(call => call.method === "POST").length === 1');
    await b.evaluate('window.fixture.release()'); await b.until("document.body.textContent.includes('automatic package explanation was rejected')");
    assert.equal((await writes()).length, 1);
  });
  for (const mode of ['supplier-final', 'matching', 'old-api']) await run(`existing comparison ${mode} remains truthful`, mode, async () => {
    assert.equal(await b.evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Reopen package review')"), false);
    if (mode === 'supplier-final') assert.match(await text(), /supplier's final invoice/);
    else assert.ok(!(await text()).includes("supplier's final invoice"));
  });
  await run('source readings render as escaped text', 'escaped', async () => {
    assert.match(await text(), /<img src=x/); assert.equal(await b.evaluate("document.querySelector('img') === null"), true);
  });
  for (const width of [320, 390, 412, 1280]) for (const mode of ['matching', 'resolved', 'queued', 'unresolved', 'rejected']) {
    await load(mode, width);
    assert.equal(await b.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false, `${width}px ${mode} overflow`);
    const small = await b.evaluate("[...document.querySelectorAll('.lq-invd-review button')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.textContent)");
    assert.deepEqual(small, [], `${width}px ${mode} touch targets`);
    await screenshot(`${mode}-${width}`);
    passed++; report.push(`${mode} layout at ${width}px`);
  }
  for (const width of [320, 1280]) {
    await load('resolved', width); await clicks('Reopen package review');
    await b.until("document.body.textContent.includes('automatic package explanation was rejected')");
    assert.equal(await b.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), false);
    await screenshot(`reopened-${width}`); passed++; report.push(`saved reopen at ${width}px`);
  }
  assert.deepEqual(b.blocked, []);
  await writeFile(output + 'results.json', JSON.stringify({ passed, scenarios: report, externalRequests: b.blocked }, null, 2));
  console.log(`${passed} invoice source-check scenarios passed; screenshots/results in scripts/qa-invoice-source-check/.qa.`);
} finally { await b?.close(); await new Promise(resolve => server.close(resolve)); }
