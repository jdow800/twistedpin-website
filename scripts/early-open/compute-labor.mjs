// Early-open analysis — labor cost in the 9am→open window.
//
//   node scripts/early-open/compute-labor.mjs <punch-json-1> [<punch-json-2> ...]
//
// Accepts one or more n8n webhook responses (7shifts time_punches pages),
// merges + dedupes by punch id, filters by each punch's actual clocked_in
// date, prorates each punch's overlap with the early window, and costs it at
// hourly_wage. wage=0 punches (salaried mgrs) are tracked as uncosted hours.

import { readFileSync } from 'node:fs';

const TZ = 'America/Chicago';
const WINDOW_START_MIN = 9 * 60;

// Mon–Thu open 3pm, Fri open 2pm.
const DAYS = {
  '2026-06-01': 15 * 60, '2026-06-02': 15 * 60, '2026-06-03': 15 * 60,
  '2026-06-04': 15 * 60, '2026-06-05': 14 * 60, '2026-06-08': 15 * 60,
  '2026-06-09': 15 * 60, '2026-06-10': 15 * 60, '2026-06-11': 15 * 60,
  '2026-06-12': 14 * 60,
};

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
function chicago(iso) {
  const p = Object.fromEntries(
    partsFmt.formatToParts(new Date(iso))
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, min: (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10) };
}
const usd = (cents) => '$' + (cents / 100).toFixed(2);

// ── merge + dedupe across pages ────────────────────────────────────────────
const byId = new Map();
let lastCursor = null;
for (const file of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const arr = raw?.data?.data?.data;
  if (!Array.isArray(arr)) throw new Error(`no punches array in ${file}`);
  lastCursor = raw?.data?.data?.meta?.cursor ?? lastCursor;
  for (const p of arr) byId.set(p.id, p);
}
const punches = [...byId.values()];

// ── coverage diagnostics ───────────────────────────────────────────────────
const ids = punches.map((p) => p.id).sort((a, b) => a - b);
const dates = punches.filter((p) => p.clocked_in).map((p) => chicago(p.clocked_in).date).sort();
console.log(`Merged ${punches.length} unique punches.`);
console.log(`  id range:   ${ids[0]} … ${ids[ids.length - 1]}`);
console.log(`  date range: ${dates[0]} … ${dates[dates.length - 1]}`);
console.log(`  next cursor still set? ${lastCursor?.next ? 'YES — more pages exist' : 'no'}\n`);

// ── per-day window labor ───────────────────────────────────────────────────
const perDay = {};
for (const d of Object.keys(DAYS)) perDay[d] = { costCents: 0, mins: 0, users: new Set(), uncostedMins: 0, uncostedUsers: new Set() };
const byDept = {}; // department_id -> { costCents, mins }
let brokeOut = false;

for (const p of punches) {
  if (p.deleted || !p.clocked_in || !p.clocked_out) continue;
  if (p.location_id && p.location_id !== 335034) continue;
  const ci = chicago(p.clocked_in);
  const endMin = DAYS[ci.date];
  if (endMin === undefined) continue;
  const co = chicago(p.clocked_out);
  const coMin = co.min + (co.date > ci.date ? 1440 : 0);
  const overlap = Math.max(0, Math.min(coMin, endMin) - Math.max(ci.min, WINDOW_START_MIN));
  if (overlap <= 0) continue;
  if (Array.isArray(p.breaks) && p.breaks.length) brokeOut = true;
  const wage = typeof p.hourly_wage === 'number' ? p.hourly_wage : 0;
  const b = perDay[ci.date];
  b.mins += overlap;
  if (wage > 0) { b.costCents += (overlap / 60) * wage; b.users.add(p.user_id); }
  else { b.uncostedMins += overlap; b.uncostedUsers.add(p.user_id); }

  const dk = p.department_id ?? 'unknown';
  if (!byDept[dk]) byDept[dk] = { costCents: 0, mins: 0 };
  byDept[dk].mins += overlap;
  byDept[dk].costCents += (overlap / 60) * (wage > 0 ? wage : 0);
}

if (brokeOut) console.log('⚠ Some punches have non-empty breaks — not subtracted; review if material.\n');

let totCost = 0, totMins = 0, totUncosted = 0;
const out = [];
for (const day of Object.keys(DAYS)) {
  const b = perDay[day];
  totCost += b.costCents; totMins += b.mins; totUncosted += b.uncostedMins;
  out.push({ day, costCents: Math.round(b.costCents), hours: +(b.mins / 60).toFixed(2), heads: b.users.size, uncostedHours: +(b.uncostedMins / 60).toFixed(2) });
  console.log(
    `${day}  labor ${usd(b.costCents).padStart(9)}  | ${(b.mins / 60).toFixed(2).padStart(6)} hrs · ${b.users.size} staff` +
    (b.uncostedMins ? `  | +${(b.uncostedMins / 60).toFixed(2)} uncosted mgr hrs` : ''),
  );
}
console.log('\n────────────────────────────────────────────────────────');
console.log(`EARLY WINDOW (9am→open) LABOR, 10 days:  ${usd(totCost)}  (${(totMins / 60).toFixed(1)} paid hrs` +
  (totUncosted ? ` + ${(totUncosted / 60).toFixed(1)} uncosted mgr hrs` : '') + ')');
const DEPT_NAMES = { 493875: 'Kitchen', 493876: 'Bar', 493877: 'Bowling/Arcade' };
console.log('\nBy department (9am→open, all 10 days):');
for (const [d, v] of Object.entries(byDept).sort((a, b) => b[1].costCents - a[1].costCents)) {
  const name = DEPT_NAMES[d] || `dept ${d}`;
  const pct = totCost ? ((v.costCents / totCost) * 100).toFixed(0) : '0';
  console.log(`  ${name.padEnd(16)} ${usd(v.costCents).padStart(9)}  (${(v.mins / 60).toFixed(1).padStart(5)} hrs · ${pct}%)`);
}

console.log('\n__JSON__' + JSON.stringify({ perDay: out, totCostCents: Math.round(totCost), totMins, totUncosted, byDept }));
