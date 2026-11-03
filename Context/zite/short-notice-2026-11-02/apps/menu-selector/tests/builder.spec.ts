import { test, expect, type Page } from '@playwright/test';
import capturedEstimate from './fixtures/estimate-75.json' with { type: 'json' };
import { inputFingerprint, canonicalBuild } from '../src/lib/builderContract';

async function chooseEstimate(page: Page, lane: 'vip' | 'traditional', hours: 2 | 3) {
  const panel = page.locator('#estimate-panel');
  await panel.getByRole('button', { name: `${hours} hours`, exact: true }).click();
  await panel.getByRole('button', { name: `Choose ${lane === 'vip' ? 'VIP Suite' : 'Traditional lanes'} for ${hours} hours`, exact: true }).click();
}

const NOW='2026-10-23T15:00:00Z';
type Mock = { error?: string; malformed?: 'network' | 'json' | 'success' | 'notice'; captured?: boolean; neighbors?: boolean; corrupt?: 'notices' | 'items' | 'options' | 'total' | 'deposit' | 'date' | 'start' | 'guests'; badErrorMessage?: boolean; delay?: number; closed?: boolean; requests: string[] };
async function setup(page:Page, mock:Mock={requests:[]}) {
  await page.clock.install({time:new Date(mock.captured ? '2026-10-27T15:00:00Z' : NOW)});
  await page.route('**/*', async route => {
    const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1') return route.continue();
    if(url.pathname==='/api/estimate/menu/') {
      const date=url.searchParams.get('d');
      return route.fulfill({json:{ok:true,date,date_restriction:mock.closed?{code:'closed',message:'Closed for this test date.'}:null,
        packages:['pizza_pop','stars_strikes','italiano','burrito_bowl'],
        pizza_pop:{offered:url.searchParams.get('tier')!=='el'&&!mock.closed},
        rates:{step:5,service_fee_rate:.18,tax_rate:.1,packages:{pizza_pop:{floor:10,per_head:19},stars_strikes:{floor:15,per_head:24},italiano:{floor:15,per_head:26},burrito_bowl:{floor:15,per_head:26}}},
        rules:{vip_3h_recommended_from:43,trad_only_floor:76,vip_ceiling:80}}});
    }
    if(url.pathname==='/api/estimate/track/') return route.fulfill({json:{ok:true}});
    if(url.pathname==='/api/estimate/') {
      const current = { ...mock }; // Capture this attempt before any delayed response.
      mock.requests.push(url.search);
      if(current.delay) await new Promise(r=>setTimeout(r,current.delay));
      if(current.malformed==='network') return route.abort('connectionreset');
      if(current.malformed==='json') return route.fulfill({status:200,contentType:'application/json',body:'{invalid-json'});
      if(current.error) return route.fulfill({status:current.error==='engine_unavailable'?503:422,json:{ok:false,code:current.error,message:current.badErrorMessage?{error:'malformed policy text'}:current.error==='engine_unavailable'?'Pricing is temporarily unavailable.':'This selection is not allowed.'}});
      const date=url.searchParams.get('d')!,start=url.searchParams.get('t')!,guests=Number(url.searchParams.get('g'));
      const days=(Date.parse(date+'T00:00:00Z')-Date.parse('2026-10-23T00:00:00Z'))/86400000;
      // Producer-shaped synthetic response. Nonempty strings exercise the real text contract.
      const option=(key:string,lane_type:'vip'|'traditional',hours:number)=>{
        if(hours===3 && start==='20:00') return null;
        const total=guests*10+455+(hours===3?100:0)+(lane_type==='traditional'?50:0);
        return {key,lane_type,hours,lanes:3,whole_suite:false,lane_label:lane_type==='vip'?'VIP Suite':'Traditional lanes',
          lines:[{key:'bowling',label:lane_type==='vip'?'VIP Suite':'Traditional lanes',amount:total-300},{key:'food',label:'Food',items:['Included food detail'],amount:300}],
          ...(current.malformed==='notice'?{notice:{error:'malformed notice'}}:{}),
          total:current.malformed==='success'?null:total,deposit:Math.round(total/10)*5,includes_service_and_tax:true,food_billed_for:guests};
      };
      const data:any=current.captured?structuredClone(capturedEstimate):{ok:true,date,start,days_out:days,planned_for:guests,deposit_shown:days>=10,default:guests>=76?'trad_2h':'vip_2h',regime:guests>=76?'traditional_only':'standard',
        options:{vip_2h:guests>=76?null:option('vip_2h','vip',2),vip_3h:guests>=76?null:option('vip_3h','vip',3),trad_2h:option('trad_2h','traditional',2),trad_3h:option('trad_3h','traditional',3)},
        notices:['Recommendation from pricing.'],neighbors:[]};
      if(current.neighbors) data.neighbors=[{key:'vip_2h',guests:20,total:655,deposit:330,lane_label:'VIP Suite'}];
      switch(current.corrupt){
        case 'notices':data.notices=[{message:'Invalid object notice'}];break;
        case 'items':data.options.vip_2h.lines[1].items=[{label:'Invalid object item'}];break;
        case 'options':delete data.options.trad_3h;break;
        case 'total':data.options.vip_2h.total=0;break;
        case 'deposit':data.options.vip_2h.deposit=data.options.vip_2h.total+1;break;
        case 'date':data.date='2026-12-04';break;
        case 'start':data.start='18:00';break;
        case 'guests':data.planned_for=guests+1;break;
      }
      return route.fulfill({json:data});
    }
    // No production workflow, email, beacon, video, analytics, or asset call escapes this test.
    if(route.request().resourceType()==='image') return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="64"><rect width="180" height="64" fill="#252b2b"/><text x="15" y="40" fill="#ffffff" font-size="22">Twisted Pin</text></svg>'});
    return route.abort();
  });
}
async function ready(page:Page,path='/b/es/E-TEST',date='2026-10-24',food='stars-strikes',guests=15) {
  await page.goto(path+(path.includes('?')?'&':'?')+'d='+date+'&t=16:00&g='+guests);
  await expect(page.locator('input[type=date]')).toHaveAttribute('min','2026-10-23');
  await page.locator('#builder-pkg-'+food).getByRole('button').first().click();
  if(guests<=100) await expect(page.getByRole('button',{name:'See estimate',exact:true})).toBeVisible();
}
async function price(page:Page) {
  await page.getByRole('button',{name:/^(See estimate|Update estimate|Retry estimate)$/}).last().click();
  await expect(page.getByRole('button',{name:'Review request →',exact:true})).toBeVisible();
}
async function review(page:Page) { await page.getByRole('button',{name:'Review request →',exact:true}).click(); }
async function closeReview(page:Page) {
  await page.locator('.fixed.inset-0.z-50 button').first().click();
}
async function publicContact(page:Page,email='first@example.test'){
  await page.getByPlaceholder('First',{exact:true}).fill('Test');
  await page.getByPlaceholder('Last',{exact:true}).fill('Guest');
  await page.getByPlaceholder('(555) 555-5555').fill('5550101234');
  await page.getByPlaceholder('you@example.com').fill(email);
}
async function submissions(page:Page){return page.evaluate(()=>(window as any).__submissions??[]);}
test('tomorrow priced request on all entry routes preserves exact numeric evidence',async({page},info)=>{
  await setup(page);
  for(const path of ['/b/es/E-TEST','/b/el/E-TEST','/build?eid=E-TEST','/eventmenu']){
    await ready(page,path);
    if(path.includes('/el/')) await expect(page.locator('#builder-pkg-pizza-pop')).toHaveCount(0);
    await price(page);
    await expect(page.locator('#estimate-panel')).not.toContainText('50% deposit');
    await expect(page.locator('#estimate-panel')).not.toContainText('7 days');
    await review(page);
    await expect(page.locator('pre')).toContainText('Estimate: About $605');
    await expect(page.locator('pre')).toContainText('short-notice request');
    if(path==='/b/es/E-TEST') {
      await page.waitForTimeout(1000); // Let the existing smooth scroll finish before visual QA.
      const overlay=page.locator('.fixed.inset-0.z-50');
      await overlay.evaluate(el => { el.scrollTop=0; });
      await expect.poll(() => overlay.evaluate(el => el.getBoundingClientRect().top)).toBe(0);
      await expect(page.getByRole('button',{name:'Send request with this estimate'})).toBeInViewport();
      await page.screenshot({path:'/tmp/short-notice-'+info.project.name+'-review.png',scale:'css',animations:'disabled'});
    }
    if(path==='/eventmenu') await publicContact(page);
    await page.getByRole('button',{name:'Send request with this estimate'}).click();
    await expect(page.getByText(/^Request sent\./)).toBeVisible();
    const items=await submissions(page),p=items.at(-1).payload;
    expect(p.pricing_status).toBe('estimate_shown');expect(p.estimate.total).toBe(605);expect(p.estimate.deposit).toBe(305);
    if(path==='/eventmenu') expect(p.foodPackageSlug).toBe('stars_strikes');
    else expect(p.estimate.input_fingerprint).toBe(inputFingerprint(p));
  }
});
test('day9 short notice and day10 standard copy; all packages/options stay usable',async({page})=>{
  await setup(page);
  for(const [date,deposit] of [['2026-11-01',false],['2026-11-02',true]] as const){
    await ready(page,'/b/es/E-TEST',date,'pizza-pop');
    await price(page);
    if(deposit) await expect(page.locator('#estimate-panel')).toContainText('50% deposit');
    else await expect(page.locator('#estimate-panel')).not.toContainText('50% deposit');
    for(const food of ['stars-strikes','twisted-italiano','burrito-bowl']){
      await page.locator('#builder-pkg-'+food).getByRole('button').first().click();await price(page);
    }
    await chooseEstimate(page, 'traditional', 3);
    await review(page);
    await expect(page.locator('pre')).toContainText('3 hours');
    await expect(page.locator('pre')).toContainText('Traditional Lanes');
    await page.getByRole('button',{name:'Send request with this estimate'}).click();
    const p=(await submissions(page)).at(-1).payload;
    expect(p.event.lane_type).toBe('traditional');expect(p.event.duration).toBe(3);expect(p.estimate.total).toBe(755);
  }
});
test('all edits invalidate price; old asynchronous calculation cannot restore stale result',async({page})=>{
  const mock:Mock={requests:[],delay:900};await setup(page,mock);
  await ready(page);
  await page.getByRole('button',{name:'See estimate',exact:true}).click();
  await expect.poll(()=>mock.requests.length).toBe(1);
  await page.locator('input[inputmode=numeric]').fill('20');
  await expect(page.getByRole('button',{name:'Review request →'})).toHaveCount(0);
  mock.delay=0;await price(page);
  await expect(page.locator('#estimate-panel')).toContainText('$655');
  await page.waitForTimeout(1000);
  await expect(page.locator('#estimate-panel')).toContainText('$655');
  await expect(page.locator('#estimate-panel')).not.toContainText('$605');
  await page.locator('input[type=date]').fill('2026-10-25');
  await expect(page.getByRole('button',{name:'Review request →'})).toHaveCount(0);
  await page.locator('select').first().selectOption('16:00');await price(page);
  await page.locator('select').first().selectOption('16:30');
  await expect(page.getByRole('button',{name:'Review request →'})).toHaveCount(0);
  await price(page);
  // A package edit must recalculate before final review.
  await page.locator('#builder-pkg-burrito-bowl').getByRole('button').first().click();
  await expect(page.getByRole('button',{name:'Update estimate',exact:true}).last()).toBeVisible();
});
test('100 priced;100+ and outside hours manual never carry prior amount',async({page})=>{
  await setup(page);await ready(page,'/b/es/E-TEST','2026-10-24','stars-strikes',100);await price(page);
  await review(page);await expect(page.locator('pre')).toContainText('Estimate: About $1,505');await closeReview(page);
  await page.getByRole('button',{name:'+',exact:true}).click();
  await page.getByRole('button',{name:'Ask our team for a quote',exact:true}).click();
  await expect(page.locator('pre')).not.toContainText('$1,505');
  await expect(page.locator('pre')).toContainText('no event estimate');
  await page.getByRole('button',{name:'Ask our team for a quote',exact:true}).last().click();
  let p=(await submissions(page)).at(-1).payload;expect(p.estimate).toBeNull();expect(p.event.guests).toBe('100+');
  await ready(page);await price(page);
  await page.locator('select').first().selectOption('__outside__');
  await page.getByPlaceholder('e.g. 10am to 1pm').fill('10am');
  await page.getByRole('button',{name:'Ask our team for a quote',exact:true}).click();
  await expect(page.locator('pre')).not.toContainText('$605');
  await page.getByRole('button',{name:'Ask our team for a quote',exact:true}).last().click();
  p=(await submissions(page)).at(-1).payload;expect(p.estimate).toBeNull();expect(p.event.start_time).toBe('outside_hours');
});
test('only transient failure offers explicit manual quote; closed and invalid date never bypass',async({page})=>{
  const mock:Mock={requests:[],error:'engine_unavailable'};await setup(page,mock);await ready(page);
  await page.getByRole('button',{name:'See estimate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry estimate',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toHaveCount(0);
  await expect(page.locator('#estimate-panel')).toContainText('Please retry');
  await page.getByRole('button',{name:'Retry estimate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ask our team for a quote',exact:true}).click();
  await expect(page.locator('pre')).toContainText('no event estimate');
  await page.getByRole('button',{name:'Ask our team for a quote',exact:true}).last().click();
  expect((await submissions(page)).at(-1).payload.manual_reason).toBe('estimate_unavailable');
  mock.error='forbidden';await ready(page);await page.getByRole('button',{name:'See estimate',exact:true}).click();
  await expect(page.getByText('This selection is not allowed.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toHaveCount(0);
  mock.closed=true;await ready(page,'/b/el/E-TEST','2026-12-25','stars-strikes',105);
  await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Choose a date',exact:true}).click();
  await expect(page.locator('input[type=date]')).toBeFocused();
  expect(await submissions(page)).toHaveLength(0);
  await expect(page.getByText('Closed for this test date.').first()).toBeVisible();
  mock.closed=false;
  await page.locator('input[type=date]').fill('2026-10-22');
  await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Choose a date',exact:true}).click();
  await expect(page.locator('input[type=date]')).toBeFocused();
  expect(await submissions(page)).toHaveLength(0);
  await expect(page.getByText(/Choose today or a later date/).first()).toBeVisible();
});
test('CT rollover expires final review; stable retries reuse timestamp; public correction updates contact',async({page})=>{
  await setup(page);await ready(page);await price(page);await review(page);
  await page.clock.setSystemTime(new Date('2026-10-24T05:00:01Z'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button',{name:'Send request with this estimate'})).toBeDisabled();
  await expect(page.locator('pre')).not.toContainText('$605');
  await page.clock.setSystemTime(new Date(NOW));await ready(page);await price(page);await review(page);
  await page.evaluate(()=>{(window as any).__rejectCount=1});
  await page.getByRole('button',{name:'Send request with this estimate'}).click();
  await expect(page.getByText(/^Request sent\./)).toBeVisible();
  let items=await submissions(page);expect(items.at(-1).payload).toEqual(items.at(-2).payload);
  await ready(page,'/eventmenu');await price(page);await review(page);await publicContact(page);
  await page.evaluate(()=>{(window as any).__rejectCount=1});
  await page.getByRole('button',{name:'Send request with this estimate'}).click();
  await expect(page.getByText(/That didn't go through/)).toBeVisible();
  await page.getByPlaceholder('you@example.com').fill('corrected@example.test');
  await page.getByRole('button',{name:'Send request with this estimate'}).click();
  await expect(page.getByText(/^Request sent\./)).toBeVisible();
  items=await submissions(page);expect(items.at(-1).payload.email).toBe('corrected@example.test');
});
test('bare staff gate preserved and authenticated calculator has no Send control',async({page})=>{
  await setup(page);await page.goto('/build');
  await expect(page.getByText('Enter the staff passcode to continue.')).toBeVisible();
  await page.locator('input[type=password]').fill('test-only');await page.getByRole('button',{name:'Unlock',exact:true}).click();
  await expect(page.getByText('Staff calculator',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Send|Ask our team/})).toHaveCount(0);
});

test('VIP recommendation permits explicit2h and late2h-only API fallback',async({page})=>{
  await setup(page);await ready(page,'/b/es/E-TEST','2026-11-02','stars-strikes',50);
  await page.locator('#step-when').getByRole('button',{name:'2 hours',exact:true}).click();
  await page.locator('select').first().selectOption('20:00');
  await price(page);await review(page);
  await expect(page.locator('pre')).toContainText('2 hours');
  await page.getByRole('button',{name:'Send request with this estimate'}).click();
  const p=(await submissions(page)).at(-1).payload;expect(p.event.duration).toBe(2);expect(p.estimate.total).toBe(955);
  await ready(page,'/b/es/E-TEST','2026-11-02','stars-strikes',50);
  // Prefill late start with default recommended3h; API has only2h options.
  await page.goto('/b/es/E-TEST?d=2026-11-02&t=20:00&g=50');
  await page.locator('#builder-pkg-stars-strikes').getByRole('button').first().click();
  await price(page);await review(page);await expect(page.locator('pre')).toContainText('2 hours');
});

test('bar, quantity and addon edits bind exact canonical config; manual SMS fallback is unpriced',async({page})=>{
  await setup(page);await ready(page);await price(page);
  await page.locator('#builder-drink-beerwall').getByRole('button').first().click();
  await expect(page.getByRole('button',{name:'Update estimate',exact:true}).last()).toBeVisible();await price(page);
  await page.locator('#builder-drink-15_card').click();await price(page);
  await page.locator('#builder-drink-beerwall').getByRole('button',{name:'−',exact:true}).click();
  await expect(page.getByRole('button',{name:'Update estimate',exact:true}).last()).toBeVisible();await price(page);
  await page.getByRole('button',{name:/^Tiramisu \$110/}).click();
  await expect(page.getByRole('button',{name:'Update estimate',exact:true}).last()).toBeVisible();await price(page);
  await review(page);await page.getByRole('button',{name:'Send request with this estimate'}).click();
  const p=(await submissions(page)).at(-1).payload;
  expect(p.bar_selection).toBe('15_card');expect(p.bar_qty).toBe(14);
  expect(p.add_ons).toEqual([{slug:'tiramisu',qty:1}]);expect(p.estimate.input_fingerprint).toBe(inputFingerprint(p));
  await ready(page);await price(page);
  await page.locator('select').first().selectOption('__outside__');
  await page.getByPlaceholder('e.g. 10am to 1pm').fill('10am');
  await page.getByRole('button',{name:'Ask our team for a quote',exact:true}).click();
  await page.evaluate(()=>{(window as any).__rejectCount=2});
  await page.getByRole('button',{name:'Ask our team for a quote',exact:true}).last().click();
  await expect(page.getByRole('link',{name:'Text it to us'})).toBeVisible();
  const href=await page.getByRole('link',{name:'Text it to us'}).getAttribute('href');
  expect(decodeURIComponent(href!)).not.toContain('$605');expect(decodeURIComponent(href!)).toContain('no event estimate');
});


test('manual fallback needs two consecutive failures and resets after success, input edits and other errors',async({page},info)=>{
  const mock:Mock={requests:[],error:'engine_unavailable'};await setup(page,mock);await ready(page);
  const retry=()=>page.getByRole('button',{name:'Retry estimate',exact:true});
  const manual=()=>page.getByRole('button',{name:'Ask our team for a quote',exact:true});
  await page.getByRole('button',{name:'See estimate',exact:true}).click();
  await expect(retry()).toBeVisible();await expect(manual()).toHaveCount(0);
  await retry().click();await expect(manual()).toBeVisible();
  await page.locator('#estimate-panel').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/pricing-retry-'+info.project.name+'-fallback.png',scale:'css',animations:'disabled'});
  // A successful retry ends the consecutive failure run.
  mock.error=undefined;await retry().click();
  await expect(page.getByRole('button',{name:'Review request →',exact:true})).toBeVisible();
  mock.error='rate_limited';await page.locator('input[inputmode=numeric]').fill('20');
  await page.getByRole('button',{name:'Update estimate',exact:true}).last().click();
  await expect(retry()).toBeVisible();await expect(manual()).toHaveCount(0);
  await retry().click();await expect(manual()).toBeVisible();
  // Returning to an earlier input set must not recover its previous failure count.
  await page.locator('input[inputmode=numeric]').fill('25');
  await page.getByRole('button',{name:'Update estimate',exact:true}).last().click();
  await expect(retry()).toBeVisible();await expect(manual()).toHaveCount(0);
  await page.locator('input[inputmode=numeric]').fill('20');
  await page.getByRole('button',{name:'Update estimate',exact:true}).last().click();
  await expect(retry()).toBeVisible();await expect(manual()).toHaveCount(0);
  // A policy refusal breaks the run even if another transient failure follows.
  mock.error='forbidden';await retry().click();await expect(page.getByText('This selection is not allowed.')).toBeVisible();
  mock.error='engine_unavailable';await retry().click();
  await expect(retry()).toBeVisible();await expect(manual()).toHaveCount(0);
  await retry().click();await expect(manual()).toBeVisible();
});

test('cancelled stale failures do not count toward manual quote fallback',async({page})=>{
  const mock:Mock={requests:[],error:'engine_unavailable',delay:900};await setup(page,mock);await ready(page);
  await page.getByRole('button',{name:'See estimate',exact:true}).click();
  await expect.poll(()=>mock.requests.length).toBe(1);
  await page.locator('input[inputmode=numeric]').fill('20');
  await page.waitForTimeout(1000);
  mock.delay=0;await page.getByRole('button',{name:'See estimate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry estimate',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__pricingDiagnostics?.length??0)).toBe(1);
  await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Retry estimate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toBeVisible();
});

test('pricing diagnostics distinguish API, network, JSON and malformed-success failures, then recovery',async({page})=>{
  const mock:Mock={requests:[]};await setup(page,mock);
  const diagnostics=()=>page.evaluate(()=>(window as any).__pricingDiagnostics??[]);
  for(const [malformed,error,kind,status] of [
    [undefined,'engine_unavailable','http',503],
    ['network',undefined,'network',null],
    ['json',undefined,'invalid_json',200],
    ['success',undefined,'invalid_response',200],
    ['notice',undefined,'invalid_response',200],
  ] as const){
    mock.malformed=malformed;mock.error=error;
    await ready(page,'/b/el/E-TEST','2026-11-02');
    await page.getByRole('button',{name:'See estimate',exact:true}).click();
    await expect(page.getByRole('button',{name:'Retry estimate',exact:true})).toBeVisible();
    let logs=await diagnostics();
    expect(logs).toHaveLength(1);
    expect(logs[0].event).toBe('failure');expect(logs[0].failure.kind).toBe(kind);
    expect(logs[0].failure.http_status).toBe(status);expect(logs[0].consecutive_failures).toBe(1);
    expect(logs[0].configuration.event).toEqual({date:'2026-11-02',start_time:'16:00',duration:2,guests:15,lane_type:'vip'});
    expect(logs[0].configuration.food_package).toBe('stars_strikes');
    expect(logs[0].eid).toBe('E-TEST');expect(logs[0].mode).toBe('linked');
    expect(logs[0].input_fingerprint).toBe(inputFingerprint(logs[0].configuration));
    expect(logs[0]).not.toHaveProperty('notes');expect(logs[0].failure).not.toHaveProperty('message');
    await page.getByRole('button',{name:'Retry estimate',exact:true}).click();
    await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toBeVisible();
    logs=await diagnostics();expect(logs).toHaveLength(2);
    expect(logs[1].consecutive_failures).toBe(2);
    expect(logs[1].attempt_id).not.toBe(logs[0].attempt_id);
    expect(logs[1].session_id).toBe(logs[0].session_id);
    mock.error=undefined;mock.malformed=undefined;
    await price(page);
    logs=await diagnostics();expect(logs).toHaveLength(3);
    expect(logs[2].event).toBe('recovered');expect(logs[2].consecutive_failures).toBe(2);
    expect(logs[2]).not.toHaveProperty('failure');
    expect(logs[2].session_id).toBe(logs[0].session_id);
    await expect(page.locator('#estimate-panel')).toContainText('$605');
  }
});

test('diagnostic transport failure cannot block retry, recovery or a submission',async({page})=>{
  const mock:Mock={requests:[],error:'engine_unavailable'};await setup(page,mock);
  await ready(page);
  await page.evaluate(()=>{(window as any).__diagnosticReject=true;});
  await page.getByRole('button',{name:'See estimate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry estimate',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Retry estimate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toBeVisible();
  mock.error=undefined;await price(page);await review(page);
  await page.getByRole('button',{name:'Send request with this estimate'}).click();
  await expect(page.getByText(/^Request sent\./)).toBeVisible();
  const sent=await submissions(page);expect(sent).toHaveLength(1);
  expect(sent[0].payload.pricing_status).toBe('estimate_shown');
});

test('malformed policy error text cannot crash the page or enable manual pricing',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const mock:Mock={requests:[],error:'closed',badErrorMessage:true};await setup(page,mock);await ready(page);
  await page.getByRole('button',{name:'See estimate',exact:true}).click();
  await expect(page.getByText('Check your event selections and try again.')).toBeVisible();
  await page.getByRole('button',{name:'Retry estimate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry estimate',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toHaveCount(0);
  expect(errors).toEqual([]);
  const logs=await page.evaluate(()=>(window as any).__pricingDiagnostics??[]);
  expect(logs).toHaveLength(2);expect(logs[1].failure.api_code).toBe('closed');
  expect(logs[1].consecutive_failures).toBe(0);
});

test('reported 75-guest producer response renders and submits exact captured prices',async({page},info)=>{
  const mock:Mock={requests:[],captured:true};await setup(page,mock);
  await page.goto('/b/el/E-TEST?d=2026-12-05&t=19:00&g=75');
  await page.locator('#builder-pkg-stars-strikes').getByRole('button').first().click();
  await page.locator('#builder-drink-beerwall').getByRole('button').first().click();
  await page.locator('#builder-drink-15_card').click();
  const addon=page.locator('#builder-addon-meat_cheese_board');
  await addon.getByRole('button').first().click();
  await addon.getByRole('button',{name:'+',exact:true}).click();
  await price(page);
  const requested=new URLSearchParams(mock.requests[0]);
  expect(Object.fromEntries(requested)).toEqual({d:'2026-12-05',t:'19:00',g:'75',f:'stars_strikes',b:'15_card',bq:'75',a:'meat_cheese_board:2'});
  const panel=page.locator('#estimate-panel');
  await expect(panel).toContainText(capturedEstimate.notices[0]);
  await expect(panel.getByRole('button',{name:'Choose VIP Suite for 3 hours',exact:true})).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).toContainText('$6,585');
  await panel.getByText('Add-ons',{exact:true}).click();
  await expect(panel).toContainText('Assorted Meat & Cheese Board × 2');
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/pricing-contract-'+info.project.name+'-estimate.png',scale:'css',animations:'disabled'});
  expect(await page.evaluate(()=>(window as any).__pricingDiagnostics??[])).toEqual([]);
  await panel.getByText('Booking and payment details', { exact: true }).click();
  await expect(panel.getByText(/A 50% deposit reserves/)).toBeVisible();
  await expect(panel.getByText(/Final headcount and balance are due 7 days/)).toBeVisible();
  await review(page);
  await expect(page.locator('pre')).toContainText('$6,585');
  await page.getByRole('button',{name:'Send request with this estimate'}).click();
  await expect(page.getByText(/^Request sent\./)).toBeVisible();
  const sent=await submissions(page);expect(sent).toHaveLength(1);
  const p=sent[0].payload;
  const canonical={event:{date:'2026-12-05',start_time:'19:00',duration:3,guests:75,lane_type:'vip'},
    food_package:'stars_strikes',bar_selection:'15_card',bar_qty:75,add_ons:[{slug:'meat_cheese_board',qty:2}]} as const;
  expect(p).toMatchObject({...canonical,pricing_status:'estimate_shown'});
  expect(p.estimate).toEqual({total:6585,deposit:3295,lane_label:capturedEstimate.options.vip_3h.lane_label,input_fingerprint:inputFingerprint(p)});
  expect(p.estimate.input_fingerprint).toBe(inputFingerprint(canonical as any));
});
test('string item detail renders and a producer guest-count neighbor invalidates pricing',async({page})=>{
  const mock:Mock={requests:[],neighbors:true};await setup(page,mock);await ready(page);await price(page);
  await expect(page.locator('#estimate-panel')).toContainText('Included food detail');
  expect(new URLSearchParams(mock.requests[0]).has('n')).toBe(false);
  await page.getByRole('button',{name:'20 → about $655',exact:true}).click();
  await expect(page.locator('input[inputmode=numeric]')).toHaveValue('20');
  await expect(page.getByRole('button',{name:'Review request →',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Update estimate',exact:true}).last()).toBeVisible();
  expect(await submissions(page)).toEqual([]);
});
test('malformed producer fields and stale request identity enter retry',async({page})=>{
  const mock:Mock={requests:[]};await setup(page,mock);
  for(const corrupt of ['notices','items','options','total','deposit','date','start','guests'] as const){
    mock.corrupt=corrupt;await ready(page);
    await page.getByRole('button',{name:'See estimate',exact:true}).click();
    await expect(page.getByRole('button',{name:'Retry estimate',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Review request →',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Ask our team for a quote',exact:true})).toHaveCount(0);
    const logs=await page.evaluate(()=>(window as any).__pricingDiagnostics??[]);
    expect(logs).toHaveLength(1);expect(logs[0].failure.kind).toBe('invalid_response');
  }
});
test('superseded successful retry cannot restore price or report recovery',async({page})=>{
  const mock:Mock={requests:[],error:'engine_unavailable'};await setup(page,mock);await ready(page);
  await page.getByRole('button',{name:'See estimate',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry estimate',exact:true})).toBeVisible();
  mock.error=undefined;mock.delay=900;
  await page.getByRole('button',{name:'Retry estimate',exact:true}).click();
  await expect.poll(()=>mock.requests.length).toBe(2);
  await page.locator('input[inputmode=numeric]').fill('20');
  await page.waitForTimeout(1100);
  await expect(page.getByRole('button',{name:'Review request →',exact:true})).toHaveCount(0);
  const logs=await page.evaluate(()=>(window as any).__pricingDiagnostics??[]);
  expect(logs).toHaveLength(1);expect(logs[0].event).toBe('failure');
  expect(await submissions(page)).toEqual([]);
});

test('same-day Pizza & Pop changes to staff review at the exact six-hour crossing without losing the estimate',async({page})=>{
  await setup(page);
  await page.clock.setSystemTime(new Date('2026-10-23T14:59:00Z'));
  await ready(page,'/b/es/E-TEST','2026-10-23','pizza-pop');
  await price(page);
  await expect(page.locator('#estimate-panel')).toContainText('Full payment at booking: about $605');
  await expect(page.locator('#estimate-panel')).not.toContainText('Our team needs');
  await review(page);
  await expect(page.locator('pre')).toContainText('six hours remaining');
  await page.clock.runFor(61000);
  await expect(page.locator('pre')).toContainText('Our team needs');
  await expect(page.getByRole('button',{name:'Send request with this estimate'})).toBeEnabled();
  await page.getByRole('button',{name:'Send request with this estimate'}).click();
  const p=(await submissions(page)).at(-1).payload;
  expect(p.event.date).toBe('2026-10-23');expect(p.estimate.total).toBe(605);expect(p.estimate.deposit).toBe(305);
});
test('same-day under six hours and each other package still price and submit',async({page})=>{
  await setup(page);
  for(const food of ['pizza-pop','stars-strikes','twisted-italiano','burrito-bowl']){
    await ready(page,'/b/es/E-TEST','2026-10-23',food);
    await page.locator('select').first().selectOption('15:30');
    await price(page);
    await expect(page.locator('#estimate-panel')).toContainText('Our team needs');
    await expect(page.locator('#estimate-panel')).toContainText('Full payment at booking');
    await review(page);await page.getByRole('button',{name:'Send request with this estimate'}).click();
    expect((await submissions(page)).at(-1).payload.event.start_time).toBe('15:30');
  }
});
test('same-day public Pizza & Pop stays a staff request, with full-payment terms',async({page})=>{
  await setup(page);await ready(page,'/eventmenu','2026-10-23','pizza-pop');
  await price(page);await expect(page.locator('#estimate-panel')).toContainText('Our team needs');
  await review(page);await expect(page.locator('pre')).not.toContainText('six hours remaining');
  await expect(page.locator('pre')).toContainText('Full payment');
  await publicContact(page);await page.getByRole('button',{name:'Send request with this estimate'}).click();
  expect((await submissions(page)).at(-1).name).toBe('exploreSubmit');
});
test('same-day stale page stops submission once its start passes',async({page})=>{
  await setup(page);await ready(page,'/b/es/E-TEST','2026-10-23','pizza-pop');
  await price(page);await review(page);
  await page.clock.setSystemTime(new Date('2026-10-23T21:00:00Z'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button',{name:'Send request with this estimate'})).toBeDisabled();
  await expect(page.locator('pre')).toContainText("hasn't passed");
});
