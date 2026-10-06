// Pure rules behind pause cuts and the voice review: pauseDetector.ts,
// voiceCarry.ts and voiceReview.ts. No DOM, no network.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(new URL('../../package.json', import.meta.url));
const {build} = require('esbuild');
const {outputFiles} = await build({
  stdin: {contents: `
    export * from './src/components/liquor/pauseDetector';
    export * from './src/components/liquor/voiceCarry';
    export * from './src/components/liquor/voiceReview';
  `, resolveDir:fileURLToPath(new URL('../../', import.meta.url)), loader:'ts'},
  bundle:true, write:false, platform:'node', format:'esm',
});
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`PASS ${name}`); };

// Loudness script: speech at -20 dB, quiet at -50 dB, in 50 ms frames.
function run(detector, levelAt, untilMs, pieceStart = 0) {
  for (let at = m.FRAME_MS; at <= untilMs; at += m.FRAME_MS) {
    detector.push(levelAt(at), at);
    const why = detector.shouldCut(at, pieceStart);
    if (why) return {at, why};
  }
  return null;
}
const quietBetween = (ranges) => (at) => ranges.some(([a, b]) => at > a && at <= b) ? -50 : -20;
// A counter's rhythm: a 300 ms gap between bottles every 2 s.
const counting = (extra) => (at) => (at % 2_000 < 300) || extra.some(([a, b]) => at > a && at <= b) ? -50 : -20;

check('pause detector: a half-second breath after 20 s cuts; gaps between bottles do not', () => {
  const cut = run(m.createPauseDetector(), counting([[21_000, 22_000]]), 40_000);
  assert.equal(cut.why, 'pause');
  assert.ok(cut.at >= 21_500 && cut.at <= 21_550, `cut at ${cut.at}`);
});

check('pause detector: with almost no pauses yet, a long breath still cuts, a little later', () => {
  // Only 10% of the window can set the quiet floor, so the first ~0.3 s of a
  // rare pause read as speech. A 1 s pause still gets its cut.
  const cut = run(m.createPauseDetector(), quietBetween([[10_000, 10_300], [20_300, 20_600], [21_000, 22_000]]), 40_000);
  assert.equal(cut.why, 'pause');
  assert.ok(cut.at > 21_500 && cut.at < 22_000, `cut at ${cut.at}`);
});

check('pause detector: nonstop talk is cut at the 30 s cap', () => {
  const cut = run(m.createPauseDetector(), () => -20, 40_000);
  assert.deepEqual(cut, {at: m.CAP_MS, why: 'cap'});
});

check('pause detector: flat room noise is not a pause (no speech-to-quiet spread)', () => {
  const cut = run(m.createPauseDetector(), (at) => -40 + (at % 200 === 0 ? 1 : 0), 40_000);
  assert.equal(cut.why, 'cap');
});

check('pause detector: the floor follows the room (music starts halfway)', () => {
  // Music at 12 s raises speech and quiet alike. Measured against the recent
  // window, the breath at 21 s is still a pause.
  const level = (at) => {
    const loud = at >= 12_000;
    const gap = at % 2_000 < 300 || (at > 21_000 && at <= 22_000);
    return gap ? (loud ? -32 : -45) : (loud ? -12 : -25);
  };
  const cut = run(m.createPauseDetector(), level, 40_000);
  assert.equal(cut.why, 'pause');
  assert.ok(cut.at >= 21_500 && cut.at <= 21_600, `cut at ${cut.at}`);
});

check('pause detector: frameDb is RMS in dB', () => {
  assert.equal(Math.round(m.frameDb(new Float32Array(2048).fill(0.1))), -20);
  assert.equal(m.frameDb(new Float32Array(16)), -120);
});

check('carry: an unfinished bottle waits for its number', () => {
  assert.deepEqual(m.splitUnfinished("Kahlua, three. Bailey's, two. Frangelico,"),
    {head: "Kahlua, three. Bailey's, two.", tail: 'Frangelico,'});
  assert.deepEqual(m.splitUnfinished('Malibu, one point one. Bacardi, point'),
    {head: 'Malibu, one point one.', tail: 'Bacardi, point'});
  assert.deepEqual(m.splitUnfinished("Baileys, two. Frangelico."),
    {head: 'Baileys, two.', tail: 'Frangelico.'});
});

check('carry: a finished piece sends everything', () => {
  for (const text of ['Tito\'s, one point three.', 'Captain Morgan, one case.', 'Point nine.']) {
    assert.deepEqual(m.splitUnfinished(text), {head: text, tail: ''});
  }
  // No comma between bottle and number: held one piece, never miscounted.
  // Deepgram with formatting off writes "Malibu, one point one."
  assert.deepEqual(m.splitUnfinished('Aperol, one. Malibu 1.1'), {head: 'Aperol, one.', tail: 'Malibu 1.1'});
  assert.deepEqual(m.splitUnfinished('Antica formula, three seventy-eight point nine.'),
    {head: 'Antica formula, three seventy-eight point nine.', tail: ''});
});

check('carry: a long run with no punctuation is sent, not held', () => {
  const run = 'tito\'s two bulleit one kahlua three baileys two jameson four malibu one bacardi nine aperol';
  assert.equal(m.splitUnfinished(run).tail, '');
});

check('carry: pieces are matched in spoken order, whatever order they finish in', () => {
  const sent = [];
  const carry = m.createCarry((text, i) => sent.push([i, text]));
  carry.add('Point eight. Cointreau, point three.', 1);   // finished first, waits for piece 0
  assert.deepEqual(sent, []);
  carry.add('Malibu, one point one. Bacardi,', 0);
  assert.deepEqual(sent, [[0, 'Malibu, one point one.'], [1, 'Bacardi, Point eight. Cointreau, point three.']]);
  carry.add('', 2);                                      // a silent piece still advances
  carry.add('Tanqueray, one. Tito\'s,', 3);
  carry.flush(99);
  assert.deepEqual(sent.slice(2), [[3, 'Tanqueray, one.'], [99, 'Tito\'s,']]);
});

check('carry: Stop sends pieces queued behind a failed one', () => {
  const sent = [];
  const carry = m.createCarry((text, i) => sent.push([i, text]));
  carry.add('Aperol, one.', 0);
  carry.add('Campari, two.', 2);                          // piece 1 failed and never reports
  carry.flush(99);
  assert.deepEqual(sent, [[0, 'Aperol, one.'], [2, 'Campari, two.']]);
  carry.add('Tito\'s, one.', 0);                          // the next take starts clean
  assert.deepEqual(sent.at(-1), [0, 'Tito\'s, one.']);
});

check('carry: comma-separated multiword names wait whole, including a partial quantity', () => {
  for (const tail of ['Indigo, gin,', 'Casamigos, repo,', 'Carpano, Antica, Formula,', 'Indigo, gin, point', 'Indigo, gin, one case and']) {
    assert.deepEqual(m.splitUnfinished(`Dos Hombres, mezcal, point three. ${tail}`),
      {head:'Dos Hombres, mezcal, point three.',tail});
  }
  assert.deepEqual(m.splitUnfinished('Titos two. Indigo, gin,'), {head:'Titos two.',tail:'Indigo, gin,'});
  assert.deepEqual(m.splitUnfinished('Indigo. Gin.'), {head:'',tail:'Indigo. Gin.'});
});

check('carry: the field split emits the completed mezcal and retains Indigo gin until point six arrives', () => {
  const sent=[];const carry=m.createCarry((text,index)=>sent.push({text,index}));
  carry.add('Point six',1);
  assert.equal(sent.length,0,'the later quantity response waits for the preceding piece');
  carry.add('Dos Hombres, mezcal, point three. Indigo, gin,',0);
  assert.deepEqual(sent.map(row=>row.text),['Dos Hombres, mezcal, point three.','Indigo, gin, Point six']);
  assert.equal(carry.flush(99),false);
  assert.deepEqual(sent.map(row=>row.text),['Dos Hombres, mezcal, point three.','Indigo, gin, Point six']);
  assert.ok(!sent.some(row=>/^Indigo[, .]*$/.test(row.text)),'a brand-only implicit-one request never goes out');
});

check('carry: three successful name/name/quantity clips stay joined and a missing clip stays a boundary', () => {
  const sent=[];const carry=m.createCarry((text,index)=>sent.push({text,index}));
  carry.add('Indigo,',0);carry.add('gin,',1);assert.equal(sent.length,0);
  carry.add('point six.',2);assert.equal(carry.flush(99),false);
  assert.deepEqual(sent.map(row=>row.text),['Indigo, gin, point six.']);
  sent.length=0;
  carry.add('Dos Hombres, mezcal, point three. Indigo, gin,',0);carry.fail(1);carry.add('point six.',2);
  assert.equal(carry.flush(99),true);
  assert.deepEqual(sent.map(row=>row.text),['Dos Hombres, mezcal, point three.','Indigo, gin,','point six.']);
});

check('food carry: a quantity sentence stays with the following product name', () => {
  assert.deepEqual(m.splitFoodTail('Two cases. Pizza sauce.'), {head:'',tail:'Two cases. Pizza sauce.'});
  assert.deepEqual(m.splitFoodTail('Oreos, one case. Zero point seven. Spanish rice.'),
    {head:'Oreos, one case.',tail:'Zero point seven. Spanish rice.'});
  assert.deepEqual(m.splitFoodTail('One third of a case. Flatbread.'),
    {head:'',tail:'One third of a case. Flatbread.'});
});

check('food carry: a known failed clip separates an orphan name from the following quantity', () => {
  const sent=[];const carry=m.createCarry((text,index)=>sent.push({text,index}),m.splitFoodTail);
  carry.add('Oreos, one case. Bacon bits,',0);
  carry.add('Two cases. Pizza sauce.',2);
  carry.fail(1);
  assert.equal(carry.flush(99),true);
  assert.deepEqual(sent.map(s=>s.text),['Oreos, one case.','Bacon bits,','Two cases. Pizza sauce.']);
  assert.ok(!sent.some(s=>s.text.includes('Bacon bits, Two cases')));
});

check('food carry: Stop infers a missing clip and never joins across it', () => {
  const sent=[];const carry=m.createCarry(text=>sent.push(text),m.splitFoodTail);
  carry.add('Oreos, one case. Bacon bits,',0);
  carry.add('Two cases. Pizza sauce.',2);
  assert.equal(carry.flush(99),true);
  assert.deepEqual(sent,['Oreos, one case.','Bacon bits,','Two cases. Pizza sauce.']);
});

check('food carry: out-of-order consecutive failures preserve separate surviving phrases', () => {
  const sent=[];const carry=m.createCarry(text=>sent.push(text),m.splitFoodTail);
  carry.add('Two cases. Pizza sauce.',3);carry.fail(2);carry.fail(1);carry.add('Bacon bits,',0);
  assert.equal(carry.flush(99),true);
  assert.deepEqual(sent,['Bacon bits,','Two cases. Pizza sauce.']);
  carry.add('Oreos, one case.',0);assert.equal(carry.flush(99),false);
  assert.equal(sent.at(-1),'Oreos, one case.','the next take has no inherited gap');
});

check('food carry: a successful empty clip remains a valid continuation', () => {
  const sent=[];const carry=m.createCarry(text=>sent.push(text),m.splitFoodTail);
  carry.add('Bacon bits,',0);carry.add('',1);carry.add('One case. Oreos, two cases.',2);
  assert.equal(carry.flush(99),false);
  assert.deepEqual(sent,['Bacon bits, One case.','Oreos, two cases.']);
});

// Food: the product comes before OR after its number, so the last item waits.
check('food carry: the 20 s cut of Jon\'s 2026-10-02 test is matched whole', () => {
  const sent = [];
  const carry = m.createCarry((text, i) => sent.push(text), m.splitFoodTail);
  carry.add('Sausage, half a case. Bacon bits, one case. Pizza dough, 1.6 cases. We have 4.2 cases', 0);
  carry.add('Pizza sauce. We have point nine of Spanish rice.', 1);
  carry.flush(99);
  assert.deepEqual(sent, ['Sausage, half a case. Bacon bits, one case.',
    'Pizza dough, 1.6 cases. We have 4.2 cases Pizza sauce.', 'We have point nine of Spanish rice.']);
});

check('food carry: a correction and a name awaiting its number stay with their item', () => {
  assert.deepEqual(m.splitFoodTail('Bananas, eighteen. Jalapenos, one case. No. Half a case.'),
    {head: 'Bananas, eighteen.', tail: 'Jalapenos, one case. No. Half a case.'});
  assert.deepEqual(m.splitFoodTail('Oreos, one case. Bacon bits, full case.'),
    {head: 'Oreos, one case.', tail: 'Bacon bits, full case.'});
  // A word the list doesn't know ("sealed") still can't strand the name.
  assert.deepEqual(m.splitFoodTail('Oreos, one case. Bacon bits, sealed case.'),
    {head: 'Oreos, one case.', tail: 'Bacon bits, sealed case.'});
  assert.deepEqual(m.splitFoodTail('beef patties, three and a half ounces, two cases, two ounce patties, five,'),
    {head: 'beef patties, three and a half ounces, two cases,', tail: 'two ounce patties, five,'});
});

check('food carry: a piece that names nothing waits whole; a run-on is sent', () => {
  assert.deepEqual(m.splitFoodTail('We have four point two cases'), {head: '', tail: 'We have four point two cases'});
  const runOn = 'we have two cases of pizza sauce and three bags of bacon bits and four boxes of gloves and one case of oreos';
  assert.equal(m.splitFoodTail(runOn).tail, '');
});

check('name numbers: names, not sizes', () => {
  assert.deepEqual(m.nameNumbers("Seagram's 7"), [7]);
  assert.deepEqual(m.nameNumbers("Dewar's 12 Year"), [12]);
  assert.deepEqual(m.nameNumbers('Tanqueray No. Ten'), [10]);
  assert.deepEqual(m.nameNumbers('Ketel One'), []);
  assert.deepEqual(m.nameNumbers('Maschio Prosecco Brut 187ml'), []);
  assert.deepEqual(m.nameNumbers('Fever-Tree Tonic Water 5oz Can'), []);
  assert.deepEqual(m.nameNumbers('Jose Cuervo Tradicional Silver 1L'), []);
});

check('name-number check: 7.9 of Seagram\'s 7 asks; ordinary counts do not', () => {
  assert.deepEqual(m.nameNumberCheck(7.9, 0, "Seagram's 7"), {n: 7, alt: 0.9});
  assert.deepEqual(m.nameNumberCheck(12, 0, "Dewar's 12 Year"), {n: 12, alt: null});
  assert.equal(m.nameNumberCheck(0.9, 0, "Seagram's 7"), null);
  assert.equal(m.nameNumberCheck(2, 0, "Seagram's 7"), null);
  assert.equal(m.nameNumberCheck(7, 1, "Seagram's 7"), null);
  assert.equal(m.nameNumberCheck(1, 0, 'Ketel One'), null);
});

check('repeats: back to back is a correction; a case then loose adds; later repeats stay', () => {
  const row = (id, units, spoken, cases = 0, qty = units) => ({spoken, cases, units, qty, unitsPerCase: 12,
    needsCaseSize: false, suspectPreMultiplied: false, match: {id, name: id, sizeMl: 750, unitsPerCase: 12}, candidates: []});
  const merged = m.mergeAdjacentRepeats([row('gg', 0.9, 'Grey Goose, point nine'), row('gg', 1, 'Grey Goose, one')]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].units, 1);
  assert.equal(merged[0].spoken, 'Grey Goose, point nine … Grey Goose, one');
  const added = m.mergeAdjacentRepeats([row('tito', 0, "Tito's, one case", 1, 12), row('tito', 2, "Tito's, two")]);
  assert.deepEqual([added[0].cases, added[0].units, added[0].qty], [1, 2, 14]);
  const apart = [row('a', 1, 'a'), row('b', 1, 'b'), row('a', 2, 'a')];
  assert.equal(m.mergeAdjacentRepeats(apart).length, 3);
});

check('history: far above the 90-day record asks; ordinary counts and new bottles do not', () => {
  const h = (maxCount, maxDelivery) => ({maxCount, maxDelivery, days: 90});
  // 10-02's tonic: 1,152 cans against a record of 72.
  assert.equal(m.historyCheck(1152, 0, h(72, 72), 24)?.total, 1152);
  // Seagram's at 14 against a record of 3.5.
  assert.equal(m.historyCheck(14, 0, h(3.5, null), null)?.total, 14);
  // Other shelves count toward the venue total.
  assert.equal(m.historyCheck(10, 30, h(12, 12), 12)?.total, 40);
  assert.equal(m.historyCheck(9, 0, h(2, 6), 6), null, 'a slow bottle\'s next case');
  assert.equal(m.historyCheck(40, 0, h(43.1, 48), 12), null, 'an ordinary Tito\'s count');
  assert.equal(m.historyCheck(500, 0, null, 12), null, 'no history, no question');
  assert.equal(m.historyCheck(500, 0, h(null, null), 12), null);
});

console.log(`${passed} voice rule checks passed; no DOM, microphone or service calls.`);
