import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

// The actual CountLiquor component and API client, with synthetic bottles,
// deferred extraction responses and a controlled recorder boundary.
const bundle = await readFile(new URL('./dist/liquor-voice-fixture.js',import.meta.url),'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve,20));
const until = async (predicate, what = 'Liquor UI condition') => {
  for (let i=0;i<200;i++) { if (predicate()) return; await pause(); }
  throw new Error(`${what} timed out`);
};
const item = (id, units) => ({
  spoken:`${units} ${id}`, cases:0, units, qty:units, unitsPerCase:12, needsCaseSize:false,
  suspectPreMultiplied:false, match:{id, name:id, sizeMl:1000}, candidates:[],
});
let passed = 0;
const failed = [];
async function run(name, test, query = '') {
  try { await scenario(name, test, query); } catch (e) { failed.push(name); console.log('FAIL', name, '—', e.message); }
}
async function scenario(name, test, query) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/${query ? '?'+query : ''}`,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.Response = Response;
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  try {
    dom.window.eval(bundle);
    const doc = dom.window.document;
    await until(() => query.includes('no-zones')
      ? [...doc.querySelectorAll('button')].some(b => /Record count for/.test(b.textContent))
      : doc.querySelectorAll('.lq-zone').length === 2, 'Count screen');
    const qa = dom.window.liquorQa;
    const button = text => [...doc.querySelectorAll('button')].find(b => typeof text==='string'?b.textContent.trim()===text:text.test(b.textContent.trim()));
    const click = async text => {
      const b = button(text);
      assert.ok(b,`Missing button: ${text}`);
      assert.ok(!b.disabled,`Button unexpectedly disabled: ${text}`);
      b.click(); await pause();
    };
    const tile = name => [...doc.querySelectorAll('.lq-zone')].find(b => b.querySelector('.lq-zone-name')?.textContent===name);
    const shelf = async name => { const t = tile(name); assert.ok(t && !t.disabled, `Shelf tile unavailable: ${name}`); t.click(); await pause(); };
    const start = () => click(/Record count for/);
    const stop = () => click(/Stop & process/);
    const segment = async (text,index) => { qa.recorder.segment(text,index); await pause(); };
    const finish = async text => { qa.recorder.finish(text); await pause(); };
    const finishButton = () => button(/^(Finish & submit|Finish the recording first|Reading the recording back…|Add or discard the heard bottles first)$/);
    const saves = () => qa.calls.filter(c => c.path.endsWith('/lines')).length;
    /** One take: Start, a segment heard and matched, Stop, recorder delivers. */
    const hear = async entries => {
      await start(); await segment('Test bottle, one.',0); qa.extracts.at(-1).succeed(entries); await pause();
      await stop(); await finish('test transcript');
      await until(() => doc.querySelector('.lq-sheet'), 'Review sheet');
    };
    await test({qa,doc,button,click,tile,shelf,start,stop,segment,finish,finishButton,saves,hear});
    passed++; console.log('PASS',name);
  } finally { dom.window.close(); }
}

await run('recording asks the transcriber for the bar section and the shelf in front of the counter',async t => {
  await t.shelf('Well');
  await t.start();
  // Field by field: the options object lives in the jsdom realm.
  assert.equal(t.qa.recorder.options.scope?.section,'bar','RED before this change: no scope at all');
  assert.equal(t.qa.recorder.options.scope?.zoneId,'well');
});

await run('shelf tiles hold still while the mic is live, and free up after Stop',async t => {
  await t.shelf('Well');
  await t.start();
  assert.ok(t.tile('Back Bar').disabled,'a take is one shelf');
  await t.stop();
  assert.ok(!t.tile('Back Bar').disabled,'after Stop the take\'s shelf is pinned, so walking on is safe');
  assert.ok(t.button('Processing recording…')?.disabled,'Stop cannot be tapped twice');
});

await run('a take lands on the shelf it started on, even with another tile selected at Apply',async t => {
  await t.shelf('Well');
  await t.start();
  await t.segment('Titos, three.',0);
  t.qa.extracts[0].succeed([item('titos',3)]); await pause();
  await t.stop();
  // Walking on to the next shelf while the take is read back — the
  // everyday case, and the one that filed a take on the wrong shelf.
  await t.shelf('Back Bar');
  await t.finish('three titos');
  await until(() => t.doc.querySelector('.lq-sheet'),'Review sheet');
  const before = t.saves();
  await t.click(/^Add 1 to /);
  await until(() => t.saves() > before,'Save after Apply');
  const titos = t.qa.lines.filter(l => l.skuId==='titos');
  assert.equal(titos.length,1);
  assert.equal(titos[0].zoneId,'well','RED before this change: Apply wrote the take to the selected Back Bar');
  assert.equal(Number(titos[0].qtyUnits),3);
  // Uploads after the tile change (the recorder's retries) stayed biased to
  // the take's shelf, not the one selected since.
  assert.equal(t.qa.recorder.options.scope?.zoneId,'well');
});

await run('the review sheet names the shelf the take will be added to',async t => {
  await t.shelf('Well');
  await t.start(); await t.segment('Titos, one.',0);
  t.qa.extracts[0].succeed([item('titos',1)]); await pause();
  await t.stop();
  await t.shelf('Back Bar');
  await t.finish('one titos');
  await until(() => t.doc.querySelector('.lq-sheet'),'Review sheet');
  assert.match(t.doc.querySelector('.lq-sheet-head').textContent,/Going to Well/);
  assert.ok(t.button('Add 1 to Well'),'the Apply button names the real destination');
});

await run('Finish waits for the recording, the read-back and the review',async t => {
  assert.equal(t.finishButton().textContent.trim(),'Finish & submit');
  assert.ok(!t.finishButton().disabled);
  await t.shelf('Well');
  await t.start();
  assert.ok(t.finishButton().disabled,'RED before this change: Finish was live over a recording');
  assert.equal(t.finishButton().textContent.trim(),'Finish the recording first');
  await t.segment('Titos, two.',0);
  t.qa.extracts[0].succeed([item('titos',2)]); await pause();
  await t.stop();
  assert.ok(t.finishButton().disabled,'still processing after Stop');
  await t.finish('two titos');
  await until(() => t.doc.querySelector('.lq-sheet'),'Review sheet');
  assert.ok(t.finishButton().disabled,'the heard items are not in the count yet');
  await t.click('Add 1 to Well');
  assert.ok(!t.finishButton().disabled);
  await t.click('Finish & submit');
  await until(() => t.qa.calls.some(c => c.path.endsWith('/submit')),'Submit');
  const submitted = t.qa.lines.find(l => l.skuId==='titos');
  assert.equal(Number(submitted?.qtyUnits),2,'the spoken bottles reached the count before submit');
});

await run('Discard releases Finish, and a second take waits for the first one\'s review',async t => {
  await t.shelf('Well');
  await t.hear([item('titos',1)]);
  assert.ok(t.button(/Record count for/).disabled,'one outstanding take at a time');
  assert.ok(t.finishButton().disabled);
  await t.click('Discard');
  assert.ok(!t.finishButton().disabled);
  assert.ok(!t.button(/Record count for/).disabled);
  assert.equal(t.qa.lines.filter(l => l.skuId==='titos').length,0,'a discarded take saves nothing');
});

await run('the recorder ending on its own (mic denied) frees the tiles, Record and Finish',async t => {
  await t.shelf('Well');
  await t.start();
  assert.ok(t.tile('Back Bar').disabled);
  await t.finish('', 'not-allowed'); // no Stop tap: the recorder gave up by itself
  await until(() => !t.tile('Back Bar').disabled,'Shelf tiles released after the recorder ended');
  assert.ok(!t.button(/Record count for/).disabled);
  assert.ok(!t.finishButton().disabled);
});

await run('a recorder that never reports recording cannot latch the shelf tiles',async t => {
  await t.shelf('Well');
  await t.click(/Record count for/); // start() is a no-op in this fixture
  assert.ok(!t.tile('Back Bar').disabled,'tiles lock only while a take is really recording');
}, 'silent-start');

await run('before any shelf has loaded, a take sends no shelf id at all',async t => {
  await t.start();
  assert.equal(t.qa.recorder.options.scope?.section,'bar');
  assert.equal(t.qa.recorder.options.scope?.zoneId,undefined,'an empty id fails the server uuid check on every upload');
}, 'no-zones');

await run('pause cuts: pieces are matched in spoken order, and an unfinished bottle leads the next piece',async t => {
  await t.shelf('Well');
  await t.start();
  // The second piece finishes transcribing first: it waits for the first.
  await t.segment('Point eight. Cointreau, point three.',1);
  assert.equal(t.qa.extracts.length,0,'a piece is matched only after the one before it');
  await t.segment('Malibu, one point one. Bacardi,',0);
  assert.deepEqual(Array.from(t.qa.extracts, e => e.body.transcript),
    ['Malibu, one point one.','Bacardi, Point eight. Cointreau, point three.']);
  // A bottle left without its number when Stop comes is sent on its own.
  await t.segment("Tito's, one. Jameson,",2);
  await t.stop(); await t.finish('whole take');
  assert.deepEqual(Array.from(t.qa.extracts.slice(2), e => e.body.transcript),["Tito's, one.",'Jameson,']);
  t.qa.extracts.forEach(e => e.succeed([item('titos',1)]));
  await until(() => t.doc.querySelector('.lq-sheet'),'Review sheet');
});

await run('with the off-switch (?pausecuts=0), each piece is matched as it lands, as before',async t => {
  await t.shelf('Well');
  await t.start();
  await t.segment('Point eight.',1);
  assert.deepEqual(Array.from(t.qa.extracts, e => e.body.transcript),['Point eight.']);
}, 'pausecuts=0');

await run("a count that matches the bottle's name number asks before it can be added",async t => {
  await t.shelf('Well');
  const seagrams = {...item('seagrams',7.9), spoken:"Seagram's, seven point nine", match:{id:'seagrams', name:"Seagram's 7", sizeMl:1000}};
  await t.hear([seagrams, item('titos',2)]);
  const sheet = t.doc.querySelector('.lq-sheet');
  assert.match(sheet.textContent,/is the 7 part of the name/);
  assert.match(sheet.textContent,/1 ready · 1 need a tap/,'7.9 cannot be added until answered');
  await t.click('0.9');
  assert.match(t.doc.querySelector('.lq-sheet').textContent,/2 ready/);
  const before = t.saves();
  await t.click(/^Add 2 to Well$/);
  await until(() => t.saves() > before,'Save after Apply');
  const line = t.qa.lines.find(l => l.skuId === 'seagrams');
  assert.equal(Number(line?.qtyUnits ?? 0),0.9,'the answered 0.9, not the heard 7.9');
}, 'seagrams');

// Jon's phone pass, 2026-10-02: a screen loaded before an edit made elsewhere
// saved its stale copy over that edit. Now the save is refused and merged.
await run('a save refused because the count changed elsewhere keeps both changes',async t => {
  await t.shelf('Back Bar');
  t.doc.querySelector('button[aria-label="increase"]').click(); await pause(); // Jameson 2 → 3
  const puts = () => t.qa.calls.filter(c => c.path.endsWith('/lines'));
  await until(() => puts().length >= 2,'refused save, then the merge');
  assert.equal(puts()[0].body.baseHash,'server1','built on the draft it loaded');
  assert.equal(puts()[1].body.baseHash,'server2','the merge is built on the draft as it is now');
  const sent = Object.fromEntries(Array.from(puts()[1].body.lines, l => [`${l.zoneId}:${l.skuId}`, Number(l.qtyUnits)]));
  assert.deepEqual(sent,{'backbar:jameson':3,'well:titos':7},'my Jameson and their Tito\'s');
  await until(() => /included a change made elsewhere/.test(t.doc.body.textContent),'Merge notice');
  await t.shelf('Well');
  assert.ok(t.doc.querySelector('button[aria-label="remove Tito\'s Handmade Vodka"]'),'the screen shows the other edit');
}, 'stale');

// The fixture starts with 2 Jameson already on the Back Bar.
await run("the grid's remove button still clears the bottle on the selected shelf",async t => {
  await t.shelf('Back Bar');
  const x = t.doc.querySelector('button[aria-label="remove Jameson Irish Whiskey"]');
  assert.ok(x,'the counted bottle has its remove button');
  x.click(); await pause();
  await until(() => !t.doc.querySelector('button[aria-label="remove Jameson Irish Whiskey"]'),'Row removed');
  await until(() => t.saves() > 0,'Save after remove');
  assert.equal(t.qa.lines.filter(l => l.skuId === 'jameson').length,0,'nothing left of it');
});

await run('a bottle said again on the same shelf asks: a recount replaces the earlier take',async t => {
  await t.shelf('Back Bar');
  await t.hear([item('jameson',3), item('titos',1)]);
  const sheet = () => t.doc.querySelector('.lq-sheet').textContent;
  assert.match(sheet(),/2 already counted on Back Bar from an earlier take\. Did you just recount those, or find more\?/);
  assert.match(sheet(),/1 ready · 1 need a tap/,'not added until answered');
  await t.click('Recount: 3');
  assert.match(sheet(),/Replaces the earlier 2 on Back Bar\./);
  const before = t.saves();
  await t.click(/^Add 2 to Back Bar$/);
  await until(() => t.saves() > before,'Save after Apply');
  const jameson = t.qa.lines.filter(l => l.skuId === 'jameson');
  assert.deepEqual(Array.from(jameson, l => Number(l.qtyUnits)),[3],'3, not 2 + 3');
});

await run('"find more" adds to the earlier take and is not asked again at submit',async t => {
  await t.shelf('Back Bar');
  await t.hear([item('jameson',3)]);
  await t.click('More: 5 total');
  const before = t.saves();
  await t.click(/^Add 1 to Back Bar$/);
  await until(() => t.saves() > before,'Save after Apply');
  assert.equal(Number(t.qa.lines.find(l => l.skuId === 'jameson')?.qtyUnits),5);
  await t.click('Finish & submit');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  assert.doesNotMatch(t.doc.querySelector('.lq-confirm').textContent,/voice added/,'already answered on the sheet');
});

await run("a count far above the bottle's 90-day record asks before it can be added",async t => {
  await t.shelf('Well');
  await t.hear([item('titos',60), item('jameson',2)]);
  const sheet = () => t.doc.querySelector('.lq-sheet').textContent;
  assert.match(sheet(),/60 in all is far above anything on record for Tito's Handmade Vodka \(largest count 3, largest delivery 12, last 90 days\)/);
  assert.match(sheet(),/1 ready · 1 need a tap/,'60 cannot be added until answered');
  await t.click('Keep 60');
  assert.match(sheet(),/2 ready/);
  const before = t.saves();
  await t.click(/^Add 2 to Well$/);
  await until(() => t.saves() > before,'Save after Apply');
  assert.equal(Number(t.qa.lines.find(l => l.skuId === 'titos')?.qtyUnits),60,'kept as said');
}, 'history');

await run('an ordinary count of a bottle with history does not ask',async t => {
  await t.shelf('Well');
  await t.hear([item('titos',14)]);
  assert.doesNotMatch(t.doc.querySelector('.lq-sheet').textContent,/far above/);
  assert.ok(t.button('Add 1 to Well'));
}, 'history');

await run('the submit check opens with six findings, and "Show 3 more" reveals the rest',async t => {
  await t.click('Finish & submit');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  const names = () => [...t.doc.querySelectorAll('.lq-confirm .lq-precheck-name')].map(e => e.textContent);
  assert.equal(names().length,6,'the cap still decides what opens');
  assert.doesNotMatch(t.doc.querySelector('.lq-confirm').textContent,/more not shown/);
  await t.click('Show 3 more');
  assert.deepEqual(names(),Array.from({length:9},(_,i) => `Missing bottle ${i+1}`),'all nine, in money order');
  assert.equal(t.button(/^Show \d+ more$/),undefined,'the tap goes away once used');
}, 'many-findings');

await run('a server without the extra findings keeps the old "+N more not shown" line',async t => {
  await t.click('Finish & submit');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  assert.match(t.doc.querySelector('.lq-confirm').textContent,/\+ 3 more not shown\./);
  assert.equal(t.button(/^Show \d+ more$/),undefined);
}, 'many-findings-old');

await run('a bottle under the wrong size asks once, names both causes and never says recount',async t => {
  await t.click('Finish & submit');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  const row = t.doc.querySelector('.lq-confirm .lq-precheck-row');
  assert.equal(row.querySelector('.lq-precheck-name').textContent,'Tanqueray London Dry Gin (750 ml + 1 L)');
  assert.equal(row.querySelector('.lq-precheck-detail').textContent,'The 750 ml count rose 0.5 with none delivered, while the 1 L count fell 1. Was a 1 L bottle entered as a 750 ml, or is a delivery missing?');
  assert.match(row.querySelector('.lq-precheck-why').textContent,/Check the size printed on the open bottles\. If each bottle really is the size it says, submit as-is\./);
  assert.doesNotMatch(row.textContent,/recount/i);
}, 'size-mixup');

await run('a check that cannot run stops to say so instead of submitting straight through',async t => {
  await t.click('Finish & submit');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  const dialog = t.doc.querySelector('.lq-confirm');
  assert.match(dialog.querySelector('.lq-h2').textContent,/The check couldn't run/);
  assert.match(dialog.textContent,/Nothing was checked/);
  assert.ok(t.button('Submit anyway'));
  assert.ok(!t.qa.calls.some(c => c.path.endsWith('/submit')),'nothing submitted until the counter says so');
}, 'check-fails');

console.log(`${passed} liquor voice scenarios passed${failed.length ? `, ${failed.length} failed` : ''}`);
if (failed.length) process.exitCode = 1;
