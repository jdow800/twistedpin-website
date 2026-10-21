/**
 * Narrow, deterministic public projection. No database or network access.
 *
 * node scripts/project-visit-policy.mjs --source <TPRS>/docs/holiday-operations-2026-27/calendar.json [--check]
 *
 * Read CURRENT-STATUS.md and RUNBOOK.md beside the source before approving a
 * new projection. The raw calendar includes historical proposal labels; only
 * applied/verified school-break rows and explicit approved regular hours pass.
 * A changed selection/count requires review here, not automatic publication.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const index = args.indexOf('--source');
if (index < 0 || !args[index + 1] || args.some((a, i) => !['--source', '--check'].includes(a) && i !== index + 1)) {
  throw new Error('Usage: node scripts/project-visit-policy.mjs --source <approved-calendar.json> [--check]');
}
const raw = await readFile(args[index + 1]);
const calendar = JSON.parse(raw.toString('utf8'));
assert.equal(calendar.timezone, 'America/Chicago');
const rows = calendar.rows;
const applied = rows.filter(row => row.publication?.tprs === 'applied_verified');
assert.equal(applied.length, 33, 'Reviewed scope must remain exactly 33 dates');
assert.equal(applied.filter(row => row.closed).length, 2);
const regular = rows.filter(row => row.hours_approved && row.hours_status === 'regular_confirmed' && row.open && row.close && row.closing_date);
assert.equal(regular.length, 6, 'Only the six explicit, approved regular-hour dates are projected');
const dates = {};
for (const row of [...applied, ...regular].sort((a, b) => a.date.localeCompare(b.date))) {
  assert.equal(row.hours_approved, true);
  const schoolBreak = row.publication.tprs === 'applied_verified';
  assert.ok(!schoolBreak || row.ordinary_online_duration === (row.closed ? 'none' : '2h_only'));
  assert.ok(row.closed || (/^\d\d:\d\d$/.test(row.open) && /^\d\d:\d\d$/.test(row.close) && row.closing_date));
  dates[row.date] = {
    coverage: schoolBreak ? 'school_break' : 'approved_regular_date',
    hours: { status: row.closed ? 'closed' : 'open', open: row.open, close: row.close, closing_date: row.closing_date },
    ordinary_online_reservations: schoolBreak ? (row.closed ? 'closed' : 'two_hours_only') : 'unknown',
    penny: row.penny === 'excluded_by_school_break_policy' ? 'excluded' : 'unknown',
  };
}
assert.deepEqual(Object.entries(dates).filter(([, row]) => row.penny === 'excluded').map(([date]) => date),
  ['2026-11-25', '2026-12-23', '2026-12-30', '2027-03-31']);
assert.equal(rows.find(row => row.date === '2026-12-31').hours_status, 'separate_project');
const projection = {
  schema_version: 1,
  operation_version: 'holiday-operations-2026-27-v1',
  source: 'TPRS docs/holiday-operations-2026-27/calendar.json; CURRENT-STATUS.md and RUNBOOK.md govern approval',
  calendar_sha256: createHash('sha256').update(raw).digest('hex'),
  approved_on: '2026-10-20',
  timezone: 'America/Chicago',
  valid_from: '2026-10-26',
  valid_through: '2027-05-31',
  separately_managed_dates: ['2026-12-31'],
  dates,
};
const target = new URL('../src/data/visit-policy-2026-27.json', import.meta.url);
const output = `${JSON.stringify(projection, null, 2)}\n`;
if (args.includes('--check')) {
  assert.equal(await readFile(target, 'utf8'), output, 'Projection differs from its reviewed source');
  console.log('Visit policy projection matches: 33 school-break dates, 6 approved regular dates, 4 Penny exclusions.');
} else {
  await writeFile(target, output);
  console.log('Wrote the public visit policy projection. Review the diff before publishing.');
}
