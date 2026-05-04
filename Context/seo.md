# Twisted Pin — SEO & Copy Guidance

A practical reference for building the new website. This file covers **what to rank for**, **how to structure pages around those keywords**, and **how copy should be written for SEO without breaking brand voice**. It pairs with [brand and voice.md](brand%20and%20voice.md) — voice rules still apply; this file is about discoverability.

---

## The Big Picture

Local SEO is the highest-ROI channel we have. The Google Business Profile alone generated ~24,800 high-intent actions in 6 months (~$23,500 in equivalent paid traffic). The new site needs to **support** that — not undermine it like the current one does.

Two things from the current site that the new build must fix:
1. **Mobile speed.** Current mobile LCP is 25.7 seconds. Google flags anything over 2.5s as "poor." 90% of our paid clicks come from mobile. Visitors are bouncing before the page loads. Every other SEO effort is wasted until this is fixed.
2. **Headline misalignment.** Current homepage says *"Your Ultimate Dining Destination"* — undersells bowling, arcade, VIP, and the entertainment side that drives most search demand.

---

## Keywords That Are Already Working (Protect These)

These are proven performers. The new site must keep ranking for them. Don't change URLs, page titles, or H1s on equivalent pages without 301 redirects.

| Keyword cluster | Why it matters | Where it should live |
|---|---|---|
| `bowling near me`, `bowling Plainfield`, `bowling alley near me`, `bowling Plainfield IL`, `plainfield bowling` | 44% of paid clicks. ~1,000–13K monthly searches. Low CPC, high convert. **The foundation.** | Homepage + dedicated `/bowling/` page |
| `twisted pin`, `twisted pins`, `twisted pin plainfield`, `twisted pin photos` | 6,600+ monthly branded searches. Already ranks. Don't break it. | Homepage |
| `restaurants Plainfield`, `restaurants near me`, `places to eat near me` | 15K+ restaurant-related GBP searches. 17% of paid clicks. | Dedicated `/dining/` or `/menu/` page |
| `corporate event venue near me`, `team building venue`, `company outing bowling` | $2K–$10K+ bookings. Google drives 40% of corporate leads. | Dedicated `/corporate-events/` or `/group-events/` page (avoid `/private-events/` slug per voice.md — venue has no fully-private space) |
| `adult birthday party venue`, `VIP party room`, `bowling birthday party` | 11.86% CTR — birthday planners convert hard. | Dedicated `/birthday-parties/` page |
| `arcades near me`, `arcade Plainfield` | 3,700+ GBP searches. Currently no dedicated landing page. | Dedicated `/arcade/` page |

---

## Opportunities Not Yet Captured

Build pages and copy to capture these — current site doesn't.

| Cluster | Why we're missing it | What to do |
|---|---|---|
| `bars near me`, `cocktail bars near me`, `sports bar near me`, `craft cocktails Plainfield` | No dedicated page. Quality Score of 3 on the bar ad group. | `/bar/` or `/cocktails/` page with cocktail menu, mixologist content, tap wall |
| `event spaces near me`, `party venues near me`, `party rooms for rent` | Generic event searchers aren't thinking "bowling" yet. We surface as a bowling alley. | Lead the events page with **VIP suite & event space** — not bowling |
| `self serve beer wall near me`, `28 tap beer wall` | We're the only one in the area. Almost no competition. | Page or strong section calling this out — schema + photos |
| `fundraiser venue`, `bowling fundraiser` | Fundraisers average 65 attendees (highest of any event type). | Sub-page or section under `/group-events/` (or `/fundraiser/` if standalone — see also voice.md re: avoiding `/private-*` slugs) |
| `things to do Plainfield`, `things to do Naperville`, `date night ideas Plainfield` | Top-of-funnel discovery searches. | Blog content, not landing pages — `/blog/best-date-night-plainfield/` style |
| Competitor conquest: `Bowlero`, `Lucky Strike`, `Main Event`, `Round 1`, `Dave & Buster's`, `Topgolf` | 4,500+ Main Event searches alone trigger our GBP. Cheap intent. | Comparison content (subtle) + paid Custom Intent — not the website's main job, but supporting blog content helps |
| Spanish: `boliche cerca de mi`, `bolos cerca de mi` | 9.6% Hispanic local population. Zero competition. 68 clicks already. | Translated versions of bowling and events pages |

---

## Recommended Page Structure (URL & H1)

Every page below should have a clear primary keyword in the H1, the slug, the page title, and the first paragraph. The voice rules from `brand and voice.md` still apply — keyword stuffing is off-brand and Google penalizes it anyway.

**Important:** Several of these URLs already exist on the current site and already rank. **Preserve those URLs** on the new build — changing a URL that ranks for "bowling Plainfield" without a 301 redirect costs us traffic. Migration plan in the next section.

```
/                              Homepage
/bowling/                      Bowling — lanes, pricing, reservations  [EXISTING]
/vip-suite/                    The VIP suite — premium positioning      [EXISTING]
/craft-bar/                    Bar / craft cocktails                   [EXISTING — keep this slug, ranks]
/self-serve-tap-wall/          28-tap beer & wine wall                 [EXISTING]
/dining/ or /menu/             Food menu                               [NEW — major gap, prioritize]
/arcade/                       Arcade — rename from /game/             [RENAME from /game/, redirect]
/corporate-parties/            Corporate events & team building        [EXISTING]
/birthday-parties/             Adult birthday parties                  [RENAME from /birthday-parties-booking/, redirect]
/fundraiser/                   Fundraiser hosting                      [EXISTING]
/special-events/               Hub for events not covered elsewhere    [EXISTING]
/leagues/                      Bowling leagues                         [EXISTING]
/rewards/                      Loyalty / rewards program               [EXISTING]
/faqs/                         FAQ                                     [EXISTING]
/contact-us/                   Hours, directions, parking              [EXISTING]
/why-us/[city]-il/             Service area pages                      [EXISTING — keep structure, ranks]
/blog/                         Content hub                             [EXISTING]
```

The current site has several existing pages we should consider consolidating or removing on the new build (a number of them are former blog posts sitting on the root rather than under `/blog/`):

- `/event-directory/` and `/upcoming-events/` — overlap. Pick one, redirect the other.
- `/event-spaces-for-teams-corporate-private-event.../`, `/group-and-company-events-twisted-pin/`, `/experience-the-ultimate-group-event-destination.../`, `/event-venues-with-a-twist-why-twisted-pin-is-y.../` — all overlap with `/corporate-parties/` and `/special-events/`. Consolidate into 1–2 pages, redirect the rest.
- `/16378-2/` — junk URL. Redirect to `/special-events/`.
- Old promotional posts (`/free-10/`, `/summer-pin-pass-is-here-lets-roll/`, `/twisted-pin-2024-bowling-league-season-free-beer/`, NYE 2025 pages, etc.) — should live under `/blog/` going forward. Redirect old ones to current equivalents.

### URL Migration & 301 Redirects

When the new site launches, every old URL that has any backlinks, traffic, or ranking position needs to either (a) keep its slug or (b) redirect 301 to its new equivalent. **No exceptions.** Killing a ranking URL without a redirect drops us from the search results immediately.

Before launch:
- Export every URL from the existing sitemaps (`/post-sitemap.xml`, `/page-sitemap.xml`, `/ajde_events-sitemap.xml`).
- Map each one to its destination on the new site.
- Implement 301 redirects in `.htaccess` / server config — not meta refresh, not 302.
- After launch, monitor Google Search Console for crawl errors weekly for the first 60 days.

### H1 Suggestions

- **Homepage:** *"Premium Bowling, Elevated Dining & Craft Cocktails in Plainfield, IL"* (covers bowling, dining, bar, location — replaces the misleading "Ultimate Dining Destination")
- **Bowling:** *"Bowling in Plainfield, IL — 23 Lanes Including a 6-Lane VIP Suite"* (17 traditional + 6 VIP)
- **VIP Suite:** *"The VIP Suite — Bowling for Groups Up to 80, Near Naperville & Bolingbrook"*
- **Dining:** *"Chef-Inspired Food in Plainfield — Eat at Twisted Pin"*
- **Bar:** *"Craft Cocktails & a 28-Tap Self-Serve Beer Wall"*
- **Arcade:** *"State-of-the-Art Arcade in Plainfield"*
- **Corporate Events:** *"Corporate Event Venue Near Naperville & Bolingbrook"*
- **Birthday Parties:** *"Adult Birthday Party Venue in Plainfield"*
- **Fundraisers:** *"Fundraiser Venue in Plainfield — Host Your Next One at Twisted Pin"*

---

## Service Area Pages (Important for Local SEO)

Naperville is our #1 paid market (21.6% of clicks) but we have near-zero organic presence there. Service area pages signal local relevance to Google for surrounding cities.

Each page should be **200–300+ words of unique content** — never duplicates with city names swapped. Include:
- Distance & drive directions from that city
- Mention of major local employers / landmarks (e.g., "5 minutes from Nokia and Edward-Elmhurst" for Naperville)
- A unique angle: *"Why Naperville companies book the VIP suite"* / *"The closest premium bowling to Bolingbrook"*
- Embedded map and clear CTA
- Photos

**Priority order:**
1. Naperville (biggest gap)
2. Shorewood (best ad efficiency, near-zero social presence)
3. Oswego (under-penetrated)
4. Bolingbrook
5. Romeoville
6. Joliet (corporate-only angle — lead with VIP suite for the I-80 logistics corridor)

These also replace the messy footer city links the brand report flagged.

---

## On-Page SEO Essentials

### Every page needs

- **Unique `<title>`** — under 60 chars including the brand suffix. Budget for `" | Twisted Pin"` (15 chars) — that leaves ~45 chars for the actual title. The current site has 12 pages with titles over 70 chars; many got there by appending the brand to an already-long phrase. Don't repeat that.
- **Unique meta description** — 140–155 chars, include keyword, include a CTA verb (Reserve, Book, Plan). The current site has 5 pages sharing the exact same meta description (*"Upscale bowling, craft cocktails, inspired menu & catered events in Plainfield, IL"*) — every page must have its own.
- **Exactly one H1 per page.** The current `/bowling/` page has **21 H1 tags** — that's a CMS template problem and it tanks ranking. The new build's component library must enforce one H1, period. Other headings cascade as H2/H3.
- **Descriptive alt text on every image.** The current site has 60 pages with at least one image missing alt text — the homepage alone has 13. Build alt text into the image-upload workflow so it's not optional. *"6-lane VIP bowling suite at Twisted Pin Plainfield"* — not *"image1.jpg"* and not blank.
- **Internal links** — every page should link to 2–3 related pages with descriptive anchor text (not "click here"). The current site's audit found near-zero internal linking detected — the new build should have a deliberate internal link strategy (related-pages component, breadcrumbs, contextual in-body links).
- **Mobile-first** — most visitors are on a phone. Design and test mobile before desktop.

### Schema markup (JSON-LD in `<head>`)

- `LocalBusiness` (or `BowlingAlley`) on every page — NAP, hours, geo coordinates, sameAs links to social
- `Restaurant` on the dining page
- `Bar` on the bar/cocktails page
- `Event` for recurring programming (league nights, themed events)
- `AggregateRating` to surface the 4.5★ Google rating in search results
- `FAQPage` on the FAQ section
- `BreadcrumbList` for nav

### NAP consistency

Name, Address, Phone must match **exactly** across the site, GBP, Yelp, Apple Maps, Facebook, and every directory. *"Rd"* vs *"Road"* matters.

```
Twisted Pin
15610 S Joliet Rd
Plainfield, IL 60544
815-782-7790
```

---

## Copy Guidance for SEO

The voice rules in `brand and voice.md` are the law. SEO doesn't override voice — it informs **what topics each page covers** and **what natural phrasing the page should include**.

### Do

- **Use the keyword naturally in the first 100 words.** Not stuffed — just present.
- **Write for the search intent.** Someone searching `corporate event venue near me` wants to know capacity, packages, and how to book — not a brand story. Lead with what they came for, then layer in the brand voice.
- **Include city names naturally.** "5 minutes from Naperville" beats "naperville naperville naperville" repeated.
- **Use H2s as questions** when the topic matches voice search: *"Can I take over the VIP suite for a corporate event?"*, *"How many lanes does the VIP suite have?"* — these capture featured snippets. (Note: avoid "private" per voice.md — the venue has no fully-private space.)
- **Use specific numbers.** *"17 lanes,"* *"6-lane VIP suite,"* *"28 self-serve taps,"* *"groups up to 200."* Specifics convert and rank better than adjectives.
- **Write a real FAQ section.** Pull from actual GBP Q&A, lead form questions, and front-of-house common questions. Wrap in FAQ schema.

### Don't

- **Don't keyword-stuff.** *"Bowling Plainfield bowling alley Plainfield bowling lanes Plainfield bowling…"* gets penalized and reads like garbage.
- **Don't write thin pages.** Each landing page needs 300–500+ words of unique content. Photos are not a substitute for text.
- **Don't duplicate content across service area pages.** Google ignores duplicates.
- **Don't hide keywords in tiny text or off-screen.** Cloaking penalty.
- **Don't write headlines that bury the offer** — like the current *"Your Ultimate Dining Destination"* hiding the bowling, arcade, and VIP from search engines and visitors alike.

### Avoid these phrases for SEO + voice reasons

- "Cheap," "discount," "deals," "value" — wrong customer, wrong positioning, attracts price-shoppers
- "Family-friendly fun" — collides with adults-first positioning *and* doesn't rank for the queries that pay
- "Bowling alley" as the lead noun — we're an entertainment destination; use it for SEO where it's the search term, but don't lead the brand with it

### Power phrases that pull double duty (SEO + voice)

These work because they include search-friendly nouns while staying on-brand:

- *"Premium bowling in Plainfield"*
- *"Craft cocktails and a 28-tap self-serve beer wall"*
- *"Corporate event venue near Naperville"*
- *"Adult birthday parties — done right"*
- *"VIP bowling suite — the only one in the area"*
- *"Chef-inspired food, not bowling alley food"*

### Concrete specs to use (these convert and rank)

Specifics beat adjectives. These are real, verifiable details — use them in copy, alt text, FAQs, and schema:

- **Bowling:** 23 total lanes — 17 traditional + a 6-lane VIP suite
- **VIP Suite:** 6 lanes, giant LED video wall, AV hookups, 28-tap beer wall access, couch seating, **groups up to 80**
- **Tap Wall:** 28 self-serve taps, beer & wine, pay by the ounce — **the only self-serve tap wall in the immediate area**
- **Bar:** Craft cocktails developed by **mixologist Brian Van Flandern** (real differentiator — top-tier mixology pedigree)
- **Arcade:** VR, pinball, ticket games & redemption prizes
- **Fundraisers:** **50% of bowling & shoe revenue** back to the host organization. Schools, churches, community groups. Thursday nights 5–9pm.
- **Reviews:** 4.5★ on Google (1,000+ reviews), 4.2★ on Yelp
- **Location:** Plainfield, IL — 5–8 minutes from Naperville, Bolingbrook, Romeoville, Shorewood

---

## Negative Keywords (Don't Target / Don't Mention)

These words attract the wrong customer or imply services we don't offer. Avoid in copy, alt text, and meta descriptions:

- `cheap`, `free`, `discount` (modifiers on bowling)
- `escape room`, `laser tag`, `mini golf`, `go karts`, `axe throwing`, `roller skating` — we don't have these
- `karaoke` — unless we explicitly run karaoke nights
- `duckpin bowling` — we don't have duckpin
- `casino`, `strip club`, `adult entertainment` — wrong intent entirely

---

## Blog / Content Strategy (Local SEO Driver)

The blog isn't for brand storytelling — it's a search-traffic engine. Each post should target a specific local query.

**First wave to build (in priority order):**

1. *"Best Things to Do in Plainfield, IL"* — 281 monthly GBP searches for "things to do plainfield"
2. *"Where to Host a Corporate Event Near Naperville"* — captures corp planners
3. *"The Best Date Night Spots in Plainfield"* — date night couples segment
4. *"How to Plan an Adult Birthday Party (Without It Sucking)"* — celebration hosts
5. *"Why We're Not Your Average Bowling Alley"* — brand differentiation, captures `luxury bowling` queries
6. *"Best Craft Cocktails in Plainfield & Naperville"* — bar positioning
7. *"What Makes a Great Fundraiser Venue"* — fundraiser-specific intent

Each post: 800–1,500 words, real photos, internal links to relevant landing pages, FAQ section at the bottom.

---

## Page Speed & Core Web Vitals (Build Targets)

These targets are non-negotiable for the new build:

| Metric | Current (mobile) | Target |
|---|---|---|
| Performance score | 53 | **85+** |
| Largest Contentful Paint | 25.7s | **< 2.5s** |
| First Contentful Paint | 5.6s | **< 1.8s** |
| Time to Interactive | 28.0s | **< 3.8s** |
| Cumulative Layout Shift | 0.018 | < 0.1 |
| Accessibility | 76 | **90+** |
| SEO score | 77 | **90+** |

**How we hit them:**
- Compressed, lazy-loaded WebP/AVIF images
- Defer non-critical JS, ship critical CSS inline
- CDN for static assets
- No render-blocking third-party scripts above the fold
- Font subsetting / `font-display: swap`
- Server compression (brotli/gzip) and HTTP/2

If we can't ship at < 3s mobile LCP, we have a worse SEO problem than the old site.

---

## Don't Repeat These Mistakes from the Current Site

A April 2026 SiteGuru audit scored the current site at 73% health. The biggest issues — all of which the new build should fix structurally so they can't come back:

| Issue | Current state | Fix in new build |
|---|---|---|
| Multiple H1 tags per page | 11 pages have multiple H1s; `/bowling/` has 21 H1s | Enforce one H1 in the component library. Other headings cascade to H2/H3 automatically. |
| Missing H1 entirely | 2 pages (`/free-kids-bowling/`, `/event-directory/`) | Page templates require H1 — empty state should fail validation. |
| Long page titles | 12 pages over 70 chars (some 80–100+) | Title field has a 60-char counter in the CMS. Auto-append `" | Twisted Pin"` only if total stays under 60. |
| Duplicate meta descriptions | 5 pages share the same description | Unique meta description required per page; CMS validation prevents duplicates. |
| Short / placeholder meta | `/event-directory/` says only "Events » Twisted Pin" (20 chars) | Min length 120 chars, max 170. CMS warns if outside the band. |
| Missing alt text | All 60 pages have at least one image missing alt text | Alt text is a required field on image upload. No alt = no save. |
| Near-zero internal linking | Tool detected 0 internal links across all 60 pages | Build a related-pages component + breadcrumbs into every template; encourage contextual in-body links during content writing. |
| Page speed | 23 pages "needs improvement," 1 "slow" (49). Mobile LCP 25.7s on homepage. | See Page Speed targets above. Non-negotiable. |
| Junk URLs in sitemap | `/16378-2/`, duplicate `/summer-pin-pass-is-here-lets-roll-2/`, etc. | Audit and prune; redirect 301 to relevant live pages. |

The audit also confirmed several things working well that the new site should preserve:
- All canonicals self-reference correctly (no canonical issues)
- All 60 pages have OpenGraph tags
- robots.txt, SSL, favicon, www redirect, and 404 headers all set up correctly
- No broken links detected
- No internal redirect chains

---

## Quick SEO Checklist (Before Any Page Ships)

- [ ] Unique `<title>` under 60 chars, keyword first, brand last
- [ ] Unique meta description, 140–155 chars, with CTA verb
- [ ] Single H1 with primary keyword
- [ ] Primary keyword in first 100 words, naturally
- [ ] 300+ words of unique content (more for landing pages)
- [ ] All images: descriptive alt text, WebP/AVIF, lazy loaded
- [ ] LocalBusiness (or relevant) schema present
- [ ] NAP matches exactly: `15610 S Joliet Rd, Plainfield, IL 60544`
- [ ] Internal links to 2–3 related pages with descriptive anchor text
- [ ] Mobile LCP under 2.5s
- [ ] No "cheap," "family-friendly," or off-brand words
- [ ] CTA visible in the first viewport
- [ ] FAQ block where relevant, wrapped in FAQ schema

---

## Reference: Where the Customer Actually Is

Quick context for design and content decisions — full detail in `TWISTED PIN local MR.txt`.

- **Audience:** Women 28–45, $100k+ HH income, often the planner of the group. Books in advance. Researches on Google + Instagram.
- **Top paid markets:** Naperville (21.6%), Bolingbrook (13.1%), Shorewood (12.6%), Romeoville (10.7%), Oswego (7%), Plainfield (4.9%).
- **Device:** 90.4% mobile. Build mobile-first or fail.
- **Peak search/click hours:** 4pm–8pm, with Saturday 6–7pm the single busiest hour. 54% of clicks happen 9am–4pm — people plan from work.
- **Lead source mix:** 32% Google search, 34% repeat customer, 10% Instagram, 7% word of mouth.
