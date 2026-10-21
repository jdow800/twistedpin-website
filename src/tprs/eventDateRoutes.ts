/** Draft display routing only. The backend must independently enforce event
 * eligibility before this can be enabled for public reservations. No NYE route
 * is registered here: its existing booking behavior remains authoritative. */
export interface EventDateRoute {
  id: string;
  date: string;
  title: string;
  dateLabel: string;
  href: `/${string}/`;
  actionLabel: string;
  message: string;
  salesState: "details_pending";
}

const DRAFT_EVENT_DATE_ROUTES: readonly EventDateRoute[] = [
  {
    id: "jingle-bowl-2026",
    date: "2026-12-06",
    title: "December 6 belongs to Jingle Bowl.",
    dateLabel: "Sunday, December 6, 2026",
    href: "/jingle-bowl/",
    actionLabel: "Explore Jingle Bowl",
    message:
      "December 6 is a Jingle Bowl-only day, all the way through close. Regular lane reservations won't be offered before, during or after the event.",
    salesState: "details_pending",
  },
];

/** Explicit opt-in is required. Callers use import.meta.env.DEV for review.
 * Absence of an event route says nothing about availability on an ordinary day. */
export function eventDateRoute(
  date: string | null,
  options: { enabled: boolean; surface: "ordinary_lanes" | "other" },
): EventDateRoute | null {
  if (!options.enabled || options.surface !== "ordinary_lanes" || !date) return null;
  return DRAFT_EVENT_DATE_ROUTES.find((route) => route.date === date) ?? null;
}
