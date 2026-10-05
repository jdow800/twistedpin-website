import React from 'react';
import {createRoot} from 'react-dom/client';
import CountLiquor from '../../src/components/liquor/views/CountLiquor.tsx';
import '../../src/components/liquor/liquor.css';

// Actual screen and API client; all inventory and responses are fictional.
// Only the recorder boundary is controlled. No production requests or writes.
const params = new URL(location.href).searchParams;
localStorage.clear();
const sku = (id, name, extra = {}) => ({id, name, section:'bar', category:'Whiskey',
  sizeMl:1000, trackingMode:'variance', countUnit:'bottle', unitsPerCase:12,
  wacCost:null, lastCost:'20.00', active:true, aliases:[], ...extra});
const catalog = [
  sku('minsters', "Minster's Small Batch Kentucky Straight Bourbon"),
  sku('jameson', 'Jameson Irish Whiskey'),
  sku('orange', 'Jameson Orange', {sizeMl:750,unitsPerCase:params.has('frozen-moved')?24:12}),
  sku('makers', "Maker's Mark"),
  sku('herradura1l', 'Herradura Reposado'),
  sku('herradura750', 'Herradura Reposado', {sizeMl:750}),
  sku('boylan', 'Boylan Black Cherry', {trackingMode:'stock_count', countUnit:'each', sizeMl:355, category:'Mixers', unitsPerCase:24}),
  sku('jaeger', 'Jägermeister', {aliases:['Jaeger', 'Jager']}),
  sku('owens', "Owen's Ginger Beer", {trackingMode:'stock_count', countUnit:'each', sizeMl:250, category:'Mixers', unitsPerCase:24}),
  ...Array.from({length:44}, (_,i) => sku('sample'+i, `Sample Shelf Bottle ${String(i+1).padStart(2,'0')}`)),
];
const zones = [{id:'giant',name:'Giant Bottle Shelf',walkOrder:1,active:true},
  {id:'speed',name:'Speed Rail',walkOrder:2,active:true}];
const allZones=[...zones,{id:'cooler',name:'Walk-In Cooler',walkOrder:3,active:true}];
const line = (zoneId, skuId, qtyUnits, memo = {}) => ({zoneId,skuId,qtyUnits:String(qtyUnits),source:'voice',
  enteredCases:null,caseSizeAtEntry:null,rawUtterance:null,...memo});
const collision = params.get('collision');
const lines = [
  line('giant','minsters',11,{rawUtterance:'eleven Minsters small batch'}),
  line('speed','minsters',0.125,{rawUtterance:'point one two five Minsters'}),
  line('giant','jameson',collision||params.has('frozen-moved')?14:0.7,{rawUtterance:'point seven Jameson',...(collision||params.has('frozen-moved')?{enteredCases:1,caseSizeAtEntry:12}:{})}),
  line('speed','jameson',7,{rawUtterance:'point seven Jameson'}),
  line('giant','makers',0.7,{rawUtterance:'seven Makers Mark'}),
  line('giant','herradura1l',2,{rawUtterance:'two Herradura Reposado'}),
  line('giant','boylan',48,{enteredCases:2,caseSizeAtEntry:24,rawUtterance:'two cases Boylan black cherry'}),
  line('giant','jaeger',0,{rawUtterance:'zero Jaeger'}),
  line('giant','owens',12,{rawUtterance:'twelve Owens ginger beer'}),
  ...Array.from({length:44},(_,i)=>line('giant','sample'+i,(i%4)+1)),
  ...(collision?[line('giant','orange',collision==='compatible'?13:25,{enteredCases:1,caseSizeAtEntry:collision==='compatible'?12:24})]:[]),
  ...(params.has('historical-cooler')?[line('cooler','boylan',0)]:[]),
];
const qa = window.liquorQa = {nonce:Math.random(),calls:[],extracts:[],lines,recorder:null,
  failSave:false,failCheck:false,holdCheck:false,releaseCheck:null,refuseSave:false,
  remapConflict:null,releaseConflict:null};
const finding = (skuId,name,counted,extra={}) => ({kind:'big_gain',skuId,name,counted,prior:1,purchased:0,
  used:null,unitsPerCase:12,dollars:100,detail:'Check the shelf count and bottle label.',...extra});
const findings = [finding('minsters',catalog[0].name,11.125),
  finding('jameson','Jameson Irish Whiskey',7.7),
  finding('family:herradura reposado','Herradura Reposado (750 ml + 1 L)',null,
    {kind:'size_mixup',relatedSkuIds:['herradura1l','herradura750'],detail:'Check whether the bottle is 750 ml or 1 L.'}),
  finding('boylan','Boylan Black Cherry',48,{unitsPerCase:24}),finding('jaeger','Jägermeister',0)];
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
let saves=0, checks=0;
window.fetch = async (input,init={}) => {
  const url = new URL(String(input),location.origin),path=url.pathname;
  const body=init.body?JSON.parse(String(init.body)):null;
  qa.calls.push({path,query:url.search,method:init.method||'GET',body});
  if(path.endsWith('/catalog'))return json({items:catalog});
  if(path.endsWith('/zones'))return json({zones:url.searchParams.get('walk')==='liquor'&&!params.has('old-zones')?zones:allZones});
  if(path.endsWith('/batches'))return json({batches:[],batchesHash:'batches0'});
  if(path.endsWith('/counts/open'))return json({session:{id:'review-draft',section:'bar',isFullCount:true,
    startedAt:'2026-10-05T12:00:00Z',lines,batches:[],linesHash:'initial',batchesHash:'batches0'}});
  if(path.endsWith('/voice-extract'))return new Promise(resolve=>qa.extracts.push({body,succeed(items){resolve(json({items}));}}));
  if(path.endsWith('/lines')){
    if(qa.failSave)return json({error:'synthetic save unavailable'},503);
    if(qa.remapConflict){
      const conflict=qa.remapConflict;qa.remapConflict=null;
      let fresh=qa.lines.map(l=>({...l}));
      if(conflict==='target-created')fresh.push(line('giant','orange',3));
      if(conflict==='target-changed')fresh=fresh.map(l=>l.skuId==='orange'&&l.zoneId==='giant'?{...l,qtyUnits:'18'}:l);
      if(conflict==='source-changed')fresh=fresh.map(l=>l.skuId==='jameson'&&l.zoneId==='giant'?{...l,qtyUnits:'1.7'}:l);
      return new Promise(resolve=>qa.releaseConflict=()=>{
        qa.lines=fresh;resolve(json({error:'draft_changed',message:'Another phone changed this correction endpoint.',
          lines:fresh,linesHash:'endpoint-conflict'},409));
      });
    }
    if(qa.refuseSave){const mode=qa.refuseSave;qa.refuseSave=false;
      qa.lines=qa.lines.map(l=>mode==='remote-positive-case'
        ?l.skuId==='orange'&&l.zoneId==='giant'?{...l,qtyUnits:'26',enteredCases:1,caseSizeAtEntry:24}:l
        :l.skuId==='makers'?{...l,qtyUnits:'8'}:l);
      return json({error:'draft_changed',message:'This draft changed on another phone.',lines:qa.lines,linesHash:'external'},409);}
    qa.lines=body.lines;return json({upserted:body.lines.length,linesHash:'saved'+(++saves)});
  }
  if(path.endsWith('/precheck')){
    ++checks;
    if(qa.holdCheck)await new Promise(resolve=>qa.releaseCheck=resolve);
    if(qa.failCheck)return json({error:'synthetic check unavailable'},503);
    return json({baseline:false,findings:params.has('clean-after-recheck')&&checks>1?[]:findings,
      more:[],truncated:0,retiring:[],sizeWarnings:[],linesHash:'checked'+checks,batchesHash:'batches0'});
  }
  if(path.endsWith('/submit'))return json({lineCount:qa.lines.length});
  throw Error('Unexpected synthetic review request: '+path);
};
createRoot(document.getElementById('root')).render(<div className="lq-app">
  <header className="lq-header">LOCAL TEST · Synthetic liquor count</header>
  <main className="lq-main"><CountLiquor onDone={()=>{}}/></main>
</div>);
