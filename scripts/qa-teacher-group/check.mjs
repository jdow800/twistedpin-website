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
  for (const mode of ['unmatched', 'food', 'resolved', 'legacy-conflict', 'legacy', 'carried', 'escaped', 'pending-food', 'partial', 'superseded', 'superseded-after-queue', 'superseded-reservations', 'superseded-fallback']) {
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
    if (['pending-food', 'partial', 'superseded'].includes(mode)) {
      assert.match(panel, /1 decision to settle/); assert.match(panel, /Routine arrival choices: 3/);
      const pending = await b.evaluate("document.querySelector('[aria-label=\"Pending food orders\"]').textContent");
      assert.match(pending, /Lane 17: food order pending/); assert.ok(!pending.includes('Lane 2'));
      for (const lane of [13, 14, 10]) assert.equal((text.match(new RegExp(`Lane ${lane}: .*needs sauce`, 'g')) || []).length, 1);
    }
    if (mode.startsWith('superseded')) {
      assert.match(panel, /Historical copy/);
      if (mode === 'superseded') assert.match(panel, /no email was queued/);
      if (mode === 'superseded-after-queue') assert.match(panel, /email was queued earlier, but further delivery was stopped/);
      if (mode === 'superseded-reservations') assert.match(panel, /Reservations changed after this packet was prepared/);
      if (mode === 'superseded-fallback') assert.match(panel, /Review the current orders and reservations before using it/);
      if (mode !== 'superseded') assert.ok(!panel.includes('no email was queued'));
      assert.ok(!panel.includes('Email queued to')); assert.match(text, /Open historical packet/);
    } else if (mode.startsWith('legacy')) assert.match(panel, /Email status was not recorded/);
    else assert.match(panel, /Email queued to/);
    assert.equal(await b.evaluate("window.fixture.calls.every(c => c.method === 'GET')"), true);
    checks++;
    if (['unmatched', 'partial', 'superseded'].includes(mode)) for (const width of [320, 390, 1280]) {
      await b.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      assert.equal(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(output + `${mode}-${width}.png`, Buffer.from(data, 'base64'));
      checks++;
    }
  }
  for (const mode of ['retry-success', 'retry-conflict', 'retry-network', 'retry-auth', 'retry-forbidden', 'retry-server-failure', 'unaccepted-failed']) {
    await b.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?mode=${mode}` });
    await b.until("document.querySelector('.lq-invrow')");
    await b.evaluate("document.querySelector('.lq-invrow').click()");
    await b.until("document.querySelector('.lq-error')");
    if (mode === 'unaccepted-failed') {
      assert.ok(!(await b.evaluate('document.body.textContent')).includes('Retry packet'));
      assert.equal(await b.evaluate("window.fixture.calls.every(c => c.method === 'GET')"), true);
      checks++; continue;
    }
    await b.until("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Retry packet')");
    assert.match(await b.evaluate('document.body.textContent'), /accepted orders and reservation results are saved/);
    await b.evaluate("{const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Retry packet'); button.click(); button.click();}");
    await b.until("window.fixture.calls.some(c => c.path.endsWith('/retry'))");
    if (['retry-auth', 'retry-forbidden', 'retry-server-failure'].includes(mode)) {
      const expected = mode === 'retry-auth' ? 'Log back in to retry' : mode === 'retry-forbidden' ? "don't have permission" : "Couldn't confirm the retry";
      await b.until(`document.body.textContent.includes(${JSON.stringify(expected)})`);
      assert.ok(!(await b.evaluate('document.body.textContent')).includes('Email queued to'));
    } else {
      await b.until("document.body.textContent.includes('Preparing the packet.')");
      await b.until("document.querySelector('[aria-label=\"Packet review status\"]')");
      assert.match(await b.evaluate('document.body.textContent'), /Email queued to/);
    }
    const calls = await b.evaluate('window.fixture.calls');
    const writes = calls.filter(c => c.method !== 'GET');
    assert.equal(writes.length, 1); assert.equal(writes[0].path, '/mock/admin/bar/teacher-group/uploads/demo-teacher/retry');
    assert.equal(writes[0].credentials, 'include'); assert.equal(writes[0].headers['HX-Request'], 'true');
    assert.ok(calls.some((c, index) => c.method === 'GET' && calls.slice(0, index).some(previous => previous.method === 'POST')));
    checks++;
  }
  await b.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?mode=unaccepted-draft` });
  await b.until("document.querySelector('input[type=file]')");
  await b.evaluate(`{
    const transfer = new DataTransfer(); transfer.items.add(new File(['fixture'], 'Example.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const input = document.querySelector('input[type=file]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    const email = document.querySelector('input[inputmode=email]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(email, 'test@twistedpin.com'); email.dispatchEvent(new Event('input', { bubbles: true }));
  }`);
  await b.until("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Read it + email the packet' && !b.disabled)");
  await b.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Read it + email the packet').click()");
  await b.until("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Fix it and send again')");
  await b.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Fix it and send again').click()");
  await b.until("document.querySelector('.lq-tg-file-name')?.textContent === 'Example.docx'");
  assert.equal(await b.evaluate("window.fixture.calls.filter(c => c.method === 'POST').length"), 1);
  assert.equal(await b.evaluate("window.fixture.calls.some(c => c.path.endsWith('/retry'))"), false);
  checks++;
  assert.equal(b.blocked.length, 0); console.log(`${checks} Teacher Group browser checks passed; all requests mocked.`);
} finally { await b?.close(); await new Promise(resolve => server.close(resolve)); }
