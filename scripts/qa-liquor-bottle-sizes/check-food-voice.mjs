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
    url:`http://localhost/${typeof existing==='string'?'?'+existing:existing?'?existing':''}`,runScripts:'outside-only',pretendToBeVisual:true,
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
    const input = async (label,value) => {
      const el = [...doc.querySelectorAll('input')].find(el => el.getAttribute('aria-label')===label);
      assert.ok(el,`Missing input: ${label}`);
      el.focus();
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);
      el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
      el.blur(); await pause();
    };
    const hear = async entries => {
      await start(); await segment('test transcript',0); qa.extracts.at(-1).succeed(entries); await pause();
      await stop(); await finish('test transcript');
    };
    await test({qa,doc,button,click,start,stop,segment,finish,review,apply,saved,input,hear});
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

await run('implausible 30 cases of Aquafina offers 30 bottles and waits for confirmation',async t => {
  await t.hear([item('water',0,{spoken:'30 cases of Aquafina',cases:30,unitsPerCase:24})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  assert.match(t.doc.body.textContent,/largest count 48/);
  assert.equal(t.saved().length,0);
  await t.click('Use 30 bottles');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,30);
  assert.ok(!t.qa.lines[0].enteredCases);
});

await run('an unusual but deliberate case count remains available',async t => {
  await t.hear([item('water',0,{spoken:'30 cases of Aquafina',cases:30,unitsPerCase:24})]);
  await t.click('Keep as entered');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,720);
  assert.equal(t.qa.lines[0].enteredCases,30);
});

await run('four packets need their contents; confirmed 25 per packet saves 100 each',async t => {
  await t.hear([item('circles',4,{spoken:'four packets of pizza circles',spokenUnit:'packet'})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  await t.input('Package size for Cardboard Pizza Circle 14"','25');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,100);
  assert.match(t.qa.lines[0].rawUtterance,/four packets/);
});

await run('five glove boxes convert to half a case only after ten boxes per case is answered',async t => {
  await t.hear([item('gloves',5,{spoken:'five boxes of gloves',spokenUnit:'box'})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  await t.input('Package size for Glove, Vinyl, Extra Large','10');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,0.5);
  assert.ok(!t.qa.lines[0].enteredCases);
});

await run('a bare fraction asks whether the counter meant cases or packs',async t => {
  await t.hear([item('rice',0.9,{spoken:'Spanish rice point nine',spokenUnit:null})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  await t.click('0.9 cases'); await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,5.4);
});

await run('choosing a candidate recomputes its case conversion instead of retaining an unknown multiplier',async t => {
  await t.hear([item('unknown',0,{spoken:'two cases of pretzels',cases:2,match:null,
    candidates:[{id:'pretzel',name:'Giant Pretzel',unitsPerCase:8,sizeMl:null}]})]);
  await t.click('Giant Pretzel'); await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,16);
});

await run('a real one-pack case accepts one and preserves the fractional case',async t => {
  await t.hear([item('unknown',0,{spoken:'half a case of pepperoni',cases:0.5})]);
  await t.input('Units per case for Unknown Package','1');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,0.5);
  assert.equal(t.qa.lines[0].caseSizeAtEntry,1);
  assert.equal(t.qa.lines[0].enteredCases,0.5);
});

await run('a missing quantity stays unresolved until entered',async t => {
  await t.hear([item('dough',0,{spoken:'pizza dough',quantityKnown:false})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  await t.input('Loose quantity for Pizza Dough','2');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,2);
});

await run('explicit spoken zero is a real answer',async t => {
  await t.hear([item('dough',0,{spoken:'zero pizza dough',quantityKnown:true})]);
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,0);
});

await run('a wholly failed take can retry its transcript without another recording',async t => {
  await t.start(); await t.segment('two dough',0); t.qa.extracts[0].fail('Model temporarily unavailable');
  await t.stop(); await t.finish('two dough');
  await t.click('Retry reading this transcript');
  assert.equal(t.qa.extracts.length,2);
  assert.equal(t.qa.extracts[1].body.transcript,'two dough');
  t.qa.extracts[1].succeed([item('dough',2)]); await until(() => t.review().length===1);
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,2);
});

await run('applying a successful segment never enables a full retry that would count it twice',async t => {
  await t.start(); await t.segment('two dough',0); await t.segment('three pretzels',1);
  t.qa.extracts[0].succeed([item('dough',2)]); t.qa.extracts[1].fail('Model temporarily unavailable');
  await t.stop(); await t.finish('two dough. three pretzels');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.button('Retry reading this transcript'),undefined);
  assert.equal(t.qa.lines[0].qtyUnits,2);
});

await run('resumed pack provenance survives editing another item',async t => {
  await t.hear([item('pretzel',3)]); await t.apply(); await until(() => t.saved().length>0);
  const line=t.qa.lines.find(l => l.skuId==='dough');
  assert.equal(line.qtyUnits,8); assert.equal(line.enteredPacks,1); assert.equal(line.packSizeAtEntry,6);
},'packs');

await run('a new case size never revalues cases already counted',async t => {
  await t.hear([item('dough',0,{spoken:'one case of dough',cases:1,unitsPerCase:20})]);
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines[0].qtyUnits,44);
  assert.equal(t.qa.lines[0].enteredCases,2);
  assert.equal(t.qa.lines[0].caseSizeAtEntry,12);
},'frozen');

await run('manually editing a voice count labels the saved line as grid',async t => {
  await t.hear([item('dough',2)]); await t.apply(); await until(() => t.saved().length>0);
  await t.input('Pizza Dough: loose packs','3');
  await until(() => t.qa.lines[0]?.qtyUnits===3);
  assert.equal(t.qa.lines[0].source,'grid');
});

await run('remembered bags and bare buns keep their distinct quantities',async t => {
  await t.hear([
    item('buns',48,{spoken:'48 buns',spokenUnit:'bun'}),
    item('buns',3,{spoken:'3 bags of buns',spokenUnit:'bags'}),
  ]);
  assert.ok(!t.button(/^Add .*Pizza Freezer/).disabled);
  assert.doesNotMatch(t.doc.body.textContent,/How many.*bag/);
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='buns').qtyUnits,84);
},'definitions');

await run('mixed plate cases and bags save ten bags without another package question',async t => {
  await t.hear([item('plates',2,{spoken:'two cases and two bags of plates',cases:2,spokenUnit:'bag'})]);
  await t.apply(); await until(() => t.saved().length>0);
  const line=t.qa.lines.find(l=>l.skuId==='plates');
  assert.equal(line.qtyUnits,10);assert.equal(line.enteredCases,2);assert.equal(line.caseSizeAtEntry,4);
},'definitions');

await run('confirmed dough range permits normal stock and fractional cases',async t => {
  await t.hear([
    item('dough',0,{spoken:'fifteen cases of dough',cases:15}),
    item('dough',0,{spoken:'four and a half cases of dough',cases:4.5}),
  ]);
  assert.ok(!t.button(/^Add .*Pizza Freezer/).disabled,'normal operating range must not require a generic high-count override');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits,19.5);
},'definitions');

await run('changed package invalidates remembered bag size',async t => {
  await t.hear([item('buns',3,{spoken:'three bags of buns',spokenUnit:'bag'})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  assert.equal(t.saved().length,0);
},'definitions&changed-package');

await run('bare fruit remains each and exceptional explicit cases need confirmation',async t => {
  await t.hear([item('fruit',12,{spoken:'fruit twelve'})]);
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='fruit').qtyUnits,12);
  await t.hear([item('fruit',0,{spoken:'five cases of fruit',cases:5})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  assert.match(t.doc.body.textContent,/exceeds the usual 4 cases/);
  assert.equal(t.qa.lines.find(l=>l.skuId==='fruit').qtyUnits,12,'warning must not silently rewrite stock');
},'definitions');

console.log(`${passed} food voice scenarios passed.`);
