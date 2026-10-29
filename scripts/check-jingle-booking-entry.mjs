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
const output=resolve(site,'.astro/jingle-booking-entry');
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
async function heading(page,name){
 // Fresh Jingle links now preselect the lane type but require total attendance
 // before time browsing. These entry/recovery scenarios use one person unless
 // their persisted draft already answered it; attendance edge cases have their
 // own check-jingle-attendance.mjs harness.
 if(name==='Choose your time.'){
  await page.getByRole('heading',{name:/^Choose your (lanes|time)\.$/}).waitFor();
  const count=page.getByLabel('How many people are coming, including non-bowlers?',{exact:true});
  if(await count.isVisible()){
   if(await count.inputValue()==='')await count.fill('1');
   await page.locator('.brand-continue:enabled').click();
  }
 }
 await page.getByRole('heading',{name,exact:true}).waitFor();
}
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
 await scenario('Each fresh lane link reaches times after total attendance, with quantity one and no hold or payment',async()=>{
  for(const lane of ['traditional','vip']){
   const page=await fresh(`?lane=${lane}`);await heading(page,'Choose your time.');
   assert.match(await page.locator('.time-request').innerText(),lane==='vip'?/VIP lanes/:/Traditional lanes/);
   assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'1');
   assert.equal(await page.locator('.time-choice[aria-pressed="true"]').count(),0);
   assert.equal(await page.locator('.brand-continue').isDisabled(),true);
   assert.equal((await calls(page,'/api/cart/replace')).length,0);assert.equal((await calls(page,'/api/checkout/payment-intents')).length,0);
   await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:resolve(output,`${lane}-time-390.png`),fullPage:true});await page.context().close();
  }
 });
 await scenario('Missing, invalid and duplicate lane hints retain explicit lane selection; NYE ignores a valid hint',async()=>{
  for(const search of ['', '?lane=other','?lane=vip&lane=traditional','?lane=vip&lane=vip']){
   const page=await fresh(search);await heading(page,'Choose your lanes.');assert.equal(await page.locator('.room-choice[aria-pressed="true"]').count(),0);await page.context().close();
  }
  const page=await fresh('?lane=vip',{nye:true});await heading(page,'Choose your lanes.');assert.equal(await page.locator('.room-choice[aria-pressed="true"]').count(),0);await page.context().close();
 });
 await scenario('Explicit lane links replace browsing choices in both directions, including an empty draft',async()=>{
  for(const [original,next] of [['','vip'],['?lane=traditional','vip'],['?lane=vip','traditional']]){
   const page=await fresh(original);await heading(page,original?'Choose your time.':'Choose your lanes.');
   if(original){await page.getByRole('button',{name:'More',exact:true}).click();await page.locator('.time-choice').nth(1).click();}
   await page.waitForFunction(key=>sessionStorage.getItem(key)!==null,draftKey);
   await page.goto(`${origin}/?lane=${next}`);await heading(page,'Choose your time.');
   assert.match(await page.locator('.time-request').innerText(),next==='vip'?/VIP lanes/:/Traditional lanes/);
   assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),original?'2':'1');
   assert.equal(await page.locator('.time-choice[aria-pressed="true"]').count(),0);
   assert.equal(await page.locator('.brand-continue').isDisabled(),true);
   assert.equal((await calls(page,'/api/cart/replace')).length,0);
   await page.locator('.time-choice').nth(2).click();
   await page.waitForFunction(key=>JSON.parse(sessionStorage.getItem(key)).time==='14:30',draftKey);
   await page.reload();await heading(page,'Choose your time.');
   assert.equal(await page.locator('.time-choice').nth(2).getAttribute('aria-pressed'),'true');
   assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),original?'2':'1');
   assert.equal((await calls(page,'/api/cart/replace')).length,0);await page.context().close();
  }
 });
 await scenario('A consumed landing choice cannot override a later in-checkout room change on reload',async()=>{
  const page=await fresh('?lane=vip&source=lane-card#booking');await heading(page,'Choose your time.');
  await page.locator('.mobile-back').click();await heading(page,'Choose your lanes.');
  await page.locator('.room-choice').filter({hasText:'Traditional'}).click();
  await page.locator('.brand-continue').click();await heading(page,'Choose your time.');
  await page.waitForFunction(key=>JSON.parse(sessionStorage.getItem(key)).roomCode===126,draftKey);
  await page.reload();await heading(page,'Choose your time.');
  assert.match(await page.locator('.time-request').innerText(),/Traditional lanes/);
  assert.equal(new URL(page.url()).searchParams.get('lane'),null);
  assert.equal(new URL(page.url()).searchParams.get('source'),'lane-card');
  assert.equal(new URL(page.url()).hash,'#booking');
  assert.equal((await calls(page,'/api/cart/replace')).length,0);await page.context().close();
 });
 await scenario('A contrary link opens the requested room while existing lanes stay held until explicit change review',async()=>{
  const page=await fresh('?lane=traditional');await heading(page,'Choose your time.');
  await timeAndHold(page);await heading(page,'Add arcade play.');
  const held=(await state(page)).cart;
  await page.goto(`${origin}/?lane=vip`);await heading(page,'Choose your time.');
  assert.match(await page.locator('.time-request').innerText(),/VIP lanes/);
  assert.equal(await page.locator('.time-choice[aria-pressed="true"]').count(),0);
  assert.deepEqual((await state(page)).cart,held);
  assert.equal((await calls(page,'/api/cart/replace')).length,1);
  await page.getByRole('button',{name:'Keep my held lanes',exact:true}).click();await heading(page,'Choose your pizza & soda.');
  assert.deepEqual((await state(page)).cart,held);
  await page.goto(`${origin}/?lane=vip`);await heading(page,'Choose your time.');
  await page.locator('.time-choice').nth(1).click();await page.locator('.brand-continue:enabled').waitFor();await page.locator('.brand-continue').click();
  await heading(page,'Review your change.');
  assert.deepEqual((await state(page)).cart,held);
  assert.equal((await calls(page,'/api/cart/replace')).length,1);
  await page.getByRole('button',{name:'Use this party',exact:true}).and(page.locator(':enabled')).click();await heading(page,'Add arcade play.');
  const replacement=(await calls(page,'/api/cart/replace'))[1].body;
  assert(replacement.items.some(item=>item.productId.endsWith('000000000124')));
  assert.equal((await calls(page,'/api/checkout/payment-intents')).length,0);
  await page.context().close();
 });
 await scenario('Accepted cart with lost response retains exact pending proposal and retries only on request',async()=>{
  const page=await fresh('?lane=traditional',{dropNextReplaceResponse:true});await heading(page,'Choose your time.');
  await page.getByRole('button',{name:'More',exact:true}).click();await timeAndHold(page);
  await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();
  const saved=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),draftKey);
  const original=(await calls(page,'/api/cart/replace'))[0].body;
  await page.goto(`${origin}/?lane=vip`);await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();
  assert.equal((await calls(page,'/api/cart/replace')).length,1);assert.deepEqual(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).pending,draftKey),saved.pending);
  assert.match(await page.locator('.time-request').innerText(),/Traditional lanes/);assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'2');
  await page.getByRole('button',{name:'Check this selection',exact:true}).click();await heading(page,'Add arcade play.');
  assert.deepEqual((await calls(page,'/api/cart/replace'))[1].body,original);await page.context().close();
 });
 for(const path of ['/api/products','/api/cart/session'])await scenario(`Returning from arcade after transient ${path} failure retries without changing the saved selection or starting payment`,async()=>{
  const page=await fresh('?lane=traditional');await heading(page,'Choose your time.');
  await page.getByRole('button',{name:'More',exact:true}).click();
  await timeAndHold(page);await heading(page,'Add arcade play.');
  await page.waitForFunction(key=>JSON.parse(sessionStorage.getItem(key)).step==='arcade',draftKey);
  const saved=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),draftKey);
  const held=(await state(page)).cart;
  const writes=(await calls(page,'/api/cart/replace')).length;
  await page.evaluate(path=>window.configure({restoreFailure:`/fixture-api${path}`}),path);
  await page.reload();await heading(page,'Let’s try that again.');
  await page.getByText('We could not load your reservation. Please try again.',{exact:true}).waitFor();
  const retry=page.getByRole('button',{name:'Try again',exact:true});
  assert.match(await retry.getAttribute('class'),/\bprimary\b/);
  assert.equal(await page.getByRole('link',{name:'contactus@twistedpin.com',exact:true}).getAttribute('href'),'mailto:contactus@twistedpin.com');
  assert.equal(await page.locator('a[href^="tel:"]').count(),0);
  assert.doesNotMatch(await page.locator('body').innerText(),/avoid starting another payment|could not safely restore/i);
  assert.deepEqual(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),draftKey),saved,'A failed restore must retain the complete prepayment draft');
  assert.deepEqual((await state(page)).cart,held);
  const failureReads=(await calls(page,path)).length;
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Retry state fits ${width}px`);
   await page.screenshot({path:resolve(output,`restore-${path.endsWith('products')?'catalog':'session'}-${width}.png`),fullPage:true});
  }
  await page.evaluate(()=>window.configure({restoreFailure:null}));await retry.click();
  await heading(page,'Add arcade play.');
  assert.ok((await calls(page,path)).length>failureReads,'Try again reissues the failed read');
  assert.deepEqual(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),draftKey),saved,'Successful retry restores the same room, count, time and step');
  assert.deepEqual((await state(page)).cart,held,'Retry does not replace the cart or extend its hold');
  assert.equal((await calls(page,'/api/cart/replace')).length,writes);
  for(const forbidden of ['/api/checkout/payment-intents','/api/checkout/convert','stripe:submit','stripe:confirm'])assert.equal((await calls(page,forbidden)).length,0);
  assert.equal(await page.getByLabel('Synthetic card',{exact:true}).count(),0);
  await page.context().close();
 });
 await scenario('Readiness and release switch stop new sales while ordinary accepted discovery still wins',async()=>{
  for(const settings of [{bookingReady:false},{enabled:false}]){
   const page=await fresh('?lane=vip',settings);await page.getByText('Reservations are not available right now.',{exact:true}).waitFor();
   await page.waitForFunction(()=>window.fixtureState().calls.some(c=>c.path==='/api/checkout/attempt-active'));
   assert.equal((await calls(page,'/api/products')).length,0);assert.equal((await calls(page,'/api/cart/session')).length,0);await page.context().close();
   const recovery=await fresh('?lane=vip',{...settings,ordinaryActive:true});await heading(recovery,'Your saved reservation.');
   await recovery.getByText('Original two-hour bowling × 2',{exact:true}).waitFor();
   assert.equal((await calls(recovery,'/api/products')).length,0);assert.equal((await calls(recovery,'/api/cart/session')).length,0);assert.equal((await calls(recovery,'/api/checkout/payment-intents')).length,0);await recovery.context().close();
  }
 });
 await scenario('Broken discovery, returning payment and wrong catalog UUID block fresh hinted selection',async()=>{
  for(const [query,settings] of [['?lane=vip',{discoveryFailure:true}],['?lane=vip&payment_intent_client_secret=synthetic-return',{}],['?lane=vip',{wrongProductId:true}]]){
   const page=await fresh(query,settings);await heading(page,'Let’s try that again.');assert.equal(await page.locator('.time-choice').count(),0);assert.equal((await calls(page,'/api/cart/replace')).length,0);assert.equal((await calls(page,'/api/checkout/payment-intents')).length,0);await page.context().close();
  }
 });
 await scenario('Invalid bootstrap has no synthetic fallback and an explicit retry can recover',async()=>{
  for(const settings of [{syntheticIdentity:true},{configFailure:true}]){
   const page=await fresh('?lane=traditional',settings);await page.getByRole('alert').waitFor();assert.equal((await calls(page,'/api/products')).length,0);assert.equal((await calls(page,'/api/cart/session')).length,0);
   await page.evaluate(()=>window.configure({syntheticIdentity:false,configFailure:false}));await page.getByRole('button',{name:'Try again',exact:true}).click();await heading(page,'Choose your time.');await page.context().close();
  }
 });
 await scenario('Shared accepted Jingle payment survives a contrary link and closed sales without repricing',async()=>{
  const page=await fresh('?lane=traditional',{confirmDecline:true});await heading(page,'Choose your time.');await timeAndHold(page);await heading(page,'Add arcade play.');
  await page.getByRole('button',{name:'Continue without arcade',exact:true}).click();await heading(page,'Choose your pizza & soda.');
  await page.locator('.tprs-nye-pair').getByRole('radio',{name:'Cheese only',exact:true}).check();await page.locator('.tprs-nye-pair').getByRole('combobox').selectOption('Pepsi');
  for(const checkbox of await page.locator('input[type="checkbox"]').all())if(!await checkbox.evaluate(el=>Boolean(el.closest('.tprs-consent'))))await checkbox.check();
  for(const [selector,value] of [['#g-first','Synthetic'],['#g-last','Guest'],['#g-email','entry@example.invalid'],['#g-phone','8155550100'],['#g-zip','60544']])await page.locator(selector).fill(value);
  await page.locator('.brand-continue').click();await heading(page,'Review & pay.');await page.getByLabel('Synthetic card',{exact:true}).waitFor();
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:/^Pay \$/}).click();await page.getByText(/^Synthetic declined card\./).waitFor();
  const accepted=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:checkout:active:v1')));
  const quoteCalls=(await calls(page,'/api/checkout/quote')).length;
  await page.evaluate(()=>window.configure({bookingReady:false}));await page.goto(`${origin}/?lane=vip`);
  await page.getByRole('button',{name:'Cancel payment and edit',exact:true}).waitFor();
  assert.equal((await calls(page,'/api/checkout/payment-intents')).length,1);assert.equal((await calls(page,'/api/checkout/quote')).length,quoteCalls);
  const restored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:checkout:active:v1')));
  assert.deepEqual(restored.request,accepted.request);assert.deepEqual(restored.quote,accepted.quote);assert.deepEqual(restored.payment,accepted.payment);await page.context().close();
 });
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await writeFile(resolve(output,'results.json'),JSON.stringify({results,externalRequests:external.length,browserErrors:errors.length},null,2));
 console.log(`${results.length} Jingle booking-entry scenario groups passed.`);
}catch(error){
 if(browser)for(const context of browser.contexts())for(const page of context.pages())try{await page.screenshot({path:resolve(output,'failure.png'),fullPage:true});await writeFile(resolve(output,'failure.txt'),`${error.stack}\n${await page.locator('body').innerText()}\n${JSON.stringify(await state(page),null,2)}`);}catch{}
 throw error;
}finally{await browser?.close();await new Promise(done=>server.close(done));}
