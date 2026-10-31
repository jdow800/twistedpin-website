import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {frozen, unavailable} from './grade-evidence-fixtures.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const {build} = require('esbuild');
const {chromium} = require('playwright');
const {outputFiles} = await build({
  stdin: {contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import Counts from './src/components/liquor/views/Counts';
    createRoot(document.getElementById('root')).render(<Counts initialCountId="ending" onDone={() => {}}/>);`,
    resolveDir: fileURLToPath(new URL('../../', import.meta.url)), loader: 'tsx'},
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: {'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"'},
});
const session = {id: 'ending', status: 'submitted', isFullCount: true, section: 'bar', countedBy: 'Test counter',
  startedAt: '2026-10-30T18:00:00Z', submittedAt: '2026-10-30T18:10:00Z', lineCount: 1};
const count = {session, lines: [{zoneId: 'bar', zoneName: 'Main bar', skuId: 'azul', skuName: 'Clase Azul Reposado',
  sizeMl: 750, qtyUnits: '0.65', source: 'correction'}], corrections: [], canCorrect: false};
const variance = {periodStart: '2026-10-23T18:00:00Z', periodEnd: '2026-10-30T18:00:00Z', status: 'final', report: {
  gradePct: 84.2, lines: [], totals: {missingCost: 23, underpourCredit: 2, cleanLines: 1, flaggedLines: 0}, caveats: [],
}};
const browser = await chromium.launch({headless: true});
let passed = 0;
try {
  for (const scenario of ['deep-link', 'failed-grade', 'finalize']) {
    const page = await browser.newPage();
    const calls = [], errors = [];
    let gradeFails = scenario === 'failed-grade', finalized = scenario !== 'finalize';
    page.on('pageerror', e => errors.push(e.message));
    await page.route('http://grade.test/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname.replace(/\/$/, '');
      if (!path) return route.fulfill({contentType: 'text/html', body: '<!doctype html><div id="root"></div>'});
      calls.push({path, method: req.method()});
      let body, status = 200;
      if (path.endsWith('/keg-counts/history')) body = {counts: []};
      else if (path.endsWith('/counts/history')) body = {counts: [session]};
      else if (path.endsWith('/ending/grade-detail')) {
        status = gradeFails ? 503 : 200;
        body = gradeFails ? {error: 'unavailable'} : finalized ? frozen : unavailable;
      } else if (path.endsWith('/ending/variance')) body = {...variance, status: finalized ? 'final' : 'draft'};
      else if (path.endsWith('/ending/report/finalize')) {finalized = true; body = {ok: true, gradePct: 92.4, missingCost: 124.5};}
      else if (path.endsWith('/counts/ending')) body = count;
      else throw new Error(`Unexpected request ${path}`);
      return route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    });
    await page.goto('http://grade.test/');
    await page.addScriptTag({content: outputFiles[0].text});
    await page.getByRole('heading', {name: 'Full inventory', exact: true}).waitFor();
    if (scenario === 'failed-grade') {
      await page.getByText("Couldn't load the published grade evidence.", {exact: false}).waitFor();
      assert.equal(await page.getByText('Count-to-count raw variance', {exact: false}).count(), 1);
      gradeFails = false;
      await page.getByRole('button', {name: 'Retry grade evidence'}).click();
    } else if (scenario === 'finalize') {
      await page.getByRole('button', {name: 'Finalize & lock'}).click();
      assert.equal(calls.filter(c => c.method === 'POST').length, 1);
    }
    await page.getByRole('heading', {name: 'Published bar grade', exact: true}).waitFor();
    const text = await page.locator('body').innerText();
    assert.match(text, /92\.4%/);
    assert.match(text, /84\.2%/);
    assert.match(text, /Oct 16, 2026 – Oct 30, 2026 · 14 days/);
    assert.match(text, /Oct 23, 2026 – Oct 30, 2026/);
    assert.match(text, /separate from the published bar grade/);
    assert.equal(calls.filter(c => c.method === 'POST').length, scenario === 'finalize' ? 1 : 0);
    assert.deepEqual(errors, []);
    passed++;
    console.log(`PASS Counts ${scenario}: published grade and separate bracket retained`);
    await page.close();
  }
  console.log(`${passed} Counts grade integration checks passed`);
} finally {await browser.close();}
