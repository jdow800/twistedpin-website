/** Display routing backed by reviewed event facts. The backend independently
 * enforces event eligibility. No NYE route is registered here: its existing
 * booking behavior remains authoritative. */
import eventFacts from '../data/special-events-2026.json' with { type: 'json' };

export interface EventDateRoute {
  id: string;
  date: string;
  title: string;
  dateLabel: string;
  calendarLabel: string;
  href?: `/${string}/`;
  actionLabel: string;
  message: string;
  salesState: "details_pending" | "booking_ready";
}

const DRAFT_EVENT_DATE_ROUTES: readonly EventDateRoute[] = [
  {
    id: "jingle-bowl-2026",
    date: "2026-12-06",
    title: "December 6 belongs to Jingle Bowl.",
    dateLabel: "Sunday, December 6, 2026",
    calendarLabel: "Jingle Bowl",
    href: "/jingle-bowl/",
    actionLabel: "Explore Jingle Bowl",
    message:
      "December 6 is a Jingle Bowl-only day, all the way through close. Regular lane reservations won't be offered before, during or after the event.",
    salesState: "details_pending",
  },
];

/** Ordinary booking stays opt-in. Public readiness controls the guest link;
 * an explicit local review may instead reach the isolated booking rehearsal. */
export function jingleBookingDateRoute(options: {enabled: boolean; protectedReview?: boolean}): EventDateRoute | null {
  if (!options.enabled) return null;
  const {href: _draftHref, ...route} = DRAFT_EVENT_DATE_ROUTES[0];
  if (import.meta.env.DEV && options.protectedReview === true) {
    return {...route, href: '/jingle-bowl/booking/', actionLabel: 'Review Jingle Bowl booking'};
  }
  const facts = eventFacts.records.find(event => event.id === 'jingle_bowl_2026');
  if (!facts?.page_public) return route;
  const ready = facts.confirmed && facts.booking_ready_verified && facts.session_cutoffs_verified && facts.sales_open_at !== null;
  return {...route, href: '/jingle-bowl/', salesState: ready ? 'booking_ready' : 'details_pending'};
}

/** Protected concepts only; ordinary booking uses jingleBookingDateRoute.
 * Absence of an event route says nothing about availability on an ordinary day. */
export function eventDateRoute(
  date: string | null,
  options: { enabled: boolean; surface: "ordinary_lanes" | "other" },
): EventDateRoute | null {
  if (!options.enabled || options.surface !== "ordinary_lanes" || !date) return null;
  return DRAFT_EVENT_DATE_ROUTES.find((route) => route.date === date) ?? null;
}
