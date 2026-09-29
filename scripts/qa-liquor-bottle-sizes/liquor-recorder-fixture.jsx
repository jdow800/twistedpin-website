import {useState} from 'react';

// Only the recorder boundary is controlled. CountLiquor, its API client, React
// state, review sheet, shelf tiles and saving run unchanged.
export function useVoiceDictation(onFinal, opts) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  window.liquorQa.recorder = {
    options: opts,
    segment(text, index) { opts.onSegment?.(text, index); },
    finish(text, message = null) { setError(message); setTranscript(text); setRecording(false); onFinal(text); },
  };
  return {
    supported: true, recording, armed: true, level: 0.5, quiet: false,
    metering: true, transcript, interim: '', error, seconds: 0,
    start() { setError(null); setTranscript(''); setRecording(true); },
    // The real recorder stays recording=true until its uploads finish. This
    // lets the fixture change shelves after Stop but before final delivery.
    stop() {},
  };
}
