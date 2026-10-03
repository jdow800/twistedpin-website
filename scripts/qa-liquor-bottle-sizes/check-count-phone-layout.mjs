// Actual count components, synthetic API responses, Chromium phone emulation.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const {chromium} = createRequire(process.env.COUNT_QA_PLAYWRIGHT_PACKAGE || new URL('../../package.json',import.meta.url))('playwright');

const dist = new URL('./dist/',import.meta.url);
const server = createServer(async(req,res)=>{
  const url = new URL(req.url,'http://localhost');
  const app = url.searchParams.get('app')==='food'?'food':'liquor';
  const name = app==='food'?'food-fixture':'liquor-voice-fixture';
  res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html');
  res.end(url.pathname==='/fixture.js'||url.pathname==='/fixture.css'
    ? await readFile(new URL(name+url.pathname.slice('/fixture'.length),dist))
    : `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#0e0a1f}#root{min-height:100vh}</style><link rel="stylesheet" href="/fixture.css?app=${app}"><div id="root"></div><script type="module" src="/fixture.js?app=${app}"></script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true,executablePath:process.env.COUNT_QA_CHROME});
try {
  for(const width of [320,390,412]) {
    const context = await browser.newContext({viewport:{width,height:740},isMobile:true,hasTouch:true,deviceScaleFactor:1});
    const page = await context.newPage();
    await page.goto(origin+'/?full-review');
    await page.getByRole('button',{name:'Finish count',exact:true}).click();
    await page.locator('.lq-confirm').waitFor();
    await page.getByRole('button',{name:'Show 3 more',exact:true}).click();
    const review = await page.evaluate(()=>{
      const body = document.querySelector('.lq-confirm-body');
      const foot = document.querySelector('.lq-confirm .lq-sheet-foot');
      const panel = document.querySelector('.lq-confirm');
      const lists = [...panel.querySelectorAll('.lq-precheck')];
      return {overflow:document.documentElement.scrollWidth>innerWidth+1,foot:foot.getBoundingClientRect().toJSON(),
        height:innerHeight,bodyScrollable:body.scrollHeight>body.clientHeight,listOverflows:lists.some(l=>getComputedStyle(l).overflowY==='auto')};
    });
    assert.equal(review.overflow,false,`${width}px: review must fit the phone`);
    assert.equal(review.bodyScrollable,true,`${width}px: the long review must scroll`);
    assert.equal(review.listOverflows,false,`${width}px: a single scroll body`);
    assert.ok(review.foot.top>=0 && review.foot.bottom<=review.height+1,`${width}px: review actions stay visible`);
    await page.locator('.lq-confirm-body').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:fileURLToPath(new URL(`count-review-top-${width}.png`,dist)),fullPage:false});
    await page.locator('.lq-confirm-body').evaluate(el=>el.scrollTop=el.scrollHeight);
    assert.equal(await page.getByRole('button',{name:'Submit anyway',exact:true}).isVisible(),true);
    await page.screenshot({path:fileURLToPath(new URL(`count-review-${width}.png`,dist)),fullPage:false});

    for(const app of ['liquor','food']) {
      await page.goto(origin+`/?app=${app}&existing&submit-rejected`);
      if (app==='liquor') await page.locator('.lq-zone').filter({hasText:'Back Bar'}).click();
      await page.locator('.lq-footer').waitFor();
      const footerMatches = () => page.evaluate(()=>{
        const root=document.querySelector('.lq-fc,.lq-count');
        const footer=document.querySelector('.lq-footer');
        return Math.abs(parseFloat(getComputedStyle(root).getPropertyValue('--lq-count-footer-h'))-footer.getBoundingClientRect().height)<1;
      });
      await page.waitForFunction(()=>{
        const root=document.querySelector('.lq-fc,.lq-count');
        const footer=document.querySelector('.lq-footer');
        return root && footer && Math.abs(parseFloat(getComputedStyle(root).getPropertyValue('--lq-count-footer-h'))-footer.getBoundingClientRect().height)<1;
      });
      assert.equal(await footerMatches(),true,`${width}px ${app}: observed after async load`);
      await page.getByRole('button',{name:app==='food'?'Finish (1)':'Finish count',exact:true}).click();
      await page.getByRole('button',{name:app==='food'?'Submit the count':'Submit anyway',exact:true}).click();
      await page.locator('.lq-footer').filter({hasText:"Couldn't submit it"}).waitFor();
      await page.waitForFunction(()=>{
        const root=document.querySelector('.lq-fc,.lq-count');
        const footer=document.querySelector('.lq-footer');
        return Math.abs(parseFloat(getComputedStyle(root).getPropertyValue('--lq-count-footer-h'))-footer.getBoundingClientRect().height)<1;
      });
      assert.equal(await footerMatches(),true,`${width}px ${app}: tracks the longer error footer`);
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      const state = await page.evaluate(()=>{
        const root = document.querySelector('.lq-fc,.lq-count');
        const footer = document.querySelector('.lq-footer');
        const last = [...document.querySelectorAll('.lq-fc-row,.lq-captured .lq-row')].at(-1);
        return {overflow:document.documentElement.scrollWidth>innerWidth+1,footer:footer.getBoundingClientRect().toJSON(),
          reserved:parseFloat(getComputedStyle(root).paddingBottom),last:last.getBoundingClientRect().toJSON()};
      });
      assert.equal(state.overflow,false,`${width}px ${app}: no sideways scroll`);
      assert.ok(state.reserved>=state.footer.height,`${width}px ${app}: footer height reserved`);
      assert.ok(state.last.bottom<=state.footer.top+1,`${width}px ${app}: last count clears the footer`);
      await page.screenshot({path:fileURLToPath(new URL(`count-${app}-error-${width}.png`,dist)),fullPage:false});

      await page.goto(origin+`/?app=${app}&existing&save-fails`);
      if (app==='liquor') {
        await page.locator('.lq-zone').filter({hasText:'Back Bar'}).click();
        await page.getByRole('button',{name:"increase Jameson Irish Whiskey",exact:true}).click();
      } else {
        await page.getByRole('spinbutton',{name:'Pizza Dough: loose packs',exact:true}).fill('4');
        await page.getByRole('spinbutton',{name:'Pizza Dough: loose packs',exact:true}).blur();
      }
      await page.getByRole('button',{name:app==='food'?'Finish (1)':'Finish count',exact:true}).click();
      await page.getByRole('button',{name:'Retry save',exact:true}).waitFor();
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      await page.screenshot({path:fileURLToPath(new URL(`count-${app}-retry-save-${width}.png`,dist)),fullPage:false});

      await page.goto(origin+`/?app=${app}&existing&check-fails`);
      await page.getByRole('button',{name:app==='food'?'Finish (1)':'Finish count',exact:true}).click();
      await page.getByRole('button',{name:'Retry check',exact:true}).waitFor();
      await page.getByRole('button',{name:'Retry check',exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:fileURLToPath(new URL(`count-${app}-retry-check-${width}.png`,dist)),fullPage:false});

      await page.goto(origin+`/?app=${app}&existing&submit-unknown`);
      await page.getByRole('button',{name:app==='food'?'Finish (1)':'Finish count',exact:true}).click();
      await page.getByRole('button',{name:app==='food'?'Submit the count':'Submit anyway',exact:true}).click();
      await page.getByRole('dialog',{name:'Check submission',exact:true}).waitFor();
      const recovery = await page.getByRole('button',{name:'Check submission',exact:true}).boundingBox();
      assert.ok(recovery && recovery.y>=0 && recovery.y+recovery.height<=740,`${width}px ${app}: recovery action visible`);
      await page.screenshot({path:fileURLToPath(new URL(`count-${app}-unknown-${width}.png`,dist)),fullPage:false});
    }
    await page.goto(origin+'/?app=food&definitions&legacy-crust&pausecuts=0');
    const crustInput=page.getByRole('spinbutton',{name:'Cauliflower Crust: cases',exact:true});
    await crustInput.waitFor();
    assert.equal(await crustInput.inputValue(),'1.5');
    assert.equal(await page.getByText('Earlier entry includes 6 individual pieces.',{exact:false}).isVisible(),true);
    await crustInput.evaluate(el=>el.closest('.lq-fc-row').scrollIntoView({block:'center'}));
    const historyWidth=await page.locator('.lq-fc-legacy-units').evaluate(el=>el.getBoundingClientRect().width);
    assert.ok(historyWidth>width/2,'historical quantity text has a readable full line');
    await page.screenshot({path:fileURLToPath(new URL(`count-food-case-history-${width}.png`,dist)),fullPage:false});
    await crustInput.fill('0.5');
    await crustInput.blur();
    await page.getByRole('spinbutton',{name:'Flatbread: cases',exact:true}).fill('6');
    await page.getByRole('spinbutton',{name:'Flatbread: cases',exact:true}).blur();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:fileURLToPath(new URL(`count-food-case-grid-${width}.png`,dist)),fullPage:false});
    await page.getByRole('button',{name:/Talk through/}).click();
    await page.evaluate(()=>window.foodQa.recorder.segment('two cauliflower crusts. six flatbreads.',0));
    await page.waitForFunction(()=>window.foodQa.extracts.length===1);
    await page.evaluate(()=>window.foodQa.extracts[0].succeed([
      {spoken:'two cauliflower crusts',cases:2,units:0,spokenUnit:null,match:{id:'cauliflower'},candidates:[]},
      {spoken:'six flatbreads',cases:6,units:0,spokenUnit:null,match:{id:'flatbread'},candidates:[]},
    ]));
    await page.getByRole('button',{name:/Stop \d+:\d+/}).click();
    await page.evaluate(()=>window.foodQa.recorder.finish('two cauliflower crusts. six flatbreads.'));
    await page.getByText('Cauliflower Crust · 2 cases',{exact:true}).waitFor();
    await page.getByText('Flatbread · 6 cases',{exact:true}).waitFor();
    await page.locator('.lq-fc-rev').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'case review does not push the footer sideways');
    await page.screenshot({path:fileURLToPath(new URL(`count-food-case-review-${width}.png`,dist)),fullPage:false});
    await page.locator('.lq-fc-rev-actions').evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-280));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const addAction=await page.getByRole('button',{name:'Add 2 items to Pizza Freezer',exact:true}).boundingBox();
    const footerTop=await page.locator('.lq-footer').evaluate(el=>el.getBoundingClientRect().top);
    assert.ok(addAction && addAction.y>=130 && addAction.y+addAction.height<=footerTop,'case Apply action is reachable above the footer');
    await page.screenshot({path:fileURLToPath(new URL(`count-food-case-review-actions-${width}.png`,dist)),fullPage:false});
    await context.close();
    console.log(`PASS ${width}px: expanded mixed review actions visible, food/liquor error footers clear the last count`);
  }
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
