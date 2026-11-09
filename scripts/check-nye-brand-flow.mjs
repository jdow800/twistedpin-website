/** Offline full Brand NYE flow. Real React/client/Zod; synthetic HTTP and Stripe.
 * Run: node scripts/check-nye-brand-flow.mjs
 * View the same fixture: node scripts/check-nye-brand-flow.mjs --serve
 * No backend, Stripe SDK, email, credentials or production connections are used.
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { id, parties } from './fixtures/nye-brand.mjs';

const site=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(site,'.astro/nye-brand-flow');
await mkdir(output,{recursive:true});
const bundle=await build({stdin:{contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import './src/styles/global.css';
import './src/components/tprs/tprs.css';
import NyeBrandWizard from './src/components/tprs/nye/NyeBrandWizard.tsx';
import NyePublicCheckout from './src/components/tprs/nye/NyePublicCheckout.tsx';
import {installFixture} from './scripts/fixtures/nye-brand.mjs';
installFixture();
function Fixture(){const[open,setOpen]=useState(window.fixtureState().settings.salesOpen!==false);window.setFixtureSalesOpen=setOpen;return <NyeBrandWizard salesOpen={open}/>;}
createRoot(document.getElementById('root')).render(window.fixtureState().settings.publicPage?<NyePublicCheckout/>:<Fixture/>);
`,loader:'tsx',resolveDir:site},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',outdir:output,external:['/snap/*','/pattern/*'],
  loader:{'.woff2':'dataurl','.woff':'dataurl'},define:{'import.meta.env.PUBLIC_TPRS_API_BASE':JSON.stringify('/fixture-api'),'import.meta.env.PUBLIC_NYE_REHEARSAL':'false','import.meta.env.DEV':'false'},plugins:[{name:'synthetic-stripe',setup(b){
    b.onResolve({filter:/^@stripe\/react-stripe-js$/},()=>({path:'react',namespace:'synthetic-stripe'}));
    b.onResolve({filter:/^\.\.?\/stripe$/},()=>({path:'stripe',namespace:'synthetic-stripe'}));
    b.onLoad({filter:/.*/,namespace:'synthetic-stripe'},args=>({loader:'tsx',resolveDir:site,contents:args.path==='stripe'
      ?'export const STRIPE_AVAILABLE=true;export const STRIPE_APPEARANCE={};export function getStripe(){return null;}'
      :`import React from 'react';export function Elements({children}){return children;}export function PaymentElement(){return <div style={{border:'1px solid #716989',padding:16,borderRadius:8}}><strong>Simulated payment only</strong><p>The Pay button completes a synthetic test. No payment or email is sent.</p><label>Synthetic test card<input aria-label="Synthetic card" placeholder="Do not enter real card details"/></label></div>;}export function useStripe(){return window.stripeFake;}export function useElements(){return window.elementsFake;}`}));
  }}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
const html='<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC — NYE Brand flow</title><link rel="stylesheet" href="/harness.css"></head><body><aside style="position:relative;z-index:20;padding:8px 16px;background:#4eecc4;color:#0e0a1f;font:600 13px Montserrat,sans-serif;text-align:center">Interactive test · synthetic inventory · no payment or email</aside><main id="main"><div id="root"></div></main><script src="/harness.js"></script></body></html>';
const server=createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'none'");
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/harness.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
  if(path==='/harness.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
  if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(path.startsWith('/snap/')||path.startsWith('/logo/')||path.startsWith('/pattern/')){
    const file=resolve(site,'public',`.${path}`),root=resolve(site,'public')+sep;
    if(file.startsWith(root))try{const content=await readFile(file);res.setHeader('Content-Type',extname(file)==='.webp'?'image/webp':'image/png');res.end(content);return;}catch{}
  }
  res.statusCode=404;res.end('Synthetic fixture: resource unavailable.');
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(process.argv.includes('--serve')?55614:0,'127.0.0.1',resolve);});
const url=`http://127.0.0.1:${server.address().port}/`;
if(process.argv.includes('--serve')){console.log(`SYNTHETIC ONLY (no backend, provider or email): ${url}`);await new Promise(()=>{});}
let browser;
const results=[],external=[],errors=[];
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).toLowerCase();
async function scenario(name,run){if(only&&!name.toLowerCase().includes(only))return;await run();results.push(name);console.log(`PASS ${name}`);}
try{
  browser=await chromium.launch({headless:true});
  async function fresh(settings={},timezoneId='America/Chicago',width=390){
    const context=await browser.newContext({viewport:{width,height:844},timezoneId});
    await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==new URL(url).origin){external.push(route.request().url());return route.abort();}return route.continue();});
    await context.addInitScript(settings=>{if(!sessionStorage.getItem('fixture-settings'))sessionStorage.setItem('fixture-settings',JSON.stringify(settings));},settings);
    const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
    if(settings.now)await page.clock.setFixedTime(new Date(settings.now));
    await page.goto(url);
    if(settings.salesOpen===false&&!settings.ordinaryActive)await page.waitForFunction(()=>window.fixtureState?.().calls.some(c=>c.path==='/api/checkout/attempt-active'));
    else await page.getByRole('heading',{name:settings.ordinaryActive?'Your saved reservation':'Choose your lanes.',exact:true}).waitFor();
    return page;
  }
  const primary=page=>page.locator('.brand-continue');
  const state=page=>page.evaluate(()=>window.fixtureState());
  const count=async(page,path)=>(await state(page)).calls.filter(c=>c.path===path).length;
  // Polls from Node: waitForFunction re-checks through eval, which this page's CSP forbids.
  async function until(check,label){for(let n=0;n<100;n++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw new Error(`Timed out waiting: ${label}`);}
  async function ready(page){await page.locator('.brand-continue:enabled').waitFor();}
  // Lane type, then time, then the lane count that opens under the chosen time.
  async function choose(page,room=126,quantity=1,time='15:00'){
    await page.locator('.room-choice').filter({hasText:room===124?'VIP suite':'Traditional'}).click();
    await primary(page).click();await page.getByRole('heading',{name:'Choose your time.',exact:true}).waitFor();
    await page.locator('.time-choice').nth(parties.findIndex(([t])=>t===time)).click();await ready(page);
    for(let n=1;n<quantity;n++)await page.getByRole('button',{name:'More',exact:true}).click();
    assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),String(quantity));await ready(page);
  }
  async function hold(page){await primary(page).click();await page.getByRole('heading',{name:'Add arcade play.',exact:true}).waitFor();}
  async function food(page){await page.getByRole('button',{name:'Continue without arcade',exact:true}).click();await page.getByRole('heading',{name:'Choose your pizza & soda.',exact:true}).waitFor();}
  async function fillFood(page,quantity,marketing=undefined){
    const pairs=page.locator('.tprs-nye-pair');assert.equal(await pairs.count(),quantity);
    for(let n=0;n<quantity;n++){
      await pairs.nth(n).getByRole('radio',{name:n%2?'Pepperoni':'Cheese only',exact:true}).check();
      await pairs.nth(n).getByRole('combobox').selectOption(n%2?'Starry':'Pepsi');
    }
    for(const checkbox of await page.locator('input[type="checkbox"]').all())if(!await checkbox.evaluate(el=>Boolean(el.closest('.tprs-consent'))))await checkbox.check();
    const consent=page.locator('.tprs-consent input[type="checkbox"]');
    if(marketing!==undefined){await consent.check();if(!marketing)await consent.uncheck();}
    for(const [selector,value] of [['#g-first','Test'],['#g-last','Guest'],['#g-email','nye-flow@example.invalid'],['#g-phone','8155550100'],['#g-zip','60544']])await page.locator(selector).fill(value);
  }
  async function payStep(page){await primary(page).click();await page.getByRole('heading',{name:'Review & pay.',exact:true}).waitFor();await page.getByLabel('Synthetic card',{exact:true}).waitFor();await page.getByRole('button',{name:/^Pay \$/}).waitFor();}
  async function screenshot(page,name,width){
    await page.setViewportSize({width,height:width>800?1000:844});await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,0));
    await page.getByText(/Checking total/).first().waitFor({state:'hidden'});
    await page.screenshot({path:resolve(output,`${name}-${width}.png`),fullPage:true});
    const sizes=await page.evaluate(()=>({inner:innerWidth,doc:document.documentElement.scrollWidth}));assert.ok(sizes.doc<=sizes.inner,`${name} at ${width}px overflows to ${sizes.doc}`);
  }

  await scenario('Public Nov 18 boundary loads no catalog or cart early and opens a mounted page at 9am Chicago',async()=>{
    const page=await fresh({salesOpen:false,publicPage:true,now:'2026-11-18T14:59:59.999Z'},'Pacific/Honolulu');
    await page.getByText('Reservations open',{exact:true}).waitFor();
    assert.equal(await page.getByText('Nov 18th @ 9am',{exact:true}).count(),1);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.room-choice').count(),0);
    assert.deepEqual((await state(page)).calls.map(c=>c.path),['/api/checkout/attempt-active']);
    await page.clock.setFixedTime(new Date('2026-11-18T15:00:00.000Z'));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Choose your lanes.',exact:true}).waitFor();
    await page.locator('.room-choice').nth(1).waitFor();
    assert.equal(await page.locator('.room-choice').count(),2);
    assert.ok(await count(page,'/api/products')>=1);
    assert.ok(await count(page,'/api/availability')>=2);
    assert.equal(await count(page,'/api/cart/replace'),0,'An opening transition never acquires lanes');
    await choose(page,126,2);await hold(page);
    assert.equal((await state(page)).cart.holds[0].count,2);
    await page.context().close();
  });
  await scenario('Closed sales still discovers the original ordinary payment without loading NYE inventory',async()=>{
    const page=await fresh({salesOpen:false,publicPage:true,ordinaryActive:true,now:'2026-11-17T15:00:00.000Z'});
    await page.getByText('Original two-hour bowling × 2',{exact:true}).waitFor();
    assert.equal(await count(page,'/api/products'),0);assert.equal(await count(page,'/api/availability'),0);
    assert.equal(await count(page,'/api/cart/session'),0);assert.equal(await count(page,'/api/cart/replace'),0);
    await page.evaluate(()=>window.configure({ordinaryActive:false}));
    await page.getByRole('button',{name:'Cancel payment and edit',exact:true}).click();
    await page.getByText('Reservations open',{exact:true}).waitFor();
    assert.equal(await count(page,'/api/products'),0);assert.equal(await count(page,'/api/cart/session'),0);
    assert.equal(await count(page,'/api/cart/replace'),0);
    await page.context().close();
  });
  await scenario('Public opening preserves an existing draft, food answers, contact and held party through the closed boundary',async()=>{
    const page=await fresh({publicPage:true,now:'2026-11-18T15:00:00.000Z'});
    await choose(page,124,2);await hold(page);await food(page);await fillFood(page,2,true);
    const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')));
    const held=(await state(page)).cart,writes=await count(page,'/api/cart/replace');
    await page.clock.setFixedTime(new Date('2026-11-18T14:59:59.999Z'));await page.reload();
    await page.getByText('Reservations open',{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1'))),saved,'Closed presentation cannot replace a persisted draft');
    await page.clock.setFixedTime(new Date('2026-11-18T15:00:00.000Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'Choose your pizza & soda.',exact:true}).waitFor();
    await page.locator('.tprs-nye-pair').nth(1).waitFor();
    const restored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')));
    assert.deepEqual(restored.choice,saved.choice);assert.deepEqual(restored.answers,saved.answers);assert.deepEqual(restored.guest,saved.guest);
    assert.equal(restored.marketingOptIn,true);assert.deepEqual(restored.addOns,saved.addOns);
    assert.equal(await page.locator('#g-email').inputValue(),'nye-flow@example.invalid');
    assert.equal(await page.locator('.tprs-nye-pair').first().getByRole('radio',{name:'Cheese only',exact:true}).isChecked(),true);
    assert.deepEqual((await state(page)).cart,held);assert.equal(await count(page,'/api/cart/replace'),writes);
    await page.context().close();
  });
  await scenario('Public page after the event offers the next visit and never starts a new NYE cart',async()=>{
    const page=await fresh({salesOpen:false,publicPage:true,now:'2027-01-01T06:30:00.000Z'},'Asia/Tokyo');
    await page.getByText("This New Year's Eve event has ended.",{exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Plan your next visit',exact:true}).getAttribute('href'),'/reserve/');
    assert.equal(await count(page,'/api/products'),0);assert.equal(await count(page,'/api/cart/session'),0);
    await page.context().close();
  });
  await scenario('Production SMS consent is optional, retained, and identical in reviewed quote and accepted payment',async()=>{
    for(const marketing of [undefined,false,true]){
      const page=await fresh();await choose(page,126,1);await hold(page);await food(page);
      const consent=page.locator('.tprs-consent input[type="checkbox"]');
      assert.equal(await consent.count(),1);assert.equal(await consent.isChecked(),false,'Marketing is never preselected');
      assert.equal(await page.locator('.tprs-consent--card').count(),0,'NYE does not advertise a signup reward');
      assert.equal(await page.getByText(/Owner rehearsal|Stripe test mode|Emails only to Jon|You won't be enrolled/).count(),0);
      await fillFood(page,1,marketing);
      await page.reload();await page.getByRole('heading',{name:'Choose your pizza & soda.',exact:true}).waitFor();
      assert.equal(await consent.isChecked(),marketing===true,'Reload retains only the guest choice');
      await payStep(page);
      assert.equal(await page.getByText('Have a code?',{exact:true}).count(),0);
      await page.getByRole('button',{name:'Edit pizza & soda',exact:true}).click();
      await page.getByRole('heading',{name:'Choose your pizza & soda.',exact:true}).waitFor();
      assert.equal(await consent.isChecked(),marketing===true,'Review editing preserves the marketing decision');
      await payStep(page);await page.getByRole('checkbox').check();await page.getByRole('button',{name:/^Pay \$/}).click();
      await page.getByRole('heading',{name:"You're booked.",exact:true}).waitFor();
      const calls=(await state(page)).calls;
      const accepted=calls.find(c=>c.path==='/api/checkout/payment-intents').body;
      const quoteIndex=Number(accepted.reviewToken.split('-').at(-1))-1;
      const reviewed=calls[quoteIndex];
      assert.equal(reviewed.path,'/api/checkout/quote');
      assert.equal(reviewed.body.smsMarketingOptIn,marketing);
      assert.equal(accepted.customer.smsMarketingOptIn,marketing);
      assert.equal(accepted.couponCode,undefined);
      assert.equal(calls.filter(c=>c.path==='/api/checkout/optin-reward-preview').length,0);
      if(marketing===undefined)assert.equal(accepted.customer.consentLanguage,undefined);
      else {assert.match(accepted.customer.consentLanguage,/Occasional marketing texts/);assert.doesNotMatch(accepted.customer.consentLanguage,/\$10|reward comes off/i);}
      await page.context().close();
    }
  });

  await scenario('Room choice is explicit; all 1–6 quantities in both rooms create indexed required food pairs',async()=>{
    for(const room of [126,124])for(let qty=1;qty<=6;qty++){
      const page=await fresh();assert.equal(await primary(page).isDisabled(),true);assert.equal(await page.locator('.room-choice[aria-pressed="true"]').count(),0);
      await choose(page,room,qty);assert.equal(await count(page,'/api/cart/replace'),0,'Browsing must not hold lanes');
      assert.equal(await page.locator('.time-choice').count(),6);
      await hold(page);const first=(await state(page)).cart;assert.equal(first.holds[0].count,qty);assert.equal(first.items[0].productId,id(room));
      assert.equal(first.items[0].startTime,'2026-12-31T15:00:00-06:00');
      await food(page);await page.locator('.tprs-nye-pair').first().waitFor();assert.equal(await page.locator('.tprs-nye-pair').count(),qty);
      assert.equal(await page.getByRole('radio',{checked:true}).count(),0,'No food is selected for guests');
      assert.equal((await state(page)).cart.holdExpiresAt,first.holdExpiresAt,'Arcade skip must not extend hold');
      await primary(page).click();assert.equal(await page.getByRole('heading',{name:'Choose your pizza & soda.',exact:true}).count(),1);
      assert.equal(await count(page,'/api/checkout/payment-intents'),0);await page.context().close();
    }
  });
  await scenario('Full six-lane VIP journey preserves early hold; full cart and twelve food answers reach guarded payment',async()=>{
    const page=await fresh();await choose(page,124,6);await hold(page);const initial=(await state(page)).cart;
    await page.getByRole('button',{name:'Add a card +',exact:true}).click();await page.getByRole('button',{name:'More',exact:true}).click();await primary(page).click();
    await page.locator('.tprs-nye-pair').first().waitFor();const held=(await state(page)).cart;
    assert.equal(held.items.length,2);assert.equal(held.items[1].quantity,2);assert.equal(held.holdExpiresAt,initial.holdExpiresAt);
    await fillFood(page,6);const writes=await count(page,'/api/cart/replace');await payStep(page);
    assert.equal(await count(page,'/api/cart/replace'),writes,'Payment mount cannot acquire or replace');
    await page.getByRole('button',{name:'View summary',exact:true}).click();
    assert.equal(await page.getByRole('heading',{name:'Review & pay.',exact:true}).evaluate(el=>el===document.activeElement),true);
    assert.equal(await count(page,'/api/cart/replace'),writes);assert.equal(await count(page,'/api/checkout/payment-intents'),0,'Viewing the summary does not start payment');
    assert.equal(await page.getByText('Have a code?',{exact:true}).count(),0);assert.equal(await page.getByText(/\$10 OFF/).count(),0);
    const readBefore=await count(page,'/api/cart');await page.getByRole('checkbox').check();await page.getByRole('button',{name:/^Pay \$/}).click();
    await page.getByRole('heading',{name:"You're booked.",exact:true}).waitFor();const final=await state(page);
    assert.ok(await count(page,'/api/cart')>readBefore,'Exact held cart must be re-read just before payment');
    assert.equal(final.cart.holds.length,0,'Accepted payment continues after durable handoff removes soft holds');
    const request=final.calls.find(c=>c.path==='/api/checkout/payment-intents').body;
    assert.equal(request.checkoutContractVersion,1);assert.equal(request.acceptedTerms,true);assert.equal(request.customer.email,'nye-flow@example.invalid');
    assert.deepEqual(request.items.map(i=>[i.productId,i.quantity]),[[id(124),6],[id(125),2]]);
    const pairs=request.formAnswers.filter(a=>a.unitIndex);assert.equal(pairs.length,12);
    for(let n=1;n<=6;n++)assert.equal(pairs.filter(a=>a.unitIndex===n).length,2);
    assert.equal(request.startTime,'2026-12-31T15:00:00-06:00');assert.equal(request.couponCode,undefined);
    assert.equal(final.calls.filter(c=>c.path==='stripe:confirm').length,1);assert.equal(await count(page,'/api/checkout/convert'),1);
    assert.equal(await count(page,'/api/cart/items'),0);await page.context().close();
  });
  await scenario('Review edit updates pizza and soda without touching the held cart; retained payment locks editing',async()=>{
    for(const retainedDecline of [false,true]){
      const page=await fresh({confirmDecline:retainedDecline});await choose(page,126,2);await hold(page);
      await page.getByRole('button',{name:'Add a card +',exact:true}).click();await page.getByRole('button',{name:'More',exact:true}).click();await primary(page).click();
      await page.locator('.tprs-nye-pair').first().waitFor();await fillFood(page,2);await payStep(page);
      const originalCart=(await state(page)).cart,writes=await count(page,'/api/cart/replace');
      const originalDraft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')));
      assert.equal(originalCart.items.find(i=>i.productId===id(125)).quantity,2);
      assert.match(await page.locator('.summary-food > p').first().innerText(),/Cheese only.*Pepsi/);
      await page.getByRole('button',{name:'Edit pizza & soda',exact:true}).click();await page.getByRole('heading',{name:'Choose your pizza & soda.',exact:true}).waitFor();
      const firstPair=page.locator('.tprs-nye-pair').first();assert.equal(await page.locator('.tprs-nye-pair').count(),2);
      assert.equal(await firstPair.getByRole('radio',{name:'Cheese only',exact:true}).isChecked(),true);assert.equal(await firstPair.getByRole('combobox').inputValue(),'Pepsi');
      assert.equal(await page.locator('.tprs-nye-pair').nth(1).getByRole('radio',{name:'Pepperoni',exact:true}).isChecked(),true);assert.equal(await page.locator('.tprs-nye-pair').nth(1).getByRole('combobox').inputValue(),'Starry');
      for(const [selector,value] of [['#g-first','Test'],['#g-last','Guest'],['#g-email','nye-flow@example.invalid'],['#g-phone','8155550100'],['#g-zip','60544']])assert.equal(await page.locator(selector).inputValue(),value);
      for(const checkbox of await page.getByRole('checkbox').all())assert.equal(await checkbox.isChecked(),!await checkbox.evaluate(el=>Boolean(el.closest('.tprs-consent'))));
      const editDraft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')));assert.deepEqual(editDraft.addOns,originalDraft.addOns);assert.deepEqual(editDraft.guest,originalDraft.guest);assert.deepEqual(editDraft.answers,originalDraft.answers);
      await firstPair.getByRole('radio',{name:'Pepperoni',exact:true}).check();await firstPair.getByRole('combobox').selectOption('Starry');await payStep(page);
      assert.match(await page.locator('.summary-food > p').first().innerText(),/Pepperoni.*Starry/);assert.match(await page.locator('.reservation-ticket').innerText(),/2 × NYE Arcade Mega Deal/);
      assert.deepEqual((await state(page)).cart,originalCart,'Food edits preserve the complete cart, revision, holds and original expiry');assert.equal(await count(page,'/api/cart/replace'),writes);assert.equal(await count(page,'/api/checkout/payment-intents'),0);
      if(!retainedDecline){await screenshot(page,'review-edit',320);await screenshot(page,'review-edit',390);}
      await page.getByRole('checkbox').check();await page.getByRole('button',{name:/^Pay \$/}).click();
      if(retainedDecline){
        await page.getByText(/^Synthetic declined card\./).waitFor();assert.equal(await page.getByRole('button',{name:'Edit pizza & soda',exact:true}).isDisabled(),true);
        assert.equal(await page.getByRole('heading',{name:'Review & pay.',exact:true}).count(),1);assert.equal(await page.getByRole('heading',{name:'Choose your pizza & soda.',exact:true}).count(),0);assert.equal(await count(page,'/api/checkout/convert'),0);
      }else await page.getByRole('heading',{name:"You're booked.",exact:true}).waitFor();
      const request=(await state(page)).calls.find(c=>c.path==='/api/checkout/payment-intents').body;
      assert.equal(await count(page,'/api/checkout/payment-intents'),1);assert.equal(await count(page,'/api/cart/replace'),writes);
      assert.deepEqual(request.items.map(i=>[i.productId,i.quantity]),[[id(126),2],[id(125),2]]);
      assert.deepEqual(request.formAnswers.filter(a=>a.unitIndex===1).map(a=>[a.formFieldId,a.value]).sort(),[[id(1261),'Pepperoni'],[id(1262),'Starry']]);
      assert.deepEqual(request.formAnswers.filter(a=>a.unitIndex===2),originalDraft.answers.filter(a=>a.unitIndex===2));
      assert.deepEqual(request.customer,originalDraft.guest);await page.context().close();
    }
  });
  await scenario('Lane count stops at the lanes left, says so, prices only what can be reserved and rechecks on every change',async()=>{
    const page=await fresh({capacity:{'126/15:00':1}});await choose(page);
    assert.equal(await page.getByRole('button',{name:'More',exact:true}).isDisabled(),true,'The count cannot pass the lanes left');
    await page.locator('.lanes-alert').filter({hasText:'Only 1 lane left'}).waitFor();
    assert.equal(await page.locator('.lanes-alert svg[aria-hidden="true"]').count(),1,'The alert sign is decorative; the text carries it');
    assert.equal(await page.getByText(/sold out/i).count(),0);assert.equal(await page.locator('.recovery-panel').count(),0);
    assert.match(await primary(page).innerText(),/^Continue with 1 Traditional lane/);assert.match(await page.locator('.checkout-footer').innerText(),/\$149\.95/);
    assert.match(await page.locator('.time-lanes').innerText(),/Up to 5 guests total/);assert.equal(await page.getByText(/Need more room/).count(),0);
    assert.equal(await count(page,'/api/cart/replace'),0);await screenshot(page,'lane-cap',390);await screenshot(page,'lane-cap',320);
    await page.evaluate(()=>window.configure({capacity:{'126/15:00':3}}));
    await page.locator('.time-choice').nth(1).click();await ready(page);await page.locator('.time-choice').nth(2).click();await ready(page);
    const probes=await count(page,'/api/availability/slot');
    await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'More',exact:true}).click();
    assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'3');await ready(page);
    await until(async()=>await count(page,'/api/availability/slot')>=probes+2,'a recheck per count change');
    assert.equal(await page.getByRole('button',{name:'More',exact:true}).isDisabled(),true);await page.context().close();
  });
  await scenario('A carried-over count above a time\'s lanes left is kept, never priced, and lowered only by the guest or the fit review',async()=>{
    const page=await fresh({capacity:{'124/17:00':2}});await choose(page,124,4);
    await page.locator('.time-choice').nth(3).click();
    await page.locator('.lanes-alert').filter({hasText:'Only 2 lanes left'}).waitFor();await page.getByText('You have 4 selected.',{exact:true}).waitFor();
    const clearance=()=>page.evaluate(()=>{const box=document.querySelector('.time-lanes')?.getBoundingClientRect(),bar=document.querySelector('.checkout-footer')?.getBoundingClientRect();
      return box&&bar?{top:Math.round(box.top),bottom:Math.round(box.bottom),footerTop:Math.round(bar.top),scrollY:Math.round(scrollY),maxScroll:document.documentElement.scrollHeight-innerHeight}:null;});
    await until(async()=>{const g=await clearance();return !!g&&g.bottom<=g.footerTop&&g.top>=0;},`lane box clear of the footer ${JSON.stringify(await clearance())}`);
    assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'4','The request is never lowered for the guest');
    const footer=await page.locator('.checkout-footer').innerText();assert.match(footer,/Only 2 left/);assert.doesNotMatch(footer,/\$\d/,'No price for lanes that are not there');
    assert.equal(await page.locator('.recovery-panel').count(),0,'The note under the time carries this case');
    assert.match(await primary(page).innerText(),/^Review other options/);await screenshot(page,'lane-over',390);
    await page.getByRole('button',{name:'Use 2 VIP lanes',exact:true}).click();await page.getByRole('heading',{name:'Review your change.',exact:true}).waitFor();
    const headcount=page.locator('.change-review input[type=number]');await headcount.waitFor();
    assert.equal(await primary(page).isDisabled(),true,'Fewer lanes wait for the group-fit answer');
    await headcount.fill('13');assert.equal(await primary(page).isDisabled(),true);await headcount.fill('12');await ready(page);
    await page.getByRole('button',{name:'Keep my original choice',exact:true}).click();
    assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'4');
    await page.getByRole('button',{name:'Fewer',exact:true}).click();assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'3');
    await page.getByRole('button',{name:'Fewer',exact:true}).click();assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'2');
    await page.locator('.lanes-alert').filter({hasText:'Only 2 lanes left'}).waitFor();await ready(page);
    assert.equal(await page.getByText(/You have \d+ selected/).count(),0,'At the cap the badge alone remains');
    assert.match(await page.locator('.checkout-footer').innerText(),/\$399\.90/);assert.equal(await count(page,'/api/cart/replace'),0);await page.context().close();
  });
  await scenario('A restored draft keeps its count when lanes left dropped, without pricing it',async()=>{
    const page=await fresh();await choose(page,124,4);
    await until(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')??'{}').quantity===4),'draft saved');
    await page.evaluate(()=>window.configure({capacity:{'124/15:00':2}}));await page.reload();
    await page.locator('.lanes-alert').filter({hasText:'Only 2 lanes left'}).waitFor();await page.getByText('You have 4 selected.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'4');assert.doesNotMatch(await page.locator('.checkout-footer').innerText(),/\$\d/);
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).quantity),4);
    assert.equal(await count(page,'/api/cart/replace'),0);await page.context().close();
  });
  await scenario('Returning to the tab and Check again refresh held times and lanes left',async()=>{
    const page=await fresh({unavailable:['126/13:00'],unavailableReasons:{'126/13:00':'held'}});await choose(page);
    await page.locator('.time-recheck').waitFor();assert.equal(await page.locator('.time-choice').nth(1).isDisabled(),true);
    const probes=await count(page,'/api/availability/slot'),grids=await count(page,'/api/availability');
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await until(async()=>await count(page,'/api/availability/slot')>probes&&await count(page,'/api/availability')>grids,'tab-return recheck');
    await page.evaluate(()=>window.configure({unavailable:[]}));
    await page.locator('.time-recheck').getByRole('button',{name:'Check availability again',exact:true}).click();
    await page.locator('.time-choice').nth(1).and(page.locator(':enabled')).waitFor();
    assert.equal(await page.locator('.time-recheck').count(),0,'No recheck once nothing can reopen');await page.context().close();
  });
  await scenario('A chosen time that fills while open goes straight to options from the footer',async()=>{
    const page=await fresh();await choose(page,124,2);
    await page.evaluate(()=>window.configure({unavailable:['124/15:00'],unavailableReasons:{'124/15:00':'sold_out'},capacity:{'124/15:00':0}}));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByRole('heading',{name:'3:00 PM is no longer available.',exact:true}).waitFor();
    assert.equal(await page.locator('.time-lanes').count(),0);assert.doesNotMatch(await page.locator('.checkout-footer').innerText(),/\$\d/);
    await ready(page);assert.match(await primary(page).innerText(),/^Review other options/);await primary(page).click();
    await page.locator('.alternative').first().waitFor();assert.equal(await count(page,'/api/cart/replace'),0);await page.context().close();
  });
  await scenario('A slower lower lanes-left answer never lets a hold use the superseded one; a failed check keeps the request',async()=>{
    const page=await fresh();await choose(page,126,1);
    await page.evaluate(()=>window.configure({capacity:{'126/15:00':2},delayProbeMs:1200}));
    await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('button',{name:'More',exact:true}).click();
    assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'3');
    assert.equal(await primary(page).isDisabled(),true,'Continue waits for the answer to this count');
    await page.locator('.lanes-alert').filter({hasText:'Only 2 lanes left'}).waitFor();await page.getByText('You have 3 selected.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'3');assert.equal(await count(page,'/api/cart/replace'),0);
    await page.evaluate(()=>window.configure({delayProbeMs:0,unknown:['126/15:00']}));
    await page.getByRole('button',{name:'Fewer',exact:true}).click();
    await page.getByText('We could not check the lanes left at this time.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'2');assert.equal(await primary(page).isDisabled(),true);
    await page.evaluate(()=>window.configure({unknown:[]}));
    await page.locator('.time-recheck').getByRole('button',{name:'Check availability again',exact:true}).click();await ready(page);
    assert.match(await primary(page).innerText(),/^Continue with 2 Traditional lanes/);assert.equal(await count(page,'/api/cart/replace'),0);await page.context().close();
  });
  await scenario('Grid refreshes apply only the latest; a failing room keeps its last times and says so',async()=>{
    const page=await fresh({unavailable:['126/13:00'],unavailableReasons:{'126/13:00':'held'}});await choose(page);
    const recheck=page.locator('.time-recheck').getByRole('button',{name:'Check availability again',exact:true});
    await page.evaluate(()=>window.configure({availabilityDelays:[1500,1500]}));await recheck.click();
    await page.evaluate(()=>window.configure({unavailable:[]}));await recheck.click();
    await page.locator('.time-choice').nth(1).and(page.locator(':enabled')).waitFor();await page.waitForTimeout(2000);
    assert.equal(await page.locator('.time-choice').nth(1).isDisabled(),false,'An older, slower refresh never overwrites a newer one');
    await page.evaluate(()=>window.configure({unavailable:['126/11:00'],failAvailabilityFor:[124]}));
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.getByText(/We could not refresh every time just now/).waitFor();
    assert.equal(await page.locator('.time-choice').nth(0).isDisabled(),true,'The healthy room still applies');
    await page.evaluate(()=>window.configure({unavailable:[],failAvailabilityFor:[124,126]}));
    await page.locator('.time-recheck').getByRole('button',{name:'Check availability again',exact:true}).click();await page.waitForTimeout(700);
    assert.equal(await page.locator('.time-choice').nth(0).isDisabled(),true,'Both rooms failing keeps the last times');
    await page.getByText(/We could not refresh every time just now/).waitFor();await page.context().close();
  });
  await scenario('A sold-out time that reopens comes back on Check availability again',async()=>{
    const page=await fresh({unavailable:['126/13:00'],unavailableReasons:{'126/13:00':'sold_out'}});await choose(page);
    assert.match(await page.locator('.time-choice').nth(1).innerText(),/SOLD OUT/);
    await page.evaluate(()=>window.configure({unavailable:[]}));
    await page.locator('.time-recheck').getByRole('button',{name:'Check availability again',exact:true}).click();
    await page.locator('.time-choice').nth(1).and(page.locator(':enabled')).waitFor();
    assert.equal(await page.getByText('SOLD OUT',{exact:true}).count(),0);await page.context().close();
  });
  await scenario('Accepting "Use 2 VIP lanes" through the fit review holds exactly 2 lanes',async()=>{
    const page=await fresh({capacity:{'124/17:00':2}});await choose(page,124,4);
    await page.locator('.time-choice').nth(3).click();await page.getByRole('button',{name:'Use 2 VIP lanes',exact:true}).click();
    await page.locator('.change-review input[type=number]').fill('12');await ready(page);await primary(page).click();
    await page.getByRole('heading',{name:'Add arcade play.',exact:true}).waitFor();
    const cart=(await state(page)).cart;assert.equal(cart.items[0].quantity,2);assert.equal(cart.items[0].startTime,'2026-12-31T17:00:00-06:00');await page.context().close();
  });
  await scenario('A delayed refresh while lanes are held leaves the mutation, deadline and food answers unchanged',async()=>{
    const page=await fresh({},'America/Chicago',1440);await choose(page,126,2);await hold(page);await food(page);await fillFood(page,2);
    const prior=(await state(page)).cart,writes=await count(page,'/api/cart/replace'),answers=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers);
    await page.evaluate(()=>window.configure({availabilityDelays:[1200,1200],unavailable:['126/17:00']}));
    await page.getByRole('navigation',{name:'Booking steps'}).getByRole('button',{name:'Party time',exact:true}).click();
    await page.getByRole('heading',{name:'Choose your time.',exact:true}).waitFor();
    await page.locator('.time-choice').nth(3).and(page.locator(':disabled')).waitFor();
    assert.deepEqual((await state(page)).cart,prior);assert.equal(await count(page,'/api/cart/replace'),writes);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers),answers);
    await page.getByRole('button',{name:'Keep my held lanes',exact:true}).click();await page.locator('.tprs-nye-pair').first().waitFor();
    assert.equal(await page.getByRole('radio',{checked:true}).count(),2);await page.context().close();
  });
  await scenario('Only a confirmed sellout is stamped SOLD OUT; held, closed and unexplained times stay neutral and cannot be chosen',async()=>{
    const page=await fresh({unavailable:['126/11:00','126/13:00','126/17:00','126/19:30'],unavailableReasons:{'126/11:00':'sold_out','126/13:00':'held','126/17:00':'closed'}});
    await page.locator('.room-choice').filter({hasText:'Traditional'}).click();await primary(page).click();await page.getByRole('heading',{name:'Choose your time.',exact:true}).waitFor();
    const rows=page.locator('.time-choice');await rows.nth(5).waitFor();
    assert.equal(await page.getByText('SOLD OUT',{exact:true}).count(),1);assert.match(await rows.nth(0).innerText(),/SOLD OUT/);
    for(const [n,label] of [[1,'Currently held'],[3,'Online booking closed'],[4,'Unavailable right now']]){
      assert.match(await rows.nth(n).innerText(),new RegExp(label));assert.doesNotMatch(await rows.nth(n).innerText(),/SOLD OUT/);
    }
    for(const n of [0,1,3,4]){assert.equal(await rows.nth(n).isDisabled(),true);assert.doesNotMatch(await rows.nth(n).innerText(),/\$/,'No price on a time that cannot be booked');}
    assert.equal(await page.locator('.time-lanes').count(),0,'No lane count before a time is chosen');assert.match(await primary(page).innerText(),/^Choose a time/);
    assert.equal(await page.locator('.time-recheck').getByRole('button',{name:'Check availability again',exact:true}).count(),1,'Sold-out, held and unexplained times can be rechecked');
    assert.equal(await primary(page).isDisabled(),true);
    for(const width of [320,390,1440])await screenshot(page,'time-states',width);
    await rows.nth(2).click();await ready(page);assert.equal(await page.locator('.time-lanes').count(),1);await page.context().close();
  });
  await scenario('Four VIP lanes convert to a capacity-safe five Traditional only after explicit review and acceptance',async()=>{
    // A time that empties after the guest chose it is the remaining shortage path.
    const page=await fresh();await choose(page,124,4);await page.evaluate(()=>window.configure({capacity:{'124/15:00':0}}));
    await page.locator('.time-choice').nth(1).click();await ready(page);await page.locator('.time-choice').nth(2).click();
    await page.getByRole('heading',{name:'No VIP lanes are open at 3:00 PM right now.',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'4','No lanes left never lowers the request');
    assert.equal(await page.getByText(/sold out/i).count(),0);await screenshot(page,'shortage',390);await screenshot(page,'shortage',320);
    assert.match(await primary(page).innerText(),/^Review other options/);await primary(page).click();
    const alternative=page.locator('.alternative').filter({hasText:'5 Traditional lanes'});await alternative.waitFor();await alternative.click();
    await page.getByRole('heading',{name:'Review your change.',exact:true}).waitFor();await ready(page);
    assert.equal(await count(page,'/api/cart/replace'),0);assert.equal(await page.locator('.change-review input[type=number]').count(),0);
    assert.match(await page.locator('.change-review').innerText(),/up to 25 guests/);
    await screenshot(page,'review-alternative',390);
    await page.getByRole('button',{name:'Keep my original choice',exact:true}).click();
    await page.getByRole('button',{name:'Check 4 Traditional lanes for a smaller group',exact:true}).click();await page.locator('.change-review input[type=number]').waitFor();
    assert.equal(await primary(page).isDisabled(),true);await page.locator('.change-review input[type=number]').fill('24');assert.equal(await primary(page).isDisabled(),true);
    await page.locator('.change-review input[type=number]').fill('20');await ready(page);assert.equal(await count(page,'/api/cart/replace'),0);
    await page.getByRole('button',{name:'Keep my original choice',exact:true}).click();await alternative.click();await ready(page);
    await primary(page).click();await page.getByRole('heading',{name:'Add arcade play.',exact:true}).waitFor();
    const cart=(await state(page)).cart;assert.equal(cart.items[0].quantity,5);assert.equal(cart.items[0].productId,id(126));await page.context().close();
  });
  await scenario('Required-form outage and malformed definitions block payment; retry restores all required pairs',async()=>{
    for(const setting of [{formFailure:true},{malformedForms:true}]){
      const page=await fresh(setting);await choose(page,126,2);await hold(page);await food(page);await page.getByRole('alert').filter({hasText:'We could not load your required food choices.'}).waitFor();
      assert.equal(await primary(page).isDisabled(),true);assert.equal(await count(page,'/api/checkout/payment-intents'),0);
      await page.evaluate(()=>window.configure({formFailure:false,malformedForms:false}));await page.getByRole('button',{name:'Try again',exact:true}).click();
      await page.locator('.tprs-nye-pair').first().waitFor();assert.equal(await page.locator('.tprs-nye-pair').count(),2);await page.context().close();
    }
  });
  await scenario('Unknown alternative capacity never becomes a false sellout or a claim that nothing fits',async()=>{
    const unknown=parties.filter(([time])=>time!=='15:00').map(([time])=>`124/${time}`).concat('126/15:00');
    const page=await fresh({unknown});await choose(page,124,4);await page.evaluate(()=>window.configure({capacity:{'124/15:00':0}}));
    await page.locator('.time-choice').nth(1).click();await page.getByRole('heading',{name:'We could not check these lanes.',exact:true}).waitFor();
    await page.locator('.time-choice').nth(2).click();await page.getByRole('heading',{name:'No VIP lanes are open at 3:00 PM right now.',exact:true}).waitFor();
    await ready(page);await primary(page).click();
    await page.getByText('No verified alternatives right now. Try checking again, or choose another party time.',{exact:true}).waitFor();
    assert.equal(await page.getByText(/sold out|No other party currently fits/i).count(),0);assert.equal(await count(page,'/api/cart/replace'),0);await page.context().close();
  });
  await scenario('Capacity race on reviewed replacement preserves original cart, deadline and indexed food answers',async()=>{
    const page=await fresh({},'America/Chicago',1440);await choose(page,126,2);await hold(page);await food(page);await fillFood(page,2);
    const prior=(await state(page)).cart,answers=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers);
    await page.getByRole('navigation',{name:'Booking steps'}).getByRole('button',{name:'Party time',exact:true}).click();
    await page.locator('.time-choice').nth(3).click();await ready(page);await primary(page).click();await page.getByRole('heading',{name:'Review your change.',exact:true}).waitFor();await ready(page);
    await page.evaluate(()=>window.configure({failNextReplace:true}));await primary(page).click();await page.getByText('There are not enough lanes available for that selection. Your previous held lanes and answers are unchanged.',{exact:true}).waitFor();
    assert.deepEqual((await state(page)).cart,prior);assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers),answers);
    assert.equal(await page.getByText(/INTERNAL private/).count(),0);await page.getByRole('button',{name:'Keep my held lanes',exact:true}).first().click();
    await page.getByRole('button',{name:'Keep my held lanes',exact:true}).click();await page.locator('.tprs-nye-pair').first().waitFor();
    assert.equal(await page.getByRole('radio',{checked:true}).count(),2);await page.context().close();
  });
  await scenario('Tokyo and Los Angeles browsers send Chicago midnight-tail time and show January 1 ending',async()=>{
    for(const timezone of ['Asia/Tokyo','America/Los_Angeles']){
      const page=await fresh({},timezone);await choose(page,124,1,'22:00');assert.match(await page.locator('.time-choice[aria-pressed=true]').innerText(),/Jan 1, 2027/);
      await hold(page);const cart=(await state(page)).cart;assert.equal(cart.items[0].startTime,'2026-12-31T22:00:00-06:00');
      assert.equal(cart.holds[0].endTime,'2027-01-01T06:40:00.000Z');await food(page);await fillFood(page,1);await payStep(page);
      assert.match(await page.locator('.reservation-ticket').innerText(),/Jan 1, 2027/);await page.getByRole('checkbox').check();await page.getByRole('button',{name:/^Pay \$/}).click();await page.getByRole('heading',{name:"You're booked.",exact:true}).waitFor();
      assert.equal((await state(page)).calls.find(c=>c.path==='/api/checkout/payment-intents').body.startTime,'2026-12-31T22:00:00-06:00');await page.context().close();
    }
  });
  await scenario('Lost successful response survives reload and retries only the original mutation on explicit request',async()=>{
    const page=await fresh({dropNextReplaceResponse:true});await choose(page,126,2);await primary(page).click();await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();
    const first=(await state(page)).calls.find(c=>c.path==='/api/cart/replace').body,deadline=(await state(page)).cart.holdExpiresAt;
    await page.reload();await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();
    assert.equal(await count(page,'/api/cart/replace'),1,'Reload must not retry automatically');
    await page.getByRole('button',{name:'Check this selection',exact:true}).click();await page.getByRole('heading',{name:'Add arcade play.',exact:true}).waitFor();
    const calls=(await state(page)).calls.filter(c=>c.path==='/api/cart/replace');assert.equal(calls.length,2);assert.deepEqual(calls[1].body,first);assert.equal((await state(page)).cart.holdExpiresAt,deadline);await page.context().close();
  });
  await scenario('Accepted response with cleared controller but pending parent draft restores by GET, without another write',async()=>{
    const page=await fresh();await choose(page,126,2);await page.evaluate(()=>window.configure({failAcceptedDraftWrite:true}));await primary(page).click();
    await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();const writes=await count(page,'/api/cart/replace');
    await page.reload();await page.getByRole('heading',{name:'Add arcade play.',exact:true}).waitFor();assert.equal(await count(page,'/api/cart/replace'),writes);
    assert.equal((await state(page)).cart.holds[0].count,2);assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).pending),null);await page.context().close();
  });
  await scenario('Revision conflict re-reads current cart and requires a second review before any new commit',async()=>{
    const page=await fresh({},'America/Chicago',1440);await choose(page,126,2);await hold(page);await food(page);
    const deadline=(await state(page)).cart.holdExpiresAt;await page.getByRole('navigation',{name:'Booking steps'}).getByRole('button',{name:'Party time',exact:true}).click();
    await page.locator('.time-choice').nth(3).click();await ready(page);await primary(page).click();await page.getByRole('heading',{name:'Review your change.',exact:true}).waitFor();await ready(page);
    await page.evaluate(()=>window.fixtureBumpRevision());await primary(page).click();await page.getByText('Your cart changed in another page. Review this party before replacing the current selection.',{exact:true}).waitFor();
    const writes=await count(page,'/api/cart/replace'),revision=(await state(page)).cart.revision;await ready(page);assert.equal(await count(page,'/api/cart/replace'),writes);
    await primary(page).click();await page.getByRole('heading',{name:'Add arcade play.',exact:true}).waitFor();
    const final=await state(page);assert.equal(final.cart.holdExpiresAt,deadline);assert.equal(final.calls.filter(c=>c.path==='/api/cart/replace').at(-1).body.expectedRevision,revision);await page.context().close();
  });
  await scenario('Pending same-room reload waits for form definitions and retains numbered food answers',async()=>{
    const page=await fresh({},'America/Chicago',1440);await choose(page,126,2);await hold(page);await food(page);await fillFood(page,2);
    const original=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers.filter(a=>a.unitIndex));
    await page.getByRole('navigation',{name:'Booking steps'}).getByRole('button',{name:'Party time',exact:true}).click();await page.locator('.time-choice').nth(3).click();await ready(page);await primary(page).click();await ready(page);
    await page.evaluate(()=>window.configure({failAcceptedDraftWrite:true}));await primary(page).click();await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();
    await page.evaluate(()=>window.configure({delayForms:true}));const writes=await count(page,'/api/cart/replace');await page.reload();
    await page.waitForFunction(()=>window.calls.some(c=>c.path.endsWith('/forms'))&&document.querySelector('h2')?.textContent==='Getting your party ready.');
    assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers.filter(a=>a.unitIndex)),original);
    await page.evaluate(()=>window.releaseFixtureForms());await page.getByRole('heading',{name:'Add arcade play.',exact:true}).waitFor();assert.equal(await count(page,'/api/cart/replace'),writes);
    await food(page);assert.equal(await page.getByRole('radio',{checked:true}).count(),2);assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers.filter(a=>a.unitIndex)),original);await page.context().close();
  });
  await scenario('An ordinary retained checkout is recovered as its original order before any NYE cart or catalog work',async()=>{
    const page=await fresh({ordinaryActive:true});await page.getByText('Original two-hour bowling × 2',{exact:true}).waitFor();
    assert.match(await page.locator('.tprs-confirm-when').innerText(),/November 23, 2026/);assert.equal(await count(page,'/api/cart/session'),0);assert.equal(await count(page,'/api/products'),0);assert.equal(await count(page,'/api/cart/replace'),0);
    await page.getByRole('button',{name:'Continue saved payment $239.90',exact:true}).click();await page.getByRole('heading',{name:"You're booked.",exact:true}).waitFor();
    const converted=(await state(page)).calls.find(c=>c.path==='/api/checkout/convert').body;assert.equal(converted.items[0].productId,id(5));assert.equal(converted.eventDate,'2026-11-23');assert.equal(await count(page,'/api/checkout/payment-intents'),0);await page.context().close();
  });
  await scenario('Pending old-duration selection reconciles the same key, retains answers and stops for fresh-package review',async()=>{
    const page=await fresh({},'America/Chicago',1440);await choose(page,126,2);await hold(page);await food(page);await fillFood(page,2);
    const answers=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers.filter(a=>a.unitIndex));
    await page.getByRole('navigation',{name:'Booking steps'}).getByRole('button',{name:'Party time',exact:true}).click();await page.getByRole('button',{name:'More',exact:true}).click();await ready(page);await primary(page).click();await page.getByRole('heading',{name:'Review your change.',exact:true}).waitFor();await ready(page);
    await page.evaluate(()=>window.configure({dropNextReplaceResponse:true}));await primary(page).click();await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();
    const accepted=(await state(page)).cart,lastWrite=(await state(page)).calls.filter(c=>c.path==='/api/cart/replace').at(-1).body,writes=await count(page,'/api/cart/replace');
    await page.evaluate(()=>window.configure({catalogDurationMinutes:120}));await page.reload();await page.getByRole('button',{name:'Check this selection',exact:true}).and(page.locator(':enabled')).waitFor();assert.equal(await count(page,'/api/cart/replace'),writes);
    await page.getByRole('button',{name:'Check this selection',exact:true}).click();await page.getByText('Your lanes are held; package details changed. Please review before continuing.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('heading',{name:'Choose your time.',exact:true}).count(),1);assert.equal(await page.getByRole('heading',{name:'Add arcade play.',exact:true}).count(),0);
    const final=await state(page);assert.deepEqual(final.cart,accepted);assert.equal(await count(page,'/api/cart/replace'),writes+1);assert.deepEqual(final.calls.filter(c=>c.path==='/api/cart/replace').at(-1).body,lastWrite);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers.filter(a=>a.unitIndex)),answers);assert.equal(await count(page,'/api/checkout/payment-intents'),0);
    await page.reload();await page.getByRole('heading',{name:'Choose your time.',exact:true}).waitFor();await page.getByText('Review the updated package before continuing.',{exact:true}).waitFor();
    assert.equal(await count(page,'/api/cart/replace'),writes+1);assert.deepEqual((await state(page)).cart,accepted);
    assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).catalogReviewRequired),true);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers.filter(a=>a.unitIndex)),answers);
    await primary(page).click();await page.getByRole('heading',{name:'Review your change.',exact:true}).waitFor();assert.equal(await count(page,'/api/cart/replace'),writes+1);await ready(page);
    await primary(page).click();await page.getByRole('heading',{name:'Add arcade play.',exact:true}).waitFor();
    assert.equal(await count(page,'/api/cart/replace'),writes+2);assert.notEqual((await state(page)).calls.filter(c=>c.path==='/api/cart/replace').at(-1).body.mutationKey,lastWrite.mutationKey);
    assert.equal((await state(page)).cart.holdExpiresAt,accepted.holdExpiresAt);assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).catalogReviewRequired),false);await page.context().close();
  });
  await scenario('Saved unpaid draft with changed dated duration requires review while retaining cart and food answers',async()=>{
    const page=await fresh();await choose(page,126,2);await hold(page);await food(page);await fillFood(page,2);
    const cart=(await state(page)).cart,writes=await count(page,'/api/cart/replace'),answers=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers.filter(a=>a.unitIndex));
    await page.evaluate(()=>window.configure({catalogDurationMinutes:120}));await page.reload();await page.getByRole('heading',{name:'Choose your time.',exact:true}).waitFor();
    assert.match(await page.locator('body').innerText(),/package details changed|Package details changed/);assert.equal(await count(page,'/api/cart/replace'),writes);assert.deepEqual((await state(page)).cart,cart);
    assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers.filter(a=>a.unitIndex)),answers);
    await page.reload();await page.getByRole('heading',{name:'Choose your time.',exact:true}).waitFor();await page.getByText('Review the updated package before continuing.',{exact:true}).waitFor();assert.equal(await count(page,'/api/cart/replace'),writes);assert.deepEqual((await state(page)).cart,cart);
    await primary(page).click();await page.getByRole('heading',{name:'Review your change.',exact:true}).waitFor();assert.equal(await count(page,'/api/cart/replace'),writes);await page.context().close();
  });
  await scenario('A reloaded NYE payment cancels into complete party controls with saved food and contact details',async()=>{
    const page=await fresh({confirmDecline:true});await choose(page,124,2);await hold(page);await food(page);await fillFood(page,2);await payStep(page);
    const answers=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers);await page.getByRole('checkbox').check();await page.getByRole('button',{name:/^Pay \$/}).click();await page.getByText(/^Synthetic declined card\./).waitFor();
    const writes=await count(page,'/api/cart/replace');await page.reload();await page.getByRole('button',{name:'Cancel payment and edit',exact:true}).waitFor();await page.getByRole('button',{name:'Cancel payment and edit',exact:true}).click();
    await page.getByRole('heading',{name:'Choose your time.',exact:true}).waitFor();assert.equal(await page.locator('.time-choice').count(),6);assert.equal(await page.getByLabel('Quantity',{exact:true}).innerText(),'2');assert.match(await page.locator('.time-request').innerText(),/VIP lanes/);
    assert.equal(await count(page,'/api/cart/replace'),writes);assert.equal(await count(page,'/api/checkout/payment-intents'),1);assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('tprs:nye:brand-draft:v1')).answers),answers);await page.context().close();
  });
  await scenario('Visual checkpoints at 320, 390 and 1440 pixels fit without horizontal overflow',async()=>{
    const page=await fresh();
    for(const width of [320,390,1440])await screenshot(page,'lanes',width);
    await choose(page,126,2);for(const width of [320,390,1440])await screenshot(page,'time',width);
    await hold(page);for(const width of [320,390,1440])await screenshot(page,'arcade',width);
    await food(page);await fillFood(page,2);for(const width of [320,390,1440])await screenshot(page,'food',width);
    await payStep(page);for(const width of [320,390,1440])await screenshot(page,'pay',width);await page.context().close();
  });
  assert.deepEqual(external,[],'All requests must remain on the synthetic loopback fixture');assert.deepEqual(errors,[],'No React/browser exceptions');
  const resultName=only?`results-${only.replace(/[^a-z0-9]+/g,'-')}.json`:'results.json';
  await writeFile(resolve(output,resultName),JSON.stringify({results,externalRequests:external.length,browserErrors:errors.length,screenshots:output},null,2));
  console.log(`${results.length} full-flow scenario groups passed. Screenshots: ${output}`);
}catch(error){
  if(browser)for(const context of browser.contexts())for(const page of context.pages())try{await page.screenshot({path:resolve(output,'failure.png'),fullPage:true});await writeFile(resolve(output,'failure.txt'),`${error.stack}\n${await page.locator('body').innerText()}\n${JSON.stringify(await page.evaluate(()=>window.fixtureState?.()),null,2)}`);}catch{}
  throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
