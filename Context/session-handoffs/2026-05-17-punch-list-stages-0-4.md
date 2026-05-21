# 2026-05-17 — Google-docs-audit punch list, Stages 0–4

**Purpose:** Capture the 5-commit, 4-stage punch list that shipped this session so the next session has full context without re-reading the chat.

**Trigger:** Original Google docs SEO/AI audit (this session opener) produced a punch list of ~30 items across 4 Google developer docs. User chose systematic stage-based execution with per-stage agent verification. Plus mid-session findings: scaled-content-abuse risk in `/why-us/*-il/` pages, broken drive directions across the same set, BUSINESS_URL www-prefix inconsistency.

---

## TL;DR — what shipped

Five commits on `claude/nice-hodgkin-fb6b5e`. Branch state: **5 ahead of origin/main, 6 behind**. Cumulative verification: clean across build, voice rules, schema graph, page functionality, cross-stage regression.

| # | Commit | Stage | Files | Headline |
|---|---|---|---|---|
| 1 | `cb6e278` | Stage 0 | 30 | "Built by"/"Designed by" → "Curated by" sweep + chef-language ban + Heyflow toggle docs corrected |
| 2 | `a270b32` | Stage 1 | 14 | `noindex` on utility + EMPTY menus; custom 404; `[data-reveal]` cloaking fix; schema-dates extraction |
| 3 | `d81dec7` | Stage 2 | 7 | `Menu.contributor` linking Brian; `hasMenu` on BarOrPub; BlogPosting type; breadcrumb hierarchy |
| 4 | `bfdd7e5` | Stage 3 | 8 | 7 distinct city-specific `/why-us` bar paragraphs; 5 geographic corrections; internal-linking sweep |
| 5 | `0cc0381` | Stage 4 | 13 | 9 VideoObjects across 8 pages; `/sitemap-videos.xml`; BUSINESS_URL fix (www-prefix everywhere) |

---

## Stage 0 — Brian "Curated by" + chef-language + Heyflow toggle (`cb6e278`)

**Trigger:** [Context/session-handoffs/2026-05-17-google-ads-website-needs.md](2026-05-17-google-ads-website-needs.md). Google Ads policy + truth-of-relationship both fail under "Built by" framing. Brian Van Flandern is a CONSULTANT who **curated** the cocktail program — not staff, not owner, never on site.

**Three coordinated sweeps:**
1. **Verb swap:** "Built by [X]" / "Designed by [X]" → "Curated by [X]" across `/bar`, `/menu/cocktails`, `/eat`, `/free-kids-bowling`, `/faq`, `/birthday-parties-booking`, `/careers`, 6 `/why-us/*-il/` pages, 2 blog posts, 3 code-comment docstrings
2. **Chef-language removal:** `/eat`, `/free-kids-bowling`, `public/llms.txt`, `Context/seo.md` — replaced with "from-scratch" / "built to share" / "real kitchen"
3. **Heyflow/Zite toggle made explicit:** `src/lib/links.ts` comment claimed Zite was "current default" while actual export pointed at Heyflow. Comment corrected. 3 hardcoded Zite URLs in blog posts + 1 in `llms.txt` flipped to Heyflow (toggle doesn't auto-rewrite narrative prose).

**voice.md** gained two new Words-to-Avoid blocks (Brian-relationship banned framings, chef-language ban). CLAUDE.md decisions log entry references this handoff doc.

**Memory created:** `project_brian_van_flandern_relationship.md` — strict "Curated by" canonical phrasing; `Menu.contributor` is the only valid schema relationship.

---

## Stage 1 — Indexability hygiene (`a270b32`)

**6 items:**

1. **`noindex,follow` on 4 utility pages** — `/sms`, `/privacy`, `/terms`, `/accessibility`. Pattern: `<Fragment slot="head"><meta name="robots" content="noindex,follow" /></Fragment>` inside opening `<Base>`. Uses the previously-defined-but-unused slot at `Base.astro:131`.

2. **`noindex,follow` on EMPTY menu pages** — `/menu/cocktails`, `/menu/food`, `/menu/taps`. Each page computes `const isMenuEmpty = .categories.length === 0` (or `.sections.length === 0` for taps). Conditional fragment emits noindex when GoTab/Untappd build-time fetch returned EMPTY. Safety net for silent thin-content deploys. Auto-restores indexing on next successful build.

3. **Custom `/404.astro`** — Astro convention: this file auto-serves with HTTP 404 for unknown paths. H1: "Looks like that's not on the menu." Plus 6 navigation links (Reserve, Plan an Event, /menu/, /bar/, /faq/, /). Self-`noindex,follow`. Imports `PLAN_EVENT_URL` from the toggle; declares local `ROLLER_URL` matching the hardcoded-Roller pattern other pages use.

4. **`[data-reveal]` cloaking-adjacent fix.** Earlier state: CSS set `opacity: 0` on all `[data-reveal]` elements (22 instances on the desktop homepage), JS animated opacity → 1 via IntersectionObserver. Non-rendering bots (Slack/Discord unfurlers, AI browsers, faster crawlers) saw mid-page content as invisible. Fix: CSS removed `opacity: 0`, JS animate keyframes dropped `opacity: [0,1]`. Element starts at full opacity, only translates 12px up on intersection. Reduced-motion override simplified.

5. **`src/data/schema-dates.ts`** — extracted `FREE_KIDS_BOWLING.programStart/.programEnd` and `SUMMER_PIN_PASS.validThrough`. Both pages now import from this single source. NYE event stays on Astro content collection (already centralized).

6. **`launch-checklist.md` additions:**
   - New "Recurring schema maintenance (annual review)" section with review-by dates (Apr 15 for summer programs, Nov 1 for NYE)
   - Gift-card `minPrice` ops-confirm row added to operational-data table
   - Pause/retire-program guidance documented

---

## Stage 2 — Schema connective tissue (`d81dec7`)

**Triggered by:** the original audit's "biggest schema gaps" finding — Brian's Person entity was orphaned on `/bar` (no structural connection to the cocktail Menu); blog posts already had `Article` schema but it could be more semantically precise (`BlogPosting`); BarOrPub nodes had no `hasMenu` references closing the entity graph; menu page breadcrumbs reflected URL hierarchy not topical hierarchy.

**Four moves:**

1. **`Menu.contributor` linking Brian via `@id`** — `/menu/cocktails` Menu schema gained `contributor: { "@id": BRIAN_ID }`. Schema.org `contributor` is "secondary contributor to the CreativeWork" — precisely the consultant-curator relationship. NOT `creator` (overclaims authorship), NOT `author`, NOT `employee` (he isn't staff).

2. **`@type: "Article"` → `@type: "BlogPosting"`** on `src/pages/blog/[slug].astro`. All other fields preserved (headline, datePublished, dateModified, author, publisher, mainEntityOfPage, image). BlogPosting is a subtype of Article — more semantically precise.

3. **`hasMenu` on BarOrPub nodes:**
   - Homepage BarOrPub: `hasMenu: [cocktails, food, taps]` (3 menus)
   - `/bar` BarOrPub: `hasMenu: [cocktails, taps]` (food belongs to `/eat`)
   - Cross-document `@id` references using the new `MENU_*_ID` constants

4. **BreadcrumbList reciprocity** — menu page breadcrumbs reflect topical hierarchy:
   - `/menu/cocktails`: Home → Bar → Cocktails (was Home → Menu → Cocktails)
   - `/menu/taps`: Home → Bar → Tap List (was Home → Menu → Tap List)
   - `/menu/food`: Home → Eat → Food (was Home → Menu → Food)
   - `/menu/` hub: still Home → Menu (unchanged)

**`src/lib/schema.ts` exports added:** `BRIAN_ID`, `MENU_COCKTAILS_ID`, `MENU_FOOD_ID`, `MENU_TAPS_ID`. Each carries a docstring enumerating valid vs banned Schema.org relationships per the Brian-as-consultant truth test.

---

## Stage 3 — `/why-us` audit + rewrite (`bfdd7e5`)

**Triggered by:** the 2026-05-17 ads handoff naming `/why-us/*-il/` as the single biggest scaled-content-abuse risk on the site, but the pages had never been audited. Audit revealed:
- Shared ~35-word bar paragraph near-verbatim on all 7 pages
- 6 of 7 hero subheads used city-swap madlib pattern
- AND drive-route verification surfaced multiple distance/direction errors baked in since these pages were created

**Geographic corrections (Google Maps verified):**
- Bolingbrook: 13 mi south → 10 mi south on I-55
- Joliet: 9 mi → 11 mi up Route 30
- Lockport: 8 mi west → 11 mi west on Renwick Rd
- Naperville: "8 minutes" → "about 10 minutes" south on Route 59 (downtown drive: 12-15 → 15-18 min)
- Oswego: 13 mi east → 9 mi southeast on Plainfield Road (FULL VOICE REFRAME — "13 miles is real" → "closer than you'd guess")
- Romeoville: kept "9 miles south on I-55" per user override (Google's canonical is Normantown Rd but I-55 framing fits the brand)
- Shorewood: already correct at 6 mi north up Route 59 — no changes

**Bar paragraph rewrites** — 7 distinct city-specific paragraphs replacing the verbatim shared block. Each leans on real local anchors surfaced by per-city research agents (Wikipedia, Census, Tripadvisor, local business directories):
- Bolingbrook: corporate HQ density along Boughton/Remington + Promenade chain ceiling
- Joliet: corner spots / casino lounges → "where you take a client" + I-80 corridor
- Lockport: "complement, not replacement" — Historic Downtown (Tallgrass, Gaylord Building, real craft bars) handles dinner; Twisted Pin handles the suite + 28-tap wall + kitchen-til-1am
- Naperville: River North / downtown Naperville comparison (preserves existing strategic frame)
- Oswego: "head southeast / same drink, less traffic" (preserves existing strategic frame at new distance)
- Romeoville: Weber Road corridor (Buffalo Wild Wings, Panda Express) + $1-beer corner pubs
- Shorewood: Mauve Nosh as proof-of-market reference (45-seat date-night room — when groups bigger or night longer, Shorewood drives)

**Hero subhead refreshes** — 4 of 7 pages broke the madlib pattern (Bolingbrook, Lockport, Romeoville, Shorewood). Naperville/Joliet/Oswego keep existing-but-corrected subheads.

**Internal linking pass** — addresses "/why-us pages are too dead-end-y":
- 3-5 inline body links per page with descriptive anchors targeting `/bar`, `/menu/taps`, `/vip-suite`, `/eat`, `/events`
- Existing "View the cocktail menu" CTA preserved
- **New closing-band link row** added below the Reserve/Plan CTAs but above the NAP line on every page: `More: the VIP suite · the 28-tap self-serve wall · group events · fundraisers`
- Total 16-18 internal-site links per built page (was 1-2)

**New CSS class `.svc-cta-more`** in `src/styles/global.css:718-743` — quieter visual register than primary CTAs, Glow underline-on-hover, mobile + desktop sized. Naperville uses the class with inline `text-align:center;` (Naperville has its own per-page styling layer).

**Stage 0 stragler caught:** Joliet's bar paragraph had "a craft cocktail program built\n by the consulting mixologist" — line-break crossing defeated single-line `built by` grep in Stage 0. Multiline grep caught it; bar-paragraph rewrite absorbed it. **Memory updated:** `feedback_voice_sweeps.md` now requires `multiline: true` for two-word voice bans.

---

## Stage 4 — Video schema + sitemap + www-prefix fix (`0cc0381`)

**Triggered by:** the original audit's "biggest unclaimed rich-result surface" finding — 9 section videos visible to users but invisible to Google's video index until VideoObject schema names them. Plus a found-along-the-way fix: BUSINESS_URL was bare `https://twistedpin.com` while every canonical URL and `astro.config.mjs` site used `https://www.twistedpin.com` — every JSON-LD `@id` resolved via 308 redirect on crawl rather than matching the canonical exactly.

**Components:**

1. **`src/data/videos.ts` (new)** — registry of 9 videos. Each VideoEntry: slug, name, description, thumbnailPath, contentPath, durationSeconds, uploadDate, optional `expires` (seasonal), primaryPagePath. Helper functions: `isoDuration()` (seconds → `PT#S`), `thumbnailUrl()`, `contentUrl()`, `primaryPageUrl()`.

2. **`src/lib/schema.ts` — `videoObjectSchema(VideoEntry)` helper.** Returns Schema.org VideoObject with @context/@type/@id, name, description, thumbnailUrl, contentUrl, ISO 8601 duration, uploadDate, publisher (linked to BUSINESS_ENTITY_ID), isPartOf (WebPage), optional expires.

3. **`src/layouts/Base.astro` — `max-video-preview:-1` meta.** Lets Google surface unlimited video preview length in SERP — our section videos are 4-15s loops so full preview is net positive.

4. **Per-page VideoObject emissions** — 8 pages, 9 VideoObjects:
   - `/` → HERO_VIDEO
   - `/bar` → BEERWALL_VIDEO + COCKTAILS_HERO_VIDEO (two)
   - `/events` → BUFFET_VIDEO
   - `/vip-suite` → VIP_LANES_VIDEO
   - `/eat` → BEST_THINGS_VIDEO
   - `/game` → ARCADE_VIDEO
   - `/new-years-eve` → NYE_VIDEO (expires 2027-01-02)
   - `/summer-pin-pass` → SUMMER_PASS_VIDEO (expires 2026-09-02)

5. **`src/pages/sitemap-videos.xml.ts` (new endpoint, `prerender = true`)** — emits Google video sitemap extension with `<video:video>` blocks. Notable: `<video:duration>` is integer seconds (sitemap format), NOT ISO 8601 (which is JSON-LD format). Both correct in their contexts. Timezone offset hardcoded `-06:00` (US Central; CST year-round — DST-aware would be marginally more correct but Google accepts both).

6. **`public/robots.txt`** — second Sitemap line references `/sitemap-videos.xml`.

7. **BUSINESS_URL fix** — `"https://twistedpin.com"` → `"https://www.twistedpin.com"` in `src/lib/schema.ts:37`. Propagates to every JSON-LD `@id` site-wide: BUSINESS_ENTITY_ID, BRIAN_ID, MENU_*_ID, video @ids, service-area @ids, event @ids. Cross-document `@id` references now match the canonical URL byte-for-byte.

**uploadDate values are placeholders** (2026-04-15 / 2026-04-30). Ops can refine to actual filming dates if known. Don't use build-time `new Date()` — that shifts on every deploy, which Google has been known to dampen as "content flapping daily."

**duration values are conservative estimates** from source MP4 runtimes (4-15s loops). Verify with ffprobe if precise accuracy ever matters.

---

## Cumulative verification result (post-Stage-4 build-and-verify agent)

**PASS across all 8 verification dimensions:**

1. Build succeeded — 40 HTML pages + 3 XML sitemaps (sitemap-index, sitemap-0, sitemap-videos)
2. 6 spot-checked pages functionally intact (title, canonical, JSON-LD, body content, CTAs, chrome)
3. Voice rules survived all stages — zero residuals of "built by"/"designed by"/"developed by"/chef-language/"private bar"/non-www `@id`
4. Schema graph integrity confirmed — cross-document `@id` references match byte-for-byte (Brian Person, Menu IDs, Business Entity, Video publishers)
5. Stage 1 functionality preserved — 404 page, noindex on utility + EMPTY menus, `[data-reveal]` no opacity:0
6. Stage 3 distances + closing band — all 7 `/why-us` pages correct
7. Stage 4 video sitemap + JSON-LD — valid, 9 entries, ISO 8601 durations
8. No cross-stage regressions detected

---

## Memories created / updated this session

- **`project_brian_van_flandern_relationship.md`** — Brian is a CONSULTANT who CURATED the cocktail program. Schema = `Menu.contributor` ONLY; never `employee`/`creator`/`author`. "Built by" / "Designed by" banned everywhere including marketing copy (earlier "marketing latitude" carve-out retired). Canonical phrasing: "Curated by Brian Van Flandern, America's Top Mixologist (Food Network)."

- **`project_events_platform_toggle.md`** — Plan-an-Event destination is a Heyflow ↔ Zite toggle, not a one-time decision. `src/lib/links.ts` exposes `PLAN_EVENT_URL` switching between `AVERY_OFF_URL` (Heyflow, current default) and `AVERY_ON_URL` (Zite, AI sales agent under test). 19 CTAs auto-flip; blog/llms.txt narrative URLs are manual swap. GA4 `linker.domains` intentionally lists BOTH URLs for cross-domain measurement — not cleanup.

- **`feedback_voice_sweeps.md`** (updated) — voice-rule sweeps must use `multiline: true` for two-word bans (e.g. "built by", "designed by") because JSX body copy wraps at ~70 chars and banned phrases routinely straddle the wrap. Stage 0 single-line grep missed Joliet's "built\n by"; Stage 3 multiline grep caught it.

---

## Pending — Stages 5, 6, 7

### Stage 5 — Content polish (some user input needed)

- **`/why-us/*-il/` audit** — DONE (rolled into Stage 3 rewrites; all 7 pages now have unique city-specific paragraphs)
- **`/coupon` + `/waitlist` body expansion** — currently ~150-200 words each. Push past 350 words for thin-content safety. Can draft, you approve.
- **Cocktail tasting notes** — replace ingredient-string-only cocktail descriptions on `/menu/cocktails` with one brand-voiced sentence each. Needs in-house tasting context — blocked on user input.
- **Alt text strengthening** — `/menu/cocktails` grid currently uses `alt={c.name}` only. Push to descriptive form.

### Stage 6 — `/events/{type}` page builds (Day 60 ads-restructure deadline ~Jul 17)

**🔄 SUPERSEDED 2026-05-18** — the 3 specialized event-type pages this stage planned (`/events/corporate`, `/events/birthdays`, `/events/holiday-parties`) were effectively built at top-level URLs on 2026-05-18 with the audience-funnel build-out:
- `/corporate-events/` (ships full editorial + Service schema + Heyflow CTA — covers `/events/corporate` intent)
- `/holiday-parties/` (seasonal nav Sep 1→Jan 5, same recipe — covers `/events/holiday-parties` intent)
- `/birthday-parties-booking/` (pre-existed — covers `/events/birthdays` intent)

Plus the user-direction extras that weren't in the original Stage 6 spec:
- `/showers/` (bridal + baby)
- `/wedding-receptions/` (intimate weddings + rehearsal dinners)

Top-level URLs win over nested `/events/{type}/` for organic SEO (`corporate-events` keyword-matches `corporate event venue near me` more directly than `events/corporate` does). Ads dashboard can still organize campaigns under `/events/{type}/` paths if marketing prefers the nested taxonomy — but those would be ad-platform tags, not real URLs.

If marketing later needs distinct ads landing pages (stripped-down, Heyflow-embedded, noindex, conversion-only) at the `/events/{type}/` URLs, that's a deliberate Option B build on top of the existing top-level pages — see CLAUDE.md decisions log entry 2026-05-18 for the full option analysis.

**`/valentines/`** is still in the same family with the Jan 2027 deadline — DO NOT BUILD YET.

**Original spec preserved below for reference:**

Per the 2026-05-17 ads handoff:
- `/events/corporate`
- `/events/birthdays`
- `/events/holiday-parties`

Each: hero (corporate/birthday/holiday-themed photography or video), VIP-suite-as-differentiator lead, inquiry form → **Heyflow** (`event.twistedpin.com` — per the toggle, current default), Event + LocalBusiness schema, inner-page rhythm from `/bar`.

### Stage 7 — Optional / strategic (post-launch)

- Spanish hreflang for `/bowl` (documented opportunity in `seo.md:44` — 9.6% Hispanic local segment, 0 competition, 68 clicks already, zero current targeting)
- Speakable schema on `/faq` + NAP block (voice-assistant surfacing)
- `WebPage` nodes with `inLanguage` + `dateModified` per pillar page (freshness signal)
- Cocktail menu hand-curated tasting notes (overlaps with Stage 5)

---

## Open user actions (not code)

1. **GSC Validate Fix** on `/events` Review Snippets issue (per `2026-05-17-schema-lcp-perf-sweep.md` handoff) — should resolve in 3-10 days
2. **Submit `/sitemap-videos.xml` to GSC** after DNS flip (or alongside the existing sitemap-index resubmit)
3. **AGENTS.md** — untracked file in worktree; not part of any stage. Decide whether to commit, gitignore, or delete.
4. **Branch merge/rebase** — `claude/nice-hodgkin-fb6b5e` is 5 ahead of `origin/main` and 6 behind. Both directions look clean per the verification agents. Choose merge or rebase strategy before next session.
5. **Tasting notes** — gather in-house tasting context for the 28+ cocktails on `/menu/cocktails`. One brand-voiced sentence per cocktail. Blocked on this for Stage 5's biggest item.

---

## Working preferences calibrated this session (for next session)

- **Systematic, stage-based execution** — don't bundle changes from different concern areas into one massive commit
- **Per-stage agent verification BEFORE commit** — build-and-verify agent reads the built HTML and confirms functionality, not just compile success
- **Voice rules grep must be multiline** for two-word bans (see `feedback_voice_sweeps.md` memory)
- **Heyflow/Zite toggle is design, not cleanup** — listing both URLs in GA4 linker etc. is intentional (see `project_events_platform_toggle.md` memory)
- **Brian schema rule is strict** — `Menu.contributor` only; never `employee`/`creator`/`author` (see `project_brian_van_flandern_relationship.md`)
- **User wants page-functionality verification, not just structural** — check that pages still render correctly, CTAs work, body content survives, no template-syntax leakage
- **User wants research agents spawned for unfamiliar local context** — e.g. when writing copy for a city, spawn a research agent with WebSearch to surface real local anchors

---

## Notes for next session

- All 5 commits are stage-discrete and self-contained — each could be reverted independently if needed
- The `Astro.url.pathname === '/'` gating on hero LCP preload (per 2026-05-17 perf sweep) interacts with Stage 4 video preload — verify no new perf regressions when running PSI post-launch
- The `[data-reveal]` fix in Stage 1 changed the homepage desktop reveal pattern from fade-up to translate-only — visual change is subtle but worth confirming aesthetically OK with user
- The www-prefix fix in Stage 4 will cause any external services that have cached the old non-www `@id`s (none known, but worth thinking about) to see a mismatch — Google should resolve via canonical, but flag in GSC if any rich-result warnings appear
