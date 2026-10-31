// The emailed window is immutable; later count edits, missing evidence and
// modeled discard must remain distinguishable. Renders the real component.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {frozen, legacy, unavailable, incompleteAttribution} from './grade-evidence-fixtures.mjs';

const require = createRequire(new URL('../../package.json', import.meta.url));
const {build} = require('esbuild');
const {outputFiles} = await build({
  stdin: {contents: `export * from './src/components/liquor/GradeEvidence'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server.browser';`,
    resolveDir: fileURLToPath(new URL('../../', import.meta.url)), loader: 'tsx'},
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  define: {'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"'},
});
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const html = detail => m.renderToStaticMarkup(m.createElement(m.GradeEvidence, {detail}));
let passed = 0;
const check = (name, fn) => {fn(); passed++; console.log(`PASS ${name}`);};

check('original grade, period and ending counts survive a later correction', () => {
  const markup = html(frozen);
  assert.match(markup, /92\.4%/);
  assert.match(markup, /Oct 16, 2026.*Oct 30, 2026.*14 days/);
  assert.match(markup, /Counts changed after publication/);
  assert.match(markup, /Main bar: 0\.4 → 0\.65 bottles/);
  assert.match(markup, /Main bar<\/strong> · 0\.4 bottles/);
  assert.ok(!markup.includes('95.1%'));
});
check('legacy never substitutes present-day evidence for its published headline', () => {
  for (const detail of [legacy, {...legacy, snapshot: frozen.snapshot}]) {
    const markup = html(detail);
    assert.match(markup, /92\.4%/);
    assert.match(markup, /Matching per-product evidence.*unavailable/);
    assert.ok(!markup.includes('Follow the dollars'));
    assert.ok(!markup.includes('Shared Risata cost per served oz'));
  }
  assert.ok(!html(unavailable).includes('0%'));
});
check('full dollar gaps rank by magnitude, with parked and missing-cost rows visible', () => {
  const rows = m.rankedGradeLines(frozen.snapshot.lines);
  assert.deepEqual(rows.map(l => l.skuId), ['azul', 'surplus', 'drift', 'low', 'excluded']);
  assert.equal(frozen.snapshot.lines[0].skuId, 'low', 'never mutate the stored snapshot');
  const markup = html(frozen);
  assert.match(markup, /\$53\.71/);
  assert.match(markup, /Parked · found stock/);
  assert.match(markup, /Excluded · incomplete data/);
  assert.match(markup, /No linked sales|Clase Azul REP \(2 oz\)/);
  assert.match(markup, /Opposing differences are review leads/);
});
check('unknown discard and residual stay unavailable, while monthly cost is weighted', () => {
  const markup = html(frozen);
  assert.match(markup, /Expected discard<\/dt><dd>Unavailable/);
  assert.match(markup, /Remaining difference<\/dt><dd>Unavailable/);
  assert.match(markup, /\$1\.27/);
  assert.match(markup, /\$68\.40 for 54 oz served/);
  assert.match(markup, /across all linked recipes and measured pours/);
  assert.match(markup, /Fiscal days Oct 1, 2026 – Oct 29, 2026/);
  assert.match(markup, /Count splits the operating day/);
  assert.match(markup, /not a recorded waste count/);
  const zero = structuredClone(frozen);
  zero.snapshot.risata.expectedDiscardOz = 0;
  assert.match(html(zero), /Expected discard<\/dt><dd>0 oz/);
});
check('calendar day labels stay on the operating date and timestamps use Central', () => {
  assert.equal(m.gradeDate('2026-10-30'), 'Oct 30, 2026');
  assert.match(m.gradeDate('2026-10-30T18:55:00Z', true), /1:55 PM CDT/);
});
check('incomplete monthly coverage is visible beside the cost, outside daily details', () => {
  const partial = structuredClone(frozen);
  partial.snapshot.risata.month.status = 'partial';
  partial.snapshot.risata.month.skippedDays = 2;
  const markup = html(partial);
  assert.match(markup, /Shared Risata cost per served oz · partial estimate/);
  assert.match(markup, /Incomplete monthly coverage/);
  assert.match(markup, /2 not modeled/);
  assert.match(markup, /This cost describes covered days only/);
});
check('unknown daily attribution stays unknown through the JSON response', () => {
  const markup = html(JSON.parse(JSON.stringify(incompleteAttribution)));
  assert.match(markup, /Unavailable served · Unavailable opened · Unavailable expected discard/);
  assert.match(markup, /Attribution is unknown/);
});
check('partial-period allowance is a visible subtotal without inventing a full-period residual', () => {
  const partial = structuredClone(frozen);
  partial.snapshot.risata.period.expectedDiscardOz = 25.6;
  const markup = html(partial);
  assert.match(markup, /Covered days only:<\/strong> 25\.6 oz expected discard from 8 opened bottles/);
  assert.match(markup, /subtotal is not deducted from its inventory difference/);
  assert.match(markup, /Remaining difference<\/dt><dd>Unavailable/);
});
check('an opening-count correction is identified without changing the ending-count story', () => {
  const corrected = structuredClone(frozen);
  corrected.corrections[0].sessionId = 'opening';
  const markup = html(corrected);
  assert.match(markup, /Opening count · Oct 16, 2026/);
  assert.match(markup, /Review the opening-count corrections separately/);
  assert.ok(!markup.includes('Current ending-count rows below include later corrections'));
  assert.match(html(frozen), /Ending count · Oct 30, 2026/);
});
console.log(`${passed} grade-evidence checks passed`);
process.exit(0);
