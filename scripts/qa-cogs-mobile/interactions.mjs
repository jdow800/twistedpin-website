import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browser} from './cdp.mjs';
import {installFixtures} from './fixtures.mjs';
const out=resolve(process.env.COGS_QA_OUTPUT||fileURLToPath(new URL('./output/after/',import.meta.url)));
const base=process.env.COGS_QA_URL||'http://127.0.0.1:4349/cogs/';
await mkdir(out,{recursive:true});const b=await browser(),checks=[],failures=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=expression=>b.evaluate(expression);
const query=s=>`document.querySelector(${JSON.stringify(s)})`;
const tap=async s=>{await b.until(query(s));await evalJs(`${query(s)}.click()`);await pause(80);};
const text=async re=>{await evalJs(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&new RegExp(${JSON.stringify(re.source)}).test(e.textContent));if(!e||e.disabled)throw Error('Unavailable button '+${JSON.stringify(re.source)});e.click()})()`);await pause(80);};
const input=async(s,v)=>{await b.until(query(s));await evalJs(`(()=>{const e=${query(s)};e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur()})()`);await pause(80);};
const assertJs=async(name,expression)=>{assert.ok(await evalJs(`!!(${expression})`),name);checks.push(name);console.log('PASS',name);};
const open=async(title,query='')=>{const old=await evalJs('window.__cogsQa?.nonce');await b.send('Page.navigate',{url:base+query});await b.until(`window.__cogsQa?.nonce&&window.__cogsQa.nonce!==${JSON.stringify(old??null)}`);await b.until(`document.querySelector('.lq-action')`);await text(new RegExp(title));await b.until(`document.querySelector('.lq-fc-row')||document.querySelector('.lq-cap-title')||document.querySelector('.lq-kc-head')`);};
const row=async name=>{await evalJs(`(()=>{const e=[...document.querySelectorAll('.lq-fc-row')].find(e=>e.querySelector('.lq-fc-row-name')?.textContent.includes(${JSON.stringify(name)}));if(!e)throw Error('Missing row '+${JSON.stringify(name)});e.dataset.qaRow='current'})()`);};
const lastLines=`window.__cogsQa.calls.filter(c=>c.path.endsWith('/lines')).at(-1)?.body.lines`;
const run=async(name,fn)=>{try{await fn();}catch(e){failures.push({name,error:String(e.stack||e)});console.log('FAIL',name,e.message);}};
try{
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${installFixtures.toString()})()`});
  await b.send('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});
  await run('food zero and blank',async()=>{
    await open('Count food');await row('Cup');await input('[data-qa-row="current"] input[aria-label*="loose"]','0');await pause(1000);
    await assertJs('Food literal zero is saved as an observed zero',`${lastLines}.some(l=>l.skuId==='cup'&&l.qtyUnits===0)`);
    await input('[data-qa-row="current"] input[aria-label*="loose"]','');await pause(1000);
    await assertJs('Blanking untouched boxes removes the answer, rather than making zero',`!${lastLines}.some(l=>l.skuId==='cup')`);
    await tap('[data-qa-row="current"] .lq-fc-row-none');await pause(1000);
    await assertJs('None here saves an observed zero',`${lastLines}.some(l=>l.skuId==='cup'&&l.qtyUnits===0)`);
    await tap('[data-qa-row="current"] .lq-fc-row-clear');await pause(1000);
    await assertJs('Clear removes the count line',`!${lastLines}.some(l=>l.skuId==='cup')`);
  });
  await run('food frozen case size',async()=>{
    await open('Count food','?qa=frozen');await row('Pizza Dough');
    await assertJs('Resumed two cases use frozen12 rather than catalog24',`document.querySelector('[data-qa-row="current"]').textContent.includes('×12')&&document.querySelector('[data-qa-row="current"]').querySelector('.lq-fc-row-total').textContent.includes('24')`);
    await tap('[data-qa-row="current"] button[aria-label^="Increase loose"]');await pause(1000);
    await assertJs('Plus changes only loose stock and preserves frozen multiplier',`${lastLines}.some(l=>l.skuId==='dough'&&l.qtyUnits===25&&l.enteredCases===2&&l.caseSizeAtEntry===12)`);
    await tap('[data-qa-row="current"] button[aria-label^="Decrease loose"]');await pause(1000);
    await assertJs('Minus reverses plus without multiplying cases again',`${lastLines}.some(l=>l.skuId==='dough'&&l.qtyUnits===24&&l.enteredCases===2&&l.caseSizeAtEntry===12)`);
  });
  await run('food fractional step precision',async()=>{
    await open('Count food');await row('Pizza Dough');await input('[data-qa-row="current"] input[aria-label$=": cases"]','.125');await tap('[data-qa-row="current"] button[aria-label^="Increase cases"]');await pause(1000);
    await assertJs('Case plus preserves .125 to1.125 with correct canonical quantity',`${lastLines}.some(l=>l.skuId==='dough'&&l.enteredCases===1.125&&l.qtyUnits===22.5)`);
    await tap('[data-qa-row="current"] button[aria-label^="Decrease cases"]');await pause(1000);
    await assertJs('Case minus preserves1.125 to.125 with correct canonical quantity',`${lastLines}.some(l=>l.skuId==='dough'&&l.enteredCases===.125&&l.qtyUnits===2.5)`);
  });
  await run('food packs preserve',async()=>{
    await open('Count food','?qa=packs');await row('Pizza Dough');await input('[data-qa-row="current"] input[aria-label*="loose"]','3');await pause(1000);
    await assertJs('Editing loose stock preserves resumed pack quantity and size',`${lastLines}.some(l=>l.skuId==='dough'&&l.qtyUnits===9&&l.enteredPacks===1&&l.packSizeAtEntry===6)`);
  });
  await run('food missing quantity and unit',async()=>{
    await open('Count food');await evalJs(`window.__cogsQa.voiceItems=[{spoken:'no pretzels',cases:0,units:0,qty:0,unitsPerCase:8,needsCaseSize:false,suspectPreMultiplied:false,match:{id:'pretzel',name:'Pretzel, Giant Bavarian Salted',sizeMl:null},candidates:[],quantityKnown:true},{spoken:'buffalo sauce',cases:0,units:0,qty:0,unitsPerCase:null,needsCaseSize:false,suspectPreMultiplied:false,match:{id:'unknown',name:'Sauce, Buffalo Hot Wing',sizeMl:null},candidates:[],quantityKnown:false},{spoken:'two trays of cups',cases:0,units:2,qty:2,unitsPerCase:24,needsCaseSize:false,suspectPreMultiplied:false,match:{id:'cup',name:'Cup, Clear Plastic 12Oz',sizeMl:null},candidates:[],quantityKnown:true,spokenUnit:'tray',unitNeedsReview:true}]`);
    await text(/Talk through/);await b.until(`document.querySelector('.lq-btn-rec')`);
    await assertJs('Food Finish is disabled while recording',`[...document.querySelectorAll('.lq-footer button')].some(e=>e.disabled&&e.textContent.includes('recording'))`);
    await text(/Stop/);await b.until(`document.querySelector('.lq-fc-rev-row')`);
    await assertJs('A missing spoken quantity remains blank and asks for an answer',`document.querySelector('.lq-fc-rev').textContent.includes('No quantity was heard')`);
    await assertJs('A spoken package unit asks before conversion',`document.querySelector('.lq-fc-rev').textContent.includes('tray')`);
    await text(/^Add 1/);await pause(1000);
    await assertJs('Voice zero is saved, while missing quantity and ambiguous package stay uncounted',`${lastLines}.some(l=>l.skuId==='pretzel'&&l.qtyUnits===0)&&!${lastLines}.some(l=>l.skuId==='unknown'||l.skuId==='cup')`);
    await evalJs("window.scrollTo({top:document.body.scrollHeight,behavior:'instant'})");await text(/Review .*heard/);await pause(700);
    await assertJs('Review heard items scrolls to pending questions without running precheck',`!window.__cogsQa.calls.some(c=>c.path.endsWith('/precheck'))&&document.querySelector('.lq-fc-rev').getBoundingClientRect().top<innerHeight/2`);
    const {data}=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'s24-ultra-voice-safety.png'),Buffer.from(data,'base64'));
  });
  await run('liquor captured shelf',async()=>{
    await open('Count liquor');await evalJs('window.__cogsQa.holdVoice=true');await text(/Record count/);await b.until(`document.querySelector('.lq-rec-stop')`);await text(/Stop/);await b.until(`window.__cogsQa.releaseVoice`);await text(/^Liquor Backstock/);await evalJs('window.__cogsQa.releaseVoice()');await b.until(`document.querySelector('[role="dialog"]')`);await text(/^More:/);await text(/^Add 1/);await pause(1600);
    await assertJs('A recording applies to its original shelf after changing shelves while reading',`${lastLines}.some(l=>l.skuId==='titos'&&l.zoneId==='backbar'&&Math.abs(l.qtyUnits-132.2)<.001)&&!${lastLines}.some(l=>l.skuId==='titos'&&l.zoneId==='stock')`);
  });
  await run('beer zero and flush safety',async()=>{
    await open('Keg check','?qa=emptybeer');await text(/Bottled beer/);await b.until(`document.querySelector('.lq-beer-row')`);await text(/None of these in the cooler/);await pause(1600);
    await assertJs('Beer no-stock action produces zero lines in its partial bar count',`${lastLines}.some(l=>l.skuId==='beer'&&l.qtyUnits===0)&&window.__cogsQa.calls.filter(c=>c.path.endsWith('/lines')).at(-1).body.isFullCount===false`);
    await evalJs('window.__cogsQa.failSaves=true');await text(/Send report/);await pause(500);
    await assertJs('A failed child save blocks the combined keg report submit',`!window.__cogsQa.calls.some(c=>c.path==='/admin/bar/keg-check/submit')&&document.querySelector('.lq-footer .lq-error')`);
    await evalJs('window.__cogsQa.failSaves=false');await text(/Send report/);await pause(300);
    await assertJs('Explicit zero beer still submits its observed partial session',`window.__cogsQa.calls.some(c=>c.path==='/admin/bar/keg-check/submit'&&c.body.beerCountId==='beer-draft')`);
  });
  for(const section of ['Backup kegs','Empty kegs'])await run(section+' active microphone guard',async()=>{
    await open('Keg check');if(section==='Empty kegs')await text(/Empty kegs/);await text(/Record|Talk|Say what's empty/);await b.until(`document.querySelector('.lq-rec-stop')||document.querySelector('.lq-btn-rec')`);await pause(150);
    await assertJs(`${section}: accordion, Home and Send are blocked during recording`,`[...document.querySelectorAll('.lq-kc-head')].every(e=>e.disabled)&&[...document.querySelectorAll('.lq-footer button')].filter(e=>/Home|Send/.test(e.textContent)).every(e=>e.disabled)`);
  });
  await run('food delayed submission guard',async()=>{
    await open('Count food');await evalJs('window.__cogsQa.holdSubmit=true');await text(/^Finish/);await b.until(`document.querySelector('.lq-finding-summary')`);await text(/^Submit the count/);await b.until(`window.__cogsQa.releaseSubmit`);
    await assertJs('Food submission disables None, Clear, count type and Home until the response',`[...document.querySelectorAll('.lq-fc-row button,input[type="radio"]')].every(e=>e.matches(':disabled'))&&[...document.querySelectorAll('.lq-footer button')].filter(e=>e.textContent==='Home').every(e=>e.matches(':disabled'))`);
    await evalJs(`document.querySelector('.lq-fc-row-none').click();document.querySelector('.lq-fc-row-clear').click()`);
    await assertJs('Native disabled food actions leave the submitted count unchanged',`window.__cogsQa.calls.filter(c=>c.path.endsWith('/submit')).length===1&&${lastLines}.some(l=>l.skuId==='dough'&&l.qtyUnits===110)`);
    await evalJs('window.__cogsQa.releaseSubmit()');await b.until(`document.querySelector('.lq-hi')?.textContent.includes('Kitchen count submitted')`);
  });
  await run('liquor delayed submission guard',async()=>{
    await open('Count liquor');await evalJs('window.__cogsQa.holdSubmit=true');await text(/^Finish/);await b.until(`document.querySelector('.lq-precheck-row')`);await text(/^Submit anyway/);await b.until(`window.__cogsQa.releaseSubmit`);
    await assertJs('Liquor submission disables recording, batch edits, steppers and Exit until the response',`[...document.querySelectorAll('.lq-record,.lq-row button,.lq-row input,.lq-zone')].every(e=>e.matches(':disabled'))&&[...document.querySelectorAll('.lq-footer button')].every(e=>e.matches(':disabled'))`);
    const before=await evalJs(`window.__cogsQa.calls.filter(c=>c.path.endsWith('/lines')).length`);await evalJs(`document.querySelector('.lq-row button[aria-label^="increase"]').click()`);await pause(100);
    await assertJs('Native disabled liquor stepper cannot change the count in flight',`window.__cogsQa.calls.filter(c=>c.path.endsWith('/lines')).length===${before}`);
    await evalJs('window.__cogsQa.releaseSubmit()');await b.until(`document.querySelector('.lq-done-emoji')`);
  });
  await run('narrative-only findings',async()=>{
    await open('Count liquor');await evalJs(`window.__cogsQa.findings=['big_loss','sibling_swap','zone_missed'].map((kind,i)=>({kind,skuId:'narrative'+i,name:["Tito's Handmade Vodka",'Casamigos Reposado','Casamigos Añejo'][i],counted:null,prior:0,purchased:0,used:null,unitsPerCase:12,dollars:10,detail:['Sales suggest more stock should remain. Check Back Bar and Liquor Backstock.','Reposado is high while Añejo is low. Check the labels.','Liquor Backstock previously held two bottles. Confirm this shelf, including zero if empty.'][i]}))`);await text(/^Finish/);await b.until(`document.querySelector('.lq-finding-evidence')`);
    await assertJs('Narrative-only findings omit numeric placeholder cards',`document.querySelectorAll('.lq-finding-summary').length===3&&!document.querySelector('.lq-finding-numbers')`);
    await assertJs('Narrative-only finding evidence keeps the missed shelf visible',`[...document.querySelectorAll('.lq-finding-evidence')].some(e=>e.textContent.includes('Liquor Backstock previously held two bottles')&&e.getClientRects().length)`);
    const {data}=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'s24-ultra-narrative-findings.png'),Buffer.from(data,'base64'));
  });
}finally{await writeFile(join(out,'interaction-results.json'),JSON.stringify({checks,failures,blocked:b.blocked},null,2));await b.close();}
console.log(JSON.stringify({checks:checks.length,failures:failures.map(f=>({name:f.name,error:f.error.split('\n')[0]}))}));if(failures.length)process.exitCode=1;
