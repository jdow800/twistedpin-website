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
    await fn({doc,click,log,fill});passed++;console.log('PASS',name);
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
console.log(`${passed} recipe UI scenarios passed (DOM simulation; no visual layout claims).`);
