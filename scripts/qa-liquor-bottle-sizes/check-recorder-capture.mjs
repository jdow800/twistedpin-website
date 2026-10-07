// Actual hooks/API client; deterministic local capture events and deferred
// transcript responses. No microphone, provider, production or database calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
const website=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(new URL('../../package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {useVoiceDictation} from './src/components/liquor/useRecorderDictation';
 const qa=window.qa={state:null,finals:[],segments:[],failed:[]};
 function Harness(){qa.state=useVoiceDictation(text=>qa.finals.push(text),{
   vocabulary:'liquor',onSegment:(text,index)=>qa.segments.push({text,index}),
   onSegmentFailed:index=>qa.failed.push(index)});return null;}
 qa.root=createRoot(document.getElementById('root'));qa.root.render(<Harness/>);
`,resolveDir:website,loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife',define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'}});
const pause=()=>new Promise(r=>setTimeout(r,10));
async function until(fn){for(let i=0;i<160;i++){if(fn())return;await pause();}throw Error('Capture test timed out');}
async function mount(mode='recorder'){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});
 const win=dom.window,recorders=[],tracks=[],requests=[],responses=[],permissions=[],intervals=new Map();
 win.Blob=Blob;win.Response=Response;
 win.setInterval=(fn,ms)=>{const id=Symbol(ms);intervals.set(id,{fn,ms});return id;};win.clearInterval=id=>intervals.delete(id);
 const stream=()=>{const callbacks={};const track={stop(){},addEventListener(name,fn){(callbacks[name]??=[]).push(fn);},fire(name){for(const fn of callbacks[name]??[])fn();}};tracks.push(track);return{getTracks:()=>[track],getAudioTracks:()=>[track]};};
 win.navigator.mediaDevices={getUserMedia:()=>new Promise((resolve,reject)=>permissions.push({resolve:()=>resolve(stream()),reject}))};
 win.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){if(mode==='constructor-failure')throw Error('Controlled constructor failure');this.state='inactive';recorders.push(this);}start(){if(mode==='start-failure')throw Error('Controlled start failure');this.state='recording';}
   stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['controlled clip'])});queueMicrotask(()=>this.onstop?.());}};
 win.fetch=async(url,init)=>{assert.match(String(url),/transcribe-audio$/);requests.push(JSON.parse(init.body));return new Promise(resolve=>responses.push((value,status=200)=>resolve(new Response(JSON.stringify(value),{status}))));};
 const recognizers=[];
 win.SpeechRecognition=class{constructor(){recognizers.push(this);}start(){if(mode==='webspeech-start-failure'||this.throwStart)throw Error('Controlled start failure');this.onstart?.();}stop(){}abort(){}end(){this.onend?.();}result(text){this.onresult({results:[Object.assign([{transcript:text}],{isFinal:true})]});}};
 if(mode.startsWith('webspeech'))win.localStorage.setItem('tp.voiceEngine','webspeech');
 win.eval(outputFiles[0].text);await until(()=>win.qa?.state?.supported);
 const qa=win.qa,snapshot=()=>({recording:qa.state.recording,capturing:qa.state.capturing,error:qa.state.error,finals:[...qa.finals],segments:Array.from(qa.segments,s=>({...s})),failed:[...qa.failed]});
 return{dom,win,qa,recorders,tracks,requests,responses,permissions,intervals,recognizers,snapshot,async start(){qa.state.start();await pause();},async open(){permissions.at(-1).resolve();await until(()=>recorders.length||!qa.state.recording);},close(){qa.root.unmount();dom.window.close();}};
}
const reports=[];
async function test(name,run,mode='recorder'){const t=await mount(mode);try{await run(t);reports.push({scenario:name,observation:t.snapshot()});console.log('PASS '+name);}finally{t.close();}}
await test('connecting is cancellable and Stop clears capture before permission resolves',async t=>{
 await t.start();assert.equal(t.qa.state.capturing,true);assert.equal(t.qa.state.recording,true);
 t.qa.state.stop();await until(()=>!t.qa.state.recording);assert.equal(t.qa.state.capturing,false);
 t.permissions[0].resolve();await pause();assert.equal(t.recorders.length,0);assert.equal(t.requests.length,0);assert.deepEqual([...t.qa.finals],['']);
});
await test('manual Stop clears capture while final upload remains in flight',async t=>{
 await t.start();await t.open();assert.equal(t.qa.state.capturing,true);t.qa.state.stop();await until(()=>t.requests.length===1);
 assert.equal(t.qa.state.capturing,false);assert.equal(t.qa.state.recording,true);assert.equal(t.qa.finals.length,0);
 t.responses[0]({transcript:'one bottle'});await until(()=>!t.qa.state.recording);assert.equal(t.qa.state.capturing,false);assert.deepEqual([...t.qa.finals],['one bottle']);
});
await test('normal segment rotation keeps capture active while older upload drains',async t=>{
 await t.start();await t.open();const rotate=[...t.intervals.values()].find(i=>i.ms===20000);assert.ok(rotate);rotate.fn();
 await until(()=>t.recorders.length===2&&t.requests.length===1);assert.equal(t.qa.state.capturing,true);assert.equal(t.qa.state.recording,true);
 t.qa.state.stop();await until(()=>t.requests.length===2);assert.equal(t.qa.state.capturing,false);assert.equal(t.qa.state.recording,true);
 t.responses[1]({transcript:'second'});await pause();assert.equal(t.qa.state.recording,true);t.responses[0]({transcript:'first'});
 await until(()=>!t.qa.state.recording);assert.deepEqual([...t.qa.finals],['first second']);
});
for(const event of ['ended','error'])await test('device '+event+' clears capture before upload settles',async t=>{
 await t.start();await t.open();if(event==='ended')t.tracks[0].fire('ended');else t.recorders[0].onerror();
 await until(()=>t.requests.length===1);assert.equal(t.qa.state.capturing,false);assert.equal(t.qa.state.recording,true);assert.ok(t.qa.state.error);
 t.responses[0]({transcript:'surviving words'});await until(()=>!t.qa.state.recording);assert.deepEqual([...t.qa.finals],['surviving words']);
});
for(const mode of ['permission-failure','constructor-failure','start-failure'])await test(mode+' clears capture and recording',async t=>{
 await t.start();if(mode==='permission-failure')t.permissions[0].reject(new t.win.DOMException('Controlled denial','NotAllowedError'));else await t.open();
 await until(()=>!t.qa.state.recording);assert.equal(t.qa.state.capturing,false);assert.ok(t.qa.state.error);assert.equal(t.intervals.size,0);assert.equal(t.requests.length,0);
},mode);
await test('failed final transcription clears processing state and retains failed boundary',async t=>{
 await t.start();await t.open();t.qa.state.stop();await until(()=>t.requests.length===1);assert.equal(t.qa.state.capturing,false);
 t.responses[0]({error:'voice_timeout',message:'Controlled transcription deadline'},504);await until(()=>!t.qa.state.recording);
 assert.equal(t.qa.state.capturing,false);assert.ok(t.qa.state.error);assert.deepEqual([...t.qa.failed],[0]);
});
await test('stale completed upload cannot clear newer capture state',async t=>{
 await t.start();await t.open();t.qa.state.stop();await until(()=>t.requests.length===1);
 await t.start();t.permissions[1].resolve();await until(()=>t.recorders.length===2);t.responses[0]({transcript:'old'});await pause();await pause();
 assert.equal(t.qa.state.capturing,true);assert.equal(t.qa.state.recording,true);assert.equal(t.qa.finals.length,0);
 t.qa.state.stop();await until(()=>t.requests.length===2);t.responses[1]({transcript:'new'});await until(()=>!t.qa.state.recording);assert.deepEqual([...t.qa.finals],['new']);
});
await test('Web Speech Stop exposes capture-off before final onend and keeps last words',async t=>{
 await t.start();assert.equal(t.qa.state.capturing,true);const r=t.recognizers[0];r.result('last bottle');t.qa.state.stop();await pause();
 assert.equal(t.qa.state.capturing,false);assert.equal(t.qa.state.recording,true);assert.equal(t.qa.finals.length,0);r.end();await until(()=>!t.qa.state.recording);assert.deepEqual([...t.qa.finals],['last bottle']);
},'webspeech');
await test('Web Speech normal silence restart retains capture state',async t=>{
 await t.start();const r=t.recognizers[0];r.result('first');r.end();await pause();assert.equal(t.qa.state.capturing,true);assert.equal(t.qa.state.recording,true);assert.equal(t.qa.finals.length,0);
 r.result('second');t.qa.state.stop();r.end();await until(()=>!t.qa.state.recording);assert.deepEqual([...t.qa.finals],['first second']);
},'webspeech');
await test('Web Speech start exception clears capture, recording and timer',async t=>{await t.start();assert.equal(t.qa.state.capturing,false);assert.equal(t.qa.state.recording,false);assert.ok(t.qa.state.error);assert.equal(t.intervals.size,0);},'webspeech-start-failure');
await test('Web Speech permission error ends without restart or orphan timer',async t=>{
 await t.start();const r=t.recognizers[0];r.onerror({error:'not-allowed'});await pause();assert.equal(t.qa.state.capturing,false);r.end();await until(()=>!t.qa.state.recording);assert.equal(t.intervals.size,0);assert.equal(t.qa.state.error,'not-allowed');
},'webspeech');
await test('Web Speech failed silence restart releases capture and preserves earlier words',async t=>{
 await t.start();const r=t.recognizers[0];r.result('earlier bottle');r.throwStart=true;r.end();await until(()=>!t.qa.state.recording);assert.equal(t.qa.state.capturing,false);assert.equal(t.intervals.size,0);assert.deepEqual([...t.qa.finals],['earlier bottle']);
},'webspeech');
const hashes=[];for(const path of ['src/components/liquor/useRecorderDictation.ts','src/components/liquor/useSpeech.ts'])hashes.push({path,sha256:createHash('sha256').update(await readFile(website+path)).digest('hex')});
const output=process.env.RECORDER_CAPTURE_RESULTS||fileURLToPath(new URL('./dist/recorder-capture-results.json',import.meta.url));await mkdir(fileURLToPath(new URL('./dist/',import.meta.url)),{recursive:true});
await writeFile(output,JSON.stringify({generatedAt:new Date().toISOString(),scope:'Actual React recorder/Web Speech hooks and API client; mocked capture/acquisition and deferred local transcript responses. No provider, hardware or database requests.',hashes,reports},null,2)+'\n');
console.log(`${reports.length} capture lifecycle scenarios passed.`);
