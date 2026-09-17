import {useState} from 'react';

// Only the recorder boundary is controlled. CountFood, its API client, React
// state, review controls, shelf navigation and saving run unchanged.
export function useVoiceDictation(onFinal, opts) {
  const [recording, setRecording] = useState(false);
  window.foodQa.recorder = {
    options: opts,
    segment(text, index) { opts.onSegment?.(text, index); },
    finish(text) { setRecording(false); onFinal(text); },
  };
  return {
    supported: true, recording, armed: true, level: 0.5, quiet: false,
    metering: true, transcript: '', interim: '', error: null, seconds: 0,
    start() { setRecording(true); },
    // The real recorder remains recording=true until uploads finish. This
    // lets the fixture move shelves after Stop but before final delivery.
    stop() {},
  };
}
