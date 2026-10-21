// Domain checks for actual NYE choices. No network, provider or database calls.
import { build } from 'esbuild';
const source = `
import assert from 'node:assert/strict';
import { partyStart,partyRange,partyDuration,laneCoverage,safeAlternativeQuantity,selectionItems,
  validNyeDefinitions,nyeAnswersComplete,answersAfterChange } from './src/components/tprs/nye/selection.ts';
import { initialState } from './src/components/tprs/state.ts';
const product = (code) => ({id:'product-'+code,code,name:'NYE',durationMinutes:90,durationOverrides:[
  {date:'2026-12-31',startTime:'17:00',durationMinutes:120},{date:'2026-12-31',startTime:'22:00',durationMinutes:150}],
  addOnProducts:[{id:'arcade',minQuantity:1,maxQuantity:20}],maxQuantityPerBooking:6});
const trad=product(126), vip=product(124);
const choice=(p=vip,q=4,time='15:00')=>({product:p,quantity:q,slot:{time,priceCents:19995,available:true}});
assert.equal(partyStart('22:00'),'2026-12-31T22:00:00-06:00');
assert.equal(laneCoverage(choice(vip,2,'22:00'))[0].endTime,'2027-01-01T06:30:00.000Z');
assert.equal(partyDuration(choice(vip,2,'17:00')),120);
assert.match(partyRange(choice(vip,2,'22:00')),/ends Jan 1, 2027/);
assert.equal(safeAlternativeQuantity(choice(),trad),5);
assert.equal(safeAlternativeQuantity(choice(trad),vip),4);
assert.equal(safeAlternativeQuantity(choice(vip,6),trad),8); // not an online offer
assert.equal(safeAlternativeQuantity(choice(),trad,10),4); // retain lane preference
assert.deepEqual(selectionItems(choice(),{arcade:2,unrelated:99}),[
 {productId:vip.id,cartLineRef:'lane',quantity:4,startTime:'2026-12-31T15:00:00-06:00'},
 {productId:'arcade',cartLineRef:'arcade',quantity:2}]);
const pair=(role)=>({id:role,fieldType:'per_unit_select',required:true,perUnitRole:role,countSource:'lane_count',countDivisor:1,
  perUnitMulti:false,options:role==='pizza'?['Cheese','Pepperoni']:['Pepsi','Starry'],visibleWhenFieldId:null});
const forms=[{id:'form',fields:[pair('pizza'),pair('pitcher'),{id:'policy',fieldType:'checkbox',required:true,visibleWhenFieldId:null},
 {id:'placement',fieldType:'short_text',required:false,visibleWhenFieldId:null}]}];
const answers=[{formFieldId:'pizza',value:'Cheese',unitIndex:1},{formFieldId:'pizza',value:'Pepperoni',unitIndex:2},
 {formFieldId:'pitcher',value:'Pepsi',unitIndex:1},{formFieldId:'pitcher',value:'Starry',unitIndex:2},
 {formFieldId:'policy',value:'true'},{formFieldId:'placement',value:'Near friends'}];
assert.equal(validNyeDefinitions(forms,124),true);
assert.equal(validNyeDefinitions([],124),false);
assert.equal(validNyeDefinitions([{...forms[0],fields:[pair('pizza')]}],124),false);
assert.equal(nyeAnswersComplete(forms,124,answers,2),true);
assert.equal(nyeAnswersComplete(forms,124,answers,3),false);
assert.equal(nyeAnswersComplete(forms,124,answers.filter(a=>a.formFieldId!=='policy'),2),false);
assert.equal(nyeAnswersComplete(forms,124,answers.map(a=>a.formFieldId==='pizza'?{...a,unitIndex:1}:a),2),false);
assert.equal(nyeAnswersComplete(forms,124,answers.map(a=>a.formFieldId==='pizza'?{...a,value:'Sub wings'}:a),2),false);
const draft={...initialState,product:vip,slot:choice().slot,laneQty:2,formAnswers:answers};
assert.deepEqual(answersAfterChange(draft,choice(vip,3),forms),answers);
assert.equal(answersAfterChange(draft,choice(vip,1),forms).some(a=>a.unitIndex===2),false);
assert.deepEqual(answersAfterChange(draft,choice(trad,3),forms),[]);
const moved=answersAfterChange(draft,choice(vip,2,'22:00'),forms);
assert.equal(moved.some(a=>a.formFieldId==='policy'),false);
assert.equal(moved.some(a=>a.formFieldId==='placement'),true);
assert.equal(moved.filter(a=>a.unitIndex).length,4);
console.log('NYE selection rules passed: dated Chicago times, safe capacity, complete carts, indexed food and reviewed changes.');
`;
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
