import React from 'react';
import { createRoot } from 'react-dom/client';
import Invoices from '../../src/components/liquor/views/Invoices';
import '../../src/components/liquor/liquor.css';

// Fictional invoices and simulated responses only. This fixture makes no API call.
const mode = new URL(location.href).searchParams.get('mode') || 'resolved';
const scanRecovery = mode.startsWith('scan-');
const scenario = scanRecovery ? mode.slice(5) : mode;
const invoice = { id: 'demo-copy', vendorText: 'Example Food Supplier', invoiceNumber: null,
  invoiceDate: '2026-01-10', createdAt: '2026-01-10', status: 'flagged', printedTotal: '30.00',
  extractedTotal: '30.00', pageCount: 1, handwrittenNotes: [], reviewNotes: [],
  duplicateOf: 'DEMO-PACKAGE', landedOf: 'demo-original' };
const row = { code: 'DEMO-123', description: 'Example freezer item', originalLineIds: ['demo-line'], issues: [],
  information: ['The source reread confirms the emailed package reading.'],
  expected: { quantity: 1, cases: 1, amount: '30.00', packages: ['24 × 2OZ'] },
  delivered: { quantity: 1, cases: 1, amount: '30.00', packages: ['24 × 2OZ'] } };
const review = { originalId: 'demo-original', copyId: invoice.id, invoiceNumber: 'DEMO-PACKAGE',
  expected: { id: 'demo-original', source: 'email', printedTotal: '30.00' },
  delivered: { id: invoice.id, source: 'scan', printedTotal: '30.00' },
  rows: [row], reasons: [], questions: [], differenceCount: 0, feeDifference: 0,
  reviewHash: 'c'.repeat(64), reviewed: false, reviewedAt: null, ready: true,
  automaticallyReconciled: true, automaticBasis: 'source_checked_packages',
  sourceCheck: { id: 'demo-check', evidenceHash: 'a'.repeat(64), status: 'resolved', attempts: 1, reason: null,
    corrections: [{ vendorCode: 'DEMO-123', originalReading: '2 × 42OZ', correctedReading: '24 × 2OZ' }] } };
if (scanRecovery) {
  invoice.extractedTotal = '10.00';
  review.automaticBasis = 'source_checked_scan';
  review.sourceCheck.kind = 'scan_recovery';
  review.sourceCheck.corrections = [];
  review.sourceCheck.recoveredLineCount = 3;
  review.sourceCheck.originalLineCount = 1;
  row.expected.amount = row.delivered.amount = '10.00';
  row.information = ['The independent source read accounts for every billed row and separate charge.'];
  review.rows.push({ code: 'DEMO-456', description: 'Example second item', originalLineIds: ['demo-second-line'], issues: [],
    expected: { quantity: 1, cases: 1, amount: '15.00', packages: ['12 × 1OZ'] },
    delivered: { quantity: 1, cases: 1, amount: '15.00', packages: ['12 × 1OZ'] } });
}
function rawReview(status) {
  review.automaticallyReconciled = false; review.automaticBasis = null;
  review.sourceCheck.status = status; review.differenceCount = 1;
  if (scanRecovery) {
    review.readingIncomplete = true;
    review.rows[1].delivered = null;
    review.rows[1].issues = ['This billed item was not read from the saved scan. Check the source pages.'];
    row.information = [];
    review.questions = ['The saved scan is missing billed rows. Check all source pages before treating missing items as shortages.'];
  } else {
    row.issues = ['Pack or size readings differ. Check the source documents.'];
    row.information = []; row.delivered.packages = ['2 × 42OZ'];
    review.questions = ['Example freezer item: Pack or size readings differ.'];
  }
}
if (['queued', 'running', 'unresolved', 'rejected'].includes(scenario)) rawReview(scenario);
if (scenario === 'unresolved') review.sourceCheck.reason = scanRecovery ? 'The full source rows could not be read clearly.' : 'The package columns could not be read clearly.';
if (scenario === 'supplier-final' || scenario === 'matching' || scenario === 'old-api') {
  delete review.sourceCheck;
  review.automaticBasis = mode === 'supplier-final' ? 'supplier_final' : mode === 'matching' ? 'matching_copies' : undefined;
}
if (scenario === 'escaped') {
  if (scanRecovery) review.rows[1].description = '<img src=x onerror="alert(1)">';
  else review.sourceCheck.corrections[0].originalReading = '<img src=x onerror="alert(1)">';
}
const rawLine = { id: 'demo-saved-scan', invoiceId: invoice.id, lineType: 'product', rawDescription: 'Example freezer item',
  vendorCode: 'DEMO-123', matchedSkuId: 'demo-sku', matchedName: 'Example freezer item', nonInventory: false,
  pack: 24, sizeText: '2OZ', qtyUnits: '1', qtyCases: '1', printedUom: 'CS', unitCost: '10', extendedAmount: '10',
  annotation: null, receivedQty: null, needsReview: false, reviewReasons: [], costHoldReason: null };
const detail = { invoice, lines: scanRecovery ? [rawLine] : [], images: [], copyReviews: [review], buckets: { byBucket: {}, unattributed: 0,
  nonGoods: 0, matchedDollars: 30, residualDollars: 0, residualBasis: 'none', mixVendor: null,
  mixInvoices: null, warnings: [], totalBasis: 'grand_total', needsAttention: { unresolved: [], supplierOnly: [], disagreement: [] } } };
const calls = [];
let rejected = false, detailFailures = 0, finishPost;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
window.fixture = { calls, release: () => finishPost?.(), get review() { return review; } };
window.fetch = async (url, options = {}) => {
  const path = new URL(url, location.href).pathname;
  calls.push({ method: options.method || 'GET', path, body: options.body ? JSON.parse(options.body) : null });
  if (path.endsWith('/catalog')) return json({ items: [] });
  if (path.endsWith('/history')) return json({ invoices: [invoice] });
  if (path.endsWith('/automatic-answers')) return json({ answers: [] });
  if (path.endsWith('/source-check/reject')) {
    if (scenario === 'double') await new Promise(resolve => { finishPost = resolve; });
    if (scenario === 'stale') {
      review.sourceCheck.evidenceHash = 'b'.repeat(64);
      if (scanRecovery) review.sourceCheck.recoveredLineCount = 4;
      else review.sourceCheck.corrections[0].correctedReading = '12 × 4OZ';
      return json({ error: 'source_check_changed' }, 409);
    }
    if (scenario === 'source-disappears') {
      delete review.sourceCheck; review.automaticBasis = 'matching_copies';
      return json({ error: 'source_check_changed' }, 409);
    }
    if (scenario === 'read-failure') { rejected = true; detailFailures = 1; throw new TypeError('Simulated response loss'); }
    if (scenario === 'write-failure') return json({ error: 'not_saved' }, 503);
    rawReview('rejected'); rejected = true;
    if (scenario === 'lost-response') throw new TypeError('Simulated response loss after commit');
    return json({ rejected: true });
  }
  if (path.endsWith('/copy-review')) { review.reviewed = true; return json({ ok: true }); }
  if (path.endsWith('/demo-copy')) {
    if (detailFailures-- > 0) throw new TypeError('Simulated read failure');
    if (scenario === 'read-failure' && rejected) rawReview('rejected');
    if (scenario === 'queued-completes' && calls.filter(call => call.path.endsWith('/demo-copy')).length > 1) {
      review.sourceCheck.status = 'resolved'; review.automaticallyReconciled = true;
      review.automaticBasis = scanRecovery ? 'source_checked_scan' : 'source_checked_packages';
      review.differenceCount = 0; review.questions = [];
      row.issues = []; row.delivered.packages = ['24 × 2OZ'];
      row.information = [scanRecovery ? 'The independent source read accounts for every billed row and separate charge.' : 'The source reread confirms the emailed package reading.'];
      if (scanRecovery) { review.readingIncomplete = false; review.rows[1].delivered = { ...review.rows[1].expected }; review.rows[1].issues = []; }
    }
    return json(detail);
  }
  throw new Error(`Unexpected fixture request: ${path}`);
};
if (scenario === 'queued-completes') rawReview('queued');
if (scenario === 'price-question' || scenario === 'mark-question') {
  rawReview('unresolved');
  const issue = scenario === 'price-question' ? 'The billed unit price differs. Check the printed price.' : 'A handwritten shortage changes this line. Check the source mark.';
  review.questions = [issue]; row.issues = [issue];
  review.sourceCheck.reason = 'The source reading contains a difference that needs a person.';
}
createRoot(document.getElementById('root')).render(<div className="lq-app"><main className="lq-main">
  <Invoices initialInvoiceId={invoice.id} onDone={() => {}} />
</main></div>);
