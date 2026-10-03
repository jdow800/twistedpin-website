/**
 * Field switches for voice changes.
 *
 * Pause cuts + carry-forward (pauseDetector.ts, voiceCarry.ts) are ON by
 * default since Jon's Android test (2026-10-02). Opening the count page with
 * `?pausecuts=0` turns them off for that phone, the emergency fallback to the
 * 20 s clock, and `?pausecuts=1` turns them back on.
 */
const PAUSE_CUTS_KEY = "lq.pauseCuts";

export function pauseCutsEnabled(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get("pausecuts");
    if (asked === "0") window.localStorage.setItem(PAUSE_CUTS_KEY, "0");
    if (asked === "1") window.localStorage.removeItem(PAUSE_CUTS_KEY);
    return window.localStorage.getItem(PAUSE_CUTS_KEY) !== "0";
  } catch {
    return true; // storage blocked: the default
  }
}
