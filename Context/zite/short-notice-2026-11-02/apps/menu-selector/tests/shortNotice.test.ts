import assert from 'node:assert/strict';
import { bookingPolicy, eventStartMs, eventTimeError, eventDateError, shortNoticeMessage, canonicalBuild, inputFingerprint, pricingContractError } from '../src/lib/builderContract';
const now = new Date('2026-10-23T10:00:00-05:00');
let checks = 0;
const eq = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
for (const day of [0,1,3,4,9,10]) {
  const date = new Date(Date.UTC(2026,9,23 + day)).toISOString().slice(0,10);
  for (const food of ['pizza_pop','stars_strikes','italiano','burrito_bowl']) {
    const policy = bookingPolicy(date,'16:00',food,now);
    eq(policy.shortNotice, day <= 9);
    eq(policy.paymentRequirement, day <= 9 ? 'full' : 'deposit');
    eq(policy.staffApprovalRequired, day <= 9 && food !== 'pizza_pop');
    eq(eventDateError(date, now), '');
  }
}
eq(bookingPolicy('2026-10-23','16:00','pizza_pop',new Date(now.getTime()+1)).staffApprovalRequired,true);
eq(bookingPolicy('2026-10-23','16:00','pizza_pop',new Date(now.getTime()-1)).staffApprovalRequired,false);
eq(bookingPolicy('2026-10-23','15:30','pizza_pop',now).staffApprovalRequired,true);
eq(eventTimeError('2026-10-23','16:00',new Date('2026-10-23T16:00:00-05:00')).length > 0,true);
eq(eventStartMs('2026-03-08','16:00'),Date.parse('2026-03-08T16:00:00-05:00'));
eq(eventStartMs('2026-11-01','16:00'),Date.parse('2026-11-01T16:00:00-06:00'));
eq(bookingPolicy('2026-10-24','__outside__','pizza_pop',now).staffApprovalRequired,true);
eq(shortNoticeMessage(bookingPolicy('2026-10-23','16:00','pizza_pop',now)).includes('Our team needs'),false);
eq(shortNoticeMessage(bookingPolicy('2026-10-23','16:00','pizza_pop',now),true).includes('Our team needs'),true);
for (const foodPackageSlug of ['pizza_pop','stars_strikes','italiano','burrito_bowl']) {
  const build = canonicalBuild({date:'2026-10-23',time:'15:30',duration:2,guestCount:15,laneType:'vip',foodPackageSlug,barSelection:'own_tab',barQty:15,addons:[]});
  eq(pricingContractError({...build,pricing_status:'estimate_shown',submitted_at:now.toISOString(),estimate:{total:605,deposit:305,lane_label:'VIP Suite',input_fingerprint:inputFingerprint(build)}},now),'');
}
console.log(checks + ' short-notice boundary checks passed');
