/**
 * Field switches for voice changes under test on a phone.
 *
 * Pause cuts + carry-forward (pauseDetector.ts, voiceCarry.ts) are off by
 * default. Open the count page with `?pausecuts=1` to turn them on for this
 * phone (remembered), and `?pausecuts=0` to turn them off again.
 */
const PAUSE_CUTS_KEY = "lq.pauseCuts";

export function pauseCutsEnabled(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get("pausecuts");
    if (asked === "1") window.localStorage.setItem(PAUSE_CUTS_KEY, "1");
    if (asked === "0") window.localStorage.removeItem(PAUSE_CUTS_KEY);
    return window.localStorage.getItem(PAUSE_CUTS_KEY) === "1";
  } catch {
    return false; // storage blocked: stay on the proven clock
  }
}
