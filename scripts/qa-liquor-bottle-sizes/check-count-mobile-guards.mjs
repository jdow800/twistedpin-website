import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

// Actual CountLiquor, API client and React state; fictional stock and controlled
// recorder/HTTP boundaries. Rebuild --liquor-voice before running this script.
const bundle=await readFile(new URL('./dist/liquor-voice-fixture.js',import.meta.url),'utf8');
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(predicate,what='Count UI condition') {
  for(let i=0;i<200;i++) { if(predicate()) return; await pause(); }
  throw new Error(`${what} timed out`);
}
let passed=0;
async function run(name,query,check) {
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{
    url:`http://localhost/${query?'?'+query:''}`,runScripts:'outside-only',pretendToBeVisual:true,
  });
  const win=dom.window;
  win.Response=Response;
  win.scrollTo=()=>{};
  win.HTMLElement.prototype.scrollIntoView=()=>{};
  try {
    win.eval(bundle);
    const doc=win.document;
    // The saved draft opens on the resume prompt (2026-10-07).
    await until(()=>doc.querySelector('.lq-count-entry')||doc.querySelectorAll('.lq-zone').length===2,'Loaded count');
    [...doc.querySelectorAll('.lq-count-entry button')].find(b=>b.textContent.trim()==='Continue count')?.click();
    await until(()=>doc.querySelectorAll('.lq-zone').length===2,'Loaded shelves');
    const qa=win.liquorQa;
    const button=text=>[...doc.querySelectorAll('button')].find(b=>typeof text==='string'
      ?b.textContent.trim()===text:text.test(b.textContent.trim()));
    const click=async text=>{
      const b=button(text);
      assert.ok(b,`Missing button: ${text}`);
      assert.ok(!b.matches(':disabled'),`Button unexpectedly disabled: ${text}`);
      b.click();await pause();
    };
    const shelf=async name=>{
      const tile=[...doc.querySelectorAll('.lq-zone')].find(b=>b.querySelector('.lq-zone-name')?.textContent===name);
      assert.ok(tile && !tile.matches(':disabled'),`Shelf unavailable: ${name}`);
      tile.click();await pause();
    };
    const input=async(el,value)=>{
      assert.ok(el,'Missing quantity input');
      el.focus();
      Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype,'value').set.call(el,value);
      el.dispatchEvent(new win.Event('input',{bubbles:true}));
      await pause();el.blur();await pause();
    };
    await check({win,doc,qa,button,click,shelf,input});
    console.log('PASS',name);passed++;
  } finally { win.close(); }
}

// This guard controls one extraction per supplied segment; default pause/carry
// behavior is exercised by check-liquor-voice.mjs.
await run('model-zero waits; only a human literal zero records an observed empty shelf','pausecuts=0',async t=>{
  await t.shelf('Well');
  await t.click(/Record count for/);
  t.qa.recorder.segment('none titos',0);await pause();
  t.qa.extracts[0].succeed([{
    spoken:'none titos',cases:0,units:0,qty:0,unitsPerCase:12,needsCaseSize:false,
    suspectPreMultiplied:false,match:{id:'titos',name:'Titos',sizeMl:1000},candidates:[],
  }]);await pause();
  await t.click(/Stop & review/);
  t.qa.recorder.finish('none titos');await until(()=>t.doc.querySelector('.lq-sheet'),'Review sheet');
  const add=()=>t.button(/^Add [0-9]+ to Well$/);
  assert.ok(add().disabled,'missing and model-zero quantities must stay unresolved');
  const qty=t.doc.querySelector('.lq-rev .lq-qty-input');
  await t.input(qty,'0');assert.ok(!add().disabled,'literal zero answers the question');
  await t.input(qty,'');assert.ok(add().disabled,'backspacing is not an observed zero');
  await t.input(qty,'0');
  await t.click('Add 1 to Well');await until(()=>t.qa.lines.some(l=>l.skuId==='titos'),'Saved zero');
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='titos').qtyUnits),0);
  const counted=t.doc.querySelector('input[aria-label="Loose Tito\'s Handmade Vodka"]');
  assert.equal(counted.value,'0','a counted zero is visible, not a placeholder');
  counted.focus();counted.blur();await pause();assert.equal(counted.value,'0');
  await t.input(t.doc.querySelector('input.lq-search'),'Jameson');
  const untouched=t.doc.querySelector('.lq-searchlist input[aria-label="Loose Jameson Irish Whiskey"]');
  assert.equal(untouched.value,'','an uncounted shelf cell only shows its zero placeholder');
  untouched.focus();untouched.blur();await pause();
  assert.ok(!t.qa.lines.some(l=>l.zoneId==='well' && l.skuId==='jameson'),'focus/blur cannot record an untouched zero');
});

await run('resumed precision and batch fractions survive held checking and submission','precision',async t=>{
  const batch=t.doc.querySelector('input[aria-label="Example Batch full containers"]');
  assert.equal(batch.value,'0.125','editable fields show saved precision');
  t.doc.querySelector('button[aria-label="increase Example Batch"]').click();await pause();
  assert.equal(batch.value,'0.625','half-container step preserves the entered fraction');
  t.doc.querySelector('button[aria-label="decrease Example Batch"]').click();await pause();
  assert.equal(batch.value,'0.125');
  await t.shelf('Back Bar');
  const loose=t.doc.querySelector('input[aria-label="Loose Jameson Irish Whiskey"]');
  assert.equal(loose.value,'0.125','looseOf must not display-round a restored quantity');
  loose.focus();loose.blur();await pause();assert.equal(loose.value,'0.125');
  await t.input(loose,'');
  assert.equal(loose.value,'0.125','blanking a resumed loose field leaves its saved answer intact');
  await t.input(loose,'-1');
  assert.equal(loose.value,'0.125','a negative loose edit cannot record an observed zero');
  await t.shelf('Well');
  const restoredBatch=t.doc.querySelector('input[aria-label="Example Batch full containers"]');
  await t.input(restoredBatch,'');
  assert.equal(restoredBatch.value,'0.125','blanking a resumed batch leaves its saved answer intact');
  await t.input(restoredBatch,'-1');
  assert.equal(restoredBatch.value,'0.125','a negative batch edit cannot record an observed zero');
  await t.shelf('Back Bar');

  const original=t.win.fetch;
  let releaseCheck,releaseSubmit;
  t.win.fetch=async(input,init)=>{
    const path=new URL(String(input),t.win.location.origin).pathname;
    const response=await original(input,init);
    if(path.endsWith('/precheck'))return new Promise(resolve=>{releaseCheck=()=>resolve(response);});
    if(path.endsWith('/submit'))return new Promise(resolve=>{releaseSubmit=()=>resolve(response);});
    return response;
  };
  const frozen=()=>{
    const controls=[...t.doc.querySelectorAll('.lq-count-controls button,.lq-count-controls input,.lq-count-controls select')];
    assert.ok(controls.length>5 && controls.every(el=>el.matches(':disabled')),'all counting controls freeze while busy');
    assert.ok(t.button(/Record count for/).disabled);
    assert.ok(t.button('Home').disabled);
    t.button(/Record count for/).click();
    assert.equal(t.doc.querySelector('.lq-rec'),null,'a blocked Record tap cannot start a take');
  };
  await t.click('Finish count');await until(()=>releaseCheck,'Held precheck');frozen();
  releaseCheck();await until(()=>t.button('Submit anyway'),'Confirmation');
  await t.click('Submit anyway');await until(()=>releaseSubmit,'Held submit');
  assert.equal(t.doc.querySelector('.lq-confirm'),null,'the pending submit already closed its modal');frozen();
  assert.equal(Number(t.qa.lines.find(l=>l.skuId==='jameson').qtyUnits),0.125,'untouched resumed precision saves unchanged');
  assert.equal(Number(t.qa.batches.find(l=>l.batchId==='sample-batch').fullEquivalents),0.125,'batch steppers preserve saved precision');
  releaseSubmit();await until(()=>t.doc.querySelector('.lq-h2')?.textContent==='Count submitted','Submit success');
});

console.log(`${passed} count mobile guard scenarios passed; DOM checks make no physical-device or visual-layout claim.`);
