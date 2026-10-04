import React from 'react';
import {createRoot} from 'react-dom/client';
import MenuEconomics from '../../src/components/liquor/views/MenuEconomics.tsx';
import '../../src/components/liquor/liquor.css';
const params=new URL(location.href).searchParams,mode=params.get('mode')||'normal',calls=[],requests=new Map();
const uuid='00000000-0000-0000-0000-000000000001',ingredientId='00000000-0000-0000-0000-000000000004';
const policy={productId:'p',productUuid:uuid,revision:1,targetCostPct:30,shrinkMultiplier:1,marketCeilingCents:3000,programCapCents:3000,floorCents:mode==='floor'?1500:500,reason:'Owner reviewed'};
const ingredient={skuId:ingredientId,name:'Brioche bun',countUnit:'each',unitLabel:'bun',unitsPerCase:60,recipeUnit:'each',yieldPerCount:1,costUsd:4,costSourceId:'cost-1',revision:'b'.repeat(64)};
const row=(id,complete=true)=>({product:{productId:id,productUuid:id==='p'?uuid:'00000000-0000-0000-0000-000000000002',name:'Same menu name',category:'Food',basePriceCents:1000,archived:false,orderEnabled:true},physicalMadeQty:12,financialNetQty:10,netRevenueCents:10000,knownRecipeCostCents:4800,completeRecipeCostCents:complete?4800:null,recipeCostPerMadeCents:complete?400:null,grossProfitCents:complete?5200:null,costPct:complete?48:null,ingredients:[{skuId:ingredientId,qty:12,unit:'each'}],missing:complete?[]:['ingredient_cost_or_unit_unknown:missing-sauce'],paidOptions:false});
const proposal=(kind='raise')=>({kind,proposedCents:kind==='raise'?Math.max(1300,policy.floorCents):null,liveCents:1000,gapPct:kind==='raise'?(Math.max(1300,policy.floorCents)-1000)/10:null,overTarget:kind==='raise',profitGainCents:kind==='raise'?(Math.max(1300,policy.floorCents)-1000)*10:null,breakEvenVolumeDropPct:kind==='raise'?33.3333:null,capped:false,missing:kind==='policy_needed'?['Set this item target, shrink, floor and caps.']:[]});
const recommendation=(id,productId,kind='raise')=>({id,runId:'run-1',productId,productUuid:productId==='p'?uuid:'00000000-0000-0000-0000-000000000002',policyRevision:kind==='raise'?1:null,payload:{economics:row(productId,kind!=='cost_incomplete'),proposal:proposal(kind),policy:kind==='raise'?policy:null},status:'open',revision:1,appliedCents:null,readbackCents:null,decidedAt:null,verifiedAt:null,createdAt:'2026-10-03T20:00:00Z'});
let current=[recommendation('rec-p','p'),recommendation('rec-q','q','cost_incomplete'),recommendation('rec-r','r','policy_needed')],history=[],policies=[{productId:'p',revision:1,policy}],run={id:'run-1',month:'2026-10',createdAt:'2026-10-03T20:00:00Z',periodStart:'2026-08-04T20:00:00Z',periodEnd:'2026-10-03T20:00:00Z',fingerprint:'a'.repeat(64),basis:{products:current.map(r=>r.payload.economics.product),prices:[ingredient],recipeRevision:'recipe-fixed',sourceRevision:'sales-fixed',ledgerRows:50,salesBasis:'net_ledger_once'},rows:current.map(r=>r.payload.economics)};
const savedRuns=new Map([[run.id,structuredClone(run)]]);
if(mode==='uncertain'){current[0].status='uncertain';current[0].revision=3;current[0].appliedCents=1300;}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
window.menuQa={calls,freshPrice:1000,failAfterCommit:mode==='ambiguous',releaseScenario:null};
window.menuQa.switchRun=()=>{history.push(...current.filter(r=>r.status!=='open'));run={...run,id:'run-2',fingerprint:'c'.repeat(64),createdAt:'2026-10-03T21:00:00Z'};current=current.map(r=>({...r,id:`new-${r.productId}`,runId:run.id,status:'open',revision:1,appliedCents:null,readbackCents:null}));savedRuns.set(run.id,structuredClone(run));};
if(!crypto.randomUUID){let n=0;crypto.randomUUID=()=>`00000000-0000-0000-0000-${String(++n).padStart(12,'0')}`;}
window.fetch=async(url,init={})=>{
 const path=new URL(url,location.href).pathname.replace(/\/$/,''),method=init.method||'GET',body=init.body?JSON.parse(init.body):null;
 calls.push({path,method,body});
 if(mode==='network')return json({error:'unavailable'},503);
 if(path.endsWith('/menu-economics')&&method==='GET')return json({run,recommendations:current,policies,pending:[...history,...current].filter(r=>['accepted_pending_manual','custom_pending_manual','uncertain'].includes(r.status)).map(recommendation=>({recommendation,run:savedRuns.get(recommendation.runId),writeAttemptId:recommendation.status==='uncertain'?'attempt-p':null})),writer:{mode:'off',sandboxVerified:false,message:'Approved prices wait for a manual GoTab change and fresh verification.'}});
 if(path.endsWith('/menu-economics/run')){window.menuQa.switchRun();return json({run});}
 if(path.endsWith('/price-policies')){const saved={...body,revision:body.expectedRevision+1};delete saved.expectedRevision;policies=policies.filter(p=>p.productId!==body.productId).concat({productId:body.productId,revision:saved.revision,policy:saved});return json({policy:saved});}
 if(path.endsWith('/decision')){
  if(mode==='stale')return json({error:'cost_or_recipe_changed'},409);
  if(requests.has(body.requestId))return json({recommendation:requests.get(body.requestId),replayed:true});
  const id=path.split('/').at(-2),rec=[...current,...history].find(r=>r.id===id);if(!rec)throw Error('No fixture recommendation');
  rec.status=body.action==='ignore'?'ignored':body.action==='custom'?'custom_pending_manual':'accepted_pending_manual';rec.appliedCents=body.action==='ignore'?null:body.priceCents??1300;rec.revision++;rec.decidedAt='2026-10-03T20:15:00Z';requests.set(body.requestId,rec);
  if(window.menuQa.failAfterCommit){window.menuQa.failAfterCommit=false;return json({error:'timeout'},503);}return json({recommendation:rec,replayed:false});
 }
 if(path.endsWith('/verify')){const id=path.split('/').at(-2),rec=[...current,...history].find(r=>r.id===id);rec.readbackCents=window.menuQa.freshPrice;rec.revision++;const verified=rec.readbackCents===rec.appliedCents;if(verified){rec.status='verified';rec.verifiedAt='2026-10-03T20:20:00Z';}return json({recommendation:rec,verified});}
 if(path.endsWith('/withdraw')){const id=path.split('/').at(-2),rec=[...current,...history].find(r=>r.id===id);rec.status='stale';rec.revision++;return json({recommendation:rec});}
 if(path.endsWith('/reconcile')){const id=path.split('/').at(-2),rec=[...current,...history].find(r=>r.id===id);rec.readbackCents=window.menuQa.freshPrice;rec.revision++;const verified=rec.readbackCents===rec.appliedCents;rec.status=verified?'verified':'stale';return json({recommendation:rec,verified});}
 if(path.endsWith('/ingredient-scenario')){const result={rows:[{productId:'p',name:'Same menu name',costDeltaCents:1200,newRecipeCostCents:6000,grossProfitDeltaCents:-1200},{productId:'q',name:'Same menu name',costDeltaCents:1200,newRecipeCostCents:null,grossProfitDeltaCents:null}],fixedMix:true,fixedRecipeBasis:true,runId:run.id};if(mode==='late-scenario')await new Promise(resolve=>{window.menuQa.releaseScenario=resolve;});return json(result);}
 throw Error(`Unexpected mocked request ${method} ${path}`);
};
createRoot(document.getElementById('root')).render(<div className="lq-app"><main className="lq-main"><MenuEconomics onDone={()=>{}} canManage={params.get('admin')!=='0'} initialRecommendationId={params.get('id')}/></main></div>);
