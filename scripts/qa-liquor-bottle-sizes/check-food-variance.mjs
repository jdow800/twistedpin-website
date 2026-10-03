// Food variance (views/FoodVariance.tsx and FoodVarianceReport.tsx; TPRS
// migration 0202, Opsi BUILD-SPEC 11.121): the list, one count's report, its
// versions, the re-run, and the states around them. The actual screen with
// synthetic reports; every request is intercepted.
// Build first: node serve.mjs --food-variance --build-only
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const bundle = await readFile(new URL('./dist/food-variance-fixture.js', import.meta.url), 'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
const until = async (predicate, what) => {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await pause(); }
  throw new Error(`${what} timed out`);
};
// Request bodies and helper results come from the window's realm.
const plain = value => JSON.parse(JSON.stringify(value));
const squash = s => s.replace(/\s+/g, ' ');

let passed = 0;
async function run(name, test, query = '') {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: `http://localhost/?${query}`, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  dom.window.Response = Response;
  dom.window.scrollTo = () => {};
  try {
    dom.window.eval(bundle);
    const doc = dom.window.document;
    await until(() => doc.querySelector('.lq-fv, .lq-error'), 'The first load');
    const text = () => squash(doc.body.textContent);
    const rows = () => [...doc.querySelectorAll('.lq-invrow')];
    const button = (match, scope = doc) => [...scope.querySelectorAll('button')]
      .find(b => typeof match === 'string' ? b.textContent.trim() === match : match.test(b.textContent.trim()));
    const click = async (match, scope = doc) => {
      const b = button(match, scope);
      assert.ok(b, `Missing button: ${match}`);
      assert.ok(!b.disabled, `Button unexpectedly disabled: ${match}`);
      b.click(); await pause();
    };
    const openRow = async match => {
      const row = rows().find(r => match.test(squash(r.textContent)));
      assert.ok(row, `Missing row: ${match}`);
      row.click();
      await until(() => doc.querySelector('.lq-back'), 'The report');
    };
    const lineNames = () => [...doc.querySelectorAll('.lq-fv-line .lq-invd-desc')]
      .map(d => d.firstChild.textContent);
    const lineText = name => squash([...doc.querySelectorAll('.lq-fv-line')]
      .find(l => l.querySelector('.lq-invd-desc').firstChild.textContent === name)?.textContent ?? '');
    const tabs = () => [...doc.querySelectorAll('[role="tab"]')].map(b => b.textContent);
    const selectedTab = () => doc.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
    const say = async value => {
      const box = doc.querySelector('textarea[aria-label="What changed"]');
      assert.ok(box, 'Missing the reason box');
      Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(box, value);
      box.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
      await pause();
    };
    await test({doc, qa: dom.window.fvQa, text, rows, button, click, openRow, lineNames, lineText, tabs, selectedTab, say});
    passed += 1;
    console.log(`PASS ${name}`);
  } finally {
    dom.window.close();
  }
}

// ── the list ──
await run('the list: newest first, a pending count, a draft, a re-run bracket and the baseline; partial counts stay off', async t => {
  const rows = t.rows().map(r => squash(r.textContent));
  assert.equal(rows.length, 4, rows.join('\n'));
  assert.match(rows[0], /^Oct 21 ?Report pending ?Submitted Oct 21 · .* · Sam\. The report usually lands within a minute\.$/);
  assert.match(rows[1], /^Oct 13 → Oct 20 ?Draft ?\$12\.00 over · 96\.2% of food sales have a recipe · incomplete · Sam$/);
  assert.match(rows[2], /^Oct 6 → Oct 13 ?Final ?\$156\.46 over · 96\.2% of food sales have a recipe · incomplete · 2 versions · Sam$/);
  assert.match(rows[3], /^Baseline · Oct 6 ?Baseline ?The first food count · Sam\. The next one gets the first report\.$/);
  const history = t.qa.calls.find(c => c.path === '/admin/bar/counts/history');
  assert.equal(history?.query, '?section=food', 'asks for FOOD counts, never the liquor list');
});

await run('no food counts yet: the first one is the baseline', async t => {
  assert.match(t.text(), /No food counts submitted yet\. The first full count is the baseline\./);
}, 'mode=empty');

await run('a failed load says so', async t => {
  assert.match(t.text(), /Couldn't load food variance\./);
}, 'mode=error');

// ── one report ──
await run('a report: the net, both completeness measures, why it is incomplete, and the caveats', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  const s = t.text();
  assert.match(s, /Oct 6 → Oct 13 ?7 days · counted Oct 13 · /);
  assert.match(s, /Final since Oct 13 · /);
  assert.match(s, /Net variance ?\$156\.46 over \+14\.6%/);
  assert.match(s, /Used \$1,162\.70 · recipes say \$1,006\.24 · 3 items in the totals, 2 left out/);
  // An ingredient with no known value leaves the recipe-dollar share unknown, never a guess.
  assert.match(s, /Food sales with a recipe: 96\.2% · recipe dollars in the totals: —/);
  assert.match(s, /Not the whole story yet: 1 item\(s\) sold with no recipe; 2 ingredient\(s\) left out of the totals; 1 ingredient\(s\) with no known value\. Some of what reads as loss may be a gap in the data\./);
  assert.match(s, /• Food rung at the front desk \(Brunswick\) has no reader yet/);
});

await run('ingredients: dollars first with their unit, a band worth a look, the dishes behind, and a flagged line says why', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  assert.deepEqual(t.lineNames(), ['Wings, Jumbo', 'Cheese, Mozzarella, Grande', 'Onion Rings', 'Olives, Ripe, Sliced', 'Sauce, Hot Honey']);
  const wings = t.lineText('Wings, Jumbo');
  assert.match(wings, /^Wings, JumboLook ?\$162\.00 over ?used 7 cases · recipes say 5\.8 · \+1\.2 \(\+20\.7%\)/);
  assert.match(wings, /4 \+ 6 in → 3 cases ?\$135\.00 a case · 160 each a case/);
  assert.match(wings, /Behind “recipes say” ?Wings: 8 Bone-In Wings ?4\.1 ?Stars & Strikes Buffet ?estimate ?1\.7/);
  const grande = t.lineText('Cheese, Mozzarella, Grande');
  assert.match(grande, /^Cheese, Mozzarella, Grande ?\$7\.73 under ?used 6 bags · recipes say 6\.5 · −0\.5 \(−7\.7%\)/);
  assert.ok(!/Look|Watch/.test(grande), 'a normal band shows no chip');
  const olives = t.lineText('Olives, Ripe, Sliced');
  assert.match(olives, /^Olives, Ripe, Sliced ?left out ?used — · recipes say 0\.4 ?Left out: not in the opening count; no cost yet/);
  assert.match(olives, /not counted → 2 cans ?no cost yet · 15 oz a can ?Behind “recipes say” ?Large Pizza: Black Olive ?estimate ?0\.4/);
  // Recipes use it, but with no yield their share can't be put in jugs: never "nothing sold uses it".
  const honey = t.lineText('Sauce, Hot Honey');
  assert.match(honey, /^Sauce, Hot Honey ?left out ?used 1 jug · recipes say — ?Left out: no yield yet/);
  assert.match(honey, /2 → 1 jug ?\$24\.00 a jug ?Recipes use it; their share can't be counted until it has a yield\.$/);
  assert.ok(!honey.includes('Nothing sold'));
  const s = t.text();
  assert.ok(s.indexOf('Left out of the totals') < s.indexOf('Olives, Ripe, Sliced'), 'flagged lines sit under their own heading');
  assert.match(s, /Used, but no recipe uses them ?Fryer Oil ?\$86\.02 ?used 2 jugs/);
  assert.match(s, /Deliveries not in these numbers ?1 invoice was still waiting on a review\. ?Lettuce, Romaine ?\$32\.50 ?1 line on 1 delivery couldn't be converted to the count unit: billed by the case with no case size/);
});

await run('a re-run sits beside the original: the original shows first, then who, why and what it changed', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  assert.deepEqual(t.tabs(), ['Original', 'Re-run 2']);
  assert.equal(t.selectedTab(), 'Original');
  assert.ok(!t.text().includes('What changed from the original'));
  await t.click('Re-run 2');
  const s = t.text();
  assert.match(s, /Re-run Oct 15 · .+ by Jon Dow: “Grande yield corrected”\. The original is still the report of record\./);
  assert.match(s, /What changed from the original ?Net \$156\.46 over → \$144\.88 over · recipes changed/);
  assert.match(s, /Cheese, Mozzarella, Grande: recipes say 6\.5 → 7\.25 bags · yield 80 → 71\.03 · \$7\.73 under → \$19\.31 under/);
  assert.ok(!/Onion Rings:/.test(s) && !/Wings, Jumbo:/.test(s), 'a line that did not move is not listed');
});

await run('an admin re-runs a frozen bracket with a reason, and it opens as the next version', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  assert.ok(t.button('Re-run').disabled, 'no reason, no re-run');
  await t.say('  ab ');
  assert.ok(t.button('Re-run').disabled, 'a reason is at least 3 characters');
  await t.say('Wing yield corrected');
  await t.click('Re-run');
  await until(() => t.text().includes('Version 3 written. The original is unchanged.'), 'The re-run');
  const post = t.qa.calls.filter(c => c.method === 'POST');
  assert.equal(post.length, 1);
  assert.equal(post[0].path, '/admin/bar/food-variance/count-b/rerun');
  assert.deepEqual(plain(post[0].body), {reason: 'Wing yield corrected'});
  assert.deepEqual(t.tabs(), ['Original', 'Re-run 2', 'Re-run 3']);
  assert.equal(t.selectedTab(), 'Re-run 3');
  assert.match(t.text(), /by Jon Dow: “Wing yield corrected”/);
});

await run('a re-run GoTab refuses says so and adds nothing', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  await t.say('Grande yield corrected');
  await t.click('Re-run');
  await until(() => t.text().includes("GoTab can't be read right now, so the sales can't be re-read. Try again later."), 'The refusal');
  assert.deepEqual(t.tabs(), ['Original', 'Re-run 2']);
}, 'mode=rerun-fail');

await run('no re-run on a draft or a baseline; the draft says when it locks', async t => {
  await t.openRow(/^Oct 13 → Oct 20/);
  const lock = squash(new Date(Date.parse('2026-10-20T15:00:00.000Z') + 3 * 3600_000)
    .toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'}));
  assert.ok(t.text().includes(`Draft. It locks at ${lock}, once the bracket's late invoices are in.`), t.text());
  assert.equal(t.doc.querySelector('.lq-fv-rerun'), null);
  await t.click('‹ All food counts');
  await t.openRow(/^Baseline · Oct 6/);
  assert.match(t.text(), /Baseline count ?The first food count\. Food variance starts with the next full food count, measured from this one\./);
  assert.equal(t.doc.querySelector('.lq-fv-rerun'), null);
});

await run('a manager reads every report but has no Re-run', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  assert.match(t.text(), /Net variance/);
  assert.equal(t.doc.querySelector('.lq-fv-rerun'), null);
}, 'admin=0');

await run('a submitted count with no report yet says it is coming', async t => {
  await t.openRow(/^Oct 21/);
  assert.match(t.text(), /No report yet ?TPRS writes it within a minute or so of the count being submitted\./);
});

await run('a deep link opens that count straight away', async t => {
  await until(() => t.doc.querySelector('.lq-back'), 'The deep-linked report');
  assert.match(t.text(), /Oct 6 → Oct 13 ?7 days/);
}, 'count=count-b');

// ── the pure parts ──
await run('units read naturally, and what changed lists only what moved, biggest dollar move first', async t => {
  const {unitWord, amount, versionChanges} = t.qa;
  assert.deepEqual(['bag', 'box', 'case', 'each', 'lb', 'gal', 'jug', 'bib'].map(u => unitWord(u, 2)),
    ['bags', 'boxes', 'cases', 'each', 'lb', 'gal', 'jugs', 'bib']);
  assert.equal(unitWord('bag', 1), 'bag');
  assert.equal(amount(6.5, 'bag'), '6.5 bags');
  assert.equal(amount(6, null), '6');
  const l = (skuId, theoretical, varianceDollars, p = {}) => ({skuId, name: skuId, unit: 'bag', theoretical, varianceDollars,
    yieldUsed: 80, clean: true, ...p});
  const r = (lines, net) => ({report: {lines, totals: {netVarianceDollars: net}, completeness: {mappedSalesPct: 96.2}},
    basis: {recipes: {md5: 'same'}}});
  const changes = plain(versionChanges(
    r([l('a', 1, 5), l('b', 2, 50), l('c', 3, 1), l('gone', 1, 1)], 57),
    r([l('a', 1, 5), l('b', 2.5, 20), l('c', 3, 1, {clean: false}), l('new', 1, 2)], 28),
  ));
  assert.deepEqual(changes.net, [57, 28]);
  assert.equal(changes.recipesChanged, false);
  assert.deepEqual(changes.lines.map(c => c.skuId), ['b', 'new', 'gone', 'c']);
  assert.deepEqual(changes.lines.find(c => c.skuId === 'c').clean, [true, false]);
  assert.deepEqual(changes.lines.find(c => c.skuId === 'new').theoretical, [null, 1]);
});

console.log(`${passed} food variance checks passed`);
process.exit(0);
