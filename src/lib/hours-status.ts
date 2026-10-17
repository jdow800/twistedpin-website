/**
 * Footer open/closed status: pure functions, no Astro and no DOM.
 *
 * Why this exists (2026-10-17): the footer used to compute "Open Now" /
 * "Closed · opens 11am" in its frontmatter, so the answer was frozen at build
 * time. Pages are static and the cron rebuild runs once a day at 4am, so by
 * mid-morning every page said "Closed" while the venue was open (live check
 * 11:30am Saturday). The build now emits only a neutral weekly-hours line
 * (`weekHoursSummary`) plus the week's hours as JSON; the browser computes the
 * real state with `footerHoursStatus` against `centralClock`.
 *
 * Same data and the same rules as /api/hours/ `now.is_open`: the week comes
 * from the daily Google Places snapshot (which carries holiday and
 * special-day edits, a closed day is `null`), a close past midnight is stored
 * as minutes >= 1440, and last night's late close is checked first.
 *
 * Node-testable: scripts/check-footer-hours.mjs imports this file directly.
 */
import { DAYS, previousDay } from "../data/hours.ts";
import type { DayKey, DayWindow } from "../data/hours.ts";

/** One entry per weekday. `null` = closed all day (holiday, special closure). */
export type WeekHours = Record<DayKey, DayWindow | null>;

export type FooterHoursStatus =
  | { state: "closed-today" }
  | { state: "open"; closeLabel: string }
  | { state: "before-open"; openLabel: string }
  | { state: "after-close" };

const DAY_BY_SHORT: Record<string, DayKey> = {
  Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
};

/**
 * The weekday and minute-of-day at the venue (America/Chicago) for an
 * instant, from ONE formatter call so the day and the minute can never
 * disagree across midnight. Null if the runtime can't produce them; callers
 * leave the neutral state in place rather than guess from the device clock.
 */
export function centralClock(now: Date): { day: DayKey; minutes: number } | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return null;
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const day = DAY_BY_SHORT[get("weekday") ?? ""];
  const hour = parseInt(get("hour") ?? "", 10);
  const minute = parseInt(get("minute") ?? "", 10);
  if (!day || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { day, minutes: (hour % 24) * 60 + minute };
}

/**
 * What the footer should say at `nowMin` (minutes since midnight, Central) on
 * `today`. Mirrors isOpenNow() in src/data/hours.ts and adds the wording
 * states: last night's late close, closed all day, before open, after close.
 */
export function footerHoursStatus(week: WeekHours, today: DayKey, nowMin: number): FooterHoursStatus {
  const todayWin = week[today] ?? null;
  const yWin = week[previousDay(today)] ?? null;

  // Yesterday's late-night close still running (Saturday 12:30am inside
  // Friday 2pm – 1am). This wins even if today is a closed day.
  if (yWin && yWin.closeMinutes >= 24 * 60 && nowMin < yWin.closeMinutes - 24 * 60) {
    return { state: "open", closeLabel: yWin.closeLabel };
  }

  if (!todayWin) return { state: "closed-today" };

  if (nowMin >= todayWin.openMinutes && nowMin < todayWin.closeMinutes) {
    return { state: "open", closeLabel: todayWin.closeLabel };
  }
  if (nowMin < todayWin.openMinutes) {
    return { state: "before-open", openLabel: todayWin.openLabel };
  }
  return { state: "after-close" };
}

/**
 * The neutral, state-free line the static HTML carries until the browser
 * computes the real status: "Mon–Wed 3pm–10pm · Thu 3pm–11pm · …". Runs of
 * consecutive days with the same hours are merged. No "today", no "now".
 */
export function weekHoursSummary(week: WeekHours): string {
  const text = (w: DayWindow | null) => (w ? `${w.openLabel}–${w.closeLabel}` : "closed");
  const groups: { first: string; last: string; text: string }[] = [];
  for (const d of DAYS) {
    const t = text(week[d.key] ?? null);
    const g = groups[groups.length - 1];
    if (g && g.text === t) g.last = d.short;
    else groups.push({ first: d.short, last: d.short, text: t });
  }
  return groups
    .map((g) => `${g.first === g.last ? g.first : `${g.first}–${g.last}`} ${g.text}`)
    .join(" · ");
}
