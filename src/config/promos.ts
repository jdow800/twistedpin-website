/**
 * Promo overlay schedule — one-line "draw attention to this" CTAs that
 * surface site-wide for a bounded window.
 *
 * Render contract:
 *   - PromoBar.astro picks the FIRST active promo (or null) at build time
 *     and renders it. One promo on screen at a time, never stacked.
 *   - User can dismiss the X; dismissal is stored in localStorage by `id`
 *     and never re-shows that specific promo on that device until the
 *     window closes. Bump the `id` (e.g. `kbf-2026` → `kbf-2027`) to
 *     re-show with refreshed copy.
 *   - Build runs daily at 9 UTC via cron, so windows go in/out of effect
 *     overnight without manual deploys (same mechanic as nav-seasonal.ts).
 *
 * Replacement schedule:
 *   - Order matters. The first entry whose window includes `today` wins.
 *   - To "swap" promos on a date, just have the next promo's `showFrom`
 *     equal the previous promo's `showUntil + 1`. Or overlap; the array
 *     order decides the winner.
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
}

/**
 * Active promo schedule. First active entry wins.
 *
 * Add a new promo above the existing ones if you want it to take priority
 * during an overlap window.
 */
export const PROMOS: readonly Promo[] = [
  {
    id: "kbf-summer-2026",
    message: "Free Bowling For Kids — through June 30",
    href: "/free-kids-bowling/",
    showUntil: "2026-06-30",
  },
];

/**
 * Returns the first active promo for the given date, or null if none.
 * Date comparison is ISO-string lexicographic (works because YYYY-MM-DD).
 *
 * Pass an explicit `now` for testing; defaults to current build time.
 */
export function getActivePromo(now: Date = new Date()): Promo | null {
  const today = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  for (const p of PROMOS) {
    if (p.showFrom && today < p.showFrom) continue;
    if (p.showUntil && today > p.showUntil) continue;
    return p;
  }
  return null;
}
