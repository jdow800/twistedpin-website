import React from 'react';
import {createRoot} from 'react-dom/client';
import CountFood from 'qa:food';
import 'qa:styles';

// An isolated integration can inject the complete saved catalog/shelf fixture
// before React renders, avoiding a second hardcoded list of kitchen names.
const fixtureOverride = window.foodQaFixture;
const catalog = (fixtureOverride?.catalog ?? [
  {id:'dough', name:'Pizza Dough', countUnit:'pack', unitsPerCase:20},
  {id:'pretzel', name:'Giant Pretzel', countUnit:'pack', unitsPerCase:8},
  {id:'unknown', name:'Unknown Package', countUnit:'pack', unitsPerCase:null},
  {id:'water', name:'Aquafina Water, Bottled', countUnit:'each', unitsPerCase:24,
    countHistory:{maxCount:48,maxDelivery:24,deliverySamples:3,days:90}},
  {id:'circles', name:'Cardboard Pizza Circle 14"', countUnit:'each', unitsPerCase:100},
  {id:'gloves', name:'Glove, Vinyl, Extra Large', countUnit:'case', unitsPerCase:null},
  {id:'rice', name:'Rice, Spanish', countUnit:'pack', unitsPerCase:6},
]).map(s => ({category:'Bakery',sizeMl:null,trackingMode:'stock_count',wacCost:null,...s}));
const zones = fixtureOverride?.zones ?? [
  {id:'freezer', name:'Pizza Freezer', walkOrder:1, memberSkuIds:catalog.map(s => s.id)},
  {id:'cooler', name:'Kitchen Cooler', walkOrder:2, memberSkuIds:catalog.map(s => s.id)},
];
const existing = new URL(location.href).searchParams.has('existing');
const params = new URL(location.href).searchParams;
if (params.has('precision')) {
  const definition = {countUnit:'case',unitsPerCase:null,unitLabel:'case',defaultSpokenUnit:'case',spokenUnits:{case:1,bun:1/192},confirmedBy:'Synthetic precision QA',confirmedAt:'2026-01-01'};
  const slider = {id:'slider',name:'Sample Slider Bun',countUnit:'case',unitsPerCase:null,countDefinition:definition,recipeUnit:'each',recipeYield:192,
    foodUnitRatios:{case:{numerator:'1',denominator:'1'},bun:{numerator:'1',denominator:'192'}},category:'Bakery',sizeMl:null,trackingMode:'stock_count',wacCost:null};
  if (params.has('precision-factor')) {
    slider.countDefinition = {...definition,spokenUnits:{case:1,bun:1/200}};
    slider.foodUnitRatios.bun = {numerator:'1',denominator:'200'};
  }
  catalog.splice(0,catalog.length,slider);
  for (const zone of zones) zone.memberSkuIds = ['slider'];
}
if (params.has('case-breakdown')) {
  const answer = (countUnit,unitsPerCase,unitLabel,defaultSpokenUnit,spokenUnits) => ({countUnit,unitsPerCase,unitLabel,defaultSpokenUnit,spokenUnits,confirmedBy:'QA count definition',confirmedAt:'2026-01-01'});
  const cases = [
    {id:'case-sauce',name:'Sauce, Pizza, Canned',countUnit:'each',unitsPerCase:6,countDefinition:answer('each',6,'can','case',{case:6,can:1,bag:2})},
    {id:'case-beans',name:'Refried Beans',countUnit:'pack',unitsPerCase:6,countDefinition:answer('pack',6,'bag','case',{case:6,bag:1})},
    {id:'case-canonical',name:'Canonical Case Product',countUnit:'case',unitsPerCase:1,countDefinition:answer('case',1,'case','case',{case:1})},
    {id:'case-unknown',name:'Unknown Package',countUnit:'pack',unitsPerCase:null},
    {id:'case-bib',name:'Syrup, Diet Pepsi',countUnit:'bib',unitsPerCase:1,countDefinition:answer('bib',1,'bib','bib',{case:1,bib:1})},
  ].map(s=>({category:'Kitchen',sizeMl:null,trackingMode:'stock_count',wacCost:null,...s}));
  catalog.splice(0,catalog.length,...cases);
  zones[0] = {id:'pizza',name:'Pizza Line',walkOrder:1,memberSkuIds:cases.map(s=>s.id)};
  zones[1].memberSkuIds = cases.map(s=>s.id);
}
// October 6 Beverage Room reproduction: real catalog names/definitions with
// fictional IDs. Keep flavor siblings so a convenient partial match cannot
// make the seven-item transcript appear safe.
if (params.has('bib')) {
  const definition = {countUnit:'bib',unitsPerCase:1,unitLabel:'bib',defaultSpokenUnit:'bib',
    spokenUnits:{bag:1,bib:1,box:1,bibs:1,case:1,'bag in box':1},
    confirmedBy:'QA confirmed BIB definition',confirmedAt:'2026-09-30'};
  const bibs = [
    ['diet-pepsi','Syrup, Diet Pepsi',['Syrup Diet Pepsi']],
    ['pepsi','Syrup, Pepsi Cola',['Syrup Pepsi Cola']],
    ['pink-lemonade','Pink Lemonade, Bib',['Pink Lemonade Bib','Syrup, Lemonade Pink','Syrup Lemonade Pink','Lemonade Pink']],
    ['lemon-lime','Syrup, Lemon Lime',['Syrup Lemon Lime']],
    ['root-beer','Syrup, Root Beer',['Syrup Root Beer']],
    ['dr-pepper','Syrup, Dr. Pepper',['Syrup Dr. Pepper']],
    ['cotton-candy','Cotton Candy',[]],
    ['blue-raspberry','ICEE Blue Raspberry Syrup',[]],
    ['cherry','ICEE Cherry Syrup',[]],
    ['orange','Orange Crush, Bib',['Orange Crush Bib']],
    ['mountain-dew','Syrup, Mountain Dew',['Syrup Mountain Dew']],
  ].map(([id,name,aliases])=>({id,name,aliases,countUnit:'bib',unitsPerCase:1,countDefinition:definition,
    category:'Beverage',sizeMl:null,trackingMode:'stock_count',wacCost:null}));
  catalog.splice(0,catalog.length,...bibs);
  zones[0] = {id:'beverage',name:'Beverage Room',walkOrder:1,memberSkuIds:bibs.map(s=>s.id)};
  zones[1].memberSkuIds = bibs.map(s=>s.id);
}
if (params.has('definitions')) {
  const answer = (countUnit, unitsPerCase, extra = {}) => ({
    countUnit, unitsPerCase, confirmedBy:'QA fixture', confirmedAt:'2026-01-01', ...extra,
  });
  Object.assign(catalog[0], {countUnit:'case',unitsPerCase:1,
    countDefinition:answer('case',1,{usualMaxCases:20}),
    countHistory:{maxCount:1.6,maxDelivery:2,deliverySamples:2,days:90}});
  if (params.has('case-bags')) catalog[0].countDefinition.spokenUnits = {case:1,bag:0.5};
  catalog.push(
    {id:'buns',name:'Sample Buns',countUnit:'each',unitsPerCase:48,
      countDefinition:answer('each',48,{unitLabel:'bun',spokenUnits:{bag:12,bun:1},usualMaxCases:3})},
    {id:'plates',name:'Sample Plates',countUnit:'pack',unitsPerCase:4,
      countDefinition:answer('pack',4,{unitLabel:'bag',spokenUnits:{bag:1}})},
    {id:'fruit',name:'Sample Fruit',countUnit:'each',unitsPerCase:115,
      countDefinition:answer('each',115,{usualMaxCases:4})},
    {id:'fries',name:'Sample Fries',countUnit:'pack',unitsPerCase:6,
      countDefinition:answer('pack',6,{unitLabel:'bag',defaultSpokenUnit:'case',spokenUnits:{case:6,bag:1}})},
    {id:'celery',name:'Sample Celery',countUnit:'each',unitsPerCase:3,
      countDefinition:answer('each',3,{unitLabel:'bunch',defaultSpokenUnit:'case',spokenUnits:{case:3,bag:3},usualMaxCases:4})},
    {id:'romaine',name:'Sample Romaine',countUnit:'each',unitsPerCase:6,
      countDefinition:answer('each',6,{unitLabel:'head',defaultSpokenUnit:'case',spokenUnits:{case:6,bag:6}})},
    {id:'cauliflower',name:'Cauliflower Crust',countUnit:'each',unitsPerCase:12,
      countDefinition:answer('each',12,{unitLabel:'crust',defaultSpokenUnit:'each',spokenUnits:{case:12,each:1,crust:1,piece:1}})},
    {id:'flatbread',name:'Flatbread',countUnit:'each',unitsPerCase:60,
      countDefinition:answer('each',60,{unitLabel:'flatbread',defaultSpokenUnit:'each',spokenUnits:{case:60,each:1,flatbread:1,piece:1}})},
    {id:'cauliflower-heads',name:'Cauliflower',countUnit:'each',unitsPerCase:3,
      countDefinition:answer('each',3,{unitLabel:'head',spokenUnits:{head:1}})},
  );
  if (params.has('changed-package')) catalog.find(s=>s.id==='buns').unitsPerCase=24;
  if (params.has('changed-crust')) catalog.find(s=>s.id==='cauliflower').unitsPerCase=24;
  if (params.has('unknown-crust-case')) Object.assign(catalog.find(s=>s.id==='cauliflower'),{unitsPerCase:null,
    countDefinition:answer('each',null,{unitLabel:'crust',defaultSpokenUnit:'each',spokenUnits:{each:1,crust:1,piece:1}})});
  if (params.has('dimension-flatbread')) catalog.find(s=>s.id==='flatbread').name='Flatbread, 4.5"x12"';
  for(const zone of zones) zone.memberSkuIds=catalog.map(s=>s.id);
}
// History ceilings (2026-10-10): `countHistory.usual` is the most this store
// has plausibly had on hand, in count units. Real names, shapes and ceilings
// from the design table (cookies tier 2: 8 cases; beans tier 1: 2.2 cases),
// fictional ids. ?usual-counted adds this count's earlier shelves.
if (params.has('usual') || params.has('usual-counted')) {
  const answer = (countUnit, unitsPerCase, extra) => ({countUnit, unitsPerCase, confirmedBy:'QA fixture', confirmedAt:'2026-10-10', ...extra});
  const history = usual => ({maxCount:null, maxDelivery:null, deliverySamples:0, days:90, usual:{through:'2026-08-30', ...usual}});
  catalog.push(
    {id:'cookies', name:'Chocolate-Chip Cookies, Individually Wrapped, 1 oz', countUnit:'each', unitsPerCase:144,
      countDefinition:answer('each',144,{unitLabel:'cookie',defaultSpokenUnit:'case',spokenUnits:{case:144,cookie:1}}),
      countHistory:history({ceiling:1152,tier:2,onHandMedianCases:1,onHandMaxCases:1.3,maxDeliveryCases:3,maxBought28Cases:5})},
    {id:'beans', name:'Beans, Refried, Vegetarian', countUnit:'pack', unitsPerCase:6,
      countDefinition:answer('pack',6,{unitLabel:'bag',defaultSpokenUnit:'case',spokenUnits:{case:6,bag:1}}),
      countHistory:history({ceiling:13.2,tier:1,onHandMedianCases:0.8,onHandMaxCases:1.2,maxDeliveryCases:1,maxBought28Cases:3})},
  );
  for (const s of catalog.slice(-2)) Object.assign(s, {category:'Kitchen',sizeMl:null,trackingMode:'stock_count',wacCost:null});
  // ?usual-live: the real 90-day live history beside the ceiling (one 1-case
  // cookie delivery on 10/6), which the old 4x-largest-delivery proxy reads.
  if (params.has('usual-live')) Object.assign(catalog.find(s => s.id === 'cookies').countHistory, {maxDelivery:144, deliverySamples:1});
  // ?usual-dough: Pizza Dough as it really is, counted in cases (20 dough a
  // case, Jon's usual 20 cases) with its tier-1 ceiling of 24.2 cases.
  if (params.has('usual-dough')) Object.assign(catalog[0], {countUnit:'case', unitsPerCase:1,
    countDefinition:answer('case',1,{unitLabel:'case',spokenUnits:{case:1,each:0.05,crust:0.05,dough:0.05,piece:0.05,shell:0.05},usualMaxCases:20}),
    countHistory:history({ceiling:24.2,tier:1,onHandMedianCases:6.9,onHandMaxCases:10.2,maxDeliveryCases:14,maxBought28Cases:41})});
  for (const zone of zones) zone.memberSkuIds = catalog.map(s => s.id);
}
// Package-size question (2026-10-14): Cheese Curds are counted in bags with no
// pound entry ("Cheese curds, three pounds" asks), Pork Carnitas are counted in
// pounds and Fryer Oil in gallons (ounces and quarts need no question).
if (params.has('unit-size')) {
  const answer = (countUnit, unitsPerCase, extra) => ({countUnit, unitsPerCase, confirmedBy:'QA fixture', confirmedAt:'2026-10-14', ...extra});
  catalog.push(
    {id:'curds', name:'Cheese Curds', countUnit:'pack', unitsPerCase:2, countDefinition:answer('pack',2,{unitLabel:'bag',spokenUnits:{case:2,bag:1}})},
    {id:'carnitas', name:'Pork Carnitas', countUnit:'lb', unitsPerCase:null, countDefinition:answer('lb',null,{unitLabel:'lb',spokenUnits:{bag:5,lb:1}})},
    {id:'oil', name:'Fryer Oil', countUnit:'gal', unitsPerCase:null, countDefinition:answer('gal',null,{unitLabel:'gal',spokenUnits:{jug:3,gal:1}})},
    // Taco shells come in bags (the noun is on the name), a Philly flat is counted in a bare each.
    {id:'shells', name:'Taco Shells, Hard', countUnit:'pack', unitsPerCase:6, countDefinition:answer('pack',6,{unitLabel:'bag',spokenUnits:{case:6,bag:1}})},
    {id:'philly', name:'Beef, Philly, Flat, Marinated', countUnit:'each', unitsPerCase:null},
  );
  for (const s of catalog.slice(-5)) Object.assign(s, {category:'Kitchen',sizeMl:null,trackingMode:'stock_count',wacCost:null});
  for (const zone of zones) zone.memberSkuIds = catalog.map(s => s.id);
}
// Walk-In Cooler, 2026-10-15 (the GM's take): the live definitions of the
// products he said, fictional ids. Sauces are counted by the container (one
// gallon jug), cheddar by the 1.5 lb pack (8 a case), Gatorade by the bottle.
// ?walkin-existing: the shelf already holds 2 containers of Garlic Parmesan.
if (params.has('walkin') || params.has('walkin-existing')) {
  const answer = (countUnit, unitsPerCase, extra) => ({countUnit, unitsPerCase, confirmedBy:'QA fixture', confirmedAt:'2026-10-15', ...extra});
  const jug = (unitsPerCase, countUnit = 'pack') => answer(countUnit, unitsPerCase, {unitLabel:'container', defaultSpokenUnit:'container',
    spokenUnits:{gal:1, jug:1, case:unitsPerCase, jugs:1, container:1}});
  catalog.push(
    {id:'garlic-parm', name:'Sauce, Parmesan, Garlic', aliases:['Sauce Parmesan Garlic'], countUnit:'pack', unitsPerCase:2, countDefinition:jug(2)},
    {id:'mayo', name:'Mayonnaise', aliases:[], countUnit:'each', unitsPerCase:4, countDefinition:jug(4, 'each')},
    {id:'chipotle-mayo', name:'Mayonnaise, Chipotle', aliases:['Mayonnaise Chipotle'], countUnit:'pack', unitsPerCase:2, countDefinition:jug(2)},
    {id:'cheddar', name:'Cheese, Cheddar', aliases:['Cheese Cheddar'], countUnit:'pack', unitsPerCase:8,
      countDefinition:answer('pack', 8, {unitLabel:'pack', defaultSpokenUnit:'pack', spokenUnits:{case:8, pack:1}})},
    {id:'american', name:'Cheese, American', aliases:[], countUnit:'pack', unitsPerCase:4,
      countDefinition:answer('pack', 4, {unitLabel:'pack', defaultSpokenUnit:'pack', spokenUnits:{case:4, pack:1}})},
    {id:'gatorade-blue', name:'Gatorade, Raspberry Cool Blue', aliases:['Gatorade Raspberry Cool Blue'], countUnit:'bottle', unitsPerCase:24, countDefinition:null},
  );
  for (const s of catalog.slice(-6)) Object.assign(s, {category:'Kitchen', sizeMl:null, trackingMode:'stock_count', wacCost:null});
  for (const zone of zones) zone.memberSkuIds = catalog.map(s => s.id);
}
// Discontinued (tprs 0196): the 2 oz patties are leftovers, replaced by the 3.5 oz pucks.
if (params.has('discontinued')) {
  catalog.push(
    {id:'patty2',name:'Beef Patty, 2oz',countUnit:'pack',unitsPerCase:96,category:'Meat',sizeMl:null,trackingMode:'stock_count',wacCost:null,
      discontinuedAt:'2026-10-01T05:00:00.000Z',replacedBySkuId:'patty35'},
    {id:'patty35',name:'Beef Patty, 3.5oz',countUnit:'each',unitsPerCase:48,category:'Meat',sizeMl:null,trackingMode:'stock_count',wacCost:null},
  );
  for(const zone of zones) zone.memberSkuIds=catalog.map(s=>s.id);
}
// Where things live (2026-10-03): each zone has its own list, a third zone is
// empty, and guacamole and cookies are on none ("things we think you have").
if (params.has('walk')) {
  catalog.push(
    {id:'guac',name:'Guacamole',countUnit:'pack',unitsPerCase:12,category:'Prep',sizeMl:null,trackingMode:'stock_count',wacCost:null},
    {id:'cookies',name:'Cookies, Chocolate Chip, 1 oz',countUnit:'each',unitsPerCase:null,category:'Dessert',sizeMl:null,trackingMode:'stock_count',wacCost:null},
  );
  zones[0].memberSkuIds = ['dough','pretzel','water'];
  zones[1].memberSkuIds = ['circles','gloves','rice'];
  zones.push({id:'walkin', name:'Walk in Cooler', walkOrder:3, memberSkuIds:[]});
}
const unplaced = params.has('walk') ? [
  {skuId:'guac',name:'Guacamole',countUnit:'pack',unitLabel:null,unitsPerCase:12,lastBoughtAt:'2026-10-02T17:00:00.000Z',lastVendor:'Sysco',inRecipe:true,reason:'both'},
  {skuId:'cookies',name:'Cookies, Chocolate Chip, 1 oz',countUnit:'each',unitLabel:null,unitsPerCase:null,lastBoughtAt:null,lastVendor:null,inRecipe:true,reason:'recipe'},
] : [];
const unplacedMore = params.has('many') ? [
  {skuId:'unknown',name:'Unknown Package',countUnit:'pack',unitLabel:null,unitsPerCase:null,lastBoughtAt:'2026-09-20T17:00:00.000Z',lastVendor:'Webstaurant',inRecipe:false,reason:'bought'},
] : [];
const usualLine = (skuId, zoneId, qtyUnits) => ({skuId, zoneId, qtyUnits, source:'grid', enteredCases:null, caseSizeAtEntry:null});
const initialLines = fixtureOverride?.lines ?? (params.has('walkin-existing') ? [usualLine('garlic-parm','freezer','2')]
  : params.has('usual-counted') ? [
    usualLine('cookies','cooler','144'), usualLine('beans','freezer','6'), usualLine('beans','cooler','3'), usualLine('dough','cooler','2')]
  : params.has('legacy-crust') ? [{skuId:'cauliflower',zoneId:'freezer',qtyUnits:'18',source:'voice',enteredCases:'1',caseSizeAtEntry:12}]
  : params.has('packs') ? [{skuId:'dough',zoneId:'freezer',qtyUnits:'8',source:'voice',enteredCases:null,caseSizeAtEntry:null,enteredPacks:'1',packSizeAtEntry:6}]
  : params.has('frozen') ? [{skuId:'dough',zoneId:'freezer',qtyUnits:'24',source:'voice',enteredCases:'2',caseSizeAtEntry:12}]
  : existing ? [{skuId:'dough', zoneId:'freezer', qtyUnits:'1', source:'grid', enteredCases:null, caseSizeAtEntry:null}] : []);
const qa = window.foodQa = {calls:[], extracts:[], lines:initialLines, recorder:null, memberFail:false, zoneFail:false,
  catalog,zones};
qa.failSave = params.has('save-fails');
// ?save-outdated: TPRS refuses this page's food saves as out of date.
qa.saveOutdated = params.has('save-outdated');
qa.detailFails = params.has('submit-unknown');
qa.submitted = false;
const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
// ?stale: the draft changed elsewhere after this screen loaded it (3 Giant
// Pretzels were added), so the first save is refused once with the lines now.
let refuseNextSave = params.has('stale');
window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.origin);
  const path = url.pathname;
  const body = init.body ? JSON.parse(String(init.body)) : null;
  qa.calls.push({path, query:url.search, method:init.method || 'GET', body});
  if (path.endsWith('/catalog')) return json({items:catalog});
  if (/\/skus\/[^/]+\/zones$/.test(path)) return qa.memberFail ? json({error:'synthetic'},500)
    : json({zoneId:body.zoneId, usual:body.usual, zoneName:zones.find(z => z.id === body.zoneId)?.name});
  if (/\/skus\/[^/]+\/discontinued$/.test(path)) return json({name:path.split('/').at(-2), active:true,
    discontinuedAt:'2026-10-03T15:00:00.000Z', replacedBySkuId:null});
  if (path.endsWith('/zones') && init.method === 'POST') {
    if (qa.zoneFail) return json({error:'synthetic'},500);
    const taken = zones.find(z => z.name.toLowerCase() === body.name.trim().toLowerCase());
    if (taken) return json({error:'name_taken', zone:{id:taken.id, name:taken.name, active:true, section:'food'}},409);
    return json({zone:{id:'spot-'+qa.calls.length, name:body.name.trim(), walkOrder:25, memberSkuIds:[]}},201);
  }
  if (path.endsWith('/zones')) return json({zones});
  if (path.endsWith('/counts/open')) return json({session:{id:'food-trial',section:'food',isFullCount:true,lines:initialLines,
    ...(params.has('stale') ? {linesHash:'server1'} : {})}});
  if (path.endsWith('/voice-extract')) return new Promise(resolve => {
    qa.extracts.push({body, succeed(items) { resolve(json({items})); }, fail(message) { resolve(json({error:'voice_failed', message},502)); },
      // TPRS's refusal of a page older than its food quantity rules (bar.ts).
      outdated() { resolve(json({error:'voice_update_required', message:'Food quantity and unit review has been updated. Refresh this page before recording again or saving typed counts. Saved counts are unchanged.'},409)); }});
  });
  if (path.endsWith('/case-size')) return json({unitsPerCase:body.unitsPerCase});
  if (/\/skus\/[^/]+\/active$/.test(path)) return json({active:body.active,name:path.split('/').at(-2)});
  if (path.endsWith('/lines')) {
    if (qa.failSave) return json({error:'synthetic'},503);
    if (qa.saveOutdated) return json({error:'refresh_required', message:'Refresh the food count and review its entered quantity and unit before saving.'},409);
    if (refuseNextSave) {
      refuseNextSave = false;
      const line = (skuId, qtyUnits) => ({zoneId:'freezer', skuId, qtyUnits, enteredCases:null, caseSizeAtEntry:null,
        enteredPacks:null, packSizeAtEntry:null, source:'grid', rawUtterance:null});
      return json({error:'draft_changed', lines:[line('dough','1.000'), line('pretzel','3.000')], linesHash:'server2'}, 409);
    }
    qa.lines = body.lines;
    return json({ok:true, ...(params.has('stale') ? {linesHash:'saved'} : {})});
  }
  // ?check-fails: the check itself cannot run. ?many-findings: eight
  // findings, six in `findings` and two in `more`.
  if (path.endsWith('/precheck')) {
    if (params.has('check-fails')) return json({error:'unavailable'}, 503);
    if (params.has('many-findings')) {
      const eight = Array.from({length:8}, (_, i) => ({kind:'not_counted', skuId:`gone${i}`, name:`Missing item ${i + 1}`,
        counted:null, prior:2, purchased:0, used:null, unitsPerCase:null, dollars:80 - i * 10, detail:'Counted last time, nothing this time.'}));
      return json({baseline:false, findings:eight.slice(0, 6), truncated:2, more:eight.slice(6), retiring:[]});
    }
    // ?recheck: each check names what it looked at (fcheck1, fcheck2, ...).
    const n = qa.calls.filter(c => c.path.endsWith('/precheck')).length;
    return json({baseline:true, findings:fixtureOverride?.findings ?? [], retiring:[], ...(params.has('walk') ? {unplaced, unplacedMore} : {}),
      ...(params.has('recheck') ? {linesHash:`fcheck${n}`} : {})});
  }
  if (path.endsWith('/submit')) {
    if (params.has('submit-rejected')) return json({error:'synthetic'},400);
    if (params.has('submit-lost') || params.has('submit-draft') || params.has('submit-unknown')) {
      qa.submitted = !params.has('submit-draft');
      throw new Error('Synthetic lost Submit response');
    }
    // ?recheck: the first submit is refused, another phone having changed the count.
    if (params.has('recheck') && qa.calls.filter(c => c.path.endsWith('/submit')).length === 1) {
      return json({error:'changed_since_check', message:'The count changed after the check ran.'}, 409);
    }
    return json({lineCount:qa.lines.length});
  }
  if (path.endsWith('/counts/food-trial')) {
    if (qa.detailFails) throw new Error('Synthetic status unavailable');
    return json({session:{id:'food-trial',status:qa.submitted?'submitted':'draft'},lines:qa.lines});
  }
  // A new count (Start new count / Start a new count).
  if (path.endsWith('/admin/bar/counts') && init.method === 'POST') return json({sessionId:'food-new'});
  throw new Error('Unexpected food fixture request: '+path);
};
function PreviewControls() {
  if (!new URL(location.href).searchParams.has('preview')) return null;
  return <button onClick={() => {
    const transcript = 'Thirty cases of Aquafina. Four packets of pizza circles. Five boxes of gloves.';
    qa.recorder.segment(transcript,0);
    qa.extracts.at(-1).succeed([
      {spoken:'Thirty cases of Aquafina',cases:30,units:0,spokenUnit:null,match:{id:'water'},candidates:[]},
      {spoken:'Four packets of pizza circles',cases:0,units:4,spokenUnit:'packet',match:{id:'circles'},candidates:[]},
      {spoken:'Five boxes of gloves',cases:0,units:5,spokenUnit:'box',match:{id:'gloves'},candidates:[]},
    ]);
    qa.recorder.finish(transcript);
  }}>Load sample review (QA only)</button>;
}
createRoot(document.getElementById('root')).render(<div className="lq-app"><header className="lq-header"><span className="lq-brand">COGS · Food QA</span></header><main className="lq-main"><PreviewControls /><CountFood onDone={() => {}} /></main></div>);
