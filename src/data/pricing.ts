/**
 * Walk-in pricing — weekly schedule.
 *
 * Four distinct schedules:
 *   - Mon–Thu: single rate window
 *   - Fri:     two windows (early + peak)
 *   - Sat:     two windows (early + peak)
 *   - Sun:     two windows (peak + off-peak — note Sunday is reversed:
 *              early is the peak rate, late is cheaper)
 *
 * Suite buyout for groups runs through Zite (Plan an Event); these
 * are by-the-lane walk-in rates only. SnapToday flags this distinction
 * with a small "Renting the whole suite?" link to /events/.
 *
 * Specials that REPLACE the rate (Penny A Pin) come from
 * src/content/specials/*.md and override the relevant card at render
 * time — pricing data here stays clean.
 */
import type { DayKey } from "./hours";

export interface PriceWindow {
  /** Display label for this rate window, e.g. "2 PM – 5 PM". Use
      "All open hours" when there's a single rate spanning the day. */
  label: string;
  /** Walk-in $/hr/lane for traditional lanes. */
  traditional: number;
  /** Walk-in $/hr/lane for the VIP suite (by the lane, not full buyout). */
  suite: number;
}

export interface DaySchedule {
  windows: PriceWindow[];
  traditionalCapacity: string;  // "up to 5 people"
  suiteCapacity: string;        // "up to 6 people"
}

const STANDARD_CAPACITY = {
  traditionalCapacity: "Up to 5",
  suiteCapacity: "Up to 6",
};

const MON_THU: DaySchedule = {
  ...STANDARD_CAPACITY,
  windows: [
    { label: "All open hours", traditional: 35, suite: 55 },
  ],
};

export const PRICING: Record<DayKey, DaySchedule> = {
  mon: MON_THU,
  tue: MON_THU,
  wed: MON_THU,
  thu: MON_THU,
  fri: {
    ...STANDARD_CAPACITY,
    windows: [
      { label: "2 PM – 5 PM",  traditional: 45, suite: 65 },
      { label: "5 PM – 1 AM",  traditional: 50, suite: 70 },
    ],
  },
  sat: {
    ...STANDARD_CAPACITY,
    windows: [
      { label: "11 AM – 4 PM", traditional: 45, suite: 65 },
      { label: "4 PM – 1 AM",  traditional: 55, suite: 75 },
    ],
  },
  sun: {
    ...STANDARD_CAPACITY,
    windows: [
      { label: "12 PM – 7 PM", traditional: 45, suite: 65 },
      { label: "7 PM – 10 PM", traditional: 35, suite: 55 },
    ],
  },
};

export const SHOE_RENTAL_LABEL = "$5.95 / pair";
