import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const bundle=await readFile(new URL('./dist/recipe-fixture.js',import.meta.url),'utf8');
const pause=()=>new Promise(r=>setTimeout(r,20));
const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await pause();}throw new Error('UI condition timed out');};
let passed=0;
async function run(name,mode,fn){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/?mode=${mode}`,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.Response=Response;dom.window.scrollTo=()=>{};
  try{
    dom.window.eval(bundle);
    const doc=dom.window.document;
    await until(()=>doc.querySelector('.lq-pw-row'));
    await pause();
    const click=async(text,index=0)=>{const button=[...doc.querySelectorAll('button')].filter(b=>b.textContent.trim()===text)[index];assert.ok(button,`Missing ${text}`);button.click();await pause();};
    const log=()=>doc.getElementById('audit').textContent;
    const fill=async(el,value)=>{assert.ok(el);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();};
    const oz=bottle=>doc.querySelector(`input[aria-label="oz of ${bottle}"]`);
    const add=async(search,bottle)=>{await fill(doc.querySelector('input[placeholder^="Add a bottle"]'),search);await click(`+ ${bottle} (1000ml)`);assert.ok(oz(bottle),`${bottle} not added`);};
    const saved=()=>log().split('\n').filter(l=>l.startsWith('POST ')&&l.includes('/option-recipes {')).map(l=>JSON.parse(l.slice(l.indexOf('{'))));
    await fn({doc,click,log,fill,oz,add,saved});passed++;console.log('PASS',name);
  }finally{dom.window.close();}
}
await run('shows source and target menus plus saved pours; does not auto-save','reuse',async({doc,log})=>{
  assert.match(doc.body.textContent,/Vodkas \(TP\).*Bar Mods/);
  assert.match(doc.body.textContent,/Liqueurs \/ Cordials/);
  assert.match(doc.body.textContent,/1 oz Jameson \(1000 ml bottle\)/);
  assert.ok(!log().includes('POST'));
});
await run('one tap saves the selected menu and Undo targets only that mapping','reuse',async({doc,click,log})=>{
  await click('Use this recipe');await until(()=>!doc.querySelector('.lq-recipe-suggestion'));
  assert.match(log(),/POST .*\/option-recipes .*"productId":"vodkas".*"optionLabel":"Green Tea Shot".*"oz":1/);
  await click('Undo');await until(()=>doc.querySelector('.lq-recipe-suggestion'));
  assert.match(log(),/POST .*\/unclassify .*"productId":"vodkas"/);
  assert.ok(!log().includes('"productId":"cordials"'));
});
await run('failed save retains the suggestion and shows a retry error','save-failure',async({doc,click})=>{
  await click('Use this recipe');assert.ok(doc.querySelector('.lq-pw-row'));
  assert.match(doc.body.textContent,/Couldn't save the recipe/);
});
await run('Edit first opens the saved pours and permits an explicit change','reuse',async({doc,click,fill,log})=>{
  await click('Edit first');const input=doc.querySelector('input[aria-label="oz of Jameson"]');assert.equal(input?.value,'1');
  assert.ok(!log().includes('POST'));await fill(input,'1.5');await click('Save recipe');
  assert.match(log(),/"oz":1.5/);
});
await run('conflicting recipes remain separate choices and save the chosen pour','conflicting',async({doc,click,log})=>{
  assert.equal(doc.querySelectorAll('.lq-recipe-suggestion').length,2);
  await click('Use this recipe',1);assert.match(log(),/"oz":2/);
});
for(const mode of ['none','lookup-failure']) await run(`manual builder remains available: ${mode}`,mode,async({doc,click,log})=>{
  assert.ok(!doc.querySelector('.lq-recipe-suggestion'));await click('Build recipe');assert.ok(doc.querySelector('input[placeholder^="Add a bottle"]'));
  assert.ok(!log().includes('POST'));
});
await run('a standalone drink can reuse an option recipe with its own product binding','cocktail',async({click,log})=>{
  await click('Use this recipe');assert.match(log(),/"productId":"shot","optionLabel":""/);
});

// Pour defaults (2026-10-03). Every added bottle used to start at 1.5 oz and
// saved that way unless someone noticed. Now only the first bottle of an option
// whose label states one pour starts filled in; everything else starts empty
// and Save asks for it.
const as=(mode,label)=>`${mode}&label=${encodeURIComponent(label)}`;
const asks=async({doc,click,saved},bottle)=>{
  await click('Save recipe');
  assert.match(doc.body.textContent,new RegExp(`Enter a pour size for ${bottle}\\.`));
  assert.equal(saved().length,0,'nothing saved without a pour');
};
await run('"Tanqueray 2oz": the first bottle starts at the 2 oz the label states, and saves as 2',as('none','Tanqueray 2oz'),async({click,oz,add,saved})=>{
  await click('Build recipe');await add('tanq','Tanqueray');assert.equal(oz('Tanqueray').value,'2');
  await click('Save recipe');
  assert.deepEqual(saved().map(b=>[b.optionLabel,b.components]),[['Tanqueray 2oz',[{skuId:'tanqueray',oz:2}]]]);
});
await run('a second bottle starts empty, and Save asks for its pour until one is typed',as('none','Tanqueray 2oz'),async(t)=>{
  const {click,fill,oz,add,saved}=t;
  await click('Build recipe');await add('tanq','Tanqueray');await add('jame','Jameson');
  assert.equal(oz('Tanqueray').value,'2');assert.equal(oz('Jameson').value,'');assert.equal(oz('Jameson').placeholder,'pour');
  await asks(t,'Jameson');
  await fill(oz('Jameson'),'0.5');await click('Save recipe');
  assert.deepEqual(saved().map(b=>b.components),[[{skuId:'tanqueray',oz:2},{skuId:'jameson',oz:0.5}]]);
});
await run('a label with no pour ("Double Tito\'s") starts its first bottle empty, and Save asks until a pour is typed',as('none',"Double Tito's"),async(t)=>{
  const {click,fill,oz,add,saved}=t;
  await click('Build recipe');await add('tito',"Tito's");
  assert.equal(oz("Tito's").value,'');assert.equal(oz("Tito's").placeholder,'pour');
  await asks(t,"Tito's");
  await fill(oz("Tito's"),'3');await click('Save recipe');
  assert.deepEqual(saved().map(b=>b.components),[[{skuId:'titos',oz:3}]]);
});
await run('a cocktail starts its first bottle empty, even with a size in its name ("Tito\'s Lemonade 16oz")',as('cocktail',"Tito's Lemonade 16oz"),async(t)=>{
  const {click,fill,oz,add,saved}=t;
  await click('Build a different recipe');await add('tito',"Tito's");assert.equal(oz("Tito's").value,'');
  await asks(t,"Tito's");
  await fill(oz("Tito's"),'1.5');await click('Save recipe');
  assert.deepEqual(saved().map(b=>[b.productId,b.optionLabel,b.components]),[['shot','',[{skuId:'titos',oz:1.5}]]]);
});
for(const label of ['Tanqueray 1/2 oz','Tanqueray 1-2 oz']) await run(`"${label}" states no single pour, so the first bottle starts empty`,as('none',label),async(t)=>{
  await t.click('Build recipe');await t.add('tanq','Tanqueray');assert.equal(t.oz('Tanqueray').value,'');
  await asks(t,'Tanqueray');
});
await run('Edit first keeps a saved recipe\'s pours, not the 2 oz the label states',as('pair','Tanqueray 2oz'),async({click,oz,saved})=>{
  await click('Edit first');assert.equal(oz('Tanqueray').value,'1.25');assert.equal(oz("Tito's").value,'0.75');
  assert.equal(saved().length,0);
});
await run('reusing a saved recipe in the builder keeps its pours; a bottle added after them starts empty',as('pair','Tanqueray 2oz'),async(t)=>{
  const {click,fill,oz,add,saved}=t;
  await click('Build a different recipe');await click("Vesper: 1.25 oz Tanqueray, 0.75 oz Tito's");
  assert.equal(oz('Tanqueray').value,'1.25');assert.equal(oz("Tito's").value,'0.75');
  await add('jame','Jameson');assert.equal(oz('Jameson').value,'');
  await asks(t,'Jameson');
  await fill(oz('Jameson'),'0.5');await click('Save recipe');
  assert.deepEqual(saved().map(b=>b.components),[[{skuId:'tanqueray',oz:1.25},{skuId:'titos',oz:0.75},{skuId:'jameson',oz:0.5}]]);
});
console.log(`${passed} recipe UI scenarios passed (DOM simulation; no visual layout claims).`);
