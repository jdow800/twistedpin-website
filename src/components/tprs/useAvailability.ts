// Shared day-availability for the date strip + calendar modal. Resolves the
// probe set — the EXPLICIT product on the detail screen, or ALL of a curated
// page's products on the main screen — and fetches per-month day-availability
// on demand, caching by (product, month). On the main screen the days are a
// UNION: a day is open if ANY of the page's products is bookable that day
// (probing only the first product greyed Wed–Fri whenever product #1 happened
// to be weekend-only, even though the 2-hour lanes were wide open — the
// "everything's greyed out" landing bug). Calendar prices on the main screen
// are therefore the LOWEST across products — a "from" price, matching the
// cards. Availability is boolean per day (ADR-0025 AH-7); past days are never
// selectable. MainStep/DetailStep own the hook and share its read functions
// with DateStrip/CalendarModal. Ordinary MainStep can prioritize one date's
// complete day response without making the rest of the calendar optimistic.

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  getBookableProducts,
  getProducts,
  getMonthAvailability,
  getMonthAvailabilityDetails,
  getAvailabilityDetails,
  type BookingDatePolicy,
} from "../../tprs/client";
import type { AvailabilitySlot } from "../../tprs/schemas";
import { addDays, todayIso, monthOf, shiftMonth } from "./format";

// ── Module-level availability cache ──────────────────────────────────────────
// Shared across every hook instance and surviving DetailStep unmount/remount.
// The backend availability compute is the slow path — so this cache is the
// difference between "instant on re-entry" and "re-pay the compute" when the
// guest backs out and re-picks a product, or when the main + detail date strips
// probe the same product. Short TTL because a concurrent booking can change
// availability; the cart-hold re-validates server-side at checkout regardless.
// `monthInflight` coalesces duplicate concurrent fetches into a single request.
const MONTH_TTL_MS = 90_000;
type MonthMap = Map<string, number | null>; // available date → priceCents
type MonthDetails = { map: MonthMap; policiesByDate: Record<string, BookingDatePolicy> };
const monthCache = new Map<string, { at: number; details: MonthDetails }>();
const monthInflight = new Map<string, Promise<MonthDetails>>();

function loadMonth(productId: string, month: string, includePolicy: boolean): Promise<MonthDetails> {
  // Summary reads are advisory browsing data. Never let their missing policy
  // metadata satisfy a consumer that explicitly requested the policy envelope.
  const key = `${productId}:${month}:${includePolicy ? "policy" : "summary"}`;
  const hit = monthCache.get(key);
  if (hit && Date.now() - hit.at < MONTH_TTL_MS) return Promise.resolve(hit.details);
  const existing = monthInflight.get(key);
  if (existing) return existing;
  const read = includePolicy ? getMonthAvailabilityDetails(productId, month)
    : getMonthAvailability(productId, month).then(days => ({ days, policiesByDate: {} as Record<string, BookingDatePolicy> }));
  const p = read
    .then(({ days, policiesByDate }) => {
      const map: MonthMap = new Map(
        days.filter((d) => d.available && !policiesByDate[d.date]).map((d) => [d.date, d.priceCents]),
      );
      const details = { map, policiesByDate };
      monthCache.set(key, { at: Date.now(), details });
      return details;
    })
    .finally(() => monthInflight.delete(key));
  monthInflight.set(key, p);
  return p;
}

// ── Day-slot cache (the detail screen's time grid + prefetch) ────────────────
// Same shape as the month cache above, for GET /api/availability (per-slot
// times for one product+date). The browser's HTTP cache already covers exact
// repeats (the API sends max-age=30 + stale-while-revalidate, and the proxy
// forwards it) — what it does NOT give us is coalescing: a guest's click must
// JOIN an in-flight prefetch instead of racing a duplicate request. That's
// `slotsInflight`. First views are the slow path (~0.5s through the proxy);
// the prefetchers in MainStep/DetailStep warm them via this loader.
const SLOTS_TTL_MS = 90_000;
export type DayDetails = { slots: AvailabilitySlot[]; policy: BookingDatePolicy | null };
const slotsCache = new Map<string, { at: number; details: DayDetails }>();
const slotsInflight = new Map<string, Promise<DayDetails>>();

export function loadDayAvailability(
  productId: string,
  date: string,
): Promise<DayDetails> {
  const key = `${productId}:${date}`;
  const hit = slotsCache.get(key);
  if (hit && Date.now() - hit.at < SLOTS_TTL_MS) {
    return Promise.resolve(hit.details);
  }
  const existing = slotsInflight.get(key);
  if (existing) return existing;
  const p = getAvailabilityDetails(productId, date)
    .then((details) => {
      slotsCache.set(key, { at: Date.now(), details });
      return details;
    })
    .finally(() => slotsInflight.delete(key));
  slotsInflight.set(key, p);
  return p;
}

export async function loadDaySlots(productId: string, date: string): Promise<AvailabilitySlot[]> {
  const details = await loadDayAvailability(productId, date);
  return details.policy ? [] : details.slots;
}

/** Shared guest copy follows server policy, never a second holiday calendar. */
export function reservationPolicyMessage(policy: BookingDatePolicy | null | undefined, durationMinutes: number | null, hasTwoHourAlternative = false): string | null {
  if (!policy) return null;
  if (policy.code === "holiday_removed" && durationMinutes === 60 && hasTwoHourAlternative) return "One-hour reservations are unavailable on this date. Choose a two-hour reservation or another date.";
  return policy.message;
}

/** Loading/fetch failure is unknown, not proof that the customer's pick died. */
export function selectedTimeUnavailable(selected: AvailabilitySlot | null, available: AvailabilitySlot[] | null, policy: BookingDatePolicy | null): boolean {
  return selected !== null && (policy !== null || (available !== null && !available.some(s => s.available && s.time === selected.time)));
}

export interface DayAvailability {
  /** Any verified product makes a date available; failures remain unknown. */
  isAvailable: (isoDate: string) => boolean;
  /** Unresolved reads only. Failed reads use errorFor rather than a spinner. */
  isPending: (isoDate: string) => boolean;
  /** Lowest verified price across this probe set, or null while unknown. */
  priceFor: (isoDate: string) => number | null;
  /** Selected-date day truth when opted in; otherwise loaded month truth. */
  isProductAvailable: (productId: string, isoDate: string) => boolean | undefined;
  /** Scan loaded months only; never starts requests or guesses an opening. */
  nextOpenFor: (productId: string, fromIso: string) => string | null;
  productPriceFor: (productId: string, isoDate: string) => number | null;
  productPolicyFor: (productId: string, isoDate: string) => BookingDatePolicy | null;
  ensureMonth: (month: string) => void;
  /** All probe members loaded successfully in this hook's requested mode. */
  isMonthLoaded: (month: string) => boolean;
  loadingProbe: boolean;
  /** Optional additions preserve existing calendar fixtures/callers. */
  errorFor?: (isoDate: string) => string | null;
  retry?: () => void;
  requestCalendar?: () => void;
  /** Ordinary /reserve opt-in for selected-day priority and its next-day hint. */
  reserveFastStart?: boolean;
  /** Ordinary summary browsing; exact time reads still include policy. */
  reserveBrowseFirst?: boolean;
  /** Exact tomorrow availability found after an exhausted initial today. */
  suggestedDate?: string | null;
  /** Prevent month-based forwarding while the exact tomorrow probe is pending. */
  checkingNextDay?: boolean;
}

export interface DayAvailabilityOptions {
  /** Only bounded ordinary curated pages opt into this first-date fast path. */
  priorityDate?: string;
  /** Already-rendered grouped catalog detects inconsistent/partial probe reads. */
  expectedProductIds?: readonly string[];
  /** Only the /reserve entry opts in; other booking pages retain their behavior. */
  reserveFastStart?: boolean;
  /** Use advisory month summaries; do not share them with policy-aware months. */
  reserveBrowseFirst?: boolean;
  /** undefined = resolve as before; null = wait for the grouped catalog. */
  catalogProductIds?: readonly string[] | null;
  /** Do not auto-select an event destination as an ordinary lane alternative. */
  skipNextDayProbe?: boolean;
}
export const DAY_PRIORITY_BUDGET_MS = 1_200;
type DayRead = { details?: DayDetails; failed?: boolean };

/** Shared month truth, with an opt-in authoritative selected-day read. */
export function useDayAvailability(
  productCodes?: number[],
  productId?: string,
  options?: DayAvailabilityOptions,
): DayAvailability {
  const today = useMemo(todayIso, []);
  const priorityDate = options?.priorityDate;
  const reserveFastStart = options?.reserveFastStart === true;
  const reserveBrowseFirst = options?.reserveBrowseFirst === true;
  const skipNextDayProbe = options?.skipNextDayProbe === true;
  const catalogProductIds = options?.catalogProductIds;
  const catalogKey = catalogProductIds === undefined ? "resolve" : catalogProductIds === null ? "loading" : catalogProductIds.join(",");
  const scope = (productId ?? `codes:${productCodes?.join(",") ?? "catalog"}`)
    + (reserveBrowseFirst ? ":summary" : "");
  const [resolvedScope, setResolvedScope] = useState("");
  const [ids, setProbeIds] = useState<string[] | undefined>(undefined);
  const probeIds = resolvedScope === scope ? ids : undefined;
  const missingProbe = !!probeIds && !!options?.expectedProductIds?.some(pid => !probeIds.includes(pid));
  const [probeError, setProbeError] = useState(false);
  const [probeRetry, setProbeRetry] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [months, setMonths] = useState<Record<string, Record<string, MonthDetails>>>({});
  const requested = useRef(new Set<string>());
  const generation = useRef(0);
  const queuedMonths = useRef(new Set<string>());
  const [monthErrors, setMonthErrors] = useState<Record<string, boolean>>({});
  const [dayReads, setDayReads] = useState<{ key: string; byId: Record<string, DayRead> }>({ key: "", byId: {} });
  const priorityKey = `${scope}:${priorityDate ?? ""}`;
  const [releasedPriority, setReleasedPriority] = useState("");
  const calendarRequested = useRef(false);
  const [calendarVersion, setCalendarVersion] = useState(0);
  const initialToday = useRef(priorityDate === today);
  const tomorrowAttempted = useRef(false);
  const [nextDay, setNextDay] = useState<{ key: string; date: string | null; pending: boolean }>({ key: "", date: null, pending: false });

  useEffect(() => {
    const version = ++generation.current;
    setResolvedScope(scope);
    setProbeError(false);
    setMonths({});
    setMonthErrors({});
    requested.current = new Set();
    if (productId) { setProbeIds([productId]); return; }
    if (reserveFastStart && catalogProductIds !== undefined) {
      setProbeIds(catalogProductIds === null ? undefined : [...catalogProductIds]);
      return;
    }
    const ctrl = new AbortController();
    setProbeIds(undefined);
    const resolve = productCodes?.length
      ? getProducts(productCodes, ctrl.signal).then(r => r.products.map(p => p.id))
      : getBookableProducts(ctrl.signal).then(r => {
          const first = r.categories[0]?.products[0]?.id;
          return first ? [first] : [];
        });
    resolve.then(nextIds => {
      if (ctrl.signal.aborted || version !== generation.current) return;
      // An empty curated probe cannot validate cards from a separately loaded
      // grouped catalog. Keep an explicit retry state instead of endless cards.
      if (productCodes?.length && nextIds.length === 0) setProbeError(true);
      else setProbeIds(nextIds);
    }).catch(() => {
      if (!ctrl.signal.aborted && version === generation.current) setProbeError(true);
    });
    return () => ctrl.abort();
    // The stable scope captures product IDs/codes without reloading on array identity.
  }, [scope, productId, probeRetry, reserveFastStart, catalogKey]);

  useEffect(() => {
    if (priorityDate !== today) initialToday.current = false;
    if (!priorityDate || !probeIds) return;
    let stale = false;
    setDayReads({ key: priorityKey, byId: {} });
    setReleasedPriority("");
    setNextDay({ key: priorityKey, date: null, pending: false });
    const release = () => { if (!stale) setReleasedPriority(priorityKey); };
    // Ordinary /reserve waits for these bounded reads rather than starting
    // competing month requests after a timer. Explicit browsing still bypasses.
    const timer = reserveFastStart ? undefined : setTimeout(release, DAY_PRIORITY_BUDGET_MS);
    const reads = probeIds.map(async pid => {
      let result: DayRead;
      try { result = { details: await loadDayAvailability(pid, priorityDate) }; }
      catch { result = { failed: true }; }
      if (!stale) setDayReads(prev => ({
        key: priorityKey,
        byId: { ...(prev.key === priorityKey ? prev.byId : {}), [pid]: result },
      }));
      return result;
    });
    void Promise.all(reads).then(async results => {
      clearTimeout(timer);
      if (stale) return;
      if (!reserveFastStart) { release(); return; }
      // Let the complete selected-day group settle before starting calendar
      // work. Failure stays unknown and cannot trigger an exact alternative.
      const unavailable = results.length > 0 && results.every(result =>
        result.details && (result.details.policy || !result.details.slots.some(slot => slot.available)));
      if (!unavailable) { release(); return; }
      if (!initialToday.current || priorityDate !== today || tomorrowAttempted.current
        || skipNextDayProbe || results.some(result => result.details?.policy)) { release(); return; }

      // One exact near-term alternative, not a day-by-day range scan. The
      // first verified positive is safe to suggest, and the normal priority
      // read then reuses this same cache/promise. Failed/empty tomorrow reads
      // fall back to the existing monthly search without inventing a sellout.
      tomorrowAttempted.current = true;
      const tomorrow = addDays(today, 1);
      let foundOpening = false;
      setNextDay({ key: priorityKey, date: null, pending: true });
      await Promise.all(probeIds.map(async pid => {
        try {
          const details = await loadDayAvailability(pid, tomorrow);
          if (!details.policy && details.slots.some(slot => slot.available)) {
            foundOpening = true;
            if (!stale) setNextDay({ key: priorityKey, date: tomorrow, pending: true });
          }
        } catch { /* A failed alternative stays unknown; month search may continue. */ }
      }));
      if (stale) return;
      setNextDay({ key: priorityKey, date: foundOpening ? tomorrow : null, pending: false });
      release();
    });
    return () => { stale = true; clearTimeout(timer); };
  }, [probeIds, priorityDate, priorityKey, retryVersion, reserveFastStart, skipNextDayProbe, today]);

  const ensureMonth = useCallback((month: string) => {
    queuedMonths.current.add(month);
    if (!probeIds || (priorityDate && releasedPriority !== priorityKey && !calendarRequested.current)) return;
    const version = generation.current;
    for (const pid of probeIds) {
      const key = `${pid}:${month}`;
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      loadMonth(pid, month, !reserveBrowseFirst).then(details => {
        if (version !== generation.current) return;
        setMonths(prev => ({ ...prev, [month]: { ...prev[month], [pid]: details } }));
      }).catch(() => {
        // Retain failed keys until explicit retry; render effects must not
        // turn an outage into an automatic retry storm.
        if (version === generation.current) setMonthErrors(prev => ({ ...prev, [key]: true }));
      });
    }
  }, [probeIds, priorityDate, priorityKey, releasedPriority, calendarVersion, retryVersion, reserveBrowseFirst]);
  useEffect(() => { queuedMonths.current.forEach(ensureMonth); }, [ensureMonth]);

  const priorityRead = useCallback((pid: string, date: string): DayRead | undefined =>
    date === priorityDate && dayReads.key === priorityKey ? dayReads.byId[pid] : undefined,
  [priorityDate, dayReads, priorityKey]);

  const isProductAvailable = useCallback((pid: string, date: string): boolean | undefined => {
    if (date < today) return false;
    if (resolvedScope !== scope || !probeIds) return undefined;
    if (date === priorityDate) {
      const details = priorityRead(pid, date)?.details;
      // A failed or pending day remains unknown even when an older month
      // response says open. The complete day result owns this date.
      return details ? !details.policy && details.slots.some(slot => slot.available) : undefined;
    }
    const details = months[monthOf(date)]?.[pid];
    return details ? details.map.has(date) : undefined;
  }, [today, resolvedScope, scope, probeIds, priorityDate, priorityRead, months]);

  const isAvailable = useCallback((date: string): boolean =>
    date >= today && (probeIds?.some(pid => isProductAvailable(pid, date) === true) ?? false),
  [today, probeIds, isProductAvailable]);

  const isPending = useCallback((date: string): boolean => {
    if (date < today) return false;
    if (!probeIds) return !probeError;
    // Positive union members reveal progressively; unavailable needs all.
    if (isAvailable(date)) return false;
    return probeIds.some(pid => date === priorityDate
      ? !priorityRead(pid, date)
      : !months[monthOf(date)]?.[pid] && !monthErrors[`${pid}:${monthOf(date)}`]);
  }, [today, probeIds, probeError, isAvailable, priorityDate, priorityRead, months, monthErrors]);

  const nextOpenFor = useCallback((pid: string, fromIso: string): string | null => {
    const start = fromIso < today ? today : fromIso;
    let month = monthOf(start);
    for (let i = 0; i < 3; i++, month = shiftMonth(month, 1)) {
      const details = months[month]?.[pid];
      if (!details) return null;
      for (const date of [...details.map.keys()].sort()) if (date >= start) return date;
    }
    return null;
  }, [today, months]);

  const productPriceFor = useCallback((pid: string, date: string): number | null => {
    if (date === priorityDate) {
      const details = priorityRead(pid, date)?.details;
      const prices = details?.policy ? [] : details?.slots.filter(slot => slot.available).map(slot => slot.priceCents) ?? [];
      return prices.length ? Math.min(...prices) : null;
    }
    const price = months[monthOf(date)]?.[pid]?.map.get(date);
    return typeof price === "number" ? price : null;
  }, [months, priorityDate, priorityRead]);

  const productPolicyFor = useCallback((pid: string, date: string): BookingDatePolicy | null =>
    date === priorityDate ? priorityRead(pid, date)?.details?.policy ?? null
      : months[monthOf(date)]?.[pid]?.policiesByDate[date] ?? null,
  [months, priorityDate, priorityRead]);

  const priceFor = useCallback((date: string): number | null => {
    let min: number | null = null;
    for (const pid of probeIds ?? []) {
      const price = productPriceFor(pid, date);
      if (price !== null && (min === null || price < min)) min = price;
    }
    return min;
  }, [probeIds, productPriceFor]);

  const isMonthLoaded = useCallback((month: string): boolean =>
    Array.isArray(probeIds) && probeIds.every(pid => !!months[month]?.[pid]),
  [probeIds, months]);

  // The last today result may render before Promise.all starts the tomorrow
  // work. Keep month-based forwarding paused across that scheduling boundary.
  const awaitingNextDayProbe = reserveFastStart && initialToday.current && priorityDate === today
    && !tomorrowAttempted.current && !skipNextDayProbe && !!probeIds?.length
    && probeIds.every(pid => {
      const details = priorityRead(pid, today)?.details;
      return details && !details.policy && !details.slots.some(slot => slot.available);
    });

  return {
    isAvailable, isPending, isProductAvailable, nextOpenFor, productPriceFor,
    productPolicyFor, priceFor, ensureMonth, isMonthLoaded,
    loadingProbe: probeIds === undefined && !probeError,
    errorFor: date => {
      if (probeError) return "We couldn't check availability. Please try again.";
      if (missingProbe) return "Some packages couldn't be checked. Please try again.";
      if (probeIds?.some(pid => date === priorityDate ? priorityRead(pid, date)?.failed
        : monthErrors[`${pid}:${monthOf(date)}`])) return "Some availability couldn't be checked. Please try again.";
      return null;
    },
    retry: () => {
      if (probeError || missingProbe) setProbeRetry(n => n + 1);
      Object.keys(monthErrors).forEach(key => requested.current.delete(key));
      setMonthErrors({});
      setRetryVersion(n => n + 1);
    },
    requestCalendar: () => { calendarRequested.current = true; setCalendarVersion(n => n + 1); },
    reserveFastStart,
    reserveBrowseFirst,
    suggestedDate: nextDay.key === priorityKey ? nextDay.date : null,
    checkingNextDay: awaitingNextDayProbe || (nextDay.key === priorityKey && nextDay.pending),
  };
}
