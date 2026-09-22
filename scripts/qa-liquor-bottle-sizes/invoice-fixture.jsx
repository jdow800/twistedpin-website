import React from 'react';
import {createRoot} from 'react-dom/client';
import Invoices from 'qa:invoices';
import 'qa:styles';

// Fictional data only. Every request, including writes, stays in this fixture.
const mode = new URL(location.href).searchParams.get('mode') || 'credit';
const audit = [];
const notes = ['2x empties -40', '140'];
const invoice = {id:'test-invoice',vendorText:'Example Brewery',invoiceNumber:'DEMO-1',
  invoiceDate:'2026-09-01',createdAt:'2026-09-01',status:'flagged',printedTotal:'180',
  extractedTotal:'180',pageCount:1,handwrittenNotes:notes,reviewNotes:notes,duplicateOf:null};
const line = {id:'test-keg',lineType:'keg',rawDescription:'Example Pale Ale',sizeText:'1/6 BBL',
  qtyUnits:'1',unitCost:'140',extendedAmount:'140',receivedQty:null,annotation:null,
  needsReview:false,matchedName:null,matchedSkuId:null,costHoldReason:null,matchedCountUnit:null};
if(mode==='unmatched'||mode==='food'||mode==='linked'||mode==='linked-stale') {line.lineType='product';line.needsReview=true;invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
if(mode==='marked'||mode==='refresh-failure') {line.annotation='One keg short';invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
if(mode==='duplicate') invoice.duplicateOf='ORIGINAL-DEMO';
if(mode==='totals') {invoice.extractedTotal='170';invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
if(mode==='old-flag') {invoice.reviewNotes=[];invoice.handwrittenNotes=['Signature present on signature line'];}
if(mode==='confirmed') invoice.status='confirmed';
if(mode==='escaped') {invoice.reviewNotes=['<img src=x onerror="alert(1)">'];invoice.handwrittenNotes=invoice.reviewNotes;}
if(mode==='old-api') {delete invoice.reviewNotes;delete invoice.handwrittenNotes;delete invoice.duplicateOf;}
const detail = {invoice,lines:[line],images:mode==='no-image'?[]:[{id:'test-page',pageNumber:1,contentType:'image/jpeg'}],
  buckets:{byBucket:{beer_draft:{matched:0,vendorItem:0,estimated:140}},nonGoods:40,
    unattributed:0,matchedDollars:0,residualDollars:140,residualBasis:'vendor_mix',mixVendor:'Example Brewery',mixInvoices:8,
    warnings:[],totalBasis:'grand_total',needsAttention:{unresolved:[{lineId:line.id,description:line.rawDescription,amount:'140'}],supplierOnly:[],disagreement:[]}}};
if(['amount','expense','remember-unit','remember-failure'].includes(mode)) {
  invoice.status='extracted';invoice.reviewNotes=[];invoice.handwrittenNotes=[];
  Object.assign(line,{lineType:'product',vendorCode:'DEMO-ITEM',rawDescription:'Example supplies',needsReview:true,
    reviewReasons:['identity'],qtyUnits:'1',qtyCases:'1',pack:2,sizeText:'5LB',unitCost:'50',extendedAmount:'50'});
  if(mode==='amount') Object.assign(line,{matchedSkuId:'demo',matchedName:'Known item',reviewReasons:['amount'],extendedAmount:'54.38'});
  if(mode.startsWith('remember')) Object.assign(line,{matchedSkuId:'demo',matchedName:'Example food',matchedCountUnit:'pack',needsReview:false,
    reviewReasons:[],costHoldReason:'possible unit mismatch',canRememberUnit:true,packageKey:'2|5LB|'});
}
if(mode==='deposit-info'||mode==='mixed-deposit') {
  invoice.reviewNotes=[];
  if(mode==='deposit-info') invoice.status='extracted';
  else {line.annotation='Crossed off, not delivered';line.reviewAnnotation=line.annotation;}
  detail.lines.push({...line,id:'test-deposit',lineType:'deposit',rawDescription:'Keg deposits',qtyUnits:'2',
    unitCost:'20',extendedAmount:'40',annotation:'2 empties returned, credit $40',reviewAnnotation:null});
}
if(mode==='food') {
  invoice.status='extracted'; invoice.vendorText='Example Sysco';
  line.rawDescription='SLICED PEPPERONI'; line.sizeText='10LB';
}
if(mode==='linked'||mode==='linked-stale') {
  invoice.duplicateOf='DEMO-1'; invoice.landedOf='test-original';
  detail.copyReviews=[{originalId:'test-original',copyId:'test-invoice',invoiceNumber:'DEMO-1',
    expected:{id:'test-original',source:'email',printedTotal:'57.48'}, delivered:{id:'test-invoice',source:'scan',printedTotal:'57.48'},
    reviewHash:'a'.repeat(64),reviewed:false,ready:true,differenceCount:1,feeDifference:7.48,
    reasons:['Fees, tax or deposits read differently by $7.48. This is not evidence of a product shortage.'],
    rows:[{code:'123',description:'Sliced pepperoni',originalLineIds:['original-pepperoni'],issues:['Pack or size readings differ. Check the source documents.'],
      expected:{quantity:1,cases:1,amount:'50.00',packages:['1 × 10LB']},delivered:{quantity:1,cases:1,amount:'50.00',packages:['1 × 110LB']}}]}];
}
const catalog=[{id:'titos',name:"Tito's Vodka",section:'bar',sizeMl:750,countUnit:'bottle'},
  {id:'pepperoni',name:'Peperoni Sliced',section:'food',sizeMl:null,countUnit:'pack'},
  {id:'sausage',name:'Italian Sausage',section:'food',sizeMl:null,countUnit:'lb'},
  {id:'wings',name:'Chicken Wings Boneless',section:'food',sizeMl:null,countUnit:'case'}];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
window.fetch=async(url,options={})=>{
  const path=new URL(url,location.href).pathname;
  audit.push(`${options.method||'GET'} ${path} ${options.body||''}`);
  const log=document.getElementById('audit');if(log)log.textContent=audit.join('\n');
  if(path.endsWith('/catalog')) {
    const section=new URL(url,location.href).searchParams.get('section')||'bar';
    return json({items:catalog.filter(item=>item.section===section)});
  }
  if(path.endsWith('/expense')) {line.nonInventory=true;line.needsReview=false;line.reviewReasons=[];return json({resolved:true});}
  if(path.endsWith('/remember-unit')) {
    if(mode==='remember-failure')return json({error:'unit_changed'},409);
    line.costHoldReason=null;return json({resolved:true});
  }
  if(path.endsWith('/copy-review')) {
    if(mode==='linked-stale') return json({error:'comparison_changed'},409);
    detail.copyReviews[0].reviewed=true; return json({ok:true});
  }
  if(path.endsWith('/match')||path.endsWith('/new-sku')) {
    const body=JSON.parse(options.body); line.needsReview=false;line.matchedName=body.name||catalog.find(s=>s.id===body.skuId)?.name;
    line.costHoldReason='possible unit mismatch';line.matchedCountUnit='pack';line.matchedSkuId=body.skuId||'new';
    return json({matchedName:line.matchedName,matchedSkuId:body.skuId||'new',skuId:body.skuId||'new',invoiceConfirmed:false,costHeld:'possible unit mismatch',matchedCountUnit:'pack',countUnit:body.countUnit});
  }
  if(path.endsWith('/invoices/history'))return json({invoices:[invoice]});
  if(path.endsWith('/invoices/test-invoice')) {
    if(mode==='refresh-failure'&&line.receivedQty==='0')return json({error:'refresh failed'},500);
    return json(detail);
  }
  if(path.endsWith('/clear-flag')){
    if(mode==='confirm-failure')return json({error:'unknown'},500);
    invoice.status='confirmed';return json({status:'confirmed'});
  }
  if(path.endsWith('/reextract')){invoice.status='pending';return json({status:'pending'});}
  if(path.endsWith('/received')){
    const qty=JSON.parse(options.body).receivedQty;
    line.receivedQty=qty==null?null:String(qty);
    // Fixed responses for the zero-delivered / clear regression, not a cost engine.
    line.receivedAmount=qty===0?'0.00':'140.00';line.shortageAmount=qty===0?'140.00':'0.00';
    detail.buckets.shortageDollars=qty===0?140:0;
    detail.buckets.byBucket.beer_draft.estimated=qty===0?0:140;
    detail.buckets.residualDollars=qty===0?0:140;
    return json({ok:true});
  }
  throw new Error('Unexpected fixture request: '+path);
};
createRoot(document.getElementById('root')).render(<div className="lq-app">
  <main className="lq-main"><Invoices onDone={()=>{}} initialInvoiceId="test-invoice" /></main>
  <pre id="audit" />
</div>);
