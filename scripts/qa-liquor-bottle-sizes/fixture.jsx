import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CountLiquor from 'qa:count';
import { MatchControl } from 'qa:invoice-match';
import { recentBottleSizeWarnings } from 'qa:delivery-check';
import 'qa:styles';

const catalog = [750, 1000].map(sizeMl => ({
  id: String(sizeMl), name: 'Tanqueray London Dry Gin', sizeMl,
  category: 'Gin', trackingMode: 'variance', countUnit: 'bottle', unitsPerCase: null,
  wacCost: null, lastCost: '30.00', active: true, aliases: [],
}));
const mode = new URL(location.href).searchParams.get('mode') || 'count';
let lines = [
  {skuId: '750', zoneId: 'zone', qtyUnits: '6', source: 'grid', enteredCases: null, caseSizeAtEntry: null},
  {skuId: '1000', zoneId: 'zone', qtyUnits: '0', source: 'grid', enteredCases: null, caseSizeAtEntry: null},
];
const audit = [];
let failSave = mode === 'save-failure';
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type':'application/json'}});
function log(text) {
  audit.push(text);
  document.getElementById('audit').textContent = audit.join('\n');
}
window.fetch = async (input, init = {}) => {
  const path = new URL(String(input), location.origin).pathname;
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(String(init.body)) : {};
  log(`${method} ${path}${init.body ? ' '+String(init.body) : ''}`);
  if (path.endsWith('/catalog')) return json({items: catalog});
  if (path.endsWith('/zones')) return json({zones: [{id:'zone',name:'Back bar',walkOrder:1,active:true}]});
  if (path.endsWith('/counts/open')) return json({session: {id:'draft', startedAt:new Date().toISOString(),lines,batches:[]}});
  if (path.endsWith('/batches')) return json({batches:[]});
  if (path.endsWith('/lines')) {
    if (failSave) return json({error:'Synthetic save failure'},500);
    lines = body.lines;
    return json({ok:true});
  }
  if (path.endsWith('/precheck')) {
    if (mode === 'check-failure') return json({error:'Synthetic check failure'},500);
    const now = new Date();
    const sizeWarnings = recentBottleSizeWarnings(catalog, new Map(lines.map(l => [l.skuId,Number(l.qtyUnits)])),[
      {skuId:'1000',qty:4,lineType:'product',at:new Date(now.getTime()-86400000)},
    ],now,null);
    return json({baseline:true,findings:[],retiring:[],...(mode === 'old-api' ? {} : {sizeWarnings})});
  }
  if (path.endsWith('/submit')) return json({lineCount:lines.length});
  if (path.endsWith('/match')) return json({matchedName:'Tanqueray London Dry Gin',matchedSkuId:body.skuId,invoiceConfirmed:true});
  if (path.endsWith('/new-sku')) return json({matchedName:body.name,skuId:'new',invoiceConfirmed:true});
  throw new Error('Unexpected fixture request: '+path);
};
function Fixture() {
  const [matched,setMatched] = useState(false);
  return <div className="lq-app">
    <header className="lq-header">LOCAL TEST · Synthetic Tanqueray count</header>
    <main className="lq-main">
      {mode === 'invoice' ? <>
        <h2>1 L invoice · 4 bottles</h2>
        {matched ? <p>Matched successfully</p> : <MatchControl invoiceId="test" line={{id:'line',rawDescription:'TANQUERAY LONDON DRY GIN',sizeText:'1L'}}
          catalog={catalog.slice(0,1)} onMatched={() => setMatched(true)} />}
      </> : <CountLiquor onDone={() => log('Returned to counts')} />}
    </main>
    <details><summary>Test request log</summary><pre id="audit" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}} /></details>
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
