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
await run('a known item with an amount question does not ask for another match','amount',async({doc,button})=>{
  assert.match(doc.querySelector('.lq-invd-questions').textContent,/line amount does not reconcile/);
  assert.ok(!doc.querySelector('input[placeholder="Search items"]'));
  assert.ok(!doc.body.textContent.includes('needs a catalog match'));assert.ok(doc.querySelector('.lq-invd-questions'));
});
await run('an excluded supply keeps its dollars without a stock matching prompt','expense',async({doc,click,log})=>{
  await click('Expense as supplies (not counted)');
  await until(()=>doc.body.textContent.includes('Expense · supplies'));
  assert.ok(!doc.querySelector('input[placeholder="Search items"]'));
  assert.match(doc.querySelector('.lq-invd-amt').textContent,/50.00/);assert.match(log(),/\/expense/);
});
for(const mode of ['remember-unit','remember-failure']) await run('saved package answer '+mode,mode,async({doc,click,dom,log})=>{

  const input=doc.querySelector('[aria-label="Count units per billed case"]');
  assert.equal(input.value,'');
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'2');
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();
  assert.match(doc.body.textContent,/\$25 per pack/);
  await click('Save package answer');
  assert.match(log(),/"unitsPerBilledUnit":2/);assert.match(log(),/"expectedPackageKey":"2\|5LB\|"/);
  if(mode==='remember-failure')assert.match(doc.querySelector('[role=alert]').textContent,/Could not save this package answer/);
  else await until(()=>!doc.querySelector('.lq-invd-hold'));
});
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
  assert.match(doc.querySelector('.lq-badge').textContent,/No questions remaining/);
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
await run('saved invoices cannot be sent through a replacing re-read','credit',async({button})=>{
  assert.ok(!button('Read invoice again'));assert.ok(!button('Retry reading invoice'));
});
await run('an empty failed read can retry without confirming receipt','failed-empty',async({doc,click,button,log})=>{
  await click('Retry reading invoice');assert.ok(!button(confirm));
  assert.match(doc.body.textContent,/Retrying now/);
  assert.ok(!log().includes('/clear-flag'));
});
await run('stale retry surfaces protection instead of claiming the image was purged','retry-protected',async({doc,click})=>{
  await click('Retry reading invoice');
  assert.match(doc.body.textContent,/saved details.*protected/);
  assert.ok(!doc.querySelector('[role=status]').textContent.includes('purged'));
});
await run('retry without a stored image is disabled','failed-no-image',async({button})=>{
  assert.ok(button('Retry reading invoice').disabled);
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
  assert.match(doc.body.textContent,/Check the inventory price/);
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

for (const mode of ['automatic','automatic-stale']) await run('automatic answer correction '+mode,mode,async({doc,click,dom,log})=>{
  await until(()=>doc.body.textContent.includes('Handled automatically'));
  assert.match(doc.body.textContent,/1 billed case = 4 pack/);
  await click('Correct unit');
  const input=doc.querySelector('[aria-label="Correct units per billed case"]');
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'8');
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();
  await click('Save correction');
  assert.match(log(),/"unitsPerCase":8/);assert.match(log(),/"token":"aaaaaaaa/);
  if(mode==='automatic-stale')assert.match(doc.querySelector('[role=alert]').textContent,/This answer changed/);
  else await until(()=>doc.body.textContent.includes('Current price corrected from $20.00 to $10.00'));
});

await run('a matching final settles a shortage without asking staff to confirm it again','linked-auto',async({doc,button,log})=>{
  assert.match(doc.body.textContent,/Copies agree automatically/);
  assert.match(doc.body.textContent,/Original paper line: 2.*40.00, crossed out/);
  assert.ok(!button('Both copies checked; corrections recorded'));
  assert.ok(!button(confirm));assert.ok(!log().includes('POST'));
});
await run('ordinary matching copies explain the evidence without pretending to be a supplier final','linked-agree',async({doc,button,log})=>{
  const panel=doc.querySelector('[aria-label="Invoice and delivery comparison"]');
  assert.match(panel.textContent,/Copies agree automatically/);
  assert.match(panel.textContent,/Both copies agree on the billed items, packages, charges and totals/);
  assert.ok(!panel.textContent.includes("supplier's final"));
  assert.ok(!button('Both copies checked; corrections recorded'));assert.ok(!button(confirm));
  assert.ok(!log().includes('POST'));
});
await run('an incomplete reading asks about source pages instead of assuming a shortage','linked-question',async({doc,button,log})=>{
  const panel=doc.querySelector('[aria-label="Invoice and delivery comparison"]');
  assert.match(panel.textContent,/Check the invoice reading/);
  assert.match(panel.textContent,/saved lines do not reconcile/);
  assert.match(panel.textContent,/before treating missing rows as a delivery shortage/);
  assert.ok(button('Both copies checked; corrections recorded'));assert.ok(!log().includes('POST'));
});
await run('an automatic deposit credit shows the arithmetic and remains correctable','deposit-auto',async({doc,button,log})=>{
  assert.match(doc.querySelector('[aria-label="Invoice explanation"]').textContent,/180.00.*40.00.*140.00 due/);
  assert.match(doc.querySelector('.lq-invd-totals').textContent,/Amount due/);
  assert.ok(button('Correct this answer'));assert.ok(!button('Save answer'));assert.ok(!log().includes('POST'));
});
for(const mode of ['explain','explain-question','explain-stale']) await run('written deposit answer '+mode,mode,async({doc,button,click,log,dom})=>{
  assert.ok(!button(confirm));
  const fill=async text=>{const input=doc.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();};
  await fill('Empty keg deposit return $40; total due $140');await click('Save answer');
  assert.match(log(),/\/explanation/);assert.match(log(),/"token":"aaaaaaaa/);
  if(mode==='explain-question') {assert.match(doc.querySelector('[role=alert]').textContent,/What is the deposit credit/);assert.ok(doc.querySelector('textarea').value.includes('$40'));}
  else if(mode==='explain-stale') {assert.match(doc.querySelector('[role=alert]').textContent,/invoice changed/);assert.ok(button('Refresh invoice'));assert.ok(button('Save answer').disabled);}
  else {
    await until(()=>doc.body.textContent.includes('Answer recorded'));
    assert.match(doc.querySelector('.lq-invd-totals').textContent,/140.00/);
    await click('Correct this answer');await fill('Empty keg deposit return $20; total due $160');await click('Save answer');
    await until(()=>doc.querySelector('.lq-invd-totals').textContent.includes('160.00'));
    assert.match(log(),/"token":"bbbbbbbb/);
    assert.equal(doc.querySelectorAll('.lq-invd-desc').length,3);
  }
});
await run('a recorded deposit answer leaves a way to finish the remaining review','explain-remaining',async({doc,button,log})=>{
  assert.match(doc.body.textContent,/Answer recorded/);
  assert.match(doc.body.textContent,/one full keg missing/);
  assert.match(doc.body.textContent,/Other questions on this invoice still need an answer/);
  assert.ok(button(confirm));assert.ok(button('Correct this answer'));
  assert.ok(!button('Save answer'));
  assert.ok(!doc.body.textContent.includes('State the credit and revised total below'));
  assert.ok(!log().includes('POST'));
});
console.log(`Invoice UI: ${passed} cases passed`);

await run('unanswered products and their controls precede completed rows','clarity',async({doc,log})=>{
  const questions=doc.querySelector('.lq-invd-questions');
  assert.equal(questions.querySelectorAll('.lq-invd-line').length,2);
  assert.match(questions.textContent,/Example sparkling drink/);
  assert.match(questions.textContent,/Example biscuit cans/);
  assert.match(questions.textContent,/How many cans are in one case/);
  assert.ok(!questions.textContent.includes('Already handled product'));
  assert.equal(questions.querySelectorAll('[aria-label="Count units per billed case"]').length,2);
  assert.ok([...questions.querySelectorAll('input[type=text]')].every(input=>input.value===''));
  assert.ok(questions.compareDocumentPosition(doc.querySelector('.lq-invd-ledger')) & 4);
  assert.ok(!doc.querySelector('.lq-invd-ledger').open);
  assert.ok(!doc.querySelector('.lq-invd-automatic').open);
  assert.match(doc.querySelector('.lq-badge').textContent,/Needs your answer/);
  const ids=[...doc.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length);
  assert.ok(!log().includes('POST'));
});
await run('written package answers preview the saved unit, retire only that question and finish clearly','clarity',async({doc,dom,log,click})=>{
  const card=doc.getElementById('inv-line-test-keg');
  const input=card.querySelector('[aria-label="Count units per billed case"]');
  await enter(dom,input,'1 case = 24 cans');
  assert.match(card.textContent,/1 case = 24 cans/);assert.match(card.textContent,/\$2 per can/);
  card.querySelector('button[type=submit]').click();await pause();
  await until(()=>doc.querySelector('.lq-invd-questions').querySelectorAll('.lq-invd-line').length===1);
  assert.match(doc.querySelector('[role=status]').textContent,/1 item needs your answer/);
  assert.equal(doc.activeElement.id,'invoice-progress');
  const second=doc.getElementById('inv-line-test-biscuit');
  await enter(dom,second.querySelector('input[type=text]'),'a case has 10 cans');
  assert.match(second.textContent,/1 case = 10 cans/);
  second.querySelector('button[type=submit]').click();await pause();
  await until(()=>!doc.querySelector('.lq-invd-questions'));
  assert.match(doc.querySelector('[role=status]').textContent,/all caught up/);
  assert.match(log(),/"unitsPerBilledUnit":24/);assert.match(log(),/"unitsPerBilledUnit":10/);
  assert.ok(!log().includes('/received'));assert.ok(!log().includes('/clear-flag'));
  await click('Back to invoices');await until(()=>doc.querySelector('.lq-invlist'));
  assert.ok(!doc.querySelector('.lq-invlist').textContent.includes('Needs your answer'));
});
for(const mode of ['clarity-stale-unit','clarity-unknown-unit']) await run('written units cannot replace an unknown or stale inventory definition: '+mode,mode,async({doc,dom,log})=>{
  const card=doc.getElementById('inv-line-test-keg');const input=card.querySelector('input[type=text]');
  assert.match(card.textContent,/individual items/);
  await enter(dom,input,'1 case = 24 cans');
  assert.ok(card.querySelector('button[type=submit]').disabled);
  assert.ok(!log().includes('POST'));
});
await run('ambiguous, mixed and invalid package replies stay unsaved','clarity',async({doc,dom,log})=>{
  const card=doc.getElementById('inv-line-test-keg');const input=card.querySelector('input[type=text]');
  for(const value of ['0','-2','1.5','100001','1 case = 24 cans and 2 bags','2 cases = 48 cans','1 case = 24 bottles','maybe 24','24 cans, or 12']) {
    await enter(dom,input,value);assert.ok(card.querySelector('button[type=submit]').disabled,value);
  }
  for(const value of ['24','24 cans','1 case contains 24 cans','24 cans per case']) {
    await enter(dom,input,value);assert.ok(!card.querySelector('button[type=submit]').disabled,value);
  }
  assert.ok(!log().includes('POST'));
});
await run('a quantity annotation cannot be hidden by the general confirm action','marked',async({doc,button})=>{
  assert.ok(!button(confirm));assert.ok(doc.querySelector('.lq-invd-questions .lq-invd-recvd input'));
});
console.log(`Invoice UI including clarity: ${passed} cases passed`);

await run('an excluded clean duplicate is visibly complete, without a confirmation task','clean-duplicate',async({doc,button,log})=>{
  assert.match(doc.querySelector('[role=status]').textContent,/all caught up/);
  assert.ok(!doc.querySelector('.lq-invd-review'));assert.ok(!button(confirm));
  assert.match(doc.querySelector('.lq-badge').textContent,/Copy saved/);assert.ok(!log().includes('POST'));
});
await run('the invoice list prioritizes questions and honors a completed copy projection','clarity',async({doc,click})=>{
  await click('‹ All invoices');await until(()=>doc.querySelector('.lq-invlist'));
  const rows=[...doc.querySelectorAll('.lq-invrow')];
  assert.match(rows[0].textContent,/Needs your answer/);assert.match(rows[0].textContent,/2 package questions/);
  assert.match(rows[2].textContent,/Example completed copy/);
  assert.ok(!rows[2].textContent.includes('Needs your answer'));assert.ok(!rows[2].querySelector('.lq-badge-flagged'));
});
console.log(`Invoice UI final: ${passed} cases passed`);
