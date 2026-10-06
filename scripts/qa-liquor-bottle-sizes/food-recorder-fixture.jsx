import {useState} from 'react';

// Only the recorder boundary is controlled. CountFood, its API client, React
// state, review controls, shelf navigation and saving run unchanged.
export function useVoiceDictation(onFinal, opts) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const [seconds, setSeconds] = useState(0);
  window.foodQa.recorder = {
    options: opts,
    segment(text, index) { opts.onSegment?.(text, index); },
    fail(index) { opts.onSegmentFailed?.(index); },
    preview(text, elapsed = 0) { setTranscript(text); setSeconds(elapsed); },
    finish(text, message = null) { setError(message); setTranscript(text); setRecording(false); onFinal(text); },
  };
  return {
    supported: true, recording, armed: true, level: 0.5, quiet: false,
    metering: true, transcript, interim: '', error, seconds,
    start() { setError(null); setTranscript(''); setSeconds(0); setRecording(true); },
    // The real recorder remains recording=true until uploads finish. This
    // lets the fixture move shelves after Stop but before final delivery.
    stop() {},
  };
}
