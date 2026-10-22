/** Connected owner-rehearsal regression. Creates ONE synthetic booking on the
 * dedicated loopback fixture; never resets it or contacts external services.
 * Run with PLAYWRIGHT_MODULE and PLAYWRIGHT_EXECUTABLE if needed locally.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const origin='http://127.0.0.1:55686';
const base='/jingle-bowl/rehearsal-api';
const output=fileURLToPath(new URL('../.astro/jingle-arcade-food/',import.meta.url));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Chicago'});
const external=[],errors=[],failures=[];let attempts=0;
await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(new URL(route.request().url()).origin);return route.abort();}return route.continue();});
const page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/checkout/payment-intents'))attempts++;});
page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('/booking/'))failures.push({path:new URL(response.url()).pathname,status:response.status()});});
const primary=()=>page.locator('.brand-continue');
const read=path=>page.evaluate(async path=>{const r=await fetch(path);if(!r.ok)throw Error(`Read failed (${r.status})`);return r.json();},base+path);
const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows horizontally');
try{
  assert.equal((await page.goto(origin+'/jingle-bowl/booking/')).status(),401);
  await page.getByLabel('Password',{exact:true}).fill('jingle');
  await page.getByRole('button',{name:'Open preview'}).click();
  await page.getByRole('heading',{name:'Choose your lanes.',exact:true}).waitFor();
  const catalog=await read('/api/products/?codes=9106,9107');
  assert.equal(catalog.products.length,2);
  for(const product of catalog.products){
    assert.equal(product.defaultPriceCents,product.code===9106?14995:18995);
    assert.equal(product.durationMinutes,90);
    assert.equal(product.salesCutoffMinutesBefore,30);
    assert.equal(product.addOnProducts.length,1);
    assert.equal(product.addOnProducts[0].code,9108);
    assert.equal(product.addOnProducts[0].defaultPriceCents,1500);
    assert.equal(product.addOnProducts[0].isRequired,false);
  }
  await page.locator('.room-choice').filter({hasText:'Traditional'}).click();
  await primary().click();
  await page.getByRole('heading',{name:'Choose your time.',exact:true}).waitFor();
  // Last approved start avoids filling the earlier two-lane recovery fixtures.
  await page.locator('.time-choice').last().click();
  await page.waitForFunction(()=>!document.querySelector('.brand-continue')?.disabled);
  await primary().click();
  await page.getByRole('heading',{name:'Add arcade play.',exact:true}).waitFor();
  const offer=page.getByRole('region',{name:'Arcade cards',exact:true});
  await offer.waitFor();
  assert.match(await offer.innerText(),/\$20/);
  assert.match(await offer.innerText(),/\$15(?:\.00)? per card/);
  await offer.getByRole('button',{name:'Add a card +',exact:true}).click();
  await offer.getByRole('button',{name:'More',exact:true}).click();
  assert.match(await offer.locator('.card-count').innerText(),/2 cards.*\$40(?:\.00)?/);
  for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});await noOverflow();
    await page.screenshot({path:output+`/arcade-${width}.png`,fullPage:true});
  }
  await primary().click();
  await page.getByRole('heading',{name:'Choose your pizza & soda.',exact:true}).waitFor();
  const pair=page.locator('.tprs-nye-pair');
  assert.equal(await pair.count(),1,'Two arcade cards must not create extra food pairs');
  const details=page.locator('.tprs-reservation-details');
  assert.equal(await details.getAttribute('open'),null);
  assert.equal(await details.locator('.tprs-richtext').count(),7,'All original information blocks stay available');
  assert.equal(await page.locator('input[type="checkbox"]').count(),1);
  assert.equal(await details.locator('input[type="checkbox"]').count(),0,'Acknowledgment stays outside the disclosure');
  assert.equal(await page.getByText('Please select one pizza for each lane reserved.',{exact:true}).count(),0);
  assert.equal(await page.locator('.tprs-consent').count(),0);
  await pair.getByRole('radio',{name:'Cheese only',exact:true}).check();
  await pair.getByRole('combobox').selectOption('Pepsi');
  await primary().click();
  assert.equal(await page.getByRole('heading',{name:'Review & pay.',exact:true}).count(),0,'Required acknowledgment still blocks progress');
  assert.equal(attempts,0);
  await page.getByText('Read full reservation information',{exact:true}).click();
  assert.notEqual(await details.getAttribute('open'),null);
  for(const heading of ['Reservation times','Your visit with Santa','When your bowling time ends','Photos on your device','Hot cocoa and cookies','Guest counts','Outside items']){
    assert.ok((await details.innerText()).includes(heading),`Missing reservation information: ${heading}`);
  }
  await page.getByText('Read full reservation information',{exact:true}).click();
  await page.locator('input[type="checkbox"]').check();
  for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>scrollTo(0,0));await noOverflow();
    await page.screenshot({path:output+`/food-${width}.png`,fullPage:true});
    await page.locator('#g-zip').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#g-zip').evaluate(el=>el.getBoundingClientRect().bottom<document.querySelector('.checkout-footer').getBoundingClientRect().top),'Last input can scroll above the footer');
  }
  await primary().click();
  await page.getByRole('heading',{name:'Review & pay.',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.ledger')?.textContent?.includes('$179.95'));
  assert.match(await page.locator('.reservation-ticket').innerText(),/2 × Arcade card/);
  await page.getByRole('checkbox',{name:/I understand this is a rehearsal/}).check();
  const accepted=page.waitForRequest(req=>req.method()==='POST'&&req.url().includes('/checkout/payment-intents'));
  const completed=page.waitForResponse(res=>res.url().includes('/rehearsal/complete/')&&res.ok());
  await page.getByRole('button',{name:'Complete test reservation',exact:true}).click();
  const request=(await accepted).postDataJSON();
  assert.equal(request.items.length,2);
  assert.equal(request.items.find(item=>item.productId.endsWith('9108')).quantity,2);
  assert.equal(request.formAnswers.filter(answer=>answer.unitIndex===1).length,2);
  assert.equal(request.formAnswers.filter(answer=>answer.unitIndex>1).length,0);
  assert.equal(request.customer.smsMarketingOptIn,undefined);
  const booking=await (await completed).json();
  await page.getByRole('heading',{name:'Rehearsal complete.',exact:true}).waitFor();
  const projection=await read(`/rehearsal/booking/${booking.bookingId}/`);
  assert.equal(projection.status,'ready');
  const confirmation=await page.evaluate(async path=>(await fetch(path)).text(),`${base}/rehearsal/booking/${booking.bookingId}/confirmation/`);
  assert.match(confirmation,/Arcade card/);
  assert.match(confirmation,/\$30\.00/);
  assert.match(confirmation,/\$179\.95/);
  assert.equal(attempts,1);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failures,[]);
  await writeFile(output+'/results.json',JSON.stringify({widths:[320,390,1280],laneCount:1,arcadeCards:2,playCreditCents:4000,arcadeChargeCents:3000,testTotalCents:17995,attempts,projectionStatus:projection.status,errors,external},null,2));
  console.log('PASS: regular arcade on both packages; 320/390/1280 layouts; full terms + required acknowledgment; 1 lane / 2 cards / $179.95 retained test total; one simulated checkout; no outbound requests.');
}catch(error){
  await page.screenshot({path:output+'/failure.png',fullPage:true});
  console.error({errors,external,failures});console.error((await page.locator('body').innerText()).slice(-4000));throw error;
}finally{
  // Release only this test browser's unaccepted cart on a failed UI assertion.
  // Once an attempt exists its recovery owns inventory; never clear that here.
  if(attempts===0)await page.evaluate(async base=>{
    const response=await fetch(base+'/api/cart/');if(!response.ok)return;
    const cart=await response.json();
    for(const item of cart.items??[])await fetch(base+'/api/cart/items/'+encodeURIComponent(item.cartLineRef)+'/',{method:'DELETE'});
  },base).catch(()=>{});
  await context.close();await browser.close();
}
