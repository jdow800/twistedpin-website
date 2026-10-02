/**
 * Pause-aware rotation for voice counts. The recorder used to cut a new piece
 * every 20 s by the clock, and on 2026-10-02 17 of 24 cuts split a bottle from
 * its number ("Frangelico," | "three"), so the bottle defaulted to 1 and the
 * number was lost or shifted the next piece. This cuts at the first pause after
 * MIN_PIECE_MS instead, and always by CAP_MS, so the pieces still process while
 * the counter talks.
 *
 * A pause is measured against the counter's own loudness, because a bar is
 * never quiet enough for a fixed threshold: a frame is quiet when it sits less
 * than DIP of the way from the recent floor (10th percentile of the last
 * WINDOW_MS) to the recent speech level (90th percentile). PAUSE_MS of quiet is
 * a pause. Replayed on the 10-02 takes, a pause came within about 2 s of the
 * 20 s mark in every take (Alcohol Pricing/incidents/2026-10-02/stt-bakeoff).
 *
 * Pure and causal: it only knows the frames it has been given, so the browser
 * recorder and the offline replay run the same code.
 */
export const MIN_PIECE_MS = 20_000;
export const CAP_MS = 30_000;
/** Long enough to skip the breath inside "point … eight". Replayed with the
 *  carry-forward on the 10-02 takes (Deepgram, formatting off): 350 ms got 104
 *  of 112 products right, 500 ms 108, 600 ms 105. At 350 one cut fell inside
 *  "Bacardi, point | eight", and the next piece lost two brand names. */
export const PAUSE_MS = 500;
export const FRAME_MS = 50;
const WINDOW_MS = 6_000;
const DIP = 0.35;
/** Below this spread there is no telling speech from room: wait for the cap. */
const MIN_RANGE_DB = 6;

export type CutReason = "pause" | "cap";

export interface PauseDetector {
  /** One loudness frame, in dB, taken at `at` (ms). */
  push(db: number, at: number): void;
  /** Should the piece that started at `pieceStart` end at `at`? */
  shouldCut(at: number, pieceStart: number): CutReason | null;
  /** A cut happened; the next piece needs a pause of its own. */
  reset(): void;
}

export function createPauseDetector(opts: { pauseMs?: number; minPieceMs?: number; capMs?: number } = {}): PauseDetector {
  const pauseMs = opts.pauseMs ?? PAUSE_MS, minPieceMs = opts.minPieceMs ?? MIN_PIECE_MS, capMs = opts.capMs ?? CAP_MS;
  const frames: { at: number; db: number }[] = [];
  let quietSince: number | null = null;
  return {
    push(db, at) {
      frames.push({ at, db });
      while (frames.length > 1 && frames[0]!.at < at - WINDOW_MS) frames.shift();
      const sorted = frames.map((f) => f.db).sort((a, b) => a - b);
      const floor = sorted[Math.floor(0.1 * (sorted.length - 1))]!;
      const speech = sorted[Math.floor(0.9 * (sorted.length - 1))]!;
      const quiet = speech - floor >= MIN_RANGE_DB && db < floor + DIP * (speech - floor);
      if (!quiet) quietSince = null;
      else if (quietSince == null) quietSince = at;
    },
    shouldCut(at, pieceStart) {
      const length = at - pieceStart;
      if (length >= capMs) return "cap";
      if (length >= minPieceMs && quietSince != null && at - quietSince >= pauseMs) return "pause";
      return null;
    },
    reset() {
      quietSince = null;
    },
  };
}

/** RMS loudness of one window of samples, in dB (silence floors at -120). */
export function frameDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? Math.max(-120, 20 * Math.log10(rms)) : -120;
}
