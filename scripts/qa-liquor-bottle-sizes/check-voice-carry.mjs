// Pure rules behind pause cuts and the voice review: pauseDetector.ts,
// voiceCarry.ts and voiceReview.ts. No DOM, no network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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

// Retained clips of two name-first takes (10/5 6c26c09b, 10/6 7e476f68). The
// reverted 341efa1 splitter sent "Golden Falernum," and "point three five."
// as separate requests (Alcohol Pricing incidents/2026-10-09/liquor-root-cause/).
check('carry: name-first takes keep every name with its number', () => {
  for (const [clips, requests] of [
    [["Jameson, seven. Seagram, seven, point eight. Jack Daniel's, point three. Captain Morgan, point three. Malibu, one point two. Bacardi Superior, point three. Contreau, point one.",
      "Tanqueray, point one. Jose Cuervo Tradicional, point seven. Tito's, point seven. Bullet, point four."], null],
    [["Luxardo. That's it. One point one. Diplomatico, point six. Ron Zacapa, point three.",
      "Worthy Park, point eight. Kahlua, point three. Fontbonne, eighteen seventy four, point eight. Golden Falernum, point three five. Ketel One,",
      "Point eight. Empress, gin, point seven. Hendrick's, point three five. Hennessy VSOP, point eight. Longbranch, point one. Casamigos Reposado, point",
      "Four. Casamigos Blanco, point eight five. Don Julio Anejo, point one. Don Julio Reposado, point seven. Don Julio Blanco, point one. Herradura",
      "Silver, point seven. Dos Hombres, mezcal, point three."],
    ["Luxardo. That's it. One point one. Diplomatico, point six. Ron Zacapa, point three.",
      "Worthy Park, point eight. Kahlua, point three. Fontbonne, eighteen seventy four, point eight. Golden Falernum, point three five.",
      "Ketel One, Point eight. Empress, gin, point seven. Hendrick's, point three five. Hennessy VSOP, point eight. Longbranch, point one.",
      "Casamigos Reposado, point Four. Casamigos Blanco, point eight five. Don Julio Anejo, point one. Don Julio Reposado, point seven. Don Julio Blanco, point one.",
      "Herradura Silver, point seven. Dos Hombres, mezcal, point three."]],
  ]) {
    const sent=[];const carry=m.createCarry(text=>sent.push(text));
    clips.forEach((clip,i)=>carry.add(clip,i));
    assert.equal(carry.flush(99),false);
    assert.deepEqual(sent,requests ?? clips);
  }
});

// Count-first (10/9 b29e5983): the revert alone sent "... One bottle," and
// "Don Julio Anejo." apart, so a name-only request proved an implicit one.
// Right only because the count was one; "Two bottles" saved 1.
check('carry: a count-first count stays with its name; a name-first number stays with its name', () => {
  const take = "One point eight Tito's to Captain Morgan. One case, Morgan.";
  for (const tail of ['One bottle, Don Julio Anejo.', 'Two bottles, Don Julio Anejo.', 'Two bottles,']) {
    assert.deepEqual(m.splitUnfinished(`${take} ${tail}`), {head:take,tail});
  }
  // dc90a192: "Contreau, point one. One bottle, Tanqueray," was Tanqueray's one.
  assert.deepEqual(m.splitUnfinished('Contreau, point one. One bottle, Tanqueray,'),
    {head:'Contreau, point one.',tail:'One bottle, Tanqueray,'});
  assert.deepEqual(m.splitUnfinished('Point seven Casamigos Blanco. Two bottles, Casamigos Reposado.'),
    {head:'Point seven Casamigos Blanco.',tail:'Two bottles, Casamigos Reposado.'});
  const sent=[];const carry=m.createCarry(text=>sent.push(text));
  carry.add('Don Julio Anejo.',1);carry.add('Captain Morgan, two. Two bottles,',0);
  assert.equal(carry.flush(99),false);
  assert.deepEqual(sent,['Captain Morgan, two.','Two bottles, Don Julio Anejo.']);
  // After "Name, number" or an uncounted name, the number finishes that name.
  for (const [text, head, tail] of [
    ['Jefferson, point six five. Elijah Craig,', 'Jefferson, point six five.', 'Elijah Craig,'],
    ["Seagram, seven, point eight. Jack Daniel's,", 'Seagram, seven, point eight.', "Jack Daniel's,"],
    ['Jameson. Point six five, Elijah Craig,', 'Jameson. Point six five,', 'Elijah Craig,'],
    ["Maschino Prosecco. Seventeen bottles, Owen's Ginger Beer.", 'Maschino Prosecco. Seventeen bottles,', "Owen's Ginger Beer."],
    ["Four Roses. Two bottles, Don Julio.", 'Four Roses. Two bottles,', 'Don Julio.'],
    ["Tito's. Two bottles,", "Tito's. Two bottles,", ''],
    ["Tito's, two, Jameson, three,", "Tito's, two, Jameson, three,", ''],
    ['Captain Morgan, two. Point nine.', 'Captain Morgan, two. Point nine.', ''],
  ]) assert.deepEqual(m.splitUnfinished(text), {head,tail}, text);
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

check('food carry: cup package sizes do not separate the GM count from its product', () => {
  const sent=[];const carry=m.createCarry(text=>sent.push(text),m.splitFoodTail);
  carry.add('Sixteen ounce cups, one case. Twelve ounce cups, point eight. Twenty four ounce cups, point nine. Lids, One case.',0);
  carry.flush(0);
  assert.deepEqual(sent,[
    'Sixteen ounce cups, one case. Twelve ounce cups, point eight. Twenty four ounce cups, point nine.',
    'Lids, One case.',
  ]);
  for(const name of ['24 ounce cups','Twenty-four-ounce cups','24oz clear plastic cups','Cups clear plastic 24oz',
    'Fourteen inch dough','Pizza shells fourteen inch','4.5"x12" flatbread','Four point five by twelve flatbread']) {
    assert.deepEqual(m.splitFoodTail(`${name}, point nine. Lids, one case.`),
      {head:`${name}, point nine.`,tail:'Lids, one case.'},name);
  }
});

check('food carry: real counts and weights remain counted when a product has a size', () => {
  // The next product has no number yet, so the orphan "Point nine." leads it
  // (2026-10-09: an orphan never moves onto an item that already has one).
  for(const phrase of ['Flour five pounds','Twenty four ounces of milk','One case of twenty four ounce cups',
    'One twelve ounce cup','One cup clear plastic twelve ounce','Twelve flatbreads']) {
    assert.deepEqual(m.splitFoodTail(`${phrase}. Point nine. Lids.`),
      {head:`${phrase}.`,tail:'Point nine. Lids.'},phrase);
  }
});

check('food carry: a sized product crosses a successful cut but never a failed clip', () => {
  const run=failed=>{
    const sent=[];const carry=m.createCarry(text=>sent.push(text),m.splitFoodTail);
    carry.add('Twenty four ounce cups,',0);
    if(failed)carry.fail(1);
    carry.add('point nine. Lids, One case.',failed?2:1);
    const gap=carry.flush(failed?2:1);return{sent,gap};
  };
  assert.deepEqual(run(false),{sent:['Twenty four ounce cups, point nine.','Lids, One case.'],gap:false});
  // After the failed clip the orphan "point nine." is sent on its own: Lids
  // already has "One case", so it never takes a second number (2026-10-09).
  assert.deepEqual(run(true),{sent:['Twenty four ounce cups,','point nine.','Lids, One case.'],gap:true});
});

// ── 2026-10-09 food review repairs (Alcohol Pricing incidents/2026-10-09/
// food-voice-review). Pieces go through createCarry exactly as CountFood wires
// it: the catalog splitter, add per piece, flush at Stop.
const foodCatalog = JSON.parse(await readFile(new URL('./food-catalog-carry.fixture.json', import.meta.url), 'utf8')).items;
const foodRequests = (pieces, split = m.createFoodCarrySplitter(foodCatalog)) => {
  const sent = []; const carry = m.createCarry(text => sent.push(text), split);
  pieces.forEach((text, i) => (text == null ? carry.fail(i) : carry.add(text, i)));
  carry.flush(Number.MAX_SAFE_INTEGER); return sent;
};

// The real food takes (10/3 Mop Room test, and every 10/7 inventory take).
// null = the requests are the pieces themselves. Three changed on purpose:
// 6e88b59d keeps "No. Half of a case." with jalapenos, 90cb6dd1 keeps "Oh,
// wait." with its dough, and 6dfb506f sends the Diet Pepsi with fry seasoning.
check('food carry: the real food takes split as recorded, with the correction, "Oh, wait" and "and one Diet Pepsi" repaired', () => {
  for (const [take, pieces, requests] of [
    ['6e88b59d', ['Sausage, half a case. Bacon bits, one case. Pepperoni, point six of a case. Giant pretzel, one case. Pizza dough, one point six cases, four point two cases of pizza sauce,','Point nine of Spanish rice. We have point five of a case of salsa, two cases of cauliflower crust, six flatbread, four packets of pizza circles, five boxes of gloves,','One case of Oreos, three chocolate cakes, two cheesecakes, beef patties, three and a half ounces, two cases, two ounce patties, five, Cranberry, two five pound bags. Jalapenos, one case. No. Half of a case.','Bananas eighteen.'],
      ['Sausage, half a case. Bacon bits, one case. Pepperoni, point six of a case. Giant pretzel, one case. Pizza dough, one point six cases,','four point two cases of pizza sauce, Point nine of Spanish rice. We have point five of a case of salsa, two cases of cauliflower crust, six flatbread, four packets of pizza circles,','five boxes of gloves, One case of Oreos, three chocolate cakes, two cheesecakes, beef patties, three and a half ounces, two cases, two ounce patties, five, Cranberry, two five pound bags.','Jalapenos, one case. No. Half of a case.','Bananas eighteen.']],
    ['6bf4f5a2', ['One Diet Pepsi, two regular Pepsi, one Starry, one blue cotton candy ICEE.'], ['One Diet Pepsi, two regular Pepsi, one Starry,','one blue cotton candy ICEE.']],
    ['6877a17f', ['Pizza sauce, three cases and two cans. Jalapenos, four cans. Instant refried beans, one case.'], ['Pizza sauce, three cases and two cans. Jalapenos, four cans.','Instant refried beans, one case.']],
    ['9bb209ea', ['One case of french fries, half a case of onion rings, two containers of ranch dressing'], ['One case of french fries, half a case of onion rings,','two containers of ranch dressing']],
    ['f7c196f2', ['Two jugs of ranch dressing'], null],
    ['cf29ddbf', ['Two Diet Pepsi, one Pepsi, three Starry, one Orange Crush, one blue cotton candy, two cans of pizza sauce.'], ['Two Diet Pepsi, one Pepsi, three Starry, one Orange Crush, one blue cotton candy,','two cans of pizza sauce.']],
    ['43b595e4', ['Pizza sauce, two cases plus three cans, jalapenos, four cans, instant refried beans, one case, black olives, two cans, bacon bits, one bag.'], ['Pizza sauce, two cases plus three cans, jalapenos, four cans, instant refried beans, one case, black olives, two cans,','bacon bits, one bag.']],
    ['d2a3524f', ['Pizza dough, two cases, cauliflower crust, half a case, giant pretzels, one case, cup and char pepperoni, two bags, sausage, pizza topping, one case.'], ['Pizza dough, two cases, cauliflower crust, half a case, giant pretzels, one case, cup and char pepperoni, two bags,','sausage, pizza topping, one case.']],
    ['90cb6dd1', ['Pizza Dough. Oh, wait.'], null],
    ['d86d13e3', ['French fries, one case. Onion rings, half a case. Ranch dressing, two containers. Dino chicken nuggets, one case. Tater Tots, zero.'], ['French fries, one case. Onion rings, half a case. Ranch dressing, two containers. Dino chicken nuggets, one case.','Tater Tots, zero.']],
    ['6dfb506f', ['Ketchup, one case plus two bottles. Yellow mustard, three bottles. Extra large vinyl gloves, two boxes. Fry seasoning, one container, and one Diet Pepsi.'], ['Ketchup, one case plus two bottles. Yellow mustard, three bottles. Extra large vinyl gloves, two boxes.','Fry seasoning, one container, and one Diet Pepsi.']],
    ['9134a00c', ['Twenty six cans of pizza sauce, point three of a case of Spanish rice, point six of a case of black olives, four cans of sliced jalapenos, four cans of al dente pasta sauce, six cans of fire roasted salsa.','One point two cases of pasta, one point one cases of instant refried beans, one bag of pico crumbs, one bag of sugar.','A quarter bag of flour.'],
      ['Twenty six cans of pizza sauce, point three of a case of Spanish rice, point six of a case of black olives, four cans of sliced jalapenos, four cans of al dente pasta sauce,','six cans of fire roasted salsa. One point two cases of pasta, one point one cases of instant refried beans, one bag of pico crumbs,','one bag of sugar.','A quarter bag of flour.']],
    ['c5c6a664', ['Twenty six cans of pizza sauce, point three of a case of Spanish rice, point six of a case of sliced black olives, four cans of sliced jalapenos, four cans of al dente pasta sauce,','Six cans of fire roasted salsa, one case and three pounds of pasta rigatoni, one case and one bag of instant refried beans.'],
      ['Twenty six cans of pizza sauce, point three of a case of Spanish rice, point six of a case of sliced black olives, four cans of sliced jalapenos,','four cans of al dente pasta sauce, Six cans of fire roasted salsa, one case and three pounds of pasta rigatoni,','one case and one bag of instant refried beans.']],
    ['b0a0c257', ['Pizza sauce, twenty six cans. Spanish rice, point three. Sliced black olives, point six. Sliced jalapenos, four cans. Aldente pasta sauce, four cans. Fire roasted jalapeno, six cans.','Rigatoni pasta, one case plus one bag. Refried beans, one case plus one bag.'],
      ['Pizza sauce, twenty six cans. Spanish rice, point three. Sliced black olives, point six. Sliced jalapenos, four cans. Aldente pasta sauce, four cans.','Fire roasted jalapeno, six cans. Rigatoni pasta, one case plus one bag.','Refried beans, one case plus one bag.']],
    ['48dadadb', ['A quarter bag of pepperoni. One bag of cheese. A quarter bag of cheese. One can of pizza sauce. One bag of cheese, one can of sliced jalapenos, a quarter bag of Cup and Char Pepperoni,','Ten cookies. Chocolate chip.'],
      ['A quarter bag of pepperoni. One bag of cheese. A quarter bag of cheese. One can of pizza sauce. One bag of cheese, one can of sliced jalapenos,','a quarter bag of Cup and Char Pepperoni, Ten cookies.','Chocolate chip.']],
    ['6a7fdd45', ['Alright. One one bag of Italian sausage. One bag of bacon bits. Point three case of Naan bread. One bag of pepperoni.','Twelve flatbreads, three giant pretzels, one case of cauliflower crust, two shells of fourteen inch pizza dough.'],
      ['Alright. One one bag of Italian sausage. One bag of bacon bits. Point three case of Naan bread.','One bag of pepperoni. Twelve flatbreads, three giant pretzels, one case of cauliflower crust,','two shells of fourteen inch pizza dough.']],
    ['5b3df927', ['Sixteen ounce cups, one case. Twelve ounce cups, point eight. Twenty four ounce cups, point nine. Lids, One case.',''], ['Sixteen ounce cups, one case. Twelve ounce cups, point eight. Twenty four ounce cups, point nine.','Lids, One case.']],
    // The 10/6 Beverage Room and kitchen tests, chatter included: unchanged.
    ['046b1734', ['One Diet Pepsi, one regular Pepsi, one pink lemonade, one Starry, one mug, one Doctor Pepper, one blue cotton candy ICEE.'], ['One Diet Pepsi, one regular Pepsi, one pink lemonade, one Starry, one mug, one Doctor Pepper,','one blue cotton candy ICEE.']],
    ['1c9f2a76', ["This. Which I kinda ate. Alright. Let me try to fix these things, and we'll come back."], null],
    ['48ec54d4', [''], []],
    ['23291b00', ['Hello?'], null],
    ['f9dabfef', ['One Diet Pepsi. One Pepsi. One Pink Lemonade. One Doctor Pepper. One Root Beer. One Starry. One Blue Cotton Candy ICEE.'], ['One Diet Pepsi. One Pepsi. One Pink Lemonade. One Doctor Pepper. One Root Beer. One Starry.','One Blue Cotton Candy ICEE.']],
    ['d0aa9080', ["Just... I know you're not saving it. Just count. Say ten pizza sauce."], null],
    ['b808eba6', ["Pizza sauce cans, fourteen. Jalapenos cans, three. Tomatoes cans, four. Or I guess it's actually salsa. Fire roasted salsa cans. Four. Fuck is this? Pasta. Pasta. One case and a little bit.",'Instant refried beans, one case.'],
      ["Pizza sauce cans, fourteen. Jalapenos cans, three. Tomatoes cans, four. Or I guess it's actually salsa. Fire roasted salsa cans. Four.",'Fuck is this? Pasta. Pasta. One case and a little bit.','Instant refried beans, one case.']],
    ['7dc1ca4f', ['Pizza sauce, cans, fourteen. Jalapenos, cans, three. Fire roasted salsa, four. Refried beans, one case.'], ['Pizza sauce, cans, fourteen. Jalapenos, cans, three. Fire roasted salsa, four.','Refried beans, one case.']],
    ['f31da7c5', ['Three cases of pizza sauce.'], null],
  ]) assert.deepEqual(foodRequests(pieces), requests ?? pieces, take);
});

// The review's other synthetic split phrasings (split/synthetic.json S06, S08,
// S12, S13); S01-S05, S07, S09-S11, S14 and S15 are in the checks below.
check('food carry: the review\'s remaining split phrasings keep each count with its name', () => {
  for (const [pieces, requests] of [
    [['One case, Oreos. Cranberry,', 'two bags.'], ['One case, Oreos.', 'Cranberry, two bags.']],
    [['Beef patties, two cases. Two ounce patties,', 'five.'], ['Beef patties, two cases.', 'Two ounce patties, five.']],
    [['Pepperoni, point', 'six. Sausage, one case.'], ['Pepperoni, point six.', 'Sausage, one case.']],
    [['We have four point two cases', 'of pizza sauce. Five boxes of gloves.'], ['We have four point two cases of pizza sauce.', 'Five boxes of gloves.']],
  ]) assert.deepEqual(foodRequests(pieces), requests, pieces.join(' | '));
});

// Finding 3: a spoken correction takes back the count just said. It stays with
// that item (the server then holds it as corrected) and never leads the next.
check('food carry: a correction stays with the item it corrects and never leads the next item', () => {
  for (const [pieces, requests] of [
    [['Sausage, one case. No, two cases.', 'Bacon bits, one case.'], ['Sausage, one case. No, two cases.', 'Bacon bits, one case.']],
    [['Sausage, one case. Actually, two cases.', 'Bacon bits, one case.'], ['Sausage, one case. Actually, two cases.', 'Bacon bits, one case.']],
    [['Sausage, one case. Sorry. Half a case.', 'Bacon bits, one case.'], ['Sausage, one case. Sorry. Half a case.', 'Bacon bits, one case.']],
    [['Sausage, one case. Wait. Make that two.', 'Bacon bits, one case.'], ['Sausage, one case. Wait. Make that two.', 'Bacon bits, one case.']],
    [['Sausage, one case. I mean, two cases.', 'Bacon bits, one case.'], ['Sausage, one case. I mean, two cases.', 'Bacon bits, one case.']],
    [["Sausage, one case. No, it's actually two cases.", 'Bacon bits, one case.'], ["Sausage, one case. No, it's actually two cases.", 'Bacon bits, one case.']],
    [['Sausage, one case. No wait, two cases.', 'Bacon bits, one case.'], ['Sausage, one case. No wait, two cases.', 'Bacon bits, one case.']],
    [['Sausage, one case. Scratch that, two cases.', 'Bacon bits, one case.'], ['Sausage, one case. Scratch that, two cases.', 'Bacon bits, one case.']],
    [['Sausage, one case. No. Half of a case.', 'Two cases of bacon bits.'], ['Sausage, one case. No. Half of a case.', 'Two cases of bacon bits.']],
    [['Salsa, one case. No. Point five.', 'Pepperoni, two bags.'], ['Salsa, one case. No. Point five.', 'Pepperoni, two bags.']],
    // The correction in its own piece, and before a name still waiting for its number.
    [['Ranch, two.', 'No. Half of a case.', 'Pizza sauce, four.'], ['Ranch, two. No. Half of a case.', 'Pizza sauce, four.']],
    [['Jalapenos, one case. No. Half of a case. Bananas,', 'eighteen.'], ['Jalapenos, one case. No. Half of a case.', 'Bananas, eighteen.']],
    [['Jalapenos, one case. Sorry, half a case. Bananas,', 'eighteen.'], ['Jalapenos, one case. Sorry, half a case.', 'Bananas, eighteen.']],
    [['Jalapenos, one case. No. Half of a case. Bananas eighteen.'], ['Jalapenos, one case. No. Half of a case.', 'Bananas eighteen.']],
    [['Jalapenos, one case. No, half a case.', 'Bananas eighteen.'], ['Jalapenos, one case. No, half a case.', 'Bananas eighteen.']],
    [['Sausage, one case. No. Half of a case.'], ['Sausage, one case. No. Half of a case.']],
  ]) assert.deepEqual(foodRequests(pieces), requests, pieces.join(' | '));
  // "Oh" is a correction only on its own; "oh" is also a spoken zero.
  assert.deepEqual(m.splitFoodTail('Oreos, one case. Oh point seven. Spanish rice.'), {head:'Oreos, one case.',tail:'Oh point seven. Spanish rice.'});
});

// Finding 3 (b): an orphan number never moves onto an item that already has one.
check('food carry: a second number never moves onto an item that already has one', () => {
  for (const [pieces, requests] of [
    [['Pizza sauce, three cases. Two cans.', 'Jalapenos, four cans.'], ['Pizza sauce, three cases. Two cans.', 'Jalapenos, four cans.']],
    [['Ketchup, one case. Plus two bottles.', 'Yellow mustard, three bottles.'], ['Ketchup, one case. Plus two bottles.', 'Yellow mustard, three bottles.']],
    [['Flour five pounds. Point nine. Lids, one case.'], ['Flour five pounds. Point nine.', 'Lids, one case.']],
    // A product with no number yet still takes the orphan count before it.
    [['Oreos, one case. Zero point seven.', 'Spanish rice.'], ['Oreos, one case.', 'Zero point seven. Spanish rice.']],
    [['Two cases. Mozzarella. Three cases.', 'Pizza dough.'], ['Two cases. Mozzarella. Three cases.', 'Pizza dough.']],
  ]) assert.deepEqual(foodRequests(pieces), requests, pieces.join(' | '));
});

// Finding 5: ", and one Diet Pepsi." sent alone showed a blank box. A held item
// that opens with and/plus/also goes with the item before it; the "and" is
// neither stripped nor left at the end of the earlier request.
check('food carry: an item that opens with "and" is sent with the item before it', () => {
  for (const [pieces, requests] of [
    [['Fry seasoning, one container, and one Diet Pepsi.'], ['Fry seasoning, one container, and one Diet Pepsi.']],
    [['Fry seasoning, one container,', 'and one Diet Pepsi.'], ['Fry seasoning, one container, and one Diet Pepsi.']],
    [['Fry seasoning, one container, and one Diet Pepsi.', 'Ketchup, one case.'], ['Fry seasoning, one container, and one Diet Pepsi.', 'Ketchup, one case.']],
    [['Fry seasoning, one container, and Diet Pepsi, one.'], ['Fry seasoning, one container, and Diet Pepsi, one.']],
    [['Fry seasoning, one container, plus one Diet Pepsi.'], ['Fry seasoning, one container, plus one Diet Pepsi.']],
    [['Fry seasoning, one container, also one Diet Pepsi.'], ['Fry seasoning, one container, also one Diet Pepsi.']],
    [['Zero pink lemonade. One Orange Crush. One blue raspberry ICEE. And one cherry ICEE.'], ['Zero pink lemonade. One Orange Crush.', 'One blue raspberry ICEE. And one cherry ICEE.']],
    [['One case of sausage, and two cases of bacon bits,', 'three bags of cheese.'], ['One case of sausage, and two cases of bacon bits,', 'three bags of cheese.']],
    [['Pizza sauce, two cases, and jalapenos, four cans.', 'Salsa, one case.'], ['Pizza sauce, two cases, and jalapenos, four cans.', 'Salsa, one case.']],
    [['Um, four bottles of ketchup, uh, one jug of zero fat butter,', 'and, um, one more bottle of ketchup under the counter.'],
      ['Um, four bottles of ketchup, uh,', 'one jug of zero fat butter, and, um, one more bottle of ketchup under the counter.']],
    // "and" inside a remainder or a catalog name is not a new item.
    [['Salsa, one case and', 'a half. Guacamole, two.'], ['Salsa, one case and a half.', 'Guacamole, two.']],
    [['Pizza sauce, two. Two bags of cup and char,', 'three giant pretzels.'], ['Pizza sauce, two.', 'Two bags of cup and char,', 'three giant pretzels.']],
    [['Pizza sauce, two. Two bags of cup and char.'], ['Pizza sauce, two.', 'Two bags of cup and char.']],
  ]) assert.deepEqual(foodRequests(pieces), requests, pieces.join(' | '));
  // Nothing before it: the "and" item is sent as said.
  assert.deepEqual(m.splitFoodTail('and one Diet Pepsi.'), {head:'',tail:'and one Diet Pepsi.'});
});

// Finding 6: count-first with a comma ("Two cases, sausage.") kept the count
// on the item before it. The count now leads the name after it, as liquor's
// leadsNextName does: at the start, or after an item that has its number.
check('food carry: count-first with a comma keeps the count with the name after it', () => {
  for (const [pieces, requests] of [
    [['One case, sausage. Two cases,', 'pizza dough. Half a case, pepperoni.'], ['One case, sausage.', 'Two cases, pizza dough.', 'Half a case, pepperoni.']],
    [['Bacon bits, one case. Two cases,', 'mozzarella.'], ['Bacon bits, one case.', 'Two cases, mozzarella.']],
    [['Pepperoni, two.', 'Two cases, mozzarella. Oreos, one case.'], ['Pepperoni, two. Two cases, mozzarella.', 'Oreos, one case.']],
    [['Sausage, two. Two cases,', 'pizza sauce.'], ['Sausage, two.', 'Two cases, pizza sauce.']],
    [['Point seven Spanish rice. Two cases,', 'salsa.'], ['Point seven Spanish rice.', 'Two cases, salsa.']],
    [['One case, pepperoni. Two cases, sausage. Three,', 'bacon bits.'], ['One case, pepperoni. Two cases, sausage.', 'Three, bacon bits.']],
    [['Jalapenos, one case.', 'Two, Diet Pepsi. One, Pepsi.'], ['Jalapenos, one case. Two, Diet Pepsi.', 'One, Pepsi.']],
    [['Two cans, jalapenos. Three bottles,', 'ranch.'], ['Two cans, jalapenos.', 'Three bottles, ranch.']],
    [['One case, pepperoni. Two cases, sausage.'], ['One case, pepperoni.', 'Two cases, sausage.']],
    [['One case, pepperoni. Two cases, sausage. Three bags, bacon bits.'], ['One case, pepperoni. Two cases, sausage.', 'Three bags, bacon bits.']],
    [['One case, pepperoni. Two cases, sausage.', 'Three bags, bacon bits.'], ['One case, pepperoni.', 'Two cases, sausage.', 'Three bags, bacon bits.']],
    [['Seventeen cans, pizza sauce. Ten bags,', 'bacon bits.'], ['Seventeen cans, pizza sauce.', 'Ten bags, bacon bits.']],
    // Name-first lists keep every count with the name before it.
    [['Pizza dough, two cases, cauliflower crust, half a case,', 'giant pretzels, one case.'], ['Pizza dough, two cases,', 'cauliflower crust, half a case,', 'giant pretzels, one case.']],
    [['Bacon bits, one case. Pepperoni,', 'point six of a case.'], ['Bacon bits, one case.', 'Pepperoni, point six of a case.']],
    // After a name with no number, the count finishes that name (as in liquor).
    [['Pizza sauce. Two cases,', 'sausage.'], ['Pizza sauce. Two cases,', 'sausage.']],
    // "No. Half a case," after a correction leads nothing.
    [['Jalapenos, one case. No. Half a case,', 'bananas, eighteen.'], ['Jalapenos, one case. No. Half a case,', 'bananas, eighteen.']],
  ]) assert.deepEqual(foodRequests(pieces), requests, pieces.join(' | '));
});

// Finding 11: a size said inside a product name read as its count, so the
// real count moved to the next product at a cut (S19: 30 patties for 60).
check('food carry: a size inside a name is not a finished count at a cut', () => {
  for (const [pieces, requests] of [
    [['Beef patties, three and a half ounce, two cases and three sleeves. Two ounce patties, half a case. Third pound patties, one case.', 'Five ounce burger patties, zero.'],
      ['Beef patties, three and a half ounce, two cases and three sleeves. Two ounce patties, half a case.', 'Third pound patties, one case.', 'Five ounce burger patties, zero.']],
    [['Beef patties, two cases. Two ounce patties,', 'half a case. Third pound patties, one case.'], ['Beef patties, two cases.', 'Two ounce patties, half a case.', 'Third pound patties, one case.']],
    [['Sausage, one case. Two ounce patties. Half a case.', 'Lids, one case.'], ['Sausage, one case.', 'Two ounce patties. Half a case.', 'Lids, one case.']],
    [['Pizza sauce, two cases. Fourteen inch dough,', 'point five.'], ['Pizza sauce, two cases.', 'Fourteen inch dough, point five.']],
    [['Pizza sauce, two cases. 14 inch dough,', 'point five.'], ['Pizza sauce, two cases.', '14 inch dough, point five.']],
    [['Toilet paper, sixteen rolls. Thirty three gallon trash bags,', 'one box.'], ['Toilet paper, sixteen rolls.', 'Thirty three gallon trash bags, one box.']],
  ]) assert.deepEqual(foodRequests(pieces), requests, pieces.join(' | '));
  // Real weights and package sizes stay counts.
  for (const phrase of ['Pepperoni, three pounds', 'Barbacoa, twelve pounds', 'Cranberry, two five pound bags', 'Twenty four ounces of milk'])
    assert.deepEqual(m.splitFoodTail(`${phrase}. Point nine. Lids.`), {head:`${phrase}.`,tail:'Point nine. Lids.'}, phrase);
  for (const phrase of ['Two ounce patties', 'Third pound patties', 'A quarter pound burger patties'])
    assert.deepEqual(m.splitFoodTail(`${phrase}. Point nine. Lids.`), {head:`${phrase}. Point nine.`,tail:'Lids.'}, phrase);
});

// Filler that opens a take ("Alright.", "Hello?") is not a product.
check('food carry: greetings and filler are not products', () => {
  assert.deepEqual(foodRequests(['Alright. Pizza sauce, two cases.', 'Salsa, one case.']), ['Alright. Pizza sauce, two cases.', 'Salsa, one case.']);
  assert.deepEqual(m.splitFoodTail('Hello? Two cases. Pizza sauce.'), {head:'',tail:'Hello? Two cases. Pizza sauce.'});
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

check('bare size: a lone number equal to a size of the brand may be the size', () => {
  const ketel = [{name:'Ketel One',sizeMl:1000},{name:'Ketel One 750ml',sizeMl:750}];
  for (const words of ['0.75', '750', '750.', ' 0.75 ']) assert.ok(m.possibleBareSize(words, ketel), words);
  assert.ok(m.possibleBareSize('1.75', [{name:'Crown Royal',sizeMl:1000}], [{name:'Crown Royal Regal Apple',sizeMl:1750}]), 'same brand in the catalog');
  for (const words of ['point seven five', '0.75 bottles', '.75', '1', '2', '', undefined]) assert.equal(m.possibleBareSize(words, ketel), false, String(words));
  assert.equal(m.possibleBareSize('0.75', [{name:"Tito's Handmade Vodka",sizeMl:1000}], [{name:'Ketel One 750ml',sizeMl:750}]), false, 'another brand');
});

check('repeated sources: a held copy of another row of the same bottle is flagged once', () => {
  const row = (id, spoken, held, reason) => ({spoken, cases:0, units:1, qty:1, unitsPerCase:12, needsCaseSize:false, suspectPreMultiplied:false,
    quantityNeedsReview:held, ...(reason ? {quantityReviewReason:reason} : {}), match:{id, name:id, sizeMl:750, unitsPerCase:12}, candidates:[]});
  assert.deepEqual(m.repeatedSources([row('cm','Captain Morgan',true), row('t',"Tito's, three",false), row('cm','Captain Morgan, one case and two bottles',false)]), [true,false,false]);
  assert.deepEqual(m.repeatedSources([row('cm','Captain Morgan',true), row('cm','Captain Morgan. One case, Morgan.',false)]), [true,false], 'punctuation is not a word');
  assert.deepEqual(m.repeatedSources([row('t',"Tito's 0.75",true), row('t',"Tito's 0.7",false)]), [false,false], 'a decimal stays one word');
  assert.deepEqual(m.repeatedSources([row('t',"Tito's, about point three",true), row('j','Jameson',false), row('t',"Tito's, about point three",true)]), [false,false,true]);
  assert.deepEqual(m.repeatedSources([row('t',"Tito's, two",true), row('t',"Tito's, three",false), row('j',"Tito's",true)]), [false,false,false], 'other numbers and other bottles are not copies');
  assert.deepEqual(m.repeatedSources([row('t',"Tito's",true,'source_already_used'), row('t',"Tito's, two",false)]), [false,false], 'the API reason already blocks it');
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
