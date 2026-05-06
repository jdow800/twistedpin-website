/**
 * Weekly hours — single source of truth.
 *
 * Drives the SnapToday module on the homepage AND eventually the
 * SnapFooter "Open today" line (currently hardcoded to "until 11pm").
 * When ops wants to change hours, this file is the only edit.
 *
 * Holiday closures aren't modelled here yet; the SnapToday module
 * carries a "Hours subject to change. Check Google →" link that
 * covers the long tail without our needing a holiday calendar.
 */
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DayMeta {
  key: DayKey;
  full: string;   // "Wednesday"
  short: string;  // "Wed"
  abbr3: string;  // "WED" (uppercase, fixed-width for the pill nav)
}

export const DAYS: DayMeta[] = [
  { key: "mon", full: "Monday",    short: "Mon", abbr3: "MON" },
  { key: "tue", full: "Tuesday",   short: "Tue", abbr3: "TUE" },
  { key: "wed", full: "Wednesday", short: "Wed", abbr3: "WED" },
  { key: "thu", full: "Thursday",  short: "Thu", abbr3: "THU" },
  { key: "fri", full: "Friday",    short: "Fri", abbr3: "FRI" },
  { key: "sat", full: "Saturday",  short: "Sat", abbr3: "SAT" },
  { key: "sun", full: "Sunday",    short: "Sun", abbr3: "SUN" },
];

export const HOURS: Record<DayKey, { open: string; close: string }> = {
  mon: { open: "3pm",  close: "10pm" },
  tue: { open: "3pm",  close: "10pm" },
  wed: { open: "3pm",  close: "10pm" },
  thu: { open: "3pm",  close: "10pm" },
  fri: { open: "2pm",  close: "1am"  },
  sat: { open: "11am", close: "1am"  },
  sun: { open: "12pm", close: "10pm" },
};

/** Display string e.g. "3pm – 10pm". En-dash, not hyphen. */
export function hoursLabel(day: DayKey): string {
  const h = HOURS[day];
  return `${h.open} – ${h.close}`;
}

/**
 * JS Date.getDay() returns 0 (Sun) through 6 (Sat). Map to our
 * DayKey order so getDay() can index this array directly.
 */
const DAY_KEYS_BY_INDEX: DayKey[] = [
  "sun", "mon", "tue", "wed", "thu", "fri", "sat",
];

/** Today's day key in the venue's local timezone (Central). */
export function todayKey(now: Date = new Date()): DayKey {
  // Use Central Time to compute "today" — site is Plainfield, IL.
  // Vercel build servers run UTC so 11pm Central Tuesday = 4–5am UTC
  // Wednesday; without this conversion the build would call it
  // "Wednesday" while it's still Tuesday in-venue.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  });
  const wkShort = fmt.format(now); // "Mon", "Tue", …
  const map: Record<string, DayKey> = {
    Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed",
    Thu: "thu", Fri: "fri", Sat: "sat",
  };
  return map[wkShort] ?? DAY_KEYS_BY_INDEX[now.getDay()];
}
