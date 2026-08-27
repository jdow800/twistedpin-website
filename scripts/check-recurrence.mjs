/**
 * Verifies src/lib/recurrence.ts — the venue-local date math behind the
 * events calendar's recurring nights.
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
  resolveOccurrence,
  upcomingSkips,
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

console.log("\nEvery occurrence is a Thursday at 7:00pm local");
{
  // Walk the whole season by asking "what's next?" from the morning after
  // each answer. This is exactly how the daily cron rebuild sees it.
  const seen = [];
  let cursor = new Date("2026-09-01T12:00:00Z");
  for (let i = 0; i < 60; i++) {
    const occ = resolveOccurrence(KARAOKE, cursor);
    if (!occ) break;
    seen.push(occ);
    // Advance to just after this occurrence ends.
    cursor = new Date((occ.end ?? occ.start).getTime() + 60_000);
  }

  check("occurrence count (38 Thursdays - 5 dark)", seen.length, 33);
  check("first night", ctDateKey(seen[0].start), "2026-09-10");
  check("last night", ctDateKey(seen[seen.length - 1].start), "2027-05-27");

  const badDay = seen.find((o) => weekdayOf(o.start) !== "Thursday");
  check("no occurrence drifts off Thursday", badDay ? ctDateKey(badDay.start) : "none", "none");

  const badTime = seen.find((o) => ctClock(o.start) !== "19:00" || ctClock(o.end) !== "23:00");
  check(
    "no occurrence drifts off 19:00-23:00 local",
    badTime ? `${ctDateKey(badTime.start)} ${ctClock(badTime.start)}-${ctClock(badTime.end)}` : "none",
    "none",
  );

  const dark = new Set(KARAOKE.recurring.skip);
  const hitDark = seen.find((o) => dark.has(ctDateKey(o.start)));
  check("no occurrence lands on a dark night", hitDark ? ctDateKey(hitDark.start) : "none", "none");
}

console.log("\nThe DST crossings specifically (this is the whole point)");
{
  // CDT -> CST lands Sun Nov 1 2026. Naive +7*24h stepping puts the
  // Nov 12 occurrence at 6pm on WEDNESDAY Nov 11 — both wrong.
  const afterFall = resolveOccurrence(KARAOKE, new Date("2026-11-06T12:00:00Z"));
  check("first night after the fall-back is Thu Nov 12", ctDateKey(afterFall.start), "2026-11-12");
  check("...still 19:00 local", ctClock(afterFall.start), "19:00");
  check("...which is 01:00Z (CST = UTC-6)", afterFall.start.toISOString(), "2026-11-13T01:00:00.000Z");

  // CST -> CDT lands Sun Mar 14 2027.
  const afterSpring = resolveOccurrence(KARAOKE, new Date("2027-03-15T12:00:00Z"));
  check("first night after the spring-forward is Thu Mar 18", ctDateKey(afterSpring.start), "2027-03-18");
  check("...still 19:00 local", ctClock(afterSpring.start), "19:00");
  check("...which is 00:00Z (CDT = UTC-5)", afterSpring.start.toISOString(), "2027-03-19T00:00:00.000Z");
}

console.log("\nSeason boundaries and in-progress nights");
{
  const beforeSeason = resolveOccurrence(KARAOKE, new Date("2026-08-27T12:00:00Z"));
  check("before the season opens, next = opening night", ctDateKey(beforeSeason.start), "2026-09-10");

  // Mid-night on the final Thursday: still tonight, not null.
  const midFinal = resolveOccurrence(KARAOKE, new Date("2027-05-28T02:00:00Z")); // 9pm CT May 27
  check("a night in progress still resolves to tonight", ctDateKey(midFinal.start), "2027-05-27");

  // `until` is UTC midnight; reading it in CT would rewind a day and drop
  // the final night. This asserts it doesn't.
  const afterFinal = resolveOccurrence(KARAOKE, new Date("2027-05-28T05:00:00Z")); // just past 11pm CT
  check("season is over after the last night", afterFinal, "null");

  // Christmas Eve + NYE are both Thursdays, so the holidays open a
  // three-week hole — the longest gap in the season, and it crosses a
  // year boundary (the same place the month-grouping bug once lived).
  const holidayGap = resolveOccurrence(KARAOKE, new Date("2026-12-18T12:00:00Z"));
  check("Dec 17 -> next is Jan 7 (Dec 24 + 31 dark)", ctDateKey(holidayGap.start), "2027-01-07");
  const holidaySkips = upcomingSkips(KARAOKE, new Date("2026-12-18T12:00:00Z"), new Date("2027-01-10T12:00:00Z"));
  check("...and both holidays are named on the card", holidaySkips.join(" | "), "Dec 24 | Dec 31");

  const skips = upcomingSkips(KARAOKE, new Date("2026-10-01T12:00:00Z"), new Date("2026-11-30T12:00:00Z"));
  check("dark nights inside the window are listed", skips.join(" | "), "Oct 22 | Nov 26");
  const noSkips = upcomingSkips(KARAOKE, new Date("2027-01-05T12:00:00Z"), new Date("2027-02-05T12:00:00Z"));
  check("...and none outside it", noSkips.length, 0);
}

console.log("\nOne-shots are untouched by any of this");
{
  const paintNight = {
    start: new Date("2026-09-15T18:00:00-05:00"),
    end: new Date("2026-09-15T20:30:00-05:00"),
  };
  const before = resolveOccurrence(paintNight, new Date("2026-09-01T12:00:00Z"));
  check("upcoming one-shot resolves to itself", ctDateKey(before.start), "2026-09-15");
  check("past one-shot resolves to null", resolveOccurrence(paintNight, new Date("2026-09-20T12:00:00Z")), "null");
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
