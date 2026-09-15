const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '20b_verify_activate_event_ads.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const prefix = 'customers/5778974265/';
const host = 'https://www.twistedpin.com';
const pairs = [
  ['195744623684', '799859327220', '824656851541', 'Birthday & Celebrations', 'Birthday Parties in Plainfield', '/birthday-parties/'],
  ['196875785449', '799841211558', '824656851544', 'Corporate Events', 'Company Parties in Plainfield', '/corporate-events/'],
  ['203215948448', '813141791896', '824656851547', 'Team Outings', 'Team Outings in Plainfield', '/corporate-events/'],
  ['198474114198', '813141808492', '824656851550', 'Employee Appreciation', 'Employee Appreciation Events', '/corporate-events/']
];
const assetSpecs = [
  ['421097763806', 'Adult Birthday Parties', '/adult-birthday-parties/', ['195744623684']],
  ['421280548245', "Kids' Birthday Packages", '/reserve/birthdays/', ['195744623684']],
  ['421280548254', 'Company Holiday Parties', '/holiday-parties/', ['196875785449', '203215948448', '198474114198']]
];
const iterator = rows => { let i = 0; return { hasNext: () => i < rows.length, next: () => rows[i++] }; };

function fixture() {
  const env = { customer: '577-897-4265', preview: false, logs: [], submitted: [], queryCount: 0, reject: false, timeoutAfterAccept: false };
  env.state = { ads: [], keywords: [], assets: [], links: [] };
  pairs.forEach(([groupId, oldId, newId, group, headline, destination]) => {
    [oldId, newId].forEach(id => env.state.ads.push({
      campaign: { name: 'Events Campaign 2026 Setup', status: 'ENABLED' }, adGroup: { id: groupId, name: group, status: 'ENABLED' },
      adGroupAd: { resourceName: prefix + 'adGroupAds/' + groupId + '~' + id, status: id === oldId ? 'ENABLED' : 'PAUSED',
        policySummary: { reviewStatus: 'REVIEWED', approvalStatus: 'APPROVED' },
        ad: { id, type: 'RESPONSIVE_SEARCH_AD', finalUrls: [host + destination],
          responsiveSearchAd: { headlines: [{ text: id === newId ? headline : 'Original ad', pinnedField: 'HEADLINE_1',
            assetPerformanceLabel: 'PENDING' }] }, untouchedTracking: 'tracking=keep' }
      }
    }));
  });
  [['195744623684', '/adult-birthday-parties/', ['336206718225', '348955744274', '349847636550', '351303986074', '436721888159', '317793329446', '778087519574']],
    ['196875785449', '/holiday-parties/', ['304908891811', '2434925183', '333701070211']]].forEach(([groupId, destination, ids]) => {
    ids.forEach(id => env.state.keywords.push({ adGroup: { id: groupId }, adGroupCriterion: {
      resourceName: prefix + 'adGroupCriteria/' + groupId + '~' + id, status: 'ENABLED', finalUrls: [host + destination],
      finalMobileUrls: [], keyword: { matchType: 'EXACT' }, untouchedBid: 5
    } }));
  });
  assetSpecs.forEach(([id, text, destination, groups]) => {
    env.state.assets.push({ asset: { id, resourceName: prefix + 'assets/' + id, finalUrls: [host + destination],
      sitelinkAsset: { linkText: text } } });
    groups.forEach(groupId => env.state.links.push({ adGroup: { id: groupId }, adGroupAsset: {
      resourceName: prefix + 'adGroupAssets/' + groupId + '~' + id + '~SITELINK', asset: prefix + 'assets/' + id, status: 'ENABLED'
    } }));
  });
  env.run = (live = false) => {
    const context = vm.createContext({ Logger: { log: text => env.logs.push(String(text)) }, AdsApp: {
      currentAccount: () => ({ getCustomerId: () => env.customer, getCurrencyCode: () => 'USD', getTimeZone: () => 'America/New_York' }),
      getExecutionInfo: () => ({ isPreview: () => env.preview }),
      search: sql => {
        env.queryCount++; env.onQuery?.(sql);
        const select = sql.match(/^SELECT ([\s\S]+?) FROM /)[1].split(',').map(field => field.trim());
        const where = sql.split(' WHERE ')[1];
        for (const field of ['ad_group.id', 'asset.id']) if (where.includes(field)) assert.ok(select.includes(field), field + ' must be selected');
        const table = sql.match(/ FROM (\w+)/)[1];
        const key = { ad_group_ad: 'ads', keyword_view: 'keywords', asset: 'assets', ad_group_asset: 'links' }[table];
        assert.ok(key, sql); return iterator(clone(env.state[key]));
      },
      mutateAll: (operations, options) => {
        assert.equal(options.partialFailure, false); assert.ok(operations.length <= 8);
        env.submitted.push(clone(operations)); const next = clone(env.state);
        const resources = operations.map(operation => {
          assert.deepEqual(Object.keys(operation), ['adGroupAdOperation']);
          const op = operation.adGroupAdOperation;
          assert.equal(op.updateMask, 'status'); assert.deepEqual(Object.keys(op).sort(), ['update', 'updateMask']);
          assert.deepEqual(Object.keys(op.update).sort(), ['resourceName', 'status']);
          const expected = pairs.flatMap(([groupId, oldId, newId]) => [
            { resourceName: prefix + 'adGroupAds/' + groupId + '~' + oldId, status: 'PAUSED' },
            { resourceName: prefix + 'adGroupAds/' + groupId + '~' + newId, status: 'ENABLED' }
          ]).find(item => item.resourceName === op.update.resourceName);
          assert.ok(expected); assert.equal(op.update.status, expected.status);
          const row = next.ads.find(item => item.adGroupAd.resourceName === expected.resourceName);
          assert.ok(row); row.adGroupAd.status = expected.status; return expected.resourceName;
        });
        if (!env.reject) env.state = next;
        if (env.timeoutAfterAccept) throw Error('connection lost');
        return resources.map(resource => ({ isSuccessful: () => !env.reject, getResourceName: () => resource,
          getErrorMessages: () => ['simulated server rejection'] }));
      }
    } });
    vm.runInContext(source, context); context.DRY_RUN = !live; context.main(); return context;
  };
  return env;
}

test('both dry run and Google Preview verify and plan without mutation', () => {
  for (const preview of [false, true]) {
    const env = fixture(), before = clone(env.state); env.preview = preview; env.run(preview);
    assert.deepEqual(env.state, before); assert.equal(env.submitted.length, 0);
    assert.ok(env.logs.includes('PREFLIGHT PASSED | status changes: 8 | waiting pairs: 0 | already switched: 0'));
  }
});

test('live switch affects only the eight accepted ad IDs and reruns are a no-op', () => {
  const env = fixture(), before = clone(env.state); env.state.ads[3].adGroupAd.policySummary.approvalStatus = 'APPROVED_LIMITED';
  env.run(true); assert.equal(env.submitted.length, 1); assert.equal(env.submitted[0].length, 8);
  assert.deepEqual(env.state.keywords, before.keywords); assert.deepEqual(env.state.assets, before.assets); assert.deepEqual(env.state.links, before.links);
  env.state.ads.forEach((row, index) => {
    assert.equal(row.adGroupAd.status, index % 2 ? 'ENABLED' : 'PAUSED');
    assert.deepEqual(row.adGroupAd.ad, before.ads[index].adGroupAd.ad);
  });
  const after = clone(env.state); env.run(true); assert.deepEqual(env.state, after); assert.equal(env.submitted.length, 1);
  assert.ok(env.logs.includes('PREFLIGHT PASSED | status changes: 0 | waiting pairs: 0 | already switched: 4'));
});

for (const approval of ['DISAPPROVED', 'UNKNOWN', 'AREA_OF_INTEREST_ONLY']) {
  test(approval + ' leaves that pair untouched while ready pairs can switch', () => {
    const env = fixture(); env.state.ads[1].adGroupAd.policySummary.approvalStatus = approval;
    const before = clone(env.state.ads.slice(0, 2)); env.run(true);
    assert.deepEqual(env.state.ads.slice(0, 2), before); assert.equal(env.submitted[0].length, 6);
    assert.ok(env.logs.some(line => line.startsWith('WAIT: Birthday & Celebrations:')));
  });
}

test('an approval status alone does not bypass an incomplete review', () => {
  const env = fixture(); env.state.ads.filter((_, i) => i % 2).forEach(row => { row.adGroupAd.policySummary.reviewStatus = 'REVIEW_IN_PROGRESS'; });
  const before = clone(env.state); env.run(true);
  assert.deepEqual(env.state, before); assert.equal(env.submitted.length, 0);
  assert.ok(env.logs.includes('PREFLIGHT PASSED | status changes: 0 | waiting pairs: 4 | already switched: 0'));
  assert.ok(!env.logs.some(line => line.startsWith('VERIFIED: all four exact replacement pairs')));
});

for (const [name, mutate, error] of [
  ['wrong account', env => { env.customer = '111-111-1111'; }, /Wrong account/],
  ['missing replacement', env => { env.state.ads.splice(1, 1); }, /Expected one/],
  ['changed pinned headline', env => { env.state.ads[1].adGroupAd.ad.responsiveSearchAd.headlines[0].text = 'Changed'; }, /headline changed/],
  ['changed ad destination', env => { env.state.ads[1].adGroupAd.ad.finalUrls = [host + '/events/']; }, /Destination changed/],
  ['changed keyword destination', env => { env.state.keywords[0].adGroupCriterion.finalUrls = [host + '/birthday-parties/#adults']; }, /Destination changed/],
  ['new mobile keyword override', env => { env.state.keywords[0].adGroupCriterion.finalMobileUrls = [host + '/']; }, /mobile override/],
  ['missing sitelink', env => { env.state.assets.shift(); }, /Expected one/],
  ['paused sitelink association', env => { env.state.links[0].adGroupAsset.status = 'PAUSED'; }, /association changed/],
  ['paused campaign', env => { env.state.ads[0].campaign.status = 'PAUSED'; }, /Campaign changed/],
  ['paused group', env => { env.state.ads[0].adGroup.status = 'PAUSED'; }, /Ad group changed/],
  ['concurrent status change', env => { env.onQuery = () => { if (env.queryCount === 5) env.state.ads[1].adGroupAd.status = 'ENABLED'; }; }, /Account state changed/]
]) {
  test(name + ' stops before writes', () => {
    const env = fixture(); mutate(env); assert.throws(() => env.run(true), error); assert.equal(env.submitted.length, 0);
  });
}

test('already-enabled replacements need only the corresponding original paused', () => {
  const env = fixture(); env.state.ads.filter((_, i) => i % 2).forEach(row => { row.adGroupAd.status = 'ENABLED'; });
  env.run(true); assert.equal(env.submitted[0].length, 4);
  assert.ok(env.submitted[0].every(operation => operation.adGroupAdOperation.update.status === 'PAUSED'));
});

test('atomic server rejection preserves all old ads and is never reported as success', () => {
  const env = fixture(), before = clone(env.state); env.reject = true;
  assert.throws(() => env.run(true), /Google rejected the atomic switch/);
  assert.deepEqual(env.state, before); assert.ok(!env.logs.some(line => line.startsWith('ACCEPTED:')));
});

test('ambiguous timeout advises fresh verification, which detects an already-applied switch', () => {
  const env = fixture(); env.timeoutAfterAccept = true;
  assert.throws(() => env.run(true), /connection lost/);
  assert.ok(env.logs.some(line => line.includes('outcome may be unknown')));
  env.timeoutAfterAccept = false; env.run(); assert.equal(env.submitted.length, 1);
  assert.ok(env.logs.includes('PREFLIGHT PASSED | status changes: 0 | waiting pairs: 0 | already switched: 4'));
});

test('an unrelated existing ad remains untouched', () => {
  const env = fixture(); const extra = clone(env.state.ads[0]);
  extra.adGroupAd.resourceName = prefix + 'adGroupAds/195744623684~999999999999'; extra.adGroupAd.ad.id = '999999999999';
  env.state.ads.push(extra); env.run(true); assert.deepEqual(env.state.ads.at(-1), extra);
});
