// Jon, 2026-11-02: "out of stock items we don't really need to inventory or create line items for - as.... we aint
// counting it." On 10/20 the invoice screen offered "+ New item" on Sysco 924612767's not-shipped Koppert shiso line,
// with no "Did you mean" (the long description buried "shiso"), and a second shiso item was made.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const bundle=await readFile(new URL('./dist/invoice-fixture.js',import.meta.url),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await pause();}throw Error('Out-of-stock UI condition timed out');};
let passed=0;
async function run(name,mode,fn){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/?mode=${mode}`,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.Response=Response;dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  try {
    dom.window.eval(bundle);const doc=dom.window.document;
    await until(()=>doc.querySelector('.lq-invd'));
    const buttons=()=>[...doc.querySelectorAll('button')].map(b=>b.textContent.trim());
    await fn({doc,buttons});passed++;console.log('PASS',name);
  }finally{dom.window.close();}
}
await run('an out-of-stock line says so and offers no match, no new item and no question','out-of-stock',async({doc,buttons})=>{
  assert.match(doc.body.textContent,/Out of stock · not delivered, not counted/);
  assert.ok(!buttons().some(b=>/New item/.test(b)),'no New item');
  assert.ok(!doc.querySelector('input[type=search]'),'no item search');
  assert.ok(!doc.querySelector('input[type=radio]'),'no category choice');
  assert.doesNotMatch(doc.body.textContent,/needs match|need a catalog match/);
});
await run('a shipped shiso line suggests Shiso (fresh) from its one rare word','suggest-shiso',async({doc,buttons})=>{
  const inventory=doc.querySelector('input[type=radio][value="inventory"]');
  if(inventory){inventory.click();await pause();}
  await until(()=>/Did you mean/.test(doc.body.textContent));
  const suggested=[...doc.querySelectorAll('.lq-rev-choices button')].map(b=>b.textContent.trim());
  assert.deepEqual(suggested,['Shiso (fresh)'],`suggestions: ${suggested.join(' | ')}`);
});
console.log(`${passed} out-of-stock scenarios passed`);
