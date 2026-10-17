import React from 'react';
import {createRoot} from 'react-dom/client';
import CountLiquor from '../../src/components/liquor/views/CountLiquor.tsx';
import '../../src/components/liquor/liquor.css';

// Actual screen and API client; all inventory and responses are fictional.
// Only the recorder boundary is controlled. No production requests or writes.
const params = new URL(location.href).searchParams;
// ?keep-storage keeps this phone's switches (?softcheck=0) from the last load.
if (!params.has('keep-storage')) localStorage.clear();
const sku = (id, name, extra = {}) => ({id, name, section:'bar', category:'Whiskey',
  sizeMl:1000, trackingMode:'variance', countUnit:'bottle', unitsPerCase:12,
  wacCost:null, lastCost:'20.00', active:true, aliases:[], ...extra});
const catalog = [
  sku('minsters', "Minster's Small Batch Kentucky Straight Bourbon"),
  sku('jameson', 'Jameson Irish Whiskey'),
  sku('orange', 'Jameson Orange', {sizeMl:750,unitsPerCase:params.has('frozen-moved')?24:12}),
  sku('makers', "Maker's Mark"),
  sku('herradura1l', 'Herradura Reposado'),
  sku('herradura750', 'Herradura Reposado', {sizeMl:750}),
  sku('boylan', 'Boylan Black Cherry', {trackingMode:'stock_count', countUnit:'each', sizeMl:355, category:'Mixers', unitsPerCase:24}),
  sku('jaeger', 'Jägermeister', {aliases:['Jaeger', 'Jager']}),
  sku('owens', "Owen's Ginger Beer", {trackingMode:'stock_count', countUnit:'each', sizeMl:250, category:'Mixers', unitsPerCase:24}),
  // Voice-only bottles for the edit-log scenarios (never on a saved line unless asked).
  sku('frangelico', 'Frangelico', {sizeMl:750, category:'Liqueur'}),
  sku('titos', "Tito's Handmade Vodka", {category:'Vodka'}),
  sku('citron', 'Ketel One Citroen', {category:'Vodka'}),
  // The 10/16 Amaretto (no case size on file) and Belvedere, for the W3 offers.
  sku('amaretto', 'Amaretto Luxardo di Saschira', {sizeMl:750, category:'Liqueur', unitsPerCase:null}),
  sku('belvedere', 'Belvedere Organic', {sizeMl:750, category:'Vodka'}),
  // The 10/16 takes 26f73d9c and 2c31ff79 and the 10/16 soft summary (W4).
  sku('captain', 'Captain Morgan Original Spiced Rum', {sizeMl:750, category:'Rum'}),
  sku('maschio', 'Maschio Prosecco Brut 187ml', {sizeMl:187, category:'Wine', unitsPerCase:24}),
  sku('risata', "Risata Moscato d'Asti 187ml", {sizeMl:187, category:'Wine', unitsPerCase:24}),
  sku('ketel', 'Ketel One', {category:'Vodka'}),
  sku('ketel750', 'Ketel One 750ml', {sizeMl:750, category:'Vodka'}),
  sku('bulleit', 'Bulleit Bourbon', {sizeMl:750}),
  sku('agave', 'Herradura Agave Nectar Syrup', {sizeMl:750, category:'Syrups'}),
  sku('carpanodry375', 'Carpano Vermouth Dry 375ml', {sizeMl:375, category:'Vermouth'}),
  sku('carpanodry', 'Vermouth Carpano Dry', {category:'Vermouth'}),
  sku('fevergb', 'Fever-Tree Ginger Beer 5oz Can', {trackingMode:'stock_count', countUnit:'each', sizeMl:148, category:'Mixers', unitsPerCase:24}),
  sku('fevertonic', 'Fever-Tree Tonic Water 5oz Can', {trackingMode:'stock_count', countUnit:'each', sizeMl:148, category:'Mixers', unitsPerCase:24}),
  ...Array.from({length:44}, (_,i) => sku('sample'+i, `Sample Shelf Bottle ${String(i+1).padStart(2,'0')}`)),
];
// ?backstock names the second shelf like the 10/16 one; its id stays 'speed'.
const zones = [{id:'giant',name:'Giant Bottle Shelf',walkOrder:1,active:true},
  {id:'speed',name:params.has('backstock')?'Backstock Room':'Speed Rail',walkOrder:2,active:true}];
const allZones=[...zones,{id:'cooler',name:'Walk-In Cooler',walkOrder:3,active:true}];
const line = (zoneId, skuId, qtyUnits, memo = {}) => ({zoneId,skuId,qtyUnits:String(qtyUnits),source:'voice',
  enteredCases:null,caseSizeAtEntry:null,rawUtterance:null,...memo});
const collision = params.get('collision');
const lines = [
  line('giant','minsters',11,{rawUtterance:'eleven Minsters small batch'}),
  line('speed','minsters',0.125,{rawUtterance:'point one two five Minsters'}),
  line('giant','jameson',collision||params.has('frozen-moved')?14:0.7,{rawUtterance:'point seven Jameson',...(collision||params.has('frozen-moved')?{enteredCases:1,caseSizeAtEntry:12}:{})}),
  line('speed','jameson',7,{rawUtterance:'point seven Jameson'}),
  line('giant','makers',0.7,{rawUtterance:'seven Makers Mark'}),
  line('giant','herradura1l',2,{rawUtterance:'two Herradura Reposado'}),
  line('giant','boylan',48,{enteredCases:2,caseSizeAtEntry:24,rawUtterance:'two cases Boylan black cherry'}),
  line('giant','jaeger',0,{rawUtterance:'zero Jaeger'}),
  line('giant','owens',12,{rawUtterance:'twelve Owens ginger beer'}),
  ...Array.from({length:44},(_,i)=>line('giant','sample'+i,(i%4)+1)),
  ...(collision?[line('giant','orange',collision==='compatible'?13:25,{enteredCases:1,caseSizeAtEntry:collision==='compatible'?12:24})]:[]),
  ...(params.has('historical-cooler')?[line('cooler','boylan',0)]:[]),
  ...(params.has('titos36')?[line('giant','titos',36,{rawUtterance:'thirty six Titos'})]:[]),
  ...(params.has('belvedere2')?[line('speed','belvedere',2,{rawUtterance:'two Belvedere'})]:[]),
  // ?take26: the Backstock Room before 10/16 take 26f73d9c (Captain Morgan and
  // Tito's already counted from an earlier take).
  ...(params.has('take26')?[line('speed','captain',18,{rawUtterance:'Captain Morgan, eighteen'}),
    line('speed','titos',36,{rawUtterance:'thirty six Titos'})]:[]),
];
// ?soft=<shape>: the pre-submit check's soft lists (TPRS T4 `unproved`, T3
// `unaccounted`), built from the 10/16 count (session 695a3e79: lines, prior
// 10/12 lines and the stored variance report, read-only). No findings unless
// ?soft-findings. Shapes: 1016 (2 guessed, 19 unclear, 4 not accounted for,
// with no swap credit per Jon 10/17), unclear (unclear only), guessed (the 2
// guessed only), gaps (not accounted for only), skipped (2 guessed and
// unaccountedSkipped beside a list), none (an older server with a clean check: no fields).
const soft = params.get('soft');
const unprovedLine = (zoneId,zoneName,skuId,name,qty,quantityHeard,spoken,lastCount) => ({zoneId,zoneName,skuId,name,qty,
  quantityHeard,heardQty:qty,spoken,quantityWords:quantityHeard==='guessed'?'':null,lastCount,lastCountAll:lastCount});
const guessed1016 = [
  unprovedLine('speed','Backstock Room','amaretto','Amaretto Luxardo di Saschira',1,'guessed','Luxardo Di Serradura',2),
  unprovedLine('speed','Backstock Room','belvedere','Belvedere Organic',1,'guessed','Belvedere',2),
];
const unclear1016 = [
  ['Bulleit Bourbon',23,'Bulleit Bourbon, one case',24], ['Captain Morgan Original Spiced Rum',30,'Captain Morgan, one case',31],
  ['Carpano Antica Formula',1,'Antica formula one thousand. One',1], ['Carpano Antica Formula 375ml',3,'Antica formula three seventy five. Three',3],
  ['Carpano Vermouth Dry 375ml',2,'Carpano dry, three seventy five, two',2], ['Don Julio Reposado',11,'Don Julio Reposado, five',12],
  ['Herradura Agave Nectar Syrup',24,'Herradura syrup, agave, two cases',24], ['Jose Cuervo Tradicional Silver 1L',33,'Jose Cuervo Traditial, nine',34],
  ['Ketel One Citroen',3,'Ketel One Citron, three',3], ['Maschio Prosecco Brut 187ml',48,'Mioneto Prosecco Brut, two cases',72],
  ['Pisco Barsol Acholado',2,'Barsol Pisco Atralado, two',2], ['Pisco Barsol Puro Quebranta',2,'Barcal Pisco Quabantra two',2],
  ["Seagram's 7",1,'Seagram, seven. One.',1], ["Tito's Handmade Vodka",56,"Two Tito's",57], ['Vermouth Carpano Dry',2,'Carpano dry one thousand. Two',2],
].map(([name,qty,spoken,last],i)=>unprovedLine('speed','Backstock Room','u'+i,name,qty,'unclear',spoken,last)).concat([
  unprovedLine('step','Step Shelf','u15','Clase Azul Reposado',1,'unclear','Clase Azul, tequila Reposado. One',0),
  unprovedLine('step','Step Shelf','u16','Don Julio 1942',0.9,'unclear','Don Julio, nineteen forty two, point nine',0),
  unprovedLine('cooler','Beer Cooler','u17','Juice, Cranberry Cocktail',10.8,'unclear','Cranberry juice, point nine of a case',12),
  unprovedLine('cooler','Beer Cooler','u18','Red Bull 8.4oz',36,'unclear','Red Bull, one point five cases',42),
]);
const gap = (skuId,name,bottles,dollars,prior,countedInclBatch,sold,zoneRows) => ({skuId,relatedSkuIds:[skuId],name,bottles,dollars,
  prior,countedInclBatch,purchased:0,sold,zones:zoneRows.map(([zoneId,zoneName,p,c])=>({zoneId,zoneName,prior:p,counted:c}))});
const gaps1016 = [
  gap('maschio','Maschio Prosecco Brut 187ml',8.8,35.14,85,74,2.2,[['speed','Backstock Room',72,48],['giant','Giant Bottle Shelf',13,26]]),
  gap('belvedere','Belvedere Organic',1,31.57,2,1,0,[['speed','Backstock Room',2,1]]),
  gap('amaretto','Amaretto Luxardo di Saschira',1,29.09,2.4,1.4,0,[['speed','Backstock Room',2,1],['giant','Giant Bottle Shelf',0.4,0.4]]),
  gap('bulleit','Bulleit Bourbon',0.9,23.79,25.6,24.6,0.1,[['speed','Backstock Room',24,23],['giant','Giant Bottle Shelf',1,1],['speedrails','Speedrails',0.6,0.6]]),
];
const softFields = !soft || soft==='none' ? {} : soft==='unclear' ? {unproved:unclear1016,unaccounted:[]}
  // A guessed cell left at 0 (T4 lists by the fold alone) is no number to glance at.
  : soft==='guessed' ? {unproved:[...guessed1016,unprovedLine('speed','Backstock Room','frangelico','Frangelico',0,'guessed','Frangelico',1)],unaccounted:[]}
  : soft==='gaps' ? {unproved:[],unaccounted:gaps1016}
  // TPRS sends [] when it skips; the list rides along here so the screen's own
  // check of the flag is what is tested.
  : soft==='skipped' ? {unproved:guessed1016,unaccounted:gaps1016,unaccountedSkipped:'zones_not_counted'}
  : {unproved:[...guessed1016,...unclear1016],unaccounted:gaps1016};
const qa = window.liquorQa = {nonce:Math.random(),calls:[],extracts:[],lines,recorder:null,
  failSave:false,failCheck:false,holdCheck:false,releaseCheck:null,refuseSave:false,
  remapConflict:null,releaseConflict:null};
const finding = (skuId,name,counted,extra={}) => ({kind:'big_gain',skuId,name,counted,prior:1,purchased:0,
  used:null,unitsPerCase:12,dollars:100,detail:'Check the shelf count and bottle label.',...extra});
const findings = [finding('minsters',catalog[0].name,11.125),
  finding('jameson','Jameson Irish Whiskey',7.7),
  finding('family:herradura reposado','Herradura Reposado (750 ml + 1 L)',null,
    {kind:'size_mixup',relatedSkuIds:['herradura1l','herradura750'],detail:'Check whether the bottle is 750 ml or 1 L.'}),
  finding('boylan','Boylan Black Cherry',48,{unitsPerCase:24}),finding('jaeger','Jägermeister',0)];
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
let saves=0, checks=0;
window.fetch = async (input,init={}) => {
  const url = new URL(String(input),location.origin),path=url.pathname;
  const body=init.body?JSON.parse(String(init.body)):null;
  qa.calls.push({path,query:url.search,method:init.method||'GET',body});
  if(path.endsWith('/catalog'))return json({items:catalog});
  if(path.endsWith('/zones'))return json({zones:url.searchParams.get('walk')==='liquor'&&!params.has('old-zones')?zones:allZones});
  if(path.endsWith('/batches'))return json({batches:[],batchesHash:'batches0'});
  if(path.endsWith('/counts/open'))return json({session:{id:'review-draft',section:'bar',isFullCount:true,
    startedAt:'2026-10-05T12:00:00Z',lines,batches:[],linesHash:'initial',batchesHash:'batches0'}});
  // succeed(items, {extractionId}) is a TPRS 0226 reply; ?old-server never sends one.
  if(path.endsWith('/voice-extract'))return new Promise(resolve=>qa.extracts.push({body,succeed(items,extra={}){
    resolve(json({items,...(params.has('old-server')?{}:extra)}));}}));
  if(path.endsWith('/lines')){
    if(qa.failSave)return json({error:'synthetic save unavailable'},503);
    if(qa.remapConflict){
      const conflict=qa.remapConflict;qa.remapConflict=null;
      let fresh=qa.lines.map(l=>({...l}));
      if(conflict==='target-created')fresh.push(line('giant','orange',3));
      if(conflict==='target-changed')fresh=fresh.map(l=>l.skuId==='orange'&&l.zoneId==='giant'?{...l,qtyUnits:'18'}:l);
      if(conflict==='source-changed')fresh=fresh.map(l=>l.skuId==='jameson'&&l.zoneId==='giant'?{...l,qtyUnits:'1.7'}:l);
      return new Promise(resolve=>qa.releaseConflict=()=>{
        qa.lines=fresh;resolve(json({error:'draft_changed',message:'Another phone changed this correction endpoint.',
          lines:fresh,linesHash:'endpoint-conflict'},409));
      });
    }
    if(qa.refuseSave){const mode=qa.refuseSave;qa.refuseSave=false;
      qa.lines=qa.lines.map(l=>mode==='remote-positive-case'
        ?l.skuId==='orange'&&l.zoneId==='giant'?{...l,qtyUnits:'26',enteredCases:1,caseSizeAtEntry:24}:l
        // 'belvedere': the other phone changed the Giant Bottle Shelf Belvedere (W4).
        :mode==='belvedere'?l.skuId==='belvedere'&&l.zoneId==='giant'?{...l,qtyUnits:'2'}:l
        :l.skuId==='makers'?{...l,qtyUnits:'8'}:l);
      return json({error:'draft_changed',message:'This draft changed on another phone.',lines:qa.lines,linesHash:'external'},409);}
    qa.lines=body.lines;
    // TPRS 0226 counts the events it stored; an older server ignores them.
    return json({upserted:body.lines.length,linesHash:'saved'+(++saves),...(params.has('old-server')?{}:{eventsStored:(body.events??[]).length})});
  }
  if(path.endsWith('/precheck')){
    ++checks;
    if(qa.holdCheck)await new Promise(resolve=>qa.releaseCheck=resolve);
    if(qa.failCheck)return json({error:'synthetic check unavailable'},503);
    return json({baseline:false,findings:(params.has('clean-after-recheck')&&checks>1)||(soft&&!params.has('soft-findings'))?[]:findings,
      more:[],truncated:0,retiring:[],sizeWarnings:[],linesHash:'checked'+checks,batchesHash:'batches0',...softFields});
  }
  if(path.endsWith('/submit'))return json({lineCount:qa.lines.length});
  throw Error('Unexpected synthetic review request: '+path);
};
createRoot(document.getElementById('root')).render(<div className="lq-app">
  <header className="lq-header">LOCAL TEST · Synthetic liquor count</header>
  <main className="lq-main"><CountLiquor onDone={()=>{}}/></main>
</div>);
