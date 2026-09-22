const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '20_event_landing_alignment.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const prefix = 'customers/5778974265/';
const host = 'https://www.twistedpin.com';
const names = ['Birthday & Celebrations', 'Corporate Events', 'Team Outings', 'Employee Appreciation'];
const adultTerms = ['50th birthday party venue', 'adult birthday party venue', 'bowling birthday party for adults',
  '30th birthday party venue', 'birthday party venue for adults', '40th birthday party venue', 'adult birthday party venue near me'];
const holidayTerms = ['corporate holiday party venue', 'holiday party venue', 'holiday party venue near me'];
const iterator = rows => { let index = 0; return { hasNext: () => index < rows.length, next: () => rows[index++] }; };

// Replay the live Google Ads error from the September 14 Preview. This is a
// narrow referenced-ID check, not a complete GAQL or Google API validator.
function validateReferencedAdGroupId(sql) {
  const select = sql.match(/^SELECT ([\s\S]+?) FROM /)[1].split(',').map(field => field.trim());
  const where = sql.split(' WHERE ')[1] || '';
  if (/\bad_group\.id\b/.test(where) && !select.includes('ad_group.id')) {
    throw new Error("QueryError.EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE: 'ad_group.id'");
  }
}

function fixture() {
  const env = { logs: [], submissions: [], customerId: '577-897-4265', currency: 'USD', preview: false, status: 200,
    queries: [], reads: 0, reject: false, requestThrows: false };
  let nextId = 100;
  env.state = {
    campaigns: Object.entries({ Search_Brand_TwistedPin_2026: 6, 'Bar-Led_TwistedPin_2026': 6,
      'General & Open Play 2026': 32, 'Events Campaign 2026 Setup': 35 }).map(([name, budget], i) => ({
      campaign: { id: String(i + 1), name, status: 'ENABLED', biddingStrategyType: 'MANUAL_CPC', advertisingChannelType: 'SEARCH' },
      campaignBudget: { amountMicros: String(budget * 1000000), period: 'DAILY' }
    })),
    groups: names.map((name, i) => ({ adGroup: { id: String(10 + i), resourceName: prefix + 'adGroups/' + (10 + i), name, status: 'ENABLED' } })),
    keywords: [], ads: [], assets: [], links: []
  };
  const tracking = { trackingUrlTemplate: '{lpurl}?ref={_campaign}', finalUrlSuffix: 'source=google&ad={creative}',
    urlCustomParameters: [{ key: 'campaign', value: 'events' }] };
  function keyword(text, group, destination, matchType = 'EXACT', status = 'ENABLED') {
    const id = nextId++;
    return { adGroup: { id: String(group) }, adGroupCriterion: { resourceName: prefix + 'adGroupCriteria/' + group + '~' + id,
      status, keyword: { text, matchType }, finalUrls: [host + destination], finalMobileUrls: [], ...clone(tracking) },
      protectedBid: 5, protectedNegative: false };
  }
  env.state.keywords.push(...adultTerms.map(t => keyword(t, 10, '/birthday-parties/#adults')));
  env.state.keywords.push(...holidayTerms.map(t => keyword(t, 11, '/corporate-events/')));
  env.state.keywords.push(keyword('bowling birthday party', 10, '/birthday-parties/'));
  env.state.keywords.push(keyword('adult birthday party venue', 10, '/birthday-parties/', 'PHRASE'));
  env.state.keywords.push(keyword('employee appreciation', 13, '/corporate-events/', 'PHRASE'));
  env.state.ads = names.map((name, i) => ({ adGroup: { id: String(10 + i) }, adGroupAd: {
    resourceName: prefix + 'adGroupAds/' + (10 + i) + '~' + (500 + i), status: 'ENABLED', ad: {
      id: String(500 + i), type: 'RESPONSIVE_SEARCH_AD',
      finalUrls: [host + (i === 0 ? '/birthday-parties/' : '/corporate-events/') + '?campaign=existing'],
      finalMobileUrls: [], ...clone(tracking), responsiveSearchAd: {
        headlines: [{ text: 'Previous headline', pinnedField: 'HEADLINE_1' }, { text: 'Old second headline' }, { text: 'Old third headline' }],
        descriptions: [{ text: 'Previous approved description.' }, { text: 'Previous second description.' }], path1: 'old', path2: 'page'
      }
    }
  } }));
  env.html = '<h1>Birthday parties. Your way.</h1><a>Kids birthdays</a><a>Plan My Birthday</a>' +
    '<a>Plan My Holiday Party</a><h2>Team outings</h2>';
  env.run = (live = false) => {
    const context = vm.createContext({
      Logger: { log: text => env.logs.push(String(text)) },
      UrlFetchApp: { fetch: (url, options) => {
        assert.equal(options.followRedirects, false);
        env.onFetch?.(url);
        return { getResponseCode: () => env.status, getContentText: () => env.html };
      } },
      AdsApp: {
        currentAccount: () => ({ getCustomerId: () => env.customerId, getCurrencyCode: () => env.currency, getTimeZone: () => 'America/New_York' }),
        getExecutionInfo: () => ({ isPreview: () => env.preview }),
        search: sql => {
          env.queries.push(sql); env.reads++;
          validateReferencedAdGroupId(sql);
          const table = sql.match(/ FROM (\w+)/)[1];
          const key = { campaign: 'campaigns', ad_group: 'groups', keyword_view: 'keywords', ad_group_ad: 'ads', asset: 'assets', ad_group_asset: 'links' }[table];
          assert.ok(key, sql);
          if (env.onSearch) env.onSearch(sql);
          return iterator(clone(env.state[key]));
        },
        mutateAll: (operations, options) => {
          assert.equal(options.partialFailure, false, 'Writes must be atomic');
          env.submissions.push(clone(operations));
          if (env.requestThrows) throw Error('connection lost');
          const draft = clone(env.state);
          const tempIds = new Map();
          const resources = [];
          for (const operation of operations) {
            const keys = Object.keys(operation); assert.equal(keys.length, 1);
            const [type] = keys;
            assert.ok(['adGroupCriterionOperation', 'assetOperation', 'adGroupAssetOperation', 'adGroupAdOperation'].includes(type));
            const body = operation[type];
            if (type === 'adGroupCriterionOperation') {
              assert.ok(body.update && !body.create && !body.remove);
              const allowed = ['resourceName', 'finalUrls', 'finalMobileUrls'];
              assert.ok(Object.keys(body.update).every(key => allowed.includes(key)));
              const criterion = draft.keywords.find(r => r.adGroupCriterion.resourceName === body.update.resourceName).adGroupCriterion;
              assert.equal(criterion.status, 'ENABLED');
              assert.equal(criterion.keyword.matchType, 'EXACT');
              assert.ok([...adultTerms, ...holidayTerms].includes(criterion.keyword.text));
              Object.assign(criterion, clone(body.update)); resources.push(criterion.resourceName);
            } else if (type === 'assetOperation') {
              assert.ok(body.create && !body.update && !body.remove);
              const resource = prefix + 'assets/' + nextId++;
              tempIds.set(body.create.resourceName, resource);
              draft.assets.push({ asset: { ...clone(body.create), resourceName: resource } }); resources.push(resource);
            } else if (type === 'adGroupAssetOperation') {
              assert.ok(body.create && !body.update && !body.remove);
              const value = clone(body.create); value.asset = tempIds.get(value.asset) || value.asset;
              assert.ok(draft.assets.some(r => r.asset.resourceName === value.asset));
              value.resourceName = prefix + 'adGroupAssets/' + value.adGroup.split('/').at(-1) + '~' + value.asset.split('/').at(-1) + '~SITELINK';
              draft.links.push({ adGroupAsset: value }); resources.push(value.resourceName);
            } else {
              assert.ok(body.create && !body.update && !body.remove);
              assert.equal(body.create.status, 'PAUSED', 'Ad creation must be paused in the request itself');
              const id = String(nextId++), group = body.create.adGroup.split('/').at(-1);
              const resourceName = prefix + 'adGroupAds/' + group + '~' + id;
              draft.ads.push({ adGroup: { id: group }, adGroupAd: { resourceName, status: 'PAUSED',
                ad: { ...clone(body.create.ad), id, type: 'RESPONSIVE_SEARCH_AD' } } }); resources.push(resourceName);
            }
          }
          if (!env.reject) env.state = draft;
          return resources.map(resource => ({ isSuccessful: () => !env.reject, getResourceName: () => resource,
            getErrorMessages: () => ['simulated validation failure'] }));
        }
      }
    });
    vm.runInContext(source, context); context.DRY_RUN = !live;
    env.context = context; context.main(); return context;
  };
  return env;
}

test('dry run and Google Preview do not invoke any mutator', () => {
  for (const preview of [false, true]) {
    const env = fixture(); env.preview = preview;
    const before = clone(env.state); env.run(preview);
    assert.deepEqual(env.state, before); assert.equal(env.submissions.length, 0);
    assert.ok(env.logs.includes('PREFLIGHT PASSED | planned operations: 22'));
  }
});

test('all ad-group-filtered queries select the referenced ID; the original sitelink query is rejected', () => {
  const env = fixture(); env.run();
  const queries = env.queries.filter(sql => / WHERE ad_group\.id\b/.test(sql));
  assert.equal(queries.length, 3);
  queries.forEach(sql => assert.doesNotThrow(() => validateReferencedAdGroupId(sql)));
  const sitelink = queries.find(sql => sql.includes(' FROM ad_group_asset '));
  assert.ok(sitelink);
  const original = sitelink.replace('SELECT ad_group.id, ', 'SELECT ');
  assert.throws(() => validateReferencedAdGroupId(original), /EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE/);
  assert.equal(env.submissions.length, 0);
});

test('live plan applies exactly ten routes, five associations and four paused ads; rerun is a no-op', () => {
  const env = fixture(), before = clone(env.state); env.run(true);
  assert.equal(env.submissions.length, 1); assert.equal(env.submissions[0].length, 22);
  assert.deepEqual(env.state.campaigns, before.campaigns); assert.deepEqual(env.state.groups, before.groups);
  for (let i = 0; i < 10; i++) {
    const current = env.state.keywords[i], prior = before.keywords[i];
    assert.equal(current.adGroupCriterion.finalUrls[0], host + (i < 7 ? '/adult-birthday-parties/' : '/holiday-parties/'));
    const protectedCurrent = clone(current), protectedBefore = clone(prior);
    delete protectedCurrent.adGroupCriterion.finalUrls; delete protectedBefore.adGroupCriterion.finalUrls;
    assert.deepEqual(protectedCurrent, protectedBefore);
  }
  assert.deepEqual(env.state.keywords.slice(10), before.keywords.slice(10));
  assert.deepEqual(env.state.ads.slice(0, 4), before.ads);
  assert.equal(env.state.assets.length, 3); assert.equal(env.state.links.length, 5);
  env.state.ads.slice(4).forEach((row, i) => {
    assert.equal(row.adGroupAd.status, 'PAUSED');
    assert.deepEqual(row.adGroupAd.ad.urlCustomParameters, before.ads[i].adGroupAd.ad.urlCustomParameters);
    assert.equal(row.adGroupAd.ad.trackingUrlTemplate, before.ads[i].adGroupAd.ad.trackingUrlTemplate);
    assert.equal(row.adGroupAd.ad.finalUrlSuffix, before.ads[i].adGroupAd.ad.finalUrlSuffix);
    assert.ok(row.adGroupAd.ad.finalUrls[0].endsWith('?campaign=existing'));
  });
  const applied = clone(env.state); env.run(true);
  assert.deepEqual(env.state, applied); assert.equal(env.submissions.length, 1);
  assert.ok(env.logs.includes('PREFLIGHT PASSED | planned operations: 0'));
});

test('query strings, ValueTrack placeholders and explicit mobile destinations survive the route change', () => {
  const env = fixture();
  const criterion = env.state.keywords[0].adGroupCriterion;
  criterion.finalUrls = [host + '/birthday-parties/?utm_campaign=adult%20party&kw={keyword}#adults'];
  criterion.finalMobileUrls = [host + '/birthday-parties/?device={device}#adults'];
  env.state.ads[0].adGroupAd.ad.finalMobileUrls = [host + '/birthday-parties/?mobile=1'];
  env.run(true);
  assert.equal(env.state.keywords[0].adGroupCriterion.finalUrls[0], host + '/adult-birthday-parties/?utm_campaign=adult%20party&kw={keyword}');
  assert.equal(env.state.keywords[0].adGroupCriterion.finalMobileUrls[0], host + '/adult-birthday-parties/?device={device}');
  assert.equal(env.state.ads[4].adGroupAd.ad.finalMobileUrls[0], host + '/birthday-parties/?mobile=1');
});

for (const [title, alter, error] of [
  ['wrong account', env => { env.customerId = '111-111-1111'; }, /Wrong account/],
  ['wrong currency', env => { env.currency = 'CAD'; }, /Expected USD/],
  ['budget drift', env => { env.state.campaigns[3].campaignBudget.amountMicros = '40000000'; }, /Budget changed/],
  ['bidding drift', env => { env.state.campaigns[3].campaign.biddingStrategyType = 'TARGET_CPA'; }, /Bidding strategy/],
  ['missing keyword', env => { env.state.keywords.shift(); }, /Expected exactly one EXACT/],
  ['duplicate keyword', env => { env.state.keywords.push(clone(env.state.keywords[0])); }, /Expected exactly one EXACT/],
  ['unexpected page', env => { env.state.keywords[0].adGroupCriterion.finalUrls = [host + '/events/']; }, /Destination changed/],
  ['unexpected fragment', env => { env.state.keywords[0].adGroupCriterion.finalUrls = [host + '/birthday-parties/#kids']; }, /Destination changed/],
  ['wrong host', env => { env.state.keywords[0].adGroupCriterion.finalUrls = ['https://example.com/birthday-parties/']; }, /Unexpected destination/],
  ['missing destination', env => { env.state.keywords[0].adGroupCriterion.finalUrls = []; }, /URL count/],
  ['paused group', env => { env.state.groups[0].adGroup.status = 'PAUSED'; }, /Ad group not enabled/],
  ['multiple active ads', env => { env.state.ads.push(clone(env.state.ads[0])); }, /Multiple existing enabled ads/],
  ['no active ad', env => { env.state.ads[0].adGroupAd.status = 'PAUSED'; }, /Expected one enabled source ad/],
  ['redirecting landing', env => { env.status = 308; }, /Landing page must return 200/],
  ['broken landing content', env => { env.html = '<h1>Not found</h1>'; }, /Expected landing content/],
  ['changed during preflight', env => { env.onFetch = () => { env.state.keywords[0].adGroupCriterion.finalUrlSuffix = 'changed'; }; }, /Account state changed/]
]) {
  test(title + ' aborts before any mutation', () => {
    const env = fixture(); alter(env); assert.throws(() => env.run(true), error); assert.equal(env.submissions.length, 0);
  });
}

test('paused destination keywords stay paused and untouched', () => {
  const env = fixture(); env.state.keywords[0].adGroupCriterion.status = 'PAUSED';
  const before = clone(env.state.keywords[0]); env.run(true);
  assert.deepEqual(env.state.keywords[0], before); assert.equal(env.submissions[0].length, 21);
});

test('atomic rejection cannot be logged as completion or leave modeled partial updates', () => {
  const env = fixture(), before = clone(env.state); env.reject = true;
  assert.throws(() => env.run(true), /Google rejected the atomic request/);
  assert.deepEqual(env.state, before);
  assert.ok(!env.logs.some(line => line.startsWith('ACCEPTED:')));
});

test('connection failure reports an unknown outcome, not success', () => {
  const env = fixture(); env.requestThrows = true;
  assert.throws(() => env.run(true), /connection lost/);
  assert.ok(env.logs.some(line => line.includes('outcome may be unknown')));
  assert.ok(!env.logs.some(line => line.startsWith('ACCEPTED:')));
});

test('edited script sitelink is not overwritten', () => {
  const env = fixture(); env.run(true); env.state.assets[0].asset.finalUrls = [host + '/different/'];
  assert.throws(() => env.run(true), /sitelink was edited/); assert.equal(env.submissions.length, 1);
});

test('paused script sitelink association is not re-enabled', () => {
  const env = fixture(); env.run(true); env.state.links[0].adGroupAsset.status = 'PAUSED';
  assert.throws(() => env.run(true), /association is paused/); assert.equal(env.submissions.length, 1);
});

test('replacement tracking drift aborts rather than creating another replacement', () => {
  const env = fixture(); env.run(true); env.state.ads[4].adGroupAd.ad.finalUrlSuffix = 'edited=1';
  assert.throws(() => env.run(true), /Replacement URL\/tracking drift/); assert.equal(env.submissions.length, 1);
});

test('manual activation of matching replacements and pausing originals remains a no-op on rerun', () => {
  const env = fixture(); env.run(true);
  env.state.ads.slice(0, 4).forEach(row => { row.adGroupAd.status = 'PAUSED'; });
  env.state.ads.slice(4).forEach(row => { row.adGroupAd.status = 'ENABLED'; });
  const before = clone(env.state); env.run(true);
  assert.deepEqual(env.state, before); assert.equal(env.submissions.length, 1);
});

test('birthday and corporate drafts cover their mixed ad groups, with accurate capacities', () => {
  const env = fixture(); const context = env.run();
  const birthday = context.ADS20.find(ad => ad.group === 'Birthday & Celebrations');
  assert.equal(birthday.path, '/birthday-parties/');
  assert.ok(birthday.descriptions.some(text => text.includes("Kids' packages book online") && text.includes('Plan My Birthday')));
  const corporate = context.ADS20.find(ad => ad.group === 'Corporate Events');
  assert.equal(corporate.headlines[0], 'Company Parties in Plainfield');
  assert.ok(corporate.descriptions.some(text => /80 in the VIP suite.*200 with a full-venue buyout/.test(text)));
  assert.ok(env.queries.some(sql => sql.includes('ad_group_criterion.negative = FALSE')));
});
