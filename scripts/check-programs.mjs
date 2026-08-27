/**
 * Verifies src/lib/programs.ts — the answers Roy (the phone agent) gives
 * about standing programs, served from /api/hours.
 *
 * These are spoken to real callers, so the failure mode is a person driving
 * to Plainfield on a Thursday we're dark. Every case below is a call someone
 * will actually make: "do you have karaoke this week?" asked on each day of
 * the week, in a normal week, a skip week, the week it launches, and the week
 * after the season ends.
 *
 * Node 24 strips TypeScript natively, so this imports the real module.
 *
 * Run: `node scripts/check-programs.mjs`
 */
import { buildProgram, spokenTime } from "../src/lib/programs.ts";

let failures = 0;
function check(label, actual, expected) {
  const a = String(actual), e = String(expected);
  if (a === e) { console.log(`  ok   ${label}`); }
  else { failures++; console.log(`  FAIL ${label}\n         expected: ${e}\n         actual:   ${a}`); }
}
function contains(label, actual, needle) {
  if (String(actual).includes(needle)) { console.log(`  ok   ${label}`); }
  else { failures++; console.log(`  FAIL ${label}\n         wanted substring: ${needle}\n         in:               ${actual}`); }
}

// Mirrors src/content/events/karaoke-thursdays.md + the Black Wednesday
// one-off. Keep in sync with those files.
const EVENTS = [
  {
    id: "karaoke-thursdays",
    title: "Karaoke Night",
    tags: ["karaoke"],
    start: new Date("2026-09-10T19:00:00-05:00"),
    end: new Date("2026-09-10T23:00:00-05:00"),
    recurring: {
      frequency: "weekly",
      until: new Date("2027-05-27T00:00:00.000Z"),
      skip: ["2026-10-22", "2026-11-26", "2026-12-24", "2026-12-31", "2027-04-01"],
    },
  },
  {
    id: "2026-11-25-karaoke-black-wednesday",
    title: "Karaoke Night — Black Wednesday Edition",
    tags: ["karaoke"],
    start: new Date("2026-11-25T21:00:00-06:00"),
    end: new Date("2026-11-26T01:00:00-06:00"),
  },
];

// A caller phoning at 2pm Central on the given venue-local date.
const callAt = (dateKey, hourCT = 14) => {
  const [Y, M, D] = dateKey.split("-").map(Number);
  // CST for Nov-Feb, CDT otherwise — good enough for a 2pm call.
  const offset = M >= 3 && M <= 10 ? 5 : 6;
  return new Date(Date.UTC(Y, M - 1, D, hourCT + offset));
};
const ask = (dateKey, hourCT) => buildProgram(EVENTS, "karaoke", callAt(dateKey, hourCT), 400);

console.log("\nTimes are spoken, not typed (Retell TTS mangles \"11am\")");
{
  check("7pm", spokenTime(new Date("2026-09-10T19:00:00-05:00")), "seven PM");
  check("11pm", spokenTime(new Date("2026-09-10T23:00:00-05:00")), "eleven PM");
  check("1am", spokenTime(new Date("2026-11-26T01:00:00-06:00")), "one AM");
  check("9pm", spokenTime(new Date("2026-11-25T21:00:00-06:00")), "nine PM");
  check("half past", spokenTime(new Date("2026-09-10T19:30:00-05:00")), "seven thirty PM");
}

console.log("\n\"Do you host karaoke?\" — the standing answer");
{
  check("summary", ask("2026-10-06").summary, "Karaoke Night runs every Thursday, seven PM to eleven PM.");
  check("weekday", ask("2026-10-06").weekday, "Thursday");
  check("usual time spoken", ask("2026-10-06").usual_time.spoken, "seven PM to eleven PM");
}

console.log("\n\"Is there karaoke this week?\" — a normal week (Thu Oct 8 is on)");
{
  // Sun Oct 4 through Sat Oct 10. Karaoke lands Thursday the 8th.
  for (const [day, key] of [["Sunday", "2026-10-04"], ["Monday", "2026-10-05"], ["Tuesday", "2026-10-06"], ["Wednesday", "2026-10-07"]]) {
    const p = ask(key);
    check(`${day} caller -> yes, this week`, p.this_week.has, "true");
    contains(`${day} answer names Thursday Oct 8`, p.answer, "Thursday, October 8");
  }
  const thu = ask("2026-10-08", 14); // 2pm, before doors
  check("Thursday afternoon -> it's tonight", thu.next_is_today, "true");
  contains("...and says tonight", thu.answer, "is tonight, seven PM to eleven PM");

  const during = ask("2026-10-08", 21); // 9pm, mid-karaoke
  check("Thursday 9pm -> in progress", during.next_in_progress, "true");
  contains("...and says right now", during.answer, "going on right now, until eleven PM");

  const fri = ask("2026-10-09");
  check("Friday caller -> not this week any more", fri.this_week.has, "false");
  contains("...and points at the next one", fri.answer, "Not this week. The next karaoke night is Thursday, October 15");
}

console.log("\nA DARK week — the answer that stops a wasted drive (Oct 22, Bears)");
{
  const p = ask("2026-10-19"); // Monday of the skipped week
  check("no karaoke that week", p.this_week.has, "false");
  contains("says not this week", p.answer, "Not this week.");
  contains("names the next real one (Oct 29)", p.answer, "Thursday, October 29");
  check("Oct 22 is not in upcoming", p.upcoming.some((o) => o.date === "2026-10-22"), "false");
  check("dark dates volunteer Oct 22 first", p.dark_dates_ahead[0].spoken_date, "Thursday, October 22");
}

console.log("\nThanksgiving week — karaoke MOVES to Wednesday and runs late");
{
  const p = ask("2026-11-23"); // Monday of Thanksgiving week
  check("there IS karaoke this week", p.this_week.has, "true");
  check("...on the Wednesday", p.this_week.occurrence.date, "2026-11-25");
  check("...flagged as the variant", p.this_week.occurrence.is_variant, "true");
  contains("answer names the Black Wednesday edition", p.answer, "Black Wednesday Edition");
  contains("...with ITS hours, not the usual 7-11", p.answer, "nine PM to one AM");
  check("Thanksgiving itself is dark", p.upcoming.some((o) => o.date === "2026-11-26"), "false");
}

console.log("\nThe three-week holiday hole (Dec 24 + Dec 31 both dark)");
{
  const p = ask("2026-12-21");
  check("nothing this week", p.this_week.has, "false");
  contains("next is Jan 7", p.answer, "Thursday, January 7");
}

console.log("\nBefore the season opens, and after it closes");
{
  const pre = ask("2026-08-27");
  check("not started yet", pre.season.started, "false");
  contains("says when it starts", pre.answer, "starts Thursday, September 10");
  contains("...and the cadence after that", pre.answer, "every Thursday, seven PM to eleven PM");

  const last = ask("2027-05-24"); // Monday of the final week
  check("final week still has one", last.this_week.has, "true");
  check("...the 27th", last.this_week.occurrence.date, "2027-05-27");

  const after = ask("2027-06-02");
  check("season over", after.season.in_season, "false");
  contains("says so, and that it returns", after.answer, "finished for the season");
  check("no next occurrence", after.next, "null");
}

console.log("\nDST does not shift the spoken time (the whole point of recurrence.ts)");
{
  for (const key of ["2026-10-05", "2026-11-16", "2027-01-11", "2027-03-15", "2027-05-17"]) {
    const p = ask(key);
    const occ = p.this_week.occurrence ?? p.next;
    check(`week of ${key}: still seven PM to eleven PM`, occ.spoken_time, "seven PM to eleven PM");
  }
}

console.log("\nUnknown tag returns nothing rather than a hallucinated program");
{
  check("no such program", buildProgram(EVENTS, "trivia", callAt("2026-10-06"), 400), "null");
}

console.log(
  failures === 0
    ? "\n[programs] OK — all checks passed.\n"
    : `\n[programs] ${failures} CHECK(S) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
