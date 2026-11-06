// Local tests for Script 22. No dependencies, no Ads account. Fixtures mirror the live
// GAQL responses read on November 1, 2026. These mocks test this script's logic, not
// Google's API schema or policy decisions.
// Run: node --test --test-reporter=spec scripts/google-ads/22_holiday_corrections.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '22_holiday_corrections.js'), 'utf8');
const P = 'customers/5778974265/';

function rsa(groupId, adId, status, headlines, descriptions, url, policy) {
  return {
    campaign: { id: groupId === '201769492772' ? '23856370451' : '23646227882' },
    adGroup: { id: groupId },
    adGroupAd: {
      resourceName: P + 'adGroupAds/' + groupId + '~' + adId, status,
      ad: { id: adId, type: 'RESPONSIVE_SEARCH_AD', finalUrls: [url],
        responsiveSearchAd: {
          headlines: headlines.map((text) => ({ text, assetPerformanceLabel: 'PENDING' })),
          descriptions: descriptions.map((text) => ({ text, assetPerformanceLabel: 'PENDING' }))
        } },
      policySummary: policy || { reviewStatus: 'REVIEWED', approvalStatus: 'APPROVED' }
    }
  };
}

function fixture() {
  const restrictions = { targetRestrictions: ['AUDIENCE', 'AGE_RANGE', 'GENDER', 'PARENTAL_STATUS', 'INCOME_RANGE']
    .map((d) => ({ targetingDimension: d, bidOnly: true })) };
  const campaign = (id, name, status, budget) => ({
    campaign: { id, resourceName: P + 'campaigns/' + id, name, status, experimentType: 'BASE',
      advertisingChannelType: 'SEARCH', biddingStrategyType: 'MANUAL_CPC' },
    campaignBudget: { period: 'DAILY', amountMicros: String(budget * 1000000) }
  });
  const group = (cid, id, name, ts) => ({ campaign: { id: cid }, adGroup: { id, name, status: 'ENABLED', targetingSetting: ts } });
  const sched = (n, day, sh, sm, eh, em) => ({ campaign: { id: '23646227882' }, campaignCriterion: {
    resourceName: P + 'campaignCriteria/23646227882~' + n, type: 'AD_SCHEDULE',
    adSchedule: { dayOfWeek: day, startHour: sh, startMinute: sm, endHour: eh, endMinute: em } } });
  const demo = (gid, n, kind, type, negative) => ({ adGroup: { id: gid }, adGroupCriterion: {
    resourceName: P + 'adGroupCriteria/' + gid + '~' + n, status: 'ENABLED', type: kind, negative,
    [kind === 'AGE_RANGE' ? 'ageRange' : 'incomeRange']: { type } } });
  return {
    campaigns: [
      campaign('23640563901', 'Events Campaign 2026 Setup', 'ENABLED', 35),
      campaign('23646227882', 'General & Open Play 2026', 'ENABLED', 32),
      campaign('23851071726', 'Bar-Led_TwistedPin_2026', 'PAUSED', 6),
      campaign('23856370451', 'Search_Brand_TwistedPin_2026', 'ENABLED', 6),
      campaign('964080143', 'Plainfield Lanes', 'PAUSED', 10)
    ],
    groups: [
      group('23640563901', '195744623684', 'Birthday & Celebrations', restrictions),
      group('23640563901', '196875785449', 'Corporate Events', restrictions),
      group('23646227882', '191364831262', 'Bowling'),
      group('23646227882', '199668767993', 'Things To Do'),
      group('23856370451', '201769492772', 'Brand Defense')
    ],
    ads: [
      rsa('191364831262', '799866304698', 'PAUSED', ['Bowling in Plainfield IL', 'Open Late Fri & Saturday'],
        ['Skip the wait and book online. Open late Friday and Saturday. Walk-ins welcome.'], 'https://www.twistedpin.com/'),
      rsa('191364831262', '809142806047', 'ENABLED', ['Bowling in Plainfield', 'Reserve a Lane', '17 Lanes + 6-Lane VIP Suite',
        'Built for Adults', 'Fine, Bring the Kids', 'Premium Bowling Plainfield', 'Bowling + Craft Cocktails', 'Open Until 1am',
        'Take Over the VIP Suite', 'Grown-Up Night Out', 'Walk-Ins Welcome', 'Bowling Near Naperville'],
      ["Plainfield's premium bowling. 17 lanes + 6-lane VIP suite. Reservations welcome.",
        'Bowling, craft cocktails, 28 self-serve taps. Open until 1am. Plainfield, IL.',
        '17 traditional lanes + a 6-lane VIP suite. Take over the suite for your group.',
        "Skip the wait — book online. Open late. Plainfield's premier night out."], 'https://www.twistedpin.com/bowl/'),
      rsa('199668767993', '815955743419', 'ENABLED', ["Plainfield's Premier Night Out", 'Plainfield, IL', 'Something To Do Tonight',
        'Bowling, Cocktails & Arcade', '17 Lanes + 6-Lane VIP Suite', '28 Self-Serve Taps', 'Open Until 1am', 'Reserve a Lane Tonight'],
      ['Bowling, craft cocktails, 28 self-serve taps, and an arcade under one roof in Plainfield.',
        "The answer to 'what should we do tonight?' Open until 1am. Reservations welcome.",
        "Plainfield's premier night out. Bowling optional."], 'https://www.twistedpin.com/'),
      rsa('201769492772', '809106471063', 'ENABLED', ['Twisted Pin — Plainfield, IL', 'Reserve a Lane Tonight',
        "Plainfield's Premier Night Out", '17 Lanes + a 6-Lane VIP Suite', '28 Self-Serve Taps', 'Curated by Top Mixologist',
        'Bowling Optional', 'Open Until 1am', 'Cocktails Worth Showing Up For', 'Plan Your Event'],
      ['Premium bowling, craft cocktails, a 28-tap self-serve wall. Plainfield, IL.',
        "Cocktail program curated by Brian Van Flandern, America's Top Mixologist.",
        "Plainfield's premier night out. Reserve a lane or plan an event.",
        'Not your average evening out. Reservations welcome. Open until 1am.'], 'https://www.twistedpin.com/'),
      rsa('201769492772', '816029354297', 'ENABLED', ['Twisted Pin — Plainfield, IL', 'Formerly Plainfield Lanes',
        "Plainfield's Premier Night Out", 'Reserve a Lane Tonight', '17 Lanes + 6-Lane VIP Suite', '28 Self-Serve Taps',
        'Craft Cocktails & Beer Wall'],
      ['Premium bowling, craft cocktails, a 28-tap self-serve wall. Plainfield, IL.',
        "Formerly Plainfield Lanes — now Plainfield's premier night out. Open until 1am.",
        "Cocktail program curated by America's Top Mixologist. Reservations welcome."], 'https://www.twistedpin.com/')
    ],
    callouts: ['361863050786', '361951562722', '362030153814', '362030171568', '362030188218', '362030204937'].map((id) => ({
      campaign: { id: '23856370451' }, campaignAsset: { resourceName: P + 'campaignAssets/23856370451~' + id + '~CALLOUT',
        fieldType: 'CALLOUT', status: 'ENABLED', asset: P + 'assets/' + id } })),
    assets: [
      { asset: { id: '339131659787', resourceName: P + 'assets/339131659787', type: 'CALLOUT', calloutAsset: { calloutText: 'Open Late Fri & Sat' } } },
      { asset: { id: '362030204937', resourceName: P + 'assets/362030204937', type: 'CALLOUT', calloutAsset: { calloutText: 'Open Until 1am' } } }
    ],
    schedules: [
      sched('304488', 'MONDAY', 11, 'ZERO', 22, 'ZERO'), sched('314488', 'TUESDAY', 11, 'ZERO', 22, 'ZERO'),
      sched('324488', 'WEDNESDAY', 11, 'ZERO', 22, 'ZERO'), sched('334095', 'THURSDAY', 10, 'ZERO', 23, 'FORTY_FIVE'),
      sched('344095', 'FRIDAY', 10, 'ZERO', 23, 'FORTY_FIVE'), sched('354095', 'SATURDAY', 10, 'ZERO', 23, 'FORTY_FIVE'),
      sched('364488', 'SUNDAY', 11, 'ZERO', 22, 'ZERO')
    ],
    sharedLinks: [['23640563901', 'Events Campaign 2026 Setup', 'ENABLED'], ['23646227882', 'General & Open Play 2026', 'ENABLED'],
      ['23851071726', 'Bar-Led_TwistedPin_2026', 'PAUSED'], ['23856370451', 'Search_Brand_TwistedPin_2026', 'ENABLED']]
      .map(([id, name, status]) => ({ campaign: { id, name, status }, sharedSet: { id: '12083574315' },
        campaignSharedSet: { status: 'ENABLED' } })),
    sharedNegatives: [['19923173', 'coupons'], ['19923213', 'coupon'], ['22221522', 'cheap'], ['24325420', 'bingo']]
      .map(([n, text]) => ({ sharedSet: { id: '12083574315', name: 'TwistedPin Negatives 2026' },
        sharedCriterion: { resourceName: P + 'sharedCriteria/12083574315~' + n, type: 'KEYWORD', keyword: { text, matchType: 'PHRASE' } } })),
    campaignNegatives: [{ campaign: { id: '23640563901' }, campaignCriterion: { resourceName: P + 'campaignCriteria/23640563901~10001090',
      type: 'KEYWORD', negative: true, keyword: { text: 'karaoke', matchType: 'BROAD' } } }],
    demographics: [
      demo('195744623684', '503001', 'AGE_RANGE', 'AGE_RANGE_18_24', true),
      demo('195744623684', '503002', 'AGE_RANGE', 'AGE_RANGE_25_34', false),
      demo('195744623684', '510001', 'INCOME_RANGE', 'INCOME_RANGE_0_50', true),
      demo('195744623684', '510002', 'INCOME_RANGE', 'INCOME_RANGE_50_60', false),
      demo('195744623684', '510003', 'INCOME_RANGE', 'INCOME_RANGE_60_70', false),
      demo('195744623684', '510006', 'INCOME_RANGE', 'INCOME_RANGE_90_UP', false),
      demo('196875785449', '503001', 'AGE_RANGE', 'AGE_RANGE_18_24', true),
      demo('196875785449', '503006', 'AGE_RANGE', 'AGE_RANGE_65_UP', true)
    ]
  };
}

let nextId = 900000000000;
function applyOps(state, ops) {
  const drop = (list, rn, key) => list.splice(list.findIndex((r) => r[key].resourceName === rn), 1);
  ops.forEach((op) => {
    if (op.adGroupAdOperation && op.adGroupAdOperation.create) {
      const c = op.adGroupAdOperation.create, gid = c.adGroup.split('/').pop(), id = String(nextId++);
      const rsaBody = c.ad.responsiveSearchAd;
      state.ads.push({ campaign: { id: gid === '201769492772' ? '23856370451' : '23646227882' }, adGroup: { id: gid },
        adGroupAd: { resourceName: P + 'adGroupAds/' + gid + '~' + id, status: c.status,
          ad: { id, type: 'RESPONSIVE_SEARCH_AD', finalUrls: c.ad.finalUrls, responsiveSearchAd: JSON.parse(JSON.stringify(rsaBody)) },
          policySummary: { reviewStatus: 'REVIEW_IN_PROGRESS', approvalStatus: 'UNKNOWN' } } });
    } else if (op.adGroupAdOperation && op.adGroupAdOperation.update) {
      const u = op.adGroupAdOperation.update;
      state.ads.find((r) => r.adGroupAd.resourceName === u.resourceName).adGroupAd.status = u.status;
    } else if (op.campaignAssetOperation && op.campaignAssetOperation.remove) {
      drop(state.callouts, op.campaignAssetOperation.remove, 'campaignAsset');
    } else if (op.campaignAssetOperation && op.campaignAssetOperation.create) {
      const c = op.campaignAssetOperation.create;
      state.callouts.push({ campaign: { id: '23856370451' }, campaignAsset: {
        resourceName: P + 'campaignAssets/23856370451~' + c.asset.split('/').pop() + '~CALLOUT', fieldType: 'CALLOUT',
        status: 'ENABLED', asset: c.asset } });
    } else if (op.campaignCriterionOperation && op.campaignCriterionOperation.remove) {
      const rn = op.campaignCriterionOperation.remove;
      if (state.schedules.some((r) => r.campaignCriterion.resourceName === rn)) drop(state.schedules, rn, 'campaignCriterion');
      else drop(state.campaignNegatives, rn, 'campaignCriterion');
    } else if (op.campaignCriterionOperation && op.campaignCriterionOperation.create) {
      const c = op.campaignCriterionOperation.create, cid = c.campaign.split('/').pop();
      const row = { campaign: { id: cid }, campaignCriterion: { resourceName: P + 'campaignCriteria/' + cid + '~' + nextId++ } };
      if (c.adSchedule) { row.campaignCriterion.type = 'AD_SCHEDULE'; row.campaignCriterion.adSchedule = c.adSchedule; state.schedules.push(row); }
      else { row.campaignCriterion.type = 'KEYWORD'; row.campaignCriterion.negative = true; row.campaignCriterion.keyword = c.keyword; state.campaignNegatives.push(row); }
    } else if (op.sharedCriterionOperation && op.sharedCriterionOperation.remove) {
      drop(state.sharedNegatives, op.sharedCriterionOperation.remove, 'sharedCriterion');
    } else if (op.adGroupCriterionOperation && op.adGroupCriterionOperation.remove) {
      drop(state.demographics, op.adGroupCriterionOperation.remove, 'adGroupCriterion');
    } else if (op.adGroupCriterionOperation && op.adGroupCriterionOperation.update) {
      const u = op.adGroupCriterionOperation.update;
      // Google returns float32: 0.6 reads back as 0.6000000238418579 (seen live November 1).
      state.demographics.find((r) => r.adGroupCriterion.resourceName === u.resourceName).adGroupCriterion.bidModifier =
        Math.fround(u.bidModifier);
    } else throw new Error('Unhandled op ' + JSON.stringify(op));
  });
}

function run(state, opts) {
  opts = opts || {};
  const logs = [], calls = [];
  const route = (sql) => {
    if (/FROM campaign WHERE/.test(sql)) return state.campaigns;
    if (/FROM ad_group WHERE/.test(sql)) return state.groups;
    if (/FROM ad_group_ad /.test(sql)) return state.ads;
    if (/FROM campaign_asset /.test(sql)) return state.callouts;
    if (/FROM asset WHERE/.test(sql)) return state.assets;
    if (/FROM campaign_criterion/.test(sql) && /AD_SCHEDULE/.test(sql)) return state.schedules;
    if (/FROM campaign_criterion/.test(sql) && /'KEYWORD'/.test(sql)) return state.campaignNegatives;
    if (/FROM campaign_shared_set/.test(sql)) return state.sharedLinks;
    if (/FROM shared_criterion/.test(sql)) return state.sharedNegatives;
    if (/FROM ad_group_criterion/.test(sql)) return state.demographics;
    throw new Error('Unrouted query: ' + sql);
  };
  const AdsApp = {
    currentAccount: () => ({ getCustomerId: () => opts.account || '577-897-4265', getCurrencyCode: () => 'USD',
      getTimeZone: () => 'America/New_York' }),
    getExecutionInfo: () => ({ isPreview: () => !!opts.preview }),
    search: (sql) => { const rows = JSON.parse(JSON.stringify(route(sql))); let i = 0;
      return { hasNext: () => i < rows.length, next: () => rows[i++] }; },
    mutateAll: (ops, options) => {
      calls.push({ ops: JSON.parse(JSON.stringify(ops)), options: JSON.parse(JSON.stringify(options)) });
      if (opts.throwOnMutate) throw new Error('network');
      return ops.map((op, i) => ({ isSuccessful: () => !(opts.reject && i === 0), getResourceName: () => 'rn' + i,
        getErrorMessages: () => ['rejected'] }));
    }
  };
  const context = { AdsApp, Logger: { log: (m) => logs.push(String(m)) } };
  vm.createContext(context);
  vm.runInContext(SOURCE + (opts.live ? '\nDRY_RUN = false;' : '') + (opts.patch || ''), context);
  let error = null;
  try { context.main(); } catch (e) { error = e; }
  return { logs, calls, error };
}
const planned = (r) => Number((r.logs.find((l) => l.startsWith('PREFLIGHT PASSED')) || '').split(': ').pop());

test('copy fits Google limits and the brand rules', () => {
  const m = vm.runInNewContext(SOURCE + ';({ H: HEADLINE_SWAPS22, D: DESCRIPTION_SWAPS22 })');
  Object.values(m.H).forEach((t) => assert.ok(t.length <= 30, t));
  Object.values(m.D).forEach((t) => assert.ok(t.length <= 90, t));
  Object.values(m.H).concat(Object.values(m.D)).forEach((t) => {
    assert.ok(!/\b1\s?am\b/i.test(t) || /1am Fri & Sat/.test(t), 'unqualified 1am: ' + t);
    assert.ok(!/\b(private|cheap|affordable|discount|deal|deals|value|budget-friendly|main floor|yours for the night)\b/i.test(t), t);
    assert.ok(!/take over the (vip )?suite/i.test(t), t);
    assert.ok(!/plainfield lanes|formerly/i.test(t), 'old name in copy: ' + t);
  });
  assert.equal(m.H['Formerly Plainfield Lanes'], 'Bowling Optional');
  assert.equal(m.D['17 traditional lanes + a 6-lane VIP suite. Take over the suite for your group.'],
    'When you book all six lanes, the whole suite is yours during your event time.');
});

test('script is pure ASCII so a Windows clipboard paste cannot garble it', () => {
  assert.ok(!/[^\x00-\x7F]/.test(SOURCE), 'non-ASCII character in the script');
});

test('the stale old-name copy from run 1 is removed and replaced, nothing else', () => {
  const state = fixture();
  applyOps(state, run(state, { live: true }).calls[0].ops);
  // Brand A also has a "Bowling Optional" headline, so find the B copy by its new description.
  const copy = state.ads.find((r) => r.adGroup.id === '201769492772' && r.adGroupAd.status === 'PAUSED' &&
    r.adGroupAd.ad.responsiveSearchAd.descriptions.some((d) => /^Plainfield's premier night out\. Bowling optional\./.test(d.text)));
  copy.adGroupAd.resourceName = P + 'adGroupAds/201769492772~830195254966';
  copy.adGroupAd.ad.id = '830195254966';
  copy.adGroupAd.ad.responsiveSearchAd.headlines = copy.adGroupAd.ad.responsiveSearchAd.headlines
    .map((h) => (h.text === 'Bowling Optional' ? { text: 'Formerly Plainfield Lanes' } : h));
  const r = run(state, { live: true });
  assert.equal(r.error, null, r.error && r.error.message);
  const ops = r.calls[0].ops;
  assert.equal(ops.length, 2);
  assert.equal(ops[0].adGroupAdOperation.remove, P + 'adGroupAds/201769492772~830195254966');
  const created = ops[1].adGroupAdOperation.create;
  assert.equal(created.status, 'PAUSED');
  const texts = created.ad.responsiveSearchAd.headlines.concat(created.ad.responsiveSearchAd.descriptions).map((x) => x.text);
  assert.ok(!texts.some((t) => /plainfield lanes|formerly/i.test(t)), texts.join(' | '));
  assert.equal(r.logs.filter((l) => l.startsWith('WAIT')).length, 3);
  const enabledStale = fixture();
  applyOps(enabledStale, run(enabledStale, { live: true }).calls[0].ops);
  enabledStale.ads.push(JSON.parse(JSON.stringify(state.ads.find((x) => x.adGroupAd.ad.id === '830195254966'))));
  enabledStale.ads[enabledStale.ads.length - 1].adGroupAd.status = 'ENABLED';
  const guarded = run(enabledStale, { live: true });
  assert.match(guarded.error.message, /not the paused old-name copy/);
});

test('dry run plans 25 operations and writes nothing', () => {
  const r = run(fixture());
  assert.equal(r.error, null, r.error && r.error.message);
  assert.equal(r.calls.length, 0);
  assert.equal(planned(r), 25);
  assert.ok(r.logs.includes('NO ADS CHANGES MADE.'));
});

test('Preview never writes even with DRY_RUN false', () => {
  const r = run(fixture(), { live: true, preview: true });
  assert.equal(r.error, null);
  assert.equal(r.calls.length, 0);
});

test('first live run: one atomic request, removes before updates before creates', () => {
  const r = run(fixture(), { live: true });
  assert.equal(r.error, null, r.error && r.error.message);
  assert.equal(r.calls.length, 1);
  assert.deepEqual(r.calls[0].options, { partialFailure: false });
  const ops = r.calls[0].ops;
  assert.equal(ops.length, 25);
  const kind = (op) => (Object.values(op)[0].remove ? 'remove' : Object.values(op)[0].update ? 'update' : 'create');
  const kinds = ops.map(kind);
  assert.deepEqual(kinds, [...Array(8).fill('remove'), ...Array(2).fill('update'), ...Array(15).fill('create')]);
  const ads = ops.filter((op) => op.adGroupAdOperation && op.adGroupAdOperation.create).map((op) => op.adGroupAdOperation.create);
  assert.equal(ads.length, 4);
  ads.forEach((a) => {
    assert.equal(a.status, 'PAUSED');
    const texts = a.ad.responsiveSearchAd.headlines.concat(a.ad.responsiveSearchAd.descriptions).map((x) => x.text);
    assert.ok(!texts.some((t) => /\b1am\b/.test(t) && !/1am Fri & Sat/.test(t)), texts.join(' | '));
  });
  const bowling = ads.find((a) => a.adGroup.endsWith('191364831262'));
  assert.deepEqual(bowling.ad.finalUrls, ['https://www.twistedpin.com/bowl/']);
  assert.ok(bowling.ad.responsiveSearchAd.headlines.some((h) => h.text === 'Upgrade to the VIP Suite'));
  assert.equal(bowling.ad.responsiveSearchAd.headlines.length, 12);
  const brandB = ads.find((a) => a.ad.responsiveSearchAd.headlines.some((h) => h.text === 'Bowling Optional') &&
    a.adGroup.endsWith('201769492772') && a.ad.responsiveSearchAd.headlines.length === 7);
  assert.ok(brandB.ad.responsiveSearchAd.descriptions.some((d) =>
    d.text === "Plainfield's premier night out. Bowling optional. Open until 1am Fri & Sat."));
  const negatives = ops.filter((op) => op.campaignCriterionOperation && op.campaignCriterionOperation.create &&
    op.campaignCriterionOperation.create.keyword).map((op) => op.campaignCriterionOperation.create);
  assert.equal(negatives.length, 6);
  assert.ok(!negatives.some((n) => n.campaign.endsWith('23856370451')), 'never on Brand');
  const income = ops.filter((op) => op.adGroupCriterionOperation && op.adGroupCriterionOperation.update);
  assert.deepEqual(income.map((op) => op.adGroupCriterionOperation.update.bidModifier), [0.6, 0.6]);
  const schedules = ops.filter((op) => op.campaignCriterionOperation && op.campaignCriterionOperation.create &&
    op.campaignCriterionOperation.create.adSchedule).map((op) => op.campaignCriterionOperation.create.adSchedule);
  assert.deepEqual(schedules.map((s) => s.dayOfWeek + s.startHour + '-' + s.endHour),
    ['FRIDAY10-24', 'SATURDAY0-1', 'SATURDAY10-24', 'SUNDAY0-1']);
});

test('second run while copies are in review: zero operations, four WAIT notes', () => {
  const state = fixture();
  applyOps(state, run(state, { live: true }).calls[0].ops);
  const r = run(state, { live: true });
  assert.equal(r.error, null, r.error && r.error.message);
  assert.equal(r.calls.length, 0);
  assert.equal(planned(r), 0);
  assert.equal(r.logs.filter((l) => l.startsWith('WAIT')).length, 4);
});

test('approved copies switch: pauses first, then enables; then a clean rerun', () => {
  const state = fixture();
  applyOps(state, run(state, { live: true }).calls[0].ops);
  state.ads.forEach((r) => { if (r.adGroupAd.status === 'PAUSED' && r.adGroupAd.ad.id.startsWith('9')) {
    r.adGroupAd.policySummary = { reviewStatus: 'REVIEWED', approvalStatus: 'APPROVED_LIMITED' }; } });
  const r = run(state, { live: true });
  assert.equal(r.error, null, r.error && r.error.message);
  const ops = r.calls[0].ops.map((op) => op.adGroupAdOperation.update.status);
  assert.deepEqual(ops, ['PAUSED', 'PAUSED', 'PAUSED', 'PAUSED', 'ENABLED', 'ENABLED', 'ENABLED', 'ENABLED']);
  applyOps(state, r.calls[0].ops);
  const done = run(state, { live: true });
  assert.equal(done.error, null, done.error && done.error.message);
  assert.equal(planned(done), 0);
  assert.equal(done.logs.filter((l) => l.startsWith('ALREADY SWITCHED')).length, 4);
  assert.ok(!done.logs.some((l) => l.startsWith('WARNING')), 'no enabled ad keeps an unqualified 1am claim');
});

test('a disapproved copy stops only its own pair', () => {
  const state = fixture();
  applyOps(state, run(state, { live: true }).calls[0].ops);
  let first = true;
  state.ads.forEach((r) => { if (r.adGroupAd.ad.id.startsWith('9')) {
    r.adGroupAd.policySummary = { reviewStatus: 'REVIEWED', approvalStatus: first ? 'DISAPPROVED' : 'APPROVED' }; first = false; } });
  const r = run(state, { live: true });
  assert.equal(r.error, null, r.error && r.error.message);
  assert.equal(r.calls[0].ops.length, 6);
  assert.equal(r.logs.filter((l) => l.startsWith('STOP')).length, 1);
});

test('guards stop the run before any write', () => {
  const cases = [
    ['ad copy drift', (s) => { s.ads[1].adGroupAd.ad.responsiveSearchAd.headlines[7].text = 'Open Late'; }, /Ad copy changed/],
    ['budget change', (s) => { s.campaigns[1].campaignBudget.amountMicros = '40000000'; }, /Budget changed/],
    ['schedule drift', (s) => { s.schedules[4].campaignCriterion.adSchedule.endHour = 22; }, /schedule differs/],
    ['age set to Targeting', (s) => { s.groups[0].adGroup.targetingSetting.targetRestrictions[1].bidOnly = false; }, /Observation/],
    ['ad URL changed', (s) => { s.ads[2].adGroupAd.ad.finalUrls = ['https://www.twistedpin.com/?x=1']; }, /URL options changed/],
    ['callout text changed', (s) => { s.assets[0].asset.calloutAsset.calloutText = 'Open Late'; }, /Callout asset changed/],
    ['unknown list user', (s) => { s.sharedLinks.push({ campaign: { id: '1', name: 'X', status: 'ENABLED' } }); }, /Unexpected campaign/],
    ['income already adjusted', (s) => { s.demographics[3].adGroupCriterion.bidModifier = 1.2; }, /different bid adjustment/]
  ];
  cases.forEach(([name, mutate, pattern]) => {
    const state = fixture(); mutate(state);
    const r = run(state, { live: true });
    assert.ok(r.error && pattern.test(r.error.message), name + ': ' + (r.error && r.error.message));
    assert.equal(r.calls.length, 0, name);
  });
  const wrong = run(fixture(), { live: true, account: '111-111-1111' });
  assert.match(wrong.error.message, /Wrong account/);
});

test('each RUN22 switch isolates its section', () => {
  const expected = { replaceAds: 4, brandCallout: 2, openPlayLate: 6, couponNegatives: 8, ageExclusions: 3, birthdayIncome: 2 };
  Object.keys(expected).forEach((key) => {
    const patch = '\n' + Object.keys(expected).map((k) => 'RUN22.' + k + ' = ' + (k === key) + ';').join('\n');
    const r = run(fixture(), { patch });
    assert.equal(r.error, null, key + ': ' + (r.error && r.error.message));
    assert.equal(planned(r), expected[key], key);
  });
});

test('rejections and transport errors surface as failures', () => {
  const rejected = run(fixture(), { live: true, reject: true });
  assert.match(rejected.error.message, /rejected the atomic request/);
  const network = run(fixture(), { live: true, throwOnMutate: true });
  assert.match(network.error.message, /network/);
  assert.ok(network.logs.some((l) => l.startsWith('REQUEST ERROR')));
});
