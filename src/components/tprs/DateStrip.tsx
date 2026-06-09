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
import { useDayAvailability } from "./useAvailability";
import { useMediaQuery, DESKTOP_QUERY } from "./useMediaQuery";
import {
  addDays,
  chipParts,
  todayIso,
  monthOf,
  shiftMonth,
  formatMonthLabel,
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
  productCodes?: number[];
  /** When set, the calendar probes THIS product (detail screen) — its
   *  availability + per-day pricing — instead of the page's first product. */
  productId?: string;
  selected: string | null;
  onPick: (date: string) => void;
  /** Section label — "When are you attending?" (main) / "Select a date" (detail). */
  label?: string;
}

export default function DateStrip({
  productCodes,
  productId,
  selected,
  onPick,
  label = "When are you attending?",
}: Props) {
  const today = useMemo(todayIso, []);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const windowSize = isDesktop ? WINDOW_DESKTOP : WINDOW_MOBILE;
  const availability = useDayAvailability(productCodes, productId);
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

  // Smart-forward (smarter than Roller): when a SPECIFIC product is in view
  // (detail screen → `productId` set) and the current date isn't bookable for it
  // — e.g. the Suite Birthday only runs Sat/Sun with a 7-day lead, so "today"
  // shows nothing — jump the picker to that product's soonest open day instead
  // of leaving the guest staring at an empty grid. Runs ONCE per product, and
  // never overrides a date the guest themselves picked that IS available.
  const forwardedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!productId) {
      forwardedFor.current = null;
      return;
    }
    if (forwardedFor.current === productId || availability.loadingProbe) return;

    // Decide-on-first: walk the horizon months IN ORDER and jump to the first
    // open day in the first month that has one — reaching into the next month
    // ONLY if this one loaded empty. So a product open this month costs ONE
    // ~20-25s cold compute, not the whole horizon fired at once (which also made
    // the backend self-contend on the cold computes). We wait per-month: if the
    // current month isn't loaded yet, bail and let the effect re-run when its
    // cache lands.
    let firstOpen: string | null = null;
    let m = monthOf(today);
    for (let i = 0; i < FORWARD_HORIZON_MONTHS; i++, m = shiftMonth(m, 1)) {
      availability.ensureMonth(m);
      if (!availability.isMonthLoaded(m)) return; // wait for THIS month, then re-run
      firstOpen = firstOpenDay(m, today, availability.isAvailable);
      if (firstOpen) break; // found it — don't fetch further months
      // month loaded but empty → fall through to the next one
    }

    forwardedFor.current = productId; // decided — don't fight the guest after this
    const selectionValid = selected != null && availability.isAvailable(selected);
    if (firstOpen && !selectionValid && selected !== firstOpen) {
      onPick(firstOpen);
    }
  }, [productId, selected, availability, today, onPick]);

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

  const canGoBack = windowStart > today;
  const monthLabel = formatMonthLabel(monthOf(windowStart)).toUpperCase();
  // Honest loading: are any visible days' months still computing? (The backend
  // compute is slow — show "checking…" rather than letting chips read as open
  // then flip to greyed.)
  const checking =
    availability.loadingProbe || days.some((d) => availability.isPending(d));

  return (
    <div className="tprs-datestrip">
      <div className="tprs-datestrip-head">
        <span className="tprs-datestrip-label">{label}</span>
        <button
          type="button"
          className="tprs-cal-open"
          aria-label="Open full calendar"
          onClick={() => setCalOpen(true)}
        >
          <span className="tprs-cal-open-icon" aria-hidden="true">📅</span>
          Calendar
        </button>
      </div>

      <p className="tprs-datestrip-month">
        {monthLabel}
        {checking && (
          <span className="tprs-datestrip-checking"> · checking availability…</span>
        )}
      </p>

      <div className="tprs-datestrip-row">
        <button
          type="button"
          className="tprs-cal-arrow"
          aria-label="Earlier days"
          disabled={!canGoBack}
          onClick={() =>
            setWindowStart((s) => {
              const back = addDays(s, -windowSize);
              return back < today ? today : back;
            })
          }
        >
          ‹
        </button>

        <div className="tprs-datestrip-chips">
          {days.map((date) => {
            const pending = availability.isPending(date);
            const avail = availability.isAvailable(date);
            const isSel = date === selected;
            const isToday = date === today;
            const { dow, day } = chipParts(date);
            return (
              <button
                key={date}
                type="button"
                disabled={pending || !avail}
                aria-pressed={isSel}
                aria-busy={pending || undefined}
                className={[
                  "tprs-chip",
                  pending ? "is-pending" : avail ? "is-available" : "",
                  isSel ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onPick(date)}
              >
                <span className="tprs-chip-dow">{isToday ? "Today" : dow}</span>
                {!isToday && <span className="tprs-chip-day">{day}</span>}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="tprs-cal-arrow"
          aria-label="Later days"
          onClick={() => setWindowStart((s) => addDays(s, windowSize))}
        >
          →
        </button>
      </div>

      {calOpen && (
        <CalendarModal
          selected={selected}
          availability={availability}
          onPick={onPick}
          onClose={() => setCalOpen(false)}
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
