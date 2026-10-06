// Actual CountFood, controlled recording/API, native phone-size Chromium.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url));
const out=here+'dist/food-case-breakdown/';await mkdir(out,{recursive:true});
const require=createRequire(new URL('../../package.json',import.meta.url));
await require('esbuild').build({entryPoints:[here+'food-fixture.jsx'],outfile:out+'fixture.js',bundle:true,jsx:'automatic',platform:'browser',nodePaths:[root+'node_modules'],define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'},plugins:[{name:'controlled-food',setup(build){build.onResolve({filter:/^qa:food$/},()=>({path:root+'src/components/liquor/views/CountFood.tsx'}));build.onResolve({filter:/^qa:styles$/},()=>({path:root+'src/components/liquor/liquor.css'}));build.onResolve({filter:/^\.\.\/useRecorderDictation$/},()=>({path:here+'food-recorder-fixture.jsx'}));}}]});
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname,asset=path==='/fixture.js'?'fixture.js':path==='/fixture.css'?'fixture.css':null;res.setHeader('Content-Type',asset?.endsWith('.js')?'text/javascript':asset?'text/css':'text/html');res.end(asset?await readFile(out+asset):'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#0e0a1f}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/?case-breakdown&pausecuts=0`,b=await browser();
const report={generatedAt:new Date().toISOString(),scope:'Actual CountFood with fictional confirmed catalog, recorder and API; native Chromium, no physical microphone/provider/database/live calls.',rowSha256:createHash('sha256').update(await readFile(root+'src/components/liquor/FoodVoiceReviewRow.tsx')).digest('hex'),scenarios:[],assertions:[],screens:[],saved:[],blocked:[],failures:[]};
const js=e=>b.evaluate(e),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function check(name,code){assert.ok(await js(`!!(${code})`),name);report.assertions.push(name);}
async function button(pattern){await js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>new RegExp(${JSON.stringify(pattern.source)}).test(e.textContent.trim()));if(!e||e.disabled)throw Error('Unavailable button');e.click()})()`);await pause(30);}
async function shot(name){const {data}=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(out+name+'.png',Buffer.from(data,'base64'));report.screens.push(name+'.png');}
async function hear(width,item){await b.send('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:true});await b.send('Page.navigate',{url:base});await b.until("window.foodQa&&document.querySelector('.lq-fc-row')");await button(/Talk through/);await b.until("document.querySelector('.lq-rec-stop')");await js(`foodQa.recorder.segment(${JSON.stringify(item.spoken)},0)`);await b.until('foodQa.extracts.length===1');await js(`foodQa.extracts[0].succeed(${JSON.stringify([item])})`);await button(/Stop & review/);await js(`foodQa.recorder.finish(${JSON.stringify(item.spoken)})`);await b.until("document.querySelector('.lq-fc-rev-case-breakdown')");await pause(500);}
async function touchAdd(){const point=await js("(()=>{const e=[...document.querySelectorAll('.lq-footer button')].find(e=>/^Add /.test(e.textContent.trim())),r=e.getBoundingClientRect();if(e.disabled)throw Error('Add disabled');return {x:r.x+r.width/2,y:r.y+r.height/2}})()");await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
const row=(cases,units,qty,spokenUnit,spoken)=>({spoken,quantityWords:spoken,quantityKnown:true,quantityNeedsReview:false,cases,units,qty,spokenUnit,match:{id:'case-sauce',name:'Sauce, Pizza, Canned',sizeMl:null,unitsPerCase:6},candidates:[]});
try{
 await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 for(const width of [320,412]){
  await hear(width,row(3,0,18,null,'Three cases of pizza sauce.'));
  await check(`${width}px raw three stays one editable amount`,"document.querySelectorAll('.lq-fc-rev-quantities input').length===1&&document.querySelector('.lq-fc-rev-quantities input').value==='3'");
  await check(`${width}px known case arithmetic is readable`,"document.querySelector('.lq-fc-rev-case-breakdown').textContent==='3 cases × 6 cans = 18 cans'");
  await check(`${width}px pill summary and sticky Add fit`,"(()=>{const p=document.querySelector('.lq-chip-on'),s=document.querySelector('.lq-fc-rev-case-breakdown'),a=[...document.querySelectorAll('.lq-footer button')].find(e=>/^Add /.test(e.textContent.trim()));return [p,s,a].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})&&a.classList.contains('lq-btn-primary')&&!a.disabled&&document.documentElement.scrollWidth<=innerWidth+1})()");
  await shot('three-cases-'+width);
  await js("document.querySelector('.lq-fc-rev-quantities input').focus()");
  await b.send('Input.dispatchKeyEvent',{type:'keyDown',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65});await b.send('Input.dispatchKeyEvent',{type:'keyUp',modifiers:2,key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65});await b.send('Input.insertText',{text:'2'});await js("document.querySelector('.lq-fc-rev-quantities input').blur()");
  await b.until("document.querySelector('.lq-fc-rev-case-breakdown').textContent==='2 cases × 6 cans = 12 cans'");
  await shot('edited-two-cases-'+width);await touchAdd();await b.until("foodQa.lines.some(l=>l.skuId==='case-sauce'&&l.zoneId==='pizza'&&Number(l.qtyUnits)===12&&Number(l.enteredCases)===2)");
  report.assertions.push(`${width}px native edit to two saves twelve cans once`);report.saved.push({width,scenario:'raw edit',lines:await js('foodQa.lines')});report.scenarios.push(`${width}px case three→two updates eighteen→twelve and saves twelve`);
  await hear(width,row(3,2,22,'bag','Three cases and two bags of pizza sauce.'));
  await check(`${width}px mixed raw counts remain three cases plus two bags`,"[...document.querySelectorAll('.lq-fc-rev-quantities input')].map(e=>e.value).join(',')==='3,2'");
  await check(`${width}px mixed summary uses canonical four loose cans`,"document.querySelector('.lq-fc-rev-case-breakdown').textContent==='3 cases × 6 cans + 4 cans = 22 cans'");
  await check(`${width}px long mixed summary wraps inside viewport`,"(()=>{const e=document.querySelector('.lq-fc-rev-case-breakdown'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&document.documentElement.scrollWidth<=innerWidth+1&&!!document.querySelector('.lq-chip-on')&&[...document.querySelectorAll('.lq-footer button')].some(e=>/^Add 1/.test(e.textContent.trim())&&!e.disabled)})()");
  await shot('mixed-cases-'+width);await touchAdd();await b.until("foodQa.lines.some(l=>l.skuId==='case-sauce'&&l.zoneId==='pizza'&&Number(l.qtyUnits)===22)");report.assertions.push(`${width}px mixed case and package conversion saves twenty-two once`);report.saved.push({width,scenario:'mixed packages',lines:await js('foodQa.lines')});report.scenarios.push(`${width}px mixed case-plus-bag summary fits and saves canonical twenty-two`);
 }
 report.blocked=b.blocked;assert.deepEqual(b.blocked,[]);console.log(`${report.scenarios.length} native case breakdown scenarios and ${report.assertions.length} assertions passed`);
}catch(error){report.failures.push(String(error.stack??error));throw error;}
finally{await writeFile(out+'results.json',JSON.stringify(report,null,2)+'\n');await b.close();await new Promise(r=>server.close(r));}
