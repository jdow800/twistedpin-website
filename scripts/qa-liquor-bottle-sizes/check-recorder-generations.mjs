// Actual recorder hook/API; controlled capture and deferred local responses.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
const require=createRequire(new URL('../../package.json',import.meta.url));
const {outputFiles}=await require('esbuild').build({stdin:{contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {useRecorderDictation} from './src/components/liquor/useRecorderDictation';
  const qa=window.recorderQa={state:null,finals:[],segments:[],failed:[],scope:{section:'food',zoneId:'freezer'}};
  function Harness(){qa.state=useRecorderDictation(text=>qa.finals.push(text),{vocabulary:'liquor',scope:qa.scope,
    onSegment:(text,index)=>qa.segments.push({text,index}),onSegmentFailed:index=>qa.failed.push(index)});return null;}
  qa.root=createRoot(document.getElementById('root'));qa.render=()=>qa.root.render(<Harness/>);qa.render();
`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife',define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'}});
const pause=()=>new Promise(r=>setTimeout(r,10));
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await pause();}throw Error('Generation test timed out');}
let passed=0;
for(const mode of ['late-success','late-failure','late-onstop','late-track-events']){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});
  const win=dom.window,recorders=[],requests=[],responses=[];
  const tracks=[];
  win.navigator.mediaDevices={getUserMedia:async()=>{const callbacks={};const track={stop(){},addEventListener(name,fn){(callbacks[name]??=[]).push(fn);},fire(name){for(const fn of callbacks[name]??[])fn();}};tracks.push(track);return{getTracks:()=>[track],getAudioTracks:()=>[track]};}};win.Blob=Blob;win.Response=Response;
  win.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){this.state='inactive';recorders.push(this);}start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['synthetic clip'])});queueMicrotask(()=>this.onstop?.());}};
  win.fetch=async(url,init)=>{assert.match(String(url),/transcribe-audio$/);requests.push(JSON.parse(init.body));return new Promise(resolve=>responses.push(value=>resolve(new Response(JSON.stringify(value),{status:value.error?504:200}))));};
  try{
    win.eval(outputFiles[0].text);await until(()=>win.recorderQa?.state?.supported);const qa=win.recorderQa;
    qa.state.start();await until(()=>recorders.length===1);qa.state.stop();await until(()=>requests.length===1);
    assert.equal(requests[0].section,'food');assert.equal(requests[0].zoneId,'freezer');assert.equal(requests[0].piece,0);
    qa.scope={section:'food',zoneId:'cooler'};qa.render();await pause();qa.state.start();await until(()=>recorders.length===2);
    if(mode==='late-onstop'){recorders[0].onstop();await pause();assert.equal(requests.length,1,'old onstop cannot launch a clip for the new take');}
    if(mode==='late-track-events'){const quiet=qa.state.quiet;for(const event of ['ended','mute','unmute']){tracks[0].fire(event);await pause();assert.equal(qa.state.recording,true,`old ${event} cannot stop the new stream`);assert.equal(qa.state.quiet,quiet,`old ${event} cannot change the new stream's quiet status`);assert.equal(recorders[1].state,'recording');}}
    responses[0](mode==='late-failure'?{error:'voice_timeout',message:'Old failed upload'}:{transcript:'old freezer text'});await pause();await pause();
    assert.equal(qa.finals.length,0,'old final text must not finish the newer take');assert.equal(qa.segments.length,0,'old segment must not enter the newer review');assert.equal(qa.failed.length,0,'old failure must not invent a gap in the newer take');assert.equal(qa.state.error,null);assert.equal(qa.state.recording,true);
    qa.state.stop();await until(()=>requests.length===2);assert.equal(requests[1].zoneId,'cooler');assert.equal(requests[1].piece,0);assert.notEqual(requests[0].takeId,requests[1].takeId);
    responses[1]({transcript:'new cooler text'});await until(()=>qa.finals.length===1&&!qa.state.recording);
    assert.deepEqual([...qa.finals],['new cooler text']);assert.deepEqual(Array.from(qa.segments,s=>({text:s.text,index:s.index})),[{text:'new cooler text',index:0}]);assert.equal(qa.failed.length,0);
    qa.root.unmount();passed++;console.log('PASS recorder generation',mode);
  }finally{win.close();}
}
console.log(`${passed} recorder generation scenarios passed; no real microphone or service calls.`);
