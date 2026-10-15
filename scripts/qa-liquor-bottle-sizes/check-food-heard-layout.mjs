// Walk-In Cooler 2026-10-15 on phone-size native Chromium: a suggested product
// that shows the amount the recording proved for it, the one-tap "Use 10
// bottles", and the unfinished-count screen's second ask before starting over.
// Actual CountFood with fictional stock and a controlled recorder/API; the
// shared CDP helper independently blocks external requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {browser} from '../qa-cogs-mobile/cdp.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),here=fileURLToPath(new URL('./',import.meta.url));
const out=here+'dist/food-heard-layout/';await mkdir(out,{recursive:true});
const require=createRequire(new URL('../../package.json',import.meta.url));
await require('esbuild').build({entryPoints:[here+'food-fixture.jsx'],outfile:out+'fixture.js',bundle:true,
  jsx:'automatic',platform:'browser',nodePaths:[root+'node_modules'],
  define:{'import.meta.env':'{"PUBLIC_TPRS_API_BASE":"/mock"}'},
  plugins:[{name:'controlled-food-recorder',setup(build){
    build.onResolve({filter:/^qa:food$/},()=>({path:root+'src/components/liquor/views/CountFood.tsx'}));
    build.onResolve({filter:/^qa:styles$/},()=>({path:root+'src/components/liquor/liquor.css'}));
    build.onResolve({filter:/^\.\.\/useRecorderDictation$/},()=>({path:here+'food-recorder-fixture.jsx'}));
  }}]});
const server=createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
  const asset=path==='/fixture.js'?'fixture.js':path==='/fixture.css'?'fixture.css':null;
  res.setHeader('Content-Type',asset?.endsWith('.js')?'text/javascript':asset?'text/css':'text/html');
  res.end(asset?await readFile(out+asset):'<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#0e0a1f}</style><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/`,b=await browser();
const results={recordedAtUtc:new Date().toISOString(),scope:'Actual CountFood; synthetic stock, recording and API responses; native phone-size Chromium only.',assertions:[],screens:[],blocked:[],failures:[]};
const js=e=>b.evaluate(e),pause=ms=>new Promise(r=>setTimeout(r,ms));
async function check(name,e){assert.ok(await js(`!!(${e})`),name);results.assertions.push(name);}
async function click(text){await js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e||e.disabled)throw Error('Unavailable '+${JSON.stringify(text)});e.click()})()`);await pause(60);}
// A real phone tap (touch start/end), which the browser turns into a click at that point.
async function tap(x,y){await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
const centre=text=>js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)return null;const r=e.getBoundingClientRect();return {x:(r.left+r.right)/2,y:(r.top+r.bottom)/2}})()`);
const newCountPosts="foodQa.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/counts')).length";
async function shot(name){const {data}=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(out+name+'.png',Buffer.from(data,'base64'));results.screens.push(name+'.png');}
// Every visible button inside `selector` sits inside the viewport, is at least `min` px tall, and nothing scrolls sideways.
const fits=(selector,min)=>`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.offsetParent);return els.length>0&&els.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+0.5&&r.height>=${min}})&&document.documentElement.scrollWidth<=innerWidth+1})()`;
const blue={id:'gatorade-blue',name:'Gatorade, Raspberry Cool Blue',sizeMl:null,unitsPerCase:24};
const rows=JSON.stringify([
  {spoken:'Garlic Parmesan, four gallons',quantityWords:'',cases:0,units:3,qty:0,unitsPerCase:null,needsCaseSize:false,suspectPreMultiplied:false,match:null,identityNeedsReview:true,
    quantityNeedsReview:true,quantityKnown:false,unitNeedsReview:true,spokenUnit:'gal',candidates:[{id:'garlic-parm',name:'Sauce, Parmesan, Garlic',sizeMl:null,unitsPerCase:2}],
    ifChosen:{'garlic-parm':{cases:0,units:4,spokenUnit:'gal',quantityWords:'four gallons'}}},
  {spoken:'Mild cheddar slices, Point six of a case',quantityWords:'',cases:0.6,units:0,qty:0,unitsPerCase:null,needsCaseSize:false,suspectPreMultiplied:false,match:null,identityNeedsReview:true,
    quantityNeedsReview:true,quantityKnown:false,unitNeedsReview:true,spokenUnit:null,candidates:[{id:'cheddar',name:'Cheese, Cheddar',sizeMl:null,unitsPerCase:8},{id:'american',name:'Cheese, American',sizeMl:null,unitsPerCase:4}],
    ifChosen:{cheddar:{cases:0.6,units:0,spokenUnit:null,quantityWords:'Point six of a case'},american:{cases:0.6,units:0,spokenUnit:null,quantityWords:'Point six of a case'}}},
  {spoken:'blue gatorade ten',quantityWords:'ten',cases:0,units:0,qty:0,unitsPerCase:24,needsCaseSize:false,suspectPreMultiplied:false,match:blue,candidates:[],identityNeedsReview:false,
    quantityNeedsReview:true,quantityKnown:false,quantityReviewReason:'source_not_returned',unitNeedsReview:false,spokenUnit:null,proposed:{cases:0,units:10,spokenUnit:null,quantityWords:'ten'}},
]);
try{
  for(const width of [320,390,412]){
    await b.send('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:true});
    await b.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    // A double tap on Start new count (review 2026-10-15: the question's own
    // Start button used to open under the finger, so 9 of 9 double taps
    // started over). The second tap must land on Keep, never on Start.
    for(const gap of [80,250]){
      await b.send('Page.navigate',{url:base+'?walkin-existing&pausecuts=0'});await b.until("window.foodQa&&document.querySelector('.lq-count-entry')");
      await pause(150);
      const {x,y}=await centre('Start new count');
      await tap(x,y);await pause(gap);
      await check(`${width}px ${gap}ms: the spot just tapped is not Start new count once the question opens`,`!!document.querySelector('.lq-start-over')&&document.elementFromPoint(${x},${y})?.closest('button')?.textContent.trim()!=='Start new count'`);
      await tap(x,y);await pause(400);
      await check(`${width}px ${gap}ms: a double tap on Start new count starts nothing`,`${newCountPosts}===0&&!!document.querySelector('.lq-count-entry')`);
    }
    // The unfinished count: its shelf, then the second ask.
    await b.send('Page.navigate',{url:base+'?walkin-existing&pausecuts=0'});await b.until("window.foodQa&&document.querySelector('.lq-count-entry')");
    await check(`${width}px entry lists the draft's shelf`,"document.querySelector('.lq-count-entry-shelves li')?.textContent.replace(/\\s+/g,' ').trim()==='Pizza Freezer 1 saved'");
    await check(`${width}px entry actions fit`,fits('.lq-count-entry-actions button',44));
    await click('Start new count');
    await check(`${width}px Keep this count comes first`,"[...document.querySelectorAll('.lq-start-over-actions button')].map(e=>e.textContent.trim()).join('|')==='Keep this count|Start new count'");
    await check(`${width}px start-over question names the shelf`,"document.querySelector('.lq-start-over p')?.textContent===\"Start over? The 1 saved count on Pizza Freezer stays in the old count and won't be submitted.\"");
    await check(`${width}px start-over answers fit at 44px`,fits('.lq-start-over-actions button',44));
    await check(`${width}px no count was created by the first tap`,"!foodQa.calls.some(c=>c.method==='POST'&&c.path.endsWith('/counts'))");
    await shot('start-over-'+width);
    await click('Keep this count');await click('Continue count');await b.until("document.querySelector('.lq-fc-row')");
    // A take with two held products and one coverage row.
    await js("[...document.querySelectorAll('button')].find(e=>/Talk through/.test(e.textContent)).click()");await b.until("document.querySelector('.lq-rec-stop')");
    await js("foodQa.recorder.segment('walk-in take',0)");await b.until('foodQa.extracts.length===1');
    await js(`foodQa.extracts[0].succeed(${rows})`);await pause(80);
    await js("document.querySelector('.lq-rec-stop').click()");await pause(60);
    await js("foodQa.recorder.finish('walk-in take')");await b.until("document.querySelectorAll('.lq-fc-rev-row').length===3");
    await pause(500);
    await check(`${width}px suggestions show the amount a tap fills in`,"[...document.querySelectorAll('.lq-fc-rev-pick .lq-chip')].map(e=>e.textContent.trim()).join('|')==='Sauce, Parmesan, Garlic · 4 containers|Find product…|Cheese, Cheddar · 4.8 packs|Cheese, American · 2.4 packs|Find product…'");
    await check(`${width}px suggestion chips fit the phone`,fits('.lq-fc-rev-pick .lq-chip',30));
    await check(`${width}px Use 10 bottles is offered beside the hint`,"[...document.querySelectorAll('.lq-fc-rev-proposed button')].some(e=>e.textContent.trim()==='Use 10 bottles')&&document.querySelector('.lq-fc-rev-proposed').textContent.includes('Heard in your recording: ten.')");
    await check(`${width}px Use 10 bottles fits`,fits('.lq-fc-rev-proposed button',20));
    await shot('suggestions-'+width);
    await click('Sauce, Parmesan, Garlic · 4 containers');await click('Cheese, Cheddar · 4.8 packs');await click('Use 10 bottles');
    await check(`${width}px no Which unit after the taps`,"!document.querySelector('.lq-fc-rev').textContent.includes('Which unit?')");
    const heldHint=spoken=>`![...document.querySelectorAll('.lq-fc-voice-review-row')].find(e=>e.querySelector('.lq-fc-rev-spoken')?.textContent.includes(${JSON.stringify(spoken)}))?.querySelector('.lq-error.lq-rev-hint')`;
    await check(`${width}px the cheddar row holds nothing after its tap`,heldHint('Mild cheddar slices'));
    await check(`${width}px the Gatorade row holds nothing after Use 10 bottles`,heldHint('blue gatorade ten'));
    await check(`${width}px the shelf's Garlic Parmesan asks add or replace`,"document.querySelector('.lq-fc-rev-restate')?.textContent.includes('Add to the 2 containers already here, or replace?')");
    // The footer counts ready rows only: Garlic Parmesan joins once answered.
    await check(`${width}px Add leaves Garlic Parmesan out until add-or-replace is answered`,"[...document.querySelectorAll('button')].some(e=>/^Add 2 items to /.test(e.textContent.trim()))&&![...document.querySelectorAll('button')].some(e=>/^Add 3 items to /.test(e.textContent.trim()))");
    await click('Add: 6 containers total');
    await check(`${width}px all three are ready once answered`,"[...document.querySelectorAll('button')].some(e=>/^Add 3 items to /.test(e.textContent.trim())&&!e.disabled)");
    await check(`${width}px ready rows fit`,"document.documentElement.scrollWidth<=innerWidth+1");
    await shot('tapped-'+width);
  }
  results.blocked=b.blocked;assert.equal(b.blocked.length,0,'No external requests');
  console.log(`${results.assertions.length} native heard-amount and start-over layout assertions passed at 320, 390 and 412px`);
}catch(error){results.failures.push(String(error.stack??error));throw error;}
finally{await writeFile(out+'results.json',JSON.stringify(results,null,2)+'\n');await b.close();await new Promise(r=>server.close(r));}
