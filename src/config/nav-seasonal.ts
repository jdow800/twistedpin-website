/**
 * Seasonal nav items — pages that exist year-round at their URL but
 * only surface in the NavDrawer between `showFrom` and `showUntil`.
 *
 * Daily 4am cron rebuild reads this at build time and includes /
 * excludes items based on today's date, so a Nov 15 "show NYE" goes
 * live overnight without manual deploys.
 *
 * To add a seasonal item:
 *   1. Build the page at the target URL (it stays reachable year-round)
 *   2. Add an entry here with a sensible window
 *   3. Pick the drawer section: "Visit" for conversion-intent items
 *      (Reserve, Plan, Coupon), "Info" for context pages.
 *
 * Times are interpreted in the build server's timezone (UTC on
 * Vercel). Windows that span months handle DST transparently — the
 * comparison is a Date <= Date check.
 */
export type DrawerSection = "Experience" | "Visit" | "Info";

export interface SeasonalNavItem {
  /** Display label in the drawer. Title-case is the convention. */
  label: string;
  /** Internal path or external URL. External hrefs get target=_blank. */
  href: string;
  /** Lucide icon name — must exist in NavDrawer's ICON_PATHS map. */
  icon: string;
  /** Which drawer section to render this item in. */
  section: DrawerSection;
  /** ISO date string. Item shows from start-of-day in build server tz. */
  showFrom: string;
  /** ISO date string. Item shows through end-of-day in build server tz. */
  showUntil: string;
}

/**
 * NYE 2026: page lives at /new-years-eve/ year-round; surfaces in the
 * "Visit" section of the drawer from Nov 15 → Jan 2 so it's promoted
 * during the buying window without crowding the off-season nav.
 */
export const SEASONAL_ITEMS: SeasonalNavItem[] = [
  {
    label: "New Year's Eve",
    href: "/new-years-eve/",
    icon: "sparkles",
    section: "Visit",
    showFrom: "2026-11-15",
    showUntil: "2027-01-02",
  },
];

/** Active items at build time. Returns only items inside their window. */
export function activeSeasonalItems(now: Date = new Date()): SeasonalNavItem[] {
  return SEASONAL_ITEMS.filter((item) => {
    const from = new Date(item.showFrom + "T00:00:00Z");
    const until = new Date(item.showUntil + "T23:59:59Z");
    return now >= from && now <= until;
  });
}
