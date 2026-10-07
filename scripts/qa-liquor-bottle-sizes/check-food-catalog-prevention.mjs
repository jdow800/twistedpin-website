// Offline catalog-bound carry and actual CountFood answer-order controls.
// Build food-fixture.js first with the existing QA fixture builder.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
const require=createRequire(new URL('../../package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:"export * from './src/components/liquor/voiceCarry';",resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const carry=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const names=JSON.parse(await readFile(new URL('./food-catalog-carry.fixture.json',import.meta.url),'utf8')).items;
const split=carry.createFoodCarrySplitter(names);
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name)}
check('all 196 catalog names keep suffix counts and source words together',()=>{
  assert.equal(names.length,196);
  for(const {name} of names)for(const source of [name+'. Point nine. Sample next food, one case.',name+', one case. Sample next food.',name+', one case. Point nine. Sample next food.','Point nine. '+name+'. Sample next food, one case.']){
    const actual=split(source),separate=source.startsWith(name+'.')?{head:name+'. Point nine.',tail:'Sample next food, one case.'}:source.startsWith(name+', one case. Point')?{head:name+', one case.',tail:'Point nine. Sample next food.'}:source.startsWith(name+', one case.')?{head:name+', one case.',tail:'Sample next food.'}:{head:'Point nine. '+name+'.',tail:'Sample next food, one case.'};
    // Safe batching may retain a whole ambiguous piece; it must never send a
    // complete name without its count and give that count to the next name.
    assert.ok(JSON.stringify(actual)===JSON.stringify(separate)||actual.head===''&&actual.tail===source,JSON.stringify({source,actual,separate}));
  }
});
for(const name of ['Niagara Spring Water, sixteen point nine ounces','American Cheese, Yellow, one hundred and twenty Slices / five pound Pack','Cardboard Pizza Circle fourteen inches','Flatbread, four point five inches by twelve inches'])check('spoken catalog descriptor: '+name,()=>{
  assert.deepEqual(split(name+'. Point nine. Sample next food, one case.'),{head:name+'. Point nine.',tail:'Sample next food, one case.'});
});
check('real prior counts and measurements remain outside catalog names',()=>{
  assert.deepEqual(split('Pizza shells fourteen inch, eight. Lids, one case.'),{head:'Pizza shells fourteen inch, eight.',tail:'Lids, one case.'});
  for(const name of ['Butter, Alternative Liquid, Zero Fat','Niagara Spring Water, 16.9 oz','American Cheese, Yellow, 120 Slices / 5 lb Pack'])assert.deepEqual(split('two '+name+'. Point nine. Spanish rice.'),{head:'two '+name+'.',tail:'Point nine. Spanish rice.'});
  for(const source of ['Five pounds flour. Cups two.','Pizza sauce, two. Cups twelve ounce.','Two shells. Paper Cup, 24 oz.']){
    const {head,tail}=split(source);assert.equal((head+' '+tail).trim(),source);
  }
  const aliasSplit=carry.createFoodCarrySplitter([{name:'Pizza Dough',aliases:['shells']}]);
  assert.deepEqual(aliasSplit('Two shells. Sample next food, one case.'),{head:'Two shells.',tail:'Sample next food, one case.'});
});
check('catalog carry retains failed-clip isolation and the held-word cap',()=>{
  const sent=[],c=carry.createCarry((text,index)=>sent.push({text,index}),split);
  c.add('Niagara Spring Water, 16.9 oz.',0);c.fail(1);c.add('Point nine. Pizza sauce, two.',2);c.flush(3);
  assert.ok(sent.every(p=>!(p.text.includes('Niagara')&&p.text.includes('Point nine'))));
  const long=Array.from({length:carry.MAX_HELD_FOOD_WORDS+1},(_,i)=>'food'+i).join(' ');
  const capped=carry.createCarry((text,index)=>sent.push({text,index}),split);capped.add(long,0);assert.equal(sent.at(-1).text,long);
  assert.deepEqual(carry.splitUnfinished('Dos Hombres, mezcal, point three. Indigo, gin,'),{head:'Dos Hombres, mezcal, point three.',tail:'Indigo, gin,'});
});
const bundle=await readFile(new URL('./dist/food-fixture.js',import.meta.url),'utf8');
const pause=(ms=25)=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<160;i++){if(fn())return;await pause()}throw Error('UI timeout')}
const def=(countUnit,unitsPerCase,extra)=>({countUnit,unitsPerCase,confirmedBy:'QA',confirmedAt:'2026-10-07',...extra});
const catalog=[{id:'dough',name:'Pizza Dough',countUnit:'case',unitsPerCase:1,countDefinition:def('case',1,{unitLabel:'case',spokenUnits:{case:1,shell:.05}})},{id:'fries',name:'Sample Fries',countUnit:'pack',unitsPerCase:6,countDefinition:def('pack',6,{unitLabel:'bag',defaultSpokenUnit:'case',spokenUnits:{case:6,bag:1}})},...names.map((s,i)=>({...s,id:'catalog-'+i,countUnit:'each',unitsPerCase:null}))];
const item=(id,units,extra={})=>({spoken:'two '+id,quantityWords:'two',quantityKnown:true,quantityNeedsReview:false,cases:0,units,qty:units,match:{id,name:catalog.find(s=>s.id===id).name,sizeMl:null},candidates:[],...extra});
async function ui(name,fn,pauseCuts=false){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/?pausecuts='+(pauseCuts?'1':'0'),runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.Response=Response;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.foodQaFixture={catalog,zones:[{id:'freezer',name:'Pizza Freezer',walkOrder:1,memberSkuIds:catalog.map(s=>s.id)}]};
  try{w.eval(bundle);const doc=w.document;await until(()=>w.foodQa?.recorder&&doc.querySelector('.lq-count-entry'));
    const button=(text,scope=doc)=>[...scope.querySelectorAll('button')].find(b=>typeof text==='string'?b.textContent.trim()===text:text.test(b.textContent.trim()));
    const click=async(text,scope=doc)=>{const b=button(text,scope);assert.ok(b,'Missing '+text);assert.ok(!b.disabled,'Disabled '+text);b.click();await pause()};await click('Continue count');
    const qa=w.foodQa;const input=async(label,value)=>{const el=doc.querySelector('input[aria-label="'+label+'"]');assert.ok(el,'Missing '+label);el.focus();Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));el.blur();await pause()};
    const start=async()=>{await pause();await click(/Talk through/)};const segment=async text=>{qa.recorder.segment(text,0);await pause()};const stop=async text=>{await click(/Stop & review/);qa.recorder.finish(text);await pause()};
    const hear=async entries=>{await start();await segment('test transcript');qa.extracts.at(-1).succeed(entries);await pause();await stop('test transcript');await until(()=>doc.querySelector('.lq-fc-rev-row'))};
    const apply=async()=>{await click(/^Add /);await until(()=>qa.calls.some(c=>c.path.endsWith('/lines')))};
    await fn({qa,doc,button,click,input,start,segment,stop,hear,apply});passed++;console.log('PASS '+name);
  }finally{w.close()}
}
for(const name of ['Niagara Spring Water, 16.9 oz','American Cheese, Yellow, 120 Slices / 5 lb Pack'])await ui('actual extraction request owns '+name,async t=>{
  const source=name+'. Point nine. Spanish rice, one case.';await t.start();await t.segment(source);await t.stop(source);await until(()=>t.qa.extracts.length===2);assert.equal(t.qa.extracts[0].body.transcript,name+'. Point nine.');assert.equal(t.qa.extracts[1].body.transcript,'Spanish rice, one case.');t.qa.extracts.forEach(r=>r.succeed([]));
},true);
await ui('same product retains a manually answered package and saves once',async t=>{
  await t.hear([item('dough',999,{spoken:'two trays of pizza dough',quantityKnown:false,quantityNeedsReview:true,unitNeedsReview:true})]);await t.input('Loose quantity for Pizza Dough','2');await t.input('Spoken unit for Pizza Dough','tray');await t.click('Use unit');await t.input('Package size for Pizza Dough','2');const row=t.doc.querySelector('.lq-fc-rev-row');row.querySelector('.lq-chip-on').click();await pause();await t.input('Find product for two trays of pizza dough','Pizza Dough');await t.click('Pizza Dough',row);assert.equal(row.querySelector('.lq-fc-rev-quantities input').value,'2');assert.equal(row.querySelector('input[aria-label="Package size for Pizza Dough"]'),null);await t.apply();assert.equal(Number(t.qa.lines[0].qtyUnits),1);
});
await ui('unit choice preserves answered Cases zero but holds remaining model quantity',async t=>{
  await t.hear([item('fries',999,{cases:7,quantityKnown:false,quantityNeedsReview:true,unitNeedsReview:true})]);await t.click('Count another way');await t.input('Cases for Sample Fries','0');await t.click('bags');assert.equal(t.doc.querySelector('input[aria-label="Cases for Sample Fries"]').value,'0');assert.equal(t.doc.querySelector('input[aria-label="Loose quantity for Sample Fries"]').value,'');assert.ok(t.button(/^Add 0/).disabled);assert.ok(!t.doc.querySelector('.lq-fc-rev-row').textContent.includes('999'));assert.ok(t.button('Change package size'));await t.input('Loose quantity for Sample Fries','2');assert.match(t.doc.querySelector('.lq-fc-rev-row').textContent,/2 pack = 2 bags/);await t.apply();assert.equal(Number(t.qa.lines[0].qtyUnits),2);
});
await ui('changing product invalidates a previous manual package conversion',async t=>{
  await t.hear([item('dough',999,{spoken:'two trays of pizza dough',quantityKnown:false,quantityNeedsReview:true,unitNeedsReview:true})]);await t.input('Loose quantity for Pizza Dough','2');await t.input('Spoken unit for Pizza Dough','tray');await t.click('Use unit');await t.input('Package size for Pizza Dough','2');const row=t.doc.querySelector('.lq-fc-rev-row');row.querySelector('.lq-chip-on').click();await pause();await t.input('Find product for two trays of pizza dough','Sample Fries');await t.click('Sample Fries',row);assert.ok(t.button(/^Add 0/).disabled);assert.ok(row.querySelector('input[aria-label="Package size for Sample Fries"]'));assert.equal(t.qa.lines.length,0);
});
console.log(passed+' catalog carry and answer-order prevention scenarios passed.');
