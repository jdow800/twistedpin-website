// Execute the actual SSR hours route with an offline Google fixture and a
// controlled clock. Program collection is empty; all date/event/hours logic
// is the production module. No HTTP server or external requests are needed.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const route = await readFile(new URL('../src/pages/api/hours.ts', import.meta.url), 'utf8');
const syntheticHours = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map(day => [day, { label: 'Closed', closed: true, openMinutes: 0, closeMinutes: 0, openLabel: '', closeLabel: '' }]));
syntheticHours.sat = { label: '11am to 1am', closed: false, openMinutes: 660, closeMinutes: 1500, openLabel: '11am', closeLabel: '1am' };
// Deliberately stale ordinary Sunday data: event context must remain separate.
syntheticHours.sun = { label: 'Noon to 10pm', closed: false, openMinutes: 720, closeMinutes: 1320, openLabel: 'noon', closeLabel: '10pm' };
const syntheticSnapshot = { fetchedAt: '2026-12-01T10:00:00Z', hours: syntheticHours, regularHours: syntheticHours };
const stubs = {
  'astro:content': 'export const getCollection = async () => [];',
  '../../data/live-hours.json': `export default ${JSON.stringify(syntheticSnapshot)};`,
  '../../lib/programs': 'export const programTags = () => []; export const buildProgram = () => null;',
};
const moduleURL = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
let code = stripTypeScriptTypes(route, { mode: 'strip' });
for (const [specifier, stub] of Object.entries(stubs)) {
  assert.ok(code.includes(`'${specifier}'`), `expected route import: ${specifier}`);
  code = code.replace(`'${specifier}'`, JSON.stringify(moduleURL(stub)));
}
for (const [specifier, path] of [['../../lib/special-events', '../src/lib/special-events.ts'], ['../../data/hours', '../src/data/hours.ts']]) {
  assert.ok(code.includes(`'${specifier}'`));
  code = code.replace(`'${specifier}'`, JSON.stringify(new URL(path, import.meta.url).href));
}
const at = async time => {
  const clock = `const Date = class extends globalThis.Date { constructor(...args) { super(...(args.length ? args : [${JSON.stringify(time)}])); } };\n`;
  const { GET } = await import(moduleURL(clock + code));
  const response = await GET({});
  return { response, body: await response.json() };
};
const jingle = await at('2026-12-06T19:00:00Z');
assert.equal(jingle.response.status, 200);
assert.equal(jingle.response.headers.get('cache-control'), 'no-store');
assert.equal(jingle.body.now.is_open, true, 'provider status preserved even when ordinary event admission differs');
assert.equal(jingle.body.special_event_context.event.id, 'jingle_bowl_2026');
assert.equal(jingle.body.special_event_context.event.admission, 'event_reservations_only');
assert.equal(jingle.body.special_event_context.event.public_url, null);
assert.equal(JSON.stringify(jingle.body.special_event_context).includes('/jingle-bowl/'), false);
assert.equal(jingle.body.special_event_context.transfer.allowed, false);
assert.equal(jingle.body.special_event_context.generated_at, '2026-12-06T19:00:00.000Z');
assert.equal(jingle.body.now.minutes_central, 780);
assert.deepEqual(jingle.body.hours, syntheticHours);
assert.deepEqual(jingle.body.regularHours, syntheticHours);
const tail = await at('2026-12-06T06:30:00Z');
assert.equal(tail.body.now.is_open, true, 'Saturday overnight tail remains open');
assert.equal(tail.body.now.minutes_central, 30);
assert.equal(tail.body.special_event_context.event.id, 'jingle_bowl_2026');
assert.equal(tail.body.special_event_context.transfer.allowed, false, 'no invented event staffing');
const ordinary = await at('2026-12-06T05:59:59Z');
assert.equal(ordinary.body.special_event_context.event, null);
assert.equal(ordinary.body.now.is_open, true);
assert.equal(ordinary.body.special_event_context.valid_until, '2026-12-06T06:00:00.000Z');
assert.match(ordinary.response.headers.get('cache-control'), /max-age=60/);
const after = await at('2026-12-07T06:00:00Z');
assert.equal(after.body.special_event_context.event, null);
assert.equal(after.body.now.is_open, false);
const nye = await at('2026-12-31T19:00:00Z');
assert.equal(nye.body.now.is_open, false);
assert.equal(nye.body.special_event_context.event.admission, 'bowling_reservations_only');
assert.equal(nye.body.special_event_context.event.ordinary_visits, 'unknown');
assert.equal(nye.body.special_event_context.event.public_url, 'https://www.twistedpin.com/new-years-eve/');
assert.equal(nye.body.special_event_context.transfer.allowed, false);
assert.equal(nye.response.headers.get('cache-control'), 'no-store');
console.log('Special-event SSR route checks passed: 29 assertions, offline fixtures and controlled clocks.');
