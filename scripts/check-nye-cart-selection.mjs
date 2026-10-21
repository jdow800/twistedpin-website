/** Offline atomic-cart contract checks. Synthetic transport/storage only.
 * Run: node scripts/check-nye-cart-selection.mjs
 * No API, browser, payment provider or database is contacted. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({ stdin: { contents: `
export * from './src/components/tprs/nye/cartSelection.ts';
export * from './src/tprs/schemas/cart.ts';
`, resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const { createCartSelectionController, exactSelectionHeld, readPendingCartSelection,
  NYE_CART_PENDING_KEY, cartStateSchema, cartReplaceRequestSchema } = mod;
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const clone = value => structuredClone(value);
const startTime = '2026-12-31T22:00:00-06:00', endTime = '2027-01-01T00:30:00-06:00';
const lane = (quantity = 2) => ({productId:id(124), cartLineRef:'lane-root', quantity, startTime});
const coverage = (count = 2) => [{cartLineRef:'lane-root', count, startTime, endTime, poolId:id(6)}];
let checks = 0;
async function check(name, work) { await work(); checks++; console.log('PASS ' + name); }
function fixture() {
  let time = Date.parse('2026-10-21T14:00:00Z'), nonce = 100, active = null;
  const data = new Map(), calls = [], receipts = new Map();
  const storage = {getItem:key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value), removeItem:key => data.delete(key)};
  let state = {cartToken:'synthetic-cart', revision:0, items:[], holds:[], holdExpiresAt:null};
  function apply(request) {
    const previous = receipts.get(request.mutationKey);
    if (previous) return {...clone(state), mutation:{key:request.mutationKey, appliedRevision:previous.revision, replayed:true}};
    if (state.revision !== request.expectedRevision) throw {status:409, body:{code:'cart_revision_conflict',error:'Review your selection.',currentRevision:state.revision}};
    const deadline = state.holdExpiresAt && Date.parse(state.holdExpiresAt) > time ? state.holdExpiresAt : new Date(time + 600_000).toISOString();
    state = {...state, revision:state.revision+1, items:clone(request.items),
      holds:request.items.filter(i => i.cartLineRef === 'lane-root').map(i => ({id:id(200+state.revision), cartLineRef:i.cartLineRef,
        poolId:id(6), count:i.quantity, startTime:new Date(Date.parse(i.startTime)-10*60_000).toISOString(),
        endTime:new Date(Date.parse(endTime)+30*60_000).toISOString(), expiresAt:deadline})),
      holdExpiresAt:request.items.length ? deadline : null};
    receipts.set(request.mutationKey,{revision:state.revision});
    return {...clone(state),mutation:{key:request.mutationKey,appliedRevision:state.revision,replayed:false}};
  }
  const api = {
    establishCartSession:async() => {calls.push(['session']); return clone(state);},
    getCart:async() => {calls.push(['get']); return clone(state);},
    getActiveCheckoutAttempt:async() => {calls.push(['active']); return active;},
    replaceCartItems:async request => {calls.push(['replace',clone(request)]); return apply(request);},
  };
  const controller = () => createCartSelectionController({api,storage,now:() => time,newMutationKey:() => id(++nonce)});
  return {api,storage,data,calls,apply,controller,now:()=>time,advance:ms=>time+=ms,
    state:()=>clone(state),setState:value=>state=clone(value),setActive:value=>active=value,
    replaces:()=>calls.filter(c=>c[0]==='replace')};
}
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Unexpected network request in offline NYE cart checks'); };
try {
  await check('session setup and browsing consume no inventory', async()=>{
    const f=fixture(), result=await f.controller().establishSession();
    assert.equal(result.kind,'session'); assert.equal(f.state().revision,0); assert.equal(f.replaces().length,0);
  });
  await check('vendored response keeps revision, full items and replay receipt', async()=>{
    const f=fixture(), body=f.apply({items:[lane()],expectedRevision:0,mutationKey:id(1)}), parsed=cartStateSchema.parse(body);
    assert.deepEqual(parsed,body); assert.equal(cartReplaceRequestSchema.safeParse({items:[lane()],expectedRevision:-1,mutationKey:id(1)}).success,false);
  });
  await check('deliberate acquisition stores pending before transport and verifies full midnight coverage', async()=>{
    const f=fixture(), original=f.api.replaceCartItems;
    f.api.replaceCartItems=async request=>{assert.equal(readPendingCartSelection(f.storage).kind,'pending');return original(request);};
    const result=await f.controller().commit(f.state(),[lane()],coverage());
    assert.equal(result.kind,'held');assert.equal(result.cart.holdExpiresAt,new Date(f.now()+600_000).toISOString());
    assert.equal(exactSelectionHeld(result.cart,[lane()],coverage(),f.now()),true);assert.equal(readPendingCartSelection(f.storage).kind,'empty');
  });
  await check('an unrelated live cart cannot be adopted', async()=>{
    const f=fixture();f.apply({items:[lane()],expectedRevision:0,mutationKey:id(1)});
    for(const items of [[lane(3)],[{...lane(),productId:id(126)}],[{...lane(),cartLineRef:'different'}],[{...lane(),startTime:'2026-12-31T15:00:00-06:00'}]])
      assert.equal(exactSelectionHeld(f.state(),items,coverage(),f.now()),false);
  });
  await check('hold count, pool, duplicate row, foreign row and short duration all fail closed', async()=>{
    const f=fixture();f.apply({items:[lane()],expectedRevision:0,mutationKey:id(1)});
    for(const change of [c=>c.holds[0].count=1,c=>c.holds[0].poolId=id(17),c=>c.holds.push(clone(c.holds[0])),
      c=>c.holds[0].cartLineRef='other',c=>c.holds[0].endTime='2027-01-01T05:30:00Z',
      c=>c.holds[0].startTime='2027-01-01T04:01:00Z',c=>c.holds[0].expiresAt=new Date(f.now()+500_000).toISOString()]){
      const cart=f.state();change(cart);assert.equal(exactSelectionHeld(cart,[lane()],coverage(),f.now()),false);
    }
  });
  await check('full selection includes resource-free arcade lines and equivalent timestamp normalization', async()=>{
    const f=fixture(), items=[lane(),{productId:id(112),cartLineRef:'arcade',quantity:4}];
    const result=await f.controller().commit(f.state(),items,coverage());assert.equal(result.kind,'held');
    assert.equal(exactSelectionHeld(result.cart,[items[1],{...items[0],startTime:'2027-01-01T04:00:00Z'}],coverage(),f.now()),true);
    assert.equal(exactSelectionHeld(result.cart,[lane()],coverage(),f.now()),false);
  });
  await check('lost success response reload retries the exact immutable body and key once', async()=>{
    const f=fixture(), original=f.api.replaceCartItems, items=[lane()], required=coverage();let drop=true;
    f.api.replaceCartItems=async request=>{const result=await original(request);if(drop){drop=false;throw new Error('lost response');}return result;};
    assert.equal((await f.controller().commit(f.state(),items,required)).kind,'uncertain');
    items[0].quantity=6;required[0].count=6;
    const pending=readPendingCartSelection(f.storage);assert.equal(pending.pending.request.items[0].quantity,2);
    assert.throws(()=>pending.pending.request.items[0].quantity=5,TypeError);
    const result=await f.controller().retryPending();assert.equal(result.kind,'held');assert.equal(f.state().revision,1);
    assert.deepEqual(f.replaces()[0][1],f.replaces()[1][1]);assert.equal(result.cart.mutation.replayed,true);
  });
  await check('unknown outcome blocks a new proposal and does not reset original request', async()=>{
    const f=fixture();f.api.replaceCartItems=async request=>{f.calls.push(['replace',clone(request)]);throw {status:503};};
    const c=f.controller();assert.equal((await c.commit(f.state(),[lane()],coverage())).kind,'uncertain');
    assert.deepEqual(await c.commit(f.state(),[lane(4)],coverage(4)),{kind:'blocked',reason:'pending_mutation'});assert.equal(f.replaces().length,1);
  });
  await check('aborted and malformed-success outcomes retain their pending request', async()=>{
    for(const response of [()=>{throw new DOMException('Aborted','AbortError');},()=>({bad:true})]){
      const f=fixture();f.api.replaceCartItems=async()=>response();
      assert.equal((await f.controller().commit(f.state(),[lane()],coverage())).kind,'uncertain');assert.equal(readPendingCartSelection(f.storage).kind,'pending');
    }
  });
  await check('unknown or malformed error bodies are not interpreted as rollback proof', async()=>{
    for(const error of [{status:409,body:{code:'new_error',error:'internal diagnostics'}},{status:400,body:'invalid JSON'},{status:500,body:{code:'capacity_exhausted',error:'wrong status'}}]){
      const f=fixture();f.api.replaceCartItems=async()=>{throw error;};
      const result=await f.controller().commit(f.state(),[lane()],coverage());assert.equal(result.kind,'uncertain');
      assert.equal(readPendingCartSelection(f.storage).kind,'pending');assert.equal('error' in result,false);
    }
  });
  await check('typed capacity rejection preserves old holds, items and deadline', async()=>{
    const f=fixture(), c=f.controller();await c.commit(f.state(),[lane()],coverage());const before=f.state();
    f.api.replaceCartItems=async()=>{throw {status:409,body:{code:'capacity_exhausted',error:'Not enough lanes.'}};};
    const result=await c.commit(before,[lane(4)],coverage(4));assert.equal(result.kind,'rejected');assert.equal(result.error.code,'capacity_exhausted');
    assert.deepEqual(f.state(),before);assert.equal(readPendingCartSelection(f.storage).kind,'empty');
  });
  await check('revision conflict requires explicit review instead of silently changing revision', async()=>{
    const f=fixture(), baseline=f.state();f.apply({items:[lane(1)],expectedRevision:0,mutationKey:id(1)});
    const result=await f.controller().commit(baseline,[lane()],coverage());assert.equal(result.kind,'rejected');
    assert.equal(result.error.code,'cart_revision_conflict');assert.equal(f.replaces()[0][1].expectedRevision,0);assert.equal(f.state().items[0].quantity,1);
  });
  await check('replay returns current newer state and never advances from an old receipt', async()=>{
    const f=fixture(), original=f.api.replaceCartItems;let drop=true;
    f.api.replaceCartItems=async request=>{const result=await original(request);if(drop){drop=false;throw new Error('lost');}return result;};
    await f.controller().commit(f.state(),[lane()],coverage());f.apply({items:[lane(3)],expectedRevision:1,mutationKey:id(2)});
    const result=await f.controller().retryPending();assert.equal(result.kind,'review');assert.equal(result.reason,'receipt_changed');assert.equal(result.cart.items[0].quantity,3);
  });
  await check('an expired replay never reacquires or invents a fresh ten-minute clock', async()=>{
    const f=fixture(), original=f.api.replaceCartItems;let drop=true;
    f.api.replaceCartItems=async request=>{const result=await original(request);if(drop){drop=false;throw new Error('lost');}return result;};
    await f.controller().commit(f.state(),[lane()],coverage());f.advance(600_001);
    f.setState({...f.state(),holds:[],holdExpiresAt:null});
    const result=await f.controller().retryPending();assert.equal(result.kind,'expired');assert.equal(f.state().revision,1);
  });
  await check('equivalent but newer cart mutation still requires review', async()=>{
    const f=fixture(), original=f.api.replaceCartItems;let drop=true;
    f.api.replaceCartItems=async request=>{const result=await original(request);if(drop){drop=false;throw new Error('lost');}return result;};
    await f.controller().commit(f.state(),[lane()],coverage());f.apply({items:[lane()],expectedRevision:1,mutationKey:id(2)});
    const result=await f.controller().retryPending();assert.equal(result.kind,'review');assert.equal(result.reason,'receipt_changed');
  });
  await check('missing or unrelated receipt retains uncertainty and original mutation', async()=>{
    for(const mutate of [c=>delete c.mutation,c=>c.mutation.key=id(999),c=>c.mutation.appliedRevision=100]){
      const f=fixture(), original=f.api.replaceCartItems;f.api.replaceCartItems=async request=>{const result=await original(request);mutate(result);return result;};
      assert.equal((await f.controller().commit(f.state(),[lane()],coverage())).kind,'uncertain');assert.equal(readPendingCartSelection(f.storage).kind,'pending');
    }
  });
  await check('unexpected response cart identity cannot discard prior mutation evidence', async()=>{
    const f=fixture(), original=f.api.replaceCartItems;f.api.replaceCartItems=async request=>({...await original(request),cartToken:'other-cart'});
    const result=await f.controller().commit(f.state(),[lane()],coverage());assert.equal(result.kind,'review');assert.equal(result.reason,'session_changed');
    assert.equal(readPendingCartSelection(f.storage).kind,'pending');
  });
  await check('successful response with wrong retained selection or short coverage cannot advance', async()=>{
    for(const [mutate,reason] of [[c=>c.items[0].quantity=1,'selection_changed'],[c=>c.holds[0].count=1,'coverage_changed']]){
      const f=fixture(), original=f.api.replaceCartItems;f.api.replaceCartItems=async request=>{const result=await original(request);mutate(result);return result;};
      const result=await f.controller().commit(f.state(),[lane()],coverage());assert.equal(result.kind,'review');assert.equal(result.reason,reason);
    }
  });
  await check('successful selection change retains original server deadline', async()=>{
    const f=fixture(), c=f.controller();const first=await c.commit(f.state(),[lane()],coverage());f.advance(120_000);
    const next=await c.commit(first.cart,[lane(3)],coverage(3));assert.equal(next.kind,'held');assert.equal(next.cart.holdExpiresAt,first.cart.holdExpiresAt);
  });
  await check('unexpected deadline extension is rejected for review', async()=>{
    const f=fixture(), c=f.controller();await c.commit(f.state(),[lane()],coverage());f.advance(120_000);
    const original=f.api.replaceCartItems;f.api.replaceCartItems=async request=>{
      const result=await original(request), deadline=new Date(f.now()+600_000).toISOString();
      return {...result,holdExpiresAt:deadline,holds:result.holds.map(h=>({...h,expiresAt:deadline}))};};
    const result=await c.commit(f.state(),[lane(3)],coverage(3));assert.equal(result.kind,'review');assert.equal(result.reason,'deadline_changed');
  });
  await check('missing cookie on retry cannot create another cart or acquire lanes', async()=>{
    const f=fixture();f.api.replaceCartItems=async()=>{throw new Error('lost');};await f.controller().commit(f.state(),[lane()],coverage());
    f.api.getCart=async()=>({cartToken:'',revision:0,items:[],holds:[],holdExpiresAt:null});
    const result=await f.controller().retryPending();assert.equal(result.kind,'review');assert.equal(result.reason,'session_changed');assert.equal(readPendingCartSelection(f.storage).kind,'pending');
  });
  await check('accepted payment discovery blocks new holds and retains pending identity', async()=>{
    const f=fixture();f.setActive({attemptId:id(900),status:'processing'});
    assert.equal((await f.controller().establishSession()).kind,'payment_recovery');assert.equal(f.replaces().length,0);
    assert.equal((await f.controller().commit(f.state(),[lane()],coverage())).kind,'payment_recovery');assert.equal(f.replaces().length,0);
    assert.equal(readPendingCartSelection(f.storage).kind,'pending');
  });
  await check('server-side payment race returns recovery, never a shortage', async()=>{
    const f=fixture();f.api.replaceCartItems=async()=>{throw {status:409,body:{code:'payment_recovery_required',error:'Resume payment.'}};};
    assert.equal((await f.controller().commit(f.state(),[lane()],coverage())).kind,'payment_recovery');assert.equal(readPendingCartSelection(f.storage).kind,'empty');
  });
  await check('discovery outage blocks acquisition', async()=>{
    const f=fixture();f.api.getActiveCheckoutAttempt=async()=>{throw {status:404};};
    assert.equal((await f.controller().commit(f.state(),[lane()],coverage())).kind,'uncertain');assert.equal(f.replaces().length,0);
  });
  await check('storage unavailable, quota failure and corruption block writes', async()=>{
    for(const mode of ['read','write','corrupt']){
      const f=fixture();if(mode==='read')f.storage.getItem=()=>{throw new Error('disabled');};
      if(mode==='write')f.storage.setItem=()=>{throw new Error('quota');};if(mode==='corrupt')f.data.set(NYE_CART_PENDING_KEY,'broken');
      assert.equal((await f.controller().commit(f.state(),[lane()],coverage())).kind,'blocked');assert.equal(f.replaces().length,0);
    }
  });
  await check('clearing saved mutation failure cannot silently advance', async()=>{
    const f=fixture();f.storage.removeItem=()=>{throw new Error('disabled');};
    const result=await f.controller().commit(f.state(),[lane()],coverage());assert.equal(result.kind,'blocked');assert.equal(result.reason,'storage_unavailable');
    assert.equal(readPendingCartSelection(f.storage).kind,'pending');assert.equal(f.state().revision,1);
  });
  await check('double click permits one in-flight replacement only', async()=>{
    const f=fixture(), c=f.controller();let release;const gate=new Promise(resolve=>release=resolve), original=f.api.replaceCartItems;
    f.api.replaceCartItems=async request=>{await gate;return original(request);};
    const first=c.commit(f.state(),[lane()],coverage());assert.deepEqual(await c.commit(f.state(),[lane()],coverage()),{kind:'blocked',reason:'busy'});
    release();assert.equal((await first).kind,'held');assert.equal(f.replaces().length,1);
  });
  await check('explicit empty replacement clears selection but does not cancel payment', async()=>{
    const f=fixture(), c=f.controller();await c.commit(f.state(),[lane()],coverage());const result=await c.commit(f.state(),[],[]);
    assert.equal(result.kind,'cleared');assert.equal(result.cart.items.length,0);assert.equal(result.cart.holds.length,0);
    assert.equal(f.calls.some(c=>c[0]==='cancel'),false);
  });
  await check('old backend and missing coverage cannot masquerade as held lanes', async()=>{
    const f=fixture(), old={cartToken:'old',holds:[],holdExpiresAt:null};
    assert.equal(exactSelectionHeld(old,[lane()],coverage(),f.now()),false);
    assert.equal((await f.controller().commit(old,[lane()],coverage())).kind,'blocked');
    assert.equal((await f.controller().commit(f.state(),[lane()],[])).kind,'blocked');
    assert.equal((await f.controller().commit(f.state(),[lane(),lane()],coverage())).kind,'blocked');assert.equal(f.replaces().length,0);
  });
  console.log(`NYE atomic cart checks passed: ${checks} scenarios; no network, provider or database calls.`);
} finally { globalThis.fetch=originalFetch; }
