// The invoice screen never spins forever (2026-10-06: the list request sat 300 s at the proxy, twice).
// Bundles the actual Invoices screen; every request is answered by invoice-fixture.jsx.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const bundle=await readFile(new URL('./dist/invoice-fixture.js',import.meta.url),'utf8');
const pause=(ms=20)=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,what)=>{for(let i=0;i<200;i++){if(fn())return;await pause();}throw new Error('UI condition timed out: '+what);};
let passed=0;
async function run(name,mode,fn){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/?mode=${mode}`,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.Response=Response;
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  // The 25 s read deadline (api.ts INVOICE_READ_TIMEOUT_MS) elapses in 40 ms here.
  const realTimeout=dom.window.setTimeout.bind(dom.window);
  dom.window.setTimeout=(cb,ms,...rest)=>realTimeout(cb,ms>=20000?40:ms,...rest);
  try{
    dom.window.eval(bundle);
    const doc=dom.window.document;
    const button=text=>[...doc.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
    await fn({doc,button});passed++;console.log('PASS',name);
  }finally{dom.window.close();}
}
await run('an emailed invoice opens even while the list never answers','stall-list',async({doc})=>{
  await until(()=>doc.querySelector('.lq-invd'),'invoice detail');
  assert.ok(!doc.body.textContent.includes('Loading invoices'));
  assert.ok(doc.querySelector('.lq-invd-questions')||doc.querySelector('.lq-invd'));
});
await run('a list that never answers ends in Try again, and Try again loads it','stall-list-nolink',async({doc,button})=>{
  await until(()=>doc.body.textContent.includes("Couldn't load invoices"),'error state');
  assert.ok(button('Back'),'Back stays available');
  button('Try again').click();
  await until(()=>doc.querySelector('.lq-invlist'),'invoice list after Try again');
  assert.ok(doc.querySelector('.lq-invrow'),'the invoice row is listed');
});
await run('an item list that fails says so at the match search, and Try again recovers it','catalog-fail',async({doc,button})=>{
  await until(()=>doc.querySelector('.lq-invd'),'invoice detail');
  await until(()=>doc.body.textContent.includes("The item list didn't load"),'item list error');
  assert.ok(!doc.body.textContent.includes('No items found in either inventory'));
  button('Try again').click();
  await until(()=>!doc.body.textContent.includes("The item list didn't load")&&!doc.body.textContent.includes('Loading the item list'),'item list recovered');
});
console.log(`Invoice loading: ${passed} cases passed`);
