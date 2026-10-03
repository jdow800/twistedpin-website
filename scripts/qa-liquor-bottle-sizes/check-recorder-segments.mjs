// Real recorder hook and API client. Only the clock, microphone and server are synthetic.
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
    const options = {...window.recorderOptions};
    if (window.processSegments) options.onSegment = (text,index) => qa.segments.push({text,index});
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
  for (let i = 0; i < 200; i++) { if (predicate()) return; await pause(); }
  throw new Error('Recorder condition timed out');
}

let passed = 0;
for (const flow of [
  {name:'liquor', options:{vocabulary:'liquor'}, interval:20_000, incremental:true},
  {name:'food', options:{vocabulary:'liquor',scope:{section:'food'}}, interval:20_000, incremental:true},
  {name:'kegs', options:{vocabulary:'kegs'}, interval:60_000, incremental:false},
]) {
  for (const scenario of ['during-recording', 'stop-during-rotation', 'short-take']) {
    const dom = new JSDOM('<div id="root"></div>', {
      url:'http://localhost', runScripts:'outside-only', pretendToBeVisual:true,
    });
    const win = dom.window;
    const recorders = [], stopEvents = [], requests = [], intervals = new Map(), takeIds = new Set();
    let now = 0, nextTimer = 1, micStarts = 0, micStops = 0;
    win.recorderOptions = flow.options;
    win.processSegments = flow.incremental;
    win.Blob = Blob;
    win.Response = Response;
    win.Date.now = () => now;
    win.setInterval = (fn, ms) => {
      const id = nextTimer++;
      intervals.set(id, {fn, ms, next:now + ms});
      return id;
    };
    win.clearInterval = id => intervals.delete(id);
    const advance = ms => {
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
    const track = {stop(){micStops++;}, addEventListener(){}};
    const stream = {getTracks:()=>[track], getAudioTracks:()=>[track]};
    win.navigator.mediaDevices = {getUserMedia:async()=>{micStarts++; return stream;}};
    win.MediaRecorder = class {
      static isTypeSupported(){return true;}
      constructor(input) {
        assert.equal(input, stream, 'Every segment must reuse the same microphone stream');
        this.state = 'inactive';
        this.index = recorders.length;
        recorders.push(this);
      }
      start(){this.state = 'recording';}
      stop() {
        assert.equal(this.state, 'recording', 'A rotation cannot stop an already stopped recorder');
        this.state = 'inactive';
        stopEvents.push(() => {
          this.ondataavailable?.({data:new Blob([`synthetic clip ${this.index}`])});
          this.onstop?.();
        });
      }
    };
    const deliverStops = () => { while(stopEvents.length) stopEvents.shift()(); };
    win.fetch = async (url, init) => {
      assert.match(String(url), /transcribe-audio$/);
      const body = JSON.parse(init.body);
      assert.equal(body.vocabulary, flow.options.vocabulary);
      assert.equal(body.section, flow.options.scope?.section);
      assert.equal(Buffer.from(body.data, 'base64').toString(), `synthetic clip ${requests.length}`);
      // Each clip names its take and its place in it (TPRS 0200).
      assert.equal(body.piece, requests.length);
      assert.match(body.takeId ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      takeIds.add(body.takeId);
      return new Promise(resolve => requests.push({
        resolve:text => resolve(new Response(JSON.stringify({transcript:text}))),
      }));
    };
    try {
      win.eval(outputFiles[0].text);
      await until(() => win.recorderQa?.state?.supported);
      const qa = win.recorderQa;
      qa.state.start();
      await until(() => recorders.length === 1);
      advance(flow.interval - 1);
      assert.equal(stopEvents.length, 0);
      assert.equal(requests.length, 0);

      if (scenario === 'short-take') {
        qa.state.stop();
        deliverStops();
        await until(() => requests.length === 1);
        requests[0].resolve('short count');
        await until(() => qa.finals.length === 1);
        assert.equal(qa.finals[0], 'short count');
      } else {
        advance(1);
        assert.equal(stopEvents.length, 1, 'The interval must start processing without a user Stop');
        if (scenario === 'stop-during-rotation') {
          qa.state.stop();
          assert.equal(qa.finals.length, 0, 'Stop must wait for the queued final audio event');
          deliverStops();
          await until(() => requests.length === 1);
          requests[0].resolve('boundary count');
          await until(() => qa.finals.length === 1);
          assert.equal(qa.finals[0], 'boundary count');
          assert.equal(recorders.length, 1, 'Stop must prevent another segment starting');
        } else {
          deliverStops();
          await until(() => requests.length === 1);
          assert.equal(micStops, 0, 'Rotation must keep the microphone live');
          advance(flow.interval);
          deliverStops();
          await until(() => requests.length === 2);
          requests[1].resolve('second count');
          await until(() => qa.state.transcript === 'second count');
          assert.equal(qa.state.recording, true);
          assert.equal(qa.finals.length, 0);
          assert.equal(qa.segments.length, flow.incremental ? 1 : 0);
          if (flow.incremental) assert.equal(qa.segments[0].index, 1);
          advance(5_000);
          qa.state.stop();
          deliverStops();
          await until(() => requests.length === 3);
          requests[2].resolve('last count');
          await until(() => qa.state.transcript.includes('last count'));
          assert.equal(qa.finals.length, 0, 'Stop must also wait for an older unfinished request');
          requests[0].resolve('first count');
          await until(() => qa.finals.length === 1);
          assert.equal(qa.finals[0], 'first count second count last count');
          assert.equal(qa.segments.length, flow.incremental ? 3 : 0);
          if (flow.incremental) assert.deepEqual(Array.from(qa.segments, s => s.index), [1,2,0]);
        }
      }
      await until(() => !qa.state.recording);
      assert.equal(micStarts, 1);
      assert.equal(micStops, 1);
      assert.equal(intervals.size, 0, 'All recording timers must stop at the end');
      assert.equal(qa.state.error, null);
      assert.equal(takeIds.size, 1, 'every piece of one take carries the same take id');
      qa.root.unmount();
      assert.equal(micStops, 1);
      passed++;
      console.log(`PASS ${flow.name}: ${scenario}`);
    } finally { win.close(); }
  }
}
console.log(`${passed} recorder interval scenarios passed; no real microphone or service calls.`);
