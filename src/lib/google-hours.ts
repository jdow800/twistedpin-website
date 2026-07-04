// Google Places API — pulls live hours + review rating/count for the
// venue's Google Business Profile. Server-side only; never import from
// client.
//
// Pattern matches gotab.ts / untappd.ts: graceful fallback when env vars
// aren't configured. Build runs without the integration in local dev (no
// .env keys), Vercel runs with it once GOOGLE_MAPS_API_KEY +
// GOOGLE_PLACE_ID are set in the project settings.
//
// Cost discipline (see 2026-05-13 decisions): we read all live Places
// data from a daily snapshot committed to src/data/live-hours.json. The
// cron route fetches Places ONCE per day (single request, multi-field
// mask) and commits the snapshot via GitHub API — every build that day
// imports the JSON instead of hitting Places. Module-level promise memo
// is the belt-and-suspenders fallback: if the snapshot is missing/stale
// and we DO hit the API, all callers in the same build process share a
// single fetch.
//
// Field mask: currentOpeningHours,regularOpeningHours,rating,userRatingCount.
// All four fields ship in the same Places Pro SKU — adding rating +
// userRatingCount in 2026-05-18 cost zero additional API spend (same
// daily request, just expanded field mask).
//
// currentOpeningHours preference: same Pro tier SKU as regularOpeningHours,
// but currentOpeningHours overlays Google Business Profile's holiday +
// special-day edits onto the next 7 days. When ops marks Christmas closed
// in Business Profile, the website reflects it on the next build.

import type { DayKey } from "../data/hours";
import cachedHoursFile from "../data/live-hours.json";

const PLACES_URL = "https://places.googleapis.com/v1/places";
const FETCH_TIMEOUT_MS = 8_000;

export interface LiveDayHours {
  /** Display string e.g. "3pm – 10pm", or "Closed" if the day is closed. */
  label: string;
  /** True if the venue is closed on this day (per Google). */
  closed: boolean;
  /** Open time as minutes since midnight in venue local time. 0 when closed. */
  openMinutes: number;
  /** Close time as minutes since midnight. >= 1440 if close wraps past midnight (e.g. Fri 1am). 0 when closed. */
  closeMinutes: number;
  /** Short open label e.g. "3pm" / "11am". Empty string when closed. */
  openLabel: string;
  /** Short close label e.g. "10pm" / "1am". Empty string when closed. */
  closeLabel: string;
}

export type LiveHours = Record<DayKey, LiveDayHours>;

// Map Google's 0-indexed periods (0 = Sunday) to our DayKey order.
const DAY_KEYS_BY_GOOGLE_INDEX: DayKey[] = [
  "sun", "mon", "tue", "wed", "thu", "fri", "sat",
];

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(new Error(`timeout ${ms}ms`)), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

interface PlacesPeriod {
  open?: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

interface PlacesOpeningHours {
  periods?: PlacesPeriod[];
  weekdayDescriptions?: string[];
}

interface PlacesResponse {
  /** 7-day rolling window with holiday/special-day overlays applied. Preferred. */
  currentOpeningHours?: PlacesOpeningHours;
  /** Standard weekly schedule. Used as fallback if currentOpeningHours is missing. */
  regularOpeningHours?: PlacesOpeningHours;
  /** Aggregate rating value, e.g. 4.5. Same Places Pro SKU as opening hours. */
  rating?: number;
  /** Total number of user ratings/reviews. */
  userRatingCount?: number;
}

/** Format hour/minute as "3pm" or "11:30am". Lowercase, no leading zero. */
function formatTime(hour: number, minute: number): string {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const period = hour < 12 ? "am" : "pm";
  const minStr = minute > 0 ? `:${String(minute).padStart(2, "0")}` : "";
  return `${h12}${minStr}${period}`;
}

/** Snapshot file shape — written by the daily cron (see /api/cron/rebuild). */
interface CachedHoursSnapshot {
  /** ISO timestamp of when the cron wrote the snapshot. */
  fetchedAt?: string;
  /** Hours by day, in our normalized shape. */
  hours?: LiveHours;
  /** Aggregate Google review rating value (e.g. 4.5). 2026-05-18 addition. */
  rating?: number;
  /** Total Google review count (e.g. 1142). 2026-05-18 addition. */
  reviewCount?: number;
}

/** Live rating + count returned to consumers (schema.ts, SnapFooter). */
export interface LiveReviews {
  rating: number;
  reviewCount: number;
}

/** Single-fetch return shape — covers both hours and reviews from one API call. */
export interface LivePlacesData {
  hours: LiveHours | null;
  rating: number | null;
  reviewCount: number | null;
}

/**
 * Cache freshness ceiling. Snapshot is rewritten daily by cron — anything
 * older than this falls back to a live fetch. 48h gives one cron-miss of
 * grace before we re-hit the API.
 */
const SNAPSHOT_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

/**
 * Module-level promise memo. Every page that renders during a single
 * build process shares ONE fetch — the previous implementation called
 * getLiveHours() ~70x per build (once per page via SnapFooter + schema)
 * and hit the API each time. See decisions log 2026-05-13.
 *
 * NOTE: this memo covers the full Places fetch (hours + reviews), so
 * getLiveHours() and getLiveReviews() share the same single network call
 * when they BOTH fall through to live fetch. Cost is unchanged from the
 * hours-only era.
 */
let livePlacesPromise: Promise<LivePlacesData> | null = null;

/** Read the committed snapshot. Returns null if it's missing/stale per
 *  SNAPSHOT_STALE_AFTER_MS. Shared by getLiveHours + getLiveReviews. */
function readFreshSnapshot(): CachedHoursSnapshot | null {
  const snap = cachedHoursFile as CachedHoursSnapshot;
  if (!snap.fetchedAt) return null;
  const ageMs = Date.now() - new Date(snap.fetchedAt).getTime();
  if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < SNAPSHOT_STALE_AFTER_MS) {
    return snap;
  }
  if (import.meta.env.DEV) {
    console.warn(`[google-hours] snapshot stale (${Math.round(ageMs / 3.6e6)}h old), falling through to live fetch`);
  }
  return null;
}

/**
 * Pull weekly hours. Read order:
 *   1. Committed snapshot at src/data/live-hours.json (cron-written, ≤24h old)
 *   2. Live Google Places API (memoized — one call per build process max)
 *   3. null → caller falls back to src/data/hours.ts static data
 */
export async function getLiveHours(): Promise<LiveHours | null> {
  const snap = readFreshSnapshot();
  if (snap?.hours) return snap.hours;

  const data = await getMemoizedPlacesFetch();
  return data.hours;
}

/**
 * Pull live Google review rating + count. Read order:
 *   1. Committed snapshot (cron-written, ≤48h old)
 *   2. Live Places fetch (memoized — shared with getLiveHours when both
 *      need to fall through; one network call per build process max)
 *   3. null → caller falls back to GOOGLE_RATING / GOOGLE_REVIEW_COUNT constants
 *
 * Added 2026-05-18. Same daily cron, same API call, same SKU tier — adding
 * rating + userRatingCount to the existing Places field mask cost zero
 * additional API spend.
 */
export async function getLiveReviews(): Promise<LiveReviews | null> {
  const snap = readFreshSnapshot();
  if (snap?.rating != null && snap?.reviewCount != null) {
    return { rating: snap.rating, reviewCount: snap.reviewCount };
  }

  const data = await getMemoizedPlacesFetch();
  if (data.rating == null || data.reviewCount == null) return null;
  return { rating: data.rating, reviewCount: data.reviewCount };
}

/** Memoized single-fetch wrapper — at most one Places API call per build process. */
function getMemoizedPlacesFetch(): Promise<LivePlacesData> {
  if (!livePlacesPromise) {
    livePlacesPromise = fetchLivePlacesData();
  }
  return livePlacesPromise;
}

/**
 * Backward-compat alias for the cron route. Returns just hours so the
 * cron's existing JSON-write shape can keep working while we transition.
 * New code should use fetchLivePlacesData() directly to get reviews too.
 */
export async function fetchLiveHoursFromAPI(): Promise<LiveHours | null> {
  return (await fetchLivePlacesData()).hours;
}

/**
 * Underlying Places API fetch — pulls hours + reviews in a single request.
 * Used by getLiveHours(), getLiveReviews(), and the cron route. Both
 * external callers go through getMemoizedPlacesFetch() to guarantee
 * one-call-per-build cost discipline; the cron is allowed to call this
 * directly because it runs once per day on a dedicated invocation.
 */
export async function fetchLivePlacesData(): Promise<LivePlacesData> {
  const apiKey = import.meta.env.GOOGLE_MAPS_API_KEY;
  const placeId = import.meta.env.GOOGLE_PLACE_ID;

  const empty: LivePlacesData = { hours: null, rating: null, reviewCount: null };

  if (!apiKey || !placeId) {
    if (import.meta.env.DEV) {
      console.warn("[google-hours] skipping — GOOGLE_MAPS_API_KEY / GOOGLE_PLACE_ID not set, falling back to static");
    }
    return empty;
  }

  const t = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${PLACES_URL}/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "currentOpeningHours,regularOpeningHours,rating,userRatingCount",
      },
      signal: t.signal,
    });
    if (!res.ok) {
      console.warn(`[google-hours] HTTP ${res.status} — falling back to static`);
      return empty;
    }
    const data = (await res.json()) as PlacesResponse;
    // Merge currentOpeningHours (holiday-aware, but its rolling 7-day window
    // truncates trailing past-midnight closes to 23:59) with regularOpeningHours
    // (canonical weekly schedule, no window horizon). See mergeHours().
    const currentPeriods = data.currentOpeningHours?.periods ?? [];
    const regularPeriods = data.regularOpeningHours?.periods ?? [];
    return {
      hours: mergeHours(currentPeriods, regularPeriods),
      rating: typeof data.rating === "number" ? data.rating : null,
      reviewCount: typeof data.userRatingCount === "number" ? data.userRatingCount : null,
    };
  } catch (e) {
    console.warn(`[google-hours] fetch failed: ${(e as Error).message}`);
    return empty;
  } finally {
    t.cancel();
  }
}

/**
 * Merge currentOpeningHours with regularOpeningHours into one weekly map.
 *
 * currentOpeningHours is PREFERRED (it overlays Google Business Profile's
 * holiday / special-day edits onto the next 7 days). BUT that window has a
 * hard horizon on BOTH edges, and each edge produces its own artifact for a
 * venue open past midnight:
 *
 * TRAILING edge: any period whose close lands past the end of the rolling
 * 7-day window gets clipped by Google to 23:59 on the open day — e.g. when
 * the cron runs on a Sunday, Saturday is the last day and its real Sun-1am
 * close is reported as "11:59pm". Repaired below via regularOpeningHours
 * (the canonical weekly schedule, no window horizon): when current closes at
 * exactly 23:59 AND the regular schedule for that day genuinely wraps past
 * midnight, restore the regular close (keeping current's open, which may
 * carry a special-day edit).
 *
 * LEADING edge: the window starts at midnight TODAY, so the tail of
 * YESTERDAY's past-midnight period falls inside the window and Google
 * reports it as a truncated period opening at 12:00am today (e.g. Friday's
 * 11am–1am hours surface as "Saturday 12am–1am"). On a normal week today's
 * real period overwrites it in periodsToHours, but when today is specially
 * CLOSED (holiday edit) the phantom tail is today's ONLY period — it erased
 * the July 4 2026 closure and Roy announced "open 12am–1am" on a closed
 * holiday. stripLeadingSpillover() drops these before conversion.
 *
 * Returns null only when neither source has periods (caller falls back to
 * static src/data/hours.ts).
 */
function mergeHours(
  currentPeriods: PlacesPeriod[],
  regularPeriods: PlacesPeriod[],
): LiveHours | null {
  currentPeriods = stripLeadingSpillover(currentPeriods, regularPeriods);
  const current = currentPeriods.length > 0 ? periodsToHours(currentPeriods) : null;
  const regular = regularPeriods.length > 0 ? periodsToHours(regularPeriods) : null;
  if (!current) return regular;
  if (!regular) return current;

  for (const k of DAY_KEYS_BY_GOOGLE_INDEX) {
    const c = current[k];
    const r = regular[k];
    // 23:59 (1439) is Google's window-truncation sentinel — never a real
    // closing time. If the regular schedule wraps past midnight that day,
    // current was clipped; restore the genuine close.
    const looksTruncated = !c.closed && c.closeMinutes === 24 * 60 - 1;
    const regularWraps = !r.closed && r.closeMinutes >= 24 * 60;
    if (looksTruncated && regularWraps) {
      current[k] = {
        ...c,
        closeMinutes: r.closeMinutes,
        closeLabel: r.closeLabel,
        label: `${c.openLabel} – ${r.closeLabel}`,
      };
    }
  }
  return current;
}

/**
 * Drop leading-edge window artifacts from currentOpeningHours periods.
 *
 * A period that opens at exactly 12:00am and closes later the SAME day is
 * never a real schedule entry for this venue — it's the window-clipped tail
 * of the previous day's past-midnight close. Confirm by checking that some
 * period (regular or current) on the previous weekday wraps past midnight to
 * at least that close time; only then drop it. A genuine midnight-opening
 * schedule (never overlapped by the prior day) is left alone.
 */
function stripLeadingSpillover(
  currentPeriods: PlacesPeriod[],
  regularPeriods: PlacesPeriod[],
): PlacesPeriod[] {
  return currentPeriods.filter((p) => {
    if (!p.open || !p.close) return true;
    if (p.open.hour !== 0 || p.open.minute !== 0) return true;
    if (p.close.day !== p.open.day) return true;
    const prevDay = (p.open.day + 6) % 7;
    const closeMin = p.close.hour * 60 + p.close.minute;
    const isPrevDayTail = (q: PlacesPeriod) =>
      q.open != null &&
      q.close != null &&
      q.open.day === prevDay &&
      q.close.day === p.open!.day &&
      q.close.hour * 60 + q.close.minute >= closeMin;
    return !(regularPeriods.some(isPrevDayTail) || currentPeriods.some(isPrevDayTail));
  });
}

/** Convert Google's periods array into our weekday-keyed map. */
function periodsToHours(periods: PlacesPeriod[]): LiveHours {
  const out = {} as LiveHours;
  // Initialize all days as closed; populate from periods.
  for (const k of DAY_KEYS_BY_GOOGLE_INDEX) {
    out[k] = {
      label: "Closed",
      closed: true,
      openMinutes: 0,
      closeMinutes: 0,
      openLabel: "",
      closeLabel: "",
    };
  }
  for (const p of periods) {
    if (!p.open) continue;
    const key = DAY_KEYS_BY_GOOGLE_INDEX[p.open.day];
    const openLabel = formatTime(p.open.hour, p.open.minute);
    const closeLabel = p.close
      ? formatTime(p.close.hour, p.close.minute)
      : "open 24h";
    const openMinutes = p.open.hour * 60 + p.open.minute;
    let closeMinutes = p.close ? p.close.hour * 60 + p.close.minute : 24 * 60;
    // If close day is a different weekday than open (or close time numerically
    // earlier than open), the close wraps past midnight — bump by 24h so
    // isOpenNow can compare cleanly.
    if (p.close && (p.close.day !== p.open.day || closeMinutes <= openMinutes)) {
      closeMinutes += 24 * 60;
    }
    out[key] = {
      label: `${openLabel} – ${closeLabel}`,
      closed: false,
      openMinutes,
      closeMinutes,
      openLabel,
      closeLabel,
    };
  }
  return out;
}
