/**
 * gclid (+ UTM) pass-through for off-site event-inquiry CTAs.
 *
 * WHY THIS EXISTS
 * Google Ads attribution for event inquiries depends on the Zite / Heyflow
 * inquiry form receiving a *literal* `gclid` URL param. The GA4 cross-domain
 * linker in Base.astro only writes the `_gl` / `_gcl_aw` cookie hand-off —
 * Zite reads neither, so without this the form lands with an empty `gclid`
 * (verified empirically: clean gclid on 0 of 69 inquiries; the id was buried
 * in `_gcl_aw`, unusable by a third-party form). This module is ADDITIVE to
 * the linker, not a replacement: the linker stays for GA4 session stitching;
 * this carries the explicit `gclid` for clean Ads conversion attribution.
 *
 * PATTERN
 *   1. On every page load, capture click-id + UTM params from the landing URL
 *      into sessionStorage — but only when present (never overwrite a real
 *      value with a blank). The params live only on the ad-landing URL; if the
 *      visitor browses to another page before clicking the CTA they'd be lost,
 *      so we persist them for the session.
 *   2. Rewrite every inquiry-destination anchor to carry the stored params,
 *      placed correctly *before* any `#hash` (the URL API handles ordering,
 *      so `event.twistedpin.com/#start` → `event.twistedpin.com/?gclid=…#start`).
 *
 * SCOPE
 * Limited to the event-inquiry hosts. The Roller / TPRS reserve flow has its
 * own conversion tracking where `_gcl_aw` is sufficient (see
 * ConfirmationStep.tsx) — appending to those links isn't needed and is left
 * out to avoid touching a separately-tracked funnel.
 */

const STORAGE_KEY = "tp_attr";

// Click identifiers + UTMs worth forwarding. gbraid / wbraid are gclid's iOS
// app/web equivalents; gad_source is the newer Ads param; fbclid covers Meta
// (the page also runs the Meta pixel). Forwarding extras is harmless — absent
// params are simply skipped.
const FORWARD_PARAMS = [
  "gclid",
  "gbraid",
  "wbraid",
  "gad_source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
];

// Anchors whose href hostname is one of these get the stored params appended.
// Covers both toggle states of PLAN_EVENT_URL (Heyflow OFF / Zite ON).
const INQUIRY_HOSTS = new Set([
  "event.twistedpin.com",
  "twistedevents.zite.so",
]);

function captureParams(): Record<string, string> {
  let stored: Record<string, string> = {};
  try {
    stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    stored = {};
  }

  const incoming = new URLSearchParams(window.location.search);
  let changed = false;
  for (const key of FORWARD_PARAMS) {
    const val = incoming.get(key);
    if (val) {
      stored[key] = val;
      changed = true;
    }
  }
  if (changed) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      /* sessionStorage can throw in private-mode / quota edge cases — the
         in-page links can still be decorated from the captured object below. */
    }
  }
  return stored;
}

function decorateLinks(params: Record<string, string>): void {
  const keys = Object.keys(params);
  if (keys.length === 0) return;

  const anchors = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  anchors.forEach((a) => {
    let url: URL;
    try {
      url = new URL(a.href, window.location.origin);
    } catch {
      return;
    }
    if (!INQUIRY_HOSTS.has(url.hostname)) return;
    for (const key of keys) {
      // Don't clobber a param the link already declares intentionally.
      if (!url.searchParams.has(key)) url.searchParams.set(key, params[key]);
    }
    // URL.toString() keeps the query string before the #hash automatically.
    a.href = url.toString();
  });
}

export function initGclidPassthrough(): void {
  if (typeof window === "undefined") return;
  const params = captureParams();
  // Runs once at module execution (deferred, after DOM parse), decorating the
  // inquiry-host anchors that are server-rendered and present at that instant.
  // Sufficient today: there is no Astro ClientRouter / View Transitions in the
  // repo, so every navigation is a full page load that re-runs this module. If
  // a future CTA is injected by client JS, or View Transitions get adopted,
  // re-invoke decorateLinks(captureParams()) on `astro:page-load` or wire a
  // MutationObserver — otherwise that anchor would ship without the gclid.
  decorateLinks(params);
}
