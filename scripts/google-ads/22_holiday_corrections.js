/**
 * Twisted Pin / Google Ads Script 22 / November 1, 2026
 * Paste this whole file into a NEW Google Ads script. Do not replace or rerun 19, 20, 20B or 21.
 * UNSCHEDULED. Default DRY_RUN and Google's Preview both make no writes.
 *
 * From the October 31 review. Six sections, each with a RUN22 switch:
 *   replaceAds        "Open Until 1am" -> "Open Until 1am Fri & Sat", the whole-suite line, and no
 *                     old-name ("Plainfield Lanes") copy, in four RSAs. Corrected copies are created
 *                     PAUSED; a later run switches each pair (pause old, enable new) only after
 *                     Google has REVIEWED and APPROVED it. Removes one stale paused copy (STALE22).
 *   brandCallout      Brand: unlink the "Open Until 1am" callout, link the existing approved
 *                     "Open Late Fri & Sat" callout (already used by Open Play).
 *   openPlayLate      Open Play ad schedule: Friday and Saturday nights run to midnight Central
 *                     (1:00am account time) instead of 10:45pm Central.
 *   couponNegatives   Move phrase negatives "coupon"/"coupons" off the shared list (it covers Brand)
 *                     onto every other campaign that uses the list, so "twisted pin coupon" can
 *                     show the Brand ad.
 *   ageExclusions     Remove the age exclusions: Birthday 18-24, Corporate 18-24 and 65+.
 *   birthdayIncome    Birthday & Celebrations: bid -40% on the 41-50% and 31-40% income tiers
 *                     (the lower 50% stays excluded as it is today).
 * Never touched: budgets, bidding strategy, keyword bids, keywords, geo, networks, other ads,
 * conversion goals, asset content. No asset is created, edited or deleted.
 *
 * Run it twice: the first live run makes every change and creates the paused copies; a second
 * run (after Google's review, usually within a few hours) switches the ad pairs. Each run is
 * idempotent: a finished account plans zero operations.
 *
 * Writes use one mutateAll request per run with partialFailure:false (all or nothing). A network
 * error can leave the outcome unknown: inspect Change history and Preview before retrying.
 * API acceptance is not policy approval or serving. No external writes of any kind.
 */
var DRY_RUN = true;

var RUN22 = {
  replaceAds: true,
  brandCallout: true,
  openPlayLate: true,
  couponNegatives: true,
  ageExclusions: true,
  birthdayIncome: true
};

var CONFIG22 = {
  customerId: '5778974265',
  campaigns: [
    { key: 'brand', name: 'Search_Brand_TwistedPin_2026', budget: 6, statuses: ['ENABLED'] },
    { key: 'open', name: 'General & Open Play 2026', budget: 32, statuses: ['ENABLED'] },
    { key: 'events', name: 'Events Campaign 2026 Setup', budget: 35, statuses: ['ENABLED'] },
    { key: 'bar', name: 'Bar-Led_TwistedPin_2026', budget: 6, statuses: ['ENABLED', 'PAUSED'] }
  ],
  maxOperations: 30
};
var PREFIX22 = 'customers/' + CONFIG22.customerId + '/';
var HOST22 = 'https://www.twistedpin.com';

// Exact text swaps. Every other headline, description, pin and URL is copied unchanged.
// Owner ruling November 1: never mention the old name (Plainfield Lanes) in ad copy. Searches for the
// old name still reach Brand through keywords; only the words in the ad change.
var HEADLINE_SWAPS22 = {
  'Open Until 1am': 'Open Until 1am Fri & Sat',
  'Take Over the VIP Suite': 'Upgrade to the VIP Suite',
  'Formerly Plainfield Lanes': 'Bowling Optional'
};
var DESCRIPTION_SWAPS22 = {
  'Bowling, craft cocktails, 28 self-serve taps. Open until 1am. Plainfield, IL.':
    'Bowling, craft cocktails, 28 self-serve taps. Open until 1am Fri & Sat. Plainfield, IL.',
  '17 traditional lanes + a 6-lane VIP suite. Take over the suite for your group.':
    'When you book all six lanes, the whole suite is yours during your event time.',
  "The answer to 'what should we do tonight?' Open until 1am. Reservations welcome.":
    "The answer to 'what should we do tonight?' Open until 1am Fri & Sat.",
  'Not your average evening out. Reservations welcome. Open until 1am.':
    'Not your average evening out. Reservations welcome. Open until 1am Fri & Sat.',
  "Formerly Plainfield Lanes \u2014 now Plainfield's premier night out. Open until 1am.":
    "Plainfield's premier night out. Bowling optional. Open until 1am Fri & Sat."
};

// The four live RSAs, by ad group and ad ID, with how many assets each must swap.
var ADS22 = [
  { campaign: 'open', group: 'Bowling', groupId: '191364831262', adId: '809142806047', swaps: 4, path: '/bowl/' },
  { campaign: 'open', group: 'Things To Do', groupId: '199668767993', adId: '815955743419', swaps: 2, path: '/' },
  { campaign: 'brand', group: 'Brand Defense', groupId: '201769492772', adId: '809106471063', swaps: 2, path: '/' },
  { campaign: 'brand', group: 'Brand Defense', groupId: '201769492772', adId: '816029354297', swaps: 2, path: '/' }
];

// Paused copy created by the November 1 run 1 before the old-name ruling. It still says "Formerly
// Plainfield Lanes" and never served; it is removed and replaced by a fresh copy.
var STALE22 = [
  { group: 'Brand Defense', groupId: '201769492772', adId: '830195254966', marker: 'Formerly Plainfield Lanes' }
];

var CALLOUT22 = {
  remove: { id: '362030204937', text: 'Open Until 1am' },
  add: { id: '339131659787', text: 'Open Late Fri & Sat' }
};

// Account clock is America/New_York; the venue is Central. 24:00 ET = 11pm CT, 01:00 ET = midnight CT.
var SCHEDULE22 = {
  from: [
    { day: 'FRIDAY', start: [10, 'ZERO'], end: [23, 'FORTY_FIVE'] },
    { day: 'SATURDAY', start: [10, 'ZERO'], end: [23, 'FORTY_FIVE'] }
  ],
  to: [
    { day: 'FRIDAY', start: [10, 'ZERO'], end: [24, 'ZERO'] },
    { day: 'SATURDAY', start: [0, 'ZERO'], end: [1, 'ZERO'] },
    { day: 'SATURDAY', start: [10, 'ZERO'], end: [24, 'ZERO'] },
    { day: 'SUNDAY', start: [0, 'ZERO'], end: [1, 'ZERO'] }
  ]
};

var SHARED_LIST22 = { id: '12083574315', name: 'TwistedPin Negatives 2026', moved: ['coupon', 'coupons'] };

var AGES22 = [
  { group: 'Birthday & Celebrations', groupId: '195744623684', type: 'AGE_RANGE_18_24' },
  { group: 'Corporate Events', groupId: '196875785449', type: 'AGE_RANGE_18_24' },
  { group: 'Corporate Events', groupId: '196875785449', type: 'AGE_RANGE_65_UP' }
];

var INCOME22 = { group: 'Birthday & Celebrations', groupId: '195744623684', modifier: 0.6,
  types: ['INCOME_RANGE_50_60', 'INCOME_RANGE_60_70'] };

function main() {
  assert22(typeof DRY_RUN === 'boolean', 'DRY_RUN must be true or false.');
  Object.keys(RUN22).forEach(function (key) {
    assert22(typeof RUN22[key] === 'boolean', 'RUN22.' + key + ' must be true or false.');
  });
  var account = AdsApp.currentAccount();
  assert22(String(account.getCustomerId()).replace(/\D/g, '') === CONFIG22.customerId,
    'Wrong account. Expected Twisted Pin 577-897-4265.');
  assert22(account.getCurrencyCode() === 'USD', 'Expected USD.');
  var readonly = DRY_RUN || AdsApp.getExecutionInfo().isPreview();
  Logger.log('SCRIPT 22 | ' + new Date().toISOString() + ' | account timezone ' + account.getTimeZone());
  Logger.log(readonly ? 'READ-ONLY PLAN' : 'LIVE');
  Logger.log('SECTIONS: ' + JSON.stringify(RUN22));
  validateCopy22();
  var state = readState22();
  var result = plan22(state);
  result.notes.forEach(function (note) { Logger.log(note); });
  var plan = result.plan;
  assert22(plan.length <= CONFIG22.maxOperations, 'Unexpected operation count: ' + plan.length);
  Logger.log('PREFLIGHT PASSED | planned operations: ' + plan.length);
  plan.forEach(function (item, index) {
    Logger.log('PLAN ' + (index + 1) + ': ' + JSON.stringify({ kind: item.kind, context: item.context,
      before: item.before, after: item.after }));
  });
  if (readonly || !plan.length) {
    Logger.log('NO ADS CHANGES MADE.');
    if (plan.length) Logger.log('After reviewing: set DRY_RUN = false, Save, Run once. Do not schedule.');
    return;
  }

  assert22(stable22(state) === stable22(readState22()), 'Account state changed during preflight. Preview again.');
  Logger.log('BEFORE: save the PLAN entries above as the rollback record.');
  var results;
  try {
    results = AdsApp.mutateAll(plan.map(function (item) { return item.operation; }), { partialFailure: false });
  } catch (error) {
    Logger.log('REQUEST ERROR: outcome may be unknown. Inspect Change history and Preview fresh state before retrying.');
    throw error;
  }
  assert22(results && results.length === plan.length,
    'Unexpected result count. Do not assume completion; inspect Change history and Preview.');
  var failures = [];
  results.forEach(function (item, index) {
    if (item.isSuccessful()) {
      Logger.log('ACCEPTED ' + (index + 1) + ': ' + item.getResourceName() + ' | ' + plan[index].kind + ' | ' +
        plan[index].context);
    } else {
      var detail = JSON.stringify(item.getErrorMessages());
      Logger.log('REJECTED ' + (index + 1) + ': ' + detail);
      failures.push(detail);
    }
  });
  assert22(!failures.length, 'Google rejected the atomic request; nothing was applied. Inspect Change history.');
  Logger.log('ACCEPTED: ' + results.length + ' operations. This does not confirm policy review or serving.');
  if (plan.some(function (item) { return item.kind === 'CREATE_PAUSED_COPY'; })) {
    Logger.log('NEXT: the corrected copies are PAUSED and in review. Preview this script again in a few hours; ' +
      'when it plans the ad switches, set DRY_RUN = false and Run once more.');
  } else {
    Logger.log('Set DRY_RUN back to true and Preview: a finished account plans zero operations.');
  }
}

function readState22() {
  var names = CONFIG22.campaigns.map(function (spec) { return spec.name; });
  var campaigns = query22('SELECT campaign.id, campaign.resource_name, campaign.name, campaign.status, campaign.experiment_type, ' +
    'campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.amount_micros, ' +
    "campaign_budget.period FROM campaign WHERE campaign.status != 'REMOVED' AND campaign.experiment_type = 'BASE'")
    .filter(function (row) { return names.indexOf(row.campaign.name) >= 0; });
  var byKey = {};
  CONFIG22.campaigns.forEach(function (spec) {
    byKey[spec.key] = one22(campaigns.filter(function (r) { return r.campaign.name === spec.name; }), 'campaign ' + spec.name);
  });
  var ids = CONFIG22.campaigns.map(function (spec) { return numeric22(byKey[spec.key].campaign.id); }).join(',');
  var groupIds = unique22(ADS22.map(function (a) { return a.groupId; })
    .concat(AGES22.map(function (a) { return a.groupId; })).concat([INCOME22.groupId]));
  var groups = query22('SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ' +
    'ad_group.targeting_setting.target_restrictions FROM ad_group ' +
    'WHERE ad_group.id IN (' + groupIds.join(',') + ')');
  var ads = query22('SELECT campaign.id, ad_group.id, ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.ad.id, ' +
    'ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls, ad_group_ad.ad.final_url_suffix, ' +
    'ad_group_ad.ad.tracking_url_template, ad_group_ad.ad.responsive_search_ad.headlines, ' +
    'ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1, ' +
    'ad_group_ad.ad.responsive_search_ad.path2, ad_group_ad.policy_summary.approval_status, ' +
    'ad_group_ad.policy_summary.review_status FROM ad_group_ad WHERE ad_group.id IN (' +
    unique22(ADS22.map(function (a) { return a.groupId; })).join(',') + ") AND ad_group_ad.status != 'REMOVED'")
    .map(slimAd22);
  var brandId = numeric22(byKey.brand.campaign.id);
  var callouts = query22('SELECT campaign.id, campaign_asset.resource_name, campaign_asset.asset, campaign_asset.status, ' +
    "campaign_asset.field_type FROM campaign_asset WHERE campaign.id = " + brandId +
    " AND campaign_asset.field_type = 'CALLOUT' AND campaign_asset.status != 'REMOVED'");
  var calloutAssets = query22('SELECT asset.id, asset.resource_name, asset.type, asset.callout_asset.callout_text ' +
    'FROM asset WHERE asset.id IN (' + CALLOUT22.remove.id + ',' + CALLOUT22.add.id + ')');
  var openId = numeric22(byKey.open.campaign.id);
  var schedules = query22('SELECT campaign.id, campaign_criterion.resource_name, campaign_criterion.type, ' +
    'campaign_criterion.ad_schedule.day_of_week, ' +
    'campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.start_minute, ' +
    'campaign_criterion.ad_schedule.end_hour, campaign_criterion.ad_schedule.end_minute, campaign_criterion.bid_modifier ' +
    "FROM campaign_criterion WHERE campaign.id = " + openId + " AND campaign_criterion.type = 'AD_SCHEDULE'");
  var sharedLinks = query22('SELECT campaign.id, campaign.name, campaign.status, shared_set.id, campaign_shared_set.status ' +
    'FROM campaign_shared_set WHERE shared_set.id = ' + SHARED_LIST22.id + " AND campaign_shared_set.status = 'ENABLED'");
  var sharedNegatives = query22('SELECT shared_set.id, shared_set.name, shared_criterion.resource_name, shared_criterion.type, ' +
    'shared_criterion.keyword.text, shared_criterion.keyword.match_type FROM shared_criterion WHERE shared_set.id = ' +
    SHARED_LIST22.id + " AND shared_criterion.type = 'KEYWORD'");
  var campaignNegatives = query22('SELECT campaign.id, campaign_criterion.resource_name, campaign_criterion.type, ' +
    'campaign_criterion.negative, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id IN (' + ids + ") " +
    "AND campaign_criterion.type = 'KEYWORD' AND campaign_criterion.negative = TRUE");
  var demographics = query22('SELECT ad_group.id, ad_group_criterion.resource_name, ad_group_criterion.type, ' +
    'ad_group_criterion.negative, ad_group_criterion.status, ad_group_criterion.bid_modifier, ' +
    'ad_group_criterion.age_range.type, ad_group_criterion.income_range.type FROM ad_group_criterion WHERE ' +
    'ad_group.id IN (' + unique22(AGES22.map(function (a) { return a.groupId; }).concat([INCOME22.groupId])).join(',') +
    ") AND ad_group_criterion.type IN ('AGE_RANGE', 'INCOME_RANGE') AND ad_group_criterion.status != 'REMOVED'");
  return { campaigns: byKey, groups: groups, ads: ads, callouts: callouts, calloutAssets: calloutAssets,
    schedules: schedules, sharedLinks: sharedLinks, sharedNegatives: sharedNegatives,
    campaignNegatives: campaignNegatives, demographics: demographics };
}

// Drop volatile per-asset performance labels so the consistency re-read compares creative only.
function slimAd22(row) {
  var ad = row.adGroupAd.ad || {}, rsa = ad.responsiveSearchAd || {};
  return { campaign: { id: String(row.campaign.id) }, adGroup: { id: String(row.adGroup.id) }, adGroupAd: {
    resourceName: row.adGroupAd.resourceName, status: row.adGroupAd.status,
    policySummary: { approvalStatus: (row.adGroupAd.policySummary || {}).approvalStatus || '',
      reviewStatus: (row.adGroupAd.policySummary || {}).reviewStatus || '' },
    ad: { id: String(ad.id), type: ad.type, finalUrls: ad.finalUrls || [], finalMobileUrls: ad.finalMobileUrls || [],
      finalUrlSuffix: ad.finalUrlSuffix || '', trackingUrlTemplate: ad.trackingUrlTemplate || '',
      creative: creative22(rsa) }
  } };
}

function creative22(rsa) {
  function asset(value) {
    var pin = value.pinnedField && value.pinnedField !== 'UNSPECIFIED' ? value.pinnedField : '';
    return pin ? { text: value.text, pinnedField: pin } : { text: value.text };
  }
  return { headlines: (rsa.headlines || []).map(asset), descriptions: (rsa.descriptions || []).map(asset),
    path1: rsa.path1 || '', path2: rsa.path2 || '' };
}

function plan22(state) {
  var removes = [], updates = [], creates = [], notes = [];
  function add(list, kind, context, before, after, operation) {
    list.push({ kind: kind, context: context, before: before, after: after, operation: operation });
  }

  CONFIG22.campaigns.forEach(function (spec) {
    var row = state.campaigns[spec.key], c = row.campaign;
    assert22(c.advertisingChannelType === 'SEARCH', 'Campaign type changed: ' + spec.name);
    assert22(c.biddingStrategyType === 'MANUAL_CPC', 'Bidding strategy changed: ' + spec.name);
    assert22(row.campaignBudget.period === 'DAILY' && Number(row.campaignBudget.amountMicros) === spec.budget * 1000000,
      'Budget changed since review: ' + spec.name + '. No budget will be changed.');
    assert22(spec.statuses.indexOf(c.status) >= 0, 'Campaign status changed: ' + spec.name + ' is ' + c.status);
  });
  function group22(id, name) {
    var g = one22(state.groups.filter(function (r) { return String(r.adGroup.id) === id; }), 'ad group ' + name);
    assert22(g.adGroup.name === name && g.adGroup.status === 'ENABLED', 'Ad group changed: ' + name);
    return g;
  }
  // Demographics must be "Observation" (bidOnly): then only exclusions restrict serving, so removing
  // an exclusion fully re-includes that age and income adjustments change bids, not reach.
  function observation22(id, name, dimension) {
    var restrictions = ((group22(id, name).adGroup.targetingSetting || {}).targetRestrictions || [])
      .filter(function (r) { return r.targetingDimension === dimension; });
    assert22(restrictions.length === 1 && restrictions[0].bidOnly === true,
      name + ' ' + dimension + ' is not set to Observation. Review demographics in the UI before running.');
  }

  if (RUN22.replaceAds) {
    var swaps = [], enables = [];
    STALE22.forEach(function (spec) {
      var resource = PREFIX22 + 'adGroupAds/' + spec.groupId + '~' + spec.adId;
      var rows = state.ads.filter(function (r) { return r.adGroupAd.resourceName === resource; });
      if (!rows.length) { notes.push('ALREADY REMOVED: stale copy ' + spec.adId); return; }
      var stale = rows[0].adGroupAd;
      assert22(stale.status === 'PAUSED' && stale.ad.creative.headlines.some(function (h) { return h.text === spec.marker; }),
        'Stale copy ' + spec.adId + ' is not the paused old-name copy. Review it in the UI.');
      add(removes, 'REMOVE_STALE_COPY', spec.group + ' / ad ' + spec.adId, { status: 'PAUSED', marker: spec.marker }, null,
        { adGroupAdOperation: { remove: resource } });
    });
    ADS22.forEach(function (spec) {
      var campaign = state.campaigns[spec.campaign].campaign;
      var group = group22(spec.groupId, spec.group);
      assert22(String(group.campaign.id) === String(campaign.id), 'Ad group moved: ' + spec.group);
      var resource = PREFIX22 + 'adGroupAds/' + spec.groupId + '~' + spec.adId;
      var old = one22(state.ads.filter(function (r) { return r.adGroupAd.resourceName === resource; }), 'ad ' + resource).adGroupAd;
      assert22(old.ad.type === 'RESPONSIVE_SEARCH_AD', 'Not an RSA: ' + resource);
      assert22(old.ad.finalUrls.length === 1 && old.ad.finalUrls[0] === HOST22 + spec.path &&
        !old.ad.finalMobileUrls.length && !old.ad.finalUrlSuffix && !old.ad.trackingUrlTemplate,
        'Ad URL options changed since review: ' + resource);
      var next = swapCreative22(old.ad.creative, spec.swaps, resource);
      var signature = stable22(next);
      var copies = state.ads.filter(function (r) {
        return r.adGroupAd.resourceName !== resource && String(r.adGroup.id) === spec.groupId &&
          r.adGroupAd.ad.type === 'RESPONSIVE_SEARCH_AD' && stable22(r.adGroupAd.ad.creative) === signature &&
          r.adGroupAd.ad.finalUrls.length === 1 && r.adGroupAd.ad.finalUrls[0] === HOST22 + spec.path;
      });
      assert22(copies.length <= 1, 'More than one corrected copy exists for ' + resource + '. Review in the UI.');
      var label = spec.group + ' / ad ' + spec.adId;
      if (!copies.length) {
        assert22(old.status === 'ENABLED', 'Original is ' + old.status + ' and no corrected copy exists: ' + label +
          '. Check this ad group in the UI.');
        add(creates, 'CREATE_PAUSED_COPY', label, { original: resource }, { status: 'PAUSED', creative: next },
          { adGroupAdOperation: { create: { adGroup: PREFIX22 + 'adGroups/' + spec.groupId, status: 'PAUSED',
            ad: adBody22(next, HOST22 + spec.path) } } });
        return;
      }
      var copy = copies[0].adGroupAd, policy = copy.policySummary;
      var ready = policy.reviewStatus === 'REVIEWED' && ['APPROVED', 'APPROVED_LIMITED'].indexOf(policy.approvalStatus) >= 0;
      notes.push('AD PAIR ' + label + ' | original ' + old.status + ' | copy ' + copy.resourceName + ' ' + copy.status +
        ' | review ' + (policy.reviewStatus || 'UNKNOWN') + ' / ' + (policy.approvalStatus || 'UNKNOWN'));
      if (copy.status === 'ENABLED' && old.status === 'PAUSED') { notes.push('ALREADY SWITCHED: ' + label); return; }
      if (!ready) {
        notes.push((policy.approvalStatus === 'DISAPPROVED' ? 'STOP (disapproved; original keeps running): '
          : 'WAIT for Google review: ') + label);
        return;
      }
      // Pauses go first so the ad group never exceeds Google's three-enabled-RSA limit.
      if (old.status === 'ENABLED') add(swaps, 'PAUSE_ORIGINAL', label, { status: 'ENABLED' }, { status: 'PAUSED' },
        { adGroupAdOperation: { update: { resourceName: resource, status: 'PAUSED' }, updateMask: 'status' } });
      if (copy.status === 'PAUSED') add(enables, 'ENABLE_COPY', label, { status: 'PAUSED' }, { status: 'ENABLED' },
        { adGroupAdOperation: { update: { resourceName: copy.resourceName, status: 'ENABLED' }, updateMask: 'status' } });
    });
    swaps.concat(enables).forEach(function (item) { updates.push(item); });
    state.ads.forEach(function (r) {
      if (r.adGroupAd.status !== 'ENABLED') return;
      r.adGroupAd.ad.creative.headlines.concat(r.adGroupAd.ad.creative.descriptions).forEach(function (a) {
        if (hasOpenClaim22(a.text) && ADS22.every(function (spec) {
          return r.adGroupAd.resourceName !== PREFIX22 + 'adGroupAds/' + spec.groupId + '~' + spec.adId;
        })) notes.push('WARNING: another enabled ad still says "' + a.text + '": ' + r.adGroupAd.resourceName);
      });
    });
  }

  if (RUN22.brandCallout) {
    var brand = state.campaigns.brand.campaign;
    [CALLOUT22.remove, CALLOUT22.add].forEach(function (spec) {
      var asset = one22(state.calloutAssets.filter(function (r) { return String(r.asset.id) === spec.id; }),
        'callout asset ' + spec.id).asset;
      assert22(asset.type === 'CALLOUT' && (asset.calloutAsset || {}).calloutText === spec.text,
        'Callout asset changed: ' + spec.id);
    });
    function link(id) {
      return state.callouts.filter(function (r) { return r.campaignAsset.asset === PREFIX22 + 'assets/' + id; });
    }
    var oldLinks = link(CALLOUT22.remove.id), newLinks = link(CALLOUT22.add.id);
    assert22(oldLinks.length <= 1 && newLinks.length <= 1, 'Duplicate Brand callout links. Review in the UI.');
    if (oldLinks.length) add(removes, 'UNLINK_CALLOUT', 'Brand / ' + CALLOUT22.remove.text,
      { link: oldLinks[0].campaignAsset.resourceName, status: oldLinks[0].campaignAsset.status }, null,
      { campaignAssetOperation: { remove: oldLinks[0].campaignAsset.resourceName } });
    else notes.push('ALREADY UNLINKED: Brand / ' + CALLOUT22.remove.text);
    if (!newLinks.length) add(creates, 'LINK_CALLOUT', 'Brand / ' + CALLOUT22.add.text, null,
      { campaign: brand.resourceName, asset: PREFIX22 + 'assets/' + CALLOUT22.add.id },
      { campaignAssetOperation: { create: { campaign: brand.resourceName, asset: PREFIX22 + 'assets/' + CALLOUT22.add.id,
        fieldType: 'CALLOUT' } } });
    else {
      assert22(newLinks[0].campaignAsset.status === 'ENABLED', 'Brand link to "' + CALLOUT22.add.text + '" is paused; not changing it.');
      notes.push('ALREADY LINKED: Brand / ' + CALLOUT22.add.text);
    }
  }

  if (RUN22.openPlayLate) {
    var open = state.campaigns.open.campaign;
    function find(entry) {
      return state.schedules.filter(function (r) {
        var s = r.campaignCriterion.adSchedule || {};
        return s.dayOfWeek === entry.day && Number(s.startHour) === entry.start[0] && s.startMinute === entry.start[1] &&
          Number(s.endHour) === entry.end[0] && s.endMinute === entry.end[1];
      });
    }
    var fromRows = SCHEDULE22.from.map(find), toRows = SCHEDULE22.to.map(find);
    var fromCount = fromRows.filter(function (rows) { return rows.length; }).length;
    var toCount = toRows.filter(function (rows) { return rows.length; }).length;
    assert22(fromCount === SCHEDULE22.from.length && toCount === 0 || fromCount === 0 && toCount === SCHEDULE22.to.length,
      'Open Play Friday/Saturday schedule differs from the reviewed one. Review in the UI.');
    if (fromCount) {
      fromRows.forEach(function (rows, i) {
        var row = one22(rows, 'schedule ' + SCHEDULE22.from[i].day).campaignCriterion;
        assert22(row.bidModifier === undefined || Number(row.bidModifier) === 1, 'Schedule has a bid adjustment: ' + row.resourceName);
        add(removes, 'REMOVE_SCHEDULE', 'Open Play / ' + describe22(SCHEDULE22.from[i]), { criterion: row.resourceName }, null,
          { campaignCriterionOperation: { remove: row.resourceName } });
      });
      SCHEDULE22.to.forEach(function (entry) {
        add(creates, 'ADD_SCHEDULE', 'Open Play / ' + describe22(entry), null, { schedule: describe22(entry) },
          { campaignCriterionOperation: { create: { campaign: open.resourceName, adSchedule: { dayOfWeek: entry.day,
            startHour: entry.start[0], startMinute: entry.start[1], endHour: entry.end[0], endMinute: entry.end[1] } } } });
      });
    } else notes.push('ALREADY SET: Open Play Friday/Saturday run to midnight Central.');
  }

  if (RUN22.couponNegatives) {
    var brandId = String(state.campaigns.brand.campaign.id);
    var users = state.sharedLinks.filter(function (r) { return String(r.campaign.id) !== brandId; });
    var known = CONFIG22.campaigns.map(function (spec) { return String(state.campaigns[spec.key].campaign.id); });
    users.forEach(function (r) {
      assert22(known.indexOf(String(r.campaign.id)) >= 0, 'Unexpected campaign uses the shared list: ' + r.campaign.name);
    });
    SHARED_LIST22.moved.forEach(function (text) {
      var shared = state.sharedNegatives.filter(function (r) {
        return normalize22(r.sharedCriterion.keyword.text) === text && r.sharedCriterion.keyword.matchType === 'PHRASE';
      });
      assert22(shared.length <= 1, 'Duplicate shared negative "' + text + '".');
      users.forEach(function (u) {
        var present = state.campaignNegatives.some(function (n) {
          return String(n.campaign.id) === String(u.campaign.id) && normalize22(n.campaignCriterion.keyword.text) === text &&
            n.campaignCriterion.keyword.matchType === 'PHRASE';
        });
        if (!present) add(creates, 'ADD_CAMPAIGN_NEGATIVE', u.campaign.name + ' / "' + text + '"', null,
          { negative: '"' + text + '"', campaign: u.campaign.name },
          { campaignCriterionOperation: { create: { campaign: PREFIX22 + 'campaigns/' + u.campaign.id, negative: true,
            keyword: { text: text, matchType: 'PHRASE' } } } });
      });
      if (shared.length) {
        assert22(users.length > 0, 'No other campaign uses the shared list; review before moving "' + text + '".');
        add(removes, 'REMOVE_SHARED_NEGATIVE', SHARED_LIST22.name + ' / "' + text + '"',
          { criterion: shared[0].sharedCriterion.resourceName }, null,
          { sharedCriterionOperation: { remove: shared[0].sharedCriterion.resourceName } });
      } else notes.push('ALREADY MOVED: "' + text + '" is off the shared list.');
    });
  }

  if (RUN22.ageExclusions) {
    AGES22.forEach(function (spec) {
      observation22(spec.groupId, spec.group, 'AGE_RANGE');
      var rows = state.demographics.filter(function (r) {
        return String(r.adGroup.id) === spec.groupId && r.adGroupCriterion.type === 'AGE_RANGE' &&
          (r.adGroupCriterion.ageRange || {}).type === spec.type;
      });
      assert22(rows.length <= 1, 'Duplicate age criterion: ' + spec.group + ' ' + spec.type);
      if (rows.length && rows[0].adGroupCriterion.negative === true) {
        add(removes, 'REMOVE_AGE_EXCLUSION', spec.group + ' / ' + spec.type, { criterion: rows[0].adGroupCriterion.resourceName,
          negative: true }, null, { adGroupCriterionOperation: { remove: rows[0].adGroupCriterion.resourceName } });
      } else {
        notes.push('ALREADY INCLUDED: ' + spec.group + ' / ' + spec.type +
          (rows.length ? '' : ' (no criterion; Google targets it by default)'));
      }
    });
  }

  if (RUN22.birthdayIncome) {
    observation22(INCOME22.groupId, INCOME22.group, 'INCOME_RANGE');
    INCOME22.types.forEach(function (type) {
      var row = one22(state.demographics.filter(function (r) {
        return String(r.adGroup.id) === INCOME22.groupId && r.adGroupCriterion.type === 'INCOME_RANGE' &&
          (r.adGroupCriterion.incomeRange || {}).type === type;
      }), INCOME22.group + ' ' + type).adGroupCriterion;
      assert22(row.negative !== true && row.status === 'ENABLED', 'Income tier is excluded or paused: ' + type);
      var current = row.bidModifier === undefined || row.bidModifier === null ? 1 : Number(row.bidModifier);
      // Google stores bid modifiers as float32 (0.6 reads back as 0.6000000238...), so compare loosely.
      if (Math.abs(current - INCOME22.modifier) < 1e-4) { notes.push('ALREADY SET: ' + INCOME22.group + ' / ' + type); return; }
      assert22(Math.abs(current - 1) < 1e-4, 'Income tier already has a different bid adjustment (' + current + '): ' + type);
      add(updates, 'INCOME_BID_ADJUSTMENT', INCOME22.group + ' / ' + type, { bidModifier: current },
        { bidModifier: INCOME22.modifier },
        { adGroupCriterionOperation: { update: { resourceName: row.resourceName, bidModifier: INCOME22.modifier },
          updateMask: 'bid_modifier' } });
    });
  }

  // Removes first (schedules must not overlap; the old callout link goes before the new one),
  // then updates (ad pauses before enables), then creates.
  return { plan: removes.concat(updates).concat(creates), notes: notes };
}

function swapCreative22(creative, expected, label) {
  var count = 0;
  function swap(map) {
    return function (asset) {
      if (Object.prototype.hasOwnProperty.call(map, asset.text)) {
        count++;
        var out = { text: map[asset.text] };
        if (asset.pinnedField) out.pinnedField = asset.pinnedField;
        return out;
      }
      return asset;
    };
  }
  var next = { headlines: creative.headlines.map(swap(HEADLINE_SWAPS22)),
    descriptions: creative.descriptions.map(swap(DESCRIPTION_SWAPS22)), path1: creative.path1, path2: creative.path2 };
  assert22(count === expected, 'Ad copy changed since review (' + count + ' of ' + expected + ' swaps found): ' + label);
  next.headlines.concat(next.descriptions).forEach(function (asset) {
    assert22(!hasOpenClaim22(asset.text), 'Corrected copy still has an unqualified 1am claim: ' + label);
    assert22(!/take over the (vip )?suite/i.test(asset.text), 'Corrected copy still has a whole-suite claim: ' + label);
    assert22(!/plainfield lanes|formerly/i.test(asset.text), 'Corrected copy still mentions the old name: ' + label);
  });
  var texts = next.headlines.map(function (h) { return h.text.toLowerCase(); });
  assert22(texts.filter(function (t, i) { return texts.indexOf(t) === i; }).length === texts.length,
    'Duplicate headline after swaps: ' + label);
  return next;
}

function adBody22(creative, url) {
  var rsa = { headlines: creative.headlines, descriptions: creative.descriptions };
  if (creative.path1) rsa.path1 = creative.path1;
  if (creative.path2) rsa.path2 = creative.path2;
  return { finalUrls: [url], responsiveSearchAd: rsa };
}

function validateCopy22() {
  Object.keys(HEADLINE_SWAPS22).forEach(function (key) {
    assert22(HEADLINE_SWAPS22[key].length <= 30, 'Headline over 30 characters: ' + HEADLINE_SWAPS22[key]);
  });
  Object.keys(DESCRIPTION_SWAPS22).forEach(function (key) {
    assert22(DESCRIPTION_SWAPS22[key].length <= 90, 'Description over 90 characters: ' + DESCRIPTION_SWAPS22[key]);
  });
}

function hasOpenClaim22(text) { return /\b1\s?am\b/i.test(text) && !/1am fri & sat/i.test(text); }
function describe22(e) {
  function t(h, m) { return (h < 10 ? '0' : '') + h + ':' + ({ ZERO: '00', FIFTEEN: '15', THIRTY: '30', FORTY_FIVE: '45' })[m]; }
  return e.day + ' ' + t(e.start[0], e.start[1]) + '-' + t(e.end[0], e.end[1]) + ' ET';
}
function query22(sql) { var rows = []; var iterator = AdsApp.search(sql); while (iterator.hasNext()) rows.push(iterator.next()); return rows; }
function one22(rows, label) { assert22(rows.length === 1, 'Expected exactly one ' + label + '; found ' + rows.length); return rows[0]; }
function numeric22(value) { assert22(/^\d+$/.test(String(value)), 'Invalid numeric ID'); return String(value); }
function normalize22(value) { return String(value).replace(/^["\[]|["\]]$/g, '').trim().toLowerCase().replace(/\s+/g, ' '); }
function unique22(list) { return list.filter(function (v, i) { return list.indexOf(v) === i; }); }
function stable22(value) {
  if (Array.isArray(value)) return '[' + value.map(stable22).sort().join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stable22(value[key]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
function assert22(condition, message) { if (!condition) throw new Error(message); }
