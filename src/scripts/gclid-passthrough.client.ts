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
 *      Anchors present at load are rewritten immediately; ones a client
 *      component renders later are rewritten when clicked.
 *   3. Also carry the visit's first touch: `tp_ref` (the referrer host the
 *      visitor arrived from) and `tp_lp` (the first page they landed on).
 *      Click ids + UTMs only exist when the inbound link was tagged; organic
 *      search, Maps, shares and typed visits carry none, and Zite's own
 *      referrer is our page, so WF1 files most website inquiries as "direct".
 *      Zite stores its full URL in `avery_event.landing_page`, so these land
 *      in the database with no Zite or WF1 change (2026-10-12).
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

// First touch lives in localStorage with a 30-minute idle window (GA4's
// session timeout), not sessionStorage: a page opened in a new tab starts with
// empty sessionStorage and our own page as referrer, which would lose the
// source for exactly the desktop planners who browse in tabs.
const FIRST_TOUCH_KEY = "tp_first_touch";
const FIRST_TOUCH_IDLE_MS = 30 * 60 * 1000;

interface FirstTouch {
  ref: string;
  lp: string;
  seen: number;
}

// "none" = no referrer (typed, bookmark, many apps). "internal" = arrived from
// our own page with no live visit stored (storage cleared or blocked).
function referrerHost(): string {
  if (!document.referrer) return "none";
  try {
    const host = new URL(document.referrer).hostname;
    if (
      host === window.location.hostname ||
      host === "twistedpin.com" ||
      host.endsWith(".twistedpin.com")
    ) {
      return "internal";
    }
    return host || "none";
  } catch {
    return "none";
  }
}

function captureFirstTouch(): Record<string, string> {
  const now = Date.now();
  let touch: FirstTouch | null = null;
  try {
    touch = JSON.parse(localStorage.getItem(FIRST_TOUCH_KEY) || "null");
  } catch {
    touch = null;
  }
  if (!touch || typeof touch.seen !== "number" || now - touch.seen > FIRST_TOUCH_IDLE_MS) {
    touch = { ref: referrerHost(), lp: window.location.pathname, seen: now };
  } else {
    touch.seen = now;
  }
  try {
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
  } catch {
    /* Storage blocked — this page's links still get the first touch below. */
  }
  return { tp_ref: touch.ref, tp_lp: touch.lp };
}

function decorateAnchor(a: HTMLAnchorElement, params: Record<string, string>): void {
  let url: URL;
  try {
    url = new URL(a.href, window.location.origin);
  } catch {
    return;
  }
  if (!INQUIRY_HOSTS.has(url.hostname)) return;
  for (const key of Object.keys(params)) {
    // Don't clobber a param the link already declares intentionally.
    if (!url.searchParams.has(key)) url.searchParams.set(key, params[key]);
  }
  // URL.toString() keeps the query string before the #hash automatically.
  a.href = url.toString();
}

function decorateLinks(params: Record<string, string>): void {
  if (Object.keys(params).length === 0) return;
  document
    .querySelectorAll<HTMLAnchorElement>("a[href]")
    .forEach((a) => decorateAnchor(a, params));
}

export function initGclidPassthrough(): void {
  if (typeof window === "undefined") return;
  const params = { ...captureFirstTouch(), ...captureParams() };
  // Runs once at module execution (deferred, after DOM parse), decorating the
  // inquiry-host anchors that are server-rendered and present at that instant.
  // There is no Astro ClientRouter / View Transitions in the repo, so every
  // navigation is a full page load that re-runs this module.
  decorateLinks(params);
  // Anchors rendered later by client JS — the /reserve booking wizard's
  // "plan your event" links (CUSTOM_EVENT_URL in src/tprs/pageConfig.ts) are
  // drawn by React after this runs — get decorated at click time instead.
  // Capture phase, so the href is set before the browser follows it. Before
  // 2026-11-05 those inquiries arrived with no tp_ref, UTMs or gclid.
  if (Object.keys(params).length === 0) return;
  const decorateOnActivate = (e: Event) => {
    const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (a instanceof HTMLAnchorElement) decorateAnchor(a, params);
  };
  document.addEventListener("click", decorateOnActivate, true);
  // Middle-click / "open in new tab" fires auxclick, not click.
  document.addEventListener("auxclick", decorateOnActivate, true);
}
