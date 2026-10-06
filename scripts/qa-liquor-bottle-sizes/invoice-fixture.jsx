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
if(mode==='unmatched'||mode==='food'||mode==='linked'||mode==='linked-stale'||mode==='catalog-fail') {line.lineType='product';line.needsReview=true;invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
if(mode==='marked'||mode==='refresh-failure') {line.annotation='One keg short';invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
if(mode==='duplicate') invoice.duplicateOf='ORIGINAL-DEMO';
if(mode==='clean-duplicate') { invoice.duplicateOf='ORIGINAL-DEMO'; invoice.reviewNotes=[]; invoice.handwrittenNotes=[]; }
if(mode==='totals') {invoice.extractedTotal='170';invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
if(mode==='old-flag') {invoice.reviewNotes=[];invoice.handwrittenNotes=['Signature present on signature line'];}
if(mode==='confirmed') invoice.status='confirmed';
if(mode==='escaped') {invoice.reviewNotes=['<img src=x onerror="alert(1)">'];invoice.handwrittenNotes=invoice.reviewNotes;}
if(mode==='old-api') {delete invoice.reviewNotes;delete invoice.handwrittenNotes;delete invoice.duplicateOf;}
// Bought after it was discontinued (tprs 0196): a question, not a hold.
if(mode==='discontinued') {
  invoice.status='extracted';invoice.reviewNotes=[];invoice.handwrittenNotes=[];
  Object.assign(line,{lineType:'product',matchedSkuId:'patty2',matchedName:'Beef Patty, 2oz',matchedCountUnit:'pack',reviewReasons:[],
    discontinued:{since:'2026-10-01T05:00:00.000Z',replacedBySkuId:'patty35',replacementName:'Beef Patty, 3.5oz'}});
}
const automatic = mode.startsWith('automatic') || mode.startsWith('clarity') ? [{id:'auto-1',name:'Example freezer packs',skuId:'demo',lineId:'ready-1',token:'a'.repeat(64),
  status:'active',unitsPerCase:4,countUnit:'pack',unitLabel:'pack',costPerUnit:20,sourcePack:4,sourceSize:'4 LB',defaultSpokenUnit:'case',canCorrect:true,definitionEditable:true,correction:null}] : [];
if (mode.startsWith('automatic')) {invoice.status='extracted';invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
const detail = {invoice,lines:[line],images:mode==='no-image'?[]:[{id:'test-page',pageNumber:1,contentType:mode==='text-receipt'?'text/plain':'image/jpeg'}],
  buckets:{byBucket:{beer_draft:{matched:0,vendorItem:0,estimated:140}},nonGoods:40,
    unattributed:0,matchedDollars:0,residualDollars:140,residualBasis:'vendor_mix',mixVendor:'Example Brewery',mixInvoices:8,
    warnings:[],totalBasis:'grand_total',needsAttention:{unresolved:[{lineId:line.id,description:line.rawDescription,amount:'140'}],supplierOnly:[],disagreement:[]}}};
if (['failed-empty','retry-protected','failed-no-image'].includes(mode)) {
  detail.lines=[]; invoice.reviewNotes=[]; invoice.handwrittenNotes=[];
  if (mode === 'failed-no-image') detail.images=[];
}
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
if (mode.startsWith('clarity')) {
  invoice.status='extracted'; invoice.vendorText='Example Food Supplier'; invoice.reviewNotes=[]; invoice.handwrittenNotes=[];
  Object.assign(line,{lineType:'product',vendorCode:'DEMO-CAN',rawDescription:'VENDOR ABBREV SODA',matchedName:'Example sparkling drink',
    matchedSkuId:'demo-can',matchedCountUnit:'each',needsReview:false,reviewReasons:[],pack:24,sizeText:'8 OZ',qtyCases:'1',qtyUnits:'1',
    unitCost:'48',extendedAmount:'48',canRememberUnit:true,packageKey:'24|8OZ|',costHoldReason:'case vs each'});
  catalog.push({id:'demo-can',name:line.matchedName,section:'bar',countUnit:'each',unitsPerCase:24,
    countDefinition:mode==='clarity-unknown-unit'?null:{countUnit:mode==='clarity-stale-unit'?'pack':'each',unitsPerCase:24,unitLabel:'can',spokenUnits:{can:1,case:24},defaultSpokenUnit:'can',confirmedBy:'test',confirmedAt:'2026-09-01'}});
  if(mode==='clarity') {
    detail.lines.push({...line,id:'test-biscuit',matchedSkuId:'demo-biscuit',matchedName:'Example biscuit cans',rawDescription:'VENDOR BSC DOUGH',
      pack:24,sizeText:'10 CT',unitCost:'20',extendedAmount:'20',packageKey:'24|10CT|'});
    catalog.push({id:'demo-biscuit',name:'Example biscuit cans',section:'food',countUnit:'each',unitsPerCase:10,
      countDefinition:{countUnit:'each',unitsPerCase:10,unitLabel:'can',spokenUnits:{can:1,case:10},defaultSpokenUnit:'case',confirmedBy:'test',confirmedAt:'2026-09-01'}});
  }
  detail.lines.unshift({...line,id:'ready-1',matchedName:'Already handled product',costHoldReason:null,canRememberUnit:false});
}
if(mode.startsWith('explain') || mode==='deposit-auto') {
  detail.explanationToken='a'.repeat(64);
  detail.lines.push({...line,id:'test-deposit',lineType:'deposit',rawDescription:'Keg deposits',qtyUnits:'2',unitCost:'20',extendedAmount:'40'});
  if(mode==='deposit-auto' || mode==='explain-remaining') {
    invoice.printedTotal=invoice.extractedTotal='140';invoice.status='extracted';invoice.reviewNotes=[];
    detail.depositResolution={id:'deposit-action',source:'automatic',original_total:'180.00',credit:'40.00',total:'140.00',remaining_questions:false};
    detail.lines.push({...line,id:'credit',lineType:'deposit',rawDescription:'Empty-keg deposit return',sizeText:null,qtyUnits:'1',unitCost:'-40',extendedAmount:'-40'});
    if(mode==='explain-remaining') {
      invoice.status='flagged';invoice.reviewNotes=['Empty keg returned; one full keg missing'];
      detail.depositResolution.source='staff';detail.depositResolution.remaining_questions=true;
    }
  }
}
if(mode==='linked-auto') {
  invoice.duplicateOf='DEMO-1'; invoice.landedOf='test-original';invoice.reviewNotes=[];
  detail.copyReviews=[{originalId:'test-original',copyId:'test-invoice',invoiceNumber:'DEMO-1',
    expected:{id:'test-original',source:'email',printedTotal:'140.00'},delivered:{id:'test-invoice',source:'scan',printedTotal:'180.00'},
    reviewHash:'a'.repeat(64),reviewed:false,automaticallyReconciled:true,ready:true,differenceCount:0,feeDifference:0,reasons:[],
    rows:[{code:'111',description:'Example spirit',originalLineIds:['original-line'],issues:[],information:['The supplier final already removes this shortage.'],
      expected:{quantity:0,cases:null,amount:'0.00',packages:['6 x 1L']},delivered:{quantity:0,cases:null,amount:'0.00',packages:['6 x 1L']},sourceDelivered:{quantity:2,amount:'40.00'}}]}];
}
if(mode==='linked-agree' || mode==='linked-question') {
  invoice.duplicateOf='DEMO-1'; invoice.landedOf='test-original';invoice.reviewNotes=[];invoice.handwrittenNotes=[];
  detail.copyReviews=[{originalId:'test-original',copyId:'test-invoice',invoiceNumber:'DEMO-1',
    expected:{id:'test-original',source:'email',printedTotal:'180.00'},delivered:{id:'test-invoice',source:'scan',printedTotal:'180.00'},
    reviewHash:'a'.repeat(64),reviewed:false,automaticallyReconciled:mode==='linked-agree',automaticBasis:mode==='linked-agree'?'matching_copies':null,
    ready:true,differenceCount:0,feeDifference:0,reasons:[],readingIncomplete:mode==='linked-question',
    questions:mode==='linked-question'?["The scan's saved lines do not reconcile to its printed total. Check that every page and charge was read before treating missing rows as a delivery shortage."]:[],
    rows:[{code:'DEMO-123',description:'Example freezer item',originalLineIds:['original-line'],issues:[],
      expected:{quantity:2,cases:2,amount:'180.00',packages:['4 × 5LB']},delivered:{quantity:2,cases:2,amount:'180.00',packages:['4 × 5LB']}}]}];
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
// 2026-10-06: the list request sat 300 s at the proxy. stall-list* never answers the first list read;
// catalog-fail fails the first item-list read (both sections) and recovers on Try again.
let historyCalls=0, catalogCalls=0;
window.fetch=async(url,options={})=>{
  const path=new URL(url,location.href).pathname;
  audit.push(`${options.method||'GET'} ${path} ${options.body||''}`);
  const log=document.getElementById('audit');if(log)log.textContent=audit.join('\n');
  if(path.endsWith('/catalog')) {
    if(mode==='catalog-fail'&&catalogCalls++<2)return json({error:'catalog unavailable'},500);
    const section=new URL(url,location.href).searchParams.get('section')||'bar';
    return json({items:catalog.filter(item=>item.section===section)});
  }
  if(path.endsWith('/expense')) {line.nonInventory=true;line.needsReview=false;line.reviewReasons=[];return json({resolved:true});}
  if(path.endsWith('/remember-unit')) {
    if(mode==='remember-failure')return json({error:'unit_changed'},409);
    const target=detail.lines.find(l=>path.includes('/'+l.id+'/')) || line;
    target.costHoldReason=null;return json({resolved:true});
  }
  if(path.endsWith('/copy-review')) {
    if(mode==='linked-stale') return json({error:'comparison_changed'},409);
    detail.copyReviews[0].reviewed=true; return json({ok:true});
  }
  if(path.endsWith('/automatic-answers')) return json({answers:automatic});
  if(path.endsWith('/automatic-answers/auto-1/correct')) {
    if(mode==='automatic-stale')return json({error:'answer_changed'},409);
    const body=JSON.parse(options.body),result={unitsPerCase:body.unitsPerCase,countUnit:'pack',currentCost:10,previousCost:20,
      costCorrected:true,costInvoiceId:'test-invoice',currentCostSource:'invoice_auto',countingDefinitionChanged:true,affectedCounts:[
        // A food count whose cost estimate used this answer's price, and one with no price at all (TPRS #338).
        {id:'count-stale',status:'submitted',started_at:'2026-09-01T12:00:00Z',old_cases:'0',has_unpriced_lines:false,stale_estimate:true},
        {id:'count-unpriced',status:'submitted',started_at:'2026-09-02T12:00:00Z',old_cases:'0',has_unpriced_lines:true,stale_estimate:false}]};
    automatic[0]={...automatic[0],status:'corrected',canCorrect:true,unitsPerCase:body.unitsPerCase,
      costPerUnit:80/body.unitsPerCase,token:'b'.repeat(64),correction:result};
    return json({resolved:true,result});
  }
  if(path.endsWith('/explanation')) {
    if(mode==='explain-stale')return json({error:'invoice_changed'},409);
    if(mode==='explain-question')return json({error:'answer_needs_detail',question:'What is the deposit credit and revised amount due?'},422);
    const body=JSON.parse(options.body),credit=body.text.includes('$20')?20:40,total=180-credit;
    invoice.printedTotal=invoice.extractedTotal=total.toFixed(2);invoice.status='extracted';invoice.reviewNotes=[];
    detail.depositResolution={id:'deposit-action',source:'staff',explanation:body.text,original_total:'180.00',credit:credit.toFixed(2),total:total.toFixed(2),remaining_questions:false};
    detail.explanationToken=(credit===20?'c':'b').repeat(64);
    detail.lines=detail.lines.filter(l=>l.id!=='credit');
    detail.lines.push({...line,id:'credit',lineType:'deposit',rawDescription:'Empty-keg deposit return',sizeText:null,qtyUnits:'1',unitCost:String(-credit),extendedAmount:String(-credit)});
    return json({applied:true,result:detail.depositResolution});
  }
  if(/\/skus\/[^/]+\/discontinued$/.test(path)) {line.discontinued=null;return json({active:true,name:line.matchedName,discontinuedAt:null,replacedBySkuId:null});}
  if(path.endsWith('/match')||path.endsWith('/new-sku')) {
    const body=JSON.parse(options.body); line.needsReview=false;line.discontinued=null;line.matchedName=body.name||catalog.find(s=>s.id===body.skuId)?.name;
    line.costHoldReason='possible unit mismatch';line.matchedCountUnit='pack';line.matchedSkuId=body.skuId||'new';
    return json({matchedName:line.matchedName,matchedSkuId:body.skuId||'new',skuId:body.skuId||'new',invoiceConfirmed:false,costHeld:'possible unit mismatch',matchedCountUnit:'pack',countUnit:body.countUnit});
  }
  if(path.endsWith('/invoices/history')&&mode.startsWith('stall-list')&&historyCalls++===0)return new Promise(()=>{});
  if(path.endsWith('/invoices/history'))return json({invoices:[
    ...(mode==='clarity'?[{...invoice,id:'ready-newer',status:'extracted',vendorText:'Example ready invoice',needsAttention:false}]:[]),
    {...invoice,heldCount:detail.lines.filter(l=>l.costHoldReason).length,reviewCount:detail.lines.filter(l=>l.needsReview).length},
    ...(mode==='clarity'?[{...invoice,id:'completed-copy',status:'flagged',duplicateOf:'DEMO-COPY',vendorText:'Example completed copy',needsAttention:false}]:[])
  ]});
  if(path.endsWith('/invoices/test-invoice')) {
    if(mode==='refresh-failure'&&line.receivedQty==='0')return json({error:'refresh failed'},500);
    return json(detail);
  }
  if(path.endsWith('/clear-flag')){
    if(mode==='confirm-failure')return json({error:'unknown'},500);
    invoice.status='confirmed';return json({status:'confirmed'});
  }
  if(path.endsWith('/reextract')){if(mode==='retry-protected')return json({error:'saved_invoice_protected'},409);invoice.status='pending';return json({status:'pending'});}
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
  <main className="lq-main"><Invoices onDone={()=>{}} initialInvoiceId={mode==='stall-list-nolink'?null:'test-invoice'} /></main>
  <pre id="audit" />
</div>);
