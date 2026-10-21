// Saved selection/catalog drift checks. No provider, network or database calls.
import { build } from 'esbuild';
const source = `
import assert from 'node:assert/strict';
import { packageDetailsChanged,resolveCatalogChoice } from './src/components/tprs/nye/selectionCatalog.ts';
import { selectionItems,laneCoverage } from './src/components/tprs/nye/selection.ts';
const addon=(id)=>({id,code:10,name:'Arcade',shortDescription:'Play credit',defaultPriceCents:2000,minQuantity:1,maxQuantity:20,isRequired:false,thumbnailUrl:null});
const product={id:'traditional',code:126,name:'NYE Traditional',shortDescription:'Shoes, pizza and soda',description:'One pizza and pitcher per lane',
 defaultPriceCents:16000,durationMinutes:90,durationOverrides:[{date:'2026-12-31',startTime:'22:00',durationMinutes:150}],
 minQuantityPerBooking:1,maxQuantityPerBooking:6,salesCutoffMinutesBefore:60,thumbnailUrl:null,heroImageUrl:null,addOnProducts:[addon('arcade-a'),addon('arcade-b')]};
const saved={product,quantity:2,slot:{time:'15:00',priceCents:16000,available:true}};
const clone=(value)=>JSON.parse(JSON.stringify(value));
const grid={traditional:[saved.slot,{time:'22:00',priceCents:19000,available:true}]};
let passed=0;const check=(name,run)=>{run();passed++;console.log('PASS '+name);};
check('exact current selection resolves without changing pending evidence',()=>{
 const frozen=JSON.stringify(saved),items=selectionItems(saved,{'arcade-a':2}),coverage=laneCoverage(saved);
 const fresh=resolveCatalogChoice(saved,[product],grid);
 assert.ok(fresh);assert.equal(packageDetailsChanged(saved,fresh),false);
 assert.equal(JSON.stringify(saved),frozen);assert.deepEqual(selectionItems(saved,{'arcade-a':2}),items);assert.deepEqual(laneCoverage(saved),coverage);
});
check('selected dated duration change requires review, irrespective of default duration',()=>{
 const fresh=clone(product);fresh.durationOverrides.push({date:'2026-12-31',startTime:'15:00',durationMinutes:120});
 const current=resolveCatalogChoice(saved,[fresh],grid);assert.ok(current);assert.equal(packageDetailsChanged(saved,current),true);
 assert.equal(laneCoverage(saved)[0].endTime,'2026-12-31T22:30:00.000Z');
 assert.equal(laneCoverage(current)[0].endTime,'2026-12-31T23:00:00.000Z');
});
check('another party duration change is not a new term for this selection',()=>{
 const fresh=clone(product);fresh.durationOverrides[0].durationMinutes=180;
 assert.equal(packageDetailsChanged(saved,resolveCatalogChoice(saved,[fresh],grid)),false);
});
check('new midnight end remains a material package change',()=>{
 const late={...saved,slot:grid.traditional[1]},fresh=clone(product);fresh.durationOverrides[0].durationMinutes=180;
 assert.equal(packageDetailsChanged(late,resolveCatalogChoice(late,[fresh],grid)),true);
});
check('price and inclusion copy changes require explicit review',()=>{
 assert.equal(packageDetailsChanged(saved,{...saved,slot:{...saved.slot,priceCents:17000}}),true);
 assert.equal(packageDetailsChanged(saved,{...saved,product:{...product,description:'Different inclusions'}}),true);
 assert.equal(packageDetailsChanged(saved,{...saved,product:{...product,shortDescription:'Updated package'}}),true);
});
check('add-on removal, price and eligibility changes require review',()=>{
 for(const change of [p=>p.addOnProducts.pop(),p=>p.addOnProducts[0].defaultPriceCents++,p=>p.addOnProducts[0].maxQuantity=1,p=>p.addOnProducts[0].isRequired=true]){
  const fresh=clone(product);change(fresh);assert.equal(packageDetailsChanged(saved,{...saved,product:fresh}),true);
 }
});
check('stock, images and add-on ordering do not falsely change accepted terms',()=>{
 const fresh=clone(product);fresh.thumbnailUrl='/new.webp';fresh.addOnProducts.reverse();fresh.addOnProducts[0].thumbnailUrl='/arcade.webp';
 assert.equal(packageDetailsChanged(saved,{...saved,product:fresh,slot:{...saved.slot,available:false}}),false);
});
check('quantity limits and cutoff changes require review',()=>{
 assert.equal(packageDetailsChanged(saved,{...saved,product:{...product,maxQuantityPerBooking:1}}),true);
 assert.equal(packageDetailsChanged(saved,{...saved,product:{...product,salesCutoffMinutesBefore:90}}),true);
});
check('unknown or removed party cannot fall back to persisted price/duration',()=>{
 assert.equal(resolveCatalogChoice(saved,[product],{}),null);
 assert.equal(resolveCatalogChoice(saved,[product],{traditional:[]}),null);
 assert.equal(resolveCatalogChoice(saved,[],grid),null);
 assert.equal(resolveCatalogChoice(saved,[{...product,durationMinutes:null}],grid),null);
});
console.log(passed+' NYE catalog reconciliation checks passed.');
`;
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
