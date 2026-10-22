/**
 * Offline annual pricing scope check. No network, database or payment calls.
 *
 * node scripts/check-pricing-policy.mjs
 * node scripts/check-pricing-policy.mjs --source <TPRS>/docs/holiday-operations-2026-27/calendar.json
 *
 * --source also verifies the entire deterministic projection against the
 * approved source calendar. The Website worktree need not sit beside TPRS;
 * pass the absolute calendar path from the maintained release-record checkout.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import policy from '../src/data/visit-policy-2026-27.json' with { type: 'json' };
import { visitDatePayload } from '../src/lib/visit-date.ts';

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--source'),
  'Usage: node scripts/check-pricing-policy.mjs [--source <approved-calendar.json>]');
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const expected = [
  '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27',
  '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24',
  '2026-12-28', '2026-12-29', '2026-12-30',
  '2027-01-01', '2027-01-04',
  '2027-03-26', '2027-03-29', '2027-03-30', '2027-03-31',
  '2027-04-01', '2027-04-02', '2027-04-05', '2027-04-06',
];
const fridayDates = ['2026-11-27', '2027-01-01', '2027-03-26', '2027-04-02'];
const pennyDates = ['2026-11-25', '2026-12-23', '2026-12-30', '2027-03-31'];
const rows = Object.entries(policy.dates);
const priced = rows.filter(([, row]) => row.walk_in_hourly !== undefined);
check(priced.map(([date]) => date), expected, 'Exact approved 21-date hourly override set');
check(rows.filter(([, row]) => row.penny === 'excluded').map(([date]) => date), pennyDates, 'Four Penny exclusions');
check(rows.filter(([, row]) => row.coverage === 'school_break').length, 33, 'Original school-break scope preserved');
check(rows.filter(([, row]) => row.ordinary_online_reservations === 'two_hours_only').length, 31, '31 open two-hour-only dates');
check(rows.filter(([, row]) => row.hours.status === 'closed').map(([date]) => date), ['2026-11-26', '2026-12-25'], 'Thanksgiving and Christmas closures');
for (const [date, row] of priced) {
  check(row.walk_in_hourly, { traditional: 50, suite: 70 }, `${date}: approved per-lane hourly amounts`);
  check(row.coverage, 'school_break', `${date}: reviewed school-break selection`);
  check(row.hours.status, 'open', `${date}: priced day is open`);
  check(row.ordinary_online_reservations, 'two_hours_only', `${date}: duration policy unchanged`);
}
check(priced.filter(([date]) => new Date(`${date}T12:00:00Z`).getUTCDay() === 5).map(([date]) => date), fridayDates,
  'Only four Fridays extend the hourly rate across the day');
for (const [date, row] of rows) {
  if (row.coverage === 'approved_regular_date' || row.hours.status === 'closed' || [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) {
    check(Object.hasOwn(row, 'walk_in_hourly'), false, `${date}: no invented isolated-day, closure or weekend override`);
  }
  const response = visitDatePayload({ date, topic: 'all' }, new Date('2026-10-22T17:00:00Z'));
  check(/walk_in_hourly|hourly_usd|priceCents|\$/.test(JSON.stringify(response)), false,
    `${date}: Roy visit-date API remains price-free`);
}
for (const date of ['2026-12-06', '2026-12-31', '2027-04-07', '2027-05-31', '2027-11-25']) {
  check(policy.dates[date]?.walk_in_hourly, undefined, `${date}: event, uncovered or next-season date has no hourly override`);
}

if (args.length) {
  const raw = await readFile(args[1]);
  const source = JSON.parse(raw.toString('utf8'));
  check(policy.calendar_sha256, createHash('sha256').update(raw).digest('hex'), 'Retained exact source fingerprint');
  const approved = source.rows.filter(row => row.publication?.tprs === 'applied_verified');
  check(approved.filter(row => ['H', 'HF'].includes(row.walk_in_profile)).map(row => row.date), expected,
    'Source selects hourly overrides explicitly, not by weekday inference');
  check(approved.filter(row => row.online_package_profile === 'holiday_proposed').length, 17,
    'Only 17 source dates use online holiday package pricing');
  check(approved.filter(row => row.walk_in_profile === 'HF').map(row => [row.date, row.online_package_profile]),
    fridayDates.map(date => [date, 'normal_friday']), 'Friday online packages retain their normal Friday tiers');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./project-visit-policy.mjs', import.meta.url)), '--source', args[1], '--check'],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `Deterministic projection check failed: ${result.stdout}${result.stderr}`);
  checks++;
}
console.log(`Pricing policy: ${checks} offline checks passed (21 hourly dates, 4 Penny exclusions, unchanged visit-date response).`);
