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
if(mode==='unmatched') {line.lineType='product';line.needsReview=true;invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
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
if(mode==='deposit-info'||mode==='mixed-deposit') {
  invoice.reviewNotes=[];
  if(mode==='deposit-info') invoice.status='extracted';
  else {line.annotation='Crossed off, not delivered';line.reviewAnnotation=line.annotation;}
  detail.lines.push({...line,id:'test-deposit',lineType:'deposit',rawDescription:'Keg deposits',qtyUnits:'2',
    unitCost:'20',extendedAmount:'40',annotation:'2 empties returned, credit $40',reviewAnnotation:null});
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
window.fetch=async(url,options={})=>{
  const path=new URL(url,location.href).pathname;
  audit.push(`${options.method||'GET'} ${path} ${options.body||''}`);
  const log=document.getElementById('audit');if(log)log.textContent=audit.join('\n');
  if(path.endsWith('/catalog'))return json({items:[]});
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
