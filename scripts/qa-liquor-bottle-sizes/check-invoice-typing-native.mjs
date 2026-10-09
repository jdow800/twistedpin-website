// Native Chromium check for typed invoice answers (second review pass, 2026-10-09). jsdom cannot emulate a
// half-typed number: in Chromium a type=number box holding "5e" reports value "" with validity.badInput, and the
// next keystroke ("5e0") is a valid number again. A typed answer must keep the state it was STARTED against through
// that, and through emptying the box, so the server can refuse it when someone else answered in between.
//
// Local fictional fixture only: the bundle from `serve.mjs --invoices --build-only`, every request answered by the
// fixture's fetch, no signed-in profile, no live API. Needs INVOICE_QA_CHROME (or COGS_QA_CHROME).
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const executable=process.env.INVOICE_QA_CHROME||process.env.COGS_QA_CHROME;
assert.ok(executable,'Set INVOICE_QA_CHROME (or COGS_QA_CHROME) to the Chromium executable');
const dist=fileURLToPath(new URL('./dist/',import.meta.url));
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invoice typing QA</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const assets={'/fixture.js':['text/javascript','invoice-fixture.js'],'/fixture.css':['text/css','invoice-fixture.css']};
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const asset=assets[path]??(/^\/[\w.-]+\.woff2?$/.test(path)?['font/'+(path.endsWith('woff2')?'woff2':'woff'),path.slice(1)]:undefined);
  res.setHeader('Content-Type',asset?.[0]??'text/html');
  res.end(asset?await readFile(join(dist,asset[1])):html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const profile=await mkdtemp(join(dist,'invoice-typing-'));
const chrome=spawn(executable,['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket,passed=0;
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(Error('Browser startup timed out')),15000);
    chrome.once('error',reject);chrome.stderr.on('data',data=>{output+=data;const m=output.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
  });
  socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0;const pending=new Map();
  socket.onmessage=e=>{const m=JSON.parse(e.data),r=pending.get(m.id);if(r){pending.delete(m.id);m.error?r.reject(Error(JSON.stringify(m.error))):r.resolve(m.result);}};
  const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetId}=await command('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
  const send=(method,params)=>command(method,params,sessionId);
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const until=(expression,what)=>evaluate(`new Promise((resolve,reject)=>{let n=0;const tick=()=>{let ok=false;try{ok=(${expression});}catch{}if(ok)return resolve(true);if(++n>250)return reject(Error(${JSON.stringify('Timed out: '+(what||expression))}));setTimeout(tick,20);};tick();})`);
  const pause=ms=>evaluate(`new Promise(resolve=>setTimeout(resolve,${ms}))`);
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});

  const q=s=>JSON.stringify(s);
  const load=async()=>{
    await send('Page.navigate',{url:`${origin}/?mode=refresh-edit`});
    await until("document.querySelector('.lq-invd')",'invoice screen');await pause(50);
  };
  // Real key events, so Chromium's own number-input editing runs (including the half-typed "5e" state).
  const KEYS={e:['KeyE',69],Backspace:['Backspace',8],End:['End',35],...Object.fromEntries([...'0123456789'].map(d=>[d,['Digit'+d,48+Number(d)]]))};
  const press=async name=>{
    const [code,vk]=KEYS[name],text=name.length===1?name:undefined;
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk,...(text?{text,unmodifiedText:text}:{})});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk});
    await pause(40);
  };
  const type=async text=>{for(const ch of text)await press(ch);};
  // Focus the box and put the caret at its end, as a thumb tap after a re-read would.
  const focusEnd=async selector=>{await evaluate(`document.querySelector(${q(selector)}).focus()`);await press('End');};
  const clickIn=(lineId,label)=>evaluate(`(()=>{const b=[...document.getElementById('inv-line-'+${q(lineId)}).querySelectorAll('button')].find(b=>b.textContent.trim()===${q(label)});if(!b)throw Error('Missing button '+${q(label)});b.click();})()`);
  const hasButton=(lineId,label)=>evaluate(`[...document.getElementById('inv-line-'+${q(lineId)}).querySelectorAll('button')].some(b=>b.textContent.trim()===${q(label)})`);
  const field=selector=>evaluate(`(()=>{const el=document.querySelector(${q(selector)});return {value:el.value,badInput:el.validity.badInput};})()`);
  const audit=()=>evaluate("document.getElementById('audit').textContent");
  const sent=async(lineId,what)=>(await audit()).split('\n').filter(x=>x.includes(`/lines/${lineId}/${what}`));
  const rereads=async()=>(await audit()).split('\n').filter(x=>/^GET \S*\/invoices\/test-invoice\s*$/.test(x)).length;
  // The Expense answer on another line re-reads the whole invoice; the other person's change arrives with it.
  const refreshWith=async(lineId,patch)=>{
    const before=await rereads();
    await evaluate(`window.__qaOther(${q(lineId)},${JSON.stringify(patch)})`);
    await clickIn('expense-line','Expense as supplies (not counted)');
    await until(`document.getElementById('audit').textContent.split('\\n').filter(x=>/^GET \\S*\\/invoices\\/test-invoice\\s*$/.test(x)).length>${before}`,'the re-read');
    await pause(150);
  };
  // Open every closed <details> around a box by tapping its summary, the way a person would (a hidden box cannot be focused).
  const reveal=selector=>evaluate(`(()=>{const chain=[];for(let n=document.querySelector(${q(selector)});n;n=n.parentElement)if(n.tagName==='DETAILS')chain.unshift(n);for(const d of chain)if(!d.open)d.querySelector(':scope > summary').click();return chain.length;})()`);
  const STALE='This question changed while you were answering. Reload to see the latest. Your number is kept.';
  const RECV='#inv-line-recv-line .lq-invd-recvd input',PRICE='#inv-line-price-line input[type=number][aria-label^="Price per"]';
  const openDelivery=async()=>{
    await reveal('#inv-line-recv-line details.lq-invd-delivery');await pause(50);
    await clickIn('recv-line','Came up short?');await until(`document.querySelector(${q(RECV)})`,'the delivery box');
  };
  // Debug aids, off by default: INVOICE_QA_ONLY=<regex> runs matching scenarios; INVOICE_QA_KEEP_GOING=1 reports every failure.
  const only=process.env.INVOICE_QA_ONLY?new RegExp(process.env.INVOICE_QA_ONLY):null,keepGoing=process.env.INVOICE_QA_KEEP_GOING==='1',failed=[];
  // Each scenario runs at phone widths. The Start over note must stay on screen and not widen the page.
  const WIDTHS=[320,390];let currentWidth=0;
  const test=async(name,fn)=>{
    for(const width of WIDTHS){
      const label=`${name} (${width}px)`;
      if(only&&!only.test(label))continue;
      try{
        currentWidth=width;
        await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
        await load();await fn();passed++;console.log('PASS',label);
      } catch(error){if(!keepGoing)throw error;failed.push(label);console.log('FAIL',label,'-',String(error.message).split('\n')[0].slice(0,300));}
    }
  };
  // Screenshots of the moved card stay in ignored dist/ for a look, like the layout check's.
  const shootCard=async lineId=>{
    const r=await evaluate(`(()=>{const c=document.getElementById('inv-line-'+${q(lineId)}),b=c.getBoundingClientRect();return {x:b.x+scrollX,y:b.y+scrollY,width:b.width,height:b.height};})()`);
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{...r,scale:1}});
    await writeFile(join(dist,`invoice-typing-${lineId}-${currentWidth}.png`),Buffer.from(shot.data,'base64'));
  };
  const startOverFits=async lineId=>{await shootCard(lineId);return startOverBox(lineId);};
  const startOverBox=async lineId=>assert.deepEqual(await evaluate(`(()=>{const b=[...document.getElementById('inv-line-'+${q(lineId)}).querySelectorAll('button')].find(b=>b.textContent.trim()==='Start over');if(!b)return 'missing';const r=b.getBoundingClientRect();return {inView:r.left>=0&&r.right<=innerWidth,tall:r.height>=32,overflow:document.documentElement.scrollWidth>innerWidth+1};})()`),{inView:true,tall:true,overflow:false},'Start over is reachable and the page does not scroll sideways');

  await test('native: a half-typed delivery count ("5e") then "0" still sends the count the box was started against',async()=>{
    await openDelivery();
    await focusEnd(RECV);await type('5');
    assert.deepEqual(await field(RECV),{value:'5',badInput:false});
    await refreshWith('recv-line',{receivedQty:'2'});
    await until("/Recorded delivery/.test(document.getElementById('inv-line-recv-line').textContent)",'the other count to arrive');
    assert.equal((await field(RECV)).value,'5','the typed count stays in the box');
    await startOverFits('recv-line');
    await focusEnd(RECV);await type('e');
    assert.deepEqual(await field(RECV),{value:'',badInput:true},'Chromium reports a half-typed number as empty and invalid');
    assert.equal(await evaluate(`[...document.getElementById('inv-line-recv-line').querySelectorAll('button')].find(b=>b.textContent.trim()==='Save').disabled`),true,'a half-typed number cannot be saved');
    await type('0');
    assert.deepEqual(await field(RECV),{value:'5e0',badInput:false});
    await clickIn('recv-line','Save');
    await until(`document.getElementById('audit').textContent.includes('/lines/recv-line/received')`,'the save');await pause(150);
    const [body]=await sent('recv-line','received');
    assert.match(body,/\/received \{"receivedQty":5,"expectedReceivedQty":null\}/,'the count the box was started against, never the refreshed 2');
    assert.ok((await evaluate("document.getElementById('inv-line-recv-line').textContent")).includes(STALE),'the stale line shows');
    assert.equal((await field(RECV)).value,'5e0','the typed number is kept');
    assert.equal(await evaluate("window.__qaLine('recv-line').receivedQty"),'2','the other person\'s count is still on file');
    // The way out: cancel, open it again, and the box shows the count on file.
    await clickIn('recv-line','cancel');await pause(60);await clickIn('recv-line','change');await pause(60);
    assert.equal((await field(RECV)).value,'2');
  });

  await test('native: emptying a delivery count with Backspace and typing it again still sends the count it started from',async()=>{
    await openDelivery();
    await focusEnd(RECV);await type('0');
    await refreshWith('recv-line',{receivedQty:'2'});
    await until("/Recorded delivery/.test(document.getElementById('inv-line-recv-line').textContent)",'the other count to arrive');
    await focusEnd(RECV);await press('Backspace');
    assert.deepEqual(await field(RECV),{value:'',badInput:false});
    await type('0');
    await clickIn('recv-line','Save');
    await until(`document.getElementById('audit').textContent.includes('/lines/recv-line/received')`,'the save');await pause(150);
    const [body]=await sent('recv-line','received');
    assert.match(body,/\/received \{"receivedQty":0,"expectedReceivedQty":null\}/);
    assert.ok((await evaluate("document.getElementById('inv-line-recv-line').textContent")).includes(STALE));
    assert.equal(await evaluate("window.__qaLine('recv-line').receivedQty"),'2');
  });

  await test('native: a half-typed one-time price ("3e") then "0" still sends the item and unit it was started against',async()=>{
    await focusEnd(PRICE);await type('3');
    await refreshWith('price-line',{matchedSkuId:'other',matchedName:'Other item',matchedCountUnit:'case'});
    await until(`document.querySelector(${q(PRICE)}).getAttribute('aria-label')==='Price per case'`,'the new unit');
    assert.equal((await field(PRICE)).value,'3');
    await startOverFits('price-line');
    await focusEnd(PRICE);await type('e');
    assert.deepEqual(await field(PRICE),{value:'',badInput:true});
    assert.equal(await evaluate(`[...document.getElementById('inv-line-price-line').querySelectorAll('button')].find(b=>b.textContent.trim()==='Use this cost').disabled`),true);
    await type('0');
    assert.deepEqual(await field(PRICE),{value:'3e0',badInput:false});
    await clickIn('price-line','Use this cost');
    await until(`document.getElementById('audit').textContent.includes('/lines/price-line/apply-cost')`,'the save');await pause(150);
    const [body]=await sent('price-line','apply-cost');
    assert.match(body,/"expectedSkuId":"demo","expectedCountUnit":"pack","expectedPackageKey":"2\|5LB\|","costPerCountUnit":3\}/);
    assert.ok((await evaluate("document.getElementById('inv-line-price-line').textContent")).includes(STALE));
    assert.equal((await field(PRICE)).value,'3e0');
    assert.equal(await evaluate("!!window.__qaLine('price-line').costHoldReason"),true,'no cost was written for the item it no longer shows');
    // The way out: Start over empties the box, and the next answer is for the card as it is now.
    await clickIn('price-line','Start over');await pause(60);
    assert.equal((await field(PRICE)).value,'');
    assert.equal(await hasButton('price-line','Start over'),false);
    await focusEnd(PRICE);await type('3');
    await clickIn('price-line','Use this cost');
    await until("!window.__qaLine('price-line').costHoldReason",'the answer to save');
    const bodies=await sent('price-line','apply-cost');
    assert.equal(bodies.length,2);
    assert.match(bodies[1],/"expectedSkuId":"other","expectedCountUnit":"case"/);
  });
  // A first "e" in an empty number box leaves the value "" so React never calls onChange; Chromium still fires input.
  await test('native: a bad first keystroke ("e") in an empty price box pins the card it began on',async()=>{
    await focusEnd(PRICE);await type('e');
    assert.deepEqual(await field(PRICE),{value:'',badInput:true});
    await refreshWith('price-line',{matchedSkuId:'other',matchedName:'Other item',matchedCountUnit:'case'});
    await until(`document.querySelector(${q(PRICE)}).getAttribute('aria-label')==='Price per case'`,'the new unit');
    assert.equal(await hasButton('price-line','Start over'),true,'the box was started before the card changed');
    await focusEnd(PRICE);await press('Backspace');await type('3');
    assert.deepEqual(await field(PRICE),{value:'3',badInput:false});
    await clickIn('price-line','Use this cost');
    await until(`document.getElementById('audit').textContent.includes('/lines/price-line/apply-cost')`,'the save');await pause(150);
    const [body]=await sent('price-line','apply-cost');
    assert.match(body,/"expectedSkuId":"demo","expectedCountUnit":"pack"/);
    assert.ok((await evaluate("document.getElementById('inv-line-price-line').textContent")).includes(STALE));
  });
  await test('native: a bad first keystroke ("e") in an empty delivery box keeps it the person\'s and pins the count it began on',async()=>{
    await openDelivery();
    await focusEnd(RECV);await type('e');
    assert.deepEqual(await field(RECV),{value:'',badInput:true});
    await refreshWith('recv-line',{receivedQty:'2'});
    await until("/Recorded delivery/.test(document.getElementById('inv-line-recv-line').textContent)",'the other count to arrive');
    assert.deepEqual(await field(RECV),{value:'',badInput:true},'the box does not turn into the count on file');
    assert.equal(await hasButton('recv-line','Start over'),true);
    await focusEnd(RECV);await press('Backspace');await type('1');
    await clickIn('recv-line','Save');
    await until(`document.getElementById('audit').textContent.includes('/lines/recv-line/received')`,'the save');await pause(150);
    const [body]=await sent('recv-line','received');
    assert.match(body,/\/received \{"receivedQty":1,"expectedReceivedQty":null\}/);
    assert.equal(await evaluate("window.__qaLine('recv-line').receivedQty"),'2','the other person\'s count is still on file');
  });
  console.log(`${passed} native invoice typing scenarios passed (Chromium, fictional data).`);
  if(failed.length){console.log(`${failed.length} scenario(s) failed`);process.exitCode=1;}
} finally {
  socket?.close();
  if(chrome.exitCode===null){chrome.kill();await new Promise(resolve=>chrome.once('exit',resolve));}
  server.close();
  await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200}).catch(()=>{});
}
