import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const bundle = await readFile(new URL('./dist/food-fixture.js',import.meta.url),'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve,20));
const until = async predicate => {
  for (let i=0;i<150;i++) { if (predicate()) return; await pause(); }
  throw new Error('Food UI condition timed out');
};
const item = (id, units, extra = {}) => ({
  spoken:`${units} ${id}`, cases:0, units, qty:units, unitsPerCase:id==='dough'?20:id==='pretzel'?8:null,
  needsCaseSize:false, suspectPreMultiplied:false, match:{id,name:id==='dough'?'Pizza Dough':id==='pretzel'?'Giant Pretzel':'Unknown Package',sizeMl:null}, candidates:[], ...extra,
});
let passed = 0;
async function run(name, test, existing = false) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>',{
    url:`http://localhost/${existing?'?existing':''}`,runScripts:'outside-only',pretendToBeVisual:true,
  });
  dom.window.Response = Response;
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  try {
    dom.window.eval(bundle);
    const doc = dom.window.document;
    await until(() => doc.querySelector('.lq-fc-row'));
    const qa = dom.window.foodQa;
    const button = text => [...doc.querySelectorAll('button')].find(b => typeof text==='string'?b.textContent.trim()===text:text.test(b.textContent.trim()));
    const click = async text => {
      const b = button(text);
      assert.ok(b,`Missing button: ${text}`);
      assert.ok(!b.disabled,`Button unexpectedly disabled: ${text}`);
      b.click(); await pause();
    };
    const start = () => click(/Talk through/);
    const stop = () => click(/Stop 0:00/);
    const segment = async (text,index) => { qa.recorder.segment(text,index); await pause(); };
    const finish = async text => { qa.recorder.finish(text); await pause(); };
    const review = () => [...doc.querySelectorAll('.lq-fc-rev-spoken')].map(e => e.textContent);
    const apply = () => click(/^Add .*Pizza Freezer|^Add .*Kitchen Cooler/);
    const saved = () => qa.calls.filter(c => c.path.endsWith('/lines'));
    await test({qa,doc,button,click,start,stop,segment,finish,review,apply,saved});
    passed++; console.log('PASS',name);
  } finally { dom.window.close(); }
}

await run('extraction starts during recording; review and save wait for Stop and Apply',async t => {
  await t.start();
  await t.segment('two dough',0);
  assert.equal(t.qa.extracts.length,1,'matching must begin before Stop');
  assert.equal(t.qa.extracts[0].body.section,'food');
  assert.equal(t.qa.recorder.options.scope.section,'food');
  assert.equal(t.qa.recorder.options.scope.zoneId,'freezer');
  t.qa.extracts[0].succeed([item('dough',2)]); await pause();
  assert.equal(t.review().length,0,'no review while capture is live');
  assert.equal(t.saved().length,0,'background results must not save stock');
  await t.stop();
  await t.finish('two dough');
  assert.equal(t.qa.extracts.length,1,'do not extract the whole transcript again');
  assert.equal(t.review().length,1);
  assert.equal(t.saved().length,0,'review still needs Apply');
  await t.apply();
  await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.length,1);
  assert.equal(t.qa.lines[0].qtyUnits,2);
  assert.equal(t.qa.lines[0].zoneId,'freezer');
});

await run('late uploads and responses preserve spoken order and original shelf',async t => {
  await t.start();
  await t.segment('three pretzels',1);
  await t.segment('two dough',0);
  t.qa.extracts[0].succeed([item('pretzel',3)]); await pause();
  await t.stop();
  const next=t.doc.querySelector('button[aria-label="Next shelf"]');
  assert.ok(next && !next.disabled,'shelves are available after Stop');
  next.click(); await pause();
  await t.finish('two dough three pretzels');
  assert.equal(t.review().length,0,'wait for unfinished extraction');
  assert.ok(t.button(/Talk through/).disabled,'a second take cannot replace the destination');
  t.qa.extracts[1].succeed([item('dough',2)]);
  await until(() => t.review().length===2);
  assert.match(t.review()[0],/dough/);
  assert.match(t.review()[1],/pretzel/);
  assert.equal(t.qa.extracts.length,2);
  await t.apply();
  await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.length,2);
  assert.ok(t.qa.lines.every(l => l.zoneId==='freezer'));
  assert.equal(t.qa.lines.find(l => l.skuId==='dough').qtyUnits,2);
  assert.equal(t.qa.lines.find(l => l.skuId==='pretzel').qtyUnits,3);
});

await run('partial extraction failure keeps successful items and visibly reports the gap',async t => {
  await t.start();
  await t.segment('two dough',0); await t.segment('three pretzels',1);
  t.qa.extracts[0].succeed([item('dough',2)]);
  t.qa.extracts[1].fail('Synthetic upstream failure'); await pause();
  await t.stop(); await t.finish('two dough three pretzels');
  assert.equal(t.review().length,1);
  assert.match(t.doc.body.textContent,/Part of the recording couldn't be processed/);
  assert.equal(t.qa.extracts.length,2,'no automatic full-take replay');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,2);
});

await run('complete failure preserves the server message and a new take starts clean',async t => {
  await t.start(); await t.segment('failed take',0);
  t.qa.extracts[0].fail("Voice isn't configured — type the counts instead."); await pause();
  await t.stop(); await t.finish('failed take');
  assert.match(t.doc.body.textContent,/Voice isn't configured/);
  assert.equal(t.review().length,0);
  assert.equal(t.saved().length,0);
  await t.start();
  assert.doesNotMatch(t.doc.body.textContent,/Voice isn't configured/);
  await t.segment('four pretzels',0);
  t.qa.extracts[1].succeed([item('pretzel',4)]);
  await t.stop(); await t.finish('four pretzels');
  assert.equal(t.review().length,1);
  assert.match(t.review()[0],/pretzel/);
});

await run('Web Speech fallback extracts exactly once and still requires review',async t => {
  await t.start(); await t.stop(); await t.finish('two dough');
  assert.equal(t.qa.extracts.length,1);
  assert.equal(t.qa.extracts[0].body.transcript,'two dough');
  assert.equal(t.qa.extracts[0].body.section,'food');
  t.qa.extracts[0].succeed([item('dough',2)]);
  await until(() => t.review().length===1);
  assert.equal(t.saved().length,0);
});

await run('blank take makes no extraction request and leaves the next take usable',async t => {
  await t.start(); await t.segment('   ',0);
  await t.stop(); await t.finish('');
  assert.equal(t.qa.extracts.length,0);
  assert.equal(t.review().length,0);
  assert.ok(!t.button(/Talk through/).disabled);
});

await run('a recognized transcript with no matched items gives an explicit response',async t => {
  await t.start(); await t.segment('filler only',0);
  t.qa.extracts[0].succeed([]);
  await t.stop(); await t.finish('filler only');
  assert.equal(t.review().length,0);
  assert.match(t.doc.body.textContent,/Didn't catch any items/);
});

await run('unknown case sizes remain in review instead of silently saving',async t => {
  await t.start(); await t.segment('two cases of unknown package',0);
  t.qa.extracts[0].succeed([item('unknown',0,{cases:2,needsCaseSize:true})]);
  await t.stop(); await t.finish('two cases of unknown package');
  assert.match(t.doc.body.textContent,/How many packs in a case/);
  assert.equal(t.review().length,1);
  const apply=t.button(/^Add .*Pizza Freezer/);
  assert.ok(apply.disabled);
  assert.equal(t.saved().length,0);
});

await run('an open submit panel stays blocked through recording, extraction and review',async t => {
  await t.click('Finish (1)');
  await until(() => t.button('Submit the count'));
  await t.start(); await t.segment('two more dough',0);
  assert.ok(t.button('Finish the recording first').disabled);
  await t.stop(); await t.finish('two more dough');
  assert.ok(t.button('Finish the recording first').disabled);
  t.qa.extracts[0].succeed([item('dough',2)]);
  await until(() => t.review().length===1);
  assert.ok(t.button('Finish the recording first').disabled);
  assert.ok(!t.qa.calls.some(c => c.path.endsWith('/submit')));
  await t.apply();
  await t.click('Submit the count');
  await until(() => t.qa.calls.some(c => c.path.endsWith('/submit')));
  assert.equal(t.qa.lines.find(l => l.skuId==='dough').qtyUnits,3);
  assert.equal(t.qa.calls.find(c => c.path.endsWith('/submit')).body.isFullCount,false);
},true);

console.log(`${passed} food voice scenarios passed.`);
