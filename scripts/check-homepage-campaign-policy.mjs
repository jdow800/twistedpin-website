/** Fast offline build guard: the actual selector, no browser or network. */
import assert from 'node:assert/strict';
import { HOMEPAGE_CAMPAIGNS, homepageDate, homepagePromotions, selectHomepageCampaign } from '../src/config/homepage-campaigns.ts';
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const start = Date.parse('2026-12-07T06:00:00Z'), end = Date.parse('2027-01-01T03:30:00Z');
const nye = HOMEPAGE_CAMPAIGNS.find(c => c.id === 'nye-mirrorball-2026');
check(nye.startsAt, '2026-12-07T06:00:00Z', 'Dec 7 midnight Chicago');
check(nye.endsAt, '2027-01-01T03:30:00Z', 'Dec 31 9:30pm Chicago, final current VIP purchase cutoff');
for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'America/Chicago']) {
  process.env.TZ = zone;
  check(selectHomepageCampaign(start - 1), null, `${zone}: no early lead`);
  check(selectHomepageCampaign(start)?.id, nye.id, `${zone}: exact start`);
  check(selectHomepageCampaign(end - 1)?.id, nye.id, `${zone}: last eligible millisecond`);
  check(selectHomepageCampaign(end), null, `${zone}: exact retirement`);
  check(homepageDate(start - 1), '2026-12-06', `${zone}: venue date before midnight`);
}
check(homepagePromotions(Date.parse('2026-11-15T18:00:00Z')).promos.some(p => /nye/i.test(p.id)), false, 'obsolete November NYE bar is absent');
check(homepagePromotions(start).promos, [], 'one campaign owns the promotion area');
check(homepagePromotions(start - 1).nextChange, start, 'timer targets exact campaign start');
check(homepagePromotions(end - 1).nextChange, end, 'timer targets exact campaign retirement');
check(homepagePromotions(end).promos.map(p => p.id), ['karaoke-thursdays-2026'], 'retirement cannot revive expired holiday or Singo bars');
check(HOMEPAGE_CAMPAIGNS.find(c => c.id === 'jingle-2026'), { id: 'jingle-2026', enabled: false, publicPageReady: false, startsAt: null, endsAt: null, href: null, priority: 10 }, 'Jingle stays unactivated with no protected link');
const jingle = { id: 'jingle-2026', enabled: true, publicPageReady: true, startsAt: '2026-12-01T06:00:00Z', endsAt: '2027-01-01T06:00:00Z', href: '/future-public-jingle/', priority: 10 };
check(selectHomepageCampaign(start, [jingle, nye])?.id, nye.id, 'one shared priority policy keeps the approved Dec 7 lead');
check(selectHomepageCampaign(start - 1, [{ ...jingle, publicPageReady: false }, nye]), null, 'elapsed date alone cannot publish an unready event');
for (const [instant, expected] of [['2026-11-01T04:59:59Z','2026-10-31'], ['2026-11-01T05:00:00Z','2026-11-01'], ['2026-11-01T07:00:00Z','2026-11-01']])
  check(homepageDate(Date.parse(instant)), expected, 'Chicago date across fall DST');
const sample = [{ id: 'dated', message: 'Example', href: '/example/', showFrom: '2026-11-01', showUntil: '2026-11-01' }];
check(homepagePromotions(Date.parse('2026-11-01T04:59:59Z'), sample).nextChange, Date.parse('2026-11-01T05:00:00Z'), 'DST date begins at the first Chicago midnight');
check(homepagePromotions(Date.parse('2026-11-01T05:00:00Z'), sample).promos.length, 1, 'generic starts at exact local midnight');
check(homepagePromotions(Date.parse('2026-11-01T05:00:00Z'), sample).nextChange, Date.parse('2026-11-02T06:00:00Z'), 'fall-back promo lasts its full 25-hour local date');
check(homepagePromotions(Date.parse('2026-11-02T06:00:00Z'), sample).promos, [], 'generic expires at venue midnight');
check(homepagePromotions(Date.parse('2026-10-22T12:00:00Z'), [{ id: 'self', message: 'Example', href: '/' }, { id: 'hidden-home', message: 'Example', href: '/other/', hideOnPath: '/' }]).promos, [], 'selector respects the same homepage path gates as rendered slides');
check(homepagePromotions(NaN), { campaign: null, promos: [], nextChange: null }, 'invalid clock fails closed');
console.log(`Homepage campaign policy: ${checks} checks passed (offline).`);
