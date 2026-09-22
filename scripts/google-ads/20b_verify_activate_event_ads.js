/**
 * Twisted Pin - Script 20B: verify Script 20 and activate its exact replacements.
 * Based on the ACCEPTED resource IDs from the September 14, 2026 live run.
 * NEW standalone Google Ads script; one-time, unscheduled. Default is read-only.
 *
 * Reads: ten keyword destinations, three sitelinks, five associations, eight ads.
 * Writes: ONLY status changes on the four named old/new ad pairs below, at most 8.
 * A replacement must be REVIEWED and APPROVED / APPROVED_LIMITED before its pair
 * is switched. Pending/disapproved pairs keep the original ad untouched.
 * Ready pairs are submitted together with partialFailure:false (atomic request).
 * No creative, URL, tracking, bid, budget, targeting, keyword or asset writes.
 */
var DRY_RUN = true;
var ACCOUNT20B = '5778974265';
var PREFIX20B = 'customers/' + ACCOUNT20B + '/';
var HOST20B = 'https://www.twistedpin.com';
var PAIRS20B = [
  { group: 'Birthday & Celebrations', groupId: '195744623684', oldId: '799859327220', newId: '824656851541',
    headline: 'Birthday Parties in Plainfield', path: '/birthday-parties/' },
  { group: 'Corporate Events', groupId: '196875785449', oldId: '799841211558', newId: '824656851544',
    headline: 'Company Parties in Plainfield', path: '/corporate-events/' },
  { group: 'Team Outings', groupId: '203215948448', oldId: '813141791896', newId: '824656851547',
    headline: 'Team Outings in Plainfield', path: '/corporate-events/' },
  { group: 'Employee Appreciation', groupId: '198474114198', oldId: '813141808492', newId: '824656851550',
    headline: 'Employee Appreciation Events', path: '/corporate-events/' }
];
var KEYWORDS20B = [
  { groupId: '195744623684', path: '/adult-birthday-parties/', ids: [
    '336206718225', '348955744274', '349847636550', '351303986074', '436721888159', '317793329446', '778087519574'
  ] },
  { groupId: '196875785449', path: '/holiday-parties/', ids: ['304908891811', '2434925183', '333701070211'] }
];
var LINKS20B = [
  { id: '421097763806', text: 'Adult Birthday Parties', path: '/adult-birthday-parties/', groups: ['195744623684'] },
  { id: '421280548245', text: "Kids' Birthday Packages", path: '/reserve/birthdays/', groups: ['195744623684'] },
  { id: '421280548254', text: 'Company Holiday Parties', path: '/holiday-parties/',
    groups: ['196875785449', '203215948448', '198474114198'] }
];

function main() {
  assert20b(typeof DRY_RUN === 'boolean', 'DRY_RUN must be true or false.');
  var account = AdsApp.currentAccount();
  assert20b(String(account.getCustomerId()).replace(/\D/g, '') === ACCOUNT20B, 'Wrong account. Expected 577-897-4265.');
  assert20b(account.getCurrencyCode() === 'USD', 'Expected USD account.');
  var readonly = DRY_RUN || AdsApp.getExecutionInfo().isPreview();
  Logger.log('SCRIPT 20B | ' + new Date().toISOString() + ' | account timezone ' + account.getTimeZone());
  Logger.log(readonly ? 'READ-ONLY VERIFICATION AND SWITCH PLAN' : 'LIVE: exact ad-pair status changes only');
  var state = read20b();
  var result = plan20b(state);
  Logger.log('VERIFIED: all 10 keyword destinations, 3 sitelink destinations and 5 enabled associations.');
  result.statuses.forEach(function (entry) { Logger.log('AD STATUS: ' + JSON.stringify(entry)); });
  result.waiting.forEach(function (entry) { Logger.log('WAIT: ' + entry); });
  result.records.forEach(function (entry, index) { Logger.log('PLAN ' + (index + 1) + ': ' + JSON.stringify(entry)); });
  Logger.log('PREFLIGHT PASSED | status changes: ' + result.operations.length +
    ' | waiting pairs: ' + result.waiting.length + ' | already switched: ' + result.complete);
  if (readonly || !result.operations.length) {
    Logger.log('NO ADS CHANGES MADE.');
    if (result.operations.length) Logger.log('To switch ready pairs: DRY_RUN = false, Save, Run once. Do not schedule.');
    else if (result.waiting.length) Logger.log('Google review is not ready for every pair. Preview again after its status changes.');
    else Logger.log('VERIFIED: all four exact replacement pairs are switched. This is not an impressions guarantee.');
    return;
  }
  assert20b(stable20b(state) === stable20b(read20b()), 'Account state changed during preflight. Preview again.');
  var mutations;
  try {
    mutations = AdsApp.mutateAll(result.operations, { partialFailure: false });
  } catch (error) {
    Logger.log('REQUEST ERROR: outcome may be unknown. Inspect Changes and Preview fresh state; do not blindly rerun live.');
    throw error;
  }
  assert20b(mutations && mutations.length === result.operations.length, 'Unexpected result count. Inspect Changes and Preview.');
  var rejected = [];
  mutations.forEach(function (item, index) {
    if (item.isSuccessful()) Logger.log('ACCEPTED ' + (index + 1) + ': ' + item.getResourceName());
    else { var error = JSON.stringify(item.getErrorMessages()); rejected.push(error); Logger.log('REJECTED ' + (index + 1) + ': ' + error); }
  });
  assert20b(!rejected.length, 'Google rejected the atomic switch request. Inspect Changes and Preview fresh state.');
  Logger.log('ACCEPTED: ' + mutations.length + ' ad status changes. Waiting pairs were not changed.');
  Logger.log('Set DRY_RUN = true and Preview again. Expect zero changes and four already switched if all pairs were ready.');
}

function read20b() {
  var groupIds = PAIRS20B.map(function (pair) { return pair.groupId; }).join(',');
  var ads = query20b('SELECT campaign.name, campaign.status, ad_group.id, ad_group.name, ad_group.status, ' +
    'ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.type, ' +
    'ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ' +
    'ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status ' +
    'FROM ad_group_ad WHERE ad_group.id IN (' + groupIds + ") AND ad_group_ad.status != 'REMOVED'");
  // Select every referenced ad_group.id explicitly (the Script 20 Preview fix).
  var keywords = query20b('SELECT ad_group.id, ad_group_criterion.resource_name, ad_group_criterion.status, ' +
    'ad_group_criterion.final_urls, ad_group_criterion.final_mobile_urls, ad_group_criterion.keyword.match_type ' +
    'FROM keyword_view WHERE ad_group.id IN (195744623684,196875785449) ' +
    "AND ad_group_criterion.status != 'REMOVED' AND ad_group_criterion.negative = FALSE");
  var assets = query20b('SELECT asset.id, asset.resource_name, asset.final_urls, asset.final_mobile_urls, asset.sitelink_asset.link_text ' +
    'FROM asset WHERE asset.id IN (' + LINKS20B.map(function (link) { return link.id; }).join(',') + ')');
  var links = query20b('SELECT ad_group.id, ad_group_asset.resource_name, ad_group_asset.asset, ad_group_asset.status ' +
    'FROM ad_group_asset WHERE ad_group.id IN (' + groupIds + ") AND ad_group_asset.field_type = 'SITELINK' " +
    "AND ad_group_asset.status != 'REMOVED'");
  // Exclude volatile per-headline performance metadata from the consistency check.
  ads = ads.map(function (row) {
    return { campaign: row.campaign, adGroup: row.adGroup, adGroupAd: {
      resourceName: row.adGroupAd.resourceName, status: row.adGroupAd.status, policySummary: row.adGroupAd.policySummary || {},
      ad: { id: row.adGroupAd.ad.id, type: row.adGroupAd.ad.type, finalUrls: row.adGroupAd.ad.finalUrls || [],
        headlines: ((row.adGroupAd.ad.responsiveSearchAd || {}).headlines || []).map(function (asset) {
          return { text: asset.text, pinnedField: asset.pinnedField || '' };
        }) }
    } };
  });
  return { ads: ads, keywords: keywords, assets: assets, links: links };
}

function plan20b(state) {
  KEYWORDS20B.forEach(function (target) {
    target.ids.forEach(function (id) {
      var resource = PREFIX20B + 'adGroupCriteria/' + target.groupId + '~' + id;
      var criterion = one20b(state.keywords.filter(function (r) { return r.adGroupCriterion.resourceName === resource; }), resource).adGroupCriterion;
      assert20b(criterion.keyword.matchType === 'EXACT', 'Keyword match changed: ' + resource);
      checkUrl20b(criterion.finalUrls, target.path, resource);
      assert20b(!(criterion.finalMobileUrls || []).length, 'Unexpected keyword mobile override: ' + resource);
    });
  });
  LINKS20B.forEach(function (spec) {
    var resource = PREFIX20B + 'assets/' + spec.id;
    var asset = one20b(state.assets.filter(function (r) { return r.asset.resourceName === resource; }), resource).asset;
    checkUrl20b(asset.finalUrls, spec.path, resource);
    assert20b(!(asset.finalMobileUrls || []).length && asset.sitelinkAsset.linkText === spec.text, 'Sitelink changed: ' + resource);
    spec.groups.forEach(function (group) {
      var association = PREFIX20B + 'adGroupAssets/' + group + '~' + spec.id + '~SITELINK';
      var link = one20b(state.links.filter(function (r) { return r.adGroupAsset.resourceName === association; }), association).adGroupAsset;
      assert20b(link.status === 'ENABLED' && link.asset === resource, 'Sitelink association changed: ' + association);
    });
  });
  var result = { operations: [], records: [], statuses: [], waiting: [], complete: 0 };
  function update(pair, row, to) {
    var record = { group: pair.group, ad: row.resourceName, from: row.status, to: to };
    result.records.push(record);
    result.operations.push({ adGroupAdOperation: { update: { resourceName: row.resourceName, status: to }, updateMask: 'status' } });
  }
  PAIRS20B.forEach(function (pair) {
    function find(id) {
      var resource = PREFIX20B + 'adGroupAds/' + pair.groupId + '~' + id;
      var row = one20b(state.ads.filter(function (r) { return r.adGroupAd.resourceName === resource; }), resource);
      assert20b(row.campaign.name === 'Events Campaign 2026 Setup' && row.campaign.status === 'ENABLED', 'Campaign changed: ' + pair.group);
      assert20b(String(row.adGroup.id) === pair.groupId && row.adGroup.name === pair.group && row.adGroup.status === 'ENABLED', 'Ad group changed: ' + pair.group);
      assert20b(row.adGroupAd.ad.type === 'RESPONSIVE_SEARCH_AD' &&
        ['ENABLED', 'PAUSED'].indexOf(row.adGroupAd.status) >= 0, 'Ad type/status changed: ' + resource);
      return row.adGroupAd;
    }
    var oldAd = find(pair.oldId), newAd = find(pair.newId);
    checkUrl20b(newAd.ad.finalUrls, pair.path, newAd.resourceName);
    assert20b(newAd.ad.headlines.some(function (headline) {
      return headline.text === pair.headline && headline.pinnedField === 'HEADLINE_1';
    }), 'Replacement pinned headline changed: ' + pair.group);
    var policy = newAd.policySummary;
    var ready = policy.reviewStatus === 'REVIEWED' && ['APPROVED', 'APPROVED_LIMITED'].indexOf(policy.approvalStatus) >= 0;
    result.statuses.push({ group: pair.group, original: oldAd.status, replacement: newAd.status,
      replacementId: pair.newId, review: policy.reviewStatus || 'UNKNOWN', approval: policy.approvalStatus || 'UNKNOWN' });
    if (!ready) {
      result.waiting.push(pair.group + ': replacement ' + (policy.reviewStatus || 'UNKNOWN') + ' / ' +
        (policy.approvalStatus || 'UNKNOWN') + '; original remains ' + oldAd.status +
        (oldAd.status === 'PAUSED' ? ' - check this group manually; the original is already paused.' : '.'));
      return;
    }
    if (newAd.status === 'PAUSED') update(pair, newAd, 'ENABLED');
    if (oldAd.status === 'ENABLED') update(pair, oldAd, 'PAUSED');
    if (newAd.status === 'ENABLED' && oldAd.status === 'PAUSED') result.complete++;
  });
  assert20b(result.operations.length <= 8, 'Unexpected status-change count.');
  return result;
}

function checkUrl20b(urls, path, label) { assert20b(urls && urls.length === 1 && urls[0] === HOST20B + path, 'Destination changed: ' + label); }
function one20b(rows, label) { assert20b(rows.length === 1, 'Expected one ' + label + '; found ' + rows.length); return rows[0]; }
function query20b(sql) { var rows = [], iterator = AdsApp.search(sql); while (iterator.hasNext()) rows.push(iterator.next()); return rows; }
function stable20b(value) {
  if (Array.isArray(value)) return '[' + value.map(stable20b).sort().join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stable20b(value[key]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
function assert20b(condition, message) { if (!condition) throw new Error(message); }
