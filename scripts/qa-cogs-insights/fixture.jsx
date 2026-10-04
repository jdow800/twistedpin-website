import React from 'react';
import {createRoot} from 'react-dom/client';
import OpsInbox from '../../src/components/liquor/views/OpsInbox.tsx';
import FoodTrends from '../../src/components/liquor/views/FoodTrends.tsx';
import BrunswickFood from '../../src/components/liquor/views/BrunswickFood.tsx';
import {FoodCostReportView} from '../../src/components/liquor/FoodCostReport.tsx';
import '../../src/components/liquor/liquor.css';
const params=new URL(location.href).searchParams, calls=[], view=params.get('view')||'ops', mode=params.get('mode')||'warnings';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
let stale=false;
const finding=i=>({key:`missing-${i}`,source:'recipes',title:`Missing recipe ${i+1}`,detail:'This sold item has no complete ingredient recipe.',href:`/cogs/?view=foodrecipes&key=gotab:${1000+i}`,capability:'bar.manage',since:null,evidence:'mocked recipe coverage',impact:{cents:null,basis:'unpriced_sales',window:'2026-10-01 through 2026-10-03'}});
const known={...finding(100),key:'known',title:'Known recipe exposure',impact:{cents:17500,basis:'matched_sales',window:null}};
const sources=[{name:'invoice_questions',state:'ready',checkedAt:'2026-10-03T20:00:00Z'},{name:'recipes',state:mode==='warnings'?'unavailable':'ready',checkedAt:'2026-10-03T20:00:00Z',...(mode==='warnings'?{error:'Recipe source did not respond.'}:{})}];
const summary=(cost,sales,pct)=>({brackets:2,usableBrackets:2,costCents:String(cost),salesCents:String(sales),pct,usar:{brackets:2,costCents:String(cost-1000),salesCents:String(sales),pct:pct-1},paper:{brackets:2,costCents:'500',covers:'50',perCoverCents:10}});
const trends={computedAt:'2026-10-04T02:30:00Z',basis:'Sum of matching bracket costs divided by matching bracket sales; latest report versions only.',ranges:[1,3,6,12].map(months=>({months,cutoffDate:'2026-07-03',draft:1,provisional:1,reliable:summary(30000,100000,30),all:summary(43000,100000,43),points:[{sessionId:'count-chicago',version:3,periodStart:'2026-09-26T02:30:00Z',periodEnd:'2026-10-04T02:30:00Z',status:'final',provisional:false,costCents:30000,salesCents:100000,pct:30}]}))};
const doc=(id,cents=null,basis=null)=>({id,salesDate:'2026-10-03',status:'extracted',checksumOk:true,sourceRevision:stale?'source-v2':'source-v1',reviewRevision:stale?'review-v2':'review-v1',result:{cents,why:cents==null?'department_evidence_missing':null,basis,rows:[]},departments:{complete:false,total:stale?75:50,rows:[{label:'Restaurant department',amount:stale?75:50}]},review:null});
const initialDocs=()=>mode==='conflict'?[doc('doc-a')]:[doc('doc-a'),doc('doc-b'),doc('doc-c'),doc('verified-zero',0,'reviewed_department_subtotals')];
const coverage=mode==='zero'?{knownDays:3,unknownDays:0}:mode==='partial'?{knownDays:1,unknownDays:2}:{knownDays:0,unknownDays:3};
const line=key=>({key,openingCents:30000,purchasesCents:10000,closingCents:10000,cogsCents:30000,cogsPerDayCents:10000,byBucket:{},purchases:{matched:10000,vendorItem:0,estimated:0,freight:0,discounts:0,flaggedCents:0},items:[],reasons:[]});
const foodCost={period:{start:'2026-10-01T15:00:00Z',end:'2026-10-04T15:00:00Z',days:3},lines:Object.fromEntries(['food_na','paper','supplies','bar_produce','unbucketed'].map(k=>[k,{...line(k),...(k==='food_na'?{}:{openingCents:0,purchasesCents:0,closingCents:0,cogsCents:0,cogsPerDayCents:0})}])),foodNa:{cogsBeforeRebatesCents:30000,rebateCents:0,cogsAfterRebatesCents:30000,sales:{gotabCents:100000,cateringCents:0,brunswickCents:mode==='partial'?25000:0,brunswickCoverage:coverage,totalCents:mode==='partial'?125000:100000,mocktailsOutCents:0,beside:[]},pct:30,target:30,band:[28,32],inBand:true,usar:null},covers:50,paperPerCoverCents:0,provisional:coverage.unknownDays>0,reasons:coverage.unknownDays?[{code:'brunswick_sales_unknown',dates:[{salesDate:'2026-10-03',why:'department_evidence_missing'}]}]:[],caveats:[],evidence:{openingCountId:'count-a',closingCountId:'count-b',invoiceIds:[],rebateDocIds:[],estimateRefs:[]}};
window.insightsQa={calls,failReload:false};
window.fetch=async(url,options={})=>{
 const u=new URL(url,location.href), path=u.pathname.replace(/\/$/,''), method=options.method||'GET', body=options.body?JSON.parse(options.body):null;
 calls.push({path,query:Object.fromEntries(u.searchParams),method,body});
 if(mode==='network')return json({error:'unavailable'},503);
 if(path.endsWith('/ops-inbox')){
  const offset=Number(u.searchParams.get('offset')||0), impact=u.searchParams.get('impact')||'all';
  const all=mode==='warnings'?[]:impact==='known'?[known]:impact==='unknown'?Array.from({length:65},(_,i)=>finding(i)):[known,...Array.from({length:65},(_,i)=>finding(i))];
  return json({findings:all.slice(offset,offset+30),total:all.length,nextOffset:offset+30<all.length?offset+30:null,sources,allClear:mode!=='warnings'&&all.length===0,note:'Exposure types are not additive.'});
 }
 if(path.endsWith('/food-trends'))return json(trends);
 if(path.endsWith('/brunswick-food')){if(window.insightsQa.failReload)return json({error:'unavailable'},503);return json({documents:Number(u.searchParams.get('offset')||0)?[doc('older-doc')]:initialDocs(),nextOffset:Number(u.searchParams.get('offset')||0)||mode==='conflict'?null:30});}
 if(path.endsWith('/review')&&method==='PUT'){
  if(mode==='conflict'&&!stale){stale=true;return json({error:'stale_source'},409);}
  return json({ok:true});
 }
 throw Error(`Unexpected mocked request ${method} ${path}`);
};
const component=view==='cost'?<FoodCostReportView report={foodCost}/>:view==='trends'?<FoodTrends onDone={()=>{}}/>:view==='brunswick'?<BrunswickFood onDone={()=>{}} canManage={params.get('admin')!=='0'} initialDocId={params.get('doc')}/>:<OpsInbox onDone={()=>{}} canManage={params.get('admin')!=='0'}/>;
createRoot(document.getElementById('root')).render(<div className="lq-app"><main className="lq-main">{component}</main></div>);
