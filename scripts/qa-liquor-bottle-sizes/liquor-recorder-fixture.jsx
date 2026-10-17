import {useRef, useState} from 'react';

// Only the recorder boundary is controlled. CountLiquor, its API client, React
// state, review sheet, shelf tiles and saving run unchanged.
let takes = 0;
export function useVoiceDictation(onFinal, opts) {
  const [recording, setRecording] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  // Like the real recorder: one take id per Start, kept after Stop. A fixed
  // pattern instead of crypto, so jsdom and Chromium agree.
  const takeIdRef = useRef(null);
  window.liquorQa.recorder = {
    options: opts,
    takeId() { return takeIdRef.current; },
    segment(text, index) { opts.onSegment?.(text, index); },
    fail(index) { opts.onSegmentFailed?.(index); },
    preview(text, elapsed = 0) { setTranscript(text); setSeconds(elapsed); },
    finish(text, message = null) { setError(message); setTranscript(text); setCapturing(false); setRecording(false); onFinal(text); },
    endCapture() { setCapturing(false); },
  };
  // ?silent-start: an engine whose start() never reports recording (the Web
  // Speech fallback can no-op), so the screen's own flags are all that is left.
  const params = new URL(location.href).searchParams;
  const silentStart = params.has('silent-start');
  // ?webspeech: the Web Speech engine, which has no take id at all.
  const webSpeech = params.has('webspeech');
  return {
    supported: true, recording, capturing, armed: true, level: 0.5, quiet: false,
    metering: true, transcript, interim: '', error, seconds,
    start() { if (silentStart) return; takeIdRef.current = webSpeech ? null : `00000000-0000-4000-8000-${String(++takes).padStart(12, '0')}`;
      setError(null); setTranscript(''); setSeconds(0); setCapturing(true); setRecording(true); },
    // The real recorder stays recording=true until its uploads finish. This
    // lets the fixture change shelves after Stop but before final delivery.
    stop() { setCapturing(false); },
    ...(webSpeech ? {} : {currentTakeId: () => takeIdRef.current}),
  };
}
