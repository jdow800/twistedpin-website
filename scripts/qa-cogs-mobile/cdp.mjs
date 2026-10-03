import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function browser(){
  const dir=fileURLToPath(new URL('./profiles/',import.meta.url));await mkdir(dir,{recursive:true});
  const profile=await mkdtemp(join(dir,'phone-'));
  const executable=process.env.COGS_QA_CHROME||'C:/Users/jdow8/AppData/Local/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe';
  const chrome=spawn(executable,['--headless','--disable-gpu','--no-sandbox','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let output='';const endpoint=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Chrome launch timed out: '+output)),15000);
    chrome.once('error',reject);chrome.once('exit',code=>reject(new Error('Chrome exited '+code+output)));
    chrome.stderr.on('data',data=>{output+=data;const match=output.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  const socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  const pending=new Map(),listeners=new Set();let next=0;
  socket.onmessage=event=>{const msg=JSON.parse(event.data),p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}else for(const l of listeners)l(msg);};
  const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});
  const {targetId}=await command('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
  const send=(method,params={})=>command(method,params,sessionId);
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  // The fetch mock is the first guard. This request interception is the second:
  // only local page/module/font assets may reach the network.
  await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  const blocked=[];
  listeners.add(msg=>{if(msg.method==='Fetch.requestPaused'&&msg.sessionId===sessionId){const {requestId,request}=msg.params;const u=new URL(request.url);const local=['127.0.0.1','localhost'].includes(u.hostname);if(local&&!u.pathname.startsWith('/tprs-api'))void send('Fetch.continueRequest',{requestId});else {blocked.push(request.url);void send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});}}});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value;};
  const until=async expression=>evaluate(`new Promise((resolve,reject)=>{let n=0;const tick=()=>{try{const value=(${expression});if(value)return resolve(true);}catch{}if(++n>250)return reject(new Error('UI timed out: '+${JSON.stringify(expression)}));setTimeout(tick,20)};tick()})`);
  return {send,evaluate,until,blocked,close:async()=>{socket.close();chrome.kill();await new Promise(r=>setTimeout(r,250));await rm(profile,{recursive:true,force:true});}};
}
