// The count guard at the shelf (2026-11-12, Opsi BUILD-SPEC §11.177): a count
// higher than the last count plus deliveries, or than ever, asks right at the
// row as it is typed, and again on the "Leaving zone" sheet, with Keep and
// Change; the answer rides the next save as a line event. Plus the pounds box.
// The actual CountFood component with 11/12's slips on fictional ids.
// Build first: node serve.mjs --food-voice --build-only
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const {JSDOM}=process.env.COGS_QA_DEPS ? createRequire(join(resolve(process.env.COGS_QA_DEPS),'package.json'))('jsdom') : await import('jsdom');

const bundle = await readFile(new URL('./dist/food-fixture.js',import.meta.url),'utf8');
const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve,ms));
const until = async (predicate, what = 'Food UI condition') => {
  for (let i=0;i<200;i++) { if (predicate()) return; await pause(); }
  throw new Error(`${what} timed out`);
};

// Plain objects: the page builds its values in the window realm.
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
async function run(name, test, query = 'guard') {
  const dom = new JSDOM('<!doctype html><div id="root"></div>',{
    url:`http://localhost/?${query}`,runScripts:'outside-only',pretendToBeVisual:true,
  });
  dom.window.Response = Response;
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  try {
    dom.window.eval(bundle);
    const doc = dom.window.document;
    // The fixture always has an open draft: continue it.
    await until(() => doc.querySelector('.lq-fc-row') || [...doc.querySelectorAll('button')].some(b => b.textContent.trim() === 'Continue count'), 'Entry');
    const resume = [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === 'Continue count');
    if (resume) resume.click();
    await until(() => doc.querySelector('.lq-fc-row'), 'First zone');
    const qa = dom.window.foodQa;
    // The ceilings arrive after the first render; wait for the read.
    await until(() => qa.calls.some(c => c.path.endsWith('/shelf-ceilings')), 'The shelf ceilings read');
    await pause(60);
    const button = (text, scope = doc) => [...scope.querySelectorAll('button')]
      .find(b => typeof text === 'string' ? b.textContent.trim() === text : text.test(b.textContent.trim()));
    const click = async (text, scope = doc) => {
      const b = button(text, scope);
      assert.ok(b, `Missing button: ${text}`);
      assert.ok(!b.disabled, `Button unexpectedly disabled: ${text}`);
      b.click(); await pause();
    };
    const setValue = (el, value) => {
      const proto = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
      el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    };
    const type = async (label, value, scope = doc) => {
      const el = [...scope.querySelectorAll('input')].find(e => e.getAttribute('aria-label') === label);
      assert.ok(el, `Missing input: ${label}`);
      setValue(el, value); await pause();
    };
    const row = name => [...doc.querySelectorAll('.lq-fc-grid .lq-fc-row')].find(r => r.querySelector('.lq-fc-row-name')?.getAttribute('title') === name
      || r.querySelector('.lq-fc-row-label')?.textContent.includes(name.split(',')[0]));
    const guardOf = name => row(name)?.querySelector('.lq-fc-guard') ?? undefined;
    const location = () => doc.querySelector('select.lq-fc-location-select');
    const next = async () => { const select=location(); setValue(select, select.options[select.selectedIndex+1].value); await pause(); };
    const sheet = () => doc.querySelector('.lq-fc-sheetback:not(.lq-fc-sheetback-top) .lq-fc-sheet');
    const card = (name, scope) => [...(scope ?? doc).querySelectorAll('.lq-fc-q')]
      .find(c => c.querySelector('.lq-fc-q-name')?.getAttribute('title') === name);
    const line = (skuId, zoneId) => qa.lines.find(l => l.skuId === skuId && (!zoneId || l.zoneId === zoneId));
    const saved = (predicate, what) => until(predicate, what);
    await test({doc, qa, click, type, row, guardOf, next, sheet, card, line, saved, button, setValue});
    passed += 1;
    console.log(`PASS ${name}`);
  } finally {
    dom.window.close();
  }
}

await run('a whole 1 in the cases box meaning one bag asks at once, in plain words (the onion slip)', async ({type, guardOf, row}) => {
  assert.equal(guardOf('Onion, Yellow'), undefined, 'No question before anything is typed');
  // Blind count: the last count is not on the row before a number is typed.
  assert.ok(!row('Onion, Yellow').textContent.includes('1.3'), 'Last count hidden before typing');
  await type('Onion, Yellow: cases', '1');
  const g = guardOf('Onion, Yellow');
  assert.ok(g, 'Asks at the row');
  assert.equal(g.querySelector('.lq-fc-guard-text').textContent,
    '1 case = 10 bags. 10 bags is more than possible: last count was 1.3 bags and nothing came in.');
  assert.match(g.textContent, /Keep it if a delivery isn't scanned yet\./);
  assert.ok(!/cases must be whole|whole case/i.test(g.textContent), 'Never a whole-cases rule');
});

await run('a partial case is never a question: 1.8 cases of lids, or 0.7', async ({type, guardOf}) => {
  await type('Lid, Dome, 16 oz: cases', '1.8');
  assert.equal(guardOf('Lid, Dome, 16 oz'), undefined);
  await type('Lid, Dome, 16 oz: cases', '0.7');
  assert.equal(guardOf('Lid, Dome, 16 oz'), undefined);
});

await run('fixing the number clears the question and records the change with the next save', async ({qa, type, guardOf, saved, line}) => {
  await type('Onion, Yellow: cases', '1');
  assert.ok(guardOf('Onion, Yellow'));
  await type('Onion, Yellow: cases', '0');
  await type('Onion, Yellow: loose bags', '1');
  assert.equal(guardOf('Onion, Yellow'), undefined);
  await saved(() => qa.events.length > 0 && Number(line('onion')?.qtyUnits) === 1, 'The change saved with its answer');
  assert.deepEqual(plain(qa.events).map(e => [e.kind, e.editedBy, e.findingKind, e.beforeQty, e.afterQty, e.zoneId, e.skuId]),
    [['grid_set', 'typed', 'shelf_impossible', 10, 1, 'walkin', 'onion']]);
});

await run('Keep stands for that number, is saved as an answer, and a different number asks again', async ({qa, click, type, guardOf, saved, next}) => {
  await next(); // Pizza Line: nothing typed on the cooler, so no sheet
  await type('Sugar, Granulated, Extra Fine: loose bags', '17');
  const g = guardOf('Sugar, Granulated, Extra Fine');
  assert.equal(g?.querySelector('.lq-fc-guard-text').textContent, '17 bags is more than possible: last count was 1 bag and nothing came in.');
  await click('Keep', g);
  assert.equal(guardOf('Sugar, Granulated, Extra Fine'), undefined);
  await saved(() => qa.events.some(e => e.editedBy === 'keep_high'), 'The Keep saved');
  assert.deepEqual(plain(qa.events).map(e => [e.kind, e.editedBy, e.findingKind, e.beforeQty, e.afterQty, e.skuId]),
    [['grid_set', 'keep_high', 'shelf_impossible', 17, 17, 'sugar']]);
  await type('Sugar, Granulated, Extra Fine: loose bags', '18');
  assert.ok(guardOf('Sugar, Granulated, Extra Fine'), 'A new number asks again');
});

await run('pounds: 17 lb of sugar saves as 0.68 bag, a pounds part the way a spoken "17 lb" is, and asks nothing', async ({type, guardOf, saved, line, next}) => {
  await next();
  await type('Sugar, Granulated, Extra Fine: pounds', '17');
  assert.equal(guardOf('Sugar, Granulated, Extra Fine'), undefined);
  await saved(() => line('sugar'), 'Sugar saved');
  const l = line('sugar');
  assert.equal(Number(l.qtyUnits), 0.68);
  assert.deepEqual(JSON.parse(JSON.stringify(l.foodQuantity.loose)), [{quantity:'17', unit:'lb', numerator:'1', denominator:'25'}]);
  // Bags and pounds together: 1 bag + 5 lb = 1.2 bags.
  await type('Sugar, Granulated, Extra Fine: loose bags', '1');
  await type('Sugar, Granulated, Extra Fine: pounds', '5');
  await saved(() => Number(line('sugar')?.qtyUnits) === 1.2, '1 bag + 5 lb');
});

await run('leaving the shelf asks about its high counts with Keep and Change, before moving on', async ({qa, click, type, next, sheet, card, saved, line, guardOf}) => {
  await type('Onion, Yellow: cases', '1');
  await type('Lid, Dome, 16 oz: cases', '1.8');
  await type('Cheese, Mozzarella: loose bags', '2');
  await next();
  const s = sheet();
  assert.ok(s, 'The leaving sheet opened');
  assert.match(s.textContent, /1 count looks too high/);
  const c = card('Onion, Yellow', s);
  assert.ok(c, 'Onion is asked about');
  assert.ok(!card('Lid, Dome, 16 oz', s), 'A partial case of lids is not');
  await click('Change', c);
  await type('Onion, Yellow: bags', '1', c);
  await click('Save', c);
  assert.match(card('Onion, Yellow', sheet()).textContent, /✓ Changed to 1 bag/);
  assert.equal(guardOf('Onion, Yellow'), undefined);
  await saved(() => Number(line('onion', 'walkin')?.qtyUnits) === 1 && qa.events.some(e => e.editedBy === 'typed'), 'The change saved');
  await click(/^Next zone|^On to/);
  assert.equal(sheet(), null);
});

await run('a count across shelves is judged as the total, and says so', async ({type, next, sheet, click, guardOf}) => {
  await type('Onion, Yellow: loose bags', '1');
  assert.equal(guardOf('Onion, Yellow'), undefined, '1 bag is possible');
  await next();
  if (sheet()) await click(/^Skip|^Next zone|^On to/, sheet());
  await next();
  if (sheet()) await click(/^Skip|^Next zone|^On to/, sheet());
  await type('Onion, Yellow: loose bags', '1');
  assert.equal(guardOf('Onion, Yellow')?.querySelector('.lq-fc-guard-text').textContent,
    '2 bags across shelves is more than possible: last count was 1.3 bags and nothing came in.');
});

await run('more than ever, where the last count cannot be compared', async ({type, guardOf}) => {
  await type('Cheese, Mozzarella: loose bags', '51');
  assert.equal(guardOf('Cheese, Mozzarella')?.querySelector('.lq-fc-guard-text').textContent, "51 bags is more than we've ever had on hand.");
});

await run('no ceilings (the read failed): no questions at the shelf, and the count still saves', async ({qa, type, guardOf, saved, line}) => {
  await type('Onion, Yellow: cases', '1');
  assert.equal(guardOf('Onion, Yellow'), undefined);
  await saved(() => Number(line('onion')?.qtyUnits) === 10, 'Saved');
  assert.deepEqual(plain(qa.events), []);
}, 'guard&guard-down');

await run('a fix on the second shelf is recorded on that shelf (review round 2)', async ({qa, type, next, sheet, click, saved, line}) => {
  await type('Onion, Yellow: loose bags', '1');
  await next();
  if (sheet()) await click(/^Skip|^Next zone|^On to/, sheet());
  await next();
  if (sheet()) await click(/^Skip|^Next zone|^On to/, sheet());
  await type('Onion, Yellow: loose bags', '10');
  await type('Onion, Yellow: loose bags', '0.5');
  await saved(() => qa.events.length > 0 && Number(line('onion', 'fryer')?.qtyUnits) === 0.5, 'The fix saved');
  assert.deepEqual(plain(qa.events).map(e => [e.zoneId, e.editedBy, e.beforeQty, e.afterQty]), [['fryer', 'typed', 10, 0.5]]);
});

await run('a change after an earlier Keep is recorded, and the Keep stays recorded (review round 2)', async ({qa, type, click, guardOf, saved, line}) => {
  await type('Onion, Yellow: cases', '1');
  await click('Keep', guardOf('Onion, Yellow'));
  await type('Onion, Yellow: cases', '2');
  assert.ok(guardOf('Onion, Yellow'), '20 bags asks again');
  await type('Onion, Yellow: cases', '0');
  await type('Onion, Yellow: loose bags', '1');
  await saved(() => qa.events.length >= 2 && Number(line('onion')?.qtyUnits) === 1, 'Both saved');
  assert.deepEqual(plain(qa.events).map(e => [e.editedBy, e.beforeQty, e.afterQty]), [['keep_high', 10, 10], ['typed', 20, 1]]);
});

await run('pounds saved at an older pound size keep their own box; the lb box adds at today\'s (review round 2)', async ({type, saved, line, next, doc}) => {
  await next();
  const labels = [...doc.querySelectorAll('input')].map(e => e.getAttribute('aria-label')).filter(l => l?.startsWith('Sugar'));
  assert.ok(labels.includes('Sugar, Granulated, Extra Fine: loose lb'), 'The older 10 lb has its own box');
  assert.ok(labels.includes('Sugar, Granulated, Extra Fine: pounds'), 'The lb box');
  await type('Sugar, Granulated, Extra Fine: pounds', '5');
  // 10 lb at 1/20 = 0.5 bag stays; 5 lb at 1/25 = 0.2 bag adds.
  await saved(() => Number(line('sugar')?.qtyUnits) === 0.7, '0.5 + 0.2 bag');
  assert.deepEqual(plain(line('sugar').foodQuantity.loose).map(p => [p.quantity, p.numerator, p.denominator]).sort(),
    [['10', '1', '20'], ['5', '1', '25']]);
}, 'guard&guard-oldlb');

console.log(`${passed} count guard scenarios passed`);
