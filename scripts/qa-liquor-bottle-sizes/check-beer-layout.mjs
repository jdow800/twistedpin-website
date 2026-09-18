// Real Chromium layout + touchscreen checks against the local synthetic fixture.
// Run `node serve.mjs --beer` separately; set BEER_QA_CHROME to a local Chrome executable.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const executable=process.env.BEER_QA_CHROME;
assert.ok(executable,'Set BEER_QA_CHROME to a local Chrome/headless-shell executable.');
const dist=fileURLToPath(new URL('./dist/',import.meta.url));
const profile=await mkdtemp(join(dist,'beer-browser-'));
const chrome=spawn(executable,['--headless','--disable-gpu','--no-sandbox','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(new Error('Chrome debugging endpoint timed out')),15000);
    chrome.once('error',reject);
    chrome.stderr.on('data',data=>{
      output+=data;
      const match=output.match(/DevTools listening on (ws:\/\/\S+)/);
      if(match){clearTimeout(timer);resolve(match[1]);}
    });
    chrome.once('exit',code=>{clearTimeout(timer);reject(new Error(`Chrome exited ${code}: ${output}`));});
  });
  socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let requestId=0;
  const pending=new Map();
  socket.onmessage=event=>{
    const message=JSON.parse(event.data);
    const request=pending.get(message.id);
    if(!request)return;
    pending.delete(message.id);
    if(message.error)request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    const id=++requestId;pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
  const {targetId}=await command('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
  const send=(method,params)=>command(method,params,sessionId);
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable');
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const evidence=[];
  for(const width of [390,320,360,375,412,640]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    await send('Page.navigate',{url:'http://127.0.0.1:4177/?mode=resumed'});
    await evaluate(`new Promise((resolve,reject)=>{let attempts=0;const tick=()=>{if(document.querySelector('.lq-beer-row input'))return resolve();if(++attempts>150)return reject(new Error('Fixture did not load'));setTimeout(tick,20);};tick();})`);
    const sizes=await evaluate(`(() => {
      const row=document.querySelector('.lq-beer-row');
      return [...row.querySelectorAll('.lq-bstep-ctl input')].map(input=>{
        const s=getComputedStyle(input),r=input.getBoundingClientRect();
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;
        return {label:input.getAttribute('aria-label'),width:r.width,usable:r.width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth),fourDigits:ctx.measureText('6982').width,value:input.value};
      });
    })()`);
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    await writeFile(join(dist,`beer-${width}.png`),Buffer.from(screenshot.data,'base64'));
    evidence.push({viewport:width,inputs:sizes});
    await writeFile(join(dist,'beer-layout-results.json'),JSON.stringify(evidence,null,2)+'\n');
    for(const input of sizes)assert.ok(input.usable>=input.fourDigits+4,`${width}px: ${input.label} has ${input.usable.toFixed(1)}px for ${input.fourDigits.toFixed(1)}px of digits`);
    // The actual touch coordinates must keep hitting the same loose-bottle plus
    // control while values change. No DOM .click() shortcut in this check.
    const touch=await evaluate(`(() => {const b=document.querySelectorAll('.lq-beer-row')[0].querySelectorAll('.lq-bstep-ctl button')[5];const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,label:b.getAttribute('aria-label')};})()`);
    for(let i=0;i<14;i++){
      assert.equal(await evaluate(`document.elementFromPoint(${touch.x},${touch.y}).getAttribute('aria-label')`),touch.label,'Touch target moved to another pack tier');
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    const outcome=await evaluate(`new Promise(resolve=>setTimeout(()=>resolve({fields:[...document.querySelector('.lq-beer-row').querySelectorAll('input')].map(i=>Number(i.value)),total:document.querySelector('.lq-beer-total').textContent,scale:visualViewport.scale}),50))`);
    assert.deepEqual(outcome.fields,[2,1,28]);assert.equal(outcome.total,'82 bottles total');assert.equal(outcome.scale,1);
    console.log(`PASS ${width}px: fields remain readable and 14 coordinate taps add exactly 14 loose bottles`);
  }
} finally {
  socket?.close();
  if(chrome.exitCode===null){chrome.kill();await new Promise(resolve=>chrome.once('exit',resolve));}
  assert.ok(resolve(profile).startsWith(resolve(dist)+sep),'Browser profile must stay inside the QA output directory');
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
