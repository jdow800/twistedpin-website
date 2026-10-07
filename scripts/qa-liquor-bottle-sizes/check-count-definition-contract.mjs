// Boundary contract: the browser and API must interpret the same catalog
// vocabulary identically. No network, database, provider or inventory writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const website=fileURLToPath(new URL('../../',import.meta.url));
const backend=resolve(process.env.BOTTLE_QA_TPRS_ROOT||join(website,'../tprs'));
const require=createRequire(join(website,'package.json'));
const {build}=require('esbuild');
const paths={browser:join(website,'src/components/liquor/count-definition.ts'),server:join(backend,'apps/backend/src/bar/count-definition.ts')};
const modules={};
for(const [side,path] of Object.entries(paths)){
  const {outputFiles}=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'esm'});
  modules[side]=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const catalogPath=process.argv[2];
const loaded=catalogPath?JSON.parse(readFileSync(resolve(catalogPath),'utf8')):[];
const catalog=Array.isArray(loaded)?loaded:loaded.catalog??loaded.items;
assert.ok(Array.isArray(catalog),'Catalog must be an array or contain catalog/items');
const fixtures=[
  {name:'Bundle control',countUnit:'each',unitsPerCase:2,countDefinition:{countUnit:'each',unitsPerCase:2,unitLabel:'bundle',defaultSpokenUnit:'bundle',spokenUnits:{bundle:1,case:2},confirmedBy:'QA',confirmedAt:'2026-10-07'}},
  {name:'Shell control',countUnit:'case',unitsPerCase:1,countDefinition:{countUnit:'case',unitsPerCase:1,unitLabel:'case',spokenUnits:{shell:.05,case:1},confirmedBy:'QA',confirmedAt:'2026-10-07'}},
  {name:'Unconfirmed control',countUnit:'each',unitsPerCase:12},
];
const vocabulary=new Set(['bundle','bundles','case','cases','shell','each','unknown unit']);
// Union of both alias tables catches a new term added to only one side. These
// are contract inputs, not expected answers copied from either implementation.
for(const path of Object.values(paths)){
  const aliases=/const aliases:[\s\S]*?=\s*\{([\s\S]*?)\};/.exec(readFileSync(path,'utf8'))?.[1];
  assert.ok(aliases,'Count-unit alias table must be discoverable');
  for(const [,key,value] of aliases.matchAll(/\b([a-z]+):\s*"([a-z]+)"/g)){vocabulary.add(key);vocabulary.add(value);}
}
for(const sku of catalog){const d=sku.countDefinition;for(const unit of [sku.countUnit,d?.unitLabel,d?.defaultSpokenUnit,...Object.keys(d?.spokenUnits??{})])if(unit)vocabulary.add(unit);}
let checks=0;
for(const word of vocabulary)for(const input of [word,word.toUpperCase(),` ${word} `]){
  assert.equal(modules.browser.normalizeCountUnit(input),modules.server.normalizeCountUnit(input),`Unit normalization differs for ${JSON.stringify(input)}`);checks++;
}
for(const sku of [...fixtures,...catalog]){
  const variants=[sku,{...sku,unitsPerCase:(sku.unitsPerCase??0)+1},{...sku,countUnit:'changed-unit'},
    {...sku,countDefinition:sku.countDefinition?{...sku.countDefinition,spokenUnits:{...sku.countDefinition.spokenUnits,bad:0}}:null}];
  for(const candidate of variants){
    assert.deepEqual(modules.browser.currentCountDefinition(candidate),modules.server.currentCountDefinition(candidate),`Definition validity differs for ${sku.name}`);checks++;
    for(const unit of [null,...vocabulary]){
      assert.equal(modules.browser.definedUnitMultiplier(candidate,unit),modules.server.definedUnitMultiplier(candidate,unit),`Multiplier differs: ${sku.name}, ${unit}`);checks++;
    }
  }
}
assert.equal(modules.browser.definedUnitMultiplier(fixtures[0],'bundles'),1,'Known plural bundles should retain one bundle');
assert.equal(modules.browser.definedUnitMultiplier({...fixtures[0],unitsPerCase:3},'bundles'),null,'Changed physical package invalidates its old vocabulary');
console.log(`${checks+2} browser/API count-definition contract assertions passed across ${catalog.length} catalog items and ${vocabulary.size} unit terms.`);
