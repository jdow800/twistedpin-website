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
 * Parse our human label format ("3pm", "11am", "12pm", "11:30am", "1am")
 * into minutes since midnight. Returns null on unparseable input.
 *
 * "12am" = 0, "12pm" = 720, "1pm" = 780, "11pm" = 1380.
 */
export function parseTimeLabel(label: string): number | null {
  const m = label.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const period = m[3];
  if (h === 12) h = 0;
  if (period === "pm") h += 12;
  return h * 60 + min;
}

export interface DayWindow {
  /** Minutes since midnight of open. */
  openMinutes: number;
  /** Minutes since midnight of close. >= 1440 if close wraps past midnight. */
  closeMinutes: number;
  /** Short open label e.g. "3pm" / "11am" — used in "Opens {x}" copy. */
  openLabel: string;
  /** Short close label e.g. "11pm" / "1am" — used in "until {x}" copy. */
  closeLabel: string;
}

/** Static-data window for a given day, parsed to minutes. Used as fallback when live hours aren't available. */
export function staticWindow(day: DayKey): DayWindow | null {
  const h = HOURS[day];
  const openMinutes = parseTimeLabel(h.open);
  const closeMinutesRaw = parseTimeLabel(h.close);
  if (openMinutes === null || closeMinutesRaw === null) return null;
  // Close wraps past midnight when close < open (e.g. open 2pm, close 1am).
  const closeMinutes = closeMinutesRaw <= openMinutes ? closeMinutesRaw + 24 * 60 : closeMinutesRaw;
  return { openMinutes, closeMinutes, openLabel: h.open, closeLabel: h.close };
}

/**
 * Current minute-of-day in venue-local time (Central). Used by isOpenNow
 * so build-server UTC doesn't misalign with venue local time.
 *
 * Returns minutes since midnight in America/Chicago. Note this can be ahead
 * of or behind UTC depending on DST.
 */
export function nowMinutesCentral(now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // en-US with hour12: false returns "HH:MM" (or "24:MM" at midnight on some Node versions).
  const parts = fmt.format(now).match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return now.getHours() * 60 + now.getMinutes();
  const h = parseInt(parts[1], 10) % 24;
  const m = parseInt(parts[2], 10);
  return h * 60 + m;
}

/**
 * Is the venue open right now?
 *
 * Handles past-midnight close: if today's window has closeMinutes >= 1440
 * AND the current time is between 0 and (closeMinutes - 1440), the venue
 * is still open from yesterday's window. Caller passes today's window AND
 * yesterday's window for that case.
 */
export function isOpenNow(
  todayWindow: DayWindow | null,
  yesterdayWindow: DayWindow | null,
  nowMin: number = nowMinutesCentral(),
): boolean {
  // Yesterday's window may still be open into early morning (e.g. Fri 2pm – 1am
  // means Saturday at 12:30am is still inside Friday's window).
  if (yesterdayWindow && yesterdayWindow.closeMinutes >= 24 * 60) {
    const carryClose = yesterdayWindow.closeMinutes - 24 * 60;
    if (nowMin < carryClose) return true;
  }
  if (!todayWindow) return false;
  return nowMin >= todayWindow.openMinutes && nowMin < todayWindow.closeMinutes;
}

/** Previous day's key — used to check if last night's late-close window is still active. */
export function previousDay(day: DayKey): DayKey {
  const order: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const i = order.indexOf(day);
  return order[(i - 1 + 7) % 7];
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
