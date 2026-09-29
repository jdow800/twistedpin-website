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
async function run(name, test) {
  try { await scenario(name, test); } catch (e) { failed.push(name); console.log('FAIL', name, '—', e.message); }
}
async function scenario(name, test) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.Response = Response;
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  try {
    dom.window.eval(bundle);
    const doc = dom.window.document;
    await until(() => doc.querySelectorAll('.lq-zone').length === 2, 'Shelf tiles');
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
    const finishButton = () => button(/^(Finish & submit|Finish the recording first)$/);
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

console.log(`${passed} liquor voice scenarios passed${failed.length ? `, ${failed.length} failed` : ''}`);
if (failed.length) process.exitCode = 1;
