import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const {JSDOM}=process.env.COGS_QA_DEPS?createRequire(join(resolve(process.env.COGS_QA_DEPS),'package.json'))('jsdom'):await import('jsdom');
const bundle=await readFile(new URL('./dist/fixture.js',import.meta.url),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(test,what){for(let i=0;i<200;i++){if(test())return;await pause();}throw Error(`${what} timed out`);}
let passed=0;
async function run(name,query,test){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/?${query}`,runScripts:'outside-only',pretendToBeVisual:true});
 dom.window.Response=Response;
 try{dom.window.eval(bundle);const doc=dom.window.document, text=()=>doc.body.textContent.replace(/\s+/g,' '), button=name=>[...doc.querySelectorAll('button')].find(b=>b.textContent.trim()===name);
  const click=async name=>{const b=button(name);assert.ok(b,`button ${name}`);assert.ok(!b.disabled,`${name} disabled`);b.click();await pause();};
  const type=async(el,value)=>{assert.ok(el,'input exists');const proto=el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await pause();};
  const control=label=>[...doc.querySelectorAll('label')].find(l=>l.textContent.startsWith(label))?.querySelector('input,select,textarea');
  await test({dom,doc,text,button,click,type,control,qa:dom.window.insightsQa});console.log(`PASS ${name}`);passed++;
 }finally{dom.window.close();}
}
await run('failed source does not claim all clear','view=ops&mode=warnings',async t=>{
 await until(()=>t.text().includes('Recipe source did not respond.'),'source warning');assert.doesNotMatch(t.text(),/All checked sources are clear/);assert.match(t.text(),/No findings in this filter/);assert.ok(t.doc.querySelector('[role="alert"]'));
});
await run('inbox request failure retains an explicit error','view=ops&mode=network',async t=>{
 await until(()=>t.text().includes('The inbox could not be checked.'),'request error');assert.doesNotMatch(t.text(),/All checked sources are clear/);assert.equal(t.doc.querySelectorAll('article').length,0);
});
await run('unknown impact has its own filter and paging resets on filter changes','view=ops&mode=paging&admin=0',async t=>{
 await until(()=>t.doc.querySelectorAll('article').length===30,'first page');await t.type(t.control('Impact'),'unknown');
 await until(()=>t.qa.calls.some(c=>c.query.impact==='unknown'),'unknown filter');await until(()=>t.text().includes('65 findings'),'filtered result');
 assert.equal(t.doc.querySelectorAll('article').length,30);assert.match(t.text(),/Impact unknown/);assert.doesNotMatch(t.text(),/Known recipe exposure/);assert.match(t.text(),/An admin must save the correction/);
 await t.click('Next');await until(()=>t.text().includes('Missing recipe 31'),'second page');assert.ok(t.qa.calls.some(c=>c.query.impact==='unknown'&&c.query.offset==='30'));
 await t.click('Next');await until(()=>t.text().includes('Missing recipe 61'),'third page');assert.equal(t.doc.querySelectorAll('article').length,5);assert.ok(t.button('Next').disabled);
 await t.type(t.control('Impact'),'known');await until(()=>t.text().includes('Known recipe exposure'),'known filter');assert.ok(t.qa.calls.some(c=>c.query.impact==='known'&&c.query.offset==='0'));assert.ok(t.button('Previous').disabled);assert.match(t.text(),/\$175\.00/);
});
await run('trends keep reliable and all brackets separate with Chicago closing dates','view=trends',async t=>{
 await until(()=>t.text().includes('Reliable final brackets'),'trends');const cards=[...t.doc.querySelectorAll('article')];assert.match(cards[0].textContent,/30\.00%/);assert.match(cards[0].textContent,/\$300\.00 cost \/ \$1,000\.00 matching sales/);assert.match(cards[1].textContent,/43\.00%/);
 const link=t.doc.querySelector('a[href="/cogs/?view=foodcost&count=count-chicago"]');assert.ok(link);const chicago=new Date('2026-10-04T02:30:00Z').toLocaleDateString(undefined,{timeZone:'America/Chicago'}), utc=new Date('2026-10-04T02:30:00Z').toLocaleDateString(undefined,{timeZone:'UTC'});assert.notEqual(chicago,utc);assert.ok(link.textContent.includes(chicago));assert.ok(!link.textContent.includes(utc));await t.type(t.control('Range'),'12');assert.equal(t.control('Range').value,'12');
});
await run('unknown Brunswick evidence is distinct from a verified zero','view=brunswick',async t=>{
 await until(()=>t.text().includes('Unknown food revenue'),'source list');const cards=[...t.doc.querySelectorAll('button.lq-review-card')];assert.equal(cards.filter(b=>b.textContent.includes('Unknown food revenue')).length,3);assert.equal(cards.filter(b=>b.textContent.includes('$0.00')).length,1);assert.match(cards.find(b=>b.textContent.includes('$0.00')).textContent,/reviewed_department_subtotals/);
 cards[0].click();await pause();assert.match(t.text(),/Food revenue unknown/);assert.doesNotMatch(t.text(),/\$0\.00 food \+ NA/);
});
await run('Brunswick source paging and staff permissions','view=brunswick&admin=0',async t=>{
 await until(()=>t.button('Older reports'),'source paging');await t.click('Older reports');await until(()=>t.qa.calls.some(c=>c.query.offset==='30'),'older request');assert.equal(t.doc.querySelectorAll('button.lq-review-card').length,5);t.doc.querySelector('button.lq-review-card').click();await pause();assert.ok(t.doc.querySelector('fieldset').disabled);assert.equal(t.qa.calls.filter(c=>c.method==='PUT').length,0);
});
await run('stale Brunswick review is preserved until an explicit source reload','view=brunswick&mode=conflict&doc=doc-a',async t=>{
 await until(()=>t.doc.querySelector('form'),'source editor');await t.type(t.control('Classification'),'food_na');await t.type(t.control('Why this review is correct'),'Reviewed printed restaurant total');t.doc.querySelector('input[type="checkbox"]').click();await pause();await t.click('Save reviewed revenue');
 await until(()=>t.text().includes('The source or review changed.'),'stale review');assert.equal(t.control('Why this review is correct').value,'Reviewed printed restaurant total');assert.equal(t.control('Printed department Sales Total ($)').value,'50');assert.equal(t.qa.calls.filter(c=>c.method==='PUT').length,1);
 t.qa.failReload=true;await t.click('Reload source');await until(()=>t.text().includes('Your unsaved review is still here.'),'reload error');assert.equal(t.control('Why this review is correct').value,'Reviewed printed restaurant total');assert.equal(t.control('Printed department Sales Total ($)').value,'50');assert.equal(t.qa.calls.filter(c=>c.method==='PUT').length,1);
 t.qa.failReload=false;await t.click('Reload source');await until(()=>t.control('Printed department Sales Total ($)')?.value==='75','refreshed source');assert.equal(t.control('Why this review is correct').value,'');assert.ok(t.button('Save reviewed revenue').disabled);
 await t.type(t.control('Classification'),'food_na');await t.type(t.control('Why this review is correct'),'Reviewed the corrected printed total');t.doc.querySelector('input[type="checkbox"]').click();await pause();await t.click('Save reviewed revenue');await until(()=>t.qa.calls.filter(c=>c.method==='PUT').length===2,'review second save');const put=t.qa.calls.filter(c=>c.method==='PUT')[1];assert.equal(put.body.sourceRevision,'source-v2');assert.equal(put.body.reviewRevision,'review-v2');assert.equal(put.body.answer.total,75);
});
await run('Food cost does not display all-unknown Brunswick days as zero','view=cost&mode=unknown',async t=>{
 await until(()=>t.text().includes('Food + NA cost'),'food cost');assert.match(t.text(),/Brunswick unknown/);assert.doesNotMatch(t.text(),/Brunswick \$0\.00/);assert.match(t.text(),/Brunswick food revenue is unknown/);
});
await run('Food cost displays a verified Brunswick zero','view=cost&mode=zero',async t=>{
 await until(()=>t.text().includes('Food + NA cost'),'food cost');assert.match(t.text(),/Brunswick \$0\.00/);assert.doesNotMatch(t.text(),/Brunswick unknown|known subtotal/);
});
await run('Food cost labels partial Brunswick evidence as a known subtotal','view=cost&mode=partial',async t=>{
 await until(()=>t.text().includes('Food + NA cost'),'food cost');assert.match(t.text(),/Brunswick \$250\.00 known subtotal \(2 days unknown\)/);assert.match(t.text(),/Provisional/);
});
console.log(`${passed} insights UI QA scenarios passed`);
