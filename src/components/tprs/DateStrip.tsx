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
/** How far ahead to look for a product's first open day (smart-forward). */
const FORWARD_HORIZON_MONTHS = 4;

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

    // Need the horizon's months loaded before we can decide (else wait — the
    // effect re-runs when the availability cache updates).
    const horizon: string[] = [];
    for (let i = 0, m = monthOf(today); i < FORWARD_HORIZON_MONTHS; i++) {
      horizon.push(m);
      m = shiftMonth(m, 1);
    }
    horizon.forEach((m) => availability.ensureMonth(m));
    if (!horizon.every((m) => availability.isMonthLoaded(m))) return;

    // First open day from today within the horizon.
    let firstOpen: string | null = null;
    const limit = addDays(today, FORWARD_HORIZON_MONTHS * 31);
    for (let d = today; d <= limit; d = addDays(d, 1)) {
      if (availability.isAvailable(d)) {
        firstOpen = d;
        break;
      }
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

      <p className="tprs-datestrip-month">{monthLabel}</p>

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
            const avail = availability.isAvailable(date);
            const isSel = date === selected;
            const isToday = date === today;
            const { dow, day } = chipParts(date);
            return (
              <button
                key={date}
                type="button"
                disabled={!avail}
                aria-pressed={isSel}
                className={[
                  "tprs-chip",
                  avail ? "is-available" : "",
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
