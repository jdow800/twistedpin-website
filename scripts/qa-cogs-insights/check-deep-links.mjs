import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const {JSDOM}=process.env.COGS_QA_DEPS?createRequire(join(resolve(process.env.COGS_QA_DEPS),'package.json'))('jsdom'):await import('jsdom');
const bundle=await readFile(new URL('./dist/deep-links-fixture.js',import.meta.url),'utf8'), pause=()=>new Promise(resolve=>setTimeout(resolve,20));
async function until(test,what){for(let i=0;i<200;i++){if(test())return;await pause();}throw Error(`${what} timed out`);}
let passed=0;
for(const [kind,view,login,section] of [['older','counts',false,'food'],['partial','counts',false,'bar'],['other','counts',false,'food'],['older','countfood',true,'food'],['partial','count',true,'bar'],['other','counts',true,'food'],['food-submitted','counts',true,'food'],['food-default','counts',false,'bar'],['food-legacy','counts',false,'food'],['bar-submitted','counts',false,'food']]){
 const id=`exact-${kind}-draft`, dom=new JSDOM('<!doctype html><div id="root"></div>',{url:`http://localhost/cogs/?view=${view}&count=${id}&kind=${kind}&section=${section}${login?'&login=1':''}`,runScripts:'outside-only',pretendToBeVisual:true});dom.window.Response=Response;dom.window.scrollTo=()=>{};
 try{
  dom.window.eval(bundle);const doc=dom.window.document, text=()=>doc.body.textContent.replace(/\s+/g,' '),qa=dom.window.deepLinksQa;
  if(login){await until(()=>text().includes('Enter your PIN'),'PIN screen');assert.equal(dom.window.location.search,'');assert.ok(!qa.calls.some(c=>c.path.includes('/counts/')),'count reads wait for login');
   for(const digit of ['1','2','3','4']){[...doc.querySelectorAll('button')].find(b=>b.textContent===digit).click();await pause();}[...doc.querySelectorAll('button')].find(b=>b.textContent==='Enter').click();
  }
  const submitted=kind.startsWith('food-')||kind==='bar-submitted', food=kind.startsWith('food-');
  await until(()=>text().includes(`Exact ${kind} linked ${submitted?'count':'draft'} item`),'exact linked detail');
  assert.equal(qa.calls.filter(c=>c.path===`/mock/admin/bar/counts/${id}`).length,1);assert.ok(!qa.calls.some(c=>c.path.includes('newer-unrelated-count')),'never opens the newer history entry');
  assert.match(text(),kind==='partial'?/Partial count/:/Full inventory/);if(kind==='other')assert.match(text(),/Another counter/);
  if(!submitted)assert.match(text(),/Draft · read only/);
  if(kind==='bar-submitted')assert.match(text(),/Variance report pending/);else assert.doesNotMatch(text(),/Variance report pending/);
  if(food){assert.ok(!qa.calls.some(c=>c.path.endsWith('/variance')),'food does not query liquor variance');assert.ok(!qa.calls.some(c=>c.path.endsWith('/keg-counts/history')&&section==='food'),'food history does not load unrelated keg history');
   assert.equal(doc.querySelector('a[href="?view=foodcost&section=food&count='+id+'"]')?.textContent,'Food cost for this count');assert.equal(doc.querySelector('a[href="?view=foodvariance&section=food&count='+id+'"]')?.textContent,'Food variance for this count');
  }else if(kind==='bar-submitted')assert.equal(qa.calls.filter(c=>c.path.endsWith('/variance')).length,1,'actual bar section overrides food URL');
  assert.equal(qa.calls.find(c=>c.path.endsWith('/counts/history')).query.section,section==='food'?'food':undefined);
  assert.doesNotMatch(text(),/Resume|Save|Submit|Correct this count|Finalize & lock/);assert.equal(doc.querySelectorAll('input,textarea,select').length,0);
  assert.ok(!qa.calls.some(c=>c.method!=='GET'&&!c.path.endsWith('/pin-login')),'no count creation or mutation');assert.ok(!qa.calls.some(c=>c.path.includes('/open')||c.path.includes('/catalog')||c.path.includes('/zones')),'never enters an editable walk');
  assert.equal(dom.window.location.pathname,'/cogs/');assert.equal(dom.window.location.search,'');assert.equal(qa.calls.filter(c=>c.path.endsWith('/pin-login')).length,login?1:0);
  console.log(`PASS exact ${kind} ${submitted?'count':'draft'} via ${view}${login?' after PIN':''}`);passed++;
 }finally{dom.window.close();}
}
console.log(`${passed} actual app count deep-link scenarios passed`);
