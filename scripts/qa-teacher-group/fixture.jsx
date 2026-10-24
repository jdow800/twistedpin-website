import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherGroup from '../../src/components/liquor/views/TeacherGroup';
import '../../src/components/liquor/liquor.css';

const mode = new URL(location.href).searchParams.get('mode') || 'unmatched';
const result = { id: 'demo-teacher', status: 'done', error: null, createdAt: '2026-10-09T18:20:00Z', finishedAt: '2026-10-09T18:21:00Z',
  eventDate: '2026-10-09', emailTo: ['kitchen@twistedpin.com'], runnerTickets: true, lines: [], instructions: [], confirms: [],
  issues: [], pdfReady: true, sourceAccepted: true, packetDelivery: { status: 'queued', message: 'Email queued.' },
  laneOutcomes: [{ key: 'A', bowl: '14:45', status: 'applied', invoice: 'DEMO', text: '2:45 PM shift: 3 lanes held.' }],
  packetReview: { foodDecisionCount: 0, reservationStatus: 'checked', managerLines: [] } };
if (mode === 'unmatched') {
  result.packetReview.reservationStatus = 'needs_review';
  result.packetReview.managerLines = ['Add recognized reservation coverage for the 3:45 PM shift before reducing lane holds.'];
  result.issues = [{ kind: 'shift_booking', text: result.packetReview.managerLines[0], blocks: ['*'] }];
  result.laneOutcomes[0].status = 'skipped';
}
if (mode === 'food') result.packetReview.foodDecisionCount = 2;
if (mode === 'legacy-conflict' || mode === 'legacy') {
  delete result.packetReview;
  delete result.sourceAccepted;
  delete result.packetDelivery;
  if (mode === 'legacy-conflict') result.issues = [{ kind: 'lane_shared', text: 'Two shifts share lane 15.', blocks: [] }];
}
if (mode === 'carried') {
  result.packetReview.reservationStatus = 'needs_review';
  result.packetReview.managerLines = ['Original instruction: Lane 15 is broken, skip it.'];
  result.issues = [{ kind: 'instruction_missed', text: result.packetReview.managerLines[0], blocks: ['*'] }];
  result.laneOutcomes[0].status = 'unchanged';
}
if (mode === 'escaped') result.packetReview.managerLines = ['<img src=x onerror="alert(1)">'];
if (['pending-food', 'partial', 'superseded'].includes(mode)) {
  result.packetReview.foodDecisionCount = 1;
  result.packetReview.arrivalChoiceCount = 3;
  result.teamNotes = [{ kind: 'pending', text: 'Lane 17: food order pending; confirm whether they are ordering.' },
    { kind: 'no_order', text: 'Lane 2 explicitly ordered no food.' }];
  result.confirms = ['Lane 13: Trio, needs sauce', 'Lane 14: Trio, needs sauce', 'Lane 10: Wings, needs sauce'];
  if (mode === 'partial') result.lines = [{ n: 1, file: 'Later shift.docx', text: 'Lane 10: wings', kind: 'lane', reading: 'Later-shift wings' }];
}
if (mode === 'superseded') {
  result.packetDelivery = { status: 'superseded', message: 'A newer night replaced this historical packet; no email was queued.' };
  result.error = result.packetDelivery.message;
}
if (mode === 'superseded-after-queue') result.packetDelivery = { status: 'superseded', message: 'An email was queued earlier, but further delivery was stopped after a newer packet was accepted.' };
if (mode === 'superseded-reservations') result.packetDelivery = { status: 'superseded', message: 'Reservations changed after this packet was prepared. Review the current reservations before using it.' };
if (mode === 'superseded-fallback') result.packetDelivery = { status: 'superseded', message: '' };
if (mode.startsWith('retry-') || mode === 'unaccepted-failed' || mode === 'unaccepted-draft') {
  result.status = 'failed'; result.pdfReady = false; result.error = 'Packet could not be prepared.';
  delete result.packetReview; delete result.packetDelivery;
  if (mode.startsWith('unaccepted-')) { result.sourceAccepted = false; result.laneOutcomes = []; }
}
const calls = [];
window.fixture = { calls };
let retried = false; let retryReads = 0; let uploaded = false;
const nativeTimeout = window.setTimeout;
window.setTimeout = (fn, delay, ...args) => nativeTimeout(fn, delay === 3000 ? 30 : delay, ...args);
window.fetch = async (input, init = {}) => {
  const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
  calls.push({ path, method: init.method || 'GET', credentials: init.credentials, headers: init.headers });
  const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  if (path === '/mock/admin/bar/teacher-group/uploads' && init.method === 'POST') { uploaded = true; return json({ uploadId: result.id }); }
  if (path === '/mock/admin/bar/teacher-group/uploads') return json({ uploads: mode === 'unaccepted-draft' && !uploaded ? [] : [{ id: result.id, status: result.status,
    eventDate: result.eventDate, createdAt: result.createdAt, by: 'Example staff', fileNames: ['Example order.docx'] }] });
  if (path === '/mock/admin/bar/teacher-group/uploads/demo-teacher/retry' && init.method === 'POST') {
    await new Promise(resolve => nativeTimeout(resolve, 40));
    if (mode === 'retry-auth') return new Response('{}', { status: 401 });
    if (mode === 'retry-forbidden') return new Response('{}', { status: 403 });
    if (mode === 'retry-server-failure') return new Response('{}', { status: 500 });
    retried = true;
    if (mode === 'retry-conflict') return new Response('{}', { status: 409 });
    if (mode === 'retry-network') throw new TypeError('Lost response after acceptance');
    return json({ uploadId: result.id, status: 'pending' });
  }
  if (path === '/mock/admin/bar/teacher-group/uploads/demo-teacher') {
    if (retried) {
      retryReads++;
      result.status = retryReads === 1 ? 'processing' : 'done';
      result.error = null;
      if (result.status === 'done') {
        result.pdfReady = true;
        result.packetReview = { foodDecisionCount: 0, arrivalChoiceCount: 0, reservationStatus: 'checked', managerLines: [] };
        result.packetDelivery = { status: 'queued', message: 'Email queued.' };
      }
    }
    return json(result);
  }
  throw new Error('Unexpected fixture request: ' + path);
};
createRoot(document.getElementById('root')).render(<div className="lq-app"><main className="lq-main"><TeacherGroup onDone={() => {}} /></main></div>);
