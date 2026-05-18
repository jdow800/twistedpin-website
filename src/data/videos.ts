/**
 * Video metadata registry — single source of truth for VideoObject
 * JSON-LD and the video sitemap extension.
 *
 * Why: section videos across the site (hero, beerwall, cocktails,
 * buffet, vip-lanes, best-things, arcade, nye, summer-pass) are visible
 * to users but invisible to Google's video index until VideoObject
 * schema names them. Per the 2026-05-17 Google docs audit, this is the
 * biggest single unclaimed rich-result surface on the site.
 *
 * Schema.org VideoObject fields (Google's required + recommended):
 *   - name (required)
 *   - description (required)
 *   - thumbnailUrl (required) — absolute URL, stable, AVIF/WebP/JPG OK
 *   - uploadDate (strongly recommended) — ISO 8601 with timezone
 *   - contentUrl (strongly recommended) — direct .mp4 URL
 *   - duration (strongly recommended) — ISO 8601 PT#M#S
 *
 * Each entry has a **primary page** — the URL where the VideoObject is
 * emitted as canonical. A given video may appear on multiple pages, but
 * only the primary page emits its schema (per Schema.org single-canonical
 * convention). Cross-page video instances are visual-only.
 *
 * **uploadDate values** are placeholders pointing at the period when the
 * site relaunch went live. Ops can refine these to actual filming /
 * editing dates if known — older dates are fine; future dates would be
 * dropped by Google. Don't use build-time `new Date()` here — that
 * shifts the date on every deploy, which Google has been known to
 * dampen as "content flapping daily" (see perf-history.md context).
 *
 * **duration values** are conservative estimates from the source MP4
 * runtimes (most loops are 4-15s). Verify with ffprobe before any
 * pre-launch sweep if precise accuracy matters — Google rejects
 * obviously wrong durations.
 *
 * Seasonal videos (NYE, summer-pass, free-kids-bowling) get an
 * `expires` field — Google drops VideoObject from results past that
 * date, so the video stops surfacing after the program ends.
 */

import { BUSINESS_URL } from "../lib/schema";

export interface VideoEntry {
  /** Slug used to namespace the @id. */
  slug: string;
  /** Display name (Schema.org `name`). Shown in SERP video carousels. */
  name: string;
  /** Schema.org `description`. 100-300 chars, describes visual content. */
  description: string;
  /** Path to the canonical poster image (.avif). Stable URL, immutably cached. */
  thumbnailPath: string;
  /** Path to a canonical content URL (.mp4). Direct file, no embed. */
  contentPath: string;
  /** Source video duration in seconds. Conservative estimate. */
  durationSeconds: number;
  /** ISO date of original upload / publication (no time zone needed at day-precision). */
  uploadDate: string;
  /** ISO date when this video should drop from results. Seasonal videos only. */
  expires?: string;
  /** Canonical page that emits this video's VideoObject schema. */
  primaryPagePath: string;
}

const ASSET = (path: string): string => `${BUSINESS_URL}${path}`;

/** Convert seconds → ISO 8601 duration string (PT#M#S or PT#S). */
export function isoDuration(seconds: number): string {
  if (seconds < 60) return `PT${seconds}S`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `PT${m}M${s}S` : `PT${m}M`;
}

// ── Registry ───────────────────────────────────────────────────────

export const HERO_VIDEO: VideoEntry = {
  slug: "hero",
  name: "Twisted Pin — A Bar-Led Night Out",
  description:
    "Atmospheric hero clip from Twisted Pin in Plainfield, IL. A craft cocktail being built behind the bar, then the 28-tap self-serve wall, then a finished pour. Sets the bar-program-led tone for the venue.",
  thumbnailPath: "/hero/hero-poster.webp",
  contentPath: "/hero/hero-mobile-h264-1080.mp4",
  durationSeconds: 4,
  uploadDate: "2026-04-30",
  primaryPagePath: "/",
};

export const BEERWALL_VIDEO: VideoEntry = {
  slug: "beerwall",
  name: "The 28-Tap Self-Serve Wall",
  description:
    "The 28-tap self-serve beer and wine wall at Twisted Pin in Plainfield, IL — the only one in the immediate area. Customers grab a card, pour their own, pay by the ounce.",
  thumbnailPath: "/snap/beerwall-poster.avif",
  contentPath: "/snap/beerwall-mobile-h264-1080.mp4",
  durationSeconds: 12,
  uploadDate: "2026-04-15",
  primaryPagePath: "/bar/",
};

export const COCKTAILS_HERO_VIDEO: VideoEntry = {
  slug: "cocktails-hero",
  name: "Craft Cocktails — Curated by America's Top Mixologist",
  description:
    "A craft cocktail being built behind the bar at Twisted Pin in Plainfield, IL. The cocktail program was curated by Brian Van Flandern, named America's Top Mixologist by Food Network.",
  thumbnailPath: "/snap/cocktails-hero-poster.avif",
  contentPath: "/snap/cocktails-hero-mobile-h264-1080.mp4",
  durationSeconds: 10,
  uploadDate: "2026-04-15",
  primaryPagePath: "/bar/",
};

export const BUFFET_VIDEO: VideoEntry = {
  slug: "buffet",
  name: "Group Events — Catering at Twisted Pin",
  description:
    "A buffet of catering options laid out for a group event in the 6-lane VIP suite at Twisted Pin in Plainfield, IL. Chafing dishes, charcuterie, bar setup. Up to 80 people.",
  thumbnailPath: "/snap/buffet-poster.avif",
  contentPath: "/snap/buffet-mobile-h264-1080.mp4",
  durationSeconds: 8,
  uploadDate: "2026-04-15",
  primaryPagePath: "/events/",
};

export const VIP_LANES_VIDEO: VideoEntry = {
  slug: "vip-lanes",
  name: "The 6-Lane VIP Suite",
  description:
    "A walkthrough of the 6-lane VIP suite at Twisted Pin in Plainfield, IL — set apart from the traditional lanes by a wall. Yours for the night when you book the suite. Up to 80 people, AV hookups, in-house catering.",
  thumbnailPath: "/snap/vip-lanes-poster.avif",
  contentPath: "/snap/vip-lanes-mobile-h264-1080.mp4",
  durationSeconds: 12,
  uploadDate: "2026-04-15",
  primaryPagePath: "/vip-suite/",
};

export const BEST_THINGS_VIDEO: VideoEntry = {
  slug: "best-things",
  name: "Real Kitchen, Real Plates",
  description:
    "A montage of food and shareable plates from the kitchen at Twisted Pin in Plainfield, IL. From-scratch menu, built to share. Not bowling-alley food.",
  thumbnailPath: "/snap/best-things-poster.avif",
  contentPath: "/snap/best-things-mobile-h264-1080.mp4",
  durationSeconds: 15,
  uploadDate: "2026-04-15",
  primaryPagePath: "/eat/",
};

export const ARCADE_VIDEO: VideoEntry = {
  slug: "arcade",
  name: "The Arcade at Twisted Pin",
  description:
    "Skee-ball, redemption, and the jackpot machines at Twisted Pin in Plainfield, IL. Real arcade, not a tablet wall — and not the consolation prize for the parents.",
  thumbnailPath: "/snap/arcade-poster.avif",
  contentPath: "/snap/arcade-mobile-h264-1080.mp4",
  durationSeconds: 10,
  uploadDate: "2026-04-15",
  primaryPagePath: "/game/",
};

export const NYE_VIDEO: VideoEntry = {
  slug: "nye",
  name: "New Year's Eve at Twisted Pin",
  description:
    "Atmospheric clip for New Year's Eve at Twisted Pin in Plainfield, IL. The bar, the 28-tap self-serve wall, the 6-lane VIP suite — done right.",
  thumbnailPath: "/snap/nye-poster.avif",
  contentPath: "/snap/nye-mobile-h264-1080.mp4",
  durationSeconds: 8,
  uploadDate: "2026-05-06",
  /**
   * NYE is annual. Set to Jan 2 of the year AFTER each event. Update
   * yearly when the next NYE event ships (per the schema-dates
   * maintenance cadence in launch-checklist.md). Currently scoped to
   * the 2026 → 2027 NYE event.
   */
  expires: "2027-01-02",
  primaryPagePath: "/new-years-eve/",
};

export const SUMMER_PASS_VIDEO: VideoEntry = {
  slug: "summer-pass",
  name: "The Summer Pin Pass",
  description:
    "The Summer Pin Pass at Twisted Pin in Plainfield, IL. $159.95 for unlimited 1.5-hour bowling visits every day all summer for the entire household.",
  thumbnailPath: "/snap/summer-pass-poster.avif",
  contentPath: "/snap/summer-pass-mobile-h264-1080.mp4",
  durationSeconds: 10,
  uploadDate: "2026-04-15",
  /** Expires at the end of summer per the Pin Pass program window. */
  expires: "2026-09-02",
  primaryPagePath: "/summer-pin-pass/",
};

/**
 * The full registry. Used by the video sitemap endpoint to enumerate
 * all videos in one place. Individual pages import their specific
 * entries directly above for the JSON-LD VideoObject emission.
 */
export const VIDEO_REGISTRY: readonly VideoEntry[] = [
  HERO_VIDEO,
  BEERWALL_VIDEO,
  COCKTAILS_HERO_VIDEO,
  BUFFET_VIDEO,
  VIP_LANES_VIDEO,
  BEST_THINGS_VIDEO,
  ARCADE_VIDEO,
  NYE_VIDEO,
  SUMMER_PASS_VIDEO,
];

/** Helper — absolute URL for thumbnail. */
export function thumbnailUrl(v: VideoEntry): string {
  return ASSET(v.thumbnailPath);
}

/** Helper — absolute URL for content (.mp4). */
export function contentUrl(v: VideoEntry): string {
  return ASSET(v.contentPath);
}

/** Helper — absolute URL for the primary page that owns this video. */
export function primaryPageUrl(v: VideoEntry): string {
  return ASSET(v.primaryPagePath);
}
