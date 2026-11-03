import './pricingRetry.test';
import './shortNotice.test';
import assert from 'node:assert/strict';
import { bookingPolicy, eventStartMs, eventTimeError, shortNoticeMessage, centralDate, civilDay, daysAway, eventDateError, getMinDate, canonicalBuild, configKey, inputFingerprint, pricingContractError, reviewError, allowsManualQuote } from '../src/lib/builderContract';
import { millisecondsToCentralMidnight } from '../src/lib/useCentralDay';
import { linkedPayload, buildSummaryText, type SummaryData } from '../src/components/builder/SendSummarySheet';
import builderSubmit from '../src/api/builderSubmit';
import exploreSubmit from '../src/api/exploreSubmit';
import { sentEmails } from './endpointRuntime';
let checks = 0;
function eq(actual: unknown, expected: unknown) { assert.deepEqual(actual, expected); checks++; }
const now = new Date('2026-10-23T15:00:00Z');
eq(centralDate(new Date('2026-10-24T04:59:59Z')), '2026-10-23');
eq(getMinDate(new Date('2026-10-24T04:59:59Z')), '2026-10-23');
eq(getMinDate(new Date('2026-10-24T05:00:00Z')), '2026-10-24');
eq(civilDay('2026-02-30'), null); eq(civilDay('not-a-date'), null);
eq(eventDateError('2026-10-23', now), '');
eq(eventDateError('2026-10-22', now).includes('today'), true);
eq(eventDateError('2027-10-24', now).includes('365'), true);
for (const d of [0, 1, 2, 3, 4, 9, 10]) {
  const date = new Date(Date.UTC(2026, 9, 23 + d)).toISOString().slice(0, 10);
  eq(eventDateError(date, now), ''); eq(daysAway(date, now), d);
}
eq(millisecondsToCentralMidnight(new Date('2026-03-08T06:00:00Z')), 23 * 3600000);
eq(millisecondsToCentralMidnight(new Date('2026-11-01T05:00:00Z')), 25 * 3600000);
eq(reviewError({ date: '2026-11-01', reviewedDay: '2026-10-22' }, now).includes('refreshed'), true);
eq(allowsManualQuote('engine_unavailable'), true); eq(allowsManualQuote('rate_limited'), true);
for (const code of ['invalid', 'closed', 'too_soon', 'too_far', 'outside_hours', 'forbidden', 'too_large']) eq(allowsManualQuote(code), false);
const summary: SummaryData = {
  date: '2026-11-01', time: '16:00', duration: 2, guestCount: 15, laneType: 'vip',
  foodPackage: 'Pizza & Pop', foodPackageSlug: 'pizza_pop', foodEstimate: '',
  barSelection: 'own_tab', barQty: 15, addons: [{ slug:'tiramisu', label:'Tiramisu', qty:2 },{slug:'goodie_bags', label:'Goodie Bags',qty:15}],
  notes: '', estimateTotal:'$605', estimateNum:605, depositNum:305, laneLabel:'VIP Suite',
  pricingStatus:'estimate_shown', reviewedDay:'2026-10-23', shortNotice:true,
};
const build = canonicalBuild(summary);
eq(configKey(build), '["2026-11-01","16:00",2,15,"vip","pizza_pop","individual",0,"goodie_bags:15,tiramisu:2"]');
eq(inputFingerprint(build), 'a3f5c318');
eq(inputFingerprint(canonicalBuild({...summary,barSelection:'15_card'})), 'ddda818a');
eq(inputFingerprint(canonicalBuild({...summary,guestCount:100,laneType:'traditional'})), 'ad97364b');
eq(inputFingerprint(canonicalBuild({...summary,time:'__outside__'})), 'cadd152c');
eq(inputFingerprint(canonicalBuild({...summary,guestCount:105})), '98a0b084');
summary.inputFingerprint=inputFingerprint(build);
const payload=linkedPayload(summary,'E-TEST',now.toISOString());
eq(pricingContractError(payload,now),'');
eq(payload.event.duration,2); eq(payload.bar_selection,'individual');
eq(linkedPayload({...summary,barSelection:'individual'},'E-TEST',now.toISOString()).bar_selection,'none');
for(const patch of [{estimate:{...payload.estimate!,total:0}},{estimate:{...payload.estimate!,total:Infinity}},{estimate:{...payload.estimate!,deposit:NaN}},{estimate:{...payload.estimate!,input_fingerprint:'wrong'}},{manual_reason:'custom_event' as const},{event:{...payload.event,date:'2026-10-23'}}]) eq(!!pricingContractError({...payload,...patch},now),true);
const manual = {...summary,guestCount:105,pricingStatus:'manual_quote_required' as const,manualReason:'custom_event' as const,estimateTotal:'',estimateNum:null,depositNum:null,inputFingerprint:undefined};
const manualPayload=linkedPayload(manual,'E-TEST',now.toISOString());
eq(pricingContractError(manualPayload,now),''); eq(manualPayload.estimate,null); eq(manualPayload.event.duration,undefined);
eq(buildSummaryText(manual).includes('$605'),false); eq(buildSummaryText(manual).includes('no event estimate'),true);
eq(buildSummaryText({...manual,time:'__outside__',outsideHoursTime:'10am'}).includes('$605'),false);
const hundred={...summary,guestCount:100,laneType:'traditional' as const};
hundred.inputFingerprint=inputFingerprint(canonicalBuild(hundred));
eq(pricingContractError(linkedPayload(hundred,'E-TEST',now.toISOString()),now),'');
// Run both real endpoint schemas/execute functions with every integration mocked.
const RealDate=Date;
globalThis.Date=class extends RealDate { constructor(...args:any[]){super(...(args.length?args:[now.toISOString()]) as [any]);} static now(){return now.getTime();} } as DateConstructor;
const forwarded:any[]=[];
globalThis.fetch=async (_url:any,init:any)=>{forwarded.push(JSON.parse(init.body));return {ok:true,status:200} as Response;};
const linkedInput=builderSubmit.inputSchema!.parse(payload);
await builderSubmit.execute({input:linkedInput,context:{} as any});
eq(forwarded[0].estimate.input_fingerprint,'a3f5c318');
eq(forwarded[0].pricing_status,'estimate_shown');
const {pricing_status,manual_reason,...legacy}=payload;
delete legacy.estimate!.input_fingerprint;
await builderSubmit.execute({input:builderSubmit.inputSchema!.parse(legacy),context:{} as any});
eq(forwarded[1].pricing_status,undefined);
await assert.rejects(()=>builderSubmit.execute({input:{...linkedInput,estimate:{...linkedInput.estimate!,total:0}},context:{} as any}),/refreshed/);checks++;
globalThis.fetch=async()=>({ok:false,status:400} as Response);
await assert.rejects(()=>builderSubmit.execute({input:linkedInput,context:{} as any}),/refreshed/);checks++;
const publicInput={
  firstName:'Test',lastName:'Guest',phone:'5550100',email:'test@example.test',
  ...summary,foodPackageSlug:summary.foodPackageSlug,estimateTotal:'$605',
  pricing_status:'estimate_shown' as const,submitted_at:now.toISOString(),
  estimate:{total:605,deposit:305,lane_label:'VIP Suite',input_fingerprint:'a3f5c318'},
};
const parsed=exploreSubmit.inputSchema!.parse(publicInput);
await exploreSubmit.execute({input:parsed,context:{} as any});
eq(sentEmails.length,1);eq(sentEmails[0].to,'info@twistedpin.com');
const email=JSON.stringify(sentEmails[0]);
eq(email.includes('a3f5c318'),true);eq(email.includes('staff follow-up required'),true);eq(email.includes('605'),true);
await assert.rejects(()=>exploreSubmit.execute({input:{...parsed,estimateTotal:'$999'},context:{} as any}),/refreshed/);checks++;
await assert.rejects(()=>exploreSubmit.execute({input:{...parsed,foodPackageSlug:'italiano'},context:{} as any}),/refreshed/);checks++;
const publicManual={...parsed,guestCount:105,pricing_status:'manual_quote_required' as const,manual_reason:'custom_event' as const,estimate:null,estimateTotal:''};
await exploreSubmit.execute({input:publicManual,context:{} as any});
eq(JSON.stringify(sentEmails[1]).includes('no event estimate'),true);
eq(JSON.stringify(sentEmails[1]).includes('$605'),false);
await assert.rejects(()=>exploreSubmit.execute({input:{...publicManual,estimateTotal:'$605'},context:{} as any}),/refreshed/);checks++;
globalThis.Date=RealDate;
console.log(checks+' contract/schema/mock-endpoint checks passed; no external calls.');
