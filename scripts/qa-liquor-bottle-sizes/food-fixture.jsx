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
const initialLines = params.has('packs') ? [{skuId:'dough',zoneId:'freezer',qtyUnits:'8',source:'voice',enteredCases:null,caseSizeAtEntry:null,enteredPacks:'1',packSizeAtEntry:6}]
  : params.has('frozen') ? [{skuId:'dough',zoneId:'freezer',qtyUnits:'24',source:'voice',enteredCases:'2',caseSizeAtEntry:12}]
  : existing ? [{skuId:'dough', zoneId:'freezer', qtyUnits:'1', source:'grid', enteredCases:null, caseSizeAtEntry:null}] : [];
const qa = window.foodQa = {calls:[], extracts:[], lines:initialLines, recorder:null};
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
  if (path.endsWith('/precheck')) return json({baseline:true, findings:[], retiring:[]});
  if (path.endsWith('/submit')) return json({lineCount:qa.lines.length});
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
