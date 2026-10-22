/**
 * Guest-facing dated pricing regressions. Offline: fixtures supply Google hours
 * and the clock; no network, database, booking or payment action is performed.
 * Run: node scripts/check-pricing-date.mjs
 */
import assert from 'node:assert/strict';
import {
  pricingForDate, pricingToday, pricingDay, movePricingDate, validPricingDate,
  upcomingPennyExclusions, holidayPricingDates,
} from '../src/lib/pricing-date.ts';

const failures = [];
let checks = 0;
function check(actual, expected, label) {
  checks++;
  try { assert.deepEqual(actual, expected, label); }
  catch (error) { failures.push(error.message); }
}
const at = value => new Date(value);
const now = at('2026-10-22T17:00:00Z');
const view = (date, snapshot = {}, clock = now) => pricingForDate(date, clock, snapshot);
const rates = value => value.rows.map(row => [row.label, row.traditional, row.suite]);
const hours = (openMinutes, closeMinutes, closed = false) => ({ closed, openMinutes, closeMinutes,
  openLabel: 'fixture', closeLabel: 'fixture', label: 'fixture' });

check(pricingToday(at('2026-11-01T04:59:59Z')), '2026-10-31', 'Chicago date before midnight during DST');
check(pricingToday(at('2026-11-01T05:00:00Z')), '2026-11-01', 'Chicago midnight during DST');
check(pricingToday(at('2027-01-01T05:59:59Z')), '2026-12-31', 'Chicago year boundary, not UTC date');
check(pricingToday(at('2027-01-01T06:00:00Z')), '2027-01-01', 'Chicago new-year midnight');
check(movePricingDate('2026-12-31', 1), '2027-01-01', 'Date navigation crosses year');
check(movePricingDate('2027-03-14', -1), '2027-03-13', 'Date navigation is independent of spring DST');
check(pricingDay('2027-03-28'), 'sun', 'Easter is Sunday');
for (const invalid of [null, '', '0000-01-01', '0999-12-31', '2026-02-29', '2026-11-31', '2026-1-1', '11/25/2026', '2026-11-25T00:00:00Z', '<script>']) {
  check(validPricingDate(invalid), false, `Reject invalid date ${String(invalid)}`);
}
check(validPricingDate('2028-02-29'), true, 'Real leap day is accepted');
checks++;
try { assert.throws(() => pricingForDate('2026-02-29', now), /Invalid pricing date/); }
catch (error) { failures.push(error.message); }

const thanksgivingEve = view('2026-11-25');
check([thanksgivingEve.kind, thanksgivingEve.hours, thanksgivingEve.holiday, thanksgivingEve.twoHoursOnly, thanksgivingEve.pennyExcluded],
  ['ordinary', 'noon – 1am next day', true, true, true], 'Black Wednesday is holiday hourly, two-hour online, no Penny, overnight');
check(rates(thanksgivingEve), [['noon – 1am next day', 50, 70]], 'Black Wednesday single full-day price');
check(rates(view('2026-11-27')), [['11am – 1am next day', 50, 70]], 'Holiday Friday replaces its ordinary early tier');
check(rates(view('2026-12-24')), [['noon – 6pm', 50, 70]], 'Christmas Eve prices stop at its early close');
check(rates(view('2027-01-01')), [['noon – 1am next day', 50, 70]], 'New Year Day opens at noon, not the NYE midnight tail');
check(view('2026-12-23').hours, 'noon – 10pm', 'December 23 approved close is 10pm');
check(view('2026-12-30').hours, 'noon – 11pm', 'December 30 retains later close');
for (const date of ['2027-04-05', '2027-04-06']) {
  check([view(date).holiday, view(date).twoHoursOnly, view(date).hours], [true, true, 'noon – 10pm'], `${date}: regional spring tail stays selected`);
}
for (const date of ['2026-11-26', '2026-12-25']) {
  const closed = view(date);
  check([closed.kind, closed.rows, closed.hours], ['closed', [], 'Closed'], `${date}: no ordinary rate rows on a hard closure`);
}
for (const date of ['2026-10-26', '2026-11-02', '2026-11-03', '2027-01-18', '2027-02-15']) {
  check([rates(view(date)), view(date).holiday, view(date).twoHoursOnly], [[['3pm – 10pm', 35, 55]], false, false], `${date}: isolated dates remain ordinary`);
}
check(rates(view('2026-11-20')), [['2pm – 5pm', 45, 65], ['5pm – 1am next day', 50, 70]], 'Ordinary Friday retains both rate tiers');
check(rates(view('2026-11-28')), [['11am – 4pm', 45, 65], ['4pm – 1am next day', 55, 75]], 'School-break Saturday retains both ordinary tiers');
check(rates(view('2026-12-27')), [['noon – 7pm', 45, 65], ['7pm – 11pm', 35, 55]], 'Winter Sunday extends late tier to approved 11pm');
check([rates(view('2027-03-28')), view('2027-03-28').holiday, view('2027-03-28').twoHoursOnly],
  [[['noon – 7pm', 45, 65], ['7pm – 10pm', 35, 55]], false, true], 'Easter is ordinary Sunday pricing with two-hour-only online');
check([view('2027-04-07').holiday, view('2027-04-07').twoHoursOnly, view('2027-04-07').pennyExcluded], [false, false, false], 'Rules do not leak past spring break');

const jingle = view('2026-12-06');
check([jingle.kind, jingle.rows, jingle.event?.id, jingle.event?.public_url],
  ['event', [], 'jingle_bowl_2026', 'https://www.twistedpin.com/jingle-bowl/'], 'Jingle event policy wins over ordinary Sunday prices');
check(view('2026-12-06', { fetchedAt: '2026-12-06T10:00:00Z', hours: { sun: hours(0, 0, true) } }, at('2026-12-06T18:00:00Z')).kind,
  'event', 'Google Closed does not erase Jingle event admission');
check([view('2026-12-31').kind, view('2026-12-31').rows, view('2026-12-31').event?.admission],
  ['event', [], 'bowling_reservations_only'], 'NYE keeps narrow bowling-only admission and no hourly rows');

const fetchedAt = '2026-10-22T09:00:00Z';
const rolling = { fetchedAt, hours: {
  thu: hours(900, 1380), fri: hours(660, 1500), sat: hours(960, 1500),
  sun: hours(720, 1320), mon: hours(0, 0, true), tue: hours(900, 1320), wed: hours(900, 1200),
}, regularHours: { thu: hours(900, 1380), fri: hours(840, 1500), wed: hours(900, 1320) } };
check(view('2026-10-22', rolling).hours, '3pm – 11pm', 'Fresh first snapshot date uses live hours');
check(view('2026-10-28', rolling).hours, '3pm – 8pm', 'Fresh seventh snapshot date uses live hours');
check(view('2026-11-04', rolling).hours, '3pm – 10pm', 'Future Wednesday does not inherit this week early close');
check(view('2026-10-21', rolling).hours, '3pm – 10pm', 'Date before snapshot start does not inherit rolling hours');
check(view('2026-10-26', rolling).kind, 'closed', 'Fresh Google closure overrides an approved planned open date');
const updatedHoliday = view('2026-11-23', {
  fetchedAt: '2026-11-23T10:00:00Z', hours: { mon: hours(840, 1260) },
}, at('2026-11-23T18:00:00Z'));
check([updatedHoliday.hours, rates(updatedHoliday), updatedHoliday.holiday, updatedHoliday.twoHoursOnly],
  ['2pm – 9pm', [['2pm – 9pm', 50, 70]], true, true], 'Fresh Yext/Google hours correction wins while dated prices and duration remain');
check(view('2026-11-26', { fetchedAt: '2026-11-26T10:00:00Z', hours: { thu: hours(720, 1320) } }, at('2026-11-26T18:00:00Z')).kind,
  'closed', 'Approved hard closure cannot be reopened by a listing snapshot');
check(rates(view('2026-10-23', rolling)), [['11am – 5pm', 45, 65], ['5pm – 1am next day', 50, 70]], 'Ordinary early Friday extends only its first band');
check(rates(view('2026-10-24', rolling)), [['4pm – 1am next day', 55, 75]], 'Opening at Saturday tier transition removes earlier band');
check(rates(view('2026-10-23', { ...rolling, hours: { fri: hours(840, 960) } })), [['2pm – 4pm', 45, 65]], 'Early Friday close clamps first band and hides peak band');
check(rates(view('2026-10-23', { ...rolling, hours: { fri: hours(1080, 1500) } })), [['6pm – 1am next day', 50, 70]], 'Late Friday opening hides early band');
check(rates(view('2026-10-25', { ...rolling, hours: { sun: hours(1200, 1380) } })), [['8pm – 11pm', 35, 55]], 'Late Sunday opening uses only evening tier');
check(view('2026-10-23', rolling, at('2026-10-23T21:00:00Z')).hours, '2pm – 1am next day', 'Exactly 36-hour snapshot is stale');
check(view('2026-10-23', rolling, at('2026-10-22T08:59:59Z')).hours, '2pm – 1am next day', 'Future-fetched snapshot cannot masquerade as fresh');
check(view('2026-10-23', { ...rolling, fetchedAt: 'not-a-date' }).hours, '2pm – 1am next day', 'Invalid fetchedAt falls back to labeled regular hours');
check(view('2026-10-23', { ...rolling, hours: { fri: hours(0, 1800) } }).kind, 'unknown', 'Impossible live span does not advertise ordinary rates');
check(view('2026-10-23', { ...rolling, hours: { fri: hours(NaN, 1500) } }).kind, 'unknown', 'Malformed live time does not advertise ordinary rates');
check(view('2026-10-23', { regularHours: { fri: hours(0, 0, true) } }).kind, 'closed', 'Regular closed fallback never advertises rates');
check(/Regular hours and rates shown/.test(view('2026-11-04', rolling).note), true, 'Out-of-horizon fallback is explicitly qualified');

check(upcomingPennyExclusions(now), ['2026-11-25', '2026-12-23', '2026-12-30', '2027-03-31'], 'Four approved Penny exclusions shown in advance');
check(upcomingPennyExclusions(at('2026-11-26T05:59:59Z'))[0], '2026-11-25', 'Same-day exclusion remains until Chicago midnight');
check(upcomingPennyExclusions(at('2026-11-26T06:00:00Z')), ['2026-12-23', '2026-12-30', '2027-03-31'], 'Past Penny exclusion expires at Chicago midnight');
check(holidayPricingDates(now).length, 21, 'All approved upcoming hourly dates available');
check(holidayPricingDates(at('2027-04-07T05:00:00Z')), [], 'No holiday-rate links remain after selected season dates');
const expired = at('2027-06-01T17:00:00Z');
check(upcomingPennyExclusions(expired), [], 'Expired annual policy does not promise new Penny exclusions');
check(holidayPricingDates(expired), [], 'Expired annual policy does not roll to a new year');
check([view('2026-11-25', {}, expired).holiday, view('2026-11-25', {}, expired).twoHoursOnly, view('2026-11-25', {}, expired).pennyExcluded],
  [false, false, false], 'Expired policy is not reused as current pricing or reservations authority');
check([view('2026-12-06', {}, expired).kind, view('2026-12-06', {}, expired).rows], ['unknown', []], 'Expired event does not revert silently into ordinary event-day rates');
check([view('2027-11-25').holiday, view('2027-11-25').twoHoursOnly], [false, false], 'Next school year does not inherit selected dates');

if (failures.length) {
  console.error(`Pricing date: ${failures.length}/${checks} checks failed.\n${failures.join('\n\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Pricing date: ${checks} offline checks passed (rates, date-scoped hours, events, closures, Penny and expiry).`);
}
