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
  {
    // One-night ticketed event (20 seats, 21+). Links to the marketing
    // lander, not /reserve/mixology/ — same convention as social/QR.
    // Expires end-of-day on the event date; the daily 9 UTC cron build
    // removes it automatically the morning after.
    id: "mixology-2026-07-28",
    message: "An Evening with America's Top Mixologist — July 28",
    href: "/mixology-experience/",
    showUntil: "2026-07-28",
    homepageOnly: true,
  },
  {
    id: "kbf-summer-2026-aug14",
    message: "Free Bowling For Kids — through August 14",
    href: "/free-kids-bowling/",
    showUntil: "2026-08-14",
    homepageOnly: true,
  },
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
