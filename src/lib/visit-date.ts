/**
 * Approved planned business-date facts, not live opening status or inventory.
 * /api/hours/ still owns current opening/transfer routing. This projection
 * neither calls TPRS nor invents service cutoffs from venue closing hours.
 *
 * Date phrases are deliberately bounded. `this Wednesday` means Wednesday
 * in the current Chicago Monday-Sunday week; `next Wednesday` means the next
 * such week. A month/day without a year resolves only within this one finite
 * season, never to the next future occurrence. An implicit past date or bare
 * weekday asks for an exact date; explicit years can name a past planned date.
 */
import policy from '../data/visit-policy-2026-27.json' with { type: 'json' };

export const VISIT_TOPICS = ['hours', 'penny', 'reservations', 'services', 'all'] as const;
export type VisitTopic = typeof VISIT_TOPICS[number];
type Coverage = 'school_break' | 'approved_regular_date' | 'separately_managed' | 'uncovered' | 'expired' | 'unresolved';
type Status = 'known' | 'partial' | 'unknown' | 'needs_date' | 'invalid_request';
type Hours = {
  status: 'open' | 'closed' | 'unknown';
  basis: 'approved_planned';
  open: string | null;
  close: string | null;
  closing_date: string | null;
};
export type VisitDateResponse = {
  schema_version: 1;
  status: Status;
  date: string | null;
  is_today: boolean;
  topic: VisitTopic;
  timezone: 'America/Chicago';
  coverage: Coverage;
  answer: string;
  service_cutoffs_must_confirm: boolean;
  hours: Hours;
  ordinary_online_reservations: 'two_hours_only' | 'closed' | 'unknown';
  penny: 'excluded' | 'unknown';
  services: 'unknown';
  capacity: 'not_checked';
  source: { operation_version: string; calendar_sha256: string; valid_through: string };
  link: string;
};
type ProjectedDate = {
  coverage: 'school_break' | 'approved_regular_date';
  hours: Omit<Hours, 'basis'>;
  ordinary_online_reservations: VisitDateResponse['ordinary_online_reservations'];
  penny: VisitDateResponse['penny'];
};
const dates = policy.dates as Record<string, ProjectedDate>;
const TIMEZONE = 'America/Chicago';
const HOURS_LINK = 'https://www.twistedpin.com/#find-us';
const BOOKING_LINK = 'https://www.twistedpin.com/reserve/';
const NYE_LINK = 'https://www.twistedpin.com/new-years-eve/';
const CLARIFY = 'What exact date do you mean? Please give the month, day and year.';
const UNKNOWN_HOURS: Hours = { status: 'unknown', basis: 'approved_planned', open: null, close: null, closing_date: null };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
// Explicit aliases for this approved season. No computed future holidays.
const HOLIDAYS: Record<string, string> = {
  'thanksgiving': '2026-11-26', 'thanksgiving day': '2026-11-26',
  'thanksgiving eve': '2026-11-25', 'black wednesday': '2026-11-25',
  'christmas': '2026-12-25', 'christmas day': '2026-12-25', 'christmas eve': '2026-12-24',
  'new years eve': '2026-12-31', 'nye': '2026-12-31', 'new years day': '2027-01-01',
  'mlk day': '2027-01-18', 'martin luther king day': '2027-01-18',
  'martin luther king jr day': '2027-01-18',
  'presidents day': '2027-02-15', 'president day': '2027-02-15',
  'good friday': '2027-03-26', 'easter': '2027-03-28', 'easter sunday': '2027-03-28',
  'memorial day': '2027-05-31',
};

function chicagoDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function validISO(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function addDays(date: string, amount: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}
function makeDate(year: string, month: number, day: string): string | null {
  const iso = `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
  return validISO(iso) ? iso : null;
}

/** Only server code/tests supply the clock. No request field reaches `now`. */
export function resolveVisitDate(input: string, now: Date = new Date()): string | null {
  if (input.length > 100 || /[\x00-\x1f\x7f]/.test(input)) return null;
  const trimmed = input.trim();
  if (validISO(trimmed)) return trimmed;
  const phrase = trimmed.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');
  const today = chicagoDate(now);
  const prefixed = /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday),? (.+)$/.exec(phrase);
  if (prefixed) {
    if (!/^(?:\d{4}-|[a-z]+\.? \d)/.test(prefixed[2])) return null;
    const date = resolveVisitDate(prefixed[2], now);
    return date && new Date(`${date}T12:00:00Z`).getUTCDay() === WEEKDAYS.indexOf(prefixed[1]) ? date : null;
  }
  if (phrase === 'today' || phrase === 'tonight') return today;
  if (phrase === 'tomorrow') return addDays(today, 1);
  const weekday = /^(this|next) (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(phrase);
  if (weekday) {
    const todayWeekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = addDays(today, -((todayWeekday + 6) % 7));
    const date = addDays(monday, (WEEKDAYS.indexOf(weekday[2]) + 6) % 7 + (weekday[1] === 'next' ? 7 : 0));
    return date >= today ? date : null;
  }
  const holiday = /^(.*?)(?: (\d{4}))?$/.exec(phrase)!;
  if (Object.hasOwn(HOLIDAYS, holiday[1])) {
    const date = HOLIDAYS[holiday[1]];
    // Never roll an alias into another year's unreviewed holiday calendar.
    return holiday[2] ? (date.startsWith(holiday[2]) ? date : null) : date >= today ? date : null;
  }
  const monthDay = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(phrase);
  if (!monthDay) return null;
  const month = MONTHS.findIndex(name => name === monthDay[1] || name.slice(0, 3) === monthDay[1] || (name === 'september' && monthDay[1] === 'sept')) + 1;
  if (!month) return null;
  if (monthDay[3]) return makeDate(monthDay[3], month, monthDay[2]);
  const candidates = [...new Set([policy.valid_from.slice(0, 4), policy.valid_through.slice(0, 4)])]
    .map(year => makeDate(year, month, monthDay[2]))
    .filter((date): date is string => date !== null && date >= policy.valid_from && date <= policy.valid_through);
  return candidates.length === 1 && candidates[0] >= today ? candidates[0] : null;
}

function spokenDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    .format(new Date(`${date}T12:00:00Z`));
}
function spokenTime(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  if (hour === 12 && minute === 0) return 'noon';
  if (hour === 0 && minute === 0) return 'midnight';
  const words = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
  return `${words[hour % 12]}${minute ? ` ${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
}
function hoursAnswer(date: string, hours: Hours): string {
  const label = spokenDate(date);
  if (hours.status === 'closed') return `We're closed on ${label}.`;
  if (hours.status === 'unknown') return `I don't have confirmed hours for ${label}. The team can confirm.`;
  const closeDay = hours.closing_date !== date ? ` on ${spokenDate(hours.closing_date!)}` : '';
  return `Our hours on ${label} are ${spokenTime(hours.open!)} to ${spokenTime(hours.close!)}${closeDay}.`;
}

export function visitDatePayload(input: { date?: string; topic?: VisitTopic }, now: Date = new Date()): VisitDateResponse {
  const topic = input.topic ?? 'all';
  const date = resolveVisitDate(input.date ?? '', now);
  const today = chicagoDate(now);
  const row = date ? dates[date] : undefined;
  const separatelyManaged = date !== null && policy.separately_managed_dates.includes(date);
  const expired = today > policy.valid_through;
  const result: VisitDateResponse = {
    schema_version: 1, status: 'unknown', date, is_today: date === today, topic, timezone: TIMEZONE,
    coverage: !date ? 'unresolved' : expired ? 'expired' : separatelyManaged ? 'separately_managed' : row?.coverage ?? 'uncovered',
    answer: '', service_cutoffs_must_confirm: row?.coverage === 'school_break' || separatelyManaged,
    hours: { ...UNKNOWN_HOURS }, ordinary_online_reservations: 'unknown', penny: 'unknown',
    services: 'unknown', capacity: 'not_checked',
    source: { operation_version: policy.operation_version, calendar_sha256: policy.calendar_sha256, valid_through: policy.valid_through },
    link: topic === 'reservations' ? BOOKING_LINK : HOURS_LINK,
  };
  if (!date) {
    result.status = 'needs_date';
    result.answer = CLARIFY;
    return result;
  }
  if (expired) {
    result.answer = `I don't have current confirmed details for ${spokenDate(date)}. The team can confirm.`;
    return result;
  }
  if (separatelyManaged) {
    result.answer = `New Year's Eve on ${spokenDate(date)} is handled separately. Please check the New Year's Eve page or ask the team to confirm.`;
    if (topic === 'reservations' || topic === 'all') {
      result.status = 'partial';
      result.answer = `Bowling on ${spokenDate(date)} is by reservation only. Please check the New Year's Eve page or ask the team to confirm the details.`;
    }
    result.link = NYE_LINK;
    return result;
  }
  if (row) {
    result.hours = { ...row.hours, basis: 'approved_planned' };
    result.ordinary_online_reservations = row.ordinary_online_reservations;
    result.penny = row.penny;
  }
  const label = spokenDate(date);
  const hours = hoursAnswer(date, result.hours);
  const reservations = result.ordinary_online_reservations === 'closed' ? hours
    : result.ordinary_online_reservations === 'two_hours_only'
      ? `Online lane reservations for ${label} are two hours only. Check the reservation page for booking options.`
      : `I can't confirm the online reservation lengths for ${label}. The reservation page or team can confirm.`;
  const penny = result.penny === 'excluded'
    ? `Penny a Pin is not offered on ${label}.`
    : `I can't confirm Penny a Pin for ${label}. Please check with the front desk.`;
  const services = `I don't have confirmed kitchen, bar or Beer Wall service times for ${label}. The team can confirm.`;
  if (topic === 'hours') { result.answer = hours; result.status = result.hours.status === 'unknown' ? 'unknown' : 'known'; }
  else if (topic === 'reservations') { result.answer = reservations; result.status = result.ordinary_online_reservations === 'unknown' ? 'unknown' : 'known'; }
  else if (topic === 'penny') { result.answer = penny; result.status = result.penny === 'excluded' ? 'known' : 'unknown'; }
  else if (topic === 'services') { result.answer = services; }
  else {
    // Do not read a lecture of unknowns when the caller asks for a quick overview.
    const sentences = result.hours.status !== 'unknown' ? [hours] : [];
    if (result.ordinary_online_reservations === 'two_hours_only') sentences.push('Online lane reservations are two hours only.');
    if (result.penny === 'excluded') sentences.push('Penny a Pin is not offered that day.');
    result.status = sentences.length ? 'partial' : 'unknown';
    result.answer = sentences.length ? sentences.join(' ') : `I don't have confirmed visit details for ${label}. The team can confirm.`;
  }
  return result;
}

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
};
const MAX_BODY_BYTES = 4096;
function response(payload: VisitDateResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: HEADERS });
}
function invalid(status = 400): Response {
  // Never echo caller text, transcripts, headers or malformed body contents.
  const payload = visitDatePayload({});
  payload.status = 'invalid_request';
  payload.answer = 'Please ask again with a date and a topic: hours, Penny a Pin, reservations or services.';
  return response(payload, status);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function parseArguments(value: unknown): { date?: string; topic?: VisitTopic } | null {
  if (!isRecord(value)) return null;
  if (Object.hasOwn(value, 'args')) {
    if (Object.keys(value).length !== 1 || !isRecord(value.args)) return null;
    value = value.args;
  }
  const args = value as Record<string, unknown>;
  if (Object.keys(args).some(key => key !== 'date' && key !== 'topic')) return null;
  if (args.date !== undefined && (typeof args.date !== 'string' || args.date.length > 100)) return null;
  if (args.topic !== undefined && !VISIT_TOPICS.includes(args.topic as VisitTopic)) return null;
  return args as { date?: string; topic?: VisitTopic };
}

/** Read-only handler. Its clock argument exists only for deterministic local tests. */
export async function visitDateRequest(request: Request, now: Date = new Date()): Promise<Response> {
  let input: unknown;
  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length > 1)) return invalid();
    input = Object.fromEntries(params);
  } else if (request.method === 'POST') {
    const length = request.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return invalid(413);
    const contentType = request.headers.get('content-type');
    if (contentType && contentType.split(';')[0].trim().toLowerCase() !== 'application/json') return invalid();
    try {
      const reader = request.body?.getReader();
      if (!reader) return invalid();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) { await reader.cancel(); return invalid(413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch { return invalid(); }
  } else { return invalid(405); }
  const args = parseArguments(input);
  return args ? response(visitDatePayload(args, now)) : invalid();
}
