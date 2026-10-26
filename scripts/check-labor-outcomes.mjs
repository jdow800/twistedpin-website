import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {questionNeedsResponse,reviewProgress} from '../src/components/labor/review-progress.ts';
import {serviceResponse} from '../src/components/labor/service-feedback.ts';
import {fixture} from './labor-outcome-fixture.mjs';
const feedback=overall=>({overall,affectedDepartments:['kitchen'],managerHelp:'yes',extraStaffingAnticipated:'unknown'});
for(const overall of ['handled','strained','fell_behind','need_to_check'])test(`outcome ${overall} uses existing structured answers and shared completion`,()=>{
 const r=fixture(),q=r.questions[0];q.response=serviceResponse('Fictional service report',feedback(overall),q.followUpDate);
 assert.equal(questionNeedsResponse(q),overall==='need_to_check');assert.equal(reviewProgress(r).awaiting,overall==='need_to_check'?1:0);assert.equal(q.response.trial,undefined);
 q.disposition={status:'withdrawn'};assert.equal(questionNeedsResponse(q),false);
});
test('outcome card retains four evidence layers without implying surprise, savings or attendance',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},esbuild:{jsx:'automatic'},server:{middlewareMode:true},logLevel:'error'});
 try{
  const {default:Card,periodHours}=await server.ssrLoadModule('/src/components/labor/OutcomeReviewQuestion.tsx');
  const r=fixture(),q=r.questions[0],before=structuredClone(r);
  const render=()=>renderToStaticMarkup(createElement(Card,{number:1,question:q,review:r,onSaved:()=>assert.fail('No save during render')}));
  let html=render();for(const label of ['Feedback adjustment follow-up','Data baseline','Final AI draft','Published schedule','Recorded spans','provisional','4 hours','8 hours','Did a manager step in?','How did the crew handle it?'])assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/Was the extra coverage planned|Biggest jump|\+\d+%|checked=""|12 hours/);assert.equal((html.match(/type="radio"/g)||[]).length,4);assert.deepEqual(r,before);
  assert.equal(periodHours(q.outcomeReview.staffing.recorded,q.outcomeReview.period),'8 hours');
  assert.equal(periodHours({status:'complete',capturedAt:null,shifts:[{department:'bar',role:'Bartender',startMinute:1350,endMinute:1410}]},{startMinute:1350,endMinute:1380,label:'10:30pm-11pm'}),'0.5 hours');
  assert.match(html,/Coverage below is limited to this review period/);assert.doesNotMatch(html,/Full shifts/);
  for(const layer of ['published','recorded']){
   const source={status:'partial',capturedAt:null,shifts:[]};assert.equal(periodHours(source,q.outcomeReview.period),'Unavailable');
   q.outcomeReview.staffing[layer]=source;
  }
  html=render();assert.doesNotMatch(html,/>0 hours</);
  for(const status of ['complete','provisional'])assert.equal(periodHours({status,capturedAt:null,shifts:[]},q.outcomeReview.period),'0 hours');
  q.outcomeReview.staffing.recorded={status:'unavailable',capturedAt:null,shifts:[]};q.outcomeReview.metrics[0].actualValue=null;
  html=render();assert.match(html,/Unavailable actual/);assert.match(html,/Source unavailable/);assert.doesNotMatch(html,/Recorded spans<\/th><td>0 hours/);
  q.outcomeReview.reason='routine_sample';q.outcomeReview.eventContext.complete=false;q.prompt='<script>not active</script>';html=render();assert.match(html,/Routine service check/);assert.match(html,/Event context is incomplete/);assert.match(html,/&lt;script&gt;not active/);assert.doesNotMatch(html,/<script>/);
  q.response=serviceResponse('Saved fictional service report',feedback('need_to_check'),q.followUpDate);html=render();assert.match(html,/this stays open until then/);assert.match(html,/>Edit<\/button>/);
  const {default:NextSchedule}=await server.ssrLoadModule('/src/components/labor/NextSchedule.tsx');
  assert.doesNotMatch(renderToStaticMarkup(createElement(NextSchedule,{review:r})),/Preview follow-up email/);
  q.response=serviceResponse('Saved fictional service report',feedback('handled'),q.followUpDate);
  assert.match(renderToStaticMarkup(createElement(NextSchedule,{review:r})),/Saved fictional service report/);
 }finally{await server.close();}
});
