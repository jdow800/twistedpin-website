import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const events = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/events" }),
  schema: z.object({
    title: z.string(),
    start: z.coerce.date(),
    end: z.coerce.date().optional(),
    location: z.string().default("Twisted Pin"),
    cta: z
      .object({
        label: z.string(),
        href: z.string(),
      })
      .optional(),
    tentative: z.boolean().default(false),
    virtual: z.boolean().default(false),
    draft: z.boolean().default(false),
    /**
     * Optional pricing floor for the Event's `offers` block in JSON-LD.
     * When present, both /upcoming-events (ItemList) and the dedicated
     * event page emit an AggregateOffer with this as `lowPrice`. Without
     * it, the Event is rich-result-ineligible (GSC: "Missing field
     * 'offers'"). Use the cheapest real package as the floor; ops can
     * refine when packages are confirmed.
     */
    lowPrice: z.string().optional(),
    /**
     * Optional pricing ceiling for the Event's `offers` AggregateOffer.
     * Pair with `lowPrice`. Without it, GSC flags "Missing field
     * 'highPrice'" as a non-critical Events structured data warning
     * (2026-05-27). Use the most expensive real package; for events
     * where ops hasn't priced the top tier, a sensible premium estimate
     * is fine — schema.org's AggregateOffer fields are descriptive of
     * the price range, not contractually binding.
     */
    highPrice: z.string().optional(),
    /**
     * Optional ISO 8601 date marking when this offer became (or becomes)
     * available for purchase. Paired with the existing `validThrough`
     * (which is set to the event start). Without it, GSC flags "Missing
     * field 'validFrom'" (2026-05-27). Typical value: a date in the
     * event's year, well before the event itself — represents "bookings
     * have been open since this date."
     */
    validFrom: z.coerce.date().optional(),
    /**
     * Optional event image (site-relative path, e.g.
     * "/snap/event-paint-night-610.jpg"). Emitted as the Event's JSON-LD
     * `image` on /upcoming-events. Recommended-not-required field — without
     * it GSC flags "Missing field 'image'" as a non-critical Events warning
     * (2026-06-18). Encode the source through scripts/build-snap-images.mjs.
     */
    image: z.string().optional(),
  }),
});

/**
 * Recurring specials (Penny A Pin Wednesdays, etc.) — different shape
 * from events: not dated one-shots, but day-of-week patterns with
 * optional seasonal windows. Body markdown carries the carve-out copy
 * ("not valid during school breaks") so it stays out of the template.
 */
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TIER_KEYS = ["traditional", "suite"] as const;

const specials = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/specials" }),
  schema: z.object({
    /** Display name in the callout, e.g. "Penny A Pin". */
    name: z.string(),
    /** Recurring days the special runs. */
    days: z.array(z.enum(DAY_KEYS)).min(1),
    /** Tiers it covers (one or both). */
    tiers: z.array(z.enum(TIER_KEYS)).default(["traditional"]),
    /** One-line hook shown alongside the special name. */
    tagline: z.string(),
    /** Optional seasonal window (summer-only, etc.). */
    showFrom: z.coerce.date().optional(),
    showUntil: z.coerce.date().optional(),
    /** Hide from rendering without deleting the file. */
    draft: z.boolean().default(false),
  }),
});

/**
 * Blog posts — evergreen long-form content for local SEO.
 *
 * The previous "/blog/ index killed" decision in launch-checklist.md
 * (2026-05-04) was scoped to the stale WordPress blog, not new
 * content. The 2026-05-08 handoff carryforward reverses the freeze
 * and adds three priority topics back to the queue per seo.md's blog
 * priority list — the content-marketing landscape for local
 * hospitality is still keyword-driven, and pages like "best things
 * to do in Plainfield" are 281+ monthly GBP searches we currently
 * rank zero on.
 *
 * Workflow: drop a markdown file with frontmatter, push, daily 4am
 * cron rebuilds. No /blog/ index page (per the existing decision —
 * posts are entry points from search, not destinations from a hub).
 */
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    /** Page <title> + H1. Keep under 60 chars including " | Twisted Pin" suffix. */
    title: z.string(),
    /** Meta description, 140–155 chars. Shown in SERP + OG cards. */
    description: z.string(),
    /** Date of original publication. Drives Article schema datePublished. */
    publishDate: z.coerce.date(),
    /** Optional last-modified date. Drives Article schema dateModified. */
    updateDate: z.coerce.date().optional(),
    /** Per-post OG image override (1200x630). Defaults to global og-default.jpg. */
    ogImage: z.string().optional(),
    /** og:image:alt for the post-specific image. */
    ogImageAlt: z.string().optional(),
    /** Primary keyword the post targets. Documentation only — not rendered. */
    targetKeyword: z.string().optional(),
    /** Hide from rendering (and from getCollection results) without deleting the file. */
    draft: z.boolean().default(false),
  }),
});

export const collections = { events, specials, blog };
