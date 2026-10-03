import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { build } = require('esbuild');
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../../src/components/liquor/api.ts', import.meta.url))], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'api', define: { 'import.meta.env': '{"PUBLIC_TPRS_API_BASE":"/mock"}' } });
const code = outputFiles[0].text;
function harness(fetch) {
  let next = 0; const timers = new Map();
  const context = { fetch, AbortController, console, setTimeout(fn, ms) { const id = ++next; timers.set(id,{fn,ms}); return id; }, clearTimeout(id) { timers.delete(id); } };
  runInNewContext(code, context);
  return { api: context.api, timers, expire(ms) { for (const t of [...timers.values()]) if(t.ms === ms) t.fn(); } };
}
const flush = async () => { for(let i=0;i<15;i++) await Promise.resolve(); };
let passed = 0;
for(const kind of ['transcribe','food']) for(const stage of ['headers','body']) {
  let signal;
  const h = harness(async (_url, init) => {
    signal = init.signal;
    if(stage === 'headers') return new Promise(() => {}); // Deliberately ignores abort.
    return { ok: true, status: 200, json: () => new Promise(() => {}) };
  });
  const result = (kind === 'transcribe' ? h.api.transcribeAudio('audio/webm','demo','liquor',{section:'food'}) : h.api.extractVoice('two cases','food')).catch(e=>e);
  await flush(); h.expire(kind === 'transcribe' ? 45_000 : 60_000);
  const error = await result;
  assert.equal(error.status,408); assert.match(error.message,/took too long/);
  assert.equal(signal.aborted,true); assert.equal(h.timers.size,0);
  passed++;
}
{
  const h = harness(async () => new Response(JSON.stringify({transcript:'two cases'})));
  assert.equal(await h.api.transcribeAudio('audio/webm','demo','liquor'),'two cases');
  assert.equal(h.timers.size,0); passed++;
}
{
  const h = harness(async () => new Response(JSON.stringify({items:[]})));
  await h.api.extractVoice('nothing','food'); assert.equal(h.timers.size,0); passed++;
}
{
  const h = harness(async () => new Response(JSON.stringify({error:'saved_invoice_protected'}),{status:409}));
  const result = await h.api.reextractInvoice('demo');
  assert.equal(result.ok,false);assert.equal(result.error,'saved_invoice_protected');passed++;
}
for(const stage of ['headers','body']) {
  let signal;
  const h = harness(async (_url,init) => {
    signal = init.signal;
    return stage==='headers' ? new Promise(()=>{}) : {ok:true,status:200,json:()=>new Promise(()=>{})};
  });
  const result = h.api.getCountSubmissionStatus('demo').catch(e=>e);
  await flush();h.expire(15_000);
  const error = await result;
  assert.equal(error.status,408);
  assert.equal(signal.aborted,true);
  assert.equal(h.timers.size,0);passed++;
}
{
  const calls = [];
  const h = harness(async url => {
    calls.push(url);
    if(url.endsWith('/submit')) throw Error('lost response');
    return new Promise(()=>{});
  });
  const result = h.api.submitCount('demo').catch(e=>e);
  await flush();h.expire(15_000);
  assert.ok(await result instanceof h.api.SubmissionUnknownError);
  assert.deepEqual(calls,['/mock/admin/bar/counts/demo/submit','/mock/admin/bar/counts/demo']);
  assert.equal(h.timers.size,0);passed++;
}
{
  const h = harness(async()=>new Response(JSON.stringify({session:{status:'mystery'},lines:[]})));
  assert.ok(await h.api.getCountSubmissionStatus('demo').catch(e=>e) instanceof h.api.SubmissionUnknownError);
  assert.equal(h.timers.size,0);passed++;
}
for(const stage of ['headers','body']) for(const status of ['submitted','draft','unreachable']) {
  const calls=[];let signal;
  const h=harness(async(url,init) => {
    calls.push(url);
    if(url.endsWith('/submit')) {
      signal=init.signal;
      return stage==='headers' ? new Promise(()=>{}) : {ok:true,status:200,json:()=>new Promise(()=>{})};
    }
    if(status==='unreachable') throw Error('status connection lost');
    return new Response(JSON.stringify({session:{status},lines:[{skuId:'sample'}]}));
  });
  const result=h.api.submitCount('demo').catch(e=>e);
  await flush();h.expire(60_000);
  const value=await result;
  assert.equal(signal.aborted,true);
  if(status==='submitted') assert.equal(value,1);
  else if(status==='draft') assert.equal(value.status,408);
  else assert.ok(value instanceof h.api.SubmissionUnknownError);
  assert.deepEqual(calls,['/mock/admin/bar/counts/demo/submit','/mock/admin/bar/counts/demo']);
  assert.equal(h.timers.size,0);passed++;
}
{
  const calls=[];
  const h=harness(async url => {
    calls.push(url);
    return new Response(JSON.stringify(url.endsWith('/submit') ? {} : {session:{status:'submitted'},lines:[{skuId:'sample'}]}));
  });
  assert.equal(await h.api.submitCount('demo'),1,'a malformed success must read the actual submitted count');
  assert.deepEqual(calls,['/mock/admin/bar/counts/demo/submit','/mock/admin/bar/counts/demo']);
  assert.equal(h.timers.size,0);passed++;
}
console.log(`${passed} voice deadline / submission recovery / invoice protection API scenarios passed.`);
