# Handoff: On-page SEO spec — corporate-events enhance + birthday-parties build

**Date:** 2026-06-16
**From:** Google Ads / SEO work (competitor research → on-page roadmap)
**Why:** Competitor research on Pinstripes + Lucky Strike (full report: `Twisted Pin Full System/Reference/competitor_seo_pinstripes_luckystrike_2026-06-16.md`) found the chains are **beatable on local SEO**. Lucky Strike is the on-page model (use-case pages + keyword-first titles + FAQPage/LocalBusiness schema). Pinstripes — a big chain — has **zero schema** and buggy templates. A single optimized local venue (us) can out-rank both in the Plainfield/Naperville/Joliet local pack.

**Note:** extend the existing schema infrastructure from `2026-05-08-schema-rebuild-lcp-fundraisers.md` — don't rebuild. Verify all titles/meta/schema render in **built HTML** (Astro SSG/SSR), not just the dev DOM (Pinstripes' cautionary tale = client-side-only renders empty to crawlers).

---

## PHASE A — Enhance the LIVE `/corporate-events/` (quick win, already has the use-case copy)
The reframe shipped the use-case copy. Add the **SEO layer** on top:

1. **Title (keyword-first + geo, ≤60 chars):**
   `Corporate Events & Team Building in Plainfield, IL | Twisted Pin`
2. **Meta description (~150 chars, use-case + geo + CTA):**
   e.g. "Host your staff outing, team building, or company party at Twisted Pin in Plainfield — bowling, craft cocktails & catering for groups of 10–200. Book today."
3. **`FAQPage` schema + an on-page FAQ section** (search-phrased — write the questions how prospects actually search). Starter set:
   - "Can you host a corporate event or team outing for 10–200 people near Naperville?"
   - "Do you offer full-venue or VIP-suite buyouts for company events?"
   - "What's included in the VIP suite for a corporate group?"
   - "Can you cater a company party, luncheon, or holiday party?"
   - "Do you offer drink packages or a bar for corporate events?"
   - "How far is Twisted Pin from Naperville / Joliet?"
   - "What's the minimum and maximum group size?"
   - "Can I plan an employee-appreciation event or team-building day here?"
4. **`LocalBusiness`/`BowlingAlley` + `Restaurant` + `BarOrPub` schema** on homepage/location with full `PostalAddress`, `GeoCoordinates`, `OpeningHoursSpecification`, `telephone`, `priceRange`, `sameAs` (GBP + socials). (If a LocalBusiness block already exists from the May schema work, just confirm completeness + add the `BowlingAlley`/`BarOrPub` types.)
5. **`BreadcrumbList` schema** if not already sitewide.

## PHASE B — Build `/birthday-parties/` on the full template
Same pattern as corporate-events, birthday use-cases:
- **Title:** `Birthday Parties in Plainfield, IL | Adult & Milestone | Twisted Pin`
- **H1 use-case** + benefit pillars; sub-sections for **adult birthdays, milestone birthdays (30th/40th/50th), kids/family parties, bachelorette/bachelor** (note: bachelorette also has an Ads "Occasion" angle on the Bar-Led side).
- FAQPage schema + search-phrased FAQs (capacity, VIP suite, catering, kids policy, decorations).
- Reuse the LocalBusiness schema.
- **Inquiry CTA must carry gclid** (the `gclid-passthrough.client.ts` from the reframe already does this site-wide — just confirm the CTAs here use the same wired anchors).

*(Note: the existing `/birthday-parties-booking/` is the Ads destination for the Birthday ad group. Align — either enhance that URL or 301 the booking slug into a clean `/birthday-parties/` like you did with `/corporate-parties/`. Web builder's call on slug.)*

## Reusable on-page checklist (apply to every event/booking page)
**P0:** one indexable page per use-case · keyword-first geo title ≤60 · unique meta ~150 chars · self-referential canonical · server-rendered (verify built HTML).
**P1 schema:** LocalBusiness+BowlingAlley+Restaurant/BarOrPub · FAQPage (5–8 Q&As) · BreadcrumbList · AggregateRating/Review where legit · Event/Offer for leagues/promos.
**P2 page:** use-case H1 · 3 benefit pillars · capacity callout (10–200, VIP suite, catering) · crowd-favorites gallery · 2–3 testimonials · FAQ (mirrors schema) · dual CTA (quote form + "text our planner").
**P3 linking/local:** hub ↔ use-case pages · geo-modified anchor text · GBP fully optimized + NAP consistent with schema.

## Local long-tail keyword targets (the chains ignore these)
"corporate events Plainfield IL" · "team building near Naperville" · "private party room Plainfield" · "bowling party near Joliet" · "holiday party venue Plainfield IL" · "company Christmas party near Naperville" · "bachelorette party Naperville" · "milestone birthday venue Plainfield" · "[priority-town] private events"

## Guardrails
- No "chef-driven/inspired."
- Brian Van Flandern = **"curated by"** only (never built/partnered/backed). Use "America's Top Mixologist" (consistent with ads + the corporate-events page).
- Premium-but-fun, not stuffy.

## Priority order (by revenue lever)
1. Phase A (`/corporate-events/` SEO enhance) — fastest, page is live
2. Phase B (`/birthday-parties/`) — twin events lever
3. Later: bowling/open-play booking page, then `/bar/`

Deadline pressure: corporate ahead of the **Aug 1 Q4 corporate ramp**.
