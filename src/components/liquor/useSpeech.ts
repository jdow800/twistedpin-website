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
  /** Audio is actually flowing. On the recorder engine this goes true only
   *  once the mic route (Bluetooth SCO!) is delivering real samples — the
   *  window between tap and armed is where spoken words get LOST. Web Speech
   *  has no such gap worth surfacing; it reports true whenever recording. */
  armed: boolean;
  /** Recorder engine only: live input level 0..1 for the meter. */
  level: number;
  /** Recorder engine only: the mic has heard nothing for a while mid-take —
   *  the 2026-07-28 failure mode (Bluetooth feed goes quiet, recording keeps
   *  "running", words are lost silently). */
  quiet: boolean;
  /** True when level/quiet are real signals (recorder engine). */
  metering: boolean;
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
    armed: true, // Web Speech engine: no arming gap worth surfacing
    level: 0,
    quiet: false,
    metering: false, // Web Speech gives no audio-level access
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
      setState((s) => ({ ...s, transcript: fullTranscript(), interim }));
    };
    rec.onerror = (e: any) => {
      const err = String(e?.error ?? "");
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
        try {
          rec.start();
        } catch {
          /* transient double-start — ignore; next onend retries */
        }
      } else {
        // Truly ended (this onend runs AFTER the final onresult), so the banked
        // text includes the last words spoken before stop.
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
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    baseRef.current = "";
    sessionFinalRef.current = "";
    wantRef.current = true;
    setState((s) => ({ ...s, recording: true, transcript: "", interim: "", error: null, seconds: 0 }));
    try {
      rec.start();
    } catch {
      /* already started — ignore */
    }
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setState((s) => ({ ...s, seconds: s.seconds + 1 })), 1000);
  }, []);

  /** Stop recording. The final transcript arrives via `onFinal` (see docstring). */
  const stop = useCallback(() => {
    wantRef.current = false;
    const rec = recRef.current;
    try {
      rec?.stop();
    } catch {
      /* ignore */
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // recording flips false + onFinal fires from the recognizer's onend.
  }, []);

  return { ...state, start, stop };
}
