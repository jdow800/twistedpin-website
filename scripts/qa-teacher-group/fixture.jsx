import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherGroup from '../../src/components/liquor/views/TeacherGroup';
import '../../src/components/liquor/liquor.css';

const mode = new URL(location.href).searchParams.get('mode') || 'unmatched';
const result = { id: 'demo-teacher', status: 'done', error: null, createdAt: '2026-10-09T18:20:00Z', finishedAt: '2026-10-09T18:21:00Z',
  eventDate: '2026-10-09', emailTo: ['kitchen@twistedpin.com'], runnerTickets: true, lines: [], instructions: [], confirms: [],
  issues: [], pdfReady: true,
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
  if (mode === 'legacy-conflict') result.issues = [{ kind: 'lane_shared', text: 'Two shifts share lane 15.', blocks: [] }];
}
if (mode === 'carried') {
  result.packetReview.reservationStatus = 'needs_review';
  result.packetReview.managerLines = ['Original instruction: Lane 15 is broken, skip it.'];
  result.issues = [{ kind: 'instruction_missed', text: result.packetReview.managerLines[0], blocks: ['*'] }];
  result.laneOutcomes[0].status = 'unchanged';
}
if (mode === 'escaped') result.packetReview.managerLines = ['<img src=x onerror="alert(1)">'];
const calls = [];
window.fixture = { calls };
window.fetch = async (input, init = {}) => {
  const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname;
  calls.push({ path, method: init.method || 'GET' });
  const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  if (path === '/mock/admin/bar/teacher-group/uploads') return json({ uploads: [{ id: result.id, status: result.status,
    eventDate: result.eventDate, createdAt: result.createdAt, by: 'Example staff', fileNames: ['Example order.docx'] }] });
  if (path === '/mock/admin/bar/teacher-group/uploads/demo-teacher') return json(result);
  throw new Error('Unexpected fixture request: ' + path);
};
createRoot(document.getElementById('root')).render(<div className="lq-app"><main className="lq-main"><TeacherGroup onDone={() => {}} /></main></div>);
