/** Public pricing presentation only. Checkout remains authoritative for packages. */
import { PRICING, type PriceWindow } from '../data/pricing.ts';
import { HOURS, parseTimeLabel, type DayKey } from '../data/hours.ts';
import policy from '../data/visit-policy-2026-27.json' with { type: 'json' };
import { visitDatePayload } from './visit-date.ts';
import { eventLocalDate } from './special-events.ts';

type DayHours = { closed: boolean; openMinutes: number; closeMinutes: number; openLabel: string; closeLabel: string; label: string };
export type HoursSnapshot = { fetchedAt?: string | null; hours?: Partial<Record<DayKey, DayHours>> | null; regularHours?: Partial<Record<DayKey, DayHours>> | null };
type Hourly = { traditional: number; suite: number };
const projected = policy.dates as Record<string, { walk_in_hourly?: Hourly; penny: string }>;
const KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 86_400_000;
export { eventLocalDate as pricingToday };

export function validPricingDate(value: string | null): value is string {
  if (!value || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function movePricingDate(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
export function pricingDay(date: string): DayKey { return KEYS[new Date(`${date}T12:00:00Z`).getUTCDay()]; }
export function pricingDateLabel(date: string, short = false): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...(short ? { month: 'short', day: 'numeric' } as const : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' } as const) }).format(new Date(`${date}T12:00:00Z`));
}
function clock(minutes: number): string {
  const minute = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(minute / 60);
  if (minute === 720) return 'noon';
  if (minute === 0) return 'midnight';
  return `${hour % 12 || 12}${minute % 60 ? `:${String(minute % 60).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}
function plannedMinutes(value: string): number { const [h,m] = value.split(':').map(Number); return h * 60 + m; }

export function upcomingPennyExclusions(now = new Date()): string[] {
  const today = eventLocalDate(now);
  return today > policy.valid_through ? [] : Object.entries(projected).filter(([date, row]) => date >= today && row.penny === 'excluded').map(([date]) => date);
}
export function holidayPricingDates(now = new Date()): string[] {
  const today = eventLocalDate(now);
  return today > policy.valid_through ? [] : Object.entries(projected).filter(([date, row]) => date >= today && row.walk_in_hourly).map(([date]) => date);
}

/** Fresh rolling Google hours apply only to their actual seven dates. */
export function pricingForDate(date: string, now = new Date(), snapshot: HoursSnapshot = {}) {
  if (!validPricingDate(date)) throw new Error('Invalid pricing date');
  const day = pricingDay(date);
  const visit = visitDatePayload({ date }, now);
  const event = visit.event;
  const base = { date, day, label: pricingDateLabel(date), rows: [] as PriceWindow[], hours: '', note: '', holiday: false, twoHoursOnly: false, pennyExcluded: false,
    pennyScheduleReviewed: date >= policy.valid_from && date <= policy.valid_through && eventLocalDate(now) <= policy.valid_through,
    event, kind: 'ordinary' as 'ordinary' | 'closed' | 'event' | 'unknown' };
  // Never attach ordinary hourly rates, coupons or a waitlist to an event-only day.
  if (event) return { ...base, kind: event.status === 'confirmed' ? 'event' as const : 'unknown' as const };
  if (visit.hours.status === 'closed') return { ...base, kind: 'closed' as const, hours: 'Closed' };

  const fetched = snapshot.fetchedAt ? new Date(snapshot.fetchedAt) : null;
  const age = fetched ? now.getTime() - fetched.getTime() : Infinity;
  const fresh = age >= 0 && age < 36 * 60 * 60 * 1000;
  const snapshotDate = fetched && Number.isFinite(fetched.getTime()) ? eventLocalDate(fetched) : null;
  const inGoogleDates = fresh && snapshotDate !== null && date >= snapshotDate && date <= movePricingDate(snapshotDate, 6);
  const live = inGoogleDates ? snapshot.hours?.[day] : undefined;
  // A fresh listing closure overrides an approved open plan; never advertise rates as available on a closed day.
  if (live?.closed) return { ...base, kind: 'closed' as const, hours: 'Closed' };

  let open: number;
  let close: number;
  let note = '';
  if (live) {
    open = live.openMinutes; close = live.closeMinutes;
  } else if (visit.hours.status === 'open') {
    open = plannedMinutes(visit.hours.open!);
    close = plannedMinutes(visit.hours.close!) + (visit.hours.closing_date !== date ? 1440 : 0);
  } else {
    const regular = snapshot.regularHours?.[day];
    if (regular?.closed) return { ...base, kind: 'closed' as const, hours: 'Closed', note: 'Regular schedule. Check Google for date-specific changes.' };
    open = regular?.openMinutes ?? parseTimeLabel(HOURS[day].open)!;
    close = regular?.closeMinutes ?? parseTimeLabel(HOURS[day].close)!;
    if (close <= open) close += 1440;
    note = 'Regular hours and rates shown. Special-date changes may apply; check Google before visiting.';
  }
  if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open || close - open > DAY_MS / 60_000) {
    return { ...base, kind: 'unknown' as const, note: 'Please check Google or contact the team to confirm this date.' };
  }
  const hourly = eventLocalDate(now) <= policy.valid_through ? projected[date]?.walk_in_hourly : undefined;
  const windows = hourly ? [{ label: 'All open hours', ...hourly }] : PRICING[day].windows;
  const rows = windows.flatMap((window, index) => {
    const parts = window.label.split(' – ');
    let start = index === 0 ? open : parseTimeLabel(parts[0].replace(/\s/g, ''))!;
    let end = index === windows.length - 1 ? close : parseTimeLabel(parts[1].replace(/\s/g, ''))!;
    if (end <= start && index === windows.length - 1) end += 1440;
    start = Math.max(open, start); end = Math.min(close, end);
    return end > start ? [{ ...window, label: `${clock(start)} – ${clock(end)}${end >= 1440 ? ' next day' : ''}` }] : [];
  });
  return { ...base, rows, hours: `${clock(open)} – ${clock(close)}${close >= 1440 ? ' next day' : ''}`, note,
    holiday: Boolean(hourly), twoHoursOnly: visit.ordinary_online_reservations === 'two_hours_only', pennyExcluded: visit.penny === 'excluded' };
}
