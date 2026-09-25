const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '21_review_fixes.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const prefix = 'customers/5778974265/';
const host = 'https://www.twistedpin.com';
const iterator = rows => { let index = 0; return { hasNext: () => index < rows.length, next: () => rows[index++] }; };
const LINK_IDS = ['421097763806', '421280548245', '421280548254'];
const SLUGS = { Search_Brand_TwistedPin_2026: 'brand', 'Bar-Led_TwistedPin_2026': 'bar',
  'General & Open Play 2026': 'open-play', 'Events Campaign 2026 Setup': 'events' };
const suffixFor = slug => 'utm_source=google&utm_medium=cpc&utm_campaign=' + slug +
  '&utm_content={adgroupid}_{loc_physical_ms}&utm_term={keyword}';

// Replays Google's referenced-field rule (Script 20's live Preview error): an ID used
// in WHERE must also be selected. Narrow check, not a full GAQL validator.
function validateReferencedIds(sql) {
  const select = sql.match(/^SELECT ([\s\S]+?) FROM /)[1].split(',').map(field => field.trim());
  const where = sql.split(' WHERE ')[1] || '';
  for (const field of ['campaign.id', 'ad_group.id', 'asset.id']) {
    if (new RegExp('\\b' + field.replace('.', '\\.') + '\\b').test(where) && !select.includes(field)) {
      throw new Error("QueryError.EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE: '" + field + "'");
    }
  }
}

function fixture() {
  const env = { logs: [], submissions: [], queries: [], fetched: [], customerId: '577-897-4265', currency: 'USD',
    preview: false, status: 200, reject: false, requestThrows: false };
  const campaign = (id, name, budget, networkSettings) => ({
    campaign: { id: String(id), resourceName: prefix + 'campaigns/' + id, name, status: 'ENABLED', experimentType: 'BASE',
      advertisingChannelType: 'SEARCH', biddingStrategyType: 'MANUAL_CPC', networkSettings },
    campaignBudget: { amountMicros: String(budget * 1000000), period: 'DAILY' }
  });
  const keyword = (id, campaignId, groupId, groupName, text, matchType, url, status = 'ENABLED') => ({
    campaign: { id: String(campaignId) }, adGroup: { id: String(groupId), name: groupName },
    adGroupCriterion: { resourceName: prefix + 'adGroupCriteria/' + groupId + '~' + id, status,
      keyword: { text, matchType }, finalUrls: url ? [host + url] : [], finalMobileUrls: [] }
  });
  env.state = {
    campaigns: [
      // Google omits false booleans from API rows, so "off" networks are simply absent.
      campaign(1, 'Search_Brand_TwistedPin_2026', 6, { targetGoogleSearch: true }),
      campaign(2, 'Bar-Led_TwistedPin_2026', 6, { targetGoogleSearch: true }),
      campaign(3, 'General & Open Play 2026', 32, { targetGoogleSearch: true, targetSearchNetwork: true, targetContentNetwork: true }),
      campaign(4, 'Events Campaign 2026 Setup', 35, { targetGoogleSearch: true, targetSearchNetwork: true }),
      campaign(9, 'Old Paused Campaign', 5, { targetGoogleSearch: true })
    ],
    customer: { customer: { id: '5778974265', autoTaggingEnabled: true } },
    groups: [
      { campaign: { id: '1' }, adGroup: { id: '10', name: 'Brand Defense', status: 'ENABLED' } },
      { campaign: { id: '2' }, adGroup: { id: '20', name: 'Nightlife', status: 'ENABLED' } },
      { campaign: { id: '3' }, adGroup: { id: '30', name: 'Bowling', status: 'ENABLED' } },
      { campaign: { id: '4' }, adGroup: { id: '40', name: 'Birthday & Celebrations', status: 'ENABLED' } }
    ],
    keywords: [
      keyword(501, 4, 40, 'Birthday & Celebrations', 'fundraiser venue', 'EXACT', '/birthday-parties/'),
      keyword(502, 4, 40, 'Birthday & Celebrations', 'bowling fundraiser', 'EXACT', '/birthday-parties/'),
      keyword(503, 4, 40, 'Birthday & Celebrations', 'fundraiser venue', 'PHRASE', '/birthday-parties/'),
      keyword(504, 4, 40, 'Birthday & Celebrations', 'bowling birthday party', 'EXACT', '/birthday-parties/'),
      keyword(505, 3, 30, 'Bowling', 'bowling near me', 'EXACT', '/bowl/'),
      keyword(506, 1, 10, 'Brand Defense', 'twisted pin', 'EXACT', null)
    ],
    ads: [
      { campaign: { id: '1' }, adGroup: { id: '10' }, adGroupAd: { resourceName: prefix + 'adGroupAds/10~700', status: 'ENABLED', ad: {} } },
      { campaign: { id: '4' }, adGroup: { id: '40' }, adGroupAd: { resourceName: prefix + 'adGroupAds/40~701', status: 'ENABLED', ad: {} } }
    ],
    brandLinks: ['111', '112', '113', '114'].map(id => ({ campaign: { id: '1' }, campaignAsset: {
      resourceName: prefix + 'campaignAssets/1~' + id + '~SITELINK', asset: prefix + 'assets/' + id,
      fieldType: 'SITELINK', status: 'ENABLED' } })),
    groupLinks: [],
    assets: [
      { id: LINK_IDS[0], text: 'Adult Birthday Parties', path: '/adult-birthday-parties/' },
      { id: LINK_IDS[1], text: "Kids' Birthday Packages", path: '/reserve/birthdays/' },
      { id: LINK_IDS[2], text: 'Company Holiday Parties', path: '/holiday-parties/' }
    ].map(a => ({ asset: { id: a.id, resourceName: prefix + 'assets/' + a.id, type: 'SITELINK',
      finalUrls: [host + a.path], sitelinkAsset: { linkText: a.text } } }))
  };
  env.html = '<h1>Twisted Pin</h1> Plan Your Fundraiser · Plan My Birthday · Plan My Holiday Party · ' +
    'birthday · bowl · reserve · team outings';
  env.bestEffort = sql => {
    if (sql.includes('ai_max_setting')) return env.state.campaigns.slice(0, 4).map(r => ({ campaign: { id: r.campaign.id, name: r.campaign.name, aiMaxSetting: {} } }));
    if (sql.includes('asset_automation_settings')) return env.state.campaigns.slice(0, 4).map(r => ({ campaign: { id: r.campaign.id, name: r.campaign.name } }));
    return env.state.campaigns.slice(0, 4).map(r => ({ campaign: { id: r.campaign.id, name: r.campaign.name, keywordMatchType: 'UNSPECIFIED' } }));
  };
  env.run = (live = false, overrides = {}) => {
    const context = vm.createContext({
      Logger: { log: text => env.logs.push(String(text)) },
      UrlFetchApp: { fetch: (url, options) => {
        assert.equal(options.followRedirects, false);
        env.fetched.push(url); env.onFetch?.(url);
        return { getResponseCode: () => env.status, getContentText: () => (env.htmlFor ? env.htmlFor(url) : env.html) };
      } },
      AdsApp: {
        currentAccount: () => ({ getCustomerId: () => env.customerId, getCurrencyCode: () => env.currency, getTimeZone: () => 'America/New_York' }),
        getExecutionInfo: () => ({ isPreview: () => env.preview }),
        search: sql => {
          env.queries.push(sql);
          validateReferencedIds(sql);
          const table = sql.match(/ FROM (\w+)/)[1];
          if (table === 'campaign' && /ai_max_setting|asset_automation_settings|keyword_match_type/.test(sql)) {
            return iterator(clone(env.bestEffort(sql)));
          }
          const key = { campaign: 'campaigns', customer: 'customer', ad_group: 'groups', keyword_view: 'keywords',
            ad_group_ad: 'ads', campaign_asset: 'brandLinks', ad_group_asset: 'groupLinks', asset: 'assets' }[table];
          assert.ok(key, sql);
          env.onSearch?.(sql);
          return iterator(clone(key === 'customer' ? [env.state.customer] : env.state[key]));
        },
        mutateAll: (operations, options) => {
          assert.equal(options.partialFailure, false, 'Writes must be atomic');
          env.submissions.push(clone(operations));
          if (env.requestThrows) throw Error('connection lost');
          const draft = clone(env.state);
          const resources = [];
          for (const operation of operations) {
            const keys = Object.keys(operation); assert.equal(keys.length, 1);
            const [type] = keys;
            const body = operation[type];
            if (type === 'adGroupCriterionOperation') {
              assert.ok(body.update && !body.create && !body.remove);
              const fields = Object.keys(body.update).filter(k => k !== 'resourceName');
              assert.ok(fields.every(k => ['finalUrls', 'finalMobileUrls'].includes(k)));
              assert.deepEqual(body.updateMask.split(',').sort(), fields.map(k => k === 'finalUrls' ? 'final_urls' : 'final_mobile_urls').sort());
              const row = draft.keywords.find(r => r.adGroupCriterion.resourceName === body.update.resourceName);
              assert.ok(row, 'unknown keyword');
              assert.equal(row.adGroupCriterion.status, 'ENABLED');
              assert.equal(row.adGroupCriterion.keyword.matchType, 'EXACT');
              assert.ok(['fundraiser venue', 'bowling fundraiser'].includes(row.adGroupCriterion.keyword.text));
              Object.assign(row.adGroupCriterion, clone(body.update)); resources.push(body.update.resourceName);
            } else if (type === 'campaignAssetOperation') {
              assert.ok(body.create && !body.update && !body.remove);
              const value = body.create;
              assert.equal(value.campaign, prefix + 'campaigns/1', 'Only the Brand campaign gets links');
              assert.equal(value.fieldType, 'SITELINK'); assert.equal(value.status, 'ENABLED');
              assert.ok(draft.assets.some(r => r.asset.resourceName === value.asset), 'unknown asset');
              assert.ok(!draft.brandLinks.some(r => r.campaignAsset.asset === value.asset), 'duplicate link');
              const resourceName = prefix + 'campaignAssets/1~' + value.asset.split('/').at(-1) + '~SITELINK';
              draft.brandLinks.push({ campaign: { id: '1' }, campaignAsset: { resourceName, asset: value.asset, fieldType: 'SITELINK', status: 'ENABLED' } });
              resources.push(resourceName);
            } else if (type === 'campaignOperation') {
              assert.ok(body.update && !body.create && !body.remove);
              const update = body.update;
              const fields = Object.keys(update).filter(k => k !== 'resourceName');
              assert.ok(fields.every(k => ['finalUrlSuffix', 'networkSettings', 'status'].includes(k)), 'unexpected campaign field');
              const expectedMask = [];
              if ('finalUrlSuffix' in update) expectedMask.push('final_url_suffix');
              if ('status' in update) { assert.equal(update.status, 'PAUSED'); expectedMask.push('status'); }
              if (update.networkSettings) {
                for (const [k, v] of Object.entries(update.networkSettings)) {
                  assert.ok(['targetSearchNetwork', 'targetContentNetwork'].includes(k)); assert.equal(v, false);
                  expectedMask.push(k === 'targetSearchNetwork' ? 'network_settings.target_search_network' : 'network_settings.target_content_network');
                }
              }
              assert.deepEqual(body.updateMask.split(',').sort(), expectedMask.sort());
              const row = draft.campaigns.find(r => r.campaign.resourceName === update.resourceName);
              assert.ok(row, 'unknown campaign');
              if ('status' in update) assert.equal(row.campaign.name, 'Bar-Led_TwistedPin_2026', 'Only Bar-Led may be paused');
              if ('finalUrlSuffix' in update) row.campaign.finalUrlSuffix = update.finalUrlSuffix;
              if ('status' in update) row.campaign.status = update.status;
              if (update.networkSettings) {
                for (const [k, v] of Object.entries(update.networkSettings)) {
                  if (v === false) delete row.campaign.networkSettings[k]; // API rows omit false booleans
                }
              }
              resources.push(update.resourceName);
            } else {
              assert.fail('Unexpected operation type: ' + type);
            }
          }
          if (!env.reject) env.state = draft;
          return resources.map(resource => ({ isSuccessful: () => !env.reject, getResourceName: () => resource,
            getErrorMessages: () => ['simulated validation failure'] }));
        }
      }
    });
    vm.runInContext(source, context);
    context.DRY_RUN = !live;
    Object.assign(context.RUN21, overrides);
    env.context = context; context.main(); return context;
  };
  return env;
}
const campaignOps = submission => submission.filter(op => op.campaignOperation).map(op => op.campaignOperation);
const byName = (env, name) => env.state.campaigns.find(r => r.campaign.name === name).campaign;

test('dry run and Google Preview do not invoke any mutator', () => {
  for (const preview of [false, true]) {
    const env = fixture(); env.preview = preview;
    const before = clone(env.state); env.run(preview);
    assert.deepEqual(env.state, before); assert.equal(env.submissions.length, 0);
    assert.ok(env.logs.includes('PREFLIGHT PASSED | planned operations: 9'));
    assert.ok(env.logs.some(line => line.startsWith('NO ADS CHANGES MADE')));
  }
});

test('every WHERE-referenced ID is selected; dropping one reproduces the Preview error', () => {
  const env = fixture(); env.run();
  assert.ok(env.queries.length >= 9);
  env.queries.forEach(sql => assert.doesNotThrow(() => validateReferencedIds(sql)));
  const links = env.queries.find(sql => sql.includes(' FROM campaign_asset '));
  assert.throws(() => validateReferencedIds(links.replace('SELECT campaign.id, ', 'SELECT ')), /EXPECTED_REFERENCED_FIELD/);
  assert.ok(env.queries.some(sql => sql.includes('ad_group_criterion.negative = FALSE')));
});

test('live run applies exactly nine operations; rerun plans zero', () => {
  const env = fixture(), before = clone(env.state); env.run(true);
  assert.equal(env.submissions.length, 1); assert.equal(env.submissions[0].length, 9);
  const kw = text => env.state.keywords.find(r => r.adGroupCriterion.keyword.text === text && r.adGroupCriterion.keyword.matchType === 'EXACT').adGroupCriterion;
  assert.deepEqual(kw('fundraiser venue').finalUrls, [host + '/fundraisers/']);
  assert.deepEqual(kw('bowling fundraiser').finalUrls, [host + '/fundraisers/']);
  // Everything else about keywords is untouched, including the phrase variant.
  assert.deepEqual(env.state.keywords.slice(2), before.keywords.slice(2));
  const linked = env.state.brandLinks.map(r => r.campaignAsset.asset);
  LINK_IDS.forEach(id => assert.ok(linked.includes(prefix + 'assets/' + id)));
  assert.equal(env.state.brandLinks.length, 7);
  for (const [name, slug] of Object.entries(SLUGS)) assert.equal(byName(env, name).finalUrlSuffix, suffixFor(slug));
  assert.equal(byName(env, 'General & Open Play 2026').networkSettings.targetSearchNetwork, undefined);
  assert.equal(byName(env, 'General & Open Play 2026').networkSettings.targetContentNetwork, undefined);
  assert.equal(byName(env, 'Events Campaign 2026 Setup').networkSettings.targetSearchNetwork, undefined);
  Object.keys(SLUGS).forEach(name => assert.equal(byName(env, name).networkSettings.targetGoogleSearch, true));
  assert.equal(byName(env, 'Bar-Led_TwistedPin_2026').status, 'PAUSED');
  ['Search_Brand_TwistedPin_2026', 'General & Open Play 2026', 'Events Campaign 2026 Setup'].forEach(name =>
    assert.equal(byName(env, name).status, 'ENABLED'));
  assert.deepEqual(env.state.campaigns.map(r => r.campaignBudget), before.campaigns.map(r => r.campaignBudget));
  assert.deepEqual(env.state.campaigns[4], before.campaigns[4], 'Unrelated campaigns are untouched');
  assert.deepEqual(env.state.assets, before.assets, 'Assets are linked, never edited');
  assert.ok(env.logs.some(line => line.startsWith('ACCEPTED: 9 operations')));
  assert.ok(env.logs.some(line => line.includes('Bar-Led is paused')));
  const applied = clone(env.state); env.run(true);
  assert.deepEqual(env.state, applied); assert.equal(env.submissions.length, 1);
  assert.ok(env.logs.includes('PREFLIGHT PASSED | planned operations: 0'));
});

test('each campaign gets one operation carrying all of its changes', () => {
  const env = fixture(); env.run(true);
  const ops = campaignOps(env.submissions[0]);
  assert.equal(ops.length, 4);
  const mask = id => ops.find(op => op.update.resourceName === prefix + 'campaigns/' + id).updateMask.split(',').sort();
  assert.deepEqual(mask(1), ['final_url_suffix']);
  assert.deepEqual(mask(2), ['final_url_suffix', 'status']);
  assert.deepEqual(mask(3), ['final_url_suffix', 'network_settings.target_content_network', 'network_settings.target_search_network']);
  assert.deepEqual(mask(4), ['final_url_suffix', 'network_settings.target_search_network']);
  const kinds = env.submissions[0].map(op => Object.keys(op)[0]);
  assert.deepEqual(kinds, ['adGroupCriterionOperation', 'adGroupCriterionOperation', 'campaignAssetOperation',
    'campaignAssetOperation', 'campaignAssetOperation', 'campaignOperation', 'campaignOperation', 'campaignOperation', 'campaignOperation']);
});

test('suffix uses readable campaign slugs plus ad group, location and keyword tags', () => {
  const env = fixture(); const context = env.run();
  const suffixes = Object.values(SLUGS).map(slug => context.suffix21(slug));
  assert.equal(new Set(suffixes).size, 4);
  suffixes.forEach(value => {
    assert.match(value, /^utm_source=google&utm_medium=cpc&utm_campaign=[a-z-]+&utm_content=\{adgroupid\}_\{loc_physical_ms\}&utm_term=\{keyword\}$/);
  });
});

test('fundraiser route preserves query strings and moves an existing mobile URL', () => {
  const env = fixture();
  const criterion = env.state.keywords[0].adGroupCriterion;
  criterion.finalUrls = [host + '/birthday-parties/?ref=ads&kw={keyword}'];
  criterion.finalMobileUrls = [host + '/birthday-parties/?device={device}'];
  env.run(true);
  assert.deepEqual(env.state.keywords[0].adGroupCriterion.finalUrls, [host + '/fundraisers/?ref=ads&kw={keyword}']);
  assert.deepEqual(env.state.keywords[0].adGroupCriterion.finalMobileUrls, [host + '/fundraisers/?device={device}']);
});

test('RUN21 switches limit each section independently', () => {
  let env = fixture();
  env.run(true, { fundraiserRoutes: false, brandSitelinks: false, trackingSuffix: false, networkHygiene: false, pauseBarLed: false });
  assert.equal(env.submissions.length, 0); assert.ok(env.logs.includes('PREFLIGHT PASSED | planned operations: 0'));

  env = fixture(); env.run(true, { pauseBarLed: false });
  assert.equal(byName(env, 'Bar-Led_TwistedPin_2026').status, 'ENABLED');
  assert.equal(byName(env, 'Bar-Led_TwistedPin_2026').finalUrlSuffix, suffixFor('bar'));

  env = fixture(); env.run(true, { trackingSuffix: false });
  assert.ok(campaignOps(env.submissions[0]).every(op => !('finalUrlSuffix' in op.update)));
  assert.equal(env.submissions[0].length, 8); // Brand has nothing else to change
  assert.ok(!env.fetched.some(url => url.includes('script21-check')));

  env = fixture(); env.run(true, { networkHygiene: false });
  assert.equal(byName(env, 'General & Open Play 2026').networkSettings.targetSearchNetwork, true);

  env = fixture(); env.run(true, { brandSitelinks: false });
  assert.equal(env.state.brandLinks.length, 4);
  assert.ok(!env.fetched.some(url => url.endsWith('/adult-birthday-parties/')));
});

for (const [title, alter, error] of [
  ['invalid switch value', env => { env.overrides = { pauseBarLed: 'yes' }; }, /RUN21.pauseBarLed/],
  ['wrong account', env => { env.customerId = '111-111-1111'; }, /Wrong account/],
  ['wrong currency', env => { env.currency = 'CAD'; }, /Expected USD/],
  ['budget drift', env => { env.state.campaigns[3].campaignBudget.amountMicros = '41000000'; }, /Budget changed/],
  ['bidding drift', env => { env.state.campaigns[2].campaign.biddingStrategyType = 'TARGET_CPA'; }, /Bidding strategy/],
  ['missing campaign', env => { env.state.campaigns.splice(3, 1); }, /Expected exactly one campaign Events/],
  ['duplicate campaign name', env => { env.state.campaigns.push(clone(env.state.campaigns[0])); }, /Expected exactly one campaign Search_Brand/],
  ['events campaign paused', env => { env.state.campaigns[3].campaign.status = 'PAUSED'; }, /Campaign status changed/],
  ['Google Search switched off', env => { delete env.state.campaigns[0].campaign.networkSettings.targetGoogleSearch; }, /Google Search is not targeted/],
  ['account-level suffix exists', env => { env.state.customer.customer.finalUrlSuffix = 'src=other'; }, /account already has a final URL suffix/],
  ['different campaign suffix exists', env => { env.state.campaigns[2].campaign.finalUrlSuffix = 'src=other'; }, /different final URL suffix/],
  ['missing fundraiser keyword', env => { env.state.keywords.shift(); }, /Expected exactly one EXACT \[fundraiser venue\]/],
  ['duplicate fundraiser keyword', env => { env.state.keywords.push(clone(env.state.keywords[1])); }, /Expected exactly one EXACT \[bowling fundraiser\]/],
  ['unexpected fundraiser destination', env => { env.state.keywords[0].adGroupCriterion.finalUrls = [host + '/events/']; }, /Destination changed/],
  ['wrong host', env => { env.state.keywords[0].adGroupCriterion.finalUrls = ['https://example.com/birthday-parties/']; }, /Unexpected destination/],
  ['missing keyword URL', env => { env.state.keywords[0].adGroupCriterion.finalUrls = []; }, /URL count/],
  ['missing sitelink asset', env => { env.state.assets.pop(); }, /Expected exactly one sitelink asset 421280548254/],
  ['sitelink text drift', env => { env.state.assets[0].asset.sitelinkAsset.linkText = 'Adult Parties'; }, /Sitelink asset changed/],
  ['sitelink URL drift', env => { env.state.assets[1].asset.finalUrls = [host + '/birthday-parties/']; }, /Sitelink destination changed/],
  ['Brand ad group has its own sitelinks', env => { env.state.groupLinks.push({ adGroup: { id: '10' }, adGroupAsset: { resourceName: prefix + 'adGroupAssets/10~9~SITELINK', fieldType: 'SITELINK', status: 'ENABLED' } }); }, /Brand ad group has its own sitelinks/],
  ['paused Brand link to a target sitelink', env => { env.state.brandLinks.push({ campaign: { id: '1' }, campaignAsset: { resourceName: prefix + 'campaignAssets/1~' + LINK_IDS[0] + '~SITELINK', asset: prefix + 'assets/' + LINK_IDS[0], fieldType: 'SITELINK', status: 'PAUSED' } }); }, /is paused; not re-enabling/],
  ['redirecting landing page', env => { env.status = 308; }, /Landing page must return 200/],
  ['landing content missing', env => { env.htmlFor = url => url.endsWith('/fundraisers/') ? '<h1>Page not found</h1>' : env.html; }, /Expected landing content missing: \/fundraisers\//],
  ['noindex landing page', env => { env.html += '<meta name="robots" content="noindex, nofollow">'; }, /noindex/],
  ['account changed during preflight', env => { env.onFetch = () => { env.state.campaigns[0].campaign.finalUrlSuffix = 'changed=1'; }; }, /Account state changed/]
]) {
  test(title + ' aborts before any mutation', () => {
    const env = fixture(); alter(env);
    assert.throws(() => env.run(true, env.overrides || {}), error);
    assert.equal(env.submissions.length, 0);
  });
}

test('paused fundraiser keyword stays paused and untouched', () => {
  const env = fixture(); env.state.keywords[1].adGroupCriterion.status = 'PAUSED';
  const before = clone(env.state.keywords[1]); env.run(true);
  assert.deepEqual(env.state.keywords[1], before); assert.equal(env.submissions[0].length, 8);
});

test('an existing enabled Brand link is kept, not duplicated', () => {
  const env = fixture();
  env.state.brandLinks.push({ campaign: { id: '1' }, campaignAsset: { resourceName: prefix + 'campaignAssets/1~' + LINK_IDS[2] + '~SITELINK',
    asset: prefix + 'assets/' + LINK_IDS[2], fieldType: 'SITELINK', status: 'ENABLED' } });
  env.run(true);
  assert.equal(env.submissions[0].length, 8); assert.equal(env.state.brandLinks.length, 7);
});

test('an already-paused Bar-Led is accepted and not paused again', () => {
  const env = fixture(); env.state.campaigns[1].campaign.status = 'PAUSED'; env.run(true);
  const bar = campaignOps(env.submissions[0]).find(op => op.update.resourceName === prefix + 'campaigns/2');
  assert.equal(bar.updateMask, 'final_url_suffix');
  assert.ok(env.logs.includes('ALREADY PAUSED: Bar-Led_TwistedPin_2026'));
});

test('a campaign that already has the exact suffix is left alone', () => {
  const env = fixture(); env.state.campaigns[0].campaign.finalUrlSuffix = suffixFor('brand'); env.run(true);
  assert.equal(env.submissions[0].length, 8);
  assert.ok(!campaignOps(env.submissions[0]).some(op => op.update.resourceName === prefix + 'campaigns/1'));
});

test('lower-level URL options produce a warning, not an abort', () => {
  const env = fixture(); env.state.keywords[4].adGroupCriterion.finalUrlSuffix = 'kw=legacy'; env.run(true);
  assert.ok(env.logs.some(line => line.startsWith('WARNING: lower-level URL options') && line.includes('[bowling near me]')));
  assert.equal(env.submissions.length, 1);
});

test('best-effort AI Max checks never block the run', () => {
  const env = fixture();
  env.bestEffort = sql => { if (sql.includes('ai_max_setting')) throw Error("Unrecognized field 'campaign.ai_max_setting'"); return env.state.campaigns.slice(0, 4); };
  env.run(true);
  assert.ok(env.logs.some(line => line.startsWith('CHECK AI Max | unavailable')));
  assert.ok(env.logs.some(line => line.startsWith('CHECK Campaign-level match type | Search_Brand_TwistedPin_2026')));
  assert.equal(env.submissions[0].length, 9);
});

test('auto-tagging off is reported loudly', () => {
  const env = fixture(); delete env.state.customer.customer.autoTaggingEnabled; env.run();
  assert.ok(env.logs.some(line => line.includes('auto-tagging OFF - gclid is not being added')));
});

test('atomic rejection cannot be logged as completion or leave partial updates', () => {
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
