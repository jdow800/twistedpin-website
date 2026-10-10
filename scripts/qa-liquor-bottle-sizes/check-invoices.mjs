import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const bundle=await readFile(new URL('./dist/invoice-fixture.js',import.meta.url),'utf8');
const pause=()=>new Promise(r=>setTimeout(r,20));
const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await pause();}throw new Error('UI condition timed out');};
let passed=0;
const confirm='Review complete — confirm invoice';
// Debug aids, off by default: INVOICE_QA_ONLY=<regex> runs matching scenarios; INVOICE_QA_KEEP_GOING=1 reports every
// failure instead of stopping at the first (the exit code is still 1).
const only=process.env.INVOICE_QA_ONLY?new RegExp(process.env.INVOICE_QA_ONLY):null,keepGoing=process.env.INVOICE_QA_KEEP_GOING==='1',failed=[];
async function run(name,mode,fn){
  if(only&&!only.test(name))return;
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
  }catch(error){
    if(!keepGoing)throw error;
    failed.push(name);console.log('FAIL',name,'-',String(error.message).split(/\r?\n/)[0].slice(0,300));
  }finally{dom.window.close();}
}
// tprs 0196: a discontinued item on an invoice is asked about, and either answer clears it.
for(const answer of ['carry','replace']) await run(`a discontinued item bought again asks, and "${answer}" answers it`,'discontinued',async({doc,click,log})=>{
  assert.match(doc.querySelector('.lq-invd-questions').textContent,/Discontinued Oct 1\. Still buying this\?/);
  if(answer==='carry') {
    await click('Yes, we carry it again');
    await until(()=>log().includes('/skus/patty2/discontinued'));
    // The card sends the state it was drawn against, so a stale tap cannot undo an archive.
    assert.match(log(),/PATCH \S*\/skus\/patty2\/discontinued \{"discontinued":false,"expected":\{"discontinuedAt":"2026-10-01T05:00:00\.000Z","replacedBySkuId":"patty35","active":true\}\}/);
  } else {
    await click("That's Beef Patty, 3.5oz");
    await until(()=>log().includes('/match'));
    assert.match(log(),/\/lines\/test-keg\/match \{"skuId":"patty35","expectedMatchedSkuId":"patty2","expectedNonInventory":false\}/);
  }
  await until(()=>!doc.querySelector('.lq-invd-discontinued'));
});
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
// The route answers most refusals with 409, so the reason comes from the body: a stale code (line_changed / unit_changed, see STALE_ANSWER_CODES) is the shared "changed while you were answering" line.
// remember-error is a 500 with a different body; it reads the same as remember-server.
const savedFailure={'remember-failure':/This question changed while you were answering\. Reload to see the latest\. Your number is kept\./,'remember-offline':/No connection/,'remember-signed-out':/You are signed out/,
  'remember-source':/Not saved\. Check the number against the invoice, or answer this line's other question first\./,'remember-repeat':/repeat copy\. Answer it on the purchase record/,
  'remember-refused':/server refused this answer/,'remember-server':/Could not save\. Your number is still here/,'remember-error':/Could not save\. Your number is still here/};
for(const mode of ['remember-unit',...Object.keys(savedFailure)]) await run('saved package answer '+mode,mode,async({doc,button,click,dom,log})=>{

  const input=doc.querySelector('[aria-label="Count units per billed case"]');
  assert.equal(input.value,'');
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'2');
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();
  assert.match(doc.body.textContent,/\$25 per pack/);
  assert.ok(!button('Save package answer'));assert.ok(button('Save 2 per case'));
  assert.match(doc.body.textContent,/Remembered for this supplier item\. Counts and delivery are not changed\./);
  await click('Save 2 per case');
  assert.match(log(),/"unitsPerBilledUnit":2/);assert.match(log(),/"expectedPackageKey":"2\|5LB\|"/);
  assert.match(log(),/"expectedRuleFingerprint":null/);
  if(savedFailure[mode]){assert.match(doc.querySelector('[role=alert]').textContent,savedFailure[mode]);assert.equal(input.value,'2');assert.ok(button('Save 2 per case'));
    if(mode!=='remember-failure')assert.ok(!doc.querySelector('[role=alert]').textContent.includes('This question changed'),'a refusal that is not a change must not say the question changed');}
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
  assert.match(log(),/\/received \{"receivedQty":0,"expectedReceivedQty":null\}/);
  assert.match(doc.querySelector('.lq-invd-totals').textContent,/\$180.00/);
  assert.match(doc.querySelector('.lq-buk').textContent,/\$140.00 not delivered, excluded from product cost/);
  assert.ok(!log().includes('/clear-flag'));
  await click('change');await click('clear');
  await until(()=>!doc.body.textContent.includes('Product cost after shortage:'));
  assert.match(log(),/\/received \{"receivedQty":null,"expectedReceivedQty":0\}/);
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
// tprs 0197: an email-body receipt (Dip) is text at the page URL, so it is a link, never an <img>.
await run('an email-body receipt links to its text instead of a broken image','text-receipt',async({doc})=>{
  assert.ok(!doc.querySelector('img[src*="/invoices/images/"]'));
  const tile=doc.querySelector('.lq-invd-imgs a');
  assert.match(tile.textContent,/Open email receipt/);
  assert.equal(tile.getAttribute('href'),'/mock/admin/bar/invoices/images/test-page');
});
await run('already confirmed invoices do not show an open review','confirmed',async({doc,button})=>{
  assert.ok(!doc.querySelector('.lq-invd-review'));assert.ok(!button(confirm));
});
await run('saved invoices cannot be sent through a replacing re-read','credit',async({button})=>{
  assert.ok(!button('Read invoice again'));assert.ok(!button('Retry reading invoice'));
});
await run('an empty failed read can retry without confirming receipt','failed-empty',async({doc,click,button,log})=>{
  assert.ok(!button(confirm),'a blank read has nothing to confirm');
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
// tprs answers-safe: every answer carries what the card showed; a stale one keeps the typed value.
const STALE='This question changed while you were answering. Reload to see the latest. Your number is kept.';
await run('a stale package answer says so and keeps the typed number','stale-remember',async({doc,click,dom})=>{
  const input=doc.querySelector('[aria-label="Count units per billed case"]');
  await enter(dom,input,'2');await click('Save 2 per case');
  assert.equal(doc.querySelector('[role=alert]').textContent,STALE);
  assert.equal(doc.querySelector('[aria-label="Count units per billed case"]').value,'2');
  assert.ok(!doc.querySelector('[aria-label="Count units per billed case"]').disabled);
});
await run('a stale one-time price says so, keeps the typed price and sends its basis','stale-apply',async({doc,click,dom,log})=>{
  const input=doc.querySelector('input[type=number][aria-label^="Price per"]');
  await enter(dom,input,'3.25');await click('Use this cost');
  assert.match(log(),/\/apply-cost \{"expectedSkuId":"demo","expectedCountUnit":"pack","expectedPackageKey":"2\|5LB\|","costPerCountUnit":3\.25\}/);
  assert.ok(doc.body.textContent.includes(STALE));
  assert.equal(doc.querySelector('input[type=number][aria-label^="Price per"]').value,'3.25');
});
// 11.94: an older invoice answers the hold but leaves the current price alone. Say so, once, and only then.
for(const [mode,says] of [['superseded-apply',true],['recorded-apply',false]]) await run(`an answered one-time price ${says?'says the current price was not changed when a newer one is on file':'stays quiet when the same price was already on file'}`,mode,async({doc,click,dom})=>{
  await enter(dom,doc.querySelector('input[type=number][aria-label^="Price per"]'),'3.25');await click('Use this cost');
  await until(()=>doc.getElementById('invoice-progress').textContent.includes('Saved the answer for Example food.'));
  assert.equal(doc.getElementById('invoice-progress').textContent.includes('The current price was not changed: a newer price is on file.'),says);
  assert.ok(!doc.querySelector('input[type=number][aria-label^="Price per"]'),'the answered hold is gone');
});
await run('a stale delivery count says so and keeps the typed quantity','stale-received',async({doc,click,dom})=>{
  const input=doc.querySelector('.lq-invd-recvd input');
  await enter(dom,input,'0');await click('Save');
  assert.ok(doc.querySelector('.lq-invd-recvd-err').textContent.includes(STALE));
  assert.equal(doc.querySelector('.lq-invd-recvd input').value,'0');
});
await run('a stale item match says so and keeps the search','stale-match',async({doc,dom})=>{
  const input=doc.querySelector('input[placeholder="Search items"]');
  await enter(dom,input,'tito');doc.querySelector('.lq-rev-assign .lq-chip').click();await pause();
  assert.ok(doc.querySelector('.lq-match .lq-error').textContent.includes(STALE));
  assert.equal(doc.querySelector('input[placeholder="Search items"]').value,'tito');
});
await run('"we carry it again" sends that the item is archived, so the server can refuse a stale tap','discontinued-archived',async({click,log})=>{
  await click('Yes, we carry it again');await until(()=>log().includes('/discontinued'));
  assert.match(log(),/"expected":{"discontinuedAt":"2026-10-01T05:00:00.000Z","replacedBySkuId":"patty35","active":false}/);
});
await run('a stale "we carry it again" says so','stale-discontinued',async({doc,click})=>{
  await click('Yes, we carry it again');
  assert.equal(doc.querySelector('.lq-invd-discontinued [role=alert]').textContent,STALE);
});
await run('a refused confirmation names a changed invoice, not a retry','clear-refused',async({doc,click})=>{
  await click(confirm);
  assert.match(doc.querySelector('[role=alert]').textContent,/This invoice changed while you were answering\. Reload to see the latest\./);
  assert.ok(doc.querySelector('.lq-invd-review'));
});
// Refresh while editing (independent review 2026-10-09). Answering another line re-reads the whole invoice and
// hands every open box new props. A typed answer must go out against the state it was STARTED from, never the
// refreshed one, or the server accepts it and loses the other person's answer. window.__qaOther changes a line
// the way another person would; the fixture server refuses (409) any answer whose expected state no longer holds.
const reads=log=>log().split('\n').filter(x=>/^GET \S*\/invoices\/test-invoice\s*$/.test(x)).length;
async function reread({click,log}) { // the Expense answer on another line refreshes the whole invoice
  const before=reads(log);await click('Expense as supplies (not counted)');
  await until(()=>reads(log)>before);await pause();await pause();
}
const inCard=(doc,id,text)=>[...doc.getElementById('inv-line-'+id).querySelectorAll('button')].find(b=>b.textContent.trim()===text);
await run('a delivery count typed before a refresh is sent against the count it started from, so the other person\'s count survives','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-recv-line'),input=()=>card().querySelector('.lq-invd-recvd input');
  inCard(doc,'recv-line','Came up short?').click();await pause();
  await enter(dom,input(),'0');
  dom.window.__qaOther('recv-line',{receivedQty:'2'});
  await reread({click,log});
  await until(()=>/Recorded delivery/.test(card().textContent));
  assert.equal(input().value,'0','the typed count stays in the box');
  inCard(doc,'recv-line','Save').click();
  await until(()=>log().includes('/lines/recv-line/received'));await pause();
  assert.match(log(),/\/lines\/recv-line\/received \{"receivedQty":0,"expectedReceivedQty":null\}/);
  assert.ok(card().querySelector('.lq-invd-recvd-err').textContent.includes(STALE));
  assert.equal(input().value,'0');
  assert.equal(dom.window.__qaLine('recv-line').receivedQty,'2','the other person\'s count is still on file');
});
await run('an untouched delivery box follows a refresh and then sends the count it showed','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-recv-line'),input=()=>card().querySelector('.lq-invd-recvd input');
  inCard(doc,'recv-line','Came up short?').click();await pause();
  assert.equal(input().value,'');
  dom.window.__qaOther('recv-line',{receivedQty:'2'});
  await reread({click,log});
  await until(()=>/Recorded delivery/.test(card().textContent));
  assert.equal(input().value,'2','nothing was typed, so the box shows what is on file now');
  await enter(dom,input(),'1');inCard(doc,'recv-line','Save').click();
  await until(()=>dom.window.__qaLine('recv-line').receivedQty==='1');
  assert.match(log(),/\/lines\/recv-line\/received \{"receivedQty":1,"expectedReceivedQty":2\}/);
});
await run('a one-time price typed before a refresh is sent for the item and unit it started from','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-price-line'),price=()=>card().querySelector('input[type=number][aria-label^="Price per"]');
  await enter(dom,price(),'3.25');
  dom.window.__qaOther('price-line',{matchedSkuId:'other',matchedName:'Other item',matchedCountUnit:'case'});
  await reread({click,log});
  await until(()=>price().getAttribute('aria-label')==='Price per case');
  assert.equal(price().value,'3.25','the typed price stays in the box');
  inCard(doc,'price-line','Use this cost').click();
  await until(()=>log().includes('/lines/price-line/apply-cost'));await pause();
  assert.match(log(),/\/lines\/price-line\/apply-cost \{"expectedSkuId":"demo","expectedCountUnit":"pack","expectedPackageKey":"2\|5LB\|","costPerCountUnit":3\.25\}/);
  assert.ok(card().textContent.includes(STALE));
  assert.equal(price().value,'3.25');
  assert.ok(dom.window.__qaLine('price-line').costHoldReason,'no cost was written for the item it no longer shows');
});
await run('a package answer typed before a refresh is sent against the supplier rule it started from','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-pack-line'),input=()=>card().querySelector('[aria-label="Count units per billed case"]');
  await enter(dom,input(),'2');
  dom.window.__qaOther('pack-line',{countRuleFingerprint:'rule-2'}); // another invoice replaced the supplier's rule
  await reread({click,log});
  card().querySelector('button[type=submit]').click();
  await until(()=>log().includes('/lines/pack-line/remember-unit'));await pause();
  assert.match(log(),/\/lines\/pack-line\/remember-unit \{[^}]*"expectedRuleFingerprint":"rule-1"[^}]*"unitsPerBilledUnit":2\}/);
  assert.ok(card().textContent.includes(STALE));
  assert.equal(input().value,'2');
  assert.ok(dom.window.__qaLine('pack-line').costHoldReason,'the older answer did not replace the newer rule');
});
await run('an untouched package box follows a refresh and then sends the rule it showed','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-pack-line'),input=()=>card().querySelector('[aria-label="Count units per billed case"]');
  dom.window.__qaOther('pack-line',{countRuleFingerprint:'rule-2'});
  await reread({click,log});
  await enter(dom,input(),'2');card().querySelector('button[type=submit]').click();
  await until(()=>!dom.window.__qaLine('pack-line').costHoldReason);
  assert.match(log(),/\/lines\/pack-line\/remember-unit \{[^}]*"expectedRuleFingerprint":"rule-2"/);
});
// Second review pass (2026-10-09): the started-from state is held through blank and invalid edits. Emptying the box,
// or a half-typed number the browser reports as value "" with validity.badInput, must never mean "start again against
// the refreshed card". Only Cancel, a saved answer, or Start over drops it.
const sentTo=(log,lineId,what)=>log().split('\n').filter(x=>x.includes(`/lines/${lineId}/${what}`));
// What Chromium reports for a half-typed number such as "5e": value "" with validity.badInput. jsdom never sets badInput.
async function enterHalfTyped(dom,input) {
  Object.defineProperty(input,'validity',{configurable:true,get:()=>({badInput:true,valid:false})});
  await enter(dom,input,'');
}
const endHalfTyped=input=>{delete input.validity;};
await run('emptying a stale package answer and typing it again still sends the rule it started from, until Start over','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-pack-line'),input=()=>card().querySelector('[aria-label="Count units per billed case"]');
  await enter(dom,input(),'2');
  dom.window.__qaOther('pack-line',{countRuleFingerprint:'rule-2'});
  await reread({click,log});
  await enter(dom,input(),'');await enter(dom,input(),'2');card().querySelector('button[type=submit]').click();
  await until(()=>sentTo(log,'pack-line','remember-unit').length===1);await pause();
  assert.match(sentTo(log,'pack-line','remember-unit')[0],/"expectedRuleFingerprint":"rule-1"/,'the rule the box was started against, not the refreshed one');
  assert.ok(card().textContent.includes(STALE));assert.equal(input().value,'2');
  assert.ok(dom.window.__qaLine('pack-line').costHoldReason,'the other person\'s rule was not replaced');
  // The way out: Start over empties the box and the next answer starts from what the card shows now.
  inCard(doc,'pack-line','Start over').click();await pause();
  assert.equal(input().value,'');assert.ok(!card().textContent.includes(STALE));assert.ok(!inCard(doc,'pack-line','Start over'));
  await enter(dom,input(),'2');card().querySelector('button[type=submit]').click();
  await until(()=>!dom.window.__qaLine('pack-line').costHoldReason);
  const sent=sentTo(log,'pack-line','remember-unit');
  assert.equal(sent.length,2);assert.match(sent[1],/"expectedRuleFingerprint":"rule-2"/);
});
await run('a stale package card offers Start over only once it has moved','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-pack-line'),input=()=>card().querySelector('[aria-label="Count units per billed case"]');
  assert.ok(!inCard(doc,'pack-line','Start over'),'nothing typed');
  await enter(dom,input(),'2');assert.ok(!inCard(doc,'pack-line','Start over'),'typed, nothing moved');
  dom.window.__qaOther('pack-line',{countRuleFingerprint:'rule-2'});
  await reread({click,log});
  assert.ok(inCard(doc,'pack-line','Start over'));
});
await run('emptying a stale one-time price and typing it again still sends the item and unit it started from, until Start over','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-price-line'),price=()=>card().querySelector('input[type=number][aria-label^="Price per"]');
  await enter(dom,price(),'3.25');
  dom.window.__qaOther('price-line',{matchedSkuId:'other',matchedName:'Other item',matchedCountUnit:'case'});
  await reread({click,log});
  await until(()=>price().getAttribute('aria-label')==='Price per case');
  await enter(dom,price(),'');await enter(dom,price(),'3.25');
  inCard(doc,'price-line','Use this cost').click();
  await until(()=>sentTo(log,'price-line','apply-cost').length===1);await pause();
  assert.match(sentTo(log,'price-line','apply-cost')[0],/apply-cost \{"expectedSkuId":"demo","expectedCountUnit":"pack","expectedPackageKey":"2\|5LB\|","costPerCountUnit":3\.25\}/);
  assert.ok(card().textContent.includes(STALE));assert.equal(price().value,'3.25');
  assert.ok(dom.window.__qaLine('price-line').costHoldReason,'no cost was written for the item it no longer shows');
  inCard(doc,'price-line','Start over').click();await pause();
  assert.equal(price().value,'');assert.ok(!card().textContent.includes(STALE));assert.ok(!inCard(doc,'price-line','Start over'));
  await enter(dom,price(),'3.25');inCard(doc,'price-line','Use this cost').click();
  await until(()=>!dom.window.__qaLine('price-line').costHoldReason);
  const sent=sentTo(log,'price-line','apply-cost');
  assert.equal(sent.length,2);assert.match(sent[1],/"expectedSkuId":"other","expectedCountUnit":"case"/);
});
await run('a half-typed price (value empty, badInput) does not restart the one-time price against the refreshed card','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-price-line'),price=()=>card().querySelector('input[type=number][aria-label^="Price per"]');
  await enter(dom,price(),'3');
  dom.window.__qaOther('price-line',{matchedSkuId:'other',matchedName:'Other item',matchedCountUnit:'case'});
  await reread({click,log});
  await until(()=>price().getAttribute('aria-label')==='Price per case');
  await enterHalfTyped(dom,price());endHalfTyped(price());await enter(dom,price(),'3e0');
  inCard(doc,'price-line','Use this cost').click();
  await until(()=>sentTo(log,'price-line','apply-cost').length===1);await pause();
  assert.match(sentTo(log,'price-line','apply-cost')[0],/"expectedSkuId":"demo","expectedCountUnit":"pack"/);
  assert.ok(card().textContent.includes(STALE));assert.equal(price().value,'3e0');
  assert.ok(dom.window.__qaLine('price-line').costHoldReason);
});
// A first "e" in an empty number box leaves the value "" so React never calls onChange; the input event still fires.
await run('a bad first keystroke in an empty price box pins the card it began on','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-price-line'),price=()=>card().querySelector('input[type=number][aria-label^="Price per"]');
  assert.ok(!inCard(doc,'price-line','Start over'));
  await enterHalfTyped(dom,price());                  // empty to empty: no change event, but badInput
  dom.window.__qaOther('price-line',{matchedSkuId:'other',matchedName:'Other item',matchedCountUnit:'case'});
  await reread({click,log});
  await until(()=>price().getAttribute('aria-label')==='Price per case');
  assert.ok(inCard(doc,'price-line','Start over'),'the box was started before the card changed');
  endHalfTyped(price());await enter(dom,price(),'3');
  inCard(doc,'price-line','Use this cost').click();
  await until(()=>sentTo(log,'price-line','apply-cost').length===1);await pause();
  assert.match(sentTo(log,'price-line','apply-cost')[0],/"expectedSkuId":"demo","expectedCountUnit":"pack"/);
  assert.ok(card().textContent.includes(STALE));
});
await run('a bad first keystroke in an empty delivery box keeps the box the person\'s and pins the count it began on','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-recv-line'),input=()=>card().querySelector('.lq-invd-recvd input');
  inCard(doc,'recv-line','Came up short?').click();await pause();
  await enterHalfTyped(dom,input());
  dom.window.__qaOther('recv-line',{receivedQty:'2'});
  await reread({click,log});
  await until(()=>/Recorded delivery/.test(card().textContent));
  assert.equal(input().value,'','a box that was being typed in does not turn into the count on file');
  assert.ok(inCard(doc,'recv-line','Start over'));
  endHalfTyped(input());await enter(dom,input(),'1');inCard(doc,'recv-line','Save').click();
  await until(()=>sentTo(log,'recv-line','received').length===1);await pause();
  assert.match(sentTo(log,'recv-line','received')[0],/\/received \{"receivedQty":1,"expectedReceivedQty":null\}/);
  assert.ok(card().querySelector('.lq-invd-recvd-err').textContent.includes(STALE));
  assert.equal(dom.window.__qaLine('recv-line').receivedQty,'2');
});
await run('emptying a delivery count and typing it again still sends the count it started from, so the other person\'s count survives','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-recv-line'),input=()=>card().querySelector('.lq-invd-recvd input');
  inCard(doc,'recv-line','Came up short?').click();await pause();
  await enter(dom,input(),'0');
  dom.window.__qaOther('recv-line',{receivedQty:'2'});
  await reread({click,log});
  await until(()=>/Recorded delivery/.test(card().textContent));
  assert.equal(input().value,'0','the typed count stays in the box');
  await enter(dom,input(),'');await enter(dom,input(),'0');
  inCard(doc,'recv-line','Save').click();
  await until(()=>sentTo(log,'recv-line','received').length===1);await pause();
  assert.match(sentTo(log,'recv-line','received')[0],/\/received \{"receivedQty":0,"expectedReceivedQty":null\}/);
  assert.ok(card().querySelector('.lq-invd-recvd-err').textContent.includes(STALE));assert.equal(input().value,'0');
  assert.equal(dom.window.__qaLine('recv-line').receivedQty,'2','the other person\'s count is still on file');
  // The way out: Cancel, then open it again, and the box shows the count on file.
  inCard(doc,'recv-line','cancel').click();await pause();
  inCard(doc,'recv-line','change').click();await pause();
  assert.equal(input().value,'2');assert.ok(!card().querySelector('.lq-invd-recvd-err'));
  await enter(dom,input(),'1');inCard(doc,'recv-line','Save').click();
  await until(()=>dom.window.__qaLine('recv-line').receivedQty==='1');
  assert.match(sentTo(log,'recv-line','received')[1],/\/received \{"receivedQty":1,"expectedReceivedQty":2\}/);
});
await run('a delivery box that a re-read has moved offers Start over, which shows the count on file and answers against it','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-recv-line'),input=()=>card().querySelector('.lq-invd-recvd input');
  inCard(doc,'recv-line','Came up short?').click();await pause();
  assert.ok(!inCard(doc,'recv-line','Start over'),'nothing typed');
  await enter(dom,input(),'0');assert.ok(!inCard(doc,'recv-line','Start over'),'typed, nothing moved');
  dom.window.__qaOther('recv-line',{receivedQty:'2'});
  await reread({click,log});
  await until(()=>inCard(doc,'recv-line','Start over'));
  assert.equal(input().value,'0','the typed count stays until the person chooses');
  inCard(doc,'recv-line','Start over').click();await pause();
  assert.equal(input().value,'2','the box shows the count on file');assert.ok(!inCard(doc,'recv-line','Start over'));
  await enter(dom,input(),'1');inCard(doc,'recv-line','Save').click();
  await until(()=>dom.window.__qaLine('recv-line').receivedQty==='1');
  assert.match(sentTo(log,'recv-line','received')[0],/\/received \{"receivedQty":1,"expectedReceivedQty":2\}/);
  assert.ok(!doc.body.textContent.includes(STALE));
});
await run('a half-typed delivery count ("5e0") does not restart the count against the refreshed card','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-recv-line'),input=()=>card().querySelector('.lq-invd-recvd input');
  inCard(doc,'recv-line','Came up short?').click();await pause();
  await enter(dom,input(),'5');
  dom.window.__qaOther('recv-line',{receivedQty:'2'});
  await reread({click,log});
  await until(()=>/Recorded delivery/.test(card().textContent));
  assert.equal(input().value,'5');
  await enterHalfTyped(dom,input());                 // "5e": value "" and validity.badInput
  assert.ok(inCard(doc,'recv-line','Save').disabled,'a half-typed number cannot be saved');
  endHalfTyped(input());await enter(dom,input(),'5e0');
  inCard(doc,'recv-line','Save').click();
  await until(()=>sentTo(log,'recv-line','received').length===1);await pause();
  assert.match(sentTo(log,'recv-line','received')[0],/\/received \{"receivedQty":5,"expectedReceivedQty":null\}/);
  assert.ok(card().querySelector('.lq-invd-recvd-err').textContent.includes(STALE));assert.equal(input().value,'5e0');
  assert.equal(dom.window.__qaLine('recv-line').receivedQty,'2','the other person\'s count is still on file');
});
for(const [kind,blank] of [['emptied',async(dom,input)=>enter(dom,input,'')],['half-typed (badInput)',async(dom,input)=>enterHalfTyped(dom,input)]])
await run(`a count on file that is ${kind} as the first edit pins the count it showed`,'refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-recorded-line'),input=()=>card().querySelector('.lq-invd-recvd input');
  inCard(doc,'recorded-line','change').click();await pause();
  assert.equal(input().value,'1','the box shows the count on file');
  await blank(dom,input());
  dom.window.__qaOther('recorded-line',{receivedQty:'3'});
  await reread({click,log});
  assert.equal(input().value,'','the box still shows what the person left in it');
  endHalfTyped(input());await enter(dom,input(),'4');
  inCard(doc,'recorded-line','Save').click();
  await until(()=>sentTo(log,'recorded-line','received').length===1);await pause();
  assert.match(sentTo(log,'recorded-line','received')[0],/\/received \{"receivedQty":4,"expectedReceivedQty":1\}/);
  assert.ok(card().querySelector('.lq-invd-recvd-err').textContent.includes(STALE));
  assert.equal(dom.window.__qaLine('recorded-line').receivedQty,'3','the other person\'s count is still on file');
});
await run('a person\'s own cleared delivery count starts the next answer from what is on file now, not from the cleared one','refresh-edit',async({doc,dom,log})=>{
  const card=()=>doc.getElementById('inv-line-recorded-line'),input=()=>card().querySelector('.lq-invd-recvd input');
  inCard(doc,'recorded-line','change').click();await pause();
  await enter(dom,input(),'0');                      // an edit, so the box is pinned to the count it showed (1)
  inCard(doc,'recorded-line','clear').click();
  await until(()=>dom.window.__qaLine('recorded-line').receivedQty==null);await pause();
  await until(()=>inCard(doc,'recorded-line','Came up short?'));
  inCard(doc,'recorded-line','Came up short?').click();await pause();
  assert.equal(input().value,'','the cleared draft is gone');
  await enter(dom,input(),'3');inCard(doc,'recorded-line','Save').click();
  await until(()=>dom.window.__qaLine('recorded-line').receivedQty==='3');
  const sent=sentTo(log,'recorded-line','received');
  assert.equal(sent.length,2);assert.match(sent[0],/"receivedQty":null,"expectedReceivedQty":1\}/);assert.match(sent[1],/"receivedQty":3,"expectedReceivedQty":null\}/);
  assert.ok(!doc.body.textContent.includes(STALE));
});
await run('a person\'s own earlier delivery answer is not a stale card when they change it','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-recv-line'),input=()=>card().querySelector('.lq-invd-recvd input');
  inCard(doc,'recv-line','Came up short?').click();await pause();
  await enter(dom,input(),'1');inCard(doc,'recv-line','Save').click();
  await until(()=>dom.window.__qaLine('recv-line').receivedQty==='1');
  await until(()=>inCard(doc,'recv-line','change'));await pause();
  inCard(doc,'recv-line','change').click();await pause();
  assert.equal(input().value,'1');
  await enter(dom,input(),'');await enter(dom,input(),'2');
  inCard(doc,'recv-line','Save').click();
  await until(()=>dom.window.__qaLine('recv-line').receivedQty==='2');
  const sent=sentTo(log,'recv-line','received');
  assert.equal(sent.length,2);assert.match(sent[0],/"expectedReceivedQty":null/);assert.match(sent[1],/\/received \{"receivedQty":2,"expectedReceivedQty":1\}/);
  assert.ok(!doc.body.textContent.includes(STALE));
});
await run('a match search is withdrawn when someone else matches the line, so a stale match cannot be sent','refresh-edit',async({doc,dom,click,log})=>{
  const card=()=>doc.getElementById('inv-line-match-line');
  await enter(dom,card().querySelector('input[placeholder="Search items"]'),'tito');
  dom.window.__qaOther('match-line',{matchedSkuId:'titos',matchedName:"Tito's Vodka",matchedCountUnit:'bottle',needsReview:false,reviewReasons:[]});
  await reread({click,log});
  await until(()=>!card().querySelector('input[placeholder="Search items"]'));
  assert.ok(!card().querySelector('.lq-match'));assert.ok(!log().includes('/lines/match-line/match'));
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
  // The card says what it was drawn against: unmatched, and not an expense.
  assert.match(log(),/"expectedMatchedSkuId":null,"expectedNonInventory":false/);
  assert.match(doc.body.textContent,/Check the inventory price/);
});
await run('linked scan shows the comparison and disables edits on the excluded copy','linked',async({doc,button,click,log})=>{
  assert.match(doc.body.textContent,/Compare invoice and delivery/);assert.match(doc.body.textContent,/110LB/);
  assert.match(doc.body.textContent,/not evidence of a product shortage/);
  assert.ok(button('Match items or correct the purchase record'));
  assert.ok(!doc.querySelector('input[placeholder="Search items"]'));assert.ok(!button('Came up short?'));
  assert.ok(!log().includes('POST'));await click('Mark copies checked');
  await until(()=>doc.body.textContent.includes('Comparison reviewed'));
  assert.match(log(),/copy-review/);assert.ok(!log().includes('/received'));
});
await run('a case-column difference is named; "Quantities differ" never sits beside equal numbers','linked-case-column',async({doc,button})=>{
  const panel=doc.querySelector('[aria-label="Invoice and delivery comparison"]');
  assert.match(panel.textContent,/both copies bill 1, \$180\.00\. Case column: email 1, scan blank\./);
  assert.match(panel.textContent,/Both copies bill 1, \$180\.00\./);
  assert.ok(!panel.textContent.includes('Quantities differ'));
  assert.match(panel.textContent,/Records that you compared the copies\. Prices and counts are not changed\. Matching papers do not prove what arrived\./);
  assert.ok(button('Mark copies checked'));assert.ok(!panel.textContent.includes('corrections recorded'));
});
await run('the missing-pack question names the item and both readings','linked-pack-gap',async({doc,button})=>{
  const panel=doc.querySelector('[aria-label="Invoice and delivery comparison"]');
  assert.match(panel.textContent,/\(9615600\): email reads 2 x 4\.25LB, scan reads 24\.25LB\. Count and price match\./);
  assert.ok(!panel.textContent.includes('Check that source line'));assert.ok(button('Mark copies checked'));
});
await run('stale comparison leaves an actionable retry error','linked-stale',async({doc,click})=>{
  await click('Mark copies checked');
  // The panel's own retry message (the older "Reopen the invoice" line was replaced by "Reload the comparison"; this check was left stale and stopped the suite).
  const alert=()=>doc.querySelector('[aria-label="Invoice and delivery comparison"] [role=alert]');
  await until(()=>alert());
  assert.match(alert().textContent,/Reload the comparison to check for changes/);
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
  else {
    await until(()=>doc.body.textContent.includes('Current price corrected from $20.00 to $10.00'));
    // An estimated count is priced: only the stale one is sent to Fix costs, only the unpriced one takes today's price.
    const said=[...doc.querySelectorAll('[role=status] p')].map(p=>p.textContent);
    assert.equal(said.filter(t=>t.includes('Its food cost used the price this answer wrote: fix it with Fix costs on Food cost.')).length,1);
    assert.equal(said.filter(t=>t.includes('It had no saved price for this item; its value uses the current price.')).length,1);
  }
});

await run('a matching final settles a shortage without asking staff to confirm it again','linked-auto',async({doc,button,log})=>{
  assert.match(doc.body.textContent,/Copies agree automatically/);
  assert.match(doc.body.textContent,/Original paper line: 2.*40.00, crossed out/);
  assert.ok(!button('Mark copies checked'));
  assert.ok(!button(confirm));assert.ok(!log().includes('POST'));
});
await run('ordinary matching copies explain the evidence without pretending to be a supplier final','linked-agree',async({doc,button,log})=>{
  const panel=doc.querySelector('[aria-label="Invoice and delivery comparison"]');
  assert.match(panel.textContent,/Copies agree automatically/);
  assert.match(panel.textContent,/Both copies agree on the billed items, packages, charges and totals/);
  assert.ok(!panel.textContent.includes("supplier's final"));
  assert.ok(!button('Mark copies checked'));assert.ok(!button(confirm));
  assert.ok(!log().includes('POST'));
});
await run('a scan copy that matches the emailed invoice in items, counts and dollars settles itself and says so in plain words','linked-units-dollars',async({doc,button,log})=>{
  const panel=doc.querySelector('[aria-label="Invoice and delivery comparison"]');
  assert.match(panel.textContent,/Copies agree automatically/);
  assert.match(panel.textContent,/Copy matches the emailed invoice: same items, counts and dollars, and no ink that changes them\./);
  assert.match(panel.textContent,/the emailed invoice governs them\. No answer needed\./);
  // Both package readings stay on the row, with the server's note about which copy governs them.
  assert.match(panel.textContent,/Package columns differ \(email 2 × 4\.25LB; scan 24\.25LB\)/);
  assert.match(panel.textContent,/Email: 3 billed · \$298\.17 · 2 × 4\.25LB/);
  assert.match(panel.querySelector('summary').textContent,/Billed items agree; view package readings/);
  assert.ok(!panel.textContent.includes("supplier's final"));
  assert.ok(!panel.textContent.includes('Both copies agree on the billed items, packages'));
  assert.ok(!panel.textContent.includes('Mark copies checked'));
  assert.ok(!button('Mark copies checked'));assert.ok(!button(confirm));
  assert.ok(!log().includes('POST'));
});
await run('an incomplete reading asks about source pages instead of assuming a shortage','linked-question',async({doc,button,log})=>{
  const panel=doc.querySelector('[aria-label="Invoice and delivery comparison"]');
  assert.match(panel.textContent,/Check the invoice reading/);
  assert.match(panel.textContent,/saved lines do not reconcile/);
  // The server now sends `display` for this question (a short email line plus the whole sentence in `full`): the screen must still carry the caveat and the question.
  assert.match(panel.textContent,/before treating missing rows as a delivery shortage/);
  assert.match(panel.textContent,/The scan contains a written adjustment\. What does it change on the purchase record\?/);
  assert.ok(button('Mark copies checked'));assert.ok(!log().includes('POST'));
});
await run('an automatic deposit credit shows the arithmetic and remains correctable','deposit-auto',async({doc,button,log})=>{
  assert.match(doc.querySelector('[aria-label="Invoice explanation"]').textContent,/180.00.*40.00.*140.00 due/);
  assert.match(doc.querySelector('.lq-invd-totals').textContent,/Amount due/);
  assert.ok(button('Correct this answer'));assert.ok(!button('Save answer'));assert.ok(!log().includes('POST'));
});
for(const mode of ['explain','explain-question','explain-stale']) await run('written deposit answer '+mode,mode,async({doc,button,click,log,dom})=>{
  assert.ok(!button(confirm));
  const fill=async text=>{const input=doc.querySelector('textarea');Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(input,text);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();};
  // This invoice (2 deposits at $20, printed $180) is a one-number invoice now: the box sits behind the link.
  assert.ok(!doc.querySelector('textarea'));await click('Describe something else');
  await fill('Empty keg deposit return $40; total due $140');await click('Save answer');
  assert.match(log(),/\/explanation/);assert.match(log(),/"token":"aaaaaaaa/);
  if(mode==='explain-question') {assert.match(doc.querySelector('[role=alert]').textContent,/What is the deposit credit/);assert.ok(doc.querySelector('textarea').value.includes('$40'));}
  else if(mode==='explain-stale') {assert.equal(doc.querySelector('[role=alert]').textContent,STALE);assert.equal(doc.querySelector('textarea').value,'Empty keg deposit return $40; total due $140');assert.ok(button('Refresh invoice'));assert.ok(button('Save answer').disabled);}
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
// ---- One-number deposit form (2026-10-09). Werk Force INV-004038: two kegs, 2 deposits at $30, printed $270. ----
const WERK_LINE='Credit $60.00. Amount due becomes $210.00 (was $270.00).';
const explanationPosts=log=>log().split('\n').filter(x=>/^POST \S*\/explanation /.test(x));
const kegsInput=doc=>doc.getElementById('invoice-deposit-kegs');
const sectionOf=doc=>doc.querySelector('[aria-label="Invoice explanation"]');
const TOKEN='a'.repeat(64);
async function typeInto(dom,box,value) {
  Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(box,value);
  box.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();
}
await run('a keg invoice asks how many empties went back, defaulted to the kegs billed a deposit, with this invoice\'s own numbers','kegs-werk',async({doc,button,log})=>{
  const section=sectionOf(doc);
  assert.equal(section.querySelector('h3').textContent,'Tell us what happened');
  assert.equal(doc.querySelector('label[for=invoice-deposit-kegs]').textContent,'How many empty kegs went back?');
  const input=kegsInput(doc);
  assert.equal(input.value,'2');assert.equal(input.getAttribute('inputmode'),'numeric');assert.equal(input.getAttribute('type'),'text');
  assert.equal(input.getAttribute('pattern'),'[0-9]*');
  assert.equal(doc.getElementById('invoice-deposit-preview').textContent,WERK_LINE);
  assert.ok(button('Record $60.00 credit')&&!button('Record $60.00 credit').disabled);
  assert.ok(!section.querySelector('textarea'),'the free-text box stays collapsed');
  assert.ok(button('Describe something else'));
  assert.equal(button('Describe something else').getAttribute('aria-expanded'),'false');
  assert.match(section.textContent,/If a full keg was missing, record that on its item below\./);
  // The control comes first, then the link.
  assert.ok(input.compareDocumentPosition(button('Describe something else')) & 4);
  assert.ok(!section.textContent.includes('$559'),'never another invoice\'s numbers');
  // The review above no longer asks for dollars and a revised total when the form below asks only for a count.
  const review=doc.querySelector('.lq-invd-review');assert.notEqual(review,section);
  assert.match(review.textContent,/Say how many empty kegs went back below to record the credit\./);
  assert.ok(!review.textContent.includes('State the credit and revised total'));
  assert.ok(!log().includes('POST'));
});
await run('changing the number updates the credit line and the button','kegs-werk',async({doc,dom,button})=>{
  await enter(dom,kegsInput(doc),'1');
  assert.equal(doc.getElementById('invoice-deposit-preview').textContent,'Credit $30.00. Amount due becomes $240.00 (was $270.00).');
  assert.ok(button('Record $30.00 credit'));assert.ok(!button('Record $60.00 credit'));
  await enter(dom,kegsInput(doc),'2');assert.equal(doc.getElementById('invoice-deposit-preview').textContent,WERK_LINE);
});
await run('a count of zero, none, a fraction or more than the kegs billed cannot be recorded, and the box keeps what was typed','kegs-werk',async({doc,dom,button,log})=>{
  for(const [typed,says] of [['3',/billed on 2 kegs.*no more than 2/],['0',/Enter a number from 1 to 2\./],['',/Enter a number from 1 to 2\./],['1.5',/Enter a number from 1 to 2\./],['two',/Enter a number from 1 to 2\./]]) {
    await enter(dom,kegsInput(doc),typed);
    assert.equal(kegsInput(doc).value,typed,`the box keeps "${typed}"`);
    assert.ok(button('Record credit').disabled,`"${typed}" is not recordable`);
    assert.match(doc.getElementById('invoice-deposit-preview').textContent,says,typed);
    assert.ok(!doc.getElementById('invoice-deposit-preview').textContent.includes('Credit $'),typed);
    assert.equal(kegsInput(doc).getAttribute('aria-invalid'),typed===''?null:'true',typed);
    // Something typed that cannot be recorded is an error: announced as one. An empty box is only a prompt.
    assert.equal(doc.getElementById('invoice-deposit-preview').getAttribute('role'),typed===''?null:'alert',typed);
  }
  assert.ok(!log().includes('POST'));
  await enter(dom,kegsInput(doc),'2');assert.ok(!button('Record $60.00 credit').disabled);
});
await run('Record sends exactly the composed sentence with the existing token, then shows the saved answer','kegs-werk',async({doc,click,log})=>{
  await click('Record $60.00 credit');
  await until(()=>doc.body.textContent.includes('Answer recorded'));
  const posts=explanationPosts(log);
  assert.equal(posts.length,1);
  assert.ok(posts[0].endsWith(' '+JSON.stringify({token:TOKEN,text:'Returned 2 empty kegs. Deposit credit $60; total due $210.'})),posts[0]);
  const saved=sectionOf(doc).textContent;
  assert.match(saved,/Original bill \$270\.00.*\$60\.00.*\$210\.00 due/);
  assert.match(saved,/Your answer: Returned 2 empty kegs\. Deposit credit \$60; total due \$210\./);
  assert.match(doc.querySelector('.lq-invd-totals').textContent,/Amount due.*\$210\.00/);
  assert.ok(!kegsInput(doc),'the form is gone once the answer is saved');
});
await run('a one-keg return on a three-deposit invoice composes the singular sentence','kegs-phase3',async({doc,dom,click,log})=>{
  assert.equal(kegsInput(doc).value,'3');
  assert.equal(doc.getElementById('invoice-deposit-preview').textContent,'Credit $90.00. Amount due becomes $499.00 (was $589.00).');
  await enter(dom,kegsInput(doc),'1');
  assert.equal(doc.getElementById('invoice-deposit-preview').textContent,'Credit $30.00. Amount due becomes $559.00 (was $589.00).');
  await click('Record $30.00 credit');await until(()=>doc.body.textContent.includes('Answer recorded'));
  assert.ok(explanationPosts(log)[0].endsWith(' '+JSON.stringify({token:TOKEN,text:'Returned 1 empty keg. Deposit credit $30; total due $559.'})),explanationPosts(log)[0]);
  assert.match(sectionOf(doc).textContent,/Original bill \$589\.00.*\$30\.00.*\$559\.00 due/);
});
await run('a rate with cents and a total with cents compose amounts the server reads','kegs-cents',async({doc,dom,click,log})=>{
  assert.equal(doc.getElementById('invoice-deposit-preview').textContent,'Credit $55.00. Amount due becomes $534.95 (was $589.95).');
  await enter(dom,kegsInput(doc),'1');
  assert.equal(doc.getElementById('invoice-deposit-preview').textContent,'Credit $27.50. Amount due becomes $562.45 (was $589.95).');
  await click('Record $27.50 credit');await until(()=>doc.body.textContent.includes('Answer recorded'));
  assert.ok(explanationPosts(log)[0].endsWith(' '+JSON.stringify({token:TOKEN,text:'Returned 1 empty keg. Deposit credit $27.50; total due $562.45.'})),explanationPosts(log)[0]);
});
await run('an invoice that changed under the form says so and keeps the typed number','kegs-werk-stale',async({doc,dom,click,button,log})=>{
  await enter(dom,kegsInput(doc),'1');await click('Record $30.00 credit');
  assert.equal(doc.querySelector('[role=alert]').textContent,STALE);
  assert.equal(kegsInput(doc).value,'1');
  assert.ok(button('Record $30.00 credit').disabled,'no second send against the old state');
  assert.ok(button('Refresh invoice'));
  assert.equal(explanationPosts(log).length,1);
});
await run('a failed save keeps the typed number and allows another try','kegs-werk-error',async({doc,dom,click,button,log})=>{
  await enter(dom,kegsInput(doc),'1');await click('Record $30.00 credit');
  assert.match(doc.querySelector('[role=alert]').textContent,/Could not save this answer\. Reopen the invoice and try again\./);
  assert.equal(kegsInput(doc).value,'1');assert.ok(!button('Record $30.00 credit').disabled);
  await click('Record $30.00 credit');assert.equal(explanationPosts(log).length,2);
});
await run('a question the server asks of the composed sentence never shows another invoice\'s dollars, and the number is kept','kegs-werk-question',async({doc,dom,click,button})=>{
  await enter(dom,kegsInput(doc),'1');await click('Record $30.00 credit');
  // The server's "does not add up" question ends in "For example: Deposit return $30; total due $559." (a different invoice).
  const says=doc.querySelector('[role=alert]').textContent;
  assert.equal(says,'Could not save this answer. Reopen the invoice and try again.');
  assert.ok(!says.includes('$559'));
  assert.equal(kegsInput(doc).value,'1');assert.ok(!button('Record $30.00 credit').disabled);
});
await run('a question with nothing from another invoice in it is shown as the server wrote it, and the number is kept','kegs-werk-asks-missing',async({doc,dom,click})=>{
  await enter(dom,kegsInput(doc),'1');await click('Record $30.00 credit');
  assert.equal(doc.querySelector('[role=alert]').textContent,'This may also describe missing product. State the empty-keg deposit credit separately; record any missing full keg on its item.');
  assert.equal(kegsInput(doc).value,'1');
});
await run('Describe something else opens the box with an example from this invoice, and the number stays above it','kegs-werk',async({doc,click,button})=>{
  await click('Describe something else');
  const section=sectionOf(doc),box=section.querySelector('textarea');
  assert.ok(box);assert.equal(box.value,'');
  assert.equal(button('Use the keg count instead').getAttribute('aria-expanded'),'true');
  assert.match(section.textContent,/For example: “Returned two empty kegs\. Deposit credit \$60; total due \$210\.” This records the credit\. If a full keg was missing, record that on its item below\./);
  assert.ok(!section.textContent.includes('$559'));assert.ok(!section.textContent.includes('Returned one empty keg'));
  assert.ok(kegsInput(doc).compareDocumentPosition(box) & 4,'the number control stays first');
  await click('Use the keg count instead');assert.ok(!sectionOf(doc).querySelector('textarea'));
});
await run('a reply with no dollar amount is told what to type, using this invoice\'s numbers, and keeps what was typed','kegs-werk',async({doc,dom,click,log})=>{
  await click('Describe something else');
  await typeInto(dom,sectionOf(doc).querySelector('textarea'),'yes empty kegs');
  await click('Save answer');
  assert.equal(doc.querySelector('[role=alert]').textContent,'Add the credit in dollars, like: Returned two empty kegs. Deposit credit $60; total due $210.');
  assert.ok(!doc.querySelector('[role=alert]').textContent.includes('Was this an empty-keg deposit return'));
  assert.equal(sectionOf(doc).querySelector('textarea').value,'yes empty kegs');
  assert.ok(explanationPosts(log)[0].includes('"text":"yes empty kegs"'));
});
await run('the no-amount line for another invoice carries that invoice\'s numbers, never $559 or $60','kegs-phase3',async({doc,dom,click})=>{
  await click('Describe something else');
  await typeInto(dom,sectionOf(doc).querySelector('textarea'),'yes empty kegs');await click('Save answer');
  const says=doc.querySelector('[role=alert]').textContent;
  assert.equal(says,'Add the credit in dollars, like: Returned three empty kegs. Deposit credit $90; total due $499.');
  assert.ok(!says.includes('$559')&&!says.includes('$60'));
});
// The server's "does not add up" question ends in another invoice's example ("Deposit return $30; total due $559."), and its
// "was this a deposit return" question tells someone who gave dollars to give dollars. Neither is shown; this invoice's numbers are.
const SUM_WERK='That did not add up. The credit plus the amount due must equal the original bill of $270.00. Try: Returned two empty kegs. Deposit credit $60; total due $210.';
for(const [why,typed] of [['a total that is off','Returned two empty kegs. Deposit credit $60; total due $200.'],['a credit above the bill','Returned two empty kegs. Deposit credit $300; total due $210.'],['a credit typo','Returned two empty kegs. Deposit credit $50; total due $210.']])
  await run('amounts that do not add up ('+why+') are told so with this invoice\'s numbers, never $559, and the typed words are kept','kegs-werk',async({doc,dom,click,log})=>{
    await click('Describe something else');
    await typeInto(dom,sectionOf(doc).querySelector('textarea'),typed);await click('Save answer');
    const says=doc.querySelector('[role=alert]').textContent;
    assert.equal(says,SUM_WERK);assert.ok(!says.includes('$559'));assert.ok(!says.includes('For example'));
    assert.equal(sectionOf(doc).querySelector('textarea').value,typed);
    assert.equal(explanationPosts(log).length,1);
  });
await run('amounts that do not add up on another invoice carry that invoice\'s own bill and example','kegs-phase3',async({doc,dom,click})=>{
  await click('Describe something else');
  await typeInto(dom,sectionOf(doc).querySelector('textarea'),'Returned three empty kegs. Deposit credit $50; total due $499.');await click('Save answer');
  const says=doc.querySelector('[role=alert]').textContent;
  assert.equal(says,'That did not add up. The credit plus the amount due must equal the original bill of $589.00. Try: Returned three empty kegs. Deposit credit $90; total due $499.');
  assert.ok(!says.includes('$559')&&!says.includes('$270'));
});
await run('a dollar amount without the words the server reads (Empty x2 -60) is told which words to use, with this invoice\'s example','kegs-werk',async({doc,dom,click})=>{
  await click('Describe something else');
  for(const typed of ['Empty x2 -60','Returned 2 empty kegs, credit $60','2 kegs deposit credit -60']) {
    await typeInto(dom,sectionOf(doc).querySelector('textarea'),typed);await click('Save answer');
    const says=doc.querySelector('[role=alert]').textContent;
    assert.equal(says,'Use the words empty keg, deposit and credit, like: Returned two empty kegs. Deposit credit $60; total due $210.',typed);
    assert.ok(!says.includes('Tell us the deposit credit in dollars'),typed);assert.equal(sectionOf(doc).querySelector('textarea').value,typed);
  }
});
await run('words the server reads as missing product, or too many decimals, keep the server\'s own question','kegs-werk',async({doc,dom,click})=>{
  await click('Describe something else');
  await typeInto(dom,sectionOf(doc).querySelector('textarea'),'Returned the empty keg. Deposit credit $30, but a full keg was missing');await click('Save answer');
  assert.equal(doc.querySelector('[role=alert]').textContent,'This may also describe missing product. State the empty-keg deposit credit separately; record any missing full keg on its item.');
  await typeInto(dom,sectionOf(doc).querySelector('textarea'),'Returned 2 empty kegs. Deposit credit $60.555; total due $209.445.');await click('Save answer');
  assert.equal(doc.querySelector('[role=alert]').textContent,'Use dollar amounts with at most two decimal places for the deposit credit and revised total.');
});
await run('a correction that does not add up names the original bill, and the text keeps what was typed','kegs-saved',async({doc,dom,click})=>{
  await click('Correct this answer');
  await typeInto(dom,sectionOf(doc).querySelector('textarea'),'Returned two empty kegs. Deposit credit $50; total due $210.');await click('Save answer');
  const says=doc.querySelector('[role=alert]').textContent;
  assert.equal(says,SUM_WERK);assert.ok(!says.includes('$559'));
  assert.equal(sectionOf(doc).querySelector('textarea').value,'Returned two empty kegs. Deposit credit $50; total due $210.');
});
await run('with no single rate to work from, a sum that does not add up shows no dollar figure from anywhere','kegs-mixed',async({doc,dom,click})=>{
  await typeInto(dom,sectionOf(doc).querySelector('textarea'),'Returned two empty kegs. Deposit credit $50; total due $210.');await click('Save answer');
  const says=doc.querySelector('[role=alert]').textContent;
  assert.equal(says,'That did not add up. The credit plus the amount due must equal the original bill. Say how many empty kegs went back, the credit and the total due.');
  assert.ok(!says.includes('$'));
});
for(const mode of ['kegs-unread','kegs-zero']) await run('an unread printed total keeps the honest message and offers no form: '+mode,mode,async({doc,button,log})=>{
  const section=sectionOf(doc);
  assert.match(section.textContent,/The printed total was not read, so the credit cannot be recorded here yet\. Check the original invoice\./);
  assert.ok(!kegsInput(doc));assert.ok(!section.querySelector('textarea'));assert.ok(!button('Describe something else'));assert.ok(!button('Save answer'));
  assert.ok(!log().includes('POST'));
});
await run('mixed deposit rates fall back to the text box, whose example has no dollar figure from another invoice','kegs-mixed',async({doc,dom,click,log})=>{
  const section=sectionOf(doc);
  assert.ok(!kegsInput(doc));assert.ok(!section.textContent.includes('Describe something else'));
  const box=section.querySelector('textarea');assert.ok(box);
  assert.equal(section.querySelector('label').textContent,'Explain the empty-keg deposit return');
  const example=[...section.querySelectorAll('p')].find(p=>p.textContent.includes('Say how many')).textContent;
  assert.ok(!example.includes('$'),example);assert.ok(!example.includes('559'));
  assert.match(example,/Say how many empty kegs went back, the deposit credit in dollars and the total due after it\. This records the credit\. If a full keg was missing, record that on its item below\./);
  await typeInto(dom,box,'yes empty kegs');await click('Save answer');
  const says=doc.querySelector('[role=alert]').textContent;
  assert.equal(says,'Add the credit in dollars and the total due after it, and say how many empty kegs went back.');
  assert.ok(!says.includes('$'));assert.equal(sectionOf(doc).querySelector('textarea').value,'yes empty kegs');
  assert.equal(explanationPosts(log).length,1);
  assert.match(doc.querySelector('.lq-invd-review').textContent,/State the credit and revised total below to record the adjustment\./);
});
await run('a negative deposit line already on the invoice falls back to the text box without inventing numbers','kegs-credit-present',async({doc})=>{
  const section=sectionOf(doc);
  assert.ok(!kegsInput(doc));assert.ok(section.querySelector('textarea'));
  assert.ok(![...section.querySelectorAll('p')].some(p=>p.textContent.includes('For example')&&p.textContent.includes('$')));
});
await run('an answered deposit return still offers Correct this answer, which opens the text box with the original bill\'s example','kegs-saved',async({doc,button,click,log})=>{
  const section=sectionOf(doc);
  assert.match(section.textContent,/Original bill \$270\.00.*\$60\.00.*\$210\.00 due/);
  assert.ok(!kegsInput(doc));assert.ok(!section.querySelector('textarea'));
  await click('Correct this answer');
  assert.ok(!kegsInput(doc),'a correction is the free-text path');
  const box=sectionOf(doc).querySelector('textarea');assert.equal(box.value,'Empty-keg deposit return $60.00; total due $210.00.');
  assert.match(sectionOf(doc).textContent,/For example: “Returned two empty kegs\. Deposit credit \$60; total due \$210\.”/);
  assert.ok(button('Save answer')&&button('Cancel'));assert.ok(!log().includes('POST'));
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
if(failed.length){console.log(`${failed.length} scenario(s) failed`);process.exitCode=1;}
