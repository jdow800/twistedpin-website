/** Real loopback backend only. Mutates the dedicated synthetic Jingle database.
 * Start the isolated backend and Astro rehearsal first. External requests abort.
 * PLAYWRIGHT_MODULE/PLAYWRIGHT_EXECUTABLE may point at an installed local runtime.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const origin='http://127.0.0.1:55686';
const route='/jingle-bowl/booking/';
const output=fileURLToPath(new URL('../.astro/jingle-booking-rehearsal/',import.meta.url));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const observations=[];
try{
  for(const [room,width] of [['Traditional',390],['VIP',1280]]){
    const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Chicago'});
    const external=[],errors=[],failed=[];let completedBookingId=null;let attemptRequests=0;
    await context.route('**/*',req=>{if(new URL(req.request().url()).origin!==origin){external.push(new URL(req.request().url()).origin);return req.abort();}return req.continue();});
    const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
    page.on('response',async r=>{if(r.status()>=400){let detail='';if(r.url().includes('/rehearsal-api/')){try{const body=await r.text();detail=body.length<500?body:'Long response omitted';}catch{}}failed.push({path:new URL(r.url()).pathname,status:r.status(),detail});}});
    page.on('requestfailed',r=>failed.push({path:new URL(r.url()).pathname,error:r.failure()?.errorText}));
    page.on('request',r=>{if(r.url().includes('/checkout/payment-intents')&&r.method()==='POST')attemptRequests++;});
    page.on('response',async r=>{if(r.url().includes('/rehearsal/complete/')&&r.ok()){try{completedBookingId=(await r.json()).bookingId;}catch{}}});
    try{
      const anonymous=await page.goto(origin+route);assert.equal(anonymous.status(),401);
      await page.getByLabel('Password',{exact:true}).fill('jingle');await page.getByRole('button',{name:'Open preview'}).click();
      await page.getByRole('heading',{name:'Choose your lanes.',exact:true}).waitFor();
      const config=await page.evaluate(async()=>{const r=await fetch('/jingle-bowl/rehearsal-api/rehearsal/config/');if(!r.ok)throw Error('configuration unavailable');return r.json();});
      assert.equal(config.provider,'FakeRail');assert.equal(config.paymentMode,'simulation');
      assert.equal(await page.locator('.room-choice').count(),2);
      await page.getByLabel('How many people are coming, including non-bowlers?',{exact:true}).fill('5');
      await page.locator('.room-choice').filter({hasText:room}).click();
      await page.getByRole('button',{name:'More',exact:true}).click();
      const primary=()=>page.locator('.brand-continue');
      await primary().click();await page.getByRole('heading',{name:'Choose your time.',exact:true}).waitFor();
      assert.equal(await page.locator('.time-choice').count(),5);
      await page.locator('.time-choice').nth(room==='VIP'?0:1).click();
      await page.waitForFunction(()=>{const b=document.querySelector('.brand-continue');return b&&!b.disabled;});
      await primary().click();
      await page.getByRole('heading',{name:/Choose your pizza & soda\.|Add arcade play\./}).waitFor();
      if(await page.getByRole('heading',{name:'Add arcade play.',exact:true}).count())await page.getByRole('button',{name:'Continue without arcade',exact:true}).click();
      await page.getByRole('heading',{name:'Choose your pizza & soda.',exact:true}).waitFor();
      const pairs=page.locator('.tprs-nye-pair');await pairs.nth(1).waitFor();assert.equal(await pairs.count(),2);
      assert.equal(await page.locator('.tprs-consent').count(),0);
      assert.equal(await page.locator('input[type="checkbox"]').count(),1);
      for(let i=0;i<2;i++){
        await pairs.nth(i).getByRole('radio',{name:i?'Pepperoni':'Cheese only',exact:true}).check();
        await pairs.nth(i).getByRole('combobox').selectOption(i?'Starry':'Pepsi');
      }
      await page.locator('input[type="checkbox"]').check();
      for(const [selector,key] of [['#g-first','firstName'],['#g-last','lastName'],['#g-email','email'],['#g-phone','phone'],['#g-zip','zip']])await page.locator(selector).fill(config.customer[key]);
      await page.screenshot({path:output+`/${room.toLowerCase()}-food-${width}.png`,fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Food form overflows');
      await primary().click();await page.getByRole('heading',{name:'Review & pay.',exact:true}).waitFor();
      await page.getByRole('checkbox',{name:/I understand this is a rehearsal/}).check();
      let intercepted=false;
      await page.route('**/rehearsal/complete/',async interceptedRoute=>{
        if(intercepted)return interceptedRoute.continue();intercepted=true;
        if(room==='Traditional'){
          const completed=await interceptedRoute.fetch();assert.equal(completed.status(),200);
          completedBookingId=(await completed.json()).bookingId;
        }
        await interceptedRoute.abort();
      });
      const acceptedRequest=page.waitForRequest(req=>req.url().includes('/checkout/payment-intents')&&req.method()==='POST');
      await page.getByRole('button',{name:'Complete test reservation',exact:true}).click();
      const submitted=(await acceptedRequest).postDataJSON();
      assert.equal(submitted.customer.smsMarketingOptIn,undefined);assert.equal(submitted.customer.consentLanguage,undefined);
      assert.equal(submitted.formAnswers.filter(a=>a.unitIndex===1).length,2);
      assert.equal(submitted.formAnswers.filter(a=>a.unitIndex===2).length,2);
      await page.getByRole('alert').waitFor();
      if(room==='Traditional'){
        // Provider simulation already completed, but the response was lost.
        // Retry must recover that same booking without creating another attempt.
        await page.getByRole('button',{name:'Check and finish test reservation',exact:true}).click();
      }else{
        // Accepted attempt exists, with the ordinary cookie but no local draft.
        await page.evaluate(()=>sessionStorage.clear());await page.reload();
        await page.getByRole('button',{name:'Complete recovered test reservation',exact:true}).click();
      }
      await page.getByRole('heading',{name:'Rehearsal complete.',exact:true}).waitFor();
      assert.equal(attemptRequests,1,'Recovery must not create a second accepted attempt');
      assert.ok(completedBookingId);
      const projection=await page.evaluate(async id=>{const r=await fetch(`/jingle-bowl/rehearsal-api/rehearsal/booking/${id}/`);if(!r.ok)throw Error('Persisted projection unavailable');return r.json();},completedBookingId);
      assert.equal(projection.status,'ready');
      assert.equal(await page.getByText(/Your lanes are held/).count(),0);
      await page.screenshot({path:output+`/${room.toLowerCase()}-complete-${width}.png`,fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Confirmation overflows');
      observations.push({room,width,pairedFoods:2,provider:'FakeRail',confirmation:await page.getByText(/^Confirmation INV-/).textContent(),errors,external});
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      console.log(`PASS ${room}: protected ${width}px flow, two indexed pairs, no consent/provider/outbound, persisted confirmation`);
    }catch(error){await page.screenshot({path:output+`/${room.toLowerCase()}-failure.png`,fullPage:true});console.error({failed,errors,external});console.error((await page.locator('body').innerText()).slice(-4500));throw error;}
    finally{await context.close();}
  }
  await writeFile(output+'/results.json',JSON.stringify(observations,null,2));
}finally{await browser.close();}
