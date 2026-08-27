/**
 * Venue-local date math + weekly recurrence for the events calendar.
 *
 * Everything here reads America/Chicago, never the build server's zone
 * (Vercel builds in UTC). Extracted from /upcoming-events.astro so the
 * DST behaviour can actually be exercised — run
 * `node scripts/check-recurrence.mjs` after touching any of it.
 *
 * THE TRAP this module exists to avoid: you cannot step weekly
 * occurrences by `+7 * 24h`. Central Time shifts twice inside a
 * September→May season (CDT→CST the first Sunday of November, back the
 * second Sunday of March), so fixed-millisecond stepping drifts the
 * wall clock by an hour — and once it drifts across midnight the
 * occurrence lands on the WRONG WEEKDAY (a 7pm Thursday silently
 * becomes a 6pm Wednesday for the whole winter). Occurrences are
 * therefore stepped as CALENDAR DATES, and each one is re-anchored to
 * its local wall time through the zone.
 *
 * Same family of bug as the phantom two-day range that shipped on
 * Paint Night (2026-08-14), and the same reason /leagues emits a bare
 * `startTime` under `scheduleTimezone` rather than a fixed offset.
 */

export const VENUE_TZ = "America/Chicago";

const ctPartsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: VENUE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar-date parts of `d` as they read at the venue. */
export function ctParts(d: Date) {
  const parts = ctPartsFmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Venue-local calendar date as "YYYY-MM-DD" — the key all recurrence compares on. */
export function ctDateKey(d: Date) {
  const p = ctParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

const ctWallFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: VENUE_TZ,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});

function wallParts(d: Date) {
  const parts = ctWallFmt.formatToParts(d);
  const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  // hour12:false formats midnight as "24" in some ICU versions — normalize.
  return {
    year: n("year"), month: n("month"), day: n("day"),
    hour: n("hour") % 24, minute: n("minute"), second: n("second"),
  };
}

/** Offset (ms) between the venue's wall clock and UTC at instant `d`. */
export function ctOffsetMs(d: Date) {
  const w = wallParts(d);
  const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asIfUtc - d.getTime();
}

/** The instant at which `dateKey` reads `h:m` on the venue's wall clock. */
export function ctInstant(dateKey: string, h: number, m: number) {
  const [Y, M, D] = dateKey.split("-").map(Number);
  const naive = Date.UTC(Y, M - 1, D, h, m);
  // Two passes: guess using the offset at the naive instant, then correct
  // using the offset at that guess. Converges everywhere except the one
  // ambiguous hour of a fall-back, which no venue event occupies (the
  // repeat hour is 1–2am; the latest close is 1am).
  let ts = naive - ctOffsetMs(new Date(naive));
  ts = naive - ctOffsetMs(new Date(ts));
  return new Date(ts);
}

/** Venue-local wall clock as bare "HH:MM" — for schema.org `Schedule` times. */
export function ctClock(d: Date) {
  const w = wallParts(d);
  return `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
}

/** Advance a "YYYY-MM-DD" key by whole days. UTC has no DST, so this is safe. */
export function addDaysKey(dateKey: string, days: number) {
  const [Y, M, D] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(Y, M - 1, D + days)).toISOString().slice(0, 10);
}

const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: VENUE_TZ });
/** Weekday name of `d` as it reads at the venue ("Thursday"). */
export const weekdayOf = (d: Date) => weekdayFmt.format(d);

/**
 * One night that happens to cross midnight (Black Wednesday karaoke,
 * 9pm–1am) vs. a genuine multi-day run. Both end on a later calendar
 * date, but only the second is a date RANGE — rendering "25–26 NOV"
 * for a single evening reads as a two-day event.
 *
 * Rule: ends on the immediately-following venue-local day, at or before
 * 5am. Comfortably past the 1am close, and well clear of a real second
 * day, which would start in the morning.
 */
export function isOneLateNight(start: Date, end: Date) {
  if (ctDateKey(end) !== addDaysKey(ctDateKey(start), 1)) return false;
  return end.getTime() < ctInstant(ctDateKey(end), 5, 0).getTime();
}

export type RecurringSpec = {
  frequency: "weekly";
  /** Last possible occurrence, inclusive. YAML hands this over as UTC midnight. */
  until: Date;
  /** Dark nights as venue-local "YYYY-MM-DD". */
  skip: string[];
};

export type EventTiming = {
  start: Date;
  end?: Date;
  recurring?: RecurringSpec;
};

export type Occurrence = { start: Date; end?: Date };

/**
 * The occurrence an event should be listed under, relative to `now`:
 * itself for a one-shot, or the next non-skipped night for a recurring
 * one. `null` = nothing left (season over, or the one-shot has passed).
 *
 * A night already in progress still counts as tonight — the cutoff is
 * the occurrence's END, matching the one-shot rule.
 */
export function resolveOccurrence(data: EventTiming, now: Date): Occurrence | null {
  const rec = data.recurring;
  if (!rec) {
    const cutoff = data.end ?? data.start;
    return cutoff >= now ? { start: data.start, end: data.end } : null;
  }
  // Wall-clock time-of-day and duration come from the first occurrence and
  // are held constant; only the calendar date advances. Holding the WALL
  // time (not the UTC instant) is what keeps 7pm at 7pm across a DST shift.
  const w = wallParts(data.start);
  const durationMs = data.end ? data.end.getTime() - data.start.getTime() : 0;
  // `until` is a bare YYYY-MM-DD in the markdown, so YAML parses it to UTC
  // midnight — read it back in UTC, NOT in CT (which would rewind it a day
  // and drop the season's last night).
  const untilKey = rec.until.toISOString().slice(0, 10);
  const skip = new Set(rec.skip);

  let key = ctDateKey(data.start);
  // ~38 occurrences in the longest season here; the bound is a runaway
  // stop, not a real limit (520 weeks = 10 years).
  for (let i = 0; i < 520 && key <= untilKey; i++, key = addDaysKey(key, 7)) {
    if (skip.has(key)) continue;
    const start = ctInstant(key, w.hour, w.minute);
    const end = durationMs ? new Date(start.getTime() + durationMs) : undefined;
    if ((end ?? start) >= now) return { start, end };
  }
  return null;
}

const skipLabelFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: VENUE_TZ,
});

/**
 * Skipped nights that are still ahead and inside the lookahead window —
 * the ones worth warning people about on the card. Returns display
 * labels ("Oct 22"), already sorted.
 */
export function upcomingSkips(data: EventTiming, now: Date, lookaheadCutoff: Date) {
  const rec = data.recurring;
  if (!rec) return [];
  const todayKey = ctDateKey(now);
  const cutoffKey = ctDateKey(lookaheadCutoff);
  return rec.skip
    .filter((k) => k >= todayKey && k <= cutoffKey)
    .sort()
    .map((k) => skipLabelFmt.format(ctInstant(k, 12, 0)));
}
