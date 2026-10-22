/** Render the real shared form with Jingle presentation. No network or storage. */
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const source=`
import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import FormRenderer from './src/components/tprs/FormRenderer';
import {jingleReviewConfig} from './src/components/tprs/jingle/config';
const base={helpText:'',placeholder:'',required:true,options:[],minSelections:null,maxSelections:null,countSource:null,countDivisor:null,perUnitMulti:false,perUnitRole:null,baseOption:null,displayOrder:0,visibleWhenFieldId:null,visibleWhenValues:[]};
const pizza={...base,id:'pizza',fieldType:'per_unit_select',label:'Which pizza would you like?',helpText:'Please select one pizza for each lane reserved.',options:['Cheese','Pepperoni','Sausage','Half cheese / half pepperoni','Half pepperoni / half sausage'],countSource:'lane_count',countDivisor:1,perUnitRole:'pizza'};
const pitcher={...base,id:'pitcher',displayOrder:1,fieldType:'per_unit_select',label:'Which soft drink would you like?',helpText:'Each lane includes one pitcher of soft drink. Refills are not included.',options:['Pepsi','Diet Pepsi','Starry','Pink Lemonade','Orange Crush','Dr. Pepper','Mountain Dew','Mug Root Beer'],countSource:'lane_count',countDivisor:1,perUnitRole:'pitcher'};
const blocks=[
 ['Reservation times','Arrive on time for your selected reservation. If you arrive early, your lane may still be in use or being prepared. Bowling starts and ends at the reserved times, including after a late arrival.'],
 ['Your visit with Santa','Staff coordinate visits by lane. Enjoy your lane until your group is called. Santa hours are still being finalized for this rehearsal.'],
 ['When your bowling time ends','Please clear the lane, seating and belongings for the next group. Arcade and waiting-area access afterward is subject to the final closing time.'],
 ['Photos on your device','Santa photos are included. Bring a charged phone or camera. Our team can help take a whole-family photo using your device.'],
 ['Hot cocoa and cookies','Enjoy the self-serve station during the event. Please help keep it tidy and let staff know if it needs attention.'],
 ['Guest counts','Each Traditional lane accommodates up to 5 total guests. Everyone attending counts, including guests who are not bowling.'],
 ['Outside items','Outside food, beverages, cakes, decorations and presents are not permitted.'],
];
const info=blocks.map(([label,helpText],i)=>({...base,id:'info-'+i,displayOrder:i+2,fieldType:'rich_text',label,required:false,helpText}));
const ack={...base,id:'ack',displayOrder:9,fieldType:'checkbox',label:'I have read and agree to the Jingle Bowl reservation information above, including the scheduled bowling end time, lane-clearing requirements, and outside-item policy.'};
const form={id:'form',title:'Jingle Bowl reservation details',thankYouCopy:'',fields:[pizza,pitcher,...info,ack]};
const props={productId:'c0d96e76-cbfc-4e5b-98ec-cddac2fd9106',productCode:9106,definitions:[form],answers:[],onAnswersChange:()=>{},unitQuantities:{guest_count:0,lane_count:2},pairedProductCodes:[9106,9107],pairedPresentation:jingleReviewConfig.pairedPresentation};
const markup=renderToStaticMarkup(<FormRenderer {...props}/>);
assert.equal((markup.match(/class="tprs-nye-pair"/g)||[]).length,2);
assert.match(markup,/Lane 1 of 2/);assert.match(markup,/Lane 2 of 2/);
assert.match(jingleReviewConfig.foodHelp,/No pitcher refills/);
assert.doesNotMatch(markup,/Refills are not included|Please select one pizza|aria-describedby="pitcher-pair-1-help"/,'Per-lane duplicate helpers are removed');
assert.match(markup,/<legend class="tprs-label">Pizza<span class="sr-only">/);
assert.match(markup,/<label class="tprs-label" for="pitcher-pair-1">Soda<span class="sr-only">/);
assert.match(markup,/Which soft drink would you like/);
assert.equal((markup.match(/Bowling lanes are assigned at the venue/g)||[]).length,1);
assert.equal((markup.match(/class="tprs-richtext"/g)||[]).length,7);
assert.match(markup,/<details class="tprs-reservation-details"><summary>Read full reservation information/);
assert.doesNotMatch(markup,/<details[^>]*open/,'Full details start collapsed');
for(const [label,helpText] of blocks){assert.ok(markup.includes(label));assert.ok(markup.includes(helpText));}
assert.match(markup,/<\\/details><\\/section><div class="tprs-field"><label class="tprs-choice"><input id="ack" type="checkbox"/,'Required acknowledgment stays visible outside full details');
assert.ok(markup.includes(ack.label),'The canonical acknowledgment label stays exact');
assert.doesNotMatch(markup,/Food substitutions|NYE|checked=""/);
assert.equal((markup.match(/type="checkbox"/g)||[]).length,1,'One unchecked acknowledgment for the room form');
const errors=renderToStaticMarkup(<FormRenderer {...props} submitAttempt={1}/>);
assert.match(errors,/aria-describedby="pitcher-pair-1-err"/);
assert.match(errors,/aria-describedby="pizza-pair-2-err"/);
assert.match(errors,/id="ack" type="checkbox" aria-invalid="true" aria-describedby="ack-err"/);
const helperVariant=renderToStaticMarkup(<FormRenderer {...props} pairedPresentation={{...jingleReviewConfig.pairedPresentation,showFieldHelp:true}}/>);
assert.match(helperVariant,/<p class="tprs-help" id="pizza-pair-1-help">[^]*?<\\/p><div class="tprs-choice-grid"><label/,'Optional helper presentation remains outside the choices grid');
assert.match(helperVariant,/aria-describedby="pitcher-pair-1-help"/);
const nye=renderToStaticMarkup(<FormRenderer {...props} productCode={124} pairedProductCodes={undefined} pairedPresentation={undefined}/>);
assert.match(nye,/Food substitutions aren&#x27;t available for NYE packages/);
assert.match(nye,/Pizza &amp; pitcher 1 of 2/);
const unconfigured=renderToStaticMarkup(<FormRenderer {...props} pairedProductCodes={undefined}/>);
assert.equal((unconfigured.match(/class="tprs-nye-pair"/g)||[]).length,0,'Synthetic Jingle code is not globally enabled');
assert.doesNotMatch(nye,/tprs-reservation-details|tprs-pair-note/,'NYE does not inherit the optional disclosure');
console.log('Jingle paired form passed: concise per-lane controls, one no-refills note, all seven original blocks in native disclosure, exact visible acknowledgment, accessible errors and unchanged NYE defaults.');
`;
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',external:['react','react-dom/server','react/jsx-runtime'],define:{'import.meta.env':'{}'}});
const module={exports:{}};
new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
