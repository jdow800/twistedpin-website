// Run: node --test scripts/check-count-session-scope.mjs
// Tests the actual browser API client with synthetic HTTP responses.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/components/liquor/api.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, {
  loader: 'ts', format: 'esm', define: { 'import.meta.env.PUBLIC_TPRS_API_BASE': 'undefined' },
});
const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type':'application/json' } });

test('a partial beer request uses false on the wire and accepts only its partial bar draft', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(url, /full=false&section=bar/);
    return response({session:{id:'beer-draft',isFullCount:false,section:'bar',lines:[]}});
  };
  try { assert.equal((await api.getOpenCount(false)).id,'beer-draft'); }
  finally { globalThis.fetch = old; }
});

for (const session of [
  { id:'full-liquor',isFullCount:true,section:'bar',lines:[] },
  { id:'food',isFullCount:false,section:'food',lines:[] },
  { id:'old-server-without-scope',lines:[] },
]) test(`beer resume refuses ${session.id} before a screen can replace its rows`, async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => response({session});
  try { await assert.rejects(api.getOpenCount(false), /different count/); }
  finally { globalThis.fetch = old; }
});

test('no draft remains a normal empty result', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => response({session:null});
  try { assert.equal(await api.getOpenCount(false),null); }
  finally { globalThis.fetch = old; }
});

test('food resumes only a full food draft', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => response({session:{id:'food',isFullCount:true,section:'food',lines:[]}});
  try { assert.equal((await api.getOpenCount(true,'food')).id,'food'); }
  finally { globalThis.fetch = old; }
});

for (const [full,section] of [[true,'bar'],[false,'bar'],[true,'food']]) {
  test(`a ${section} ${full ? 'full' : 'partial'} save declares its scope even when clearing rows`, async () => {
    const old = globalThis.fetch;
    globalThis.fetch = async (url,init) => {
      assert.equal(init.method,'PUT');
      assert.deepEqual(JSON.parse(init.body),{lines:[],isFullCount:full,section});
      return response({upserted:0});
    };
    try { await api.saveCountLines('draft-id',[],full,section); }
    finally { globalThis.fetch = old; }
  });
}
