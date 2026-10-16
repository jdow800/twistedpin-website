/**
 * ConfirmationStep purchase pixels.
 *
 * The paid booking screen fires GA4 `purchase` and Meta `Purchase` once per
 * invoice. This renders the real component (SSR, so the effect does not run)
 * and calls the exported tracker the effect uses. No browser and no checkout.
 *
 * Run: node scripts/check-booking-purchase.mjs
 */
import { createRequire } from 'node:module';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const site = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(`${site}/package.json`);
const { build } = require('esbuild');

const source = `
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Confirmation, { trackConfirmedPurchase } from './src/components/tprs/steps/ConfirmationStep.tsx';

const EMAIL = 'guest.secret@example.com';
const calls = [];
global.window = {
  gtag: (...args) => { calls.push(['gtag', ...args]); },
  fbq: (...args) => { calls.push(['fbq', ...args]); },
};

const html = renderToStaticMarkup(React.createElement(Confirmation, {
  product: { name: 'Open bowling', durationMinutes: 60 },
  date: '2026-10-16',
  slot: { time: '19:00', priceCents: 2400, available: true },
  laneQty: 1,
  showEndTime: true,
  guestCount: null,
  addOns: [],
  booking: { invoiceNumber: 'TP-1042', bookingId: 'x', paymentRecordId: 'y', customerId: 'z', railStatus: 'succeeded' },
  totalCents: 2400,
  guestEmail: EMAIL,
  onReset: () => {},
}));
assert.ok(html.includes(EMAIL), 'the confirmation still shows the guest email on screen');
assert.ok(html.includes('TP-1042'), 'the confirmation still shows the invoice number');
assert.equal(calls.length, 0, 'rendering the screen does not fire a pixel');

trackConfirmedPurchase(undefined, 2400);
trackConfirmedPurchase('', 2400);
assert.equal(calls.length, 0, 'a missing invoice does not fire');

trackConfirmedPurchase('TP-1042', 43990);
trackConfirmedPurchase('TP-1042', 43990);
const first = calls.splice(0, calls.length);
assert.deepEqual(first[0], ['gtag', 'event', 'purchase', { transaction_id: 'TP-1042', value: 439.9, currency: 'USD' }]);
assert.deepEqual(first[1], ['fbq', 'track', 'Purchase', { value: 439.9, currency: 'USD' }, { eventID: 'TP-1042' }]);
assert.equal(first.length, 2, 'one invoice fires GA4 and Meta once');
assert.equal(JSON.stringify(first).includes(EMAIL), false, 'purchase payloads omit the guest email');
assert.equal(JSON.stringify(first).includes('@'), false, 'purchase payloads contain no email address');

trackConfirmedPurchase('TP-1043', Number.NaN);
const zero = calls.splice(0, calls.length);
assert.equal(zero[0][3].value, 0, 'a non-finite total is reported as zero dollars');
assert.equal(zero[1][3].value, 0);
assert.equal(zero[1][4].eventID, 'TP-1043');

global.window.fbq = () => { throw new Error('pixel blocked'); };
trackConfirmedPurchase('TP-1044', 1000);
trackConfirmedPurchase('TP-1044', 1000);
assert.equal(calls.length, 1, 'a throwing pixel still lets GA4 fire once and does not retry');
assert.equal(calls[0][0], 'gtag');
assert.equal(calls[0][3].transaction_id, 'TP-1044');
assert.equal(calls[0][3].value, 10);

delete global.window.gtag;
global.window.fbq = (...args) => { calls.push(['fbq', ...args]); };
calls.length = 0;
trackConfirmedPurchase('TP-1045', 250);
assert.deepEqual(calls, [['fbq', 'track', 'Purchase', { value: 2.5, currency: 'USD' }, { eventID: 'TP-1045' }]]);

console.log('booking purchase pixels: once per invoice, dollars, no email');
`;

const result = await build({
  stdin: {
    contents: source,
    resolveDir: site,
    sourcefile: 'booking-purchase-pixels.tsx',
    loader: 'tsx',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  jsx: 'automatic',
});
const path = join(tmpdir(), `booking-purchase-${randomUUID()}.cjs`);
try {
  await writeFile(path, result.outputFiles[0].text);
  process.stdout.write(execFileSync(process.execPath, [path], { encoding: 'utf8' }));
} finally {
  await unlink(path);
}
