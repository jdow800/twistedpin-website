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
      await start(); await segment('test transcript',0); qa.extracts.at(-1).succeed(entries); await pause();
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
  await t.segment('three titos',0);
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
  await t.start(); await t.segment('one titos',0);
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
  await t.segment('two titos',0);
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
}, 'pausecuts=1');

await run('without the switch, each piece is matched as it lands, as before',async t => {
  await t.shelf('Well');
  await t.start();
  await t.segment('Point eight.',1);
  assert.deepEqual(Array.from(t.qa.extracts, e => e.body.transcript),['Point eight.']);
});

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

console.log(`${passed} liquor voice scenarios passed${failed.length ? `, ${failed.length} failed` : ''}`);
if (failed.length) process.exitCode = 1;
