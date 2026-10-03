import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import {browser} from './cdp.mjs';
import {installFixtures} from './fixtures.mjs';

const stage=process.argv.find(x=>x.startsWith('--stage='))?.slice(8)||'after';
const base=process.env.COGS_QA_URL||`http://127.0.0.1:${stage==='before'?4197:4349}/cogs/`;
const out=resolve(process.env.COGS_QA_OUTPUT||fileURLToPath(new URL(`./output/${stage}/`,import.meta.url)));
const only=process.argv.find(x=>x.startsWith('--viewport='))?.slice(11);
const sceneFilter=process.argv.find(x=>x.startsWith('--scene='))?.slice(8);
const viewports=[{name:'s24-ultra',width:412,height:915,mobile:true},{name:'small-phone',width:360,height:800,mobile:true},{name:'desktop',width:1280,height:900,mobile:false}].filter(v=>!only||only===v.name);
await mkdir(out,{recursive:true});
const results={stage,base,assumptions:'Samsung S24 Ultra browser approximated at 412×915 CSS px, DPR 1 screenshots; secondary 360×800 phone; 1280×900 desktop. Device hardware, Android keyboard, browser chrome and real phone microphone are not simulated.',screens:[],assertions:[],failures:[],blocked:[]};
if(sceneFilter){const previous=JSON.parse(await readFile(join(out,'results.json'),'utf8'));Object.assign(results,previous);results.failures=results.failures.filter(f=>f.name!==sceneFilter);}
const b=await browser();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const check=(name,condition)=>{if(!condition)throw new Error(name);results.assertions.push(name);};
const $=selector=>`document.querySelector(${JSON.stringify(selector)})`;
const visible=`e=>!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)`;
async function click(selector){
  await b.until(`${$(selector)}`);await b.evaluate(`${$(selector)}.scrollIntoView({block:'center',behavior:'instant'})`);await delay(70);
  const r=await b.evaluate(`(()=>{const e=${$(selector)},r=e.getBoundingClientRect();if(e.disabled)throw Error('Disabled: '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x,y:r.y}]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(70);
}
async function clickText(pattern){
  const source=pattern.source;const selector=await b.evaluate(`(()=>{const a=[...document.querySelectorAll('button')].filter(${visible});const e=a.find(e=>new RegExp(${JSON.stringify(source)}).test(e.textContent.trim()));if(!e)throw Error('No button: '+${JSON.stringify(source)});e.dataset.qaTap='yes';return '[data-qa-tap="yes"]';})()`);
  await click(selector);await b.evaluate(`document.querySelector('[data-qa-tap="yes"]')?.removeAttribute('data-qa-tap')`);
}
async function input(selector,value){await b.until(`${$(selector)}`);await b.evaluate(`(()=>{const e=${$(selector)};e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur()})()`);await delay(80);}
async function load(query=''){const old=await b.evaluate('window.__cogsQa?.nonce');await b.send('Page.navigate',{url:base+query});await b.until('window.__cogsQa?.nonce && window.__cogsQa.nonce !== '+JSON.stringify(old??null));await b.until(`document.querySelector('.lq-action')||document.querySelector('.lq-login')||document.querySelector('.lq-invlist')||document.querySelector('.lq-h2')`);await delay(120);}
async function homeView(title,ready){await load();await clickText(new RegExp(title));await b.until(ready);await delay(100);await b.evaluate("window.scrollTo({top:0,behavior:'instant'})");}
async function shot(v,name){
  if(name==='recipe-editor'){
    await input('input[placeholder^="Add a bottle"]','Marshmallow');
    await clickText(/Monin Toasted Marshmallow Specialty Syrup/);
    await input('input[aria-label^="oz of Monin"]','1.125');
  }
  await b.until(`document.documentElement&&document.querySelector('.lq-app')`);
  await b.evaluate('document.fonts.ready');
  await b.evaluate(`new Promise(resolve=>{let previous=null,stable=0;const tick=()=>{const y=scrollY+','+(document.querySelector('.lq-sheet-body')?.scrollTop??0);stable=y===previous?stable+1:0;previous=y;if(stable>=5)return resolve();setTimeout(tick,80)};tick()})`);
  const metric=await b.evaluate(`(()=>{const vis=${visible},all=[...document.querySelectorAll('.lq-app *')].filter(vis),w=innerWidth;return {width:w,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,text:document.querySelector('.lq-app')?.innerText,overflow:all.filter(e=>{const r=e.getBoundingClientRect();return r.right>w+1||r.left<-1}).slice(0,20).map(e=>({tag:e.tagName,class:e.className,text:e.innerText?.slice(0,90),left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),smallTargets:all.filter(e=>e.matches('button,input,select')&&e.getBoundingClientRect().height<44).map(e=>({tag:e.tagName,class:e.className,text:e.innerText?.slice(0,50),label:e.getAttribute('aria-label'),height:e.getBoundingClientRect().height})),longDecimals:(document.querySelector('.lq-app')?.innerText.match(/\\d+\\.\\d{5,}/g)||[]),unknown:window.__cogsQa.unknown,calls:window.__cogsQa.calls}})()`);
  const {data}=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const file=`${v.name}-${name}.png`;await writeFile(join(out,file),Buffer.from(data,'base64'));results.screens=results.screens.filter(s=>s.viewport!==v.name||s.name!==name);results.screens.push({viewport:v.name,name,file,...metric});console.log('CAPTURE',v.name,name,'width',metric.scrollWidth,'longDecimals',metric.longDecimals.length);
  await writeFile(join(out,'results.json'),JSON.stringify(results,null,2));
}
async function scenario(v,name,fn){if(sceneFilter&&name!==sceneFilter)return;try{await fn();}catch(e){results.failures.push({viewport:v.name,name,error:String(e.stack||e)});console.log('FAIL',v.name,name,e.message);}}
try{
  await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${installFixtures.toString()})();if(location.search.includes('qa=login'))window.__cogsQa.authed=false;`});
  for(const v of viewports){
    await b.send('Emulation.setDeviceMetricsOverride',{width:v.width,height:v.height,deviceScaleFactor:1,mobile:v.mobile});
    await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    if(v.mobile)await b.send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'});
    await scenario(v,'home',async()=>{await load();await shot(v,'home');});
    await scenario(v,'food grid and fractional cases',async()=>{
      await homeView('Count food',`document.querySelector('.lq-fc-row')`);await shot(v,'food-grid');
      const first='.lq-fc-row:first-of-type';
      const labels=await b.evaluate(`[...document.querySelectorAll('.lq-fc-row input')].map(e=>({label:e.getAttribute('aria-label'),value:e.value}))`);
      check(`${v.name}: food 5.5 cases resumes without long decimals`,labels.some(e=>e.value==='5.5'));
      const dough=`[...document.querySelectorAll('.lq-fc-row')].find(e=>e.textContent.includes('Pizza Dough'))`;
      await b.evaluate(`${dough}.dataset.qaRow='dough'`);await input('[data-qa-row="dough"] input','5.5');
      await delay(1700);const saved=await b.evaluate(`window.__cogsQa.calls.filter(c=>c.path.endsWith('/lines')).at(-1)?.body.lines`);
      if(saved)check(`${v.name}: 5.5 cases saves 110 individual dough units`,saved.some(l=>l.skuId==='dough'&&l.qtyUnits===110&&l.enteredCases===5.5));
    });
    await scenario(v,'food voice review',async()=>{
      await homeView('Count food',`document.querySelector('.lq-fc-row')`);await clickText(/Talk through|Record this shelf|Record shelf|Start recording/);await b.until(`document.querySelector('.lq-btn-rec')||document.querySelector('.lq-rec-stop')`);await shot(v,'food-recording');await clickText(/Stop/);await b.until(`document.querySelector('.lq-fc-rev-row')`);await shot(v,'food-voice-review');
      check(`${v.name}: ambiguous food voice asks instead of saving`,await b.evaluate(`document.querySelector('.lq-fc-rev')?.textContent.includes('Which one?')&&!window.__cogsQa.calls.some(c=>c.path.endsWith('/lines'))`));
      await input('.lq-fc-rev-ask input','12');await clickText(/^Cheese, Shredded Sharp Cheddar$/);await shot(v,'food-voice-resolved');await clickText(/^Add 3/);await delay(1700);
      const lines=await b.evaluate(`window.__cogsQa.calls.filter(c=>c.path.endsWith('/lines')).at(-1)?.body.lines`);
      check(`${v.name}: voice apply adds fractional cases using frozen case size`,lines?.some(l=>l.skuId==='dough'&&l.qtyUnits===220&&l.enteredCases===11));
      check(`${v.name}: missing food case size is answered before conversion`,lines?.some(l=>l.skuId==='unknown'&&l.qtyUnits===24&&l.caseSizeAtEntry===12));
    });
    await scenario(v,'food precheck',async()=>{await homeView('Count food',`document.querySelector('.lq-fc-row')`);await clickText(/Finish|Check.*submit|Review.*count/);await b.until(`document.querySelector('.lq-fc-rev-row')||document.querySelector('.lq-precheck-row')`);await shot(v,'food-precheck');});
    await scenario(v,'food case-only policy',async()=>{
      await load('?qa=cases');await clickText(/Count food/);await b.until(`document.querySelector('input[aria-label="Cauliflower Crust: cases"]')`);
      check(`${v.name}: historical crust quantity remains 1.5 cases`,await b.evaluate(`document.querySelector('input[aria-label="Cauliflower Crust: cases"]').value==='1.5'&&document.querySelector('.lq-fc-legacy-units').textContent.includes('6 individual pieces')`));
      await shot(v,'food-case-history');
      await input('input[aria-label="Cauliflower Crust: cases"]','.5');await input('input[aria-label="Flatbread, 4.5\\"x12\\": cases"]','6');await delay(1700);
      const lines=await b.evaluate(`window.__cogsQa.calls.filter(c=>c.path.endsWith('/lines')).at(-1)?.body.lines`);
      check(`${v.name}: crust half-case saves six each with package answer`,lines?.some(l=>l.skuId==='cauliflower'&&l.qtyUnits===6&&l.enteredCases===.5&&l.caseSizeAtEntry===12));
      check(`${v.name}: six flatbread cases save 360 each`,lines?.some(l=>l.skuId==='flatbread'&&l.qtyUnits===360&&l.enteredCases===6&&l.caseSizeAtEntry===60));
      await shot(v,'food-case-grid');
    });
    await scenario(v,'liquor grid and steppers',async()=>{
      await homeView('Count liquor',`document.querySelector('.lq-captured')||document.querySelector('.lq-cap-title')`);await shot(v,'liquor-grid');
      const row='.lq-captured .lq-row';const selector=await b.evaluate(`(()=>{const e=[...document.querySelectorAll('.lq-row')].find(e=>e.querySelector('.lq-name')?.textContent.includes("Tito's"));e.dataset.qaRow='titos';return '[data-qa-row="titos"]'})()`);
      const old=await b.evaluate(`${$(selector+' .lq-qty-input')}.value`);
      await click(selector+' [aria-label^="increase"]');const plus=await b.evaluate(`${$(selector+' .lq-qty-input')}.value`);check(`${v.name}: liquor plus changes loose count by one (before ${old}, after ${plus})`,Math.abs(Number(plus)-Number(old)-1)<.001);
      await click(selector+' [aria-label^="decrease"]');const minus=await b.evaluate(`${$(selector+' .lq-qty-input')}.value`);check(`${v.name}: liquor minus reverses plus`,Math.abs(Number(minus)-Number(old))<.001);
      await delay(1700);const lines=await b.evaluate(`window.__cogsQa.calls.filter(c=>c.path.endsWith('/lines')).at(-1)?.body.lines`);check(`${v.name}: stepper preserves 5.5 cases and multiplier`,lines?.some(l=>l.skuId==='titos'&&l.enteredCases===5.5&&l.caseSizeAtEntry===12&&Math.abs(l.qtyUnits-66.1)<.001));
    });
    await scenario(v,'liquor voice review',async()=>{await homeView('Count liquor',`document.querySelector('.lq-cap-title')`);await clickText(/Record|Talk/);await b.until(`document.querySelector('.lq-btn-rec')||document.querySelector('.lq-rec-stop')`);await clickText(/Stop/);await b.until(`document.querySelector('[role="dialog"]')`);await shot(v,'liquor-voice-review');});
    await scenario(v,'liquor precheck',async()=>{await homeView('Count liquor',`document.querySelector('.lq-cap-title')`);await clickText(/^Submit|Finish/);await b.until(`document.querySelector('.lq-precheck-row')`);await shot(v,'liquor-precheck');});
    await scenario(v,'keg check',async()=>{await homeView('Keg check',`document.querySelector('.lq-kc-head')`);await shot(v,'keg-backups');await clickText(/Empty kegs/);await shot(v,'keg-empties');await clickText(/Bottled beer/);await shot(v,'bottled-beer');});
    for(const [title,name,ready] of [['Upload invoice','upload-invoice',`document.querySelector('input[type="file"]')`],['Recent invoices','invoices',`document.querySelector('.lq-invrow')`],['Recent counts','counts',`document.querySelector('.lq-invrow')`],['Price watch','price-watch',`document.querySelector('.lq-pw-row')`],['Pour cost','pour-cost',`document.querySelector('.lq-pw-row')`],['Map pours','map-pours',`document.querySelector('.lq-pw-row')`],['Recipes','recipes',`document.querySelector('.lq-pw-row')`]])await scenario(v,name,async()=>{await homeView(title,ready);await shot(v,name);if(name==='pour-cost'){await click('.lq-pw-row');await shot(v,'pour-cost-detail');}if(name==='recipes'){await clickText(/Build recipe|Write recipe/);await shot(v,'recipe-editor');}});
    await scenario(v,'invoice detail',async()=>{await load('?invoice=invoice-fixture');await b.until(`document.querySelector('.lq-invd-line')`);await shot(v,'invoice-detail');});
    await scenario(v,'count detail',async()=>{await load('?count=submitted-fixture');await b.until(`document.querySelector('.lq-invd')`);await shot(v,'count-detail');});
    await scenario(v,'login',async()=>{await load('?qa=login');await b.until(`document.querySelector('.lq-login')||document.querySelector('.lq-h2')`);await shot(v,'login');});
    await scenario(v,'teacher group',async()=>{await homeView('Teacher Group Organizer',`document.querySelector('input[type="file"]')`);await shot(v,'teacher-group');});
  }
}finally{results.blocked=b.blocked;await writeFile(join(out,'results.json'),JSON.stringify(results,null,2));await b.close();}
console.log(JSON.stringify({output:out,screens:results.screens.length,assertions:results.assertions.length,failures:results.failures.map(f=>({name:f.name,error:f.error.split('\n')[0]})),blocked:results.blocked},null,2));
if(results.failures.length)process.exitCode=1;
