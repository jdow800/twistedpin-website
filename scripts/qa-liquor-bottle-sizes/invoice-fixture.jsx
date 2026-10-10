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
  needsReview:false,matchedName:null,matchedSkuId:null,costHoldReason:null,matchedCountUnit:null,
  countRuleFingerprint:null,matchedActive:true};
if(mode==='unmatched'||mode==='stale-match'||mode==='food'||mode==='linked'||mode==='linked-stale'||mode==='catalog-fail') {line.lineType='product';line.needsReview=true;invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
if(mode==='marked'||mode==='refresh-failure'||mode==='stale-received') {line.annotation='One keg short';invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
if(mode==='duplicate') invoice.duplicateOf='ORIGINAL-DEMO';
if(mode==='clean-duplicate') { invoice.duplicateOf='ORIGINAL-DEMO'; invoice.reviewNotes=[]; invoice.handwrittenNotes=[]; }
if(mode==='totals') {invoice.extractedTotal='170';invoice.reviewNotes=[];invoice.handwrittenNotes=[];}
if(mode==='old-flag') {invoice.reviewNotes=[];invoice.handwrittenNotes=['Signature present on signature line'];}
if(mode==='confirmed') invoice.status='confirmed';
if(mode==='escaped') {invoice.reviewNotes=['<img src=x onerror="alert(1)">'];invoice.handwrittenNotes=invoice.reviewNotes;}
if(mode==='old-api') {delete invoice.reviewNotes;delete invoice.handwrittenNotes;delete invoice.duplicateOf;}
// Bought after it was discontinued (tprs 0196): a question, not a hold.
if(mode==='discontinued'||mode==='stale-discontinued'||mode==='discontinued-archived') {
  invoice.status='extracted';invoice.reviewNotes=[];invoice.handwrittenNotes=[];
  Object.assign(line,{lineType:'product',matchedSkuId:'patty2',matchedName:'Beef Patty, 2oz',matchedCountUnit:'pack',reviewReasons:[],
    discontinued:{since:'2026-10-01T05:00:00.000Z',replacedBySkuId:'patty35',replacementName:'Beef Patty, 3.5oz'},
    // A counter marked it "none left" after the invoice was read.
    matchedActive:mode!=='discontinued-archived'});
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
if(['amount','expense','remember-unit','remember-failure','remember-error','remember-offline','remember-signed-out','remember-refused','remember-source','remember-repeat','remember-server','stale-remember','stale-apply','superseded-apply','recorded-apply'].includes(mode)) {
  invoice.status='extracted';invoice.reviewNotes=[];invoice.handwrittenNotes=[];
  Object.assign(line,{lineType:'product',vendorCode:'DEMO-ITEM',rawDescription:'Example supplies',needsReview:true,
    reviewReasons:['identity'],qtyUnits:'1',qtyCases:'1',pack:2,sizeText:'5LB',unitCost:'50',extendedAmount:'50'});
  if(mode==='amount') Object.assign(line,{matchedSkuId:'demo',matchedName:'Known item',reviewReasons:['amount'],extendedAmount:'54.38'});
  if(mode.startsWith('remember')||mode.startsWith('stale-remember')||mode.endsWith('-apply')) Object.assign(line,{matchedSkuId:'demo',matchedName:'Example food',matchedCountUnit:'pack',needsReview:false,
    reviewReasons:[],costHoldReason:'possible unit mismatch',canRememberUnit:!mode.endsWith('-apply'),packageKey:'2|5LB|'});
}
// Refresh-while-editing (independent review 2026-10-09). One invoice, six lines: a delivery box (no question,
// so it stays put), one with a count already on file, a one-time price hold, a package hold, an unmatched line
// with no Expense button, and an Expense line whose answer re-reads the whole invoice. window.__qaOther changes
// a line the way another person would; the next re-read hands this tab the new state.
if(mode==='refresh-edit') {
  invoice.status='extracted';invoice.reviewNotes=[];invoice.handwrittenNotes=[];
  const matched={...line,lineType:'product',vendorCode:'DEMO-ITEM',needsReview:false,reviewReasons:[],qtyUnits:'1',qtyCases:'1',pack:2,
    sizeText:'5LB',unitCost:'50',extendedAmount:'50',matchedSkuId:'demo',matchedName:'Example food',matchedCountUnit:'pack',
    packageKey:'2|5LB|',countRuleFingerprint:'rule-1',canRememberUnit:false};
  detail.lines=[
    {...matched,id:'price-line',rawDescription:'Example price item',costHoldReason:'possible unit mismatch'},
    {...matched,id:'pack-line',rawDescription:'Example package item',costHoldReason:'possible unit mismatch',canRememberUnit:true},
    {...matched,id:'match-line',rawDescription:'TITOS VODKA',vendorCode:null,matchedSkuId:null,matchedName:null,matchedCountUnit:null,
      packageKey:null,needsReview:true,reviewReasons:['identity']},
    {...matched,id:'expense-line',rawDescription:'Example supplies',vendorCode:'DEMO-SUPPLY',matchedSkuId:null,matchedName:null,
      matchedCountUnit:null,packageKey:null,needsReview:true,reviewReasons:['identity']},
    {...matched,id:'recv-line',rawDescription:'Example delivery item'},
    {...matched,id:'recorded-line',rawDescription:'Example counted item',receivedQty:'1'},
  ];
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
// 2026-10-09 one-number deposit form. Shapes follow production rows (SELECT only): Werk Force INV-004038 (two kegs, one
// "Keg Deposit" line, 2 x 30.000000 = 60.00, printed 270.00) and Phase Three E-7341 (three deposits at 30). Modes:
// kegs-werk[-stale|-error|-question], kegs-phase3, kegs-cents (27.50 rate), kegs-unread (printed total null), kegs-zero (0.00),
// kegs-mixed (two deposit rates), kegs-credit-present (a negative adjustment already on the invoice), kegs-saved (answered).
const KEGS_SERVER_QUESTION="Was this an empty-keg deposit return? Tell us the deposit credit in dollars. For a missing product, use that item's delivery quantity.";
let kegsOriginal=null;
if(mode.startsWith('kegs-')) {
  const mk=(id,name,cost,type='keg')=>({...line,id,lineType:type,rawDescription:name,sizeText:type==='keg'?'1/6 BBL':null,qtyUnits:'1',unitCost:String(cost),extendedAmount:String(cost)});
  const dep=(qty,rate,id='test-deposit',name='Keg Deposit')=>({...mk(id,name,rate,'deposit'),qtyUnits:String(qty),extendedAmount:(qty*rate).toFixed(2)});
  const phase3=mode.startsWith('kegs-phase3'),cents=mode.startsWith('kegs-cents');
  invoice.vendorText=phase3?'Phase Three Brewing Company':'Werk Force Brewing';invoice.invoiceNumber=phase3?'E-7341':'INV-004038';
  invoice.status='flagged';invoice.reviewNotes=invoice.handwrittenNotes=[phase3?'Empty x1 -30':cents?'Empty x1 -27.50':'Empty x2 -60 (written below printed Balance Due $270.00)'];
  detail.explanationToken='a'.repeat(64);
  if(phase3) {detail.lines=[mk('keg-a','Phase Three Keg One',250),mk('keg-b','Phase Three Keg Two',249),dep(3,30)];invoice.printedTotal=invoice.extractedTotal='589.00';}
  else if(cents) {detail.lines=[mk('keg-a','Example Keg One',300),mk('keg-b','Example Keg Two',234.95),dep(2,27.5)];invoice.printedTotal=invoice.extractedTotal='589.95';}
  else {detail.lines=[mk('keg-a','Werk Force Wholesale 1/6bbl Keg Special',125),mk('keg-b','Werk Force Wholesale 1/6bbl Keg Really',85),dep(2,30)];invoice.printedTotal=invoice.extractedTotal='270.00';}
  if(mode==='kegs-unread') {invoice.printedTotal=null;}
  if(mode==='kegs-zero') {invoice.printedTotal='0.00';}
  if(mode==='kegs-mixed') {detail.lines.push(dep(1,25,'test-bottle-deposit','Bottle Deposit'));invoice.printedTotal=invoice.extractedTotal='295.00';}
  if(mode==='kegs-credit-present'||mode==='kegs-saved') {
    detail.lines.push(mk('credit','Empty-keg deposit return',-60,'deposit'));invoice.printedTotal=invoice.extractedTotal='210.00';
    if(mode==='kegs-saved') {
      invoice.status='extracted';invoice.reviewNotes=[];
      detail.depositResolution={id:'deposit-action',source:'staff',explanation:'Returned 2 empty kegs. Deposit credit $60; total due $210.',original_total:'270.00',credit:'60.00',total:'210.00',remaining_questions:false};
    }
  }
  kegsOriginal=Number(mode==='kegs-saved'||mode==='kegs-credit-present'?'270':invoice.printedTotal);
}
if(mode==='linked-auto') {
  invoice.duplicateOf='DEMO-1'; invoice.landedOf='test-original';invoice.reviewNotes=[];
  detail.copyReviews=[{originalId:'test-original',copyId:'test-invoice',invoiceNumber:'DEMO-1',
    expected:{id:'test-original',source:'email',printedTotal:'140.00'},delivered:{id:'test-invoice',source:'scan',printedTotal:'180.00'},
    reviewHash:'a'.repeat(64),reviewed:false,automaticallyReconciled:true,ready:true,differenceCount:0,feeDifference:0,reasons:[],
    rows:[{code:'111',description:'Example spirit',originalLineIds:['original-line'],issues:[],information:['The supplier final already removes this shortage.'],
      expected:{quantity:0,cases:null,amount:'0.00',packages:['6 x 1L']},delivered:{quantity:0,cases:null,amount:'0.00',packages:['6 x 1L']},sourceDelivered:{quantity:2,amount:'40.00'}}]}];
}
const LINKED_RECONCILE="The scan's saved lines do not reconcile to its printed total. Check that every page and charge was read before treating missing rows as a delivery shortage.";
const LINKED_ADJUSTMENT="The scan contains a written adjustment. What does it change on the purchase record?";
if(mode==='linked-agree' || mode==='linked-question') {
  invoice.duplicateOf='DEMO-1'; invoice.landedOf='test-original';invoice.reviewNotes=[];invoice.handwrittenNotes=[];
  detail.copyReviews=[{originalId:'test-original',copyId:'test-invoice',invoiceNumber:'DEMO-1',
    expected:{id:'test-original',source:'email',printedTotal:'180.00'},delivered:{id:'test-invoice',source:'scan',printedTotal:'180.00'},
    reviewHash:'a'.repeat(64),reviewed:false,automaticallyReconciled:mode==='linked-agree',automaticBasis:mode==='linked-agree'?'matching_copies':null,
    ready:true,differenceCount:0,feeDifference:0,reasons:[],readingIncomplete:mode==='linked-question',
    questions:mode==='linked-question'?[LINKED_RECONCILE,LINKED_ADJUSTMENT]:[],
    rows:[{code:'DEMO-123',description:'Example freezer item',originalLineIds:['original-line'],issues:[],
      expected:{quantity:2,cases:2,amount:'180.00',packages:['4 × 5LB']},delivered:{quantity:2,cases:2,amount:'180.00',packages:['4 × 5LB']}}],
    // 2026-10-09: what the server sends for those two questions (tprs copyAsks output, pasted). `text` is the shorter email line; `full` is what this screen must show.
    ...(mode==='linked-question'?{display:{rowLines:{},asks:[
      {kind:'difference',physical:false,text:"The scan's saved lines do not reconcile to its printed total.",full:LINKED_RECONCILE},
      {kind:'difference',physical:true,text:LINKED_ADJUSTMENT,full:LINKED_ADJUSTMENT}]}}:{})}];
}
// 2026-10-09: a scan copy whose items, counts, dollars and charges match the emailed invoice settles itself even when a package
// column reads differently (Sysco 924579399's tiramisu: pack 2 / 4.25LB on the email, 24.25LB on the scan). The row `information` is
// what tprs invoice-copy-review.ts sends for it; `display` carries no ask because there is no question.
if(mode==='linked-units-dollars') {
  invoice.duplicateOf='DEMO-1'; invoice.landedOf='test-original';invoice.reviewNotes=[];invoice.handwrittenNotes=[];
  detail.copyReviews=[{originalId:'test-original',copyId:'test-invoice',invoiceNumber:'DEMO-1',
    expected:{id:'test-original',source:'email',printedTotal:'305.65'},delivered:{id:'test-invoice',source:'scan',printedTotal:'305.65'},
    reviewHash:'a'.repeat(64),reviewed:false,automaticallyReconciled:true,automaticBasis:'matching_units_and_dollars',ready:true,
    differenceCount:0,feeDifference:0,reasons:[],readingIncomplete:false,questions:[],
    rows:[{code:'9615600',description:'TASTEIT DESSERT TIRAMISU TRAY FROZEN 3887',originalLineIds:['original-line'],issues:[],
      information:['Package columns differ (email 2 × 4.25LB; scan 24.25LB). Item, billed count and dollars agree, so no answer is needed. The emailed invoice governs packages and prices.'],
      expected:{quantity:3,cases:3,amount:'298.17',packages:['2 × 4.25LB']},delivered:{quantity:3,cases:3,amount:'298.17',packages:['? × 24.25LB']}}],
    display:{asks:[],rowLines:{}}}];
}
// 2026-10-09: the server now sends `display` (wording built from the compared fields). linked-case-column is the Breakthru keg:
// both copies bill 1 at $180.00 and only the case column differs. linked-pack-gap is Sysco's tiramisu, whose scan ran pack and size together.
if(mode==='linked-case-column' || mode==='linked-pack-gap') {
  invoice.duplicateOf='DEMO-1'; invoice.landedOf='test-original';invoice.reviewNotes=[];invoice.handwrittenNotes=[];
  const caseColumn=mode==='linked-case-column';
  const row=caseColumn
    ? {code:'9789181',description:'SHADES OF BLUE RIESLING KEG',originalLineIds:['original-line'],
      issues:['Quantities differ. Check what arrived before updating the purchase record.','Pack or size is incomplete; quantities are not a confirmed unit conversion.'],
      expected:{quantity:1,cases:1,amount:'180.00',packages:['? × 19.5L']},delivered:{quantity:1,cases:null,amount:'180.00',packages:['? × 19.5L']}}
    : {code:'9615600',description:'TASTEIT DESSERT TIRAMISU TRAY FROZEN 3887',originalLineIds:['original-line'],issues:[],
      information:['Item code, billed quantity and amount agree. Package columns were combined or incomplete in one reading; this does not confirm a shelf-unit conversion.'],
      expected:{quantity:3,cases:3,amount:'298.17',packages:['2 × 4.25LB']},delivered:{quantity:3,cases:3,amount:'298.17',packages:['? × 24.25LB']}};
  detail.copyReviews=[{originalId:'test-original',copyId:'test-invoice',invoiceNumber:'DEMO-1',
    expected:{id:'test-original',source:'email',printedTotal:'180.00'},delivered:{id:'test-invoice',source:'scan',printedTotal:'180.00'},
    reviewHash:'a'.repeat(64),reviewed:false,automaticallyReconciled:false,automaticBasis:null,ready:true,
    differenceCount:caseColumn?1:0,feeDifference:0,reasons:caseColumn?['1 item comparison(s) need a check.']:[],readingIncomplete:false,
    questions:[caseColumn
      ? 'SHADES OF BLUE RIESLING KEG (supplier item 9789181): Quantities differ. Check what arrived before updating the purchase record. Pack or size is incomplete; quantities are not a confirmed unit conversion. Email: 1 billed, $180.00; scan: 1 billed, $180.00.'
      : 'A supplier item number, quantity, pack or size is missing from the scan. Check that source line.'],
    rows:[row],
    display:caseColumn
      ? {asks:[{kind:'copy',physical:false,text:'Shades of Blue Riesling Keg (9789181): both copies bill 1, $180.00. Case column: email 1, scan blank.'}],
        rowLines:{'9789181':['Both copies bill 1, $180.00.','Case column: email 1, scan blank.']}}
      : {asks:[{kind:'copy',physical:false,text:'Tasteit Dessert Tiramisu Tray Frozen (9615600): email reads 2 x 4.25LB, scan reads 24.25LB. Count and price match.'}],rowLines:{}}}];
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
// 2026-10-06: the list request sat 300 s at the proxy. stall-list* never answers the first list read;
// catalog-fail fails the first item-list read (both sections) and recovers on Try again.
let historyCalls=0, catalogCalls=0;
// The line a request names, and the other-person hook for refresh-edit.
const lineFor=path=>detail.lines.find(l=>path.includes('/'+l.id+'/'))||line;
window.__qaOther=(id,patch)=>Object.assign(detail.lines.find(l=>l.id===id),patch);
window.__qaLine=id=>detail.lines.find(l=>l.id===id);
const sameQty=(a,b)=>(a==null?null:Number(a))===(b==null?null:Number(b));
window.fetch=async(url,options={})=>{
  const path=new URL(url,location.href).pathname;
  audit.push(`${options.method||'GET'} ${path} ${options.body||''}`);
  const log=document.getElementById('audit');if(log)log.textContent=audit.join('\n');
  if(path.endsWith('/catalog')) {
    if(mode==='catalog-fail'&&catalogCalls++<2)return json({error:'catalog unavailable'},500);
    const section=new URL(url,location.href).searchParams.get('section')||'bar';
    return json({items:catalog.filter(item=>item.section===section)});
  }
  if(path.endsWith('/expense')) {const target=lineFor(path);target.nonInventory=true;target.needsReview=false;target.reviewReasons=[];return json({resolved:true});}
  // The three stale checks below mirror the server's (tprs bar.ts apply-cost / received, bar-invoice-answers.ts
  // remember-unit): the answer is refused when the line is no longer what the card was drawn against.
  if(path.endsWith('/apply-cost')) {
    if(mode==='stale-apply')return json({error:'no_hold'},409);
    const target=lineFor(path),body=JSON.parse(options.body);
    if(body.expectedSkuId!==target.matchedSkuId)return json({error:'sku_changed'},409);
    if(!target.costHoldReason)return json({error:'no_hold'},409);
    if(body.expectedCountUnit!==target.matchedCountUnit||body.expectedPackageKey!==(target.packageKey??null))return json({error:'unit_changed'},409);
    // The dated writer (11.94) answers the hold but may leave the current price alone.
    const kept=mode==='superseded-apply'?'superseded_by_current':mode==='recorded-apply'?'already_recorded':null;
    target.costHoldReason=null;return json({skuId:'demo',costPerCountUnit:body.costPerCountUnit,costWritten:!kept,costNotWrittenBecause:kept});
  }
  if(path.endsWith('/remember-unit')) {
    // The real route (tprs admin/bar-invoice-answers.ts) answers almost every refusal with 409 and a reason in the body.
    if(mode==='remember-failure')return json({error:'unit_changed'},409);
    if(mode==='remember-error')return json({error:'unavailable'},500);
    if(mode==='stale-remember')return json({error:'rule_changed'},409);
    if(mode==='remember-source')return json({error:'check_source_first'},409);
    if(mode==='remember-repeat')return json({error:'use_purchase_record'},409);
    if(mode==='remember-signed-out')return json({error:'unauthorized'},401);
    if(mode==='remember-refused')return json({error:'Bad Request'},400);
    if(mode==='remember-server')return json({error:'internal'},500);
    if(mode==='remember-offline')throw new TypeError('Failed to fetch');
    const target=lineFor(path),body=JSON.parse(options.body);
    if(body.expectedSkuId!==target.matchedSkuId||!target.costHoldReason)return json({error:'line_changed'},409);
    if(body.expectedCountUnit!==target.matchedCountUnit||body.expectedPackageKey!==(target.packageKey??null))return json({error:'unit_changed'},409);
    if(body.expectedRuleFingerprint!==(target.countRuleFingerprint??null))return json({error:'rule_changed'},409);
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
    if(mode.startsWith('kegs-')) {
      // A small mirror of the server route (tprs writtenDepositReturn); the real parser is proven in tprs by
      // invoice-deposit-sentence-contract.test.ts against the same sentences. Real answers: {code,error,question}.
      if(mode.endsWith('-stale'))return json({code:409,error:'invoice_changed'},409);
      if(mode.endsWith('-error'))return json({error:'internal'},500);
      const body=JSON.parse(options.body),text=body.text;
      if(mode.endsWith('-question'))return json({code:422,error:'answer_needs_detail',question:'What is the empty-keg deposit credit, and the revised amount due?'},422);
      if(!/(?:\$\s*|-\s*)\d/.test(text))return json({code:422,error:'answer_needs_detail',question:KEGS_SERVER_QUESTION},422);
      const credit=text.match(/deposit credit \$(\d+(?:\.\d{1,2})?)/i),due=text.match(/total due \$(\d+(?:\.\d{1,2})?)/i);
      if(!credit||!due||Math.round(kegsOriginal*100)-Math.round(Number(credit[1])*100)!==Math.round(Number(due[1])*100))
        return json({code:422,error:'answer_needs_detail',question:'What is the empty-keg deposit credit, and the revised amount due?'},422);
      invoice.printedTotal=invoice.extractedTotal=Number(due[1]).toFixed(2);invoice.status='extracted';invoice.reviewNotes=[];
      detail.depositResolution={id:'deposit-action',source:'staff',explanation:text,original_total:kegsOriginal.toFixed(2),credit:Number(credit[1]).toFixed(2),total:Number(due[1]).toFixed(2),remaining_questions:false};
      detail.explanationToken='b'.repeat(64);
      detail.lines=detail.lines.filter(l=>l.id!=='credit');
      detail.lines.push({...line,id:'credit',lineType:'deposit',rawDescription:'Empty-keg deposit return',sizeText:null,qtyUnits:'1',unitCost:`-${Number(credit[1])}`,extendedAmount:`-${Number(credit[1])}`});
      return json({code:200,applied:true,result:detail.depositResolution});
    }
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
  if(/\/skus\/[^/]+\/discontinued$/.test(path)) {if(mode==='stale-discontinued')return json({error:'state_changed'},409);line.discontinued=null;return json({active:true,name:line.matchedName,discontinuedAt:null,replacedBySkuId:null});}
  if(path.endsWith('/match')||path.endsWith('/new-sku')) {
    if(mode==='stale-match')return json({error:'match_changed'},409);
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
    if(mode==='clear-refused')return json({error:'delivery_marks_open'},409);
    invoice.status='confirmed';return json({status:'confirmed'});
  }
  if(path.endsWith('/reextract')){if(mode==='retry-protected')return json({error:'saved_invoice_protected'},409);invoice.status='pending';return json({status:'pending'});}
  if(path.endsWith('/received')){
    const target=lineFor(path),body=JSON.parse(options.body);
    if(mode==='stale-received'||!sameQty(body.expectedReceivedQty,target.receivedQty))return json({error:'received_changed'},409);
    const qty=body.receivedQty;
    target.receivedQty=qty==null?null:String(qty);
    // Fixed responses for the zero-delivered / clear regression, not a cost engine.
    target.receivedAmount=qty===0?'0.00':'140.00';target.shortageAmount=qty===0?'140.00':'0.00';
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
