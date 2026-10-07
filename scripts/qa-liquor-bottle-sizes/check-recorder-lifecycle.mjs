// Actual React hook, API client, Chromium MediaRecorder and WebM/Opus codec.
// Only acquisition/device events, synthetic audio and transcript responses are controlled.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browser} from '../qa-cogs-mobile/cdp.mjs';

const here=dirname(fileURLToPath(import.meta.url)),website=resolve(here,'../..');
const dependencies=process.env.RECORDER_QA_DEPENDENCIES||website;
const require=createRequire(resolve(dependencies,'package.json'));
const {build}=require('esbuild');
const {outputFiles}=await build({stdin:{contents:`
 import React from 'react';
 import {createRoot} from 'react-dom/client';
 import {useRecorderDictation} from './src/components/liquor/useRecorderDictation';
 const qa=window.qa={state:null,finals:[],segments:[]};
 function Harness(){qa.state=useRecorderDictation(text=>qa.finals.push(text),{
   vocabulary:'liquor',scope:{section:'food'},onSegment:(text,index)=>qa.segments.push({text,index})
 });return <div><button onClick={()=>qa.state.start()}>Start</button><button onClick={()=>qa.state.stop()}>Stop</button></div>;}
 qa.root=createRoot(document.getElementById('root'));qa.root.render(<Harness/>);
`,resolveDir:website,loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife',
nodePaths:[resolve(dependencies,'node_modules')],define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'}});

const server=createServer((req,res)=>{
 const script=req.url==='/app.js';res.setHeader('Content-Type',script?'text/javascript':'text/html');
 res.end(script?outputFiles[0].text:'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,reports=[];

const prelude=mode=>`(()=>{
 window.lifecycle={mode:${JSON.stringify(mode)},starts:0,stops:0,requests:[],intervals:new Map(),tracks:[],contexts:[],recorders:[],gains:[],wakes:[]};
 const q=window.lifecycle,realInterval=window.setInterval.bind(window),realClear=window.clearInterval.bind(window);
 window.setInterval=(fn,ms,...args)=>{const id=realInterval(fn,ms,...args);q.intervals.set(id,ms);return id;};
 window.clearInterval=id=>{q.intervals.delete(id);return realClear(id);};
 if(q.mode==='wake-old-resolve'){
   Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:()=>new Promise(resolve=>{
     const wake={resolve,releases:0};wake.sentinel={release:async()=>{wake.releases++;}};q.wakes.push(wake);
   })}});
   q.resolveWake=index=>q.wakes[index].resolve(q.wakes[index].sentinel);
 }
 const NativeRecorder=window.MediaRecorder;
 window.MediaRecorder=class extends NativeRecorder{
   constructor(...args){if(q.mode==='recorder-constructor-error')throw new DOMException('Controlled constructor failure','InvalidStateError');super(...args);q.recorders.push(this);}
   start(...args){if(q.mode==='recorder-start-error')throw new DOMException('Controlled start failure','InvalidStateError');return super.start(...args);}
 };
 const stream=()=>{
   const ctx=new AudioContext();q.contexts.push(ctx);
   const oscillator=ctx.createOscillator(),gain=ctx.createGain(),destination=ctx.createMediaStreamDestination();
   q.gains.push(gain);oscillator.frequency.value=440;gain.gain.value=0.18;
   oscillator.connect(gain).connect(destination);oscillator.start();ctx.resume();
   for(const track of destination.stream.getTracks()){
     q.tracks.push(track);const stop=track.stop.bind(track);track.stop=()=>{q.stops++;stop();};
   }
   return destination.stream;
 };
 q.permissions=[];q.resolvePermission=(index=0)=>q.permissions[index].resolve(stream());
 q.rejectPermission=(index=0)=>q.permissions[index].reject(new DOMException('Delayed old denial','NotAllowedError'));
 Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:()=>{
   q.starts++;
   if(q.mode==='permission-denied')return Promise.reject(new DOMException('Controlled permission denial','NotAllowedError'));
   if(q.mode==='device-unavailable')return Promise.reject(new DOMException('Controlled missing device','NotFoundError'));
   if(q.mode.startsWith('pending'))return new Promise((resolve,reject)=>q.permissions.push({resolve,reject}));
   return Promise.resolve(stream());
 }});
 window.fetch=async(url,init)=>{
   if(String(url)!=='/mock/admin/bar/transcribe-audio')throw Error('Unexpected request '+url);
   const body=JSON.parse(init.body),bytes=Uint8Array.from(atob(body.data),c=>c.charCodeAt(0));
   const ctx=new AudioContext();q.contexts.push(ctx);const decoded=await ctx.decodeAudioData(bytes.buffer.slice(0));
   const samples=decoded.getChannelData(0);let energy=0;for(const sample of samples)energy+=sample*sample;
   q.requests.push({contentType:body.contentType,bytes:bytes.length,header:Array.from(bytes.slice(0,4)),
     decodedFrames:decoded.length,sampleRate:decoded.sampleRate,rms:Math.sqrt(energy/samples.length),
     piece:body.piece,takeId:body.takeId,vocabulary:body.vocabulary,section:body.section});
   return new Response(JSON.stringify({transcript:'one half case'}),{headers:{'Content-Type':'application/json'}});
 };
})()`;

const pause=ms=>new Promise(r=>setTimeout(r,ms));
const state=b=>b.evaluate(`({recording:qa.state.recording,capturing:qa.state.capturing,armed:qa.state.armed,quiet:qa.state.quiet,error:qa.state.error,
 seconds:qa.state.seconds,finals:qa.finals.slice(),segments:qa.segments.slice(),starts:lifecycle.starts,stops:lifecycle.stops,
 intervals:[...lifecycle.intervals.values()],requests:lifecycle.requests.slice(),tracks:lifecycle.tracks.map(t=>t.readyState)})`);
async function click(b,text){
 const point=await b.evaluate(`(()=>{const r=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(text)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await b.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
 await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
}
function assertCaptured(result){
 assert.equal(result.recording,false);assert.equal(result.capturing,false);assert.equal(result.intervals.length,0);assert.ok(result.tracks.every(t=>t==='ended'));
 assert.deepEqual(result.finals,['one half case']);assert.equal(result.requests.length,1);
 const clip=result.requests[0];assert.equal(clip.contentType,'audio/webm');assert.ok(clip.bytes>100);
 assert.deepEqual(clip.header,[0x1a,0x45,0xdf,0xa3]);assert.ok(clip.decodedFrames>0);assert.ok(clip.rms>0.01);
 assert.equal(clip.piece,0);assert.equal(clip.section,'food');assert.equal(clip.vocabulary,'liquor');
 assert.match(clip.takeId,/^[0-9a-f-]{36}$/);
}
const failures=['permission-denied','device-unavailable','recorder-constructor-error','recorder-start-error'];
const modes=[...failures,'pending-stop','pending-unmount','pending-old-resolve','pending-old-reject','pending-double-start','wake-old-resolve','track-mute-unmute','track-ended','recorder-error','real-webm'];
let count=0;
try{
 for(const mode of modes){
  const b=await browser();
  try{
   await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await b.send('Page.addScriptToEvaluateOnNewDocument',{source:prelude(mode)});
   await b.send('Page.navigate',{url:origin});await b.until('window.qa?.state?.supported');
   await click(b,'Start');await b.until('lifecycle.starts===1');
   if(failures.includes(mode)){
    await b.until('qa.state.recording===false&&qa.state.error');await pause(1250);
    const failed=await state(b);
    assert.equal(failed.capturing,false);
    assert.equal(failed.error,mode==='permission-denied'?'not-allowed':'audio-capture');
    assert.equal(failed.seconds,0,'A failed start cannot leave its elapsed-time timer running.');
    assert.equal(failed.intervals.length,0,'A failed start cannot install or retain rotation timers.');
    assert.ok(failed.tracks.every(t=>t==='ended'),'A failed native start must release every microphone track.');
    assert.equal(failed.requests.length,0);assert.equal(failed.segments.length,0);
    assert.deepEqual(failed.finals,mode.startsWith('recorder-')?['']:[]);
    reports.push({scenario:mode,observation:failed});count++;console.log('PASS '+mode);
    // Permission/device recovery must create a fresh, functioning take.
    await b.evaluate("lifecycle.mode='real-webm';qa.finals.length=0;qa.segments.length=0;");
    await click(b,'Start');await b.until('qa.state.armed&&lifecycle.starts===2');await pause(350);await click(b,'Stop');
    await b.until('qa.finals.length===1&&!qa.state.recording');const retried=await state(b);
    assertCaptured(retried);assert.equal(retried.error,null);assert.equal(retried.starts,2);
    reports.push({scenario:mode+'-retry',observation:retried});count++;console.log('PASS '+mode+'-retry');
   }else if(mode==='pending-old-resolve'||mode==='pending-old-reject'){
    await click(b,'Stop');await b.until('!qa.state.recording');await b.evaluate('qa.finals.length=0');
    await click(b,'Start');await b.until('lifecycle.starts===2');
    let stale;
    if(mode==='pending-old-resolve'){
     await b.evaluate('lifecycle.resolvePermission(0)');await pause(100);stale=await state(b);
     assert.equal(stale.stops,1);assert.ok(stale.tracks.every(t=>t==='ended'));
     assert.equal(await b.evaluate('lifecycle.recorders.length'),0,'An old permission result cannot start a new recorder.');
     assert.deepEqual(stale.intervals,[1000]);assert.equal(stale.recording,true);assert.equal(stale.capturing,true);
     await b.evaluate('lifecycle.resolvePermission(1)');await b.until('qa.state.armed');
    }else{
     await b.evaluate('lifecycle.resolvePermission(1)');await b.until('qa.state.armed');
     await b.evaluate('lifecycle.rejectPermission(0)');await pause(100);stale=await state(b);
     assert.equal(stale.recording,true);assert.equal(stale.capturing,true);assert.equal(stale.error,null);assert.equal(stale.stops,0);
     assert.equal(await b.evaluate('lifecycle.recorders.length'),1);
    }
    await pause(350);await click(b,'Stop');await b.until('qa.finals.length===1&&!qa.state.recording');
    const result=await state(b);assertCaptured(result);assert.equal(result.error,null);
    assert.equal(await b.evaluate('lifecycle.recorders.length'),1);
    reports.push({scenario:mode,stale,observation:result});count++;console.log('PASS '+mode);
   }else if(mode==='pending-double-start'){
    await click(b,'Start');await pause(80);assert.equal(await b.evaluate('lifecycle.starts'),1);
    await b.evaluate('lifecycle.resolvePermission()');await b.until('qa.state.armed');await pause(350);
    await click(b,'Stop');await b.until('qa.finals.length===1&&!qa.state.recording');
    const result=await state(b);assertCaptured(result);assert.equal(result.starts,1);assert.equal(result.stops,1);
    reports.push({scenario:mode,observation:result});count++;console.log('PASS '+mode);
   }else if(mode.startsWith('pending')){
    if(mode==='pending-stop')await click(b,'Stop');else await b.evaluate('qa.root.unmount()');
    await b.evaluate('lifecycle.resolvePermission()');await b.until('lifecycle.stops===1');await pause(80);
    const result=await state(b);assert.equal(result.requests.length,0);assert.equal(result.intervals.length,0);
    assert.deepEqual(result.finals,mode==='pending-stop'?['']:[]);assert.ok(result.tracks.every(t=>t==='ended'));
    reports.push({scenario:mode,observation:result});count++;console.log('PASS '+mode);
   }else if(mode==='wake-old-resolve'){
    await b.until('qa.state.armed&&lifecycle.wakes.length===1');await pause(350);await click(b,'Stop');
    await b.until('qa.finals.length===1&&!qa.state.recording');const first=await state(b);assertCaptured(first);
    await b.evaluate('qa.finals.length=0;qa.segments.length=0;lifecycle.requests.length=0');
    await click(b,'Start');await b.until('qa.state.armed&&lifecycle.wakes.length===2');
    await b.evaluate('lifecycle.resolveWake(0)');await b.until('lifecycle.wakes[0].releases===1');
    await b.evaluate('lifecycle.resolveWake(1)');await pause(350);await click(b,'Stop');
    await b.until('qa.finals.length===1&&!qa.state.recording');const result=await state(b);assertCaptured(result);
    assert.notEqual(result.requests[0].takeId,first.requests[0].takeId);
    const wakeReleases=await b.evaluate('lifecycle.wakes.map(w=>w.releases)');assert.deepEqual(wakeReleases,[1,1]);
    reports.push({scenario:mode,observation:result,wakeReleases});count++;console.log('PASS '+mode);
   }else{
    await b.until('qa.state.armed&&lifecycle.tracks.length===1');await pause(350);
    assert.equal((await state(b)).capturing,true);
    let muted;
    if(mode==='track-mute-unmute'){
     await b.evaluate("lifecycle.gains[0].gain.value=0;lifecycle.tracks[0].dispatchEvent(new Event('mute'));");
     await b.until('qa.state.quiet');muted=await state(b);assert.equal(muted.recording,true);assert.equal(muted.stops,0);
     await b.evaluate("lifecycle.gains[0].gain.value=0.18;lifecycle.tracks[0].dispatchEvent(new Event('unmute'));");
     await b.until('!qa.state.quiet');await click(b,'Stop');
    }else if(mode==='track-ended')await b.evaluate("lifecycle.tracks[0].dispatchEvent(new Event('ended'))");
    else if(mode==='recorder-error')await b.evaluate("lifecycle.recorders[0].dispatchEvent(new Event('error'))");
    else await click(b,'Stop');
    await b.until('qa.finals.length===1&&!qa.state.recording');const result=await state(b);
    assertCaptured(result);assert.equal(result.starts,1);assert.equal(result.stops,1);
    assert.equal(result.error,mode==='track-ended'?'mic disconnected':mode==='recorder-error'?'audio-capture':null);
    reports.push({scenario:mode,observation:result,...muted?{muted}:{}});count++;console.log('PASS '+mode);
   }
   assert.equal(b.blocked.length,0,'This test must make no external or production request.');
  }finally{
   try{await b.evaluate('Promise.all(lifecycle.contexts.map(c=>c.close()))');}catch{}
   await b.close();
  }
 }
}finally{await new Promise(r=>server.close(r));}
await mkdir(resolve(here,'dist'),{recursive:true});
await writeFile(resolve(here,'dist/recorder-lifecycle-results.json'),JSON.stringify({generatedAt:new Date().toISOString(),
 scope:'Actual hook/API client and native Chromium WebM/Opus capture and decode; synthetic oscillator, acquisition/track events and transcript response. No Android hardware, physical microphone, provider call or production write.',reports},null,2));
console.log(`${count} recorder lifecycle scenarios passed; no physical microphone or paid calls.`);
