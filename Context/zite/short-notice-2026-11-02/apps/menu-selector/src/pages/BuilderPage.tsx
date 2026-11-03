import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  type BarSelection, type EstimateResponse, type EstimateOption, type BuilderAddon, type Rates,
  type VipBands, DEFAULT_VIP_BANDS, parseVipBands,
  formatDateShort, formatTimeShort, getTimeSlots,
  ALL_PACKAGES, FOOD_SLUG, BUILDER_ADDON_GROUPS, computePackageEstimate,
} from '../data/builderData';
import WhenSection, { OUTSIDE_HOURS } from '../components/builder/WhenSection';
import WhoSection from '../components/builder/WhoSection';
import { NumericDraftContext, normalizeGuestCount, OVER_100 } from '../lib/builderEditing';
import FoodSection from '../components/builder/FoodSection';
import DrinksSection from '../components/builder/DrinksSection';
import AddOnsSection from '../components/builder/AddOnsSection';
import type { AddonState } from '../components/builder/AddOnsSection';
import NotesSection from '../components/builder/NotesSection';
import EstimatePanel from '../components/builder/EstimatePanel';
import VideoSection from '../components/VideoSection';
import SendSummarySheet, { type SummaryData } from '../components/builder/SendSummarySheet';
import VisitorContactStep from '../components/builder/VisitorContactStep';
import ExploreContactStep from '../components/builder/ExploreContactStep';
import { FlyingPillRenderer, type FlyPill } from '../components/FlyingPill';
import { RotateCcw } from 'lucide-react';
import { allowsManualQuote, bookingPolicy, canonicalBuild, centralDate, daysAway, eventDateError, eventTimeError, inputFingerprint, pricingInputKey, RECALCULATE_MESSAGE, sortAddOns } from '../lib/builderContract';
import { useCentralDay } from '../lib/useCentralDay';
import { useEventClock } from '../lib/useEventClock';
import { pricingAttemptId, reportPricingDiagnostic } from '../lib/pricingDiagnostics';
import { pricingSessionId, pricingMonitorRecoveryCount } from '../lib/pricingMonitorSession';
import { usablePricingResponse } from '../lib/pricingResponse';
import { PRICING_CLIENT_RELEASE, diagnosticApiCode, diagnosticErrorName, type PricingDiagnostic, type PricingFailure } from '../lib/pricingDiagnosticContract';
import { EMPTY_PRICING_RETRY, recordPricingResult, retryFailuresFor } from '../lib/pricingRetry';


type PricingRecoveryAttempt = {
  inputKey: string;
  day: string;
  startedAt: number;
  response: EstimateResponse;
  base: Omit<PricingDiagnostic, 'event' | 'consecutive_failures' | 'failure' | 'occurred_at' | 'elapsed_ms'>;
};

// Call only after the response/day/input freshness guard confirms a usable displayed option.
function reportOptionRecovery(attempt: PricingRecoveryAttempt, option: NonNullable<EstimateOption>) {
  const count = pricingMonitorRecoveryCount(attempt.base.session_id, attempt.base.client_release);
  if (!count) return;
  const configuration: PricingDiagnostic['configuration'] = {
    ...attempt.base.configuration,
    event: { ...attempt.base.configuration.event, lane_type: option.lane_type, duration: option.hours as 2 | 3 },
  };
  reportPricingDiagnostic({
    ...attempt.base, event: 'recovered', configuration,
    input_fingerprint: inputFingerprint(configuration),
    occurred_at: new Date().toISOString(),
    elapsed_ms: Math.min(180000, Math.max(0, Math.round(Date.now() - attempt.startedAt))),
    consecutive_failures: count,
  });
}

/* ── Google Fonts loader — module-level (runs before any component mounts) ── */
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Montserrat:wght@600;700&family=Roboto+Slab:wght@400;500;700&display=swap';

(() => {
  if (typeof document === 'undefined') return;
  // Preconnect
  if (!document.querySelector('link[href="https://fonts.googleapis.com"][rel="preconnect"]')) {
    const pc = document.createElement('link');
    pc.rel = 'preconnect';
    pc.href = 'https://fonts.googleapis.com';
    document.head.appendChild(pc);
  }
  if (!document.querySelector('link[href="https://fonts.gstatic.com"][rel="preconnect"]')) {
    const pc2 = document.createElement('link');
    pc2.rel = 'preconnect';
    pc2.href = 'https://fonts.gstatic.com';
    pc2.crossOrigin = '';
    document.head.appendChild(pc2);
  }
  // Font stylesheet
  if (!document.querySelector(`link[href="${FONT_HREF}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }
})();


type BuilderPageProps = {
  eid?: string;
  tier?: 'es' | 'el';
  ppPermitted?: boolean;
  staffMode?: boolean;
  exploreMode?: boolean;
};

export default function BuilderPage({ eid: _eid = '', tier: _tier = 'es', ppPermitted = true, staffMode = false, exploreMode = false }: BuilderPageProps) {
  const [searchParams] = useSearchParams();

  const prefillDate = searchParams.get('d') ?? '';
  const prefillTime = searchParams.get('t') ?? '';
  const prefillGuests = searchParams.get('g');
  const prefillType = searchParams.get('type') ?? '';

  // ── Attribution capture (once on mount) ──────────────────────────────
  const attributionRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const a: Record<string, string> = {};
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid']) {
      const v = sp.get(key);
      if (v) a[key] = v;
    }
    a.referrer = document.referrer || '';
    a.landing_page = window.location.href;
    attributionRef.current = a;
  }, []);

  // ── State ──────────────────────────────────────────────────────────────
  // Staff-mode tier toggle (controls ppPermitted dynamically)
  const [staffTier, setStaffTier] = useState<'es' | 'el'>(_tier);
  const effectivePpPermitted = staffMode ? staffTier === 'es' : ppPermitted;

  const [date, setDate] = useState(prefillDate);
  const [time, setTime] = useState(prefillTime);
  const [duration, setDuration] = useState<2 | 3>(2);
  const [durationExplicit, setDurationExplicit] = useState(false);
  const [guestCount, setGuestCount] = useState(() => normalizeGuestCount(prefillGuests ?? '', 40));
  const [lanePreference, setLanePreference] = useState<'vip' | 'traditional' | null>(null);
  const [autoDurationFallback, setAutoDurationFallback] = useState(false);
  const [durationMessage, setDurationMessage] = useState('');
  const [formResetVersion, setFormResetVersion] = useState(0);
  const [numericDrafts, setNumericDrafts] = useState<Set<string>>(() => new Set());
  const hasNumericDraft = numericDrafts.size > 0;
  const handleNumericDraft = useCallback((id: string, dirty: boolean) => {
    setNumericDrafts(previous => {
      if (previous.has(id) === dirty) return previous;
      const next = new Set(previous);
      if (dirty) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const manualAddonQuantities = useRef(new Set<string>());
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [barSelection, setBarSelection] = useState<BarSelection>('own_tab');
  const [barQty, setBarQty] = useState(guestCount > 100 ? 100 : guestCount);
  const [addons, setAddons] = useState<AddonState>({});
  const [notes, setNotes] = useState('');
  const [outsideHoursTime, setOutsideHoursTime] = useState('');

  // Commit a headcount and its dependent quantities in one event, before a Calculate click.
  const handleGuestCount = useCallback((raw: number) => {
    const count = normalizeGuestCount(raw);
    const cap = Math.min(count, 100);
    setGuestCount(count);
    setBarQty(previous => Math.min(previous, cap) || cap);
    setAddons(previous => {
      let changed = false;
      const next = { ...previous };
      for (const group of BUILDER_ADDON_GROUPS) {
        for (const addon of group.addons) {
          if (addon.defaultQty !== -1 || addon.maxQty !== 'guests') continue;
          const current = next[addon.key];
          if (!current) continue;
          const quantity = manualAddonQuantities.current.has(addon.key) ? Math.min(current, cap) : cap;
          if (current !== quantity) { next[addon.key] = quantity; changed = true; }
        }
      }
      return changed ? next : previous;
    });
  }, []);


  // Estimate state
  const [estimateResponse, setEstimateResponse] = useState<EstimateResponse | null>(null);

  const centralDay = useCentralDay();
  const policyNow = useEventClock(date, time);
  const [estimateInputKey, setEstimateInputKey] = useState('');
  const [pricingRetry, setPricingRetry] = useState(EMPTY_PRICING_RETRY);
  const pricingSessionRef = useRef('');
  const pricedAttemptRef = useRef<PricingRecoveryAttempt | null>(null);
  const pricingFailureRef = useRef<{ inputKey: string; failures: number } | null>(null);
  const requestSeq = useRef(0);
  const requestAbort = useRef<AbortController | null>(null);
  const [reviewMessage, setReviewMessage] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);

  // Chosen option object for Phase 2 Send payload
  const [chosenOption, setChosenOption] = useState<(EstimateOption & { key: string }) | null>(null);

  // Send summary sheet
  const [showSendSheet, setShowSendSheet] = useState(false);

  // Flying pills
  const [flyingPills, setFlyingPills] = useState<FlyPill[]>([]);
  const pillIdRef = useRef(0);
  const stickyBarRef = useRef<HTMLDivElement>(null);
  const [stickyBarHeight, setStickyBarHeight] = useState(96);
  useEffect(() => {
    const bar = stickyBarRef.current;
    if (!bar) return;
    const measure = () => setStickyBarHeight(Math.ceil(bar.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const firePill = useCallback((label: string, sourceId: string) => {
    const el = document.getElementById(sourceId);
    const bar = stickyBarRef.current;
    if (!el || !bar) return;
    const from = el.getBoundingClientRect();
    const to = bar.getBoundingClientRect();
    const pill: FlyPill = {
      id: `pill-${++pillIdRef.current}`,
      label,
      fromX: from.left + from.width / 2,
      fromY: from.top + from.height / 2,
      toX: to.left + to.width / 2,
      toY: to.top + 8,
    };
    setFlyingPills(prev => [...prev, pill]);
    setTimeout(() => setFlyingPills(prev => prev.filter(p => p.id !== pill.id)), 500);
  }, []);

  const lastCalcRef = useRef<string>('');

  // Minimum skeleton display timing
  const calcStartRef = useRef<number>(0);

  // ── Estimate tracking beacon (linked pages only) ─────────────────────
  const lastEstimateInputsRef = useRef<string>('');
  const justCalculatedRef = useRef(false);

  const fireBeacon = useCallback((optionKey: string, resp: EstimateResponse) => {
    if (!_eid || !resp.ok) return;
    const opt = resp.options[optionKey as keyof typeof resp.options];
    if (!opt) return;
    // Translate vip_2h → vip2
    const shortOpt = optionKey.replace('_', '').replace('h', '');
    // Parse stored inputs back into an object
    const inputEntries = new URLSearchParams(lastEstimateInputsRef.current);
    const inputs: Record<string, string> = {};
    inputEntries.forEach((v, k) => { inputs[k] = v; });
    const body = JSON.stringify({
      eid: _eid,
      tier: _tier,
      option: shortOpt,
      inputs,
      total: opt.total,
      deposit: opt.deposit,
    });
    try {
      const url = 'https://www.twistedpin.com/api/estimate/track/';
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      }
    } catch { /* swallow */ }
  }, [_eid, _tier]);

  // ── Derived state ─────────────────────────────────────────────────────
  const isOver100 = guestCount >= OVER_100;
  const isOutsideHours = time === OUTSIDE_HOURS;
  const isSendOnlyMode = isOver100 || isOutsideHours;

  // Pizza & Pop visibility: driven by link permission + menu-check API
  const [ppCheck, setPpCheck] = useState<{ key: string; status: 'idle' | 'pending' | 'allowed' | 'denied' | 'failed' }>({ key: '', status: 'idle' });
  const [menuCheckRetry, setMenuCheckRetry] = useState(0);
  const [menuCheckLoading, setMenuCheckLoading] = useState(false);
  const [ppDismissedMsg, setPpDismissedMsg] = useState('');
  const [rates, setRates] = useState<Rates | null>(null);
  const [bands, setBands] = useState<VipBands>(DEFAULT_VIP_BANDS);
  const [menuEligibility, setMenuEligibility] = useState<{ key: string; date: string; restriction: string } | null>(null);
  const laneType = guestCount >= bands.tradOnlyFloor ? 'traditional' : lanePreference ?? 'vip';
  const menuKey = JSON.stringify([date, time, effectivePpPermitted, centralDay]);
  const dateError = date ? eventDateError(date, policyNow) || eventTimeError(date, time, policyNow) : '';
  const menuMatches = menuEligibility?.key === menuKey && menuEligibility.date === date;
  const dateRestriction = menuMatches ? menuEligibility.restriction : '';

  // Derived: effective duration (suggested 3h for VIP at or above recommended threshold) & active option key
  const suggest3h = laneType === 'vip' && guestCount >= bands.vip3hRecommendedFrom && guestCount <= 100;
  const timeDay = date ? new Date(date + 'T12:00:00').getDay() : -1;
  const recommendedLateFallback = !!time && time !== OUTSIDE_HOURS
    && getTimeSlots(timeDay, 2).includes(time) && !getTimeSlots(timeDay, 3).includes(time);
  const effectiveDuration = suggest3h && !durationExplicit && !autoDurationFallback
    ? (recommendedLateFallback ? 2 : 3) : duration;
  const timeIsValid = !time || time === OUTSIDE_HOURS || getTimeSlots(timeDay, effectiveDuration).includes(time);
  const livePreferencesRef = useRef({ durationExplicit, lanePreference });
  livePreferencesRef.current = { durationExplicit, lanePreference };
  useEffect(() => { setAutoDurationFallback(false); }, [date, time, guestCount, laneType]);
  const handleDuration = useCallback((value: 2 | 3) => {
    setDuration(value);
    setDurationExplicit(true);
    setAutoDurationFallback(false);
    if (time && time !== OUTSIDE_HOURS && !getTimeSlots(timeDay, value).includes(time)) {
      setTime('');
      setDurationMessage(value === 3
        ? 'Choose an earlier start time to keep your three-hour event.'
        : 'Choose a start time for your two-hour event.');
    } else {
      setDurationMessage('');
    }
  }, [time, timeDay]);
  const activeOption = `${laneType === 'traditional' ? 'trad' : 'vip'}_${effectiveDuration}h`;
  const liveOptionRef = useRef(activeOption);
  liveOptionRef.current = activeOption;

  // Rates-only pre-fetch on mount (no date/time) so cards show figures immediately
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch('https://www.twistedpin.com/api/estimate/menu/');
        const data = await resp.json();
        if (data.ok && data.rates) setRates(data.rates);
        if (data.rules) setBands(parseVipBands(data.rules));
      } catch { /* rates will arrive with the first menu-check */ }
    })();
  }, []);

  // Dated menu checks also guard custom requests against known closed dates.
  const menuCheckRef = useRef(0);
  useEffect(() => {
    const seq = ++menuCheckRef.current;
    const controller = new AbortController();
    setMenuEligibility(null);
    setPpCheck({ key: menuKey, status: 'idle' });
    if (!date || eventDateError(date)) { setMenuCheckLoading(false); return; }
    setPpCheck({ key: menuKey, status: 'pending' });
    setMenuCheckLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ d: date });
        if (time && time !== OUTSIDE_HOURS) params.set('t', time);
        if (!effectivePpPermitted) params.set('tier', 'el');
        const resp = await fetch('https://www.twistedpin.com/api/estimate/menu/?' + params, { signal: controller.signal });
        const data = await resp.json();
        if (seq !== menuCheckRef.current) return;
        if (resp.ok && data.ok && data.date === date) {
          if (data.rates) setRates(data.rates);
          if (data.rules) setBands(parseVipBands(data.rules));
          setPpCheck({ key: menuKey, status: !time ? 'idle'
            : time === OUTSIDE_HOURS || !effectivePpPermitted ? 'denied'
            : typeof data.pizza_pop?.offered !== 'boolean' ? 'failed'
            : data.pizza_pop.offered ? 'allowed' : 'denied' });
          setMenuEligibility({ key: menuKey, date, restriction: data.date_restriction?.message || '' });
        } else {
          setPpCheck({ key: menuKey, status: 'failed' });
        }
      } catch {
        if (seq === menuCheckRef.current) setPpCheck({ key: menuKey, status: 'failed' });
      }
      finally { if (seq === menuCheckRef.current) setMenuCheckLoading(false); }
    })();
    return () => { controller.abort(); ++menuCheckRef.current; };
  }, [date, time, effectivePpPermitted, menuKey, centralDay, menuCheckRetry]);

  // Pending/failed checks keep the explicit selection but cannot authorize pricing.
  const ppCurrent = ppCheck.key === menuKey;
  const ppOffered = effectivePpPermitted && ppCurrent && ppCheck.status === 'allowed';
  const ppDenied = !effectivePpPermitted || (ppCurrent && ppCheck.status === 'denied');
  const ppFailed = ppCurrent && ppCheck.status === 'failed';
  const hidePizzaPop = !effectivePpPermitted || (!ppOffered && !(selectedPackageId === 'pizza-pop' && !ppDenied));
  const ppStatusMessage = selectedPackageId === 'pizza-pop' && !ppOffered && !ppDenied
    ? (ppFailed ? 'We could not check Pizza & Pop availability. Retry the check, or choose another package.'
      : 'Checking Pizza & Pop availability for your selections…') : '';
  useEffect(() => {
    if (ppDenied && selectedPackageId === 'pizza-pop') {
      setSelectedPackageId(null);
      setPpDismissedMsg("Pizza & Pop isn't offered at that time. Pick another package, or a different start.");
    } else if (ppOffered) {
      setPpDismissedMsg('');
    }
  }, [ppDenied, ppOffered, selectedPackageId]);

  const currentSelections = {
    date, time, duration: effectiveDuration, guestCount, laneType,
    foodPackageSlug: selectedPackageId ? FOOD_SLUG[selectedPackageId] ?? null : null,
    barSelection, barQty, addons: Object.entries(addons).filter(([, q]) => q > 0).map(([slug, qty]) => ({ slug, qty })),
  };
  const calcFingerprint = pricingInputKey(currentSelections, effectivePpPermitted ? 'es' : 'el', centralDay);
  const liveInputsRef = useRef(calcFingerprint);
  liveInputsRef.current = calcFingerprint;
  const currentOption = estimateResponse?.ok ? estimateResponse.options[activeOption as keyof typeof estimateResponse.options] : null;
  // A response can be current even when the explicitly selected option is unavailable.
  const pricingResponseCurrent = !!(estimateResponse?.ok &&
    estimateInputKey === calcFingerprint && !isCalculating && !hasNumericDraft && !isSendOnlyMode && timeIsValid && !dateError && !dateRestriction &&
    (selectedPackageId !== 'pizza-pop' || ppOffered) &&
    estimateResponse.date === date && estimateResponse.start === time &&
    estimateResponse.days_out === daysAway(date) && estimateResponse.deposit_shown === (daysAway(date)! >= 10));
  const estimateFresh = !!(pricingResponseCurrent && currentOption &&
    currentOption.lane_type === laneType && currentOption.hours === effectiveDuration &&
    Number.isFinite(currentOption.total) && currentOption.total > 0 && Number.isFinite(currentOption.deposit));
  const comparisonIsStale = !!estimateResponse && (hasNumericDraft || estimateInputKey !== calcFingerprint || (estimateResponse.ok && !pricingResponseCurrent));
  const isStale = !!estimateResponse && (hasNumericDraft || estimateInputKey !== calcFingerprint || (estimateResponse.ok && !estimateFresh));
  useEffect(() => {
    ++requestSeq.current;
    requestAbort.current?.abort();
    setIsCalculating(false);
    setReviewMessage('');
    setPricingRetry(EMPTY_PRICING_RETRY);
    pricingFailureRef.current = null;
  }, [calcFingerprint, hasNumericDraft]);
  useEffect(() => () => requestAbort.current?.abort(), []);

  // ── Calculate readiness ───────────────────────────────────────────────
  const missingFields: string[] = [];
  if (!date || dateError || dateRestriction) missingFields.push('a valid date');
  if (!time || !timeIsValid) missingFields.push('a start time');
  if (!selectedPackageId) missingFields.push('a food package');
  const canCalculate = missingFields.length === 0 && !isSendOnlyMode && !isCalculating && !menuCheckLoading && (selectedPackageId !== 'pizza-pop' || ppOffered);
  const disabledMessage = missingFields.length > 0
    ? `Pick ${missingFields.join(' and ')} to see your estimate`
    : menuCheckLoading ? 'Checking your event selections…' : ppStatusMessage;

  const missingFieldsList = [
    { label: 'A date', done: !!date && !dateError && !dateRestriction, scrollTo: 'step-when', action: 'Choose a date', target: '#builder-date' },
    { label: 'A start time', done: !!time && timeIsValid, scrollTo: 'step-when', action: 'Choose a start time', target: '#builder-time' },
    { label: 'Your requested time', done: staffMode || !isOutsideHours || !!outsideHoursTime.trim(), scrollTo: 'step-when', action: 'Add your time', target: '#builder-outside-time' },
    { label: 'A food package', done: !!selectedPackageId, scrollTo: 'step-food', action: 'Choose food', target: '#step-food button' },
  ];
  const pendingFields = missingFieldsList.filter(f => !f.done);
  const nextRequiredField = pendingFields[0] ?? null;

  // ── Addon handlers ─────────────────────────────────────────────────────
  const handleAddonToggle = useCallback((key: string, addon: BuilderAddon) => {
    manualAddonQuantities.current.delete(key);
    setAddons(prev => {
      const next = { ...prev };
      if ((next[key] ?? 0) > 0) {
        delete next[key];
      } else {
        const defaultQty = addon.defaultQty === -1
          ? (guestCount > 100 ? 100 : guestCount)
          : addon.defaultQty;
        next[key] = defaultQty;
      }
      return next;
    });
  }, [guestCount]);

  const handleAddonQty = useCallback((key: string, qty: number) => {
    manualAddonQuantities.current.add(key);
    setAddons(prev => ({ ...prev, [key]: qty }));
  }, []);

  // ── Helper: update chosenOption from response + key ────────────────────
  const updateChosenOption = useCallback((resp: EstimateResponse, key: string) => {
    if (!resp.ok) { setChosenOption(null); return; }
    const opt = resp.options[key as keyof typeof resp.options];
    if (opt) setChosenOption({ ...opt, key });
    else setChosenOption(null);
  }, []);

  // ── Calculate estimate ────────────────────────────────────────────────
  const handleCalculate = useCallback(async () => {
    if (!canCalculate || eventDateError(date)) return;
    const seq = ++requestSeq.current;
    const capturedDay = centralDate();
    const capturedKey = calcFingerprint;
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    const stillCurrent = () => seq === requestSeq.current && liveInputsRef.current === capturedKey && centralDate() === capturedDay;
    setReviewMessage('');
    setIsCalculating(true);
    calcStartRef.current = Date.now();
    const attemptStarted = Date.now();
    if (!pricingSessionRef.current) pricingSessionRef.current = pricingSessionId();
    const pricingBuild = canonicalBuild({
      date, time, duration: effectiveDuration, guestCount, laneType,
      foodPackageSlug: selectedPackageId ? FOOD_SLUG[selectedPackageId] ?? null : null,
      barSelection, barQty,
      addons: Object.entries(addons).filter(([, qty]) => qty > 0).map(([slug, qty]) => ({ slug, qty })),
    });
    const diagnosticBase = {
      version: 1 as const,
      client_release: PRICING_CLIENT_RELEASE,
      session_id: pricingSessionRef.current,
      attempt_id: pricingAttemptId(),
      mode: staffMode ? 'staff' as const : exploreMode ? 'public' as const : 'linked' as const,
      tier: effectivePpPermitted ? 'es' as const : 'el' as const,
      ...(/^E-[A-Z0-9-]{1,48}$/.test(_eid) ? { eid: _eid } : {}),
      configuration: pricingBuild as PricingDiagnostic['configuration'],
      input_fingerprint: inputFingerprint(pricingBuild),
    };
    let diagnosticKind: PricingFailure['kind'] = 'network';
    let diagnosticStatus: number | null = null;
    let diagnosticRequestId: string | undefined;
    const diagnosticTiming = () => ({
      occurred_at: new Date().toISOString(),
      elapsed_ms: Math.min(180000, Math.max(0, Math.round(Date.now() - attemptStarted))),
    });
    const recordFailure = (failure: PricingFailure) => {
      const prior = pricingFailureRef.current;
      const failures = allowsManualQuote(failure.api_code)
        ? Math.min(100, (prior?.inputKey === capturedKey ? prior.failures : 0) + 1) : 0;
      pricingFailureRef.current = { inputKey: capturedKey, failures };
      reportPricingDiagnostic({
        ...diagnosticBase, ...diagnosticTiming(), event: 'failure',
        consecutive_failures: failures, failure,
      });
    };

    try {
      const pkg = ALL_PACKAGES.find(p => p.id === selectedPackageId);
      const foodSlug = pkg ? FOOD_SLUG[pkg.id] : '';
      const params = new URLSearchParams();
      params.set('d', date);
      params.set('t', time);
      params.set('g', String(guestCount));
      params.set('f', foodSlug);
      if (barSelection !== 'none' && barSelection !== 'own_tab') {
        params.set('b', barSelection);
        if ((barSelection === '10_card' || barSelection === '15_card') && barQty > 0) {
          params.set('bq', String(barQty));
        }
      }
      const addonPairs = Object.entries(addons)
        .filter(([, qty]) => qty > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, q]) => `${k}:${q}`)
        .join(',');
      if (addonPairs) params.set('a', addonPairs);

      // Store inputs for beacon
      lastEstimateInputsRef.current = params.toString();

      const resp = await fetch(`https://www.twistedpin.com/api/estimate/?${params.toString()}`, { signal: controller.signal });
      diagnosticStatus = resp.status;
      const requestId = resp.headers.get('x-vercel-id');
      if (requestId && /^[A-Za-z0-9:._=-]{1,160}$/.test(requestId)) diagnosticRequestId = requestId;
      diagnosticKind = 'invalid_json';
      let data: EstimateResponse = await resp.json();
      diagnosticKind = 'client_error';

      // Enforce minimum 600ms skeleton display
      const elapsed = Date.now() - calcStartRef.current;
      if (elapsed < 600) {
        await new Promise(resolve => setTimeout(resolve, 600 - elapsed));
      }

      if (!stillCurrent()) return;
      diagnosticKind = 'invalid_response';
      if (!data || typeof data.ok !== 'boolean' || (data.ok && (!resp.ok || !usablePricingResponse(data, {
        date, start: time, days: daysAway(date), guests: guestCount,
      })))) throw new Error('Invalid pricing response');
      if (!data.ok) {
        if (typeof data.code !== 'string') throw new Error('Invalid pricing error response');
        // A malformed policy message must not crash the page or bypass the policy via manual fallback.
        data = { ...data, message: typeof data.message === 'string' ? data.message.slice(0, 600) : 'Check your event selections and try again.' };
      }
      diagnosticKind = 'client_error';
      setEstimateInputKey(capturedKey);
      setEstimateResponse(data);
      let displayedOption: EstimateOption | null = null;
      if (data.ok) {
        pricedAttemptRef.current = { inputKey: capturedKey, day: capturedDay, startedAt: attemptStarted, response: data, base: diagnosticBase };
        // Activate the guest's choice; only an automatic recommendation may fall back.
        const guestKey = liveOptionRef.current;
        const guestOpt = data.options[guestKey as keyof typeof data.options];
        if (guestOpt) {
          displayedOption = guestOpt;
          updateChosenOption(data, guestKey);
          justCalculatedRef.current = true;
          fireBeacon(guestKey, data);
        } else {
          // Only an automatic duration recommendation may use a same-lane two-hour fallback.
          const fallbackKey = guestKey.replace(/_3h$/, '_2h');
          const fallback = !livePreferencesRef.current.durationExplicit && fallbackKey !== guestKey
            ? data.options[fallbackKey as keyof typeof data.options] : null;
          if (fallback) {
            displayedOption = fallback;
            setDuration(2);
            setAutoDurationFallback(true);
            updateChosenOption(data, fallbackKey);
            justCalculatedRef.current = true;
            fireBeacon(fallbackKey, data);
          } else {
            setChosenOption(null);
            setReviewMessage('That lane and duration combination is unavailable. Choose another option.');
          }
        }
      } else {
        pricedAttemptRef.current = null;
        setChosenOption(null);
      }
      // PRICING RETRY RESULT: only completed results for the current inputs count.
      setPricingRetry(previous => recordPricingResult(previous, capturedKey, data.ok ? null : data.code));
      if (data.ok) {
        if (displayedOption && pricedAttemptRef.current) reportOptionRecovery(pricedAttemptRef.current, displayedOption);
        pricingFailureRef.current = null;
      } else {
        recordFailure({
          kind: resp.ok ? 'api_error' : 'http',
          api_code: diagnosticApiCode(data.code), http_status: diagnosticStatus,
          ...(diagnosticRequestId ? { request_id: diagnosticRequestId } : {}),
        });
      }
    } catch (error) {
      if (!stillCurrent() || controller.signal.aborted) return;
      // Enforce minimum skeleton time even on error
      const elapsed = Date.now() - calcStartRef.current;
      if (elapsed < 600) {
        await new Promise(resolve => setTimeout(resolve, 600 - elapsed));
      }

      const errResp: EstimateResponse = {
        ok: false,
        code: 'engine_unavailable',
        message: "Couldn't reach pricing right now. Try again, or ask our team for a quote without an estimate.",
      };
      if (!stillCurrent()) return;
      // PRICING RETRY EXCEPTION: aborts and stale responses returned above never count.
      setPricingRetry(previous => recordPricingResult(previous, capturedKey, errResp.code));
      recordFailure({
        kind: diagnosticKind, api_code: 'engine_unavailable', http_status: diagnosticStatus,
        ...(diagnosticRequestId ? { request_id: diagnosticRequestId } : {}),
        error_name: diagnosticErrorName(error),
      });
      pricedAttemptRef.current = null;
      setEstimateInputKey(capturedKey);
      setEstimateResponse(errResp);
      setChosenOption(null);
    }

    if (!stillCurrent()) return;
    lastCalcRef.current = capturedKey;
    setIsCalculating(false);

    // Snap to the estimate panel after results populate
    requestAnimationFrame(() => {
      document.getElementById('estimate-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [canCalculate, date, time, guestCount, laneType, effectiveDuration, selectedPackageId, barSelection, barQty, addons, calcFingerprint, updateChosenOption, fireBeacon, staffMode, exploreMode, effectivePpPermitted, _eid]);

  // ── Send readiness (send-only modes) ─────────────────────────────────
  const sendBlockReason = (() => {
    if (!date || dateError) return dateError || 'Pick a date.';
    if (dateRestriction) return dateRestriction;
    if (!time || !timeIsValid) return 'Pick a start time.';
    if (!selectedPackageId) return 'Pick a food package.';
    if (selectedPackageId === 'pizza-pop' && !ppOffered) return ppStatusMessage || 'Pick an available food package.';
    if (isOutsideHours && !outsideHoursTime.trim()) return "Tell us what time you're thinking.";
    if (menuCheckLoading) return 'Checking this date…';
    if (!menuMatches && !estimateFresh) return 'We could not check this date. Try again, or call the venue at (815) 782-7790.';
    return '';
  })();
  const canSend = !sendBlockReason && !hasNumericDraft;
  const pricingFailures = retryFailuresFor(pricingRetry, calcFingerprint);
  const canManualQuote = canSend && (isSendOnlyMode ||
    (pricingFailures >= 2 && !!estimateResponse && !estimateResponse.ok && estimateInputKey === calcFingerprint && allowsManualQuote(estimateResponse.code)));

  const handleOptionChange = useCallback((key: string) => {
    setLanePreference(key.startsWith('vip_') ? 'vip' : 'traditional');
    setDuration(key.endsWith('_3h') ? 3 : 2);
    setDurationExplicit(true);
    setAutoDurationFallback(false);
    setDurationMessage('');
    setReviewMessage('');
    const option = estimateResponse?.ok ? estimateResponse.options[key as keyof typeof estimateResponse.options] : null;
    const attempt = pricedAttemptRef.current;
    const freshOption = option && attempt?.response === estimateResponse
      && attempt.inputKey === calcFingerprint && attempt.day === centralDate()
      && estimateInputKey === calcFingerprint && !isSendOnlyMode && !isCalculating && !hasNumericDraft
      && !dateError && !dateRestriction && (selectedPackageId !== 'pizza-pop' || ppOffered)
      && getTimeSlots(timeDay, option.hours).includes(time);
    if (freshOption && attempt && option && estimateResponse) {
      updateChosenOption(estimateResponse, key);
      fireBeacon(key, estimateResponse);
      reportOptionRecovery(attempt, option);
    }
  }, [estimateResponse, estimateInputKey, calcFingerprint, isSendOnlyMode, isCalculating, hasNumericDraft, dateError, dateRestriction, selectedPackageId, ppOffered, timeDay, time, updateChosenOption, fireBeacon]);

  // Keep chosenOption in sync when activeOption changes via Step 1/2 controls
  useEffect(() => {
    if (estimateFresh && estimateResponse?.ok) {
      setReviewMessage('');
      const option = estimateResponse.options[activeOption as keyof typeof estimateResponse.options];
      const attempt = pricedAttemptRef.current;
      if (option && attempt?.response === estimateResponse && attempt.inputKey === calcFingerprint && attempt.day === centralDate()) {
        reportOptionRecovery(attempt, option);
      }
      updateChosenOption(estimateResponse, activeOption);
      // Skip beacon if this was triggered by a Calculate (already fired)
      if (justCalculatedRef.current) {
        justCalculatedRef.current = false;
      } else {
        fireBeacon(activeOption, estimateResponse);
      }
    }
  }, [activeOption, estimateResponse, estimateFresh, calcFingerprint, updateChosenOption, fireBeacon]);

  const handleNeighborTap = useCallback((count: number) => {
    handleGuestCount(count);
  }, [handleGuestCount]);

  // Use the same validated requirement for the label, destination and focus.
  const handleScrollToGap = () => {
    if (!nextRequiredField) return;
    const target = document.querySelector<HTMLElement>(nextRequiredField.target);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleScrollToOptions = () => {
    const panel = document.getElementById('estimate-panel');
    const target = panel?.querySelector<HTMLElement>('[data-space-option]:not(:disabled)')
      ?? panel?.querySelector<HTMLElement>('[aria-label="Compare event length"] button:not(:disabled)');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ── Staff reset ─────────────────────────────────────────────────────
  const handleStaffReset = useCallback(() => {
    setFormResetVersion(version => version + 1);
    setDate('');
    setTime('');
    setDuration(2);
    setDurationExplicit(false);
    setGuestCount(40);
    setLanePreference(null);
    setAutoDurationFallback(false);
    setDurationMessage('');
    manualAddonQuantities.current.clear();
    setSelectedPackageId(null);
    setBarSelection('own_tab');
    setBarQty(40);
    setAddons({});
    setNotes('');
    setOutsideHoursTime('');
    setEstimateResponse(null);
    pricedAttemptRef.current = null;
    setChosenOption(null);
    setEstimateInputKey('');
    setPricingRetry(EMPTY_PRICING_RETRY);
    ++requestSeq.current;
    requestAbort.current?.abort();
    setIsCalculating(false);
    lastCalcRef.current = '';
  }, []);

  // ── Send handler ──────────────────────────────────────────────────────
  const sendDataRef = useRef<SummaryData | null>(null);
  const handleSend = (manual = false) => {
    const error = eventDateError(date) || sendBlockReason;
    if (error || (manual ? !canManualQuote : !estimateFresh)) {
      setReviewMessage(error || RECALCULATE_MESSAGE);
      return;
    }
    const pkg = ALL_PACKAGES.find(p => p.id === selectedPackageId);
    const addonList = sortAddOns(currentSelections.addons).map(a => ({
      ...a, label: BUILDER_ADDON_GROUPS.flatMap(g => g.addons).find(def => def.key === a.slug)?.label ?? a.slug,
    }));
    const priced = !manual && estimateFresh && currentOption;
    const build = canonicalBuild(currentSelections);
    // One immutable selection/price snapshot feeds review, copy/SMS, and both submission routes.
    const summaryData: SummaryData = {
      ...currentSelections, foodPackage: pkg?.name ?? null, foodEstimate: '',
      addons: addonList, notes, outsideHoursTime: isOutsideHours ? outsideHoursTime.trim() : '',
      estimateTotal: priced ? '$' + currentOption.total.toLocaleString('en-US') : '',
      estimateNum: priced ? currentOption.total : null,
      depositNum: priced ? currentOption.deposit : null,
      laneLabel: priced ? currentOption.lane_label : null,
      pricingStatus: priced ? 'estimate_shown' : 'manual_quote_required',
      manualReason: priced ? undefined : isSendOnlyMode ? 'custom_event' : 'estimate_unavailable',
      inputFingerprint: priced ? inputFingerprint(build) : undefined,
      reviewedDay: centralDate(), shortNotice: daysAway(date)! < 10,
    };
    sendDataRef.current = summaryData;
    setShowSendSheet(true);
  };

  // ── Sticky bar summary ────────────────────────────────────────────────
  const summaryParts: string[] = [];
  if (date) summaryParts.push(formatDateShort(date));
  if (time && time !== OUTSIDE_HOURS) summaryParts.push(formatTimeShort(time));
  if (time === OUTSIDE_HOURS) summaryParts.push('Outside hours');
  if (!isOver100) summaryParts.push(`${guestCount} guests`);
  else summaryParts.push('100+');
  const summaryLine = summaryParts.join(' · ');

  // Event total for the sticky bar — only when estimate exists and isn't stale
  const barTotal = (() => {
    if (!estimateFresh || !estimateResponse?.ok) return '';
    const opt = estimateResponse.options[activeOption as keyof typeof estimateResponse.options];
    if (!opt) return '';
    const n = opt.total;
    return `About $${n >= 1000 ? n.toLocaleString('en-US') : n}`;
  })();

  // Traditional delta
  const traditionalDelta = estimateFresh && estimateResponse && estimateResponse.ok
    ? (() => {
        const vipOpt = estimateResponse.options[effectiveDuration === 3 ? 'vip_3h' : 'vip_2h'];
        const tradOpt = estimateResponse.options[effectiveDuration === 3 ? 'trad_3h' : 'trad_2h'];
        if (vipOpt && tradOpt) {
          const diff = tradOpt.total - vipOpt.total;
          return diff < 0 ? `−$${Math.abs(diff).toLocaleString()}` : null;
        }
        return null;
      })()
    : null;

  // Required-field guidance takes priority over stale pricing and request actions.
  const footerAction = isCalculating
    ? { label: 'Pricing it…', onClick: handleCalculate, disabled: true }
    : nextRequiredField
      ? { label: nextRequiredField.action, onClick: handleScrollToGap, disabled: false }
      : pricingResponseCurrent && !currentOption
        ? { label: 'Choose an option', onClick: handleScrollToOptions, disabled: false }
      : !staffMode && isSendOnlyMode
        ? { label: 'Ask our team for a quote', onClick: () => handleSend(true), disabled: !canSend }
        : !staffMode && estimateFresh
          ? { label: 'Review request →', onClick: () => handleSend(), disabled: false }
          : {
              label: menuCheckLoading ? 'Checking selections…'
                : isStale || (staffMode && estimateResponse?.ok) ? 'Update estimate'
                : estimateResponse && !estimateResponse.ok ? 'Retry estimate' : 'See estimate',
              onClick: handleCalculate,
              disabled: !canCalculate,
            };
  const footerReason = nextRequiredField || isCalculating ? ''
    : isSendOnlyMode ? (!staffMode ? sendBlockReason : disabledMessage)
    : !canCalculate ? disabledMessage : '';

  // noindex
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const pkg = ALL_PACKAGES.find(p => p.id === selectedPackageId);

  return (
    <NumericDraftContext.Provider value={handleNumericDraft}>
    <div className="min-h-screen bg-tp-ground font-body">
      {/* ── Staff bar (staff mode only) ─────────────────────────────────── */}
      {staffMode && (
        <div className="bg-tp-surface border-b border-tp-warm/[0.16] px-5 py-3">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <span className="font-label text-[13px] font-bold text-tp-warm/[0.72]">Staff calculator</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-[7px] border border-tp-warm/[0.16] overflow-hidden">
                <button
                  onClick={() => setStaffTier('es')}
                  className={`px-3 py-1.5 font-label text-[13px] font-bold transition-colors ${staffTier === 'es' ? 'bg-tp-warm text-tp-ground' : 'text-tp-warm/[0.50]'}`}
                >
                  Essential
                </button>
                <button
                  onClick={() => setStaffTier('el')}
                  className={`px-3 py-1.5 font-label text-[13px] font-bold transition-colors ${staffTier === 'el' ? 'bg-tp-warm text-tp-ground' : 'text-tp-warm/[0.50]'}`}
                >
                  Elevated
                </button>
              </div>
              <button
                onClick={handleStaffReset}
                className="flex items-center gap-1.5 font-label text-[13px] font-bold text-tp-warm/[0.50] border border-tp-warm/[0.16] rounded-[7px] px-3 py-1.5 hover:text-tp-warm/[0.72] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                New quote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Masthead — compact (hidden in staff mode) ───────────────────── */}
      {!staffMode && (
        <header className="pt-8 pb-4 flex flex-col items-center text-center px-5">
          <img
            src="https://images.fillout.com/orgid-658973/flowpublicid-2cjjjapyec/widgetid-default/eh757vjhBWcWnKb9nvDA3K/pasted-image-1776628663477.png"
            alt="Twisted Pin"
            className="h-16 w-auto object-contain mb-4"
          />
          {exploreMode ? (
            <>
              <p className="font-label text-[15px] font-bold text-tp-warm/[0.92] mb-1">Curious what your event could look like?</p>
              <p className="text-[15px] text-tp-warm/[0.72]">Explore your event. No commitment.</p>
            </>
          ) : (
            <>
              <p className="font-label text-[15px] font-bold text-tp-warm/[0.92] mb-1">Not your typical venue.</p>
              <p className="text-[15px] text-tp-warm/[0.72]">Not your typical event.</p>
            </>
          )}
        </header>
      )}

      {/* ── Off-ramp chips (hidden in staff mode) ─────────────────────── */}
      {!staffMode && (
        <div className="max-w-lg mx-auto px-5 pb-6 flex items-center gap-2 justify-center">
          <a
            href="https://www.twistedpin.com/reserve/birthdays/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center font-label text-[12.5px] font-bold text-tp-warm border border-tp-warm/[0.16] rounded-[7px] px-[14px] py-[12px] min-h-[44px] hover:border-tp-warm/30 transition-colors"
          >
            Kids' birthday? →
          </a>
          <a
            href="https://www.twistedpin.com/fundraisers/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center font-label text-[12.5px] font-bold text-tp-warm border border-tp-warm/[0.16] rounded-[7px] px-[14px] py-[12px] min-h-[44px] hover:border-tp-warm/30 transition-colors"
          >
            Fundraiser? →
          </a>
        </div>
      )}

      {/* ── All steps — always visible, 48px gap ────────────────────── */}
      <div className="max-w-lg mx-auto px-5 space-y-[48px]">

        {/* ── Venue tour (hidden in staff mode) ────────────────────────── */}
        {!staffMode && (
          <section>
            <div className="rounded-[12px] overflow-hidden">
              <VideoSection />
            </div>
          </section>
        )}

        {/* ── STEP 1: When ──────────────────────────────────────────── */}
        <WhenSection
          date={date}
          time={time}
          duration={effectiveDuration}
          guestCount={guestCount}
          laneType={laneType}
          bands={bands}
          onDate={value => { setDate(value); setDurationMessage(''); }}
          onTime={value => { setTime(value); setDurationMessage(''); }}
          onDuration={handleDuration}
          durationMessage={durationMessage}
          outsideHoursTime={outsideHoursTime}
          onOutsideHoursTime={setOutsideHoursTime}
          needed={!date || !time || !!dateError || !!dateRestriction}
          dateError={dateError || dateRestriction}
        />

        {/* ── STEP 2: Who ──────────────────────────────────────────── */}
        <WhoSection
          key={formResetVersion}
          guestCount={guestCount}
          laneType={laneType}
          bands={bands}
          onGuestCount={handleGuestCount}
          onLaneType={setLanePreference}
          traditionalDelta={traditionalDelta}
          daysUntilEvent={date && !dateError ? daysAway(date) : null}
        />

        {/* ── STEP 3: Food ──────────────────────────────────────────── */}
        <FoodSection
          selectedPackageId={selectedPackageId}
          guestCount={guestCount}
          hidePizzaPop={hidePizzaPop}
          ppDismissedMsg={ppDismissedMsg}
          ppStatusMessage={ppStatusMessage}
          onRetryPpCheck={ppFailed && selectedPackageId === 'pizza-pop' ? () => setMenuCheckRetry(n => n + 1) : undefined}
          rates={rates}
          needed={!selectedPackageId}
          onSelect={(id) => {
            setSelectedPackageId(id);
            setPpDismissedMsg('');
            const p = ALL_PACKAGES.find(x => x.id === id);
            if (p) firePill(p.name, `builder-pkg-${id}`);
          }}
        />

        {/* ── STEP 4: Drinks ──────────────────────────────────────── */}
        <DrinksSection
          barSelection={barSelection}
          barQty={barQty}
          guestCount={guestCount}
          onBarSelection={setBarSelection}
          onBarQty={setBarQty}
          onFirePill={firePill}
        />

        {/* ── STEP 5: Add-ons ────────────────────────────────────── */}
        <AddOnsSection
          addons={addons}
          guestCount={guestCount}
          onToggle={handleAddonToggle}
          onQty={handleAddonQty}
          onFirePill={firePill}
        />

        {/* ── Notes — always visible ──────────────────────────────── */}
        <NotesSection value={notes} onChange={setNotes} />

        {/* ── Estimate / send-only message ─────────────────────────── */}
        {isSendOnlyMode ? (
          <section>
            <div className="bg-tp-surface border border-tp-warm/[0.16] rounded-[12px] p-5">
              {isOver100 ? (
                <>
                  <p className="font-label text-[15px] font-bold text-tp-warm/[0.92] mb-2">
                    For over 100 guests, our team prepares a custom quote.
                  </p>
                  <p className="font-body text-[15px] text-tp-warm/[0.72]">
                    Pick your food and add-ons and send them over — we'll take it from there.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-label text-[15px] font-bold text-tp-warm/[0.92] mb-2">
                    A time outside regular hours needs a custom quote.
                  </p>
                  <p className="font-body text-[15px] text-tp-warm/[0.72]">
                    Pick your food and add-ons and send them over — we'll check availability and take it from there.
                  </p>
                </>
              )}
            </div>
          </section>
        ) : (
          <EstimatePanel
            response={estimateResponse}
            bookingPolicy={bookingPolicy(date, time, selectedPackageId ? FOOD_SLUG[selectedPackageId] : null, policyNow)}
            staffRoute={exploreMode || staffMode}
            activeOption={activeOption}
            isStale={comparisonIsStale}
            isCalculating={isCalculating}
            pricingFailures={pricingFailures}
            onOptionChange={handleOptionChange}
            onRecalculate={handleCalculate}
            canCalculate={canCalculate}
            disabledMessage={disabledMessage}
            onNeighborTap={handleNeighborTap}
            onSend={!staffMode && canManualQuote ? () => handleSend(true) : undefined}
            selectedAddons={addons}
            missingFields={pendingFields}
          />
        )}

        {(reviewMessage || (estimateResponse && !estimateResponse.ok && sendBlockReason)) && (
          <p role="alert" className="font-body text-[14px] text-tp-copper">{reviewMessage || sendBlockReason}</p>
        )}
        {/* Bottom spacer for sticky bar */}
        <div aria-hidden="true" style={{ height: stickyBarHeight + 16 }} />
      </div>

      {/* ── Sticky bottom bar ──────────────────────────────────────────── */}
      <div
        ref={stickyBarRef}
        data-builder-footer
        className="fixed bottom-0 left-0 right-0 bg-tp-surface/95 backdrop-blur-sm border-t border-tp-warm/[0.16] px-4 sm:px-5 z-40"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', paddingTop: '12px' }}
      >
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-label text-[14px] font-bold text-tp-warm">
                {barTotal || (nextRequiredField
                  ? (pendingFields.length > 1 ? `${pendingFields.length} choices left` : 'One detail left')
                  : pricingResponseCurrent && !currentOption ? 'Choose your space' : isStale ? 'Selections changed' : isSendOnlyMode ? 'Your event' : 'Your estimate')}
              </p>
              <p className="font-body text-[12px] text-tp-warm/[0.72] truncate">{summaryLine}</p>
            </div>
            <button
              type="button"
              onClick={footerAction.onClick}
              disabled={footerAction.disabled}
              className="bg-tp-glow text-tp-ground rounded-[7px] px-3 sm:px-5 py-3 font-label text-[13px] sm:text-sm font-bold active:bg-tp-glow/90 transition-colors shrink-0 max-w-[65%] min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-tp-warm focus-visible:ring-offset-2 focus-visible:ring-offset-tp-surface"
            >
              {footerAction.label}
            </button>
          </div>
          {footerReason && (
            <p role="status" className="font-body text-[12px] text-tp-warm/[0.72] mt-2">{footerReason}</p>
          )}
        </div>
      </div>

      {/* Send overlay — linked mode (eid), explore mode, or visitor contact step (not in staff mode) */}
      {!staffMode && showSendSheet && sendDataRef.current && (
        exploreMode ? (
          <ExploreContactStep
            data={sendDataRef.current}
            onClose={() => setShowSendSheet(false)}
          />
        ) : _eid ? (
          <SendSummarySheet
            data={sendDataRef.current}
            eid={_eid}
            onClose={() => setShowSendSheet(false)}
          />
        ) : (
          <VisitorContactStep
            data={sendDataRef.current}
            prefillGroupType={prefillType}
            attribution={attributionRef.current}
            onClose={() => setShowSendSheet(false)}
          />
        )
      )}

      {/* Flying pills */}
      <FlyingPillRenderer pills={flyingPills} />
    </div>
    </NumericDraftContext.Provider>
  );
}
