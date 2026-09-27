// Local behavior tests. These simulate AdsApp; they do not access Google Ads.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const script = fs.readFileSync(path.join(__dirname, '19_september_keyword_cleanup.js'), 'utf8');
// The fixture is the September 12 keyword export. It carries spend figures, so it lives in the
// git-ignored Context/google-ads-reviews/ (backup: twisted-pin-notes/google-ads-reviews/2026-09-12/).
const csvPath = path.join(__dirname,
  '../../Context/google-ads-reviews/2026-09-12/source-27-target-keywords.csv');
if (!fs.existsSync(csvPath)) {
  test('Script 19 behavior tests', { skip: 'private September 12 keyword export not present; '
    + 'copy twisted-pin-notes/google-ads-reviews/2026-09-12/ into Context/google-ads-reviews/ to run' }, () => {});
  return;
}
const csv = fs.readFileSync(csvPath, 'utf8');

function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
const csvRows = parseCsv(csv);
const fixture = csvRows.slice(3).map(row => Object.fromEntries(csvRows[2].map((h, i) => [h, row[i]])))
  .filter(row => row.Keyword);
assert.equal(fixture.length, 177);

function environment() {
  const env = { writes: [], attempts: 0, logs: [], preview: false, failOnWrite: null,
    rejectOnWrite: null, rejections: [],
    customerId: '577-897-4265', currency: 'USD', status: 200, adultsAnchor: true,
    campaigns: [], onFetch: null };
  let nextId = 1000;
  function write(kind, entity, change) {
    env.attempts++;
    if (env.attempts === env.failOnWrite) throw new Error('simulated API write failure');
    if (env.attempts === env.rejectOnWrite) {
      env.rejections.push({ kind, id: entity.id });
      return; // Google can report a rejected mutation only in Changes, without throwing.
    }
    env.writes.push({ kind, id: entity.id }); change();
  }
  function selector(items) {
    let filtered = items.slice();
    return {
      withCondition(condition) {
        if (condition === 'campaign.experiment_type = BASE') filtered = filtered.filter(x => !x.experiment);
        else if (['campaign.status != REMOVED', 'ad_group.status != REMOVED', 'ad_group_criterion.status != REMOVED'].includes(condition)) {
          filtered = filtered.filter(x => x.status !== 'REMOVED');
        } else if (condition === 'ad_group_ad.status = ENABLED') filtered = filtered.filter(x => x.status === 'ENABLED');
        else throw new Error('Unexpected selector condition: ' + condition);
        return this;
      },
      get() { let i = 0; return { hasNext: () => i < filtered.length, next: () => filtered[i++] }; }
    };
  }
  function negative(text, match = 'EXACT') {
    return { id: nextId++, text, match, getText() {
      return this.match === 'EXACT' ? '[' + this.text + ']' : this.match === 'PHRASE' ? '"' + this.text + '"' : this.text;
    }, getMatchType() { return this.match; } };
  }
  env.negative = negative;
  const budgets = { Search_Brand_TwistedPin_2026: 6, 'Bar-Led_TwistedPin_2026': 12,
    'General & Open Play 2026': 32, 'Events Campaign 2026 Setup': 35 };
  for (const [name, amount] of Object.entries(budgets)) {
    const budget = { id: nextId++, amount, shared: false, type: 'DAILY',
      getId() { return this.id; }, getAmount() { return this.amount; }, getType() { return this.type; },
      isExplicitlyShared() { return this.shared; }, setAmount(value) { write('budget', this, () => this.amount = value); } };
    const campaign = { id: nextId++, name, status: 'ENABLED', strategy: 'MANUAL_CPC', budget,
      groups: [], negatives: [], lists: [], geo: { Aurora: 1, Naperville: 1.1 },
      goals: ['purchase', 'generate_lead'], getId() { return this.id; }, getName() { return this.name; },
      isEnabled() { return this.status === 'ENABLED'; }, getBudget() { return this.budget; },
      getBiddingStrategyType() { return this.strategy; }, adGroups() { return selector(this.groups); },
      negativeKeywords() { return selector(this.negatives); }, negativeKeywordLists() { return selector(this.lists); } };
    env.campaigns.push(campaign);
    for (const groupName of new Set(fixture.filter(r => r.Campaign === name).map(r => r['Ad group']))) {
      const ad = { id: nextId++, status: 'ENABLED', mobile: null, copy: 'original RSA',
        getId() { return this.id; }, urls() { return { getMobileFinalUrl: () => this.mobile }; } };
      const group = { id: nextId++, name: groupName, status: /Food & Eat|Spanish Test/.test(groupName) ? 'PAUSED' : 'ENABLED',
        items: [], negatives: [], adsData: [ad], getId() { return this.id; }, getName() { return this.name; },
        isEnabled() { return this.status === 'ENABLED'; }, keywords() { return selector(this.items); },
        ads() { return selector(this.adsData); }, negativeKeywords() { return selector(this.negatives); },
        createNegativeKeyword(text) {
          assert.match(text, /^\[[^\]]+\]$/); // Every newly created exclusion must be exact.
          write('negative', this, () => this.negatives.push(negative(text.slice(1, -1))));
        } };
      campaign.groups.push(group);
      for (const row of fixture.filter(r => r.Campaign === name && r['Ad group'] === groupName)) {
        const keyword = { id: nextId++, text: row.Keyword, match: row['Match type'] === 'Exact match' ? 'EXACT' : 'PHRASE',
          status: row['Keyword status'].toUpperCase(), final: row['Final URL'] || null, mobile: null,
          bid: Number(row['Max. CPC']), suffix: 'utm_source=google', template: '{lpurl}?x=1', parameters: { test: 'retained' },
          getId() { return this.id; }, getText() { return this.text; }, getMatchType() { return this.match; },
          isEnabled() { return this.status === 'ENABLED'; }, isPaused() { return this.status === 'PAUSED'; },
          pause() { write('pause', this, () => this.status = 'PAUSED'); },
          urls() { return {
            getFinalUrl: () => this.final, getMobileFinalUrl: () => this.mobile,
            setFinalUrl: value => write('url', this, () => this.final = value),
            setMobileFinalUrl: value => write('mobile', this, () => this.mobile = value)
          }; } };
        group.items.push(keyword);
      }
    }
  }
  env.campaign = name => env.campaigns.find(c => c.name === name);
  env.bar = env.campaign('Bar-Led_TwistedPin_2026');
  env.open = env.campaign('General & Open Play 2026');
  env.events = env.campaign('Events Campaign 2026 Setup');
  env.group = (campaign, name) => campaign.groups.find(g => g.name === name);
  env.bowling = env.group(env.open, 'Bowling');
  env.birthdays = env.group(env.events, 'Birthday & Celebrations');
  env.employee = env.group(env.events, 'Employee Appreciation');
  env.occasion = env.group(env.bar, 'Occasion');
  env.keyword = (group, text) => group.items.find(k => k.text === text);
  env.snapshot = () => JSON.stringify(env.campaigns);
  env.run = ({ live = false, sections = {} } = {}) => {
    const context = vm.createContext({
      Logger: { log: value => env.logs.push(value) },
      AdsApp: {
        currentAccount: () => ({ getCustomerId: () => env.customerId, getCurrencyCode: () => env.currency, getTimeZone: () => 'America/Chicago' }),
        getExecutionInfo: () => ({ isPreview: () => env.preview }), campaigns: () => selector(env.campaigns)
      },
      UrlFetchApp: { fetch: (_url, options) => {
        assert.equal(options.followRedirects, false);
        if (env.onFetch) env.onFetch();
        return { getResponseCode: () => env.status, getContentText: () =>
          '<h1>17 traditional lanes</h1><a href="/reserve/">Reserve</a>' + (env.adultsAnchor ? '<section id="adults">Adult birthdays</section>' : '') };
      } }
    });
    vm.runInContext(script, context);
    context.DRY_RUN = !live;
    Object.assign(context.RUN, sections);
    context.main();
    return context;
  };
  return env;
}

test('default dry run and Google Preview both leave all account state untouched', () => {
  for (const preview of [false, true]) {
    const env = environment(); env.preview = preview;
    const before = env.snapshot(); env.run({ live: preview });
    assert.equal(env.snapshot(), before); assert.equal(env.writes.length, 0);
    assert.ok(env.logs.includes('PREFLIGHT PASSED | planned changes: 49'));
  }
});

test('live run changes only the specified budget, queries, statuses and destinations; rerun no-ops', () => {
  const env = environment();
  const protectedBefore = env.campaigns.flatMap(c => c.groups.flatMap(g => g.items.map(k =>
    [k.id, k.bid, k.suffix, k.template, JSON.stringify(k.parameters)])));
  env.run({ live: true });
  assert.equal(env.writes.length, 49);
  assert.deepEqual(env.campaigns.map(c => c.budget.amount), [6, 6, 32, 35]);
  assert.equal(env.bowling.items.filter(k => k.final === 'https://www.twistedpin.com/bowl/').length, 31);
  assert.equal(env.birthdays.items.filter(k => k.final.endsWith('#adults')).length, 7);
  assert.equal(env.keyword(env.birthdays, '[bowling birthday party]').final, 'https://www.twistedpin.com/birthday-parties/');
  assert.equal(env.keyword(env.employee, '[employee appreciation ideas]').status, 'PAUSED');
  assert.equal(env.keyword(env.employee, '"employee appreciation"').status, 'ENABLED');
  assert.equal(env.keyword(env.occasion, '"girls night out ideas"').status, 'PAUSED');
  assert.equal(env.keyword(env.occasion, '"bachelorette party"').status, 'ENABLED');
  assert.equal(env.employee.negatives.length, 5); assert.equal(env.occasion.negatives.length, 3);
  assert.equal(env.campaigns.flatMap(c => c.negatives).length, 0);
  assert.ok(env.campaigns.every(c => c.strategy === 'MANUAL_CPC' && c.geo.Naperville === 1.1));
  assert.ok(env.campaigns.flatMap(c => c.groups).every(g => g.adsData[0].copy === 'original RSA'));
  assert.deepEqual(env.campaigns.flatMap(c => c.groups.flatMap(g => g.items.map(k =>
    [k.id, k.bid, k.suffix, k.template, JSON.stringify(k.parameters)]))), protectedBefore);
  const after = env.snapshot(); env.run({ live: true });
  assert.equal(env.writes.length, 49); assert.equal(env.snapshot(), after);
});

test('query parameters and existing keyword mobile destinations are preserved and reroute correctly', () => {
  const env = environment(); const keyword = env.keyword(env.bowling, '[bowling near me]');
  keyword.final = 'https://www.twistedpin.com/?utm_campaign={campaignid}&keep=yes';
  keyword.mobile = 'https://www.twistedpin.com/?device=m';
  const adult = env.keyword(env.birthdays, '[50th birthday party venue]');
  adult.final += '?utm_content=adult';
  env.run({ live: true });
  assert.equal(keyword.final, 'https://www.twistedpin.com/bowl/?utm_campaign={campaignid}&keep=yes');
  assert.equal(keyword.mobile, 'https://www.twistedpin.com/bowl/?device=m');
  assert.equal(adult.final, 'https://www.twistedpin.com/birthday-parties/?utm_content=adult#adults');
  assert.equal(env.writes.length, 50);
});

test('an ad mobile URL does not block keyword routing and remains untouched', () => {
  const env = environment(); const ad = env.bowling.adsData[0];
  ad.mobile = 'https://www.twistedpin.com/';
  env.run({ live: true });
  assert.equal(env.bowling.items.filter(k => k.final === 'https://www.twistedpin.com/bowl/').length, 31);
  assert.equal(ad.mobile, 'https://www.twistedpin.com/');
  assert.equal(env.writes.length, 49);
});

const invalidCases = [
  ['wrong account', e => e.customerId = '111-222-3333', /Wrong account/],
  ['wrong currency', e => e.currency = 'CAD', /USD/],
  ['shared Bar budget', e => e.bar.budget.shared = true, /shared budget/],
  ['unexpected held budget', e => e.open.budget.amount = 40, /Held budget changed/],
  ['unexpected Bar budget', e => e.bar.budget.amount = 10, /Bar budget changed/],
  ['changed bidding', e => e.events.strategy = 'MAXIMIZE_CONVERSIONS', /Bidding strategy/],
  ['duplicate campaign', e => e.campaigns.push(e.bar), /Expected one campaign/],
  ['duplicate keyword', e => e.bowling.items.push(e.bowling.items[0]), /Expected exactly one/],
  ['missing keyword', e => e.bowling.items.pop(), /Expected exactly one/],
  ['paused ad group', e => e.birthdays.status = 'PAUSED', /no longer enabled/],
  ['unexpected URL late in plan', e => e.birthdays.items.find(k => k.text === '[50th birthday party venue]').final = 'https://other.example/', /Unexpected destination/],
  ['unexpected existing fragment', e => e.bowling.items[0].final += '#unknown', /Destination changed/],
  ['missing live adults section', e => e.adultsAnchor = false, /no #adults/],
  ['redirected or failed page', e => e.status = 301, /HTTP 200/],
  ['new intended keyword conflicts with exclusion', e => {
    const k = Object.assign({}, e.employee.items[0], { id: 99999, text: '[staff rewards]', status: 'ENABLED', match: 'EXACT' });
    e.employee.items.push(k);
  }, /Negative conflicts/]
];
for (const [name, setup, expected] of invalidCases) {
  test('preflight aborts before any write: ' + name, () => {
    const env = environment(); setup(env); const before = env.snapshot();
    assert.throws(() => env.run({ live: true }), expected);
    assert.equal(env.writes.length, 0); assert.equal(env.snapshot(), before);
  });
}

test('existing negatives at ad-group, campaign and assigned shared-list scope prevent duplicate additions', () => {
  const env = environment();
  env.employee.negatives.push(env.negative('staff rewards'));
  env.events.negatives.push(env.negative('appreciation to team members', 'PHRASE'));
  const negatives = [env.negative('teammate ideas', 'BROAD')];
  env.events.lists.push({ negativeKeywords: () => ({ get: () => {
    let i = 0; return { hasNext: () => i < negatives.length, next: () => negatives[i++] };
  } }) });
  env.run({ live: true }); assert.equal(env.writes.length, 46);
  assert.equal(env.employee.negatives.filter(n => n.text === 'staff rewards').length, 1);
});

test('paused landing keywords stay untouched and a previously lower Bar budget is never increased', () => {
  const env = environment(); env.bar.budget.amount = 5;
  const keyword = env.bowling.items[0]; keyword.status = 'PAUSED';
  env.run({ live: true });
  assert.equal(keyword.final, 'https://www.twistedpin.com/');
  assert.equal(keyword.status, 'PAUSED'); assert.equal(env.bar.budget.amount, 5);
  assert.equal(env.writes.length, 47);
});

test('same-text phrase match and new unreviewed keywords are outside the exact landing allowlist', () => {
  const env = environment();
  const extra = Object.assign({}, env.bowling.items[0], { id: 99999, text: '"bowling near me"', match: 'PHRASE' });
  env.bowling.items.push(extra); env.run({ live: true });
  assert.equal(extra.final, 'https://www.twistedpin.com/');
  assert.equal(env.writes.length, 49);
});

test('runtime failure stops subsequent operations, records partial work, and can be resumed safely', () => {
  const env = environment(); env.failOnWrite = 3;
  assert.throws(() => env.run({ live: true }), /simulated API/);
  assert.equal(env.writes.length, 2); assert.equal(env.bar.budget.amount, 6);
  assert.ok(env.bowling.items.every(k => k.final === 'https://www.twistedpin.com/'));
  assert.ok(env.logs.some(line => line.includes('STOPPED AFTER 2 SUCCESSFUL SUBMISSIONS')));
  assert.ok(!env.logs.some(line => line.startsWith('COMPLETE:')));
  env.failOnWrite = null; env.run({ live: true }); assert.equal(env.writes.length, 49);
});

test('a non-throwing rejection of any Employee Appreciation negative leaves only that addition to retry', () => {
  const expected = ['employee appreciation ideas', 'staff rewards', 'appreciation to team members',
    'staff appreciation ideas', 'teammate appreciation ideas'];
  for (let i = 0; i < expected.length; i++) {
    const env = environment(); env.rejectOnWrite = i + 3;
    env.run({ live: true });
    assert.equal(env.attempts, 49); assert.equal(env.writes.length, 48);
    assert.equal(env.rejections.length, 1);
    assert.ok(env.logs.some(line => line.startsWith('COMPLETE: submitted 49 updates.')));
    assert.equal(env.employee.negatives.length, 4);
    assert.equal(env.bar.budget.amount, 6);
    assert.ok(env.bowling.items.every(k => k.final === 'https://www.twistedpin.com/bowl/'));
    assert.equal(env.birthdays.items.filter(k => k.final.endsWith('#adults')).length, 7);

    env.logs.length = 0;
    const beforePreview = env.snapshot(); env.run();
    assert.equal(env.snapshot(), beforePreview); assert.equal(env.attempts, 49);
    assert.ok(env.logs.includes('PREFLIGHT PASSED | planned changes: 1'));
    const plans = env.logs.filter(line => line.startsWith('PLAN '));
    assert.equal(plans.length, 1);
    const record = JSON.parse(plans[0].slice(plans[0].indexOf('{')));
    assert.equal(record.kind, 'ADD_EXACT_NEGATIVE');
    assert.equal(record.campaign, env.events.name);
    assert.equal(record.adGroup, 'Employee Appreciation');
    assert.equal(record.to, '[' + expected[i] + ']');

    env.rejectOnWrite = null; env.run({ live: true });
    assert.equal(env.writes.length, 49);
    assert.deepEqual(env.writes.at(-1), { kind: 'negative', id: env.employee.id });
    assert.equal(env.employee.negatives.length, 5);
    assert.equal(new Set(env.employee.negatives.map(n => n.text)).size, 5);
    env.logs.length = 0; env.run();
    assert.ok(env.logs.includes('PREFLIGHT PASSED | planned changes: 0'));
    assert.equal(env.attempts, 50);
  }
});

test('value drift between planning and applying is caught before its write', () => {
  const env = environment(); env.onFetch = () => env.bar.budget.amount = 11;
  assert.throws(() => env.run({ live: true }), /budget changed during/);
  assert.equal(env.writes.length, 0);
});

test('section toggles restrict changes without requiring unused landing checks', () => {
  const env = environment(); env.status = 500;
  env.run({ live: true, sections: { researchCleanup: false, bowlingLanding: false, adultBirthdayLanding: false } });
  assert.equal(env.writes.length, 1); assert.equal(env.bar.budget.amount, 6);
});
