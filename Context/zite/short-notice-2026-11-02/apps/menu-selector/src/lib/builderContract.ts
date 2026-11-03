/** Shared browser/server submission contract. Keep serialization aligned with n8n's
 * brain/notes/builder-pricing-contract.mjs. FNV detects mismatched inputs, not a signed price. */
export type PricingStatus = 'estimate_shown' | 'manual_quote_required';
export type ManualReason = 'custom_event' | 'estimate_unavailable';
export type CanonicalBuild = {
  event: { date: string; start_time: string; duration?: number; guests: number | '100+'; lane_type?: 'vip' | 'traditional' };
  food_package: string;
  bar_selection: 'none' | 'individual' | '10_card' | '15_card';
  bar_qty: number;
  add_ons: { slug: string; qty: number }[];
};
export type NumericEstimate = { total: number; deposit: number; lane_label: string; input_fingerprint?: string };
export type PricingMetadata = {
  pricing_status?: PricingStatus;
  manual_reason?: ManualReason;
  estimate?: NumericEstimate | null;
  submitted_at?: string;
};
export const RECALCULATE_MESSAGE = 'Your estimate needs to be refreshed. Close this review, check your date and selections, and calculate again.';
export const SHORT_NOTICE_MESSAGE = 'Our team needs to confirm availability and whether we can accommodate this short-notice request.';
export const REQUEST_SENT_MESSAGE = 'Request sent. Our team will review it and confirm availability and payment details.';

export function civilDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const d = new Date(Date.UTC(y, month - 1, day, 12));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return Date.UTC(y, month - 1, day) / 86400000;
}
export function centralDate(now: Date = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(p => [p.type, p.value]));
  return p.year + '-' + p.month + '-' + p.day;
}
export function daysAway(date: string, now: Date = new Date()): number | null {
  const day = civilDay(date), today = civilDay(centralDate(now));
  return day === null || today === null ? null : day - today;
}
export type BookingPolicy = {
  shortNotice: boolean;
  staffApprovalRequired: boolean;
  paymentRequirement: 'full' | 'deposit';
};
/** Display policy only. Avery and TPRS recheck when the booking/link is issued. */
export function eventStartMs(date: string, time: string): number | null {
  if (civilDay(date) === null || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [y, m, d] = date.split('-').map(Number), [h, minute] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, h, minute);
  const offset = (ts: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ts)).map(p => [p.type, p.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts;
  };
  let ts = naive - offset(naive);
  ts = naive - offset(ts);
  return ts;
}
export function eventTimeError(date: string, time: string, now = new Date()): string {
  const start = eventStartMs(date, time);
  return start !== null && start <= now.getTime() ? "Choose a start time that hasn't passed." : '';
}
export function bookingPolicy(date: string, time: string, food: string | null, now = new Date()): BookingPolicy {
  const days = daysAway(date, now), start = eventStartMs(date, time);
  const shortNotice = days !== null && days >= 0 && days <= 9;
  const pizzaEligible = food === 'pizza_pop' && start !== null &&
    (days !== null && days > 0 || days === 0 && start - now.getTime() >= 6 * 3600000);
  return { shortNotice, staffApprovalRequired: shortNotice && !pizzaEligible,
    paymentRequirement: shortNotice ? 'full' : 'deposit' };
}
export function shortNoticeMessage(policy: BookingPolicy, staffRoute = false): string {
  if (!policy.shortNotice) return '';
  const approval = staffRoute || policy.staffApprovalRequired
    ? 'Our team needs to confirm availability and whether we can accommodate this short-notice request.'
    : "We'll check availability for your Pizza & Pop event. Same-day requests need at least six hours remaining when the booking and payment link are created.";
  return approval + ' Full payment and your final guest count are required at booking.';
}

export function getMinDate(now: Date = new Date()): string {
  return centralDate(now);
}
export function eventDateError(date: string, now: Date = new Date()): string {
  if (!date) return 'Pick a date.';
  const days = daysAway(date, now);
  if (days === null) return 'Choose a valid event date.';
  if (days < 0) return 'Choose today or a later date.';
  if (days > 365) return 'Choose a date within the next 365 days.';
  return '';
}
export function sortAddOns<T extends { slug: string; qty: number }>(addons: T[]): T[] {
  return [...addons].sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.qty - b.qty);
}
export function configKey(payload: CanonicalBuild): string {
  const ev = payload.event;
  const over = ev.guests === '100+';
  const duration = Number(ev.duration);
  const bar = String(payload.bar_selection || 'none').toLowerCase();
  const qty = bar === 'none' || bar === 'individual' ? 0 : (parseInt(String(payload.bar_qty), 10) || 0);
  return JSON.stringify([ev.date, ev.start_time, duration === 2 || duration === 3 ? duration : null,
    over ? '100+' : Number(ev.guests), over ? '' : String(ev.lane_type || '').toLowerCase(),
    String(payload.food_package || '').toLowerCase(), bar, qty,
    sortAddOns(payload.add_ons).map(a => a.slug + ':' + a.qty).join(',')]);
}
export function inputFingerprint(payload: CanonicalBuild): string {
  const source = configKey(payload);
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
export type BuildSelections = {
  date: string; time: string; duration: number; guestCount: number; laneType: 'vip' | 'traditional';
  foodPackageSlug: string | null; barSelection: string; barQty: number; addons: { slug: string; qty: number }[];
};
export function canonicalBuild(d: BuildSelections): CanonicalBuild {
  const over = d.guestCount > 100;
  const barMap: Record<string, CanonicalBuild['bar_selection']> = {
    own_tab: 'individual', individual: 'none', none: 'none', '10_card': '10_card', '15_card': '15_card',
  };
  const bar = barMap[d.barSelection] ?? 'none';
  return {
    event: { date: d.date, start_time: d.time === '__outside__' ? 'outside_hours' : d.time,
      ...(over ? {} : { duration: d.duration, lane_type: d.laneType }), guests: over ? '100+' : d.guestCount },
    food_package: d.foodPackageSlug ?? '',
    bar_selection: bar, bar_qty: bar === '10_card' || bar === '15_card' ? d.barQty : 0,
    add_ons: sortAddOns(d.addons.map(a => ({ slug: a.slug, qty: a.qty }))),
  };
}
export function pricingInputKey(d: BuildSelections, tier: string, day: string): string {
  // API returns lane/duration alternatives in one response; those select an option.
  const p = canonicalBuild(d);
  return JSON.stringify([day, tier, p.event.date, p.event.start_time, p.event.guests,
    p.food_package, p.bar_selection, p.bar_qty, p.add_ons]);
}
export function allowsManualQuote(code: string): boolean {
  return ['engine_unavailable', 'rate_limited'].includes(code);
}
export function pricingContractError(payload: CanonicalBuild & PricingMetadata, now = new Date()): string {
  if (!payload.pricing_status) return payload.manual_reason ? RECALCULATE_MESSAGE : ''; // Pre-contract clients stay compatible/unverified.
  const dateError = eventDateError(payload.event.date, now);
  if (dateError) return dateError;
  const timeError = eventTimeError(payload.event.date, payload.event.start_time, now);
  if (timeError) return timeError;
  if (!payload.submitted_at || !Number.isFinite(Date.parse(payload.submitted_at))) return RECALCULATE_MESSAGE;
  const ev = payload.event;
  const custom = ev.guests === '100+' || ev.start_time === 'outside_hours';
  if (!payload.food_package || !Number.isInteger(payload.bar_qty) || payload.bar_qty < 0 || payload.bar_qty > 300 ||
      payload.add_ons.some(a => !a.slug || !Number.isInteger(a.qty) || a.qty < 1 || a.qty > 300)) return RECALCULATE_MESSAGE;
  if (ev.guests !== '100+' && (!Number.isInteger(ev.guests) || ev.guests < 10 || ev.guests > 100 ||
      !['vip', 'traditional'].includes(ev.lane_type ?? '') || ![2, 3].includes(ev.duration ?? 0))) return RECALCULATE_MESSAGE;
  if (ev.start_time !== 'outside_hours' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(ev.start_time)) return RECALCULATE_MESSAGE;
  if (payload.pricing_status === 'manual_quote_required') {
    if (payload.estimate !== null || !['custom_event', 'estimate_unavailable'].includes(payload.manual_reason ?? '') ||
        (custom ? payload.manual_reason !== 'custom_event' : payload.manual_reason !== 'estimate_unavailable')) return RECALCULATE_MESSAGE;
    return '';
  }
  const e = payload.estimate;
  if (custom || payload.manual_reason || !e || !Number.isFinite(e.total) || e.total <= 0 ||
      !Number.isFinite(e.deposit) || e.deposit < 0 || e.deposit > e.total ||
      e.input_fingerprint !== inputFingerprint(payload)) return RECALCULATE_MESSAGE;
  return '';
}
export function reviewError(data: { date: string; time?: string; reviewedDay: string }, now = new Date()): string {
  return eventDateError(data.date, now) || eventTimeError(data.date, data.time ?? '', now) || (data.reviewedDay !== centralDate(now) ? RECALCULATE_MESSAGE : '');
}
