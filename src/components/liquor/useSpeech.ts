import { useCallback, useEffect, useRef, useState } from "react";

// Thin wrapper over the Web Speech API (SpeechRecognition / webkitSpeechRecognition).
// Browser-native ASR — no audio upload, no LLM. Supported on iOS Safari + Chrome
// (the venue's devices); gracefully reports `supported:false` elsewhere so the UI
// falls back to typing. One-shot: start → single final transcript → onend.

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
