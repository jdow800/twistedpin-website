// Offline contract, completion and actual component checks; no live requests.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {questionNeedsResponse,reviewProgress} from '../src/components/labor/review-progress.ts';
import {answerLabel,serviceResponse,typedNote} from '../src/components/labor/service-feedback.ts';
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
  for(const text of ['Food net sales: $1,500 expected → $2,000 actual (+33%)','Biggest jump: 6pm-7pm','Published','captured after the fact','Added 0 staff-hours','Did the crew keep up?','>Kept up</button>','>Stretched</button>','>Fell behind</button>','One tap saves it.','Original question:',q.prompt])assert.ok(html.includes(text),text);
  // Jon Nov 9 ("give him some buttons ... quick painless"): three one-tap answers under the facts. Nothing is
  // preselected and nothing has to be typed or picked from a list before answering.
  assert.ok(html.indexOf('expected →')<html.indexOf('Did the crew keep up?'));assert.doesNotMatch(html,/Keep this coverage|Try an adjustment|Maybe, with a condition|walk-in|proven capacity|Nothing is saved until you confirm|Review answer|checked=""|aria-pressed="true"/);
  assert.equal((html.match(/<button type="button" aria-pressed="false">/g)||[]).length,3);assert.doesNotMatch(html,/type="radio"|<form|<textarea|<select|required|How did the crew handle it\?|Did a manager step in\?|Was the extra coverage planned/);assert.deepEqual(r,before);
  const desk=structuredClone(q);Object.assign(desk.demandSurge,{primaryMetric:'desk_interactions',metrics:[{metric:'desk_interactions',unit:'interactions',forecastValue:40,actualValue:60,increaseValue:20,increasePercent:50}],hotHours:[]});
  const deskHtml=render(desk);assert.match(deskHtml,/Desk interactions: 40 expected → 60 actual \(\+50%\)/);assert.doesNotMatch(deskHtml,/\$40|\$60|Building sales/);
  const longKnown={...q,demandSurge:{...q.demandSurge,knownOperatingExplanation:'Synthetic explanation '.repeat(30)+'<script>not HTML</script>'}};
  const knownHtml=render(longKnown);assert.match(knownHtml,/Saved operating explanation/);assert.match(knownHtml,/&lt;script&gt;not HTML&lt;\/script&gt;/);assert.doesNotMatch(knownHtml,/<script>/);assert.match(knownHtml,/Already noted:[\s\S]*…<\/p>/);
  const saved={...q,response:serviceResponse('Synthetic desk and kitchen queues.',feedback('strained'),q.followUpDate),revision:1,canUndo:true};
  const savedHtml=render(saved);assert.match(savedHtml,/<h3>Stretched<\/h3>/);assert.match(savedHtml,/Where:<\/strong> Kitchen/);assert.match(savedHtml,/Manager stepped in/);assert.match(savedHtml,/Synthetic desk and kitchen queues\./);
  for(const label of ['Add detail','Change','Undo'])assert.match(savedHtml,new RegExp('>'+label+'</button>'));assert.doesNotMatch(savedHtml,/<form|<textarea|Did the crew keep up/);assert.doesNotMatch(savedHtml,/Your decision|Try an adjustment/);
  // A one-tap answer saves the button's own words as its note; the card shows them once, with no guessed detail.
  const tapped={...q,response:serviceResponse(answerLabel('handled'),{overall:'handled',affectedDepartments:[],managerHelp:'unknown',extraStaffingAnticipated:'unknown'},q.followUpDate),revision:1,canUndo:true};
  assert.equal(tapped.response.note,'Kept up');assert.equal(typedNote(tapped.response.note),'');assert.equal(typedNote('The crew handled it'),'');assert.equal(typedNote(' Line cooks were buried. '),'Line cooks were buried.');
  const tappedHtml=render(tapped);assert.equal((tappedHtml.match(/Kept up/g)||[]).length,1);assert.doesNotMatch(tappedHtml,/Manager stepped in|Where:|Extra coverage/);
  // A saved "need to check" is still open: the three buttons come back with a line saying so.
  saved.response=serviceResponse('Synthetic pending team check.',feedback('need_to_check'),q.followUpDate);const pendingHtml=render(saved);assert.match(pendingHtml,/this stays open until then/);assert.match(pendingHtml,/>Kept up<\/button>/);
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
