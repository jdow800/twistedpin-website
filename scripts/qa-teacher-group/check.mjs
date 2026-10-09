import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { browser } from '../qa-cogs-mobile/cdp.mjs';
const output = fileURLToPath(new URL('./.qa/', import.meta.url));
await mkdir(output, { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('./fixture.jsx', import.meta.url))], outfile: output + 'fixture.js', bundle: true,
  jsx: 'automatic', platform: 'browser', define: { 'import.meta.env': '{"PUBLIC_TPRS_API_BASE":"/mock"}' } });
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/fixture.js' || path === '/fixture.css') {
    res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await readFile(output + path.slice(1)));
  } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let b; let checks = 0;
try {
  b = await browser();
  for (const mode of ['unmatched', 'food', 'resolved', 'legacy-conflict', 'legacy', 'carried', 'escaped']) {
    await b.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?mode=${mode}` });
    await b.until("document.querySelector('.lq-invrow')");
    await b.evaluate("document.querySelector('.lq-invrow').click()");
    await b.until("document.querySelector('[aria-label=\"Packet review status\"]')");
    const text = await b.evaluate('document.body.textContent');
    assert.match(text, /Packet created/); assert.ok(!text.includes('Emailed'));
    const panel = await b.evaluate("document.querySelector('[aria-label=\"Packet review status\"]').textContent");
    if (['unmatched', 'carried', 'legacy', 'legacy-conflict'].includes(mode)) assert.match(panel, /Manager review needed/);
    if (mode === 'unmatched') { assert.match(panel, /No answers needed/); assert.match(panel, /3:45 PM/); }
    if (mode === 'food') { assert.match(panel, /2 decisions to settle/); assert.match(panel, /Lane reservations: Checked/); }
    if (mode === 'resolved') { assert.match(panel, /No answers needed/); assert.match(panel, /Lane reservations: Checked/); }
    if (mode === 'legacy' || mode === 'legacy-conflict') assert.match(panel, /See the cover sheet/);
    if (mode === 'carried') assert.match(panel, /Original instruction: Lane 15 is broken/);
    if (mode === 'escaped') assert.equal(await b.evaluate("document.querySelector('img') === null"), true);
    assert.equal(await b.evaluate("window.fixture.calls.every(c => c.method === 'GET')"), true);
    checks++;
    if (mode === 'unmatched') for (const width of [320, 390, 1280]) {
      await b.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(output + `status-${width}.png`, Buffer.from(data, 'base64'));
      checks++;
    }
  }
  assert.equal(b.blocked.length, 0); console.log(`${checks} Teacher Group browser checks passed; all requests mocked.`);
} finally { await b?.close(); await new Promise(resolve => server.close(resolve)); }
