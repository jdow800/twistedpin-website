/**
 * External destination URLs. Single source of truth for booking /
 * inquiry CTAs across the site.
 *
 * AVERY toggle (event-inquiry AI sales agent on Zite):
 *   ON  → Zite events platform (twistedevents.zite.so)
 *   OFF → Heyflow form (event.twistedpin.com/#start) — current default
 *
 * AI sales agent (Avery on Zite) is a theory under test. The pattern is
 * "turn it on, evaluate, turn it off to troubleshoot" — so the toggle
 * needs to be cheap and reversible. One-file flip handles 19 CTAs.
 *
 * To swap every "Plan an Event" CTA on the site in one push:
 *   change PLAN_EVENT_URL below from AVERY_OFF_URL to AVERY_ON_URL
 *   (or back), commit, push. Vercel auto-deploys in ~90s.
 *
 * Long-form blog/llms.txt copy is NOT swapped automatically — those
 * are narrative prose with low toggle frequency. Find/replace the
 * inline URLs in src/content/blog/*.md and public/llms.txt if a
 * permanent platform switch lands.
 *
 * Hoisted from per-file constants 2026-05-12 (the third use rule of
 * thumb triggered — ZITE_URL was repeated across 19 files).
 */

const AVERY_ON_URL = "https://twistedevents.zite.so/";
const AVERY_OFF_URL = "https://event.twistedpin.com/#start";

export const PLAN_EVENT_URL = AVERY_OFF_URL;
