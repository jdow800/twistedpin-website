// Google Places API — pulls live hours for the venue's Google Business Profile.
// Server-side only; never import from client.
//
// Pattern matches gotab.ts / untappd.ts: graceful fallback when env vars
// aren't configured. Build runs without the integration in local dev (no
// .env keys), Vercel runs with it once GOOGLE_MAPS_API_KEY +
// GOOGLE_PLACE_ID are set in the project settings.
//
// Daily 4am cron rebuild keeps the cached hours fresh — fresh enough for
// the use case (holiday hours updates land within ~24h).

import type { DayKey } from "../data/hours";

const PLACES_URL = "https://places.googleapis.com/v1/places";
const FETCH_TIMEOUT_MS = 8_000;

export interface LiveDayHours {
  /** Display string e.g. "3pm – 10pm", or "Closed" if the day is closed. */
  label: string;
  /** True if the venue is closed on this day (per Google). */
  closed: boolean;
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

interface PlacesRegularOpeningHours {
  periods?: PlacesPeriod[];
  weekdayDescriptions?: string[];
}

interface PlacesResponse {
  regularOpeningHours?: PlacesRegularOpeningHours;
}

/** Format hour/minute as "3pm" or "11:30am". Lowercase, no leading zero. */
function formatTime(hour: number, minute: number): string {
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const period = hour < 12 ? "am" : "pm";
  const minStr = minute > 0 ? `:${String(minute).padStart(2, "0")}` : "";
  return `${h12}${minStr}${period}`;
}

/**
 * Pull live weekly hours from Google Places. Returns null when the API
 * key or place ID isn't configured — caller falls back to static data
 * in src/data/hours.ts. Returns null on any fetch error too (logged,
 * non-fatal).
 */
export async function getLiveHours(): Promise<LiveHours | null> {
  const apiKey = import.meta.env.GOOGLE_MAPS_API_KEY;
  const placeId = import.meta.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    // Silent in production builds (don't spam Vercel logs); useful in
    // local dev to know why hours are static.
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
        "X-Goog-FieldMask": "regularOpeningHours",
      },
      signal: t.signal,
    });
    if (!res.ok) {
      console.warn(`[google-hours] HTTP ${res.status} — falling back to static`);
      return null;
    }
    const data = (await res.json()) as PlacesResponse;
    const periods = data.regularOpeningHours?.periods ?? [];
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
    out[k] = { label: "Closed", closed: true };
  }
  for (const p of periods) {
    if (!p.open) continue;
    const key = DAY_KEYS_BY_GOOGLE_INDEX[p.open.day];
    const openLabel = formatTime(p.open.hour, p.open.minute);
    const closeLabel = p.close
      ? formatTime(p.close.hour, p.close.minute)
      : "open 24h";
    out[key] = {
      label: `${openLabel} – ${closeLabel}`,
      closed: false,
    };
  }
  return out;
}
