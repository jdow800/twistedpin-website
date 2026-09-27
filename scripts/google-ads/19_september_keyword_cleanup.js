/**
 * Twisted Pin - Script 19: September keyword cleanup and landing trial
 * EXECUTION RECORD: original September 13 run applied 48 of 49 changes.
 * Jon confirmed the remaining exact Employee Appreciation exclusion was
 * completed manually by removing its paused positive keyword and adding
 * the exact ad-group negative. Do not rerun live. See 19_live_2026-09-13.md.
 * After that conversion, this original script's positive-target lookup will
 * fail because the old keyword is removed; do not use it to verify completion.
 * The original implementation is retained below to explain the execution log.
 * Reviewed against Aug 29-Sep 11, 2026. ONE-TIME script; do not schedule.
 *
 * Default: read-only. Preview, review Logs, then set DRY_RUN = false and Run.
 * Google's Preview also prevents this script from calling any Ads mutators.
 *
 * Writes only:
 * - Bar budget $12 -> $6 (never increases a budget).
 * - Pause EXACT employee appreciation ideas and PHRASE girls night out ideas.
 * - Eight EXACT research negatives in two specified ad groups.
 * - 31 reviewed Bowling keyword destinations: homepage -> /bowl/.
 * - Seven explicit adult/milestone birthday keywords: /birthday-parties/#adults.
 *   Existing keyword mobile URLs, if present and expected, follow the same change.
 *
 * Preserves all CPCs, location/device/schedule bids, targeting, goal settings,
 * tracking templates/suffixes/custom parameters, ads and other budgets.
 * Does not launch the optional kids/family keyword experiments.
 *
 * No Sheet, email, Drive or PropertiesService writes. UrlFetchApp only reads
 * the two public landing pages. BEFORE and SUBMITTED log records identify
 * exactly which settings to restore if an API failure leaves a partial run.
 */
var DRY_RUN = true;

var RUN = {
  barBudget: true,
  researchCleanup: true,
  bowlingLanding: true,
  adultBirthdayLanding: true
};

var CONFIG = {
  customerId: '5778974265',
  currency: 'USD',
  maxChanges: 100,
  campaigns: {
    brand: 'Search_Brand_TwistedPin_2026',
    bar: 'Bar-Led_TwistedPin_2026',
    openPlay: 'General & Open Play 2026',
    events: 'Events Campaign 2026 Setup'
  },
  heldBudgets: { brand: 6, openPlay: 32, events: 35 }
};

var BOWLING_KEYWORDS = [
  "arcade and bowling alley near me",
  "bowling romeoville",
  "bowling for adults",
  "bowling alley reservations",
  "best bowling lanes near me",
  "bowling near naperville",
  "bowling lanes near me",
  "upscale bowling",
  "bowling alley near me",
  "bowling naperville il",
  "bowling reservations",
  "bowling date night",
  "bowling near bolingbrook il",
  "bowling plainfield",
  "reserve a bowling lane",
  "luxury bowling",
  "luxury bowling near me",
  "bowling and arcade",
  "bowling plainfield il",
  "bowling in plainfield",
  "best bowling places near me",
  "bowling naperville",
  "bowling alley with bar",
  "bowling centers near me",
  "upscale bowling near me",
  "bowling near me",
  "reserve bowling lane",
  "bowling and bar near me",
  "bowling alley plainfield",
  "adult bowling near me",
  "bowling oswego il"
];

var ADULT_BIRTHDAY_KEYWORDS = [
  "50th birthday party venue",
  "adult birthday party venue",
  "bowling birthday party for adults",
  "30th birthday party venue",
  "birthday party venue for adults",
  "40th birthday party venue",
  "adult birthday party venue near me"
];

var RESEARCH = [
  {
    campaign: 'events', adGroup: 'Employee Appreciation',
    pause: { text: 'employee appreciation ideas', match: 'EXACT' },
    exactNegatives: [
      'employee appreciation ideas',
      'staff rewards',
      'appreciation to team members',
      'staff appreciation ideas',
      'teammate appreciation ideas'
    ]
  },
  {
    campaign: 'bar', adGroup: 'Occasion',
    pause: { text: 'girls night out ideas', match: 'PHRASE' },
    exactNegatives: [
      'adult girls night game ideas',
      'bachelorette party ideas',
      'unique bachelorette weekend ideas'
    ]
  }
];

function main() {
  assert19(typeof DRY_RUN === 'boolean', 'DRY_RUN must be true or false.');
  Object.keys(RUN).forEach(function (key) {
    assert19(typeof RUN[key] === 'boolean', 'RUN.' + key + ' must be true or false.');
  });
  var account = AdsApp.currentAccount();
  assert19(String(account.getCustomerId()).replace(/\D/g, '') === CONFIG.customerId,
    'Wrong account. This script is only for Twisted Pin 577-897-4265.');
  assert19(account.getCurrencyCode() === CONFIG.currency, 'Expected USD account.');
  var preview = AdsApp.getExecutionInfo().isPreview();
  Logger.log('SCRIPT 19 | ' + new Date().toISOString() + ' | timezone ' + account.getTimeZone());
  Logger.log('Mode: ' + (DRY_RUN || preview ? 'READ-ONLY PLAN' : 'LIVE'));
  Logger.log('Sections: ' + JSON.stringify(RUN));

  // Complete discovery, validation and plan construction BEFORE the first write.
  var campaigns = {};
  Object.keys(CONFIG.campaigns).forEach(function (key) {
    var name = CONFIG.campaigns[key];
    campaigns[key] = oneNamed19(
      AdsApp.campaigns().withCondition('campaign.status != REMOVED')
        .withCondition('campaign.experiment_type = BASE').get(), name, 'campaign');
    var campaign = campaigns[key];
    assert19(campaign.isEnabled(), 'Campaign is no longer enabled: ' + name);
    assert19(campaign.getBiddingStrategyType() === 'MANUAL_CPC',
      'Bidding strategy changed since review: ' + name);
    assert19(campaign.getBudget().getType() === 'DAILY', 'Expected daily budget: ' + name);
    if (Object.prototype.hasOwnProperty.call(CONFIG.heldBudgets, key)) {
      assert19(close19(campaign.getBudget().getAmount(), CONFIG.heldBudgets[key]),
        'Held budget changed since review: ' + name + '. No budget will be reset.');
    }
    Logger.log('ACCOUNT CHECK: ' + name + ' | id ' + campaign.getId() +
      ' | budget $' + campaign.getBudget().getAmount());
  });

  var plan = [];
  if (RUN.barBudget) planBudget19(plan, campaigns.bar, campaigns);
  if (RUN.researchCleanup) {
    RESEARCH.forEach(function (spec) {
      planResearch19(plan, campaigns[spec.campaign], spec);
    });
  }
  if (RUN.bowlingLanding) {
    checkLanding19('https://www.twistedpin.com/bowl/', 'bowling');
    planLanding19(plan, campaigns.openPlay, 'Bowling', BOWLING_KEYWORDS, '/', '/bowl/', '');
  }
  if (RUN.adultBirthdayLanding) {
    checkLanding19('https://www.twistedpin.com/birthday-parties/', 'adults');
    planLanding19(plan, campaigns.events, 'Birthday & Celebrations', ADULT_BIRTHDAY_KEYWORDS,
      '/birthday-parties/', '/birthday-parties/', '#adults');
  }
  assert19(plan.length <= CONFIG.maxChanges, 'Unexpected change count: ' + plan.length);
  Logger.log('PREFLIGHT PASSED | planned changes: ' + plan.length);
  plan.forEach(function (op, index) {
    Logger.log('PLAN ' + (index + 1) + ': ' + JSON.stringify(op.record));
  });
  Logger.log('HELD: Brand $6, Open Play $32, Events $35; CPCs, geography, goals and RSAs.');
  Logger.log('LATER: kids/family keyword experiments; generic venue and broader phrase decisions.');
  if (DRY_RUN || preview) {
    Logger.log('NO ADS CHANGES MADE. The Changes tab may be empty; read the PLAN entries in Logs.');
    Logger.log('To apply: DRY_RUN = false, Save, then Run (not Preview). Do not schedule.');
    return;
  }
  var submitted = 0;
  try {
    plan.forEach(function (op) {
      op.check(); // Recheck the expected value immediately before its write.
      Logger.log('BEFORE: ' + JSON.stringify(op.record));
      op.apply();
      submitted++;
      Logger.log('SUBMITTED ' + submitted + ': ' + JSON.stringify(op.record));
    });
  } catch (error) {
    Logger.log('STOPPED AFTER ' + submitted + ' SUCCESSFUL SUBMISSIONS. Earlier changes may be live.');
    Logger.log('The failing operation may also have reached Google. Inspect its BEFORE entry.');
    Logger.log('No automatic rollback. Save these Logs and check Google Ads before retrying.');
    throw error;
  }
  Logger.log('COMPLETE: submitted ' + submitted + ' updates. This is not a serving/approval guarantee.');
  Logger.log('Set DRY_RUN back to true and Preview again to read fresh state; applied items should no-op.');
  Logger.log('Record the live date; compare the next 14 complete days with Aug 29-Sep 11.');
}

function planBudget19(plan, bar, campaigns) {
  var budget = bar.getBudget();
  assert19(!budget.isExplicitlyShared(), 'Bar uses a shared budget; refusing to change it.');
  Object.keys(campaigns).forEach(function (key) {
    if (key !== 'bar') {
      assert19(String(campaigns[key].getBudget().getId()) !== String(budget.getId()),
        'Bar budget is also used by ' + campaigns[key].getName());
    }
  });
  var from = budget.getAmount();
  if (from <= 6) {
    Logger.log('NO-OP: Bar budget is already $6 or lower; it will not be increased.');
    return;
  }
  assert19(close19(from, 12), 'Bar budget changed since review: $' + from + '. Expected $12 or <=$6.');
  addOperation19(plan, { kind: 'BUDGET', campaign: bar.getName(), budgetId: String(budget.getId()),
    from: from, to: 6 },
    function () { assert19(close19(budget.getAmount(), from), 'Bar budget changed during this run.'); },
    function () { budget.setAmount(6); });
}

function planResearch19(plan, campaign, spec) {
  var group = getGroup19(campaign, spec.adGroup);
  var keywords = all19(group.keywords().withCondition('ad_group_criterion.status != REMOVED').get());
  var pause = oneKeyword19(keywords, spec.pause.text, spec.pause.match, campaign, group);
  if (pause.isEnabled()) {
    addOperation19(plan, keywordRecord19('PAUSE', campaign, group, pause, 'ENABLED', 'PAUSED'),
      function () { assert19(pause.isEnabled(), 'Pause target changed: ' + pause.getText()); },
      function () { pause.pause(); });
  } else {
    assert19(pause.isPaused(), 'Unexpected keyword status: ' + pause.getText());
    Logger.log('NO-OP: already paused ' + campaign.getName() + ' / ' + group.getName() + ' / ' + pause.getText());
  }

  var negatives = negatives19(campaign, group);
  spec.exactNegatives.forEach(function (text) {
    // Exact negatives exclude only the literal query, not all event "ideas".
    keywords.forEach(function (keyword) {
      if (keyword.isEnabled() && String(keyword.getId()) !== String(pause.getId()) &&
          normalize19(keyword.getText()) === normalize19(text)) {
        throw new Error('Negative conflicts with an enabled target: ' + group.getName() + ' / ' + keyword.getText());
      }
    });
    var covered = negatives.some(function (negative) { return covers19(negative, text); });
    if (covered) {
      Logger.log('NO-OP: query already covered by ad-group/campaign/shared negative: [' + text + ']');
      return;
    }
    var record = { kind: 'ADD_EXACT_NEGATIVE', campaign: campaign.getName(), adGroup: group.getName(),
      adGroupId: String(group.getId()), from: null, to: '[' + text + ']' };
    addOperation19(plan, record,
      function () { assert19(group.isEnabled(), 'Ad group paused during run: ' + group.getName()); },
      function () { group.createNegativeKeyword('[' + text + ']'); });
  });
}

function planLanding19(plan, campaign, groupName, allowed, oldPath, newPath, newHash) {
  var group = getGroup19(campaign, groupName);
  var keywords = all19(group.keywords().withCondition('ad_group_criterion.status != REMOVED').get());
  // Each target has a keyword final URL, which takes precedence over ad URLs.
  // Existing keyword mobile URLs are handled alongside that final URL below.
  allowed.forEach(function (text) {
    var keyword = oneKeyword19(keywords, text, 'EXACT', campaign, group);
    if (!keyword.isEnabled()) {
      assert19(keyword.isPaused(), 'Unexpected keyword status: ' + keyword.getText());
      Logger.log('SKIP: paused destination target ' + keyword.getText());
      return;
    }
    var urls = keyword.urls();
    planUrl19(plan, campaign, group, keyword, urls, false, oldPath, newPath, newHash);
    if (urls.getMobileFinalUrl()) {
      planUrl19(plan, campaign, group, keyword, urls, true, oldPath, newPath, newHash);
    }
  });
}

function planUrl19(plan, campaign, group, keyword, urls, mobile, oldPath, newPath, newHash) {
  var get = function () { return mobile ? urls.getMobileFinalUrl() : urls.getFinalUrl(); };
  var from = get();
  var to = destination19(from, oldPath, newPath, newHash);
  if (from === to) {
    Logger.log('NO-OP: destination already set ' + keyword.getText() + (mobile ? ' (mobile)' : ''));
    return;
  }
  addOperation19(plan, keywordRecord19(mobile ? 'MOBILE_URL' : 'FINAL_URL', campaign, group, keyword, from, to),
    function () { assert19(keyword.isEnabled() && get() === from, 'Keyword destination/status changed: ' + keyword.getText()); },
    function () { if (mobile) urls.setMobileFinalUrl(to); else urls.setFinalUrl(to); });
}

function destination19(value, oldPath, newPath, newHash) {
  var match = String(value || '').match(/^(https):\/\/([^\/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);
  assert19(match, 'Missing/non-HTTPS keyword destination: ' + value);
  assert19(/^(www\.)?twistedpin\.com$/i.test(match[2]), 'Unexpected destination host: ' + value);
  var path = match[3] || '/';
  var query = match[4] || ''; // Preserve existing query parameters verbatim.
  var hash = match[5] || '';
  var alreadyTarget = path === newPath && hash === newHash;
  assert19(alreadyTarget || (path === oldPath && !hash), 'Destination changed since review: ' + value);
  return 'https://www.twistedpin.com' + newPath + query + newHash;
}

function negatives19(campaign, group) {
  var result = [];
  function append(iterator) {
    all19(iterator).forEach(function (negative) {
      result.push({ text: normalize19(negative.getText()), match: negative.getMatchType() });
    });
  }
  append(group.negativeKeywords().get());
  append(campaign.negativeKeywords().get());
  all19(campaign.negativeKeywordLists().get()).forEach(function (list) {
    append(list.negativeKeywords().get());
  });
  // No new positive keywords: this is not a complete account-level coverage audit.
  return result;
}

function covers19(negative, query) {
  var text = normalize19(query);
  if (negative.match === 'EXACT') return text === negative.text;
  if (negative.match === 'PHRASE') return (' ' + text + ' ').indexOf(' ' + negative.text + ' ') >= 0;
  if (negative.match === 'BROAD') {
    var words = text.split(' ');
    return negative.text.split(' ').every(function (word) { return words.indexOf(word) >= 0; });
  }
  throw new Error('Unsupported negative match type: ' + negative.match);
}

function checkLanding19(url, purpose) {
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: false });
  assert19(response.getResponseCode() === 200,
    'Landing page must return HTTP 200 without a redirect: ' + url + ' (' + response.getResponseCode() + ')');
  var html = response.getContentText();
  assert19(/\/reserve\b/i.test(html), 'Reservation link not found on ' + url);
  if (purpose === 'adults') {
    assert19(/\bid\s*=\s*["']adults["']/i.test(html), 'Live birthday page has no #adults section.');
  } else {
    assert19(/traditional lanes/i.test(html), 'Bowling content not found on ' + url);
  }
  Logger.log('LANDING CHECK: HTTP 200 and expected content on ' + url);
}

function getGroup19(campaign, name) {
  var group = oneNamed19(campaign.adGroups().withCondition('ad_group.status != REMOVED').get(), name, 'ad group');
  assert19(group.isEnabled(), 'Ad group no longer enabled: ' + campaign.getName() + ' / ' + name);
  return group;
}

function oneKeyword19(keywords, text, matchType, campaign, group) {
  var matches = keywords.filter(function (keyword) {
    return keyword.getMatchType() === matchType && normalize19(keyword.getText()) === normalize19(text);
  });
  assert19(matches.length === 1, 'Expected exactly one ' + matchType + ' keyword "' + text +
    '" in ' + campaign.getName() + ' / ' + group.getName() + '; found ' + matches.length);
  return matches[0];
}

function oneNamed19(iterator, name, type) {
  var matches = all19(iterator).filter(function (entity) { return entity.getName() === name; });
  assert19(matches.length === 1, 'Expected one ' + type + ' named "' + name + '"; found ' + matches.length);
  return matches[0];
}

function keywordRecord19(kind, campaign, group, keyword, from, to) {
  return { kind: kind, campaign: campaign.getName(), adGroup: group.getName(),
    adGroupId: String(group.getId()), keywordId: String(keyword.getId()), keyword: keyword.getText(),
    from: from, to: to };
}

function addOperation19(plan, record, check, apply) {
  plan.push({ record: record, check: check, apply: apply });
}

function normalize19(value) {
  var text = String(value || '').trim();
  if ((text[0] === '[' && text[text.length - 1] === ']') ||
      (text[0] === '"' && text[text.length - 1] === '"')) text = text.slice(1, -1);
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function all19(iterator) {
  var result = [];
  while (iterator.hasNext()) result.push(iterator.next());
  return result;
}

function close19(a, b) { return Math.abs(a - b) < 0.005; }
function assert19(condition, message) { if (!condition) throw new Error(message); }
