/** Offline event/context regressions. Future readiness/staffing below is
 * deliberately synthetic, NOT the proposed Jingle schedule or approved hours.
 * No network, Google, TPRS, caller data, provider or booking mutations.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import source from '../src/data/special-events-2026.json' with { type: 'json' };
import { currentSpecialEventContext, specialEventContext, specialEventAnswer, resolveSpecialEventAlias } from '../src/lib/special-events.ts';
import { visitDatePayload, visitDateRequest, VISIT_TOPICS } from '../src/lib/visit-date.ts';

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const match = (actual, expected, message) => { assert.match(actual, expected, message); checks++; };
const before = new Date('2026-10-21T19:00:00Z');
const at = time => new Date(time);
const ask = (date, topic = 'all', clock = before) => visitDatePayload({ date, topic }, clock);
const jingle = ask('Jingle Bowl');
eq([jingle.date, jingle.status, jingle.coverage], ['2026-12-06', 'partial', 'separately_managed']);
eq(jingle.event.id, 'jingle_bowl_2026');
eq(jingle.event.admission, 'event_reservations_only');
eq(jingle.event.ordinary_visits, 'closed');
eq(jingle.ordinary_online_reservations, 'closed');
eq(jingle.hours.status, 'unknown', 'ordinary closure does not invent all-day event hours');
eq(jingle.event.page_public, false);
eq(jingle.event.public_url, null);
eq(jingle.event.sales_open_at, null);
eq(jingle.event.sales_open_answer, null);
eq(jingle.event.booking_status, 'unverified');
eq(jingle.event.sessions_status, 'pending');
eq(jingle.event.sessions, []);
eq(jingle.service_cutoffs_must_confirm, true);
match(jingle.answer, /Jingle Bowl.*Sunday, December 6, 2026.*event reservations only all day/);
match(jingle.answer, /Regular visits aren't available/);
for (const topic of VISIT_TOPICS) {
  const result = ask('2026-12-06', topic);
  const serialized = JSON.stringify({ event: result.event, answer: result.answer, link: result.link });
  eq(result.event.name, 'Jingle Bowl');
  eq(result.capacity, 'not_checked');
  eq(result.service_cutoffs_must_confirm, true);
  eq(/jingle-bowl\/|39|30.minute|thirty.minute|\$|priceCents|cancel(?:ed|led)|all.day.*closed|New Year's Eve|NYE/i.test(serialized), false, 'no protected link/proposals/NYE conflation');
  eq('is_open' in result, false, 'event lookup does not replace current-open status');
}
match(ask('Jingle Bowl', 'hours').answer, /Session, entry and closing times still need confirmation/);
eq(ask('Jingle Bowl', 'penny').status, 'unknown');
eq(ask('Jingle Bowl', 'services').status, 'unknown');
match(ask('Jingle Bowl', 'services').answer, /don't have confirmed kitchen, bar or Beer Wall/);
eq(resolveSpecialEventAlias('jingle bowl 2026', before), '2026-12-06');
eq(resolveSpecialEventAlias('jingle bowl 2027', before), null);
eq(ask('Jingle Bowl 2027').status, 'needs_date');
eq(ask('Jingle Bowl', 'all', at('2026-12-07T18:00:00Z')).status, 'needs_date', 'no automatic next-year event');
eq(ask('2027-12-06').event, null);
eq(ask('2027-12-06').status, 'unknown');
for (const date of ['2026-12-05', '2026-12-07', '2026-12-30', '2027-01-01']) eq(ask(date).event, null, 'neighboring dates keep their own policies');
eq(ask('2027-01-01').hours.open, '12:00');
eq(ask('2026-12-30').ordinary_online_reservations, 'two_hours_only');
eq(ask('2026-12-30').penny, 'excluded');
const expired = ask('2026-12-06', 'all', at('2026-12-08T06:00:00Z'));
eq([expired.status, expired.coverage, expired.event.status, expired.event.admission], ['unknown', 'expired', 'expired', 'unknown']);
eq(expired.event.public_url, null);
eq(expired.event.sessions, []);

const nyeBefore = ask('NYE', 'reservations', at('2026-11-18T14:59:59Z'));
eq(nyeBefore.event.id, 'nye_2026');
eq(nyeBefore.event.admission, 'bowling_reservations_only');
eq(nyeBefore.event.ordinary_visits, 'unknown', 'no building-wide bar/arcade admission ruling');
eq(nyeBefore.event.booking_status, 'not_open');
eq(nyeBefore.event.sales_open_at, '2026-11-18T15:00:00Z');
eq(nyeBefore.event.public_url, 'https://www.twistedpin.com/new-years-eve/');
match(nyeBefore.answer, /Wednesday, November 18, 2026 at nine AM Central time/);
eq(ask('NYE', 'reservations', at('2026-11-18T15:00:00Z')).event.booking_status, 'unverified', 'clock does not complete launch gates');
match(ask('NYE', 'reservations', at('2026-11-18T15:00:01Z')).answer, /cannot confirm booking is ready/);
eq(ask('NYE', 'hours').hours.status, 'unknown');
eq(ask('NYE', 'services').services, 'unknown');

// Future reviewed states, with deliberately odd synthetic times to avoid
// publishing or testing against the protected event's proposed sessions.
const ready = structuredClone(source);
const future = ready.records[0];
future.page_public = true;
future.sales_open_at = '2026-11-01T18:00:00Z';
future.booking_ready_verified = true;
future.session_cutoffs_verified = true;
future.sessions = [
  { starts_at: '2026-12-06T18:07:00Z', booking_closes_at: '2026-12-06T17:52:00Z' },
  { starts_at: '2026-12-06T20:13:00Z', booking_closes_at: '2026-12-06T19:48:00Z' },
];
const readyAt = time => specialEventContext('2026-12-06', at(time), ready);
eq(readyAt('2026-11-01T17:59:59Z').booking_status, 'not_open', 'verified system still honors future opening');
eq(readyAt('2026-11-01T18:00:00Z').booking_status, 'verified');
eq(readyAt('2026-11-01T18:00:00Z').public_url, 'https://www.twistedpin.com/jingle-bowl/');
eq(readyAt('2026-12-06T17:51:59Z').sessions.map(s => s.booking_status), ['before_cutoff', 'before_cutoff']);
eq(readyAt('2026-12-06T17:52:00Z').sessions.map(s => s.booking_status), ['cutoff_passed', 'before_cutoff']);
eq(readyAt('2026-12-06T17:52:00Z').booking_status, 'verified', 'one cutoff does not end every session');
eq(readyAt('2026-12-06T19:48:00Z').booking_status, 'ended');
match(specialEventAnswer(readyAt('2026-12-06T19:48:00Z'), 'reservations'), /cutoffs have passed/);
match(readyAt('2026-12-06T17:52:00Z').sessions[0].answer, /twelve oh seven PM Central time/);
match(readyAt('2026-12-06T17:52:00Z').sessions[0].answer, /eleven fifty two AM Central time.*cutoff has passed/);
eq(/available|sold out|capacity|\$/.test(JSON.stringify(readyAt('2026-12-06T17:51:59Z').sessions)), false, 'cutoff is not inventory');

const notReady = structuredClone(ready);
notReady.records[0].booking_ready_verified = false;
eq(specialEventContext('2026-12-06', at('2026-12-01T18:00:00Z'), notReady).booking_status, 'unverified', 'public page does not prove launch readiness');
notReady.records[0].page_public = false;
eq(specialEventContext('2026-12-06', at('2026-12-01T18:00:00Z'), notReady).public_url, null);
notReady.records[0].session_cutoffs_verified = false;
eq(specialEventContext('2026-12-06', at('2026-12-01T18:00:00Z'), notReady).sessions, [], 'unverified session arrays never published');
notReady.records[0].confirmed = false;
const unconfirmed = specialEventContext('2026-12-06', before, notReady);
eq([unconfirmed.status, unconfirmed.admission, unconfirmed.ordinary_visits], ['unconfirmed', 'unknown', 'unknown']);
eq([unconfirmed.public_url, unconfirmed.sales_open_at], [null, null]);
eq(unconfirmed.sessions, []);
eq(currentSpecialEventContext(at('2026-12-06T18:00:00Z'), notReady).transfer.allowed, false);
const malformed = structuredClone(ready);
malformed.records[0].sessions[0].starts_at = '2026-02-30T18:07:00Z';
eq(specialEventContext('2026-12-06', before, malformed).sessions, [], 'normalized nonexistent dates are invalid');
malformed.records[0].page_url = 'https://example.invalid/private';
eq(specialEventContext('2026-12-06', before, malformed), null, 'untrusted configuration cannot publish arbitrary links');
eq(currentSpecialEventContext(at('2026-12-06T18:00:00Z'), { ...source, schema_version: 2 }).transfer.allowed, false);

const current = currentSpecialEventContext(at('2026-12-06T18:00:00Z'));
eq(current.date, '2026-12-06');
eq(current.event.admission, 'event_reservations_only');
eq(current.transfer, { allowed: false, reason: 'staffed_hours_unconfirmed', staffed_until: null });
eq(current.generated_at, '2026-12-06T18:00:00.000Z');
eq(current.valid_until, '2026-12-06T18:01:00.000Z');
eq(current.timezone, 'America/Chicago');
eq('is_open' in current, false);
eq(currentSpecialEventContext(at('2026-12-06T05:59:59Z')).event, null, 'Saturday late-night not relabeled Jingle');
const afterMidnight = currentSpecialEventContext(at('2026-12-06T06:30:00Z'));
eq(afterMidnight.event.id, 'jingle_bowl_2026');
eq(afterMidnight.transfer.allowed, false, 'calendar event context cannot invent staffed midnight entry');
eq(currentSpecialEventContext(at('2026-12-06T05:59:59Z')).valid_until, '2026-12-06T06:00:00.000Z', 'freshness clips midnight');
eq(currentSpecialEventContext(at('2026-12-07T06:00:00Z')).event, null, 'no inferred next-day staffing');
eq(currentSpecialEventContext(at('2027-12-06T18:00:00Z')).event, null, 'no next-year repeat');

const staffed = structuredClone(ready);
staffed.records[0].approved_staffed_intervals = [{ starts_at: '2026-12-06T17:03:00Z', ends_at: '2026-12-06T23:11:00Z' }];
const staffedAt = time => currentSpecialEventContext(at(time), staffed);
eq(staffedAt('2026-12-06T17:02:59Z').transfer.allowed, false);
eq(staffedAt('2026-12-06T17:02:59Z').valid_until, '2026-12-06T17:03:00.000Z', 'freshness clips staffed start');
eq(staffedAt('2026-12-06T17:03:00Z').transfer, { allowed: true, reason: 'confirmed_staffed_interval', staffed_until: '2026-12-06T23:11:00Z' });
eq(staffedAt('2026-12-06T23:10:59Z').transfer.allowed, true);
eq(staffedAt('2026-12-06T23:10:59Z').valid_until, '2026-12-06T23:11:00.000Z', 'no stale positive transfer after closing');
eq(staffedAt('2026-12-06T23:11:00Z').transfer.allowed, false);
eq(staffedAt('2026-12-06T23:11:00Z').transfer.reason, 'outside_confirmed_staffed_interval');
staffed.records[0].approved_staffed_intervals.push({ starts_at: 'not-confirmed', ends_at: '2026-12-06T23:59:00Z' });
eq(staffedAt('2026-12-06T18:00:00Z').transfer.allowed, false, 'malformed interval set fails closed');
const overnight = structuredClone(source);
overnight.records[1].approved_staffed_intervals = [{ starts_at: '2027-01-01T03:17:00Z', ends_at: '2027-01-01T06:43:00Z' }];
const tail = currentSpecialEventContext(at('2027-01-01T06:30:00Z'), overnight);
eq([tail.date, tail.event.date, tail.event.id, tail.transfer.allowed], ['2027-01-01', '2026-12-31', 'nye_2026', true], 'explicit approved overnight staffing keeps originating event');
eq(currentSpecialEventContext(at('2027-01-01T06:43:00Z'), overnight).event, null);
eq(currentSpecialEventContext(at('2027-01-01T06:30:00Z')).event, null, 'no tail invented without approved intervals');

const request = new Request('https://example.invalid/api/visit-date/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: 'Jingle Bowl', topic: 'reservations' }) });
const response = await visitDateRequest(request, before);
eq(response.status, 200);
eq((await response.json()).event.public_url, null);
const clockOverride = new Request('https://example.invalid/api/visit-date/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: 'Jingle Bowl', topic: 'reservations', booking_ready_verified: true }) });
eq((await visitDateRequest(clockOverride, before)).status, 400, 'no caller-provided event readiness');
const frozen = await readFile(new URL('../src/data/visit-policy-2026-27.json', import.meta.url));
eq(createHash('sha256').update(JSON.stringify(JSON.parse(frozen))).digest('hex'), '7b087e24ac44f35db679bbf479525b756d1faff69e2bc3d18c8352cf63f8de60', 'frozen school-break projection unchanged');
eq(source.records.every(row => row.approved_staffed_intervals.length === 0 && row.sessions.length === 0), true, 'current source carries no provisional times');
eq(/\$|price|capacity|customer|staff_id|password/i.test(JSON.stringify(source)), false, 'only public-safe operating facts');
console.log(`Special-event checks passed: ${checks}; synthetic readiness/staffing only, no network or database calls.`);
