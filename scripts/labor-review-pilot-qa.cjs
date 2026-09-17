// Browser acceptance against the local real API harness, not mocked responses.
// node scripts/labor-review-pilot-qa.cjs <private-session.json> <output-dir>
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const session=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.equal(new URL(session.url).origin,'http://127.0.0.1:4327','QA writes are restricted to the local pilot');
const out=process.argv[3];fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(session.url);await page.getByRole('button',{name:'1',exact:true}).waitFor();
  // Existing PIN login, real signed cookie, real permission gate.
  for(const digit of session.pin)await page.getByRole('button',{name:digit,exact:true}).click();
  const login=page.getByRole('button',{name:/log in|sign in|unlock|enter/i}).first();
  if(await login.count())await login.click();
  await page.getByRole('heading',{name:'A few minutes to plan a better week'}).waitFor();
  await page.getByRole('heading',{name:/Sunday evening/}).waitFor();
  if(process.argv.includes('--capture-only')){
    for(const width of [320,390,736,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(out,`final-${width}.png`),fullPage:true});}
    assert.equal(await page.locator('.nav-drawer').count(),0);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({capturePassed:true,errors}));return;
  }
  const initial=await page.evaluate(async id=>(await fetch(`/tprs-api/admin/labor/reviews/${id}/`,{headers:{'HX-Request':'true'}})).json(),session.reviewId);
  const initialHistory=initial.questions[0].history.length;
  await page.screenshot({path:path.join(out,'mobile-before.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(await page.getByRole('button',{name:'Edit / add outcome'}).count())await page.getByRole('button',{name:'Edit / add outcome'}).click();
  const closeBox=page.getByLabel('Outcome recorded — close this question');if(await closeBox.count())await closeBox.uncheck();
  const training=page.getByRole('button',{name:'Training',exact:true});if(await training.getAttribute('aria-pressed')!=='true')await training.click();
  const note='QA fixture — new crew member training; not an actual GM explanation.';
  await page.getByLabel('What was happening?').fill(note);
  await page.getByLabel('Try an adjustment').check();
  await page.getByLabel('Next step (required)').fill('QA fixture — review next comparable Sunday.');
  await page.getByRole('button',{name:'Review answer',exact:true}).click();
  await page.getByRole('button',{name:'Save answer',exact:true}).click();
  await page.getByRole('button',{name:'Edit / add outcome'}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Edit / add outcome'}).waitFor();
  await page.locator('.lr-saved').getByText(note,{exact:true}).waitFor();
  const stale=await ctx.newPage();await stale.goto(session.url);await stale.getByRole('button',{name:'Edit / add outcome'}).waitFor();
  await page.getByRole('button',{name:'Edit / add outcome'}).click();
  await page.getByLabel('What was happening?').fill(note+' Corrected.');
  await page.getByRole('button',{name:'Review answer',exact:true}).click();await page.getByRole('button',{name:'Save answer',exact:true}).click();
  await page.getByRole('button',{name:'Edit / add outcome'}).waitFor();
  await stale.getByRole('button',{name:'Edit / add outcome'}).click();await stale.getByRole('button',{name:'Review answer',exact:true}).click();await stale.getByRole('button',{name:'Save answer',exact:true}).click();
  await stale.getByRole('alert').filter({hasText:'Another answer was saved'}).waitFor();await stale.close();
  await page.getByRole('button',{name:'Undo last save'}).click();await page.getByRole('button',{name:'Edit / add outcome'}).waitFor();
  await page.locator('.lr-saved').getByText(note,{exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit / add outcome'}).click();
  await page.getByLabel('What happened afterward?').fill('QA outcome only — verifies persistence, not an operating result.');
  await page.getByLabel('Outcome recorded — close this question').check();
  await page.getByRole('button',{name:'Review answer',exact:true}).click();await page.getByRole('button',{name:'Save answer',exact:true}).click();
  await page.getByRole('button',{name:'Edit / add outcome'}).waitFor();await page.reload();await page.locator('.lr-saved').getByText(/Outcome: QA outcome only/).waitFor();
  await page.screenshot({path:path.join(out,'mobile-saved.png'),fullPage:true});
  for(const width of [320,736,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);await page.screenshot({path:path.join(out,`saved-${width}.png`),fullPage:true});}
  // Fetch through the same authenticated route and retain the real history.
  const saved=await page.evaluate(async id=>(await fetch(`/tprs-api/admin/labor/reviews/${id}/`,{headers:{'HX-Request':'true'}})).json(),session.reviewId);
  assert.equal(saved.questions[0].history.length,initialHistory+4);assert.equal(saved.questions[0].response.status,'closed');assert.equal(saved.metric.percent,null);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,reviewId:session.reviewId,checks:['existing PIN login','real API/DB save','reload persistence','edit','stale-tab rejection','undo','outcome and closure','320/390/736/1280 no overflow','no browser exceptions'],saved},null,2));
  console.log(JSON.stringify({passed:true,history:saved.questions[0].history.length,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
