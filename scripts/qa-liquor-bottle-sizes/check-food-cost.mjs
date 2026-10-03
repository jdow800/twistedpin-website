// Food cost (views/FoodCost.tsx and FoodCostReport.tsx; TPRS migration 0206,
// Opsi BUILD-SPEC 11.125-11.127): the list, one bracket at each version, the
// provisional reasons in words, the re-run, fixing costs, and the states
// around them. The actual screen with synthetic reports; every request is
// intercepted.
// Build first: node serve.mjs --food-cost --build-only
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const bundle = await readFile(new URL('./dist/food-cost-fixture.js', import.meta.url), 'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
const until = async (predicate, what) => {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await pause(); }
  throw new Error(`${what} timed out`);
};
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
    const tabs = () => [...doc.querySelectorAll('[role="tab"]')].map(b => b.textContent);
    const selectedTab = () => doc.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
    const type = async (selector, value) => {
      const box = doc.querySelector(selector);
      assert.ok(box, `Missing ${selector}`);
      const proto = box.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(box, value);
      box.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
      await pause();
    };
    const openFix = async () => {
      const fix = doc.querySelector('.lq-fco-fix');
      assert.ok(fix, 'Missing Fix costs');
      fix.open = true;
      fix.dispatchEvent(new dom.window.Event('toggle'));
      await until(() => fix.querySelector('.lq-fco-price') || /Nothing on this report/.test(fix.textContent), 'The counts\' costs');
      return fix;
    };
    await test({doc, qa: dom.window.fcQa, text, rows, button, click, openRow, tabs, selectedTab, type, openFix});
    passed += 1;
    console.log(`PASS ${name}`);
  } finally {
    dom.window.close();
  }
}

// ── the list ──
await run('the list: newest first at each bracket\'s latest version, a pending count, a provisional draft and the baseline', async t => {
  const rows = t.rows().map(r => squash(r.textContent));
  assert.equal(rows.length, 4, rows.join('\n'));
  assert.match(rows[0], /^Oct 21 ?Report pending ?Submitted Oct 21 · .* · Sam\. The report usually lands within a minute\.$/);
  assert.match(rows[1], /^Oct 13 → Oct 20 ?Provisional Draft ?30\.71% · \$1,720\.00 on \$5,600\.00 of sales · Sam$/);
  // The latest version is what the list shows: v3, 31.02%, not the original's 30.71%.
  assert.match(rows[2], /^Oct 6 → Oct 13 ?Final ?31\.02% · \$1,720\.00 on \$5,600\.00 of sales · v3 of 3 · Sam$/);
  assert.match(rows[3], /^Baseline · Oct 6 ?Baseline ?The first food count · Sam\. The next one gets the first report\.$/);
  const history = t.qa.calls.find(c => c.path === '/admin/bar/counts/history');
  assert.equal(history?.query, '?section=food', 'asks for FOOD counts, never the liquor list');
});

await run('no food counts yet: the first one is the baseline', async t => {
  assert.match(t.text(), /No food counts submitted yet\. The first full count is the baseline\./);
}, 'mode=empty');

await run('a failed load says so', async t => {
  assert.match(t.text(), /Couldn't load food cost\./);
}, 'mode=error');

// ── one bracket ──
await run('a bracket opens at its latest version: why it exists, the headline against the target, sales by source, and USAR beside', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  assert.deepEqual(t.tabs(), ['Updated · v3', 'Revalued · v2', 'Original']);
  assert.equal(t.selectedTab(), 'Updated · v3');
  const s = t.text();
  assert.match(s, /Updated by TPRS Oct 16 · .+: Brunswick read for 2026-10-08, 2026-10-09\. This is the version trends read\./);
  assert.match(s, /Food \+ NA cost ?31\.02% target 30% · band 28–34%/);
  assert.match(s, /\$1,720\.00 on \$5,600\.00 of food \+ NA sales/);
  assert.match(s, /\$1,720\.00 before rebates · sales: GoTab \$5,200\.00, catering \$400\.00 · \$40\.08 of mocktails go to pour cost/);
  assert.match(s, /Not in sales \(rung on the whole check\): Employees 50% off −\$98\.86 · Happy Hour: 30% off \$15\+, up to \$7 −\$10\.10/);
  assert.ok(!s.includes('Provisional.'), 'a version with nothing missing says nothing about it');
  assert.match(s, /Without comps and staff meals ?29\.79% · \$1,650\.00 ?At recipe cost: staff meals \$40\.00 and staff or training comps \$15\.00 go to labor; guest comps \$15\.00 go to marketing\./);
});

await run('the original: provisional, each reason in words on its line, a cost jump left out, an unpriced item with no dollars', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  await t.click('Original');
  const s = t.text();
  assert.match(s, /Final since Oct 13 · .+\. A later version is the one trends read\./);
  assert.match(s, /30\.71% target 30%/);
  assert.match(s, /Provisional\. Some numbers below aren't final yet; each line says why\./);
  assert.match(s, /No cost yet for Salsa, Mild \(3 at the opening count\)\. Left out of the dollars until priced\./);
  assert.match(s, /A cost that looks wrong: Pork Carnitas, \$4\.25 at the opening count, \$131\.75 at the closing\. Left out until revalued\./);
  assert.match(s, /The rebate isn't known yet for Oct 8 and Oct 9 \(no Brunswick report\)\./);
  assert.match(s, /Not every item could be costed: Icees \(no recipe\)\./);
  // The cost jump is listed first, and says "left out", never the dollars its bad cost would make.
  assert.match(s, /Items, biggest dollars first ?Pork Carnitas ?left out ?opened 10 lb, \$42\.50 · bought nothing · closed 10 lb, \$1,317\.50 · used 0 lb ?a cost more than 3× off: left out until revalued/);
  assert.match(s, /Salsa, Mild ?— ?opened 3 jars \(no cost\) · bought nothing · closed 1 jar, \$2\.50 · used 2 jars ?no cost yet/);
});

await run('the revalued version says who, why, and that both brackets moved together', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  await t.click('Revalued · v2');
  assert.match(t.text(), /Costs revalued Oct 15 · .+ by Jon Dow: “case price frozen as a pound price”\. Both brackets this count bounds got a new version together\./);
});

await run('the lines: food and NA apart under their line, purchases explained, paper per cover, and an empty line left off', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  const s = t.text();
  assert.match(s, /By line · 400 covers · 7 days/);
  assert.match(s, /Food \+ NA ?\$1,720\.00 ?\$520\.00 opening \+ \$1,500\.00 bought − \$300\.00 closing · \$245\.71\/day/);
  assert.match(s, /Food ?\$1,217\.50 ?NA drinks ?\$502\.50/);
  assert.match(s, /Purchases include \$25\.00 freight and −\$5\.00 in on-invoice discounts; \$40\.00 is on invoices not yet reviewed\./);
  assert.match(s, /Fries, Shoestring ?\$240\.00 ?opened 10 bags, \$200\.00 · bought 6 bags for \$120\.00 · closed 4 bags, \$80\.00 · used 12 bags · \$34\.29\/day/);
  assert.match(s, /Paper ?\$80\.00 ?\$100\.00 opening \+ \$50\.00 bought − \$70\.00 closing · \$11\.43\/day · \$0\.20 per cover/);
  assert.match(s, /Supplies ?\$25\.00 ?\$0\.00 opening \+ \$25\.00 bought − \$0\.00 closing · \$3\.57\/day ?Below the line: not cost of goods sold\./);
  assert.match(s, /Bar produce on the food walk ?\$12\.00 ?\$5\.00 opening .*They belong with pour cost, never food\./);
  assert.ok(!s.includes('No report line yet'), 'an empty unbucketed line is left off');
  assert.match(s, /• Brunswick front-desk food has no reader yet: about 4\.7% of F&B, roughly 1\.4 points on a 30% line\./);
});

await run('an admin re-runs a frozen bracket with a reason, and it opens as the newest version', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  assert.ok(t.button('Re-run').disabled, 'no reason, no re-run');
  await t.type('textarea[aria-label="What changed"]', ' ab ');
  assert.ok(t.button('Re-run').disabled, 'a reason is at least 3 characters');
  await t.type('textarea[aria-label="What changed"]', 'Sysco credit memo read');
  await t.click('Re-run');
  await until(() => t.text().includes('Version 4 written. The earlier versions are unchanged.'), 'The re-run');
  const post = t.qa.calls.filter(c => c.method === 'POST');
  assert.equal(post.length, 1);
  assert.equal(post[0].path, '/admin/bar/food-cogs/count-b/rerun');
  assert.deepEqual(plain(post[0].body), {reason: 'Sysco credit memo read'});
  assert.deepEqual(t.tabs(), ['Re-run · v4', 'Updated · v3', 'Revalued · v2', 'Original']);
  assert.equal(t.selectedTab(), 'Re-run · v4');
  assert.match(t.text(), /Re-run Oct 17 · .+ by Jon Dow: “Sysco credit memo read”\. This is the version trends read\./);
});

await run('a re-run GoTab refuses says so and adds nothing', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  await t.type('textarea[aria-label="What changed"]', 'Sysco credit memo read');
  await t.click('Re-run');
  await until(() => t.text().includes("GoTab can't be read right now, so the sales can't be re-read. Try again later."), 'The refusal');
  assert.deepEqual(t.tabs(), ['Updated · v3', 'Revalued · v2', 'Original']);
}, 'mode=rerun-fail');

// ── fixing costs ──
await run('fix costs: lists what the report can\'t price, pre-fills TPRS\'s suggestion, and sends every line of each item', async t => {
  await t.openRow(/^Oct 13 → Oct 20/);
  const fix = await t.openFix();
  const prices = [...fix.querySelectorAll('.lq-fco-price')].map(p => squash(p.textContent));
  assert.equal(prices.length, 3, prices.join('\n'));
  assert.match(prices[0], /^Pork Carnitas · opening count · 6 lb ?Counted at \$4\.25 a lb\. The two counts are more than 3× apart, so one of them is wrong: fix that one and leave the other blank\./);
  assert.match(prices[1], /^Pork Carnitas · closing count · 10 lb ?Counted at \$131\.75 a lb\./);
  assert.match(prices[2], /^Salsa, Mild · closing count · 2 jars ?No cost yet\. TPRS suggests \$2\.50: the first price after the count\./);
  const inputs = [...fix.querySelectorAll('input')].map(i => [i.getAttribute('aria-label'), i.value]);
  assert.deepEqual(inputs, [
    ['Pork Carnitas price per lb, opening count', ''],
    ['Pork Carnitas price per lb, closing count', ''],
    ['Salsa, Mild price per jar, closing count', '2.5'],
  ]);
  assert.ok(t.button('Revalue', fix).disabled, 'no reason, no revalue');
  await t.type('input[aria-label="Pork Carnitas price per lb, closing count"]', 'abc');
  await t.type('textarea[aria-label="Why"]', 'case price frozen as a pound price');
  assert.ok(t.button('Revalue', fix).disabled, 'a price that is not a number stops it');
  await t.type('input[aria-label="Pork Carnitas price per lb, closing count"]', '4.39');
  await t.click('Revalue', fix);
  await until(() => t.text().includes('Revalued 3 lines. The draft picks it up when it locks.'), 'The revalue');
  const posts = t.qa.calls.filter(c => c.method === 'POST');
  // Only the closing count changed: one call, both carnitas shelves at the new price, salsa at the suggestion.
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, '/admin/bar/counts/count-c/revalue');
  assert.deepEqual(plain(posts[0].body), {reason: 'case price frozen as a pound price', changes: [
    {lineId: 'c-carnitas-1', cost: 4.39}, {lineId: 'c-carnitas-2', cost: 4.39}, {lineId: 'c-salsa', cost: 2.5},
  ]});
  assert.ok(t.qa.calls.some(c => c.path === '/admin/bar/counts/count-b/costs'), 'the opening count\'s costs are read too');
});

await run('fix costs on both counts: each count is revalued on its own, and the bracket next door gets its version', async t => {
  await t.openRow(/^Oct 13 → Oct 20/);
  await t.openFix();
  await t.type('input[aria-label="Pork Carnitas price per lb, opening count"]', '4.3');
  await t.type('textarea[aria-label="Why"]', 'carnitas priced from the Sysco invoice');
  await t.click('Revalue');
  await until(() => /Revalued \d+ lines\./.test(t.text()), 'The revalue');
  const posts = plain(t.qa.calls.filter(c => c.method === 'POST').map(c => c.path));
  assert.deepEqual(posts, ['/admin/bar/counts/count-b/revalue', '/admin/bar/counts/count-c/revalue']);
  assert.match(t.text(), /Revalued 2 lines\. The draft picks it up when it locks\. The bracket next to it got version 4\./);
});

await run('a revalue GoTab refuses says nothing changed', async t => {
  await t.openRow(/^Oct 13 → Oct 20/);
  await t.openFix();
  await t.type('textarea[aria-label="Why"]', 'salsa priced');
  await t.click('Revalue');
  await until(() => t.text().includes("GoTab can't be read right now, so the brackets can't be re-read. Nothing changed; try again later."), 'The refusal');
}, 'mode=revalue-fail');

await run('a bracket with nothing to price says so, without reading the counts', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  const fix = await t.openFix();
  assert.match(squash(fix.textContent), /Nothing on this report needs a price\./);
  assert.equal(fix.querySelector('textarea'), null);
  assert.ok(!t.qa.calls.some(c => c.path.endsWith('/costs')), 'no costs fetched');
});

// ── the rest ──
await run('a draft says when it locks; a baseline and a pending count say what they are; no re-run on a draft', async t => {
  await t.openRow(/^Oct 13 → Oct 20/);
  const lock = squash(new Date(Date.parse('2026-10-20T15:00:00.000Z') + 3 * 3600_000)
    .toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'}));
  assert.ok(t.text().includes(`Draft. It locks at ${lock}, once the bracket's late invoices are in, and freezes the counts' costs then.`), t.text());
  assert.equal(t.button('Re-run'), undefined);
  assert.match(t.text(), /1 invoice not read yet: their dollars are missing\./);
  assert.match(t.text(), /1 catered event not completed yet: their food revenue lands when they are\./);
  await t.click('‹ All food brackets');
  await t.openRow(/^Baseline · Oct 6/);
  assert.match(t.text(), /Baseline count ?The first food count\. Food cost starts with the next full food count, measured from this one\./);
  assert.equal(t.doc.querySelector('.lq-fco-fix'), null);
  await t.click('‹ All food brackets');
  await t.openRow(/^Oct 21/);
  assert.match(t.text(), /No report yet ?TPRS writes it within a minute or so of the count being submitted\./);
});

await run('a manager reads every report but has no Fix costs and no Re-run', async t => {
  await t.openRow(/^Oct 6 → Oct 13/);
  assert.match(t.text(), /Food \+ NA cost/);
  assert.equal(t.doc.querySelector('.lq-fco-fix'), null);
  assert.equal(t.doc.querySelector('.lq-fv-rerun'), null);
}, 'admin=0');

await run('a deep link opens that bracket straight away', async t => {
  await until(() => t.doc.querySelector('.lq-back'), 'The deep-linked report');
  assert.match(t.text(), /Oct 6 → Oct 13 ?7 days/);
}, 'count=count-b');

// ── the pure parts ──
await run('the words: every reason, every version label, money and percentages, and an item\'s movement', async t => {
  const {reasonText, versionLabel, money, pctText, itemMovement, revalueMessage} = t.qa;
  assert.equal(money(123456), '$1,234.56');
  assert.equal(money(-500), '−$5.00');
  assert.equal(pctText(30.1), '30.10%');
  assert.equal(pctText(null), '—');
  assert.deepEqual([1, 2, 3, 4].map((version, i) => versionLabel({version, trigger: ['sweep', 'rerun', 'revalue', 'cleared'][i]})),
    ['Original', 'Re-run · v2', 'Revalued · v3', 'Updated · v4']);
  const said = [
    {code: 'estimated_purchases', estimatedCents: 30000, goodsCents: 100000},
    {code: 'unbucketed', cents: 700},
    {code: 'rebates_unknown', dates: [{salesDate: '2026-10-07', why: 'checksum_failed'}, {salesDate: '2026-10-08', why: 'not_extracted'},
      {salesDate: '2026-10-09', why: 'not_captured'}, {salesDate: '2026-10-10', why: 'not_captured'}]},
    {code: 'pending_invoices', invoiceIds: ['a', 'b']},
    {code: 'unattributed_purchases', cents: 1234},
    {code: 'counted_one_end', items: [{skuId: 'x', name: 'Rotini', missing: 'closing'}]},
  ].map(reasonText);
  assert.deepEqual(said, [
    '$300.00 of $1,000.00 in purchases is the vendor-mix estimate, not matched lines.',
    'Items with no report line yet.',
    "The rebate isn't known yet for Oct 7, Oct 8 and 2 more (the report's totals didn't add up; the report isn't read yet; read before rebates were captured).",
    '2 invoices not read yet: their dollars are missing.',
    '$12.34 of purchases from a supplier with no category isn\'t on any line.',
    'Counted at only one end: Rotini (not in the closing count).',
  ]);
  const item = {skuId: 'r', name: 'Rotini', line: 'food_na', bucket: 'food', unit: 'box', opening: {qty: 4, cents: 1000, pricedCents: 1000},
    purchased: {qty: null, cents: 2000}, closing: {qty: null, cents: null, pricedCents: 0}, usedQty: null, usedCents: null,
    usedQtyPerDay: null, usedCentsPerDay: null, unitCost: {opening: 2.5, closing: null, purchased: null}, flags: [], excluded: false};
  assert.equal(itemMovement(item), "opened 4 boxes, $10.00 · bought an amount that couldn't be converted for $20.00 · closed not counted");
  assert.equal(revalueMessage(0, [], 'b', 'final'), 'Nothing to revalue.');
  assert.equal(revalueMessage(2, [{sessionId: 'b', version: 4}, {sessionId: 'c', version: 2}], 'b', 'final'),
    'Revalued 2 lines. Version 4 written. The bracket next to it got version 2.');
});

await run('itemsToPrice groups an item\'s shelves, skips an empty unpriced line, and offers a cost jump at both ends', async t => {
  const report = {lines: {food_na: {reasons: [
    {code: 'unpriced', items: [{skuId: 'salsa', name: 'Salsa', end: 'closing', qty: 0}, {skuId: 'rice', name: 'Rice', end: 'closing', qty: 5}]},
    {code: 'cost_jump', items: [{skuId: 'carn', name: 'Carnitas', unitCost: {}}]},
  ]}, paper: {reasons: []}}};
  const line = (p) => ({zoneName: 'Shelf', countUnit: 'each', unitLabel: 'bag', basis: 'observed', estimateSource: null, transient: false,
    valueCents: null, suggestion: null, cost: 1, ...p});
  const items = plain(t.qa.itemsToPrice(report, {opening: 'A', closing: 'B'}, {
    A: [line({lineId: 'a1', skuId: 'carn', name: 'Carnitas', qty: 2, cost: 4})],
    B: [line({lineId: 'b1', skuId: 'rice', name: 'Rice', qty: 3, cost: null, basis: 'unpriced', suggestion: {cost: 1.5, source: 'other_count'}}),
      line({lineId: 'b2', skuId: 'rice', name: 'Rice', qty: 2, cost: null, basis: 'unpriced'}),
      line({lineId: 'b3', skuId: 'salsa', name: 'Salsa', qty: 0, cost: null, basis: 'unpriced'}),
      line({lineId: 'b4', skuId: 'carn', name: 'Carnitas', qty: 1, cost: 40})],
  }));
  assert.deepEqual(items.map(i => [i.name, i.end, i.qty, i.lineIds, i.why, i.suggestion?.cost ?? null]), [
    ['Carnitas', 'opening', 2, ['a1'], 'cost_jump', null],
    ['Carnitas', 'closing', 1, ['b4'], 'cost_jump', null],
    ['Rice', 'closing', 5, ['b1', 'b2'], 'unpriced', 1.5],
  ]);
});

console.log(`\n${passed} food cost scenarios passed`);
