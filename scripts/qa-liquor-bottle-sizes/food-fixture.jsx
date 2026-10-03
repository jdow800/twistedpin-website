import React from 'react';
import {createRoot} from 'react-dom/client';
import CountFood from 'qa:food';
import 'qa:styles';

const catalog = [
  {id:'dough', name:'Pizza Dough', countUnit:'pack', unitsPerCase:20},
  {id:'pretzel', name:'Giant Pretzel', countUnit:'pack', unitsPerCase:8},
  {id:'unknown', name:'Unknown Package', countUnit:'pack', unitsPerCase:null},
  {id:'water', name:'Aquafina Water, Bottled', countUnit:'each', unitsPerCase:24,
    countHistory:{maxCount:48,maxDelivery:24,deliverySamples:3,days:90}},
  {id:'circles', name:'Cardboard Pizza Circle 14"', countUnit:'each', unitsPerCase:100},
  {id:'gloves', name:'Glove, Vinyl, Extra Large', countUnit:'case', unitsPerCase:null},
  {id:'rice', name:'Rice, Spanish', countUnit:'pack', unitsPerCase:6},
].map(s => ({...s, category:'Bakery', sizeMl:null, trackingMode:'stock_count', wacCost:null}));
const zones = [
  {id:'freezer', name:'Pizza Freezer', walkOrder:1, memberSkuIds:catalog.map(s => s.id)},
  {id:'cooler', name:'Kitchen Cooler', walkOrder:2, memberSkuIds:catalog.map(s => s.id)},
];
const existing = new URL(location.href).searchParams.has('existing');
const params = new URL(location.href).searchParams;
if (params.has('definitions')) {
  const answer = (countUnit, unitsPerCase, extra = {}) => ({
    countUnit, unitsPerCase, confirmedBy:'QA fixture', confirmedAt:'2026-01-01', ...extra,
  });
  Object.assign(catalog[0], {countUnit:'case',unitsPerCase:1,
    countDefinition:answer('case',1,{usualMaxCases:20}),
    countHistory:{maxCount:1.6,maxDelivery:2,deliverySamples:2,days:90}});
  catalog.push(
    {id:'buns',name:'Sample Buns',countUnit:'each',unitsPerCase:48,
      countDefinition:answer('each',48,{unitLabel:'bun',spokenUnits:{bag:12,bun:1},usualMaxCases:3})},
    {id:'plates',name:'Sample Plates',countUnit:'pack',unitsPerCase:4,
      countDefinition:answer('pack',4,{unitLabel:'bag',spokenUnits:{bag:1}})},
    {id:'fruit',name:'Sample Fruit',countUnit:'each',unitsPerCase:115,
      countDefinition:answer('each',115,{usualMaxCases:4})},
    {id:'fries',name:'Sample Fries',countUnit:'pack',unitsPerCase:6,
      countDefinition:answer('pack',6,{unitLabel:'bag',defaultSpokenUnit:'case',spokenUnits:{case:6,bag:1}})},
    {id:'celery',name:'Sample Celery',countUnit:'each',unitsPerCase:3,
      countDefinition:answer('each',3,{unitLabel:'bunch',defaultSpokenUnit:'case',spokenUnits:{case:3,bag:3},usualMaxCases:4})},
    {id:'romaine',name:'Sample Romaine',countUnit:'each',unitsPerCase:6,
      countDefinition:answer('each',6,{unitLabel:'head',defaultSpokenUnit:'case',spokenUnits:{case:6,bag:6}})},
  );
  if (params.has('changed-package')) catalog.find(s=>s.id==='buns').unitsPerCase=24;
  for(const zone of zones) zone.memberSkuIds=catalog.map(s=>s.id);
}
// Discontinued (tprs 0196): the 2 oz patties are leftovers, replaced by the 3.5 oz pucks.
if (params.has('discontinued')) {
  catalog.push(
    {id:'patty2',name:'Beef Patty, 2oz',countUnit:'pack',unitsPerCase:96,category:'Meat',sizeMl:null,trackingMode:'stock_count',wacCost:null,
      discontinuedAt:'2026-10-01T05:00:00.000Z',replacedBySkuId:'patty35'},
    {id:'patty35',name:'Beef Patty, 3.5oz',countUnit:'each',unitsPerCase:48,category:'Meat',sizeMl:null,trackingMode:'stock_count',wacCost:null},
  );
  for(const zone of zones) zone.memberSkuIds=catalog.map(s=>s.id);
}
// Where things live (2026-10-03): each zone has its own list, a third zone is
// empty, and guacamole and cookies are on none ("things we think you have").
if (params.has('walk')) {
  catalog.push(
    {id:'guac',name:'Guacamole',countUnit:'pack',unitsPerCase:12,category:'Prep',sizeMl:null,trackingMode:'stock_count',wacCost:null},
    {id:'cookies',name:'Cookies, Chocolate Chip, 1 oz',countUnit:'each',unitsPerCase:null,category:'Dessert',sizeMl:null,trackingMode:'stock_count',wacCost:null},
  );
  zones[0].memberSkuIds = ['dough','pretzel','water'];
  zones[1].memberSkuIds = ['circles','gloves','rice'];
  zones.push({id:'walkin', name:'Walk in Cooler', walkOrder:3, memberSkuIds:[]});
}
const unplaced = params.has('walk') ? [
  {skuId:'guac',name:'Guacamole',countUnit:'pack',unitLabel:null,unitsPerCase:12,lastBoughtAt:'2026-10-02T17:00:00.000Z',lastVendor:'Sysco',inRecipe:true,reason:'both'},
  {skuId:'cookies',name:'Cookies, Chocolate Chip, 1 oz',countUnit:'each',unitLabel:null,unitsPerCase:null,lastBoughtAt:null,lastVendor:null,inRecipe:true,reason:'recipe'},
] : [];
const unplacedMore = params.has('many') ? [
  {skuId:'unknown',name:'Unknown Package',countUnit:'pack',unitLabel:null,unitsPerCase:null,lastBoughtAt:'2026-09-20T17:00:00.000Z',lastVendor:'Webstaurant',inRecipe:false,reason:'bought'},
] : [];
const initialLines = params.has('packs') ? [{skuId:'dough',zoneId:'freezer',qtyUnits:'8',source:'voice',enteredCases:null,caseSizeAtEntry:null,enteredPacks:'1',packSizeAtEntry:6}]
  : params.has('frozen') ? [{skuId:'dough',zoneId:'freezer',qtyUnits:'24',source:'voice',enteredCases:'2',caseSizeAtEntry:12}]
  : existing ? [{skuId:'dough', zoneId:'freezer', qtyUnits:'1', source:'grid', enteredCases:null, caseSizeAtEntry:null}] : [];
const qa = window.foodQa = {calls:[], extracts:[], lines:initialLines, recorder:null, memberFail:false, zoneFail:false};
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
// ?stale: the draft changed elsewhere after this screen loaded it (3 Giant
// Pretzels were added), so the first save is refused once with the lines now.
let refuseNextSave = params.has('stale');
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.origin);
  const path = url.pathname;
  const body = init.body ? JSON.parse(String(init.body)) : null;
  qa.calls.push({path, query:url.search, method:init.method || 'GET', body});
  if (path.endsWith('/catalog')) return json({items:catalog});
  if (/\/skus\/[^/]+\/zones$/.test(path)) return qa.memberFail ? json({error:'synthetic'},500)
    : json({zoneId:body.zoneId, usual:body.usual, zoneName:zones.find(z => z.id === body.zoneId)?.name});
  if (/\/skus\/[^/]+\/discontinued$/.test(path)) return json({name:path.split('/').at(-2), active:true,
    discontinuedAt:'2026-10-03T15:00:00.000Z', replacedBySkuId:null});
  if (path.endsWith('/zones') && init.method === 'POST') {
    if (qa.zoneFail) return json({error:'synthetic'},500);
    const taken = zones.find(z => z.name.toLowerCase() === body.name.trim().toLowerCase());
    if (taken) return json({error:'name_taken', zone:{id:taken.id, name:taken.name, active:true, section:'food'}},409);
    return json({zone:{id:'spot-'+qa.calls.length, name:body.name.trim(), walkOrder:25, memberSkuIds:[]}},201);
  }
  if (path.endsWith('/zones')) return json({zones});
  if (path.endsWith('/counts/open')) return json({session:{id:'food-trial',section:'food',isFullCount:true,lines:initialLines,
    ...(params.has('stale') ? {linesHash:'server1'} : {})}});
  if (path.endsWith('/voice-extract')) return new Promise(resolve => {
    qa.extracts.push({body, succeed(items) { resolve(json({items})); }, fail(message) { resolve(json({error:'voice_failed', message},502)); }});
  });
  if (path.endsWith('/case-size')) return json({unitsPerCase:body.unitsPerCase});
  if (/\/skus\/[^/]+\/active$/.test(path)) return json({active:body.active,name:path.split('/').at(-2)});
  if (path.endsWith('/lines')) {
    if (refuseNextSave) {
      refuseNextSave = false;
      const line = (skuId, qtyUnits) => ({zoneId:'freezer', skuId, qtyUnits, enteredCases:null, caseSizeAtEntry:null,
        enteredPacks:null, packSizeAtEntry:null, source:'grid', rawUtterance:null});
      return json({error:'draft_changed', lines:[line('dough','1.000'), line('pretzel','3.000')], linesHash:'server2'}, 409);
    }
    qa.lines = body.lines;
    return json({ok:true, ...(params.has('stale') ? {linesHash:'saved'} : {})});
  }
  // ?check-fails: the check itself cannot run. ?many-findings: eight
  // findings, six in `findings` and two in `more`.
  if (path.endsWith('/precheck')) {
    if (params.has('check-fails')) return json({error:'unavailable'}, 503);
    if (params.has('many-findings')) {
      const eight = Array.from({length:8}, (_, i) => ({kind:'not_counted', skuId:`gone${i}`, name:`Missing item ${i + 1}`,
        counted:null, prior:2, purchased:0, used:null, unitsPerCase:null, dollars:80 - i * 10, detail:'Counted last time, nothing this time.'}));
      return json({baseline:false, findings:eight.slice(0, 6), truncated:2, more:eight.slice(6), retiring:[]});
    }
    // ?recheck: each check names what it looked at (fcheck1, fcheck2, ...).
    const n = qa.calls.filter(c => c.path.endsWith('/precheck')).length;
    return json({baseline:true, findings:[], retiring:[], ...(params.has('walk') ? {unplaced, unplacedMore} : {}),
      ...(params.has('recheck') ? {linesHash:`fcheck${n}`} : {})});
  }
  if (path.endsWith('/submit')) {
    // ?recheck: the first submit is refused, another phone having changed the count.
    if (params.has('recheck') && qa.calls.filter(c => c.path.endsWith('/submit')).length === 1) {
      return json({error:'changed_since_check', message:'The count changed after the check ran.'}, 409);
    }
    return json({lineCount:qa.lines.length});
  }
  throw new Error('Unexpected food fixture request: '+path);
};
function PreviewControls() {
  if (!new URL(location.href).searchParams.has('preview')) return null;
  return <button onClick={() => {
    const transcript = 'Thirty cases of Aquafina. Four packets of pizza circles. Five boxes of gloves.';
    qa.recorder.segment(transcript,0);
    qa.extracts.at(-1).succeed([
      {spoken:'Thirty cases of Aquafina',cases:30,units:0,spokenUnit:null,match:{id:'water'},candidates:[]},
      {spoken:'Four packets of pizza circles',cases:0,units:4,spokenUnit:'packet',match:{id:'circles'},candidates:[]},
      {spoken:'Five boxes of gloves',cases:0,units:5,spokenUnit:'box',match:{id:'gloves'},candidates:[]},
    ]);
    qa.recorder.finish(transcript);
  }}>Load sample review (QA only)</button>;
}
createRoot(document.getElementById('root')).render(<div className="lq-app"><header className="lq-header"><span className="lq-brand">COGS · Food QA</span></header><main className="lq-main"><PreviewControls /><CountFood onDone={() => {}} /></main></div>);
