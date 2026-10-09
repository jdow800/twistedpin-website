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
    await until(() => doc.querySelector('.lq-count-entry') || (query.includes('no-zones')
      ? [...doc.querySelectorAll('button')].some(b => /Record count for/.test(b.textContent))
      : doc.querySelectorAll('.lq-zone').length === 2), 'Count entry');
    if (doc.querySelector('.lq-count-entry')) {
      [...doc.querySelectorAll('button')].find(b => b.textContent.trim()==='Continue count').click();
      await until(() => !doc.querySelector('.lq-count-entry'), 'Continued count');
    }
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
    const stop = () => click(/Stop & review/);
    const segment = async (text,index) => { qa.recorder.segment(text,index); await pause(); };
    const finish = async text => { qa.recorder.finish(text); await pause(); };
    const finishButton = () => button(/^(Finish count|Stop recording first|Processing…|Review heard items)$/);
    const saves = () => qa.calls.filter(c => c.path.endsWith('/lines')).length;
    /** One take: Start, a segment heard and matched, Stop, recorder delivers. */
    const hear = async entries => {
      await start(); await segment('Test bottle, one.',0); qa.extracts.at(-1).succeed(entries); await pause();
      await stop(); await finish('test transcript');
      await until(() => doc.querySelector('.lq-sheet'), 'Review sheet');
    };
    const input = async (selector, value) => {
      const el = doc.querySelector(selector); assert.ok(el, `Missing input: ${selector}`); el.focus();
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);
      el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      el.dispatchEvent(new dom.window.Event('change',{bubbles:true})); el.blur(); await pause();
    };
    const pickSearch = async name => {
      const b = [...doc.querySelectorAll('.lq-rev-assign button')].find(b=>b.textContent.includes(name));
      assert.ok(b, `Missing search result: ${name}`); b.click(); await pause();
    };
    const changeBottle = async () => {const pill=doc.querySelector('.lq-rev-chosen');assert.ok(pill,'selected bottle can be changed');pill.click();await pause();};
    await test({qa,doc,button,click,tile,shelf,start,stop,segment,finish,finishButton,saves,hear,input,pickSearch,changeBottle});
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
  assert.ok(t.button('Processing…')?.disabled,'Finish stays blocked after Stop');
  assert.equal(t.doc.querySelector('.lq-voice-processing')?.dataset.phase,'transcribing');
  assert.equal(t.doc.querySelector('.lq-rec-stop'),null,'Stop cannot be tapped twice');
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
  assert.equal(t.finishButton().textContent.trim(),'Finish count');
  assert.ok(!t.finishButton().disabled);
  await t.shelf('Well');
  await t.start();
  assert.ok(t.finishButton().disabled,'RED before this change: Finish was live over a recording');
  assert.equal(t.finishButton().textContent.trim(),'Stop recording first');
  await t.segment('Titos, two.',0);
  t.qa.extracts[0].succeed([item('titos',2)]); await pause();
  await t.stop();
  assert.ok(t.finishButton().disabled,'still processing after Stop');
  await t.finish('two titos');
  await until(() => t.doc.querySelector('.lq-sheet'),'Review sheet');
  assert.ok(t.finishButton().disabled,'the heard items are not in the count yet');
  await t.click('Add 1 to Well');
  assert.ok(!t.finishButton().disabled);
  await t.click('Finish count');
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
  await t.start();
  assert.ok(t.button(/Stop & review/) && !t.button(/Stop & review/).disabled,'the next take can still be stopped');
  await t.stop();
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
  t.doc.querySelector('button[aria-label="increase Jameson Irish Whiskey"]').click(); await pause(); // Jameson 2 → 3
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
  await t.click('Finish count');
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
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  const names = () => [...t.doc.querySelectorAll('.lq-confirm .lq-precheck-name')].map(e => e.textContent);
  assert.equal(names().length,6,'the cap still decides what opens');
  assert.doesNotMatch(t.doc.querySelector('.lq-confirm').textContent,/more not shown/);
  await t.click('Show 3 more');
  assert.deepEqual(names(),Array.from({length:9},(_,i) => `Missing bottle ${i+1}`),'all nine, in money order');
  assert.equal(t.button(/^Show \d+ more$/),undefined,'the tap goes away once used');
}, 'many-findings');

await run('a server without the extra findings keeps the old "+N more not shown" line',async t => {
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  assert.match(t.doc.querySelector('.lq-confirm').textContent,/\+ 3 more not shown\./);
  assert.equal(t.button(/^Show \d+ more$/),undefined);
}, 'many-findings-old');

await run('a bottle under the wrong size asks once, names both causes and never says recount',async t => {
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  const row = t.doc.querySelector('.lq-confirm .lq-precheck-row');
  assert.equal(row.querySelector('.lq-precheck-name').textContent,'Tanqueray London Dry Gin (750 ml + 1 L)');
  assert.equal(row.querySelector('.lq-finding-evidence').textContent,'The 750 ml count rose 0.5 with none delivered, while the 1 L count fell 1. Was a 1 L bottle entered as a 750 ml, or is a delivery missing?');
  assert.match(row.querySelector('.lq-finding-question').textContent,/Check bottle sizes and the delivery entry\./);
  assert.equal(row.querySelector('.lq-finding-numbers'),null,'a size mixup has narrative evidence, not placeholder history');
  assert.doesNotMatch(row.textContent,/recount/i);
}, 'size-mixup');

await run('a check that cannot run stops to say so instead of submitting straight through',async t => {
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  const dialog = t.doc.querySelector('.lq-confirm');
  assert.match(dialog.querySelector('.lq-h2').textContent,/The check couldn't run/);
  assert.match(dialog.textContent,/Nothing was checked/);
  assert.ok(t.button('Submit anyway'));
  assert.ok(!t.qa.calls.some(c => c.path.endsWith('/submit')),'nothing submitted until the counter says so');
}, 'check-fails');

await run('a count that changed after the check is checked again, not closed on the old review',async t => {
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  await t.click('Submit anyway');
  const prechecks = () => t.qa.calls.filter(c => c.path.endsWith('/precheck')).length;
  await until(() => prechecks() === 2 && t.doc.querySelector('.lq-confirm'),'Checked again');
  const submits = t.qa.calls.filter(c => c.path.endsWith('/submit'));
  assert.equal(submits.length,1);
  assert.equal(submits[0].body.checkedLinesHash,'check1','submit named the check the counter read');
  assert.equal(submits[0].body.checkedBatchesHash,'batches0');
  assert.match(t.doc.querySelector('.lq-confirm').textContent,/this is a fresh check/i);
  await t.click('Submit anyway');
  await until(() => t.qa.calls.filter(c => c.path.endsWith('/submit')).length === 2,'Second submit');
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit'))[1].body.checkedLinesHash,'check2');
}, 'recheck');

await run('a refused Submit says the counts saved, instead of claiming Save failed',async t => {
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  await t.click('Submit anyway');
  await until(() => /Count saved\. Couldn't submit it/.test(t.doc.querySelector('.lq-footer').textContent),'Submit error');
  assert.doesNotMatch(t.doc.querySelector('.lq-footer').textContent,/Save failed|Not saved/);
  assert.equal(t.qa.lines.length,1);
  assert.ok(t.button('Finish count'));
}, 'submit-rejected');

await run('a lost successful Submit response is recovered without another write',async t => {
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  await t.click('Submit anyway');
  await until(() => /Count submitted/.test(t.doc.body.textContent),'Recovered submission');
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit')).length,1);
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/counts/liquor-draft')).length,1);
}, 'submit-lost');

await run('a lost Submit that is still a draft keeps the saved quantities and offers Finish again',async t => {
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  await t.click('Submit anyway');
  await until(() => /Count saved\. Couldn't submit it/.test(t.doc.querySelector('.lq-footer').textContent),'Open draft');
  assert.equal(t.qa.lines.length,1);
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit')).length,1);
  assert.doesNotMatch(t.doc.body.textContent,/Count submitted/);
}, 'submit-draft');

await run('an unknown Submit outcome pauses writes until Check submission can read the count',async t => {
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  await t.click('Submit anyway');
  await until(() => t.doc.querySelector('[aria-label="Check submission"]'),'Unknown outcome');
  assert.match(t.doc.querySelector('[aria-label="Check submission"]').textContent,/Your counts were saved/);
  const writes = () => t.qa.calls.filter(c => c.method !== 'GET').length;
  const before = writes();
  await t.click('Check submission');
  await until(() => /Still couldn't reach/.test(t.doc.body.textContent),'Status read failure');
  assert.equal(writes(),before,'recovery only reads');
  t.qa.detailFails = false;
  await t.click('Check submission');
  await until(() => /Count submitted/.test(t.doc.body.textContent),'Recovered on retry');
  assert.equal(writes(),before);
}, 'submit-unknown');

await run('a failed save blocks Submit and Retry save persists the quantities',async t => {
  await t.shelf('Back Bar');
  t.doc.querySelector('button[aria-label="increase Jameson Irish Whiskey"]').click(); await pause();
  await t.click('Finish count');
  await until(() => t.button('Retry save'),'Save failed with action');
  assert.match(t.doc.querySelector('.lq-footer').textContent,/Not saved yet/);
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit')).length,0);
  t.qa.failSave = false;
  await t.click('Retry save');
  await until(() => /Saved ✓/.test(t.doc.querySelector('.lq-footer').textContent),'Save recovered');
  assert.equal(Number(t.qa.lines[0].qtyUnits),3);
}, 'save-fails');

await run('Retry check runs the advisory again and does not submit',async t => {
  await t.click('Finish count');
  await until(() => t.doc.querySelector('.lq-confirm'),'Submit check');
  await t.click('Retry check');
  await until(() => t.qa.calls.filter(c => c.path.endsWith('/precheck')).length===2 && t.doc.querySelector('.lq-confirm'),'Check retried');
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit')).length,0);
}, 'check-fails');

for(const query of ['', 'pausecuts=0'])await run(`failed audio boundary cannot join a bottle name to the next clip (${query||'pause cuts'})`,async t=>{
  await t.shelf('Well');await t.start();await t.segment('Titos,',0);
  if(!query)assert.equal(t.qa.extracts.length,0);
  t.qa.recorder.fail(1);await pause();await until(()=>t.qa.extracts.length===1);
  assert.equal(t.qa.extracts[0].body.transcript,'Titos,');
  t.qa.extracts[0].succeed([{...item('titos',0),spoken:'Titos,',quantityKnown:false}]);
  await t.segment('Jameson, one.',2);await t.stop();await t.finish('Titos, two. Jameson, one.');
  await until(()=>t.qa.extracts.length===2);assert.equal(t.qa.extracts[1].body.transcript,'Jameson, one.');
  t.qa.extracts[1].succeed([{...item('jameson',1),spoken:'Jameson, one.'}]);await until(()=>t.doc.querySelector('.lq-sheet'));
  assert.match(t.doc.body.textContent,/couldn.t be processed|missing/i);assert.ok(!t.button(/Try text again/i));
  await t.click(/^Add 1 to /);await until(()=>t.qa.lines.some(l=>l.skuId==='jameson'&&l.zoneId==='well'));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='jameson'&&l.zoneId==='well').qtyUnits),1);assert.ok(!t.qa.lines.some(l=>l.skuId==='titos'));
},query);
for(const query of ['', 'pausecuts=0'])await run(`wholly failed audio cannot replay a joined transcript (${query||'pause cuts'})`,async t=>{
  await t.shelf('Well');await t.start();t.qa.recorder.fail(0);await pause();await t.stop();await t.finish('Titos, two.');await pause();await pause();
  assert.equal(t.qa.extracts.length,0);assert.equal(t.saves(),0);assert.match(t.doc.body.textContent,/missing/i);assert.ok(!t.button(/Try text again/i));
},query);

await run('a source-grounded decimal has one quantity field and a green matched bottle', async t => {
  await t.hear([{...item('titos',.8),spoken:'Titos, point eight',quantityWords:'point eight',quantityNeedsReview:false}]);
  const row=t.doc.querySelector('.lq-rev');
  assert.equal(row.querySelector('input[type=number]').value,'0.8');
  assert.ok(row.querySelector('.lq-rev-chosen').classList.contains('lq-chip-on'));
  assert.equal(row.querySelectorAll('.lq-rev-hint').length,0,'an ordinary matched row has no extra review instructions');
  assert.doesNotMatch(row.textContent,/Heard quantity:|Check the heard|Matched bottle:|Change bottle/);
  assert.ok(!t.button('Add 1 to Well').disabled);
});

for(const answer of ['0.7','0']) await run(`a guessed one is blank until the counter enters ${answer}`, async t => {
  await t.hear([{...item('titos',1),spoken:'Titos',quantityNeedsReview:true}]);
  assert.equal(t.doc.querySelector('.lq-rev input[type=number]').value,'');
  assert.ok(t.doc.querySelector('.lq-rev-chosen').classList.contains('lq-chip-on'));
  assert.ok(t.button('Add 0 to Well').disabled);
  await t.input('.lq-rev input[type=number]',answer);
  await t.click('Add 1 to Well');
  await until(()=>t.qa.lines.some(l=>l.skuId==='titos'&&l.zoneId==='well'));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='titos'&&l.zoneId==='well').qtyUnits),Number(answer));
});

await run('source-grounded zero is displayed and saves as an observed empty bottle', async t => {
  await t.hear([{...item('titos',0),spoken:'Titos, zero',quantityWords:'zero',quantityNeedsReview:false}]);
  assert.equal(t.doc.querySelector('.lq-rev input[type=number]').value,'0');
  assert.ok(t.doc.querySelector('.lq-rev-chosen').classList.contains('lq-chip-on'));
  await t.click('Add 1 to Well');
  await until(()=>t.qa.lines.some(l=>l.skuId==='titos'&&l.zoneId==='well'));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='titos'&&l.zoneId==='well').qtyUnits),0);
});

await run('Indigo gin stays together across uploads and shows the decimal beside one green product', async t => {
  await t.start();
  await t.segment('Dos Hombres, mezcal, point three. Indigo, gin,',0);
  await until(()=>t.qa.extracts.length===1);
  assert.equal(t.qa.extracts[0].body.transcript,'Dos Hombres, mezcal, point three.');
  await t.segment('Point six',1);
  await until(()=>t.qa.extracts.length===2);
  assert.equal(t.qa.extracts[1].body.transcript,'Indigo, gin, Point six');
  t.qa.extracts[1].succeed([{...item('indigo',.6),spoken:'Indigo, gin, Point six',quantityWords:'Point six',quantityNeedsReview:false}]);
  t.qa.extracts[0].succeed([{...item('mezcal',.3),spoken:'Dos Hombres, mezcal, point three',quantityWords:'point three',quantityNeedsReview:false}]);
  await t.stop();await t.finish('Dos Hombres, mezcal, point three. Indigo, gin, Point six');
  await until(()=>t.doc.querySelectorAll('.lq-rev').length===2);
  const rows=[...t.doc.querySelectorAll('.lq-rev')];
  const indigo=rows.find(r=>r.querySelector('.lq-rev-chosen').textContent.includes('Empress'));
  assert.equal(indigo.querySelector('input[type=number]').value,'0.6');
  assert.equal(rows.filter(r=>r.textContent.includes('Empress')).length,1);
  assert.ok(rows.every(r=>r.querySelector('.lq-rev-chosen').classList.contains('lq-chip-on')));
  assert.doesNotMatch(t.doc.querySelector('.lq-sheet').textContent,/Heard quantity:|Check the heard/);
  await t.click('Add 2 to Well');
  await until(()=>t.qa.lines.some(l=>l.skuId==='indigo'&&l.zoneId==='well'));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='indigo'&&l.zoneId==='well').qtyUnits),.6);
},'indigo');

await run('quantity review retains the bottle and changing it cannot confirm the number', async t => {
  await t.hear([{...item('titos',0.6),spoken:'Titos, point six',quantityWords:'point six',quantityNeedsReview:true}]);
  assert.match(t.doc.querySelector('.lq-rev-chosen').textContent,/Tito/);
  assert.ok(t.doc.querySelector('.lq-rev-chosen').classList.contains('lq-chip-on'),'green means the bottle is matched');
  assert.equal(t.doc.querySelector('.lq-rev input[type="number"]').value,'','unproved model number is not displayed as a heard count');
  assert.doesNotMatch(t.doc.querySelector('.lq-rev').textContent,/Heard quantity:|Check the heard number|Matched bottle:/);
  assert.ok(!t.button('Change bottle…'),'the green pill is the product editor');
  assert.ok(t.button('Add 0 to Well').disabled);
  await t.changeBottle();
  await t.input('.lq-rev-search','jameson 1l'); await t.pickSearch('Jameson');
  assert.match(t.doc.querySelector('.lq-rev-chosen').textContent,/Jameson/);
  assert.equal(t.doc.querySelector('.lq-rev input[type="number"]').value,'');
  assert.ok(t.button('Add 0 to Well').disabled,'product pick cannot answer the number');
  await t.input('.lq-rev input[type="number"]','');
  await t.input('.lq-rev input[type="number"]','0.6');
  assert.ok(t.doc.querySelector('.lq-rev-chosen').classList.contains('lq-chip-on'));
  await t.click('Add 1 to Well'); await until(()=>t.qa.lines.some(l=>l.skuId==='jameson'&&l.zoneId==='well'));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='jameson'&&l.zoneId==='well').qtyUnits),0.6);
  assert.ok(!t.qa.lines.some(l=>l.skuId==='titos'));
});

await run('the green bottle pill opens an editor and the new identity is saved', async t => {
  await t.hear([item('titos',0.6)]);
  await t.click(/^✓ Tito/); assert.ok(t.doc.querySelector('.lq-rev-search'));
  await t.input('.lq-rev-search','Jameson'); await t.pickSearch('Jameson');
  assert.ok(!t.doc.querySelector('.lq-rev-search'),'selection closes the editor');
  assert.match(t.doc.querySelector('.lq-rev-chosen').textContent,/Jameson/);
  await t.click('Add 1 to Well'); await until(()=>t.qa.lines.some(l=>l.skuId==='jameson'&&l.zoneId==='well'));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='jameson'&&l.zoneId==='well').qtyUnits),0.6);
});

await run('incorrect candidates have a catalog escape and the chosen product stays visible', async t => {
  await t.hear([{...item('titos',0.3),match:null,quantityNeedsReview:true,candidates:[{id:'titos',name:"Tito's Handmade Vodka",sizeMl:1000}]}]);
  await t.click('Find bottle…'); await t.input('.lq-rev-search','Jameson'); await t.pickSearch('Jameson');
  assert.match(t.doc.querySelector('.lq-rev-chosen').textContent,/Jameson/);
  assert.ok(t.doc.querySelector('.lq-rev-chosen'),'choice remains editable');
  assert.ok(t.button('Add 0 to Well').disabled);
  await t.changeBottle(); await t.input('.lq-rev-search','Tito'); await t.pickSearch('Tito');
  assert.match(t.doc.querySelector('.lq-rev-chosen').textContent,/Tito/);
  assert.ok(t.button('Add 0 to Well').disabled);
});

await run('candidate pick remains visible during quantity review', async t => {
  await t.hear([{...item('titos',0.3),match:null,quantityNeedsReview:true,candidates:[{id:'titos',name:"Tito's Handmade Vodka",sizeMl:1000}]}]);
  await t.click(/^Tito.*1000ml/);
  assert.match(t.doc.querySelector('.lq-rev-chosen').textContent,/Tito/);
  assert.equal(t.doc.querySelector('.lq-rev input[type="number"]').value,'');
  assert.ok(t.doc.querySelector('.lq-rev-chosen').classList.contains('lq-chip-on'));
  assert.ok(t.button('Add 0 to Well').disabled);
});

await run('manual search reports no matches and can be cancelled without changing the bottle', async t => {
  await t.hear([item('titos',0.8)]); await t.changeBottle();
  await t.input('.lq-rev-search','Unknown bottle');
  assert.match(t.doc.querySelector('.lq-rev-assign').textContent,/No bottles found/);
  await t.click('Cancel bottle search'); assert.ok(!t.doc.querySelector('.lq-rev-search'));
  assert.match(t.doc.querySelector('.lq-rev-chosen').textContent,/Tito/);
  assert.ok(!t.button('Add 1 to Well').disabled);
});

for (const [name,row,query,warning] of [
  ['case size',{...item('titos',0),cases:1,unitsPerCase:null,needsCaseSize:true},'',/how many in a case/],
  ['name number',{...item('seagrams',7.9),match:{id:'seagrams',name:"Seagram's 7",sizeMl:1000}},'seagrams',/part of the name/],
  ['history',item('titos',100),'history',/far above anything on record/],
]) await run(`${name} question retains working bottle correction`, async t=>{
  await t.hear([row]);assert.match(t.doc.querySelector('.lq-rev').textContent,warning);
  assert.ok(t.doc.querySelector('.lq-rev-chosen'));
  await t.changeBottle();assert.ok(t.doc.querySelector('.lq-rev-search'));
  assert.match(t.doc.querySelector('.lq-rev').textContent,warning);
},query);

for(const firstAnswer of ['Recount: 0.6','More: 2.6 total']) await run(`changing bottle reopens ${firstAnswer} despite equal earlier counts`,async t=>{
  await t.hear([item('titos',.6)]);await t.click(firstAnswer);
  assert.ok(!t.button('Add 1 to Well').disabled);
  await t.changeBottle();await t.input('.lq-rev-search','Jameson');await t.pickSearch('Jameson');
  assert.ok(t.button('Recount: 0.6'),'new bottle asks its own earlier-take question');
  assert.ok(t.button('More: 2.6 total'));
  assert.ok(t.button('Add 0 to Well').disabled,'old answer must not apply to another bottle');
  await t.click('Recount: 0.6');await t.click('Add 1 to Well');
  await until(()=>t.qa.lines.some(l=>l.skuId==='jameson'&&l.zoneId==='well'&&Number(l.qtyUnits)===.6));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='titos'&&l.zoneId==='well').qtyUnits),2);
},'equal-prior');

for(const change of ['pick','remove'])await run(`${change} on an earlier row restores a later bottle's recount question`,async t=>{
  await t.hear([item('titos',3),item('jameson',1),item('titos',4)]);
  if(change==='pick'){
    await t.changeBottle();await t.input('.lq-rev-search','Jameson');await t.pickSearch('Jameson');
  }else{
    t.doc.querySelector('.lq-rev .lq-rev-x').click();await pause();
  }
  const last=[...t.doc.querySelectorAll('.lq-rev')].at(-1);
  assert.match(last.textContent,/2 already counted on Well/);
  assert.ok([...last.querySelectorAll('button')].some(b=>b.textContent.trim()==='Recount: 4'));
  assert.ok(t.button('Add 0 to Well').disabled,'later rows cannot skip the newly restored decision');
},'equal-prior');

// The API deliberately preserves source-held components and duplicate source
// questions. Read-back must not merge them again, even at a piece boundary.
const provedCase = () => ({...item('titos',0),spoken:'Titos, one case',cases:1,qty:12,quantityNeedsReview:false});
const heldLoose = (units=999) => ({...item('titos',units),spoken:'Titos, unclear loose count',quantityNeedsReview:true});
for (const reversed of [false,true]) for (const cross of [false,true]) await run(`held mixed component stays separate (${reversed?'case first':'loose first'}, ${cross?'two requests':'same response'})`,async t=>{
  await t.shelf('Well');
  const rows=reversed?[provedCase(),heldLoose()]:[heldLoose(),provedCase()];
  if(cross){
    await t.start();
    for(let i=0;i<2;i++){
      await t.segment(rows[i].cases>0?'Titos, one case.':'Titos, three seventy-eight point nine.',i);
      assert.equal(t.qa.extracts.length,i+1);
      t.qa.extracts[i].succeed([rows[i]]);await pause();
    }
    await t.stop();await t.finish('two controlled pieces');await until(()=>t.doc.querySelectorAll('.lq-rev').length===2);
  }else await t.hear(rows);
  assert.equal(t.doc.querySelectorAll('.lq-rev').length,2);
  assert.ok(t.button('Add 1 to Well')&&!t.button('Add 1 to Well').disabled);
  await t.click('Add 1 to Well');await until(()=>t.qa.lines.some(l=>l.skuId==='titos'&&Number(l.qtyUnits)===12));
  assert.equal(t.doc.querySelectorAll('.lq-rev').length,1);
  assert.equal(t.doc.querySelector('.lq-rev input[type=number]').value,'');
  assert.ok(t.button('Add 0 to Well').disabled,'held amount was not saved');
  assert.equal(t.qa.lines.find(l=>l.skuId==='titos').enteredCases,1);
});
for(const reversed of [false,true])await run(`source-already-used question cannot replace the valid count (${reversed?'duplicate first':'duplicate last'})`,async t=>{
  await t.shelf('Well');const valid={...item('titos',2),quantityNeedsReview:false};
  const duplicate={...valid,quantityNeedsReview:true,quantityReviewReason:'source_already_used'};
  await t.hear(reversed?[duplicate,valid]:[valid,duplicate]);
  assert.equal(t.doc.querySelectorAll('.lq-rev').length,2);
  await t.click('Add 1 to Well');await until(()=>t.qa.lines.some(l=>l.skuId==='titos'&&Number(l.qtyUnits)===2));
  assert.equal(t.doc.querySelectorAll('.lq-rev').length,1);
  assert.equal(t.doc.querySelector('.lq-rev input[type=number]').value,'');
  assert.ok(t.button('Add 0 to Well').disabled);
});
await run('held model history is excluded, then human answers contribute normally',async t=>{
  await t.shelf('Well');await t.hear([heldLoose(),provedCase()]);
  assert.equal(t.doc.querySelectorAll('.lq-rev').length,2);
  assert.doesNotMatch(t.doc.querySelectorAll('.lq-rev')[1].textContent,/far above/);
  assert.ok(!t.button('Add 1 to Well').disabled);
  await t.input('.lq-rev input[type=number]','40');
  assert.match(t.doc.querySelectorAll('.lq-rev')[1].textContent,/52 in all is far above/,'completed human count participates');
  await t.input('.lq-rev input[type=number]','2');
  assert.doesNotMatch(t.doc.querySelector('.lq-sheet').textContent,/far above/);
  await t.input('.lq-rev input[type=number]','40');
  assert.match(t.doc.querySelectorAll('.lq-rev')[1].textContent,/52 in all is far above/);
  await t.click('Keep 12');
  assert.doesNotMatch(t.doc.querySelector('.lq-sheet').textContent,/far above/);
  await t.input('.lq-rev input[type=number]','40');
  assert.doesNotMatch(t.doc.querySelector('.lq-sheet').textContent,/far above/,'same answer cannot reopen accepted warning');
  await t.input('.lq-rev input[type=number]','2');
  await t.click('Add 2 to Well');await until(()=>t.qa.lines.some(l=>l.skuId==='titos'&&Number(l.qtyUnits)===14));
},'history');
await run('editing another bottle cannot reopen a confirmed history warning',async t=>{
  await t.shelf('Well');await t.hear([item('jameson',1),item('titos',60)]);
  await t.click('Keep 60');assert.doesNotMatch(t.doc.querySelector('.lq-sheet').textContent,/far above/);
  await t.input('.lq-rev input[type=number]','2');
  assert.doesNotMatch(t.doc.querySelector('.lq-sheet').textContent,/far above/);
  assert.ok(!t.button('Add 2 to Well').disabled);
},'history');
await run('proved earlier rows still contribute to a later history warning',async t=>{
  await t.shelf('Well');await t.hear([{...item('titos',30),quantityNeedsReview:false},item('jameson',1),provedCase()]);
  assert.match([...t.doc.querySelectorAll('.lq-rev')].at(-1).textContent,/42 in all is far above/);
  assert.ok(!t.button('Add 2 to Well').disabled);
},'history');
await run('saved counts in another shelf still contribute to history',async t=>{
  await t.shelf('Back Bar');await t.hear([{...item('titos',30),quantityNeedsReview:false}]);
  await t.click('Add 1 to Back Bar');await until(()=>t.qa.lines.some(l=>l.skuId==='titos'&&l.zoneId==='backbar'&&Number(l.qtyUnits)===30));
  await t.shelf('Well');await t.hear([provedCase()]);
  assert.match(t.doc.querySelector('.lq-rev').textContent,/42 in all is far above/);
  assert.ok(t.button('Add 0 to Well').disabled);
  await t.click('Keep 12');await t.click('Add 1 to Well');
  await until(()=>t.qa.lines.some(l=>l.skuId==='titos'&&l.zoneId==='well'&&Number(l.qtyUnits)===12));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='titos'&&l.zoneId==='backbar').qtyUnits),30);
},'history');

console.log(`${passed} liquor voice scenarios passed${failed.length ? `, ${failed.length} failed` : ''}`);
if (failed.length) process.exitCode = 1;
