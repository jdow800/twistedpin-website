/**
 * Promo overlay schedule — one-line "draw attention to this" CTAs that
 * surface site-wide for a bounded window.
 *
 * Render contract:
 *   - PromoBar.astro renders ALL active promos at build time in ONE bar.
 *     A single promo renders static; two or more rotate in place (cross-fade
 *     every ~7s, paused on hover/focus). Never stacked — one pill footprint
 *     regardless of how many promos are live.
 *   - User can dismiss the X; dismissal is stored in localStorage by `id`
 *     and never re-shows that specific promo on that device until the
 *     window closes. Bump the `id` (e.g. `kbf-2026` → `kbf-2027`) to
 *     re-show with refreshed copy.
 *   - Build runs daily at 9 UTC via cron, so windows go in/out of effect
 *     overnight without manual deploys (same mechanic as nav-seasonal.ts).
 *
 * Replacement schedule:
 *   - Order matters. Array order = rotation order; the first active entry
 *     is the one shown on page load (so put the most time-sensitive promo
 *     first — it gets the entry-beat impression).
 *   - Windows overlap freely: every promo whose window includes `today`
 *     joins the rotation, and each drops out on its own `showUntil`.
 *
 * Voice:
 *   - Mobile renders ~36 chars cleanly; desktop toast fits more but keep
 *     the message tight — it has to read at a glance over the page.
 *   - Lead with the lever ("Free Bowling For Kids" not "Did you know...").
 *   - Sentence-style, no shouting caps.
 */
export interface Promo {
  /**
   * Stable ID for localStorage dismissal. Bump this when the content
   * changes so previously-dismissed users see the new copy.
   * Convention: `<slug>-<year>` e.g. "kbf-summer-2026".
   */
  id: string;
  /** One-line attention copy. Keep short — mobile bar is tight. */
  message: string;
  /** Click target. Internal paths get trailing slash; externals get target="_blank". */
  href: string;
  /**
   * Hide the promo on this exact path (the page it links to).
   * Defaults to `href` — auto-hides on the landing page itself so we don't
   * tell a /free-kids-bowling visitor about /free-kids-bowling. Set explicitly
   * if the promo links to an external URL but you want to suppress on a
   * specific internal path.
   */
  hideOnPath?: string;
  /**
   * ISO date "YYYY-MM-DD". Promo first shows from start-of-day in build
   * server tz. Omit to show immediately.
   */
  showFrom?: string;
  /**
   * ISO date "YYYY-MM-DD". Promo shows through end-of-day on this date.
   * Omit for no expiry (rare — most promos should be bounded).
   */
  showUntil?: string;
  /**
   * Render the promo only on the homepage (`/`). When false (default),
   * the promo appears site-wide except on its own landing page.
   *
   * Use case: campaigns where the homepage is the conversion funnel
   * and inner pages already serve the user's deeper intent — letting
   * the bar follow into /faq, /bar, /pricing etc. starts to feel like
   * marketing chase. Homepage-only respects that the user has already
   * navigated past the broadcast surface.
   */
  homepageOnly?: boolean;
}

/**
 * Active promo schedule. First active entry wins.
 *
 * Add a new promo above the existing ones if you want it to take priority
 * during an overlap window.
 */
export const PROMOS: readonly Promo[] = [
  // Leagues first. Two reasons:
  //   1. Aug 7-14 it runs alone (the kids promo was pulled early — see
  //      below), so it is the whole bar.
  //   2. Aug 15-31 it rotates with holiday-parties, and it is by far the
  //      more time-sensitive of the two: Monday IBT's organizational
  //      meeting is Aug 31 and Tuesday's is Sept 8, versus a December
  //      party that books months out. First position = entry beat.
  // Expires Aug 31, so it never coexists with NYE (opens Nov 15) — the
  // NYE-vs-holiday ordering below is unaffected by sitting under this.
  {
    id: "leagues-fall-2026",
    message: "Leagues Now Forming!",
    href: "/leagues/",
    showUntil: "2026-08-31",
    homepageOnly: true,
  },
  // Karaoke takes the bar the day leagues expires (Sept 1), per Jon
  // 2026-08-27. Split into a launch beat and a season beat for two reasons:
  //   1. The copy genuinely differs — "starts Sept 10" is news, "every
  //      Thursday" is a standing fact.
  //   2. Dismissal is stored per `id`, so one id spanning nine months would
  //      mean a single X-tap kills karaoke on that device until June. The
  //      split gives the season promo a fresh id partway through. Bump
  //      `karaoke-thursdays-2026` to `-2027` in January if it needs another
  //      re-show; the copy can stay identical.
  // Both point at /upcoming-events/, which auto-hides the bar on that page.
  {
    id: "karaoke-launch-2026",
    message: "Karaoke Thursdays start Sept 10",
    href: "/upcoming-events/",
    showFrom: "2026-09-01",
    showUntil: "2026-09-10",
    homepageOnly: true,
  },
  // NYE before holiday-parties — when both Q4 promos are active
  // (Nov 15 → Dec 15 overlap) the more time-sensitive one gets the entry
  // beat; the two rotate.
  {
    id: "nye-2026",
    message: "NYE party slots are open — book yours",
    href: "/new-years-eve/",
    showFrom: "2026-11-15",
    showUntil: "2026-12-31",
    homepageOnly: true,
  },
  // Holiday parties — picks up the day after the kids promo expires so the
  // bar never goes dark into the season (Jon-approved copy 2026-08-01).
  {
    id: "holiday-parties-2026",
    message: "Holiday parties — December books fast",
    href: "/holiday-parties/",
    showFrom: "2026-08-15",
    showUntil: "2026-12-15",
    homepageOnly: true,
  },
  // Season beat, LAST in the array on purpose. Sept 11 → the end of the
  // run, so it deliberately sits behind holiday-parties and NYE during Q4:
  // those two are the revenue promos in the corporate-ramp window, and this
  // one is a free weekly night that will still be there next Thursday.
  // From Dec 16 (holiday-parties expires) through the spring it runs alone.
  {
    id: "karaoke-thursdays-2026",
    message: "Free karaoke every Thursday, 7pm",
    href: "/upcoming-events/",
    showFrom: "2026-09-11",
    showUntil: "2027-05-27",
    homepageOnly: true,
  },
  // NOTE: the Free-Kids-Bowling promo ("Free Bowling For Kids — through
  // August 14", id kbf-summer-2026-aug14) was PULLED EARLY on Jon's call
  // 2026-08-07, a week before its own Aug 14 expiry, to give the bar to
  // leagues. It is deliberately gone, not lost — the Aug-15 handoff
  // choreography described in CLAUDE.md expects a kids→holiday-parties
  // baton pass, and this is why that baton now starts at leagues instead.
  // The /free-kids-bowling PAGE is untouched: it still flips itself to
  // 2027-waitlist mode at midnight CT Aug 15 via its own build-time date
  // gate, which never depended on this bar.
];

/**
 * Returns every active promo for the given date, in array order.
 * Date comparison is ISO-string lexicographic (works because YYYY-MM-DD).
 *
 * Pass an explicit `now` for testing; defaults to current build time.
 */
export function getActivePromos(now: Date = new Date()): Promo[] {
  const today = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  return PROMOS.filter(
    (p) =>
      !(p.showFrom && today < p.showFrom) &&
      !(p.showUntil && today > p.showUntil),
  );
}

/** Returns the first active promo for the given date, or null if none. */
export function getActivePromo(now: Date = new Date()): Promo | null {
  return getActivePromos(now)[0] ?? null;
}
