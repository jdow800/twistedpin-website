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
    fail(index) { opts.onSegmentFailed?.(index); },
    finish(text, message = null) { setError(message); setTranscript(text); setRecording(false); onFinal(text); },
  };
  // ?silent-start: an engine whose start() never reports recording (the Web
  // Speech fallback can no-op), so the screen's own flags are all that is left.
  const silentStart = new URL(location.href).searchParams.has('silent-start');
  return {
    supported: true, recording, armed: true, level: 0.5, quiet: false,
    metering: true, transcript, interim: '', error, seconds: 0,
    start() { if (silentStart) return; setError(null); setTranscript(''); setRecording(true); },
    // The real recorder stays recording=true until its uploads finish. This
    // lets the fixture change shelves after Stop but before final delivery.
    stop() {},
  };
}
