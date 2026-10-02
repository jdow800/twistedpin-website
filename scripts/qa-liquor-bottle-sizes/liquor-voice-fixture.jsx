import React from 'react';
import {createRoot} from 'react-dom/client';
import CountLiquor from 'qa:count';
import 'qa:styles';

// Synthetic bottles and shelves; every request is answered here.
// ?seagrams adds a bottle with a number in its name, for the name-number prompt.
const withSeagrams = new URL(location.href).searchParams.has('seagrams');
const catalog = [
  {id:'titos', name:"Tito's Handmade Vodka", sizeMl:1000},
  {id:'jameson', name:'Jameson Irish Whiskey', sizeMl:1000},
  ...(withSeagrams ? [{id:'seagrams', name:"Seagram's 7", sizeMl:1000}] : []),
].map(s => ({...s, section:'bar', category:'Vodka', trackingMode:'variance', countUnit:'bottle',
  unitsPerCase:12, wacCost:null, lastCost:'20.00', active:true, aliases:[]}));
// ?no-zones: the moment before any shelf has loaded, when zoneId is still "".
const noZones = new URL(location.href).searchParams.has('no-zones');
const zones = noZones ? [] : [
  {id:'well', name:'Well', walkOrder:1, active:true},
  {id:'backbar', name:'Back Bar', walkOrder:2, active:true},
];
// One bottle already counted on the back bar, so Finish is live before any take.
const initialLines = noZones ? [] : [{skuId:'jameson', zoneId:'backbar', qtyUnits:'2', source:'grid', enteredCases:null, caseSizeAtEntry:null}];
const qa = window.liquorQa = {calls:[], extracts:[], lines:initialLines, recorder:null};
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.origin);
  const path = url.pathname;
  const body = init.body ? JSON.parse(String(init.body)) : null;
  qa.calls.push({path, method:init.method || 'GET', body});
  if (path.endsWith('/catalog')) return json({items:catalog});
  if (path.endsWith('/zones')) return json({zones});
  if (path.endsWith('/counts/open')) return json({session:{id:'liquor-draft', section:'bar', isFullCount:true,
    startedAt:new Date().toISOString(), lines:initialLines, batches:[]}});
  if (path.endsWith('/batches')) return json({batches:[]});
  if (path.endsWith('/voice-extract')) return new Promise(resolve => {
    qa.extracts.push({body, succeed(items) { resolve(json({items})); }});
  });
  if (path.endsWith('/lines')) { qa.lines = body.lines; return json({ok:true}); }
  if (path.endsWith('/precheck')) return json({baseline:true, findings:[], retiring:[], sizeWarnings:[]});
  if (path.endsWith('/submit')) return json({lineCount:qa.lines.length});
  throw new Error('Unexpected liquor fixture request: '+path);
};
createRoot(document.getElementById('root')).render(
  <div className="lq-app"><header className="lq-header">LOCAL TEST · Synthetic liquor voice count</header>
    <main className="lq-main"><CountLiquor onDone={() => {}} /></main></div>);
