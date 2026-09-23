// Real recorder hook and API; synthetic microphone/audio and network only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
const require=createRequire(new URL('../../package.json',import.meta.url));
const {build}=require('esbuild');
const {outputFiles}=await build({stdin:{contents: `
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {useRecorderDictation} from './src/components/liquor/useRecorderDictation';
  const qa=window.recorderQa={state:null,finals:[],segments:[]};
  function Harness(){qa.state=useRecorderDictation(text=>qa.finals.push(text),{vocabulary:'liquor',scope:{section:'food'},onSegment:(text,index)=>qa.segments.push({text,index})});return null;}
  qa.root=createRoot(document.getElementById('root'));qa.root.render(<Harness/>);
`,resolveDir:fileURLToPath(new URL('../../',import.meta.url)),loader:'jsx'},bundle:true,write:false,platform:'browser',format:'iife',define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'}});
const pause=()=>new Promise(r=>setTimeout(r,10));
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await pause();}throw Error('Recorder condition timed out');}
let passed=0;
for(const mode of ['client-timeout','server-timeout','wifi-retry','partial-timeout']){
  const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});
  const win=dom.window,recorders=[],timers=new Map(),requests=[];
  let stopped=0;
  const track={stop(){stopped++;},addEventListener(){}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  win.navigator.mediaDevices={getUserMedia:async()=>stream};
  win.Blob=Blob;win.Response=Response;
  win.MediaRecorder=class{
    static isTypeSupported(){return true;}
    constructor(){this.state='inactive';recorders.push(this);}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['synthetic audio'])});queueMicrotask(()=>this.onstop?.());}
  };
  const originalSet=win.setTimeout.bind(win),originalClear=win.clearTimeout.bind(win);
  win.setTimeout=(fn,ms,...args)=>{const id=originalSet(fn,ms,...args);if(ms===45_000)timers.set(id,()=>fn(...args));return id;};
  win.clearTimeout=id=>{timers.delete(id);originalClear(id);};
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
  win.fetch=async(url,init)=>{
    assert.match(String(url),/transcribe-audio$/);requests.push(init);
    if(mode==='server-timeout')return json({error:'voice_timeout',message:'Transcription took too long.'},504);
    if(mode==='wifi-retry'&&requests.length===1)throw new TypeError('Synthetic wifi failure');
    if(mode==='wifi-retry'||(mode==='partial-timeout'&&requests.length===1))return json({transcript:'one case'});
    return new Promise(()=>{});
  };
  try{
    win.eval(outputFiles[0].text);await until(()=>win.recorderQa?.state?.supported);
    const qa=win.recorderQa;qa.state.start();await until(()=>recorders.length===1);
    if(mode==='partial-timeout'){recorders[0].stop();await until(()=>qa.segments.length===1);}
    qa.state.stop();await until(()=>requests.length>=(mode==='partial-timeout'?2:1));
    if(mode.includes('client')||mode==='partial-timeout'){
      for(const [id,fn]of [...timers]){originalClear(id);fn();}
    }
    await until(()=>qa.finals.length===1&&!qa.state.recording);
    assert.ok(stopped>0,'Stop must release the microphone even when the request stalls');
    if(mode==='wifi-retry'){assert.equal(requests.length,2);assert.equal(qa.finals[0],'one case');assert.equal(qa.state.error,null);}
    else{
      assert.equal(requests.length,mode==='partial-timeout'?2:1,'A timeout must not trigger another full wait');
      assert.match(qa.state.error,/took too long/);
      assert.equal(qa.finals[0],mode==='partial-timeout'?'one case':'');
      assert.equal(qa.segments.length,mode==='partial-timeout'?1:0);
    }
    qa.root.unmount();passed++;console.log('PASS recorder',mode);
  }finally{win.close();}
}
console.log(`${passed} recorder recovery scenarios passed; no real microphone used.`);
