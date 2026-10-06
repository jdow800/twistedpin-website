// Actual CountFood on phone-size native Chromium. Fictional stock and controlled
// recorder/API; shared CDP helper independently blocks external requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url));
const out=here+'dist/food-recording-layout/';await mkdir(out,{recursive:true});
const require=createRequire(new URL('../../package.json',import.meta.url));
await require('esbuild').build({entryPoints:[here+'food-fixture.jsx'],outfile:out+'fixture.js',bundle:true,
 jsx:'automatic',platform:'browser',nodePaths:[root+'node_modules'],
 define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'},
 plugins:[{name:'controlled-food-recorder',setup(build){
  build.onResolve({filter:/^qa:food$/},()=>({path:root+'src/components/liquor/views/CountFood.tsx'}));
  build.onResolve({filter:/^qa:styles$/},()=>({path:root+'src/components/liquor/liquor.css'}));
  build.onResolve({filter:/^\.\.\/useRecorderDictation$/},()=>({path:here+'food-recorder-fixture.jsx'}));
 }}]});
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
 const asset=path==='/fixture.js'?'fixture.js':path==='/fixture.css'?'fixture.css':null;
 res.setHeader('Content-Type',asset?.endsWith('.js')?'text/javascript':asset?'text/css':'text/html');
 res.end(asset?await readFile(out+asset):'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#0e0a1f}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/`,b=await browser();
const results={recordedAtUtc:new Date().toISOString(),scope:'Actual CountFood; synthetic stock, recording and API responses; native phone-size Chromium only, no physical microphone or live requests.',
 componentSha256:createHash('sha256').update(await readFile(root+'src/components/liquor/views/CountFood.tsx')).digest('hex'),
 rowSha256:createHash('sha256').update(await readFile(root+'src/components/liquor/FoodVoiceReviewRow.tsx')).digest('hex'),
 styleSha256:createHash('sha256').update(await readFile(root+'src/components/liquor/liquor.css')).digest('hex'),scenarios:[],assertions:[],screens:[],chipStyles:[],blocked:[],failures:[]};
const js=e=>b.evaluate(e),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function check(name,e){assert.ok(await js(`!!(${e})`),name);results.assertions.push(name);}
async function click(pattern){await js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>new RegExp(${JSON.stringify(pattern.source)}).test(e.textContent.trim()));if(!e||e.disabled)throw Error('Unavailable '+${JSON.stringify(pattern.source)});e.click()})()`);await pause(35);}
async function shot(name){const {data}=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(out+name+'.png',Buffer.from(data,'base64'));results.screens.push(name+'.png');}
async function stopByTouch(){const point=await js("(()=>{const e=document.querySelector('.lq-rec-stop'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(60);}
async function addByTouch(){const point=await js("(()=>{const e=[...document.querySelectorAll('.lq-footer button')].find(e=>/^Add /.test(e.textContent.trim())),r=e.getBoundingClientRect();if(e.disabled)throw Error('Add is disabled');return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(60);}
async function matchedChip(width,state){const style=await js("(()=>{const e=document.querySelector('.lq-fc-rev-row .lq-chip-on'),s=getComputedStyle(e),r=e.getBoundingClientRect(),rgb=c=>c.match(/[\\d.]+/g).slice(0,3).map(Number),lum=c=>rgb(c).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);const f=lum(s.color),g=lum(s.backgroundColor);return {foreground:s.color,background:s.backgroundColor,contrast:(Math.max(f,g)+.05)/(Math.min(f,g)+.05),left:r.left,right:r.right,width:innerWidth}})()");assert.equal(style.foreground,'rgb(16, 18, 26)');assert.ok(style.contrast>=4.5);assert.ok(style.left>=0&&style.right<=style.width+1);results.chipStyles.push({width,state,...style});results.assertions.push(`${width}px ${state} product pill stays green with readable foreground and fits`);}
try{
 for(const width of [320,390,412]){
  await b.send('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:true});
  await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await b.send('Page.navigate',{url:base+'?pausecuts=0'});await b.until("window.foodQa&&document.querySelector('.lq-fc-row')");
  await click(/Talk through/);await b.until("document.querySelector('.lq-rec-stop')");
  await js("foodQa.recorder.preview('Listening to this shelf. '.repeat(90),2)");await pause(40);
  await check(`${width}px single full-width Stop fits and is on top`,"(()=>{const e=document.querySelector('.lq-rec-stop'),r=e.getBoundingClientRect();return document.querySelectorAll('.lq-rec-stop').length===1&&e.textContent.trim()==='■ Stop & review'&&!e.disabled&&r.width>=innerWidth*.85&&r.left>=0&&r.right<=innerWidth&&r.height>=44&&r.bottom<=innerHeight&&r.bottom>=innerHeight-32&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e})()");
  await check(`${width}px timer is in listening panel`,"document.querySelector('.lq-rec-head .lq-rec-timer')?.textContent==='0:02 / 4:00'&&!document.querySelector('.lq-fc-voicebar > .lq-btn-rec')");
  await check(`${width}px live take locks shelf and Finish/Home`,"document.querySelector('button[aria-label=\"Next shelf\"]').disabled&&[...document.querySelectorAll('.lq-footer button')].filter(e=>/Home|Stop recording first/.test(e.textContent)).every(e=>e.disabled)");
  await check(`${width}px no sideways overflow`,"document.documentElement.scrollWidth<=innerWidth+1");
  await shot('recording-'+width);results.scenarios.push(`${width}px timer and full-width Stop remain usable with long live speech`);
  await js("window.scrollTo(0,document.body.scrollHeight)");await pause(50);
  await check(`${width}px Stop remains pinned after scrolling`,"(()=>{const e=document.querySelector('.lq-rec-stop'),r=e.getBoundingClientRect();return r.bottom<=innerHeight&&r.bottom>=innerHeight-32&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e})()");
  await shot('scrolled-stop-'+width);
  await js("foodQa.recorder.segment('Pizza dough two.',0)");await b.until('foodQa.extracts.length===1');
  await stopByTouch();
  await check(`${width}px touch Stop enters disabled processing`,"document.querySelector('.lq-rec-stop')?.textContent.trim()==='Processing recording'&&document.querySelector('.lq-rec-stop').disabled");
  await check(`${width}px Finish stays locked while transcription completes`,"[...document.querySelectorAll('.lq-footer button')].some(e=>e.textContent.trim()==='Stop recording first'&&e.disabled)");
  await shot('processing-'+width);results.scenarios.push(`${width}px native touch Stop prevents a second Stop or premature Finish`);
  await js("foodQa.recorder.finish('Pizza dough two.')");await b.until("[...document.querySelectorAll('.lq-footer button')].some(e=>e.textContent.trim()==='Reading that back…'&&e.disabled)");
  await check(`${width}px no stale Stop while item extraction is pending`,"!document.querySelector('.lq-rec-stop')");
  await js("foodQa.extracts[0].succeed([{spoken:'Pizza dough two.',quantityWords:'two',quantityKnown:true,cases:0,units:2,qty:2,unitsPerCase:20,needsCaseSize:false,suspectPreMultiplied:false,match:{id:'dough',name:'Pizza Dough',sizeMl:null,unitsPerCase:20},candidates:[]}])");
  await b.until("document.querySelector('.lq-fc-rev-row')");
  await check(`${width}px compact ready row needs no redundant quantity question`,"!document.body.textContent.includes('Heard quantity:')&&!document.querySelector('.lq-fc-rev-row').textContent.includes('Enter both Cases')&&[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Add 1 item to Pizza Freezer'&&!e.disabled)");
  await check(`${width}px ready amount has one raw input`,"document.querySelectorAll('.lq-fc-rev-quantities input').length===1&&document.querySelector('.lq-fc-rev-quantities input').value==='2'");
  await matchedChip(width,'ready');
  await pause(500); // allow the component's smooth review scroll to finish
  await check(`${width}px one primary footer Add stays visible and on top`,"(()=>{const adds=[...document.querySelectorAll('button')].filter(e=>/^Add \\d+ items? to/.test(e.textContent.trim())),e=adds[0],r=e.getBoundingClientRect();return adds.length===1&&e.closest('.lq-footer')&&e.classList.contains('lq-btn-primary')&&!e.disabled&&r.top>=0&&r.bottom<=innerHeight&&r.height>=44&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e})()");
  await shot('review-'+width);await js("window.scrollTo(0,document.body.scrollHeight)");await pause(50);
  await check(`${width}px primary Add stays pinned after scrolling`,"(()=>{const e=[...document.querySelectorAll('.lq-footer button')].find(e=>/^Add /.test(e.textContent.trim())),r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e})()");
  await shot('scrolled-add-'+width);await addByTouch();
  await b.until("foodQa.lines.some(l=>l.skuId==='dough'&&l.zoneId==='freezer'&&Number(l.qtyUnits)===2)");
  results.scenarios.push(`${width}px source-proved two saves to the take's shelf after explicit review`);
  await click(/Talk through/);await b.until("document.querySelector('.lq-rec-stop')");
  await js("foodQa.recorder.segment('Pizza dough, one case and a little bit.',0)");await b.until('foodQa.extracts.length===2');
  await js("foodQa.extracts[1].succeed([{spoken:'Pizza dough, one case and a little bit.',quantityWords:'one case and a little bit',quantityKnown:false,quantityNeedsReview:true,quantityReviewReason:'unquantified_remainder',cases:1,units:0,qty:20,unitsPerCase:20,match:{id:'dough',name:'Pizza Dough',sizeMl:null,unitsPerCase:20},candidates:[]}])");
  await stopByTouch();await js("foodQa.recorder.finish('Pizza dough, one case and a little bit.')");await b.until("document.querySelector('.lq-fc-rev-row')");
  await check(`${width}px held count is blank with a targeted remainder question`,"document.querySelectorAll('.lq-fc-rev-quantities input').length===1&&document.querySelector('.lq-fc-rev-quantities input').value===''&&document.querySelector('.lq-fc-rev-row .lq-error').textContent.includes('including the extra')&&[...document.querySelectorAll('button')].some(e=>/^Add 0/.test(e.textContent.trim())&&e.disabled)");
  await check(`${width}px held-only footer Add cannot write the proposed model count`,"(()=>{const adds=[...document.querySelectorAll('button')].filter(e=>/^Add \\d+ items? to/.test(e.textContent.trim()));return adds.length===1&&adds[0].closest('.lq-footer')&&adds[0].disabled&&foodQa.lines.length===1&&Number(foodQa.lines[0].qtyUnits)===2})()");
  await matchedChip(width,'held');await pause(500);await shot('held-review-'+width);
  results.scenarios.push(`${width}px unknown remainder keeps matched product green and prevents a guessed count`);
 }
 results.blocked=b.blocked;assert.equal(b.blocked.length,0,'No external requests');
 console.log(`${results.scenarios.length} native food recording scenarios and ${results.assertions.length} assertions passed`);
}catch(error){results.failures.push(String(error.stack??error));throw error;}
finally{await writeFile(out+'results.json',JSON.stringify(results,null,2)+'\n');await b.close();await new Promise(r=>server.close(r));}
