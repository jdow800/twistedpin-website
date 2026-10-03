import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const bundle=await readFile(new URL('./dist/beer-fixture.js',import.meta.url),'utf8');
const pause=() => new Promise(resolve=>setTimeout(resolve,10));
async function until(fn) {
  for (let i=0;i<100;i++) { if (fn()) return; await pause(); }
  throw new Error('Beer UI condition timed out');
}
let passed=0;
async function run(name,mode,check) {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/?mode=${mode}`,runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.Response=Response;
  try {
    dom.window.eval(bundle);
    const doc=dom.window.document;
    await until(()=>doc.querySelector('.lq-beer-row'));
    const row=doc.querySelector('.lq-beer-row');
    const inputs=()=>[...row.querySelectorAll('input')];
    const buttons=()=>[...row.querySelectorAll('.lq-bstep-ctl button')];
    const fields=()=>inputs().map(input=>Number(input.value));
    const total=()=>Number(row.querySelector('.lq-beer-total').textContent.split(' ')[0]) || 0;
    const click=async index=>{buttons()[index].click();await pause();};
    const fill=async(index,value)=>{
      const input=inputs()[index];
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,value);
      input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
      await pause();
    };
    await check({doc,row,inputs,buttons,fields,total,click,fill,qa:dom.window.beerQa});
    console.log('PASS',name); passed++;
  } finally { dom.window.close(); }
}

await run('8 loose at the front plus 6 in another cooler stays 14 loose bottles','new',async ({fields,total,click,qa})=>{
  for(let i=1;i<=14;i++) {
    await click(5);
    assert.deepEqual(fields(),[0,0,i]);
    assert.equal(total(),i);
  }
  await qa.flush();
  const saved=qa.lines.find(line=>line.skuId==='lager');
  assert.equal(saved.qtyUnits,14);
  assert.equal(saved.enteredCases,undefined);
  assert.equal(saved.enteredPacks,undefined);
});

await run('rapid taps cross six-pack, case and three-digit boundaries without rollover','new',async ({buttons,fields,total,qa})=>{
  for(let i=0;i<156;i++) buttons()[5].click();
  await until(()=>total()===156);
  assert.deepEqual(fields(),[0,0,156]);
  await qa.flush();
  assert.equal(qa.lines.find(line=>line.skuId==='lager').qtyUnits,156);
});

await run('one case, two six-packs and fourteen loose bottles persist independent tiers','new',async ({click,fill,fields,total,qa})=>{
  await click(1);await click(3);await click(3);await fill(2,'14');
  assert.deepEqual(fields(),[1,2,14]);
  assert.equal(total(),50);
  await qa.flush();
  const saved=qa.lines.find(line=>line.skuId==='lager');
  assert.equal(saved.qtyUnits,50);assert.equal(saved.enteredCases,1);assert.equal(saved.caseSizeAtEntry,24);
  assert.equal(saved.enteredPacks,2);assert.equal(saved.packSizeAtEntry,6);
  const call=qa.calls.findLast(call=>call.path.endsWith('/lines'));
  assert.equal(call.body.isFullCount,false);assert.equal(call.body.section,'bar');
});

await run('restored database numeric strings increment numerically','resumed',async ({fields,total,click,qa})=>{
  assert.deepEqual(fields(),[2,1,14]);assert.equal(total(),68);
  await click(5);
  assert.deepEqual(fields(),[2,1,15]);assert.equal(total(),69);
  await qa.flush();assert.equal(qa.lines.find(line=>line.skuId==='lager').qtyUnits,69);
});

await run('resumed frozen case size survives a catalog case-size change','frozen',async ({fields,total,click,qa})=>{
  assert.deepEqual(fields(),[1,1,14]);assert.equal(total(),32);
  await click(1);assert.equal(total(),44);
  await qa.flush();assert.equal(qa.lines.find(line=>line.skuId==='lager').caseSizeAtEntry,12);
});

await run('resumed four-bottle packs stay frozen through a loose tap, save and reopen','frozen-pack',async ({doc,fields,total,click,qa})=>{
  assert.deepEqual(fields(),[0,2,0]);assert.equal(total(),8);
  assert.match(doc.querySelector('.lq-beer-row').textContent,/packs of 4/);
  await click(5);assert.deepEqual(fields(),[0,2,1]);assert.equal(total(),9);
  await qa.flush();
  const saved=qa.lines.find(line=>line.skuId==='lager');
  assert.equal(saved.qtyUnits,9);assert.equal(saved.enteredPacks,2);assert.equal(saved.packSizeAtEntry,4);
  const previous=doc.querySelector('.lq-beer-row');qa.reopen();
  await until(()=>doc.querySelector('.lq-beer-row')&&doc.querySelector('.lq-beer-row')!==previous);
  const reopened=doc.querySelector('.lq-beer-row');
  assert.deepEqual([...reopened.querySelectorAll('input')].map(input=>Number(input.value)),[0,2,1]);
  assert.match(reopened.textContent,/packs of 4/);
});

await run('decrement never borrows from packs; clearing resets all tiers','resumed',async ({row,fields,total,click,qa})=>{
  for(let i=0;i<15;i++) await click(4);
  assert.deepEqual(fields(),[2,1,0]);assert.equal(total(),54);
  row.querySelector('.lq-beer-clear').click();await pause();
  assert.deepEqual(fields(),[0,0,0]);assert.equal(total(),0);
  await qa.flush();
  assert.equal(qa.lines.length,0,'clearing removes the answer; the explicit empty-cooler action is tested separately');
});

await run('missing case size disables only cases','new',async ({doc})=>{
  const row=[...doc.querySelectorAll('.lq-beer-row')].at(-1);
  const inputs=[...row.querySelectorAll('input')];
  assert.equal(inputs[0].disabled,true);assert.equal(inputs[1].disabled,false);assert.equal(inputs[2].disabled,false);
});

await run('repeated save and reopen never multiply existing cases, packs or loose bottles','new',async ({doc,click,fill,qa})=>{
  await click(1);await click(3);await click(3);await fill(2,'14');
  for(let cycle=0;cycle<5;cycle++) {
    await qa.flush();
    assert.equal(qa.lines.find(line=>line.skuId==='lager').qtyUnits,50+cycle);
    const previous=doc.querySelector('.lq-beer-row');
    qa.reopen();
    await until(()=>doc.querySelector('.lq-beer-row') && doc.querySelector('.lq-beer-row')!==previous);
    const row=doc.querySelector('.lq-beer-row');
    assert.deepEqual([...row.querySelectorAll('input')].map(input=>Number(input.value)),[1,2,14+cycle]);
    row.querySelectorAll('.lq-bstep-ctl button')[5].click();await pause();
  }
  await qa.flush();assert.equal(qa.lines.find(line=>line.skuId==='lager').qtyUnits,55);
});

await run('an untouched screen never saves, so it cannot wipe another phone\'s count','resumed',async ({qa})=>{
  await qa.flush();
  assert.equal(qa.calls.filter(call=>call.path.endsWith('/lines')).length,0);
});

await run('a stale save merges: the other phone\'s numbers stay, this counter\'s tap wins','stale',async ({doc,click,qa})=>{
  await click(5); // one loose Example Lager
  await qa.flush();
  const saves=qa.calls.filter(call=>call.path.endsWith('/lines'));
  assert.equal(saves.length,2,'refused once, then saved the merge');
  assert.equal(saves[0].body.baseHash,'server1');
  assert.equal(saves[1].body.baseHash,'server2');
  const merged=Object.fromEntries(saves[1].body.lines.map(line=>[line.skuId,Number(line.qtyUnits)]));
  assert.equal(merged.lager,1,'the counter changed it here');
  assert.equal(merged.light,12,'untouched here: the other phone\'s 12, not this screen\'s 0');
  const light=()=>[...doc.querySelectorAll('.lq-beer-row')].find(row=>row.textContent.includes('Example Light'));
  await until(()=>light().querySelectorAll('input')[2].value==='12');
  assert.deepEqual([...light().querySelectorAll('input')].map(input=>Number(input.value)),[0,0,12]);
  assert.match(doc.querySelector('.lq-beer-save').textContent,/included a change made elsewhere/);
});

await run('"None of these in the cooler" records a zero for every beer; a number afterwards undoes it','new',async ({doc,click,qa})=>{
  const none=()=>[...doc.querySelectorAll('button')].find(b=>b.textContent==='None of these in the cooler');
  none().click();await pause();
  assert.match(doc.querySelector('.lq-beer').textContent,/Recorded: none of these in the cooler\./);
  assert.equal(qa.state.count,3,'every beer was looked at, so the keg check sends it');
  await qa.flush();
  assert.deepEqual(Array.from(qa.lines,line=>[line.skuId,line.qtyUnits]),[['lager',0],['light',0],['unknown',0]]);
  await click(5);await click(4); // one loose Lager, then back to zero
  assert.ok(none(),'the claim was undone by counting, so it can be made again');
  await qa.flush();
  assert.equal(qa.lines.length,0,'all clear again reads as not counted');
});

await run('a failed save says so to the keg check, which then sends nothing','save-fails',async ({doc,click,qa})=>{
  await click(5);
  assert.equal(await qa.flush(),false);
  await until(()=>/Not saved/.test(doc.querySelector('.lq-beer-save').textContent));
});

console.log(`${passed} synthetic beer UI scenarios passed; no visual-layout claims from the DOM simulation.`);
