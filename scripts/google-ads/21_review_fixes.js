/**
 * Twisted Pin / Google Ads Script 21 / September 25, 2026
 * Paste this whole file into a NEW Google Ads script. Do not replace or rerun 19, 20 or 20B.
 * ONE-TIME, UNSCHEDULED. Default DRY_RUN and Google's Preview both make no writes.
 *
 * From the September 25 mid-window review. Five sections, each with a RUN21 switch:
 *   fundraiserRoutes  two exact fundraiser keywords: /birthday-parties/ -> /fundraisers/
 *   brandSitelinks    link the three existing Script 20 sitelinks to the Brand campaign
 *   trackingSuffix    campaign-level final URL suffix (UTM tags) on all four campaigns
 *   networkHygiene    Search Partners and Display switched OFF where either is still on
 *   pauseBarLed       pause Bar-Led_TwistedPin_2026 (its $6/day budget is left as is)
 * Never touched: ads/RSAs, bids, budgets, geo, audiences, keyword status, negatives,
 * conversion goals, and asset content. No asset is created, edited or removed.
 *
 * All writes use one mutateAll request with partialFailure:false. Each returned result
 * is checked. A network error can leave the outcome unknown: inspect Changes and Preview
 * fresh state before retrying. API acceptance is not policy approval or serving.
 * No credentials, external reporting services, emails, Sheets or Drive writes.
 */
var DRY_RUN = true;

var RUN21 = {
  fundraiserRoutes: true,
  brandSitelinks: true,
  trackingSuffix: true,
  networkHygiene: true,
  pauseBarLed: true
};

var CONFIG21 = {
  customerId: '5778974265',
  campaigns: [
    { key: 'brand', name: 'Search_Brand_TwistedPin_2026', budget: 6, slug: 'brand' },
    { key: 'bar', name: 'Bar-Led_TwistedPin_2026', budget: 6, slug: 'bar' },
    { key: 'open', name: 'General & Open Play 2026', budget: 32, slug: 'open-play' },
    { key: 'events', name: 'Events Campaign 2026 Setup', budget: 35, slug: 'events' }
  ],
  maxOperations: 9
};
var HOST21 = 'https://www.twistedpin.com';
var PREFIX21 = 'customers/' + CONFIG21.customerId + '/';

var FUNDRAISER21 = { campaign: 'events', group: 'Birthday & Celebrations',
  keywords: ['fundraiser venue', 'bowling fundraiser'], from: ['/birthday-parties/'], to: '/fundraisers/' };

// Existing sitelink assets created by Script 20 (accepted IDs in 20_live_2026-09-14.md).
// Their ad-group links in the Events campaign are not touched.
var BRAND_LINKS21 = [
  { id: '421097763806', text: 'Adult Birthday Parties', path: '/adult-birthday-parties/' },
  { id: '421280548245', text: "Kids' Birthday Packages", path: '/reserve/birthdays/' },
  { id: '421280548254', text: 'Company Holiday Parties', path: '/holiday-parties/' }
];

// Readable campaign slug + ValueTrack ad group, physical location and keyword. The
// site's gclid pass-through forwards utm_* to the event-inquiry form, so Avery's
// inquiry rows can be placed by campaign, ad group and town. Count Google leads by
// gclid, never by the attribution_source string (WF1 appends the campaign to it).
function suffix21(slug) {
  return 'utm_source=google&utm_medium=cpc&utm_campaign=' + slug +
    '&utm_content={adgroupid}_{loc_physical_ms}&utm_term={keyword}';
}

var SAMPLE_QUERY21 = '?utm_source=google&utm_medium=cpc&utm_campaign=script21-check&utm_content=0_0&utm_term=bowling%20near%20me';
var LANDINGS21 = [
  { path: '/fundraisers/', content: /Plan Your Fundraiser/i, section: 'fundraiserRoutes' },
  { path: '/adult-birthday-parties/', content: /Plan My Birthday/i, section: 'brandSitelinks' },
  { path: '/reserve/birthdays/', content: /birthday/i, section: 'brandSitelinks' },
  { path: '/holiday-parties/', content: /Plan My Holiday Party/i, section: 'brandSitelinks' },
  // Tagged URLs must still render the real page (no redirect, no error page).
  { path: '/bowl/' + SAMPLE_QUERY21, content: /bowl/i, section: 'trackingSuffix' },
  { path: '/reserve/' + SAMPLE_QUERY21, content: /reserve/i, section: 'trackingSuffix' },
  { path: '/birthday-parties/' + SAMPLE_QUERY21, content: /birthday/i, section: 'trackingSuffix' },
  { path: '/corporate-events/' + SAMPLE_QUERY21, content: /team outings|staff outings/i, section: 'trackingSuffix' }
];

function main() {
  assert21(typeof DRY_RUN === 'boolean', 'DRY_RUN must be true or false.');
  Object.keys(RUN21).forEach(function (key) {
    assert21(typeof RUN21[key] === 'boolean', 'RUN21.' + key + ' must be true or false.');
  });
  var account = AdsApp.currentAccount();
  assert21(String(account.getCustomerId()).replace(/\D/g, '') === CONFIG21.customerId,
    'Wrong account. Expected Twisted Pin 577-897-4265.');
  assert21(account.getCurrencyCode() === 'USD', 'Expected USD.');
  var readonly = DRY_RUN || AdsApp.getExecutionInfo().isPreview();
  Logger.log('SCRIPT 21 | ' + new Date().toISOString() + ' | account timezone ' + account.getTimeZone());
  Logger.log(readonly ? 'READ-ONLY PLAN' : 'LIVE: keyword URLs, Brand sitelink links, campaign settings');
  Logger.log('SECTIONS: ' + JSON.stringify(RUN21));
  validateConfig21();
  var state = readState21();
  report21(state);
  bestEffort21(state);
  var plan = plan21(state);
  checkLandings21();
  assert21(plan.length <= CONFIG21.maxOperations, 'Unexpected operation count: ' + plan.length);
  Logger.log('PREFLIGHT PASSED | planned operations: ' + plan.length);
  plan.forEach(function (item, index) { Logger.log('PLAN ' + (index + 1) + ': ' + JSON.stringify(item)); });
  if (readonly || !plan.length) {
    Logger.log('NO ADS CHANGES MADE. Read Logs; this Preview intentionally does not call mutators.');
    if (plan.length) Logger.log('After reviewing: set DRY_RUN = false, Save, Run once. Do not schedule.');
    return;
  }

  // Re-read before submitting. Detect edits made while the public pages were checked.
  assert21(stable21(state) === stable21(readState21()), 'Account state changed during preflight. Preview again.');
  Logger.log('BEFORE: save the PLAN entries above as the rollback record.');
  var results;
  try {
    results = AdsApp.mutateAll(plan.map(function (item) { return item.operation; }), { partialFailure: false });
  } catch (error) {
    Logger.log('REQUEST ERROR: outcome may be unknown. Inspect Changes and Preview fresh state before retrying.');
    throw error;
  }
  assert21(results && results.length === plan.length,
    'Unexpected result count. Do not assume completion; inspect Changes and Preview.');
  var failures = [];
  results.forEach(function (result, index) {
    if (result.isSuccessful()) {
      Logger.log('ACCEPTED ' + (index + 1) + ': ' + result.getResourceName() + ' | ' + plan[index].kind +
        ' | ' + plan[index].context);
    } else {
      var detail = JSON.stringify(result.getErrorMessages());
      Logger.log('REJECTED ' + (index + 1) + ': ' + detail);
      failures.push(detail);
    }
  });
  assert21(!failures.length, 'Google rejected the atomic request. Inspect Changes and Preview fresh state.');
  Logger.log('ACCEPTED: ' + results.length + ' operations. This does not confirm serving or policy review.');
  if (plan.some(function (item) { return item.after && item.after.status === 'PAUSED'; })) {
    Logger.log('Bar-Led is paused. Its $6/day budget is unchanged; set the campaign back to Enabled to undo.');
  }
  Logger.log('Set DRY_RUN back to true and Preview fresh state. An unchanged rerun should plan zero operations.');
}

function readState21() {
  var campaigns = query21('SELECT campaign.id, campaign.resource_name, campaign.name, campaign.status, ' +
    'campaign.experiment_type, campaign.advertising_channel_type, campaign.bidding_strategy_type, ' +
    'campaign.final_url_suffix, campaign.tracking_url_template, ' +
    'campaign.network_settings.target_google_search, campaign.network_settings.target_search_network, ' +
    'campaign.network_settings.target_content_network, campaign_budget.amount_micros, campaign_budget.period ' +
    "FROM campaign WHERE campaign.status != 'REMOVED' AND campaign.experiment_type = 'BASE'")
    .filter(function (row) {
      return CONFIG21.campaigns.some(function (spec) { return spec.name === row.campaign.name; });
    });
  var byKey = {};
  CONFIG21.campaigns.forEach(function (spec) {
    byKey[spec.key] = one21(campaigns.filter(function (r) { return r.campaign.name === spec.name; }), 'campaign ' + spec.name);
  });
  var ids = CONFIG21.campaigns.map(function (spec) { return numeric21(byKey[spec.key].campaign.id); }).join(',');
  var brandId = numeric21(byKey.brand.campaign.id);
  var customer = one21(query21('SELECT customer.id, customer.final_url_suffix, customer.tracking_url_template, ' +
    'customer.auto_tagging_enabled FROM customer'), 'customer row');
  var groups = query21('SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ' +
    'ad_group.final_url_suffix, ad_group.tracking_url_template FROM ad_group ' +
    'WHERE campaign.id IN (' + ids + ") AND ad_group.status != 'REMOVED'");
  var keywords = query21('SELECT campaign.id, ad_group.id, ad_group.name, ad_group_criterion.resource_name, ' +
    'ad_group_criterion.status, ad_group_criterion.negative, ad_group_criterion.keyword.text, ' +
    'ad_group_criterion.keyword.match_type, ad_group_criterion.final_urls, ad_group_criterion.final_mobile_urls, ' +
    'ad_group_criterion.final_url_suffix, ad_group_criterion.tracking_url_template FROM keyword_view ' +
    'WHERE campaign.id IN (' + ids + ") AND ad_group_criterion.status != 'REMOVED' AND ad_group_criterion.negative = FALSE");
  var ads = query21('SELECT campaign.id, ad_group.id, ad_group_ad.resource_name, ad_group_ad.status, ' +
    'ad_group_ad.ad.final_url_suffix, ad_group_ad.ad.tracking_url_template FROM ad_group_ad ' +
    'WHERE campaign.id IN (' + ids + ") AND ad_group_ad.status != 'REMOVED'");
  var brandLinks = query21('SELECT campaign.id, campaign_asset.resource_name, campaign_asset.asset, ' +
    'campaign_asset.field_type, campaign_asset.status FROM campaign_asset WHERE campaign.id = ' + brandId +
    " AND campaign_asset.field_type = 'SITELINK' AND campaign_asset.status != 'REMOVED'");
  var brandGroupIds = groups.filter(function (r) { return String(r.campaign.id) === brandId; })
    .map(function (r) { return numeric21(r.adGroup.id); });
  // Every WHERE-referenced ID is also selected (the Script 20 Preview lesson).
  var brandGroupLinks = brandGroupIds.length ? query21('SELECT ad_group.id, ad_group_asset.resource_name, ' +
    'ad_group_asset.field_type, ad_group_asset.status FROM ad_group_asset WHERE ad_group.id IN (' +
    brandGroupIds.join(',') + ") AND ad_group_asset.field_type = 'SITELINK' AND ad_group_asset.status != 'REMOVED'") : [];
  var assets = query21('SELECT asset.id, asset.resource_name, asset.type, asset.final_urls, asset.final_mobile_urls, ' +
    'asset.final_url_suffix, asset.tracking_url_template, asset.sitelink_asset.link_text FROM asset WHERE asset.id IN (' +
    BRAND_LINKS21.map(function (link) { return numeric21(link.id); }).join(',') + ')');
  return { campaigns: byKey, customer: customer, groups: groups, keywords: keywords, ads: ads,
    brandLinks: brandLinks, brandGroupLinks: brandGroupLinks, assets: assets };
}

function report21(state) {
  CONFIG21.campaigns.forEach(function (spec) {
    var row = state.campaigns[spec.key], c = row.campaign, ns = c.networkSettings || {};
    Logger.log('CAMPAIGN ' + spec.name + ' | status ' + c.status + ' | budget $' +
      (Number(row.campaignBudget.amountMicros) / 1000000) + '/day | ' + c.biddingStrategyType +
      ' | Search Partners ' + (ns.targetSearchNetwork === true ? 'ON' : 'off') +
      ' | Display ' + (ns.targetContentNetwork === true ? 'ON' : 'off') +
      ' | final URL suffix: ' + (c.finalUrlSuffix || '(none)') +
      ' | tracking template: ' + (c.trackingUrlTemplate || '(none)'));
  });
  var customer = state.customer.customer || {};
  Logger.log('ACCOUNT | auto-tagging ' + (customer.autoTaggingEnabled === true ? 'ON' : 'OFF - gclid is not being added') +
    ' | final URL suffix: ' + (customer.finalUrlSuffix || '(none)') +
    ' | tracking template: ' + (customer.trackingUrlTemplate || '(none)'));
  var overrides = [];
  state.groups.forEach(function (r) {
    if (r.adGroup.finalUrlSuffix || r.adGroup.trackingUrlTemplate) overrides.push('ad group ' + r.adGroup.name);
  });
  state.keywords.forEach(function (r) {
    var k = r.adGroupCriterion;
    if (k.finalUrlSuffix || k.trackingUrlTemplate) overrides.push('keyword [' + k.keyword.text + '] in ' + r.adGroup.name);
  });
  state.ads.forEach(function (r) {
    var ad = r.adGroupAd.ad || {};
    if (ad.finalUrlSuffix || ad.trackingUrlTemplate) overrides.push('ad ' + r.adGroupAd.resourceName);
  });
  Logger.log(overrides.length
    ? 'WARNING: lower-level URL options exist and keep precedence over a campaign suffix: ' + overrides.join('; ')
    : 'LOWER-LEVEL URL OPTIONS: none (a campaign suffix will apply to every keyword, ad and sitelink).');
  var enabledBrand = state.brandLinks.filter(function (r) { return r.campaignAsset.status === 'ENABLED'; }).length;
  Logger.log('BRAND SITELINKS | campaign level: ' + enabledBrand + ' enabled | ad-group level: ' +
    state.brandGroupLinks.length);
}

// Read-only visibility for Google's September AI Max auto-upgrade. Field support
// varies by API version, so a failed read is logged, never fatal, and never written.
function bestEffort21(state) {
  var ids = CONFIG21.campaigns.map(function (spec) { return numeric21(state.campaigns[spec.key].campaign.id); }).join(',');
  [
    { label: 'AI Max', field: 'campaign.ai_max_setting.enable_ai_max', pick: function (c) { return c.aiMaxSetting || {}; } },
    { label: 'Text asset automation', field: 'campaign.asset_automation_settings',
      pick: function (c) { return c.assetAutomationSettings || []; } },
    { label: 'Campaign-level match type', field: 'campaign.keyword_match_type',
      pick: function (c) { return c.keywordMatchType || 'UNSPECIFIED'; } }
  ].forEach(function (check) {
    try {
      query21('SELECT campaign.id, campaign.name, ' + check.field + ' FROM campaign WHERE campaign.id IN (' + ids + ')')
        .forEach(function (row) {
          Logger.log('CHECK ' + check.label + ' | ' + row.campaign.name + ' | ' + JSON.stringify(check.pick(row.campaign)));
        });
    } catch (error) {
      Logger.log('CHECK ' + check.label + ' | unavailable in this API version: ' + (error && error.message));
    }
  });
}

function plan21(state) {
  var plan = [];
  var updates = {};
  function add(kind, context, before, after, operation) {
    plan.push({ kind: kind, context: context, before: before, after: after, operation: operation });
  }
  function spec21(key) { return CONFIG21.campaigns.filter(function (spec) { return spec.key === key; })[0]; }
  function queue(spec, path, mask, before, after) {
    var campaign = state.campaigns[spec.key].campaign;
    var entry = updates[spec.key] || (updates[spec.key] = {
      update: { resourceName: campaign.resourceName }, mask: [], before: {}, after: {}
    });
    setPath21(entry.update, path, after);
    entry.mask.push(mask);
    entry.before[path] = before;
    entry.after[path] = after;
  }

  // Held account state: the reviewed campaigns, strategy and budgets. Nothing here is reset.
  CONFIG21.campaigns.forEach(function (spec) {
    var row = state.campaigns[spec.key], c = row.campaign, ns = c.networkSettings || {};
    assert21(c.advertisingChannelType === 'SEARCH', 'Campaign type changed: ' + spec.name);
    assert21(c.biddingStrategyType === 'MANUAL_CPC', 'Bidding strategy changed: ' + spec.name);
    assert21(row.campaignBudget.period === 'DAILY' && Number(row.campaignBudget.amountMicros) === spec.budget * 1000000,
      'Budget changed since review: ' + spec.name + '. No budget will be changed.');
    var allowed = spec.key === 'bar' ? ['ENABLED', 'PAUSED'] : ['ENABLED'];
    assert21(allowed.indexOf(c.status) >= 0, 'Campaign status changed: ' + spec.name + ' is ' + c.status);
    assert21(ns.targetGoogleSearch === true, 'Google Search is not targeted: ' + spec.name + '. Review in the UI.');
  });

  if (RUN21.fundraiserRoutes) {
    var events = state.campaigns[FUNDRAISER21.campaign].campaign;
    FUNDRAISER21.keywords.forEach(function (text) {
      var row = one21(state.keywords.filter(function (r) {
        return String(r.campaign.id) === String(events.id) && r.adGroup.name === FUNDRAISER21.group &&
          r.adGroupCriterion.keyword.matchType === 'EXACT' && normalize21(r.adGroupCriterion.keyword.text) === text;
      }), 'EXACT [' + text + '] in ' + FUNDRAISER21.group);
      var criterion = row.adGroupCriterion;
      if (criterion.status === 'PAUSED') { Logger.log('SKIP paused keyword: [' + text + ']'); return; }
      assert21(criterion.status === 'ENABLED', 'Unexpected keyword status: [' + text + ']');
      var before = { finalUrls: criterion.finalUrls || [], finalMobileUrls: criterion.finalMobileUrls || [] };
      assert21(before.finalUrls.length === 1 && before.finalMobileUrls.length <= 1, 'Unexpected URL count: [' + text + ']');
      var update = { resourceName: criterion.resourceName };
      var mask = [];
      var url = destination21(before.finalUrls[0], FUNDRAISER21.from, FUNDRAISER21.to);
      if (url !== before.finalUrls[0]) { update.finalUrls = [url]; mask.push('final_urls'); }
      if (before.finalMobileUrls.length) {
        var mobile = destination21(before.finalMobileUrls[0], FUNDRAISER21.from, FUNDRAISER21.to);
        if (mobile !== before.finalMobileUrls[0]) { update.finalMobileUrls = [mobile]; mask.push('final_mobile_urls'); }
      }
      if (!mask.length) { Logger.log('ALREADY ROUTED: [' + text + '] -> ' + FUNDRAISER21.to); return; }
      add('KEYWORD_URL', FUNDRAISER21.group + ' / [' + text + ']', before,
        { finalUrls: update.finalUrls || before.finalUrls, finalMobileUrls: update.finalMobileUrls || before.finalMobileUrls },
        { adGroupCriterionOperation: { update: update, updateMask: mask.join(',') } });
    });
  }

  if (RUN21.brandSitelinks) {
    var brand = state.campaigns.brand.campaign;
    assert21(!state.brandGroupLinks.length,
      'A Brand ad group has its own sitelinks, which would hide campaign-level ones. Review before linking.');
    BRAND_LINKS21.forEach(function (spec) {
      var resource = PREFIX21 + 'assets/' + spec.id;
      var asset = one21(state.assets.filter(function (r) { return r.asset.resourceName === resource; }),
        'sitelink asset ' + spec.id).asset;
      assert21(asset.type === 'SITELINK' && (asset.sitelinkAsset || {}).linkText === spec.text,
        'Sitelink asset changed: ' + spec.id);
      assert21((asset.finalUrls || []).length === 1 && asset.finalUrls[0] === HOST21 + spec.path &&
        !(asset.finalMobileUrls || []).length, 'Sitelink destination changed: ' + spec.id);
      var linked = state.brandLinks.filter(function (r) { return r.campaignAsset.asset === resource; });
      assert21(linked.length <= 1, 'Duplicate Brand sitelink link: ' + spec.text);
      if (linked.length) {
        assert21(linked[0].campaignAsset.status === 'ENABLED', 'Brand link to ' + spec.text + ' is paused; not re-enabling it.');
        Logger.log('ALREADY LINKED: Brand / ' + spec.text);
        return;
      }
      add('LINK_SITELINK', 'Brand / ' + spec.text, null, { campaign: brand.resourceName, asset: resource },
        { campaignAssetOperation: { create: {
          campaign: brand.resourceName, asset: resource, fieldType: 'SITELINK', status: 'ENABLED'
        } } });
    });
  }

  if (RUN21.trackingSuffix) {
    var customer = state.customer.customer || {};
    assert21(!customer.finalUrlSuffix, 'The account already has a final URL suffix (' + customer.finalUrlSuffix +
      '). Review it before adding campaign-level tags.');
    CONFIG21.campaigns.forEach(function (spec) {
      var c = state.campaigns[spec.key].campaign;
      var desired = suffix21(spec.slug), current = c.finalUrlSuffix || '';
      if (current === desired) { Logger.log('SUFFIX ALREADY SET: ' + spec.name); return; }
      assert21(current === '', 'Campaign already has a different final URL suffix: ' + spec.name + ' = ' + current +
        '. Not overwriting.');
      queue(spec, 'finalUrlSuffix', 'final_url_suffix', current, desired);
    });
  }

  if (RUN21.networkHygiene) {
    CONFIG21.campaigns.forEach(function (spec) {
      var ns = state.campaigns[spec.key].campaign.networkSettings || {};
      if (ns.targetSearchNetwork === true) {
        queue(spec, 'networkSettings.targetSearchNetwork', 'network_settings.target_search_network', true, false);
      }
      if (ns.targetContentNetwork === true) {
        queue(spec, 'networkSettings.targetContentNetwork', 'network_settings.target_content_network', true, false);
      }
    });
  }

  if (RUN21.pauseBarLed) {
    var bar = spec21('bar');
    var barStatus = state.campaigns.bar.campaign.status;
    if (barStatus === 'ENABLED') queue(bar, 'status', 'status', 'ENABLED', 'PAUSED');
    else Logger.log('ALREADY PAUSED: ' + bar.name);
  }

  // One update per campaign: every setting change for a campaign rides in a single operation.
  CONFIG21.campaigns.forEach(function (spec) {
    var entry = updates[spec.key];
    if (!entry) return;
    add('CAMPAIGN_SETTINGS', spec.name, entry.before, entry.after,
      { campaignOperation: { update: entry.update, updateMask: entry.mask.join(',') } });
  });
  return plan;
}

function destination21(value, allowed, target) {
  var parts = String(value || '').match(/^https:\/\/(www\.)?twistedpin\.com(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);
  assert21(parts, 'Unexpected destination host/protocol: ' + value);
  var current = (parts[2] || '/') + (parts[4] || '');
  assert21(current === target || allowed.indexOf(current) >= 0, 'Destination changed since review: ' + value);
  return HOST21 + target + (parts[3] || ''); // Preserve any query string verbatim.
}

function validateConfig21() {
  var slugs = CONFIG21.campaigns.map(function (spec) {
    assert21(/^[a-z][a-z-]{1,20}$/.test(spec.slug), 'Invalid campaign slug: ' + spec.slug);
    return spec.slug;
  });
  assert21(slugs.filter(function (slug, index) { return slugs.indexOf(slug) === index; }).length === slugs.length,
    'Campaign slugs must be unique.');
  CONFIG21.campaigns.forEach(function (spec) {
    var suffix = suffix21(spec.slug);
    assert21(suffix.length < 256 && !/[\s?#]/.test(suffix), 'Invalid final URL suffix for ' + spec.name);
  });
}

function checkLandings21() {
  LANDINGS21.forEach(function (page) {
    if (!RUN21[page.section]) return;
    var response = UrlFetchApp.fetch(HOST21 + page.path, { muteHttpExceptions: true, followRedirects: false });
    assert21(response.getResponseCode() === 200, 'Landing page must return 200 without redirects: ' + page.path);
    var html = response.getContentText();
    assert21(/<h1\b/i.test(html) && page.content.test(html), 'Expected landing content missing: ' + page.path);
    assert21(!/<meta\b[^>]*\bcontent=["'][^"']*\bnoindex\b/i.test(html), 'Landing page is noindex: ' + page.path);
    Logger.log('LANDING OK: ' + HOST21 + page.path);
  });
}

function setPath21(target, path, value) {
  var keys = path.split('.');
  var node = target;
  keys.slice(0, -1).forEach(function (key) { node = node[key] || (node[key] = {}); });
  node[keys[keys.length - 1]] = value;
}
function query21(sql) { var rows = []; var iterator = AdsApp.search(sql); while (iterator.hasNext()) rows.push(iterator.next()); return rows; }
function one21(rows, label) { assert21(rows.length === 1, 'Expected exactly one ' + label + '; found ' + rows.length); return rows[0]; }
function numeric21(value) { assert21(/^\d+$/.test(String(value)), 'Invalid numeric ID'); return String(value); }
function normalize21(value) { return String(value).replace(/^\[|\]$/g, '').trim().toLowerCase().replace(/\s+/g, ' '); }
function stable21(value) {
  if (Array.isArray(value)) return '[' + value.map(stable21).sort().join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + stable21(value[key]);
  }).join(',') + '}';
  return JSON.stringify(value);
}
function assert21(condition, message) { if (!condition) throw new Error(message); }
