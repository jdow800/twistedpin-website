# Twisted Pin — Session Handoff (2026-05-07, photos + videos + gap fixes)

Paste this verbatim as the first message of the next chat. Read `CLAUDE.md` (especially the Decisions Log), `Context/voice.md`, `Context/launch-checklist.md`, `Context/session-handoffs/2026-05-06-pricing-events-redirects.md` (last session), and this handoff before doing any work.

---

## TL;DR

This session shipped Google live hours (holiday-aware via `currentOpeningHours`), a comprehensive photo/video swap across the site (real assets on `/bar` `/eat` `/vip-suite` `/game` `/events`, mobile homepage snaps now have full-bleed photo or video backgrounds instead of solid Indigo), three new videos (Cocktails Hero, Arcade, Hiring Vid), the new `/free-kids-bowling` page, abandoned the Patch Retention API integration on `/coupon` and reverted to the legacy iframe, and finally — after four iterations — actually killed the section dead-zones on every pillar and tier-2 page (combination of section padding tighten + `align-items: start` on grids + `/eat` View the Menu href fix).

15 commits. The site is visibly tighter and more on-brand than it was 24 hours ago. **The biggest single piece of work NOT done this session is the SEO research file's #1 recommendation — page-by-page schema rebuild.** That's the recommended next-session entry point.

---

## What shipped this session

### 1. Google Places API live hours (`currentOpeningHours`)

The 2026-05-06 implementation only fetched `regularOpeningHours` — the standard weekly schedule. Holidays, special closures, and one-off hour shifts were invisible to the website. Fixed:

- Field mask upgraded to `currentOpeningHours,regularOpeningHours` (same Pro tier SKU — no upcharge; the prior session's "more expensive" framing was wrong).
- `LiveDayHours` interface gains `openMinutes`, `closeMinutes`, `openLabel`, `closeLabel` for time-aware copy.
- `src/data/hours.ts` adds `parseTimeLabel`, `staticWindow`, `nowMinutesCentral`, `isOpenNow`, `previousDay` helpers. Static fallback now produces the same shape as live data, with past-midnight close handled (Fri 2pm → 1am wraps to closeMinutes ≥ 1440).
- `/pricing` `hoursFor` honors the closed flag — renders "Closed today" / "Closed" when Google reports a closure, instead of silently falling back to static hours and lying.
- **SnapFooter refactor**: hardcoded "Open today · until 11:00 PM" replaced with a 4-state resolver: `Open · until {x}` / `Closed · opens {x}` / `Closed today` / `Closed for tonight`. Late-night carry-over handled (Sat 12:30am still inside Fri 1am close window).
- **Vercel env vars set + verified** — `GOOGLE_MAPS_API_KEY` and `GOOGLE_PLACE_ID` are live. The "verify on Google" caveat on `/pricing` auto-hides when live data flows. Cron rebuild propagates ops edits within ~24h.

Commit: `003f4eb`.

### 2. Real photography swap on inner pages

Five inner pages were reusing homepage cluster photos. Now have distinct content per slot, sourced from `Context/pictures/` and the `events-catering/` subfolder.

| Slot | New asset | Source |
|---|---|---|
| `/bar` Cocktails section | copper-shaker pour | AIV01579 (cornerstone-A per visual-direction.md, previously unused) |
| `/eat` "Kitchen" section | chafer-buffet w/ chips, salsa, guac, wings + scribble-art on back wall | `events-catering/DSC_0344` |
| `/eat` "Built to Share" | dramatic wing-chafer closeup | `events-catering/DSC_0348` |
| `/vip-suite` "What You Can Do" | full party setup w/ VIP1-4 lane signage + custom "ARIA" decor | `events-catering/IMG_9617` |
| `/game` "What's In There" | full-neon arcade environment | ArcadeHeyFlow |
| `/game` "Yes, Adults Too" | neon-detail closeup | DSC_0569 |
| `/events` "Why It Works" | reuses `/bar`'s copper-shaker (intentional dual-pillar story) | shares `bar-cocktails-*` |

Encoder script (`scripts/build-snap-images.mjs`) gained 6 SOURCES entries. AVIF + WebP + JPG at 540w + 900w. Re-run idempotent.

Commit: `c687629`.

### 3. Buffet "before & after" video — `/events` + homepage cluster + `/careers` got a hiring video

`Buffet Before & After.mov` (2160×3840 60fps 13s) encoded twice:
- First pass at 0–6s ("before" portion — empty room → buffet being set up). Shipped on `/events` + `/vip-suite` editorial frames + homepage events cluster.
- Re-trim to 6.3–13.3s ("after" beat — full spread, room set up) per user direction. The "after" content is more visually impactful for the events tile. Output URLs unchanged so all consuming surfaces auto-update.

`Hiring Vid.mp4` (360×640 30fps 7.5s) shipped on `/careers` editorial section. The DSC_0289 staff-team still (Best-of-Will-County 2025 award) preserved as the video's poster. Editorial framing: "Voted Best Bowling Alley in Will County by Herald-News readers. The team in the clip is who you'd be on shift with."

`Cocktails Hero.mp4` and `Arcade.mp4` (both 720×1280 30fps) shipped on:
- Mobile snap 4 (Cocktails) + desktop cluster Cocktails — replaces cocktails-bg static
- Mobile snap 7 (Game) + desktop cluster Game — replaces stage-game static

Commits: `44463a6` (Buffet + Hiring), `a2ea9dc` (homepage events cluster + last-7s retrim), `0b828a5` (Cocktails + Arcade).

### 4. Generic snap-video encoder (`scripts/build-snap-videos.mjs`)

The prior pattern was a per-video bash script (`build-snap-video.sh`, `build-nye-video.sh`, `build-buffet-video.sh`). Replaced with a Node + ffmpeg config-driven pipeline. Future videos = one row in the SOURCES table. Existing bash scripts kept untouched for now (flagged tech debt).

Skip-on-missing-source pattern matches `build-snap-images.mjs` — gitignored `Context/videos/` isn't always populated on a fresh worktree.

Commit: `0b828a5`.

### 5. Mobile homepage snaps — typography → full-bleed media

Snaps 2 (Events), 4 (Cocktails), 5 (Eat), 6 (Bowl), 7 (Game) had been typography-only solid-Indigo placeholders. Each now renders with full-bleed photo or video background + dark bottom-up scrim, matching the mobile snap-tapwall composition register.

`SnapStub.astro` extended with two new optional props: `image` (slug like "events-bg") and `video` (slug like "buffet"). Video takes precedence when both set. Includes `aria-label` for a11y.

Final mobile snap content:
- Snap 2 (Events) → buffet video (matches the desktop cluster Events card — same "after" beat, same source URL)
- Snap 4 (Cocktails) → cocktails-hero video
- Snap 5 (Eat) → eat-kitchen photo (chafer-buffet w/ scribble)
- Snap 6 (Bowl) → vip-energy photo (VIP1-4 lane signage with party setup — VIP-leading per copy direction)
- Snap 7 (Game) → arcade video

Side effect: `events-bg` widths bumped from `[540, 600]` to `[540, 600, 900]` so it covers full-bleed mobile retina. Other slots already had 540/900 from prior commits.

Commits: `0cf60f9` (initial photo backgrounds), `1c53306` (snap 2 → video).

### 6. `/free-kids-bowling` page — new + iframe-wrapped + Pin Pass upsell

Reuses the legacy `/free-kids-bowling/` slug from twistedpin.com (preserves any inbound SEO; the prior 308 redirect from vercel.json was removed in the same commit).

The 2026-05-06 "Kids Bowl Free stripped completely" decision is partially superseded — venue is now running the program (June 1-30 summer window), so the page exists. The TM constraint stands ("Kids Bowl Free" is owned by another operator); the page uses **"Free Summer Bowling For Kids"** / **"Free Kids Bowling"** descriptive framing, which doesn't infringe.

Architecture: hero → iframe (`c-g.co/OskPxh` signup) → editorial sections (How It Works + While The Kids Bowl) → Glow-bordered Summer Pin Pass upsell ($159.95 unlimited household, links to `ecom.roller.app/twistedpin/summerpinpass`) → hyper-local SEO body block (Naperville, Romeoville, Shorewood, Bolingbrook, Oswego, Joliet) + Plainfield School District 202 link → SnapFooter.

Surfaces in NavDrawer Visit section between Apr 15 → Sep 1 via the seasonal-nav system (same mechanic as `/new-years-eve`). Cross-link card on `/bowl` restored.

Voice-tightened the user-supplied existing copy: dropped "premier entertainment destination" and "ultimate summer value" (banned word "value"); kept hyper-local SEO mentions; reframed via the brand thesis ("while the kids bowl, you get the bar program"). Hero sub line broken on three lines via `<br>` for cleaner mobile read.

**Open thread on this page:** the homepage "nudge" pattern for highlighting time-limited programs (Pin Pass, summer kids, NYE) without dedicating a giant CTA — exploration deferred until we have 3+ items competing for attention.

Commits: `099111a` (initial ship), `9357faf` (copy fixes — walk-in only, June 1-30 dates, PSD 202 reference), `50fcf79` (gap fix selector bug — BEM modifier was missed).

### 7. Patch Retention API abandoned — `/coupon` reverted to iframe

The Patch Retention native-form integration shipped 2026-05-05 never resolved the canonical "web form → coupon SMS" trigger pattern with Patch support. User opted to revert `/coupon` to the legacy live-site iframe wrapper (`c-g.co/xORo1J`), matching what twistedpin.com currently does end-to-end.

`src/pages/api/coupon-signup.ts` deleted (can be restored from git history if Patch eventually clarifies). `PATCH_API_KEY` + `PATCH_ACCOUNT_ID` env vars no longer used — flagged in launch-checklist as safe to remove from Vercel.

Commit: `099111a`.

### 8. Section dead-zone fix (the one you'll actually feel)

This took **four commits to land properly**. The story:

- **Symptom**: ~200px+ of dead space between hero and first editorial section on `/bar`, ~340px+ between editorial sections on `/eat` desktop. User flagged twice as "the gap is still huge."
- **Round 1** (`9ce4317`): tightened pillar hero `min-height` mobile clamp. Near no-op because content already exceeded the new floor.
- **Round 2** (`206300a`): killed hero `padding-bottom: calc(var(--bar-pad) + 32px)` (~96px reserved for the sticky CTA bar that never actually overlaps the hero) → 24px. Cut mobile gap from 156 → 90px. **This was the real fix for the hero.**
- **Round 3** (`5e737ef`, `d3bbe02`): tightened pillar `.{name}-section` mobile padding 56 → 32 → 15. Cut pillar gap to ~66px on mobile.
- **Round 4** (`50fcf79`): `/free-kids-bowling` editorial sections still gappy because the override selector `.fkb-section, .fkb-pinpass-section` didn't include `.fkb-section--editorial` (BEM modifier is its own class, not a descendant of `.fkb-section`). Three sections kept the global 80px stacking. Selector fixed.
- **Round 5 = THE REAL ONE** (`8568119`): user flagged `/eat` desktop still had ~340px gaps. Two compounding causes:
  - `.{pillar}-section` desktop padding 96/96 (vs mobile 15px)
  - `.{pillar}-section-grid` `align-items: center` — when the image column is taller than the copy column (which is most of the time at desktop), the copy gets centered vertically and creates a huge "empty space below copy" on desktop.

  Fixed both:
  - `.t2-section` global padding 24/56 → 5px mobile, 32/96 → 24px desktop. **Covers `/coupon`, `/careers`, `/faq`, `/gift-cards`, `/leagues`, `/rewards`, `/privacy`, `/terms`, `/accessibility`, `/free-kids-bowling` in one global edit.**
  - All 6 pillar sections (`.bar-section`, `.eat-section`, `.events-section`, `.game-section`, `.bowl-section`, `.vip-section`) match: 5/24px padding.
  - **`align-items: center` → `align-items: start`** on all 6 pillar grids. Copy column hangs from top of section next to the image instead of centering. Eliminates the desktop centering gap.
  - `/free-kids-bowling` page-specific override removed (now redundant since global is tight).

**Bonus fix in the same commit**: `/eat` "View the menu" CTA href was `#menu` → no element with that ID → button "did nothing." Now points at `/menu/food/`.

**Bonus cleanup**: stale docstring TODOs on `/eat` and `/bar` flagging menu CTAs as "placeholder" got updated to reflect the GoTab/Untappd integration that shipped 2026-05-05.

Verified live (1280×900 desktop): `/eat` `.eat-section` paddingTop/Bottom: 24px (was 96px). align-items: start (was center). View the menu href: `/menu/food/`.

### 9. SEO research file read + briefly summarized

Read `Twisted Pin Full System/Reference/market_research_seo_2026-05-07.md` end-to-end. The file's top 5 recommendations:

1. **Schema rebuild — page-by-page** (`BarOrPub` on `/bar`, `Restaurant` on `/eat`, `BowlingAlley` on `/bowl`, `Person` markup for Brian Van Flandern, full `Menu` + `MenuItem`)
2. Dedicated event-type landing pages (`/events/corporate`, `/events/birthday`, etc.)
3. Reddit + TikTok presence (outside the website)
4. Review velocity engine (outside the website)
5. Rework `/why-us-[city]` pages to pass the "remove the city name" test

**None of the website-side recommendations were directly addressed this session.** A few items got incidentally hit:
- `/free-kids-bowling` SEO body block follows the "hyper-local content with neighborhood/landmark naming" rule (Naperville, Romeoville, Shorewood, Bolingbrook, Oswego, Joliet + PSD 202)
- `/free-kids-bowling` hero sub line is BLUF-style (specifics > adjectives)
- HTML menus already in place from 2026-05-05 (`/menu/cocktails`, `/menu/taps`, `/menu/food`)
- Brian Van Flandern credential surfaced on `/bar` — but no `Person` schema markup yet

Schema rebuild is the **single highest-leverage recommendation that has zero external dependencies**. No ops input, no waiting on photos, no API to coordinate. 1-2 days dev. Recommended next-session entry point.

---

## Open threads (the carryforward list)

### Ops / external

- **Schema audit** — see "Recommended next session" below. Highest impact website-side work.
- **NYE package details** — `/new-years-eve` body copy still voice-y placeholder until ops gives real packages.
- **Phone number placeholder** — SnapFooter still says `(815) 555-0100`. Real number from twistedpin.com footer is `(815) 782-7790`. One-line swap when ops confirms.
- **VIP Suite capacity** — `/vip-suite` says "Up to 80." Ops confirm.
- **Fundraiser stat** — `/vip-suite` says "50% of bowling revenue back to host." Public-facing claim — ops confirm.
- **Privacy / Terms / Accessibility counsel review** — three pages live as working drafts modeled on twistedpin.com's live policies + standard hospitality language. Need attorney pass before launch.
- **Real photography for `/events` editorial sections** — currently uses events-bg (DSC00785) + bar-cocktails (AIV01579). Both are on-thesis but reuse from other surfaces. Distinct event-energy photography would help.
- **TablesReady waitlist** — `/waitlist` iframe wrapper still in place. Webhook-derived state version tabled pending plan upgrade. See `Context/waitlist-theory.md`.

### Vercel env vars to clean up (user TODO)

After today's coupon revert, these env vars are no longer referenced. Safe to remove from Vercel project settings → Environment Variables:

- `PATCH_API_KEY`
- `PATCH_ACCOUNT_ID`

(They sit harmlessly until removed; deleting is just hygiene.)

### Code / pre-launch

- **Schema rebuild** — see "Recommended next session" below.
- **`/why-us-[city]` rework** — 9 pages live but fragile per the SEO file's "doorway page" risk analysis. Each needs unique drive-time/parking section, city-specific testimonial pull, photos with that city's customers, FAQ schema. Modest organic lift per city.
- **Event-type sub-pages** (`/events/corporate`, `/events/adult-birthday`, `/events/bachelor-bachelorette`, `/events/holiday-parties`, `/events/league-trivia`) — heavy lift, needs photos + FAQ + price ranges + 2-click inquiry. Defer until photos exist.
- **BLUF homepage rewrite** — half-day copy pass; first 134-167 words must directly answer "what is Twisted Pin and who is it for" for AI Overview citation.
- **301 monitoring** — after launch, monitor Search Console for crawl errors weekly for first 60 days.
- **Lighthouse / performance re-test** — don't re-test until real photography + final hero splice land. Compare next run against the 2026-05-05 baseline in `perf-history.md`.
- **`maps.app.goo.gl` watch** — Firebase Dynamic Links shutdown August 25, 2025. If the venue page link starts failing, swap to `https://www.google.com/maps/search/?api=1&query=Twisted+Pin+Plainfield+IL`.
- **Adobe Fonts kit** — explicitly declined. Substitutes ship for production. 5-min CSS-variable change if direction reverses.

### Architectural / post-launch

- **Homepage "nudge" pattern** — for highlighting time-limited programs (Pin Pass, summer kids, NYE) without dedicating a giant CTA. **Exploration deferred until we have 3+ items competing for attention.** Captured here so it's not forgotten.
- **`.pillar-*` CSS hoist** — `.bar-*` / `.eat-*` / `.vip-*` / `.events-*` / `.game-*` / `.bowl-*` is now sextupled. Hoist shared rules to `.pillar-*` utilities in `global.css`. Each page keeps only content-specific overrides. Tech debt.
- **MORE icon module** — Lucide icon paths duplicated between `SiteHeader.astro` and `NavDrawer.astro`. On a third use, hoist `ICON_PATHS` to a shared icon module.
- **`Hero.astro` cleanup** — unused since `/snap-test/` was promoted to `/`. Delete in a cleanup pass.
- **`CouponBanner.astro` cleanup** — retired component file kept "in case it returns." If decision holds, delete.
- **Old single-video bash scripts** — `build-snap-video.sh`, `build-nye-video.sh`, `build-buffet-video.sh` could migrate to the unified `build-snap-videos.mjs` table. Tech debt.

### Visual / brand

- **Tap wall photo reshoot** — `BeerWallHeyFlow` is a brand-asset shot but user previously flagged it as wide/environmental; tighter / more atmospheric tap-row composition or hand-mid-pour would refresh the homepage Tap Wall, `/menu` hub, and any future `/bar` use in one swap.
- **Distinct event-energy photography** — partially addressed this session (vip-energy + buffet video) but the homepage cluster `events-bg` and `/events` editorial sections still share the canonical DSC00785 shot.

---

## Recommended next session

### **Schema rebuild — page-by-page**

The single highest-impact website-side move per the SEO research file. Locks in proper entity classification for AI assistants (Schema teaches AI Overview / ChatGPT / Perplexity / Gemini what kind of business this is and what it offers). Quoted from the research:

> **Specificity matters**: Google rewards the most specific subtype available. Multiple schema types per page is fine and expected for hybrid venues. JSON-LD (not microdata or RDFa) is the modern standard. ~73% AIO citation rate boost when properly applied.

Recommended approach:

1. **Audit current schema** — grep `application/ld+json` and `<meta` across all pages. Catalogue what's already there. Likely sparse — `Base.astro` may have a generic `LocalBusiness`, `/faq` got `FAQPage` schema 2026-05-05, but page-specific subtypes are probably missing.
2. **Build a schema table** — rows: page, current schema, target schema, additional fields needed (priceRange, hasMenu, openingHoursSpecification, Person credential markup, etc.).
3. **Add per-page JSON-LD** following the SEO file's table:
   - Home + `/bar` → `BarOrPub` (primary identity) + `Place` + `AggregateRating`
   - `/eat` → `Restaurant` + `Menu` + `MenuItem` blocks
   - `/bowl` → `BowlingAlley` + `SportsActivityLocation`
   - `/vip-suite` → `Place` + `Event` for hosted events + `FAQPage` (capacity / parking / AV)
   - `/events` → `EventVenue` (or `LocalBusiness` + `Event` for recurring) + `FAQPage`
   - `/menu/cocktails` + `/menu/food` + `/menu/taps` → embedded `Menu` + `MenuItem` schema, with `nutrition`, `suitableForDiet`, `offers/price` where data exists
   - `/why-us-[city]` (×9) → `LocalBusiness` with city-specific addressLocality
   - `/bar` → `Person` markup for **Brian Van Flandern** with `jobTitle`, `award`, `knowsAbout`, `image`, `description` (this is gold for E-E-A-T per the research)
4. **Validate** with Google's Rich Results Test (`https://search.google.com/test/rich-results`). Each schema type has its own validator.
5. **Ship in chunks** — one commit per page-type so any validator fail can be reverted independently. Order: Person + BarOrPub on `/bar` first (highest leverage), then `/eat` Restaurant + Menu, then `/bowl` BowlingAlley, then VIP + Events FAQ, then `/why-us-*` city-specific.

**Open the next chat with:** *"Read CLAUDE.md and Context/session-handoffs/2026-05-07-photos-videos-gap-fixes.md. Ready to do the schema rebuild — start with audit + schema table proposal."*

### Lower-priority alternatives (if schema feels too heavy)

- **BLUF homepage rewrite** (half-day copy pass) — first 150 words must answer "what is Twisted Pin and who is it for" for AI Overview citation.
- **`/why-us-[city]` rework** (1 week per sprint of 2-3 cities) — defends existing rankings against the March 2026 doorway-page sharpening.
- **Phone number swap + ops confirmations** — instant wins if ops gets back to user (fundraiser stat, VIP capacity, NYE packages).

---

## Useful greppable handles

- `data-section-video` — the IntersectionObserver-driven autoplay-muted-loop pattern (used on Tap Wall, Cocktails, Game, Events, Hiring videos). Lazy `data-src` promotion on intersection.
- `getLiveHours()` / `currentOpeningHours` — Google Places API live-hours pipeline (`src/lib/google-hours.ts`)
- `nowMinutesCentral()` / `isOpenNow()` / `previousDay()` — time-of-day helpers in `src/data/hours.ts`
- `SEASONAL_ITEMS` — `src/config/nav-seasonal.ts` array; `/free-kids-bowling` (Apr 15–Sep 1) joined NYE here this session
- `SnapStub` — homepage mobile snap component, now accepts optional `image` or `video` prop
- `c-g.co/xORo1J` — `/coupon` iframe URL
- `c-g.co/OskPxh` — `/free-kids-bowling` iframe URL
- `ecom.roller.app/twistedpin/summerpinpass` — Pin Pass purchase URL (Summer Pin Pass upsell on `/free-kids-bowling`)
- `align-items: start` — pillar grid alignment after this session's gap fix (was `center`)
- `padding: 5px 22px` (mobile) / `padding: 24px 64px` (desktop) — pillar + tier-2 section padding after this session's gap fix
