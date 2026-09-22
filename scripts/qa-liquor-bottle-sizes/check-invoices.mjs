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
  assert.ok(doc.querySelector('input[placeholder="Search items"]'));
});
await run('row handwriting is visible and opens an unfilled received-quantity control','marked',async({doc,log})=>{
  assert.match(doc.querySelector('.lq-invd-review').textContent,/One keg short/);
  assert.equal(doc.querySelector('.lq-invd-recvd input').value,'');assert.ok(!log().includes('POST'));
});
await run('deposit-only invoice keeps its notes without asking for a delivery review','deposit-info',async({doc,log})=>{
  assert.ok(!doc.querySelector('.lq-invd-review'));
  const deposit=doc.getElementById('inv-line-test-deposit');
  assert.match(deposit.textContent,/2 empties returned, credit \$40/);
  assert.match(deposit.textContent,/kept for reference/);
  assert.ok(!deposit.textContent.includes('Count the shelf'));assert.ok(!log().includes('POST'));
});
await run('a deposit return cannot hide a crossed-off full keg','mixed-deposit',async({doc})=>{
  const panel=doc.querySelector('.lq-invd-review');
  assert.match(panel.textContent,/Crossed off, not delivered/);
  assert.ok(!panel.textContent.includes('2 empties returned'));
  assert.equal(doc.querySelector('.lq-invd-recvd input').value,'');
  assert.match(doc.getElementById('inv-line-test-keg').textContent,/enter 0 if none was delivered/);
});
await run('saving zero delivered refreshes product cost, preserves the bill and can be corrected','marked',async({doc,dom,click,log})=>{
  const input=doc.querySelector('.lq-invd-recvd input');
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'0');
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();
  await click('Save');
  await until(()=>doc.body.textContent.includes('Product cost after shortage: $0.00'));
  assert.match(doc.querySelector('.lq-invd-totals').textContent,/\$180.00/);
  assert.match(doc.querySelector('.lq-buk').textContent,/\$140.00 not delivered, excluded from product cost/);
  assert.ok(!log().includes('/clear-flag'));
  await click('change');await click('clear');
  await until(()=>!doc.body.textContent.includes('Product cost after shortage:'));
  assert.match(doc.querySelector('.lq-buk').textContent,/\$140.00 estimated/);
});
await run('a saved shortage with a failed cost refresh shows a recovery instruction','refresh-failure',async({doc,dom,click})=>{
  const input=doc.querySelector('.lq-invd-recvd input');
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'0');
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();
  await click('Save');
  await until(()=>doc.querySelector('[role=alert]'));
  assert.match(doc.querySelector('[role=alert]').textContent,/Saved, but the cost breakdown could not refresh/);
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

async function enter(dom,input,value) {
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();
}
async function select(dom,input,value) {
  input.value=value;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await pause();
}
await run('food invoice search reaches both catalogs and accepts common pepperoni spelling','food',async({doc,dom,log})=>{
  const input=doc.querySelector('input[placeholder="Search items"]');assert.ok(input);
  for(const [query,name] of [['pepperoni','Peperoni Sliced'],['saus','Italian Sausage'],['wing','Chicken Wings Boneless'],["tito","Tito's Vodka"]]) {
    await enter(dom,input,query);assert.match(doc.querySelector('.lq-rev-assign').textContent,new RegExp(name));
  }
  await enter(dom,input,'nothing like this');assert.match(doc.body.textContent,/No items found in either inventory/);
  assert.ok(!log().includes('POST'));assert.ok(!doc.body.textContent.includes('New bottle'));
});
await run('new food item requires inventory and unit choices and posts the selected scope','food',async({doc,dom,click,button,log})=>{
  await click('+ New item (not in the list)');assert.ok(button('Create + match').disabled);
  await select(dom,doc.querySelector('[aria-label="Inventory for new item"]'),'food');
  await select(dom,doc.querySelector('[aria-label="Count unit for new item"]'),'pack');
  await select(dom,doc.querySelector('[aria-label="Cost category for new item"]'),'food');
  assert.ok(!button('Create + match').disabled);await click('Create + match');
  assert.match(log(),/"section":"food"/);assert.match(log(),/"countUnit":"pack"/);
  assert.match(doc.body.textContent,/possible unit mismatch/);
});
await run('linked scan shows the comparison and disables edits on the excluded copy','linked',async({doc,button,click,log})=>{
  assert.match(doc.body.textContent,/Compare invoice and delivery/);assert.match(doc.body.textContent,/110LB/);
  assert.match(doc.body.textContent,/not evidence of a product shortage/);
  assert.ok(button('Match items or correct the purchase record'));
  assert.ok(!doc.querySelector('input[placeholder="Search items"]'));assert.ok(!button('Came up short?'));
  assert.ok(!log().includes('POST'));await click('Both copies checked; corrections recorded');
  await until(()=>doc.body.textContent.includes('Comparison reviewed'));
  assert.match(log(),/copy-review/);assert.ok(!log().includes('/received'));
});
await run('stale comparison leaves an actionable retry error','linked-stale',async({doc,click})=>{
  await click('Both copies checked; corrections recorded');
  assert.match(doc.querySelector('[role=alert]').textContent,/Reopen the invoice/);
  assert.ok(!doc.body.textContent.includes('Comparison reviewed'));
});
console.log('Invoice catalog and copy-review checks passed');
