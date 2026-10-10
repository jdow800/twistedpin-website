import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

// Actual CountFood, recorder boundary and save API serializer. Responses and
// catalog are synthetic; PostgreSQL acceptance is tested in the paired API.
const bundle = await readFile(new URL('./dist/food-fixture.js',import.meta.url),'utf8');
const pause = (ms=20) => new Promise(resolve=>setTimeout(resolve,ms));
const until = async fn => {for(let i=0;i<160;i++){if(fn())return;await pause();}throw Error('Food precision UI timed out');};
const sku = {id:'slider',name:'Sample Slider Bun',countUnit:'case',unitsPerCase:null,
 countDefinition:{countUnit:'case',unitsPerCase:null,unitLabel:'case',defaultSpokenUnit:'case',spokenUnits:{case:1,bun:1/192},confirmedBy:'Synthetic precision QA',confirmedAt:'2026-01-01'},
 foodUnitRatios:{case:{numerator:'1',denominator:'1'},bun:{numerator:'1',denominator:'192'}}};
const basis = {version:1,countUnit:'case',unitLabel:'case',legacyQtyUnits:'0'};
const physical = (quantity='2',denominator='192') => ({...basis,loose:[{quantity,unit:'bun',numerator:'1',denominator}]});
const line = (foodQuantity,qtyUnits=2/192,extra={}) => ({skuId:'slider',zoneId:'freezer',qtyUnits:String(qtyUnits),source:'voice',enteredCases:null,caseSizeAtEntry:null,enteredPacks:null,packSizeAtEntry:null,foodQuantity,...extra});
const item = (units,cases=0) => ({spoken:`${cases?cases+' case and ':''}${units} buns`,quantityWords:`${cases?cases+' case and ':''}${units} buns`,quantityKnown:true,quantityNeedsReview:false,spokenUnit:'bun',cases,units,qty:cases+units/192,match:{id:'slider',name:sku.name,sizeMl:null},candidates:[]});
async function mount({lines=[],changedFactor=false,changedBasis=false,findings=[]}={}) {
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/?pausecuts=0',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.Response=Response;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 const current=structuredClone(sku);
 if(changedFactor){current.countDefinition.spokenUnits.bun=1/200;current.foodUnitRatios.bun.denominator='200';}
 if(changedBasis){current.countUnit='each';current.unitsPerCase=192;current.countDefinition={...current.countDefinition,countUnit:'each',unitsPerCase:192,unitLabel:'bun',defaultSpokenUnit:'each',spokenUnits:{bun:1,case:192}};current.foodUnitRatios={bun:{numerator:'1',denominator:'1'}};}
 w.foodQaFixture={catalog:[current],zones:[{id:'freezer',name:'Pizza Freezer',walkOrder:1,memberSkuIds:['slider']}],lines,findings};
 w.eval(bundle);const doc=w.document;
 await until(()=>doc.querySelector('.lq-count-entry,.lq-fc-zonehead'));
 const button=pattern=>[...doc.querySelectorAll('button')].find(b=>typeof pattern==='string'?b.textContent.trim()===pattern:pattern.test(b.textContent.trim()));
 const click=async pattern=>{const b=button(pattern);assert.ok(b,'Missing '+pattern);assert.ok(!b.disabled,'Disabled '+pattern);b.click();await pause();};
 if(doc.querySelector('.lq-count-entry'))await click('Continue count');await until(()=>doc.querySelector('.lq-fc-zonehead'));
 const qa=w.foodQa,saves=()=>qa.calls.filter(c=>c.path.endsWith('/lines'));
 const input=async(label,value)=>{const e=[...doc.querySelectorAll('input')].find(e=>e.getAttribute('aria-label')===label);assert.ok(e,'Missing '+label);assert.ok(!e.disabled);e.focus();Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new w.Event('input',{bubbles:true}));e.dispatchEvent(new w.Event('change',{bubbles:true}));e.blur();await pause();};
 const hear=async entries=>{await click(/Talk through/);qa.recorder.segment(entries.map(e=>e.spoken).join('. '),0);await pause();assert.equal(qa.extracts.at(-1).body.foodUnitsVersion,6);qa.extracts.at(-1).succeed(entries);await pause();await click(/Stop & review/);qa.recorder.finish('synthetic food precision');await until(()=>doc.querySelectorAll('.lq-fc-voice-review-row').length===entries.length);};
 // Jon, 2026-10-09: "Ask: add or replace." A product the shelf already holds asks first.
 const restate=async choice=>{const b=[...doc.querySelectorAll('.lq-fc-rev-restate button')].find(b=>b.textContent.trim().startsWith(choice+':'));assert.ok(b,'No add-or-replace '+choice);b.click();await pause();};
 const save=async()=>{await pause(950);await until(()=>saves().length);assert.equal(saves().at(-1).body.foodUnitsVersion,6);return saves().at(-1).body.lines[0];};
 return {doc,qa,button,click,input,hear,restate,save,close:()=>w.close()};
}
let passed=0;
async function run(name,fn,options){const t=await mount(options);try{await fn(t);passed++;console.log('PASS '+name);}finally{t.close();}}
await run('two buns retain raw amount and exact ratio',async t=>{await t.hear([item(2)]);await t.click(/^Add 1 item/);const l=await t.save();assert.equal(l.foodQuantity.loose[0].quantity,'2');assert.equal(l.foodQuantity.loose[0].denominator,'192');assert.equal(l.qtyUnits,2/192);assert.match(t.doc.querySelector('.lq-fc-row-total').textContent,/2 buns/);});
await run('reopened one bun plus two is three buns',async t=>{await t.hear([item(2)]);assert.match(t.doc.querySelector('.lq-fc-rev-restate').textContent,/Add to the 1 bun already here, or replace\?Add: 3 buns totalReplace: 2 buns/);await t.restate('Add');await t.click(/^Add 1 item/);const l=await t.save();assert.equal(l.qtyUnits,3/192);assert.equal(l.foodQuantity.loose[0].quantity,'3');},{lines:[line(physical('1'),1/192)]});
await run('reopened one bun replaced by two is exactly two buns',async t=>{await t.hear([item(2)]);await t.restate('Replace');await t.click(/^Add 1 item/);const l=await t.save();assert.equal(l.qtyUnits,2/192);assert.equal(l.foodQuantity.loose.length,1);assert.equal(l.foodQuantity.loose[0].quantity,'2');assert.equal(l.foodQuantity.loose[0].denominator,'192');},{lines:[line(physical('1'),1/192)]});
await run('mixed case and buns retain both physical amounts',async t=>{await t.hear([item(2,1)]);await t.click(/^Add 1 item/);const l=await t.save();assert.equal(l.qtyUnits,1+2/192);assert.equal(l.foodQuantity.loose.find(p=>p.unit==='case').quantity,'1');assert.equal(l.foodQuantity.loose.find(p=>p.unit==='bun').quantity,'2');});
await run('raw bun edit replaces amount through frozen factor',async t=>{await t.input('Sample Slider Bun: loose buns','3');const l=await t.save();assert.equal(l.qtyUnits,3/192);assert.equal(l.foodQuantity.loose[0].quantity,'3');},{lines:[line(physical())]});
await run('explicit zero remains answered',async t=>{await t.input('Sample Slider Bun: loose buns','0');const l=await t.save();assert.equal(l.qtyUnits,0);assert.equal(l.foodQuantity.loose[0].quantity,'0');},{lines:[line(physical())]});
await run('changed factor keeps separate frozen components',async t=>{await t.hear([item(2)]);await t.restate('Add');await t.click(/^Add 1 item/);const l=await t.save();assert.equal(l.foodQuantity.loose.length,2);assert.ok(Math.abs(l.qtyUnits-(1/192+2/200))<1e-15);assert.equal(t.doc.querySelectorAll('.lq-fc-grid input').length,2);},{lines:[line(physical('1'),1/192)],changedFactor:true});
await run('changed canonical basis blocks Add and retains pending row',async t=>{await t.hear([item(2)]);assert.ok(t.button(/^Add 0 items/).disabled);assert.match(t.doc.querySelector('.lq-fc-voice-review-row').textContent,/counting unit changed/);assert.equal(t.doc.querySelectorAll('.lq-fc-voice-review-row').length,1);assert.equal(t.qa.lines[0].qtyUnits,String(2/192));assert.ok([...t.doc.querySelectorAll('.lq-fc-grid input')].every(e=>e.disabled));assert.ok(!t.button('Clear').disabled);},{lines:[line(physical())],changedBasis:true});
await run('legacy total is not inferred or unrounded',async t=>{await t.click(/^Finish/);await until(()=>t.qa.calls.some(c=>c.path.endsWith('/lines')));assert.equal(t.qa.lines[0].qtyUnits,.010);assert.equal(t.qa.lines[0].foodQuantity.legacyQtyUnits,'0.01');assert.equal(t.qa.lines[0].foodQuantity.loose.length,0);},{lines:[line(null,.010)]});
await run('legacy canonical residual survives adding exact buns',async t=>{await t.hear([item(2)]);await t.restate('Add');await t.click(/^Add 1 item/);const l=await t.save();assert.equal(l.foodQuantity.legacyQtyUnits,'0.01');assert.equal(l.foodQuantity.loose[0].quantity,'2');assert.ok(Math.abs(l.qtyUnits-(.010+2/192))<1e-15);},{lines:[line(null,.010)]});
await run('Clear explicitly removes precise count',async t=>{await t.click('Clear');await t.save();assert.equal(t.qa.lines.length,0);},{lines:[line(physical())]});
const finding={kind:'jump',skuId:'slider',name:sku.name,counted:3/192,prior:0,purchased:0,used:null,unitsPerCase:null,dollars:1,detail:'Synthetic review finding.'};
await run('Details correction edits physical amount through frozen factor',async t=>{await t.click(/^Finish/);await until(()=>t.doc.querySelector('.lq-fc-review-count-row'));const row=t.doc.querySelector('.lq-fc-review-count-row');assert.match(row.textContent,/2 buns/);await t.input('Loose Sample Slider Bun on Pizza Freezer','3');const l=await t.save();assert.equal(l.foodQuantity.loose[0].quantity,'3');assert.equal(l.qtyUnits,3/192);},{lines:[line(physical())],findings:[finding]});
await run('Details correction retains different frozen factors',async t=>{await t.click(/^Finish/);await until(()=>t.doc.querySelector('.lq-fc-review-count-row'));const row=t.doc.querySelector('.lq-fc-review-count-row'),inputs=[...row.querySelectorAll('input[type=number]')];assert.equal(inputs.length,2);assert.match(row.textContent,/1\/192/);assert.match(row.textContent,/1\/200/);const el=inputs[1],w=el.ownerDocument.defaultView;el.focus();Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(el,'4');el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));el.blur();await pause();const l=await t.save();assert.equal(l.foodQuantity.loose.find(p=>p.denominator==='192').quantity,'1');assert.equal(l.foodQuantity.loose.find(p=>p.denominator==='200').quantity,'4');assert.ok(Math.abs(l.qtyUnits-(1/192+4/200))<1e-15);},{lines:[line({...basis,loose:[...physical('1').loose,...physical('2','200').loose]},1/192+2/200)],changedFactor:true,findings:[finding]});
console.log(`Food precision: ${passed} passed`);
