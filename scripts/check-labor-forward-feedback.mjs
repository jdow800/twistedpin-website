// Offline checks against the actual progress helper and server-rendered card.
// node scripts/check-labor-forward-feedback.mjs
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {reviewProgress} from '../src/components/labor/review-progress.ts';
const pending={id:'older',weekStart:'2026-09-21',unanswered:2,answered:0,ownerRequests:0};
const fixture=()=>({id:'current',packet:{version:2,weekStart:'2026-09-28',forwardFeedback:{targetWeek:'2026-10-13',status:'ready',outstanding:0,held:[],candidateCount:0},pendingReviews:[]},questions:[]});
test('all old unanswered questions remain counted even beyond the two frozen links',()=>{const r=fixture();r.packet.forwardFeedback.outstanding=5;r.packet.pendingReviews=[pending];assert.equal(reviewProgress(r).awaiting,5);assert.equal(reviewProgress(r).pending.length,1);});
test('counts current questions plus all saved outstanding questions once',()=>{const r=fixture();r.packet.forwardFeedback.outstanding=2;r.packet.previousReview=pending;r.questions=[{response:null},{response:{note:'saved'}}];assert.equal(reviewProgress(r).awaiting,3);});
test('live answered state replaces stale frozen pending context',()=>{const r=fixture();r.packet.pendingReviews=[pending];r.packet.forwardFeedback.outstanding=2;r.pendingReviewsStatus=[];r.forwardOutstandingCount=0;assert.equal(reviewProgress(r).awaiting,0);assert.deepEqual(reviewProgress(r).pending,[]);});
test('live old unanswered state includes links absent from original packet',()=>{const r=fixture();r.pendingReviewsStatus=[pending];r.forwardOutstandingCount=2;assert.equal(reviewProgress(r).awaiting,2);assert.equal(reviewProgress(r).pending[0].id,'older');});
test('missing saved history stays unknown rather than up to date',()=>{const r=fixture();r.forwardOutstandingCount=null;const p=reviewProgress(r);assert.equal(p.awaiting,null);assert.equal(p.heading,'Saved context check pending');});
test('legacy source history unknown remains unknown',()=>{const r=fixture();r.packet.forwardFeedback.outstanding=null;assert.equal(reviewProgress(r).awaiting,null);});
for(const status of ['held','unavailable'])test(`${status} publication never claims context is up to date`,()=>{const r=fixture();r.packet.forwardFeedback.status=status;assert.equal(reviewProgress(r).heading,'Published comparison pending');assert.equal(reviewProgress(r).comparisonPending,true);});
test('held comparison preserves answer path and counts for old questions',()=>{const r=fixture();r.packet.forwardFeedback.status='held';r.forwardOutstandingCount=2;r.pendingReviewsStatus=[pending];const p=reviewProgress(r);assert.equal(p.heading,'Questions to review');assert.equal(p.pending.length,1);assert.equal(p.comparisonPending,true);});
test('legacy previous review remains supported',()=>{const r=fixture();delete r.packet.forwardFeedback;r.previousReviewStatus=pending;assert.equal(reviewProgress(r).awaiting,2);assert.equal(reviewProgress(r).pending[0].id,'older');});
test('report-only review does not ask for responses',()=>{const r=fixture();delete r.packet.forwardFeedback;r.packet.mode='report';assert.equal(reviewProgress(r).heading,'No response needed');});
test('forward card shows complete original and published crew before the answer',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},esbuild:{jsx:'automatic'},server:{middlewareMode:true},logLevel:'error'});
 try{
  const {Question}=await server.ssrLoadModule('/src/components/labor/ReviewPilot.tsx');
  const question={id:'demo',date:'2026-10-17',title:'Kitchen: AI draft versus published schedule',prompt:'Offline layout fixture only.',kind:'data_check',followUpDate:'2026-10-22',revision:0,response:null,canUndo:false,history:[],sources:['Synthetic fixture only'],evidence:['Original whole department: Kitchen Lead noon-11pm; Cook 5-10pm; Cook 6-11pm.','Published whole department: Kitchen Lead noon-11pm; Cook 4-10pm; Cook 6-11pm.'],draftChange:{comparisonKey:'a'.repeat(64),draft:{week:'2026-10-13',origin:'2026-10-05',version:4,sha256:'b'.repeat(64)},department:'kitchen'}};
  const html=renderToStaticMarkup(createElement(Question,{number:1,question,review:fixture(),onSaved:()=>assert.fail('Rendering must not save')}));
  assert.match(html,/<details class="lr-evidence" open="">/);
  assert.ok(html.indexOf('Original whole department')<html.indexOf('Add context'));
  assert.ok(html.indexOf('Published whole department')<html.indexOf('Add context'));
  assert.match(html,/Cook 6-11pm/);
  const old=renderToStaticMarkup(createElement(Question,{number:1,question:{...question,draftChange:undefined},review:fixture(),onSaved:()=>{}}));
  assert.doesNotMatch(old,/<details class="lr-evidence" open="">/);
 }finally{await server.close();}
});

test('forward saved explanation appears with recap status without implying a staffing trial',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},esbuild:{jsx:'automatic'},server:{middlewareMode:true},logLevel:'error'});
 try{
  const {default:NextSchedule}=await server.ssrLoadModule('/src/components/labor/NextSchedule.tsx');
  const review=fixture();review.questions=[{id:'explanation',draftChange:{department:'desk'},title:'Front desk comparison',response:{decision:'keep',note:'Synthetic remembered explanation.',action:''}}];review.recapDeliveryEnabled=true;review.recap={state:'pending',dueAt:'2026-10-08T17:30:00Z'};
  const html=renderToStaticMarkup(createElement(NextSchedule,{review}));
  assert.match(html,/Saved scheduling context/);assert.match(html,/Synthetic remembered explanation/);assert.match(html,/Recap planned for/);assert.match(html,/Preview follow-up email/);assert.doesNotMatch(html,/Yes and Maybe|idea to try|after you save/);
 }finally{await server.close();}
});
