import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const base=fileURLToPath(new URL('./dist/',import.meta.url)),out=fileURLToPath(new URL('./output/',import.meta.url));await mkdir(out,{recursive:true});
const js=await readFile(join(base,'fixture.js')),css=await readFile(join(base,'fixture.css'));
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#0e0a1f;color:#fff;font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',path==='/fixture.js'?'text/javascript':path==='/fixture.css'?'text/css':'text/html');res.end(path==='/fixture.js'?js:path==='/fixture.css'?css:html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,b=await browser();
try{for(const width of [360,412,1280]){await b.send('Emulation.setDeviceMetricsOverride',{width,height:950,mobile:width<500,deviceScaleFactor:1});await b.send('Page.navigate',{url:`http://127.0.0.1:${port}/cogs/?view=foodrecipes&sku=00000000-0000-0000-0000-000000000041&review=cost`});await b.until('document.querySelector("[data-cost-sku]")');assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth+1'),false,`horizontal overflow ${width}`);const {data}=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,`food-cost-${width}.png`),Buffer.from(data,'base64'));}assert.deepEqual(b.blocked,[],'All API calls are mocked');console.log(`Food physical cost phone/desktop QA: ${out}`);}finally{await b.close();await new Promise(resolve=>server.close(resolve));}
