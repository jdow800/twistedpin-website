import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const bundle=await readFile(new URL('./dist/invoice-fixture.js',import.meta.url),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
const until=async(fn)=>{for(let i=0;i<100;i++){if(fn())return;await pause();}throw Error('Category UI condition timed out');};
let passed=0;
async function run(name,mode,fn){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/?mode=${mode}`,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.Response=Response;dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  try {
    dom.window.eval(bundle);const doc=dom.window.document;
    await until(()=>doc.querySelector('.lq-invd'));
    const button=(text,root=doc)=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
    const click=async(text,root=doc)=>{assert.ok(button(text,root),`Missing ${text}`);button(text,root).click();await pause();};
    const radio=async(value,root=doc)=>{const input=root.querySelector(`input[type=radio][value="${value}"]`);assert.ok(input,`Missing ${value}`);input.click();await pause();};
    const type=async(selector,value)=>{const input=doc.querySelector(selector);assert.ok(input,`Missing ${selector}`);Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await pause();};
    const writes=()=>doc.getElementById('audit').textContent.split('\n').filter(row=>row.startsWith('POST'));
    await fn({doc,dom,button,click,radio,type,writes});passed++;console.log('PASS',name);
  }finally{dom.window.close();}
}
for(const [category,label] of [['supplies','Supplies & cleaning'],['smallwares','Smallwares'],['equipment','Equipment']]) {
  await run(`explicit ${category} saves, retains dollars, and can be corrected`,'category-new',async({doc,button,click,radio,writes})=>{
    assert.equal(doc.querySelectorAll('input[type=radio]').length,4);
    assert.ok(!doc.querySelector('input[type=radio]:checked'));assert.ok(button('Save answer').disabled);
    await radio(category);assert.equal(writes().length,0);assert.ok(!doc.querySelector('input[type=search]'));
    await click('Save answer');await until(()=>!!button('Change answer'));
    assert.match(doc.body.textContent,new RegExp(`${label.replace('&','&')} · Not counted`));
    assert.match(doc.querySelector('.lq-invd-amt').textContent,/50.00/);
    assert.match(writes()[0],new RegExp(`"category":"${category}","expectedNonInventoryCategory":null,"expectedSupplierNonInventoryCategory":null`));
    assert.ok(!doc.querySelector('.lq-invd-questions'));assert.match(doc.getElementById('invoice-progress').textContent,/Purchase retained; not counted/);
    await click('Change answer');assert.equal(doc.querySelector('input:checked').value,category);
    await radio(category==='equipment'?'smallwares':'equipment');assert.equal(writes().length,1);
    await click('Save answer');await until(()=>writes().length===2&&!!button('Change answer'));
    assert.match(writes()[1],new RegExp(`"expectedNonInventoryCategory":"${category}","expectedSupplierNonInventoryCategory":"${category}"`));
  });
}
await run('saved noninventory can become inventory, with an explicit save and old category expectations','category-saved',async({doc,click,radio,type,writes})=>{
  await click('Change answer');await radio('inventory');await type('input[type=search]','pepperoni');
  const result=[...doc.querySelectorAll('.lq-rev-assign button')].find(b=>b.textContent.includes('Peperoni Sliced'));
  assert.ok(result);result.click();await pause();assert.equal(writes().length,0);
  await click('Save answer');await until(()=>writes().length===1&&!doc.body.textContent.includes('Smallwares · Not counted'));
  assert.match(writes()[0],/\/match /);assert.match(writes()[0],/"expectedNonInventory":true,"expectedNonInventoryCategory":"smallwares","expectedSupplierNonInventoryCategory":"smallwares"/);
  assert.match(doc.body.textContent,/Check the inventory price/);
});
await run('changing inventory selection or cancelling a category does not save','category-saved',async({click,radio,type,writes,doc})=>{
  await click('Change answer');await radio('inventory');await type('input[type=search]','pepperoni');
  doc.querySelector('.lq-rev-assign button').click();await pause();await radio('equipment');await click('Cancel');
  assert.equal(writes().length,0);assert.match(doc.body.textContent,/Smallwares · Not counted/);
});
await run('legacy supplies receive the right human label and null-safe correction','category-legacy-saved',async({doc,click,radio,writes})=>{
  assert.match(doc.body.textContent,/Supplies & cleaning · Not counted/);await click('Change answer');await radio('smallwares');await click('Save answer');
  await until(()=>writes().length===1);assert.match(writes()[0],/"expectedNonInventoryCategory":"supplies","expectedSupplierNonInventoryCategory":"supplies"/);
});
for(const mode of ['category-stale','category-supplier-stale','category-failure','category-unconfirmed']) await run(`failed save remains honest: ${mode}`,mode,async({doc,click,radio,button,writes})=>{
  await radio('equipment');await click('Save answer');await until(()=>doc.querySelector('[role=alert]'));
  assert.equal(doc.querySelector('input:checked').value,'equipment');assert.equal(writes().length,1);assert.ok(!button('Change answer'));
  if(mode.includes('stale')||mode==='category-unconfirmed')assert.ok(button('Reload item'));else assert.ok(!button('Save answer').disabled);
});
await run('a category leaves unrelated amount questions open','category-amount',async({doc,click,radio,button})=>{
  await radio('smallwares');await click('Save answer');await until(()=>button('Change answer'));
  assert.match(doc.querySelector('.lq-invd-questions').textContent,/line amount does not reconcile/);
});
await run('radio groups are independent for two invoice lines','category-two',async({doc,radio,writes})=>{
  const cards=doc.querySelectorAll('.lq-invd-line');assert.notEqual(cards[0].querySelector('input[type=radio]').name,cards[1].querySelector('input[type=radio]').name);
  await radio('smallwares',cards[0]);await radio('equipment',cards[1]);assert.equal(doc.querySelectorAll('input:checked').length,2);assert.equal(writes().length,0);
});
await run('an API without category support never offers or sends new labels','category-unsupported',async({doc,writes})=>{
  assert.ok(!doc.querySelector('input[type=radio]'));assert.ok(doc.querySelector('input[type=search]'));assert.equal(writes().length,0);
});
await run('missing supplier code explains why a category cannot save','category-missing-code',async({doc,radio,button,writes})=>{
  await radio('equipment');assert.ok(button('Save answer').disabled);assert.match(doc.body.textContent,/needs a supplier product code/);assert.equal(writes().length,0);
});
console.log(`Invoice category UI: ${passed} scenarios passed`);
for(const mode of ['category-refresh-failure','category-correction-refresh-failure'])await run(`confirmed save survives failed refresh: ${mode}`,mode,async({doc,click,radio,button})=>{
  if(button('Change answer'))await click('Change answer');await radio('equipment');await click('Save answer');
  await until(()=>button('Change answer'));assert.match(doc.body.textContent,/Equipment · Not counted/);
  assert.match(doc.body.textContent,/could not refresh/);assert.ok(!doc.querySelector('input[type=radio]'));
  await click('Change answer');assert.equal(doc.querySelector('input:checked').value,'equipment');
});
await run('historical purchase category does not claim to control a newer supplier answer','category-historical',async({doc})=>{
  assert.match(doc.body.textContent,/Smallwares · Not counted/);assert.match(doc.body.textContent,/Future orders use Equipment/);
  assert.ok(!doc.body.textContent.includes('Future orders of this supplier product use the same category'));
});
await run('an existing cost bucket refusal does not invent an inventory match','category-bucket-conflict',async({doc,radio,click})=>{
  await radio('smallwares');await click('Save answer');await until(()=>doc.querySelector('[role=alert]'));
  assert.match(doc.querySelector('[role=alert]').textContent,/already filed under Paper\. No category change was saved/);
  assert.ok(!doc.querySelector('[role=alert]').textContent.includes('inventory match'));
});
console.log(`Invoice category UI final: ${passed} scenarios passed`);
