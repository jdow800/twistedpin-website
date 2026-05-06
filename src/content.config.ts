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

export const collections = { events };
