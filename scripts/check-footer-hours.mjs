/**
 * Verifies src/lib/hours-status.ts — the footer's open/closed status, computed
 * in the browser against the venue's Central clock (the build no longer bakes
 * it; a baked "Closed" was live at 11:30am on a Saturday while the venue was
 * open, 2026-10-17).
 *
 * Every case is a moment a real guest looks at the footer: opening minute,
 * the last open minute, closing time, the small hours after Friday and
 * Saturday close, a holiday closure, and the two daylight-saving switches.
 * The last block sweeps every minute of three weeks (regular, a closed
 * Thursday, a closed Saturday) and requires the footer to agree with
 * isOpenNow() (what /api/hours/ serves) on every one.
 *
 * Node 24 strips TypeScript natively, so this imports the real modules.
 *
 * Run: `node scripts/check-footer-hours.mjs`
 */
import { centralClock, footerHoursStatus, weekHoursSummary } from "../src/lib/hours-status.ts";
import { DAYS, isOpenNow, previousDay } from "../src/data/hours.ts";

let failures = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log(`  ok   ${label}`); }
  else { failures++; console.log(`  FAIL ${label}\n         expected: ${e}\n         actual:   ${a}`); }
}

const win = (open, close, openLabel, closeLabel) => ({
  openMinutes: open, closeMinutes: close, openLabel, closeLabel,
});
const H = (h, m = 0) => h * 60 + m;

// Google's regular schedule as of 2026-10-17 (the /api/hours/ snapshot).
const WEEK = {
  mon: win(H(15), H(22), "3pm", "10pm"),
  tue: win(H(15), H(22), "3pm", "10pm"),
  wed: win(H(15), H(22), "3pm", "10pm"),
  thu: win(H(15), H(23), "3pm", "11pm"),
  fri: win(H(14), H(25), "2pm", "1am"),
  sat: win(H(11), H(25), "11am", "1am"),
  sun: win(H(12), H(22), "12pm", "10pm"),
};
const st = (week, day, h, m = 0) => footerHoursStatus(week, day, H(h, m));

console.log("The 2026-10-17 bug: Saturday morning");
check("Sat 10:59am is still before open", st(WEEK, "sat", 10, 59), { state: "before-open", openLabel: "11am" });
check("Sat 11:00am is open until 1am", st(WEEK, "sat", 11, 0), { state: "open", closeLabel: "1am" });
check("Sat 11:30am is open until 1am", st(WEEK, "sat", 11, 30), { state: "open", closeLabel: "1am" });

console.log("Weekday open and close");
check("Mon 2:59pm before open", st(WEEK, "mon", 14, 59), { state: "before-open", openLabel: "3pm" });
check("Mon 3:00pm open until 10pm", st(WEEK, "mon", 15, 0), { state: "open", closeLabel: "10pm" });
check("Mon 9:59pm still open", st(WEEK, "mon", 21, 59), { state: "open", closeLabel: "10pm" });
check("Mon 10:00pm closed for tonight", st(WEEK, "mon", 22, 0), { state: "after-close" });
check("Thu 10:30pm open until 11pm", st(WEEK, "thu", 22, 30), { state: "open", closeLabel: "11pm" });
check("Sun 7pm open until 10pm", st(WEEK, "sun", 19, 0), { state: "open", closeLabel: "10pm" });

console.log("Past-midnight closes");
check("Fri 11:30pm open until 1am", st(WEEK, "fri", 23, 30), { state: "open", closeLabel: "1am" });
check("Sat 12:30am is Friday night, open until 1am", st(WEEK, "sat", 0, 30), { state: "open", closeLabel: "1am" });
check("Sat 1:00am has closed, opens at 11am", st(WEEK, "sat", 1, 0), { state: "before-open", openLabel: "11am" });
check("Sun 12:30am is Saturday night, open until 1am", st(WEEK, "sun", 0, 30), { state: "open", closeLabel: "1am" });
check("Sun 1:00am has closed, opens at 12pm", st(WEEK, "sun", 1, 0), { state: "before-open", openLabel: "12pm" });
check("Fri 12:30am is Thursday, which closed at 11pm", st(WEEK, "fri", 0, 30), { state: "before-open", openLabel: "2pm" });
check("Mon 12:30am is Sunday, which closed at 10pm", st(WEEK, "mon", 0, 30), { state: "before-open", openLabel: "3pm" });

console.log("Holiday and special closures (a null day)");
const THANKSGIVING = { ...WEEK, thu: null };
check("closed Thu at noon says closed today", st(THANKSGIVING, "thu", 12, 0), { state: "closed-today" });
check("closed Thu at 11pm says closed today", st(THANKSGIVING, "thu", 23, 0), { state: "closed-today" });
check("Fri 12:30am after a closed Thu is just before open", st(THANKSGIVING, "fri", 0, 30), { state: "before-open", openLabel: "2pm" });
const SAT_CLOSED = { ...WEEK, sat: null };
check("Sat 12:30am after an open Friday is still open", st(SAT_CLOSED, "sat", 0, 30), { state: "open", closeLabel: "1am" });
check("closed Sat at 3pm says closed today", st(SAT_CLOSED, "sat", 15, 0), { state: "closed-today" });
const ALL_CLOSED = Object.fromEntries(DAYS.map((d) => [d.key, null]));
check("a week with no hours never says open", st(ALL_CLOSED, "wed", 18, 0), { state: "closed-today" });
const PARTIAL = { mon: WEEK.mon };
check("a missing day is treated as closed, not a crash", st(PARTIAL, "tue", 18, 0), { state: "closed-today" });

console.log("Central clock (one formatter call: day and minute cannot disagree)");
check("2026-10-17 16:30Z is Sat 11:30am CDT", centralClock(new Date("2026-10-17T16:30:00Z")), { day: "sat", minutes: H(11, 30) });
check("2026-10-18 05:30Z is Sun 12:30am CDT", centralClock(new Date("2026-10-18T05:30:00Z")), { day: "sun", minutes: H(0, 30) });
check("2026-10-18 04:59Z is Sat 11:59pm CDT", centralClock(new Date("2026-10-18T04:59:00Z")), { day: "sat", minutes: H(23, 59) });
check("2026-10-18 05:00Z is Sun midnight (00, never 24)", centralClock(new Date("2026-10-18T05:00:00Z")), { day: "sun", minutes: 0 });
// DST ends Sun 2026-11-01 at 2:00am CDT: 1:30am happens twice.
check("DST end: 06:30Z is Sun 1:30am CDT", centralClock(new Date("2026-11-01T06:30:00Z")), { day: "sun", minutes: H(1, 30) });
check("DST end: 07:30Z is Sun 1:30am CST", centralClock(new Date("2026-11-01T07:30:00Z")), { day: "sun", minutes: H(1, 30) });
check("CST: 2026-11-02 05:59Z is Sun 11:59pm", centralClock(new Date("2026-11-02T05:59:00Z")), { day: "sun", minutes: H(23, 59) });
check("CST: 2026-11-02 06:00Z is Mon midnight", centralClock(new Date("2026-11-02T06:00:00Z")), { day: "mon", minutes: 0 });
// DST starts Sun 2026-03-08 at 2:00am CST.
check("DST start: 07:59Z is Sun 1:59am CST", centralClock(new Date("2026-03-08T07:59:00Z")), { day: "sun", minutes: H(1, 59) });
check("DST start: 08:00Z is Sun 3:00am CDT", centralClock(new Date("2026-03-08T08:00:00Z")), { day: "sun", minutes: H(3, 0) });
check("a UTC date is not the venue date: 2026-10-17 03:00Z is still Fri 10pm CDT", centralClock(new Date("2026-10-17T03:00:00Z")), { day: "fri", minutes: H(22, 0) });

console.log("Neutral weekly line (what the static HTML says)");
check("regular week", weekHoursSummary(WEEK), "Mon–Wed 3pm–10pm · Thu 3pm–11pm · Fri 2pm–1am · Sat 11am–1am · Sun 12pm–10pm");
check("closed Thursday", weekHoursSummary(THANKSGIVING), "Mon–Wed 3pm–10pm · Thu closed · Fri 2pm–1am · Sat 11am–1am · Sun 12pm–10pm");
check("a closed run is merged", weekHoursSummary(ALL_CLOSED), "Mon–Sun closed");
check("a changed day regroups the run", weekHoursSummary({ ...WEEK, wed: WEEK.thu }), "Mon–Tue 3pm–10pm · Wed–Thu 3pm–11pm · Fri 2pm–1am · Sat 11am–1am · Sun 12pm–10pm");
{
  const line = weekHoursSummary(WEEK).toLowerCase();
  check("the weekly line never contains a state word", /\b(open now|closed now|today|tonight|opens)\b/.test(line), false);
}

console.log("Agrees with isOpenNow() (what /api/hours/ serves) on every minute of three weeks");
{
  let mismatches = 0, minutes = 0;
  const order = DAYS.map((d) => d.key);
  for (const [name, week] of [["regular", WEEK], ["Thu closed", THANKSGIVING], ["Sat closed", SAT_CLOSED]]) {
    for (const day of order) {
      for (let m = 0; m < 24 * 60; m++) {
        minutes++;
        const footerOpen = footerHoursStatus(week, day, m).state === "open";
        const apiOpen = isOpenNow(week[day], week[previousDay(day)], m);
        if (footerOpen !== apiOpen) {
          mismatches++;
          if (mismatches <= 5) console.log(`         ${name}: ${day} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} footer=${footerOpen} api=${apiOpen}`);
        }
      }
    }
  }
  check(`${minutes} minutes compared`, mismatches, 0);
}

if (failures) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll footer-hours checks passed.");
