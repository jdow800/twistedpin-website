// Compact near-term day strip (Roller pattern) — the DEFAULT date picker, since
// most guests book within a few days. Shows Today + the next few days as chips;
// `→` pages forward, `‹` pages back (never before today); the 📅 button opens
// the full month as a modal overlay. Keeping it compact (vs. a full inline
// calendar) is what leaves room for the product list right below it.
//
// Lives on BOTH the main screen and the product-detail screen so the chosen day
// stays in front of the guest the whole time (anti-"booked the wrong day").

import { useEffect, useMemo, useRef, useState } from "react";
import CalendarModal from "./CalendarModal";
import { specialDateLabel } from "./calendarDestinations";
import type { DayAvailability } from "./useAvailability";
import type { BookingPageConfig } from "../../tprs/pageConfig";
import { useMediaQuery, DESKTOP_QUERY } from "./useMediaQuery";
import {
  addDays,
  chipParts,
  todayIso,
  monthOf,
  shiftMonth,
  formatMonthLabel,
  formatDateLong,
} from "./format";

/** Chips visible at once — ~4 on mobile, ~7 on desktop (wider strip). */
const WINDOW_MOBILE = 4;
const WINDOW_DESKTOP = 7;
/** How far ahead to look for a product's first open day (smart-forward). Kept
 *  low (2) because each cold month-availability compute is ~20-25s on the
 *  backend; decide-on-first (below) means a product open THIS month only ever
 *  costs one compute, and we reach into month 2 only if month 1 is empty. */
const FORWARD_HORIZON_MONTHS = 2;

interface Props {
  /** The date control's availability source — OWNED BY THE PARENT (the main
   *  screen shares one instance between this strip and the product grid so
   *  both reflect the same per-product data; the detail screen probes its one
   *  product). Created via useDayAvailability. */
  availability: DayAvailability;
  /** Identity of what the calendar reflects (product id on detail; the curated
   *  set on main). Smart-forward runs once per key; null disables it. */
  probeKey: string | null;
  selected: string | null;
  onPick: (date: string) => void;
  /** Section label — "When are you attending?" (main) / "Select a date" (detail). */
  label?: string;
  /** Window explainer (pageConfig.windowNotice) rendered inside the calendar
   *  modal — the hint by the "Unavailable" legend plus the same bigger-group /
   *  outside-food → events handoff shown on the main screen. Main screen only
   *  (DetailStep omits it); unset = none. */
  windowNotice?: BookingPageConfig["windowNotice"];
  specialDates?: Readonly<Record<string, string>>;
}

export default function DateStrip({
  availability,
  probeKey,
  selected,
  onPick,
  label = "When are you attending?",
  windowNotice,
  specialDates,
}: Props) {
  const today = useMemo(todayIso, []);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const windowSize = isDesktop ? WINDOW_DESKTOP : WINDOW_MOBILE;
  const [windowStart, setWindowStart] = useState<string>(today);
  const [calOpen, setCalOpen] = useState(false);

  // The visible days, and the month(s) they touch (load availability for them).
  const days = useMemo(
    () => Array.from({ length: windowSize }, (_, i) => addDays(windowStart, i)),
    [windowStart, windowSize],
  );
  useEffect(() => {
    const monthsShown = new Set(days.map(monthOf));
    monthsShown.forEach((m) => availability.ensureMonth(m));
  }, [days, availability]);

  // Smart-forward (smarter than Roller): when the current date isn't bookable —
  // for THE product on the detail screen, or for ANY of the page's products on
  // the curated main screen (e.g. browsing after close, or a booked-out
  // Saturday) — jump the picker to the soonest open day instead of leaving the
  // guest staring at greyed chips / an empty grid, and SAY SO (the note below).
  // Runs ONCE per probe, and never overrides a date the guest themselves picked
  // that is (or may still turn out to be) available.
  const forwardedFor = useRef<string | null>(null);
  const [forwardNote, setForwardNote] = useState<{
    fromToday: boolean;
    to: string;
  } | null>(null);
  useEffect(() => setForwardNote(null), [probeKey]);
  useEffect(() => {
    if (!probeKey) {
      forwardedFor.current = null;
      return;
    }
    if (forwardedFor.current === probeKey || availability.loadingProbe) return;
    // Failed selected-date reads are unknown, not a reason to move the guest.
    if (selected && availability.errorFor?.(selected)) return;
    // A deliberate event-date selection must not jump to an ordinary day.
    if (selected && specialDateLabel(specialDates, selected, today)) return;

    if (availability.reserveFastStart) {
      // The shortcut and month search share one decision owner. A chosen
      // future date, a positive today, or a manual pick must never be replaced.
      if ((selected && selected !== today) || availability.isAvailable(today)) {
        forwardedFor.current = probeKey;
        return;
      }
      if (availability.isPending(today)) return;
      const suggested = availability.suggestedDate;
      if (suggested && !specialDateLabel(specialDates, suggested, today)) {
        forwardedFor.current = probeKey;
        setForwardNote({ fromToday: true, to: suggested });
        onPick(suggested);
        return;
      }
      // First positive tomorrow may reveal before its other reads finish.
      // Until then, do not let an explicitly opened month win this race.
      if (availability.checkingNextDay) return;
    }

    // Decide-on-first: walk the horizon months IN ORDER and jump to the first
    // open day in the first month that has one — reaching into the next month
    // ONLY if this one loaded empty. So a product open this month costs ONE
    // availability compute, not the whole horizon fired at once. We wait
    // per-month: if the current month isn't loaded yet, bail and let the
    // effect re-run when its cache lands.
    let firstOpen: string | null = null;
    let m = monthOf(today);
    for (let i = 0; i < FORWARD_HORIZON_MONTHS; i++, m = shiftMonth(m, 1)) {
      availability.ensureMonth(m);
      if (!availability.isMonthLoaded(m)) return; // wait for THIS month, then re-run
      firstOpen = firstOpenDay(m, today, availability.isAvailable);
      if (firstOpen) break; // found it — don't fetch further months
      // month loaded but empty → fall through to the next one
    }

    // The background month can finish before today's priority day read. Don't
    // consume the initial decision until that day is authoritative: a late
    // unavailable result still needs to advance. Deliberate future picks keep
    // the pending-as-valid behavior below so we never move them on a late read.
    if ((!selected || selected === today) && availability.isPending(today)) return;

    forwardedFor.current = probeKey; // decided — don't fight the guest after this
    // A pick whose month hasn't loaded for THIS probe yet counts as valid —
    // don't stomp a deliberate far-future date while its verdict is in flight.
    const selectionValid =
      selected != null &&
      (availability.isAvailable(selected) || availability.isPending(selected));
    if (firstOpen && !selectionValid && selected !== firstOpen) {
      setForwardNote({
        fromToday: selected == null || selected === today,
        to: firstOpen,
      });
      onPick(firstOpen);
    }
  }, [probeKey, selected, availability, today, onPick, specialDates]);

  // If a date is picked that's OUTSIDE the visible window (e.g. from the
  // calendar modal), rotate the strip to center on it so they can page left or
  // right around it. Functional setState reads the current window without making
  // windowStart a dep — so paging the strip doesn't fight this.
  useEffect(() => {
    if (!selected) return;
    setWindowStart((curStart) => {
      const end = addDays(curStart, windowSize - 1);
      if (selected >= curStart && selected <= end) return curStart; // already shown
      const centered = addDays(selected, -Math.floor(windowSize / 2));
      return centered < today ? today : centered;
    });
  }, [selected, windowSize, today]);

  // A deliberate pick dismisses the auto-forward note (the guest took over).
  const manualPick = (date: string) => {
    if (availability.reserveFastStart) forwardedFor.current = probeKey;
    setForwardNote(null);
    onPick(date);
  };

  const canGoBack = windowStart > today;
  const monthLabel = formatMonthLabel(monthOf(windowStart)).toUpperCase();
  // Honest loading: are any visible days' months still computing? (The backend
  // compute is slow — show "checking…" rather than letting chips read as open
  // then flip to greyed.)
  const checking =
    availability.loadingProbe || days.some((d) => availability.isPending(d));
  const readError = availability.errorFor?.(selected ?? windowStart)
    ?? days.map(date => availability.errorFor?.(date)).find(Boolean);

  return (
    <div className="tprs-datestrip">
      <div className="tprs-datestrip-head">
        <span className="tprs-datestrip-label">{label}</span>
        <button
          type="button"
          className="tprs-cal-open"
          aria-label="Open full calendar"
          onClick={() => { availability.requestCalendar?.(); setCalOpen(true); }}
        >
          <span className="tprs-cal-open-icon" aria-hidden="true">📅</span>
          Calendar
        </button>
      </div>

      <p className="tprs-datestrip-month">
        {monthLabel}
        {checking && (
          <span className="tprs-datestrip-checking">{selected && availability.isAvailable(selected) ? " · checking other dates…" : " · checking availability…"}</span>
        )}
      </p>

      {!calOpen && readError && <div className="tprs-read-error" role="alert">
        <p>{readError}</p>
        <button type="button" className="tprs-btn tprs-btn--ghost" onClick={() => availability.retry?.()}>Retry availability</button>
      </div>}

      <div className="tprs-datestrip-row">
        <button
          type="button"
          className="tprs-cal-arrow"
          aria-label="Earlier days"
          disabled={!canGoBack}
          onClick={() => {
            availability.requestCalendar?.();
            setWindowStart((s) => {
              const back = addDays(s, -windowSize);
              return back < today ? today : back;
            });
          }}
        >
          ‹
        </button>

        <div className="tprs-datestrip-chips">
          {days.map((date) => {
            const special = specialDateLabel(specialDates, date, today);
            const pending = !special && availability.isPending(date);
            const avail = !!special || availability.isAvailable(date);
            const failed = !special && !avail && date >= today && !!availability.errorFor?.(date);
            const isSel = date === selected;
            const isToday = date === today;
            const { dow, day } = chipParts(date);
            return (
              <button
                key={date}
                type="button"
                disabled={pending || !avail}
                aria-pressed={isSel}
                aria-label={special ? `${formatDateLong(date)}: ${special} packages` : failed ? `${formatDateLong(date)}: availability needs another check` : undefined}
                aria-busy={pending || undefined}
                className={[
                  "tprs-chip",
                  pending ? "is-pending" : avail ? "is-available" : "",
                  failed ? "is-error" : "",
                  isSel ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => manualPick(date)}
              >
                <span className="tprs-chip-dow">{isToday ? "Today" : dow}</span>
                {!isToday && <span className="tprs-chip-day">{day}</span>}
                {special && <span className="tprs-special-date-label">{special}</span>}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="tprs-cal-arrow"
          aria-label="Later days"
          onClick={() => { availability.requestCalendar?.(); setWindowStart((s) => addDays(s, windowSize)); }}
        >
          →
        </button>
      </div>

      {forwardNote && (
        <p className="tprs-datestrip-note" role="status">
          {availability.reserveFastStart
            ? forwardNote.fromToday ? "No more online times today" : "No online times on that date"
            : forwardNote.fromToday
            ? "Today's booked out online"
            : "That date's booked out online"}{" "}
          — next opening is <strong>{formatDateLong(forwardNote.to)}</strong>.
        </p>
      )}

      {calOpen && (
        <CalendarModal
          selected={selected}
          availability={availability}
          onPick={manualPick}
          onClose={() => setCalOpen(false)}
          windowNotice={windowNotice}
          specialDates={specialDates}
        />
      )}
    </div>
  );
}

/** First selectable day within `month`, today-or-later. The month must already
 *  be loaded so `isAvailable` is authoritative (not optimistic-true). */
function firstOpenDay(
  month: string,
  today: string,
  isAvailable: (d: string) => boolean,
): string | null {
  const monthStart = `${month}-01`;
  const start = monthStart < today ? today : monthStart;
  const nextMonthStart = `${shiftMonth(month, 1)}-01`;
  for (let d = start; d < nextMonthStart; d = addDays(d, 1)) {
    if (isAvailable(d)) return d;
  }
  return null;
}
