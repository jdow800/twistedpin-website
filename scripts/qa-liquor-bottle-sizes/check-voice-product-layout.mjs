// Actual CountLiquor in native Chromium. Fictional inventory and controlled
// recorder/API only; the shared CDP helper blocks external requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const require=createRequire(new URL('../../package.json',import.meta.url));
const root=fileURLToPath(new URL('../../',import.meta.url));
const here=fileURLToPath(new URL('./',import.meta.url));
const out=here+'dist/voice-product-layout/';await mkdir(out,{recursive:true});
await require('esbuild').build({entryPoints:[here+'liquor-review-fixture.jsx'],outfile:out+'fixture.js',bundle:true,
  jsx:'automatic',platform:'browser',nodePaths:[root+'node_modules'],
  define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'},
  plugins:[{name:'controlled-recorder',setup(build){build.onResolve({filter:/^\.\.\/useRecorderDictation$/},()=>({path:here+'liquor-recorder-fixture.jsx'}));}}]});
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const asset=path==='/fixture.js'?'fixture.js':path==='/fixture.css'?'fixture.css':null;
  res.setHeader('Content-Type',asset?.endsWith('.js')?'text/javascript':asset?'text/css':'text/html');
  res.end(asset?await readFile(out+asset):'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#0e0a1f}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/`,b=await browser();
const results={scenarios:[],screens:[],blocked:[],failures:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const js=e=>b.evaluate(e);
const rows=[{spoken:'Minsters, point six',cases:0,units:.6,qty:.6,unitsPerCase:12,needsCaseSize:false,suspectPreMultiplied:false,
  quantityWords:'point six',quantityNeedsReview:true,match:{id:'minsters',name:"Minster's Small Batch Kentucky Straight Bourbon",sizeMl:1000},candidates:[]},
  {spoken:'Owens, twelve',cases:0,units:12,qty:12,unitsPerCase:24,needsCaseSize:false,suspectPreMultiplied:false,
  match:{id:'owens',name:"Owen's Ginger Beer",sizeMl:250},candidates:[]}];
async function click(text,scope='document'){
  await js(`(()=>{const e=[...${scope}.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e||e.disabled)throw Error('Unavailable button');e.click()})()`);await pause(35);
}
async function input(selector,value){await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(35);}
async function shot(name){const {data}=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(out+name+'.png',Buffer.from(data,'base64'));results.screens.push(name+'.png');}
try{
  for(const width of [320,412]){
    await b.send('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:true});
    await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await b.send('Page.navigate',{url:base+'?pausecuts=0'});await b.until("window.liquorQa&&document.querySelectorAll('.lq-zone').length===2");
    await js("[...document.querySelectorAll('button')].find(e=>/Record count for/.test(e.textContent)).click()");
    await b.until("window.liquorQa.recorder");await js("window.liquorQa.recorder.segment('Minsters point six. Owens twelve.',0)");
    await b.until('window.liquorQa.extracts.length===1');await js(`window.liquorQa.extracts[0].succeed(${JSON.stringify(rows)})`);
    await b.until("[...document.querySelectorAll('button')].some(e=>/Stop & review/.test(e.textContent))");
    await js("[...document.querySelectorAll('button')].find(e=>/Stop & review/.test(e.textContent)).click();window.liquorQa.recorder.finish('Minsters point six. Owens twelve.')");
    await b.until("document.querySelectorAll('.lq-rev').length===2");
    assert.ok(await js("document.querySelector('.lq-rev-chosen').textContent.includes('Minster')"));
    assert.ok(await js("document.querySelector('.lq-rev-chosen').classList.contains('lq-chip-on')"));
    assert.ok(await js("document.querySelector('.lq-rev input[type=number]').value===''"));
    assert.ok(await js("!/Check the heard|Heard quantity:|Matched bottle:/.test(document.querySelector('.lq-rev').textContent)"));
    assert.ok(await js("[...document.querySelectorAll('.lq-sheet-foot button')].find(e=>/^Add/.test(e.textContent)).disabled"));
    assert.ok(await js("document.documentElement.scrollWidth<=innerWidth+1"));
    const fits=await js("(()=>{const e=document.querySelector('.lq-rev-chosen'),r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.scrollWidth<=e.clientWidth+1})()");assert.ok(fits,'long selected product fits phone');
    await shot('held-match-'+width);results.scenarios.push(`${width}px green matched bottle and empty quantity field fit without repeated warnings`);
    await js("document.querySelector('.lq-rev-chosen').click()");await pause(35);
    await input('.lq-rev-search','Jaeger');await click('Jägermeister · 1000ml',"document.querySelector('.lq-rev-assign')");
    assert.ok(await js("document.querySelector('.lq-rev-chosen').textContent.includes('Jägermeister')"));
    assert.ok(await js("document.querySelector('.lq-rev input[type=number]').value===''"));
    await input('.lq-rev input[type=number]','');await input('.lq-rev input[type=number]','0.6');
    assert.ok(await js("document.querySelector('.lq-rev-chosen').classList.contains('lq-chip-on')"));
    assert.ok(await js("[...document.querySelectorAll('.lq-sheet-foot button')].some(e=>e.textContent.trim()==='Add 1 to Giant Bottle Shelf'&&!e.disabled)"));
    await shot('changed-match-'+width);results.scenarios.push(`${width}px native product correction retains numeric hold until answered`);
    await click('Add 1 to Giant Bottle Shelf');await b.until("window.liquorQa.lines.some(l=>l.skuId==='jaeger'&&l.zoneId==='giant'&&Number(l.qtyUnits)===.6)");
    results.scenarios.push(`${width}px corrected identity and .6 save to the recorded shelf`);
  }
  results.blocked=b.blocked;assert.equal(b.blocked.length,0);console.log(`${results.scenarios.length} native voice product scenarios passed`);
}catch(e){results.failures.push(String(e.stack||e));throw e;}
finally{await writeFile(out+'results.json',JSON.stringify(results,null,2)+'\n');await b.close();await new Promise(r=>server.close(r));}
