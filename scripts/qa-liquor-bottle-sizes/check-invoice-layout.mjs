// Local fictional invoices only. Uses the same headless Chromium approach as
// check-beer-layout.mjs; no signed-in browser profile or live API requests.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const executable=process.env.INVOICE_QA_CHROME;
assert.ok(executable,'Set INVOICE_QA_CHROME to the Chromium executable');
const dist=fileURLToPath(new URL('./dist/',import.meta.url));
const profile=await mkdtemp(join(dist,'invoice-browser-'));
const chrome=spawn(executable,['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
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
  await send('Page.enable');
  for(const width of [320,390,960]) for(const mode of ['food','linked']) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    await send('Page.navigate',{url:`http://127.0.0.1:4177/?mode=${mode}`});
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const tick=()=>{if(document.querySelector('.lq-invd'))return resolve();if(++n>150)return reject(Error('Screen did not load'));setTimeout(tick,20);};tick();})`);
    await evaluate(`document.getElementById('audit').style.display='none'`);
    if(mode==='food') {
      await evaluate(`(() => {const input=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'pepperoni');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await evaluate(`new Promise(resolve=>setTimeout(resolve,50))`);
      assert.match(await evaluate(`document.querySelector('.lq-rev-assign').textContent`),/Peperoni Sliced/);
    }
    const overflow=await evaluate(`document.documentElement.scrollWidth>innerWidth+1`);
    assert.equal(overflow,false,`${width}px ${mode}: horizontal overflow`);
    const shot=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(join(dist,`invoice-${mode}-${width}.png`),Buffer.from(shot.data,'base64'));
    console.log(`PASS ${width}px ${mode}: no horizontal overflow`);
  }
} finally {
  socket?.close();if(chrome.exitCode===null){chrome.kill();await new Promise(resolve=>chrome.once('exit',resolve));}
  // Profile and screenshots remain in ignored dist for reproducible inspection.
}
