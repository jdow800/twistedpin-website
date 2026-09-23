// Fictional local food review only; uses an isolated headless browser profile.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const executable=process.env.INVOICE_QA_CHROME;
assert.ok(executable,'Set INVOICE_QA_CHROME to the Chromium executable');
const dist=fileURLToPath(new URL('./dist/',import.meta.url));
const profile=await mkdtemp(join(dist,'food-browser-'));
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
  const waitFor=condition=>evaluate(`new Promise((resolve,reject)=>{let n=0;const tick=()=>{if(${condition})return resolve();if(++n>150)return reject(Error('Screen did not load'));setTimeout(tick,20);};tick();})`);
  await send('Page.enable');
  for(const width of [320,390,960]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    await send('Page.navigate',{url:'http://127.0.0.1:4177/?definitions'});
    await waitFor("document.querySelector('.lq-fc-row')");
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Talk through')).click()`);
    await waitFor('foodQa.recorder');
    await evaluate(`foodQa.recorder.segment('celery three',0)`);
    await waitFor('foodQa.extracts.length===1');
    await evaluate(`foodQa.extracts[0].succeed([{spoken:'celery three',cases:0,units:3,quantityKnown:true,spokenUnit:null,unitNeedsReview:true,match:{id:'celery'},candidates:[]}]);foodQa.recorder.finish('celery three')`);
    await waitFor("document.querySelector('[aria-label=\"Spoken unit for Sample Celery\"]')");
    const state=await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth+1,question:document.querySelector('.lq-fc-rev-ask').textContent,apply:[...document.querySelectorAll('button')].find(b=>/^Add .*Pizza Freezer/.test(b.textContent))?.disabled})`);
    assert.equal(state.overflow,false,`${width}px: horizontal overflow`);
    assert.equal(state.apply,true,`${width}px: unresolved unit must block Add`);
    assert.match(state.question,/what unit does 3 refer to/);
    await evaluate(`document.querySelector('.lq-fc-rev-ask').scrollIntoView({block:'center'})`);
    const shot=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(join(dist,`food-unit-${width}.png`),Buffer.from(shot.data,'base64'));
    console.log(`PASS ${width}px: unit question visible, Add blocked, no horizontal overflow`);
  }
} finally {
  socket?.close();if(chrome.exitCode===null){chrome.kill();await new Promise(resolve=>chrome.once('exit',resolve));}
}
