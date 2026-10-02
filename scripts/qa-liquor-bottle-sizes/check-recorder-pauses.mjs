// Pause cuts in the real recorder hook. The clock, microphone, audio analyser
// and server are synthetic; the analyser plays a scripted loudness.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const require = createRequire(new URL('../../package.json', import.meta.url));
const {build} = require('esbuild');
const {outputFiles} = await build({
  stdin: {contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {useRecorderDictation} from './src/components/liquor/useRecorderDictation';
    const qa = window.recorderQa = {state:null, finals:[], segments:[]};
    const options = {...window.recorderOptions, onSegment:(text,index) => qa.segments.push({text,index})};
    function Harness() {
      qa.state = useRecorderDictation(text => qa.finals.push(text), options);
      return null;
    }
    qa.root = createRoot(document.getElementById('root'));
    qa.root.render(<Harness/>);
  `, resolveDir:fileURLToPath(new URL('../../', import.meta.url)), loader:'jsx'},
  bundle:true, write:false, platform:'browser', format:'iife',
  define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'},
});
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(predicate) {
  for (let i = 0; i < 400; i++) { if (predicate()) return; await pause(); }
  throw new Error('Recorder condition timed out');
}

let passed = 0;
for (const scenario of ['pause-then-cap', 'no-analyser', 'switch-off']) {
  const dom = new JSDOM('<div id="root"></div>', {url:'http://localhost', runScripts:'outside-only', pretendToBeVisual:true});
  const win = dom.window;
  const recorders = [], stopEvents = [], requests = [], intervals = new Map();
  let now = 0, nextTimer = 1;
  // Counting rhythm: a 300 ms gap every 2 s, and a 1 s breath at 21 s.
  let levelAt = (at) => (at % 2_000 < 300) || (at > 21_000 && at <= 22_000) ? -50 : -20;
  win.recorderOptions = {vocabulary:'liquor', scope:{section:'bar'}, pauseCuts: scenario !== 'switch-off'};
  win.Blob = Blob;
  win.Response = Response;
  win.Date.now = () => now;
  win.setInterval = (fn, ms) => { const id = nextTimer++; intervals.set(id, {fn, ms, next:now + ms}); return id; };
  win.clearInterval = id => intervals.delete(id);
  const step = ms => {
    const end = now + ms;
    while (true) {
      const due = [...intervals.values()].filter(t => t.next <= end).sort((a,b) => a.next - b.next)[0];
      if (!due) break;
      now = due.next;
      due.next += due.ms;
      due.fn();
    }
    now = end;
  };
  /** Advance in 50 ms steps until a recorder stop is queued; return when. */
  const advanceUntilStop = (limit) => {
    for (let t = 0; t < limit; t += 50) { step(50); if (stopEvents.length) return now; }
    return null;
  };
  if (scenario !== 'no-analyser') {
    win.AudioContext = class {
      constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
      createAnalyser() {
        return {
          fftSize: 2048,
          getFloatTimeDomainData(buf) { buf.fill(Math.pow(10, levelAt(now) / 20)); },
          getByteTimeDomainData(buf) { buf.fill(148); },
        };
      }
      createMediaStreamSource() { return {connect(){}}; }
      createOscillator() { return {type:'', frequency:{value:0}, connect:n => n, start(){}, stop(){}}; }
      createGain() { return {gain:{setValueAtTime(){}, exponentialRampToValueAtTime(){}}, connect:n => n}; }
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
    };
  }
  const track = {stop(){}, addEventListener(){}};
  const stream = {getTracks:()=>[track], getAudioTracks:()=>[track]};
  win.navigator.mediaDevices = {getUserMedia:async()=>stream};
  win.MediaRecorder = class {
    static isTypeSupported(){return true;}
    constructor() { this.state = 'inactive'; this.index = recorders.length; recorders.push(this); }
    start(){this.state = 'recording';}
    stop() {
      assert.equal(this.state, 'recording', 'A cut cannot stop an already stopped recorder');
      this.state = 'inactive';
      stopEvents.push(() => { this.ondataavailable?.({data:new Blob([`clip ${this.index}`])}); this.onstop?.(); });
    }
  };
  const deliverStops = () => { while (stopEvents.length) stopEvents.shift()(); };
  win.fetch = async (url) => {
    assert.match(String(url), /transcribe-audio$/);
    return new Promise(resolve => requests.push({resolve:text => resolve(new Response(JSON.stringify({transcript:text})))}));
  };
  try {
    win.eval(outputFiles[0].text);
    await until(() => win.recorderQa?.state?.supported);
    const qa = win.recorderQa;
    qa.state.start();
    await until(() => recorders.length === 1 && intervals.size > 0);

    if (scenario === 'pause-then-cap') {
      const firstCut = advanceUntilStop(40_000);
      assert.ok(firstCut >= 21_500 && firstCut <= 21_550, `first cut at ${firstCut}, expected at the 21 s breath`);
      deliverStops();
      await until(() => recorders.length === 2);
      const secondStart = now;
      levelAt = () => -20; // nonstop talk from here
      const capCut = advanceUntilStop(40_000);
      assert.ok(Math.abs(capCut - (secondStart + 30_000)) <= 50, `cap cut at ${capCut}, piece started ${secondStart}`);
      deliverStops();
      await until(() => recorders.length === 3);
    } else {
      // No analyser, or the switch off: the 20 s clock, as before.
      const cut = advanceUntilStop(25_000);
      assert.equal(cut, 20_000);
      deliverStops();
      await until(() => recorders.length === 2);
    }
    qa.state.stop();
    deliverStops();
    await until(() => requests.length === recorders.length);
    requests.forEach((r, i) => r.resolve(`piece ${i}`));
    await until(() => qa.finals.length === 1);
    assert.equal(qa.finals[0], requests.map((_, i) => `piece ${i}`).join(' '));
    await until(() => !qa.state.recording);
    assert.equal(intervals.size, 0, 'The pause watch and every timer stop with the take');
    qa.root.unmount();
    passed++;
    console.log(`PASS ${scenario}`);
  } finally { win.close(); }
}
console.log(`${passed} pause-cut recorder scenarios passed; no real microphone or service calls.`);
