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
const initialLines = params.has('packs') ? [{skuId:'dough',zoneId:'freezer',qtyUnits:'8',source:'voice',enteredCases:null,caseSizeAtEntry:null,enteredPacks:'1',packSizeAtEntry:6}]
  : params.has('frozen') ? [{skuId:'dough',zoneId:'freezer',qtyUnits:'24',source:'voice',enteredCases:'2',caseSizeAtEntry:12}]
  : existing ? [{skuId:'dough', zoneId:'freezer', qtyUnits:'1', source:'grid', enteredCases:null, caseSizeAtEntry:null}] : [];
const qa = window.foodQa = {calls:[], extracts:[], lines:initialLines, recorder:null};
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.origin);
  const path = url.pathname;
  const body = init.body ? JSON.parse(String(init.body)) : null;
  qa.calls.push({path, query:url.search, method:init.method || 'GET', body});
  if (path.endsWith('/catalog')) return json({items:catalog});
  if (path.endsWith('/zones')) return json({zones});
  if (path.endsWith('/counts/open')) return json({session:{id:'food-trial', lines:initialLines}});
  if (path.endsWith('/voice-extract')) return new Promise(resolve => {
    qa.extracts.push({body, succeed(items) { resolve(json({items})); }, fail(message) { resolve(json({error:'voice_failed', message},502)); }});
  });
  if (path.endsWith('/case-size')) return json({unitsPerCase:body.unitsPerCase});
  if (path.endsWith('/lines')) { qa.lines = body.lines; return json({ok:true}); }
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
