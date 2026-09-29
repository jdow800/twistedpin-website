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
  const modes=process.env.INVOICE_QA_MODES?.split(',') ?? ['clarity','clarity-unknown-unit','food','linked','remember-unit','amount','automatic','explain','deposit-auto','linked-auto','linked-agree','linked-question'];
  for(const width of [320,390,960]) for(const mode of modes) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    await send('Page.navigate',{url:`http://127.0.0.1:4177/?mode=${mode}`});
    await evaluate(`new Promise((resolve,reject)=>{let n=0;const tick=()=>{if(document.querySelector('.lq-invd'))return resolve();if(++n>150)return reject(Error('Screen did not load'));setTimeout(tick,20);};tick();})`);
    await evaluate(`document.getElementById('audit').style.display='none'`);
    if(mode==='automatic') {
      await evaluate(`document.querySelector('.lq-invd-automatic').open=true`);
      await evaluate(`new Promise((resolve,reject)=>{let n=0;const tick=()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Correct unit');if(button){button.click();return resolve();}if(++n>100)return reject(Error('No automatic answer'));setTimeout(tick,20);};tick();})`);
      await evaluate(`new Promise(resolve=>setTimeout(resolve,50))`);
    }
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
    if (mode === 'clarity') {
      const metrics = await evaluate(`(() => { const input = document.querySelector('.lq-invd-questions input[type=text]'); return { font: parseFloat(getComputedStyle(input).fontSize), height: input.getBoundingClientRect().height }; })()`);
      assert.ok(metrics.font >= 16 && metrics.height >= 44, `${width}px: readable touch input`);
      for (const [lineId, answer] of [['test-keg', '1 case = 24 cans'], ['test-biscuit', 'a case has 10 cans']]) {
        await evaluate(`(() => { const row = document.getElementById(${JSON.stringify('inv-line-' + lineId)}), input = row.querySelector('input[type=text]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(answer)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
        await evaluate(`new Promise(resolve=>setTimeout(resolve,30))`);
        await evaluate(`document.getElementById(${JSON.stringify('inv-line-' + lineId)}).querySelector('button[type=submit]').click()`);
        await evaluate(`new Promise((resolve,reject)=>{let n=0;const tick=()=>{if(!document.querySelector('.lq-invd-questions #inv-line-${lineId}'))return resolve();if(++n>100)return reject(Error('Answer did not save'));setTimeout(tick,20);};tick();})`);
      }
      assert.match(await evaluate(`document.getElementById('invoice-progress').textContent`), /all caught up/);
      assert.equal(await evaluate(`document.activeElement.id`), 'invoice-progress');
      assert.equal(await evaluate(`document.querySelector('.lq-invd-ledger').open`), false);
      await writeFile(join(dist,`invoice-complete-${width}.png`),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
      console.log(`PASS ${width}px: both written answers save and show completion`);
    }
  }
} finally {
  socket?.close();if(chrome.exitCode===null){chrome.kill();await new Promise(resolve=>chrome.once('exit',resolve));}
  // Profile and screenshots remain in ignored dist for reproducible inspection.
}
