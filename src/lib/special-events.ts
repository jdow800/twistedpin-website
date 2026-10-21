/**
 * Small owner-confirmed event facts, separate from the frozen school-break
 * projection, public Google hours, booking availability and protected drafts.
 * Empty staffing/session arrays are unknown, never inferred from Google or a
 * tentative schedule. Changing readiness requires a reviewed source update.
 */
import source from '../data/special-events-2026.json' with { type: 'json' };

const ZONE = 'America/Chicago';
const MINUTE = 60_000;
type Topic = 'hours' | 'penny' | 'reservations' | 'services' | 'all';
type Session = { starts_at: string; booking_closes_at: string };
type StaffedInterval = { starts_at: string; ends_at: string };
type EventRecord = {
  id: string; name: string; date: string; valid_through: string; aliases: string[];
  confirmed: boolean; admission: 'event_reservations_only' | 'bowling_reservations_only';
  ordinary_visits: 'closed' | 'unknown'; page_public: boolean; page_url: string;
  sales_open_at: string | null; booking_ready_verified: boolean;
  session_cutoffs_verified: boolean; sessions: Session[];
  approved_staffed_intervals: StaffedInterval[];
};
export type SpecialEventContext = {
  id: string; name: string; date: string;
  status: 'confirmed' | 'unconfirmed' | 'expired';
  admission: EventRecord['admission'] | 'unknown';
  ordinary_visits: 'closed' | 'unknown';
  page_public: boolean; public_url: string | null;
  sales_open_at: string | null;
  sales_open_answer: string | null;
  booking_status: 'not_open' | 'unverified' | 'verified' | 'ended';
  sessions_status: 'pending' | 'verified';
  sessions: Array<Session & { booking_status: 'before_cutoff' | 'cutoff_passed'; answer: string }>;
  source_version: string;
  answer: string;
};
export type CurrentSpecialEventContext = {
  generated_at: string; valid_until: string; timezone: typeof ZONE; date: string;
  event: SpecialEventContext | null;
  transfer: {
    allowed: boolean;
    reason: 'confirmed_staffed_interval' | 'staffed_hours_unconfirmed' | 'outside_confirmed_staffed_interval' | 'no_event' | 'unconfirmed_event' | 'expired_event';
    staffed_until: string | null;
  };
};

export function eventLocalDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function addDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^2026-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function instant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value.replace(/(?<!\.\d{3})Z$/, '.000Z');
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function records(config: unknown): { version: string; records: EventRecord[] } {
  if (!object(config) || config.schema_version !== 1 || config.timezone !== ZONE || typeof config.source_version !== 'string' || !Array.isArray(config.records)) return { version: 'unconfirmed', records: [] };
  const accepted = config.records.filter((row): row is EventRecord => {
    if (!object(row) || !validDate(row.date) || row.valid_through !== addDay(row.date)) return false;
    if (typeof row.id !== 'string' || !/^[a-z][a-z0-9_]{1,50}$/.test(row.id) || typeof row.name !== 'string' || !row.name || row.name.length > 60) return false;
    if (!Array.isArray(row.aliases) || !row.aliases.every(a => typeof a === 'string' && /^[a-z ]{2,60}$/.test(a))) return false;
    return typeof row.confirmed === 'boolean' && ['event_reservations_only', 'bowling_reservations_only'].includes(row.admission as string)
      && ['closed', 'unknown'].includes(row.ordinary_visits as string) && typeof row.page_public === 'boolean'
      && typeof row.page_url === 'string' && /^https:\/\/www\.twistedpin\.com\/(?:jingle-bowl|new-years-eve)\/$/.test(row.page_url)
      && (row.sales_open_at === null || instant(row.sales_open_at)) && typeof row.booking_ready_verified === 'boolean'
      && typeof row.session_cutoffs_verified === 'boolean' && Array.isArray(row.sessions) && Array.isArray(row.approved_staffed_intervals);
  });
  // Ambiguous identity/date records never win by array position.
  return { version: config.source_version, records: accepted.filter(row => accepted.filter(other => other.date === row.date || other.id === row.id).length === 1) };
}
function verifiedSessions(row: EventRecord): Session[] {
  if (!row.session_cutoffs_verified || !row.sessions.length) return [];
  const valid = row.sessions.every(session => object(session) && instant(session.starts_at) && instant(session.booking_closes_at)
    && eventLocalDate(new Date(session.starts_at)) === row.date && Date.parse(session.booking_closes_at) <= Date.parse(session.starts_at)
    && (row.sales_open_at === null || Date.parse(session.booking_closes_at) >= Date.parse(row.sales_open_at)));
  return valid ? row.sessions : [];
}
function staffedIntervals(row: EventRecord): StaffedInterval[] {
  const valid = row.approved_staffed_intervals.every(interval => object(interval) && instant(interval.starts_at) && instant(interval.ends_at)
    && eventLocalDate(new Date(interval.starts_at)) === row.date && eventLocalDate(new Date(interval.ends_at)) <= row.valid_through
    && Date.parse(interval.ends_at) > Date.parse(interval.starts_at) && Date.parse(interval.ends_at) - Date.parse(interval.starts_at) <= 24 * 60 * MINUTE);
  return valid ? row.approved_staffed_intervals : [];
}
function spokenDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
}
function spokenInstant(value: string): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === 'hour')!.value);
  const minute = Number(parts.find(p => p.type === 'minute')!.value);
  const period = parts.find(p => p.type === 'dayPeriod')!.value;
  const words = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
  const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const minuteWords = minute < 20 ? small[minute] : `${['', '', 'twenty', 'thirty', 'forty', 'fifty'][Math.floor(minute / 10)]}${minute % 10 ? ` ${small[minute % 10]}` : ''}`;
  const clock = minute === 0 && hour === 12 ? (period === 'AM' ? 'midnight' : 'noon')
    : `${words[hour % 12]}${minute ? ` ${minute < 10 ? 'oh ' : ''}${minuteWords}` : ''} ${period}`;
  return `${spokenDate(eventLocalDate(date))} at ${clock} Central time`;
}

/** Config/clock injection is internal for offline tests, never HTTP arguments. */
export function resolveSpecialEventAlias(phrase: string, now: Date = new Date(), config: unknown = source): string | null {
  const match = /^(.*?)(?: (\d{4}))?$/.exec(phrase.toLowerCase().replace(/[’']/g, '').trim());
  if (!match) return null;
  const found = records(config).records.filter(row => row.aliases.includes(match[1]));
  if (found.length !== 1) return null;
  const row = found[0];
  return match[2] ? (row.date.startsWith(match[2]) ? row.date : null) : row.date >= eventLocalDate(now) ? row.date : null;
}

export function specialEventContext(date: string, now: Date = new Date(), config: unknown = source): SpecialEventContext | null {
  const parsed = records(config);
  const row = parsed.records.find(record => record.date === date);
  if (!row) return null;
  const expired = eventLocalDate(now) > row.valid_through;
  const result: SpecialEventContext = {
    id: row.id, name: row.name, date: row.date,
    status: expired ? 'expired' : row.confirmed ? 'confirmed' : 'unconfirmed',
    admission: 'unknown', ordinary_visits: 'unknown', page_public: false, public_url: null,
    sales_open_at: null, sales_open_answer: null, booking_status: expired ? 'ended' : 'unverified',
    sessions_status: 'pending', sessions: [], source_version: parsed.version, answer: '',
  };
  if (result.status !== 'confirmed') {
    result.answer = `I don't have current confirmed details for ${row.name} on ${spokenDate(date)}. The team can confirm.`;
    return result;
  }
  result.admission = row.admission;
  result.ordinary_visits = row.ordinary_visits;
  result.page_public = row.page_public;
  result.public_url = row.page_public ? row.page_url : null;
  result.sales_open_at = row.sales_open_at;
  const beforeOpening = row.sales_open_at !== null && now.getTime() < Date.parse(row.sales_open_at);
  result.booking_status = beforeOpening ? 'not_open' : row.booking_ready_verified && row.page_public && row.sales_open_at !== null ? 'verified' : 'unverified';
  if (row.sales_open_at) {
    result.sales_open_answer = beforeOpening
      ? `Reservations are scheduled to open on ${spokenInstant(row.sales_open_at)}.`
      : result.booking_status === 'verified' ? 'The booking page is ready; check it for current booking options.'
        : 'The scheduled reservation opening time has passed, but I cannot confirm booking is ready. Please check the event page or ask the team.';
  }
  const sessions = verifiedSessions(row);
  if (sessions.length) {
    result.sessions_status = 'verified';
    result.sessions = sessions.map(session => ({
      starts_at: session.starts_at, booking_closes_at: session.booking_closes_at,
      booking_status: now.getTime() < Date.parse(session.booking_closes_at) ? 'before_cutoff' : 'cutoff_passed',
      answer: `The session starts on ${spokenInstant(session.starts_at)}. Its reservation cutoff is ${spokenInstant(session.booking_closes_at)}.${now.getTime() >= Date.parse(session.booking_closes_at) ? ' That cutoff has passed.' : ''}`,
    }));
    if (result.sessions.every(session => session.booking_status === 'cutoff_passed')) result.booking_status = 'ended';
  }
  result.answer = specialEventAnswer(result, 'all');
  return result;
}

export function specialEventAnswer(event: SpecialEventContext, topic: Topic): string {
  if (event.status !== 'confirmed') return event.answer;
  const date = spokenDate(event.date);
  const eventOnly = event.admission === 'event_reservations_only';
  const admission = eventOnly
    ? `${event.name} is on ${date}, with event reservations only all day. Regular visits aren't available that day.`
    : `Bowling on ${date} is by reservation only.`;
  const referral = event.page_public ? `Please check the ${event.name} page or ask the team.` : 'The public event link is not ready yet. The team can confirm the details.';
  if (topic === 'services') return `I don't have confirmed kitchen, bar or Beer Wall service times for ${event.name} on ${date}. The team can confirm.`;
  if (topic === 'penny') return `I can't confirm Penny a Pin for ${date}. Please check with the front desk.`;
  if (topic === 'hours') return `${admission} ${event.sessions_status === 'verified' ? 'Event entry and closing hours still need confirmation from the team.' : 'Session, entry and closing times still need confirmation from the team.'}`;
  const readiness = event.booking_status === 'ended' ? 'The confirmed reservation cutoffs have passed.'
    : event.sales_open_answer ?? (event.booking_status === 'verified' ? 'Check the event page for current booking options.' : 'Session times and reservation opening are not confirmed yet.');
  return `${admission} ${readiness} ${referral}`;
}

/** Fresh read-only routing context; never changes Google's public is_open. */
export function currentSpecialEventContext(now: Date = new Date(), config: unknown = source): CurrentSpecialEventContext {
  const parsed = records(config);
  const date = eventLocalDate(now);
  const active = (row: EventRecord) => staffedIntervals(row).find(interval => now.getTime() >= Date.parse(interval.starts_at) && now.getTime() < Date.parse(interval.ends_at));
  // An explicit approved overnight interval retains its originating event date.
  // Otherwise this is calendar-date context, not an inferred prior-night event.
  const candidates = parsed.records.filter(row => row.date === date || (row.confirmed && active(row)));
  const row = candidates.length === 1 ? candidates[0] : undefined;
  const event = row ? specialEventContext(row.date, now, config) : null;
  const staffed = row && event?.status === 'confirmed' ? active(row) : undefined;
  const reason: CurrentSpecialEventContext['transfer']['reason'] = !event ? 'no_event'
    : event.status === 'unconfirmed' ? 'unconfirmed_event' : event.status === 'expired' ? 'expired_event'
      : staffed ? 'confirmed_staffed_interval' : row && staffedIntervals(row).length ? 'outside_confirmed_staffed_interval' : 'staffed_hours_unconfirmed';
  let validUntil = now.getTime() + MINUTE;
  for (const record of parsed.records) for (const interval of staffedIntervals(record)) {
    for (const boundary of [Date.parse(interval.starts_at), Date.parse(interval.ends_at)]) {
      if (boundary > now.getTime()) validUntil = Math.min(validUntil, boundary);
    }
  }
  // Don't carry yesterday's admission policy over a Chicago midnight. Find the
  // first changed local date within this at-most-one-minute freshness period.
  if (eventLocalDate(new Date(validUntil)) !== date) {
    let low = now.getTime(), high = validUntil;
    while (high - low > 1) { const mid = Math.floor((low + high) / 2); if (eventLocalDate(new Date(mid)) === date) low = mid; else high = mid; }
    validUntil = high;
  }
  return {
    generated_at: now.toISOString(), valid_until: new Date(validUntil).toISOString(), timezone: ZONE, date, event,
    transfer: { allowed: Boolean(staffed), reason, staffed_until: staffed?.ends_at ?? null },
  };
}
