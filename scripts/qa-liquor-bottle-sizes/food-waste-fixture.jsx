import React from 'react';
import {createRoot} from 'react-dom/client';
import FoodWaste from 'qa:food-waste';
import * as documentPhoto from 'qa:document-photo';
import {uploadInvoice} from 'qa:api';
import 'qa:global-styles';
import 'qa:styles';

// Synthetic only: this public QA file contains no staff photos or real IDs.
const copy = value => JSON.parse(JSON.stringify(value));
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor = id(1), current = id(2), closed = id(3), importId = id(4), pageId = id(5), sauce = id(6), recipe = id(7);
const definition = (countUnit,unitsPerCase,unitLabel,spokenUnits) => ({countUnit,unitsPerCase,unitLabel,spokenUnits,defaultSpokenUnit:unitLabel,confirmedBy:'Synthetic fixture',confirmedAt:'2026-01-01'});
const catalog = {items:[
  {id:sauce,name:'Sample Pizza Sauce',aliases:['test sauce'],countUnit:'each',unitsPerCase:6,countDefinition:definition('each',6,'can',{can:1,each:1,case:6})},
  {id:id(8),name:'Sample Fries',aliases:['test potatoes'],countUnit:'pack',unitsPerCase:6,countDefinition:definition('pack',6,'bag',{bag:1,pack:1,case:6})},
],recipes:[{id:recipe,name:'Sample Prepared Pizza',revision:'r1',requiredVariant:true,issues:[],options:[
  {id:id(9),name:'Small pizza',optionLabel:'Small',kind:'variant',revision:'v1'},
  {id:id(10),name:'Large pizza',optionLabel:'Large',kind:'variant',revision:'v1'},
  {id:id(11),name:'Extra cheese',optionLabel:'Extra cheese',kind:'change',revision:'c1'},
]}]};
const periods = [{openingSessionId:current,closingSessionId:null,start:'2026-01-02T12:00:00Z',end:null,label:'Current period since Jan 2 food count'},
  {openingSessionId:closed,closingSessionId:current,start:'2026-01-01T12:00:00Z',end:'2026-01-02T12:00:00Z',label:'Jan 1 to Jan 2 closed food count period'},
  {openingSessionId:null,closingSessionId:closed,start:null,end:'2026-01-01T12:00:00Z',label:'Before first food count'}];
function line(n=12,extra={}) {return {id:id(n),decision:'include',targetType:'sku',skuId:sauce,recipeId:null,optionRecipeIds:[],quantity:2,unitText:'can',occurredDate:null,reason:'Dropped',duplicateDecision:null,acknowledged:true,pageId,rowNumber:n-11,rawText:'Sample pizza sauce 2 cans dropped',itemText:'Sample pizza sauce',quantityText:'2',sourceUnitText:'can',sourceOccurredDate:null,sourceReason:'Dropped',reviewNotes:[],issues:[],candidateSkuIds:[sauce],candidateRecipeIds:[],duplicateLineIds:[],ingredients:[],valueCents:400,...extra};}
const params = new URL(location.href).searchParams, scenario=params.get('waste') ?? 'review';
const appMode=params.has('app');
const base = {id:importId,ownerId:actor,status:scenario==='blank'?'draft':scenario==='processing'?'processing':scenario==='error'?'error':scenario==='posted'?'posted':'review',revision:1,openingSessionId:current,createdAt:'2026-01-03T12:00:00Z',postedAt:scenario==='posted'?'2026-01-03T13:00:00Z':null,error:scenario==='error'?'Photo could not be read. Retry reading.':null,warnings:scenario==='warning'?['Photo 2 has no readable entries. Check the source photos and add missing items.']:[],warningsAcknowledged:false,pages:scenario==='blank'?[]:[{id:pageId,pageNumber:1,contentType:'image/jpeg',sizeBytes:100,imageUrl:'/mock/page'}],lines:scenario==='blank'?[]:[line()]};
if(scenario==='prepared') base.lines=[line(12,{targetType:'recipe',skuId:null,recipeId:recipe,quantity:.8,unitText:'portion',itemText:'Sample Prepared Pizza',rawText:'Sample Prepared Pizza .8 portion',candidateRecipeIds:[recipe],issues:['Choose one preparation / size.']})];
if(scenario==='unmatched') base.lines=[line(12,{targetType:null,skuId:null,quantity:.8,unitText:'bag',issues:['Choose an item.']})];
const injected=window.wasteQaFixture ?? {}, store=new Map((injected.imports ?? (scenario==='new'?[]:[base])).map(log=>[log.id,copy(log)]));
const qa=window.wasteQa={ids:{actor,current,closed,importId,pageId,sauce,recipe,id},catalog:copy(catalog),calls:[],store,holds:new Map(),faults:{},countFood:0,home:0,expired:0,costPerUnit:200,pollResult:null,
  hold(key){let release;const promise=new Promise(r=>release=r);this.holds.set(key,{promise,release});},release(key){this.holds.get(key)?.release();this.holds.delete(key);},snapshot(){return {imports:[...store.values()].map(copy)};},setReview(id=importId,rows=[line()]){const log=store.get(id);log.status='review';log.revision++;log.lines=copy(rows);},line};
qa.countDraft=appMode&&!params.has('emptycount')?{id:id(500),isFullCount:true,section:'food',startedAt:'2026-01-02T12:00:00Z',linesHash:'synthetic-hash',batchesHash:'synthetic-batches',lines:[{skuId:sauce,zoneId:id(501),qtyUnits:3,source:'grid',enteredCases:null,caseSizeAtEntry:6,enteredPacks:null,packSizeAtEntry:null,rawUtterance:null}],batches:[]}:null;
const json=(value,status=200)=>new Response(JSON.stringify(copy(value)),{status,headers:{'Content-Type':'application/json'}});
const summarize=(openingSessionId,log)=>{const included=(log?.lines??[line()]).filter(l=>l.decision==='include'),unvaluedCount=included.filter(l=>l.valueCents==null).length,valuedCents=included.reduce((sum,l)=>sum+(l.valueCents??0),0),isClosed=openingSessionId===closed;return {openingSessionId,closingSessionId:isClosed?current:null,start:null,end:isClosed?'2026-01-02T12:00:00Z':null,valuedCents,totalCents:unvaluedCount?null:valuedCents,unvaluedCount,lineCount:included.length,wastePct:isClosed&&!unvaluedCount?valuedCents/100: null,salesCents:isClosed?10000:null,salesStatus:openingSessionId==null?'no_baseline':isClosed?'ready':'awaiting_closing_count',valuation:'reviewed_post_time_estimate',basis:{}};};
function preview(log,body) {log.openingSessionId=body.openingSessionId;log.warningsAcknowledged=body.warningsAcknowledged;log.lines=body.lines.map((value,i)=>{
  const old=log.lines.find(l=>l.id===value.id)??line(30+i,{id:value.id,pageId:value.manualSource?.pageId??null,rawText:value.manualSource?.rawText??'',itemText:value.manualSource?.rawText??''});
  const next={...old,...value};delete next.manualSource;next.issues=[];
  if(next.decision==='include') {if(next.quantity==null||next.quantity<=0)next.issues.push('Enter a positive quantity.');if(!next.targetType)next.issues.push('Choose an item.');const chosen=catalog.items.find(s=>s.id===next.skuId),chosenRecipe=catalog.recipes.find(r=>r.id===next.recipeId);
    const factor=next.targetType==='recipe'?['portion','each'].includes(next.unitText)?1:null:chosen?.countDefinition.spokenUnits[next.unitText]??null;
    if(factor==null)next.issues.push('Choose a supported unit.');
    if(chosenRecipe?.requiredVariant&&next.optionRecipeIds.filter(id=>chosenRecipe.options.some(o=>o.id===id&&o.kind==='variant')).length!==1)next.issues.push('Choose one preparation / size.');
    if(next.duplicateLineIds.length&&!next.duplicateDecision)next.issues.push('Review this repeated entry.');
    if(next.occurredDate==='2025-12-01')next.issues.push('The source date is outside the selected period.');
    next.valueCents=qa.faults.unpriced?null:factor==null||next.quantity==null?null:Math.round(next.quantity*factor*qa.costPerUnit);
    next.ingredients=next.valueCents==null?[]:[{skuId:chosen?.id??sauce,name:chosen?.name??'Sample pizza ingredients',quantity:(next.quantity??0)*(factor??1),countUnit:chosen?.countUnit??'each',unitLabel:chosen?.countDefinition.unitLabel??'can',costPerCountUnit:qa.costPerUnit/100,valueCents:next.valueCents}];
  }else{next.valueCents=0;next.ingredients=[];}return next;});log.revision++;return log;}
window.fetch=async(url,init={})=>{const u=new URL(url,location.href),path=u.pathname.replace(/^\/mock/,''),method=init.method??'GET',body=typeof init.body==='string'?JSON.parse(init.body):null;qa.calls.push({path,method,body});
  const action=path.split('/').at(-1);if(qa.holds.has(action))await qa.holds.get(action).promise;
  if(qa.faults[action]) {const failure=qa.faults[action];if(failure.once)delete qa.faults[action];if(failure.throw)throw new Error('Synthetic network loss');return json(failure.body??{error:'synthetic_failure'},failure.status??500);}
  if(path==='/admin/bar/me'){if(params.has('login')&&!qa.loggedIn)return json({error:'not_authenticated'},401);return json({actor:{id:actor,displayName:'Synthetic staff',permissions:['bar.read','bar.count']}});}
  if(path==='/admin/bar/pin-login'){qa.loggedIn=true;return json({actor:{id:actor,displayName:'Synthetic staff',permissions:['bar.read','bar.count']}});}
  if(path==='/admin/bar/logout'){qa.loggedIn=false;return json({ok:true});}
  if(path==='/admin/bar/food-questions')return json({batches:[],waiting:0});
  if(path==='/admin/bar/catalog')return json({items:catalog.items.map(s=>({...s,section:u.searchParams.get('section')??'bar',category:'Synthetic',sizeMl:null,trackingMode:'stock_count',wacCost:null}))});
  if(path==='/admin/bar/zones')return json({zones:[{id:id(501),name:'Sample Kitchen',walkOrder:1,memberSkuIds:catalog.items.map(s=>s.id)},{id:id(502),name:'Sample Cooler',walkOrder:2,memberSkuIds:catalog.items.map(s=>s.id)}]});
  if(path==='/admin/bar/batches')return json({batches:[]});
  if(path==='/admin/bar/counts/open')return json({session:qa.countDraft?{...qa.countDraft,section:u.searchParams.get('section')??'bar'}:null});
  if(path==='/admin/bar/counts'&&method==='POST'){qa.countDraft={id:id(600),isFullCount:body.isFullCount,section:body.section,startedAt:'2026-01-03T12:00:00Z',lines:[],batches:[],linesHash:'empty',batchesHash:'empty'};return json({sessionId:qa.countDraft.id});}
  if(path.match(/^\/admin\/bar\/counts\/[^/]+\/lines$/)&&method==='PUT'){qa.countDraft.lines=copy(body.lines);return json({linesHash:'saved'});}
  if(path.match(/^\/admin\/bar\/counts\/[^/]+\/batches$/)&&method==='PUT')return json({batchesHash:'saved-batches'});
  if(path.startsWith('/admin/bar/counts/'))return json({session:qa.countDraft});
  if(path==='/admin/bar/food-waste/catalog')return json(catalog);
  if(path==='/admin/bar/food-waste/periods')return json({periods});
  if(path==='/admin/bar/food-waste/summary') {const opening=u.searchParams.get('openingSessionId');return json({...summarize(opening,[...store.values()].find(l=>l.openingSessionId===opening)),...qa.summaryOverride});}
  if(path==='/admin/bar/food-waste/imports'&&method==='GET')return json({imports:[...store.values()].map(l=>({id:l.id,ownerId:l.ownerId,status:l.status,revision:l.revision,createdAt:l.createdAt,postedAt:l.postedAt,openingSessionId:l.openingSessionId,pageCount:l.pages.length,lineCount:l.lines.length}))});
  if(path==='/admin/bar/food-waste/imports'&&method==='POST'){const existing=[...store.values()].find(l=>l.requestId===body.requestId);if(existing)return json(existing);const log={...copy(base),id:id(100+store.size),status:'draft',pages:[],lines:[],openingSessionId:body.openingSessionId,requestId:body.requestId};store.set(log.id,log);return json(log);}
  const match=path.match(/^\/admin\/bar\/food-waste\/imports\/([^/]+)(?:\/(.*))?$/);if(match){const log=store.get(match[1]),tail=match[2];if(!log)return json({error:'not_found'},404);
    if(!tail){if(qa.pollResult&&['queued','processing'].includes(log.status)){Object.assign(log,copy(qa.pollResult));qa.pollResult=null;}return json({...log,...['posted','void'].includes(log.status)?{summary:summarize(log.openingSessionId,log)}:{}});}
    if(tail==='pages'&&method==='POST'){if(log.pages.some(p=>p.data===body.data))return json({error:'duplicate_photo',existingImportId:log.id},409);log.pages.push({id:id(200+log.pages.length),pageNumber:log.pages.length+1,contentType:body.contentType,sizeBytes:100,imageUrl:'/mock/page',data:body.data});log.revision++;if(qa.loseUpload){qa.loseUpload=false;throw new Error('Uploaded then response lost');}return json(log);}
    if(tail.startsWith('pages/')&&method==='DELETE'){log.pages=log.pages.filter(p=>p.id!==tail.split('/')[1]);log.revision++;return json(log);}
    if(tail==='extract'){log.status='queued';log.error=null;log.revision++;return json(log);}
    if(tail==='review'){if(body.expectedRevision!==log.revision)return json({error:'stale_review'},409);return json(preview(log,body));}
    if(tail==='post'){if(qa.postBasisChanged){qa.postBasisChanged=false;qa.costPerUnit=300;return json({error:'basis_changed',preview:{lines:log.lines.map(l=>({...l,valueCents:600}))}},409);}if(log.status==='posted'&&log.postRequest===body.requestId)return json({...log,summary:summarize(log.openingSessionId,log)});if(!log.warningsAcknowledged||log.lines.some(l=>l.decision==='include'&&l.issues.length))return json({error:'review_required'},409);log.status='posted';log.postedAt='2026-01-03T13:00:00Z';log.postRequest=body.requestId;log.revision++;if(qa.losePost){qa.losePost=false;throw new Error('Posted then response lost');}return json({...log,summary:summarize(log.openingSessionId,log)});}
    if(tail==='void'){log.status='void';log.revision++;if(qa.loseVoid){qa.loseVoid=false;throw new Error('Voided then response lost');}return json({...log,summary:summarize(log.openingSessionId,{...log,lines:[]})});}
  }
  if(path==='/admin/bar/invoice-pages')return json({pageKey:'synthetic-invoice-page'});
  if(path==='/admin/bar/invoices')return json({invoiceId:'synthetic-invoice'});
  throw new Error('QA blocked unexpected request '+method+' '+path);
};
window.documentPhotoQa={...documentPhoto,uploadInvoice};
const root=createRoot(document.getElementById('root'));
// Capture the synthetic query before the real app consumes its deep-link URL.
if(appMode)void import('qa:liquor-app').then(({default:LiquorApp})=>root.render(<LiquorApp/>));
else root.render(<div className="lq-app"><header className="lq-header"><span className="lq-header-title">COGS</span><span className="lq-actor">Synthetic staff</span></header><main className="lq-main"><FoodWaste actorId={actor} canCount={!params.has('readonly')} canManage={params.has('manager')} onDone={()=>qa.home++} onCountFood={()=>qa.countFood++} onLoginExpired={()=>qa.expired++}/></main></div>);
