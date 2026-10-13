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
const load=async()=>{await page.goto(`${origin}/__synthetic-surge/`);await page.getByRole('heading',{name:'Saturday rush: how did the crew handle it?',level:2}).waitFor();};
const capture=async(name,width)=>{await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow at ${width}`);await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});};
try{
 await load();await capture('question',320);await capture('question',390);await capture('question',960);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'How the crew handled it',exact:true}).click();
 assert.equal(await page.getByRole('radio',{checked:true}).count(),0);assert.equal(await page.locator('form.lr-answer').evaluate(f=>f.checkValidity()),false);assert.equal(await page.getByLabel('Did management step in to keep service moving?').inputValue(),'');
 assert.equal(await page.getByLabel('Was the extra published coverage planned for this busier period?').count(),0);
 await page.getByLabel('The crew handled it',{exact:true}).check();await page.getByLabel('Did management step in to keep service moving?').selectOption('no');await page.getByLabel('What did you or the team notice?').fill('Synthetic: the crew kept up without extra help.');
 await capture('answer',320);await capture('answer',390);await capture('answer',960);
 await page.getByRole('button',{name:'Review answer',exact:true}).click();assert.equal(writes.length,0);await page.getByRole('button',{name:'Back to edit',exact:true}).click();assert.equal(await page.getByLabel('What did you or the team notice?').inputValue(),'Synthetic: the crew kept up without extra help.');
 await page.getByRole('button',{name:'Review answer',exact:true}).click();await capture('confirmation',390);await page.getByRole('button',{name:'Save service feedback',exact:true}).click();await page.getByRole('button',{name:'Update service feedback',exact:true}).waitFor();
 assert.equal(writes[0].expectedRevision,0);assert.equal(writes[0].response.serviceFeedback.overall,'handled');assert.equal(writes[0].response.serviceFeedback.extraStaffingAnticipated,'unknown');assert.equal(writes[0].response.status,'closed');assert.equal(writes[0].response.trial,undefined);
 await load();await page.getByRole('button',{name:'Update service feedback',exact:true}).click();await page.getByLabel('I need to check with the team',{exact:true}).check();await page.getByLabel('What did you or the team notice?').fill('Synthetic: checking with the 4pm-8pm crew.');await page.getByRole('button',{name:'Review answer',exact:true}).click();await page.getByRole('button',{name:'Save service feedback',exact:true}).click();await page.getByText('Saved; check with the team, then update. This question remains open.').waitFor();
 assert.equal(writes[1].response.status,'follow_up');await page.getByRole('heading',{name:'Question to review',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Preview follow-up email',exact:true}).count(),0);
 await page.getByRole('button',{name:'Undo last save',exact:true}).click();await page.getByRole('heading',{name:'The crew handled it',exact:true}).waitFor();assert.equal(writes[2].expectedRevision,2);assert.equal(writes[2].undo,true);assert.equal(writes[2].response,undefined);
 await page.getByRole('button',{name:'Update service feedback',exact:true}).click();await page.getByLabel('What did you or the team notice?').fill('Synthetic: unsaved text must survive a revision conflict.');await page.getByRole('button',{name:'Review answer',exact:true}).click();rejectNext=true;await page.getByRole('button',{name:'Save service feedback',exact:true}).click();await page.getByRole('alert').filter({hasText:'This question or answer changed'}).waitFor();await page.getByRole('button',{name:'Back to edit',exact:true}).click();assert.equal(await page.getByLabel('What did you or the team notice?').inputValue(),'Synthetic: unsaved text must survive a revision conflict.');
 state=fixture('material_adds');await load();await page.getByRole('button',{name:'How the crew handled it',exact:true}).click();assert.equal(await page.getByLabel('Was the extra published coverage planned for this busier period?').inputValue(),'');assert.equal(await page.locator('form.lr-answer').evaluate(f=>f.checkValidity()),false);
 await page.getByLabel('Strained, but kept up',{exact:true}).check();await page.getByRole('button',{name:'Kitchen',exact:true}).click();await page.getByLabel('Did management step in to keep service moving?').selectOption('yes');await page.getByLabel('Was the extra published coverage planned for this busier period?').selectOption('yes');await page.getByLabel('What prompted that extra coverage?').fill('Synthetic: JV anticipated rain.');await page.getByLabel('What did you or the team notice?').fill('Synthetic: kitchen tickets backed up; manager helped.');await page.getByRole('button',{name:'Review answer',exact:true}).click();await page.getByRole('button',{name:'Save service feedback',exact:true}).click();await page.getByRole('button',{name:'Update service feedback',exact:true}).waitFor();assert.deepEqual(writes.at(-1).response.serviceFeedback,{overall:'strained',affectedDepartments:['kitchen'],managerHelp:'yes',extraStaffingAnticipated:'yes',anticipatedReason:'Synthetic: JV anticipated rain.'});
 state=fixture('material_adds');state.questions[0].demandSurge.knownOperatingExplanation='Synthetic saved operating reason.';await load();await page.getByText('Already noted: Synthetic saved operating reason.',{exact:true}).waitFor();await page.getByRole('button',{name:'How the crew handled it',exact:true}).click();assert.equal(await page.getByLabel('Was the extra published coverage planned for this busier period?').count(),0);
 state=fixture();state.questions[0].disposition={status:'withdrawn',source:'owner',reason:'Synthetic owner withdrawal.',withdrawnAt:'2026-10-28T18:00:00Z'};await load();assert.equal(await page.locator('article.lr-question button').count(),0);await page.getByText('No response required.',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({status:'passed',synthetic:true,productionRequests:0,productionWrites:0,mockWrites:writes.length,checks:['320/390/960 question and form layouts','no default service answer','required manager and conditional anticipation selection','confirmation before save','service payload and expectedRevision','reload persistence','pending team check remains open/no recap','undo with expectedRevision','409 retains unsaved text','material adds ask anticipation','known explanation suppresses repeated question','withdrawn question has no answer controls'],errors},null,2));
 console.log(JSON.stringify({status:'passed',synthetic:true,mockWrites:writes.length,errors}));
}catch(e){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:e.message,errors,html:await page.content()},null,2));throw e;}finally{await browser.close();await server.close();}
