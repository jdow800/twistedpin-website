/** Read-only connected projections of an existing synthetic booking.
 * The backend owner supplies ignored recovery-readback.json from the fresh
 * fixture. No capability is logged. All new cart/payment/booking writes abort.
 */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:55686';
const proof=JSON.parse(await readFile(new URL('../../jingle-resume-20261022/apps/backend/scripts/jingle-rehearsal/local/recovery-readback.json',import.meta.url),'utf8'));
assert.equal(typeof proof.sessionId,'string');
assert.equal(typeof proof.bookingId,'string');
assert.equal(typeof proof.cartToken,'string');
assert.ok(proof.cartToken.length>20);
const output=fileURLToPath(new URL('../.astro/jingle-saved-rehearsal/',import.meta.url));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Chicago'});
await context.addCookies([{name:'tprs_cart_token',value:proof.cartToken,url:origin,httpOnly:true,sameSite:'Lax'}]);
const denied=[],errors=[],calls=[];
await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){denied.push('external:'+url.origin);return route.abort();}
  if(request.method()!=='GET'&&request.method()!=='HEAD'){
    const allowed=request.method()==='POST'&&url.pathname==='/jingle-bowl/booking/';
    if(!allowed){denied.push(request.method()+' '+url.pathname);return route.abort();}
  }
  if(url.pathname.includes('/rehearsal-api/'))calls.push(request.method()+' '+url.pathname);
  return route.continue();
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
try{
  const login=await context.request.post(origin+'/jingle-bowl/booking/',{
    headers:{Origin:origin},form:{password:'jingle'},maxRedirects:0,
  });
  assert.equal(login.status(),303);
  const base='/jingle-bowl/rehearsal-api';
  const confirmationPath=`${base}/rehearsal/booking/${proof.bookingId}/confirmation/`;
  assert.equal((await page.goto(origin+confirmationPath)).status(),200);
  const config=await page.evaluate(async path=>{
    const response=await fetch(path+'/rehearsal/config/');
    if(!response.ok)throw Error('Configuration unavailable');return response.json();
  },base);
  assert.equal(config.sessionId,proof.sessionId);
  assert.equal(config.provider,'FakeRail');
  const projection=await page.evaluate(async path=>{
    const response=await fetch(path);if(!response.ok)throw Error('Saved projection unavailable');return response.json();
  },`${base}/rehearsal/booking/${proof.bookingId}/`);
  assert.equal(projection.status,'ready');
  assert.match(await page.locator('body').innerText(),/Jingle Bowl/i);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:output+'/confirmation-390.png',fullPage:true});
  assert.equal((await page.goto(origin+`${base}/rehearsal/booking/${proof.bookingId}/kitchen/`)).status(),200);
  assert.match(await page.locator('body').innerText(),/pizza|Cheese|Pepperoni/i);
  await page.screenshot({path:output+'/kitchen-390.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(denied,[]);
  await writeFile(output+'/results.json',JSON.stringify({width:390,provider:'FakeRail',existingBookingReadback:true,projectionStatus:projection.status,newMutations:0,calls,errors,denied},null,2));
  console.log('PASS existing synthetic booking confirmation/kitchen at390px using its original cookie; no cart/payment/booking writes, no external traffic.');
}catch(error){
  await page.screenshot({path:output+'/failure.png',fullPage:true});
  console.error({calls,errors,denied});
  console.error((await page.locator('body').innerText()).slice(-2500));
  throw error;
}finally{await context.close();await browser.close();}
