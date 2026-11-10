// Synthetic browser roundtrip. Every API request is mocked on localhost.
// node scripts/labor-demand-surprise-ui-qa.mjs <private-output-dir>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright';
import {fixture} from './labor-demand-surprise-fixture.mjs';
const out=path.resolve(process.argv[2]);
assert.ok(process.argv[2],'Provide a new private output directory');
assert.equal(fs.existsSync(out),false,'Never overwrite earlier QA');fs.mkdirSync(out,{recursive:true});
const entryDir=path.resolve('.shots');fs.mkdirSync(entryDir,{recursive:true});
fs.writeFileSync(path.join(entryDir,'demand-surprise-entry.js'),`import React from 'react';import{createRoot}from'react-dom/client';import ReviewPilot from'../src/components/labor/ReviewPilot.tsx';import'../src/components/labor/labor.css';createRoot(document.getElementById('root')).render(React.createElement(ReviewPilot));`);
const fixtureHtml='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="lq-app lq-pilot-app"><p style="padding:12px">SYNTHETIC UI CHECK - All numbers and answers are made up.</p><main class="lq-main"><div id="root"></div></main><script type="module" src="/.shots/demand-surprise-entry.js"></script></body></html>';
const server=await createServer({configFile:false,optimizeDeps:{include:['react','react-dom/client']},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0},logLevel:'error'});
// Resolve browser-ready imports before serving; no remote API is involved.
await server.listen();
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[],writes=[];let state=fixture(),rejectNext=false;
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.origin!==origin){errors.push(`Unexpected external request: ${url.origin}`);return route.abort();}
 if(url.pathname==='/__synthetic-surge/')return route.fulfill({status:200,contentType:'text/html',body:fixtureHtml});
 if(!url.pathname.includes('/tprs-api/'))return route.continue();
 const body=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 if(request.method()==='GET')return url.pathname.match(/\/reviews\/$/)?body({reviews:[{id:state.id,weekStart:state.packet.weekStart,open:state.questions.filter(q=>!q.response||q.response.serviceFeedback?.overall==='need_to_check').length}]}):url.pathname.endsWith('/recap-preview/')?body({email:null}):body(state);
 assert.equal(request.method(),'POST');assert.match(url.pathname,/\/response\/$/);const input=request.postDataJSON();writes.push(structuredClone(input));
 if(rejectNext){rejectNext=false;return route.fulfill({status:409,contentType:'application/json',body:'{"error":"stale"}'});}
 const q=state.questions[0];assert.equal(input.questionId,q.id);assert.equal(input.expectedRevision,q.revision);
 if(input.undo){q.response=q.history.at(-2)?.response??null;q.history.push({revision:q.revision+1,createdAt:'2026-10-28T18:02:00Z',kind:'undo',response:q.response});}
 else {q.response=input.response;q.history.push({revision:q.revision+1,createdAt:'2026-10-28T18:01:00Z',kind:'save',response:structuredClone(q.response)});}
 q.revision++;q.canUndo=true;return body(state);
});
const load=async()=>{await page.goto(`${origin}/__synthetic-surge/`);await page.getByRole('heading',{name:'Sat, Oct 24 · 4pm-8pm',level:3}).waitFor();};
const capture=async(name,width)=>{await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow at ${width}`);await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});};
const card=()=>page.locator('article.lr-surge-question');
try{
 // Jon Nov 9 ("give him some buttons ... quick painless"): three one-tap answers; detail is optional and comes after.
 await load();await capture('question',320);await capture('question',390);await capture('question',960);
 await page.setViewportSize({width:390,height:844});
 const quick=name=>card().getByRole('button',{name,exact:true});
 assert.equal(await card().locator('form,textarea,select,input[type=radio]').count(),0);
 for(const name of ['Kept up','Stretched','Fell behind'])assert.equal(await quick(name).getAttribute('aria-pressed'),'false');
 // One tap: "Kept up" saves with nothing typed and asks nothing more.
 await quick('Kept up').click();await card().getByRole('button',{name:'Add detail',exact:true}).waitFor();
 assert.equal(writes.length,1);assert.equal(writes[0].expectedRevision,0);assert.deepEqual(writes[0].response.serviceFeedback,{overall:'handled',affectedDepartments:[],managerHelp:'unknown',extraStaffingAnticipated:'unknown'});
 assert.equal(writes[0].response.note,'Kept up');assert.equal(writes[0].response.status,'closed');assert.equal(writes[0].response.trial,undefined);assert.equal(await card().locator('form').count(),0);
 await capture('saved',320);await capture('saved',390);
 await load();await page.getByRole('heading',{name:'Kept up',exact:true}).waitFor();
 // Change to "Stretched": it saves at once and offers the optional detail.
 await card().getByRole('button',{name:'Change',exact:true}).click();await quick('Stretched').click();await page.getByText('Where was it tight?').waitFor();
 assert.equal(writes[1].expectedRevision,1);assert.equal(writes[1].response.serviceFeedback.overall,'strained');assert.equal(writes[1].response.note,'Stretched');
 await capture('detail',320);await capture('detail',390);await capture('detail',960);await page.setViewportSize({width:390,height:844});
 await card().getByRole('button',{name:'Kitchen',exact:true}).click();await page.getByLabel('A manager stepped in').check();await page.getByLabel('Anything to add?').fill('Synthetic: kitchen tickets backed up; manager helped.');
 await card().getByRole('button',{name:'Save detail',exact:true}).click();await card().getByRole('button',{name:'Add detail',exact:true}).waitFor();
 assert.deepEqual(writes[2].response.serviceFeedback,{overall:'strained',affectedDepartments:['kitchen'],managerHelp:'yes',extraStaffingAnticipated:'unknown'});assert.equal(writes[2].response.note,'Synthetic: kitchen tickets backed up; manager helped.');assert.equal(writes[2].expectedRevision,2);
 await card().getByText('Synthetic: kitchen tickets backed up; manager helped.').waitFor();await capture('saved-detail',390);
 // Undo returns to the one-tap answer, with the optional detail offered again; Skip and an empty Save write nothing.
 await card().getByRole('button',{name:'Undo',exact:true}).click();await card().getByText('Synthetic: kitchen tickets backed up; manager helped.').waitFor({state:'detached'});assert.equal(writes[3].undo,true);assert.equal(writes[3].response,undefined);assert.equal(writes[3].expectedRevision,3);
 assert.equal(await page.getByLabel('Anything to add?').inputValue(),'');await card().getByRole('button',{name:'Save detail',exact:true}).click();await card().getByRole('button',{name:'Add detail',exact:true}).waitFor();assert.equal(writes.length,4);
 await card().getByRole('button',{name:'Add detail',exact:true}).click();await card().getByRole('button',{name:'Skip',exact:true}).click();await card().getByRole('button',{name:'Add detail',exact:true}).waitFor();assert.equal(writes.length,4);
 // A stale page: the tap is refused and says so.
 await card().getByRole('button',{name:'Change',exact:true}).click();rejectNext=true;await quick('Fell behind').click();await page.getByRole('alert').filter({hasText:'This question or answer changed'}).waitFor();
 // A "need to check" answer saved by the earlier form is still open: the buttons return and no recap is offered.
 state=fixture();Object.assign(state.questions[0],{revision:1,response:{decision:'consider',context:[],note:'Synthetic: checking with the 4pm-8pm crew.',action:'',followUpDate:state.questions[0].followUpDate,outcome:'',status:'follow_up',serviceFeedback:{overall:'need_to_check',affectedDepartments:[],managerHelp:'unknown',extraStaffingAnticipated:'unknown'}}});
 await load();await card().getByText('this stays open until then',{exact:false}).waitFor();await quick('Kept up').waitFor();await page.getByRole('heading',{name:'1 quick question',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Preview follow-up email',exact:true}).count(),0);
 // Added coverage no longer adds a required pick.
 state=fixture('material_adds');await load();assert.equal(await card().locator('select,textarea').count(),0);await quick('Stretched').waitFor();
 state=fixture('material_adds');state.questions[0].demandSurge.knownOperatingExplanation='Synthetic saved operating reason.';await load();await page.getByText('Already noted: Synthetic saved operating reason.',{exact:true}).waitFor();
 state=fixture();state.questions[0].disposition={status:'withdrawn',source:'owner',reason:'Synthetic owner withdrawal.',withdrawnAt:'2026-10-28T18:00:00Z'};await page.goto(`${origin}/__synthetic-surge/`);await page.getByText('No response required.',{exact:true}).waitFor();assert.equal(await page.locator('article.lr-question button').count(),0);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({status:'passed',synthetic:true,productionRequests:0,productionWrites:0,mockWrites:writes.length,checks:['320/390/960 question, saved and detail layouts','no default answer, no form before the tap','one tap saves with the button words as the note','reload persistence','change saves at once and offers optional detail','detail payload and expectedRevision','undo with expectedRevision','skip writes nothing','409 is reported','earlier need-to-check answer stays open/no recap','added coverage adds no required pick','known explanation shown','withdrawn question has no answer controls'],errors},null,2));
 console.log(JSON.stringify({status:'passed',synthetic:true,mockWrites:writes.length,errors}));
}catch(e){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:e.message,errors,html:await page.content()},null,2));throw e;}finally{await browser.close();await server.close();}
