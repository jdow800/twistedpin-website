import React from 'react';
import {createRoot} from 'react-dom/client';
import CountFood from '../../src/components/liquor/views/CountFood.tsx';
import '../../src/components/liquor/liquor.css';

// Actual CountFood/API client, fictional inventory and a controlled recorder.
// This fixture has no upstream network service, database or paid provider.
const params=new URL(location.href).searchParams;
localStorage.clear();
const sku=(id,name,countUnit='pack',unitsPerCase=24,extra={})=>({id,name,section:'food',category:'Pantry',
  countUnit,unitsPerCase,sizeMl:null,trackingMode:'stock_count',active:true,wacCost:null,lastCost:'20',...extra});
const definition=(unitsPerCase)=>({countUnit:'each',unitsPerCase,defaultSpokenUnit:'case',spokenUnits:{case:unitsPerCase},confirmedBy:'Fictional counter',confirmedAt:'2026-10-01'});
const catalog=[
  sku('dough','Pizza Dough'),
  sku('alternate','Sample Alternate Dough'),
  sku('pretzel','Giant Pretzel','pack',8),
  sku('crust','Cauliflower Crust','each',24,{countDefinition:definition(24)}),
  sku('flatbread','Flatbread, 4.5"x12"','each',60,{countDefinition:definition(60)}),
  sku('tomato','Tomato Roma','each',24),
  sku('packed','Sample Packed Garnish','each',24),
  ...Array.from({length:44},(_,i)=>sku('sample'+i,'Sample Shelf Food '+String(i+1).padStart(2,'0'))),
];
const countedIds=catalog.filter(s=>s.id!=='alternate').map(s=>s.id);
const zones=[{id:'freezer',name:'Pizza Freezer',walkOrder:1,active:true,section:'food',memberSkuIds:countedIds},
  {id:'cooler',name:'Kitchen Cooler',walkOrder:2,active:true,section:'food',memberSkuIds:['dough','pretzel']}];
const line=(zoneId,skuId,qtyUnits,memo={})=>({zoneId,skuId,qtyUnits:String(qtyUnits),source:'voice',
  enteredCases:null,caseSizeAtEntry:null,enteredPacks:null,packSizeAtEntry:null,rawUtterance:null,...memo});
const initialLines=[
  line('freezer','dough',14,{enteredCases:1,caseSizeAtEntry:12,rawUtterance:'one case and two packs of pizza dough'}),
  line('cooler','dough',0.125,{rawUtterance:'point one two five pizza dough'}),
  line('freezer','pretzel',1),line('cooler','pretzel',1),
  line('freezer','crust',12,{enteredCases:1,caseSizeAtEntry:12,rawUtterance:'one case of cauliflower crusts'}),
  line('freezer','flatbread',20,{enteredCases:1/3,caseSizeAtEntry:60,rawUtterance:'one third of a case of flatbread'}),
  line('freezer','tomato',0,{rawUtterance:'zero tomatoes'}),
  line('freezer','packed',8,{enteredPacks:1,packSizeAtEntry:6,rawUtterance:'one pack of six and two loose garnish'}),
  ...Array.from({length:44},(_,i)=>line('freezer','sample'+i,(i%4)+1)),
  ...(params.has('collision')?[line('freezer','alternate',26,{enteredCases:1,caseSizeAtEntry:24})]:[]),
  ...(params.has('location-collision')?[line('cooler','alternate',2)]:[]),
];
const qa=window.foodQa={nonce:Math.random(),calls:[],extracts:[],lines:params.has('voice-empty')?[]:initialLines,recorder:null,
  failSave:false,failCheck:false,holdSave:false,releaseSave:null,conflict:null,releaseConflict:null,
  loseSaveResponse:false,readbackMismatch:false,readbackId:null,readbackSection:null,readbackField:null,detailFails:false};
qa.catalog=catalog;qa.zones=zones;
const hash=rows=>{const canonical=JSON.stringify(rows.map(l=>[l.zoneId,l.skuId,Number(l.qtyUnits),
  l.enteredCases==null?null:Number(l.enteredCases),l.caseSizeAtEntry??null,
  l.enteredPacks==null?null:Number(l.enteredPacks),l.packSizeAtEntry??null,l.source,l.rawUtterance??null])
  .sort((a,b)=>(a[0]+':'+a[1]).localeCompare(b[0]+':'+b[1])));return[2166136261,2166136260,2166136259,2166136258].map(seed=>{let h=seed;for(const c of canonical)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h.toString(16).padStart(8,'0');}).join('');};
const finding=(skuId,counted,extra={})=>({kind:'big_gain',skuId,name:catalog.find(s=>s.id===skuId).name,
  counted,prior:1,purchased:0,used:null,unitsPerCase:catalog.find(s=>s.id===skuId).unitsPerCase,dollars:100,
  detail:'Check the shelf count and package label.',...extra});
const findings=[finding('dough',14.125),finding('crust',12),finding('flatbread',20),finding('packed',8),finding('tomato',0)];
const unplaced=params.has('locations')?[{skuId:'alternate',name:'Sample Alternate Dough',countUnit:'pack',unitsPerCase:24,
  unitLabel:null,lastBoughtAt:'2026-10-01',lastVendor:'Fictional vendor',inRecipe:true,reason:'both'}]:[];
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
let checks=0;
window.fetch=async(input,init={})=>{
  const url=new URL(String(input),location.origin),path=url.pathname,body=init.body?JSON.parse(String(init.body)):null;
  qa.calls.push({path,query:url.search,method:init.method||'GET',body});
  if(path.endsWith('/catalog'))return json({items:catalog});
  if(path.endsWith('/zones'))return json({zones});
  if(path.endsWith('/counts/open')){
    const readback=qa.calls.filter(c=>c.path.endsWith('/counts/open')).length>1;
    if(readback&&qa.detailFails)throw Error('Synthetic open draft readback unavailable');
    let rows=qa.lines;
    if(readback&&qa.readbackMismatch)rows=rows.filter(l=>l.skuId!=='alternate');
    if(readback&&qa.readbackField)rows=rows.map(l=>l.skuId!=='alternate'?l:{...l,...(qa.readbackField==='source'?{source:'voice'}:qa.readbackField==='raw'?{rawUtterance:'different saved speech'}:qa.readbackField==='pack'?{enteredPacks:1,packSizeAtEntry:3}:{enteredCases:1,caseSizeAtEntry:3})});
    return json({session:{id:readback&&qa.readbackId?qa.readbackId:'food-review',section:readback&&qa.readbackSection?qa.readbackSection:'food',status:'draft',
      isFullCount:true,startedAt:'2026-10-05T12:00:00Z',lines:rows,linesHash:hash(rows)}});
  }
  if(path.endsWith('/voice-extract'))return new Promise(resolve=>qa.extracts.push({body,
    succeed(items){resolve(json({items}));},fail(message='Synthetic extraction failure'){resolve(json({error:'voice_failed',message},502));}}));
  if(path.endsWith('/case-size')){const id=path.split('/').at(-2);catalog.find(s=>s.id===id).unitsPerCase=body.unitsPerCase;return json({unitsPerCase:body.unitsPerCase});}
  if(/\/skus\/[^/]+\/zones$/.test(path))return json({zoneId:body.zoneId,usual:body.usual,zoneName:zones.find(z=>z.id===body.zoneId)?.name});
  if(path.endsWith('/lines')){
    if(qa.failSave)return json({error:'Synthetic save unavailable'},503);
    if(qa.conflict){
      const mode=qa.conflict;qa.conflict=null;let fresh=qa.lines.map(l=>({...l}));
      if(mode==='unrelated')fresh=fresh.map(l=>l.skuId==='pretzel'&&l.zoneId==='freezer'?{...l,qtyUnits:'8'}:l);
      if(mode==='remote-case')fresh=fresh.map(l=>l.skuId==='crust'?{...l,qtyUnits:'24',enteredCases:1,caseSizeAtEntry:24}:l);
      if(mode==='remote-pack')fresh=fresh.map(l=>l.skuId==='packed'?{...l,qtyUnits:'12',enteredPacks:1,packSizeAtEntry:12}:l);
      if(mode==='target-created')fresh.push(line('freezer','alternate',3));
      if(mode==='target-changed')fresh=fresh.map(l=>l.skuId==='alternate'&&l.zoneId==='freezer'?{...l,qtyUnits:'31'}:l);
      if(mode==='source-changed')fresh=fresh.map(l=>l.skuId==='dough'&&l.zoneId==='freezer'?{...l,qtyUnits:'15'}:l);
      const result=()=>{qa.lines=fresh;return json({error:'draft_changed',message:'Another phone changed this count.',lines:fresh,linesHash:hash(fresh)},409);};
      if(mode==='unrelated'||mode==='remote-case'||mode==='remote-pack')return result();
      return new Promise(resolve=>qa.releaseConflict=()=>resolve(result()));
    }
    if(qa.holdSave)await new Promise(resolve=>qa.releaseSave=resolve);
    qa.lines=body.lines;
    if(qa.loseSaveResponse){qa.loseSaveResponse=false;throw Error('Synthetic accepted save with lost response');}
    return json({ok:true,upserted:body.lines.length,linesHash:hash(qa.lines)});
  }
  if(path.endsWith('/precheck')){
    checks++;
    if(qa.failCheck)return json({error:'Synthetic check unavailable'},503);
    return json({baseline:false,findings:params.has('clean-after-recheck')&&checks>1?[]:findings,more:[],truncated:0,
      retiring:[],unplaced,unplacedMore:[],linesHash:hash(qa.lines)});
  }
  if(path.endsWith('/submit')){
    if(body.checkedLinesHash!==hash(qa.lines))return json({error:'changed_since_check',message:'The count changed after the check.'},409);
    return json({lineCount:qa.lines.length});
  }
  if(path.endsWith('/counts/food-review')){
    if(qa.detailFails)throw Error('Synthetic readback unavailable');
    return json({session:{id:'food-review',section:'food',status:'draft',linesHash:hash(qa.lines)},
      lines:qa.readbackMismatch?qa.lines.filter(l=>l.skuId!=='alternate'):qa.lines});
  }
  throw Error('Unexpected synthetic food review request: '+path);
};
createRoot(document.getElementById('root')).render(<div className="lq-app">
  <header className="lq-header">LOCAL TEST · Synthetic food count</header>
  <main className="lq-main"><CountFood onDone={()=>{}}/></main>
</div>);
