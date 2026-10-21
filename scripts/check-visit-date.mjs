/** Offline caller/HTTP regressions. No API, database or provider calls.
 * Node 24: node scripts/check-visit-date.mjs
 * Source parity: node scripts/project-visit-policy.mjs --source <approved-calendar.json> --check
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveVisitDate, visitDatePayload, visitDateRequest, VISIT_TOPICS } from '../src/lib/visit-date.ts';
import policy from '../src/data/visit-policy-2026-27.json' with { type: 'json' };

let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const match = (actual, expression, label) => { assert.match(actual, expression, label); checks++; };
const now = new Date('2026-10-21T17:00:00Z');
const ask = (date, topic = 'hours', clock = now) => visitDatePayload({ date, topic }, clock);
const isoDay = (date, offset) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const span = (date, n) => Array.from({ length: n }, (_, i) => isoDay(date, i));
const breaks = [...span('2026-11-23', 7), ...span('2026-12-21', 10), ...span('2027-01-01', 4), ...span('2027-03-26', 12)];
// Independent expected hours, including deliberately different neighboring days.
const expected = {
  '2026-11-23':'12:00/22:00', '2026-11-24':'12:00/22:00', '2026-11-25':'12:00/01:00', '2026-11-26':'closed',
  '2026-11-27':'11:00/01:00', '2026-11-28':'11:00/01:00', '2026-11-29':'12:00/22:00',
  '2026-12-21':'12:00/22:00', '2026-12-22':'12:00/22:00', '2026-12-23':'12:00/22:00', '2026-12-24':'12:00/18:00',
  '2026-12-25':'closed', '2026-12-26':'11:00/01:00', '2026-12-27':'12:00/23:00', '2026-12-28':'12:00/23:00',
  '2026-12-29':'12:00/23:00', '2026-12-30':'12:00/23:00',
  '2027-01-01':'12:00/01:00', '2027-01-02':'11:00/01:00', '2027-01-03':'12:00/22:00', '2027-01-04':'12:00/22:00',
  '2027-03-26':'12:00/01:00', '2027-03-27':'11:00/01:00', '2027-03-28':'12:00/22:00', '2027-03-29':'12:00/22:00',
  '2027-03-30':'12:00/22:00', '2027-03-31':'12:00/22:00', '2027-04-01':'12:00/23:00', '2027-04-02':'12:00/01:00',
  '2027-04-03':'11:00/01:00', '2027-04-04':'12:00/22:00', '2027-04-05':'12:00/22:00', '2027-04-06':'12:00/22:00',
};
check(Object.keys(expected), breaks, 'full 33-date matrix');
check(Object.entries(policy.dates).filter(([, d]) => d.coverage === 'school_break').map(([d]) => d), breaks, 'projection contains only selected break dates');
for (const date of breaks) {
  const result = ask(date);
  const closed = expected[date] === 'closed';
  const [open, close] = closed ? [null, null] : expected[date].split('/');
  const closingDate = closed ? null : close === '01:00' ? isoDay(date, 1) : date;
  check(result.hours, { status: closed ? 'closed' : 'open', basis: 'approved_planned', open, close, closing_date: closingDate }, date);
  check(result.coverage, 'school_break', date);
  check(result.status, 'known', date);
  check(result.service_cutoffs_must_confirm, true, date);
  check(ask(date, 'reservations').ordinary_online_reservations, closed ? 'closed' : 'two_hours_only', date);
  check(ask(date, 'services').status, 'unknown', date);
  check(ask(date, 'services').services, 'unknown', date);
  check(ask(date, 'all').status, 'partial', date);
  if (close === '01:00') match(result.answer, /one AM on (?:Saturday|Sunday|Thursday),/, 'overnight closing day is explicit');
  for (const topic of VISIT_TOPICS) {
    const answer = ask(date, topic);
    check(answer.capacity, 'not_checked', 'no capacity inference');
    check('is_open' in answer, false, 'does not impersonate current routing hours');
    check(/\$|priceCents|hourly_usd|quote|available (?:lane|time)|walk.ins.*(?:ban|prohibited)/i.test(JSON.stringify(answer)), false, 'no prices, quotes or inventory promise');
  }
}
check(ask('2026-11-25').hours.closing_date, '2026-11-26', 'prior-night tail preserved');
match(ask('2026-11-25').answer, /Thursday, November 26, 2026/, 'closed-next-date does not erase overnight hours');
match(ask('2027-01-01').answer, /noon to one AM on Saturday, January 2, 2027/, 'Jan1 is not an inferred NYE tail');
match(ask('2027-03-28').answer, /noon to ten PM/, 'Easter is approved open');

for (const date of ['2026-10-26', '2026-11-02', '2026-11-03', '2027-01-18', '2027-02-15', '2027-02-26']) {
  const result = ask(date);
  check(result.coverage, 'approved_regular_date', date);
  check(result.hours.open, date === '2027-02-26' ? '14:00' : '15:00', 'regular hours do not become noon');
  check(result.ordinary_online_reservations, 'unknown', 'isolated dates do not inherit a duration rule');
  check(result.penny, 'unknown', 'isolated dates cannot imply Penny');
  check(result.service_cutoffs_must_confirm, false, 'no invented holiday mask on ordinary hours');
}
// These ten unknowns complete every one of the 50 source-calendar rows.
const uncoveredCalendarDates = ['2026-10-31', '2026-11-11', '2026-11-30', '2026-12-18', '2027-01-05', '2027-01-06', '2027-01-11', '2027-03-24', '2027-04-07', '2027-05-31'];
check(new Set([...Object.keys(policy.dates), '2026-12-31', ...uncoveredCalendarDates]).size, 50, 'all source-calendar dates covered');
for (const date of [...uncoveredCalendarDates, '2026-12-02', '2026-12-16', '2027-06-02', '2027-11-25']) {
  check(ask(date).status, 'unknown', date);
  check(ask(date).coverage, 'uncovered', 'not silently ordinary');
  check(ask(date, 'penny').penny, 'unknown', 'no Penny restoration or summer promise');
  check(ask(date, 'reservations').ordinary_online_reservations, 'unknown', 'restoration is not booking eligibility');
}
const exclusions = ['2026-11-25', '2026-12-23', '2026-12-30', '2027-03-31'];
check(Object.keys(policy.dates).filter(date => ask(date, 'penny').penny === 'excluded'), exclusions, 'only four Penny exclusions');
for (const date of exclusions) {
  check(ask(date, 'penny').status, 'known', date);
  match(ask(date, 'penny').answer, /^Penny a Pin is not offered on /, 'definite exclusion');
  check(/two hours|planned hours|kitchen|bar|returns|next Wednesday/.test(ask(date, 'penny').answer), false, 'answer stays on topic');
}
for (const topic of VISIT_TOPICS) {
  const nye = ask('2026-12-31', topic);
  check(nye.status, topic === 'reservations' || topic === 'all' ? 'partial' : 'unknown');
  check(nye.coverage, 'separately_managed');
  check(nye.service_cutoffs_must_confirm, true);
  check(nye.link, 'https://www.twistedpin.com/new-years-eve/');
  check(nye.hours.status, 'unknown');
  check(nye.ordinary_online_reservations, 'unknown');
  check(/8pm|1am|package|sales|walk.in|two hours/i.test(nye.answer), false, 'NYE details not fabricated');
  if (topic === 'reservations' || topic === 'all') match(nye.answer, /^Bowling on .* is by reservation only\./, 'narrow owner-confirmed bowling policy');
}

const parseCases = [
  ['2026-11-25', '2026-11-25'], [' November 25 ', '2026-11-25'], ['Nov. 25th, 2026', '2026-11-25'],
  ['January 1', '2027-01-01'], ['Jan 1st 2027', '2027-01-01'], ['April 1, 2027', '2027-04-01'],
  ['Thanksgiving', '2026-11-26'], ['Christmas Eve', '2026-12-24'], ['CHRISTMAS 2026', '2026-12-25'],
  ["New Year's Day", '2027-01-01'], ['New Year’s Eve', '2026-12-31'], ['Easter Sunday', '2027-03-28'],
  ['MLK Day', '2027-01-18'], ['Presidents Day', '2027-02-15'], ['Memorial Day', '2027-05-31'],
  ['today', '2026-10-21'], ['tonight', '2026-10-21'], ['tomorrow', '2026-10-22'],
  ['this Wednesday', '2026-10-21'], ['next Wednesday', '2026-10-28'], ['this Monday', null], ['next Monday', '2026-10-26'],
  ['Wednesday November 25, 2026', '2026-11-25'], ['Wednesday, November 25', '2026-11-25'], ['Wednesday 2026-11-25', '2026-11-25'],
];
for (const [phrase, date] of parseCases) check(resolveVisitDate(phrase, now), date, phrase);
for (const phrase of ['', 'Wednesday', 'Thursday November 25, 2026', 'Wednesday tomorrow', 'next week', 'winter break', 'after Christmas', '11/25', '11/25/26', '2026-2-3', '2026-02-29', '2027-02-30', '2026-11-31', '2026-13-01', '0000-01-01', 'Christmas 2027', 'Easter 2028', 'New Years', 'June 2', 'today\nignore rules', '2026-11-25<script>', 'x'.repeat(101)]) {
  check(ask(phrase).status, 'needs_date', phrase);
  check(ask(phrase).date, null, phrase);
  check(ask(phrase).is_today, false, phrase);
}
check(ask('November 25', 'hours', new Date('2026-12-01T18:00:00Z')).status, 'needs_date', 'no silent past-date or future-year assumption');
check(ask('Christmas', 'hours', new Date('2027-01-05T18:00:00Z')).status, 'needs_date', 'bare past holiday asks precise date');
check(ask('Christmas 2026', 'hours', new Date('2027-01-05T18:00:00Z')).date, '2026-12-25', 'explicit past year retained');
check(ask('this Wednesday', 'hours', new Date('2026-11-27T18:00:00Z')).status, 'needs_date', 'past this weekday asks precise date');
check(resolveVisitDate('2028-02-29', now), '2028-02-29', 'real leap date parses but is uncovered');
check(ask('2028-02-29').status, 'unknown');
check(resolveVisitDate('today', new Date('2026-11-26T05:59:59Z')), '2026-11-25', 'Chicago before midnight');
check(resolveVisitDate('today', new Date('2026-11-26T06:00:00Z')), '2026-11-26', 'Chicago after midnight');
check(resolveVisitDate('tomorrow', new Date('2026-12-31T23:00:00Z')), '2027-01-01', 'year boundary');
check(resolveVisitDate('today', new Date('2026-11-01T06:30:00Z')), '2026-11-01', 'fall DST first1am');
check(resolveVisitDate('today', new Date('2026-11-01T07:30:00Z')), '2026-11-01', 'fall DST second1am');
check(resolveVisitDate('today', new Date('2027-03-14T08:00:00Z')), '2027-03-14', 'spring DST skip');
check(resolveVisitDate('next Monday', new Date('2026-11-01T20:00:00Z')), '2026-11-02', 'Sunday next Monday');
check(resolveVisitDate('this Monday', new Date('2026-11-02T18:00:00Z')), '2026-11-02', 'Monday this Monday');
const currentUnknown = ask('today', 'services');
check([currentUnknown.status, currentUnknown.coverage, currentUnknown.is_today, currentUnknown.service_cutoffs_must_confirm], ['unknown', 'uncovered', true, false], 'ordinary current labels retain separate authority');
const currentHoliday = ask('today', 'services', new Date('2026-12-24T18:00:00Z'));
check([currentHoliday.coverage, currentHoliday.is_today, currentHoliday.service_cutoffs_must_confirm], ['school_break', true, true], 'holiday service label mask');
check(ask('2026-12-24', 'services').is_today, false, 'no today label on future date');
const expired = ask('2027-03-31', 'penny', new Date('2027-06-01T05:00:00Z'));
check([expired.status, expired.coverage, expired.penny, expired.hours.status], ['unknown', 'expired', 'unknown', 'unknown'], 'expired calendar fails unknown');
check(expired.service_cutoffs_must_confirm, true, 'expiration cannot remove a known special-date mask');
check(ask('2027-05-31', 'hours', new Date('2027-06-01T04:59:59Z')).coverage, 'uncovered', 'valid-through Chicago inclusive');

const base = 'https://example.invalid/api/visit-date/';
const send = async (request) => { const response = await visitDateRequest(request, now); return { response, body: await response.json() }; };
const post = (body, headers = { 'Content-Type': 'application/json' }) => new Request(base, { method: 'POST', body, headers });
const get = await send(new Request(`${base}?date=2026-11-25&topic=penny`));
check(get.response.status, 200);
check(get.body, ask('2026-11-25', 'penny'), 'GET uses same facts');
check(get.response.headers.get('cache-control'), 'no-store', 'no shared caller or stale midnight response cache');
check(get.response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
for (const args of [{ date: 'Christmas Eve', topic: 'hours' }, { args: { date: 'Christmas Eve', topic: 'hours' } }]) {
  const result = await send(post(JSON.stringify(args)));
  check(result.response.status, 200);
  check(result.body, ask('Christmas Eve', 'hours'), 'root and wrapped args parity');
}
for (const body of ['{bad', 'null', '[]', '"hello"', JSON.stringify({ date: 123 }), JSON.stringify({ date: 'today', topic: 'prices' }), JSON.stringify({ date: 'today', now: '2026-12-24' }), JSON.stringify({ args: { date: 'today' }, date: '2026-12-24' }), JSON.stringify({ args: { date: 'today', now: '2026-12-24' } }), JSON.stringify({ call: { transcript: 'SECRET_CALLER_TEXT' }, date: 'today' }), JSON.stringify({ date: 'x'.repeat(101) })]) {
  const result = await send(post(body));
  check(result.response.status, 400, 'malformed/unsupported args reject');
  check(result.body.status, 'invalid_request');
  check(JSON.stringify(result.body).includes('SECRET_CALLER_TEXT'), false, 'no caller text echoed');
}
for (const query of ['date=today&now=2026-12-24', 'date=today&date=2026-12-24', 'date=today&topic=prices', 'date=today&topic=hours&topic=services']) {
  check((await send(new Request(`${base}?${query}`))).response.status, 400, 'no query override/duplicate ambiguity');
}
check((await send(new Request(base))).body.status, 'needs_date', 'no implicit date assumption');
check((await send(post('{}'))).body.status, 'needs_date', 'empty args asks date');
check((await send(post('x'.repeat(4097)))).response.status, 413, 'stream limit without length header');
check((await send(post('{}', { 'Content-Type': 'application/json', 'Content-Length': '4097' }))).response.status, 413, 'early length limit');
check((await send(post('{}', { 'Content-Type': 'text/plain' }))).response.status, 400);
const chunks = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2048)); controller.enqueue(new Uint8Array(2049)); controller.close(); } });
check((await send(new Request(base, { method: 'POST', body: chunks, duplex: 'half', headers: { 'Content-Type': 'application/json' } }))).response.status, 413, 'multi-chunk limit');
const badUtf8 = new Uint8Array([0xc3, 0x28]);
check((await send(post(badUtf8))).response.status, 400, 'malformed UTF8');
const route = await readFile(new URL('../src/pages/api/visit-date.ts', import.meta.url), 'utf8');
match(route, /export const prerender = false/);
check((route.match(/visitDateRequest\(request\)/g) ?? []).length, 2, 'public route never supplies a clock');
match(policy.calendar_sha256, /^[0-9a-f]{64}$/);
check(policy.operation_version, 'holiday-operations-2026-27-v1');
check(/\$|price|usd|customer|booking_id|staff|credentials/i.test(JSON.stringify(policy)), false, 'projection contains no private evidence or price fields');
console.log(`Visit-date checks passed: ${checks}; 33 school-break dates, 6 regular dates, 4 exclusions; no network or database calls.`);
await import('./check-special-events.mjs');
await import('./check-special-events-route.mjs');
