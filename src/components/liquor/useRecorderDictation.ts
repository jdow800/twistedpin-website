import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio, BarApiError } from "./api";
import { useDictation, type DictationState } from "./useSpeech";

// MediaRecorder-based dictation: records ONE stream for the whole take and
// ships the audio to the server (Deepgram) for transcription, instead of the
// browser's Web Speech recognizer.
//
// Why the recognizer had to go: on Android it runs one session per utterance,
// releasing and re-acquiring the mic on EVERY pause. A Bluetooth headset gets
// torn between A2DP and SCO on each of those (the audible connect chirp), the
// ~1s route switch eats the first words after each pause — and a page-held
// keepalive stream can't fix it, because Android gives the mic to the
// foreground app and the recognizer goes deaf (verified live 2026-07-27).
// MediaRecorder holds the mic ONCE: SCO comes up at Record, stays up, drops at
// Stop. The Beats mic works the way it should.
//
// Incremental processing: the recorder is ROTATED every ~60s on the same
// stream (stream never released — rotation doesn't touch the mic route). Each
// segment is a standalone playable clip that uploads for transcription
// immediately, so a 4-minute count is mostly transcribed before the counter
// taps Stop; only the last segment (~1-2s of server time) remains. Segment
// texts join in order. The trade: a word spoken exactly across a rotation
// boundary can split. Boundaries are 60s apart and counts are naturally pausey,
// so it's rare — and the review sheet surfaces anything mangled.
//
// No live transcript by design (owner call 2026-07-27): the joined text
// appears per-segment (~every 60s), not per-word.

const SEGMENT_MS = 60_000;
// Opus at 32 kbps is transparent for speech and keeps a 60s segment ~240 KB —
// comfortably inside the ~4.5 MB proxy body cap even for an unrotated take.
const AUDIO_BPS = 32_000;

// What the server accepts (mirrors AUDIO_CONTENT_TYPES in tprs admin/bar.ts).
const SERVER_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"] as const;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

/** The bare container type the server enum accepts, from a recorder mimeType. */
function serverContentType(mime: string): (typeof SERVER_TYPES)[number] {
  const base = mime.split(";")[0].trim().toLowerCase();
  return (SERVER_TYPES as readonly string[]).includes(base)
    ? (base as (typeof SERVER_TYPES)[number])
    : "audio/webm";
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000; // String.fromCharCode(...whole buffer) overflows the arg stack
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
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

/** Pull the server's friendly message out of a failed transcription call. */
function friendlyError(e: unknown): string {
  if (e instanceof BarApiError && typeof e.body === "string") {
    try {
      const msg = (JSON.parse(e.body) as { message?: string }).message;
      if (msg) return msg;
    } catch {
      /* body wasn't JSON */
    }
  }
  return "transcription failed";
}

export interface RecorderDictationOptions {
  /** Keyterm bias for the transcriber: liquor SKU names vs recent keg names. */
  vocabulary: "liquor" | "kegs";
}

type Segment = { text: string | null; failed: boolean };

export function useRecorderDictation(
  onFinal?: (transcript: string) => void,
  opts: RecorderDictationOptions = { vocabulary: "liquor" },
) {
  const [state, setState] = useState<DictationState>({
    supported: false,
    recording: false,
    transcript: "",
    interim: "",
    error: null,
    seconds: 0,
  });
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wantRef = useRef(false); // true while the user intends to record (drives rotation vs finish)
  const abortingRef = useRef(false); // unmount — tear down without firing onFinal
  const finishedRef = useRef(false); // finish() runs exactly once per take
  const segmentsRef = useRef<Segment[]>([]);
  const uploadsRef = useRef<Promise<void>[]>([]);
  const errMsgRef = useRef<string | null>(null); // last server failure message, for the error line
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>("");
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const vocabRef = useRef(opts.vocabulary);
  vocabRef.current = opts.vocabulary;

  useEffect(() => {
    const mime = navigator.mediaDevices?.getUserMedia ? pickMimeType() : null;
    if (mime != null) {
      mimeRef.current = mime;
      setState((s) => ({ ...s, supported: true }));
    }
    return () => {
      abortingRef.current = true;
      wantRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (rotateRef.current) clearInterval(rotateRef.current);
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      } catch {
        /* ignore */
      }
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const joined = () =>
    segmentsRef.current
      .map((s) => s.text ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

  /** Upload one segment for transcription; retries once (bar wifi blips). */
  const launchUpload = (blob: Blob, idx: number) => {
    const seg: Segment = { text: null, failed: false };
    segmentsRef.current[idx] = seg;
    const p = (async () => {
      const b64 = await blobToBase64(blob);
      const contentType = serverContentType(mimeRef.current);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          seg.text = await transcribeAudio(contentType, b64, vocabRef.current);
          if (!abortingRef.current) setState((s) => ({ ...s, transcript: joined() }));
          return;
        } catch (e) {
          if (attempt === 1) {
            seg.failed = true;
            errMsgRef.current = friendlyError(e);
          }
        }
      }
    })();
    uploadsRef.current.push(p);
  };

  /** Close out the take: release the mic, wait for uploads, deliver the text. */
  const finish = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (rotateRef.current) clearInterval(rotateRef.current);
    stopStream(streamRef.current); // SCO drops here — the ONE release per take
    streamRef.current = null;
    recorderRef.current = null;
    await Promise.allSettled(uploadsRef.current);
    if (abortingRef.current) return;
    const text = joined();
    const anyFailed = segmentsRef.current.some((s) => s.failed);
    setState((s) => ({
      ...s,
      recording: false,
      interim: "",
      transcript: text,
      // Partial loss is surfaced but the surviving text still delivers — the
      // review sheet shows what came through, and the counter fills gaps there
      // rather than re-speaking four minutes.
      error: anyFailed ? (errMsgRef.current ?? "transcription failed") : s.error,
    }));
    onFinalRef.current?.(text); // "" no-ops in every caller
  };

  /** One recorder per segment, all on the SAME stream (mic route never drops). */
  const startSegment = (stream: MediaStream) => {
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mimeRef.current, audioBitsPerSecond: AUDIO_BPS });
    } catch {
      wantRef.current = false;
      setState((s) => ({ ...s, error: "audio-capture" }));
      void finish();
      return;
    }
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onerror = () => {
      // Mid-take recorder death (device yanked, OS reclaim): keep what we have.
      wantRef.current = false;
      setState((s) => ({ ...s, error: "audio-capture" }));
      try {
        if (rec.state !== "inactive") rec.stop(); // drives onstop → finish
      } catch {
        void finish();
      }
    };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: mimeRef.current });
      if (blob.size > 0 && !abortingRef.current) {
        launchUpload(blob, segmentsRef.current.length);
      }
      if (wantRef.current) startSegment(stream); // rotation — same stream, no route change
      else void finish();
    };
    recorderRef.current = rec;
    rec.start();
  };

  const start = useCallback(() => {
    if (!mimeRef.current) return;
    segmentsRef.current = [];
    uploadsRef.current = [];
    errMsgRef.current = null;
    finishedRef.current = false;
    wantRef.current = true;
    setState((s) => ({ ...s, recording: true, transcript: "", interim: "", error: null, seconds: 0 }));
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (!wantRef.current) {
          // Stopped (or unmounted) while the permission prompt was up.
          stopStream(stream);
          void finish();
          return;
        }
        streamRef.current = stream;
        startSegment(stream);
        rotateRef.current = setInterval(() => {
          const r = recorderRef.current;
          // stop() → onstop uploads the segment and starts the next one.
          if (wantRef.current && r && r.state === "recording") r.stop();
        }, SEGMENT_MS);
      })
      .catch((e: unknown) => {
        wantRef.current = false;
        const name = (e as { name?: string } | null)?.name;
        setState((s) => ({
          ...s,
          recording: false,
          error: name === "NotAllowedError" || name === "SecurityError" ? "not-allowed" : "audio-capture",
        }));
        finishedRef.current = true; // nothing to deliver; don't fire onFinal
      });
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setState((s) => ({ ...s, seconds: s.seconds + 1 })), 1000);
  }, []);

  /** Stop recording. Transcript arrives via `onFinal` once uploads settle. */
  const stop = useCallback(() => {
    wantRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rotateRef.current) {
      clearInterval(rotateRef.current);
      rotateRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop(); // final segment → onstop → finish()
    } else if (!rec) {
      // Recorder never existed (stop during the permission prompt) — finish()
      // is guarded, safe even if getUserMedia later resolves and calls it too.
      void finish();
    }
    // rec exists but is inactive: a rotation's stop() fired and its onstop
    // hasn't run yet. Do NOT finish() here — that would race ahead of the
    // pending segment's upload and deliver a transcript missing its last
    // minute. The in-flight onstop sees wantRef=false and finishes for us.
  }, []);

  return { ...state, start, stop };
}

// Which engine handles dictation. Recorder is the default wherever it works;
// Web Speech remains as the no-deploy escape hatch and the fallback for
// browsers without MediaRecorder:
//   localStorage.setItem('tp.voiceEngine', 'webspeech')  → old behavior
//   localStorage.removeItem('tp.voiceEngine')            → recorder
function preferWebSpeech(): boolean {
  try {
    return localStorage.getItem("tp.voiceEngine") === "webspeech";
  } catch {
    return false;
  }
}

/**
 * Drop-in replacement for `useDictation` — same state shape, same onFinal
 * contract. Instantiates both engines (hooks can't be conditional) but only
 * the returned one is ever started, so only it fires onFinal.
 */
export function useVoiceDictation(
  onFinal?: (transcript: string) => void,
  opts: RecorderDictationOptions = { vocabulary: "liquor" },
) {
  const recorder = useRecorderDictation(onFinal, opts);
  const webSpeech = useDictation(onFinal);
  return preferWebSpeech() || !recorder.supported ? webSpeech : recorder;
}
