// The food speech review's package-size question: its wording, which way the
// typed number converts, and the conversions that need no question at all.
// Pure functions bundled from the Website source; no browser, network or data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const website=fileURLToPath(new URL('../../',import.meta.url));
const {build}=createRequire(join(website,'package.json'))('esbuild');
const load=async file=>{
  const {outputFiles}=await build({entryPoints:[join(website,'src/components/liquor',file)],bundle:true,write:false,platform:'node',format:'esm'});
  return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
};
const size=await load('food-unit-size.ts');
const review=await load('food-voice-review.ts');
let checks=0;
const is=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
const near=(actual,expected,message)=>{assert.ok(Math.abs(actual-expected)<1e-12,`${message}: ${actual} != ${expected}`);checks++;};

// ---- the wording and direction, one row per kind of pair --------------------
// [name, count unit {unit,one,many}, spoken, question, example, typed, expected multiplier, said back]
const bag={unit:'pack',one:'bag',many:'bags'}, each={unit:'each',one:'each',many:'each'}, bun={unit:'each',one:'bun',many:'buns'};
const lb={unit:'lb',one:'lb',many:'lb'}, gal={unit:'gal',one:'gal',many:'gal'}, cases={unit:'case',one:'case',many:'cases'};
const cake={unit:'each',one:'cake',many:'cakes'}, loaf={unit:'each',one:'loaf',many:'loaves'}, head={unit:'each',one:'head',many:'heads'};
const bib={unit:'bib',one:'bib',many:'bib'}, tub={unit:'pack',one:'tub',many:'tubs'};
const rows=[
  // Spoken is a weight or volume and the counting unit is a package: the headline case.
  ['curds, 3 pounds, counted in bags',bag,'lb','How many lb in one bag?','Example: for a 5 lb bag, enter 5.',5,1/5,'1 bag = 5 lb'],
  ['pounds spelled out',bag,'pounds','How many lb in one bag?','Example: for a 5 lb bag, enter 5.',5,1/5,'1 bag = 5 lb'],
  ['lbs',bag,'LBS','How many lb in one bag?','Example: for a 5 lb bag, enter 5.',5,1/5,'1 bag = 5 lb'],
  ['a tub gets the example too',tub,'lb','How many lb in one tub?','Example: for a 5 lb tub, enter 5.',2,1/2,'1 tub = 2 lb'],
  ['ounces in a bag',bag,'ounces','How many oz in one bag?','Example: for a 16 oz bag, enter 16.',16,1/16,'1 bag = 16 oz'],
  ['gallons in a pack',{unit:'pack',one:'jug',many:'jugs'},'gallons','How many gal in one jug?',null,2.5,1/2.5,'1 jug = 2.5 gal'],
  ['fluid ounces in a can',{unit:'each',one:'can',many:'cans'},'fl oz','How many fl oz in one can?',null,12,1/12,'1 can = 12 fl oz'],
  ['grams in a bag',bag,'grams','How many g in one bag?',null,500,1/500,'1 bag = 500 g'],
  // A head or a case has no example: a 5 lb figure there would only anchor the answer.
  ['heads of lettuce, pounds',head,'lb','How many lb in one head?',null,1.5,1/1.5,'1 head = 1.5 lb'],
  // Counted in cases: the case is always the bigger one.
  ['case, pounds',cases,'lb','How many lb in one case?',null,10,1/10,'1 case = 10 lb'],
  ['case, boxes',cases,'box','How many boxes in one case?',null,10,1/10,'1 case = 10 boxes'],
  ['case, bag',cases,'bag','How many bags in one case?',null,2,1/2,'1 case = 2 bags'],
  ['case labelled tub, gallons',{unit:'case',one:'tub',many:'tubs'},'gal','How many gal in one tub?',null,5,1/5,'1 tub = 5 gal'],
  // The spoken unit is the bigger container: the counting unit per spoken unit, as before.
  ['buns by the tray',bun,'tray','How many buns in one tray?',null,12,12,'1 tray = 12 buns'],
  ['trays, as heard',bun,'trays','How many buns in one tray?',null,12,12,'1 tray = 12 buns'],
  ['plain each by the packet',each,'packet','How many in one packet?',null,25,25,'1 packet = 25 each'],
  ['bags by the box',bag,'box','How many bags in one box?',null,6,6,'1 box = 6 bags'],
  ['bibs by the bag: bib gets a plural',bib,'bag','How many bibs in one bag?',null,2,2,'1 bag = 2 bibs'],
  ['pounds counted, bags said',lb,'bag','How many lb in one bag?','Example: for a 5 lb bag, enter 5.',5,5,'1 bag = 5 lb'],
  ['gallons counted, jugs said',gal,'jug','How many gal in one jug?',null,5,5,'1 jug = 5 gal'],
  ['buns counted, pounds said',bun,'lb','How many buns in one lb?',null,4,4,'1 lb = 4 buns'],
  // Plural and unlisted container words ask the way the old question did: the container is the bigger one.
  ['cartons, singular',bag,'carton','How many bags in one carton?',null,6,6,'1 carton = 6 bags'],
  ['cartons, plural',bag,'cartons','How many bags in one carton?',null,6,6,'1 carton = 6 bags'],
  ['crates',bag,'crates','How many bags in one crate?',null,8,8,'1 crate = 8 bags'],
  ['buckets',bag,'buckets','How many bags in one bucket?',null,3,3,'1 bucket = 3 bags'],
  ['pails',bag,'pails','How many bags in one pail?',null,3,3,'1 pail = 3 bags'],
  ['flats',bag,'flats','How many bags in one flat?',null,4,4,'1 flat = 4 bags'],
  ['bibs, plural',bag,'bibs','How many bags in one bib?',null,2,2,'1 bib = 2 bags'],
  ['racks',bun,'racks','How many buns in one rack?',null,8,8,'1 rack = 8 buns'],
  ['a tote',bag,'tote','How many bags in one tote?',null,10,10,'1 tote = 10 bags'],
  ['a pan of a pound-counted item',lb,'pan','How many lb in one pan?',null,5,5,'1 pan = 5 lb'],
  ['pans, plural, of a pound-counted item',lb,'pans','How many lb in one pan?',null,5,5,'1 pan = 5 lb'],
  ['a pan of a gallon-counted item',gal,'pans','How many gal in one pan?',null,2,2,'1 pan = 2 gal'],
  ['hotel pans',lb,'hotel pans','How many lb in one hotel pan?',null,8,8,'1 hotel pan = 8 lb'],
  ['a #10 can',bag,'#10 can','How many bags in one #10 can?',null,6,6,'1 #10 can = 6 bags'],
  ['a word nobody listed is a container, as before',bag,'thingamajig','How many bags in one thingamajig?',null,6,6,'1 thingamajig = 6 bags'],
  ['a dozen of buns',bun,'dozen','How many buns in one dozen?',null,12,12,'1 dozen = 12 buns'],
  // The item's own noun said for a package-counted product: the pieces are inside the package.
  ['shells in a bag',bag,'shell','How many shells in one bag?',null,25,1/25,'1 bag = 25 shells'],
  ['patties in a pack',{unit:'pack',one:'pack',many:'packs'},'patty','How many patties in one pack?',null,10,1/10,'1 pack = 10 patties'],
  ['patties, plural',{unit:'pack',one:'pack',many:'packs'},'patties','How many patties in one pack?',null,10,1/10,'1 pack = 10 patties'],
  ['cookies, plural',bag,'cookies','How many cookies in one bag?',null,24,1/24,'1 bag = 24 cookies'],
  ['pieces in a bag',bag,'pieces','How many pieces in one bag?',null,40,1/40,'1 bag = 40 pieces'],
  ['pieces in a bag, singular once',bag,'piece','How many pieces in one bag?',null,1,1,'1 bag = 1 piece'],
  // Slices come out of a cake or a loaf, never the other way round.
  ['slices of a cake',cake,'slices','How many slices in one cake?',null,8,1/8,'1 cake = 8 slices'],
  ['slices of a loaf',loaf,'slice','How many slices in one loaf?',null,12,1/12,'1 loaf = 12 slices'],
  ['pounds of cake',cake,'lb','How many lb in one cake?',null,4,1/4,'1 cake = 4 lb'],
  // A bare "each" said as a weight or volume is the container: ask what one weighs or holds.
  ['bare each, pounds',each,'lb','How many lb does one weigh?',null,10,1/10,'1 each = 10 lb'],
  ['bare each, ounces',each,'ounces','How many oz does one weigh?',null,3.5,1/3.5,'1 each = 3.5 oz'],
  ['bare each, gallons',each,'gallons','How many gal does one hold?',null,5,1/5,'1 each = 5 gal'],
  // Two measures: the bigger holds the smaller, by size, so a pound is more than a fluid ounce.
  ['pounds counted, gallons said',lb,'gal','How many lb in one gal?',null,8,8,'1 gal = 8 lb'],
  ['gallons counted, pounds said',gal,'lb','How many lb in one gal?',null,8,1/8,'1 gal = 8 lb'],
  ['pounds counted, grams said',lb,'grams','How many g in one lb?',null,454,1/454,'1 lb = 454 g'],
  ['grams counted, pounds said',{unit:'each',one:'g',many:'g'},'lb','How many g in one lb?',null,454,454,'1 lb = 454 g'],
  ['pounds counted, fluid ounces said',lb,'fl oz','How many fl oz in one lb?',null,16,1/16,'1 lb = 16 fl oz'],
  ['pounds counted, quarts said',lb,'quart','How many lb in one qt?',null,2,2,'1 qt = 2 lb'],
  // A bare "oz" for something counted by the gallon is not guessed to be fluid ounces; it is offered.
  ['ounces of a gallon item',gal,'oz','How many oz in one gal?','If you mean fluid ounces, enter 128.',128,1/128,'1 gal = 128 oz'],
];
for (const [name,count,spoken,question,example,typed,multiplier,said] of rows) {
  const ask=size.foodUnitSizeAsk(count,spoken);
  is(ask.question,question,`${name}: question`);
  is(ask.example,example,`${name}: example`);
  near(ask.multiplier(typed),multiplier,`${name}: multiplier`);
  is(ask.said(ask.multiplier(typed)),said,`${name}: said back`);
}

// ---- the item's own name tells its noun from a container ----------------------
is(size.foodUnitSizeAsk(bag,'curds','Cheese Curds').question,'How many curds in one bag?','a word on the item name is what is counted');
is(size.foodUnitSizeAsk(bag,'curds').question,'How many bags in one curd?','without the name the word is taken for a container');
is(size.foodUnitSizeAsk(bag,'fries','Fries, Shoestring').question,'How many fries in one bag?','plural name words match');
is(size.foodUnitSizeAsk(bag,'tub','Sour Cream Tub').question,'How many bags in one tub?','a container word on the name is still a container');

// ---- the smallest number that can be right ------------------------------------
// A package holds at least one of what is counted in it; a weight or volume can be a fraction.
for (const [name,count,spoken,minimum] of [
  ['shells in a bag',bag,'shell',1],['bags in a case',cases,'bag',1],['bags in a box',bag,'box',1],['buns in a tray',bun,'tray',1],
  ['each in a packet',each,'packet',1],['slices in a cake',cake,'slices',1],
  ['lb in a bag',bag,'lb',0.001],['lb in a case',cases,'lb',0.001],['gal in a jug',gal,'jug',0.001],['lb in a gal',lb,'gal',0.001],
  ['what one weighs',each,'lb',0.001],['buns in a pound',bun,'lb',0.001]]) is(size.foodUnitSizeAsk(count,spoken).minimum,minimum,`${name}: smallest answer`);

// ---- what a typed number means: the numbers the screen used to produce ---------
// Unchanged where the spoken unit is the bigger container or the unit is cases.
near(size.foodUnitSizeAsk(each,'packet').multiplier(25)*4,100,'four packets of 25 = 100 each');
near(size.foodUnitSizeAsk({unit:'case',one:'case',many:'cases'},'box').multiplier(10)*5,0.5,'five boxes at ten a case = half a case');
// New where the counting unit is the bigger package: 3 lb in 5 lb bags is 0.6 bag.
near(size.foodUnitSizeAsk(bag,'lb').multiplier(5)*3,0.6,'three pounds in 5 lb bags = 0.6 bag');
// A pan holds 5 lb, so 3 pans of a pound-counted item are 15 lb (the unlisted word must not undercount).
near(size.foodUnitSizeAsk(lb,'pans').multiplier(5)*3,15,'three 5 lb pans = 15 lb');
near(size.foodUnitSizeAsk(bag,'cartons').multiplier(6)*2,12,'two cartons of 6 bags = 12 bags');

// ---- conversions that are plain physics: nobody is asked ----------------------
const m=(count,spoken)=>size.foodMeasureMultiplier(count,spoken);
is(m('lb','oz'),1/16,'ounces counted in pounds');
is(m('lb','ounces'),1/16,'plural ounces');
is(m('oz','lb'),16,'pounds counted in ounces');
is(m('gal','qt'),1/4,'quarts in gallons');
is(m('gal','pints'),1/8,'pints in gallons');
is(m('gal','fl oz'),1/128,'fluid ounces in gallons');
is(m('gal','fluid ounces'),1/128,'fluid ounces, spelled out');
is(m('qt','gallons'),4,'gallons counted in quarts');
is(m('lb','lb.'),1,'the same measure said with a stray period');
is(m('lb','Lbs.'),1,'the same measure, plural, with a stray period');
is(m('gal','Gallons'),1,'the same measure, spelled out');
for (const [count,spoken] of [['gal','oz'],['lb','gal'],['lb','floz'],['lb','kg'],['lb','grams'],['gal','l'],['bag','lb'],['each','oz'],['bag','bag'],['lb','bag']])
  is(m(count,spoken),null,`${count} counted, ${spoken} said: not plain physics`);

// ---- the review row, end to end through the real quantity function -------------
const definition=(countUnit,unitsPerCase,extra)=>({countUnit,unitsPerCase,confirmedBy:'QA',confirmedAt:'2026-10-14',...extra});
const curds={id:'curds',name:'Cheese Curds',countUnit:'pack',unitsPerCase:2,
  countDefinition:definition('pack',2,{unitLabel:'bag',spokenUnits:{case:2,bag:1}})};
const carnitas={id:'carnitas',name:'Pork Carnitas',countUnit:'lb',unitsPerCase:null,countDefinition:definition('lb',null,{unitLabel:'lb',spokenUnits:{bag:5,lb:1}})};
const syrup={id:'syrup',name:'Fryer Oil',countUnit:'gal',unitsPerCase:null,countDefinition:definition('gal',null,{unitLabel:'gal',spokenUnits:{jug:3,gal:1}})};
const gloves={id:'gloves',name:'Gloves',countUnit:'case',unitsPerCase:null};
const philly={id:'philly',name:'Beef, Philly, Flat, Marinated',countUnit:'each',unitsPerCase:null};
const row=(sku,units,spokenUnit,extra={})=>({key:'k',spoken:`${units} ${spokenUnit}`,cases:0,units,chosenSkuId:sku.id,candidates:[],spokenUnit,quantityKnown:true,...extra});
const q=(sku,units,spokenUnit,extra)=>review.foodReviewQuantity(row(sku,units,spokenUnit,extra),sku);

// "Cheese curds, three pounds": a bag-counted item with no pound entry still asks, in plain words.
let r=q(curds,3,'lb');
is([r.needsUnitSize,r.ready],[true,false],'curds in pounds asks and blocks the row');
is(review.foodUnitSizeQuestion(curds,'lb').question,'How many lb in one bag?','curds question through the catalog item');
const answered=review.foodUnitSizeQuestion(curds,'lb').multiplier(5);
r=q(curds,3,'lb',{unitMultiplier:answered});
is([r.needsUnitSize,r.ready],[false,true],'curds answered');
near(r.qty,0.6,'3 lb of 5 lb bags');
is(r.unitFromMeasure,false,'an asked answer is not arithmetic');
is(review.foodUnitSizeAnswered(row(curds,3,'lb',{unitMultiplier:answered}),curds),true,'an asked answer is recognised');
is(review.foodUnitSizeAnswered(row(curds,3,'bag',{unitMultiplier:1}),curds),false,'a same-unit one is not an answer');
is(review.foodUnitSizeAnswered(row(curds,3,'lb'),curds),false,'no answer yet');
// The item's name tells its noun: "curds" are what is in the bag.
is(review.foodUnitSizeQuestion(curds,'curds').question,'How many curds in one bag?','the item name reaches the question');
// A catalog entry for pounds is never overridden.
r=q({...curds,countDefinition:definition('pack',2,{unitLabel:'bag',spokenUnits:{case:2,bag:1,lb:0.2}})},3,'lb');
is(r.needsUnitSize,false,'a pound entry answers it'); near(r.qty,0.6,'catalog pound entry');
is(r.unitFromMeasure,false,'a catalog entry is not arithmetic');
// Pounds counted, ounces said: no question, and the row says what it did.
r=q(carnitas,8,'ounces'); is([r.needsUnitSize,r.ready],[false,true],'8 ounces of a pound-counted item'); near(r.qty,0.5,'8 oz = 0.5 lb');
is(r.unitFromMeasure,true,'8 ounces is arithmetic, so the row can say so');
r=q(carnitas,8,'oz'); near(r.qty,0.5,'8 oz');
r=q(carnitas,3,'pounds'); near(r.qty,3,'pounds said, pounds counted'); is(r.unitFromMeasure,false,'same unit is not arithmetic');
r=q(carnitas,3,'lb.'); is([r.needsUnitSize,r.ready,r.unitFromMeasure],[false,true,false],'a stray period asks nothing'); near(r.qty,3,'lb. is lb');
r=q(carnitas,2,'bag'); near(r.qty,10,'catalog bag entry unchanged');
r=q(syrup,2,'quarts'); is(r.needsUnitSize,false,'quarts of a gallon item'); near(r.qty,0.5,'2 qt = 0.5 gal');
r=q(syrup,16,'fl oz'); near(r.qty,0.125,'16 fl oz = 0.125 gal');
r=q(syrup,3,'oz'); is(r.needsUnitSize,true,'a bare "oz" on a gallon item is not guessed');
is(review.foodUnitSizeQuestion(syrup,'oz').example,'If you mean fluid ounces, enter 128.','but fluid ounces are offered');
r=q(carnitas,3,'gal'); is(r.needsUnitSize,true,'weight and volume still ask');
is(review.foodUnitSizeQuestion(carnitas,'gal').question,'How many lb in one gal?','pounds per gallon');
// A pan is not in the item's vocabulary: it asks, and 5 lb a pan makes 15 lb.
r=q(carnitas,3,'pan'); is(r.needsUnitSize,true,'an unlisted container asks');
is(review.foodUnitSizeQuestion(carnitas,'pan').question,'How many lb in one pan?','the pan holds the pounds');
near(q(carnitas,3,'pan',{unitMultiplier:review.foodUnitSizeQuestion(carnitas,'pan').multiplier(5)}).qty,15,'3 pans of 5 lb');
// A bare each said in pounds is asked what one weighs: a 10 lb flat counted 3 pounds is 0.3 of a flat.
is(review.foodUnitSizeQuestion(philly,'lb').question,'How many lb does one weigh?','Philly beef flat, said in pounds');
r=q(philly,3,'lb'); is(r.needsUnitSize,true,'a bare each in pounds asks');
near(q(philly,3,'lb',{unitMultiplier:review.foodUnitSizeQuestion(philly,'lb').multiplier(10)}).qty,0.3,'3 lb of a 10 lb flat');
// Cases keep their meaning.
r=q(gloves,5,'box'); is(r.needsUnitSize,true,'boxes of a case-counted item ask');
near(q(gloves,5,'box',{unitMultiplier:review.foodUnitSizeQuestion(gloves,'box').multiplier(10)}).qty,0.5,'five boxes at ten a case');

console.log(`${checks} package-size question assertions passed.`);
