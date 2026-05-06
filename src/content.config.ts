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
    /** True = special replaces the standard $/hr rate (Penny A Pin).
        False = additive (e.g., trivia at 7pm at the normal rate). */
    replacesRate: z.boolean().default(false),
    /** One-line hook shown alongside the special name. */
    tagline: z.string(),
    /** Optional seasonal window (summer-only, etc.). */
    showFrom: z.coerce.date().optional(),
    showUntil: z.coerce.date().optional(),
    /** Hide from rendering without deleting the file. */
    draft: z.boolean().default(false),
  }),
});

export const collections = { events, specials };
