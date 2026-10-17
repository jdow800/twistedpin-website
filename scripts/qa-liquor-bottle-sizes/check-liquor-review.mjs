// Run: node scripts/qa-liquor-bottle-sizes/check-liquor-review.mjs
// Native Chromium against actual CountLiquor, controlled recorder, fictional
// inventory. Fetch mocking plus CDP request blocking prevent external traffic.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const require=createRequire(new URL('../../package.json',import.meta.url));
const esbuild=require('esbuild');
const root=fileURLToPath(new URL('../../',import.meta.url));
const here=fileURLToPath(new URL('./',import.meta.url));
const out=here+'dist/liquor-review/';
await mkdir(out,{recursive:true});
await esbuild.build({entryPoints:[here+'liquor-review-fixture.jsx'],outfile:out+'fixture.js',bundle:true,
  jsx:'automatic',platform:'browser',nodePaths:[root+'node_modules'],
  define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'},
  plugins:[{name:'controlled-recorder',setup(build){build.onResolve({filter:/^\.\.\/useRecorderDictation$/},()=>({path:here+'liquor-recorder-fixture.jsx'}));}}]});
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const asset=path==='/fixture.js'?'fixture.js':path==='/fixture.css'?'fixture.css':null;
  res.setHeader('Content-Type',asset?.endsWith('.js')?'text/javascript':asset?'text/css':'text/html');
  res.end(asset?await readFile(out+asset):'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#0e0a1f}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/`,b=await browser();
const results={scenarios:[],failures:[],screens:[],assertions:[],blocked:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const js=e=>b.evaluate(e),q=s=>`document.querySelector(${JSON.stringify(s)})`;
const until=e=>b.until(e);
const run=async(name,fn)=>{try{await fn();results.scenarios.push(name);console.log('PASS',name);}catch(e){results.failures.push({name,error:String(e.stack||e)});console.log('FAIL',name,e.message);}};
const check=async(name,e)=>{assert.ok(await js(`!!(${e})`),name);results.assertions.push(name);};
async function load(query=''){
  const old=await js('window.liquorQa?.nonce');await b.send('Page.navigate',{url:base+query});
  await until(`window.liquorQa?.nonce&&window.liquorQa.nonce!==${JSON.stringify(old??null)}`);
  // The saved draft opens on the resume prompt (2026-10-07).
  await until("document.querySelector('.lq-count-entry')||document.querySelectorAll('.lq-zone').length===2");
  await js("[...document.querySelectorAll('.lq-count-entry button')].find(e=>e.textContent.trim()==='Continue count')?.click()");
  await until("document.querySelectorAll('.lq-zone').length===2");
  await js("[...document.querySelectorAll('.lq-zone')].find(e=>e.textContent.includes('Giant Bottle Shelf')).click()");
  await until("document.querySelector('.lq-captured .lq-row')");
}
async function touch(selector){await until(q(selector));await js(`${q(selector)}.scrollIntoView({block:'center',behavior:'instant'})`);
  const p=await js(`(()=>{const e=${q(selector)},r=e.getBoundingClientRect();if(e.disabled)throw Error('Disabled touch action');return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(70);}
async function button(pattern,scope='document'){
  await js(`(()=>{const e=[...${scope}.querySelectorAll('button')].find(e=>e.getClientRects().length&&new RegExp(${JSON.stringify(pattern.source)}).test(e.textContent.trim()));if(!e||e.disabled)throw Error('Unavailable button '+${JSON.stringify(pattern.source)});e.click()})()`);await pause(30);
}
async function input(selector,value){await until(q(selector));await js(`(()=>{const e=${q(selector)};e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(30);await js(`${q(selector)}.blur()`);await pause(30);}
async function select(selector,value){await until(q(selector));await js(`(()=>{const e=${q(selector)};e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(30);}
const saved=`window.liquorQa.lines`;
async function savedLine(sku,zone,predicate){await until(`${saved}.some(l=>l.skuId===${JSON.stringify(sku)}&&l.zoneId===${JSON.stringify(zone)}&&(${predicate}))`);}
async function finish(){await button(/^Finish count$/);await until("document.querySelector('.lq-confirm')");}
async function detail(sku){const selector=`.lq-precheck-row[data-qa-finding="${sku}"]`;await js(`(()=>{const row=[...document.querySelectorAll('.lq-precheck-row')].find(e=>e.querySelector('.lq-review-count-row[data-sku-id="${sku}"]'));if(!row)throw Error('Missing finding '+${JSON.stringify(sku)});row.dataset.qaFinding=${JSON.stringify(sku)};row.querySelector('details').open=true;})()`);await pause(30);return selector;}
async function rematch(sku,target,scope){await button(/^Change item or size$/,q(scope));await select(`${scope} .lq-review-count-row[data-sku-id="${sku}"] select`,target);}
async function shot(name){await js('document.fonts.ready');await pause(50);const {data}=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(out+name+'.png',Buffer.from(data,'base64'));results.screens.push(name+'.png');}
try{
  await b.send('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});
  await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await run('liquor walk excludes the beer cooler and preserves historical shelf evidence',async()=>{
    await load('?historical-cooler');
    await check('Count screen requests the liquor-only walk',`window.liquorQa.calls.some(c=>c.path.endsWith('/zones')&&c.query.includes('walk=liquor'))`);
    await check('Cooler cannot become a current liquor shelf',`![...document.querySelectorAll('.lq-zone')].some(e=>e.textContent.includes('Walk-In Cooler'))`);
    await finish();const scope=await detail('boylan');
    await check('Historical cooler line keeps its actual location name',`${q(scope)}.textContent.includes('Walk-In Cooler')&&!${q(scope)}.textContent.includes('Saved shelf')`);
    await check('Historical observed zero survives the review save',`${saved}.some(l=>l.skuId==='boylan'&&l.zoneId==='cooler'&&Number(l.qtyUnits)===0)`);
  });
  await run('an older zones API cannot add the cooler back to the liquor walk',async()=>{
    await load('?old-zones');await finish();
    await check('Uncounted cooler is absent from both shelf tiles and submit concerns',`![...document.querySelectorAll('.lq-zone')].some(e=>e.textContent.includes('Walk-In Cooler'))&&!document.querySelector('.lq-confirm').textContent.includes('Walk-In Cooler')`);
  });
  await run('details identify every counted shelf, exact fraction, bottle size and heard phrase',async()=>{
    await load();await finish();const scope=await detail('minsters');
    await check('Minsters details include Giant Bottle Shelf and Speed Rail',`${q(scope)}.textContent.includes('Giant Bottle Shelf')&&${q(scope)}.textContent.includes('Speed Rail')`);
    await check('Saved thousandths remain editable',`${q(scope)}.querySelector('input[aria-label^="Loose"][aria-label$="on Speed Rail"]').value==='0.125'`);
    await check('Heard phrase and actual bottle size are visible',`${q(scope)}.textContent.includes('eleven Minsters small batch')&&${q(scope)}.textContent.includes('1000 ml')`);
    await shot('details-shelves-412');
  });
  await run('direct edit changes only the selected shelf and forces a fresh check',async()=>{
    await load();await finish();await detail('minsters');
    await input('input[aria-label="Loose Minster\'s Small Batch Kentucky Straight Bourbon on Giant Bottle Shelf"]','10');
    await savedLine('minsters','giant','Number(l.qtyUnits)===10');
    await check('Other shelf fraction remains exact',`${saved}.some(l=>l.skuId==='minsters'&&l.zoneId==='speed'&&Number(l.qtyUnits)===0.125)`);
    await check('Dirty review blocks submission',`document.querySelector('.lq-confirm').textContent.includes('Recheck before submitting')&&[...document.querySelectorAll('.lq-confirm button')].some(e=>e.textContent.includes('Submit anyway')&&e.disabled)`);
    await button(/^Recheck count$/);await until("window.liquorQa.calls.filter(c=>c.path.endsWith('/precheck')).length===2&&document.querySelector('.lq-confirm')");
    await check('Recheck keeps dialog open without submitting',`document.querySelector('.lq-confirm')&&!window.liquorQa.calls.some(c=>c.path.endsWith('/submit'))`);
    await button(/^Submit anyway$/);await until("document.body.textContent.includes('Count submitted')");
    await check('Submit uses the fresh fingerprint',`window.liquorQa.calls.find(c=>c.path.endsWith('/submit')).body.checkedLinesHash==='checked2'`);
  });
  await run('clean recheck stays open for a deliberate final submission',async()=>{
    await load('?clean-after-recheck');await finish();await detail('jameson');
    await input('input[aria-label="Loose Jameson Irish Whiskey on Speed Rail"]','0.7');await savedLine('jameson','speed','Number(l.qtyUnits)===0.7');
    await button(/^Recheck count$/);await until("window.liquorQa.calls.filter(c=>c.path.endsWith('/precheck')).length===2&&!document.querySelector('.lq-precheck-row')");
    await check('Clean result never auto-submits',`document.querySelector('.lq-confirm')&&!window.liquorQa.calls.some(c=>c.path.endsWith('/submit'))`);
  });
  await run('Details edit then Go back and Finish still opens a clean fresh confirmation',async()=>{
    await load('?clean-after-recheck');await finish();await detail('minsters');
    await input('input[aria-label="Loose Minster\'s Small Batch Kentucky Straight Bourbon on Giant Bottle Shelf"]','10');
    await button(/^Go back$/);await button(/^Finish count$/);await until("window.liquorQa.calls.filter(c=>c.path.endsWith('/precheck')).length===2&&document.querySelector('.lq-confirm')");
    await check('Returning to the count cannot silently submit a clean recheck',`!window.liquorQa.calls.some(c=>c.path.endsWith('/submit'))&&!document.querySelector('.lq-confirm .lq-precheck-row')`);
    await button(/^Submit the count$/);await until("document.body.textContent.includes('Count submitted')");
    await check('Explicit final action submits the fresh fingerprint',`window.liquorQa.calls.find(c=>c.path.endsWith('/submit')).body.checkedLinesHash==='checked2'`);
  });
  await run('case-only edit preserves its frozen multiplier and explicit zero',async()=>{
    await load();await finish();await detail('boylan');
    await input('input[aria-label="Cases of Boylan Black Cherry on Giant Bottle Shelf"]','1.5');await savedLine('boylan','giant','Number(l.qtyUnits)===36&&l.enteredCases===1.5&&l.caseSizeAtEntry===24');
    await input('input[aria-label="Loose Boylan Black Cherry on Giant Bottle Shelf"]','0');
    await check('Case-only total stays 36, without adding cases twice',`${saved}.some(l=>l.skuId==='boylan'&&Number(l.qtyUnits)===36&&l.enteredCases===1.5)`);
    await check('Unrelated explicit zero survives replacement payload',`${saved}.some(l=>l.skuId==='jaeger'&&Number(l.qtyUnits)===0)`);
  });
  await run('blank and negative review answers cannot erase a saved quantity',async()=>{
    await load();await finish();await detail('minsters');
    const field='input[aria-label="Loose Minster\'s Small Batch Kentucky Straight Bourbon on Giant Bottle Shelf"]';
    await input(field,'');await input(field,'-2');await pause(900);
    await check('Invalid answers preserve the eleven count',`${saved}.some(l=>l.skuId==='minsters'&&l.zoneId==='giant'&&Number(l.qtyUnits)===11)`);
    await input(field,'0');await savedLine('minsters','giant','Number(l.qtyUnits)===0');
    await check('Literal zero is accepted explicitly',`${saved}.some(l=>l.skuId==='minsters'&&l.zoneId==='giant'&&Number(l.qtyUnits)===0)`);
  });
  await run('wrong identity moves Jameson to Orange without changing any other shelf',async()=>{
    await load();await finish();const scope=await detail('jameson');await rematch('jameson','orange',scope);await button(/^Move count$/,q(scope));
    await savedLine('orange','giant','Number(l.qtyUnits)===0.7');
    await check('Source identity disappears only from its original shelf',`!${saved}.some(l=>l.skuId==='jameson'&&l.zoneId==='giant')&&${saved}.some(l=>l.skuId==='jameson'&&l.zoneId==='speed'&&Number(l.qtyUnits)===7)`);
    await check('Moved destination stays available under the existing finding',`${q(scope)}.querySelector('[data-sku-id="orange"]')?.textContent.includes('Jameson Orange')`);
  });
  await run('a second identity correction stays attached to the original review finding',async()=>{
    await load();await finish();const scope=await detail('jameson');await rematch('jameson','orange',scope);await button(/^Move count$/,q(scope));
    await savedLine('orange','giant','Number(l.qtyUnits)===0.7');await rematch('orange','herradura750',scope);await button(/^Move count$/,q(scope));
    await savedLine('herradura750','giant','Number(l.qtyUnits)===0.7');
    await check('Second destination remains editable under the initial finding',`${q(scope)}.querySelector('[data-sku-id="herradura750"]')?.textContent.includes('Herradura Reposado')&&!${saved}.some(l=>l.zoneId==='giant'&&(l.skuId==='orange'||l.skuId==='jameson'))`);
  });
  await run('wrong bottle size moves a 1 L count to 750 ml in family details',async()=>{
    await load();await finish();const scope=await detail('herradura1l');await rematch('herradura1l','herradura750',scope);await button(/^Move count$/,q(scope));
    await savedLine('herradura750','giant','Number(l.qtyUnits)===2');
    await check('Wrong size source removed without rescaling physical bottles',`!${saved}.some(l=>l.skuId==='herradura1l')&&${q(scope)}.textContent.includes('750 ml')`);
  });
  for(const mode of ['add','replace'])await run(`existing target requires explicit ${mode} choice`,async()=>{
    await load('?collision=compatible');await finish();const scope=await detail('jameson');
    const before=await js("window.liquorQa.calls.filter(c=>c.path.endsWith('/lines')).length");await rematch('jameson','orange',scope);
    await check('Selecting an existing target cannot save on its own',`window.liquorQa.calls.filter(c=>c.path.endsWith('/lines')).length===${before}&&${q(scope)}.textContent.includes('Choose how to correct it')`);
    await button(mode==='add'?/^Add to existing count/:/^Replace existing count/,q(scope));
    await savedLine('orange','giant',mode==='add'?'Number(l.qtyUnits)===27&&l.enteredCases===2&&l.caseSizeAtEntry===12':'Number(l.qtyUnits)===14&&l.enteredCases===1&&l.caseSizeAtEntry===12');
    await check('Explicit correction removes the wrong source',`!${saved}.some(l=>l.skuId==='jameson'&&l.zoneId==='giant')`);
  });
  await run('different frozen case sizes add truthful loose units',async()=>{
    await load('?collision=conflicting');await finish();const scope=await detail('jameson');await rematch('jameson','orange',scope);
    await check('Conflict is explained before applying',`${q(scope)}.textContent.includes('case sizes differ')`);
    await button(/^Add to existing count/,q(scope));await savedLine('orange','giant','Number(l.qtyUnits)===39&&l.enteredCases==null&&l.caseSizeAtEntry==null');
  });
  for(const surface of ['Details','count screen'])await run(`frozen case size survives zero prefixes and readding on ${surface}`,async()=>{
    await load('?frozen-moved');await finish();const scope=await detail('jameson');await rematch('jameson','orange',scope);await button(/^Move count$/,q(scope));
    await savedLine('orange','giant','Number(l.qtyUnits)===14&&l.enteredCases===1&&l.caseSizeAtEntry===12');
    if(surface==='count screen'){await button(/^Go back$/);await input('input[aria-label="Search counted items and catalog"]','Jameson Orange');}
    const cases=surface==='Details'?`${scope} input[aria-label="Cases of Jameson Orange on Giant Bottle Shelf"]`:'.lq-captured .lq-case-input';
    const loose=surface==='Details'?`${scope} input[aria-label="Loose Jameson Orange on Giant Bottle Shelf"]`:'input[aria-label="Loose Jameson Orange"]';
    await input(cases,'0');await savedLine('orange','giant','Number(l.qtyUnits)===2&&l.enteredCases==null');
    await input(loose,'0');await savedLine('orange','giant','Number(l.qtyUnits)===0');await input(loose,'2');
    await input(cases,'0.5');await savedLine('orange','giant','Number(l.qtyUnits)===8&&l.enteredCases===0.5&&l.caseSizeAtEntry===12');
    await check('Half a case remains six bottles plus the two loose',`${saved}.some(l=>l.skuId==='orange'&&Number(l.qtyUnits)===8&&l.caseSizeAtEntry===12)`);
    await input(cases,'0');await input(cases,'1');await savedLine('orange','giant','Number(l.qtyUnits)===14&&l.enteredCases===1&&l.caseSizeAtEntry===12');
    await check('Zero then readd restores the old frozen case size',`${saved}.some(l=>l.skuId==='orange'&&Number(l.qtyUnits)===14&&l.enteredCases===1&&l.caseSizeAtEntry===12)`);
  });
  await run('frozen zero-case memo survives adoption after an unrelated save conflict',async()=>{
    await load('?frozen-moved');await finish();const scope=await detail('jameson');await rematch('jameson','orange',scope);await button(/^Move count$/,q(scope));
    await savedLine('orange','giant','Number(l.qtyUnits)===14&&l.enteredCases===1&&l.caseSizeAtEntry===12');await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    await js('window.liquorQa.refuseSave=true');const cases=`${scope} input[aria-label="Cases of Jameson Orange on Giant Bottle Shelf"]`;
    await input(cases,'0');await savedLine('orange','giant','Number(l.qtyUnits)===2&&l.enteredCases==null');await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    await check('Unrelated remote edit merged before case reentry',`${saved}.some(l=>l.skuId==='makers'&&Number(l.qtyUnits)===8)`);
    await input(cases,'0.5');await savedLine('orange','giant','Number(l.qtyUnits)===8&&l.enteredCases===0.5&&l.caseSizeAtEntry===12');
    await check('Adopting wire case zero retains the local frozen twelve',`${saved}.some(l=>l.skuId==='orange'&&Number(l.qtyUnits)===8&&l.caseSizeAtEntry===12)`);
  });
  await run('native case plus and minus retain the frozen stamp after zero-case conflict adoption',async()=>{
    await load('?frozen-moved');await finish();const scope=await detail('jameson');await rematch('jameson','orange',scope);await button(/^Move count$/,q(scope));
    await savedLine('orange','giant','Number(l.qtyUnits)===14&&l.caseSizeAtEntry===12');await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    await button(/^Go back$/);await input('input[aria-label="Search counted items and catalog"]','Jameson Orange');await js('window.liquorQa.refuseSave=true');
    await input('.lq-captured .lq-case-input','0');await savedLine('orange','giant','Number(l.qtyUnits)===2&&l.enteredCases==null');await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    const more='.lq-captured .lq-case-stepper button[aria-label="One more case"]',fewer='.lq-captured .lq-case-stepper button[aria-label="One fewer case"]';
    await touch(more);await savedLine('orange','giant','Number(l.qtyUnits)===14&&l.enteredCases===1&&l.caseSizeAtEntry===12');
    await touch(fewer);await savedLine('orange','giant','Number(l.qtyUnits)===2&&l.enteredCases==null');
    await touch(more);await savedLine('orange','giant','Number(l.qtyUnits)===14&&l.enteredCases===1&&l.caseSizeAtEntry===12');
    await check('Touch zero and readd use twelve instead of catalog twenty-four',`${saved}.some(l=>l.skuId==='orange'&&Number(l.qtyUnits)===14&&l.caseSizeAtEntry===12)`);
  });
  await run('a fresh remote positive case memo supersedes an untouched local zero-case stamp',async()=>{
    await load('?frozen-moved');await finish();const scope=await detail('jameson');await rematch('jameson','orange',scope);await button(/^Move count$/,q(scope));
    await savedLine('orange','giant','Number(l.qtyUnits)===14&&l.caseSizeAtEntry===12');await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    const cases=`${scope} input[aria-label="Cases of Jameson Orange on Giant Bottle Shelf"]`;await input(cases,'0');await savedLine('orange','giant','Number(l.qtyUnits)===2&&l.enteredCases==null');await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    await detail('minsters');await js("window.liquorQa.refuseSave='remote-positive-case'");await input('input[aria-label="Loose Minster\'s Small Batch Kentucky Straight Bourbon on Giant Bottle Shelf"]','10');
    await savedLine('orange','giant','Number(l.qtyUnits)===26&&l.enteredCases===1&&l.caseSizeAtEntry===24');await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    await input(cases,'0.5');await savedLine('orange','giant','Number(l.qtyUnits)===14&&l.enteredCases===0.5&&l.caseSizeAtEntry===24');
    await check('Actual remote case memo wins over the obsolete local zero stamp',`${saved}.some(l=>l.skuId==='orange'&&Number(l.qtyUnits)===14&&l.caseSizeAtEntry===24)&&${saved}.some(l=>l.skuId==='minsters'&&l.zoneId==='giant'&&Number(l.qtyUnits)===10)`);
  });
  await run('a loose voice addition retains the frozen stamp of a zero-case cell',async()=>{
    await load('?frozen-moved&pausecuts=0');await finish();const scope=await detail('jameson');await rematch('jameson','orange',scope);await button(/^Move count$/,q(scope));
    await savedLine('orange','giant','Number(l.qtyUnits)===14&&l.caseSizeAtEntry===12');await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    await input(`${scope} input[aria-label="Cases of Jameson Orange on Giant Bottle Shelf"]`,'0');await savedLine('orange','giant','Number(l.qtyUnits)===2&&l.enteredCases==null');await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    await button(/^Go back$/);await input('input[aria-label="Search counted items and catalog"]','Jameson Orange');await button(/Record count for/);
    await js("window.liquorQa.recorder.segment('one Jameson Orange.',0)");await until('window.liquorQa.extracts.length===1');
    await js("window.liquorQa.extracts[0].succeed([{spoken:'one Jameson Orange',cases:0,units:1,qty:1,unitsPerCase:24,needsCaseSize:false,suspectPreMultiplied:false,match:{id:'orange',name:'Jameson Orange',sizeMl:750},candidates:[]}])");
    await button(/Stop & review/);await js("window.liquorQa.recorder.finish('one Jameson Orange')");await until("document.querySelector('.lq-sheet')");await button(/^More:/);await button(/^Add 1/);
    await savedLine('orange','giant','Number(l.qtyUnits)===3&&l.enteredCases==null');await input('.lq-captured .lq-case-input','0.5');await savedLine('orange','giant','Number(l.qtyUnits)===9&&l.enteredCases===0.5&&l.caseSizeAtEntry===12');
    await check('One loose voice bottle plus half a frozen twelve-case saves nine',`${saved}.some(l=>l.skuId==='orange'&&Number(l.qtyUnits)===9&&l.caseSizeAtEntry===12)`);
  });
  await run('count search filters fifty rows and separates uncounted catalog hits',async()=>{
    await load();const field='input[aria-label="Search counted items and catalog"]';
    await input(field,'Jameson');await check('Search shows counted Jameson once',`document.querySelectorAll('.lq-captured .lq-row').length===1&&document.querySelector('.lq-captured .lq-name').textContent.includes('Jameson Irish Whiskey')`);
    await check('Only uncounted Orange appears in add results',`document.querySelectorAll('.lq-searchlist .lq-row').length===1&&document.querySelector('.lq-searchlist').textContent.includes('Jameson Orange')`);
    await input(field,'jager');await check('Accent-insensitive search finds the counted item',`document.querySelectorAll('.lq-captured .lq-row').length===1&&document.querySelector('.lq-captured').textContent.includes('Jägermeister')`);
    await input(field,'definitely absent item');await check('No matches explains the empty filter',`!document.querySelector('.lq-captured .lq-row')&&document.body.textContent.includes('No counted items match')`);
    await button(/^Clear search$/);await check('Clear restores all captured items',`document.querySelectorAll('.lq-captured .lq-row').length===51`);
    await input(field,'Jameson');await button(/^Speed Rail/);await check('Changing shelves clears the filter',`${q(field)}.value===''&&document.querySelectorAll('.lq-captured .lq-row').length===2`);
  });
  await run('open count screen targets the finding shelf and filter',async()=>{
    await load();await finish();const scope=await detail('minsters');await button(/^Open on count screen$/,q(scope));
    await check('Jump opens the counted shelf and selected bottle',`!document.querySelector('.lq-confirm')&&document.querySelector('.lq-zone-on').textContent.includes('Giant Bottle Shelf')&&document.querySelector('input[aria-label="Search counted items and catalog"]').value.includes('Minster')&&document.querySelectorAll('.lq-captured .lq-row').length===1`);
  });
  for(const [first,value] of [['0','0.7'],['1','12']])await run(`typing new catalog quantity ${value} keeps its field mounted and focused`,async()=>{
    await load();await input('input[aria-label="Search counted items and catalog"]','Jameson');
    const field='input[aria-label="Loose Jameson Orange"]';
    await js(`(()=>{const e=${q(field)};window.__qaEditingInput=e;e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(first)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(70);
    await check('First character keeps the active catalog field',`${q(field)}===window.__qaEditingInput&&document.activeElement===window.__qaEditingInput`);
    await js(`(()=>{const e=${q(field)};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(70);
    await check('Complete quantity retains focus and exact typed value',`${q(field)}===window.__qaEditingInput&&document.activeElement===window.__qaEditingInput&&${q(field)}.value===${JSON.stringify(value)}`);
    await js(`${q(field)}.blur()`);await savedLine('orange','giant',`Number(l.qtyUnits)===${Number(value)}`);
    await check('Active catalog editor has no captured duplicate',`document.querySelectorAll('input[aria-label="Loose Jameson Orange"]').length===1`);
  });
  await run('failed review save blocks recheck and submit until explicit retry',async()=>{
    await load();await finish();await detail('minsters');await js('window.liquorQa.failSave=true');
    await input('input[aria-label="Loose Minster\'s Small Batch Kentucky Straight Bourbon on Giant Bottle Shelf"]','8');
    await button(/^Recheck count$/);await until("[...document.querySelectorAll('button')].some(e=>e.textContent==='Retry save')");
    await check('Failed save does not run a stale second check or submit',`window.liquorQa.calls.filter(c=>c.path.endsWith('/precheck')).length===1&&!window.liquorQa.calls.some(c=>c.path.endsWith('/submit'))`);
    await js('window.liquorQa.failSave=false');await button(/^Retry save$/);await savedLine('minsters','giant','Number(l.qtyUnits)===8');
  });
  await run('stale review save merges another phone before the fresh check',async()=>{
    await load();await finish();await detail('minsters');await js('window.liquorQa.refuseSave=true');
    await input('input[aria-label="Loose Minster\'s Small Batch Kentucky Straight Bourbon on Giant Bottle Shelf"]','10');
    await button(/^Recheck count$/);await until("window.liquorQa.calls.filter(c=>c.path.endsWith('/precheck')).length===2");
    await check('Local correction and unrelated concurrent edit both reach recheck',`${saved}.some(l=>l.skuId==='minsters'&&l.zoneId==='giant'&&Number(l.qtyUnits)===10)&&${saved}.some(l=>l.skuId==='makers'&&Number(l.qtyUnits)===8)`);
    await check('Concurrent recheck never submits automatically',`!window.liquorQa.calls.some(c=>c.path.endsWith('/submit'))`);
  });
  for(const conflict of ['target-created','target-changed','source-changed'])await run(`remap conflict ${conflict} requires a fresh explicit correction`,async()=>{
    await load(conflict==='target-changed'?'?collision=compatible':'');await finish();const scope=await detail('jameson');
    await js(`window.liquorQa.remapConflict=${JSON.stringify(conflict)}`);await rematch('jameson','orange',scope);
    await button(conflict==='target-changed'?/^Add to existing count/:/^Move count$/,q(scope));
    await until('window.liquorQa.releaseConflict');
    const saves=await js("window.liquorQa.calls.filter(c=>c.path.endsWith('/lines')).length");
    await js('window.liquorQa.releaseConflict()');await until("document.querySelector('.lq-confirm').textContent.includes('Item correction needs another look')");await pause(900);
    await check('Conflicting endpoints are never silently retried',`window.liquorQa.calls.filter(c=>c.path.endsWith('/lines')).length===${saves}&&window.liquorQa.calls.filter(c=>c.path.endsWith('/precheck')).length===1&&!window.liquorQa.calls.some(c=>c.path.endsWith('/submit'))`);
    await js("[...document.querySelectorAll('.lq-confirm button')].find(e=>e.textContent.trim()==='Recheck count')?.click()");await pause(70);
    await check('Recheck cannot bypass the pending item correction',`window.liquorQa.calls.filter(c=>c.path.endsWith('/precheck')).length===1&&window.liquorQa.calls.filter(c=>c.path.endsWith('/lines')).length===${saves}`);
    await check('Wrong source is restored for a fresh decision',`${q(scope)}.querySelector('[data-sku-id="jameson"] input[aria-label^="Loose"][aria-label$="on Giant Bottle Shelf"]').value===${JSON.stringify(conflict==='target-changed'?'2':conflict==='source-changed'?'1.7':'0.7')}`);
    if(conflict!=='source-changed')await check('Fresh destination is preserved until the counter chooses',`${saved}.some(l=>l.skuId==='orange'&&l.zoneId==='giant'&&Number(l.qtyUnits)===${conflict==='target-changed'?18:3})`);
    if(conflict==='target-created'){await js("document.querySelector('.lq-confirm .lq-review-changed[role=alert]').scrollIntoView({block:'start',behavior:'instant'})");await shot('remap-conflict-412');}
    await rematch('jameson','orange',scope);
    if(conflict==='source-changed')await button(/^Move count$/,q(scope));
    else{await check('Fresh target now asks for a collision choice',`${q(scope)}.textContent.includes('Choose how to correct it')`);await button(/^Add to existing count/,q(scope));}
    await savedLine('orange','giant',`Number(l.qtyUnits)===${conflict==='target-changed'?32:conflict==='source-changed'?1.7:3.7}`);
    await check('Only the explicitly reconfirmed correction removes the source',`!${saved}.some(l=>l.skuId==='jameson'&&l.zoneId==='giant')`);
    await button(/^Recheck count$/);await until("window.liquorQa.calls.filter(c=>c.path.endsWith('/precheck')).length===2");
  });
  await run('Keep saved counts discards a paused remap and preserves unrelated edits',async()=>{
    await load();await finish();const scope=await detail('jameson');await js("window.liquorQa.remapConflict='target-created'");
    await rematch('jameson','orange',scope);await button(/^Move count$/,q(scope));await until('window.liquorQa.releaseConflict');
    await detail('minsters');await input('input[aria-label="Loose Minster\'s Small Batch Kentucky Straight Bourbon on Giant Bottle Shelf"]','10');
    await js('window.liquorQa.releaseConflict()');await until("document.querySelector('.lq-confirm').textContent.includes('Item correction needs another look')");
    await button(/^Keep saved counts$/,q('.lq-confirm'));await savedLine('minsters','giant','Number(l.qtyUnits)===10');
    await check('Server source and destination survive abandoning the correction',`${saved}.some(l=>l.skuId==='jameson'&&l.zoneId==='giant'&&Number(l.qtyUnits)===0.7)&&${saved}.some(l=>l.skuId==='orange'&&l.zoneId==='giant'&&Number(l.qtyUnits)===3)`);
    await check('Keeping server endpoints still requires a fresh final check',`[...document.querySelectorAll('.lq-confirm button')].some(e=>e.textContent.includes('Submit anyway')&&e.disabled)&&!window.liquorQa.calls.some(c=>c.path.endsWith('/submit'))`);
    await button(/^Recheck count$/);await until("window.liquorQa.calls.filter(c=>c.path.endsWith('/precheck')).length===2");
  });
  await run('uncertain voice quantity is shown amber and a typed answer replaces it',async()=>{
    await load('?pausecuts=0');await button(/Record count for/);await js("window.liquorQa.recorder.segment('Test bottle one.',0)");await until('window.liquorQa.extracts.length===1');
    await js(`window.liquorQa.extracts[0].succeed([{spoken:'seven Makers Mark',cases:0,units:0.7,qty:0.7,unitsPerCase:12,needsCaseSize:false,suspectPreMultiplied:false,quantityNeedsReview:true,quantityWords:'seven',match:{id:'makers',name:"Maker's Mark",sizeMl:1000},candidates:[]}])`);
    await button(/Stop & review/);await js("window.liquorQa.recorder.finish('seven Makers Mark')");await until("document.querySelector('.lq-sheet')");
    await check('Question shows the quantity words as evidence',`document.querySelector('.lq-sheet').textContent.includes('seven')`);
    await check('Unproved number is in the box with an amber edge',`(e=>e.value==='0.7'&&e.classList.contains('lq-qty-unproved'))(document.querySelector('.lq-sheet input[aria-label^="Total quantity"]'))`);
    await check('The earlier-take question still holds the row',`![...document.querySelectorAll('.lq-sheet button')].some(e=>/^Add 1/.test(e.textContent.trim())&&!e.disabled)`);
    await input('.lq-sheet input[aria-label^="Total quantity"]','7');
    await check('A typed number clears the amber edge',`!document.querySelector('.lq-sheet input[aria-label^="Total quantity"]').classList.contains('lq-qty-unproved')`);
    const restate=await js("[...document.querySelectorAll('.lq-sheet button')].some(e=>/^Recount:/.test(e.textContent.trim()))");
    if(restate)await button(/^Recount:/);
    await button(/^Add 1/);await savedLine('makers','giant','Number(l.qtyUnits)===7');
  });
  await run('blanking or typing a negative voice quantity cannot turn uncertainty into zero',async()=>{
    await load('?pausecuts=0');await button(/Record count for/);await js("window.liquorQa.recorder.segment('Test bottle one.',0)");await until('window.liquorQa.extracts.length===1');
    await js(`window.liquorQa.extracts[0].succeed([{spoken:'seven Makers Mark',cases:0,units:0.7,qty:0.7,unitsPerCase:12,needsCaseSize:false,suspectPreMultiplied:false,quantityNeedsReview:true,quantityWords:'seven',match:{id:'makers',name:"Maker's Mark",sizeMl:1000},candidates:[]}])`);
    await button(/Stop & review/);await js("window.liquorQa.recorder.finish('seven Makers Mark')");await until("document.querySelector('.lq-sheet')");
    const field='.lq-sheet input[aria-label^="Total quantity"]';await input(field,'7');await button(/^Recount:/);await input(field,'');
    await check('Blanked quantity stays unapplied',`![...document.querySelectorAll('.lq-sheet button')].some(e=>/^Add 1/.test(e.textContent.trim())&&!e.disabled)&&!window.liquorQa.calls.some(c=>c.path.endsWith('/lines'))`);
    await input(field,'-2');await check('Negative quantity cannot count as a zero answer',`![...document.querySelectorAll('.lq-sheet button')].some(e=>/^Add 1/.test(e.textContent.trim())&&!e.disabled)`);
    await input(field,'0');await button(/^Add 1/);await savedLine('makers','giant','Number(l.qtyUnits)===0');
  });
  // ── The edit log (TPRS 0226, Website W1): what the voice heard, who changed
  // it, and every quantity change, sent with the next PUT /lines. Nothing on
  // screen changes, so these read the request bodies.
  const EXT='5a1e0000-0000-4000-8000-000000000001',EXT2='5a1e0000-0000-4000-8000-000000000002';
  const voiceRow=(id,name,spoken,units,extra={})=>({spoken,cases:0,units,qty:units,unitsPerCase:12,needsCaseSize:false,
    suspectPreMultiplied:false,quantityNeedsReview:false,quantityWords:'',match:{id,name,sizeMl:1000},candidates:[],...extra});
  const frangelicoTwo=voiceRow('frangelico','Frangelico','Frangelico, two',2,{quantityWords:'two',quantityHeard:'proved'});
  const puts=()=>js("window.liquorQa.calls.filter(c=>c.path.endsWith('/lines')&&c.method==='PUT').map(c=>c.body)");
  const sentEvents=async()=>(await puts()).flatMap(b=>b.events??[]);
  const pick=(e,keys)=>Object.fromEntries(keys.map(k=>[k,e[k]]));
  const note=(name)=>results.assertions.push(name);
  async function voiceTake(query,row,extra={extractionId:EXT}){
    await load(query);await button(/Record count for/);
    await js(`window.liquorQa.recorder.segment(${JSON.stringify(row.spoken+'.')},0)`);await until('window.liquorQa.extracts.length===1');
    await js(`window.liquorQa.extracts[0].succeed([${JSON.stringify(row)}],${JSON.stringify(extra)})`);
    await button(/Stop & review/);await js(`window.liquorQa.recorder.finish(${JSON.stringify(row.spoken)})`);await until("document.querySelector('.lq-sheet')");
  }
  await run('edit log (1): a proved row added untouched sends one voice_apply, as heard',async()=>{
    await voiceTake('?pausecuts=0',frangelicoTwo);
    await button(/^Add 1/);await savedLine('frangelico','giant','Number(l.qtyUnits)===2');
    const events=await sentEvents();
    assert.equal(events.length,1,'one bottle, one event');
    assert.deepEqual(pick(events[0],['kind','zoneId','skuId','beforeQty','afterQty','heardCases','heardUnits','heardQty','editedBy','quantityHeard','quantityWords','restateAnswer','spoken','extractionId','itemIndex']),
      {kind:'voice_apply',zoneId:'giant',skuId:'frangelico',beforeQty:null,afterQty:2,heardCases:0,heardUnits:2,heardQty:2,editedBy:'as_heard',
        quantityHeard:'proved',quantityWords:'two',restateAnswer:null,spoken:'Frangelico, two',extractionId:EXT,itemIndex:0});
    assert.equal(events[0].takeId,await js('window.liquorQa.recorder.takeId()'),'the take id rides along');
    assert.match(events[0].id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.ok(Number.isFinite(Date.parse(events[0].clientAt))&&events[0].clientAt.endsWith('Z'),'clientAt is ISO');
    note('A proved untouched Frangelico two logs heard 2, added 2, as heard, proved, with its extraction row');
  });
  await run('edit log (2): typing 3 over a heard 2 keeps the 2 beside the typed 3',async()=>{
    await voiceTake('?pausecuts=0',frangelicoTwo);
    await input('.lq-sheet input[aria-label^="Total quantity"]','3');
    await button(/^Add 1/);await savedLine('frangelico','giant','Number(l.qtyUnits)===3');
    const events=await sentEvents();
    assert.equal(events.length,1);
    assert.deepEqual(pick(events[0],['kind','editedBy','heardQty','afterQty','quantityHeard']),{kind:'voice_apply',editedBy:'typed',heardQty:2,afterQty:3,quantityHeard:null});
    note('Typed 3 over heard 2 logs editedBy typed, heardQty 2, afterQty 3');
  });
  await run('edit log (3): an amber unclear number added as shown carries unclear',async()=>{
    await voiceTake('?pausecuts=0',voiceRow('citron','Ketel One Citroen','Ketel One Citron, three',3,{quantityNeedsReview:true,quantityWords:'three',quantityHeard:'unclear'}));
    await check('The unproved 3 is in the box with its amber edge (unchanged)',`(e=>e.value==='3'&&e.classList.contains('lq-qty-unproved'))(document.querySelector('.lq-sheet input[aria-label^="Total quantity"]'))`);
    await button(/^Add 1/);await savedLine('citron','giant','Number(l.qtyUnits)===3');
    const events=await sentEvents();
    assert.deepEqual(pick(events[0],['kind','editedBy','quantityHeard','heardQty','afterQty']),{kind:'voice_apply',editedBy:'as_heard',quantityHeard:'unclear',heardQty:3,afterQty:3});
    note('Amber Ketel One Citron three logs quantityHeard unclear, as heard');
  });
  for(const [answer,after] of [['More',56],['Recount',20]])await run(`edit log (${answer==='More'?4:5}): Tito's ${answer} over 36 logs ${after}`,async()=>{
    await voiceTake('?pausecuts=0&titos36',voiceRow('titos',"Tito's Handmade Vodka","Tito's, twenty",20,{quantityWords:'twenty',quantityHeard:'proved'}));
    await button(new RegExp(`^${answer}:`));await button(/^Add 1/);
    await savedLine('titos','giant',`Number(l.qtyUnits)===${after}`);
    const events=await sentEvents();
    // A Recount clears and adds the cell in one tick: one voice_apply, never a
    // clear, and never the stale 36 + 20.
    assert.equal(events.length,1,'one event, no separate clear');
    assert.deepEqual(pick(events[0],['kind','restateAnswer','beforeQty','afterQty','heardQty','editedBy']),
      {kind:'voice_apply',restateAnswer:answer==='More'?'add':'replace',beforeQty:36,afterQty:after,heardQty:20,editedBy:'as_heard'});
    note(`Tito's ${answer} over 36 with 20 heard logs before 36, after ${after}`);
  });
  await run('edit log (6): grid keystrokes 0, 0. and 0.8 are one grid_set',async()=>{
    await load();const field='input[aria-label="Loose Maker\'s Mark"]';
    for(const v of ['0','0.','0.8']){await js(`(()=>{const e=${q(field)};e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(70);}
    await js(`${q(field)}.blur()`);await savedLine('makers','giant','Number(l.qtyUnits)===0.8');
    const events=await sentEvents();
    assert.equal(events.length,1,'three keystrokes, one event');
    assert.deepEqual(pick(events[0],['kind','skuId','beforeQty','afterQty']),{kind:'grid_set',skuId:'makers',beforeQty:0.7,afterQty:0.8});
    note('Typing 0 / 0. / 0.8 over 0.7 logs one grid_set 0.7 → 0.8');
  });
  await run('edit log (7): a refused (409) save resends the same event ids once, then never again',async()=>{
    await load();await js('window.liquorQa.refuseSave=true');
    await input('input[aria-label="Loose Minster\'s Small Batch Kentucky Straight Bourbon"]','10');
    await savedLine('minsters','giant','Number(l.qtyUnits)===10');
    const [refused,retry]=await puts();
    const first=refused.events.map(e=>e.id),second=retry.events.map(e=>e.id);
    assert.deepEqual(pick(refused.events[0],['kind','skuId','beforeQty','afterQty']),{kind:'grid_set',skuId:'minsters',beforeQty:11,afterQty:10});
    assert.deepEqual(second.slice(0,first.length),first,'the retry leads with the same ids');
    const adopt=retry.events.find(e=>e.kind==='merge_adopt');
    assert.deepEqual(pick(adopt,['skuId','zoneId','beforeQty','afterQty']),{skuId:'makers',zoneId:'giant',beforeQty:0.7,afterQty:8},'the other phone\'s change is logged as merge_adopt');
    await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    await input('input[aria-label="Loose Jägermeister"]','1');await savedLine('jaeger','giant','Number(l.qtyUnits)===1');
    const third=(await puts())[2].events;
    assert.deepEqual(third.map(e=>[e.kind,e.skuId]),[['grid_set','jaeger']],'acknowledged events are never sent again');
    assert.equal((await puts()).flatMap(b=>(b.events??[]).map(e=>e.id)).filter(id=>id===first[0]).length,2,'sent exactly twice');
    note('A 409 resends the same event ids once; the next save carries only new events');
  });
  await run('edit log (8): extract requests carry the take, the piece and the Stop flush',async()=>{
    await load();await js("window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(String(e.message)));addEventListener('unhandledrejection',e=>__qaErrors.push(String(e.reason)))");
    await button(/Record count for/);const take=await js('window.liquorQa.recorder.takeId()');
    await js(`window.liquorQa.recorder.segment("Tito's, two. Frangelico,",0)`);await until('window.liquorQa.extracts.length===1');
    assert.deepEqual(await js('window.liquorQa.extracts[0].body.trace'),{sessionId:'review-draft',zoneId:'giant',takeId:take,segment:0,atStop:false});
    await js(`window.liquorQa.extracts[0].succeed([${JSON.stringify(voiceRow('titos',"Tito's Handmade Vodka","Tito's, two",2,{quantityWords:'two',quantityHeard:'proved'}))}],{extractionId:${JSON.stringify(EXT)}})`);
    await button(/Stop & review/);await js(`window.liquorQa.recorder.finish("Tito's, two. Frangelico,")`);await until('window.liquorQa.extracts.length===2');
    assert.equal(await js('window.liquorQa.extracts[1].body.transcript'),'Frangelico,');
    assert.deepEqual(await js('window.liquorQa.extracts[1].body.trace'),{sessionId:'review-draft',zoneId:'giant',takeId:take,segment:null,atStop:true},'the held phrase sent at Stop has no piece');
    await js(`window.liquorQa.extracts[1].succeed([${JSON.stringify(voiceRow('frangelico','Frangelico','Frangelico',1,{quantityNeedsReview:true,quantityHeard:'guessed'}))}],{extractionId:${JSON.stringify(EXT2)}})`);
    await until("document.querySelector('.lq-sheet')");await button(/^Add 2/);
    await savedLine('frangelico','giant','Number(l.qtyUnits)===1');
    const events=await sentEvents();
    assert.deepEqual(events.map(e=>[e.skuId,e.extractionId,e.itemIndex,e.quantityHeard,e.takeId]),
      [['titos',EXT,0,'proved',take],['frangelico',EXT2,0,'guessed',take]]);
    assert.deepEqual(await js('window.__qaErrors'),[]);
    note('Piece 0 carries segment 0; the Stop flush carries segment null and atStop; each row keeps its own extraction');
    await load('?webspeech&pausecuts=0');await js("window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(String(e.message)));addEventListener('unhandledrejection',e=>__qaErrors.push(String(e.reason)))");
    await button(/Record count for/);await button(/Stop & review/);
    await js("window.liquorQa.recorder.finish('Frangelico, two')");await until('window.liquorQa.extracts.length===1');
    assert.deepEqual(await js('window.liquorQa.extracts[0].body.trace'),{sessionId:'review-draft',zoneId:'giant',segment:null,atStop:true},'Web Speech: no take id, whole take at Stop');
    await js(`window.liquorQa.extracts[0].succeed([${JSON.stringify(frangelicoTwo)}],{extractionId:${JSON.stringify(EXT)}})`);
    await until("document.querySelector('.lq-sheet')");await button(/^Add 1/);await savedLine('frangelico','giant','Number(l.qtyUnits)===2');
    const [ws]=await sentEvents();
    assert.equal(ws.takeId??null,null);assert.equal(ws.kind,'voice_apply');
    assert.deepEqual(await js('window.__qaErrors'),[]);
    note('Web Speech engine: takeId undefined, nothing throws, the event is still sent');
  });
  await run('edit log (9): an older server (no extractionId, no eventsStored) behaves as today',async()=>{
    await voiceTake('?pausecuts=0&old-server',frangelicoTwo);
    await button(/^Add 1/);await savedLine('frangelico','giant','Number(l.qtyUnits)===2');
    await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    await check('The sheet closed and the bottle is counted on the shelf',`!document.querySelector('.lq-sheet')&&[...document.querySelectorAll('.lq-captured .lq-name')].some(e=>e.textContent.includes('Frangelico'))`);
    const [e]=await sentEvents();
    assert.deepEqual(pick(e,['kind','extractionId','itemIndex','afterQty']),{kind:'voice_apply',extractionId:null,itemIndex:null,afterQty:2});
    await input('input[aria-label="Loose Jägermeister"]','1');await savedLine('jaeger','giant','Number(l.qtyUnits)===1');
    assert.deepEqual((await puts()).at(-1).events.map(x=>x.skuId),['jaeger'],'a plain 200 acknowledges the events');
    note('Old server: no extractionId tags, lines save as before, events acknowledged on 200');
  });
  // ── The Amaretto fixes (2026-10-16 count review, Jon's fix 3; Website W3).
  // "Luxardo Amaretto di Serradura, two cases" asked for a case size, the row
  // was removed and a bare re-say saved 1 for 2. Ways out of each step; none
  // adds a hold, blanks a box or asks without a tap (Jon 10/9).
  const AMARETTO={id:'amaretto',name:'Amaretto Luxardo di Saschira',sizeMl:750};
  const amarettoCases={spoken:'Luxardo Amaretto di Serradura, two cases',cases:2,units:0,qty:0,unitsPerCase:null,needsCaseSize:true,
    suspectPreMultiplied:false,quantityNeedsReview:true,quantityWords:'two cases',quantityHeard:'unclear',match:AMARETTO,candidates:[]};
  const amarettoBare={spoken:'Luxardo Di Serradura',cases:0,units:1,qty:1,unitsPerCase:null,needsCaseSize:false,
    suspectPreMultiplied:false,quantityNeedsReview:true,quantityWords:'',quantityHeard:'guessed',match:AMARETTO,candidates:[]};
  const BELVEDERE={id:'belvedere',name:'Belvedere Organic',sizeMl:750};
  const belvedere=(extra={})=>voiceRow('belvedere','Belvedere Organic','Belvedere',1,{match:BELVEDERE,quantityHeard:'implicit_one',...extra});
  const sheetText="document.querySelector('.lq-sheet').textContent";
  const sheetButtons=()=>js("[...document.querySelectorAll('.lq-sheet button')].filter(e=>e.getClientRects().length).map(e=>[e.textContent.trim(),e.disabled])");
  const qtyBox=`document.querySelector('.lq-sheet input[aria-label^="Total quantity"]')`;
  const addReady=n=>`[...document.querySelectorAll('.lq-sheet button')].some(e=>/^Add ${n} to/.test(e.textContent.trim())&&!e.disabled)`;
  // One more take on the shelf now selected, without reloading.
  async function retake(row,extra={extractionId:EXT}){
    const n=await js('window.liquorQa.extracts.length');
    await button(/Record count for/);
    await js(`window.liquorQa.recorder.segment(${JSON.stringify(row.spoken+'.')},0)`);await until(`window.liquorQa.extracts.length===${n+1}`);
    await js(`window.liquorQa.extracts[${n}].succeed([${JSON.stringify(row)}],${JSON.stringify(extra)})`);
    await button(/Stop & review/);await js(`window.liquorQa.recorder.finish(${JSON.stringify(row.spoken)})`);await until("document.querySelector('.lq-sheet')");
  }
  // One take that returns several rows.
  async function retakeRows(rows,extra={extractionId:EXT}){
    const n=await js('window.liquorQa.extracts.length'),said=rows.map(r=>r.spoken).join('. ');
    await button(/Record count for/);
    await js(`window.liquorQa.recorder.segment(${JSON.stringify(said+'.')},0)`);await until(`window.liquorQa.extracts.length===${n+1}`);
    await js(`window.liquorQa.extracts[${n}].succeed(${JSON.stringify(rows)},${JSON.stringify(extra)})`);
    await button(/Stop & review/);await js(`window.liquorQa.recorder.finish(${JSON.stringify(said)})`);await until("document.querySelector('.lq-sheet')");
  }
  // Each review row: spoken words, Qty box, and its Keep/Recount/More chips.
  const revRows=()=>js("[...document.querySelectorAll('.lq-sheet .lq-rev')].map(r=>[r.querySelector('.lq-rev-spoken').textContent.slice(1,-1),r.querySelector('input[aria-label^=\"Total quantity\"]')?.value,[...r.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(t=>/^(Keep|Recount|More)/.test(t)).join('|')])");
  // Take A on Backstock Room: "two cases" of a bottle with no case size, then
  // ✕ or Discard. Take B: the bare name, on `shelfB`.
  async function amarettoPair(removeWith,shelfB='Backstock Room',query='?pausecuts=0&backstock',bare=amarettoBare,cases=amarettoCases){
    await load(query);await button(/^Backstock Room/);
    await retake(cases);
    if(removeWith==='x')await js("document.querySelector('.lq-sheet .lq-rev-x').click()");else await button(/^Discard$/);
    await until("!document.querySelector('.lq-sheet')");
    if(shelfB!=='Backstock Room')await button(new RegExp('^'+shelfB));
    await retake(bare,{extractionId:EXT2});
  }
  async function offerShown(){
    await check('The bare re-say stays a READY amber 1 (box not blank)',`(e=>e.value==='1'&&e.classList.contains('lq-qty-unproved'))(${qtyBox})`);
    await check('It is counted in "Add 1" and the header says 1 ready',`${addReady(1)}&&${sheetText}.includes('1 ready')&&!${sheetText}.includes('need a tap')`);
    await check('No case-size question without a tap',`!${sheetText}.includes('how many in a case?')`);
    await check('The earlier number is a muted hint with two chips',`(r=>!!r&&r.querySelector('.lq-muted').textContent==='Heard "two cases" earlier.'&&[...r.querySelectorAll('button')].map(e=>e.textContent.trim()).join('|')==='Use 2 bottles|2 cases')(document.querySelector('.lq-sheet .lq-rev-restore'))`);
  }
  await run('amaretto (1): "Not cases: 2 bottles" answers the case question with the spoken 2',async()=>{
    await load('?pausecuts=0&backstock');await button(/^Backstock Room/);await retake(amarettoCases);
    await check('The case question asks, with the bottles exit beside Save',`${sheetText}.includes('how many in a case?')&&[...document.querySelectorAll('.lq-sheet .lq-rev-assign button')].map(e=>e.textContent.trim()).at(-1)==='Not cases: 2 bottles'`);
    await check('Nothing is ready before the tap (as today)',`!${addReady(1)}`);
    await shot('amaretto-bottles-exit-412');
    await button(/^Not cases: 2 bottles$/);
    await check('One tap: two bottles, ready, no question, no amber',`(e=>e.value==='2'&&!e.classList.contains('lq-qty-unproved'))(${qtyBox})&&!${sheetText}.includes('how many in a case?')&&${addReady(1)}`);
    await button(/^Add 1 to Backstock Room/);await savedLine('amaretto','speed','Number(l.qtyUnits)===2&&l.enteredCases==null');
    const events=await sentEvents();
    assert.deepEqual(events.map(e=>pick(e,['kind','zoneId','skuId','beforeQty','afterQty','heardCases','heardUnits','heardQty','editedBy','quantityHeard','quantityWords'])),
      [{kind:'voice_apply',zoneId:'speed',skuId:'amaretto',beforeQty:null,afterQty:2,heardCases:2,heardUnits:0,heardQty:0,editedBy:'bottles',quantityHeard:null,quantityWords:'two cases'}]);
    assert.equal(await js("window.liquorQa.calls.some(c=>c.path.includes('/case-size'))"),false,'no case size is saved');
    note('Amaretto two cases → Not cases: 2 bottles → Add saves 2 on Backstock, editedBy bottles');
  });
  await run('amaretto (2): after ✕, a bare re-say stays a ready amber 1 and offers the 2 as chips; ignored, Add saves its own 1',async()=>{
    await amarettoPair('x');await offerShown();await shot('amaretto-offer-412');
    await button(/^Add 1 to Backstock Room/);await savedLine('amaretto','speed','Number(l.qtyUnits)===1');
    await check('The sheet closed and Record is free (nothing left held)',`!document.querySelector('.lq-sheet')&&[...document.querySelectorAll('button')].some(e=>/Record count for/.test(e.textContent)&&!e.disabled)`);
    await until("document.querySelector('.lq-savestate').textContent.includes('Saved')");
    const events=await sentEvents();
    assert.deepEqual(events.map(e=>pick(e,['kind','zoneId','skuId','heardCases','heardQty','quantityWords','quantityHeard','editedBy','extractionId','afterQty'])),[
      {kind:'voice_set_aside',zoneId:'speed',skuId:'amaretto',heardCases:2,heardQty:0,quantityWords:'two cases',quantityHeard:'unclear',editedBy:'as_heard',extractionId:EXT,afterQty:undefined},
      {kind:'voice_apply',zoneId:'speed',skuId:'amaretto',heardCases:0,heardQty:1,quantityWords:null,quantityHeard:'guessed',editedBy:'as_heard',extractionId:EXT2,afterQty:1}]);
    note('✕ logs voice_set_aside; the ignored offer leaves the guessed 1 as heard (T4 lists it at submit)');
    // Added: the remembered number is spent. A third bare re-say gets Keep, not the offer.
    await retake({...amarettoBare,spoken:'Luxardo Di Serradura again'});
    await check('After Add the shelf forgets the removed number',`!document.querySelector('.lq-sheet .lq-rev-restore')&&[...document.querySelectorAll('.lq-sheet button')].some(e=>e.textContent.trim()==='Keep 1')`);
  });
  await run('amaretto (2b): "Use 2 bottles" fills the re-said row with 2, ready, editedBy restored',async()=>{
    await amarettoPair('x');await button(/^Use 2 bottles$/);
    await check('2 in the box, no amber, chips gone, still ready, no question',`(e=>e.value==='2'&&!e.classList.contains('lq-qty-unproved'))(${qtyBox})&&!document.querySelector('.lq-sheet .lq-rev-restore')&&${addReady(1)}&&!${sheetText}.includes('how many in a case?')`);
    await button(/^Add 1 to Backstock Room/);await savedLine('amaretto','speed','Number(l.qtyUnits)===2&&l.enteredCases==null');
    const apply=(await sentEvents()).find(e=>e.kind==='voice_apply');
    assert.deepEqual(pick(apply,['editedBy','heardQty','afterQty','quantityHeard']),{editedBy:'restored',heardQty:1,afterQty:2,quantityHeard:null});
    note('Use 2 bottles → saved 2, editedBy restored, heard 1 kept beside it');
  });
  await run('amaretto (2c): "2 cases" leads to the case question only on its tap, with the bottles exit there too',async()=>{
    await amarettoPair('x');await button(/^2 cases$/);
    await check('Now the existing case question, with the bottles exit',`${sheetText}.includes('Heard 2 cases of Amaretto Luxardo di Saschira')&&${sheetText}.includes('how many in a case?')&&[...document.querySelectorAll('.lq-sheet button')].some(e=>e.textContent.trim()==='Not cases: 2 bottles')`);
    await check('The case question holds the row, as it does for a spoken case count',`!${addReady(1)}`);
    await button(/^Not cases: 2 bottles$/);await button(/^Add 1 to Backstock Room/);
    await savedLine('amaretto','speed','Number(l.qtyUnits)===2&&l.enteredCases==null');
    assert.equal((await sentEvents()).find(e=>e.kind==='voice_apply').editedBy,'bottles');
    note('2 cases → the case question appears only after the tap; the bottles exit there saves 2');
  });
  await run('amaretto (2d): an ambiguous bare re-say (Amaretto or Maraschino) gets the offer once Amaretto is picked',async()=>{
    // tprs probe 3 (amaretto-bare-name): the model may ask which Luxardo.
    await amarettoPair('x','Backstock Room','?pausecuts=0&backstock',{...amarettoBare,match:null,
      candidates:[{...AMARETTO,unitsPerCase:null},{id:'maraschino',name:'Luxardo Maraschino Originale',sizeMl:750,unitsPerCase:12}]});
    await check('No offer before the bottle is known',`!document.querySelector('.lq-sheet .lq-rev-restore')&&${sheetText}.includes('Which one?')`);
    await button(/^Amaretto Luxardo di Saschira/);await offerShown();
    note('An ambiguous re-say gets the offer after the pick, still a ready amber 1');
  });
  await run('amaretto (2e): a row left on the sheet after Add re-reads its offer, so the spent number is not offered again',async()=>{
    await load('?pausecuts=0&backstock');await button(/^Backstock Room/);await retake(amarettoCases);
    await js("document.querySelector('.lq-sheet .lq-rev-x').click()");await until("!document.querySelector('.lq-sheet')");
    // A held zero the server labels guessed (needs review, no words, model 0).
    const heldZero={...amarettoBare,spoken:'Amaretto',units:0,qty:0};
    await retakeRows([amarettoBare,voiceRow('frangelico','Frangelico','Frangelico, two',2,{quantityWords:'two',quantityHeard:'proved'}),heldZero],{extractionId:EXT2});
    await check('Both Amaretto rows carry the offer; the held one waits with a blank box',`document.querySelectorAll('.lq-sheet .lq-rev-restore').length===2&&document.querySelectorAll('.lq-sheet input[aria-label^="Total quantity"]')[2].value===''&&${sheetText}.includes('2 ready')&&${sheetText}.includes('1 need a tap')`);
    await button(/^Add 2 to Backstock Room/);await savedLine('amaretto','speed','Number(l.qtyUnits)===1');
    await check('The held row stays, without the spent offer',`document.querySelectorAll('.lq-sheet .lq-rev').length===1&&!document.querySelector('.lq-sheet .lq-rev-restore')`);
    note('Add spends the removed number; the held Amaretto row left on the sheet no longer offers it');
  });
  await run('amaretto (3): Discard remembers like ✕, and the same offer appears',async()=>{
    await amarettoPair('discard');await offerShown();
    await button(/^Add 1 to Backstock Room/);await savedLine('amaretto','speed','Number(l.qtyUnits)===1');
    assert.deepEqual((await sentEvents()).map(e=>e.kind),['voice_set_aside','voice_apply']);
    note('Discard logs voice_set_aside and the re-say offers Use 2 bottles / 2 cases');
  });
  await run('amaretto (4): the bare re-say on another shelf is a plain amber 1 with no offer',async()=>{
    await amarettoPair('x','Giant Bottle Shelf');
    await check('Amber 1, ready, no offer',`(e=>e.value==='1'&&e.classList.contains('lq-qty-unproved'))(${qtyBox})&&${addReady(1)}&&!document.querySelector('.lq-sheet .lq-rev-restore')&&!${sheetText}.includes('earlier.')`);
    note('Take B on Giant Bottle Shelf: no offer from the Backstock Room row');
  });
  await run('amaretto (5): a bare "Belvedere." over a counted 2 can keep it: Keep 2 / Recount: 1 / More: 3 total',async()=>{
    await load('?pausecuts=0&backstock&belvedere2');await button(/^Backstock Room/);
    const before=(await puts()).length;
    await retake(belvedere());
    await check('The question names the earlier count without the recount-or-more line',`${sheetText}.includes('2 already counted on Backstock Room from an earlier take.')&&!${sheetText}.includes('Did you just recount those')`);
    assert.deepEqual((await sheetButtons()).filter(([t])=>/^(Keep|Recount|More)/.test(t)).map(([t])=>t),['Keep 2','Recount: 1','More: 3 total']);
    await shot('belvedere-keep-412');
    await b.send('Emulation.setDeviceMetricsOverride',{width:320,height:915,deviceScaleFactor:1,mobile:true});await pause(80);
    await check('320px: the three answers fit the phone',`document.documentElement.scrollWidth<=innerWidth+1`);await shot('belvedere-keep-320');
    await b.send('Emulation.setDeviceMetricsOverride',{width:412,height:915,deviceScaleFactor:1,mobile:true});await pause(80);
    await button(/^Keep 2$/);
    await check('The answer reads back, with Change',`${sheetText}.includes('Keeps the earlier 2 on Backstock Room.')&&[...document.querySelectorAll('.lq-sheet button')].some(e=>e.textContent.trim()==='Change')`);
    await button(/^Add 1 to Backstock Room/);await until("!document.querySelector('.lq-sheet')");
    await until(`window.liquorQa.calls.filter(c=>c.path.endsWith('/lines')).length>${before}`);
    await check('The cell stays 2',`${saved}.some(l=>l.skuId==='belvedere'&&l.zoneId==='speed'&&Number(l.qtyUnits)===2)`);
    const events=await sentEvents();
    assert.equal(events.length,1,'one event');
    assert.deepEqual(pick(events[0],['kind','zoneId','skuId','restateAnswer','spoken','extractionId','itemIndex']),
      {kind:'voice_keep',zoneId:'speed',skuId:'belvedere',restateAnswer:'keep',spoken:'Belvedere',extractionId:EXT,itemIndex:0});
    for(const k of ['beforeQty','afterQty','heardQty','heardUnits','quantityHeard','editedBy'])assert.equal(events[0][k],undefined,`voice_keep carries no ${k}`);
    await finish();
    await check('No restatement at submit',`!document.querySelector('.lq-confirm').textContent.includes('Extra stock or said twice?')`);
    note('Keep 2: the cell stays 2, the save carries one voice_keep with no quantities, no restatement at submit');
  });
  await run('amaretto (6): a re-say with a spoken number keeps today\'s copy and two buttons',async()=>{
    await load('?pausecuts=0&backstock&belvedere2');await button(/^Backstock Room/);
    await retake(belvedere({spoken:'Belvedere, one',quantityWords:'one',quantityHeard:'proved'}));
    await check('Today\'s question',`${sheetText}.includes('2 already counted on Backstock Room from an earlier take. Did you just recount those, or find more?')`);
    assert.deepEqual((await sheetButtons()).filter(([t])=>/^(Keep|Recount|More)/.test(t)).map(([t])=>t),['Recount: 1','More: 3 total']);
    note('A spoken number: Recount / More only');
  });
  // W3 review (2026-10-16): Keep sits on the take's first row of the bottle
  // but skips every row of it, so it is judged on all of them.
  await run('amaretto (6b): "Belvedere … Belvedere, three" in one take: no Keep, so the spoken three cannot be dropped',async()=>{
    await load('?pausecuts=0&backstock&belvedere2');await button(/^Backstock Room/);
    await retakeRows([belvedere(),voiceRow('frangelico','Frangelico','Frangelico, two',2,{quantityWords:'two',quantityHeard:'proved'}),
      belvedere({spoken:'Belvedere, three',units:3,qty:3,quantityWords:'three',quantityHeard:'proved'})]);
    assert.deepEqual(await revRows(),[['Belvedere','1','Recount: 1|More: 3 total'],['Frangelico, two','2',''],['Belvedere, three','3','']]);
    await check('Today\'s question on the first row, Keep nowhere',`${sheetText}.includes('2 already counted on Backstock Room from an earlier take. Did you just recount those, or find more?')&&![...document.querySelectorAll('.lq-sheet button')].some(e=>/^Keep \\d/.test(e.textContent.trim()))`);
    await check('Both Belvedere rows wait for the answer',`${sheetText}.includes('1 ready')&&${sheetText}.includes('2 need a tap')`);
    await button(/^Recount: 1$/);await button(/^Add 3 to Backstock Room/);
    await savedLine('belvedere','speed','Number(l.qtyUnits)===4');
    const apply=(await sentEvents()).find(e=>e.kind==='voice_apply'&&e.skuId==='belvedere');
    assert.deepEqual(pick(apply,['restateAnswer','heardQty','afterQty']),{restateAnswer:'replace',heardQty:4,afterQty:4});
    assert.equal((await sentEvents()).some(e=>e.kind==='voice_keep'),false,'no voice_keep');
    note('Bare + spoken Belvedere in one take: Recount / More only; Recount saves 1 + 3 = 4');
  });
  await run('amaretto (6c): two bare re-says can Keep; a number typed on either withdraws the Keep and it asks again',async()=>{
    await load('?pausecuts=0&backstock&belvedere2');await button(/^Backstock Room/);
    await retakeRows([belvedere(),voiceRow('frangelico','Frangelico','Frangelico, two',2,{quantityWords:'two',quantityHeard:'proved'}),
      belvedere({spoken:'Belvedere again',quantityHeard:'guessed'})]);
    assert.deepEqual(await revRows(),[['Belvedere','1','Keep 2|Recount: 1|More: 3 total'],['Frangelico, two','2',''],['Belvedere again','1','']]);
    await button(/^Keep 2$/);
    await check('Kept: every row ready',`${sheetText}.includes('Keeps the earlier 2 on Backstock Room.')&&${addReady(3)}`);
    await js("document.querySelectorAll('.lq-sheet .lq-rev')[2].dataset.qa='again'");
    await input('.lq-sheet .lq-rev[data-qa="again"] input[aria-label^="Total quantity"]','3');
    assert.deepEqual(await revRows(),[['Belvedere','1','Recount: 1|More: 3 total'],['Frangelico, two','2',''],['Belvedere again','3','']]);
    await check('The Keep reads back no more, and the bottle waits again',`!${sheetText}.includes('Keeps the earlier')&&${sheetText}.includes('Did you just recount those, or find more?')&&${sheetText}.includes('1 ready')&&${addReady(1)}`);
    await button(/^Recount: 1$/);await button(/^Add 3 to Backstock Room/);
    await savedLine('belvedere','speed','Number(l.qtyUnits)===4');
    const events=await sentEvents();
    assert.equal(events.some(e=>e.kind==='voice_keep'),false,'the withdrawn Keep logs nothing');
    assert.deepEqual(pick(events.find(e=>e.kind==='voice_apply'&&e.skuId==='belvedere'),['restateAnswer','editedBy','afterQty']),{restateAnswer:'replace',editedBy:'typed',afterQty:4});
    note('Two bare Belvederes: Keep 2 offered; typing 3 on the second asks again; Recount saves 1 + 3 = 4');
  });
  await run('amaretto (6d): a seam merge "Belvedere, a case … Belvedere" keeps the case words: no Keep',async()=>{
    await load('?pausecuts=0&backstock&belvedere2');await button(/^Backstock Room/);
    await retakeRows([belvedere({spoken:'Belvedere, a case',cases:1,units:0,qty:12,quantityWords:'a case',quantityHeard:'proved'}),belvedere()]);
    assert.deepEqual(await revRows(),[['Belvedere, a case … Belvedere','13','Recount: 13|More: 15 total']]);
    await check('Today\'s question',`${sheetText}.includes('Did you just recount those, or find more?')`);
    note('Merged case + bare row (label implicit_one, words "a case"): Recount / More only');
  });
  await run('amaretto (7): a number typed on the count screen forgets the removed row',async()=>{
    await load('?pausecuts=0&backstock');await button(/^Backstock Room/);await retake(amarettoCases);
    await js("document.querySelector('.lq-sheet .lq-rev-x').click()");await until("!document.querySelector('.lq-sheet')");
    await input('input[aria-label="Search counted items and catalog"]','Amaretto');await input('input[aria-label="Loose Amaretto Luxardo di Saschira"]','2');
    await savedLine('amaretto','speed','Number(l.qtyUnits)===2');await button(/^Clear search$/);
    await retake(amarettoBare,{extractionId:EXT2});
    await check('No offer; the re-say asks about the typed 2 as usual',`!document.querySelector('.lq-sheet .lq-rev-restore')&&${sheetText}.includes('2 already counted on Backstock Room')`);
    note('A typed count of the bottle on that shelf forgets the removed number');
  });
  await run('amaretto (8): an older server (no quantityHeard) shows no offer and no Keep; the bottles exit still works',async()=>{
    const {quantityHeard:_a,...oldCases}=amarettoCases,{quantityHeard:_b,...oldBare}=amarettoBare;
    await amarettoPair('x','Backstock Room','?pausecuts=0&backstock&old-server',oldBare,oldCases);
    await check('A plain amber 1, ready, no offer',`(e=>e.value==='1'&&e.classList.contains('lq-qty-unproved'))(${qtyBox})&&${addReady(1)}&&!document.querySelector('.lq-sheet .lq-rev-restore')`);
    await load('?pausecuts=0&backstock&belvedere2&old-server');await button(/^Backstock Room/);
    const {quantityHeard:_c,...oldBelvedere}=belvedere();await retake(oldBelvedere);
    assert.deepEqual((await sheetButtons()).filter(([t])=>/^(Keep|Recount|More)/.test(t)).map(([t])=>t),['Recount: 1','More: 3 total']);
    await load('?pausecuts=0&backstock&old-server');await button(/^Backstock Room/);await retake(oldCases);
    await button(/^Not cases: 2 bottles$/);await button(/^Add 1 to Backstock Room/);await savedLine('amaretto','speed','Number(l.qtyUnits)===2');
    note('Older server: no offer, no Keep, the bottles exit still saves 2');
  });
  for(const width of [320,360,412,1280])await run(`${width}px count and Details keep case numeral visible`,async()=>{
    await b.send('Emulation.setDeviceMetricsOverride',{width,height:width===1280?900:915,deviceScaleFactor:1,mobile:width!==1280});
    await load();await input('input[aria-label="Search counted items and catalog"]','Boylan');
    await js("document.querySelector('.lq-captured .lq-row').scrollIntoView({block:'center',behavior:'instant'})");
    const metrics=await js(`(()=>{const e=document.querySelector('.lq-captured .lq-case-input'),r=e.getBoundingClientRect(),s=getComputedStyle(e),c=document.createElement('canvas').getContext('2d');c.font=s.font;return {value:e.value,width:r.width,height:r.height,font:parseFloat(s.fontSize),textWidth:c.measureText(e.value).width,padding:parseFloat(s.paddingLeft)+parseFloat(s.paddingRight),overflow:document.documentElement.scrollWidth>innerWidth+1,left:r.left,right:r.right,color:s.color}})()`);
    assert.equal(metrics.value,'2');assert.ok(metrics.width>=44&&metrics.height>=44&&metrics.font>=16);assert.ok(metrics.width-metrics.padding>=metrics.textWidth+16,'case numeral has room to render');assert.equal(metrics.overflow,false);assert.ok(metrics.left>=0&&metrics.right<=width);results.assertions.push(`${width}px case numeral value 2 fits its >=44px field without overflow`);
    await shot('case-count-'+width);
    await touch('.lq-captured .lq-case-stepper button[aria-label="One more case"]');await savedLine('boylan','giant','Number(l.qtyUnits)===72&&l.enteredCases===3&&l.caseSizeAtEntry===24');
    await touch('.lq-captured .lq-case-stepper button[aria-label="One fewer case"]');await savedLine('boylan','giant','Number(l.qtyUnits)===48&&l.enteredCases===2&&l.caseSizeAtEntry===24');
    await check(`${width}px native touch changes exactly one case`,`${saved}.some(l=>l.skuId==='boylan'&&Number(l.qtyUnits)===48&&l.enteredCases===2)`);
    await finish();await detail('boylan');await js("document.querySelector('.lq-review-count-row[data-sku-id=boylan]').scrollIntoView({block:'center',behavior:'instant'})");
    await check(`${width}px Details fits the viewport`,`document.documentElement.scrollWidth<=innerWidth+1`);
    const panel=await js("(()=>{const e=document.querySelector('.lq-confirm .lq-sheet-foot'),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight}})()");assert.ok(panel.top>=0&&panel.bottom<=panel.height+1,'review actions remain visible');
    await shot('case-details-'+width);
    if(width===320||width===412){await load('?collision=conflicting');await finish();const scope=await detail('jameson');await rematch('jameson','orange',scope);
      await js(`${q(scope)}.querySelector('.lq-review-rematch').scrollIntoView({block:'center',behavior:'instant'})`);
      await check(`${width}px identity collision actions fit without overflow`,`document.documentElement.scrollWidth<=innerWidth+1`);await shot('identity-collision-'+width);}
    if(width===320){await load();await finish();const scope=await detail('jameson');await js("window.liquorQa.remapConflict='target-created'");await rematch('jameson','orange',scope);await button(/^Move count$/,q(scope));await until('window.liquorQa.releaseConflict');await js('window.liquorQa.releaseConflict()');await until("document.querySelector('.lq-confirm .lq-review-changed[role=alert]')");
      await js("document.querySelector('.lq-confirm .lq-review-changed[role=alert]').scrollIntoView({block:'start',behavior:'instant'})");await check('320px changed-item warning fits the phone',`document.documentElement.scrollWidth<=innerWidth+1`);await shot('remap-conflict-320');}
  });
  results.blocked=b.blocked;assert.deepEqual(b.blocked,[],'fixture must never attempt external traffic');
}finally{await writeFile(out+'results.json',JSON.stringify(results,null,2));await b.close();await new Promise(r=>server.close(r));}
console.log(JSON.stringify({passed:results.scenarios.length,assertions:results.assertions.length,failures:results.failures.map(f=>({name:f.name,error:f.error.split('\n')[0]})),screens:results.screens.length,output:out},null,2));
if(results.failures.length)process.exitCode=1;
