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
const rows=[
  // Spoken is a weight or volume and the counting unit is a package: the headline case.
  ['curds, 3 pounds, counted in bags',bag,'lb','How many lb in one bag?','For a 5 lb bag, enter 5.',5,1/5,'1 bag = 5 lb'],
  ['pounds spelled out',bag,'pounds','How many lb in one bag?','For a 5 lb bag, enter 5.',5,1/5,'1 bag = 5 lb'],
  ['lbs',bag,'LBS','How many lb in one bag?','For a 5 lb bag, enter 5.',5,1/5,'1 bag = 5 lb'],
  ['ounces in a bag',bag,'ounces','How many oz in one bag?','For a 16 oz bag, enter 16.',16,1/16,'1 bag = 16 oz'],
  ['gallons in a pack',{unit:'pack',one:'jug',many:'jugs'},'gallons','How many gal in one jug?',null,2.5,1/2.5,'1 jug = 2.5 gal'],
  ['fluid ounces in a can',{unit:'each',one:'can',many:'cans'},'fl oz','How many fl oz in one can?',null,12,1/12,'1 can = 12 fl oz'],
  ['grams in a bag',bag,'grams','How many g in one bag?',null,500,1/500,'1 bag = 500 g'],
  // Counted in cases: the case is always the bigger one.
  ['case, pounds',cases,'lb','How many lb in one case?','For a 5 lb case, enter 5.',10,1/10,'1 case = 10 lb'],
  ['case, boxes',cases,'box','How many boxes in one case?',null,10,1/10,'1 case = 10 boxes'],
  ['case, bag',cases,'bag','How many bags in one case?',null,2,1/2,'1 case = 2 bags'],
  ['case labelled tub, gallons',{unit:'case',one:'tub',many:'tubs'},'gal','How many gal in one tub?',null,5,1/5,'1 tub = 5 gal'],
  // The spoken unit is the bigger container: the counting unit per spoken unit, as before.
  ['buns by the tray',bun,'tray','How many buns in one tray?',null,12,12,'1 tray = 12 buns'],
  ['trays, as heard',bun,'trays','How many buns in one tray?',null,12,12,'1 tray = 12 buns'],
  ['an unlisted container word, plural',bun,'racks','How many buns in one rack?',null,8,8,'1 rack = 8 buns'],
  ['plain each by the packet',each,'packet','How many in one packet?',null,25,25,'1 packet = 25 each'],
  ['bags by the box',bag,'box','How many bags in one box?',null,6,6,'1 box = 6 bags'],
  ['pounds counted, bags said',lb,'bag','How many lb in one bag?','For a 5 lb bag, enter 5.',5,5,'1 bag = 5 lb'],
  ['gallons counted, jugs said',gal,'jug','How many gal in one jug?',null,5,5,'1 jug = 5 gal'],
  ['plain each, pounds said',each,'lb','How many in one lb?',null,4,4,'1 lb = 4 each'],
  // The item's own noun said for a package-counted product: the pieces are inside the package.
  ['shells in a bag',bag,'shell','How many shells in one bag?',null,25,1/25,'1 bag = 25 shells'],
  ['patties in a pack',{unit:'pack',one:'pack',many:'packs'},'patty','How many patties in one pack?',null,10,1/10,'1 pack = 10 patties'],
  ['pieces in a bag',bag,'pieces','How many pieces in one bag?',null,40,1/40,'1 bag = 40 pieces'],
  ['pieces in a bag, singular once',bag,'piece','How many pieces in one bag?',null,1,1,'1 bag = 1 piece'],
  // Two measures: the bigger holds the smaller.
  ['pounds counted, gallons said',lb,'gal','How many lb in one gal?',null,8,8,'1 gal = 8 lb'],
  ['gallons counted, pounds said',gal,'lb','How many lb in one gal?',null,8,1/8,'1 gal = 8 lb'],
  ['pounds counted, grams said',lb,'grams','How many g in one lb?',null,454,1/454,'1 lb = 454 g'],
  ['grams counted, pounds said',{unit:'each',one:'g',many:'g'},'lb','How many g in one lb?',null,454,454,'1 lb = 454 g'],
];
for (const [name,count,spoken,question,example,typed,multiplier,said] of rows) {
  const ask=size.foodUnitSizeAsk(count,spoken);
  is(ask.question,question,`${name}: question`);
  is(ask.example,example,`${name}: example`);
  near(ask.multiplier(typed),multiplier,`${name}: multiplier`);
  is(ask.said(ask.multiplier(typed)),said,`${name}: said back`);
}

// ---- what a typed number means: the numbers the screen used to produce ---------
// Unchanged where the spoken unit is the bigger container or the unit is cases.
near(size.foodUnitSizeAsk(each,'packet').multiplier(25)*4,100,'four packets of 25 = 100 each');
near(size.foodUnitSizeAsk({unit:'case',one:'case',many:'cases'},'box').multiplier(10)*5,0.5,'five boxes at ten a case = half a case');
// New where the counting unit is the bigger package: 3 lb in 5 lb bags is 0.6 bag.
near(size.foodUnitSizeAsk(bag,'lb').multiplier(5)*3,0.6,'three pounds in 5 lb bags = 0.6 bag');

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
for (const [count,spoken] of [['gal','oz'],['lb','gal'],['lb','floz'],['lb','kg'],['lb','grams'],['gal','l'],['lb','lb'],['bag','lb'],['each','oz'],['bag','bag'],['lb','bag']])
  is(m(count,spoken),null,`${count} counted, ${spoken} said: not plain physics`);

// ---- the review row, end to end through the real quantity function -------------
const definition=(countUnit,unitsPerCase,extra)=>({countUnit,unitsPerCase,confirmedBy:'QA',confirmedAt:'2026-10-14',...extra});
const curds={id:'curds',name:'Cheese Curds',countUnit:'pack',unitsPerCase:2,
  countDefinition:definition('pack',2,{unitLabel:'bag',spokenUnits:{case:2,bag:1}})};
const carnitas={id:'carnitas',name:'Pork Carnitas',countUnit:'lb',unitsPerCase:null,countDefinition:definition('lb',null,{unitLabel:'lb',spokenUnits:{bag:5,lb:1}})};
const syrup={id:'syrup',name:'Fryer Oil',countUnit:'gal',unitsPerCase:null,countDefinition:definition('gal',null,{unitLabel:'gal',spokenUnits:{jug:3,gal:1}})};
const gloves={id:'gloves',name:'Gloves',countUnit:'case',unitsPerCase:null};
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
is(review.foodUnitSizeAnswered(row(curds,3,'lb',{unitMultiplier:answered}),curds),true,'an asked answer is recognised');
is(review.foodUnitSizeAnswered(row(curds,3,'bag',{unitMultiplier:1}),curds),false,'a same-unit one is not an answer');
is(review.foodUnitSizeAnswered(row(curds,3,'lb'),curds),false,'no answer yet');
// A catalog entry for pounds is never overridden.
r=q({...curds,countDefinition:definition('pack',2,{unitLabel:'bag',spokenUnits:{case:2,bag:1,lb:0.2}})},3,'lb');
is(r.needsUnitSize,false,'a pound entry answers it'); near(r.qty,0.6,'catalog pound entry');
// Pounds counted, ounces said: no question.
r=q(carnitas,8,'ounces'); is([r.needsUnitSize,r.ready],[false,true],'8 ounces of a pound-counted item'); near(r.qty,0.5,'8 oz = 0.5 lb');
r=q(carnitas,8,'oz'); near(r.qty,0.5,'8 oz');
r=q(carnitas,3,'pounds'); near(r.qty,3,'pounds said, pounds counted');
r=q(carnitas,2,'bag'); near(r.qty,10,'catalog bag entry unchanged');
r=q(syrup,2,'quarts'); is(r.needsUnitSize,false,'quarts of a gallon item'); near(r.qty,0.5,'2 qt = 0.5 gal');
r=q(syrup,16,'fl oz'); near(r.qty,0.125,'16 fl oz = 0.125 gal');
r=q(syrup,3,'oz'); is(r.needsUnitSize,true,'a bare "oz" on a gallon item is not guessed');
r=q(carnitas,3,'gal'); is(r.needsUnitSize,true,'weight and volume still ask');
is(review.foodUnitSizeQuestion(carnitas,'gal').question,'How many lb in one gal?','pounds per gallon');
// Cases keep their meaning.
r=q(gloves,5,'box'); is(r.needsUnitSize,true,'boxes of a case-counted item ask');
near(q(gloves,5,'box',{unitMultiplier:review.foodUnitSizeQuestion(gloves,'box').multiplier(10)}).qty,0.5,'five boxes at ten a case');

console.log(`${checks} package-size question assertions passed.`);
