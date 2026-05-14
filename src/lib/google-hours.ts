// Google Places API — pulls live hours for the venue's Google Business Profile.
// Server-side only; never import from client.
//
// Pattern matches gotab.ts / untappd.ts: graceful fallback when env vars
// aren't configured. Build runs without the integration in local dev (no
// .env keys), Vercel runs with it once GOOGLE_MAPS_API_KEY +
// GOOGLE_PLACE_ID are set in the project settings.
//
// Cost discipline (see 2026-05-13 decisions): we read hours from a daily
// snapshot committed to src/data/live-hours.json. The cron route fetches
// Places once per day and commits the snapshot via GitHub API — every
// build that day imports the JSON instead of hitting Places. Module-level
// promise memo is the belt-and-suspenders fallback: if the snapshot is
// missing/stale and we DO hit the API, all callers in the same build
// process share a single fetch.
//
// Field mask: currentOpeningHours (NOT regularOpeningHours). Same Pro tier
// SKU, but currentOpeningHours overlays Google Business Profile's holiday
// + special-day edits onto the next 7 days. Means: when ops mark Christmas
// closed in Business Profile, the website reflects it on the next build.

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
 */
let liveHoursPromise: Promise<LiveHours | null> | null = null;

/**
 * Pull weekly hours. Read order:
 *   1. Committed snapshot at src/data/live-hours.json (cron-written, ≤24h old)
 *   2. Live Google Places API (memoized — one call per build process max)
 *   3. null → caller falls back to src/data/hours.ts static data
 */
export function getLiveHours(): Promise<LiveHours | null> {
  // 1. Try the committed snapshot first — zero API cost.
  const snap = cachedHoursFile as CachedHoursSnapshot;
  if (snap.hours && snap.fetchedAt) {
    const ageMs = Date.now() - new Date(snap.fetchedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < SNAPSHOT_STALE_AFTER_MS) {
      return Promise.resolve(snap.hours);
    }
    if (import.meta.env.DEV) {
      console.warn(`[google-hours] snapshot stale (${Math.round(ageMs / 3.6e6)}h old), falling through to live fetch`);
    }
  }

  // 2. Memoized live fetch — at most one network call per build process.
  if (!liveHoursPromise) {
    liveHoursPromise = fetchLiveHoursFromAPI();
  }
  return liveHoursPromise;
}

/** Underlying Places API fetch — used by getLiveHours() and the cron route. */
export async function fetchLiveHoursFromAPI(): Promise<LiveHours | null> {
  const apiKey = import.meta.env.GOOGLE_MAPS_API_KEY;
  const placeId = import.meta.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    if (import.meta.env.DEV) {
      console.warn("[google-hours] skipping — GOOGLE_MAPS_API_KEY / GOOGLE_PLACE_ID not set, falling back to static hours");
    }
    return null;
  }

  const t = withTimeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${PLACES_URL}/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "currentOpeningHours,regularOpeningHours",
      },
      signal: t.signal,
    });
    if (!res.ok) {
      console.warn(`[google-hours] HTTP ${res.status} — falling back to static`);
      return null;
    }
    const data = (await res.json()) as PlacesResponse;
    // Prefer currentOpeningHours (holiday-aware) over regularOpeningHours.
    const periods =
      data.currentOpeningHours?.periods ?? data.regularOpeningHours?.periods ?? [];
    if (periods.length === 0) {
      console.warn("[google-hours] no periods returned — falling back to static");
      return null;
    }
    return periodsToHours(periods);
  } catch (e) {
    console.warn(`[google-hours] fetch failed: ${(e as Error).message}`);
    return null;
  } finally {
    t.cancel();
  }
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
