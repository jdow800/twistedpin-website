/**
 * Promo overlay schedule — one-line "draw attention to this" CTAs that
 * surface site-wide for a bounded window.
 *
 * Render contract:
 *   - PromoBar.astro renders active promos at build time in ONE bar.
 *     The homepage renders all candidates hidden, then the shared campaign
 *     controller selects current promos using America/Chicago time.
 *     A single promo renders static; two or more rotate in place (cross-fade
 *     every ~7s, paused on hover/focus). Never stacked — one pill footprint
 *     regardless of how many promos are live.
 *   - User can dismiss the X for the current page view. No storage is used;
 *     reload or navigation restores eligible promotions.
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
   * Stable ID used to match a candidate with its rendered slide.
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
   * ISO date "YYYY-MM-DD". Starts at Chicago midnight on the homepage;
   * other pages retain build-time selection. Omit to show immediately.
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
  // Expired beats removed 2026-10-28 (Jon-approved v4). Do not restore them:
  // leagues-fall-2026 (through Aug 31), karaoke-launch-2026 (through Sept 10),
  // singo-launch-2026 (through Sept 13).
  // NYE owns the homepage lead from Dec 7 through the shared campaign
  // selector. Do not add a second NYE bar or a separate November start here.
  {
    id: "holiday-parties-2026",
    message: "December or January party? Plan it.",
    href: "/holiday-parties/",
    showFrom: "2026-08-15",
    showUntil: "2026-12-15",
    homepageOnly: true,
  },
  // Season beat sits behind holiday-parties during Q4: that one is the
  // revenue promo, and this is a free weekly night. From Dec 16
  // (holiday-parties expires) through the spring it runs alone.
  // Bump the id to karaoke-thursdays-2027 in January if it needs another
  // re-show; the copy can stay identical.
  {
    id: "karaoke-thursdays-2026",
    message: "Free karaoke every Thursday at 7 PM",
    href: "/upcoming-events/",
    showFrom: "2026-09-11",
    showUntil: "2027-05-27",
    homepageOnly: true,
  },
  // Singo season beat, very last. A free weekly night yields to holiday
  // parties during the corporate ramp. Ends with the trial run
  // (singo-sundays.md `until`); if Jon extends the program, move BOTH.
  {
    id: "singo-sundays-2026",
    message: "Free Singo music bingo every Sunday at 7 PM",
    href: "/upcoming-events/",
    showFrom: "2026-09-14",
    showUntil: "2026-11-29",
    homepageOnly: true,
  },
  // NOTE: the Free-Kids-Bowling promo ("Free Bowling For Kids — through
  // August 14", id kbf-summer-2026-aug14) was PULLED EARLY on Jon's call
  // 2026-08-07. The leagues beat that took its place expired and was
  // removed with the other expired bars on 2026-10-28. The
  // /free-kids-bowling PAGE is untouched: it still flips itself to
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
