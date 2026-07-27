import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API wrappers (SpeechRecognition / webkitSpeechRecognition) — browser-
// native ASR, no audio upload, no LLM on the client. Two shapes:
//   • useSpeech    — ONE-SHOT: tap → single final transcript → onend. (keg count)
//   • useDictation — CONTINUOUS run-on: hold a session open across pauses
//     (restart-on-end), accumulate the transcript, expose an elapsed timer. The
//     accumulated text is sent to the server for catalog-aware extraction. (liquor)
// Supported on Android Chrome (the venue's devices) + desktop Chrome; iOS Safari
// support is patchy, so both report `supported:false` gracefully → type instead.

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Bluetooth mic keepalive ─────────────────────────────────────────────────
// Each recognizer session opens the mic and closes it again, and on Android we
// run one session per utterance (see `rec.continuous` below), so a Bluetooth
// headset gets torn between profiles on EVERY pause: A2DP (media) → SCO (call,
// the only profile with a mic) → back. The headset plays its connect tone each
// way — that's the "plugged/unplugged" chirping — and the ~1s route switch eats
// the first word or two after each pause.
//
// Fix: hold ONE getUserMedia track open for the whole dictation. The input route
// (and therefore SCO) stays up across the restarts, so the profile switch happens
// once per recording instead of once per pause.
//
// ORDER IS LOAD-BEARING. Android 10+ gives the mic to the MOST RECENT capturer
// and feeds silence to the older one. The keepalive must be acquired BEFORE the
// recognizer starts, so the recognizer is always the newer capture and keeps
// getting real audio; our stream is the one silenced, which costs nothing — we
// never read its samples, we only need the route held open. Acquiring it late
// (after the recognizer is running) would invert that and deafen recognition,
// which is why a slow getUserMedia is dropped rather than used (see `startRec`).
//
// Escape hatch, no deploy required: `localStorage.setItem('tp.micKeepalive','off')`
// in the browser console disables the hold and restores the old behavior.
const KEEPALIVE_PREF = "tp.micKeepalive";
const KEEPALIVE_TIMEOUT_MS = 1500;
// ~3 silent recognizer sessions ≈ 20s of hearing nothing at all (see the onend
// watchdog). Generous on purpose: tapping record and walking to the shelf before
// speaking is normal, and the cost of tripping early is only the old chirping.
const DEAF_SESSIONS_BEFORE_GIVING_UP = 3;

function keepaliveEnabled(): boolean {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    return localStorage.getItem(KEEPALIVE_PREF) !== "off";
  } catch {
    return true; // storage blocked — default on
  }
}

function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  for (const t of stream.getTracks()) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
}

export interface SpeechState {
  supported: boolean;
  listening: boolean;
  error: string | null;
}

export function useSpeech(onResult: (transcript: string) => void) {
  const [state, setState] = useState<SpeechState>({
    supported: false,
    listening: false,
    error: null,
  });
  const recRef = useRef<any>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setState((s) => ({ ...s, supported: false }));
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const t: string = e?.results?.[0]?.[0]?.transcript ?? "";
      if (t) onResultRef.current(t);
    };
    rec.onerror = (e: any) =>
      setState((s) => ({ ...s, error: String(e?.error ?? "speech error"), listening: false }));
    rec.onend = () => setState((s) => ({ ...s, listening: false }));
    recRef.current = rec;
    setState((s) => ({ ...s, supported: true }));
    return () => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.start();
      setState((s) => ({ ...s, listening: true, error: null }));
    } catch {
      /* already started — ignore */
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
    setState((s) => ({ ...s, listening: false }));
  }, []);

  return { ...state, start, stop };
}

export interface DictationState {
  supported: boolean;
  recording: boolean;
  transcript: string; // accumulated FINAL results
  interim: string; // in-flight partial (not yet final)
  error: string | null;
  seconds: number; // elapsed while recording
}

/**
 * Continuous dictation for run-on inventory. Keeps the recognizer alive across
 * the silences Android Chrome ends a session on (restart-on-`onend` while the
 * user still wants to record), so a counter can talk out a whole shelf.
 *
 * `onFinal(transcript)` fires when recording truly ENDS (manual stop or the
 * caller's cap-triggered stop) — NOT on the restart-on-silence ends. It's a
 * callback, not `stop()`'s return value, on purpose: Web Speech emits the final
 * result for the last-spoken words asynchronously right before `onend`, so a
 * synchronous return would drop the bottle said just before tapping Stop. The
 * caller enforces the hard cap by watching `seconds` and calling `stop()`.
 */
export function useDictation(onFinal?: (transcript: string) => void) {
  const [state, setState] = useState<DictationState>({
    supported: false,
    recording: false,
    transcript: "",
    interim: "",
    error: null,
    seconds: 0,
  });
  const recRef = useRef<any>(null);
  const wantRef = useRef(false); // true while we intend to keep recording (drives restart-on-end)
  // Transcript accumulation is split in two so Android Chrome's result re-delivery
  // can't duplicate text. Android re-fires `onresult` with the SAME results again
  // (growing snapshots, unreliable resultIndex), so appending deltas (`final +=`)
  // stacks each snapshot — "okay / okay let's see / okay let's see looks like…".
  // Instead we REBUILD the current session's transcript from the full results
  // list every event (idempotent — re-delivery yields the same string), and bank
  // it into `baseRef` only when a session ends (`e.results` resets on the
  // restart-on-silence, so banked text must live outside the session snapshot).
  const baseRef = useRef(""); // text finalized in PREVIOUS recognizer sessions (across restarts)
  const sessionFinalRef = useRef(""); // full final snapshot of the CURRENT session (rebuilt each event)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortingRef = useRef(false); // set during unmount so the teardown abort doesn't fire onFinal
  const streamRef = useRef<MediaStream | null>(null); // Bluetooth keepalive hold (see header)
  const recRunningRef = useRef(false); // recognizer has been started — too late to take the mic
  const keepaliveBrokeRef = useRef(false); // a mic hold once starved the recognizer; don't retry it
  const deafSessionsRef = useRef(0); // consecutive recognizer sessions that heard NOTHING
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const fullTranscript = () =>
    `${baseRef.current}${sessionFinalRef.current}`.replace(/\s+/g, " ").trim();

  useEffect(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setState((s) => ({ ...s, supported: false }));
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    // Android Chrome's continuous mode is notoriously buggy: mid-utterance it
    // adds each growing interim snapshot as a NEW result slot (instead of
    // replacing), so any accumulation staircases ("okay / okay let's see /
    // okay let's see looks like…"). The battle-tested workaround is
    // continuous=false there — each utterance is its own session delivering ONE
    // cumulative result, and our restart-on-onend (already required for
    // silence) keeps the recording rolling. Desktop Chrome's continuous mode
    // is well-behaved; keep it (fewer restart gaps).
    const isAndroid = /android/i.test(navigator.userAgent);
    rec.continuous = !isAndroid;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      // Rebuild from index 0 (NOT resultIndex): replace, never append. For the
      // in-flight interim, use ONLY the LAST non-final slot — earlier non-final
      // slots on Android are stale snapshots of the same words, and
      // concatenating them is the 3x-duplication bug.
      let fin = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const txt: string = res?.[0]?.transcript ?? "";
        if (res?.isFinal) fin += txt + " ";
        else interim = txt;
      }
      sessionFinalRef.current = fin;
      deafSessionsRef.current = 0; // audio is reaching the recognizer
      setState((s) => ({ ...s, transcript: fullTranscript(), interim }));
    };
    rec.onerror = (e: any) => {
      const err = String(e?.error ?? "");
      // 'audio-capture' with a keepalive held is the one failure the mic hold can
      // itself cause (the OS handed our stream the mic and starved the
      // recognizer). Drop the hold and don't take it again this mount — the
      // onend restart then runs bare, i.e. exactly the old behavior. Chirping
      // headset beats a recognizer that hears nothing.
      if (err === "audio-capture" && streamRef.current) {
        keepaliveBrokeRef.current = true;
        stopStream(streamRef.current);
        streamRef.current = null;
        return; // the restart-on-end will recover; don't surface it as a fault
      }
      // 'no-speech'/'aborted' fire during normal pauses — the onend restart covers
      // them; only surface a real fault (not-allowed, audio-capture, network, …).
      if (err && err !== "no-speech" && err !== "aborted") {
        setState((s) => ({ ...s, error: err }));
      }
    };
    rec.onend = () => {
      if (abortingRef.current) return; // unmount teardown — don't restart or fire onFinal
      // The session is over either way — bank its final snapshot before the
      // recognizer resets `e.results` on the next start.
      if (sessionFinalRef.current) {
        baseRef.current = `${baseRef.current}${sessionFinalRef.current}`;
        sessionFinalRef.current = "";
      }
      if (wantRef.current) {
        // Watchdog for the mic hold's silent failure mode: if the OS gave OUR
        // stream the mic instead of the recognizer, there's no error event — the
        // recognizer just hears silence forever while the user talks. Nothing
        // captured for the WHOLE recording across several sessions means that,
        // not a normal pause (a pause always has banked text behind it), so drop
        // the hold and let the next session run bare.
        if (!baseRef.current) {
          deafSessionsRef.current += 1;
          if (deafSessionsRef.current >= DEAF_SESSIONS_BEFORE_GIVING_UP && streamRef.current) {
            keepaliveBrokeRef.current = true;
            stopStream(streamRef.current);
            streamRef.current = null;
          }
        }
        try {
          rec.start();
        } catch {
          /* transient double-start — ignore; next onend retries */
        }
      } else {
        // Truly ended (this onend runs AFTER the final onresult), so the banked
        // text includes the last words spoken before stop. Release the mic hold
        // HERE rather than in stop(): the recognizer delivers its last result
        // between those two moments, and dropping the route mid-delivery is the
        // very truncation this hold exists to prevent.
        recRunningRef.current = false;
        stopStream(streamRef.current);
        streamRef.current = null;
        setState((s) => ({ ...s, recording: false, interim: "" }));
        onFinalRef.current?.(fullTranscript());
      }
    };
    recRef.current = rec;
    setState((s) => ({ ...s, supported: true }));
    return () => {
      abortingRef.current = true;
      wantRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      // onend won't run the ended-branch after an abort, so the hold is released
      // here or it leaks a live mic (green dot) for the rest of the session.
      recRunningRef.current = false;
      stopStream(streamRef.current);
      streamRef.current = null;
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    baseRef.current = "";
    sessionFinalRef.current = "";
    deafSessionsRef.current = 0;
    wantRef.current = true;
    setState((s) => ({ ...s, recording: true, transcript: "", interim: "", error: null, seconds: 0 }));

    const startRec = () => {
      if (!wantRef.current) return; // stopped while the mic hold was resolving
      recRunningRef.current = true;
      try {
        rec.start();
      } catch {
        /* already started — ignore */
      }
    };

    if (!keepaliveEnabled() || keepaliveBrokeRef.current) {
      startRec();
    } else {
      // Bounded: a hung permission prompt or a Bluetooth route that won't come up
      // must not strand the user watching a recording UI that never hears them.
      // Whichever finishes first starts the recognizer; a hold that lands after
      // that is USELESS AND HARMFUL (it would become the newest capture and
      // silence the recognizer), so it gets dropped on arrival.
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        startRec();
      }, KEEPALIVE_TIMEOUT_MS);
      void navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          if (settled || !wantRef.current) {
            stopStream(stream); // too late to help, or the user already stopped
            return;
          }
          settled = true;
          clearTimeout(timeout);
          streamRef.current = stream;
          startRec();
        })
        .catch(() => {
          // Permission denied or no input device. The recognizer prompts for the
          // mic on its own, so let it try — this hold is an optimization, never
          // a prerequisite.
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          startRec();
        });
    }

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setState((s) => ({ ...s, seconds: s.seconds + 1 })), 1000);
  }, []);

  /** Stop recording. The final transcript arrives via `onFinal` (see docstring). */
  const stop = useCallback(() => {
    wantRef.current = false;
    const rec = recRef.current;
    const wasRunning = recRunningRef.current;
    try {
      rec?.stop();
    } catch {
      /* ignore */
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Normally `recording` flips false + onFinal fires from the recognizer's
    // onend. But a stop during the mic-hold acquisition means the recognizer was
    // never started, and stopping an unstarted recognizer fires NO events — so
    // the UI would sit on "recording" forever. Close it out here instead.
    if (!wasRunning) {
      stopStream(streamRef.current);
      streamRef.current = null;
      setState((s) => ({ ...s, recording: false, interim: "" }));
      onFinalRef.current?.(fullTranscript()); // "" — callers no-op on empty
    }
  }, []);

  return { ...state, start, stop };
}
