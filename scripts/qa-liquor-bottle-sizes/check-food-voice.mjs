import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM, VirtualConsole} from 'jsdom';

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
const failed = [];
/** The classic scenarios run with the off-switch (?pausecuts=0: one extraction
 *  per piece, as before 2026-10-02). The pause-cut scenarios pass pauseCuts. */
async function run(name, test, existing = false, pauseCuts = false) {
  if (process.env.FOOD_VOICE_QA_FILTER && !new RegExp(process.env.FOOD_VOICE_QA_FILTER).test(name)) return;
  const query = [typeof existing==='string'?existing:existing?'existing':'', pauseCuts?'':'pausecuts=0'].filter(Boolean).join('&');
  // A page reload is a navigation JSDOM does not perform; it reports one
  // instead, which is how a tap on Reload page is seen.
  const navigations = [];
  const virtualConsole = new VirtualConsole().sendTo(console, {omitJSDOMErrors:true});
  virtualConsole.on('jsdomError', e => { if (/navigation/.test(e.message)) navigations.push(e.message); else console.error(e.stack, e.detail); });
  const dom = new JSDOM('<!doctype html><div id="root"></div>',{
    url:`http://localhost/${query?'?'+query:''}`,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole,
  });
  dom.window.Response = Response;
  const voiceTimers = new Map();
  const originalSetTimeout = dom.window.setTimeout.bind(dom.window);
  const originalClearTimeout = dom.window.clearTimeout.bind(dom.window);
  dom.window.setTimeout = (fn, ms, ...args) => {
    const id = originalSetTimeout(fn, ms, ...args);
    if (ms === 60_000) voiceTimers.set(id, () => fn(...args));
    return id;
  };
  dom.window.clearTimeout = id => { voiceTimers.delete(id); originalClearTimeout(id); };
  const expireVoiceRequests = () => {
    for (const [id, fn] of [...voiceTimers]) { originalClearTimeout(id); fn(); }
  };
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  try {
    dom.window.eval(bundle);
    const doc = dom.window.document;
    await until(() => doc.querySelector('.lq-fc-row, .lq-count-entry'));
    if (doc.querySelector('.lq-count-entry')) {
      [...doc.querySelectorAll('button')].find(b => b.textContent.trim()==='Continue count').click();
      await until(() => doc.querySelector('.lq-fc-row'));
    }
    const qa = dom.window.foodQa;
    const button = text => [...doc.querySelectorAll('button')].find(b => typeof text==='string'?b.textContent.trim()===text:text.test(b.textContent.trim()));
    const click = async text => {
      const b = button(text);
      assert.ok(b,`Missing button: ${text}`);
      assert.ok(!b.disabled,`Button unexpectedly disabled: ${text}`);
      b.click(); await pause();
    };
    const start = async () => {
      // Let the previous recorder=false effect settle before the next click;
      // JSDOM otherwise races its passive effects with the synthetic new take.
      await pause();
      await click(/Talk through/);
      await until(() => button(/^■ Stop & review$/));
    };
    const stop = () => click(/^■ Stop & review$/);
    const segment = async (text,index) => { qa.recorder.segment(text,index); await pause(); };
    const finish = async text => { qa.recorder.finish(text); await pause(); };
    const review = () => [...doc.querySelectorAll('.lq-fc-rev-spoken')].map(e => e.textContent);
    const apply = () => click(/^Add \d+ items? to (?:Pizza Freezer|Kitchen Cooler)$/);
    const saved = () => qa.calls.filter(c => c.path.endsWith('/lines'));
    const input = async (label,value) => {
      let el = [...doc.querySelectorAll('input')].find(el => el.getAttribute('aria-label')===label);
      if (!el && label.startsWith('Cases for ')) {
        // These legacy checks deliberately exercise the alternative two-part
        // entry, rather than treating it as the default common review.
        await click('Count another way');
        el = [...doc.querySelectorAll('input')].find(el => el.getAttribute('aria-label')===label);
      }
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
    // Jon, 2026-10-09: "Ask: add or replace." Answers every open question on
    // the review with the named choice (Add keeps the old summing behavior).
    const restate = async (choice = 'Add') => {
      const chips = [...doc.querySelectorAll('.lq-fc-rev-restate button')].filter(b => b.textContent.trim().startsWith(choice + ':'));
      assert.ok(chips.length, `No add-or-replace question to answer with ${choice}`);
      for (const chip of chips) { chip.click(); await pause(); }
    };
    await test({qa,doc,button,click,start,stop,segment,finish,review,apply,saved,input,hear,expireVoiceRequests,restate,dom,navigations});
    passed++; console.log('PASS',name);
  } catch (error) {
    if (!process.env.FOOD_VOICE_QA_KEEP_GOING) throw error;
    failed.push(name); console.log('FAIL',name,'-',String(error?.message ?? error).split(/\r?\n/)[0]);
  } finally { dom.window.close(); }
}

await run('extraction starts during recording; review and save wait for Stop and Apply',async t => {
  await t.start();
  await t.segment('two dough',0);
  assert.equal(t.qa.extracts.length,1,'matching must begin before Stop');
  assert.equal(t.qa.extracts[0].body.section,'food');
  assert.equal(t.qa.extracts[0].body.foodUnitsVersion,6);
  assert.equal(t.qa.recorder.options.scope.section,'food');
  assert.equal(t.qa.recorder.options.scope.zoneId,'freezer');
  assert.equal(t.qa.recorder.options.pauseCuts,false,'?pausecuts=0 is the clock fallback');
  t.qa.extracts[0].succeed([item('dough',2)]); await pause();
  assert.equal(t.review().length,0,'no review while capture is live');
  assert.equal(t.saved().length,0,'background results must not save stock');
  await t.stop();
  await t.finish('two dough');
  assert.equal(t.qa.extracts.length,1,'do not extract the whole transcript again');
  assert.equal(t.review().length,1);
  assert.equal(t.saved().length,0,'review still needs Apply');
  assert.ok(t.button('Add 1 item to Pizza Freezer'));
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
  const location=t.doc.querySelector('select.lq-fc-location-select');
  assert.ok(location && location.disabled,'location stays pinned while the stopped take is processing');
  await t.finish('two dough three pretzels');
  assert.equal(t.review().length,0,'wait for unfinished extraction');
  assert.ok(t.button(/Talk through/).disabled,'a second take cannot replace the destination');
  t.qa.extracts[1].succeed([item('dough',2)]);
  await until(() => t.review().length===2);
  assert.match(t.review()[0],/dough/);
  assert.match(t.review()[1],/pretzel/);
  assert.equal(t.qa.extracts.length,2);
  assert.ok(!location.disabled,'location can be queued during completed review');
  location.value='cooler';location.dispatchEvent(new t.doc.defaultView.Event('change',{bubbles:true}));await pause();
  assert.equal(location.value,'freezer','queued switch does not change the original take location');
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
  assert.match(t.doc.body.textContent,/packs per case\?/);
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
  const checks=t.qa.calls.filter(c => c.path.endsWith('/precheck')).length;
  await t.restate('Add');
  await t.apply();
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/precheck')).length,checks,'Add after Finish cannot automatically run another precheck');
  assert.ok(!t.qa.calls.some(c => c.path.endsWith('/submit')));
  assert.ok(t.button('Submit the count').disabled,'new voice additions invalidate the earlier check');
  await t.click('Recheck count');
  await until(() => t.qa.calls.filter(c => c.path.endsWith('/precheck')).length===checks+1);
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit')).length,0);
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
  await t.input('Cases for Pizza Dough','0');
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
  await t.restate('Add');
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
  await t.restate('Add');
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
  await t.restate('Add');
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

await run('case-default fractions display as cases and save exact bag equivalents',async t => {
  await t.hear([item('fries',2.5,{spoken:'fries two and a half'})]);
  const cases=t.doc.querySelector('input[aria-label="Cases for Sample Fries"]');
  assert.equal(cases.value,'2.5');
  assert.equal(t.doc.querySelector('input[aria-label="Loose quantity for Sample Fries"]'),null);
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='fries').qtyUnits,15);
  assert.equal(t.qa.lines.find(l=>l.skuId==='fries').enteredCases,2.5);
  assert.equal(t.qa.lines.find(l=>l.skuId==='fries').caseSizeAtEntry,6);
  assert.match(t.qa.lines.find(l=>l.skuId==='fries').rawUtterance,/confirmed: 2\.5 cases/);
},'definitions');

await run('two cauliflower crusts and twelve flatbreads default to individual quantities',async t => {
  await t.hear([
    item('cauliflower',2,{spoken:'two cauliflower crusts',spokenUnit:null}),
    item('flatbread',12,{spoken:'twelve flatbreads',spokenUnit:null}),
  ]);
  for(const [name, units] of [['Cauliflower Crust',2],['Flatbread',12]]) {
    assert.equal(t.doc.querySelector(`input[aria-label="Loose quantity for ${name}"]`).value,String(units));
    assert.equal(t.doc.querySelector(`input[aria-label="Cases for ${name}"]`),null);
  }
  assert.doesNotMatch(t.doc.body.textContent,/Was .*part of a case|How many.*in one|what unit does/);
  assert.ok(t.button('Add 2 items to Pizza Freezer'));
  await t.apply(); await until(() => t.saved().length>0);
  for(const [id,qty] of [['cauliflower',2],['flatbread',12]]) {
    const line=t.qa.lines.find(l=>l.skuId===id);
    assert.equal(line.qtyUnits,qty);assert.ok(!line.enteredCases);
  }
},'definitions');

await run('half a case of crusts or flatbreads keeps fractions and canonical each totals',async t => {
  await t.hear([
    item('cauliflower',0.5,{spoken:'half a case of cauliflower crusts',spokenUnit:'case'}),
    item('flatbread',0.5,{spoken:'flatbread half a case',spokenUnit:'case'}),
  ]);
  assert.equal(t.doc.querySelector('input[aria-label="Cases for Cauliflower Crust"]').value,'0.5');
  assert.equal(t.doc.querySelector('input[aria-label="Cases for Flatbread"]').value,'0.5');
  assert.doesNotMatch(t.doc.body.textContent,/Was .*part of a case|what unit does/);
  await t.apply(); await until(() => t.saved().length>0);
  for(const [id,size,qty] of [['cauliflower',12,6],['flatbread',60,30]]) {
    const line=t.qa.lines.find(l=>l.skuId===id);
    assert.equal(line.qtyUnits,qty);assert.equal(line.enteredCases,0.5);assert.equal(line.caseSizeAtEntry,size);
    assert.match(line.rawUtterance,/confirmed: 0\.5 cases/);
  }
},'definitions');

await run('manual crust and flatbread counts allow cases plus individuals while vegetable cauliflower stays heads',async t => {
  assert.ok(t.doc.querySelector('input[aria-label="Cauliflower Crust: loose crusts"]'));
  assert.ok(t.doc.querySelector('input[aria-label="Flatbread: loose flatbreads"]'));
  assert.ok(t.doc.querySelector('input[aria-label="Cauliflower: loose heads"]'));
  await t.input('Cauliflower Crust: cases','0.5');
  await t.input('Flatbread: cases','6');
  await t.input('Cauliflower Crust: loose crusts','2');
  await t.input('Flatbread: loose flatbreads','3');
  await t.input('Cauliflower: loose heads','2');
  await until(() => t.qa.lines.length===3);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower').qtyUnits,8);
  assert.equal(t.qa.lines.find(l=>l.skuId==='flatbread').qtyUnits,363);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower-heads').qtyUnits,2);
  assert.equal(t.doc.querySelector('input[aria-label="Cauliflower Crust: cases"]').value,'0.5');
  assert.match(t.doc.querySelector('input[aria-label="Cauliflower Crust: cases"]').closest('.lq-fc-row').textContent,/Total 8 crusts/);
},'definitions');

await run('legacy loose crust stock remains separate and a case edit preserves its loose quantity',async t => {
  const field=t.doc.querySelector('input[aria-label="Cauliflower Crust: cases"]');
  assert.equal(field.value,'1');
  assert.equal(t.doc.querySelector('input[aria-label="Cauliflower Crust: loose crusts"]').value,'6');
  await t.input('Pizza Dough: loose cases','2');
  await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower').qtyUnits,18,'an unrelated save must preserve the old count');
  await t.input('Cauliflower Crust: cases','2');
  await until(() => t.qa.lines.find(l=>l.skuId==='cauliflower').qtyUnits===30);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower').enteredCases,2);
  assert.equal(field.closest('.lq-fc-row').querySelector('.lq-fc-legacy-units'),null);
},'definitions&legacy-crust');

await run('explicit individual crust and flatbread nouns save exact pieces without a case restatement',async t => {
  await t.hear([
    item('cauliflower',2,{spoken:'two individual cauliflower crusts',spokenUnit:'crust'}),
    item('flatbread',6,{spoken:'six pieces of flatbread',spokenUnit:'piece'}),
  ]);
  assert.ok(!t.button(/^Add .*Pizza Freezer/).disabled);
  assert.doesNotMatch(t.doc.body.textContent,/Enter the total in Cases/);
  assert.equal(t.doc.querySelector('input[aria-label="Loose quantity for Cauliflower Crust"]').value,'2');
  assert.equal(t.doc.querySelector('input[aria-label="Loose quantity for Flatbread"]').value,'6');
  assert.equal(t.button('2 each'),undefined);
  assert.equal(t.doc.querySelector('input[aria-label="Spoken unit for Flatbread"]'),null);
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower').qtyUnits,2);
  assert.equal(t.qa.lines.find(l=>l.skuId==='flatbread').qtyUnits,6);
},'definitions');

await run('a proven high case count of flatbread offers explicit confirmation and individual correction',async t => {
  await t.hear([item('flatbread',0,{spoken:'thirty cases of flatbread',cases:30})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  assert.ok(t.button('Use 30 flatbreads'));
  await t.click('Keep as entered');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='flatbread').qtyUnits,1800);
},'definitions');

await run('held mixed crust quantities cannot count the model multiplication twice',async t => {
  await t.hear([item('cauliflower',24,{spoken:'two cases of cauliflower crusts',cases:2,spokenUnit:null,quantityNeedsReview:true})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  assert.equal(t.doc.querySelector('input[aria-label="Loose quantity for Cauliflower Crust"]').value,'');
  assert.equal(t.saved().length,0);
  await t.click('Count another way');
  await t.input('Cases for Cauliflower Crust','2');
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  await t.input('Loose quantity for Cauliflower Crust','0');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower').qtyUnits,24);
},'definitions');

await run('a changed crust package uses its current explicit case conversion',async t => {
  assert.ok(t.doc.querySelector('input[aria-label="Cauliflower Crust: loose each"]'));
  await t.hear([item('cauliflower',0.5,{spoken:'half a case of cauliflower crusts',spokenUnit:'case'})]);
  await t.apply();await until(()=>t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower').qtyUnits,12);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower').caseSizeAtEntry,24);
},'definitions&changed-crust');

await run('a changed package never revalues the earlier crust cases while adding a new half case',async t => {
  await t.hear([item('cauliflower',0.5,{spoken:'half a case of cauliflower crusts',spokenUnit:'case'})]);
  await t.restate('Add');
  await t.apply();await until(()=>t.saved().length>0);
  const line=t.qa.lines.find(l=>l.skuId==='cauliflower');
  assert.equal(line.qtyUnits,30,'earlier 18 plus one half of the new 24-piece case');
  assert.equal(line.enteredCases,1);assert.equal(line.caseSizeAtEntry,12);
  assert.equal(t.doc.querySelector('input[aria-label="Cauliflower Crust: loose each"]').value,'18');
},'definitions&changed-crust&legacy-crust');

await run('an unknown crust case size permits manual individuals and withholds cases',async t => {
  const cases=t.doc.querySelector('input[aria-label="Cauliflower Crust: cases"]');
  assert.equal(cases,null,'unknown case multiplier is not offered as a guessed manual field');
  await t.input('Cauliflower Crust: loose crusts','6');
  await until(()=>t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower').qtyUnits,6);
  assert.ok(!t.qa.lines.find(l=>l.skuId==='cauliflower').enteredCases);
},'definitions&unknown-crust-case');

await run('an unknown crust case size blocks an explicit half case until its package is confirmed',async t => {
  await t.hear([item('cauliflower',0.5,{spoken:'half a case of cauliflower crusts',spokenUnit:'case'})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  assert.ok(t.doc.querySelector('.lq-fc-rev input[aria-label="Units per case for Cauliflower Crust"]'),'the heard crust row asks for its case size');
  assert.match(t.doc.querySelector('.lq-fc-rev').textContent,/crusts per case\?/);
  await t.input('Units per case for Cauliflower Crust','12');
  await t.apply();await until(()=>t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='cauliflower').qtyUnits,6);
},'definitions&unknown-crust-case');

await run('the dimension-named flatbread keeps its confirmed individual default',async t => {
  await t.hear([item('flatbread',6,{spoken:'six flatbreads',spokenUnit:null})]);
  assert.ok([...t.doc.querySelectorAll('input')].find(el=>el.getAttribute('aria-label')==='Flatbread, 4.5"x12": loose flatbreads'));
  assert.equal([...t.doc.querySelectorAll('input')].find(e=>e.getAttribute('aria-label')==='Loose quantity for Flatbread, 4.5"x12"').value,'6');
  await t.apply();await until(()=>t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='flatbread').qtyUnits,6);
},'definitions&dimension-flatbread');

await run('an explicitly labeled case quantity preserves a case-based item',async t => {
  await t.hear([item('dough',2.5,{spoken:'two and a half cases of dough',spokenUnit:'case'})]);
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits,2.5);
},'definitions');

await run('explicit single bags remain exact for a case-default item',async t => {
  await t.hear([item('fries',1,{spoken:'one bag of fries',spokenUnit:'bag'})]);
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='fries').qtyUnits,1);
  await t.hear([item('fries',0.5,{spoken:'fries point five'})]);
  await t.restate('Add');
  await t.apply(); await until(() => t.qa.lines.find(l=>l.skuId==='fries').qtyUnits===4);
},'definitions');

await run('correcting implausible cases to bags overrides the remembered case default',async t => {
  await t.hear([item('fries',0,{spoken:'thirty cases of fries',cases:30})]);
  await t.click('Use 30 bags');
  await t.apply(); await until(() => t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='fries').qtyUnits,30);
},'definitions');

await run('confirmed base labels do not ask how many heads in one head',async t => {
  await t.hear([item('romaine',12,{spoken:'twelve heads of romaine',spokenUnit:'heads'}),
    item('celery',3,{spoken:'three bunches of celery',spokenUnit:'bunch'})]);
  assert.doesNotMatch(t.doc.body.textContent,/How many.*head|How many.*bunch/);
  assert.equal(t.doc.querySelector('input[aria-label="Loose quantity for Sample Celery"]').value,'3');
  await t.apply();await until(()=>t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='romaine').qtyUnits,12);
  assert.equal(t.qa.lines.find(l=>l.skuId==='celery').qtyUnits,3);
},'definitions');

await run('uncertain unit blocks the default and editing only a number does not bypass it',async t => {
  await t.hear([item('celery',3,{spoken:'celery three',spokenUnit:null,unitNeedsReview:true})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  assert.match(t.doc.body.textContent,/Which unit\?/);
  await t.input('Loose quantity for Sample Celery','2');
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  assert.equal(t.saved().length,0);
  await t.click('2 bunches');await t.apply();await until(()=>t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='celery').qtyUnits,2);
},'definitions');

await run('an explicit case answer resolves an uncertain loose count exactly once',async t => {
  await t.hear([item('celery',3,{spoken:'one case of celery and three more',cases:1,spokenUnit:null,unitNeedsReview:true})]);
  await t.click('3 cases');await t.apply();await until(()=>t.saved().length>0);
  const line=t.qa.lines.find(l=>l.skuId==='celery');
  assert.equal(line.qtyUnits,12);assert.equal(line.enteredCases,4);
},'definitions');

await run('a manually named unknown unit requires its own conversion',async t => {
  await t.hear([item('celery',2,{spoken:'celery two',spokenUnit:null,unitNeedsReview:true})]);
  await t.input('Spoken unit for Sample Celery','tray');
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  await t.click('Use unit');
  assert.match(t.doc.body.textContent,/bunches per tray\?/);
  await t.input('Package size for Sample Celery','2');
  await t.apply();await until(()=>t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='celery').qtyUnits,4);
},'definitions');

await run('typing an explicit Cases quantity resolves a case-only unit question',async t => {
  await t.hear([item('dough',3,{spoken:'dough three',spokenUnit:null,unitNeedsReview:true})]);
  assert.ok(t.button(/^Add .*Pizza Freezer/).disabled);
  await t.click('3 cases');
  await t.input('Cases for Pizza Dough','2.5');
  assert.doesNotMatch(t.doc.body.textContent,/Which unit for 0\?/);
  await t.apply();await until(()=>t.saved().length>0);
  assert.equal(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits,2.5);
  assert.match(t.qa.lines.find(l=>l.skuId==='dough').rawUtterance,/confirmed: 2\.5 cases/);
},'definitions');

console.log(`${passed} food voice scenarios passed.`);

await run('a stalled segment times out, keeps successful items and ignores its late result',async t => {
  await t.start(); await t.segment('two dough',0);
  t.qa.extracts[0].succeed([item('dough',2)]); await pause();
  await t.segment('one pretzel',1); await t.stop(); await t.finish('two dough one pretzel');
  t.expireVoiceRequests(); await pause();
  assert.equal(t.review().length,1);
  assert.match(t.doc.body.textContent,/Part of the recording couldn't be processed/);
  t.qa.extracts[1].succeed([item('pretzel',1)]); await pause();
  assert.equal(t.review().length,1,'late timed-out result must not mutate the review');
  assert.equal(t.saved().length,0);
});
await run('a completely stalled take retains its transcript and can retry successfully',async t => {
  await t.start(); await t.segment('two dough',0); await t.stop(); await t.finish('two dough');
  t.expireVoiceRequests(); await pause();
  assert.match(t.doc.body.textContent,/took too long/);
  await t.click('Retry reading this transcript');
  assert.equal(t.qa.extracts[1].body.transcript,'two dough');
  t.qa.extracts[1].succeed([item('dough',2)]); await pause();
  assert.equal(t.review().length,1);
  assert.equal(t.saved().length,0);
});
console.log(`${passed} food voice UI scenarios passed including deadline recovery.`);

await run('Stop visibly enters processing, then a transcription timeout asks for missing items',async t => {
  await t.start(); await t.stop();
  assert.ok(t.button('Processing…').disabled);
  assert.equal(t.doc.querySelector('.lq-voice-processing')?.dataset.phase,'transcribing');
  assert.equal(t.doc.querySelector('.lq-rec-stop'),null);
  t.qa.recorder.finish('', 'Transcription took too long. Record the missing items again or type them.'); await pause();
  assert.match(t.doc.querySelector('[role=alert]').textContent,/Transcription took too long/);
  assert.equal(t.qa.extracts.length,0); assert.equal(t.saved().length,0);
  await t.start(); assert.equal(t.doc.querySelector('[role=alert]'),null);
});
await run('a missing audio segment is visible alongside successfully read items',async t => {
  await t.start(); await t.segment('two dough',0);t.qa.extracts[0].succeed([item('dough',2)]);await pause();await t.stop();
  t.qa.recorder.finish('two dough','Transcription took too long. Record the missing items again or type them.');await pause();
  assert.equal(t.review().length,1);assert.match(t.doc.querySelector('[role=alert]').textContent,/missing items/);
  assert.equal(t.saved().length,0);
});
await run('microphone permission failures give a readable recovery instruction',async t => {
  await t.start();t.qa.recorder.finish('','not-allowed');await pause();
  assert.match(t.doc.querySelector('[role=alert]').textContent,/Allow microphone access/);
});

// Pause cuts (the default since 2026-10-02): each piece's last item waits for
// the next piece, so an item the cut split is matched whole.
await run('pause cuts: pieces match in spoken order and an item the cut split is matched whole',async t => {
  await t.start();
  assert.equal(t.qa.recorder.options.pauseCuts,true);
  // Jon's test: the 20 s clock cut "We have 4.2 cases" from "Pizza sauce".
  await t.segment('Pizza sauce. We have point nine of Spanish rice.',1);
  assert.equal(t.qa.extracts.length,0,'a piece waits for the one before it');
  await t.segment('Sausage, half a case. Pizza dough, 1.6 cases. We have 4.2 cases',0);
  assert.deepEqual(Array.from(t.qa.extracts,e => e.body.transcript),
    ['Sausage, half a case.','Pizza dough, 1.6 cases. We have 4.2 cases Pizza sauce.']);
  await t.stop(); await t.finish('whole take');
  assert.equal(t.qa.extracts.at(-1).body.transcript,'We have point nine of Spanish rice.','Stop sends the held last item');
  t.qa.extracts[2].succeed([item('unknown',0.9)]);
  t.qa.extracts[1].succeed([item('dough',1.6)]);
  t.qa.extracts[0].succeed([item('pretzel',1)]);
  await until(() => t.review().length===3);
  assert.match(t.review()[0],/pretzel/); assert.match(t.review()[1],/dough/); assert.match(t.review()[2],/unknown/);
},false,true);

await run('pause cuts: a failed piece is reported and everything else still lands',async t => {
  await t.start();
  await t.segment('Two dough. Three pretzels.',0);
  await t.segment('Four dough. One pretzel.',1);
  assert.equal(t.qa.extracts.length,2);
  t.qa.extracts[0].succeed([item('dough',2)]);
  t.qa.extracts[1].fail('Synthetic upstream failure'); await pause();
  await t.stop(); await t.finish('two dough three pretzels four dough one pretzel');
  assert.equal(t.qa.extracts[2].body.transcript,'One pretzel.');
  t.qa.extracts[2].succeed([item('pretzel',1)]);
  await until(() => t.review().length===2);
  assert.match(t.doc.body.textContent,/Part of the recording couldn't be processed/);
},false,true);

await run('pause cuts: a one-item take is matched once, at Stop',async t => {
  await t.start(); await t.segment('two dough',0);
  assert.equal(t.qa.extracts.length,0,'the only item waits in case the next piece finishes it');
  await t.stop(); await t.finish('two dough');
  assert.equal(t.qa.extracts.length,1);
  assert.equal(t.qa.extracts[0].body.transcript,'two dough');
  t.qa.extracts[0].succeed([item('dough',2)]);
  await until(() => t.review().length===1);
  assert.equal(t.saved().length,0,'review still needs Apply');
},false,true);
// A screen loaded before an edit made elsewhere (Jon's phone pass, 2026-10-02):
// the stale save is refused, merged and saved with both changes.
await run('a save refused because the count changed elsewhere keeps both changes',async t => {
  await t.input('Pizza Dough: loose packs','4');
  const puts = () => t.qa.calls.filter(c => c.path.endsWith('/lines'));
  await until(() => puts().length >= 2);
  assert.equal(puts()[0].body.baseHash,'server1');
  assert.equal(puts()[1].body.baseHash,'server2');
  assert.deepEqual(Object.fromEntries(Array.from(t.qa.lines, l => [l.skuId, Number(l.qtyUnits)])),{dough:4,pretzel:3});
  await until(() => /included a change made elsewhere/.test(t.doc.body.textContent));
},'existing&stale');

await run('a check that cannot run says so instead of "Nothing looks off", and Submit stays open',async t => {
  await t.click('Finish (1)');
  await until(() => t.button('Submit the count'));
  const heading = t.doc.querySelector('.lq-fc-rev-h').textContent;
  assert.match(heading,/The check couldn't run, so nothing was checked/);
  assert.doesNotMatch(heading,/Nothing looks off/);
  assert.ok(!t.button('Submit the count').disabled);
},'existing&check-fails');

await run('findings past the first six sit behind "Show 2 more"',async t => {
  await t.click('Finish (1)');
  await until(() => t.doc.querySelector('.lq-fc-rev-h'));
  const names = () => [...t.doc.querySelectorAll('.lq-fc-rev-spoken')].map(e => e.textContent);
  assert.equal(t.doc.querySelector('.lq-fc-rev-h').textContent,'Check 8 items');
  assert.equal(names().length,6);
  await t.click('Show 2 more');
  assert.deepEqual(names(),Array.from({length:8},(_,i) => `Missing item ${i+1}`));
},'existing&many-findings');

await run('a count changed elsewhere after the check is checked again before it closes',async t => {
  await t.click('Finish (1)');
  await until(() => t.button('Submit the count'));
  await t.click('Submit the count');
  const prechecks = () => t.qa.calls.filter(c => c.path.endsWith('/precheck')).length;
  await until(() => prechecks() === 2 && /this is a fresh check/i.test(t.doc.body.textContent));
  const submits = () => t.qa.calls.filter(c => c.path.endsWith('/submit'));
  assert.equal(submits().length,1);
  assert.equal(submits()[0].body.checkedLinesHash,'fcheck1','submit named the check the counter read');
  await t.click('Submit the count');
  await until(() => submits().length === 2);
  assert.equal(submits()[1].body.checkedLinesHash,'fcheck2');
},'existing&recheck');

await run('a refused Submit says the count saved and autosaving does not erase that error',async t => {
  await t.click('Finish (1)');
  await until(() => t.button('Submit the count'));
  await t.click('Submit the count');
  await until(() => /Count saved\. Couldn't submit it/.test(t.doc.querySelector('.lq-footer').textContent));
  assert.doesNotMatch(t.doc.querySelector('.lq-footer').textContent,/not saved/i);
  assert.equal(t.qa.lines.length,1);
  await t.input('Pizza Dough: loose packs','4');
  await until(() => t.qa.lines.some(l => Number(l.qtyUnits)===4));
  assert.match(t.doc.querySelector('.lq-footer').textContent,/Couldn't submit it/,'an autosave is not a successful submit');
},'existing&submit-rejected');

await run('a lost successful Submit response is recovered without another write',async t => {
  await t.click('Finish (1)');
  await until(() => t.button('Submit the count'));
  await t.click('Submit the count');
  await until(() => /Kitchen count submitted/.test(t.doc.body.textContent));
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit')).length,1);
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/counts/food-trial')).length,1);
},'existing&submit-lost');

await run('an unknown Submit outcome only reads the status when Check submission is tapped',async t => {
  await t.click('Finish (1)');
  await until(() => t.button('Submit the count'));
  await t.click('Submit the count');
  await until(() => t.doc.querySelector('[aria-label="Check submission"]'));
  const writes = () => t.qa.calls.filter(c => c.method !== 'GET').length;
  const before = writes();
  await t.click('Check submission');
  await until(() => /Still couldn't reach/.test(t.doc.body.textContent));
  assert.equal(writes(),before);
  t.qa.detailFails = false;
  await t.click('Check submission');
  await until(() => /Kitchen count submitted/.test(t.doc.body.textContent));
  assert.equal(writes(),before);
},'existing&submit-unknown');

await run('a failed save blocks Finish and Retry save persists the food quantities',async t => {
  await t.input('Pizza Dough: loose packs','4');
  await t.click('Finish (1)');
  await until(() => t.button('Retry save'));
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit')).length,0);
  t.qa.failSave = false;
  await t.click('Retry save');
  await until(() => /saved/.test(t.doc.querySelector('.lq-footer').textContent) && !t.button('Retry save'));
  assert.equal(Number(t.qa.lines[0].qtyUnits),4);
},'existing&save-fails');

await run('Retry check runs the food advisory again and does not submit',async t => {
  await t.click('Finish (1)');
  await until(() => t.button('Retry check'));
  await t.click('Retry check');
  await until(() => t.qa.calls.filter(c => c.path.endsWith('/precheck')).length===2);
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit')).length,0);
},'existing&check-fails');

await run('a missing audio clip preserves orphan evidence without joining the next quantity',async t=>{
  await t.start();await t.segment('Pizza dough,',0);
  assert.equal(t.qa.extracts.length,0,'the incomplete product is held');
  t.qa.recorder.fail(1);await pause();
  assert.equal(t.qa.extracts.length,1,'the failed boundary releases the orphan separately');
  assert.equal(t.qa.extracts[0].body.transcript,'Pizza dough,');
  t.qa.extracts[0].succeed([item('dough',0,{spoken:'Pizza dough,',quantityKnown:false})]);
  await t.segment('Giant pretzel, one.',2);await t.stop();await t.finish('Pizza dough, two packs. Giant pretzel, one.');
  await until(()=>t.qa.extracts.length===2);
  assert.equal(t.qa.extracts[1].body.transcript,'Giant pretzel, one.');
  t.qa.extracts[1].succeed([item('pretzel',1,{spoken:'Giant pretzel, one.',quantityKnown:true})]);
  await until(()=>t.review().length===2);
  assert.match(t.doc.body.textContent,/missing|couldn.t|failed/i);
  assert.ok(!t.button(/Retry transcript|Try text again/i),'a joined transcript cannot be replayed across an audio gap');
  await t.apply();await until(()=>t.qa.lines.some(l=>l.skuId==='pretzel'));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='pretzel').qtyUnits),1);
  assert.ok(!t.qa.lines.some(l=>l.skuId==='dough'),'the orphan name never acquires an invented quantity');
},false,true);

await run('a wholly missing audio take cannot fall back to the joined full transcript',async t=>{
  await t.start();t.qa.recorder.fail(0);await pause();await t.stop();await t.finish('Pizza dough two packs.');
  await pause();assert.equal(t.qa.extracts.length,0);
  assert.equal(t.review().length,0);assert.equal(t.saved().length,0);
  assert.match(t.doc.body.textContent,/missing|couldn.t|failed/i);
  assert.ok(!t.button(/Retry transcript|Try text again/i));
},false,true);

await run('the pause-cut off switch still refuses joined fallback across failed audio',async t=>{
  await t.start();t.qa.recorder.fail(0);await pause();await t.stop();await t.finish('Pizza dough two packs.');await pause();
  assert.equal(t.qa.extracts.length,0);assert.equal(t.saved().length,0);assert.match(t.doc.body.textContent,/missing|couldn.t|failed/i);
  assert.ok(!t.button(/Retry transcript|Try text again/i));
});

await run('two then three of the same product retain both spoken sources and sum to five',async t=>{
  await t.hear([item('dough',2,{spoken:'two pizza dough',quantityKnown:true}),item('dough',3,{spoken:'three pizza dough',quantityKnown:true})]);
  await t.restate('Add');
  await t.apply();await until(()=>t.qa.lines.some(l=>l.skuId==='dough'));
  const row=t.qa.lines.find(l=>l.skuId==='dough');assert.equal(Number(row.qtyUnits),5);
  assert.match(row.rawUtterance,/two pizza dough/);assert.match(row.rawUtterance,/three pizza dough/);
});

await run('negative and blank voice edits stay unanswered until a literal human zero',async t=>{
  await t.hear([item('dough',1,{spoken:'one pizza dough',quantityKnown:true})]);
  const quantity=()=>[...t.doc.querySelectorAll('.lq-fc-rev-quantities input')].at(-1);
  const type=async value=>{const e=quantity();e.focus();Object.getOwnPropertyDescriptor(t.doc.defaultView.HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new t.doc.defaultView.Event('input',{bubbles:true}));e.dispatchEvent(new t.doc.defaultView.Event('change',{bubbles:true}));await pause();e.blur();await pause();};
  await type('-1');assert.ok(t.button(/^Add /).disabled,'negative cannot manufacture an observed zero');
  await type('');assert.ok(t.button(/^Add /).disabled,'blank cannot manufacture an observed zero');
  await type('0');await t.apply();await until(()=>t.qa.lines.some(l=>l.skuId==='dough'));
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),0);
});

await run('Cases zero cannot certify the held twelve-versus-model-one loose quantity',async t=>{
  await t.hear([item('dough',1,{spoken:'twelve pizza dough',quantityWords:'twelve',quantityNeedsReview:true})]);
  await t.input('Cases for Pizza Dough','0');assert.ok(t.button(/^Add /).disabled);assert.equal(t.doc.querySelector('input[aria-label="Cases for Pizza Dough"]').value,'0');assert.equal(t.saved().length,0);
  await t.input('Loose quantity for Pizza Dough','12');await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),12);
});
await run('Loose two cannot certify the held model seven cases',async t=>{
  await t.hear([item('dough',1,{cases:7,spoken:'two pizza dough',quantityWords:'two',quantityNeedsReview:true})]);
  await t.click('Count another way');
  await t.input('Loose quantity for Pizza Dough','2');assert.ok(t.button(/^Add /).disabled);assert.equal(t.doc.querySelector('input[aria-label="Loose quantity for Pizza Dough"]').value,'2');
  await t.input('Cases for Pizza Dough','0');await t.apply();await until(()=>t.saved().length>0);const row=t.qa.lines.find(l=>l.skuId==='dough');assert.equal(Number(row.qtyUnits),2);assert.ok(!row.enteredCases);
});
await run('both explicit zero components certify an observed empty shelf',async t=>{
  await t.hear([item('dough',1,{cases:7,spoken:'zero pizza dough',quantityWords:'zero',quantityNeedsReview:true})]);
  await t.input('Cases for Pizza Dough','0');assert.ok(t.button(/^Add /).disabled);await t.input('Loose quantity for Pizza Dough','0');await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),0);
});
await run('product and unit picks cannot confirm remaining numeric-review components',async t=>{
  await t.hear([item('dough',1,{match:null,candidates:[{id:'dough',name:'Pizza Dough',unitsPerCase:20,sizeMl:null}],spoken:'twelve dough',quantityWords:'twelve',quantityNeedsReview:true,unitNeedsReview:true})]);
  await t.click('Pizza Dough');await t.click('packs');await t.input('Cases for Pizza Dough','0');assert.ok(t.button(/^Add /).disabled);
  await t.input('Loose quantity for Pizza Dough','12');await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),12);
});
await run('package-size answers cannot confirm remaining numeric-review components',async t=>{
  await t.hear([item('dough',1,{spoken:'twelve boxes of pizza dough',quantityWords:'twelve',quantityNeedsReview:true,spokenUnit:'box'})]);
  await t.input('Package size for Pizza Dough','2');assert.ok(t.button(/^Add /).disabled);await t.input('Cases for Pizza Dough','0');assert.ok(t.button(/^Add /).disabled);
  await t.input('Loose quantity for Pizza Dough','12');await t.apply();await until(()=>t.saved().length>0);const row=t.qa.lines.find(l=>l.skuId==='dough');assert.equal(Number(row.qtyUnits),24);assert.match(row.rawUtterance,/twelve boxes/);
});
await run('invalid remaining Loose stays held despite repeating a valid Cases answer',async t=>{
  await t.hear([item('dough',1,{cases:7,spoken:'two pizza dough',quantityWords:'two',quantityNeedsReview:true})]);
  await t.input('Cases for Pizza Dough','0');await t.input('Loose quantity for Pizza Dough','-1');await t.input('Cases for Pizza Dough','0');assert.ok(t.button(/^Add /).disabled);
  await t.input('Loose quantity for Pizza Dough','2');await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),2);
});
await run('one explicit case answer replaces all held model components',async t=>{
  await t.hear([item('cauliflower',1,{cases:7,spoken:'half a case cauliflower crust',quantityWords:'half',quantityNeedsReview:true,spokenUnit:'case'})]);
  assert.equal(t.doc.querySelectorAll('.lq-fc-rev-quantities input').length,1);await t.input('Cases for Cauliflower Crust','0.5');await t.apply();await until(()=>t.saved().length>0);const row=t.qa.lines.find(l=>l.skuId==='cauliflower');assert.equal(Number(row.qtyUnits),6);assert.equal(Number(row.enteredCases),0.5);assert.equal(row.caseSizeAtEntry,12);
},'definitions');

await run('identity hold rejects even an accidental DTO match until the product is picked',async t=>{
  await t.hear([item('dough',2,{identityNeedsReview:true,candidates:[{id:'dough',name:'Pizza Dough',unitsPerCase:20,sizeMl:null},{id:'pretzel',name:'Giant Pretzel',unitsPerCase:8,sizeMl:null}]})]);
  assert.ok(t.button(/^Add /).disabled);assert.equal(t.doc.querySelectorAll('.lq-fc-rev-quantities input').length,0);assert.match(t.doc.body.textContent,/Choose product/);
  await t.click('Pizza Dough');await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),2);
});
await run('duplicate source reason independently holds a second extraction of the same phrase',async t=>{
  await t.hear([item('dough',2,{spoken:'two pizza dough',quantityWords:'two'}),item('dough',2,{spoken:'two pizza dough',quantityWords:'two',quantityReviewReason:'source_already_used'})]);
  assert.match(t.doc.body.textContent,/Source already counted/);assert.match(t.button(/^Add /).textContent,/Add 1 item/);await t.apply();await until(()=>t.saved().length>0);
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),2);assert.ok(t.button(/^Add /).disabled);assert.equal(t.review().length,1);
});

await run('food recording has one pinned Stop action, a panel timer and a disabled processing action',async t=>{
  await t.start();
  assert.equal(t.doc.querySelectorAll('.lq-rec-stop').length,1);
  assert.equal(t.doc.querySelector('.lq-rec-stop').textContent.trim(),'■ Stop & review');
  assert.equal(t.doc.querySelector('.lq-fc-voicebar > .lq-btn-rec'),null,'no separate inline Stop/timer');
  t.qa.recorder.preview('Still counting the original shelf.',2);await pause();
  assert.equal(t.doc.querySelector('.lq-rec-head .lq-rec-timer').textContent,'0:02 / 4:00');
  assert.ok(t.button('Stop recording first').disabled);
  assert.ok(t.button('Home').disabled);
  await t.stop();
  assert.ok(t.button('Processing…').disabled,'Finish cannot be tapped while uploads finish');
  assert.equal(t.doc.querySelector('.lq-rec-stop'),null,'Stop is removed after capture ends');
  assert.equal(t.doc.querySelector('.lq-rec-head'),null,'post-stop processing does not claim a live mic');
  await t.finish('');
  assert.equal(t.doc.querySelector('.lq-rec-stop'),null);
});

await run('food review omits duplicate heard quantity while retaining independent unresolved number answers',async t=>{
  await t.hear([item('dough',2,{spoken:'two pizza dough',quantityWords:'two'})]);
  assert.doesNotMatch(t.doc.body.textContent,/Heard quantity:/);
  assert.match(t.doc.querySelector('.lq-fc-rev-match').textContent,/Pizza Dough/);
  assert.ok(!t.button(/^Add /).disabled);
  await t.apply();await until(()=>t.qa.lines.some(l=>l.skuId==='dough'));
  await t.hear([item('dough',1,{spoken:'twelve pizza dough',quantityWords:'twelve',quantityNeedsReview:true})]);
  assert.doesNotMatch(t.doc.body.textContent,/Heard quantity:/);
  assert.match(t.doc.body.textContent,/Enter the count/);
  assert.ok(t.button(/^Add /).disabled);
  await t.input('Cases for Pizza Dough','0');assert.ok(t.button(/^Add /).disabled);
  await t.input('Loose quantity for Pizza Dough','12');await t.restate('Add');await t.apply();
  await until(()=>Number(t.qa.lines.find(l=>l.skuId==='dough')?.qtyUnits)===14);
});

await run('ready BIB counts use green product pills and one editable raw amount',async t=>{
  await t.hear([item('lemon-lime',1,{spoken:'one Starry'}),item('cotton-candy',1,{spoken:'one blue cotton candy ICEE'})]);
  const rows=[...t.doc.querySelectorAll('.lq-fc-rev-row')];
  assert.equal(rows.length,2);
  for(const row of rows){assert.ok(row.querySelector('.lq-chip-on'));assert.equal(row.querySelectorAll('.lq-fc-rev-quantities input').length,1);assert.equal(row.querySelector('input').value,'1');assert.equal(row.querySelector('.lq-error,.lq-fc-rev-ask'),null);}
  assert.equal(t.doc.querySelector('.lq-fc-rev-product'),null,'closed product search adds no repeated Change product line');
  assert.match(t.button(/^Add /).textContent,/Add 2 items to Beverage Room/);
},'bib');

await run('one compact human count replaces both held model components',async t=>{
  await t.hear([item('dough',1,{cases:7,spoken:'twelve pizza dough',quantityWords:'twelve',quantityNeedsReview:true})]);
  assert.ok(t.doc.querySelector('.lq-chip-on'),'product stays green while quantity is held');
  assert.equal(t.doc.querySelectorAll('.lq-fc-rev-quantities input').length,1);
  assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'');
  await t.input('Loose quantity for Pizza Dough','12');await t.apply();await until(()=>t.saved().length>0);
  const line=t.qa.lines.find(l=>l.skuId==='dough');assert.equal(Number(line.qtyUnits),12);assert.ok(!line.enteredCases,'model seven cases was completely replaced');
});

await run('compact proven zero is visible while missing zero stays blank and held',async t=>{
  await t.hear([item('dough',0,{spoken:'zero pizza dough',quantityWords:'zero',quantityKnown:true}),item('pretzel',0,{spoken:'giant pretzel',quantityKnown:false})]);
  const fields=[...t.doc.querySelectorAll('.lq-fc-rev-quantities input')];assert.deepEqual(fields.map(e=>e.value),['0','']);
  assert.match(t.button(/^Add /).textContent,/Add 1 item/);await t.apply();await until(()=>t.saved().length>0);
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),0);assert.ok(t.button(/^Add /).disabled);
});

await run('a remembered case default displays raw one and saves six once',async t=>{
  await t.hear([item('fries',1,{spoken:'one fries',quantityWords:'one'})]);
  const inputs=[...t.doc.querySelectorAll('.lq-fc-rev-quantities input')];assert.equal(inputs.length,1);assert.equal(inputs[0].value,'1');assert.match(inputs[0].getAttribute('aria-label'),/Cases/);
  await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='fries').qtyUnits),6);
},'definitions');

await run('alternative case-plus-loose mode uses base labels and returning to one count requires restatement',async t=>{
  await t.hear([item('fries',1,{spoken:'one fries',quantityWords:'one'})]);await t.click('Count another way');
  const inputs=[...t.doc.querySelectorAll('.lq-fc-rev-quantities input')];assert.deepEqual(inputs.map(e=>e.value),['1','0']);assert.match(inputs[1].closest('label').textContent,/bags/);
  await t.input('Loose quantity for Sample Fries','2');await t.click('Use one count');
  assert.equal(t.doc.querySelectorAll('.lq-fc-rev-quantities input').length,1);assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'');assert.ok(t.button(/^Add /).disabled);
  await t.input('Loose quantity for Sample Fries','8');await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='fries').qtyUnits),8);
},'definitions');

for(const [cases,units,phrase] of [[1,0,'one case and zero packs'],[0,2,'zero cases and two packs']])await run(`explicit mixed count preserves its zero component (${phrase})`,async t=>{
  await t.hear([item('dough',units,{cases,spoken:phrase+' of pizza dough',quantityWords:phrase,spokenUnit:'pack'})]);
  const inputs=[...t.doc.querySelectorAll('.lq-fc-rev-quantities input')];assert.deepEqual(inputs.map(e=>e.value),[String(cases),String(units)]);
  await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),cases*20+units);
});

await run('a case-counted product keeps confirmed two bags visible and saves one case',async t=>{
  await t.hear([item('dough',2,{spoken:'two bags of pizza dough',spokenUnit:'bag'})]);
  const input=t.doc.querySelector('.lq-fc-rev-quantities input');assert.equal(input.value,'2');assert.match(input.closest('label').textContent,/bag/);assert.equal(t.doc.querySelector('.lq-fc-rev-ask'),null);
  await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),1);
},'definitions&case-bags');

await run('manual package conversion keeps raw two bags and converts only once',async t=>{
  await t.hear([item('dough',2,{spoken:'two bags of pizza dough',spokenUnit:'bag'})]);assert.ok(t.button(/^Add /).disabled);
  await t.input('Package size for Pizza Dough','2');assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'2');assert.match(t.doc.querySelector('.lq-fc-rev-quantities label').textContent,/bag/);
  await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),1);
},'definitions');

await run('green held product pill opens search without certifying the number',async t=>{
  await t.hear([item('dough',1,{spoken:'twelve dough',quantityWords:'twelve',quantityNeedsReview:true})]);
  await t.click(/^✓ Pizza Dough$/);await t.input('Find product for twelve dough','Giant Pretzel');await t.click('Giant Pretzel');
  assert.ok(t.doc.querySelector('.lq-chip-on'));assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'');assert.ok(t.button(/^Add /).disabled);
  await t.input('Loose quantity for Giant Pretzel','12');await t.apply();await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='pretzel').qtyUnits),12);
});

for(const [reason,hint] of [['source_revised',/You corrected this item/],['unquantified_remainder',/Enter a total number.*including the extra/]])await run(`targeted ${reason} prompt preserves a green match and blank count`,async t=>{
  await t.hear([item('dough',1,{spoken:'pizza dough and a little extra',quantityWords:'one',quantityReviewReason:reason})]);
  assert.ok(t.doc.querySelector('.lq-chip-on'));assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'');assert.match(t.doc.querySelector('.lq-error').textContent,hint);assert.ok(t.button(/^Add /).disabled);
});

await run('one primary sticky Add consumes ready rows once and retains held rows',async t=>{
  await t.hear([item('dough',2),item('pretzel',3),item('unknown',1,{spoken:'twelve unknown packages',quantityWords:'twelve',quantityNeedsReview:true})]);
  const adds=[...t.doc.querySelectorAll('button')].filter(b=>/^Add \d+ items? to/.test(b.textContent.trim()));
  assert.equal(adds.length,1);assert.ok(adds[0].closest('.lq-footer'));assert.ok(adds[0].classList.contains('lq-btn-primary'));assert.match(adds[0].textContent,/Add 2 items to Pizza Freezer/);assert.equal(t.saved().length,0);
  adds[0].click();adds[0].click();await until(()=>t.qa.lines.length===2);
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),2);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='pretzel').qtyUnits),3);
  assert.equal(t.review().length,1);assert.match(t.button(/^Add /).textContent,/Add 0 items/);assert.ok(t.button(/^Add /).disabled);
  await t.input('Loose quantity for Unknown Package','12');await t.apply();await until(()=>t.qa.lines.length===3);
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='unknown').qtyUnits),12);assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),2);
});

await run('held-only sticky Add stays disabled until a valid whole answer including zero',async t=>{
  await t.hear([item('dough',1,{spoken:'zero pizza dough',quantityWords:'zero',quantityNeedsReview:true})]);
  const add=t.button(/^Add /);assert.ok(add.closest('.lq-footer'));assert.ok(add.disabled);assert.ok(t.button('Home').disabled);add.click();await pause();assert.equal(t.saved().length,0);
  await t.input('Loose quantity for Pizza Dough','');assert.ok(t.button(/^Add /).disabled);
  await t.input('Loose quantity for Pizza Dough','-1');assert.ok(t.button(/^Add /).disabled);
  await t.input('Loose quantity for Pizza Dough','0');assert.ok(!t.button(/^Add /).disabled);await t.apply();await until(()=>t.saved().length>0);
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='dough').qtyUnits),0);
});

await run('case breakdown: raw three cases displays eighteen cans; editing to two saves twelve',async t=>{
  await t.hear([item('case-sauce',0,{spoken:'three cases pizza sauce',quantityWords:'three cases',cases:3,qty:18,quantityKnown:true})]);
  assert.equal(t.doc.querySelectorAll('.lq-fc-rev-quantities input').length,1);
  assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'3');
  assert.match(t.doc.querySelector('.lq-fc-rev-case-breakdown').textContent,/3 cases × 6 cans = 18 cans/);
  await t.input('Cases for Sauce, Pizza, Canned','2');assert.match(t.doc.querySelector('.lq-fc-rev-case-breakdown').textContent,/2 cases × 6 cans = 12 cans/);
  await t.click(/^Add 1 item to Pizza Line$/);await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines[0].qtyUnits),12);assert.equal(Number(t.qa.lines[0].enteredCases),2);
},'case-breakdown');

await run('case breakdown: fractional cases preserve the raw half and save three cans',async t=>{
  await t.hear([item('case-sauce',0,{spoken:'half a case pizza sauce',quantityWords:'half a case',cases:0.5,qty:3})]);
  assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'0.5');assert.match(t.doc.querySelector('.lq-fc-rev-case-breakdown').textContent,/0\.5 cases × 6 cans = 3 cans/);
  await t.click(/^Add 1 item to Pizza Line$/);await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines[0].qtyUnits),3);
},'case-breakdown');

await run('case breakdown: confirmed default one case of beans stays one and saves six bags',async t=>{
  await t.hear([item('case-beans',1,{spoken:'one refried beans',quantityWords:'one',qty:6})]);
  assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'1');assert.match(t.doc.querySelector('.lq-fc-rev-case-breakdown').textContent,/1 case × 6 bags = 6 bags/);
  await t.click(/^Add 1 item to Pizza Line$/);await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines[0].qtyUnits),6);
},'case-breakdown');

for(const [unit,total,loose] of [['can',20,2],['bag',22,4]])await run(`case breakdown: mixed cases plus ${unit} use the canonical loose total once`,async t=>{
  await t.hear([item('case-sauce',2,{spoken:`three cases and two ${unit}s of pizza sauce`,quantityWords:`three cases and two ${unit}s`,spokenUnit:unit,cases:3,qty:total})]);
  assert.deepEqual([...t.doc.querySelectorAll('.lq-fc-rev-quantities input')].map(e=>e.value),['3','2']);assert.match(t.doc.querySelector('.lq-fc-rev-case-breakdown').textContent,new RegExp(`3 cases × 6 cans \\+ ${loose} cans = ${total} cans`));
  await t.click(/^Add 1 item to Pizza Line$/);await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines[0].qtyUnits),total);
},'case-breakdown');

await run('case breakdown: canonical case products avoid cases of cases',async t=>{
  await t.hear([item('case-canonical',0,{spoken:'three cases',quantityWords:'three cases',cases:3,qty:3})]);
  assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'3');assert.equal(t.doc.querySelector('.lq-fc-rev-case-breakdown'),null);
  await t.click(/^Add 1 item to Pizza Line$/);await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines[0].qtyUnits),3);
},'case-breakdown');

await run('case breakdown: unknown case size withholds totals and blocks Add',async t=>{
  await t.hear([item('case-unknown',0,{spoken:'three cases unknown package',quantityWords:'three cases',cases:3,qty:0,needsCaseSize:true})]);
  assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'3');assert.equal(t.doc.querySelector('.lq-fc-rev-case-breakdown'),null);assert.ok(t.button(/^Add 0/).disabled);assert.equal(t.saved().length,0);
},'case-breakdown');

await run('case breakdown: held model case quantity never produces a guessed total',async t=>{
  await t.hear([item('case-sauce',0,{spoken:'pizza sauce uncertain count',quantityWords:'three cases',cases:3,qty:18,quantityKnown:false,quantityNeedsReview:true})]);
  assert.ok(t.doc.querySelector('.lq-chip-on'));assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'');assert.equal(t.doc.querySelector('.lq-fc-rev-case-breakdown'),null);assert.ok(t.button(/^Add 0/).disabled);assert.equal(t.saved().length,0);
},'case-breakdown');

await run('case breakdown: one BIB case displays its one BIB without an extra count box',async t=>{
  await t.hear([item('case-bib',0,{spoken:'one case Diet Pepsi',quantityWords:'one case',cases:1,qty:1})]);
  assert.equal(t.doc.querySelectorAll('.lq-fc-rev-quantities input').length,1);assert.equal(t.doc.querySelector('.lq-fc-rev-quantities input').value,'1');assert.match(t.doc.querySelector('.lq-fc-rev-case-breakdown').textContent,/1 case × 1 bib = 1 bib/);
  await t.click(/^Add 1 item to Pizza Line$/);await until(()=>t.saved().length>0);assert.equal(Number(t.qa.lines[0].qtyUnits),1);
},'case-breakdown');

// ── 2026-10-09 food voice review follow-ups (Alcohol Pricing incidents/
// 2026-10-09/food-voice-review). Finding 12: a phone tab left on an older page
// had every piece of a take refused (409 voice_update_required) and only said
// so after the whole shelf was spoken.
const updateText = t => t.doc.querySelector('.lq-fc-update')?.textContent ?? '';
const footerText = t => t.doc.querySelector('.lq-footer').textContent;
// Every PUT of the sheet, as {zone:sku: qty}. Array.from: the bodies live in the page's realm.
const puts = t => Array.from(t.saved(), c => Object.fromEntries(Array.from(c.body.lines, l => [`${l.zoneId}:${l.skuId}`, Number(l.qtyUnits)])));

await run('an out-of-date page stops the take at its first refused piece and offers one tap to Reload',async t => {
  await t.start();
  await t.segment('two dough',0);
  assert.equal(updateText(t),'');
  t.qa.extracts[0].outdated();
  await until(() => updateText(t));
  // The take stops at the first refused piece.
  await until(() => !t.button(/^■ Stop & review$/));
  assert.match(updateText(t),/This page is out of date\. Reload it to keep counting\. Counts already saved stay saved\./);
  assert.ok(t.doc.querySelector('.lq-fc-update').closest('.lq-footer'),'in the fixed footer, where the counter is looking');
  assert.ok(t.button('Reload page').disabled,'not while the recorder is still finishing');
  await t.finish('two dough');
  assert.ok(!t.button('Reload page').disabled);
  assert.ok(!t.button('Retry reading this transcript'),'retrying from this page can never work');
  assert.equal(t.review().length,0);
  assert.doesNotMatch(t.doc.body.textContent,/Didn't catch any items/);
  const talk = t.button('Reload the page to record');
  assert.ok(talk && talk.disabled,'no second take on the out-of-date page');
  assert.equal(t.qa.extracts.length,1);
  assert.equal(t.saved().length,0);
  assert.equal(t.navigations.length,0);
  await t.click('Reload page');
  assert.equal(t.navigations.length,1,'one tap reloads');
  assert.equal(t.dom.window.localStorage.getItem('cogs:zone:food-trial'),'freezer','the reload reopens this shelf');
});

await run('pause cuts: on an out-of-date page, items read before the refusal are listed but not added, and the footer says what must be entered again',async t => {
  await t.start();
  await t.segment('Two dough. Three pretzels.',0);
  assert.equal(t.qa.extracts.length,1);
  t.qa.extracts[0].succeed([item('dough',2)]); await pause();
  await t.segment('Four dough. One pretzel.',1);
  t.qa.extracts[1].outdated();
  await until(() => updateText(t));
  await until(() => !t.button(/^■ Stop & review$/));
  await t.finish('two dough three pretzels four dough one pretzel');
  // Stop sends the held last item; it is refused too.
  t.qa.extracts.at(-1).outdated();
  await until(() => t.review().length===1);
  // 2026-10-09 client review (S2): every save from this page is refused (one
  // foodUnitsVersion check for voice and saves), so Add would put rows in the
  // grid only for the reload to drop them, after "count the rest" had told
  // the counter not to say them again. Add is off; the whole shelf is redone.
  assert.match(t.doc.body.textContent,/Part of the recording couldn't be read on this out-of-date page, and nothing heard can be added here\. Reload, then count this shelf again\./);
  assert.doesNotMatch(t.doc.body.textContent,/count the rest/);
  assert.match(updateText(t),/Heard items, and anything added or typed since the last save, will need to be entered again/);
  assert.ok(t.button('Reload the page to record').disabled);
  assert.ok(!t.button('Retry reading this transcript'));
  assert.ok(!t.button(/^Add \d+ items? to /),'no Add on the out-of-date page');
  const add = t.button('Reload, then count these again');
  assert.ok(add && add.disabled);
  add.click(); await pause();
  assert.equal(t.saved().length,0,'nothing is added for a save that can only be refused');
  assert.equal(t.review().length,1,'the heard row stays listed');
  await t.click('Reload page');
  assert.equal(t.navigations.length,1);
},false,true);

// Same review (S1): the page goes out of date after a take is read, so the
// first sign is the save Add makes. The added rows are then unsaved and the
// reload drops them; the footer must say so, not only "heard items not added".
await run('an Add refused as out of date says added items need entering again',async t => {
  await t.hear([item('dough',2)]);
  t.qa.saveOutdated = true;
  await t.apply();
  await until(() => updateText(t));
  assert.match(updateText(t),/Heard items, and anything added or typed since the last save, will need to be entered again/);
  assert.match(footerText(t),/Not saved yet\./);
  assert.equal(t.saved().length,1,'the one save was tried and refused');
});

// Same review (S3): Reload remembered the last take's shelf (takeZoneId
// outlives the take), so after walking on, Continue count reopened the earlier
// shelf, the wrong-shelf hazard resume-zone.ts exists to prevent.
await run('Reload page reopens the shelf the counter is on, not the last take\'s shelf',async t => {
  await t.hear([item('dough',2)]);
  await t.apply(); await until(() => t.saved().length>0);
  const location = t.doc.querySelector('select.lq-fc-location-select');
  location.value = 'cooler'; location.dispatchEvent(new t.doc.defaultView.Event('change',{bubbles:true})); await pause();
  const skip = t.button(/^Skip \d+, /);
  if (skip) await t.click(skip.textContent.trim());
  await until(() => t.doc.querySelector('select.lq-fc-location-select').value === 'cooler');
  assert.equal(t.dom.window.localStorage.getItem('cogs:zone:food-trial'),'cooler');
  t.qa.saveOutdated = true;
  await t.input('Pizza Dough: loose packs','3');
  await until(() => updateText(t));
  await t.click('Reload page');
  assert.equal(t.navigations.length,1);
  assert.equal(t.dom.window.localStorage.getItem('cogs:zone:food-trial'),'cooler','the reload reopens the shelf the counter is on');
});

await run('a save refused as out of date offers Reload, not Retry save, and Finish says why',async t => {
  await t.input('Pizza Dough: loose packs','4');
  await until(() => updateText(t));
  assert.ok(!t.button('Retry save'),'retrying from this page can never work');
  assert.match(footerText(t),/Not saved yet\./);
  assert.doesNotMatch(footerText(t),/Keep this screen open and retry/);
  assert.match(updateText(t),/anything added or typed since the last save, will need to be entered again/);
  assert.ok(t.button('Reload the page to record').disabled);
  await t.click('Finish (1)');
  await until(() => /This page is out of date\. Reload it, then Finish again\./.test(footerText(t)));
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/precheck')).length,0);
  assert.equal(t.qa.calls.filter(c => c.path.endsWith('/submit')).length,0);
  await t.click('Reload page');
  assert.equal(t.navigations.length,1);
},'existing&save-outdated');

// Finding 7 and Jon's ruling, 2026-10-09: "Ask: add or replace." A re-recorded
// shelf added both takes into one cell (draft 81309ef9: pizza sauce 41 from two
// takes of about 26). Every save is intercepted: the cell is exactly what the
// counter chose, and no in-between total is ever saved.
await run('a product already counted on the shelf asks add or replace; Add sums and Replace overwrites, take after take',async t => {
  await t.hear([item('dough',2,{spoken:'two pizza dough'})]);
  const ask = () => [...t.doc.querySelectorAll('.lq-fc-rev-restate')].map(e => e.textContent);
  assert.equal(ask().length,1);
  assert.match(ask()[0],/Add to the 1 pack already here, or replace\?/);
  assert.ok(t.button('Add: 3 packs total')); assert.ok(t.button('Replace: 2 packs'));
  assert.ok(t.button(/^Add 0 items to Pizza Freezer$/).disabled,'nothing is counted until the counter says which');
  await t.click('Add: 3 packs total');
  assert.match(t.doc.body.textContent,/Adds to the 1 pack already here: 3 packs total\./);
  await t.apply(); await until(() => t.saved().length>0);
  assert.deepEqual(puts(t),[{'freezer:dough':3}]);
  // A second take of the same shelf: the counter re-recorded it.
  await t.hear([item('dough',4,{spoken:'four pizza dough'})]);
  assert.match(ask()[0],/Add to the 3 packs already here, or replace\?/);
  await t.click('Replace: 4 packs');
  assert.match(t.doc.body.textContent,/Replaces the 3 packs already here\./);
  await t.apply(); await until(() => t.saved().length>1);
  assert.deepEqual(puts(t),[{'freezer:dough':3},{'freezer:dough':4}]);
  const line = t.qa.lines.find(l => l.skuId==='dough');
  assert.match(line.rawUtterance,/four pizza dough/); assert.doesNotMatch(line.rawUtterance,/two pizza dough/);
},'existing');

await run('a repeat of a product in one review asks add or replace about the earlier row',async t => {
  await t.hear([item('dough',2,{spoken:'two pizza dough'}),item('pretzel',1),item('dough',3,{spoken:'three pizza dough'})]);
  const asks = [...t.doc.querySelectorAll('.lq-fc-rev-restate')];
  assert.equal(asks.length,1,'only the repeat asks; the first mention and other products do not');
  assert.ok(asks[0].closest('.lq-fc-rev-row').textContent.includes('three pizza dough'));
  assert.match(asks[0].textContent,/Add to the 2 packs already here, or replace\?/);
  assert.match(t.button(/^Add \d+ items? to Pizza Freezer$/).textContent,/^Add 2 items/);
  await t.click('Replace: 3 packs');
  await t.apply(); await until(() => t.saved().length>0);
  assert.deepEqual(puts(t),[{'freezer:dough':3,'freezer:pretzel':1}]);
  assert.equal(t.review().length,0);
});

await run('a repeat answered Add sums the rows once; Change asks again',async t => {
  await t.hear([item('dough',2,{spoken:'two pizza dough'}),item('dough',3,{spoken:'three pizza dough'})]);
  await t.click('Replace: 3 packs');
  await t.click('Change');
  assert.ok(t.button('Add: 5 packs total'),'Change reopens the question');
  assert.ok(t.button(/^Add 1 item to Pizza Freezer$/));
  await t.click('Add: 5 packs total');
  await t.apply(); await until(() => t.saved().length>0);
  assert.deepEqual(puts(t),[{'freezer:dough':5}]);
});

await run('an answer holds only for the amount it was given against',async t => {
  // The shelf has 1; the take says 2 and then 3.
  await t.hear([item('dough',2,{spoken:'two pizza dough'}),item('dough',3,{spoken:'three pizza dough'})]);
  const asks = () => [...t.doc.querySelectorAll('.lq-fc-rev-restate')].map(e => e.textContent);
  assert.deepEqual(asks().map(a => a.match(/Add to the (.*?) already here/)[1]),['1 pack','3 packs']);
  await t.click('Add: 6 packs total');
  assert.deepEqual(asks().map(a => a.match(/Add to the (.*?) already here/)[1]),['1 pack']);
  // Replacing the shelf's 1 with the 2 moves the second row's "already here"
  // from 3 to 2, so its Add is asked again.
  await t.click('Replace: 2 packs');
  assert.deepEqual(asks().map(a => a.match(/Add to the (.*?) already here/)[1]),['2 packs']);
  assert.ok(t.button(/^Add 1 item to Pizza Freezer$/));
  await t.click('Add: 5 packs total');
  await t.apply(); await until(() => t.saved().length>0);
  assert.deepEqual(puts(t),[{'freezer:dough':5}]);
},'existing');

await run('a spoken zero over a counted shelf asks, and Replace saves the zero',async t => {
  await t.hear([item('dough',0,{spoken:'zero pizza dough',quantityKnown:true})]);
  assert.match(t.doc.querySelector('.lq-fc-rev-restate').textContent,/Add to the 1 pack already here, or replace\?/);
  await t.click('Replace: 0 packs');
  await t.apply(); await until(() => t.saved().length>0);
  assert.deepEqual(puts(t),[{'freezer:dough':0}]);
},'existing');

await run('the question is per shelf: the same product on another shelf is not asked about',async t => {
  const location=t.doc.querySelector('select.lq-fc-location-select');
  location.value='cooler';location.dispatchEvent(new t.doc.defaultView.Event('change',{bubbles:true}));await pause();
  // Leaving a touched shelf lists its uncounted items first.
  const go=t.doc.querySelector('.lq-fc-sheet-go'); if (go) { go.click(); await pause(); }
  await until(() => t.button(/Talk through Kitchen Cooler/));
  await t.hear([item('dough',2,{spoken:'two pizza dough'})]);
  assert.equal(t.doc.querySelector('.lq-fc-rev-restate'),null);
  await t.click(/^Add 1 item to Kitchen Cooler$/); await until(() => t.saved().length>0);
  assert.deepEqual(puts(t),[{'freezer:dough':1,'cooler:dough':2}]);
},'existing');

if (failed.length) { console.log(`${failed.length} food voice UI scenarios FAILED: ${failed.join(' | ')}`); process.exitCode = 1; }
console.log(`${passed} food voice UI scenarios passed including compact raw counts, case breakdowns, sticky single-apply review, recorder failures, advanced per-field confirmation and identity/source holds.`);
