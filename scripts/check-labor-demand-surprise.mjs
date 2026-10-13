// Offline contract, completion and actual component checks; no live requests.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {questionNeedsResponse,reviewProgress} from '../src/components/labor/review-progress.ts';
import {serviceResponse} from '../src/components/labor/service-feedback.ts';
import {fixture} from './labor-demand-surprise-fixture.mjs';
const feedback=overall=>({overall,affectedDepartments:['kitchen'],managerHelp:'yes',extraStaffingAnticipated:'unknown'});

for(const overall of ['handled','strained','fell_behind','need_to_check'])test(`${overall} preserves service meaning and budget status`,()=>{
 const r=fixture(),q=r.questions[0];q.response=serviceResponse(' Synthetic reported explanation. ',feedback(overall),q.followUpDate);
 assert.equal(q.response.note,'Synthetic reported explanation.');assert.equal(q.response.decision,overall==='handled'?'keep':'consider');
 assert.equal(q.response.status,overall==='need_to_check'?'follow_up':'closed');assert.equal(questionNeedsResponse(q),overall==='need_to_check');
 assert.equal(reviewProgress(r).awaiting,overall==='need_to_check'?1:0);assert.deepEqual(q.response.serviceFeedback,feedback(overall));assert.equal(q.response.trial,undefined);
});
test('legacy answers remain answered while an incomplete service answer stays open',()=>{
 const r=fixture(),q=r.questions[0];q.response={decision:'keep',note:'Earlier partial response',status:'closed'};
 assert.equal(questionNeedsResponse(q),true);assert.equal(questionNeedsResponse({...q,demandSurge:undefined}),false);
 q.disposition={status:'withdrawn'};assert.equal(questionNeedsResponse(q),false);
});
test('surge and legacy server-rendered cards keep evidence and answer styles separate',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},esbuild:{jsx:'automatic'},server:{middlewareMode:true},logLevel:'error'});
 try{
  const {default:Card}=await server.ssrLoadModule('/src/components/labor/DemandSurgeQuestion.tsx');
  const {Question}=await server.ssrLoadModule('/src/components/labor/ReviewPilot.tsx');
  const r=fixture(),q=r.questions[0],render=question=>renderToStaticMarkup(createElement(Card,{number:1,question,review:r,onSaved:()=>assert.fail('Rendering must not save')}));
  const before=structuredClone(r),html=render(q);
  for(const text of ['Food net sales','AI expected','$1,500','$2,000','33% above forecast','6pm-7pm','Published','captured after the fact','Added 0 staff-hours','How the crew handled it','Demand exceeded the original forecast. How did the team handle these hours?','Original question:',q.prompt])assert.ok(html.includes(text),text);
  assert.ok(html.indexOf('AI expected')<html.indexOf('How the crew handled it'));assert.doesNotMatch(html,/Keep this coverage|Try an adjustment|Maybe, with a condition|walk-in|proven capacity|<form/);assert.deepEqual(r,before);
  const desk=structuredClone(q);Object.assign(desk.demandSurge,{primaryMetric:'desk_interactions',metrics:[{metric:'desk_interactions',unit:'interactions',forecastValue:40,actualValue:60,increaseValue:20,increasePercent:50}],hotHours:[]});
  const deskHtml=render(desk);assert.match(deskHtml,/Desk interactions/);assert.match(deskHtml,/50% above forecast/);assert.doesNotMatch(deskHtml,/\$40|\$60|Building sales/);
  const longKnown={...q,demandSurge:{...q.demandSurge,knownOperatingExplanation:'Synthetic explanation '.repeat(30)+'<script>not HTML</script>'}};
  const knownHtml=render(longKnown);assert.match(knownHtml,/Saved operating explanation/);assert.match(knownHtml,/&lt;script&gt;not HTML&lt;\/script&gt;/);assert.doesNotMatch(knownHtml,/<script>/);assert.match(knownHtml,/Already noted:[\s\S]*…<\/p>/);
  const saved={...q,response:serviceResponse('Synthetic desk and kitchen queues.',feedback('strained'),q.followUpDate),revision:1,canUndo:true};
  const savedHtml=render(saved);assert.match(savedHtml,/Strained, but kept up/);assert.match(savedHtml,/Manager stepped in/);assert.match(savedHtml,/Update service feedback/);assert.match(savedHtml,/Undo last save/);assert.doesNotMatch(savedHtml,/Your decision|Try an adjustment/);
  saved.response=serviceResponse('Synthetic pending team check.',feedback('need_to_check'),q.followUpDate);assert.match(render(saved),/This question remains open/);
  const withdrawn={...q,disposition:{status:'withdrawn',source:'owner',reason:'Synthetic withdrawal.',withdrawnAt:'2026-10-28T18:00:00Z'}};
  const withdrawnHtml=renderToStaticMarkup(createElement(Question,{number:1,question:withdrawn,review:r,onSaved:()=>assert.fail('Withdrawal must not save')}));assert.match(withdrawnHtml,/No response required/);assert.doesNotMatch(withdrawnHtml,/<button|<form|<input|<textarea/);
 }finally{await server.close();}
});
test('completed service reports join the recap; pending team checks do not',async()=>{
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},esbuild:{jsx:'automatic'},server:{middlewareMode:true},logLevel:'error'});
 try{
  const {default:NextSchedule}=await server.ssrLoadModule('/src/components/labor/NextSchedule.tsx'),r=fixture(),q=r.questions[0];
  q.response=serviceResponse('Synthetic completed service report.',feedback('handled'),q.followUpDate);
  const render=()=>renderToStaticMarkup(createElement(NextSchedule,{review:r}));assert.match(render(),/Synthetic completed service report/);assert.match(render(),/Preview follow-up email/);
  q.response=serviceResponse('Synthetic pending service report.',feedback('need_to_check'),q.followUpDate);assert.doesNotMatch(render(),/Synthetic pending service report|Preview follow-up email/);
 }finally{await server.close();}
});
