// Pure rules behind stale-screen saves (draftSync.ts): the three-way merge and
// the ordered saver. No DOM, no network.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(new URL('../../package.json', import.meta.url));
const {build} = require('esbuild');
const {outputFiles} = await build({
  stdin: {contents: `export * from './src/components/liquor/draftSync'; export { DraftChangedError } from './src/components/liquor/api';`,
    resolveDir: fileURLToPath(new URL('../../', import.meta.url)), loader: 'ts'},
  bundle: true, write: false, platform: 'node', format: 'esm',
  define: {'import.meta.env': '{}'},
});
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
const line = (skuId, qtyUnits, extra = {}) => ({zoneId: 'well', skuId, qtyUnits, source: 'grid', ...extra});
const qty = lines => Object.fromEntries(lines.map(l => [l.skuId, Number(l.qtyUnits)]));

await check('merge: my edits win, cells I left alone take the server\'s value', () => {
  const base = [line('titos', 3), line('jameson', 2), line('aperol', 1)];
  const mine = [line('titos', 4), line('jameson', 2)];               // changed Tito's, removed Aperol
  const theirs = [line('titos', 5), line('jameson', 6), line('aperol', 1), line('campari', 2)];
  assert.deepEqual(qty(m.mergeDraft(base, mine, theirs)), {titos: 4, jameson: 6, campari: 2});
});

await check('merge: a removal elsewhere of a cell I never touched stays removed', () => {
  const base = [line('titos', 3), line('jameson', 2)];
  assert.deepEqual(qty(m.mergeDraft(base, base, [line('titos', 3)])), {titos: 3});
});

await check('merge: number formatting and case provenance compare as quantities', () => {
  const base = [line('titos', 24, {enteredCases: 2, caseSizeAtEntry: 12})];
  const theirs = m.toInputLines([{zoneId: 'well', skuId: 'titos', qtyUnits: '24.000', enteredCases: '2.00',
    caseSizeAtEntry: 12, enteredPacks: null, packSizeAtEntry: null, source: 'grid', rawUtterance: null}]);
  const mine = [line('titos', 24, {enteredCases: 2, caseSizeAtEntry: 12})];
  const merged = m.mergeDraft(base, mine, [...theirs, line('kahlua', 1)]);
  assert.deepEqual(qty(merged), {titos: 24, kahlua: 1});
});

await check('saver: each save is built on the fingerprint the last one returned, in order', async () => {
  const sent = [];
  let lines = [line('titos', 1)];
  const saver = m.createDraftSaver({
    save: async (l, baseHash) => { sent.push([qty(l), baseHash]); await new Promise(r => setTimeout(r, 5)); return {linesHash: `h${sent.length}`}; },
    current: () => lines,
    adopt: () => { throw new Error('no merge expected'); },
  });
  saver.loaded([], 'h0');
  const a = saver.save();
  lines = [line('titos', 2)];
  const b = saver.save();                                          // queued behind a
  await Promise.all([a, b]);
  assert.deepEqual(sent, [[{titos: 2}, 'h0'], [{titos: 2}, 'h1']]);
});

await check('saver: a refused save merges onto the current draft, hands it to the screen and saves it once', async () => {
  const calls = [];
  let screen = [line('titos', 4), line('jameson', 2)];             // the counter changed Tito's 3 → 4
  const saver = m.createDraftSaver({
    save: async (l, baseHash) => {
      calls.push([qty(l), baseHash]);
      if (calls.length === 1) throw new m.DraftChangedError([       // an admin fixed Jameson to 6 meanwhile
        {zoneId: 'well', skuId: 'titos', qtyUnits: '3.000', enteredCases: null, caseSizeAtEntry: null, enteredPacks: null, packSizeAtEntry: null, source: 'grid', rawUtterance: null},
        {zoneId: 'well', skuId: 'jameson', qtyUnits: '6.000', enteredCases: null, caseSizeAtEntry: null, enteredPacks: null, packSizeAtEntry: null, source: 'grid', rawUtterance: null},
      ], 'server2');
      return {linesHash: 'server3'};
    },
    current: () => screen,
    adopt: l => { screen = l; },
  });
  saver.loaded(m.toOpenLines([line('titos', 3), line('jameson', 2)]), 'server1');
  await saver.save();
  assert.deepEqual(calls, [[{titos: 4, jameson: 2}, 'server1'], [{titos: 4, jameson: 6}, 'server2']]);
  assert.deepEqual(qty(screen), {titos: 4, jameson: 6}, 'the screen shows the merge');
});

await check('saver: an ordinary failure is reported and the next save tries again on the same fingerprint', async () => {
  const hashes = [];
  let fail = true;
  const saver = m.createDraftSaver({
    save: async (_l, baseHash) => { hashes.push(baseHash); if (fail) { fail = false; throw new Error('offline'); } return {linesHash: 'next'}; },
    current: () => [line('titos', 1)],
    adopt: () => {},
  });
  saver.loaded([], 'h0');
  await assert.rejects(saver.save(), /offline/);
  await saver.save();
  assert.deepEqual(hashes, ['h0', 'h0']);
});

console.log(`${passed} draft sync checks passed; no DOM or service calls.`);
