import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const {JSDOM}=process.env.COGS_QA_DEPS ? createRequire(join(resolve(process.env.COGS_QA_DEPS),'package.json'))('jsdom') : await import('jsdom');
const bundle=await readFile(new URL('./dist/food-recipes-fixture.js',import.meta.url),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(test,what){for(let i=0;i<200;i++){if(test())return;await pause();}throw Error(`${what} timed out`);}
let passed=0;
async function run(name,query,test){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/?${query}`,runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.Response=Response;dom.window.scrollTo=()=>{};
 try{dom.window.eval(bundle);const doc=dom.window.document;await until(()=>doc.querySelector('[aria-label="Recipe editor"]'),'Recipe editor');
  const text=()=>doc.body.textContent.replace(/\s+/g,' '), button=name=>[...doc.querySelectorAll('button')].find(b=>b.textContent.trim()===name);
  const type=async(label,value)=>{const el=doc.querySelector(`[aria-label="${label}"]`);assert.ok(el,label);
   const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;
   Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await pause();};
  const click=async name=>{const b=button(name);assert.ok(b,name);assert.ok(!b.disabled,`${name} disabled`);b.click();await pause();};
  await test({doc,text,button,type,click,qa:dom.window.frQa});console.log(`PASS ${name}`);passed++;
 }finally{dom.window.close();}
}
await run('full ingredient picker, cost completeness, stable recipe identity and source roundtrip','',async t=>{
 assert.match(t.text(),/Ingredient cost \$2\.00/);
 assert.ok([...t.doc.querySelector('[aria-label="Add food ingredient"]').options].some(o=>o.text.includes('Fries unreferenced')));
 assert.ok(t.doc.querySelector('[aria-label="Recipe product ID"]').disabled);
 await t.type('Ingredient quantity 1','7');await t.type('Recipe change reason','Measured portion is seven ounces');await t.click('Save recipe');
 await until(()=>t.text().includes('Recipe saved.'),'Save recipe');
 const call=t.qa.calls.find(c=>c.method==='PUT');assert.equal(call.body.recipeId,'r-pizza');assert.equal(call.body.expectedRevision,'a'.repeat(64));
 assert.equal(call.body.lines[0].id,'line-cheese');assert.equal(call.body.lines[0].basis,'Opsi recipe reviewed');assert.equal(call.body.note,'Keep source history');
 await t.type('Add food ingredient','sku-missing');assert.match(t.text(),/Partial ingredient cost.*Missing cost ingredient/);
});
await run('staff can inspect but cannot change recipes or yields','admin=0&yield=1',async t=>{
 assert.ok(t.doc.querySelector('[aria-label="Recipe editor"] fieldset').disabled);
 assert.ok(t.doc.querySelector('[aria-label="Ingredient yield"] fieldset').disabled);
 assert.equal(t.qa.calls.filter(c=>c.method!=='GET').length,0);
});
await run('stale save preserves the draft and asks for a reload','mode=conflict',async t=>{
 await t.type('Ingredient quantity 1','9');await t.type('Recipe change reason','Portion correction');await t.click('Save recipe');
 await until(()=>t.text().includes('This record changed.'),'Conflict');assert.equal(t.doc.querySelector('[aria-label="Ingredient quantity 1"]').value,'9');
 assert.equal(t.qa.calls.filter(c=>c.method==='PUT').length,1);
});
await run('unmapped option deep link opens a new recipe with the exact sales key','key=gotab%3A123%3A%3Aextra%20cheese',async t=>{
 assert.equal(t.doc.querySelector('[aria-label="Recipe product ID"]').value,'123');assert.equal(t.doc.querySelector('[aria-label="Recipe option label"]').value,'extra cheese');
 assert.equal(t.doc.querySelector('[aria-label="Recipe kind"]').value,'change');assert.equal(t.doc.querySelector('[aria-label="Recipe dish name"]').value,'Pizza');
});
await run('yield save records the physical revision and a reason','yield=1',async t=>{
 await until(()=>t.doc.querySelector('[aria-label="Ingredient yield"]'),'Yield editor');
 await t.type('Ingredient yield amount','160');await t.type('Yield change reason','Verified full bag');await t.click('Save yield');
 await until(()=>t.qa.calls.some(c=>c.method==='PATCH'),'Yield write');const c=t.qa.calls.find(c=>c.method==='PATCH');assert.equal(c.body.expectedRevision,'b'.repeat(64));assert.equal(c.body.yield,160);
});
await run('a yield refresh cannot rebase an unsaved recipe over another admin revision','yield=1&mode=yield-race',async t=>{
 await t.type('Ingredient quantity 1','9');await t.type('Recipe change reason','My measured portion');t.qa.otherAdminEdits();
 await t.type('Ingredient yield amount','160');await t.type('Yield change reason','Verified full bag');await t.click('Save yield');await until(()=>t.text().includes('Yield saved.'),'Yield refresh');
 assert.equal(t.doc.querySelector('[aria-label="Ingredient quantity 1"]').value,'9');await t.click('Save recipe');await until(()=>t.text().includes('This recipe changed.'),'Stale recipe conflict');
 const put=t.qa.calls.find(c=>c.method==='PUT');assert.equal(put.body.recipeId,'r-pizza');assert.equal(put.body.expectedRevision,'a'.repeat(64));assert.equal(t.qa.recipes[0].lines[0].qty,12);assert.equal(t.doc.querySelector('[aria-label="Ingredient quantity 1"]').value,'9');
});
await run('cup quantities convert to fluid ounces and quantity-only edits retain the unit','mode=cup',async t=>{
 assert.equal(t.doc.querySelector('[aria-label="Ingredient unit 1"]').value,'cup');assert.match(t.text(),/Ingredient cost \$2\.00/);await t.type('Ingredient quantity 1','2');assert.match(t.text(),/Ingredient cost \$4\.00/);
 await t.type('Recipe change reason','Two measured cups');await t.click('Save recipe');await until(()=>t.text().includes('Recipe saved.'),'Cup save');const put=t.qa.calls.find(c=>c.method==='PUT');assert.equal(put.body.lines[0].unit,'cup');assert.equal(put.body.lines[0].qty,2);
});
await run('an obsolete counting definition cannot be used to set a yield','mode=invalid-basis&yield=1',async t=>{
 await until(()=>t.doc.querySelector('[aria-label="Ingredient yield"]'),'Yield editor');assert.ok(t.doc.querySelector('[aria-label="Ingredient yield"] fieldset').disabled);assert.match(t.text(),/saved counting definition no longer matches/);assert.doesNotMatch(t.doc.querySelector('[aria-label="Ingredient yield"]').textContent,/One bag/);
});
await run('an existing option keeps its stable identity and original printed label','key=gotab%3A123%3A%3Aextra%20cheese%20%281st%29',async t=>{
 await t.type('Ingredient quantity 1','3');await t.type('Recipe change reason','Measured half-pizza amount');await t.click('Save recipe');
 await until(()=>t.qa.calls.some(c=>c.method==='PUT'),'Option save');const call=t.qa.calls.find(c=>c.method==='PUT');
 assert.equal(call.body.recipeId,'r-option');assert.equal(call.body.optionLabel,'Extra Cheese (1st)');assert.equal(call.body.lines[0].id,'line-option');assert.equal(call.body.note,'Keep the half-pizza tag');
});
await run('historical correction sends one atomic request after verifying both frozen units','count=count-b',async t=>{
 await until(()=>t.doc.querySelector('[aria-label="Correct Cheese"]'),'Historical review');
 assert.ok(t.doc.querySelector('[aria-label="Correct Changed package"]').disabled);
 t.doc.querySelector('[aria-label="Correct Cheese"]').click();await pause();await t.type('Corrected amount for Cheese','160');
 await t.type('Historical correction reason','Measured historical bag is 160 oz');assert.ok(t.button('Save both corrected reports').disabled);
 t.doc.querySelector('[aria-label="Physical yield verified"]').click();await pause();await t.click('Save both corrected reports');
 await until(()=>t.text().includes('Food variance v2 and Food cost v3 saved together.'),'Both versions');
 const post=t.qa.calls.filter(c=>c.method==='POST');assert.equal(post.length,1);assert.equal(post[0].body.physicalBasisConfirmed,true);assert.equal(post[0].body.expectedRevision,'e'.repeat(64));assert.equal(post[0].body.changes[0].expectedRevision,'f'.repeat(64));assert.equal(post[0].body.changes[0].yield,160);
 assert.ok(t.doc.querySelector('a[href="/cogs/?view=foodvariance&count=count-b"]'));assert.ok(t.doc.querySelector('a[href="/cogs/?view=foodcost&count=count-b"]'));
});
console.log(`${passed} food recipe QA scenarios passed`);
