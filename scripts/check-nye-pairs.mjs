/** Offline NYE contract/reducer checks and real React controls in Chromium.
 * Run: node scripts/check-nye-pairs.mjs
 * All forms are synthetic; a localhost-only harness blocks external requests.
 * No Astro middleware, checkout API, Stripe or production service is called.
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../', import.meta.url));
const fixtureSource = `
export const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
export const field = (n, role, overrides = {}) => ({
  id: id(n), fieldType: 'per_unit_select', label: 'Editable label ' + n,
  helpText: '', placeholder: '', required: true,
  options: role === 'pizza' ? ['Cheese', 'Pepperoni', 'Sausage', 'Half cheese / half pepperoni', 'Half pepperoni / half sausage']
    : ['Pepsi', 'Diet Pepsi', 'Starry', 'Pink Lemonade', 'Orange Crush', 'Dr. Pepper', 'Mountain Dew', 'Mug Root Beer'],
  minSelections: null, maxSelections: null, countSource: 'lane_count', countDivisor: 1,
  perUnitMulti: false, perUnitRole: role, baseOption: null, displayOrder: n,
  visibleWhenFieldId: null, visibleWhenValues: [], ...overrides,
});
export const forms = (offset = 0, indexed = true) => [{
  id: id(90 + offset), title: 'Your NYE party', thankYouCopy: '', fields: [
    field(1 + offset, 'pizza', { perUnitRole: indexed ? 'pizza' : null }),
    field(2 + offset, 'pitcher', { perUnitRole: indexed ? 'pitcher' : null }),
    field(3 + offset, null, { fieldType: 'checkbox', label: 'I understand the party rules', countSource: null, countDivisor: null }),
    field(4 + offset, null, { fieldType: 'short_text', label: 'Name on the other reservation', required: false, countSource: null, countDivisor: null }),
  ],
}];
export const product = (room = 'trad') => ({ id: room, code: room === 'vip' ? 124 : 126, minPerBooking: 1, maxPerBooking: 6 });
`;
const fixturePlugin = { name: 'synthetic-forms', setup(b) {
  b.onResolve({ filter: /^fixture$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixtureSource, loader: 'js' }));
} };

const pure = await build({
  stdin: { contents: `
import assert from 'node:assert/strict';
import { field, forms, id, product } from 'fixture';
import { answerMapFromInput, flattenAnswers, reconcileAnswers, indexedAnswersComplete, nyePairFields } from './src/components/tprs/formAnswers.ts';
import { formAnswerInputSchema, formFieldDefinitionSchema } from './src/tprs/schemas/forms.ts';
import { initialState, wizardReducer } from './src/components/tprs/state.ts';
const fs = forms(); const pizza = fs[0].fields[0]; const pitcher = fs[0].fields[1];
const wire = flattenAnswers({ [pizza.id]: ['Cheese', '', 'Pepperoni'], [pitcher.id]: ['Pepsi', 'Starry', 'Pepsi'] }, fs);
assert.deepEqual(wire.filter(a => a.formFieldId === pizza.id).map(a => a.unitIndex), [1, 3]);
assert.deepEqual(answerMapFromInput([...wire].reverse(), fs)[pizza.id], ['Cheese', '', 'Pepperoni']);
assert.equal(indexedAnswersComplete(pizza, wire, 3), false);
assert.equal(formAnswerInputSchema.parse(wire[0]).unitIndex, 1);
assert.equal(formFieldDefinitionSchema.parse(pizza).perUnitRole, 'pizza');
assert.equal(formFieldDefinitionSchema.parse({...pizza, perUnitRole: undefined}).perUnitRole ?? null, null);
for (const bad of [0, -1, 1.5]) assert.equal(formAnswerInputSchema.safeParse({...wire[0], unitIndex: bad}).success, false);
const repeated = flattenAnswers({[pizza.id]: ['Cheese', 'Cheese'], [pitcher.id]: ['Pepsi', 'Pepsi']}, fs);
assert.equal(repeated.length, 4); assert.equal(indexedAnswersComplete(pizza, repeated, 2), true);
for (const rows of [
  [{...repeated[0]}, {...repeated[0]}],
  [{...repeated[0]}, {...repeated[1], unitIndex: 3}],
  [{...repeated[0]}, {...repeated[1], unitIndex: undefined}],
  [{...repeated[0]}, {...repeated[1], value: 'Sub for wings'}],
]) assert.equal(indexedAnswersComplete(pizza, rows, 2), false);
const shrunk = reconcileAnswers(answerMapFromInput(wire, fs), fs, {[pizza.id]:2,[pitcher.id]:2});
assert.deepEqual(shrunk[pizza.id], ['Cheese','']);
assert.equal(flattenAnswers(shrunk, fs).some(a=>a.unitIndex===3), false);
assert.equal(nyePairFields(fs[0], 126).pizza.id, pizza.id);
assert.equal(nyePairFields({...fs[0], fields:[...fs[0].fields].reverse()}, 124).pizza.id, pizza.id);
assert.equal(nyePairFields(fs[0], 1), null);
assert.equal(nyePairFields(forms(0,false)[0],126), null);
const ordinary = forms(0,false);
assert.deepEqual(flattenAnswers({[pizza.id]:['Cheese','Cheese']},ordinary).map(a=>a.unitIndex),[undefined,undefined]);
const p = product();
const start = {...initialState, product:p, laneQty:3, formAnswers:wire, guest:{...initialState.guest, firstName:'Test'}};
const same = wizardReducer(start,{type:'SELECT_PRODUCT',product:p,category:null});
assert.deepEqual(same.formAnswers,wire);assert.equal(same.laneQty,3);
const smaller = wizardReducer(start,{type:'SET_LANE_QTY',qty:2});
assert.equal(smaller.formAnswers.some(a=>a.unitIndex===3),false);
const larger = wizardReducer(smaller,{type:'SET_LANE_QTY',qty:3});
assert.equal(larger.formAnswers.some(a=>a.unitIndex===3),false);
const room = wizardReducer(start,{type:'SELECT_PRODUCT',product:product('vip'),category:null});
assert.deepEqual(room.formAnswers,[]); assert.equal(room.guest.firstName,'Test');
assert.deepEqual(wizardReducer(start,{type:'SET_DATE',date:'2026-12-31'}).formAnswers,wire);
assert.deepEqual(wizardReducer(start,{type:'SET_ADDON_QTY',addOnId:'arcade',qty:2}).formAnswers,wire);
console.log('NYE contract/reducer checks passed.');
`, resolveDir: site, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, plugins: [fixturePlugin],
});
await import(`data:text/javascript;base64,${Buffer.from(pure.outputFiles[0].text).toString('base64')}`);

const harness = await build({
  stdin: { contents: `
import React, { useCallback, useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { forms, product } from 'fixture';
import GuestDetailsStep from './src/components/tprs/steps/GuestDetailsStep.tsx';
import { initialState, wizardReducer } from './src/components/tprs/state.ts';
import { scrollFocusInvalid } from './src/components/tprs/scroll.ts';
window.formDefinitions = {trad:forms(),vip:forms(10),legacy:forms(0,false)};
function Harness() {
 const [state, dispatch] = useReducer(wizardReducer, {...initialState, product:product(), laneQty:3, step:'guest', guest:{firstName:'Test',lastName:'Guest',email:'synthetic@example.invalid',phone:'8155550100',zip:'60544'}});
 const [invalid, setInvalid] = useState([]); const [attempt, setAttempt] = useState(0);
 const setAnswers = useCallback(answers=>dispatch({type:'SET_FORM_ANSWERS',answers}),[]);
 window.testState = state; window.testInvalid = invalid;
 return <main className="tprs-shell"><div className="test-controls">
  <button onClick={()=>dispatch({type:'GO_STEP',step:state.step==='guest'?'payment':'guest'})}>Toggle step</button>
  {[1,2,3,6].map(q=><button key={q} onClick={()=>dispatch({type:'SET_LANE_QTY',qty:q})}>{q} lanes</button>)}
  <button onClick={()=>dispatch({type:'SELECT_PRODUCT',product:state.product,category:null})}>Same product</button>
  <button onClick={()=>dispatch({type:'SELECT_PRODUCT',product:product('vip'),category:null})}>VIP</button>
  <button onClick={()=>{dispatch({type:'SELECT_PRODUCT',product:{...product('legacy'),code:126},category:null});dispatch({type:'SET_LANE_QTY',qty:3})}}>Legacy</button>
  <button onClick={()=>{setAttempt(n=>n+1); if(invalid[0])scrollFocusInvalid(invalid[0])}}>Check answers</button>
 </div>
 {state.step!=='payment' && <GuestDetailsStep guest={state.guest} onGuestField={(field,value)=>dispatch({type:'SET_GUEST_FIELD',field,value})}
 marketingOptIn={undefined} onMarketingOptIn={()=>{}} productId={state.product.id} productCode={state.product.code}
 formAnswers={state.formAnswers} onFormAnswers={setAnswers} onFormInvalidIds={setInvalid} submitAttempt={attempt}
 formInvalidCount={invalid.length} unitQuantities={{lane_count:state.laneQty,guest_count:0}} rewardAmountCents={null} />}
 </main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
`, resolveDir: site, loader: 'tsx' },
  bundle: true, platform: 'browser', format: 'iife', write: false, jsx: 'automatic',
  plugins: [fixturePlugin, { name: 'offline-api', setup(b) {
    b.onResolve({ filter: /tprs\/client$/ }, () => ({ path: 'client', namespace: 'offline-api' }));
    b.onLoad({ filter: /.*/, namespace: 'offline-api' }, () => ({ contents: `
export async function getProductForms(productId) { await new Promise(r=>setTimeout(r,10)); return {forms: window.formDefinitions[productId]}; }
export function formUploadUrl(){ return ''; }
export async function uploadFormImage(){ throw new Error('Uploads are outside this offline test'); }
`, loader: 'js' }));
  } }],
});
const css = await readFile(new URL('../src/components/tprs/tprs.css', import.meta.url), 'utf8');
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--tw-text:#f4efe3;--tw-text-muted:#ddd;--tw-surface:#241b35;--tw-border:#595260;--tw-border-strong:#777;--tw-accent:#4eecc4;--tw-danger:#ffaaaa;--font-body:Arial;--font-ui:Arial}*{box-sizing:border-box}body{margin:0;background:#1a1530}main{max-width:640px;margin:auto;padding:16px}.test-controls{display:flex;flex-wrap:wrap;gap:8px}.test-controls button{min-height:44px}
${css}</style><div id="root"></div><script src="/harness.js"></script>`;
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/harness.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/harness.js' ? harness.outputFiles[0].text : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: {width:390,height:844} });
  const external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e=>pageErrors.push(e.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(base);
  await page.getByRole('heading',{name:'Pizza & pitcher 3 of 3'}).waitFor();
  const pair = n => page.locator('.tprs-nye-pair').nth(n-1);
  assert.equal(await page.locator('.tprs-nye-pair input:checked').count(),0);
  await pair(1).getByLabel('Cheese only',{exact:true}).check();
  await pair(1).getByLabel('Pitcher 1').selectOption('Pepsi');
  await pair(3).getByLabel('Pepperoni',{exact:true}).check();
  await pair(3).getByLabel('Pitcher 3').selectOption('Starry');
  await page.getByLabel('I understand the party rules').check();
  await page.getByLabel('Name on the other reservation').fill('Sub for wings');
  const before = await page.evaluate(()=>window.testState.formAnswers);
  assert.deepEqual(before.filter(a=>a.formFieldId.endsWith('000001')).map(a=>a.unitIndex),[1,3]);
  await page.getByRole('button',{name:'Check answers',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.id.endsWith('000001-pair-2'));
  assert.equal(await pair(2).locator('input:checked').count(),0);
  assert.equal(await pair(3).getByLabel('Pepperoni',{exact:true}).isChecked(),true);
  await page.getByRole('button',{name:'Toggle step',exact:true}).click();
  await page.getByRole('button',{name:'Toggle step',exact:true}).click();
  await pair(3).waitFor();
  assert.equal(await pair(3).getByLabel('Pepperoni',{exact:true}).isChecked(),true);
  assert.equal(await pair(2).locator('input:checked').count(),0);
  assert.equal(await page.getByLabel('Name on the other reservation').inputValue(),'Sub for wings');
  await pair(2).getByLabel('Cheese only',{exact:true}).check();
  await pair(2).getByLabel('Pitcher 2').selectOption('Pepsi');
  assert.deepEqual(await page.evaluate(()=>window.testInvalid),[]);
  await page.getByRole('button',{name:'2 lanes',exact:true}).click();
  assert.equal(await page.locator('.tprs-nye-pair').count(),2);
  assert.equal(await page.evaluate(()=>window.testState.formAnswers.some(a=>a.unitIndex===3)),false);
  await page.getByRole('button',{name:'3 lanes',exact:true}).click();
  assert.equal(await pair(3).locator('input:checked').count(),0);
  assert.equal(await pair(3).getByLabel('Pitcher 3').inputValue(),'');
  await mkdir(new URL('../.astro/nye-qa/', import.meta.url), {recursive:true});
  await page.locator('.tprs-nye-pairs').screenshot({path:fileURLToPath(new URL('../.astro/nye-qa/mobile-pairs.png',import.meta.url))});
  await page.getByRole('button',{name:'Same product',exact:true}).click();
  assert.equal(await pair(1).getByLabel('Cheese only',{exact:true}).isChecked(),true);
  await page.getByRole('button',{name:'6 lanes',exact:true}).click();
  assert.equal(await page.locator('.tprs-nye-pair').count(),6);
  for (const width of [360,390,412,1280]) {
    await page.setViewportSize({width,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow at ${width}`);
  }
  assert.ok(await pair(1).getByLabel('Pitcher 1').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
  assert.ok(await pair(1).locator('.tprs-choice').first().evaluate(el=>el.getBoundingClientRect().height>=44));
  assert.equal(await page.locator('input,select,textarea').evaluateAll(els=>{
    const ids=els.map(el=>el.id).filter(Boolean);return new Set(ids).size===ids.length;
  }),true);
  await page.getByRole('button',{name:'VIP',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('input[id$="000011-pair-1"]'));
  assert.equal(await page.locator('.tprs-nye-pair input:checked').count(),0);
  assert.equal(await page.getByLabel('First name',{exact:false}).inputValue(),'Test');
  await page.getByRole('button',{name:'Legacy',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.tprs-per-unit-row').length===6);
  assert.equal(await page.locator('.tprs-nye-pair').count(),0);
  const legacySelects=page.locator('.tprs-per-unit').first().locator('select');
  await legacySelects.nth(2).selectOption('Pepperoni');
  assert.equal(await legacySelects.nth(0).inputValue(),'');
  assert.equal(await legacySelects.nth(1).inputValue(),'');
  assert.equal(await legacySelects.nth(2).inputValue(),'Pepperoni');
  assert.equal(await page.evaluate(()=>window.testState.formAnswers.some(a=>a.unitIndex!==undefined)),false);
  assert.deepEqual(external,[]); assert.deepEqual(pageErrors,[]);
  console.log('NYE browser checks passed: sparse pairs, exact focus, Back, quantities, same product, room change, fixed choices, mobile sizes, legacy controls; no external requests.');
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
