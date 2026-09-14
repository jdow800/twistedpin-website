// Run with Node 22.18+ (native TypeScript stripping); no browser or checkout writes.
import assert from 'node:assert/strict';
import { selectedProductDurationMinutes, formatTimeRange12h } from '../src/components/tprs/format.ts';

const date = '2026-12-31';
const sessions = [
  ['11:00', 90, '11:00 AM – 12:30 PM'],
  ['13:00', 90, '1:00 PM – 2:30 PM'],
  ['15:00', 90, '3:00 PM – 4:30 PM'],
  ['17:00', 120, '5:00 PM – 7:00 PM'],
  ['19:30', 120, '7:30 PM – 9:30 PM'],
  ['22:00', 150, '10:00 PM – 12:30 AM'],
];
const product = {
  durationMinutes: 90,
  durationOverrides: sessions.map(([startTime, durationMinutes]) => ({ date, startTime, durationMinutes })),
};
for (const [time, duration, label] of sessions) {
  assert.equal(selectedProductDurationMinutes(product, date, time), duration);
  assert.equal(formatTimeRange12h(time, selectedProductDurationMinutes(product, date, time)), label);
}
assert.equal(selectedProductDurationMinutes(product, '2027-01-01', '22:00'), 90);
assert.equal(selectedProductDurationMinutes(product, date, '22:30'), 90);
assert.equal(selectedProductDurationMinutes({ durationMinutes: 60 }, date, '22:00'), 60);
assert.equal(selectedProductDurationMinutes({ ...product, durationMinutes: null }, date, '22:00'), null);
console.log('Booking duration checks passed: six party ranges, midnight crossing and default fallbacks.');
