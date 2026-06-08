// Small presentation helpers for the booking wizard. No money is *computed*
// here beyond summing line items for display — authoritative pricing is the
// API's at convert/payment-intents (ADR-0025 §5 server-side amount authority).

/** 17595 → "$175.95". Whole-dollar amounts drop the cents ("$70"). */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

/** "14:30" → "2:30 PM"; "09:00" → "9:00 AM". */
export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${suffix}`;
}

/** "2026-06-05" → "Friday, June 5". Parsed as a local calendar date (no TZ shift). */
export function formatDateLong(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** "2026-06-05" → "Jun 5". */
export function formatDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface CalendarCell {
  /** YYYY-MM-DD, or null for leading/trailing blanks in the month grid. */
  date: string | null;
  day: number | null;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "2026-06" → the full month name + year, e.g. "June 2026". */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Build a Sunday-first 6-week grid (42 cells) for a YYYY-MM month, padding the
 * lead-in and trailing days with nulls so the calendar renders as a clean grid.
 */
export function buildMonthGrid(month: string): CalendarCell[] {
  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${y}-${pad2(m)}-${pad2(d)}`, day: d });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  return cells;
}

/** Shift a YYYY-MM month by ±1 → YYYY-MM. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** YYYY-MM of a YYYY-MM-DD date. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

const p2 = (n: number): string => String(n).padStart(2, "0");

/** Today's YYYY-MM-DD in the browser's local zone. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Current local time as minutes-since-midnight (for the today past-slot filter). */
export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** "HH:MM" → minutes since midnight. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Add N calendar days to a YYYY-MM-DD date → YYYY-MM-DD (local, no TZ shift). */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
}

// Private-use base for link sentinels (see truncateSentences). One char per
// link — no digits, no .!? — so the splitter treats a link as atomic and
// restore can't collide with real digits in the copy ("5 guests").
const LINK_SENTINEL_BASE = 0xe000;
const SENTINEL_RE = new RegExp(
  "[" +
    String.fromCharCode(LINK_SENTINEL_BASE) +
    "-" +
    String.fromCharCode(LINK_SENTINEL_BASE + 255) +
    "]",
  "g",
);

/**
 * Truncate long copy to the first N sentences for the "capped + Read more"
 * detail treatment. Returns the shown text and whether it was cut. Markdown
 * links are protected so the split never cuts mid-link (which left garbage like
 * "com/waitlist/)" in the capped view).
 */
export function truncateSentences(
  text: string,
  maxSentences: number,
): { shown: string; truncated: boolean } {
  const clean = text.trim();
  const links: string[] = [];
  const guarded = clean.replace(/\[[^\]]+\]\([^)\s]+\)/g, (m) => {
    links.push(m);
    return String.fromCharCode(LINK_SENTINEL_BASE + links.length - 1);
  });
  const restore = (s: string): string =>
    s.replace(SENTINEL_RE, (c) => {
      const link = links[c.charCodeAt(0) - LINK_SENTINEL_BASE];
      return link === undefined ? "" : link;
    });

  // Split keeping the delimiters; recombine the first N sentence chunks.
  const parts = guarded.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  if (!parts || parts.length <= maxSentences) {
    return { shown: clean, truncated: false };
  }
  const shown = restore(parts.slice(0, maxSentences).join("").trim());
  return { shown, truncated: parts.length > maxSentences };
}

/** "2026-06-06" → { dow: "Sat", day: 6 } for the day-strip chips. */
export function chipParts(isoDate: string): { dow: string; day: number } {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    dow: date.toLocaleDateString("en-US", { weekday: "short" }),
    day: d,
  };
}

/**
 * Build an ISO-8601 timestamp WITH offset from a calendar date + "HH:MM" slot.
 * Used by the coupon-preview + quote requests (they require `datetime({offset})`).
 * Uses the browser's local offset as a pragmatic approximation; the
 * authoritative timestamp is built server-side at convert.
 */
export function toIsoWithOffset(isoDate: string, hhmm: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  const tzMin = -dt.getTimezoneOffset(); // minutes east of UTC
  const sign = tzMin >= 0 ? "+" : "-";
  const abs = Math.abs(tzMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${isoDate}T${pad(hh)}:${pad(mm)}:00${offset}`;
}
