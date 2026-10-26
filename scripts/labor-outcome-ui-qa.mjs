// Mocked localhost-only browser checks; no production requests or real responses.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const {chromium}=await import(process.env.LABOR_PLAYWRIGHT_MODULE??'playwright');
import {fixture} from './labor-outcome-fixture.mjs';
const out=path.resolve(process.argv[2]??'');assert.ok(process.argv[2]);assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
fs.mkdirSync('.shots',{recursive:true});fs.writeFileSync('.shots/outcome-entry.js',`import React from 'react';import{createRoot}from'react-dom/client';import ReviewPilot from'../src/components/labor/ReviewPilot.tsx';import'../src/components/labor/labor.css';createRoot(document.getElementById('root')).render(React.createElement(ReviewPilot));`);
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="lq-app lq-pilot-app"><p style="padding:12px">FICTIONAL UI CHECK - All figures and responses are invented.</p><main class="lq-main"><div id="root"></div></main><script type="module" src="/.shots/outcome-entry.js"></script></body></html>';
const server=await createServer({configFile:false,optimizeDeps:{include:['react','react-dom/client']},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await server.listen();
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[],writes=[];let state=fixture(),rejectNext=false;
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.origin!==origin){errors.push('Unexpected external request '+url.origin);return route.abort();}
 if(url.pathname==='/__outcome/')return route.fulfill({status:200,contentType:'text/html',body:html});
 if(!url.pathname.includes('/tprs-api/'))return route.continue();
 const body=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 if(request.method()==='GET')return /\/reviews\/$/.test(url.pathname)?body({reviews:[{id:state.id,weekStart:state.packet.weekStart,open:state.questions.filter(q=>!q.response||q.response.serviceFeedback?.overall==='need_to_check').length}]}):body(state);
 assert.equal(request.method(),'POST');assert.match(url.pathname,/\/response\/$/);
 const input=request.postDataJSON();writes.push(input);if(rejectNext){rejectNext=false;return route.fulfill({status:409,contentType:'application/json',body:'{"error":"stale"}'});}
 const q=state.questions[0];assert.equal(input.questionId,q.id);assert.equal(input.expectedRevision,q.revision);
 if(input.undo)q.response=q.history.at(-2)?.response??null;else q.response=input.response;
 q.revision++;q.history.push({revision:q.revision,createdAt:'2026-10-29T17:00:00Z',kind:input.undo?'undo':'save',response:structuredClone(q.response)});q.canUndo=true;return body(state);
});
const card=()=>page.locator('article.lr-outcome-question');
const load=async()=>{await page.goto(origin+'/__outcome/');await page.getByRole('heading',{name:'Mon, Oct 26 · 4pm-8pm',level:3}).waitFor();};
const capture=async(name,width)=>{await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Overflow '+width);await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});};
try{
 await load();for(const width of [320,390,1280])await capture('unanswered',width);
 assert.equal(await card().getByRole('radio',{checked:true}).count(),0);assert.equal(await card().getByRole('button',{name:'Save',exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('Was the extra coverage planned for this?').count(),0);
 await page.setViewportSize({width:390,height:844});await page.getByLabel('Strained, but kept up',{exact:true}).check();await page.getByRole('button',{name:'Kitchen',exact:true}).click();await page.getByLabel('Did a manager step in?').selectOption('yes');await page.getByLabel('What happened?').fill('Fictional: kitchen delays, manager helped.');
 await card().getByRole('button',{name:'Save',exact:true}).click();await card().getByRole('button',{name:'Edit',exact:true}).waitFor();assert.equal(writes.length,1);assert.equal(writes[0].response.serviceFeedback.overall,'strained');assert.equal(writes[0].response.serviceFeedback.extraStaffingAnticipated,'unknown');assert.equal(writes[0].response.trial,undefined);await capture('saved',390);
 await load();await card().getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('I need to check with the team',{exact:true}).check();await page.getByLabel('What happened?').fill('Fictional: checking with this crew.');await card().getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Saved. Check with the team, then update; this stays open until then.').waitFor();await page.getByRole('heading',{name:'1 quick question',exact:true}).waitFor();
 await card().getByRole('button',{name:'Undo',exact:true}).click();await page.getByRole('heading',{name:'Strained, but kept up',exact:true}).waitFor();assert.equal(writes[2].undo,true);assert.equal(writes[2].response,undefined);
 await card().getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('What happened?').fill('Fictional unsaved revision.');rejectNext=true;await card().getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('alert').filter({hasText:'This question or answer changed'}).waitFor();assert.equal(await page.getByLabel('What happened?').inputValue(),'Fictional unsaved revision.');
 state=fixture('routine_sample');state.questions[0].outcomeReview.staffing.recorded={status:'unavailable',capturedAt:null,shifts:[]};state.questions[0].outcomeReview.metrics[0].actualValue=null;await load();await page.getByText('Routine service check',{exact:true}).waitFor();await page.getByText('Food & drink: $1,500 forecast → Unavailable actual',{exact:true}).waitFor();await capture('routine-unavailable',320);
 state.questions[0].disposition={status:'withdrawn',source:'owner',reason:'Fictional withdrawal',withdrawnAt:'2026-10-29T18:00:00Z'};await page.goto(origin+'/__outcome/');await page.getByText('No response required.',{exact:true}).waitFor();assert.equal(await page.locator('article.lr-question button').count(),0);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({status:'passed',synthetic:true,productionRequests:0,productionWrites:0,mockWrites:writes.length,checks:['320/390/1280 layouts','four labeled evidence layers','no default answer/no anticipation question','one-step structured save','reload/edit','need_to_check stays outstanding','undo with revision','409 preserves text','routine/unavailable evidence','withdrawn has no controls'],errors},null,2));console.log(JSON.stringify({status:'passed',mockWrites:writes.length,errors}));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,errors},null,2));throw error;}finally{await browser.close();await server.close();}
