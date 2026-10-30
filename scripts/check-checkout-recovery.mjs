/** Offline real React checkout checks. No Stripe/API/production requests.
 * Run: node scripts/check-checkout-recovery.mjs
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const site = fileURLToPath(new URL('../', import.meta.url));
const fixture = `
export const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
export const product = {id:id(5),code:5,name:'Two-hour bowling',shortDescription:'Shoes included',description:'',defaultPriceCents:11995,durationMinutes:120,minQuantityPerBooking:1,maxQuantityPerBooking:8,salesCutoffMinutesBefore:45,thumbnailUrl:null,heroImageUrl:null,addOnProducts:[]};
export const customer = {firstName:'Test',lastName:'Guest',email:'synthetic@example.invalid',phone:'8155550100',zip:'60544',smsMarketingOptIn:false};
export const quote = {reviewToken:'review-one',reviewExpiresAt:'2099-01-01T00:00:00.000Z',contractVersion:1,subtotalExcludingTax:11995,taxBreakdown:{shoesRentalSubtotal:0,shoesRentalTax:0,foodBeverageSubtotal:0,foodBeverageTax:0,untaxedSubtotal:11995,totalTax:0},fees:[],autoDiscounts:[],totalIncludingTax:11995};
export const items = [{productId:product.id,quantity:1,cartLineRef:'lane'}];
export const request = {customer,eventDate:'2098-11-23',startTime:'2098-11-23T12:30:00-06:00',items,attemptKey:'stable-original-key',checkoutContractVersion:1,reviewToken:quote.reviewToken,acceptedTerms:true,formAnswers:[{formFieldId:id(8),value:'Original choice'}]};
export const payment = {clientSecret:'pi_fixture_secret_synthetic',paymentIntentId:'pi_fixture',attemptId:id(90),recoveryToken:'synthetic-recovery',attemptStatus:'prepared'};
export const booking = {bookingId:id(20),paymentRecordId:id(21),customerId:id(22),invoiceNumber:'TP-TEST',railStatus:'succeeded'};
export const discovered = {attemptId:payment.attemptId,recoveryToken:payment.recoveryToken,paymentIntentId:payment.paymentIntentId,clientSecret:payment.clientSecret,status:'prepared',paymentReady:true,originalRequest:{...request,items:[{...items[0],quantity:2}]},originalOrder:{cartToken:'synthetic-cart',eventDate:request.eventDate,startTime:request.startTime,paymentType:'full',items:[{...items[0],quantity:2}],paymentIntentId:payment.paymentIntentId,acceptedTerms:true,formAnswers:request.formAnswers},financialSnapshot:{subtotalExcludingTax:23990,totalIncludingTax:23990,taxBreakdown:{...quote.taxBreakdown,untaxedSubtotal:23990},lineItems:[{name:'Original accepted bowling',quantity:2,unitPrice:11995,lineTotal:23990,isFee:false}]},endTime:'2098-11-23T20:30:00.000Z'};
// The pre-upgrade client genuinely omitted these fields; do not fabricate a
// modern request with accepted terms and call it a legacy recovery fixture.
export const oldRequest={customer,eventDate:request.eventDate,startTime:request.startTime,items:[{...items[0],quantity:2}],attemptKey:'original-old-client-key'};
export const incomplete={...discovered,paymentReady:false,originalRequest:oldRequest,originalOrder:{...discovered.originalOrder,acceptedTerms:false,formAnswers:undefined}};
`;
const fixturePlugin = {name:'fixture',setup(b){b.onResolve({filter:/^fixture$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'js'}));}};
const pure = await build({stdin:{contents:`
import assert from 'node:assert/strict';
import {product,customer,quote,items,request,payment,booking,discovered,incomplete,id} from 'fixture';
import {initialState,wizardReducer} from './src/components/tprs/state.ts';
import {saveCheckoutRecovery,loadCheckoutRecovery,saveDiscoveredCheckout,loadDiscoveredCheckout,canReleaseCheckout,resolvedCheckoutUrl,CHECKOUT_RECOVERY_KEY,DISCOVERED_CHECKOUT_KEY} from './src/components/tprs/checkoutRecovery.ts';
import {paymentIntentCreateResponseSchema,quoteResponseSchema} from './src/tprs/schemas/checkout.ts';
const draft={...initialState,step:'payment',date:request.eventDate,product,slot:{time:'12:30',priceCents:11995,available:true},guest:customer,checkoutLocked:true};
const record={version:1,draft,quote,request,payment,cartToken:'synthetic-cart',confirmStarted:true,status:'processing'};
const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
saveCheckoutRecovery(storage,record);const restored=loadCheckoutRecovery(storage);
saveDiscoveredCheckout(storage,discovered);assert.deepEqual(loadDiscoveredCheckout(storage),discovered);
storage.setItem(DISCOVERED_CHECKOUT_KEY,JSON.stringify({...discovered,paymentReady:undefined}));assert.equal(loadDiscoveredCheckout(storage).paymentReady,false);
saveDiscoveredCheckout(storage,incomplete);assert.equal(loadDiscoveredCheckout(storage).originalRequest.acceptedTerms,undefined);assert.equal(loadDiscoveredCheckout(storage).originalOrder.acceptedTerms,false);
assert.deepEqual(restored.request,request);assert.deepEqual(restored.payment,payment);
for(const action of [{type:'SET_LANE_QTY',qty:2},{type:'REMOVE_LANE'},{type:'GO_STEP',step:'main'},{type:'SET_DATE',date:'2098-11-24'},{type:'RESET'},{type:'SET_FORM_ANSWERS',answers:[]}])assert.equal(wizardReducer(draft,action),draft);
const confirmed=wizardReducer({...draft,laneQty:2},{type:'CONVERTED',booking});
for(const action of [{type:'SET_LANE_QTY',qty:1},{type:'SET_CHECKOUT_LOCK',locked:false},{type:'CLEAR_SLOT'},{type:'SET_FORM_ANSWERS',answers:[]}])assert.equal(wizardReducer(confirmed,action),confirmed);
assert.equal(wizardReducer(confirmed,{type:'RESET'}),initialState);
const cleaned=new URL(resolvedCheckoutUrl('https://example.invalid/reserve?ref=fall&tag=a&payment_intent=pi_fixture&payment_intent_client_secret=synthetic&redirect_status=succeeded&tag=b#details'));
assert.deepEqual([...cleaned.searchParams],[['ref','fall'],['tag','a'],['tag','b']]);assert.equal(cleaned.hash,'#details');
for(const status of ['creating','prepared','processing','confirmed','needs_review','refund_requested','refund_failed'])assert.equal(canReleaseCheckout(status),false);
assert.equal(canReleaseCheckout('cancelled'),true);assert.equal(canReleaseCheckout('refunded'),true);
storage.setItem(CHECKOUT_RECOVERY_KEY,'broken');assert.throws(()=>loadCheckoutRecovery(storage));
assert.equal(paymentIntentCreateResponseSchema.parse({clientSecret:'legacy',paymentIntentId:'pi_legacy'}).attemptId,undefined);
assert.equal(quoteResponseSchema.parse({...quote,reviewToken:undefined,contractVersion:undefined,reviewExpiresAt:undefined}).reviewToken,undefined);
console.log('Checkout contract/storage/reducer checks passed.');
`,resolveDir:site,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[fixturePlugin]});
await import(`data:text/javascript;base64,${Buffer.from(pure.outputFiles[0].text).toString('base64')}`);

const harness = await build({stdin:{contents:`
import React,{useReducer,useState} from 'react';
import {createRoot} from 'react-dom/client';
import PaymentStep from './src/components/tprs/steps/PaymentStep.tsx';
import BookingWizard from './src/components/tprs/BookingWizard.tsx';
import BookingContext from './src/components/tprs/BookingContext.tsx';
import StickySummary from './src/components/tprs/StickySummary.tsx';
import {useStepHistory} from './src/components/tprs/useStepHistory.ts';
import {initialState,wizardReducer} from './src/components/tprs/state.ts';
import {loadCheckoutRecovery,saveCheckoutRecovery,CHECKOUT_RECOVERY_KEY} from './src/components/tprs/checkoutRecovery.ts';
import {product,customer,quote,items,request,payment,booking,discovered,incomplete,id} from 'fixture';
window.calls=JSON.parse(sessionStorage.getItem('test-calls')||'[]');
const log=(kind,payload)=>{window.calls.push({kind,payload});sessionStorage.setItem('test-calls',JSON.stringify(window.calls));};
const setting=()=>JSON.parse(sessionStorage.getItem('test-settings')||'{}');
window.configure=next=>sessionStorage.setItem('test-settings',JSON.stringify({...setting(),...next}));
// Seed a pre-payment draft only in this fixture. The actual wizard effects,
// reducer, payment flow and confirmation remain the production components.
if(setting().wizardDraft)window.fixtureWizardDraft={...initialState,step:'payment',date:request.eventDate,product,slot:{time:'12:30',priceCents:11995,available:true},guest:customer,laneQty:2,formAnswers:request.formAnswers};
window.stripeFake={
 retrievePaymentIntent:async()=>({paymentIntent:{id:'pi_fixture',status:setting().provider||'requires_payment_method'}}),
 confirmPayment:async()=>{log('confirm',{});window.configure({provider:setting().confirmProcessing?'processing':'succeeded'});if(setting().authReload){const target=new URL(location.href);target.searchParams.set('payment_intent',payment.paymentIntentId);target.searchParams.set('payment_intent_client_secret',payment.clientSecret);target.searchParams.set('redirect_status','succeeded');if(setting().authWizard)target.searchParams.set('wizard','1');location.assign(target.href);await new Promise(()=>{});}return {};},
};
window.elementsFake={submit:async()=>{log('submit',{});return {};},update:()=>{}};
const heldItems=[{...items[0],startTime:request.startTime},{productId:id(6),quantity:2,cartLineRef:'arcade',startTime:request.startTime}];
const heldDeadline=new Date(Date.now()+600000).toISOString();
const held={cartToken:'synthetic-cart',revision:3,items:heldItems,holdExpiresAt:heldDeadline,holds:[{id:product.id,cartLineRef:'lane',poolId:product.id,count:1,startTime:new Date(request.startTime).toISOString(),endTime:'2098-11-23T20:50:00.000Z',expiresAt:heldDeadline}]};
const originalFetch=window.fetch;
window.fetch=async(url,options={})=>{
 if(!String(url).startsWith('/fixture-api'))return originalFetch(url,options);
 const path=String(url).slice('/fixture-api'.length);const body=options.body?JSON.parse(options.body):null;log(path,body);
 const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
 if(path==='/api/cart' || path.startsWith('/api/cart/items')){
  if(setting().cartNetwork)throw new Error('INTERNAL synthetic cart diagnostics');
  const copy=structuredClone(held),variant=setting().cartVariant;
  if(variant==='missing-addon')copy.items=copy.items.slice(0,1);
  if(variant==='wrong-product')copy.items[0].productId=id(7);
  if(variant==='expired'){copy.holdExpiresAt='2000-01-01T00:00:00.000Z';copy.holds[0].expiresAt=copy.holdExpiresAt;}
  if(variant==='missing-hold')copy.holds=[];
  if(variant==='revisionless')delete copy.revision;
  return respond(copy);
 }
 if(path.startsWith('/api/availability/slot')){
  if(setting().delaySlotProbe){options.signal?.addEventListener('abort',()=>log('probe-aborted',{}));await new Promise(resolve=>{window.releaseSlotProbe=resolve;});log('probe-delivered',{});return respond({maxUnits:1});}
  return respond({maxUnits:8});
 }
 if(path==='/api/products/bookable')return respond({categories:[]});
 if(path==='/api/checkout/quote')return respond({...quote,totalIncludingTax:11995*(body.items[0]?.quantity??1)});
 if(path.endsWith('/forms'))return respond({forms:[]});
 if(path==='/api/checkout/optin-reward-preview')return respond({available:false,amountCents:0});
 if(path==='/api/checkout/payment-intents'){
  if(setting().creationCommitted){window.configure({active:true});return respond({code:'payment_recovery_required',error:'The original payment needs recovery.',attemptId:payment.attemptId,recoveryToken:payment.recoveryToken},500);}
  if(setting().eligibilityReject)return respond({code:setting().eligibilityReject,error:setting().privateError?'INTERNAL customer invoice diagnostics':'This date needs another look before payment.'},400);
  if(setting().reviewReject){window.configure({reviewReject:false});return respond({code:'checkout_review_changed',error:'Your reservation changed. Review it before paying.'},400);}
  if(setting().creationDrop){window.configure({creationDrop:false});throw new TypeError('synthetic lost response');}
  return respond(setting().legacy?{clientSecret:payment.clientSecret,paymentIntentId:payment.paymentIntentId}:payment);
 }
 if(path==='/api/checkout/attempt-active'){
  if(options.body!==undefined||options.headers['Content-Type'])throw new Error('Discovery must have no JSON body/header');
  if(setting().activeNetwork)throw new TypeError('synthetic discovery network failure');
  if(setting().active404)return respond({error:'Unavailable'},404);
  if(!setting().active)return respond({attempt:null});
  return respond({attempt:{...(setting().oldClientIncomplete?incomplete:discovered),status:setting().serverStatus||'prepared',...(setting().activeNoSecret?{clientSecret:undefined,paymentIntentId:undefined,originalOrder:{...discovered.originalOrder,paymentIntentId:''}}:{})}});
 }
 if(path==='/api/checkout/attempt-status'){
  if(setting().status404)return respond({error:'Unavailable'},404);
  return respond({attemptId:payment.attemptId,status:setting().serverStatus||'prepared',...(setting().serverStatus==='confirmed'?{booking}:{})});
 }
 if(path==='/api/checkout/attempt-cancel'){
  if(setting().cancel404)return respond({error:'Unavailable'},404);
  const status=setting().cancelStatus||'cancelled';window.configure({serverStatus:status,...(status==='cancelled'?{active:false}:{})});return respond({attemptId:payment.attemptId,status});
 }
 if(path==='/api/checkout/convert'){
  if(setting().convertFail)return respond({error:'Payment requires review.',code:'payment_recovery_required',refundStatus:setting().refundStatus||'needs_review'},409);
  if(setting().active)window.configure({active:false,serverStatus:'confirmed'});
  return respond(booking);
 }
 throw new Error('Unexpected test API '+path);
};
function Harness(){
 const [restored]=useState(()=>loadCheckoutRecovery(sessionStorage));
 const [state,dispatch]=useReducer(wizardReducer,restored?.draft??{...initialState,step:'payment',date:request.eventDate,product,slot:{time:'12:30',priceCents:11995,available:true},guest:customer,formAnswers:request.formAnswers});
 const [saved,setSaved]=useState(restored);const [q,setQuote]=useState(setting().legacy?{...quote,reviewToken:undefined,contractVersion:undefined,reviewExpiresAt:undefined}:setting().expiredReview?{...quote,reviewExpiresAt:'2000-01-01T00:00:00.000Z'}:quote);
 const [confirmed,setConfirmed]=useState(null);useStepHistory(state,dispatch);window.testState=state;
 const retain=value=>{saveCheckoutRecovery(sessionStorage,value);setSaved(value);};
 return <main className="tprs-shell tprs-wizard"><BookingContext product={product} date={state.date} slot={state.slot} laneQty={state.laneQty} addOnQtys={{}} guestStepper={null} locked={state.checkoutLocked} onEdit={()=>dispatch({type:'GO_STEP',step:'detail'})}/>
 {confirmed?<p role="status">Confirmed {confirmed.invoiceNumber}</p>:state.step!=='payment'?<p>Editing reservation</p>:<PaymentStep
 draft={state} quote={saved?.quote??q} recovery={saved} onRecovery={retain} onLock={locked=>dispatch({type:'SET_CHECKOUT_LOCK',locked})}
 customer={customer} cartHoldItems={[{...items[0],startTime:request.startTime}]} checkoutItems={setting().preheld?heldItems:items} eventDate={request.eventDate} startTime={request.startTime}
 {...(setting().preheld?{preAcquiredSelection:{items:heldItems,coverage:[{cartLineRef:'lane',count:1,poolId:product.id,startTime:request.startTime,endTime:'2098-11-23T20:30:00.000Z'}]},couponsEnabled:false,onSelectionLost:()=>{log('selection-lost',{});dispatch({type:'GO_STEP',step:'detail'});}}:{})}
 salesCutoffMinutesBefore={45} couponResult={null} onCouponCode={()=>{}} onCouponResult={()=>{}} formAnswers={request.formAnswers} termsText="Synthetic booking terms."
 totalCents={saved?.quote.totalIncludingTax??q.totalIncludingTax} onRetryPricing={()=>setQuote({...quote,reviewToken:'review-two',totalIncludingTax:12995})}
 onConverted={setConfirmed} onFindNewTime={()=>dispatch({type:'GO_STEP',step:'detail'})}/>}
 <StickySummary state={state} quote={saved?.quote??q} quoteLoading={false} quoteUnavailable={false} onBack={()=>dispatch({type:'GO_STEP',step:'guest'})} onNext={()=>{}} onLaneQty={qty=>dispatch({type:'SET_LANE_QTY',qty})} onAddOnQty={()=>{}} onRemoveLane={()=>dispatch({type:'REMOVE_LANE'})}/>
 </main>;
}
createRoot(document.getElementById('root')).render(location.search.includes('wizard=1')?<BookingWizard/>:<Harness/>);
`,resolveDir:site,loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.PUBLIC_TPRS_API_BASE':JSON.stringify('/fixture-api'),'import.meta.env.PUBLIC_NYE_REHEARSAL':'false','import.meta.env.DEV':'false'},plugins:[fixturePlugin,{name:'wizard-draft-fixture',setup(b){
 b.onLoad({filter:/[\\/]BookingWizard\.tsx$/},async args=>{const source=await readFile(args.path,'utf8');const original='useReducer(wizardReducer, initialState)';assert.ok(source.includes(original));return {contents:source.replace(original,'useReducer(wizardReducer, window.fixtureWizardDraft ?? initialState)'),loader:'tsx'};});
}},{name:'fake-stripe',setup(b){
 b.onResolve({filter:/^@stripe\/react-stripe-js$/},()=>({path:'react',namespace:'fake-stripe'}));
 b.onResolve({filter:/^\.\.?\/stripe$/},()=>({path:'stripe',namespace:'fake-stripe'}));
 b.onLoad({filter:/.*/,namespace:'fake-stripe'},args=>({loader:'tsx',resolveDir:site,contents:args.path==='stripe'?`export const STRIPE_AVAILABLE=true;export const STRIPE_APPEARANCE={};export function getStripe(){return null;}`:`import React from 'react';export function Elements({children}){return children;}export function PaymentElement(){return <label>Synthetic card<input aria-label="Synthetic card"/></label>;}export function useStripe(){return window.stripeFake;}export function useElements(){return window.elementsFake;}`}));
}}]});
const css = await readFile(new URL('../src/components/tprs/tprs.css',import.meta.url),'utf8');
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--tw-text:#f4efe3;--tw-text-muted:#ddd;--tw-surface:#241b35;--tw-border:#595260;--tw-border-strong:#777;--tw-accent:#4eecc4;--tw-danger:#ffaaaa;--font-body:Arial;--font-ui:Arial}*{box-sizing:border-box}body{margin:0;background:#1a1530}button{font:inherit;color:inherit;cursor:pointer;background:none;border:0}main{max-width:640px;margin:auto;padding:16px}${css}</style><div id="root"></div><script src="/harness.js"></script>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/harness.js'?'text/javascript':'text/html');res.end(req.url==='/harness.js'?harness.outputFiles[0].text:html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
 const external=[];await context.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const url=`http://127.0.0.1:${server.address().port}`;
 async function start(settings={}){if(page.url().startsWith(url))await page.evaluate(()=>sessionStorage.clear());await page.goto(url);await page.evaluate(s=>{sessionStorage.clear();sessionStorage.setItem('test-settings',JSON.stringify(s));},settings);await page.reload();if(settings.preheld&&settings.cartVariant)await page.getByRole('button',{name:'Return to party choices'}).waitFor();else await page.getByRole('checkbox').waitFor();}
 async function pay(){await page.getByRole('checkbox').check();await page.getByRole('button',{name:/^Pay \$/}).click();}
 const count=kind=>page.evaluate(k=>window.calls.filter(c=>c.kind===k).length,kind);
 const saved=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:checkout:active:v1')));

 // Atomic NYE selection already owns its exact lane + add-on cart. Mount and
 // payment must only read it; refreshing/editing never silently extends TTL.
 await start({preheld:true});await page.getByRole('button',{name:'Review party choices'}).waitFor();
 assert.equal(await page.getByText('Have a code?',{exact:true}).count(),0);
 assert.equal(await count('/api/cart'),1);assert.equal(await count('/api/cart/items'),0);assert.equal(await count('/api/cart/items/lane'),0);
 await page.getByRole('button',{name:'Review party choices'}).click();await page.getByText('Editing reservation').waitFor();
 assert.equal(await count('selection-lost'),1);assert.equal(await count('/api/cart'),1);assert.equal(await count('/api/cart/items'),0);

 for(const cartVariant of ['missing-addon','wrong-product','expired','missing-hold','revisionless']){
  await start({preheld:true,cartVariant});assert.equal(await page.getByRole('button',{name:/^Pay /}).count(),0);
  assert.equal(await count('/api/cart/items'),0);assert.equal(await count('/api/cart/items/lane'),0);assert.equal(await count('/api/checkout/payment-intents'),0);
  if(cartVariant==='missing-addon'){
   await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await mkdir(new URL('../.astro/holiday-qa/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../.astro/holiday-qa/nye-held-selection-review-320.png',import.meta.url)),fullPage:true});
  }
 }
 await start({preheld:true});await page.getByRole('button',{name:'Review party choices'}).waitFor();
 await page.evaluate(()=>window.configure({cartVariant:'missing-addon'}));await pay();
 await page.getByRole('button',{name:'Return to party choices'}).waitFor();
 assert.equal(await count('/api/cart'),2);assert.equal(await count('/api/checkout/payment-intents'),0);assert.equal(await saved(),null);

 await start({preheld:true,cartNetwork:true});await page.getByText(/We couldn't check your held lanes/).waitFor();
 assert.equal(await page.getByText(/INTERNAL/).count(),0);assert.equal(await page.getByRole('button',{name:/^Pay /}).isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'preheld network recovery fits at 320px');
 await page.evaluate(()=>window.configure({cartNetwork:false}));await page.getByRole('button',{name:'Check held lanes'}).click();
 await page.getByRole('button',{name:'Check held lanes'}).waitFor({state:'hidden'});await pay();await page.getByText('Confirmed TP-TEST').waitFor();
 assert.equal(await count('/api/cart/items'),0);assert.equal(await count('/api/checkout/payment-intents'),1);

 for(const eligibilityReject of ['capacity_exhausted','cart_revision_conflict','cart_hold_expired']){
  await start({preheld:true,eligibilityReject,privateError:true});await pay();await page.getByRole('button',{name:'Return to party choices'}).waitFor();
  assert.equal(await page.getByText(/INTERNAL/).count(),0);assert.equal(await saved(),null);assert.equal(await count('confirm'),0);
 }

 // Once the accepted attempt owns inventory, an empty/expired soft cart on a
 // later reload must not prompt another hold or block original paid recovery.
 await start({preheld:true,confirmProcessing:true});await pay();await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();
 const beforeRecoveryReads=await count('/api/cart');assert.equal(beforeRecoveryReads,2);
 await page.evaluate(()=>window.configure({cartVariant:'missing-hold',provider:'succeeded'}));await page.reload();
 await page.getByText('Confirmed TP-TEST').waitFor();assert.equal(await count('/api/cart'),beforeRecoveryReads);
 assert.equal(await count('/api/cart/items'),0);assert.equal(await count('/api/checkout/payment-intents'),1);assert.equal(await count('confirm'),1);

 await start({expiredReview:true});await pay();await page.getByRole('button',{name:/Review current total/}).waitFor();
 assert.equal(await count('/api/checkout/payment-intents'),0);assert.equal(await count('confirm'),0);assert.equal(await page.getByRole('checkbox').isChecked(),false);
 await start();await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='tprs:checkout:active:v1')throw new Error('Synthetic unavailable storage');return original.call(this,key,value);};});
 await pay();await page.getByText(/couldn't save your payment details/).waitFor();assert.equal(await count('/api/checkout/payment-intents'),0);assert.equal(await count('confirm'),0);
 for(const eligibilityReject of ['outside_venue_hours','advance_booking_window_exceeded']){
  await start({eligibilityReject});await pay();await page.getByText('This date needs another look before payment.').waitFor();
  assert.equal(await saved(),null);assert.equal(await count('confirm'),0);assert.equal(await page.getByRole('button',{name:'Edit',exact:true}).isDisabled(),false);
 }
 await start({reviewReject:true});await pay();await page.getByRole('button',{name:/Review current total/}).waitFor();
 assert.equal(await count('confirm'),0);assert.equal(await saved(),null);assert.equal(await page.getByRole('checkbox').isChecked(),false);
 await page.getByRole('button',{name:/Review current total/}).click();assert.equal(await count('confirm'),0);await pay();await page.getByText('Confirmed TP-TEST').waitFor();assert.equal(await count('confirm'),1);
 const created=await page.evaluate(()=>window.calls.filter(c=>c.kind==='/api/checkout/payment-intents').map(c=>c.payload));
 assert.equal(created[1].reviewToken,'review-two');assert.equal(created[1].acceptedTerms,true);assert.deepEqual(created[1].formAnswers,[{formFieldId:'00000000-0000-4000-8000-000000000008',value:'Original choice'}]);

 await start({creationDrop:true});await pay();await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();
 const original=await saved();assert.ok(original.request.attemptKey);assert.equal(await count('confirm'),0);
 await page.reload();await page.getByRole('button',{name:/Continue payment/}).waitFor();assert.equal(await count('confirm'),0);
 const retried=await page.evaluate(()=>window.calls.filter(c=>c.kind==='/api/checkout/payment-intents').map(c=>c.payload));assert.deepEqual(retried[0],retried[1]);
 assert.equal(await page.getByRole('button',{name:'Edit',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:/Cancel payment and edit/}).click();await page.getByText('Editing reservation').waitFor();assert.equal(await saved(),null);

 await start({authReload:true});await pay();await page.getByText('Confirmed TP-TEST').waitFor();assert.equal(await count('confirm'),1);assert.equal(await count('/api/checkout/convert'),1);
 const restoredConvert=await page.evaluate(()=>window.calls.find(c=>c.kind==='/api/checkout/convert').payload);assert.equal(restoredConvert.recoveryToken,'synthetic-recovery');assert.equal(restoredConvert.items[0].quantity,1);

 // Realistic Stripe return into the production wizard: successful conversion
 // removes only Stripe's return fields before a refresh starts a clean draft.
 await start({authReload:true,authWizard:true});await page.evaluate(()=>history.replaceState({...history.state,fixtureMarker:'keep'},'',location.pathname+'?ref=fall&tag=a&tag=b#details'));
 await pay();await page.getByRole('heading',{name:"You're booked."}).waitFor();
 const returned=new URL(page.url());assert.deepEqual([...returned.searchParams],[['ref','fall'],['tag','a'],['tag','b'],['wizard','1']]);assert.equal(returned.hash,'#details');
 assert.equal(await saved(),null);assert.equal(await count('confirm'),1);assert.equal(await count('/api/checkout/convert'),1);
 await page.reload();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='/api/products/bookable'));
 assert.equal(await page.getByText(/returning payment without its saved reservation/).count(),0);assert.equal(await count('/api/checkout/payment-intents'),1);

 // A probe started before Pay is deliberately delivered after confirmation,
 // even though the browser aborted it. Neither recovery nor confirmation may
 // accept its lower quantity or start another availability probe.
 await start({wizardDraft:true,delaySlotProbe:true,confirmProcessing:true});await page.goto(url+'?wizard=1');
 await page.waitForFunction(()=>typeof window.releaseSlotProbe==='function');await pay();
 await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();assert.equal(await count('probe-aborted'),1);
 assert.equal((await saved()).request.items[0].quantity,2);
 await page.evaluate(()=>window.configure({provider:'succeeded'}));await page.getByRole('button',{name:'Check payment status',exact:true}).click();
 await page.getByRole('heading',{name:"You're booked."}).waitFor();await page.locator('.tprs-confirm-card').getByText('2 lanes',{exact:true}).waitFor();
 await page.evaluate(()=>window.releaseSlotProbe());await page.waitForFunction(()=>window.calls.some(c=>c.kind==='probe-delivered'));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('.tprs-confirm-card').getByText('2 lanes',{exact:true}).count(),1);
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.kind.startsWith('/api/availability/slot')).length),1);

 await start({confirmProcessing:true,cancelStatus:'processing'});await pay();await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();
 await page.getByRole('button',{name:'Cancel payment and edit'}).click();assert.ok(await saved());assert.equal(await count('/api/checkout/payment-intents'),1);assert.equal(await count('/api/checkout/convert'),0);
 await page.evaluate(()=>window.configure({status404:true,cancel404:true}));await page.getByRole('button',{name:'Check payment status',exact:true}).click();assert.ok(await saved());await page.getByRole('button',{name:'Cancel payment and edit'}).click();assert.ok(await saved());assert.equal(await count('confirm'),1);

 await start({convertFail:true,refundStatus:'requested'});await pay();await page.getByText(/A refund has been requested/).first().waitFor();assert.equal((await saved()).status,'refund_requested');assert.equal(await page.getByText(/refund is confirmed/i).count(),0);
 await page.evaluate(()=>window.configure({serverStatus:'refunded'}));await page.getByRole('button',{name:'Check payment status',exact:true}).click();await page.getByRole('button',{name:'Edit reservation',exact:true}).click();assert.equal(await saved(),null);

 await start({legacy:true,authReload:true});await pay();await page.getByText('Confirmed TP-TEST').waitFor();assert.equal(await count('confirm'),1);
 const legacy=await page.evaluate(()=>window.calls.find(c=>c.kind==='/api/checkout/convert').payload);assert.equal(legacy.legacyClientSecret,'pi_fixture_secret_synthetic');assert.equal(legacy.attemptId,undefined);
 assert.equal(await page.evaluate(()=>window.calls.find(c=>c.kind==='/api/checkout/payment-intents').payload.checkoutContractVersion),undefined);

 await start({confirmProcessing:true});await pay();await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();
 for(const width of [360,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow at ${width}`);}
 await mkdir(new URL('../.astro/holiday-qa/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../.astro/holiday-qa/payment-recovery.png',import.meta.url)),fullPage:true});
 // Exercise the actual production wizard restore, frozen quote and final UI.
 await page.goto(url+'?wizard=1');await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Edit',exact:true}).isDisabled(),true);
 await page.setViewportSize({width:360,height:844});
 await page.screenshot({path:fileURLToPath(new URL('../.astro/holiday-qa/payment-recovery-360.png',import.meta.url)),fullPage:true});
 await page.evaluate(()=>window.configure({provider:'succeeded'}));await page.getByRole('button',{name:'Check payment status',exact:true}).click();
 await page.getByRole('heading',{name:"You're booked."}).waitFor();assert.equal(await count('confirm'),1);assert.equal(await count('/api/checkout/quote'),0);
 assert.equal(await count('/api/checkout/payment-intents'),1);assert.equal(await saved(),null);
 // A corrupt recovery record must not silently become a new payable cart.
 await page.evaluate(()=>sessionStorage.setItem('tprs:checkout:active:v1','broken'));await page.reload();
 await page.getByText(/couldn't read your saved payment/).waitFor();assert.equal(await page.getByRole('button',{name:/^Pay /}).count(),0);
 await page.evaluate(()=>sessionStorage.removeItem('tprs:checkout:active:v1'));await page.goto(url+'?wizard=1&payment_intent_client_secret=synthetic');
 await page.getByText(/returning payment without its saved reservation/).waitFor();assert.equal(await page.getByRole('button',{name:/^Pay /}).count(),0);

 // Losing the browser request still recovers the original cart's immutable
 // order before catalog reads, holds, pricing, replacement PI creation or Pay.
 await start({active:true,provider:'processing',cancelStatus:'processing'});await page.goto(url+'?wizard=1&payment_intent_client_secret=synthetic&ref=cancel#same');
 await page.getByRole('heading',{name:'Your saved reservation'}).waitFor();await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();
 await page.getByText('Original accepted bowling × 2',{exact:true}).waitFor();
 const discovery=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:checkout:discovered:v1')));
 assert.equal((await discovery()).originalRequest.attemptKey,'stable-original-key');assert.equal((await discovery()).financialSnapshot.totalIncludingTax,23990);
 assert.equal(await count('/api/checkout/payment-intents'),0);assert.equal(await count('/api/checkout/quote'),0);assert.equal(await count('/api/products/bookable'),0);assert.equal(await count('confirm'),0);
 for(const width of [360,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`discovery no overflow at ${width}`);}
 await page.setViewportSize({width:360,height:844});await page.screenshot({path:fileURLToPath(new URL('../.astro/holiday-qa/discovered-payment-360.png',import.meta.url)),fullPage:true});
 await page.getByRole('button',{name:'Cancel payment and edit'}).click();assert.ok(await discovery());
 await page.evaluate(()=>window.configure({status404:true,cancel404:true}));await page.reload();await page.getByRole('heading',{name:'Your saved reservation'}).waitFor();
 await page.getByRole('button',{name:'Cancel payment and edit'}).click();assert.ok(await discovery());assert.equal(await page.getByRole('button',{name:/Continue saved payment/}).count(),0);
 await page.evaluate(()=>window.configure({status404:false,cancel404:false,cancelStatus:'cancelled'}));await page.getByRole('button',{name:'Cancel payment and edit'}).click();
 await page.waitForFunction(()=>window.calls.some(c=>c.kind==='/api/products/bookable'));assert.equal(await discovery(),null);assert.equal(await count('/api/checkout/payment-intents'),0);
 assert.equal(new URL(page.url()).searchParams.has('payment_intent_client_secret'),false);assert.equal(new URL(page.url()).searchParams.get('ref'),'cancel');assert.equal(new URL(page.url()).hash,'#same');

 // Prepared discovery persists before explicit Continue, survives a realistic
 // authentication return, and converts only the original two-lane order.
 await start({active:true,authReload:true});await page.goto(url+'?wizard=1&ref=lost-tab#saved');
 await page.getByRole('button',{name:'Continue saved payment $239.90',exact:true}).waitFor();assert.ok(await discovery());assert.equal(await count('confirm'),0);
 await page.reload();await page.getByRole('button',{name:'Continue saved payment $239.90',exact:true}).waitFor();assert.equal(await count('confirm'),0);
 await page.getByRole('button',{name:'Continue saved payment $239.90',exact:true}).click();await page.getByRole('heading',{name:"You're booked."}).waitFor();
 const recoveredOrder=await page.evaluate(()=>window.calls.find(c=>c.kind==='/api/checkout/convert').payload);
 assert.equal(recoveredOrder.items[0].quantity,2);assert.equal(recoveredOrder.recoveryToken,'synthetic-recovery');assert.deepEqual(recoveredOrder.formAnswers,[{formFieldId:'00000000-0000-4000-8000-000000000008',value:'Original choice'}]);
 assert.equal(await count('/api/checkout/payment-intents'),0);assert.equal(await count('confirm'),1);assert.equal(await discovery(),null);
 assert.equal(new URL(page.url()).searchParams.get('ref'),'lost-tab');assert.equal(new URL(page.url()).hash,'#saved');assert.equal(new URL(page.url()).searchParams.has('payment_intent_client_secret'),false);

 // A retained preparation followed by a 500 switches to discovery instead of
 // retrying with a new key or asking the guest to reconstruct the old order.
 await start({wizardDraft:true,creationCommitted:true});await page.goto(url+'?wizard=1');await page.getByRole('checkbox').waitFor();await pay();
 await page.getByRole('button',{name:'Continue saved payment $239.90',exact:true}).waitFor();assert.equal(await count('/api/checkout/payment-intents'),1);assert.equal(await count('confirm'),0);
 assert.ok(await discovery());assert.equal(await count('/api/checkout/attempt-active'),2);
 await page.getByRole('button',{name:'Continue saved payment $239.90',exact:true}).click();await page.getByRole('heading',{name:"You're booked."}).waitFor();assert.equal(await count('/api/checkout/payment-intents'),1);

 // An actual older request omitted terms, answers and reviewed-contract fields.
 // Discovery must never collect/confirm a new charge from that incomplete order.
 await start({active:true,oldClientIncomplete:true});await page.goto(url+'?wizard=1');
 await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();await page.getByText(/saved checkout is missing required booking details/).waitFor();
 assert.equal(await page.getByRole('button',{name:/Continue saved payment/}).count(),0);assert.equal(await page.getByLabel('Synthetic card').isVisible(),false);
 const old=await discovery();for(const key of ['acceptedTerms','formAnswers','checkoutContractVersion','reviewToken'])assert.equal(key in old.originalRequest,false);
 assert.equal(old.originalOrder.acceptedTerms,false);assert.equal(old.paymentReady,false);
 await page.getByRole('button',{name:'Check payment status',exact:true}).click();
 for(const kind of ['submit','confirm','/api/checkout/convert','/api/checkout/payment-intents'])assert.equal(await count(kind),0);
 assert.equal((await discovery()).attemptId,old.attemptId);
 await page.getByRole('button',{name:'Cancel payment and edit'}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='/api/products/bookable'));assert.equal(await discovery(),null);

 for(const provider of ['succeeded','processing']){
  await start({active:true,oldClientIncomplete:true,provider});await page.goto(url+'?wizard=1');
  await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();
  if(provider==='succeeded')await page.getByText(/Your payment was received, but the saved reservation/).waitFor();
  else await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('tprs:checkout:discovered:v1')).status==='processing');
  assert.equal(await page.getByRole('button',{name:/Continue saved payment/}).count(),0);
  for(const kind of ['submit','confirm','/api/checkout/convert','/api/checkout/payment-intents'])assert.equal(await count(kind),0);
  assert.equal((await discovery()).recoveryToken,'synthetic-recovery');
  if(provider==='succeeded'){
   await page.evaluate(()=>window.configure({serverStatus:'confirmed'}));await page.getByRole('button',{name:'Check payment status',exact:true}).click();
   await page.getByRole('heading',{name:"You're booked."}).waitFor();assert.equal(await discovery(),null);assert.equal(await count('/api/checkout/convert'),0);
  }
 }
 // A pre-field session record must fail closed even if its request looks modern.
 await start({active:true});await page.goto(url+'?wizard=1');await page.getByRole('button',{name:'Continue saved payment $239.90',exact:true}).waitFor();
 await page.evaluate(()=>{const value=JSON.parse(sessionStorage.getItem('tprs:checkout:discovered:v1'));delete value.paymentReady;sessionStorage.setItem('tprs:checkout:discovered:v1',JSON.stringify(value));});
 await page.reload();await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/Continue saved payment/}).count(),0);assert.equal((await discovery()).paymentReady,false);assert.equal(await count('confirm'),0);

 await start({active:true,activeNoSecret:true});await page.goto(url+'?wizard=1');await page.getByRole('button',{name:'Check payment status',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Continue saved payment/}).count(),0);assert.equal(await count('/api/checkout/payment-intents'),0);
 await page.evaluate(()=>window.configure({activeNoSecret:false}));await page.getByRole('button',{name:'Check payment status',exact:true}).click();
 await page.getByRole('button',{name:'Continue saved payment $239.90',exact:true}).waitFor();assert.equal(await count('confirm'),0);

 await start({active:true,serverStatus:'needs_review'});await page.evaluate(()=>sessionStorage.setItem('tprs:checkout:active:v1','broken'));await page.goto(url+'?wizard=1');
 await page.getByRole('heading',{name:'Your saved reservation'}).waitFor();await page.getByText(/needs our team's review/).waitFor();
 assert.equal(await page.getByRole('button',{name:/Continue saved payment/}).count(),0);assert.equal(await count('confirm'),0);
 await start({activeNetwork:true});await page.goto(url+'?wizard=1');await page.getByText(/couldn't check for a saved payment/).waitFor();assert.equal(await count('/api/products/bookable'),0);
 await page.evaluate(()=>window.configure({activeNetwork:false}));await page.getByRole('button',{name:'Check saved payment'}).click();await page.waitForFunction(()=>window.calls.some(c=>c.kind==='/api/products/bookable'));
 await start({active404:true});await page.goto(url+'?wizard=1');await page.waitForFunction(()=>window.calls.some(c=>c.kind==='/api/products/bookable'));
 await page.goto(url+'?wizard=1&payment_intent_client_secret=synthetic');await page.getByText(/couldn't check for a saved payment/).waitFor();assert.equal(await page.getByRole('button',{name:/^Pay /}).count(),0);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('Checkout browser checks passed: exact preheld full-cart/no-write checks, pre-pay drift, held recovery, sanitized shortages, review/re-ack, exact nonce retry, immutable server discovery, incomplete old-client unpaid/paid/processing gates, committed booking recovery, missing readiness fail-closed, missing issuance/404 blocks, cancellation proof, authentication return/refresh, delayed availability, refund/legacy recovery, mobile widths. No external requests.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
