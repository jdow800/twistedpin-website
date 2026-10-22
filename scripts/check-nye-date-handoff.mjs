/** Actual regular wizard/calendar and NYE/Jingle handoffs; synthetic APIs only. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const site = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(site, '.astro/nye-date-handoff');
await mkdir(output, { recursive: true });
// Exercise the real Zod client contract as well as the component fixtures below.
// One new policy must not poison every ordinary date in the monthly response.
const clientCheck = await build({stdin:{contents:`
import assert from 'node:assert/strict';
import {getMonthAvailabilityDetails,getAvailabilityDetails} from './src/tprs/client.ts';
const previous=globalThis.fetch;let response;
globalThis.fetch=async()=>new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
try {
 for(const [month,code] of [['2026-12','special_booking_day_only'],['2027-01','special_event_date']]) {
  const ordinary=month+'-29',special=month+'-31';
  response={days:[{date:ordinary,available:true,priceCents:9995},{date:special,available:false,priceCents:null}],policiesByDate:{[special]:{code,message:'Use the event booking page.'}}};
  const parsed=await getMonthAvailabilityDetails('00000000-0000-4000-8000-000000000005',month);
  assert.equal(parsed.days.find(d=>d.date===ordinary).available,true);assert.equal(parsed.policiesByDate[special].code,code);
  response={slots:[],policy:{code,message:'Use the event booking page.'}};
  assert.equal((await getAvailabilityDetails('00000000-0000-4000-8000-000000000005',special)).policy.code,code);
 }
 response=[{date:'2026-12-29',available:true,priceCents:9995}];assert.equal((await getMonthAvailabilityDetails('00000000-0000-4000-8000-000000000005','2026-12')).days.length,1);
}finally{globalThis.fetch=previous;}
`,resolveDir:site,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.PUBLIC_TPRS_API_BASE':JSON.stringify('http://synthetic.invalid'),'import.meta.env.PUBLIC_NYE_REHEARSAL':'false','import.meta.env.DEV':'false'}});
await import('data:text/javascript;base64,'+Buffer.from(clientCheck.outputFiles[0].text).toString('base64'));
for(const dev of [false,true]){
 const configCheck=await build({stdin:{contents:`
 import assert from 'node:assert/strict';
 import {jingleBookingDateRoute} from './src/tprs/eventDateRoutes';
 import {bookingPageConfig} from './src/tprs/pageConfig';
 assert.equal(bookingPageConfig.eventDateHandoffs,undefined);
 assert.equal(jingleBookingDateRoute({enabled:false,protectedReview:true}),null);
 const info=jingleBookingDateRoute({enabled:true});assert.equal(info.href,undefined);
 assert.equal(info.date,'2026-12-06');assert.equal(info.salesState,'details_pending');
 const review=jingleBookingDateRoute({enabled:true,protectedReview:true});
 assert.equal(review.href,${dev?JSON.stringify('/jingle-bowl/booking/'):'undefined'});
 `,resolveDir:site,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.DEV':String(dev)}});
 await import('data:text/javascript;base64,'+Buffer.from(configCheck.outputFiles[0].text).toString('base64'));
}
const clientSource = await readFile(resolve(site, 'src/tprs/client.ts'), 'utf8');
const exports = [...clientSource.matchAll(/export (?:async )?function (\w+)\(/g)].map(match => match[1]);
const fixture = `
const f=()=>window.fixture;
const log=(kind,args)=>{f().calls.push({kind,args});};
export class TprsCheckoutError extends Error{}
export class TprsApiError extends Error{}
const implementations={
 getActiveCheckoutAttempt:async()=>{if(f().discoveryFailure)throw Error('synthetic unavailable');return f().active??null;},
 getCheckoutAttemptStatus:async()=>({status:f().active.status,booking:f().active.status==='confirmed'?f().booking:undefined}),
 getBookableProducts:async()=>({categories:[f().category]}),
 getProducts:async()=>({products:f().category.products}),
 getProductForms:async()=>({forms:[]}),
 getSlotMaxUnits:async()=>({maxUnits:3}),
 getMonthAvailabilityDetails:async(id,month)=>{
   if(f().monthPending&&month==='2026-12')return new Promise(()=>{});
   if(f().monthFailure&&month==='2026-12')throw Error('synthetic month unavailable');
   return {days:Array.from({length:31},(_,i)=>({date:month+'-'+String(i+1).padStart(2,'0'),available:month!=='2026-12'||(f().jingle?[5,7,29,30]:[29,30]).includes(i+1),priceCents:9995})),policiesByDate:f().jingle&&month==='2026-12'?{'2026-12-06':{code:'special_booking_day_only',message:'Jingle Bowl reservations only.'}}:{}};
 },
 getAvailabilityDetails:async()=>({slots:[{time:'15:00',priceCents:9995,available:true}],policy:null}),
 getQuote:async()=>f().quote,
 previewOptInReward:async()=>({available:false}),
};
${exports.map(name => `export async function ${name}(...args){log('${name}',args);if(implementations.${name})return implementations.${name}(...args);throw Error('Unexpected synthetic API ${name}');}`).join('\n')}
`;
const bundle = await build({ stdin: { contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import './src/styles/global.css';
import BookingWizard from './src/components/tprs/BookingWizard.tsx';
import {initialState} from './src/components/tprs/state.ts';
import {bookingPageConfig,birthdaysPageConfig} from './src/tprs/pageConfig.ts';
import {jingleBookingDateRoute} from './src/tprs/eventDateRoutes.ts';
const settings=JSON.parse(sessionStorage.getItem('fixture-settings')||'{}');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const arcade={id:id(90),code:90,name:'Arcade card',defaultPriceCents:2000,shortDescription:'',description:''};
const product={id:id(5),code:5,name:'2 Hour w/ Shoes (Traditional)',shortDescription:'Shoes included',description:'',defaultPriceCents:9995,durationMinutes:120,minQuantityPerBooking:1,maxQuantityPerBooking:3,salesCutoffMinutesBefore:60,thumbnailUrl:null,heroImageUrl:null,addOnProducts:[arcade]};
const category={slug:'traditional_lanes',label:'Traditional lanes',subtitle:'Up to 5 guests per lane',products:[product]};
const customer={firstName:'Synthetic',lastName:'Guest',email:'synthetic@example.invalid',phone:'8155550100',zip:'60544'};
const items=[{productId:product.id,quantity:2,cartLineRef:'lane'}];
const quote={contractVersion:1,reviewToken:'synthetic-review',reviewExpiresAt:'2027-01-01T00:00:00Z',subtotalExcludingTax:23990,totalIncludingTax:23990,fees:[],autoDiscounts:[],taxBreakdown:{shoesRentalSubtotal:0,shoesRentalTax:0,foodBeverageSubtotal:0,foodBeverageTax:0,untaxedSubtotal:23990,totalTax:0}};
const booking={bookingId:id(20),paymentRecordId:id(21),customerId:id(22),invoiceNumber:'SYNTHETIC',railStatus:'succeeded'};
const originalOrder={cartToken:'synthetic',eventDate:'2026-12-30',startTime:'2026-12-30T15:00:00-06:00',paymentType:'full',paymentIntentId:'',items,acceptedTerms:true,formAnswers:[]};
window.fixture={...settings,calls:[],category,quote,booking};
if(settings.activeStatus)window.fixture.active={attemptId:id(99),recoveryToken:'synthetic',status:settings.activeStatus,paymentReady:true,originalRequest:{customer,...originalOrder,attemptKey:'synthetic',checkoutContractVersion:1,reviewToken:'synthetic'},originalOrder,financialSnapshot:{...quote,lineItems:[{name:product.name,quantity:2,unitPrice:9995,lineTotal:19990,isFee:false}]},endTime:'2026-12-30T23:00:00.000Z'};
window.stripeFake={retrievePaymentIntent:async()=>({paymentIntent:{status:'processing'}})};
window.elementsFake={};
if(settings.detail)window.fixtureWizardDraft={...initialState,step:'detail',date:'2026-12-30',category,product,laneQty:2,slot:{time:'15:00',priceCents:9995,available:true},addOnQtys:{[arcade.id]:2},guest:customer};
const jingleRoute=jingleBookingDateRoute({enabled:settings.jingle===true,protectedReview:settings.reviewLink===true});
const config=settings.birthday?birthdaysPageConfig:jingleRoute?{...bookingPageConfig,eventDateHandoffs:[jingleRoute]}:bookingPageConfig;
createRoot(document.getElementById('root')).render(<BookingWizard config={config}/>);
`, loader: 'tsx', resolveDir: site }, bundle: true, platform: 'browser', format: 'iife', write: false, jsx: 'automatic', outdir: output, external: ['/snap/*','/pattern/*'], loader: {'.woff2':'dataurl','.woff':'dataurl'},
define:{'import.meta.env.DEV':'true'},
plugins: [{name:'synthetic-client',setup(b){
 b.onResolve({filter:/tprs\/client$/},()=>({path:'client',namespace:'synthetic-client'}));
 b.onLoad({filter:/.*/,namespace:'synthetic-client'},()=>({contents:fixture,loader:'js'}));
 b.onLoad({filter:/[\\/]BookingWizard\.tsx$/},async args=>{let source=await readFile(args.path,'utf8');source=source.replace('useReducer(wizardReducer, initialState)','useReducer(wizardReducer, window.fixtureWizardDraft ?? initialState)');source=source.replace('const [recovery, setRecovery]','window.fixtureDraft = state;\n  const [recovery, setRecovery]');return {contents:source,loader:'tsx'};});
}},{name:'synthetic-stripe',setup(b){
 b.onResolve({filter:/^@stripe\/react-stripe-js$/},()=>({path:'react',namespace:'synthetic-stripe'}));
 b.onResolve({filter:/^\.\.?\/stripe$/},()=>({path:'stripe',namespace:'synthetic-stripe'}));
 b.onLoad({filter:/.*/,namespace:'synthetic-stripe'},args=>({loader:'tsx',resolveDir:site,contents:args.path==='stripe'?'export const STRIPE_AVAILABLE=true;export const STRIPE_APPEARANCE={};export function getStripe(){return null;}':`import React from 'react';export function Elements({children}){return children;}export function PaymentElement(){return <div>Synthetic payment</div>;}export function useStripe(){return window.stripeFake;}export function useElements(){return window.elementsFake;}`}));
}}] });
const js = bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
const css = bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
const html='<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic NYE date handoff</title><link rel="stylesheet" href="/fixture.css"></head><body><main id="root"></main><script src="/fixture.js"></script></body></html>';
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 res.setHeader('Content-Type',path==='/fixture.js'?'text/javascript':path==='/fixture.css'?'text/css':'text/html; charset=utf-8');
 res.end(path==='/fixture.js'?js:path==='/fixture.css'?css:html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const results=[],errors=[],external=[];
let browser;
try {
 browser=await chromium.launch({headless:true});
 async function fresh(settings={},width=390,query=''){
  const context=await browser.newContext({viewport:{width,height:844},timezoneId:settings.timezone??'America/Los_Angeles',reducedMotion:'reduce'});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==base){external.push(route.request().url());return route.abort();}return route.continue();});
  await context.addInitScript(settings=>{sessionStorage.setItem('fixture-settings',JSON.stringify(settings));},settings);
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date(settings.now??'2026-10-21T20:00:00Z'));
  await page.goto(base+'/reserve/'+query);return page;
 }
 async function calendarDecember(page){
  await page.getByRole('button',{name:'Open full calendar'}).click();
  while(!(await page.locator('.tprs-cal-month').innerText()).includes('December'))await page.getByRole('button',{name:'Next month',exact:true}).click();
  return page.getByRole('button',{name:'2026-12-31: NYE packages',exact:true});
 }
 async function assertHandoff(page,before=true){
  await page.getByRole('heading',{name:"New Year's Eve parties only."}).waitFor();
  assert.equal(await page.locator('.tprs-summary,.tprs-product-card,.tprs-tile,.tprs-slot-grid').count(),0,'ordinary choices and total absent');
  assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).count(),0);
  const cta=page.getByRole('link',{name:before?'See NYE opening countdown':'Choose your NYE party'});
  assert.equal(await cta.getAttribute('href'),'/reserve/nye/');
  assert.equal((await page.locator('body').innerText()).includes('$'),false);
  assert.equal(await page.evaluate(()=>window.fixture.calls.some(c=>/Cart|Payment|convert/.test(c.kind))),false,'no new holds or payments');
 }
 for(const width of [320,390,430,1280]){
  const page=await fresh({},width);
  const day=await calendarDecember(page);assert.equal(await day.isEnabled(),true);
  assert.equal(await day.locator('.tprs-cal-price').count(),0);
  await day.focus();await page.keyboard.press('Enter');await assertHandoff(page);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'nye-date-heading');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'See NYE opening countdown');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(output,`before-${width}.png`),fullPage:true});
  assert.equal(new URL(page.url()).searchParams.get('date'),'2026-12-31');
  await page.reload();await assertHandoff(page);
  await page.getByRole('button',{name:'Back to regular reservations'}).click();
  await page.getByRole('button',{name:'Open full calendar'}).waitFor();
  assert.equal(new URL(page.url()).searchParams.has('date'),false);
  await page.context().close();results.push(`calendar keyboard/reload/return/width ${width}`);
 }
 for(const settings of [{monthPending:true},{monthFailure:true}]){
  const page=await fresh(settings);const day=await calendarDecember(page);
  assert.equal(await day.isEnabled(),true);await day.click();await assertHandoff(page);await page.context().close();results.push(JSON.stringify(settings));
 }
 const detail=await fresh({detail:true,now:'2026-12-29T20:00:00Z'});
 await detail.getByRole('option',{name:/3:00/}).waitFor();
 const prior=await detail.evaluate(()=>window.fixtureDraft);
 await detail.getByRole('button',{name:/December 31.*NYE packages/}).click();await assertHandoff(detail,false);
 assert.deepEqual(await detail.evaluate(()=>window.fixtureDraft),prior,'date handoff preserves exact ordinary draft');
 await detail.screenshot({path:resolve(output,'open-390.png'),fullPage:true});
 await detail.goBack();await detail.getByRole('option',{name:/3:00/}).waitFor();
 assert.deepEqual(await detail.evaluate(()=>window.fixtureDraft),prior,'browser Back preserves ordinary selection');
 await detail.goForward();await assertHandoff(detail,false);
 await detail.getByRole('button',{name:'Back to regular reservations'}).click();
 await detail.getByRole('option',{name:/3:00/}).waitFor();
 await detail.getByRole('button',{name:'Open full calendar'}).click();
 assert.equal(await detail.locator('.tprs-cal-cell').filter({has:detail.locator('.tprs-cal-day').getByText('28',{exact:true})}).isDisabled(),true,'ordinary past/closed date remains disabled');
 await detail.locator('.tprs-cal-cell').filter({has:detail.locator('.tprs-cal-day').getByText('29',{exact:true})}).click();
 await detail.waitForFunction(()=>window.fixtureDraft.date==='2026-12-29');await detail.getByRole('option',{name:/3:00/}).waitFor();
 assert.equal(await detail.locator('.tprs-nye-handoff').count(),0);await detail.context().close();results.push('detail draft, browser Back/Forward, ordinary disabled date and date change after Back');
 const boundary=await fresh({now:'2026-11-18T14:59:59.999Z'},390,'?date=2026-12-31');await assertHandoff(boundary);
 await boundary.clock.setFixedTime(new Date('2026-11-18T15:00:00.000Z'));await boundary.evaluate(()=>window.dispatchEvent(new Event('focus')));await assertHandoff(boundary,false);await boundary.context().close();results.push('direct date query and exact Chicago opening transition');
 for(const activeStatus of ['processing','needs_review','confirmed']){
  const page=await fresh({activeStatus},390,'?date=2026-12-31');
  await page.getByRole('heading',{name:activeStatus==='confirmed'?"You're booked.":'Your saved reservation',exact:true}).waitFor();
  assert.equal(await page.locator('.tprs-nye-handoff').count(),0);
  assert.equal(await page.getByRole('button',{name:'Open full calendar'}).count(),0);
  assert.equal(await page.evaluate(()=>window.fixture.calls.some(c=>/Cart|createPayment|convert/.test(c.kind))),false);
  await page.context().close();results.push(`retained ${activeStatus} owns flow`);
 }
 const failure=await fresh({discoveryFailure:true},390,'?date=2026-12-31');await failure.getByRole('alert').waitFor();assert.equal(await failure.locator('.tprs-nye-handoff').count(),0);await failure.context().close();results.push('unknown saved payment blocks handoff');
 const birthday=await fresh({birthday:true});await birthday.getByRole('button',{name:'Open full calendar'}).click();while(!(await birthday.locator('.tprs-cal-month').innerText()).includes('December'))await birthday.getByRole('button',{name:'Next month'}).click();assert.equal(await birthday.getByRole('button',{name:/NYE packages/}).count(),0);await birthday.context().close();results.push('other page configs remain unchanged');
 const ended=await fresh({now:'2027-01-01T06:30:00.000Z'},390,'?date=2026-12-31');await ended.getByRole('button',{name:'Open full calendar'}).waitFor();assert.equal(await ended.locator('.tprs-nye-handoff').count(),0);assert.equal(await ended.getByRole('button',{name:/NYE packages/}).count(),0);await ended.context().close();results.push('past event query cannot reopen NYE handoff');
 async function assertJingle(page,reviewLink=false){
  const heading=page.getByRole('heading',{name:'December 6 belongs to Jingle Bowl.',exact:true});await heading.waitFor();
  assert.match(await page.locator('.jingle-route-card').innerText(),/Regular lane reservations won't be offered before, during or after/);
  assert.match(await page.locator('.jingle-route-card').innerText(),/still being finalized/);
  assert.equal(await page.locator('.jingle-route-card a').count(),reviewLink?1:0);
  if(reviewLink)assert.equal(await page.locator('.jingle-route-card a').getAttribute('href'),'/jingle-bowl/booking/');
  assert.equal(await page.evaluate(()=>window.fixture.calls.some(c=>/Cart|Payment|convert/.test(c.kind))),false);
 }
 for(const width of [320,390,1280]){
  const page=await fresh({jingle:true,reviewLink:true},width);await calendarDecember(page);
  const day=page.getByRole('button',{name:'2026-12-06: Jingle Bowl packages',exact:true});
  assert.equal(await day.isEnabled(),true);assert.equal(await day.locator('.tprs-cal-price').count(),0);
  await day.focus();await page.keyboard.press('Enter');await assertJingle(page,true);
  assert.equal(await page.evaluate(()=>document.activeElement.textContent),'December 6 belongs to Jingle Bowl.');
  await page.keyboard.press('Tab');assert.match(await page.evaluate(()=>document.activeElement.textContent),/Review Jingle Bowl booking/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(output,`jingle-review-${width}.png`),fullPage:true});
  await page.reload();await assertJingle(page,true);
  await page.getByRole('button',{name:'Choose another date',exact:true}).click();
  await page.getByRole('button',{name:'Open full calendar'}).waitFor();assert.equal(new URL(page.url()).searchParams.has('date'),false);
  await page.context().close();results.push(`Jingle protected review keyboard/reload/return/width ${width}`);
 }
 for(const settings of [{monthPending:true},{monthFailure:true}]){
  const page=await fresh({jingle:true,...settings});await calendarDecember(page);
  await page.getByRole('button',{name:'2026-12-06: Jingle Bowl packages',exact:true}).click();await assertJingle(page);
  await page.context().close();results.push(`Jingle informational destination ${JSON.stringify(settings)}`);
 }
 const jingleDetail=await fresh({jingle:true,detail:true,now:'2026-12-04T20:00:00Z'});await jingleDetail.getByRole('option',{name:/3:00/}).waitFor();
 const priorJingleDraft=await jingleDetail.evaluate(()=>window.fixtureDraft);await calendarDecember(jingleDetail);
 await jingleDetail.getByRole('button',{name:'2026-12-06: Jingle Bowl packages',exact:true}).click();await assertJingle(jingleDetail);
 assert.deepEqual(await jingleDetail.evaluate(()=>window.fixtureDraft),priorJingleDraft);
 const callsWhileHandoff=await jingleDetail.evaluate(()=>window.fixture.calls.length);await jingleDetail.waitForTimeout(100);
 assert.equal(await jingleDetail.evaluate(()=>window.fixture.calls.length),callsWhileHandoff,'handoff does not re-quote or check capacity');
 await jingleDetail.goBack();await jingleDetail.getByRole('option',{name:/3:00/}).waitFor();assert.deepEqual(await jingleDetail.evaluate(()=>window.fixtureDraft),priorJingleDraft);
 await jingleDetail.goForward();await assertJingle(jingleDetail);
 await jingleDetail.getByRole('button',{name:'Choose another date',exact:true}).click();await calendarDecember(jingleDetail);
 for(const day of ['5','7'])assert.equal(await jingleDetail.locator('.tprs-cal-cell').filter({has:jingleDetail.locator('.tprs-cal-day').getByText(day,{exact:true})}).isEnabled(),true);
 await jingleDetail.locator('.tprs-cal-cell').filter({has:jingleDetail.locator('.tprs-cal-day').getByText('7',{exact:true})}).click();
 await jingleDetail.waitForFunction(()=>window.fixtureDraft.date==='2026-12-07');await jingleDetail.context().close();results.push('Jingle preserves ordinary draft/history and adjacent ordinary dates');
 for(const activeStatus of ['processing','needs_review','confirmed']){
  const page=await fresh({jingle:true,reviewLink:true,activeStatus},390,'?date=2026-12-06');
  await page.getByRole('heading',{name:activeStatus==='confirmed'?"You're booked.":'Your saved reservation',exact:true}).waitFor();
  assert.equal(await page.locator('.jingle-route-card').count(),0);assert.equal(await page.locator('a[href^="/jingle-bowl"]').count(),0);
  await page.context().close();results.push(`Jingle retained ${activeStatus} wins over date query`);
 }
 const jingleFailure=await fresh({jingle:true,discoveryFailure:true},390,'?date=2026-12-06');await jingleFailure.getByRole('alert').waitFor();assert.equal(await jingleFailure.locator('.jingle-route-card').count(),0);await jingleFailure.context().close();results.push('Jingle discovery failure blocks handoff');
 const tokyo=await fresh({jingle:true,timezone:'Asia/Tokyo',now:'2026-12-07T05:59:59.999Z'});
 await calendarDecember(tokyo);
 const tokyoDay=tokyo.getByRole('button',{name:'2026-12-06: Jingle Bowl packages',exact:true});
 assert.equal(await tokyoDay.isEnabled(),true,'December 6 remains selectable while it is December 6 in Chicago');
 await tokyoDay.click();await assertJingle(tokyo);
 await tokyo.clock.setFixedTime(new Date('2026-12-07T06:00:00.000Z'));await tokyo.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await tokyo.getByRole('button',{name:'Open full calendar'}).waitFor();assert.equal(await tokyo.locator('.jingle-route-card').count(),0);
 await tokyo.reload();await tokyo.getByRole('button',{name:'Open full calendar'}).waitFor();assert.equal(await tokyo.locator('.jingle-route-card').count(),0);
 await calendarDecember(tokyo);assert.equal(await tokyo.getByRole('button',{name:/Jingle Bowl packages/}).count(),0);
 await tokyo.context().close();results.push('Tokyo calendar and query expire exactly at Chicago December 7 midnight');
 for(const settings of [{},{jingle:true,birthday:true},{jingle:true,now:'2026-12-07T08:00:00Z'}]){
  const page=await fresh(settings,390,'?date=2026-12-06');await page.getByRole('button',{name:'Open full calendar'}).waitFor();
  assert.equal(await page.locator('.jingle-route-card').count(),0);assert.equal(await page.locator('a[href^="/jingle-bowl"]').count(),0);
  await page.context().close();results.push(`Jingle absent from default/other/expired configuration ${JSON.stringify(settings)}`);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(resolve(output,'results.json'),JSON.stringify({results,errors,external},null,2));
 console.log(`NYE/Jingle date handoff: ${results.length} scenarios passed; synthetic APIs only.`);
} finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
