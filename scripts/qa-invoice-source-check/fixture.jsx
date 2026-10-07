import React from 'react';
import { createRoot } from 'react-dom/client';
import Invoices from '../../src/components/liquor/views/Invoices';
import '../../src/components/liquor/liquor.css';

// Fictional invoices and simulated responses only. This fixture makes no API call.
const mode = new URL(location.href).searchParams.get('mode') || 'resolved';
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
function rawReview(status) {
  review.automaticallyReconciled = false; review.automaticBasis = null;
  review.sourceCheck.status = status; review.differenceCount = 1;
  row.issues = ['Pack or size readings differ. Check the source documents.'];
  row.information = []; row.delivered.packages = ['2 × 42OZ'];
  review.questions = ['Example freezer item: Pack or size readings differ.'];
}
if (['queued', 'running', 'unresolved', 'rejected'].includes(mode)) rawReview(mode);
if (mode === 'unresolved') review.sourceCheck.reason = 'The package columns could not be read clearly.';
if (mode === 'supplier-final' || mode === 'matching' || mode === 'old-api') {
  delete review.sourceCheck;
  review.automaticBasis = mode === 'supplier-final' ? 'supplier_final' : mode === 'matching' ? 'matching_copies' : undefined;
}
if (mode === 'escaped') review.sourceCheck.corrections[0].originalReading = '<img src=x onerror="alert(1)">';
const detail = { invoice, lines: [], images: [], copyReviews: [review], buckets: { byBucket: {}, unattributed: 0,
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
    if (mode === 'double') await new Promise(resolve => { finishPost = resolve; });
    if (mode === 'stale') {
      review.sourceCheck.evidenceHash = 'b'.repeat(64);
      review.sourceCheck.corrections[0].correctedReading = '12 × 4OZ';
      return json({ error: 'source_check_changed' }, 409);
    }
    if (mode === 'source-disappears') {
      delete review.sourceCheck; review.automaticBasis = 'matching_copies';
      return json({ error: 'source_check_changed' }, 409);
    }
    if (mode === 'read-failure') { rejected = true; detailFailures = 1; throw new TypeError('Simulated response loss'); }
    if (mode === 'write-failure') return json({ error: 'not_saved' }, 503);
    rawReview('rejected'); rejected = true;
    if (mode === 'lost-response') throw new TypeError('Simulated response loss after commit');
    return json({ rejected: true });
  }
  if (path.endsWith('/copy-review')) { review.reviewed = true; return json({ ok: true }); }
  if (path.endsWith('/demo-copy')) {
    if (detailFailures-- > 0) throw new TypeError('Simulated read failure');
    if (mode === 'read-failure' && rejected) rawReview('rejected');
    if (mode === 'queued-completes' && calls.filter(call => call.path.endsWith('/demo-copy')).length > 1) {
      review.sourceCheck.status = 'resolved'; review.automaticallyReconciled = true;
      review.automaticBasis = 'source_checked_packages';
      review.differenceCount = 0; review.questions = [];
      row.issues = []; row.delivered.packages = ['24 × 2OZ'];
      row.information = ['The source reread confirms the emailed package reading.'];
    }
    return json(detail);
  }
  throw new Error(`Unexpected fixture request: ${path}`);
};
if (mode === 'queued-completes') rawReview('queued');
createRoot(document.getElementById('root')).render(<div className="lq-app"><main className="lq-main">
  <Invoices initialInvoiceId={invoice.id} onDone={() => {}} />
</main></div>);
