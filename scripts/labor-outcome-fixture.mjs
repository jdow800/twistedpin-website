// Entirely fictional service/coverage evidence. Never a real GM response.
import {fixture as surgeFixture} from './labor-demand-surprise-fixture.mjs';
export function fixture(reason='applied_feedback'){
 const review=surgeFixture(),q=review.questions[0];delete q.demandSurge;
 const shifts=n=>Array.from({length:n},()=>({department:'kitchen',role:'Cook',startMinute:960,endMinute:1200}));
 const layer=(n,status='complete')=>({status,capturedAt:'2026-10-29T16:00:00Z',shifts:shifts(n)});
 review.packet.weekStart='2026-10-26';
 q.id='synthetic-outcome';q.date='2026-10-26';q.title='How did the crew handle service?';q.prompt='Synthetic service check; these are fictional staffing comparisons.';
 q.outcomeReview={comparisonKey:'c'.repeat(64),date:q.date,period:{startMinute:960,endMinute:1200,label:'4pm-8pm'},draft:{week:'2026-10-20',origin:'2026-10-12',version:1,sha256:'d'.repeat(64),madeAt:'2026-10-12T14:00:00Z'},reason,appliedAdjustmentIds:reason==='applied_feedback'?['synthetic-change']:[],baselineSha256:'e'.repeat(64),staffing:{dataBaseline:layer(2),finalIssued:layer(1),published:layer(2),recorded:layer(2,'provisional')},metrics:[{metric:'food_and_beverage_net_sales',forecastValue:150000,actualValue:140000,unit:'cents'}],eventContext:{complete:true,affected:false},sourceRefs:['Fictional outcome source'],capturedAt:'2026-10-29T16:00:00Z',operationalOutcomeStatus:'unknown',payrollSavingsCents:null};
 q.outcomeReview.staffing.recorded.shifts.push({department:'management',role:'Manager',startMinute:960,endMinute:1200});
 return review;
}
