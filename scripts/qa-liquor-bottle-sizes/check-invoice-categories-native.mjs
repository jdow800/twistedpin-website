import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=fileURLToPath(new URL('./dist/category-shots/',import.meta.url));
await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['scripts/qa-liquor-bottle-sizes/serve.mjs','--invoices'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fixture server startup timed out')),15000);server.once('error',reject);server.once('exit',code=>reject(Error(`Fixture server exited ${code}`)));server.stdout.on('data',data=>{if(String(data).includes('127.0.0.1:4177')){clearTimeout(timer);resolve();}});});
  browser=await chromium.launch({executablePath:process.env.INVOICE_QA_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  for(const width of [320,390,1280]) {
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});
    const external=[];
    await context.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort();}return route.continue();});
    const page=await context.newPage();
    const load=async mode=>{await page.goto(`http://127.0.0.1:4177/?mode=${mode}`);await page.locator('.lq-invd').waitFor();await page.locator('#audit').evaluate(el=>el.style.display='none');};
    const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${width} ${name} overflow`);await page.screenshot({path:`${output}${width}-${name}.png`,fullPage:true});};
    const radio=value=>page.locator(`input[type=radio][value="${value}"]`);
    const writes=()=>page.locator('#audit').innerText().then(text=>text.split('\n').filter(line=>line.startsWith('POST')));
    for(const [category,label] of [['supplies','Supplies & cleaning'],['smallwares','Smallwares'],['equipment','Equipment']]) {
      await load('category-new');
      assert.equal(await page.locator('input[type=radio]:checked').count(),0);
      for(const option of await page.locator('.lq-invd-tracking-option').all()) {
        const box=await option.boundingBox();assert.ok(box.height>=44&&box.x>=0&&box.x+box.width<=width,`${width} category target fits`);
      }
      await radio(category).check();assert.equal((await writes()).length,0);await shot(`${category}-selected`);
      await page.getByRole('button',{name:'Save answer',exact:true}).click();await page.locator('.lq-invd-tracking-saved').waitFor({state:'attached'});
      await page.locator('.lq-invd-ledger > summary').click();await page.getByText(`${label} · Not counted`,{exact:true}).waitFor();await shot(`${category}-saved`);
      await page.getByRole('button',{name:'Change answer',exact:true}).click();
      await radio(category==='equipment'?'smallwares':'equipment').check();await page.getByRole('button',{name:'Save answer',exact:true}).click();
      await page.locator('.lq-invd-tracking-saved').waitFor();assert.equal((await writes()).length,2);await shot(`${category}-corrected`);
    }
    await load('category-saved');await page.locator('.lq-invd-ledger > summary').click();await page.getByRole('button',{name:'Change answer',exact:true}).click();
    await radio('inventory').check();await page.getByRole('searchbox',{name:'Search items'}).fill('pepperoni');
    await page.locator('.lq-rev-assign button').filter({hasText:'Peperoni Sliced'}).click();assert.equal((await writes()).length,0);await shot('inventory-selection');
    await page.getByRole('button',{name:'Save answer',exact:true}).click();await page.getByText('Check the inventory price',{exact:true}).waitFor();await shot('inventory-held-price');
    await load('category-stale');await radio('equipment').check();await page.getByRole('button',{name:'Save answer',exact:true}).click();await page.getByRole('alert').waitFor();
    assert.equal(await radio('equipment').isChecked(),true);await page.getByRole('button',{name:'Reload item',exact:true}).waitFor();await shot('stale');
    await load('category-refresh-failure');await radio('equipment').check();await page.getByRole('button',{name:'Save answer',exact:true}).click();
    await page.getByText(/cost breakdown could not refresh/).waitFor();await page.locator('.lq-invd-ledger > summary').click();
    await page.getByText('Equipment · Not counted',{exact:true}).waitFor();await shot('saved-refresh-failed');
    await load('category-unsupported');assert.equal(await page.locator('input[type=radio]').count(),0);await page.getByRole('searchbox',{name:'Search items'}).waitFor();await shot('old-api');
    assert.deepEqual(external,[]);await context.close();console.log(`PASS ${width}px: category choices, save/correction, inventory, stale and old API; zero external requests`);
  }
}finally{await browser?.close();server.kill();}
