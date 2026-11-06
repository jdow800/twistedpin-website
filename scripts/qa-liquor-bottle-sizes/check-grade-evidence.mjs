// The emailed window is immutable; later count edits, missing evidence and
// modeled discard must remain distinguishable. Renders the real component.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {frozen, legacy, unavailable, incompleteAttribution, withCauses, quietCauses} from './grade-evidence-fixtures.mjs';

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
check('grades frozen before the cause sort render exactly as before', () => {
  const markup = html(frozen);
  assert.ok(!markup.includes('What the counts point to'));
  assert.ok(!markup.includes('Read a tick fuller'));
  const empty = structuredClone(frozen);
  empty.snapshot.causes = null;
  empty.snapshot.graded.countUps = [];
  assert.equal(html(empty), markup);
});
check('cause sort mirrors the email: order, wording, recent window and evened-out list', () => {
  const markup = html(withCauses);
  assert.match(markup, /<h4>What the counts point to<\/h4>/);
  assert.match(markup, /Each product judged over 49 days \(Sep 11, 2026 – Oct 30, 2026\), first count to latest/);
  const at = text => markup.indexOf(text);
  const order = ['How this grade is calculated', 'Poured one bottle, rang another', 'Heavy pours', 'Poured with nothing rung',
    'Recipe or button fixes', 'Follow the dollars'].map(at);
  assert.ok(order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])), `section order ${order}`);
  assert.match(markup, /<strong>Crown Royal Regal Apple<\/strong> poured, <strong>Crown Royal<\/strong> rung<span>About 17 oz \(0\.7 bottle\) · last 28 days: \+3\.4 oz<\/span>/);
  assert.match(markup, /Rung for 86% of what was poured · 41 oz, \$31\.40 · last 28 days: 0 oz/);
  assert.match(markup, /<strong>Hennessy VS<\/strong><span>0\.5 bottle, nothing rung · \$24\.10<\/span>/);
  assert.match(markup, /0\.8 bottle, rung for 61% of what was poured · \$16\.90 · last 28 days: \+9\.8 oz/);
  assert.match(markup, /Recipes account for 40% of what was poured\. Check the recipe ounces or a missing ingredient · \$9\.40<\/span>/);
  assert.match(markup, /Rung for 140% of what was poured\. A recipe calls for too much, or a button credits it for another bottle · \$11\.20<\/span>/);
  assert.ok(!markup.includes('−4 oz'), 'setup rows carry no recent window, as in the email');
  assert.match(markup, /Evened out, counting only:<\/strong> Belvedere · Grey Goose\. Off in the 14-day grade, normal over 49 days\./);
  assert.ok(!markup.includes('Nothing beyond normal counting'));
  const noRecent = structuredClone(withCauses);
  noRecent.snapshot.causes.recentDays = null;
  assert.ok(!html(noRecent).includes('last 28 days'));
});
check('a quiet cause window says so and lists no empty sections', () => {
  const markup = html(quietCauses);
  assert.match(markup, /Nothing beyond normal counting and pouring differences over 49 days\./);
  for (const title of ['Poured one bottle, rang another', 'Heavy pours', 'Poured with nothing rung', 'Recipe or button fixes', 'Evened out', 'Read a tick fuller']) {
    assert.ok(!markup.includes(title), title);
  }
});
check('count-ups are listed as parked after the product differences, never as leads', () => {
  const markup = html(withCauses);
  assert.match(markup, /<h4>Read a tick fuller, nothing sold<\/h4><p class="lq-muted">Listed, not graded · \$4\.10<\/p><p class="lq-muted">Bulleit Rye \+3\.4 oz · Aperol \+2\.5 oz<\/p>/);
  assert.ok(markup.indexOf('Read a tick fuller') > markup.indexOf('Follow the dollars'));
  assert.ok(markup.indexOf('Read a tick fuller') < markup.indexOf('Possible substitution or ring-in mismatch'));
  const upsOnly = structuredClone(frozen);
  upsOnly.snapshot.graded.countUps = withCauses.snapshot.graded.countUps;
  assert.ok(!html(upsOnly).includes('What the counts point to'));
  assert.match(html(upsOnly), /Read a tick fuller, nothing sold/);
});
console.log(`${passed} grade-evidence checks passed`);
process.exit(0);
