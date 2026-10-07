// Where things live on the food walk (Jon, 2026-10-03; the approved preview is
// Opsi previews/2026-10-03-walk-locations.html): leaving a zone with listed
// items blank, "+ New spot", and "things we think you have" before Submit.
// The actual CountFood component with synthetic stock and zones.
// Build first: node serve.mjs --food-voice --build-only
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const {JSDOM}=process.env.COGS_QA_DEPS ? createRequire(join(resolve(process.env.COGS_QA_DEPS),'package.json'))('jsdom') : await import('jsdom');

const bundle = await readFile(new URL('./dist/food-fixture.js',import.meta.url),'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve,20));
const until = async (predicate, what = 'Food UI condition') => {
  for (let i=0;i<200;i++) { if (predicate()) return; await pause(); }
  throw new Error(`${what} timed out`);
};

let passed = 0;
async function run(name, test, query = 'walk') {
  const dom = new JSDOM('<!doctype html><div id="root"></div>',{
    url:`http://localhost/?${query}`,runScripts:'outside-only',pretendToBeVisual:true,
  });
  dom.window.Response = Response;
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  try {
    dom.window.eval(bundle);
    const doc = dom.window.document;
    await until(() => doc.querySelector('.lq-fc-row'), 'First zone');
    const qa = dom.window.foodQa;
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
    // Scoped: the grid row behind a sheet has boxes with the same labels.
    const type = async (label, value, scope = doc) => {
      const el = [...scope.querySelectorAll('input')].find(e => e.getAttribute('aria-label') === label);
      assert.ok(el, `Missing input: ${label}`);
      setValue(el, value); await pause();
    };
    const location = () => doc.querySelector('select.lq-fc-location-select');
    const zoneName = () => location()?.selectedOptions[0]?.textContent ?? '';
    const sheet = () => doc.querySelector('.lq-fc-sheetback:not(.lq-fc-sheetback-top) .lq-fc-sheet');
    const spotSheet = () => doc.querySelector('.lq-fc-sheetback-top .lq-fc-sheet');
    const have = () => doc.querySelector('.lq-fc-have');
    const card = (name, scope) => [...(scope ?? doc).querySelectorAll('.lq-fc-q')]
      .find(c => c.querySelector('.lq-fc-q-name')?.getAttribute('title') === name);
    const chips = scope => [...scope.querySelectorAll('.lq-fc-chip')].map(b => b.textContent.trim());
    const chooseLocation = async id => { const select=location();assert.ok(select&&!select.disabled,'Location enabled');setValue(select,id);await pause(); };
    const next = async () => { const select=location();await chooseLocation(select.options[select.selectedIndex+1].value); };
    const prev = async () => { const select=location();await chooseLocation(select.options[select.selectedIndex-1].value); };
    const line = skuId => qa.lines.find(l => l.skuId === skuId);
    const saved = (skuId, what) => until(() => qa.lines.some(l => l.skuId === skuId), what ?? `A saved line for ${skuId}`);
    // Plain objects: request bodies are parsed in the window's realm, and
    // deepStrictEqual compares prototypes.
    const plain = value => JSON.parse(JSON.stringify(value));
    const memberCalls = skuId => plain(qa.calls.filter(c => c.path.endsWith(`/skus/${skuId}/zones`)).map(c => c.body));
    const countDough = () => type('Pizza Dough: loose packs', '2');
    const finish = async () => {
      await click(/^Finish/);
      await until(() => doc.querySelector('.lq-fc-kind'), 'The submit panel');
    };
    await test({doc, qa, button, click, setValue, type, zoneName, sheet, spotSheet, have, card, chips, next, prev, chooseLocation, plain,
      line, saved, memberCalls, countDough, finish});
    passed += 1;
    console.log(`PASS ${name}`);
  } finally {
    dom.window.close();
  }
}

// Explicit shelf entries remain independent even though advisory questions
// deliberately treat an answer anywhere as answered for the SKU.
await run('a zero on one shelf leaves the other blank; counting both shelves saves both lines and their sum', async t => {
  await t.type('Pizza Dough: loose packs','0');
  await t.saved('dough');
  await t.next();
  await t.click(/^Skip .*next zone/,t.sheet());
  assert.match(t.zoneName(),/Kitchen Cooler/);
  const loose=t.doc.querySelector('input[aria-label="Pizza Dough: loose packs"]');
  assert.equal(loose.value,'','a zero in the freezer does not populate this shelf');
  await t.type('Pizza Dough: cases','1');
  await t.type('Pizza Dough: loose packs','3');
  await until(()=>t.qa.lines.filter(l=>l.skuId==='dough').length===2,'Both shelf lines');
  const rows=t.qa.lines.filter(l=>l.skuId==='dough');
  assert.equal(rows.find(l=>l.zoneId==='freezer').qtyUnits,0);
  assert.equal(rows.find(l=>l.zoneId==='cooler').qtyUnits,23);
  assert.equal(rows.reduce((n,l)=>n+Number(l.qtyUnits),0),23,'depletion reads the sum across shelves');
  await t.finish();
  assert.ok(![...t.doc.querySelectorAll('.lq-fc-q-name')].some(e=>e.getAttribute('title')==='Pizza Dough'),'the advisory treats an answer anywhere as answered');
},'plain');

await run('a reopened draft retains its frozen case factor while the other shelf uses the current case factor', async t => {
  const cases=t.doc.querySelector('input[aria-label="Pizza Dough: cases"]');
  assert.equal(cases.value,'2');
  await t.next();
  await t.click(/^Skip .*next zone/,t.sheet());
  assert.equal(t.doc.querySelector('input[aria-label="Pizza Dough: cases"]').value,'');
  await t.type('Pizza Dough: cases','1');
  await until(()=>t.qa.lines.filter(l=>l.skuId==='dough').length===2,'Reopened draft shelf lines');
  const rows=t.qa.lines.filter(l=>l.skuId==='dough');
  assert.equal(rows.find(l=>l.zoneId==='freezer').qtyUnits,24);
  assert.equal(rows.find(l=>l.zoneId==='freezer').caseSizeAtEntry,12);
  assert.equal(rows.find(l=>l.zoneId==='cooler').qtyUnits,20);
  assert.equal(rows.find(l=>l.zoneId==='cooler').caseSizeAtEntry,20);
  assert.equal(rows.reduce((n,l)=>n+Number(l.qtyUnits),0),44);
},'frozen');

// ── leaving a zone ──
await run('crust and flatbread answers on a leaving-shelf question offer only cases',async t => {
  await t.type('Pizza Dough: loose cases','2');
  await t.next();
  const crust=t.card('Cauliflower Crust',t.sheet());
  assert.ok(crust);
  await t.click('Count it',crust);
  assert.equal(crust.querySelectorAll('.lq-fc-q-qty input').length,1);
  await t.type('Cauliflower Crust: cases','0.5',crust);
  await t.click('Save',crust);
  await t.saved('cauliflower');
  assert.equal(t.line('cauliflower').qtyUnits,6);
  assert.equal(t.line('cauliflower').enteredCases,0.5);
  assert.match(crust.textContent,/0\.5 cases/);
},'definitions');
await run('leaving a counted zone with listed items blank asks first, and names the zone big', async t => {
  await t.countDough();
  await t.next();
  assert.ok(t.sheet(), 'the leaving sheet opens');
  assert.match(t.zoneName(), /Pizza Freezer/, 'still on the zone until it is answered or skipped');
  assert.equal(t.sheet().querySelector('.lq-fc-sheet-zone-k').textContent, 'Leaving zone 1 of 3');
  assert.equal(t.sheet().querySelector('.lq-fc-sheet-zone-n').textContent, 'Pizza Freezer');
  assert.equal(t.sheet().querySelector('.lq-fc-sheet-h').textContent, '2 items weren’t counted');
  assert.deepEqual([...t.sheet().querySelectorAll('.lq-fc-q-name')].map(e => e.getAttribute('title')),
    ['Aquafina Water, Bottled', 'Giant Pretzel'], 'the blank listed items, not the counted one');
  assert.ok(t.button('Skip 2, next zone ›', t.sheet()));
  assert.ok(t.button('Back to Pizza Freezer', t.sheet()));
  assert.match(t.sheet().textContent, /Skipped ones come up again before you submit\./);
});

await run('"None left" records a zero on the zone being left', async t => {
  await t.countDough();
  await t.next();
  const pretzel = () => t.card('Giant Pretzel', t.sheet());
  await t.click('None left', pretzel());
  assert.match(pretzel().textContent, /✓ None left · 0 counted/);
  assert.equal(t.sheet().querySelector('.lq-fc-sheet-h').textContent, '1 item wasn’t counted');
  assert.ok(t.button('Skip 1, next zone ›', t.sheet()));
  await t.saved('pretzel');
  assert.equal(t.line('pretzel').qtyUnits, 0);
  assert.equal(t.line('pretzel').zoneId, 'freezer');
});

await run('"Count it" takes the count right there, in cases and the item\'s own unit', async t => {
  await t.countDough();
  await t.next();
  const water = () => t.card('Aquafina Water, Bottled', t.sheet());
  await t.click('Count it', water());
  assert.equal(t.button('Save', water()).disabled, true, 'nothing typed, nothing to save');
  await t.type('Aquafina Water, Bottled: cases', '1', t.sheet());
  await t.type('Aquafina Water, Bottled: bottles', '3', t.sheet());
  await t.click('Save', water());
  assert.match(water().textContent, /✓ 1 case \+ 3 bottles counted here/);
  await t.saved('water');
  assert.equal(t.line('water').qtyUnits, 27);
  assert.equal(t.line('water').enteredCases, 1);
  assert.equal(t.line('water').caseSizeAtEntry, 24);
  assert.equal(t.line('water').zoneId, 'freezer');
  await t.click('None left', t.card('Giant Pretzel', t.sheet()));
  assert.equal(t.sheet().querySelector('.lq-fc-sheet-h').textContent, 'All answered');
  await t.click('Next zone ›', t.sheet());
  assert.match(t.zoneName(), /Kitchen Cooler/);
});

await run('"Remove from zone": counted where it is now, listed there before it comes off here', async t => {
  await t.countDough();
  await t.next();
  const pretzel = () => t.card('Giant Pretzel', t.sheet());
  await t.click('Remove from zone', pretzel());
  assert.deepEqual(t.chips(pretzel()), ['Kitchen Cooler', 'Walk in Cooler', '+ New spot'], 'the zone being left is not offered');
  await t.click('Walk in Cooler', pretzel());
  await t.type('Giant Pretzel: packs', '4', t.sheet());
  await t.click('Save', pretzel());
  await until(() => /Moved to/.test(pretzel().textContent), 'The move');
  assert.match(pretzel().textContent, /✓ Moved to Walk in Cooler · 4 packs counted in Walk in Cooler\. Off this zone's list from now on\./);
  assert.deepEqual(t.memberCalls('pretzel'), [{zoneId:'walkin', usual:true}, {zoneId:'freezer', usual:false}],
    'added to its new zone before it comes off this one');
  await t.saved('pretzel');
  assert.equal(t.line('pretzel').zoneId, 'walkin');
  assert.equal(t.line('pretzel').qtyUnits, 4);
  await t.click('Skip 1, next zone ›', t.sheet());
  await t.prev();
  const rows = [...t.doc.querySelectorAll('.lq-fc-grid .lq-fc-row-name')].map(e => e.getAttribute('title'));
  assert.ok(!rows.includes('Giant Pretzel'), 'the freezer no longer lists it');
});

await run('a failed zone-list update keeps the count and says what did not happen', async t => {
  await t.countDough();
  await t.next();
  t.qa.memberFail = true;
  const pretzel = () => t.card('Giant Pretzel', t.sheet());
  await t.click('Remove from zone', pretzel());
  await t.click('Kitchen Cooler', pretzel());
  await t.type('Giant Pretzel: packs', '4', t.sheet());
  await t.click('Save', pretzel());
  await until(() => /✓/.test(pretzel().textContent), 'The answer');
  assert.match(pretzel().textContent, /4 packs counted in Kitchen Cooler\. Couldn't add it to that zone's list, so Finish will ask where it lives\./);
  assert.deepEqual(t.memberCalls('pretzel'), [{zoneId:'cooler', usual:true}], 'never taken off here when the add failed');
  await t.saved('pretzel');
  assert.equal(t.line('pretzel').zoneId, 'cooler');
});

await run('Back stays and asks again; Skip goes on and the zone does not ask twice', async t => {
  await t.countDough();
  await t.next();
  await t.click('Back to Pizza Freezer', t.sheet());
  assert.equal(t.sheet(), null);
  assert.match(t.zoneName(), /Pizza Freezer/);
  await t.next();
  assert.ok(t.sheet(), 'Back is not a skip: leaving again asks again');
  await t.click('Skip 2, next zone ›', t.sheet());
  assert.equal(t.sheet(), null);
  assert.match(t.zoneName(), /Kitchen Cooler/);
  await t.prev();
  assert.equal(t.sheet(), null, 'the cooler has nothing counted, so it does not ask');
  assert.match(t.zoneName(), /Pizza Freezer/);
  await t.next();
  assert.equal(t.sheet(), null, 'a skipped zone does not ask twice');
  assert.match(t.zoneName(), /Kitchen Cooler/);
});

await run('an untouched location never asks, and the native selector asks on a touched shelf', async t => {
  await t.next();
  assert.equal(t.sheet(), null);
  assert.match(t.zoneName(), /Kitchen Cooler/);
  await t.prev();
  await t.countDough();
  await t.chooseLocation('walkin');
  assert.ok(t.sheet(), 'the location selector asks too');
  await t.click('Skip 2, on to Walk in Cooler ›', t.sheet());
  assert.match(t.zoneName(), /Walk in Cooler/);
});

await run('a voice take still being read pins the location and never opens the sheet', async t => {
  await t.countDough();
  await t.click(/Talk through/);
  await t.click(/Stop & review/);
  assert.ok(t.doc.querySelector('select.lq-fc-location-select').disabled);
  assert.equal(t.sheet(), null);
  assert.match(t.zoneName(), /Pizza Freezer/);
}, 'walk&pausecuts=0');

// ── + New spot ──
await run('+ New spot: placed where the counter reaches it, then picked for the item', async t => {
  await t.countDough();
  await t.next();
  const pretzel = () => t.card('Giant Pretzel', t.sheet());
  await t.click('Remove from zone', pretzel());
  await t.click('+ New spot', pretzel());
  assert.ok(t.spotSheet(), 'the new-spot sheet opens on top');
  const select = t.spotSheet().querySelector('select');
  assert.equal(select.value, 'freezer', 'defaults to after the zone the counter is on');
  assert.deepEqual([...select.options].map(o => o.textContent),
    ['First, before Pizza Freezer', 'After Pizza Freezer', 'After Kitchen Cooler', 'After Walk in Cooler']);
  assert.equal(t.button('Add spot', t.spotSheet()).disabled, true, 'a spot needs a name');
  t.setValue(t.spotSheet().querySelector('input'), "  Table by Pete's oven ");
  t.setValue(select, 'cooler');
  await pause();
  await t.click('Add spot', t.spotSheet());
  await until(() => !t.spotSheet(), 'The new-spot sheet closing');
  const post = t.qa.calls.find(c => c.path.endsWith('/admin/bar/zones') && c.method === 'POST');
  assert.deepEqual(t.plain(post.body), {name:"Table by Pete's oven", section:'food', afterZoneId:'cooler'});
  assert.deepEqual(t.chips(pretzel()), ['Kitchen Cooler', "Table by Pete's oven (new)", 'Walk in Cooler', '+ New spot'],
    'in the walk where the counter said, after the Kitchen Cooler');
  const chip = [...pretzel().querySelectorAll('.lq-fc-chip')].find(b => /Pete/.test(b.textContent));
  assert.equal(chip.getAttribute('aria-pressed'), 'true', 'picked for the item that asked');
  assert.equal(t.doc.querySelector('.lq-fc-toast')?.textContent, "Added “Table by Pete's oven” to the walk");
  assert.equal(t.sheet().querySelector('.lq-fc-sheet-zone-k').textContent, 'Leaving zone 1 of 4');
  await t.type('Giant Pretzel: packs', '1', t.sheet());
  await t.click('Save', pretzel());
  await until(() => /Moved to Table by Pete's oven/.test(pretzel().textContent), 'The move');
  const spotId = t.memberCalls('pretzel')[0].zoneId;
  assert.match(spotId, /^spot-/, 'listed on the new spot');
  await t.saved('pretzel');
  assert.equal(t.line('pretzel').zoneId, spotId, 'and counted there');
});

await run('a name already on the walk picks that zone instead of making a second', async t => {
  await t.countDough();
  await t.next();
  const water = () => t.card('Aquafina Water, Bottled', t.sheet());
  await t.click('Remove from zone', water());
  await t.click('+ New spot', water());
  t.setValue(t.spotSheet().querySelector('input'), 'walk in cooler');
  await pause();
  await t.click('Add spot', t.spotSheet());
  await until(() => !t.spotSheet(), 'The new-spot sheet closing');
  assert.equal([...water().querySelectorAll('.lq-fc-chip')].find(b => b.textContent.trim() === 'Walk in Cooler').getAttribute('aria-pressed'), 'true');
  assert.match(t.doc.querySelector('.lq-fc-toast').textContent, /already on the walk, so it's picked/);
  assert.equal(t.chips(water()).length, 3, 'no second zone');
});

await run('a spot that cannot be added says so and keeps the sheet open', async t => {
  await t.countDough();
  await t.next();
  t.qa.zoneFail = true;
  const water = () => t.card('Aquafina Water, Bottled', t.sheet());
  await t.click('Remove from zone', water());
  await t.click('+ New spot', water());
  t.setValue(t.spotSheet().querySelector('input'), 'Dry storage');
  await pause();
  await t.click('Add spot', t.spotSheet());
  await until(() => t.spotSheet()?.querySelector('.lq-error'), 'The error');
  assert.match(t.spotSheet().querySelector('.lq-error').textContent, /Couldn't add it/);
  assert.equal(t.button('Add spot', t.spotSheet()).disabled, false, 'it can be tried again');
});

// ── things we think you have ──
await run('before Submit: what we think you have, with why, and Submit is never blocked', async t => {
  await t.countDough();
  await t.finish();
  assert.ok(t.have(), 'the list shows');
  assert.equal(t.have().querySelector('.lq-fc-rev-h').textContent, '2 things we think you have');
  assert.equal(t.card('Guacamole', t.have()).querySelector('.lq-fc-q-why').textContent,
    'Bought from Sysco Oct 2 · in a recipe · not in any zone yet');
  assert.equal(t.card('Cookies, Chocolate Chip, 1 oz', t.have()).querySelector('.lq-fc-q-why').textContent,
    'Used in a recipe · not in any zone yet');
  await t.click('Submit the count (2 unanswered)');
  await until(() => t.qa.calls.some(c => c.path.endsWith('/submit')), 'Submit');
});

await run('"Yes, it\'s here": a zone and a count, and that zone lists it from now on', async t => {
  await t.countDough();
  await t.finish();
  const guac = () => t.card('Guacamole', t.have());
  await t.click('Yes, it’s here', guac());
  assert.deepEqual(t.chips(guac()), ['Pizza Freezer', 'Kitchen Cooler', 'Walk in Cooler', '+ New spot']);
  await t.click('Walk in Cooler', guac());
  await t.type('Guacamole: cases', '1', t.have());
  await t.click('Save', guac());
  await until(() => /✓/.test(guac().textContent), 'The answer');
  assert.match(guac().textContent, /✓ 1 case · Walk in Cooler\. It'll be on that zone's list from now on\./);
  assert.deepEqual(t.memberCalls('guac'), [{zoneId:'walkin', usual:true}]);
  await t.saved('guac');
  assert.equal(t.line('guac').zoneId, 'walkin');
  assert.equal(t.line('guac').qtyUnits, 12);
  assert.equal(t.have().querySelector('.lq-fc-rev-h').textContent, '1 thing we think you have');
  assert.ok(t.button('Submit the count (1 unanswered)'));
});

await run('"None left": a zero, on the zone picked (then listed there) or where the counter stands', async t => {
  await t.countDough();
  await t.finish();
  const cookies = () => t.card('Cookies, Chocolate Chip, 1 oz', t.have());
  await t.click('None left', cookies());
  assert.match(cookies().textContent, /Where does it go when we have it\? \(optional\)/);
  await t.click('Save', cookies());
  assert.match(cookies().textContent, /✓ None left · 0 counted$/);
  await t.saved('cookies');
  assert.equal(t.line('cookies').qtyUnits, 0);
  assert.equal(t.line('cookies').zoneId, 'freezer', 'no zone picked: the zone the counter is standing in');
  assert.deepEqual(t.memberCalls('cookies'), [], 'a zero lists nothing');
  const guac = () => t.card('Guacamole', t.have());
  await t.click('None left', guac());
  await t.click('Kitchen Cooler', guac());
  await t.click('Save', guac());
  await until(() => /✓/.test(guac().textContent), 'The answer');
  assert.match(guac().textContent, /✓ None left · 0 counted · lives in Kitchen Cooler/);
  assert.deepEqual(t.memberCalls('guac'), [{zoneId:'cooler', usual:true}]);
  await t.saved('guac');
  assert.equal(t.line('guac').zoneId, 'cooler');
  assert.equal(t.have().querySelector('.lq-fc-rev-h').textContent, 'All set');
  assert.ok(t.button('Submit the count'));
});

await run('"We stopped buying it" discontinues it', async t => {
  await t.countDough();
  await t.finish();
  const guac = () => t.card('Guacamole', t.have());
  await t.click('We stopped buying it', guac());
  await until(() => /✓/.test(guac().textContent), 'The answer');
  assert.match(guac().textContent, /✓ Off the order guides\. If any turns up, it can still be counted\./);
  const patch = t.qa.calls.find(c => c.path.endsWith('/skus/guac/discontinued'));
  assert.deepEqual(t.plain([patch.method, patch.body]), ['PATCH', {discontinued:true, replacedBySkuId:null}]);
  assert.equal(t.line('guac'), undefined, 'no count is written');
});

await run('past the cap: "Show 1 more"', async t => {
  await t.countDough();
  await t.finish();
  assert.equal(t.have().querySelector('.lq-fc-rev-h').textContent, '3 things we think you have');
  assert.equal(t.have().querySelectorAll('.lq-fc-q').length, 2);
  await t.click('Show 1 more', t.have());
  assert.equal(t.have().querySelectorAll('.lq-fc-q').length, 3);
  assert.equal(t.card('Unknown Package', t.have()).querySelector('.lq-fc-q-why').textContent,
    'Bought from Webstaurant Sep 20 · not in any zone yet');
}, 'walk&many');

await run('a server without the list: the submit panel is exactly as before', async t => {
  await t.countDough();
  await t.finish();
  assert.equal(t.have(), null);
  assert.ok(t.button('Submit the count'));
}, 'plain');

console.log(`${passed}/20 walk-location scenarios passed`);
