import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const base=fileURLToPath(new URL('./dist/',import.meta.url)), out=join(base,'food-recipes-shots');await mkdir(out,{recursive:true});
const js=await readFile(join(base,'food-recipes-fixture.js')), css=await readFile(join(base,'food-recipes-fixture.css'));
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#0e0a1f;color:#fff;font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',path==='/fixture.js'?'text/javascript':path==='/fixture.css'?'text/css':'text/html');res.end(path==='/fixture.js'?js:path==='/fixture.css'?css:html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
const b=await browser();
try {
 for(const [name,width,height,mobile] of [['desktop',1366,950,false],['phone',390,844,true]]) {
  await b.send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
  await b.send('Page.navigate',{url:`http://127.0.0.1:${port}/?count=count-b&yield=1`});
  await b.until(`document.querySelector('[aria-label="Recipe editor"]') && document.querySelector('[aria-label="Correct Cheese"]')`);
  const size=await b.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert.ok(size.scroll<=size.width+1,`${name} horizontal overflow`);
  const {data}=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,`${name}.png`),Buffer.from(data,'base64'));
  if(mobile) {await b.evaluate(`document.querySelector('[aria-label="Historical yield correction"]').scrollIntoView()`);const shot=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'phone-historical.png'),Buffer.from(shot.data,'base64'));}
 }
 assert.deepEqual(b.blocked,[],'The mocked visual QA made no external requests');console.log(`Recipe desktop/phone visual QA: ${out}`);
} finally {await b.close();await new Promise(resolve=>server.close(resolve));}
