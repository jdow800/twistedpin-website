/**
 * Field switches for voice changes.
 *
 * Pause cuts + carry-forward (pauseDetector.ts, voiceCarry.ts) are ON by
 * default since Jon's Android test (2026-10-02). Opening the count page with
 * `?pausecuts=0` turns them off for that phone, the emergency fallback to the
 * 20 s clock, and `?pausecuts=1` turns them back on.
 *
 * The liquor seam join (voiceCarry.ts joinSeam: "Belvedere." | "Two Tito's
 * twenty" is sent as "Belvedere, Two." + "Tito's twenty") is ON by default
 * since 2026-10-16. `?seamjoin=0` turns it off for that phone, back to the
 * plain join, and `?seamjoin=1` turns it back on.
 */
const PAUSE_CUTS_KEY = "lq.pauseCuts";
const SEAM_JOIN_KEY = "lq.seamJoin";

function fieldSwitch(param: string, key: string): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get(param);
    if (asked === "0") window.localStorage.setItem(key, "0");
    if (asked === "1") window.localStorage.removeItem(key);
    return window.localStorage.getItem(key) !== "0";
  } catch {
    return true; // storage blocked: the default
  }
}

export function pauseCutsEnabled(): boolean {
  return fieldSwitch("pausecuts", PAUSE_CUTS_KEY);
}

export function seamJoinEnabled(): boolean {
  return fieldSwitch("seamjoin", SEAM_JOIN_KEY);
}

/**
 * The soft pre-submit summary (2026-10-17, the 10/16 count review): guessed
 * numbers and bottles not accounted for open the pre-submit screen on their
 * own. ON by default. `?softcheck=0` turns it off for that phone (the soft
 * block is hidden and never opens the dialog; everything else is as before),
 * and `?softcheck=1` turns it back on. Website merges go straight to
 * production, so this is the per-phone rollback.
 */
const SOFT_CHECK_KEY = "lq.softCheck";

export function softCheckEnabled(): boolean {
  return fieldSwitch("softcheck", SOFT_CHECK_KEY);
}
