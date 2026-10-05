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
  await run('uncertain voice quantity waits for an explicit human answer',async()=>{
    await load('?pausecuts=0');await button(/Record count for/);await js("window.liquorQa.recorder.segment('Test bottle one.',0)");await until('window.liquorQa.extracts.length===1');
    await js(`window.liquorQa.extracts[0].succeed([{spoken:'seven Makers Mark',cases:0,units:0.7,qty:0.7,unitsPerCase:12,needsCaseSize:false,suspectPreMultiplied:false,quantityNeedsReview:true,quantityWords:'seven',match:{id:'makers',name:"Maker's Mark",sizeMl:1000},candidates:[]}])`);
    await button(/Stop & review/);await js("window.liquorQa.recorder.finish('seven Makers Mark')");await until("document.querySelector('.lq-sheet')");
    await check('Question shows the quantity words as evidence',`document.querySelector('.lq-sheet').textContent.includes('seven')`);
    await check('Unanswered quantity cannot be added',`![...document.querySelectorAll('.lq-sheet button')].some(e=>/^Add 1/.test(e.textContent.trim())&&!e.disabled)`);
    await input('.lq-sheet input[aria-label^="Total quantity"]','7');
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
