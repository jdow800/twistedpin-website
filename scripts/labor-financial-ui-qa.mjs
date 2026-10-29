// Real review components, fictional fixtures, localhost only. No POST requests permitted.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {financialFixture} from './labor-financial-fixture.mjs';
const {chromium}=await import(process.env.LABOR_PLAYWRIGHT_MODULE??'playwright');
const out=path.resolve(process.argv[2]??'');assert.ok(process.argv[2]);assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
fs.mkdirSync('.shots',{recursive:true});fs.writeFileSync('.shots/financial-entry.js',`import React from 'react';import{createRoot}from'react-dom/client';import ReviewPilot from'../src/components/labor/ReviewPilot.tsx';import'../src/components/labor/labor.css';createRoot(document.getElementById('root')).render(React.createElement(ReviewPilot));`);
const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="lq-app lq-pilot-app"><p style="padding:12px">FICTIONAL UI CHECK — All figures are invented.</p><main class="lq-main"><div id="root"></div></main><script type="module" src="/.shots/financial-entry.js"></script></body></html>';
const server=await createServer({configFile:false,optimizeDeps:{include:['react','react-dom/client']},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await server.listen();
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[],captures=[];let state=financialFixture();
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.origin!==origin){errors.push('Unexpected external request '+url.origin);return route.abort();}
 assert.equal(request.method(),'GET');
 if(url.pathname==='/__financial/')return route.fulfill({status:200,contentType:'text/html',body:html});
 if(!url.pathname.includes('/tprs-api/'))return route.continue();
 assert.match(url.pathname,/\/reviews\/(?:fictional-financial-review\/)?$/);
 const value=/\/reviews\/$/.test(url.pathname)?{reviews:[{id:state.id,weekStart:state.packet.weekStart,open:0}]}:state;
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
});
try{
 for(const scenario of ['included','partial','premium','unavailable']){
  state=financialFixture(scenario);await page.goto(origin+'/__financial/');await page.getByRole('region',{name:'Weekly labor percentage'}).waitFor();
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${scenario} overflow at ${width}`);
   await page.screenshot({path:path.join(out,`${scenario}-${width}.png`),fullPage:true});captures.push({scenario,width});
  }
  const metric=page.getByRole('region',{name:'Weekly labor percentage'});
  if(scenario==='included'){await metric.getByText('Includes 2 unapproved timecards.').waitFor();assert.equal(await metric.getByText('Pending',{exact:true}).count(),0);}
  if(scenario==='partial'){
   await metric.getByText('Data checks pending',{exact:true}).waitFor();await metric.getByText('Partial hourly wages $3,250 · Manager salary $700',{exact:true}).waitFor();
   await metric.getByRole('link',{name:'Details'}).click();assert.equal(await page.locator('#labor-calculation').getAttribute('open'),'');
   await page.getByText('View wage checks (1)',{exact:true}).click();await page.getByText('Oct 20: Missing clock-out.',{exact:true}).waitFor();
  }
  if(scenario==='premium'){await metric.getByText('Includes estimated overtime.',{exact:true}).waitFor();await metric.getByText('Provisional',{exact:true}).waitFor();assert.equal(await metric.getByText(/0 unapproved/).count(),0);}
  if(scenario==='unavailable'){await metric.getByText('Hourly wages Pending · Manager salary $700',{exact:true}).waitFor();assert.equal(await metric.getByText(/Partial/).count(),0);}
 }
 assert.deepEqual(errors,[]);const receipt={status:'passed',synthetic:true,productionRequests:0,productionWrites:0,captures,checks:['included pending costs','partial subtotal and independent salary','unresolved status precedence','dated reason and functioning details link','premium-only estimate','source-unavailable amounts remain pending','no viewport overflow'],errors};
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,errors},null,2));throw error;}finally{await browser.close();await server.close();}
