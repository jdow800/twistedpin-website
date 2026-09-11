import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const bundle = await readFile(new URL('./dist/fixture.js',import.meta.url),'utf8');
const pause = () => new Promise(r=>setTimeout(r,20));
const until = async (fn) => { for(let i=0;i<100;i++){if(fn())return;await pause();} throw new Error('UI condition timed out'); };
const results=[];
async function run(name,mode,fn){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/?mode=${mode}`,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.Response=Response;
  dom.window.scrollTo=()=>{};
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  try{
    dom.window.eval(bundle);
    const doc=dom.window.document;
    await until(()=>doc.querySelector(mode==='invoice'?'.lq-match':'.lq-row-set'));
    const click=async text=>{
      const b=[...doc.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
      assert.ok(b,`Missing button: ${text}; available: ${[...doc.querySelectorAll('button')].map(b=>b.textContent.trim()).join(' | ')}`);
      b.click();await pause();
    };
    const fill=async(el,val)=>{
      assert.ok(el,'Missing input');
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(el,val);
      el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await pause();
    };
    const log=()=>doc.getElementById('audit').textContent;
    await fn({doc,click,fill,log});
    results.push({name,pass:true});console.log('PASS',name);
  }finally{dom.window.close();}
}
await run('counted rows retain both size labels; warning shows the delivery and counts','count',async({doc,click,log})=>{
  assert.deepEqual([...doc.querySelectorAll('.lq-row-set .lq-size')].map(e=>e.textContent),['750 ml','1000 ml']);
  await click('Finish & submit');
  await until(()=>doc.querySelector('[aria-label="Check bottle sizes"]'));
  const text=doc.querySelector('[aria-label="Check bottle sizes"]').textContent;
  assert.match(text,/Latest delivery: 4 × 1 L/);
  assert.match(text,/6 × 750 ml; 0 × 1 L/);
  assert.ok(!log().includes('/submit'));
  await click('Submit anyway');
  await until(()=>log().includes('/submit'));
  const saved=log().split('\n').filter(l=>l.includes('/lines')).at(-1);
  assert.match(saved,/"skuId":"750","qtyUnits":6/);
  assert.match(saved,/"skuId":"1000","qtyUnits":0/);
});
await run('correcting the delivered size clears the warning','count',async({doc,click,fill,log})=>{
  await click('Finish & submit');await until(()=>doc.querySelector('[role="dialog"]'));
  await click('Go back');
  const row=[...doc.querySelectorAll('.lq-row-set')].find(r=>r.querySelector('.lq-size')?.textContent==='1000 ml');
  await fill(row.querySelector('input.lq-qty-input'),'4');
  await click('Finish & submit');await until(()=>log().includes('/submit'));
  assert.ok(!doc.querySelector('[aria-label="Check bottle sizes"]'));
});
await run('failed saving keeps the draft open and does not submit old numbers','save-failure',async({doc,click,log})=>{
  await click('Finish & submit');await pause();
  assert.ok(!log().includes('/precheck'));assert.ok(!log().includes('/submit'));
  assert.match(doc.body.textContent,/save|offline|retry/i);
});
await run('advisory endpoint failure still permits a saved count','check-failure',async({click,log})=>{
  await click('Finish & submit');await until(()=>log().includes('/submit'));
});
await run('older API response without size warnings remains compatible','old-api',async({click,log})=>{
  await click('Finish & submit');await until(()=>log().includes('/submit'));
});
await run('invoice adds a new size without a false duplicate warning','invoice',async({doc,click,log})=>{
  assert.ok(!doc.querySelector('.lq-rev-choices'));
  await click('+ New bottle (not in the list)');
  assert.equal(doc.querySelector('input.lq-newsku-size').value,'1000');
  assert.match(doc.body.textContent,/750 ml\. 1000 ml is a separate bottle size/);
  assert.ok(!doc.body.textContent.includes('already on file'));
  await click('Create + match');await until(()=>log().includes('/new-sku'));
  assert.match(log(),/"sizeMl":1000/);
});
await run('manual invoice mismatch requires an explicit size decision','invoice',async({doc,click,fill,log})=>{
  await fill(doc.querySelector('input[type="search"]'),'Tanqueray');
  await click('Tanqueray London Dry Gin · 750ml');
  assert.match(doc.body.textContent,/The invoice says 1000 ml/);
  assert.ok(!log().includes('/match'));
  await click('Invoice size is wrong — match 750 ml');
  await until(()=>log().includes('/match'));
});
await run('same-size create/find cannot bypass the mismatch decision','invoice',async({doc,click,fill,log})=>{
  await click('+ New bottle (not in the list)');
  await fill(doc.querySelector('input.lq-newsku-size'),'750');
  await click('Match existing bottle');
  assert.match(doc.body.textContent,/The invoice says 1000 ml/);
  assert.ok(!log().includes('/match'));assert.ok(!log().includes('/new-sku'));
  await click('Add the 1000 ml bottle');
  assert.equal(doc.querySelector('input.lq-newsku-size').value,'1000');
});
await writeFile(new URL('./ui-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(`${results.length} UI behavior scenarios passed (DOM simulation; no visual layout claims).`);
