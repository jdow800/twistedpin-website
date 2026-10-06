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
 componentSha256:createHash('sha256').update(await readFile(root+'src/components/liquor/views/CountFood.tsx')).digest('hex'),scenarios:[],assertions:[],screens:[],blocked:[],failures:[]};
const js=e=>b.evaluate(e),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function check(name,e){assert.ok(await js(`!!(${e})`),name);results.assertions.push(name);}
async function click(pattern){await js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>new RegExp(${JSON.stringify(pattern.source)}).test(e.textContent.trim()));if(!e||e.disabled)throw Error('Unavailable '+${JSON.stringify(pattern.source)});e.click()})()`);await pause(35);}
async function shot(name){const {data}=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(out+name+'.png',Buffer.from(data,'base64'));results.screens.push(name+'.png');}
async function stopByTouch(){const point=await js("(()=>{const e=document.querySelector('.lq-rec-stop'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(60);}
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
  await pause(500); // allow the component's smooth review scroll to finish
  await shot('review-'+width);await click(/^Add 1 item to Pizza Freezer$/);
  await b.until("foodQa.lines.some(l=>l.skuId==='dough'&&l.zoneId==='freezer'&&Number(l.qtyUnits)===2)");
  results.scenarios.push(`${width}px source-proved two saves to the take's shelf after explicit review`);
 }
 results.blocked=b.blocked;assert.equal(b.blocked.length,0,'No external requests');
 console.log(`${results.scenarios.length} native food recording scenarios and ${results.assertions.length} assertions passed`);
}catch(error){results.failures.push(String(error.stack??error));throw error;}
finally{await writeFile(out+'results.json',JSON.stringify(results,null,2)+'\n');await b.close();await new Promise(r=>server.close(r));}
