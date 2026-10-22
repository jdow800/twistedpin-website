/** Offline release override checks. No API, credentials or provider calls. */
import assert from 'node:assert/strict';
import {jingleBookingEnabled} from '../src/config/jingle-booking.ts';

assert.equal(jingleBookingEnabled(undefined), true, 'absent override connects protected booking');
assert.equal(jingleBookingEnabled('true'), true, 'explicit true enables the connection');
assert.equal(jingleBookingEnabled('false'), false, 'explicit false disables fresh sales');
for (const value of ['', 'TRUE', 'False', ' true', 'true ', '1', 'yes', null, true, false, 1, 0, {}, []]) {
  assert.equal(jingleBookingEnabled(value), false, `invalid override ${JSON.stringify(value)} disables fresh sales`);
}
console.log('PASS Jingle booking switch: default enabled, explicit true enabled, false and malformed values disabled');
