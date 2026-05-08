# Twisted Pin — Session Handoff (2026-05-08, schema rebuild + LCP fixes + /fundraisers)

Paste this verbatim as the first message of the next chat. Read `CLAUDE.md` (especially the Decisions Log), `Context/voice.md`, `Context/launch-checklist.md`, `Context/session-handoffs/2026-05-07-photos-videos-gap-fixes.md` (prior session), and this handoff before doing any work.

---

## TL;DR

Big day. Shipped the **page-by-page schema rebuild** (5 chunks — the #1 recommendation from the SEO research file), fixed the **hero LCP** properly (and discovered Motion 12's `animate()` silently no-ops transforms in this repo as a bonus diagnosis), shipped **AggregateRating** (Google 4.5★ / 1,141 reviews now firing on every LocalBusiness-subtype page), corrected a **fundraiser misstatement** that was implying VIP-suite fundraisers happen (they don't), built a dedicated **`/fundraisers/`** page with the accurate 50%-of-bowling/shoe/arcade mechanics, and shipped a **lazy-load fix** for hero/poster bytes on Slow 4G mobile.

29 files changed, 1346 insertions. Single commit `f59ae90` pushed to main.

The biggest **operational discovery** of the session: **PSI scores on this page are unreliable** (TBT swung 0ms → 1,870ms across two runs 17 minutes apart). GTmetrix shows the page is actually fast in real-world conditions (95% A, LCP 524ms, 1.1s fully loaded). Optimizing against synthetic Slow 4G PSI is chasing variance; optimizing against GTmetrix + real-user CrUX data is signal.

---

## What shipped this session

### 1. Schema rebuild (5 chunks)

`src/lib/schema.ts` (new) is the foundation:
- Canonical NAP constants, `addressNAP()`, `localBusinessBase()`, `openingHoursSpec()`, `formatHoursAnswer()`
- `BUSINESS_ENTITY_ID` (`https://twistedpin.com/#business`) — same `@id` across every LocalBusiness-subtype declaration so crawlers unify the venue
- Hours single-source-of-truth: live `getLiveHours()` (Google Places API) when env vars are set; falls back to static `src/data/hours.ts`. FAQ "What are your hours?" answer is derived from the same source — schema and FAQ display can no longer drift
- `AggregateRating` Google 4.5★ / 1,141 reviews baked in (Yelp 4.1/99 intentionally omitted — single-source per Schema.org; Yelp listing carries Yelp's own data)
- `hasMap` uses durable `place_id`-form URL (not `maps.app.goo.gl/*` which is on the FDL sunset list)

Page-by-page subtypes (each carries the canonical `@id`):
| Page | `@type` | Notes |
|---|---|---|
| `/` | `BarOrPub` | Bar-led thesis; not multi-type per push-back |
| `/bar` | `BarOrPub` + `Person` | Brian Van Flandern as separate Person entity. **NO `worksFor` / `employer` link** — he's a consulting partner, not staff. Co-occurrence on the page links the credential to the venue without an employment claim |
| `/eat` | `Restaurant` | `hasMenu: /menu/food/`, `servesCuisine: ["American"]` |
| `/bowl` | `BowlingAlley` | — |
| `/game` | `EntertainmentBusiness` | (`AmusementPark` would imply park-scale) |
| `/events` | `EventVenue` | — |
| `/vip-suite` | `EventVenue` | Distinct `@id: #vip-suite`, `containedInPlace: #business`, `maximumAttendeeCapacity: 80` |
| `/menu/cocktails` | `Menu` | `@id: #menu-cocktails`, MenuSection × N → MenuItem × N from GoTab |
| `/menu/food` | `Menu` | `@id: #menu-food`, MenuItem includes `suitableForDiet` mapping (vegan/vegetarian/GF/halal/kosher/low-fat/low-cal) from raw GoTab tags |
| `/menu/taps` | `Menu` | `@id: #menu-taps`, brewery + location + style in description (ABV intentionally NOT in description — Schema.org has no beer subtype, `nutrition.servingSize` is for pour size) |
| `/menu` | `BreadcrumbList` | Hub-only, no umbrella Menu (per push-back) |
| `/fundraisers` | `Service` | `@id: #fundraiser-program`, `provider: { "@id": "#business" }`, offer describes 50% return |
| `/faq` | `FAQPage` | (already shipped 2026-05-05; "What are your hours?" Q&A now derives from `formatHoursAnswer()`) |

### 2. Privatize fix (voice rule violation)

Homepage snap 2 was rendering *"Privatize the suite. Run the night your way."* — direct violation of the hard-banned `private*` root in voice.md. Swept across:
- `src/pages/index.astro:153` — subhead → *"Take over the suite. Run the night your way."*
- `src/pages/index.astro:226` — inline comment "VIP-leading + privatize aside" → "take-it-over aside"
- `voice.md:233` — locked-snap-2 row updated
- `voice.md:247` — snap-6 back-reference updated
- `voice.md:258` — bowl-variants rationale updated (third occurrence; sweep caught 3, not 1)

Memory captured: `feedback_voice_sweeps.md` — banned-word sweeps must grep across pages, components, voice.md, CLAUDE.md, and code comments — not just user-facing copy.

### 3. Hero entry motion (LCP fix + Motion 12 silent-fail discovery)

Started as: "remove `opacity: 0` from `.hero-fade` so text is visible from frame 1, keep transform-only slide as the entrance choreography."

Discovered: **Motion 12's `animate()` silently no-ops transforms in this repo.** Motion 12 composes transforms via CSS custom properties (`--motion-translate-y`, etc.) that collide with any direct `transform:` style. The original JS-driven hero entrance had been broken for an unknown amount of time — only "appeared to work" because `.hero-fade { opacity: 0 }` made the text invisible by default; users never saw the failed slide animation.

Fix:
- `.hero-fade` rule hoisted from 12 page files to `src/styles/global.css` (single source of truth)
- JS-driven slide replaced with pure CSS `@keyframes hero-slide-in` — browser-native, no JS dependency, LCP-safe, opacity stays 1 throughout
- Per-element stagger via `.hero-fade[data-delay-ms="N"]` selectors covering all 6 in-use values (0/120/280/300/320/380)
- `heroEntry()` deleted from `src/scripts/motion.client.ts`

Memory captured: `project_motion_silent_fail.md` — don't trust Motion 12's `animate()` for transforms in this repo without `getAnimations()` verification; default new motion to CSS `@keyframes`.

### 4. Fundraiser correctness sweep

User correction: fundraisers run on the **main floor only — NOT the VIP suite**, and the 50% includes **bowling + shoe + arcade** revenue (not just bowling). The site was claiming the VIP suite hosts fundraisers and citing only bowling. Both are public-facing claims that needed to be accurate.

- `/vip-suite`: removed all 5 fundraiser mentions (docstring, meta description, section H2, body paragraph, list item)
- `/events`: stat updated to *"50% of bowling, shoe, and arcade revenue back to your organization, Thursday nights 5–9pm"*
- `seo.md:209`: synced — now explicitly notes "main floor only — fundraisers do not run in the VIP suite"
- `launch-checklist.md`: closed the ops question; updated the `/fundraiser/` redirect plan

### 5. `/fundraisers/` page (new pillar)

User requested a dedicated page since the mechanics are operationally specific (Thursdays 5–9pm only, mention-the-fundraiser check-in, optional arcade promotion). Voice-tightened the user's source copy from twistedpin.com — dropped "FUN!" / "FUNdraisers" / all-caps section register. Three sections:

1. Hero (typography): *"Bowling makes a great fundraiser." / "50% of eligible bowling, shoe, and arcade sales — back to your cause."*
2. How It Works (image left, copy right): Thursdays 5–9pm, mention-the-fundraiser mechanic, 5-step list
3. Why Bowling (image right, copy left): all-ages, weather-proof, high-capacity, arcade promotion bonus
4. Closing CTA → Zite (Plan a fundraiser)

Wired in:
- NavDrawer Info section between Rewards and Gift Cards (`heart-handshake` Lucide icon added to `src/lib/icons.ts`)
- `vercel.json`: legacy `/fundraiser/` (singular) → `/fundraisers/` (plural canonical) — was previously redirecting to `/events/#fundraiser`
- `/events` cross-link: "Full fundraiser details →" added to fundraiser paragraph; list item "Fundraisers" became a link
- `Service` schema with `provider: { "@id": "#business" }` + `offers.description` carrying the 50% claim

### 6. AggregateRating

Google: 4.5★ / 1,141 reviews (confirmed by ops 2026-05-08). Wired into `localBusinessBase()` so it fires on every LocalBusiness-subtype page automatically. Verified live on /, /bar, /eat, /bowl, /game, /events.

Yelp: 4.1★ / 99 reviews — intentionally OMITTED from schema. Schema.org `aggregateRating` is single-source per entity; Google is the SERP-rich-result driver. Yelp's listing has its own schema on yelp.com.

Refresh cadence: annual or on major review-velocity change. Could wire live via Places API on the same env key as `google-hours.ts` if monthly drift becomes a problem.

### 7. Phone swap

`(815) 555-0100` placeholder → real `(815) 782-7790` in SnapFooter (display + `tel:` href). Was on the launch-checklist as a known placeholder.

### 8. Lazy-load fix (mobile bytes-on-paint)

PSI Slow 4G was punishing the page because the desktop hero video AND its 225KB poster were loading on mobile despite `display: none`. Snap section posters (~262KB combined) were also fetching eagerly because `<video poster=>` ignores the lazy gate even when the video uses `data-section-video`.

Fix:
- `motion.client.ts` `sectionVideo()` `promoteLazySources` now also promotes `data-poster` → `poster` on intersection
- Same logic mirrored in the per-page tap wall handler in `index.astro`
- 8 markup edits switching `poster=` → `data-poster=`: desktop hero, tap wall, 4 cluster videos (events/tap/cocktails/arcade), `/events` buffet, `/careers` hiring, `SnapStub.astro` generic
- Mobile hero poster (LCP-critical) kept eager — no change

Mobile Slow 4G savings on initial paint: ~250-500KB lighter, plus ~262KB deferred until scrolled into view.

---

## Performance: the real picture (read this before optimizing further)

Two PSI runs 17 min apart on the same page returned **Performance 83 then 56**, with TBT swinging **0ms → 1,870ms**. LCP was stable at 4.4s across both.

Then GTmetrix on the same URL: **95% A grade, LCP 524ms, fully loaded 1.1s, TBT 33ms.**

What this means:
- **Real users on real connections are having a fast experience.** GTmetrix measures real-world; PSI's Slow 4G + Moto G Power is a synthetic stress test.
- **PSI single-run scores are unreliable for this page.** Run-to-run variance dominates the signal.
- **Google uses CrUX (real-user) data for SEO ranking**, not Lighthouse synthetic. Real-world is what gets rewarded.
- **The headline LCP claim from the planning round was wrong.** The hero text wasn't the LCP element; the hero video poster was. CSS opacity fixes don't help when LCP is image-bound.

**Don't chase PSI.** Chase GTmetrix + CrUX. The 5.78MB page total in GTmetrix is mostly hero video (6.00MB across both desktop + mobile variants) — that's the real bottleneck if anyone wants to push perf further.

If a future chat wants to optimize PSI Mobile specifically, the targeted fixes are:
- `preload="none"` on hero videos instead of `preload="metadata"` (~1-2s LCP on Slow 4G)
- Inline the 8KB of render-blocking CSS (`SnapFooter.css` + `index.css`) — saves 730ms render-blocking
- Re-encode the tap wall video poster (currently 437KB, 184KB savings flagged)
- `Save-Data` / `prefers-reduced-data` detection to skip video on flagged connections

But the **real perf is fine** per GTmetrix. Don't over-optimize.

---

## Open threads (the carryforward list)

### Code work, queued for fresh chats

- **`<main>` landmark audit** (~30 min) — `Base.astro` doesn't wrap `<slot />` in `<main>`. Index gets one via its own `<main class="snap">`, but every other page (`/bar`, `/eat`, `/bowl`, `/game`, `/vip-suite`, `/events`, `/menu/*`, `/faq`, `/pricing`, `/fundraisers`, `/free-kids-bowling`, `/coupon`, `/waitlist`, `/leagues`, `/rewards`, `/upcoming-events`, `/new-years-eve`, `/gift-cards`, `/careers`, `/privacy`, `/terms`, `/accessibility`) ships without a `<main>` landmark. ~7 a11y points to 100. Cleanest path: per-page `<main>` wrap audit (don't add to Base because index already wraps its own).
- **Vitest schema parse-and-shape test** (~1h, before next big schema refactor) — guards against regressions like "someone refactors `localBusinessBase()` and silently breaks `@id` linkage on three pages." Hits each route, extracts JSON-LD, asserts valid JSON + expected `@type`/`@id`/canonical-id references. Won't catch Google-specific rich-result requirements (no API for that), but catches structural breakage.
- **Service area pages** — Naperville first per priority order (per `seo.md`'s service-area section). Naperville is the #1 paid market with near-zero organic. Shorewood / Oswego / Bolingbrook / Romeoville / Joliet (Joliet = corporate angle) follow.
- **Three evergreen blog posts** + content collection scaffold — *"Best things to do in Plainfield, IL,"* *"Where to host a corporate event near Naperville,"* *"The best date night spots in Plainfield."* Per `seo.md` blog priority list.

### Ops gates (waiting on user/ops, not code)

- NYE 2026 package details → `Event.offers` on `/new-years-eve` schema
- League nights schedule → `/leagues` `Event` schema with `eventSchedule.byDay`
- Real fundraiser-night photography (currently reusing `events-bg` and `stage-game`)
- Distinct VIP-suite photography (currently reusing `events-bg`)
- Counsel pass on `/privacy`, `/terms`, `/accessibility`

### Pre-launch micro-work

- SnapFooter live-hours refactor to use `getLiveHours()` (matches `/pricing`) — currently still hardcoded "until 11:00 PM" placeholder
- Vercel env vars to remove: `PATCH_API_KEY`, `PATCH_ACCOUNT_ID` (Patch was abandoned 2026-05-07)
- Sitemap site URL swap: `astro.config.mjs` Vercel staging → `https://www.twistedpin.com` before launch day
- DNS migration runbook execution (launch day) — full plan in `Context/dns-migration.md`

### Tech debt (post-launch)

- **`.pillar-*` CSS hoist** — `.bar-*` / `.eat-*` / `.vip-*` / `.events-*` / `.game-*` / `.bowl-*` / `.fundraiser-*` is now SEXTUPLED (rule of seven hit with `/fundraisers`). Hoist to `.pillar-*` utilities in `global.css`. Each page keeps only content-specific overrides.
- `Hero.astro` deletion (unused since `/snap-test/` was promoted)
- `CouponBanner.astro` deletion (retired component)
- Old single-video bash scripts → migrate to `build-snap-videos.mjs` table

---

## Project-level discoveries captured to memory

Two saved to `~/.claude/projects/.../memory/`:

1. **`project_motion_silent_fail.md`** — Motion 12's `animate()` silently no-ops transforms in this repo. Don't trust without `getAnimations()` verification; prefer CSS `@keyframes` for new motion. The hero entrance is the canonical example post-fix.
2. **`feedback_voice_sweeps.md`** — Voice-rule sweeps must grep across pages + components + voice.md + CLAUDE.md + code comments — not just user-facing copy. Real example: fixing "Privatize the suite" caught 3 occurrences in voice.md plus an inline code comment, not just the snap subhead.

---

## Recommended next session

Pick whichever has the most user energy. In priority order:

1. **`<main>` landmark audit** (~30 min) — easy win, closes the a11y loop, no ops dependencies. Good "warm-up" task.
2. **Service area pages — Naperville first** — content-led, high-leverage SEO play. Per the SEO research file, Naperville is "biggest gap" (21.6% of paid clicks, near-zero organic). Could draft the page in this chat.
3. **Vitest schema parse-and-shape test** — pays off before the next big schema refactor (e.g., when ops gives league schedule → `/leagues` `Event` schema lands). 1h, prevents an entire class of regression.
4. **Three evergreen blog posts** — content-led, also draftable in chat. Standard pillar-skeleton format with content collection scaffold.
5. **`.pillar-*` CSS hoist** — tech debt. Touches every page. Save for after launch.

Not recommended for next-session focus: **PSI optimization.** Per the perf section above, GTmetrix shows the page is already fast. Real-world signal > synthetic Slow 4G variance. Document GTmetrix as the baseline; don't chase Lighthouse score.

---

## Useful greppable handles

- `BUSINESS_ENTITY_ID` — canonical `@id` for venue entity unification
- `localBusinessBase()` — schema foundation, every LocalBusiness-subtype page imports this
- `formatHoursAnswer()` — derives FAQ "What are your hours?" answer from same source as schema
- `getLiveHours()` — Google Places API live hours pull (`src/lib/google-hours.ts`)
- `data-poster` — lazy-loaded video poster attribute (promoted on intersection)
- `data-section-video` — IntersectionObserver-driven autoplay+lazy-source pattern
- `hero-slide-in` — CSS `@keyframes` powering hero entrance motion (replaces broken JS path)
- `GOOGLE_RATING` / `GOOGLE_REVIEW_COUNT` — AggregateRating constants in `src/lib/schema.ts`
- `#fundraiser-program` — Service schema `@id` on `/fundraisers`
- `c-g.co/xORo1J` — `/coupon` iframe URL
- `c-g.co/OskPxh` — `/free-kids-bowling` iframe URL
- `heart-handshake` — Lucide icon for /fundraisers in NavDrawer

---

## Open the next chat with

> *"Read CLAUDE.md and Context/session-handoffs/2026-05-08-schema-rebuild-lcp-fundraisers.md. [Then state the task — `<main>` audit / Naperville page / blog posts / new bug found / etc.]"*
