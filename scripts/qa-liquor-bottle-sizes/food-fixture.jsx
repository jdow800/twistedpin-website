import React from 'react';
import {createRoot} from 'react-dom/client';
import CountFood from 'qa:food';

const catalog = [
  {id:'dough', name:'Pizza Dough', countUnit:'pack', unitsPerCase:20},
  {id:'pretzel', name:'Giant Pretzel', countUnit:'pack', unitsPerCase:8},
  {id:'unknown', name:'Unknown Package', countUnit:'pack', unitsPerCase:null},
].map(s => ({...s, category:'Bakery', sizeMl:null, trackingMode:'stock_count', wacCost:null}));
const zones = [
  {id:'freezer', name:'Pizza Freezer', walkOrder:1, memberSkuIds:catalog.map(s => s.id)},
  {id:'cooler', name:'Kitchen Cooler', walkOrder:2, memberSkuIds:catalog.map(s => s.id)},
];
const existing = new URL(location.href).searchParams.has('existing');
const initialLines = existing ? [{skuId:'dough', zoneId:'freezer', qtyUnits:'1', source:'grid', enteredCases:null, caseSizeAtEntry:null}] : [];
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
createRoot(document.getElementById('root')).render(<CountFood onDone={() => {}} />);
