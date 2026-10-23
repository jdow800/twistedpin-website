// Actual React date/product screens with an isolated API fixture; no backend,
// customer data, payment provider, or network requests are used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const site = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(`${site}/package.json`);
const { build } = require('esbuild');
const { chromium } = require('playwright');

const source = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MainStep from './src/components/tprs/steps/MainStep.tsx';
import DetailStep from './src/components/tprs/steps/DetailStep.tsx';
import { selectedTimeUnavailable, reservationPolicyMessage } from './src/components/tprs/useAvailability.ts';
const root = createRoot(document.getElementById('root'));
const one = { id:'one',code:1,name:'Traditional 1 hour',durationMinutes:60,defaultPriceCents:3000,description:'',shortDescription:'',maxQuantityPerBooking:8 };
const two = { ...one,id:'two',code:2,name:'Traditional 2 hours',durationMinutes:120 };
const category = {slug:'traditional',label:'Traditional lanes',subtitle:'Up to 6 per lane',products:[one,two]};
window.fixture = {date:'2030-01-02',categories:[category],policy:{code:'holiday_removed',message:'This reservation length is unavailable on the selected date.'},slots:[{time:'11:30',priceCents:3000,available:true}],fail:false};
window.cleared = 0;
window.helpers = { selectedTimeUnavailable, reservationPolicyMessage };
function Detail({date}) {
 const [selected,setSelected] = useState({time:'11:30',priceCents:3000,available:true});
 return <DetailStep date={date} category={category} product={one} selectedSlot={selected} slotMaxUnits={null} laneQty={1} quantityLabel="How many lanes?" guestStepper={null} partySize={null} addOnQtys={{}} onPartySize={()=>{}} onPickDate={()=>{}} onSlot={setSelected} onClearSlot={()=>{window.cleared++;setSelected(null)}} onLaneQty={()=>{}} onAddOnQty={()=>{}} onRemoveLane={()=>{}} />;
}
window.renderView = (view, date, policy, slots, fail = false) => {
 Object.assign(window.fixture,{date,policy,slots,fail});
 window.cleared = 0;
 root.render(view === 'main' ? <MainStep key={date} productCodes={[1,2]} tileCards selectedDate={date} partySize={null} onPartySize={()=>{}} onPickDate={()=>{}} onSelectProduct={()=>{}} /> : <Detail key={date} date={date} />);
};
window.renderView('main',window.fixture.date,window.fixture.policy,window.fixture.slots);
`;
const clientFixture = `
const current = () => window.fixture;
export const getBookableProducts = async () => ({categories:current().categories});
export const getProducts = async () => ({products:current().categories.flatMap(c=>c.products)});
export const getMonthAvailability = async () => [{date:current().date,available:true,priceCents:3000}];
export const getMonthAvailabilityDetails = async (id,month) => ({days:[{date:current().date,available:true,priceCents:3000}],policiesByDate:id==='one' && current().policy?{[current().date]:current().policy}:{}});
export const getAvailabilityDetails = async (id,date) => { if(current().fail) throw Error('offline'); return {slots:current().slots,policy:id==='one'?current().policy:null}; };
`;
const built = await build({
  stdin: { contents:source, resolveDir:site, sourcefile:'booking-policy-fixture.tsx', loader:'tsx' },
  bundle:true, platform:'browser', format:'iife', write:false, jsx:'automatic',
  define:{'import.meta.env.DEV':'false'},
  plugins:[{name:'isolated-api',setup(b){
    b.onResolve({filter:/tprs\/client$/},()=>({path:'fixture-client',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:clientFixture,loader:'js'}));
  }}],
});
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({content:built.outputFiles[0].text});
  const explanation = 'One-hour reservations are unavailable on this date. Choose a two-hour reservation or another date.';
  await page.getByText(explanation,{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Traditional 1 hour',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Traditional 2 hours',exact:true}).count(),1);
  await page.evaluate(()=>window.renderView('detail','2030-01-03',window.fixture.policy,window.fixture.slots));
  await page.waitForFunction(()=>window.cleared===1);
  await page.getByText(explanation,{exact:true}).waitFor();
  assert.equal(await page.getByRole('option').count(),0);
  assert.equal(await page.getByText('No times left for this date.',{exact:false}).count(),0);
  await page.evaluate(()=>window.renderView('detail','2030-01-04',null,[{time:'12:30',priceCents:3000,available:true}]));
  await page.waitForFunction(()=>window.cleared===1);
  assert.equal(await page.getByRole('option').count(),1);
  await page.evaluate(()=>window.renderView('detail','2030-01-05',null,[],true));
  await page.getByText("Couldn't load times for this date.",{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.cleared),0,'network failure must preserve the customer selection');
  assert.equal(await page.evaluate(()=>window.helpers.reservationPolicyMessage(null,60,true)),null,'capacity-only absence is not a holiday policy');
  assert.equal(await page.evaluate(()=>window.helpers.reservationPolicyMessage({code:'date_removed',message:'Choose another date.'},60,true)),'Choose another date.');
  assert.deepEqual(errors,[]);
  console.log('Booking date policy: mobile product cards, explicit two-hour explanation, stale-time clearing, capacity-only distinction and network-failure preservation passed.');
} finally { await browser.close(); }
