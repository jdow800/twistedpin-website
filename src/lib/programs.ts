/**
 * Standing-program feed for Roy, the phone agent.
 *
 * WHY THIS EXISTS. Roy is asked "do you host karaoke?" and, more awkwardly,
 * "do you have karaoke this week?" — which is a date question. The obvious
 * fix (paste the 33 dates into Roy's prompt or knowledge base) fails twice:
 * the list rots the moment a night is cancelled, and asking an LLM to work
 * out whether a given Thursday falls inside "this week" from a wall of dates
 * is exactly the kind of arithmetic it gets confidently wrong on a phone call.
 *
 * So the website answers the date question instead. `/api/hours` already
 * feeds Roy's pre-call webhook `is_open` and today's hours; this adds a
 * program block containing a **finished sentence Roy can just say**. Same
 * source of truth as the calendar — the markdown in src/content/events —
 * so cancelling a night updates the website AND the phone answer in one edit.
 *
 * Everything here is pure and takes `now`, so scripts/check-programs.mjs can
 * exercise the phone answers on any date without a browser or a build.
 */
// Explicit .ts extension: the tsconfig sets `allowImportingTsExtensions`, and
// it lets scripts/check-programs.mjs import this module through plain Node
// (which will not resolve an extensionless relative path) with no build step.
import { expandOccurrences, ctDateKey, weekdayOf, type EventTiming } from "./recurrence.ts";

/** The event fields this module needs — a plain shape, not an Astro entry. */
export type ProgramEvent = EventTiming & {
  id: string;
  title: string;
  tags: string[];
};

const VENUE_TZ = "America/Chicago";

const spokenDateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: VENUE_TZ,
});
const clockFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: VENUE_TZ,
});
const hourPartsFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: VENUE_TZ,
});

const NUM = [
  "twelve", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
];

/**
 * Times as natural speech — "seven PM", "nine thirty PM".
 *
 * Retell's TTS reads compressed forms like "11am" inconsistently (documented
 * in Editing_Roy.md, "Pronunciation tip"), and a phone agent mispronouncing
 * the one number the caller phoned in for is the whole ballgame. Digits are
 * kept alongside these in `*_label` fields for any non-voice consumer.
 */
export function spokenTime(d: Date): string {
  const parts = hourPartsFmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const period = get("dayPeriod").toUpperCase().replace(/\./g, "");
  const h = NUM[hour % 12 === 0 ? 12 : hour % 12];
  if (minute === 0) return `${h} ${period}`;
  if (minute < 10) return `${h} oh ${NUM[minute]} ${period}`;
  if (minute === 15) return `quarter past ${h} ${period}`;
  if (minute === 30) return `${h} thirty ${period}`;
  if (minute === 45) return `quarter to ${NUM[(hour % 12) + 1]} ${period}`;
  return `${h} ${minute} ${period}`;
}

function spokenRange(start: Date, end?: Date) {
  return end ? `${spokenTime(start)} to ${spokenTime(end)}` : `from ${spokenTime(start)}`;
}

/** Start of the caller's current week (Sunday), venue-local. */
function weekBounds(now: Date) {
  const dayIdx = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: VENUE_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(now) + "T00:00:00Z",
  ).getUTCDay();
  const todayKey = ctDateKey(now);
  const [Y, M, D] = todayKey.split("-").map(Number);
  const sunday = new Date(Date.UTC(Y, M - 1, D - dayIdx));
  const saturday = new Date(Date.UTC(Y, M - 1, D - dayIdx + 6));
  return { start: sunday.toISOString().slice(0, 10), end: saturday.toISOString().slice(0, 10) };
}

/** Whole venue-local days from one YYYY-MM-DD key to another. */
function daysBetween(fromKey: string, toKey: string) {
  const at = (k: string) => {
    const [Y, M, D] = k.split("-").map(Number);
    return Date.UTC(Y, M - 1, D);
  };
  return Math.round((at(toKey) - at(fromKey)) / 86400000);
}

export type ProgramOccurrence = {
  date: string;
  spoken_date: string;
  title: string;
  start_label: string;
  end_label: string | null;
  spoken_time: string;
  is_variant: boolean;
};

/**
 * Assemble everything Roy needs about one tagged program.
 * `horizonDays` bounds the look-ahead — 400 covers a full season.
 */
export function buildProgram(
  events: ProgramEvent[],
  tag: string,
  now: Date,
  horizonDays = 400,
) {
  const tagged = events.filter((e) => e.tags.includes(tag));
  if (tagged.length === 0) return null;

  // The recurring entry defines the program's identity: its name, its
  // weekday, and its usual hours. One-offs sharing the tag are variants
  // (Black Wednesday), named as such so Roy doesn't quote 7pm for a 9pm night.
  const base = tagged.find((e) => e.recurring) ?? tagged[0];
  const horizonEnd = new Date(now.getTime() + horizonDays * 86400000);

  const all = tagged
    .flatMap((e) =>
      expandOccurrences(e, now, horizonEnd).map((occ) => ({ event: e, occ })),
    )
    .sort((a, b) => a.occ.start.getTime() - b.occ.start.getTime());

  const describe = ({ event, occ }: (typeof all)[number]): ProgramOccurrence => ({
    date: ctDateKey(occ.start),
    spoken_date: spokenDateFmt.format(occ.start),
    title: event.title,
    start_label: clockFmt.format(occ.start),
    end_label: occ.end ? clockFmt.format(occ.end) : null,
    spoken_time: spokenRange(occ.start, occ.end),
    is_variant: event.id !== base.id,
  });

  const weekday = base.recurring ? weekdayOf(base.start) : null;
  const usualSpoken = spokenRange(base.start, base.end);
  const seasonStart = ctDateKey(base.start);
  const seasonEnd = base.recurring ? base.recurring.until.toISOString().slice(0, 10) : null;
  const todayKey = ctDateKey(now);

  const next = all[0] ? describe(all[0]) : null;
  const nextRaw = all[0]?.occ ?? null;
  const isToday = !!next && next.date === todayKey;
  const inProgress = !!nextRaw && nextRaw.start <= now;
  const daysUntilNext = next ? daysBetween(todayKey, next.date) : null;

  const week = weekBounds(now);
  const thisWeekEntry = all.find((x) => {
    const k = ctDateKey(x.occ.start);
    return k >= week.start && k <= week.end;
  });
  const thisWeek = thisWeekEntry ? describe(thisWeekEntry) : null;

  // Dark nights worth volunteering — a caller who hears "every Thursday"
  // and turns up on a skipped one is the failure this prevents.
  const darkAhead = (base.recurring?.skip ?? [])
    .filter((k) => k >= todayKey)
    .sort()
    .slice(0, 4)
    .map((k) => {
      const [Y, M, D] = k.split("-").map(Number);
      return { date: k, spoken_date: spokenDateFmt.format(new Date(Date.UTC(Y, M - 1, D, 18))) };
    });

  const started = todayKey >= seasonStart;
  const overForSeason = all.length === 0;

  // "September through May" — derived from the dates, not written down, so it
  // can't disagree with them. Used only to describe a season that has ended;
  // it is a statement about the season we have data for, never a forecast.
  const monthNameFmt = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });
  const seasonMonths =
    base.recurring && seasonEnd
      ? `${monthNameFmt.format(new Date(seasonStart + "T12:00:00Z"))} through ${monthNameFmt.format(new Date(seasonEnd + "T12:00:00Z"))}`
      : null;

  // The finished sentence. Roy speaks this rather than reasoning about dates.
  let answer: string;
  if (overForSeason) {
    // Describe the season we KNOW about; never promise a next one. "Comes
    // back in the fall" shipped here first and was wrong to say — nothing in
    // the data supports it, and Roy's own prompt bans claims he can't source.
    // If the program does return, the markdown gets new dates and this
    // branch stops firing on its own.
    answer = weekday && seasonMonths
      ? `${base.title} is finished for the season. It runs ${weekday} nights, ${usualSpoken}, ${seasonMonths}.`
      : `${base.title} isn't on the schedule right now.`;
  } else if (!started && next) {
    answer = `${base.title} starts ${next.spoken_date}. After that it's every ${weekday}, ${usualSpoken}.`;
  } else if (inProgress && next) {
    answer = `Yes — ${base.title.toLowerCase()} is going on right now, until ${spokenTime(nextRaw!.end ?? nextRaw!.start)}.`;
  } else if (isToday && next) {
    answer = `Yes — ${base.title.toLowerCase()} is tonight, ${next.spoken_time}.`;
  } else if (next && daysUntilNext === 1) {
    // "Tomorrow" beats any week-relative phrasing. This also fixes a
    // Sunday-night program: a Saturday caller is in the same Sun–Sat week
    // as LAST Sunday, so the this-week branch below can't see tomorrow's
    // night and the answer used to open with "Not this week" about a night
    // that is 20 hours away.
    answer = next.is_variant
      ? `Yes — tomorrow, ${next.spoken_date}, it's our ${next.title}, ${next.spoken_time}.`
      : `Yes — ${base.title.toLowerCase()} is tomorrow, ${next.spoken_date}, ${next.spoken_time}.`;
  } else if (thisWeek) {
    answer = thisWeek.is_variant
      ? `Yes — this week it's ${thisWeek.spoken_date}, our ${thisWeek.title}, ${thisWeek.spoken_time}.`
      : `Yes — ${base.title.toLowerCase()} is this ${thisWeek.spoken_date}, ${thisWeek.spoken_time}.`;
  } else if (next && daysUntilNext !== null && daysUntilNext <= 6) {
    // Inside the coming seven days but past this Sun–Sat week's edge.
    // "Not this week" is TRUE here by the calendar and wrong by the ear —
    // a Wednesday caller asking about a Sunday program, or a Friday caller
    // asking about Thursday karaoke, means the week ahead. Just name it.
    answer = next.is_variant
      ? `The next one is ${next.spoken_date} — that's our ${next.title}, ${next.spoken_time}.`
      : `The next ${base.title.toLowerCase()} is ${next.spoken_date}, ${next.spoken_time}.`;
  } else if (next) {
    // A genuine gap — a dark week, or a holiday hole. Say so, so a caller
    // who heard "every Thursday" doesn't turn up on the skipped one.
    answer = next.is_variant
      ? `Not this week. The next one is ${next.spoken_date} — that's our ${next.title}, ${next.spoken_time}.`
      : `Not this week. The next ${base.title.toLowerCase()} is ${next.spoken_date}, ${next.spoken_time}.`;
  } else {
    answer = `${base.title} isn't on the schedule right now.`;
  }

  // Standing description, for "do you host karaoke?" with no date attached.
  const summary = weekday
    ? `${base.title} runs every ${weekday}, ${usualSpoken}.`
    : `${base.title} is on the schedule.`;

  return {
    name: base.title,
    tag,
    weekday,
    usual_time: {
      start_label: clockFmt.format(base.start),
      end_label: base.end ? clockFmt.format(base.end) : null,
      spoken: usualSpoken,
    },
    season: {
      starts: seasonStart,
      ends: seasonEnd,
      started,
      in_season: !overForSeason,
    },
    next,
    next_is_today: isToday,
    next_in_progress: inProgress,
    this_week: { has: !!thisWeek, occurrence: thisWeek },
    upcoming: all.slice(0, 8).map(describe),
    dark_dates_ahead: darkAhead,
    /** Ready to speak. Answers "is there karaoke this week?" */
    answer,
    /** Ready to speak. Answers "do you host karaoke?" */
    summary,
  };
}

/** Every distinct tag across the given events, so the API can build them all. */
export function programTags(events: ProgramEvent[]): string[] {
  return [...new Set(events.flatMap((e) => e.tags))].sort();
}
