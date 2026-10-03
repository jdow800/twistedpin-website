// The variance report's "All bottles" list (VarianceLines.tsx): one row per
// product, a product's bottle sizes underneath, and a report stored before
// families reads exactly as it did. Renders the real component; no network.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(new URL('../../package.json', import.meta.url));
const {build} = require('esbuild');
const {outputFiles} = await build({
  stdin: {contents: `export * from './src/components/liquor/VarianceLines'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server.browser';`,
    resolveDir: fileURLToPath(new URL('../../', import.meta.url)), loader: 'tsx'},
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  define: {'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"'},
});
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
const line = (skuId, name, sizeMl, p) => ({skuId, name, sizeMl, startOz: 0, purchasedOz: 0, endOz: 0, usedOz: 0,
  soldOz: 0, lossOz: 0, costPerOz: 1.06, missingCost: 0, gradePct: null, flags: [], cleanForRollup: true, ...p});

// The 9/18–10/2 report as stored: per-size lines worst first, then the product.
const lines = [
  line('tq-1l', 'TANQUERAY LONDON DRY GIN', 1000, {startOz: 135.3, endOz: 101.4, usedOz: 33.8, lossOz: 33.8, missingCost: 35.84}),
  line('titos', "Tito's Handmade Vodka", 1000, {startOz: 200, endOz: 150, usedOz: 50, soldOz: 38, lossOz: 12, missingCost: 12.5}),
  line('k1-750', 'Ketel One 750ml', 750, {purchasedOz: 76.1, endOz: 76.1, flags: ['not_in_start'], cleanForRollup: false}),
  line('k1-1l', 'Ketel One', 1000, {startOz: 50.7, endOz: 54.1, usedOz: -3.4, soldOz: 1.5, lossOz: -4.9, missingCost: -5.19,
    flags: ['negative_used'], cleanForRollup: false}),
  line('tq-750', 'Tanqueray London Dry Gin', 750, {startOz: 21.5, endOz: 34.2, usedOz: -12.7, soldOz: 18.5, lossOz: -31.2,
    missingCost: -33.07, flags: ['negative_used'], cleanForRollup: false}),
];
const family = (key, name, skuIds, sizes, p) => ({key, name, category: 'Gin', skuIds, sizes, startOz: 0, purchasedOz: 0,
  endOz: 0, usedOz: 0, soldOz: 0, lossOz: 0, costPerOz: 1.06, missingCost: 0, gradePct: null, flags: [], cleanForRollup: true, ...p});
const families = [
  family('tanqueray london dry gin', 'Tanqueray London Dry Gin (750 ml + 1 L)', ['tq-750', 'tq-1l'], [750, 1000],
    {startOz: 156.8, endOz: 135.6, usedOz: 21.1, soldOz: 18.5, lossOz: 2.6, missingCost: 2.77, gradePct: 87.7}),
  family('ketel one', 'Ketel One (750 ml + 1 L)', ['k1-750', 'k1-1l'], [750, 1000],
    {startOz: 50.7, purchasedOz: 76.1, endOz: 130.2, usedOz: -3.4, soldOz: 1.5, lossOz: -4.9, missingCost: -5.2,
      flags: ['not_in_start', 'negative_used'], cleanForRollup: false}),
];
const html = (l, f) => m.renderToStaticMarkup(m.createElement(m.VarianceLines, {lines: l, families: f}));

await check('one row per product, worst missing first, its sizes smallest first', () => {
  const rows = m.varianceRows(lines, families);
  assert.deepEqual(rows.map(r => r.line.name),
    ["Tito's Handmade Vodka", 'Tanqueray London Dry Gin (750 ml + 1 L)', 'Ketel One (750 ml + 1 L)']);
  assert.deepEqual(rows.map(r => r.sizes.map(z => z.skuId)), [[], ['tq-750', 'tq-1l'], ['k1-750', 'k1-1l']]);
  assert.equal(rows[1].line.skuId, 'family:tanqueray london dry gin');
});

await check('a report stored before families lists every bottle exactly as before', () => {
  for (const old of [undefined, []]) {
    const rows = m.varianceRows(lines, old);
    assert.deepEqual(rows.map(r => r.line.skuId), lines.map(l => l.skuId));
    assert.ok(rows.every(r => r.sizes.length === 0));
  }
  const markup = html(lines, undefined);
  assert.match(markup, /\$35\.84/);
  assert.match(markup, /\+\$33\.07/);
});

await check('the product row carries the one-price dollars; its sizes show bottles and ounces, not dollars', () => {
  const markup = html(lines, families);
  assert.match(markup, /Tanqueray London Dry Gin \(750 ml \+ 1 L\)/);
  assert.match(markup, /\$2\.77/);
  assert.ok(!markup.includes('$35.84') && !markup.includes('$33.07'), 'per-size dollars are the artifact, never shown');
  assert.match(markup, /750 ml · 0\.85 → 1\.35 bottles · used -12\.7oz · sold 18\.5oz</);
  assert.match(markup, /1 L · 4 → 3 bottles · used 33\.8oz · sold 0oz</);
});

await check('a size missing from a count says so under its product; a size\'s own negative usage does not', () => {
  const markup = html(lines, families);
  assert.match(markup, /Ketel One \(750 ml \+ 1 L\)<span class="lq-muted"> · not_in_start, negative_used/);
  assert.match(markup, /750 ml · 0 \+ 3 in → 3 bottles · used 0oz · sold 0oz · not_in_start</);
  assert.match(markup, /1 L · 1\.5 → 1\.6 bottles · used -3\.4oz · sold 1\.5oz</);
});

console.log(`${passed} variance-row checks passed`);
// React's browser server build leaves a MessageChannel open, which would keep
// node alive after the last check. A failed check has already thrown.
process.exit(0);
