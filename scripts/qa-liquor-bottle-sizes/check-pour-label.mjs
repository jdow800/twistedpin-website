// The recipe builder's pour-label reader (src/components/liquor/pourLabel.ts)
// against the TPRS original it mirrors (parsePourLabel in
// apps/backend/src/bar/gotab-sales.ts), label by label. No DOM, no network.
// Set BOTTLE_QA_TPRS_ROOT first if TPRS is not ../tprs beside Website.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const website = fileURLToPath(new URL('../../', import.meta.url));
const tprsFile = join(resolve(process.env.BOTTLE_QA_TPRS_ROOT || join(website, '../tprs')), 'apps/backend/src/bar/gotab-sales.ts');
if (!existsSync(tprsFile)) {
  console.error(`No TPRS parser at ${tprsFile}, so nothing was compared. Set BOTTLE_QA_TPRS_ROOT to a TPRS checkout.`);
  process.exit(1);
}
const require = createRequire(join(website, 'package.json'));
const {build} = require('esbuild');
const {outputFiles} = await build({
  stdin: {contents: `
    export { parsePourLabel as website } from './src/components/liquor/pourLabel';
    export { parsePourLabel as tprs } from ${JSON.stringify(tprsFile.replace(/\\/g, '/'))};
  `, resolveDir: website, loader: 'ts'},
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };

const labels = [
  // The new buttons, recipe-builder labels, and the TPRS doc comment's examples.
  'Tanqueray 2oz', "Tito's 1.5 oz", "Double Tito's", 'Vegas Bomb', 'Green Tea Shot', 'Red Bull',
  "Tito's (W) (1.5oz)", 'Jameson (1oz)', 'Prosecco (2oz pour)', 'Carp Sweet Vermouth (.5oz)', '1oz Well Vodka',
  // TPRS pour-labels.test.ts.
  "Tito's (1.5oz)", "Tito's 2.0 oz", "Tito's 1.5 ounce", "Tito's 2.0 ounces", "Tito's 2-ounce pour",
  "Tito's (.5oz)", "Tito's (.5 ounces)", "Tito's (2 OUNCES pour)",
  "Tito's 1/2 oz", "Tito's 1.5–2 ounces", "Tito's 1 oz + 2 oz", "Tito's 0 ounces", "Tito's",
  // Ranges, fractions, two measures and look-alikes.
  'Tanqueray 1/2 oz', 'Tanqueray 1-2 oz', 'Tanqueray 1 - 2 oz', 'Tanqueray 1—2oz', "Tito's 1 1/2 oz",
  "Tito's 1.5oz/3oz", 'Shot 1.5oz, Double 3oz', "Tito's Lemonade 16oz", 'Margarita 16oz', "Tito's 12oz can",
  "Tito's 2ozs", "Tito's 2 oz.", "Tito's 2. oz", "Tito's 0.0 oz", "Tito's 00.5oz", "Tito's 1.5 0z", 'Patrón 1,5 oz',
  "TITO'S 1.5OZ", "Tito's 1.5 Oz", "Tito's: 1.5oz", '- 1.5oz -', '(1.5oz)', '1.5 oz pour Tito\'s',
  '2 oz', ' 2 oz ', '2', 'oz', '', '   ',
];

check(`the port reads all ${labels.length} labels exactly as TPRS does`, () => {
  for (const label of labels) assert.deepEqual(m.website(label), m.tprs(label), JSON.stringify(label));
});
check('a label stating one pour reads as that pour', () => {
  assert.equal(m.website('Tanqueray 2oz').oz, 2);
  assert.equal(m.website("Tito's 1.5 oz").oz, 1.5);
  assert.equal(m.website('Carp Sweet Vermouth (.5oz)').oz, 0.5);
});
check('no pour, a range, a fraction, two measures or zero reads as no pour', () => {
  for (const label of ["Double Tito's", 'Vegas Bomb', 'Tanqueray 1/2 oz', 'Tanqueray 1-2 oz', "Tito's 1.5–2 ounces", "Tito's 1 oz + 2 oz", "Tito's 0 ounces"])
    assert.equal(m.website(label).oz, null, label);
});
console.log(`${passed} pour-label checks passed against ${tprsFile}; no DOM or service calls.`);
