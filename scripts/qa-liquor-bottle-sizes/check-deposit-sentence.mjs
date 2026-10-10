// Pure checks for the one-number deposit form's composer (src/components/liquor/deposit-sentence.ts). No DOM, no network.
// Run: node scripts/qa-liquor-bottle-sizes/check-deposit-sentence.mjs   (Node 22.18+ strips the TypeScript types itself.)
//
// The server accepts a deposit return only in sentences its parser (tprs apps/backend/src/bar/invoice-deposit-return.ts,
// writtenDepositReturn) can read. The tprs repo proves that parse for every sentence this composer makes, using a COPY of the
// composer (apps/backend/src/bar/invoice-deposit-sentence-contract.test.ts). The two repos cannot import each other, so the
// GOLDEN lists below are recorded in both tests, and GOLDEN_SHA256 is the same constant in both: change a sentence in one repo
// and the other test fails until it is changed there too.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const m = await import('../../src/components/liquor/deposit-sentence.ts');

// [kegs returned, deposit rate in cents, printed total in cents, sentence]
const GOLDEN_COMPOSED = [
  [2, 3000, 27000, 'Returned 2 empty kegs. Deposit credit $60; total due $210.'],
  [1, 3000, 58900, 'Returned 1 empty keg. Deposit credit $30; total due $559.'],
  [3, 3000, 58900, 'Returned 3 empty kegs. Deposit credit $90; total due $499.'],
  [1, 3000, 58995, 'Returned 1 empty keg. Deposit credit $30; total due $559.95.'],
  [2, 2750, 58995, 'Returned 2 empty kegs. Deposit credit $55; total due $534.95.'],
  [1, 2750, 58995, 'Returned 1 empty keg. Deposit credit $27.50; total due $562.45.'],
  [3, 2750, 58995, 'Returned 3 empty kegs. Deposit credit $82.50; total due $507.45.'],
  [6, 3500, 123456, 'Returned 6 empty kegs. Deposit credit $210; total due $1024.56.'],
  [4, 2500, 100000, 'Returned 4 empty kegs. Deposit credit $100; total due $900.'],
  [5, 3000, 15000, 'Returned 5 empty kegs. Deposit credit $150; total due $0.'],
  [1, 3500, 7000, 'Returned 1 empty keg. Deposit credit $35; total due $35.'],
];
// The same sentence with the count spelled out up to ten: the example shown under "Describe something else" and in the
// no-dollar-amount reply.
const GOLDEN_EXAMPLE = [
  [2, 3000, 27000, 'Returned two empty kegs. Deposit credit $60; total due $210.'],
  [1, 3000, 58900, 'Returned one empty keg. Deposit credit $30; total due $559.'],
  [3, 3000, 58900, 'Returned three empty kegs. Deposit credit $90; total due $499.'],
  [10, 2500, 100000, 'Returned ten empty kegs. Deposit credit $250; total due $750.'],
  [11, 2500, 100000, 'Returned 11 empty kegs. Deposit credit $275; total due $725.'],
  [2, 2750, 58995, 'Returned two empty kegs. Deposit credit $55; total due $534.95.'],
];
// Keep this constant identical in apps/backend/src/bar/invoice-deposit-sentence-contract.test.ts (tprs).
const GOLDEN_SHA256 = 'aaa6084a16f04a93b5afc52f88e3215b5d06748b0f9a006a85dcc85e2b1c51ec';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS', name); };

test('golden sentences are exactly what the composer writes', () => {
  for (const [kegs, rate, original, sentence] of GOLDEN_COMPOSED) assert.equal(m.composeDepositSentence(kegs, rate, original), sentence);
  for (const [kegs, rate, original, sentence] of GOLDEN_EXAMPLE) assert.equal(m.composeDepositExample(kegs, rate, original), sentence);
});
test('the golden lists match the copy recorded in the tprs contract test', () => {
  const digest = createHash('sha256').update(JSON.stringify({ composed: GOLDEN_COMPOSED, example: GOLDEN_EXAMPLE })).digest('hex');
  assert.equal(digest, GOLDEN_SHA256, 'update the same lists and constant in the tprs contract test');
});
test('credit and amount due come from the count, the rate and the printed total', () => {
  assert.deepEqual(m.depositAmounts(2, 3000, 27000), { creditCents: 6000, dueCents: 21000 });
  assert.deepEqual(m.depositAmounts(1, 2750, 58995), { creditCents: 2750, dueCents: 56245 });
});
test('dollars: whole when whole, two decimals when cents, no commas', () => {
  assert.equal(m.sentenceDollars(6000), '60');assert.equal(m.sentenceDollars(6050), '60.50');assert.equal(m.sentenceDollars(5), '0.05');
  assert.equal(m.sentenceDollars(0), '0');assert.equal(m.sentenceDollars(123456), '1234.56');
  assert.equal(m.formatMoney(6000), '$60.00');assert.equal(m.formatMoney(123456), '$1,234.56');
});

const line = (qty, rate, extended, type = 'deposit') => ({ lineType: type, qtyUnits: qty, unitCost: rate, extendedAmount: extended });
const keg = line('1', '125.000000', '125.00', 'keg');
test('Werk Force: two deposits at $30 on a printed $270 is a one-number invoice', () => {
  assert.deepEqual(m.depositPlan([keg, line('1', '85', '85', 'keg'), line('2.000', '30.000000', '60.00')], '270.00'),
    { rateCents: 3000, kegsBilled: 2, originalCents: 27000 });
});
test('deposit lines are summed when they share one rate', () => {
  assert.deepEqual(m.depositPlan([line('1', '30', '30'), line('2', '30', '60')], '589'), { rateCents: 3000, kegsBilled: 3, originalCents: 58900 });
});
test('a missing quantity or rate is worked out only when the line adds up exactly', () => {
  assert.deepEqual(m.depositPlan([line('2', null, '60.00')], '270'), { rateCents: 3000, kegsBilled: 2, originalCents: 27000 });
  assert.deepEqual(m.depositPlan([line(null, '30', '60.00')], '270'), { rateCents: 3000, kegsBilled: 2, originalCents: 27000 });
  assert.equal(m.depositPlan([line(null, null, '60.00')], '270'), null);
  assert.equal(m.depositPlan([line('2', '30', '70.00')], '270'), null, 'quantity x rate must equal the line amount');
  assert.equal(m.depositPlan([line('1.5', '40', '60.00')], '270'), null, 'half a keg is not a count');
  assert.equal(m.depositPlan([line('0', '30', '60.00')], '270'), null);
});
test('no form without exactly one rate, a read total, a positive deposit line, or room for the credit', () => {
  assert.equal(m.depositPlan([line('2', '30', '60'), line('1', '25', '25')], '295'), null, 'mixed rates');
  assert.equal(m.depositPlan([keg], '125'), null, 'no deposit line');
  assert.equal(m.depositPlan([line('1', '-30', '-30')], '270'), null, 'only a credit line');
  assert.equal(m.depositPlan([line('2', '30', '60')], null), null, 'printed total not read');
  assert.equal(m.depositPlan([line('2', '30', '60')], '0.00'), null, 'printed total 0.00');
  assert.equal(m.depositPlan([line('2', '30', '60')], undefined), null);
  assert.equal(m.depositPlan([line('3', '30', '90')], '60'), null, 'cannot credit more deposit than the bill');
});
test('a negative deposit line is a credit already on the invoice', () => {
  assert.equal(m.hasDepositCredit([line('2', '30', '60'), line('1', '-60', '-60')]), true);
  assert.equal(m.hasDepositCredit([line('2', '30', '60')]), false);
  assert.equal(m.hasDepositCredit([line('1', '-60', '-60', 'fee')]), false);
});
test('countPlan: the number box only before an answer, and only with no credit already on the invoice', () => {
  const lines = [line('2', '30', '60')];
  assert.deepEqual(m.countPlan(lines, '270', false), { rateCents: 3000, kegsBilled: 2, originalCents: 27000 });
  assert.equal(m.countPlan(lines, '270', true), null, 'an answered invoice is corrected in words');
  assert.equal(m.countPlan([...lines, line('1', '-60', '-60')], '210', false), null, 'a credit is already on it');
  assert.equal(m.countPlan(lines, null, false), null);
});
test('printedTotalRead: null, empty, zero and junk are not a read total', () => {
  for (const unread of [null, undefined, '', '0', '0.00', 0, 'x']) assert.equal(m.printedTotalRead(unread), false, String(unread));
  for (const read of ['270', '270.00', 589.95, '0.01']) assert.equal(m.printedTotalRead(read), true, String(read));
});
test('the typed count: whole numbers from 1 to the kegs billed', () => {
  assert.deepEqual(m.parseKegCount('2', 2), { kegs: 2 });
  assert.deepEqual(m.parseKegCount(' 1 ', 2), { kegs: 1 });
  assert.deepEqual(m.parseKegCount('02', 2), { kegs: 2 });
  assert.deepEqual(m.parseKegCount('3', 2), { over: 3 });
  assert.deepEqual(m.parseKegCount('999', 2), { over: 999 });
  for (const bad of ['', ' ', '0', '00', '1.5', '-1', '1e1', 'two', '1 2', '1000', '+1']) assert.deepEqual(m.parseKegCount(bad, 5), { invalid: true }, JSON.stringify(bad));
});
test('only a $ or - before a number counts as a dollar amount, as on the server', () => {
  for (const yes of ['credit $30', 'credit $ 30', 'Empty x2 -60', 'deposit -30.50']) assert.equal(m.hasDollarAmount(yes), true, yes);
  for (const no of ['yes empty kegs', 'two kegs returned', 'sixty dollars', 'returned 2 kegs, credit 60', 'dollar $ amount']) assert.equal(m.hasDollarAmount(no), false, no);
});
test('the no-amount reply uses this invoice\'s numbers, or none at all', () => {
  assert.equal(m.noAmountMessage({ rateCents: 3000, kegsBilled: 2, originalCents: 27000 }),
    'Add the credit in dollars, like: Returned two empty kegs. Deposit credit $60; total due $210.');
  assert.equal(m.noAmountMessage(null), 'Add the credit in dollars and the total due after it, and say how many empty kegs went back.');
  assert.ok(!m.noAmountMessage(null).includes('$'));
});
test('the example paragraph for the text box', () => {
  assert.equal(m.exampleText({ rateCents: 3000, kegsBilled: 2, originalCents: 27000 }),
    'For example: “Returned two empty kegs. Deposit credit $60; total due $210.” This records the credit. If a full keg was missing, record that on its item below.');
  assert.equal(m.exampleText(null),
    'Say how many empty kegs went back, the deposit credit in dollars and the total due after it. This records the credit. If a full keg was missing, record that on its item below.');
});
test('the range lines name the kegs billed', () => {
  assert.equal(m.rangeHint({ invalid: true }, 2), 'Enter a number from 1 to 2.');
  assert.equal(m.rangeHint({ invalid: true }, 1), 'Enter 1.');
  assert.equal(m.rangeHint({ over: 3 }, 2), 'A deposit was billed on 2 kegs, so no more than 2 can be credited.');
  assert.equal(m.rangeHint({ over: 2 }, 1), 'A deposit was billed on 1 keg, so no more than 1 can be credited.');
});
console.log(`Deposit sentence: ${passed} checks passed`);
