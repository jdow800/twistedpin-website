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
  const finalRef = useRef(""); // accumulated final transcript (source of truth)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortingRef = useRef(false); // set during unmount so the teardown abort doesn't fire onFinal
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const w = window as any;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setState((s) => ({ ...s, supported: false }));
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt: string = res?.[0]?.transcript ?? "";
        if (res?.isFinal) finalRef.current += txt + " ";
        else interim += txt;
      }
      setState((s) => ({ ...s, transcript: finalRef.current, interim }));
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
      if (wantRef.current) {
        try {
          rec.start();
        } catch {
          /* transient double-start — ignore; next onend retries */
        }
      } else {
        // Truly ended (this onend runs AFTER the final onresult), so finalRef now
        // includes the last words spoken before stop.
        setState((s) => ({ ...s, recording: false, interim: "" }));
        onFinalRef.current?.(finalRef.current.trim());
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
    finalRef.current = "";
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
