/**
 * Verifies src/lib/recurrence.ts — the venue-local date math behind the
 * events calendar's recurring nights and its month navigation.
 *
 * Worth having because the failure mode is silent and seasonal: a
 * recurrence stepped by fixed milliseconds keeps working perfectly until
 * the November DST shift, then quietly advertises the wrong weekday for
 * five months. Nothing about the build would go red.
 *
 * Node 24 strips TypeScript natively, so this imports the real module —
 * not a copy of it.
 *
 * Run: `node scripts/check-recurrence.mjs`
 */
import {
  ctClock,
  ctDateKey,
  ctInstant,
  weekdayOf,
  isOneLateNight,
  expandOccurrences,
  monthHorizon,
} from "../src/lib/recurrence.ts";

let failures = 0;
function check(label, actual, expected) {
  const a = String(actual);
  const e = String(expected);
  if (a === e) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}\n         expected: ${e}\n         actual:   ${a}`);
  }
}

// The live Karaoke Thursdays season, mirroring
// src/content/events/karaoke-thursdays.md. 7-11pm CT, Sep 10 2026 ->
// May 27 2027, five dark nights. Keep the skip list in sync with the
// markdown — the count assertion below is what catches a drift.
const KARAOKE = {
  start: new Date("2026-09-10T19:00:00-05:00"),
  end: new Date("2026-09-10T23:00:00-05:00"),
  recurring: {
    frequency: "weekly",
    // YAML hands a bare date over as UTC midnight — reproduced exactly.
    until: new Date("2027-05-27T00:00:00.000Z"),
    skip: ["2026-10-22", "2026-11-26", "2026-12-24", "2026-12-31", "2027-04-01"],
  },
};

const SEASON_END = new Date("2027-07-01T00:00:00Z");
/** The next night at or after `from` — what a given day's build would show first. */
const next = (from) => expandOccurrences(KARAOKE, from, SEASON_END)[0] ?? null;
/** Every night in a given venue-local month, as day-of-month numbers. */
const nightsIn = (key) => {
  const [y, m] = key.split("-").map(Number);
  const start = ctInstant(`${key}-01`, 0, 0);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const end = new Date(ctInstant(`${ny}-${String(nm).padStart(2, "0")}-01`, 0, 0).getTime() - 1);
  return expandOccurrences(KARAOKE, start, end).map((o) => Number(ctDateKey(o.start).slice(8)));
};

console.log("\nEvery occurrence is a Thursday at 7:00pm local");
{
  const all = expandOccurrences(KARAOKE, new Date("2026-09-01T12:00:00Z"), SEASON_END);

  check("occurrence count (38 Thursdays - 5 dark)", all.length, 33);
  check("first night", ctDateKey(all[0].start), "2026-09-10");
  check("last night", ctDateKey(all[all.length - 1].start), "2027-05-27");

  const badDay = all.find((o) => weekdayOf(o.start) !== "Thursday");
  check("no occurrence drifts off Thursday", badDay ? ctDateKey(badDay.start) : "none", "none");

  const badTime = all.find((o) => ctClock(o.start) !== "19:00" || ctClock(o.end) !== "23:00");
  check(
    "no occurrence drifts off 19:00-23:00 local",
    badTime ? `${ctDateKey(badTime.start)} ${ctClock(badTime.start)}-${ctClock(badTime.end)}` : "none",
    "none",
  );

  const dark = new Set(KARAOKE.recurring.skip);
  const hitDark = all.find((o) => dark.has(ctDateKey(o.start)));
  check("no occurrence lands on a dark night", hitDark ? ctDateKey(hitDark.start) : "none", "none");

  const ascending = all.every((o, i) => i === 0 || o.start > all[i - 1].start);
  check("occurrences come back in order", ascending, "true");
}

console.log("\nA dark night explains itself by absence (why no 'skipping' note)");
{
  // This is the whole reason recurring events list every date rather than
  // one rolling card: the reader sees the gap, so nothing has to say
  // "skipping Oct 22."
  check("October: Bears night (22nd) is just missing", nightsIn("2026-10").join(", "), "1, 8, 15, 29");
  check("November: Thanksgiving (26th) is just missing", nightsIn("2026-11").join(", "), "5, 12, 19");
  check("December: Christmas Eve + NYE both missing", nightsIn("2026-12").join(", "), "3, 10, 17");
  check("April: the 1st is missing", nightsIn("2027-04").join(", "), "8, 15, 22, 29");
  check("September: opens on the 10th, nothing dark", nightsIn("2026-09").join(", "), "10, 17, 24");
  check("May: season stops after the 27th", nightsIn("2027-05").join(", "), "6, 13, 20, 27");
  check("June: season is over, month is empty", nightsIn("2027-06").length, 0);
}

console.log("\nThe DST crossings specifically (this is the point of the module)");
{
  // CDT -> CST lands Sun Nov 1 2026. Naive +7*24h stepping puts the
  // Nov 12 occurrence at 6pm on WEDNESDAY Nov 11 — both wrong.
  const afterFall = next(new Date("2026-11-06T12:00:00Z"));
  check("first night after the fall-back is Thu Nov 12", ctDateKey(afterFall.start), "2026-11-12");
  check("...still 19:00 local", ctClock(afterFall.start), "19:00");
  check("...which is 01:00Z (CST = UTC-6)", afterFall.start.toISOString(), "2026-11-13T01:00:00.000Z");

  // CST -> CDT lands Sun Mar 14 2027.
  const afterSpring = next(new Date("2027-03-15T12:00:00Z"));
  check("first night after the spring-forward is Thu Mar 18", ctDateKey(afterSpring.start), "2027-03-18");
  check("...still 19:00 local", ctClock(afterSpring.start), "19:00");
  check("...which is 00:00Z (CDT = UTC-5)", afterSpring.start.toISOString(), "2027-03-19T00:00:00.000Z");
}

console.log("\nSeason boundaries and in-progress nights");
{
  check("before the season opens, next = opening night", ctDateKey(next(new Date("2026-08-27T12:00:00Z")).start), "2026-09-10");

  // Mid-night on the final Thursday: still tonight, not dropped.
  check("a night in progress is still listed", ctDateKey(next(new Date("2027-05-28T02:00:00Z")).start), "2027-05-27");

  // `until` is UTC midnight; reading it in CT would rewind a day and drop
  // the final night. This asserts it doesn't.
  check("season is over after the last night", next(new Date("2027-05-28T05:00:00Z")), "null");

  // Christmas Eve + NYE are both Thursdays, so the holidays open a
  // three-week hole — the longest gap in the season, and it crosses a
  // year boundary (the same place the month-grouping bug once lived).
  check("Dec 17 -> next is Jan 7", ctDateKey(next(new Date("2026-12-18T12:00:00Z")).start), "2027-01-07");
}

console.log("\nOne-shots are untouched by any of this");
{
  const paintNight = {
    start: new Date("2026-09-15T18:00:00-05:00"),
    end: new Date("2026-09-15T20:30:00-05:00"),
  };
  const far = new Date("2027-01-01T00:00:00Z");
  check("upcoming one-shot yields itself, once", expandOccurrences(paintNight, new Date("2026-09-01T12:00:00Z"), far).length, 1);
  check("past one-shot yields nothing", expandOccurrences(paintNight, new Date("2026-09-20T12:00:00Z"), far).length, 0);
  check(
    "a one-shot past the horizon yields nothing",
    expandOccurrences(paintNight, new Date("2026-09-01T12:00:00Z"), new Date("2026-09-10T00:00:00Z")).length,
    0,
  );
}

console.log("\nMonth horizon (the pills)");
{
  const h = monthHorizon(new Date("2026-08-27T12:00:00Z"), 4);
  check("starts with the month we're in", h.map((m) => m.key).join(" "), "2026-08 2026-09 2026-10 2026-11");
  check("month starts at local midnight", ctClock(h[1].start), "00:00");
  check("...on the 1st", ctDateKey(h[1].start), "2026-09-01");
  check("month ends just before the next begins", ctDateKey(h[1].end), "2026-09-30");

  // The horizon has to roll across December without resetting the year.
  const yearEnd = monthHorizon(new Date("2026-11-15T12:00:00Z"), 4);
  check("crosses the year boundary", yearEnd.map((m) => m.key).join(" "), "2026-11 2026-12 2027-01 2027-02");

  // A build running late on the last night of a month must not roll the
  // horizon early: 11pm CT Aug 31 is Sep 1 in UTC.
  const lateNight = monthHorizon(new Date("2026-09-01T04:00:00Z"), 4);
  check("11pm CT on Aug 31 is still August", lateNight[0].key, "2026-08");
}

console.log("\nLate nights that cross midnight are ONE night, not a range");
{
  // Black Wednesday karaoke: 9pm Nov 25 -> 1am Nov 26, CST.
  const bw = { start: new Date("2026-11-25T21:00:00-06:00"), end: new Date("2026-11-26T01:00:00-06:00") };
  check("9pm-1am is one night", isOneLateNight(bw.start, bw.end), "true");
  check("...and 'today' is the 25th", ctDateKey(bw.start), "2026-11-25");

  // The Paint Night case that produced the phantom "15-16 SEP" range:
  // ends 8:30pm local, i.e. same venue day. Never reaches the late rule.
  const pn = { start: new Date("2026-09-15T18:00:00-05:00"), end: new Date("2026-09-15T20:30:00-05:00") };
  check("a same-evening end is not a late night", isOneLateNight(pn.start, pn.end), "false");

  // A genuine two-day run must still render as a range.
  const twoDay = { start: new Date("2026-12-31T20:00:00-06:00"), end: new Date("2027-01-01T14:00:00-06:00") };
  check("a real multi-day run is still a range", isOneLateNight(twoDay.start, twoDay.end), "false");
}

console.log("\nWall-clock anchoring round-trips");
{
  check("19:00 CDT -> instant", ctInstant("2026-09-10", 19, 0).toISOString(), "2026-09-11T00:00:00.000Z");
  check("19:00 CST -> instant", ctInstant("2026-12-10", 19, 0).toISOString(), "2026-12-11T01:00:00.000Z");
  // Spring-forward day: 2am doesn't exist locally, so the naive guess is
  // wrong on the first pass. The two-pass correction has to handle it.
  check("2027-03-14 12:00 (DST transition day)", ctClock(ctInstant("2027-03-14", 12, 0)), "12:00");
}

console.log(
  failures === 0
    ? "\n[recurrence] OK — all checks passed.\n"
    : `\n[recurrence] ${failures} CHECK(S) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
