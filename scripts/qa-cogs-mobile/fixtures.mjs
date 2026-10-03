// Entirely synthetic names, counts and invoices. No credential or production
// data is loaded. This function runs before application JavaScript.
export function installFixtures(){
  const date='2026-10-01T10:00:00Z';
  const sku=(id,name,unitsPerCase,countUnit='each',category='food',sizeMl=null)=>({id,name,unitsPerCase,countUnit,category,sizeMl,trackingMode:'stock_count',wacCost:'12.50'});
  const food=[sku('dough','Pizza Dough, 12 inch par-baked crust',20),sku('pretzel','Pretzel, Giant Bavarian Salted',8),sku('cup','Cup, Clear Plastic 12Oz',24),sku('unknown','Sauce, Buffalo Hot Wing',null),sku('cheddar','Cheese, Shredded Sharp Cheddar',6,'bag'),sku('mozz','Cheese, Shredded Mozzarella',6,'bag')];
  if(location.search.includes('qa=cases'))food.push(sku('cauliflower','Cauliflower Crust',12),sku('flatbread','Flatbread, 4.5"x12"',60));
  const bar=[sku('titos',"Tito's Handmade Vodka",12,'bottle','vodka',1000),sku('casarep','Casamigos Reposado',6,'bottle','tequila',750),sku('casaanejo','Casamigos Añejo',6,'bottle','tequila',750),sku('syrup','Monin Toasted Marshmallow Specialty Syrup',null,'bottle','mixer',750),sku('beer','Coors Light Long Neck',24,'bottle','beer',355)];
  for(const item of bar.filter(s=>['vodka','tequila'].includes(s.category)))item.trackingMode='variance';
  // RecipeBuilder offers variance-tracked ingredients. Keep a long name in
  // that synthetic set so its amount/delete layout is actually exercised.
  bar.find(s=>s.id==='syrup').trackingMode='variance';
  const foodZones=[{id:'freezer',name:'Pizza Freezer',walkOrder:1,memberSkuIds:food.map(s=>s.id)},{id:'cooler',name:'Kitchen Cooler',walkOrder:2,memberSkuIds:['cheddar','mozz']},{id:'dry',name:'Dry Storage',walkOrder:3,memberSkuIds:['cup']}];
  const barZones=[{id:'backbar',name:'Back Bar',walkOrder:1},{id:'stock',name:'Liquor Backstock',walkOrder:2},{id:'prep',name:'Batch Prep',walkOrder:3},{id:'walkin',name:'Walk In Cooler',walkOrder:4}];
  const line=(zoneId,skuId,qtyUnits,enteredCases=null,caseSizeAtEntry=null)=>({zoneId,skuId,qtyUnits:String(qtyUnits),enteredCases,caseSizeAtEntry,enteredPacks:null,packSizeAtEntry:null,source:'grid',rawUtterance:null});
  const qa=window.__cogsQa={nonce:Math.random(),calls:[],unknown:[],voiceMode:'food',authed:true,saved:{},transcript:'five and a half cases of pizza dough, two cases of buffalo sauce, three shredded cheese',fixtures:{food,bar}};
  const openFood={id:'food-draft',section:'food',isFullCount:true,startedAt:date,lines:[line('freezer','dough','110.0000000','5.5000000',20),line('freezer','pretzel','0.0000000')],batches:[]};
  if(location.search.includes('qa=frozen')){food[0].unitsPerCase=24;openFood.lines=[line('freezer','dough','24','2',12)];}
  if(location.search.includes('qa=packs'))openFood.lines=[{...line('freezer','dough','8'),enteredPacks:'1',packSizeAtEntry:6}];
  const openBar={id:'bar-draft',section:'bar',isFullCount:true,startedAt:date,lines:[line('backbar','titos','66.10000000000001','5.5000000',12),line('backbar','casarep','2.30000000000004')],batches:[{zoneId:'prep',batchId:'batch',fullEquivalents:'0.30000000000000004'}]};
  if(location.search.includes('qa=cases'))openFood.lines=[line('freezer','cauliflower','18','1',12),line('freezer','flatbread','30','.5',60)];
  openFood.linesHash='food-lines0';openBar.linesHash='bar-lines0';openBar.batchesHash='bar-batches0';
  qa.drafts={'food-draft':openFood,'bar-draft':openBar,'beer-draft':{id:'beer-draft',section:'bar',isFullCount:false,startedAt:date,lines:location.search.includes('qa=emptybeer')?[]:[line('walkin','beer','132.000000','5.500000',24)],linesHash:'beer-lines0'}};
  qa.hashSeq=0;
  const invoice={id:'invoice-fixture',vendorText:'Synthetic Sysco QA',invoiceNumber:'QA-1002',invoiceDate:'2026-10-01',status:'flagged',printedTotal:'180.15',pageCount:1,createdAt:date,heldCount:1};
  const invoiceLine={id:'cost-line',vendorCode:'QA-111',ourBucket:'food',supplierBucket:'food',supplierDescription:'Food',lineType:'product',rawDescription:'PIZZA DOUGH 12 INCH PARBAKED',sizeText:'1/20CT',qtyUnits:'3.000000',unitCost:'33.38333333',extendedAmount:'100.15',receivedQty:'2.000000',annotation:'Driver marked one case short',needsReview:false,matchedName:'Pizza Dough, 12 inch par-baked crust',costHoldReason:'Billed by lb, counted by each. Confirm the cost per count unit.',matchedSkuId:'dough',matchedCountUnit:'each'};
  const findings=[{kind:'zone_members_uncounted',skuId:'cup',name:'Cup, Clear Plastic 12Oz',zoneId:'freezer',zoneName:'Pizza Freezer',counted:null,prior:0,purchased:0,used:null,unitsPerCase:24,dollars:24,detail:'This product is on a shelf you visited, but has no count or zero. Did you skip it, or is it not here anymore?'},{kind:'impossible',skuId:'dough',name:'Pizza Dough, 12 inch par-baked crust',counted:110.00000000000001,prior:20,purchased:20,used:null,unitsPerCase:20,dollars:250,detail:'Counted 110, but prior stock plus deliveries total 40. Recheck the number and case size, or upload a missing delivery invoice.'}];
  const voiceFood=[{spoken:'five and a half cases of pizza dough',cases:5.5,units:0,qty:110,unitsPerCase:20,needsCaseSize:false,suspectPreMultiplied:false,match:{id:'dough',name:food[0].name,sizeMl:null},candidates:[]},{spoken:'two cases of buffalo sauce',cases:2,units:0,qty:0,unitsPerCase:null,needsCaseSize:true,suspectPreMultiplied:false,match:{id:'unknown',name:food[3].name,sizeMl:null},candidates:[]},{spoken:'three shredded cheese',cases:0,units:3,qty:3,unitsPerCase:6,needsCaseSize:false,suspectPreMultiplied:false,match:null,candidates:food.slice(4).map(s=>({id:s.id,name:s.name,sizeMl:null}))}];
  const voiceBar=[{spoken:'five and a half cases of Tito’s',cases:5.5,units:.1,qty:66.1,unitsPerCase:12,needsCaseSize:false,suspectPreMultiplied:false,match:{id:'titos',name:bar[0].name,sizeMl:1000},candidates:[]},{spoken:'two cases of marshmallow syrup',cases:2,units:0,qty:0,unitsPerCase:null,needsCaseSize:true,suspectPreMultiplied:false,match:{id:'syrup',name:bar[3].name,sizeMl:750},candidates:[]},{spoken:'three Casamigos',cases:0,units:3,qty:3,unitsPerCase:6,needsCaseSize:false,suspectPreMultiplied:false,match:null,candidates:bar.slice(1,3).map(s=>({id:s.id,name:s.name,sizeMl:750}))}];
  const reply=data=>Promise.resolve(new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}}));
  window.fetch=(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href),path=url.pathname.replace(/^\/tprs-api/,'').replace(/\/$/,''),method=init.method||'GET';
    if(!url.pathname.startsWith('/tprs-api')){qa.unknown.push({url:url.href,method});return Promise.reject(new Error('QA blocks all non-fixture fetches'));}
    let body=null;try{body=init.body?JSON.parse(init.body):null;}catch{}
    qa.calls.push({path,method,body});
    if(path==='/admin/bar/me')return qa.authed?reply({actor:{id:'qa-manager',displayName:'QA Manager',roleName:'Manager',permissions:['bar.*']}}):Promise.resolve(new Response('{}',{status:401}));
    if(path==='/admin/bar/pin-login'){qa.authed=true;return reply({actor:{id:'qa-manager',displayName:'QA Manager'}});}
    if(path==='/admin/bar/logout'){qa.authed=false;return reply({ok:true});}
    if(path==='/admin/bar/pin-users')return reply({users:[]});
    if(path==='/admin/bar/catalog')return reply({items:url.searchParams.get('section')==='food'?food:bar});
    if(path==='/admin/bar/zones')return reply({zones:url.searchParams.get('section')==='food'?foodZones:barZones});
    if(path==='/admin/bar/batches')return reply({batches:[{id:'batch',name:'Espresso Martini Batch',notes:'Full 1 litre bottle',components:[{skuId:'titos',skuName:bar[0].name,oz:12}]}]});
    if(path==='/admin/bar/counts/open'){qa.voiceMode=url.searchParams.get('section')==='food'?'food':'bar';return reply({session:url.searchParams.get('section')==='food'?openFood:url.searchParams.get('full')==='false'?qa.drafts['beer-draft']:openBar});}
    if(path==='/admin/bar/counts'&&method==='POST')return reply({sessionId:body?.section==='food'?'food-draft':'bar-draft'});
    if(path.endsWith('/lines')&&method==='PUT'){if(qa.failSaves)return Promise.resolve(new Response('{"error":"Synthetic save failure"}',{status:503}));qa.saved[path]=body;const draft=qa.drafts[path.split('/').at(-2)];const linesHash='lines'+(++qa.hashSeq);if(draft){draft.lines=body.lines;draft.linesHash=linesHash;}return reply({linesHash});}
    if(path.endsWith('/batches')&&method==='PUT'){qa.saved[path]=body;const draft=qa.drafts[path.split('/').at(-2)];const batchesHash='batches'+(++qa.hashSeq);if(draft){draft.batches=body.batches;draft.batchesHash=batchesHash;}return reply({batchesHash});}
    if(path.endsWith('/case-size')){const item=[...food,...bar].find(s=>path.includes('/'+s.id+'/'));if(item)item.unitsPerCase=body.unitsPerCase;return reply({unitsPerCase:body.unitsPerCase});}
    if(path.endsWith('/active')||path.endsWith('/zones'))return reply({ok:true,active:false});
    if(path.endsWith('/precheck'))return reply({linesHash:qa.drafts[path.split('/').at(-2)]?.linesHash,batchesHash:qa.drafts[path.split('/').at(-2)]?.batchesHash,baseline:false,findings:qa.findings??(path.includes('food-draft')?findings:findings.map((f,i)=>({...f,skuId:i?'titos':'syrup',name:i?bar[0].name:bar[3].name,zoneId:'backbar',zoneName:'Back Bar',unitsPerCase:i?12:null,counted:i?66.1:null,detail:i?'Counted 66.1 bottles. Previous stock and deliveries total 40. Check the cases and loose bottles, or upload a missing delivery invoice.':'This syrup has no count or zero in Back Bar. Was it missed, or is it no longer here?'}))),retiring:[]});
    if(path.endsWith('/submit')){const draft=qa.drafts[path.split('/').at(-2)];const result={lineCount:draft?.lines.length??4,brandCount:2,totalKegs:2,totalBottles:0,emailed:false};const finish=()=>{if(draft)draft.status='submitted';return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});};return qa.holdSubmit?new Promise(resolve=>{qa.releaseSubmit=()=>resolve(finish());}):Promise.resolve(finish());}
    if(method==='GET'&&/^\/admin\/bar\/counts\/(food-draft|bar-draft|beer-draft)$/.test(path)){const draft=qa.drafts[path.split('/').at(-1)];return reply({session:{...draft,status:draft.status??'draft'},lines:draft.lines});}
    if(path==='/admin/bar/transcribe-audio')return reply({transcript:qa.voiceItems||qa.voiceMode==='food'?qa.transcript:voiceBar.map(i=>i.spoken).join(', ')});
    if(path==='/admin/bar/keg-voice-extract'||path==='/admin/bar/empty-keg-voice-extract')return reply({items:[]});
    if(path==='/admin/bar/voice-extract'){const result={items:qa.voiceItems?(qa.voiceItemsRead?[]:qa.voiceItems):(body.section==='food'?voiceFood:voiceBar).filter(i=>body.transcript.toLowerCase().includes(i.spoken.toLowerCase()))};if(qa.voiceItems)qa.voiceItemsRead=true;return qa.holdVoice?new Promise(resolve=>{(qa.voiceWaiters??=[]).push(()=>resolve(new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}})));qa.releaseVoice=()=>{qa.holdVoice=false;for(const release of qa.voiceWaiters.splice(0))release();};}):reply(result);}
    if(path==='/admin/bar/keg-known')return reply({kegs:[{name:'Allagash White Belgian Witbier',category:'beer'},{name:'Pacifico Clara',category:'beer'}]});
    if(path==='/admin/bar/keg-counts/open')return reply({session:{id:'kegs-draft',startedAt:date,lines:[{kegName:'Allagash White Belgian Witbier',category:'beer',qty:2,source:'grid',rawUtterance:null}]}});
    if(path==='/admin/bar/keg-counts'&&method==='POST')return reply({sessionId:'kegs-draft'});
    if(path==='/admin/bar/empty-kegs/open')return reply({session:{id:'empties-draft',startedAt:date,lines:[{brandId:'allagash',label:'Allagash White Belgian Witbier',brewery:'Allagash',amount:'a_lot',qty:3,source:'grid',rawUtterance:null}]}});
    if(path==='/admin/bar/empty-kegs'&&method==='POST')return reply({sessionId:'empties-draft'});
    if(path==='/admin/bar/keg-brands')return reply({brands:[{id:'allagash',name:'Allagash White Belgian Witbier',brewery:'Allagash',isOnTap:false,lastOnTap:date}],importedAt:date});
    if(path==='/admin/bar/keg-check/submit')return reply({totalKegs:2,brandCount:1,totalBottles:132,emailed:false});
    if(path==='/admin/bar/invoices/history')return reply({invoices:[invoice]});
    if(path==='/admin/bar/invoices/invoice-fixture/automatic-answers')return reply({answers:[]});
    if(path==='/admin/bar/invoices/invoice-fixture')return reply({invoice:{...invoice,extractedTotal:'180.15',printedProductTotal:'170.15'},lines:[invoiceLine,{...invoiceLine,id:'review-line',rawDescription:'CHEESE SHREDDED',needsReview:true,matchedName:null,matchedSkuId:null,costHoldReason:null}],images:[],buckets:{byBucket:{food:{matched:100,vendorItem:20,estimated:10},liquor:{matched:30,vendorItem:0,estimated:0}},unattributed:10,nonGoods:10,matchedDollars:130,residualDollars:40,residualBasis:'vendor_mix',mixVendor:'Sysco',mixInvoices:5,warnings:[],totalBasis:'grand_total',needsAttention:{unresolved:[],supplierOnly:[],disagreement:[]}}});
    if(path==='/admin/bar/counts/history')return reply({counts:[{id:'submitted-fixture',countedBy:'QA Manager',isFullCount:true,startedAt:date,submittedAt:date,lineCount:24}]});
    if(path==='/admin/bar/keg-counts/history')return reply({counts:[]});
    if(path==='/admin/bar/counts/submitted-fixture')return reply({session:{id:'submitted-fixture',status:'submitted',isFullCount:true,note:null,startedAt:date,submittedAt:date,countedBy:'QA Manager'},lines:[{...line('backbar','titos','66.10000000000001','5.50000000',12),zoneName:'Back Bar',skuName:bar[0].name,sizeMl:1000}]});
    if(path.endsWith('/variance'))return reply({priorSessionId:'prior-fixture',periodStart:date,periodEnd:date,gradePct:'85.5555555555',missingCost:'1.20',status:'draft',report:{gradePct:85.5555555555,totals:{usedOz:8.3333333333,soldOz:8.0333333333,lossOz:.30000000000004,missingCost:1.2,underpourCredit:0,cleanLines:1,flaggedLines:0},lines:[{skuId:'titos',name:bar[0].name,sizeMl:1000,startOz:10,purchasedOz:0,endOz:1.66666666667,usedOz:8.3333333333,soldOz:8.0333333333,lossOz:.30000000000004,costPerOz:.6,missingCost:1.2,gradePct:96.44444444,flags:[],cleanForRollup:true}],caveats:[]}});
    if(path==='/admin/bar/price-watch')return reply({movers:[{skuId:'titos',name:bar[0].name,sizeMl:1000,oldPpo:.5,newPpo:.666666666666,oldCost:12,newCost:15,pct:33.33333333,oldAt:date,newAt:date}]});
    if(path==='/admin/bar/pour-costs')return reply({ceiling:19,rows:[{productId:'drink',name:'Toasted Marshmallow Espresso Martini',priceUsd:14,costUsd:3,pourCostPct:21.42857142857,overCeiling:true,incomplete:false,components:[{skuName:bar[0].name,oz:1.33333333333,costUsd:3}]}]});
    if(path==='/admin/bar/recipe-gaps')return reply({pours:[{alertKey:'pour',label:'House Vodka 1.5 oz',bottleText:'House Vodka',oz:1.5,count:12,products:[],detectedAt:date}],needsClassify:[{alertKey:'option',productId:'drink',productName:'Espresso Martini',optionLabel:'Toasted Marshmallow Syrup',count:8,netCents:400,detectedAt:date,likelySubstitution:null}],missingRecipes:[{productId:'missing',name:'Toasted Marshmallow Espresso Martini',category:'Cocktails',detectedAt:date}]});
    if(path==='/admin/bar/auto-aliases')return reply({autoAliases:[{id:'alias',alias:'House Vodka',sourceLabel:'House Vodka 1.5 oz',createdAt:date,skuId:'titos',skuName:bar[0].name}]});
    if(path==='/admin/bar/recipe-templates')return reply({matches:[]});
    if(path==='/admin/bar/teacher-group/uploads')return reply({uploads:[]});
    qa.unknown.push({path,method,body});return Promise.resolve(new Response(JSON.stringify({error:'Unimplemented QA fixture '+path}),{status:501}));
  };
  // Fake audio transport drives real recorder/review UI without opening a mic,
  // transcribing audio, invoking an LLM, or requesting an actual permission.
  class FakeRecorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';this.mimeType='audio/webm';}start(){this.state='recording';qa.voiceItemsRead=false;}stop(){this.state='inactive';setTimeout(()=>{this.ondataavailable?.({data:new Blob(['synthetic QA audio'],{type:'audio/webm'})});this.onstop?.();},0);}}
  window.MediaRecorder=FakeRecorder;
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){},addEventListener(){}}],getAudioTracks:()=>[{stop(){},addEventListener(){}}]})},configurable:true});
  window.AudioContext=undefined;window.webkitAudioContext=undefined;
}
