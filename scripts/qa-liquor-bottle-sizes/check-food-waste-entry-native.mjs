import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const output=resolve(process.env.WASTE_ENTRY_NATIVE_OUTPUT??'tmp/food-waste-entry-native'),dist=new URL('./dist/',import.meta.url);await mkdir(output,{recursive:true});
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('food-waste-fixture.js',dist)));}else if(path==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(await readFile(new URL('food-waste-fixture.css',dist)));}else if(/^\/[\w.-]+\.woff2?$/.test(path)){res.setHeader('Content-Type',path.endsWith('woff2')?'font/woff2':'font/woff');res.end(await readFile(new URL(path.slice(1),dist)));}else if(path==='/pattern/pin-tilt-white.png'){res.setHeader('Content-Type','image/png');res.end(await readFile(new URL('../../public/pattern/pin-tilt-white.png',import.meta.url)));}else{res.setHeader('Content-Type','text/html');res.end(html);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const chrome=await browser(),results=[];
try{
  await chrome.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});
  await chrome.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?app&waste=new&view=countfood&section=food&emptycount`});
  await chrome.until("document.querySelector('.lq-food-waste-entry')");await chrome.evaluate('document.fonts.ready');
  const proof=await chrome.evaluate(`({buttons:[...document.querySelectorAll('.lq-food-waste-entry button')].map(b=>({text:b.textContent,rect:b.getBoundingClientRect().toJSON()})),heading:document.activeElement?.id,countCalls:wasteQa.calls.filter(c=>c.path.includes('/counts')).length,overflow:document.documentElement.scrollWidth>innerWidth,font:document.fonts.check('16px "Roboto Slab"')})`);
  assert.equal(proof.heading,'food-waste-entry-heading');assert.equal(proof.countCalls,0);assert.equal(proof.overflow,false);assert.equal(proof.font,true);assert.equal(proof.buttons.length,4);
  for(const b of proof.buttons){assert.ok(b.rect.top>=69&&b.rect.bottom<=568,`${b.text} initially visible`);assert.ok(b.rect.height>=44,`${b.text} touch height`);assert.ok(b.rect.left>=0&&b.rect.right<=320,`${b.text} width fits`);}
  const shot=await chrome.send('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'food-waste-reminder-320.png'),Buffer.from(shot.data,'base64'));
  const upload=proof.buttons.find(b=>b.text==='Upload waste log').rect;await chrome.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:upload.x+upload.width/2,y:upload.y+upload.height/2}]});await chrome.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await chrome.until("document.querySelector('input[type=file][multiple]')");assert.equal(await chrome.evaluate("wasteQa.calls.filter(c=>c.path.includes('/counts')).length"),0);assert.ok(await chrome.evaluate("!!document.querySelector('input[type=file][multiple]')"));assert.equal(chrome.blocked.length,0);
  results.push({name:'320px production-theme food waste entry and touch upload redirect',pass:true,proof});console.log('PASS 320px reminder fit, four touch choices, no count mount, gallery redirect');
}catch(e){results.push({name:'320px production-theme food waste entry and touch upload redirect',pass:false,error:e.message});console.error(e.stack);process.exitCode=1;}finally{await chrome.close();await new Promise(r=>server.close(r));}
await writeFile(join(output,'results.json'),JSON.stringify({capturedAt:new Date().toISOString(),synthetic:true,results},null,2)+'\n');
