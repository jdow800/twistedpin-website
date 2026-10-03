import React from 'react';
import {createRoot} from 'react-dom/client';
import CountLiquor from 'qa:count';
import 'qa:styles';

// Synthetic bottles and shelves; every request is answered here.
// ?seagrams adds a bottle with a number in its name, for the name-number prompt.
const withSeagrams = new URL(location.href).searchParams.has('seagrams');
// ?history gives Tito's a 90-day record: largest count 3, largest delivery 12.
const withHistory = new URL(location.href).searchParams.has('history');
const catalog = [
  {id:'titos', name:"Tito's Handmade Vodka", sizeMl:1000},
  {id:'jameson', name:'Jameson Irish Whiskey', sizeMl:1000},
  ...(withSeagrams ? [{id:'seagrams', name:"Seagram's 7", sizeMl:1000}] : []),
].map(s => ({...s, section:'bar', category:'Vodka', trackingMode:'variance', countUnit:'bottle',
  unitsPerCase:12, wacCost:null, lastCost:'20.00', active:true, aliases:[],
  ...(withHistory && s.id === 'titos' ? {countHistory:{maxCount:3, maxDelivery:12, deliverySamples:1, days:90}} : {})}));
// ?no-zones: the moment before any shelf has loaded, when zoneId is still "".
const noZones = new URL(location.href).searchParams.has('no-zones');
// ?precision: persisted fractions must remain visible and survive an unchanged save.
const precision = new URL(location.href).searchParams.has('precision');
const zones = noZones ? [] : [
  {id:'well', name:'Well', walkOrder:1, active:true},
  {id:'backbar', name:'Back Bar', walkOrder:2, active:true},
];
// One bottle already counted on the back bar, so Finish is live before any take.
const initialLines = noZones ? [] : [{skuId:'jameson', zoneId:'backbar', qtyUnits:precision?'0.125':'2', source:'grid', enteredCases:null, caseSizeAtEntry:null}];
const initialBatches = precision ? [{zoneId:'well',batchId:'sample-batch',fullEquivalents:'0.125'}] : [];
const batches = precision ? [{id:'sample-batch',name:'Example Batch',notes:null,components:[]}] : [];
const qa = window.liquorQa = {calls:[], extracts:[], lines:initialLines, batches:initialBatches, recorder:null};
// ?many-findings: nine money-ranked findings, six shown and three in `more`;
// ?many-findings-old: the same nine from a server that sends no `more`.
const params = new URL(location.href).searchParams;
qa.failSave = params.has('save-fails');
qa.detailFails = params.has('submit-unknown');
qa.submitted = false;
const nine = Array.from({length:9}, (_, i) => ({kind:'not_counted', skuId:`gone${i}`, name:`Missing bottle ${i + 1}`,
  counted:null, prior:2, purchased:0, used:null, unitsPerCase:null, dollars:90 - i * 10, detail:'Counted last time, no line now.'}));
// ?size-mixup: one product's two sizes off in opposite directions (TPRS 2026-10-03).
const mixup = {kind:'size_mixup', skuId:'family:tanqueray london dry gin', name:'Tanqueray London Dry Gin (750 ml + 1 L)',
  counted:null, prior:0, purchased:0, used:null, unitsPerCase:12, dollars:13.44,
  detail:'The 750 ml count rose 0.5 with none delivered, while the 1 L count fell 1. Was a 1 L bottle entered as a 750 ml, or is a delivery missing?'};
const precheck = () => params.has('full-review')
  ? {baseline:false, findings:nine.slice(0,6), truncated:3, more:nine.slice(6),
    retiring:Array.from({length:4},(_,i)=>({skuId:'old'+i,name:'Old bottle '+i,daysSinceStock:120,daysSincePurchase:null,lastCountedQty:0,dollars:0})),
    sizeWarnings:[{skuId:'large',name:'Tanqueray London Dry Gin',sizeMl:1000,receivedQty:4,receivedAt:'2026-10-01T17:00:00Z',counted:0,otherSizes:[{sizeMl:750,counted:6}]}]}
  : params.has('size-mixup')
  ? {baseline:false, findings:[mixup], truncated:0, more:[], retiring:[], sizeWarnings:[]}
  : params.has('many-findings')
  ? {baseline:false, findings:nine.slice(0, 6), truncated:3, more:nine.slice(6), retiring:[], sizeWarnings:[]}
  : params.has('many-findings-old')
    ? {baseline:false, findings:nine.slice(0, 6), truncated:3, retiring:[], sizeWarnings:[]}
    : {baseline:true, findings:[], retiring:[], sizeWarnings:[]};
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
// ?stale: the draft changed elsewhere after this screen loaded it (7 Tito's
// were added on the well), so the first save is refused once with the lines
// as they are now.
let refuseNextSave = params.has('stale');
const line = (zoneId, skuId, qtyUnits) => ({zoneId, skuId, qtyUnits, enteredCases:null, caseSizeAtEntry:null,
  enteredPacks:null, packSizeAtEntry:null, source:'grid', rawUtterance:null});
let saves = 0;
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.origin);
  const path = url.pathname;
  const body = init.body ? JSON.parse(String(init.body)) : null;
  qa.calls.push({path, method:init.method || 'GET', body});
  if (path.endsWith('/catalog')) return json({items:catalog});
  if (path.endsWith('/zones')) return json({zones});
  if (path.endsWith('/counts/open')) return json({session:{id:'liquor-draft', section:'bar', isFullCount:true,
    startedAt:new Date().toISOString(), lines:initialLines, batches:initialBatches, linesHash:'server1', batchesHash:'batches0'}});
  if (path.endsWith('/batches')) {
    if (body?.batches) { qa.batches=body.batches; return json({batchesHash:`batches${qa.calls.filter(c=>c.path.endsWith('/batches')&&c.method==='PUT').length}`}); }
    return json({batches});
  }
  if (path.endsWith('/voice-extract')) return new Promise(resolve => {
    qa.extracts.push({body, succeed(items) { resolve(json({items})); }});
  });
  if (path.endsWith('/lines')) {
    if (qa.failSave) return json({error:'synthetic'},503);
    if (refuseNextSave) {
      refuseNextSave = false;
      return json({error:'draft_changed', message:'This count changed somewhere else since this screen loaded it.',
        lines:[line('backbar', 'jameson', '2.000'), line('well', 'titos', '7.000')], linesHash:'server2'}, 409);
    }
    qa.lines = body.lines;
    return json({upserted:body.lines.length, linesHash:`saved${++saves}`});
  }
  // ?check-fails: the pre-submit check itself cannot run.
  // ?recheck: every check finds the size question and names what it looked at
  // (check1, check2, ...); the first submit is refused because another phone
  // changed the count after the counter read the check.
  if (path.endsWith('/precheck')) {
    if (params.has('check-fails')) return json({error:'unavailable'}, 503);
    if (params.has('recheck')) {
      const n = qa.calls.filter(c => c.path.endsWith('/precheck')).length;
      return json({baseline:false, findings:[mixup], truncated:0, more:[], retiring:[], sizeWarnings:[],
        linesHash:`check${n}`, batchesHash:'batches0'});
    }
    return json(precheck());
  }
  if (path.endsWith('/submit')) {
    if (params.has('submit-rejected')) return json({error:'synthetic'},400);
    if (params.has('submit-lost') || params.has('submit-draft') || params.has('submit-unknown')) {
      qa.submitted = !params.has('submit-draft');
      throw new Error('Synthetic lost Submit response');
    }
    if (params.has('recheck') && qa.calls.filter(c => c.path.endsWith('/submit')).length === 1) {
      return json({error:'changed_since_check', message:'The count changed after the check ran.'}, 409);
    }
    return json({lineCount:qa.lines.length});
  }
  if (path.endsWith('/counts/liquor-draft')) {
    if (qa.detailFails) throw new Error('Synthetic status unavailable');
    return json({session:{id:'liquor-draft',status:qa.submitted?'submitted':'draft'},lines:qa.lines});
  }
  throw new Error('Unexpected liquor fixture request: '+path);
};
createRoot(document.getElementById('root')).render(
  <div className="lq-app"><header className="lq-header">LOCAL TEST · Synthetic liquor voice count</header>
    <main className="lq-main"><CountLiquor onDone={() => {}} /></main></div>);
