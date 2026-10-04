import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const base=fileURLToPath(new URL('./dist/',import.meta.url)), out=join(base,'shots');await mkdir(out,{recursive:true});
const js=await readFile(join(base,'fixture.js')), css=await readFile(join(base,'fixture.css'));
const deepJs=await readFile(join(base,'deep-links-fixture.js')),deepCss=await readFile(join(base,'deep-links-fixture.css'));
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#0e0a1f;color:#fff;font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(path==='/fixture.js'?js:path==='/fixture.css'?css:path==='/deep.js'?deepJs:path==='/deep.css'?deepCss:path.startsWith('/draft-fixture')?html.replace('/fixture.css','/deep.css').replace('/fixture.js','/deep.js'):html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,b=await browser();
try{
 for(const [view,mode,ready] of [['ops','warnings','Recipe source did not respond.'],['ops','paging','Impact unknown'],['trends','warnings','Reliable final brackets'],['brunswick','warnings','Unknown food revenue'],['cost','unknown','Brunswick unknown'],['cost','partial','known subtotal']]){
  for(const [device,width,height,mobile] of [['desktop',1366,950,false],['phone',390,844,true]]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});await b.send('Page.navigate',{url:`http://127.0.0.1:${port}/?view=${view}&mode=${mode}`});await b.until(`document.body.textContent.includes(${JSON.stringify(ready)})`);
   const size=await b.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert.ok(size.scroll<=size.width+1,`${view}/${device} horizontal overflow`);
   const {data}=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,`${view}-${mode}-${device}.png`),Buffer.from(data,'base64'));
  }
 }
 await b.send('Page.navigate',{url:`http://127.0.0.1:${port}/?view=brunswick&mode=conflict&doc=doc-a`});await b.until('document.querySelector("form")');const {data}=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'brunswick-review-phone.png'),Buffer.from(data,'base64'));
 await b.send('Page.navigate',{url:`http://127.0.0.1:${port}/draft-fixture/?view=countfood&count=exact-other-draft&kind=other&login=1&section=food`});await b.until('document.body.textContent.includes("Enter your PIN")');
 const pin=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'draft-destination-pin-phone.png'),Buffer.from(pin.data,'base64'));
 await b.evaluate(`(async()=>{for(const digit of ['1','2','3','4']){[...document.querySelectorAll('button')].find(b=>b.textContent===digit).click();await new Promise(r=>setTimeout(r,20));}[...document.querySelectorAll('button')].find(b=>b.textContent==='Enter').click();})()`);
 await b.until('document.body.textContent.includes("Exact other linked draft item")');assert.equal(await b.evaluate('document.querySelectorAll("input,textarea,select").length'),0);
 const detail=await b.send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'draft-exact-detail-phone.png'),Buffer.from(detail.data,'base64'));
 assert.deepEqual(b.blocked,[],'Mocked UI QA must not make external requests');console.log(`Insights desktop/phone visual QA: ${out}`);
}finally{await b.close();await new Promise(resolve=>server.close(resolve));}
