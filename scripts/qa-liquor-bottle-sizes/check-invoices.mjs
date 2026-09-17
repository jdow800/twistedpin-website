import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const bundle=await readFile(new URL('./dist/invoice-fixture.js',import.meta.url),'utf8');
const pause=()=>new Promise(r=>setTimeout(r,20));
const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await pause();}throw new Error('UI condition timed out');};
let passed=0;
const confirm='Review complete — confirm invoice';
async function run(name,mode,fn){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/?mode=${mode}`,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.Response=Response;
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  try{
    dom.window.eval(bundle);
    const doc=dom.window.document;
    await until(()=>doc.querySelector('.lq-invd'));await pause();
    const button=text=>[...doc.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
    const click=async(text)=>{assert.ok(button(text),`Missing button: ${text}`);button(text).click();await pause();};
    const log=()=>doc.getElementById('audit').textContent;
    await fn({doc,button,click,log,dom});passed++;console.log('PASS',name);
  }finally{dom.window.close();}
}
await run('credit reason precedes totals, links the original and never auto-confirms','credit',async({doc,button,log})=>{
  const panel=doc.querySelector('.lq-invd-review');
  assert.match(panel.textContent,/2x empties -40/);assert.match(panel.textContent,/deposit credit/);
  assert.match(panel.textContent,/expected vendor charge after their office processes the invoice/);
  assert.match(panel.textContent,/does not record an adjusted charge or verify the vendor's actual charge/);
  assert.ok(button('Review invoice items'));assert.ok(!button('Check delivered quantities'));
  assert.ok(panel.compareDocumentPosition(doc.querySelector('.lq-invd-totals')) & 4);
  assert.match(panel.querySelector('a').href,/test-page/);assert.ok(!log().includes('POST'));
  assert.ok(!doc.body.textContent.includes('Every bottle is matched'));
  assert.ok(!doc.querySelector('details').open);
});
await run('keg category estimate offers View item and focuses a real row','credit',async({doc,button,click})=>{
  assert.ok(!button('Match product'));await click('View item');
  assert.equal(doc.activeElement.id,'inv-line-test-keg');
});
await run('explicit confirmation clears the review and keeps the original notes','credit',async({doc,click,log})=>{
  await click(confirm);await until(()=>!doc.querySelector('.lq-invd-review'));
  assert.match(doc.querySelector('.lq-badge').textContent,/Confirmed/);
  assert.equal(log().split('\n').filter(x=>x.startsWith('POST')).length,1);
  assert.match(doc.body.textContent,/2x empties -40/);
});
await run('failed confirmation keeps the reason and a visible retry error','confirm-failure',async({doc,click})=>{
  await click(confirm);assert.ok(doc.querySelector('.lq-invd-review'));
  assert.match(doc.querySelector('[role=alert]').textContent,/Could not confirm/);
});
await run('a missing product match gets the match action and cannot be confirmed','unmatched',async({doc,button,click})=>{
  assert.match(doc.querySelector('.lq-invd-review').textContent,/1 item needs a catalog match/);
  assert.ok(!button(confirm));assert.ok(button('Match product'));
  await click('Go to items needing a match');assert.equal(doc.activeElement.id,'inv-line-test-keg');
  assert.ok(doc.querySelector('input[placeholder="Search a bottle to match…"]'));
});
await run('row handwriting is visible and opens an unfilled received-quantity control','marked',async({doc,log})=>{
  assert.match(doc.querySelector('.lq-invd-review').textContent,/One keg short/);
  assert.equal(doc.querySelector('.lq-invd-recvd input').value,'');assert.ok(!log().includes('POST'));
});
await run('duplicate explains exclusion and has no confirmation action','duplicate',async({doc,button})=>{
  assert.match(doc.querySelector('.lq-invd-review').textContent,/duplicates invoice ORIGINAL-DEMO/);
  assert.ok(!button(confirm));
});
await run('total difference has a concrete amount and comparison instruction','totals',async({doc})=>{
  assert.match(doc.querySelector('.lq-invd-review').textContent,/differ by \$10.00/);
});
for(const mode of ['old-flag','old-api'])await run(`older flag stays reviewable without inventing a cause: ${mode}`,mode,async({doc,button})=>{
  assert.match(doc.querySelector('.lq-invd-review').textContent,/No specific review reason/);assert.ok(button(confirm));
  assert.ok(!doc.querySelector('.lq-invd-review').textContent.includes('Signature present'));
});
await run('missing image gives a paper/vendor-copy instruction','no-image',async({doc})=>{
  assert.match(doc.querySelector('.lq-invd-review').textContent,/paper receipt or vendor copy/);
});
await run('already confirmed invoices do not show an open review','confirmed',async({doc,button})=>{
  assert.ok(!doc.querySelector('.lq-invd-review'));assert.ok(!button(confirm));
});
await run('re-reading disables review until extraction finishes','credit',async({doc,click,button,log})=>{
  await click('Read invoice again');assert.ok(!doc.querySelector('.lq-invd-review'));assert.ok(!button(confirm));
  assert.match(doc.querySelector('[role=status]').textContent,/Re-reading now/);
  assert.ok(!log().includes('/clear-flag'));
});
await run('scan text renders as text, never markup','escaped',async({doc})=>{
  const panel=doc.querySelector('.lq-invd-review');assert.ok(!panel.querySelector('img'));
  assert.match(panel.textContent,/<img src=x/);
});
console.log(`${passed} invoice UI scenarios passed (DOM simulation; no visual layout claim).`);
