/**
 * Twisted Pin / Google Ads Script 20 / September 14, 2026
 * Paste this whole file into a NEW Google Ads script. Do not replace/rerun 19.
 * ONE-TIME, UNSCHEDULED. Default DRY_RUN and Google's Preview both make no writes.
 *
 * Apply: seven adult birthday + three holiday keyword URLs; three new sitelink
 * assets with five ad-group associations; four replacement RSAs created PAUSED.
 * Current ads remain enabled. Review/activate replacements separately; this
 * script NEVER enables, pauses, removes or edits an existing ad or keyword.
 * No bid, budget, geo, goal, audience, negative-keyword or campaign changes.
 *
 * All writes use one mutateAll request with partialFailure:false. Each returned
 * result is checked. Save Logs and Changes; a network error can leave the result
 * unknown. Preview fresh state before retrying. API acceptance is not approval.
 * No credentials, external reporting services, emails, Sheets or Drive writes.
 */
var DRY_RUN = true;

var CONFIG20 = {
  customerId: '5778974265',
  campaign: 'Events Campaign 2026 Setup',
  heldCampaigns: {
    'Search_Brand_TwistedPin_2026': 6,
    'Bar-Led_TwistedPin_2026': 6,
    'General & Open Play 2026': 32,
    'Events Campaign 2026 Setup': 35
  },
  maxOperations: 22
};
var HOST20 = 'https://www.twistedpin.com';
var ROUTES20 = [
  { group: 'Birthday & Celebrations', from: ['/birthday-parties/', '/birthday-parties/#adults'],
    to: '/adult-birthday-parties/', keywords: [
      '50th birthday party venue', 'adult birthday party venue',
      'bowling birthday party for adults', '30th birthday party venue',
      'birthday party venue for adults', '40th birthday party venue',
      'adult birthday party venue near me'
    ] },
  { group: 'Corporate Events', from: ['/corporate-events/'], to: '/holiday-parties/', keywords: [
      'corporate holiday party venue', 'holiday party venue', 'holiday party venue near me'
    ] }
];

// These are group-wide ads, not keyword-specific ads. Birthday copy serves the
// mixed birthday group; the keyword override sends adult searches to their page.
// Corporate copy covers general/company holiday events without a holiday-only H1.
var ADS20 = [
  { group: 'Birthday & Celebrations', path: '/birthday-parties/', path1: 'birthdays', path2: 'plainfield',
    headlines: [
      'Birthday Parties in Plainfield', 'Pick Your Kind of Party',
      'Celebrate at Twisted Pin', 'Bowling, Food & Your Crew',
      'A Birthday Worth Planning', '6-Lane VIP Suite', 'Make It Your Kind of Party'
    ], descriptions: [
      'Celebrate in Plainfield with bowling, food and room for your crew. Explore party options.',
      "Kids' packages book online. For an adult birthday, start with Plan My Birthday.",
      'Mark your next milestone with bowling, catering and a semi-private VIP suite.'
    ] },
  { group: 'Corporate Events', path: '/corporate-events/', path1: 'company-events', path2: 'plainfield',
    headlines: [
      'Company Parties in Plainfield', 'Corporate Events, Twisted Pin',
      'Plan Your Company Party', '6-Lane VIP Suite', 'Bowling, Catering & Your Team',
      'Company Holiday Parties', 'Make the Office Party Count'
    ], descriptions: [
      'Team outings, staff celebrations and company holiday parties in Plainfield, IL.',
      'Bring your team together with bowling, catering and a semi-private six-lane VIP suite.',
      'Plan for up to 80 in the VIP suite or up to 200 with a full-venue buyout.',
      'Bowling, catering and craft cocktails. Give your team something to look forward to.'
    ] },
  { group: 'Team Outings', path: '/corporate-events/', path1: 'team-outings', path2: 'plainfield',
    headlines: [
      'Team Outings in Plainfield', 'Staff Outings, Done Right', 'Plan Your Staff Outing',
      'Twisted Pin Team Events', '6-Lane VIP Suite', 'Bowling, Food & Your Team',
      'Give the Group Chat a Plan'
    ], descriptions: [
      'Get the team together in Plainfield for bowling, catering and a change of scenery.',
      'Explore our semi-private six-lane VIP suite. Share your date and headcount to get started.',
      'Staff outings and company celebrations, with space and catering planned around your group.',
      'Bowling, craft cocktails and catering. Give the next team outing a Twisted Pin spin.'
    ] },
  { group: 'Employee Appreciation', path: '/corporate-events/', path1: 'staff-parties', path2: 'plainfield',
    headlines: [
      'Employee Appreciation Events', 'Staff Appreciation Parties',
      'Thank Your Team at Twisted Pin', 'Give Your Team a Night Out',
      '6-Lane VIP Suite', 'Plan Your Team Celebration', 'Company Parties in Plainfield'
    ], descriptions: [
      'Thank your team with bowling, catering and a celebration at Twisted Pin in Plainfield.',
      'Plan a staff appreciation outing with our event team. Start with your date and headcount.',
      'Ask about our semi-private six-lane VIP suite and catering options for your group.',
      'Make it more than a thank-you email: bowling, catering and craft cocktails in Plainfield.'
    ] }
];

var LINKS20 = [
  { name: 'TP20 Adult birthdays v1', text: 'Adult Birthday Parties',
    description1: 'Adult and milestone celebrations', description2: 'Plan with our event team',
    path: '/adult-birthday-parties/', groups: ['Birthday & Celebrations'] },
  { name: 'TP20 Kids birthdays v1', text: "Kids' Birthday Packages",
    description1: 'Choose a package and party time', description2: 'Book your birthday party online',
    path: '/reserve/birthdays/', groups: ['Birthday & Celebrations'] },
  { name: 'TP20 Company holidays v1', text: 'Company Holiday Parties',
    description1: 'Bowling, catering and your team', description2: 'Plan your celebration in Plainfield',
    path: '/holiday-parties/', groups: ['Corporate Events', 'Team Outings', 'Employee Appreciation'] }
];

function main() {
  assert20(typeof DRY_RUN === 'boolean', 'DRY_RUN must be true or false.');
  var account = AdsApp.currentAccount();
  assert20(String(account.getCustomerId()).replace(/\D/g, '') === CONFIG20.customerId,
    'Wrong account. Expected Twisted Pin 577-897-4265.');
  assert20(account.getCurrencyCode() === 'USD', 'Expected USD.');
  var readonly = DRY_RUN || AdsApp.getExecutionInfo().isPreview();
  Logger.log('SCRIPT 20 | ' + new Date().toISOString() + ' | account timezone ' + account.getTimeZone());
  Logger.log(readonly ? 'READ-ONLY PLAN' : 'LIVE: URLs, sitelinks, PAUSED ad drafts');
  validateCopy20();
  var state = readState20();
  var plan = plan20(state);
  checkLandings20();
  assert20(plan.length <= CONFIG20.maxOperations, 'Unexpected operation count: ' + plan.length);
  Logger.log('PREFLIGHT PASSED | planned operations: ' + plan.length);
  plan.forEach(function (item, index) { Logger.log('PLAN ' + (index + 1) + ': ' + JSON.stringify(item)); });
  if (readonly || !plan.length) {
    Logger.log('NO ADS CHANGES MADE. Read Logs; our Preview intentionally does not call mutators.');
    Logger.log('After reviewing: set DRY_RUN = false, Save, Run once. Do not schedule.');
    return;
  }

  // Re-read before submitting. Detect edits made while public pages were checked.
  assert20(stable20(state) === stable20(readState20()), 'Account state changed during preflight. Preview again.');
  Logger.log('BEFORE: save the PLAN entries above as the rollback record.');
  var results;
  try {
    results = AdsApp.mutateAll(plan.map(function (item) { return item.operation; }), { partialFailure: false });
  } catch (error) {
    Logger.log('REQUEST ERROR: outcome may be unknown. Inspect Changes and Preview fresh state before retrying.');
    throw error;
  }
  assert20(results && results.length === plan.length,
    'Unexpected result count. Do not assume completion; inspect Changes and Preview.');
  var failures = [];
  results.forEach(function (result, index) {
    if (result.isSuccessful()) {
      Logger.log('ACCEPTED ' + (index + 1) + ': ' + result.getResourceName() + ' | ' + plan[index].kind);
    } else {
      var detail = JSON.stringify(result.getErrorMessages());
      Logger.log('REJECTED ' + (index + 1) + ': ' + detail);
      failures.push(detail);
    }
  });
  assert20(!failures.length, 'Google rejected the atomic request. Inspect Changes and Preview fresh state.');
  Logger.log('ACCEPTED: ' + results.length + ' operations. This does not confirm policy approval or serving.');
  Logger.log('The four new RSAs are PAUSED. Existing ads were not changed. Review before activation.');
  Logger.log('Set DRY_RUN back to true and Preview fresh state. An unchanged rerun should plan zero operations.');
}

function readState20() {
  var campaigns = query20('SELECT campaign.id, campaign.name, campaign.status, campaign.bidding_strategy_type, ' +
    'campaign.advertising_channel_type, campaign_budget.amount_micros, campaign_budget.period ' +
    "FROM campaign WHERE campaign.status != 'REMOVED' AND campaign.experiment_type = 'BASE'")
    .filter(function (row) { return Object.prototype.hasOwnProperty.call(CONFIG20.heldCampaigns, row.campaign.name); });
  Object.keys(CONFIG20.heldCampaigns).forEach(function (name) {
    var row = one20(campaigns.filter(function (r) { return r.campaign.name === name; }), 'campaign ' + name);
    assert20(row.campaign.status === 'ENABLED' && row.campaign.advertisingChannelType === 'SEARCH',
      'Campaign status/type changed: ' + name);
    assert20(row.campaign.biddingStrategyType === 'MANUAL_CPC', 'Bidding strategy changed: ' + name);
    assert20(row.campaignBudget.period === 'DAILY' &&
      Number(row.campaignBudget.amountMicros) === CONFIG20.heldCampaigns[name] * 1000000,
      'Budget changed since review: ' + name + '. No budget will be reset.');
  });
  var campaign = one20(campaigns.filter(function (r) { return r.campaign.name === CONFIG20.campaign; }), 'Events campaign');
  var id = numeric20(campaign.campaign.id);
  var groups = query20('SELECT ad_group.id, ad_group.resource_name, ad_group.name, ad_group.status ' +
    "FROM ad_group WHERE campaign.id = " + id + " AND ad_group.status != 'REMOVED'")
    .filter(function (row) { return ADS20.some(function (spec) { return spec.group === row.adGroup.name; }); });
  ADS20.forEach(function (spec) {
    var group = one20(groups.filter(function (r) { return r.adGroup.name === spec.group; }), 'ad group ' + spec.group);
    assert20(group.adGroup.status === 'ENABLED', 'Ad group not enabled: ' + spec.group);
  });
  var ids = groups.map(function (r) { return numeric20(r.adGroup.id); }).join(',');
  var where = ' WHERE ad_group.id IN (' + ids + ')';
  var keywords = query20('SELECT ad_group.id, ad_group_criterion.resource_name, ad_group_criterion.status, ' +
    'ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.final_urls, ' +
    'ad_group_criterion.final_mobile_urls, ad_group_criterion.tracking_url_template, ' +
    'ad_group_criterion.final_url_suffix, ad_group_criterion.url_custom_parameters ' +
    'FROM keyword_view' + where + " AND ad_group_criterion.status != 'REMOVED' AND ad_group_criterion.negative = FALSE");
  var ads = query20('SELECT ad_group.id, ad_group_ad.resource_name, ad_group_ad.status, ad_group_ad.ad.id, ' +
    'ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls, ' +
    'ad_group_ad.ad.tracking_url_template, ad_group_ad.ad.final_url_suffix, ad_group_ad.ad.url_custom_parameters, ' +
    'ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ' +
    'ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2 ' +
    'FROM ad_group_ad' + where + " AND ad_group_ad.status != 'REMOVED'");
  var assets = query20('SELECT asset.resource_name, asset.name, asset.final_urls, asset.final_mobile_urls, ' +
    'asset.tracking_url_template, asset.final_url_suffix, asset.url_custom_parameters, ' +
    'asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2, ' +
    'asset.sitelink_asset.start_date, asset.sitelink_asset.end_date, asset.sitelink_asset.ad_schedule_targets ' +
    "FROM asset WHERE asset.type = 'SITELINK' AND asset.name LIKE 'TP20 %'");
  var links = query20('SELECT ad_group_asset.resource_name, ad_group_asset.ad_group, ad_group_asset.asset, ' +
    'ad_group_asset.status FROM ad_group_asset' + where +
    " AND ad_group_asset.field_type = 'SITELINK' AND ad_group_asset.status != 'REMOVED'");
  return { campaigns: campaigns, groups: groups, keywords: keywords, ads: ads, assets: assets, links: links };
}

function plan20(state) {
  var plan = [];
  function add(kind, context, before, operation) {
    plan.push({ kind: kind, context: context, before: before, operation: operation });
  }
  function group(name) {
    return one20(state.groups.filter(function (r) { return r.adGroup.name === name; }), name).adGroup;
  }
  ROUTES20.forEach(function (route) {
    var targetGroup = group(route.group);
    route.keywords.forEach(function (text) {
      var row = one20(state.keywords.filter(function (r) {
        return String(r.adGroup.id) === String(targetGroup.id) &&
          r.adGroupCriterion.keyword.matchType === 'EXACT' && normalize20(r.adGroupCriterion.keyword.text) === text;
      }), 'EXACT [' + text + '] in ' + route.group);
      var criterion = row.adGroupCriterion;
      if (criterion.status === 'PAUSED') { Logger.log('SKIP paused keyword: [' + text + ']'); return; }
      assert20(criterion.status === 'ENABLED', 'Unexpected keyword status: ' + text);
      var before = { finalUrls: criterion.finalUrls || [], finalMobileUrls: criterion.finalMobileUrls || [] };
      assert20(before.finalUrls.length === 1 && before.finalMobileUrls.length <= 1, 'Unexpected URL count: ' + text);
      var update = { resourceName: criterion.resourceName };
      var mask = [];
      var url = destination20(before.finalUrls[0], route.from, route.to);
      if (url !== before.finalUrls[0]) { update.finalUrls = [url]; mask.push('final_urls'); }
      if (before.finalMobileUrls.length) {
        var mobile = destination20(before.finalMobileUrls[0], route.from, route.to);
        if (mobile !== before.finalMobileUrls[0]) { update.finalMobileUrls = [mobile]; mask.push('final_mobile_urls'); }
      }
      if (mask.length) add('KEYWORD_URL', route.group + ' / [' + text + ']', before,
        { adGroupCriterionOperation: { update: update, updateMask: mask.join(',') } });
    });
  });

  LINKS20.forEach(function (spec, index) {
    var existing = state.assets.filter(function (row) { return row.asset.name === spec.name; });
    assert20(existing.length <= 1, 'Duplicate script sitelink name: ' + spec.name);
    var desired = { name: spec.name, finalUrls: [HOST20 + spec.path], sitelinkAsset: {
      linkText: spec.text, description1: spec.description1, description2: spec.description2
    } };
    var resource;
    if (existing.length) {
      var asset = existing[0].asset;
      assert20(sameSitelink20(asset, desired), 'Script sitelink was edited; refusing to overwrite: ' + spec.name);
      resource = asset.resourceName;
    } else {
      resource = 'customers/' + CONFIG20.customerId + '/assets/' + (-1 - index);
      desired.resourceName = resource;
      add('CREATE_SITELINK', spec.name, null, { assetOperation: { create: desired } });
    }
    spec.groups.forEach(function (name) {
      var target = group(name).resourceName;
      var associated = state.links.filter(function (r) {
        return r.adGroupAsset.adGroup === target && r.adGroupAsset.asset === resource;
      });
      assert20(associated.length <= 1, 'Duplicate sitelink association: ' + name);
      if (associated.length) {
        assert20(associated[0].adGroupAsset.status === 'ENABLED', 'Script sitelink association is paused: ' + name);
      } else {
        add('ATTACH_SITELINK', name + ' / ' + spec.text, null, { adGroupAssetOperation: {
          create: { adGroup: target, asset: resource, fieldType: 'SITELINK', status: 'ENABLED' }
        } });
      }
    });
  });

  ADS20.forEach(function (spec) {
    var target = group(spec.group);
    var rows = state.ads.filter(function (r) { return String(r.adGroup.id) === String(target.id); });
    var creative = creative20(spec);
    var replacements = rows.filter(function (r) {
      return r.adGroupAd.ad.type === 'RESPONSIVE_SEARCH_AD' && sameCreative20(r.adGroupAd.ad.responsiveSearchAd, creative);
    });
    assert20(replacements.length <= 1, 'Duplicate replacement RSA: ' + spec.group);
    var active = rows.filter(function (r) { return r.adGroupAd.status === 'ENABLED' && replacements.indexOf(r) < 0; });
    assert20(active.length <= 1, 'Multiple existing enabled ads; review before choosing a tracking source: ' + spec.group);
    if (replacements.length && !active.length) {
      assert20(replacements[0].adGroupAd.status === 'ENABLED', 'No enabled source or replacement ad: ' + spec.group);
    } else {
      assert20(active.length === 1, 'Expected one enabled source ad in ' + spec.group);
    }
    var source = (active[0] || replacements[0]).adGroupAd.ad;
    assert20(source.type === 'RESPONSIVE_SEARCH_AD', 'Enabled source is not an RSA: ' + spec.group);
    assert20((source.finalUrls || []).length === 1 && (source.finalMobileUrls || []).length <= 1,
      'Unexpected source ad URL count: ' + spec.group);
    var from = spec.path === '/birthday-parties/' ? ['/birthday-parties/', '/birthday-parties/#adults'] : [spec.path];
    var ad = { responsiveSearchAd: creative, finalUrls: [destination20(source.finalUrls[0], from, spec.path)] };
    if ((source.finalMobileUrls || []).length) ad.finalMobileUrls = [destination20(source.finalMobileUrls[0], from, spec.path)];
    ['trackingUrlTemplate', 'finalUrlSuffix', 'urlCustomParameters'].forEach(function (key) {
      if (source[key] && (!Array.isArray(source[key]) || source[key].length)) ad[key] = source[key];
    });
    if (replacements.length) {
      assert20(sameAdUrls20(replacements[0].adGroupAd.ad, ad), 'Replacement URL/tracking drift: ' + spec.group);
      Logger.log('EXISTING DRAFT/REPLACEMENT: ' + spec.group + ' | ' + replacements[0].adGroupAd.resourceName +
        ' | ' + replacements[0].adGroupAd.status);
    } else {
      add('CREATE_PAUSED_RSA', spec.group, { sourceAd: active[0].adGroupAd.resourceName,
        sourceStatus: active[0].adGroupAd.status, sourceAdCopy: source },
        { adGroupAdOperation: { create: { adGroup: target.resourceName, status: 'PAUSED', ad: ad } } });
    }
  });
  return plan;
}

function destination20(value, allowed, target) {
  var parts = String(value || '').match(/^https:\/\/(www\.)?twistedpin\.com(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);
  assert20(parts, 'Unexpected destination host/protocol: ' + value);
  var current = (parts[2] || '/') + (parts[4] || '');
  assert20(current === target || allowed.indexOf(current) >= 0, 'Destination changed since review: ' + value);
  return HOST20 + target + (parts[3] || ''); // Preserve the query verbatim; remove only the expected #adults.
}

function creative20(spec) {
  return { headlines: spec.headlines.map(function (text, index) {
    return index === 0 ? { text: text, pinnedField: 'HEADLINE_1' } : { text: text };
  }), descriptions: spec.descriptions.map(function (text) { return { text: text }; }), path1: spec.path1, path2: spec.path2 };
}
function sameCreative20(a, b) {
  function clean(value) {
    return { headlines: (value.headlines || []).map(asset), descriptions: (value.descriptions || []).map(asset),
      path1: value.path1 || '', path2: value.path2 || '' };
  }
  function asset(value) { return { text: value.text, pin: !value.pinnedField || value.pinnedField === 'UNSPECIFIED' ? '' : value.pinnedField }; }
  return stable20(clean(a || {})) === stable20(clean(b));
}
function urlFields20(value) {
  return { finalUrls: value.finalUrls || [], finalMobileUrls: value.finalMobileUrls || [],
    trackingUrlTemplate: value.trackingUrlTemplate || '', finalUrlSuffix: value.finalUrlSuffix || '',
    urlCustomParameters: (value.urlCustomParameters || []).slice().sort(function (a, b) { return a.key.localeCompare(b.key); }) };
}
function sameAdUrls20(a, b) { return stable20(urlFields20(a)) === stable20(urlFields20(b)); }
function sameSitelink20(a, b) {
  var sitelink = a.sitelinkAsset || {};
  return sameAdUrls20(a, b) && sitelink.linkText === b.sitelinkAsset.linkText &&
    (sitelink.description1 || '') === b.sitelinkAsset.description1 &&
    (sitelink.description2 || '') === b.sitelinkAsset.description2 &&
    !sitelink.startDate && !sitelink.endDate && !(sitelink.adScheduleTargets || []).length;
}
function validateCopy20() {
  function text(value, max) {
    assert20(typeof value === 'string' && value.length > 0 && value.length <= max, 'Invalid copy length (' + max + '): ' + value);
    assert20(!/(^|[^-\w])private\b|cheap|discount|budget-friendly|chef-(driven|inspired)|main floor|yours for the night|last call/i.test(value),
      'Unapproved marketing claim: ' + value);
  }
  ADS20.forEach(function (spec) {
    assert20(spec.headlines.length >= 3 && spec.headlines.length <= 15 && spec.descriptions.length >= 2 && spec.descriptions.length <= 4,
      'Invalid RSA asset count: ' + spec.group);
    spec.headlines.forEach(function (item) { text(item, 30); });
    spec.descriptions.forEach(function (item) { text(item, 90); });
    text(spec.path1, 15); text(spec.path2, 15);
  });
  LINKS20.forEach(function (spec) { text(spec.text, 25); text(spec.description1, 35); text(spec.description2, 35); });
}

function checkLandings20() {
  [
    { path: '/adult-birthday-parties/', content: /Plan My Birthday/i },
    { path: '/holiday-parties/', content: /Plan My Holiday Party/i },
    { path: '/birthday-parties/', content: /Kids.*birthdays/i },
    { path: '/corporate-events/', content: /team outings|staff outings/i },
    { path: '/reserve/birthdays/', content: /birthday/i }
  ].forEach(function (page) {
    var response = UrlFetchApp.fetch(HOST20 + page.path, { muteHttpExceptions: true, followRedirects: false });
    assert20(response.getResponseCode() === 200, 'Landing page must return 200 without redirects: ' + page.path);
    var html = response.getContentText();
    assert20(/<h1\b/i.test(html) && page.content.test(html), 'Expected landing content missing: ' + page.path);
    assert20(!/<meta\b[^>]*\bcontent=["'][^"']*\bnoindex\b/i.test(html), 'Landing page is noindex: ' + page.path);
    Logger.log('LANDING OK: ' + HOST20 + page.path);
  });
}

function query20(sql) { var rows = []; var iterator = AdsApp.search(sql); while (iterator.hasNext()) rows.push(iterator.next()); return rows; }
function one20(rows, label) { assert20(rows.length === 1, 'Expected exactly one ' + label + '; found ' + rows.length); return rows[0]; }
function numeric20(value) { assert20(/^\d+$/.test(String(value)), 'Invalid numeric ID'); return String(value); }
function normalize20(value) { return String(value).replace(/^\[|\]$/g, '').trim().toLowerCase().replace(/\s+/g, ' '); }
function stable20(value) {
  if (Array.isArray(value)) return '[' + value.map(stable20).sort().join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stable20(value[key]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
function assert20(condition, message) { if (!condition) throw new Error(message); }
