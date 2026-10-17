// Pure rules behind pause cuts and the voice review: pauseDetector.ts,
// voiceCarry.ts and voiceReview.ts, and the count's edit-log queue
// (lineEvents.ts, TPRS 0226). No DOM, no network.
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
    export * from './src/components/liquor/voiceSwitches';
    export * from './src/components/liquor/lineEvents';
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

// Seam join (2026-10-16 count review, Alcohol Pricing incidents/2026-10-16/
// liquor-count-review/piece-split-number). A cut between a bottle and its
// number: "…Belvedere." | "Two Tito's twenty" saved Belvedere 1 for 2.
const liquorCarry = (pieces, join = m.joinSeam) => {
  const sent = [];
  // null stands for ?seamjoin=0, where CountLiquor passes undefined (the default join).
  const carry = m.createCarry((text, index) => sent.push([index, text]), m.splitUnfinished, join ?? undefined);
  pieces.forEach((piece, i) => carry.add(piece, i));
  assert.equal(carry.flush(99), false);
  return sent;
};
// What the carry holds from `piece`, joined to `next`.
const seam = (piece, next) => m.joinSeam(m.splitUnfinished(piece).tail, next);
const plain = (piece, next) => `${m.splitUnfinished(piece).tail} ${next}`.trim();

check('seam join: 10/16 take 26f73d9c sends Belvedere with its two, and Tito\'s with its twenty', () => {
  const pieces = ["Captain Morgan, one case. Mioneto Prosecco Brut, two cases. Risata Moscato D'Asti, one case. Ketel One, three. Ketel One Citron, three. Belvedere.",
    "Two Tito's twenty"];
  assert.deepEqual(liquorCarry(pieces), [
    [0, "Captain Morgan, one case. Mioneto Prosecco Brut, two cases. Risata Moscato D'Asti, one case. Ketel One, three. Ketel One Citron, three."],
    [1, 'Belvedere, Two.'],
    [99, "Tito's twenty"],
  ]);
  // The off-switch (?seamjoin=0) and createCarry's default are today's join.
  assert.deepEqual(liquorCarry(pieces, null).slice(1), [[99, "Belvedere. Two Tito's twenty"]]);
  const sent = [];const carry = m.createCarry(text => sent.push(text));
  pieces.forEach((piece, i) => carry.add(piece, i));carry.flush(99);
  assert.equal(sent.at(-1), "Belvedere. Two Tito's twenty");
});

check('seam join: 10/5 take 0d253cec piece 1 gives Elijah Craig its one', () => {
  const sent = liquorCarry([
    'Bulleit bourbon. Looks like a bigger bottle. One. Horse soldier, point two. WhistlePig, one bottle. Jefferson, point six five. Elijah Craig,',
    "One Woodford Reserve, point three. Michter's bourbon, six. Basil Hayden, one bottle. Longbranch, one bottle. Knob Creek, point",
    "Eight. Maker's Mark, seven. Crown Royal BlackBerry, one point one. Regular Crown Royal, point eight. Crown Royal, one point one.",
  ]);
  assert.deepEqual(sent.map(([index]) => index), [0, 1, 2]);
  assert.equal(sent[1][1], "Elijah Craig, One. Woodford Reserve, point three. Michter's bourbon, six. Basil Hayden, one bottle. Longbranch, one bottle.");
  // "Knob Creek, point" | "Eight." is a held "point": unchanged.
  assert.ok(sent[2][1].startsWith('Knob Creek, point Eight. Maker\'s Mark, seven.'));
});

check('seam join: the 10/2 field seams', () => {
  assert.deepEqual(liquorCarry(['Ketel One Vodka, three. Ketel One Citron, three. Belvedere,', "Two Tito's 14"]),
    [[0, 'Ketel One Vodka, three. Ketel One Citron, three.'], [1, 'Belvedere, Two.'], [99, "Tito's 14"]]);
  assert.deepEqual(liquorCarry(['Horse Soldier, point one. Drambu', "One Dewar's twelve one"]),
    [[0, 'Horse Soldier, point one.'], [1, 'Drambu, One.'], [99, "Dewar's twelve one"]]);
});

check('seam join: a count with a unit word after it is a count-first item, joined as today', () => {
  for (const [piece, next] of [
    ['Belvedere.', "Two cases Tito's twenty"],
    ['Captain Morgan.', 'One case Mioneto Prosecco Brut, two cases.'],
    ['Belvedere.', "One case and six Tito's twenty"],
    ['Belvedere.', "Two bottles of Tito's, twenty"],
    ['Belvedere.', "Two cs Tito's twenty"],
    ['Belvedere.', "Two cans Tito's twenty"],
    ['Belvedere.', "One a Tito's twenty"],
  ]) assert.equal(seam(piece, next), plain(piece, next), `${piece} | ${next}`);
});

// Review round 2: real field speech, re-cut at the comma after a bare bottle
// (incidents/2026-10-16/.../w2-branch/virtual-cuts.mjs). Each must join as today.
const joinedAsToday = (cases) => {
  for (const [piece, next] of cases) {
    assert.equal(seam(piece, next), plain(piece, next), `${piece} | ${next}`);
    assert.deepEqual(liquorCarry([piece, next]), liquorCarry([piece, next], null), `${piece} | ${next}`);
  }
};

check('seam join: a size or a name-number after the count is the bottle\'s, joined as today', () => joinedAsToday([
  ['Ketel One Citron, three. Tanqueray,', "one liter, two. Tanqueray number ten, two. Hendrick's, four."], // 10/16 fea84d3f
  ['Antica formula, one. Carpano dry,', 'three seventy five, two. Lillet, One.'], // 10/16 2c31ff79
  ['Clase Azul, tequila Reposado. One. Don Julio,', 'nineteen forty two, point nine. Kahlua, point nine.'], // 10/16 f02f7012
  ['Carpano dry,', 'one thousand, two. Antica formula one thousand. One.'], // 10/12 2645c4b8
  ["Tito's, point nine. Tanqueray,", 'one thousand point seven. Jose Cuervo Tradicional, point three.'], // 10/12 d04c3250
  ['Worthy Park,', 'one zero nine, one bottle. Diplomatico, one bottle.'], // 10/5 651fb24b
  ['Antica formula,', '1 thousand, 1. Contraire one. Campari'], // 10/2 field clip
  ['Belvedere.', 'One oh nine, two'],
  ['Belvedere.', 'One oh nine Worthy Park, two.'],
  ['Belvedere.', 'nineteen forty two Don Julio, one.'],
  ['Belvedere.', '1942 Don Julio, one.'],
  ['Belvedere.', "One fifth Tito's, twenty."],
  ['Belvedere.', "twenty two, point five. Tito's, twenty."], // a comma cut the count
]));

check('seam join: a hedge, a correction or a list word keeps the plain join', () => joinedAsToday([
  ["Mioneto Prosecco Brut, two cases. Maschato d'Asti.", 'Seventeen or sixteen and a half. Bottles.'], // 10/5 2932241b
  ['Five bottles. Puree white peach.', 'Three or four. A strawberry, two.'], // 10/12 2ccad443
  ['Ketel One, three. Belvedere.', "Two no three. Tito's, twenty."],
  ['Ketel One, three. Belvedere.', "Two plus point five. Tito's, twenty."],
  ['Belvedere.', "Two actually Tito's twenty."],
  ['Belvedere.', 'Two um or three.'],
  ['Belvedere.', 'Two um three.'],
  ['Belvedere.', "Two Tito's and three Ketel One."],
]));

check('seam join: a unit word or a count-first list after a bare bottle keeps the plain join', () => joinedAsToday([
  ['Pineapple juice,', 'three clay cases plus eight cans.'], // 10/12 3cb6205d
  ["That's my guess. Carpano dry,", 'two little bottles, probably three seventy fives, and then two of the'], // 10/5 d4c71dda
  ['two cases of Jose Tradicional, case of Bulleit Bourbon,', 'two Oban fourteens, one Basil Hayden, two Jeffersons, one Elijah Craig, one Knob Creek.'], // 10/5 d7cfeedc
  ['Belvedere.', 'two Oban fourteens, one Basil Hayden, two Jeffersons, one Elijah Craig, one Knob Creek.'],
  ['two cases of Jose Tradicional, case of Bulleit Bourbon,', 'two Oban fourteen, one Basil Hayden.'], // the held "case" alone
  ['Pineapple juice,', 'three clay cases, eight cans.'], // the unit word in the name alone
  ['Belvedere.', 'Point four Malibu, Bacardi Superior, point nine. Contreau, point one.'], // 10/5 dc90a192 speech
  ['Belvedere.', 'One point one Patron, point three Patron Silver, point four Patron Reposado.'], // 10/5 9c4f2329 speech
]));

check('seam join: a re-cut before "point" still gives the bottle its own count', () => {
  // 10/12 d04c3250 and 10/16 9587e62c, cut one comma early: saved 0.600 and 0.700.
  assert.equal(seam("Tito's, point nine. Bulleit Bourbon,", 'point Six Bacardi one liter one'),
    'Bulleit Bourbon, point Six. Bacardi one liter one');
  assert.equal(seam("Jagermeister, point two. Jack Daniel's, Tennessee,", 'point Seven fireball one'),
    "Jack Daniel's, Tennessee, point Seven. fireball one");
  // A tens and a unit is a bottle count.
  assert.equal(seam('Belvedere.', "Twenty one Tito's, twenty."), "Belvedere, Twenty one. Tito's, twenty.");
});

check('seam join: joins that must not change', () => {
  for (const [piece, next] of [
    ['Lillet,', 'One. Carpano dry one thousand. Two.'],
    ['Clase Azul, tequila Reposado.', 'One. Don Julio, nineteen forty two, point nine.'],
    ['Hennessy VSOP, point', 'Five'],
    ["Jack Daniel's, Tennessee, point", 'Seven fireball one'],
    ['Frangelico.', 'Three'],
    ['Frangelico.', 'Three.'],
    ['Belvedere.', "Two. Tito's twenty."],
    ["Owen's Ginger Beer.", 'Seventeen bottles Fever Tree tonic water. Ten cans, Herradura Agave syrup. Two'],
    ['Point seven Casamigos Blanco.', 'One bottle of Casamigos Reposado, point eight Herrando One bottle Herrando Silver,'],
    ["Tito's.", 'Two bottles Don Julio Anejo.'],
    // Count-first with no unit word (10/9 0c17b798's shape): no count after the name.
    ['Belvedere.', 'Two Don Julio Anejo. One point five Don Julio Reposado.'],
    ['Jagermeister, point', 'Two baileys point seven'],
    ['Crown Blackberry, one point', 'One Crown Royal one Crown Apple point two'],
    ['Fireball, eight. Mitch', "Small batch five Michter's rye two"],
    ['Belvedere.', "Two, Tito's twenty"],
    ['Belvedere.', ''],
  ]) {
    assert.equal(seam(piece, next), plain(piece, next), `${piece} | ${next}`);
    assert.deepEqual(liquorCarry([piece, next]), liquorCarry([piece, next], null), `${piece} | ${next}`);
  }
});

check('seam join: filler and the same brand said again are joined as today', () => {
  for (const [piece, next] of [
    ['Alright.', "Two Tito's twenty"],
    ['Um, okay.', "Two Tito's twenty"],
    ["Tito's, 1.3. Bullet Bourbon,", 'One bullet bourbon point one'],
    ['Um, Bullet Bourbon,', 'One bullet bourbon point one'],
    ["Tito's.", "Two Titos twenty"],
  ]) assert.equal(seam(piece, next), plain(piece, next), `${piece} | ${next}`);
  // A leading "Um," still lets a real bottle take its number.
  assert.equal(seam('Um, Belvedere.', "Two Tito's twenty"), "Um, Belvedere, Two. Tito's twenty");
});

check('seam join: documented gap and accepted risk', () => {
  // A held name with a number word in it keeps today's join (hasNumber).
  assert.equal(seam('Ketel One.', "Three Tito's twenty"), "Ketel One. Three Tito's twenty");
  assert.equal(seam("Dewar's twelve.", "Two Tito's twenty"), "Dewar's twelve. Two Tito's twenty");
  // Accepted risk, zero real takes: a count-first name-number product after a bare bottle.
  assert.equal(seam('Kahlua.', "Three Dewar's twelve."), "Kahlua, Three. Dewar's twelve.");
  // The same for a name that starts with one number (the transcripts write "Siete").
  assert.equal(seam('Belvedere.', '7 Leguas, two.'), 'Belvedere, 7. Leguas, two.');
  // 10/9 e75d0ef6 (Jon's test): the same seam with a comma.
  assert.equal(seam('Aviation, three. Kahlua,', 'Three baileys two frangelico two'), 'Kahlua, Three. baileys two frangelico two');
});

check('seam join: the food carry keeps the plain join', () => {
  // CountFood passes no join, so a seam joinSeam would rewrite reaches the
  // food split exactly as before.
  for (const split of [m.splitFoodTail, m.createFoodCarrySplitter([{name: "Tito's"}, {name: 'Belvedere'}])]) {
    const sent = [];const carry = m.createCarry(text => sent.push(text), split);
    carry.add('Bacon bits, one case. Belvedere.', 0);carry.add("Two Tito's twenty", 1);carry.flush(99);
    const expected = [];
    let held = '';
    for (const piece of ['Bacon bits, one case. Belvedere.', "Two Tito's twenty"]) {
      const {head, tail} = split(`${held} ${piece}`.trim());
      if (head) expected.push(head);
      held = tail;
    }
    if (held) expected.push(held);
    assert.deepEqual(sent, expected);
    assert.ok(!sent.some(text => text.includes('Belvedere, Two')), sent.join(' | '));
  }
});

check('seam join: ?seamjoin=0 turns it off for this phone, ?seamjoin=1 back on', () => {
  const store = new Map();
  const localStorage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)};
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    const at = (search) => { globalThis.window = {location: {search}, localStorage}; return m.seamJoinEnabled(); };
    assert.equal(at(''), true, 'on by default');
    assert.equal(at('?seamjoin=0'), false);
    assert.equal(store.get('lq.seamJoin'), '0');
    assert.equal(at(''), false, 'remembered on this phone');
    assert.equal(m.pauseCutsEnabled(), true, 'pause cuts are a separate switch');
    assert.equal(at('?seamjoin=1'), true);
    assert.equal(store.has('lq.seamJoin'), false);
    globalThis.window = {location: {search: '?seamjoin=0'}, get localStorage() { throw new Error('blocked'); }};
    assert.equal(m.seamJoinEnabled(), true, 'storage blocked: the default');
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had); else delete globalThis.window;
  }
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

// 2026-10-09 client review (followups/review-client, P2): the count-first lead
// took a case-and-loose remainder off a name-first item and sent the item
// short and ready ("Ketchup, one case." saved 16 for 18), and pushed it onto a
// next product that had its own number. A name with its own number was said
// name-first, so the count before it stays with the item before (held, as on
// live). At a cut the item waits until the next name is in view. A counter
// already counting count-first still leads, remainder and all.
check('food carry: a case-and-loose remainder stays with its name-first item', () => {
  for (const [pieces, requests] of [
    // K1 (6dfb506f's shape without "plus"), R1/R2 (6877a17f's shape).
    [['Ketchup, one case. Two bottles,', 'Yellow mustard, three bottles.'], ['Ketchup, one case. Two bottles,', 'Yellow mustard, three bottles.']],
    [['Ketchup, one case. Two bottles, yellow mustard,', 'three bottles.'], ['Ketchup, one case. Two bottles,', 'yellow mustard, three bottles.']],
    [['Ketchup, one case. Two bottles, Yellow mustard, three bottles.'], ['Ketchup, one case. Two bottles,', 'Yellow mustard, three bottles.']],
    [['Pizza sauce, three cases. Two cans, jalapenos, four cans.'], ['Pizza sauce, three cases. Two cans,', 'jalapenos, four cans.']],
    [['Pizza sauce, three cases. Two cans,', 'jalapenos, four cans. Salsa, one case.'], ['Pizza sauce, three cases. Two cans, jalapenos, four cans.', 'Salsa, one case.']],
    // 6e88b59d with a period after "ounces", cut after "five," or after the
    // patties' name: "Two cases" never leads the 2 oz patties (192 for 5).
    [['Two cheesecakes, beef patties, three and a half ounces. Two cases, two ounce patties, five,', 'Cranberry, two five pound bags.'],
      ['Two cheesecakes, beef patties, three and a half ounces. Two cases,', 'two ounce patties, five,', 'Cranberry, two five pound bags.']],
    [['Two cheesecakes, beef patties, three and a half ounces. Two cases, two ounce patties,', 'five, Cranberry, two five pound bags.'],
      ['Two cheesecakes,', 'beef patties, three and a half ounces. Two cases, two ounce patties, five,', 'Cranberry, two five pound bags.']],
    // Count-first counters keep the lead, remainder and all.
    [['One case, pepperoni. Two cases, sausage, one bag.'], ['One case, pepperoni.', 'Two cases, sausage, one bag.']],
    [['One case, pepperoni. Two cases,', 'sausage, one bag.'], ['One case, pepperoni.', 'Two cases, sausage, one bag.']],
    // A next name with no number of its own still takes the count.
    [['Ketchup, one case. Two bottles,', 'yellow mustard.'], ['Ketchup, one case.', 'Two bottles, yellow mustard.']],
  ]) assert.deepEqual(foodRequests(pieces), requests, pieces.join(' | '));
});

// Same review, P3: the "and" join pulled a whole chain of items into the held
// tail, and past the 16-word limit the chain went out at once with an
// unfinished last item ("…and four bags of cheese" | "curds."). Then the "and"
// item waits on its own, as before the join.
check('food carry: an "and" chain past the held limit keeps its unfinished last item whole', () => {
  for (const [pieces, requests] of [
    [['We have three cases of French fries and one case of tater tots, and four bags of cheese', "curds. We're out of the cod."],
      ['We have three cases of French fries and one case of tater tots,', 'and four bags of cheese curds.', "We're out of the cod."]],
    [['Sausage, one case, and bacon bits, two cases, and pepperoni, three bags, and the shredded mozzarella cheese,', 'four bags. Ranch, two.'],
      ['Sausage, one case, and bacon bits, two cases, and pepperoni, three bags,', 'and the shredded mozzarella cheese, four bags.', 'Ranch, two.']],
    // Under the limit the join stands.
    [['Fry seasoning, one container,', 'and one Diet Pepsi.'], ['Fry seasoning, one container, and one Diet Pepsi.']],
  ]) assert.deepEqual(foodRequests(pieces), requests, pieces.join(' | '));
});

// Same review's strand sweep (S16 with ASR dropping the period after "four
// bags"): a bare cue sent at the end of a request ("French fries, three bags.
// No wait,") is read with nothing after it, and the first count proves.
check('food carry: a bare correction cue stays with the phrase that holds its new count', () => {
  for (const [pieces, requests] of [
    [['French fries, three bags. No wait, four bags chicken tenders, one case,', 'Wings, five bags.'],
      ['French fries, three bags. No wait, four bags chicken tenders, one case,', 'Wings, five bags.']],
    [['Sausage, one case. Sorry, bacon bits, one case.', 'Ranch, two.'], ['Sausage, one case. Sorry, bacon bits, one case.', 'Ranch, two.']],
    [['Sausage, one case. No wait,', 'two cases. Bacon bits, one case.'], ['Sausage, one case. No wait, two cases.', 'Bacon bits, one case.']],
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

const voiceRules = passed;

// ── The count's edit log (lineEvents.ts, TPRS 0226). Not voice rules: the
// queue that carries every quantity change to the next PUT /lines.
let clock = Date.UTC(2026, 9, 16, 18, 0, 0), ids = 0;
const queue = () => m.createLineEventQueue({
  now: () => new Date(clock += 1000),
  newId: () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
});
const grid = (afterQty, extra = {}) => ({zoneId:'z1', skuId:'makers', kind:'grid_set', afterQty, afterCases:null, caseSize:null, ...extra});

check('edit log: grid keystrokes 0, 0. and 0.8 merge into one event; the first before stays', () => {
  const q = queue();
  const a = q.pushGrid(grid(0, {beforeQty:0.7}));
  q.pushGrid(grid(0, {beforeQty:0}));
  const c = q.pushGrid(grid(0.8, {beforeQty:0}));
  assert.equal(q.pending().length, 1);
  assert.equal(c.id, a.id, 'one id for the whole edit');
  assert.deepEqual([c.beforeQty, c.afterQty], [0.7, 0.8]);
  assert.ok(Date.parse(c.clientAt) > Date.parse(a.clientAt), 'the time follows the last keystroke');
  // Another kind, another cell or a findingKind keeps its own event.
  q.pushGrid({...grid(1), kind:'grid_cases', beforeQty:0.8});
  q.pushGrid({...grid(3), skuId:'titos', beforeQty:2});
  q.pushGrid({...grid(4), kind:'presubmit_edit', findingKind:'big_gain', beforeQty:3});
  q.pushGrid({...grid(5), kind:'presubmit_edit', findingKind:'zone_missed', beforeQty:4});
  assert.equal(q.pending().length, 5);
});

check('edit log: a keystroke never merges past a later event of the same cell', () => {
  const q = queue();
  q.pushGrid(grid(1, {beforeQty:0}));
  q.push({zoneId:'z1', skuId:'makers', kind:'voice_apply', beforeQty:1, afterQty:3});
  q.pushGrid(grid(2, {beforeQty:3}));
  assert.deepEqual(q.pending().map((e) => [e.kind, e.beforeQty, e.afterQty]), [['grid_set', 0, 1], ['voice_apply', 1, 3], ['grid_set', 3, 2]]);
  // Another cell in between does not split this cell's typing.
  q.pushGrid({...grid(9), skuId:'titos', beforeQty:8});
  q.pushGrid(grid(2.5, {beforeQty:2}));
  assert.deepEqual(q.pending().map((e) => [e.skuId, e.afterQty]), [['makers', 1], ['makers', 3], ['makers', 2.5], ['titos', 9]]);
});

check('edit log: take, ack and release keep order and ids across a failed or refused save', () => {
  const q = queue();
  const first = [q.push(grid(1)), q.push(grid(2, {skuId:'titos'}))];
  const batch = q.take();
  assert.deepEqual(batch.map((e) => e.id), first.map((e) => e.id));
  assert.deepEqual(q.take(), [], 'nothing else waits while the batch is out');
  const later = q.push(grid(3, {skuId:'citron'}));
  q.release(batch.map((e) => e.id)); // 409 or network error
  const retry = q.take();
  assert.deepEqual(retry.map((e) => e.id), [...first, later].map((e) => e.id), 'same ids, still first');
  q.ack(retry.map((e) => e.id));
  assert.equal(q.pending().length, 0);
  // release() with no ids returns every in-flight event; ack of unknown ids is harmless.
  q.push(grid(4));
  q.take();
  q.release();
  q.ack(['ffffffff-0000-4000-8000-000000000000']);
  assert.equal(q.take().length, 1);
  q.clear();
  assert.equal(q.pending().length, 0);
});

check('edit log: an event sent once is never merged into, even after a release', () => {
  const q = queue();
  const a = q.pushGrid(grid(1, {beforeQty:0}));
  const out = q.take();
  const b = q.pushGrid(grid(2, {beforeQty:1}));
  assert.notEqual(b.id, a.id, 'in flight: a new event');
  q.release(out.map((e) => e.id));
  const c = q.pushGrid(grid(3, {beforeQty:2}));
  assert.equal(c.id, b.id, 'the unsent one still absorbs keystrokes');
  assert.deepEqual(q.pending().map((e) => [e.id, e.afterQty]), [[a.id, 1], [b.id, 3]], 'the sent one kept its value');
});

check('edit log: a save carries at most 500 events (and about 400 KB); the rest wait their turn', () => {
  const q = queue();
  for (let i = 0; i < 501; i++) q.push(grid(i));
  assert.equal(q.take().length, 500);
  assert.equal(q.take().length, 1);
  const big = queue();
  for (let i = 0; i < 3; i++) big.push(grid(i, {spoken:'x'.repeat(300)}));
  const size = JSON.stringify(big.pending()[0]).length + 1;
  assert.equal(big.take(500, 2 * size + 5).length, 2, 'a character budget splits the batch');
  assert.equal(big.take(500, 10).length, 1, 'one event always goes');
  assert.ok(m.MAX_EVENTS_PER_SAVE === 500 && m.MAX_EVENT_CHARS_PER_SAVE <= 500_000, 'well under the 1 MiB body limit');
});

check('edit log: fields stay inside the server\'s bounds, so the server never drops an event', () => {
  const e = m.cleanLineEvent({id:'00000000-0000-4000-8000-000000000001', zoneId:'z', skuId:'s', kind:'voice_apply',
    beforeQty:-1, afterQty:2e9, heardQty:Number.NaN, heardUnits:2.5, caseSize:12.5, itemIndex:3,
    spoken:'a\u0000b' + 'c'.repeat(400), quantityWords:'w'.repeat(250), findingKind:'k'.repeat(40),
    takeId:'not-a-uuid', extractionId:'5A1E0000-0000-4000-8000-000000000001', clientAt:'2019-12-31T23:59:59.000Z'});
  assert.deepEqual([e.beforeQty, e.afterQty, e.heardQty, e.heardUnits, e.caseSize, e.itemIndex], [null, null, null, 2.5, null, 3]);
  assert.equal(e.spoken.length, 300);
  assert.ok(e.spoken.startsWith('abc'), 'NUL removed');
  assert.deepEqual([e.quantityWords.length, e.findingKind.length], [200, 32]);
  assert.deepEqual([e.takeId, e.extractionId], [null, '5A1E0000-0000-4000-8000-000000000001']);
  assert.equal('clientAt' in e, false, 'a broken clock sends no time');
  assert.equal(m.cleanLineEvent({id:'i', zoneId:'z', skuId:'s', kind:'clear', spoken:'a' + '😀'.repeat(200)}).spoken.length, 299, 'no half emoji');
  assert.match(m.newEventId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

check('edit log: the worst label wins, and only a person\'s edit is a person\'s', () => {
  assert.equal(m.worstHeard(['proved', 'unclear', 'implicit_one']), 'unclear');
  assert.equal(m.worstHeard(['unclear', 'guessed']), 'guessed');
  assert.equal(m.worstHeard(['proved', undefined, 'implicit_one']), 'implicit_one');
  assert.equal(m.worstHeard([]), undefined);
  assert.deepEqual(['as_heard', 'case_size', undefined, null].map(m.personEdited), [false, false, false, false]);
  assert.deepEqual(['typed', 'bottles', 'keep_high', 'name_number', 'suspect_pick', 'restored'].map(m.personEdited), [true, true, true, true, true, true]);
});

check('edit log: a merged repeat keeps both server rows, in order', () => {
  const row = (units, spoken, ref, cases = 0) => ({spoken, cases, units, qty: units + cases * 12, unitsPerCase: 12, needsCaseSize: false,
    suspectPreMultiplied: false, match: {id: 'gg', name: 'gg', sizeMl: 750, unitsPerCase: 12}, candidates: [],
    ...(ref ? {sourceRef: {extractionId: ref, itemIndex: 0}} : {})});
  const merged = m.mergeAdjacentRepeats([row(0.9, 'Grey Goose, point nine', 'e1'), row(1, 'Grey Goose, one', 'e2')]);
  assert.deepEqual(merged[0].sourceRefs, [{extractionId: 'e1', itemIndex: 0}, {extractionId: 'e2', itemIndex: 0}]);
  assert.equal('sourceRef' in merged[0], false);
  const added = m.mergeAdjacentRepeats([row(0, "Tito's, one case", 'e1', 1), row(2, "Tito's, two", 'e2')]);
  assert.deepEqual(m.sourceRefsOf(added[0]).map((r) => r.extractionId), ['e1', 'e2']);
  assert.deepEqual(m.sourceRefsOf(m.mergeAdjacentRepeats([row(1, 'a', null), row(2, 'b', null)])[0]), [], 'an older server: no refs');
  assert.deepEqual(m.sourceRefsOf(row(1, 'a', 'e3')), [{extractionId: 'e3', itemIndex: 0}]);
});

const queueChecks = passed - voiceRules;

// ── The Amaretto fixes (2026-10-16 count review, Jon's fix 3; voiceReview.ts).
// A removed row's spoken number is offered back on a bare re-say of the same
// bottle on the same shelf. Offers only: none of these returns a number to
// apply, a hold or a case question.
const reviewRow = (skuId, extra = {}) => ({chosenSkuId: skuId, spoken: 'Luxardo Amaretto di Serradura, two cases', quantityWords: 'two cases',
  cases: 2, units: 0, unitsPerCase: null, ...extra});
const aside = (...entries) => new Map(entries.map((e) => [m.setAsideKey(e.zoneId, e.skuId), e]));

check('set aside: only a matched row with spoken number words and a number above zero is remembered', () => {
  assert.deepEqual(m.setAsideEntry(reviewRow('amaretto'), 'backstock'),
    {zoneId: 'backstock', skuId: 'amaretto', cases: 2, units: 0, unitsPerCase: null, quantityWords: 'two cases', spoken: 'Luxardo Amaretto di Serradura, two cases'});
  assert.equal(m.setAsideEntry(reviewRow('amaretto', {quantityWords: undefined, cases: 0, units: 1, spoken: 'Luxardo Di Serradura'}), 'backstock'), null, 'a bare name has no number to remember');
  assert.equal(m.setAsideEntry(reviewRow('amaretto', {quantityWords: '   '}), 'backstock'), null, 'blank words are no words');
  assert.equal(m.setAsideEntry(reviewRow(null), 'backstock'), null, 'no bottle, nothing to offer it to');
  assert.equal(m.setAsideEntry(reviewRow('amaretto', {cases: 0, units: 0}), 'backstock'), null, 'a held zero');
  assert.equal(m.setAsideEntry(reviewRow('ketel', {quantityWords: '0.75', cases: 0, units: 0.75, keepBlank: true}), 'backstock'), null, 'a possible bottle size is never offered back');
  assert.equal(m.setAsideEntry(reviewRow('titos', {quantityWords: 'two', cases: 0, units: 2, quantityReviewReason: 'source_already_used'}), 'backstock'), null, 'another row\'s number is never offered back');
  assert.equal(m.setAsideEntry(reviewRow('amaretto', {quantityWords: ' two cases '}), 'backstock').quantityWords, 'two cases');
});

check('restore offer: only a bare re-say (implicit_one or guessed) of the same bottle on the same shelf', () => {
  const memory = aside(m.setAsideEntry(reviewRow('amaretto'), 'backstock'));
  const bare = (heard, skuId = 'amaretto') => ({chosenSkuId: skuId, quantityHeard: heard});
  assert.ok(m.restoreOffer(bare('guessed'), 'backstock', memory));
  assert.ok(m.restoreOffer(bare('implicit_one'), 'backstock', memory));
  assert.equal(m.restoreOffer(bare('guessed'), 'giant', memory), null, 'another shelf');
  assert.equal(m.restoreOffer(bare('guessed', 'maraschino'), 'backstock', memory), null, 'another bottle');
  assert.equal(m.restoreOffer({chosenSkuId: null, quantityHeard: 'guessed'}, 'backstock', memory), null, 'no bottle yet');
  assert.equal(m.restoreOffer(bare(undefined), 'backstock', memory), null, 'an older server sends no label: no offer');
  assert.equal(m.restoreOffer(bare('guessed'), 'backstock', new Map()), null, 'nothing remembered');
});

check('restore offer: a re-say that speaks a number gets no offer', () => {
  const memory = aside(m.setAsideEntry(reviewRow('amaretto'), 'backstock'));
  assert.equal(m.restoreOffer({chosenSkuId: 'amaretto', quantityHeard: 'proved'}, 'backstock', memory), null);
  assert.equal(m.restoreOffer({chosenSkuId: 'amaretto', quantityHeard: 'unclear'}, 'backstock', memory), null);
});

check('restore offer: cases with no case size offer both readings, chips only, never a case question', () => {
  const offer = m.restoreOffer({chosenSkuId: 'amaretto', quantityHeard: 'guessed'}, 'backstock', aside(m.setAsideEntry(reviewRow('amaretto'), 'backstock')));
  assert.deepEqual(offer, {hint: 'Heard "two cases" earlier.', chips: [{label: 'Use 2 bottles', cases: 0, units: 2}, {label: '2 cases', cases: 2, units: 0}]});
  assert.equal(JSON.stringify(offer).includes('needsCaseSize'), false, 'the offer never sets needsCaseSize');
  const one = m.restoreOffer({chosenSkuId: 'amaretto', quantityHeard: 'guessed'}, 'backstock',
    aside(m.setAsideEntry(reviewRow('amaretto', {quantityWords: 'one case', cases: 1}), 'backstock')));
  assert.deepEqual(one.chips.map((c) => c.label), ['Use 1 bottle', '1 case']);
  const mixed = m.restoreOffer({chosenSkuId: 'amaretto', quantityHeard: 'guessed'}, 'backstock',
    aside(m.setAsideEntry(reviewRow('amaretto', {quantityWords: 'two cases and three', units: 3}), 'backstock')));
  assert.deepEqual(mixed.chips, [{label: '2 cases + 3', cases: 2, units: 3}], 'cases and loose bottles: the cases reading only');
  const sized = m.restoreOffer({chosenSkuId: 'boylan', quantityHeard: 'implicit_one'}, 'backstock',
    aside(m.setAsideEntry(reviewRow('boylan', {quantityWords: 'two cases and three', units: 3, unitsPerCase: 24}), 'backstock')));
  assert.deepEqual(sized.chips, [{label: 'Use 51', cases: 2, units: 3}], 'a known case size: one total');
  const loose = m.restoreOffer({chosenSkuId: 'jameson', quantityHeard: 'guessed'}, 'backstock',
    aside(m.setAsideEntry(reviewRow('jameson', {quantityWords: 'point seven', cases: 0, units: 0.7, unitsPerCase: 12}), 'backstock')));
  assert.deepEqual(loose, {hint: 'Heard "point seven" earlier.', chips: [{label: 'Use 0.7', cases: 0, units: 0.7}]});
});

check('restate choices: Keep first, only when nothing was heard for the bottle this time', () => {
  assert.deepEqual(m.restateChoices({quantityHeard: 'implicit_one'}), ['keep', 'replace', 'add']);
  assert.deepEqual(m.restateChoices({quantityHeard: 'guessed'}), ['keep', 'replace', 'add']);
  assert.deepEqual(m.restateChoices({quantityHeard: 'proved'}), ['replace', 'add']);
  assert.deepEqual(m.restateChoices({quantityHeard: 'unclear'}), ['replace', 'add']);
  assert.deepEqual(m.restateChoices({}), ['replace', 'add'], 'an older server: today\'s two answers');
});

console.log(`${voiceRules} voice rule checks passed (identical to before the edit log), plus ${queueChecks} edit-log queue checks and ${passed - voiceRules - queueChecks} removed-row offer checks; no DOM, microphone or service calls.`);
