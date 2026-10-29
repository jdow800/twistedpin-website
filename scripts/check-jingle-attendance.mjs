/** Real Jingle bootstrap/shared wizard, synthetic browser-only API and Stripe.
 * No backend, credentials, payment provider or outbound requests are used. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';

const site=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(site,'.astro/jingle-attendance');
await mkdir(output,{recursive:true});
const bundle=await build({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import './src/styles/global.css';import './src/components/tprs/tprs.css';
import JinglePublicCheckout from './src/components/tprs/jingle/JinglePublicCheckout';
import NyeBrandWizard from './src/components/tprs/nye/NyeBrandWizard';
import {jingleInitialLaneType} from './src/components/tprs/jingle/publicConfig';
import {installFixture,id,parties,products,arcade} from './scripts/fixtures/nye-brand.mjs';
installFixture();
const settings=window.fixtureState().settings;
if(!settings.nye){
 parties.splice(0,parties.length,...['13:45','14:00','14:30','15:30','15:45'].map(time=>[time,90]));
 Object.assign(arcade,{id:id(122),code:122,name:'Arcade Play Card',shortDescription:'$20 in game play',defaultPriceCents:1500});
 for(const product of products){
  product.name='Jingle Bowl '+(product.code===124?'VIP':'Traditional')+' Lanes';
  product.defaultPriceCents=product.code===124?18995:14995;
  product.durationOverrides=parties.map(([startTime,durationMinutes])=>({date:'2026-12-06',startTime,durationMinutes}));
 }
}
// The existing fixture identities are synthetic: nothing contacts these codes.
const nativeFixtureFetch=window.fetch;
window.fetch=async(url,options)=>{
 const target=new URL(String(url),location.href),settings=window.fixtureState().settings;
 if(target.pathname==='/fixture-api/api/jingle-bowl/config'){
   window.calls.push({path:'/api/jingle-bowl/config',method:'GET'});
   if(settings.configFailure)return new Response('{}',{status:503});
   return new Response(JSON.stringify({eventDate:'2026-12-06',bookingReady:settings.bookingReady!==false,
     products:{traditional:{id:settings.wrongProductId?id(999):id(126),code:settings.syntheticIdentity?9106:126},vip:{id:id(124),code:124}},
     arcade:{id:id(122),code:122},guests:{traditional:5,vip:6},maxLanes:6}),{status:200});
 }
 if(target.pathname==='/fixture-api/api/checkout/attempt-active'&&settings.discoveryFailure)return new Response('{}',{status:503});
 if(['/fixture-api/api/products','/fixture-api/api/cart/session'].includes(target.pathname)
   &&settings.restoreFailure===target.pathname){
   // Keep the read in the existing fixture's request log, but simulate the
   // transient transport failure that interrupted a returning guest.
   await nativeFixtureFetch(url,options);
   return new Response('{}',{status:503});
 }
 return nativeFixtureFetch(url,options);
};
createRoot(document.getElementById('root')).render(settings.nye
 ?<NyeBrandWizard initialLaneType={jingleInitialLaneType(location.search)}/>
 :<JinglePublicCheckout enabled={settings.enabled!==false}/>);
`,loader:'tsx',resolveDir:site},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',outdir:output,
external:['/snap/*','/pattern/*'],loader:{'.woff2':'dataurl','.woff':'dataurl'},
define:{'import.meta.env.PUBLIC_TPRS_API_BASE':JSON.stringify('/fixture-api'),'import.meta.env.DEV':'false'},
plugins:[{name:'synthetic-stripe',setup(b){
 b.onResolve({filter:/^@stripe\/react-stripe-js$/},()=>({path:'react',namespace:'synthetic-stripe'}));
 b.onResolve({filter:/^\.\.?\/stripe$/},()=>({path:'stripe',namespace:'synthetic-stripe'}));
 b.onLoad({filter:/.*/,namespace:'synthetic-stripe'},args=>({loader:'tsx',resolveDir:site,contents:args.path==='stripe'
  ?'export const STRIPE_AVAILABLE=true;export const STRIPE_APPEARANCE={};export function getStripe(){return null;}'
  :`import React from 'react';export function Elements({children}){return children;}export function PaymentElement(){return <label>Synthetic payment<input aria-label="Synthetic card"/></label>;}export function useStripe(){return window.stripeFake;}export function useElements(){return window.elementsFake;}`}));
}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'none'");
 if(path==='/harness.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
 if(path==='/harness.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/harness.css"><title>Synthetic Jingle entry</title></head><body><main id="root"></main><script src="/harness.js"></script></body></html>');return;}
 if(['/snap/','/logo/','/pattern/'].some(prefix=>path.startsWith(prefix))){
  const file=resolve(site,'public',`.${path}`);
  if(file.startsWith(resolve(site,'public')+sep))try{res.setHeader('Content-Type',extname(file)==='.webp'?'image/webp':'image/png');res.end(await readFile(file));return;}catch{}
 }
 res.statusCode=404;res.end('Synthetic fixture resource unavailable');
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const origin=`http://127.0.0.1:${server.address().port}`;
const results=[],external=[],errors=[];
let browser;
const draftKey='tprs:jingle:booking-draft:v1';
const state=page=>page.evaluate(()=>window.fixtureState());
const calls=async(page,path)=>(await state(page)).calls.filter(c=>c.path===path);
const heading=(page,name)=>page.getByRole('heading',{name,exact:true}).waitFor();
async function scenario(name,run){await run();results.push(name);console.log(`PASS ${name}`);}
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
 async function fresh(search='',settings={}){
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Chicago'});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
  await context.addInitScript(settings=>{if(!sessionStorage.getItem('fixture-settings'))sessionStorage.setItem('fixture-settings',JSON.stringify(settings));},settings);
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/${search}`);return page;
 }
 async function timeAndHold(page){
  await page.locator('.time-choice').nth(1).click();await page.locator('.brand-continue:enabled').waitFor();
  await page.locator('.brand-continue').click();
 }

 const attendees=page=>page.getByLabel('How many people are coming, including non-bowlers?',{exact:true});
 const next=page=>page.locator('.brand-continue');
 const quantity=page=>page.getByLabel('Quantity',{exact:true});
 const room=(page,lane)=>page.locator('.room-choice').filter({hasText:lane==='vip'?'VIP suite':'Traditional'});
 async function enter(page,total){await heading(page,'Choose your lanes.');await attendees(page).fill(String(total));}
 async function toTime(page){await next(page).click();await heading(page,'Choose your time.');}
 async function foodAndContact(page,count){
  await page.getByRole('button',{name:'Continue without arcade',exact:true}).click();await heading(page,'Choose your pizza & soda.');
  for(let index=0;index<count;index++){
   await page.locator('.tprs-nye-pair').nth(index).getByRole('radio',{name:'Cheese only',exact:true}).check();
   await page.locator('.tprs-nye-pair').nth(index).getByRole('combobox').selectOption('Pepsi');
  }
  for(const checkbox of await page.locator('input[type="checkbox"]').all())if(!await checkbox.evaluate(el=>Boolean(el.closest('.tprs-consent'))))await checkbox.check();
  for(const [selector,value] of [['#g-first','Synthetic'],['#g-last','Guest'],['#g-email','attendance@example.invalid'],['#g-phone','8155550100'],['#g-zip','60544']])await page.locator(selector).fill(value);
 }
 await scenario('Both landing links require a total before times; 5 Traditional and 6 VIP fit one lane',async()=>{
  for(const [lane,limit] of [['traditional',5],['vip',6]]){
   const page=await fresh(`?lane=${lane}`);await heading(page,'Choose your lanes.');
   assert.equal(await attendees(page).inputValue(),'');assert.equal(await next(page).isDisabled(),true);
   assert.match(await room(page,lane).innerText(),new RegExp(`${limit} people total`));
   await enter(page,limit);assert.equal(await quantity(page).innerText(),'1');assert.equal(await next(page).isEnabled(),true);
   await enter(page,limit+1);assert.equal(await quantity(page).innerText(),'2');assert.equal(await page.getByRole('button',{name:'Fewer',exact:true}).isDisabled(),true);
   await toTime(page);assert.match(await page.locator('.time-request').innerText(),new RegExp(`${limit+1} people attending`));
   assert.equal((await calls(page,'/api/cart/replace')).length,0);assert.equal((await calls(page,'/api/checkout/payment-intents')).length,0);
   await page.context().close();
  }
 });
 await scenario('Blank, zero, negative, fractional, exponent and unsafe totals cannot continue',async()=>{
  const page=await fresh('?lane=traditional');await heading(page,'Choose your lanes.');
  for(const value of ['', '0','-1','1.5','1e1','abc','9007199254740992']){
   await attendees(page).fill(value);assert.equal(await next(page).isDisabled(),true,`Reject ${value}`);
  }
  assert.equal((await calls(page,'/api/cart/replace')).length,0);await page.context().close();
 });
 await scenario('Nine people total requires two lanes even when only five plan to bowl; count survives reload and browser Back',async()=>{
  const page=await fresh('?lane=traditional');await enter(page,9);
  assert.match(await page.locator('#jingle-attendees-help').innerText(),/every adult and child.*only watching/);
  assert.equal(await quantity(page).innerText(),'2');await toTime(page);await page.reload();await heading(page,'Choose your time.');
  assert.match(await page.locator('.time-request').innerText(),/9 people attending.*2 lanes minimum/);
  assert.equal(await page.getByRole('button',{name:'Fewer',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Edit total people attending',exact:true}).click();assert.equal(await attendees(page).inputValue(),'9');
  await toTime(page);await page.goBack();await heading(page,'Choose your lanes.');assert.equal(await attendees(page).inputValue(),'9');
  await toTime(page);await timeAndHold(page);await heading(page,'Add arcade play.');assert.equal((await state(page)).cart.holds[0].count,2);
  await page.context().close();
 });
 await scenario('Lane-type changes enforce the recorded total and preserve optional extra lanes',async()=>{
  const page=await fresh('?lane=vip');await enter(page,6);assert.equal(await quantity(page).innerText(),'1');
  await room(page,'traditional').click();assert.equal(await quantity(page).innerText(),'2');assert.equal(await page.getByRole('button',{name:'Fewer',exact:true}).isDisabled(),true);
  await room(page,'vip').click();assert.equal(await quantity(page).innerText(),'2');await page.getByRole('button',{name:'Fewer',exact:true}).click();assert.equal(await quantity(page).innerText(),'1');
  await enter(page,11);assert.equal(await quantity(page).innerText(),'2');await room(page,'traditional').click();assert.equal(await quantity(page).innerText(),'3');
  await enter(page,31);assert.equal(await quantity(page).innerText(),'6');assert.equal(await next(page).isDisabled(),true);
  await room(page,'vip').click();assert.equal(await next(page).isEnabled(),true);await enter(page,37);assert.equal(await next(page).isDisabled(),true);
  await page.context().close();
 });
 await scenario('Time alternatives fit the total; a smaller room cannot replace it with one undersized lane',async()=>{
  const page=await fresh('?lane=vip',{capacity:{'124/14:00':0}});await enter(page,11);await toTime(page);await timeAndHold(page);
  await page.getByRole('button',{name:'Review this option →'}).first().waitFor();
  const alternate=page.locator('.alternative').filter({hasText:'Traditional'});assert.match(await alternate.innerText(),/3 Traditional lanes/);
  await alternate.click();await heading(page,'Review your change.');assert.equal(await page.getByLabel('How many guests are coming, including spectators?',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Use this party',exact:true}).and(page.locator(':enabled')).click();await heading(page,'Add arcade play.');
  assert.equal((await state(page)).cart.holds[0].count,3);assert.equal((await state(page)).cart.items[0].productId.endsWith('000000000126'),true);await page.context().close();
 });
 await scenario('Older drafts without a total retain food/contact/hold but must answer before new checkout',async()=>{
  const page=await fresh('?lane=traditional');await enter(page,5);await toTime(page);await timeAndHold(page);await heading(page,'Add arcade play.');await foodAndContact(page,1);
  await page.waitForFunction(key=>JSON.parse(sessionStorage.getItem(key)).guest.email==='attendance@example.invalid',draftKey);
  const saved=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),draftKey),held=(await state(page)).cart;
  await page.evaluate(key=>{const value=JSON.parse(sessionStorage.getItem(key));delete value.attendeeInput;value.step='pay';sessionStorage.setItem(key,JSON.stringify(value));},draftKey);
  await page.reload();await heading(page,'Choose your lanes.');assert.equal(await attendees(page).inputValue(),'');assert.equal(await next(page).isDisabled(),true);
  assert.equal((await calls(page,'/api/checkout/payment-intents')).length,0);assert.deepEqual((await state(page)).cart,held);
  const restored=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),draftKey);assert.deepEqual(restored.answers,saved.answers);assert.deepEqual(restored.guest,saved.guest);
  await enter(page,9);assert.equal(await quantity(page).innerText(),'2');await toTime(page);
  assert.equal(await page.getByRole('button',{name:'Keep my held lanes',exact:true}).count(),0);assert.deepEqual((await state(page)).cart,held);
  await next(page).and(page.locator(':enabled')).click();await heading(page,'Review your change.');assert.deepEqual((await state(page)).cart,held);await page.context().close();
 });
 await scenario('Uncertain lane mutation retains the total and repeats only the same mutation on explicit retry',async()=>{
  const page=await fresh('?lane=traditional',{dropNextReplaceResponse:true});await enter(page,9);await toTime(page);await timeAndHold(page);
  await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();
  const original=(await calls(page,'/api/cart/replace'))[0].body;await page.reload();
  await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();assert.equal((await calls(page,'/api/cart/replace')).length,1);
  await page.getByRole('button',{name:'Check this selection',exact:true}).click();await heading(page,'Add arcade play.');
  assert.deepEqual((await calls(page,'/api/cart/replace'))[1].body,original);assert.equal(original.items[0].quantity,2);
  assert.equal(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).attendeeInput,draftKey),'9');await page.context().close();
 });
 await scenario('New payment freezes all nine attendees; accepted recovery ignores contrary lane hints and closed sales',async()=>{
  const page=await fresh('?lane=traditional',{confirmDecline:true});await enter(page,9);await toTime(page);await timeAndHold(page);await heading(page,'Add arcade play.');await foodAndContact(page,2);
  await next(page).click();await heading(page,'Review & pay.');await page.getByLabel('Synthetic card',{exact:true}).waitFor();
  assert.match(await page.locator('.reservation-ticket').innerText(),/9 people attending, including non-bowlers/);
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:/^Pay \$/}).click();await page.getByText(/^Synthetic declined card\./).waitFor();
  const accepted=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:checkout:active:v1')));assert.equal(accepted.request.attendeeCount,9);assert.equal(accepted.draft.partySize,9);
  await page.evaluate(()=>window.configure({bookingReady:false}));await page.goto(`${origin}/?lane=vip`);await page.getByRole('button',{name:'Cancel payment and edit',exact:true}).waitFor();
  assert.equal((await calls(page,'/api/checkout/payment-intents')).length,1);assert.equal(await attendees(page).count(),0);
  const restored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:checkout:active:v1')));assert.deepEqual(restored.request,accepted.request);await page.context().close();
 });
 await scenario('New attendance requirement does not block a legacy accepted Jingle payment without a count',async()=>{
  const page=await fresh('?lane=traditional',{confirmDecline:true});await enter(page,5);await toTime(page);await timeAndHold(page);await heading(page,'Add arcade play.');await foodAndContact(page,1);
  await next(page).click();await heading(page,'Review & pay.');await page.getByLabel('Synthetic card',{exact:true}).waitFor();await page.getByRole('checkbox').check();await page.getByRole('button',{name:/^Pay \$/}).click();await page.getByText(/^Synthetic declined card\./).waitFor();
  await page.evaluate(()=>{const key='tprs:checkout:active:v1',saved=JSON.parse(sessionStorage.getItem(key));delete saved.request.attendeeCount;saved.draft.partySize=null;sessionStorage.setItem(key,JSON.stringify(saved));});
  await page.reload();await page.getByRole('button',{name:'Cancel payment and edit',exact:true}).waitFor();
  assert.equal((await calls(page,'/api/checkout/payment-intents')).length,1);assert.equal(await attendees(page).count(),0);assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:checkout:active:v1')).request.attendeeCount),undefined);await page.context().close();
 });
 await scenario('NYE remains count-optional; Jingle form fits 320, 390 and desktop widths',async()=>{
  const nye=await fresh('?lane=vip',{nye:true});await heading(nye,'Choose your lanes.');assert.equal(await attendees(nye).count(),0);await room(nye,'traditional').click();assert.equal(await next(nye).isEnabled(),true);await toTime(nye);await nye.context().close();
  const page=await fresh('?lane=traditional');await enter(page,9);
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(output,`attendance-${width}.png`),fullPage:true});}
  await page.context().close();
 });
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'results.json'),JSON.stringify({results,externalRequests:external.length,browserErrors:errors.length},null,2));
 console.log(`${results.length} Jingle attendance scenario groups passed.`);
}catch(error){
 if(browser)for(const context of browser.contexts())for(const page of context.pages())try{await page.screenshot({path:resolve(output,'failure.png'),fullPage:true});await writeFile(resolve(output,'failure.txt'),`${error.stack}\n${await page.locator('body').innerText()}\n${JSON.stringify(await state(page),null,2)}`);}catch{}
 throw error;
}finally{await browser?.close();await new Promise(done=>server.close(done));}
