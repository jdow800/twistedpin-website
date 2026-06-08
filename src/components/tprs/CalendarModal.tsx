// The 📅 calendar as a modal overlay (Roller pattern) — opening it doesn't push
// the products down the page, it floats over them. Defaults to the selected
// month (or today's). Month nav; unavailable days greyed with a legend; boolean
// availability only (ADR-0025 AH-7). Shares the date control's availability
// cache (passed in from DateStrip) so it doesn't refetch.

import { useEffect, useMemo, useState } from "react";
import {
  buildMonthGrid,
  formatMonthLabel,
  formatUsd,
  shiftMonth,
  todayIso,
  monthOf,
} from "./format";
import type { DayAvailability } from "./useAvailability";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

interface Props {
  selected: string | null;
  availability: DayAvailability;
  onPick: (date: string) => void;
  onClose: () => void;
}

export default function CalendarModal({
  selected,
  availability,
  onPick,
  onClose,
}: Props) {
  const today = useMemo(todayIso, []);
  const [month, setMonth] = useState<string>(
    selected ? monthOf(selected) : monthOf(today),
  );

  const { isAvailable, ensureMonth } = availability;
  useEffect(() => ensureMonth(month), [month, ensureMonth]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const canGoPrev = month > monthOf(today);

  return (
    <div
      className="tprs-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a date"
      onClick={onClose}
    >
      <div className="tprs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tprs-modal-head">
          <span className="tprs-cal-month">{formatMonthLabel(month)}</span>
          <div className="tprs-modal-head-actions">
            <button
              type="button"
              className="tprs-cal-arrow"
              aria-label="Previous month"
              disabled={!canGoPrev}
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <button
              type="button"
              className="tprs-cal-arrow"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
            <button
              type="button"
              className="tprs-cal-arrow tprs-modal-close"
              aria-label="Close calendar"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="tprs-cal-grid" role="grid">
          {DOW.map((d, i) => (
            <div key={`dow-${i}`} className="tprs-cal-dow">
              {d}
            </div>
          ))}
          {grid.map((cell, i) => {
            if (cell.date === null)
              return <div key={`b-${i}`} className="tprs-cal-cell is-empty" />;
            const avail = isAvailable(cell.date);
            const price = avail ? availability.priceFor(cell.date) : null;
            const isSel = cell.date === selected;
            const isToday = cell.date === today;
            return (
              <button
                key={cell.date}
                type="button"
                disabled={!avail}
                aria-pressed={isSel}
                className={[
                  "tprs-cal-cell",
                  avail ? "is-available" : "",
                  isSel ? "is-selected" : "",
                  isToday && !isSel ? "is-today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  onPick(cell.date!);
                  onClose();
                }}
              >
                <span className="tprs-cal-day">{cell.day}</span>
                {price != null && (
                  <span className="tprs-cal-price">{formatUsd(price)}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="tprs-cal-legend">
          <span className="tprs-cal-legend-swatch" /> Unavailable
        </div>
      </div>
    </div>
  );
}
