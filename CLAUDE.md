# Twisted Pin Website — Project Context

Astro marketing site for **twistedpin.com**, live since 2026-05-17. It also carries the staff-only surfaces (`/playbook`, `/money`, `/cogs` — renamed from `/liquor` — `/signatures`) and the TPRS booking-wizard pages under `/reserve*`.
**Deploy:** direct-to-main push → Vercel auto-deploys to production. No staging cushion; copy, schema and perf changes ship straight to real traffic. The 18+ production 301s in `vercel.json` are load-bearing for real traffic.
Shared context for every repo under `dev\` lives in `../CLAUDE.md` — read that first. **Voice rules and wording bans live in `../CLAUDE.md` and `Context/voice.md`.**

---

## Context Files (the brief)

All context lives in `Context/`. Read all seven for any meaningful work.

| File | What it owns |
|---|---|
| **`Context/voice.md`** | Voice, tone, words to use / avoid, locked headline copy, Brian Van Flandern credential lines |
| **`Context/visual-direction.md`** | Web visual thesis (current). Color usage, typography application, photo direction, hero specs. Overrides the original neon brief. |
| **`Context/brand-guidelines.md`** | Logo system, typography roster, hex values, "the Pin" / Formation marks. Mood description partially deprecated (see header note); everything else is authoritative. |
| **`Context/seo.md`** | Keywords, page structure, URL migration plan, page-speed targets, meta requirements |
| **`Context/media-needs.md`** | Running list of imagery / video / copy / data assets needed for inner pages. Update whenever a new pillar ships — flag any homepage-reuse stubs, placeholders, or missing real assets so the user can source / brief / replace. |
| **`Context/adding-events.md`** | **How to put a night on `/upcoming-events/`** — one-off vs weekly-recurring frontmatter, the DST offset table, the traps (never drop a non-event `.md` in `src/content/events/`; quote `skip` dates, don't quote `until`), CTA rules, and why event art is schema-only. Read before adding any event. |
| **`Context/launch-checklist.md`** | Historical launch checklist. Site is live at twistedpin.com (2026-05-17). Retained for the 301 redirect map of record + any residual ops-data placeholders / counsel review items still open. |

Supporting assets:
- `Context/pictures/` — photo library (with `events-catering/` subfolder)
- `Context/videos/` — vertical reels and event footage
- `Context/visual-inspiration/` — reference site mobile screenshots
- `Context/logos/` — brand mark files

Pointers (plain paths, never `@` imports — imports load eagerly at launch):

- `Context/perf-history.md` — Lighthouse / LCP baselines and what each perf pass changed.
- `Context/launch-checklist.md` — historical, but holds the **301 redirect map of record**.
- `Context/session-handoffs/` — ~42 dated files, the **manuals of record**. Start here for any "why is it like this" question.
- `Context/history/2026-website-decisions.md` — this file's archived In Progress + Decisions Log. Not auto-loaded. Where it and this file disagree, **this file wins**; history is the audit trail.
- `Context/history/CLAUDE-2026-09-05-full.md` — the pre-split `Website/CLAUDE.md` (249 KB), byte-identical. Tag `pre-claude-md-split` marks that state.
- **`/cogs` is UI only** — the COGS / liquor engine, variance grade, pre-submit check and order-guide chain live in `../tprs` (read `../tprs/CLAUDE.md`).

---

## Refined Thesis (load-bearing)

**Twisted Pin is a bar-program-led venue.** The website sells the bar, not the bowling alley. Two cornerstone differentiators carry equal weight: a craft cocktail program **curated by *America's Top Mixologist*** (Food Network — Brian Van Flandern, a consultant, not staff or owner; Per Se / Keller / Michelin three-star framing is **fully retired** site-wide), and **the 28-tap self-serve beer & wine wall**, unique in our immediate market.
The bowling experience exists, but it isn't the lead. **When bowling shows up on the homepage, it's the VIP suite specifically** — that's the actual differentiator vs Bowlero / Lucky Strike, not "we have lanes." Traditional lanes get acknowledged lower on the page.
**Adults-first, family-welcome — segmented by hour, not by audience.** Saturday at 6pm is family-dinner-and-bowling; Saturday at 11pm is friends-and-cocktails. Same room, different night. Adult-quality is the *lever*, family-welcome the *permission slip*; the 1am close is the structural signal that adult time exists. Full rule in `Context/voice.md`.

---

## Working Preferences (website-only)

Voice, the wording bans and the `/playbook` exemption live in `../CLAUDE.md` and `Context/voice.md`. These are the ones specific to this repo:

- **Mobile-first.** 90% of traffic is mobile. Design and test mobile before desktop. Don't build desktop and squish.
- **Mobile and desktop hero are separate decisions.** Vertical video hero on mobile; hero photograph on desktop. Never letterbox or stretch the vertical video to fit desktop.
- **Page-speed targets are non-negotiable.** Mobile LCP < 2.5s, performance score 85+. See `seo.md` for the full table. Every other SEO win is wasted if speed isn't there.
- **Lock visual decisions before structure work.** Color, type, hero composition decided first. Then sections. Then components.
- **Don't bake new design language into everything before it's approved.** If you propose a new pattern (e.g., the scribble art treatment), mock it up on a placeholder page first.
- **No homepage decoration that fights the moody thesis.** Arcade and LED-video-wall photography do not appear on the homepage. They live on `/arcade/` and `/bowling/` respectively.

---

## Locked Decisions (so far)

| Decision | Locked value |
|---|---|
| Lane phrasing (canonical) | *"17 traditional lanes + a 6-lane VIP suite"* — traditional first, VIP as upgrade |
| Mobile hero source | Splice direction locked: pour (`Bank Vs Stories.mp4`) → tap wall (`Beer Wall.mov`) → cocktail (`Best Things To Order.mov`). Total ≤4–5s at current CRF. **Specific window timestamps pending user.** Currently live: Bank Vs Stories 0–4s, single shot. |
| Desktop hero | Video placeholder (`After Social Highlight…_v2.mp4`, 8s recut). Final desktop hero (photo or video) still pending shoot. |
| Hero eyebrow | Retired per 2026-05-01 promotion. Live `/` and `/snap-test/` ship without an eyebrow. (Old: *PLAINFIELD, IL* — warm-white, no Glow.) |
| Hero headline | *"Built for adults."* / *"Fine, bring the kids."* — two lines, all caps, Barlow Cond Black 900 |
| Hero subhead | *"Plainfield's premier night out. Bowling optional."* — Roboto Slab Regular, no italics. (Old stat-trio *"28 self-serve taps · A 6-lane VIP suite · 17 traditional lanes · A chef-inspired menu"* retired same day.) |
| Hero CTA | **None in the hero.** Sticky bar carries all conversion (*Reserve a lane* solid Glow + *Plan an event* outlined). |
| Closing band (homepage) | *"You can keep doing dinner-and-a-movie. Or you can do this."* |
| Cocktail credential (primary) | *America's Top Mixologist* (Food Network), with cocktails served in 40+ countries. Per Se / Thomas Keller / Michelin three-star framing **fully retired** — does not appear anywhere on the website (long-form carve-out also retired, 2026-05-03). |
| Type stack (substitutes) | Display: Barlow Condensed 900 · UI: Montserrat 700 · Body: Roboto Slab 400. Production swap to Adobe Fonts (Proxima Nova Extra Cond Black + Proxima Nova + Yorkten Slab) deferred until kit ID is provided. One CSS-variable change. |
| Headline scale | `clamp(34px, 11vw, 80px)` mobile + `letter-spacing: -0.015em`. Verified glyph fits at 360 / 390 / 412 with ≥8px slack. |
| Eyebrow color rule | Warm-white only. Glow is reserved for the primary CTA in the first viewport. |
| Button radius | 7px on all buttons (not pill, not sharp) |
| Brand mark (hero, top-left) | Logo image (`LogoGBED_Horizontal_White`). Mobile 41px / desktop 56px. Round-4 sizes. |
| Drawer header | Logo image (`Logo_Horizontal_GlowInTheDark`, no GBED tagline). Mobile 73px / desktop 84px. Replaces the retired *"The works."* text. |
| Drawer rows | Lucide line icons right-aligned, 24px, `currentColor` (Glow on hover): martini / bowling-pin / calendar / utensils-crossed / map-pin. Bowling pin hand-drawn in matching Lucide stroke style — Lucide doesn't ship one. |
| Sticky CTA bar (mobile) | Always-visible bottom bar. *Reserve a lane* = primary (Glow solid). *Plan an event* = deliberate alternate (Indigo Deep solid + warm-white outlined border + warm-white text). Lives in layout, not Hero. |
| CTA hierarchy (global) | Primary: Glow solid. Alternate: Indigo Deep solid + warm-white outlined. Same recipe in desktop header and mobile sticky bar. *Restraint as confidence* — the deliberate user finds the quieter button. |
| Persistent header (desktop) | `SiteHeader` global component. Logo (left) + inline nav BAR · EAT · BOWL · GAME · EVENTS · VIP SUITE · MORE ▼ (center) + Reserve / Plan CTAs (right). Light translucent scrim + backdrop blur. MORE dropdown click-only. Active-page underline (Glow, 1px) on current page only. **VIP SUITE is the 6th inline item (promoted from MORE 2026-05-04) — tier-1 conversion page, sits to the right of Events as the natural pairing.** |
| Persistent header (mobile) | Logo (left) + hamburger (right). Inline nav + CTAs hidden; CTAs live in the bottom sticky bar. |
| Coupon banner | Retired (built and removed same-day). Coupon reaches users via MORE dropdown (`/coupon/`, label "Coupon") + footer. Renamed from legacy `/free-10` 2026-05-04 — old URL gets a 301 to `/coupon` at launch. |
| Visual mood | Moody/neutral, dark backgrounds, warm wood + copper accents, photo-led, bold display type. *Not* neon. |
| Bowling positioning | VIP suite is the bowling shot on the homepage. Traditional lanes acknowledged lower. |
| Reserved copy (cocktail/bar section H2) | Short: *"Curated by America's Top Mixologist. (Their words, not ours.)"* · Full: *"Cocktails this serious aren't supposed to live at bowling alleys. Menu curated by Brian Van Flandern, America's Top Mixologist."* — held for the future cocktail/bar block. Don't pre-spend. (Earlier "Built by" form retired 2026-05-17 — see Decisions Log.) |
| Deprecated copy | *"The bar that bowls."* (retired) · *"Built for adults. Kids will come."* (superseded by *"Fine, bring the kids."*) · *"Built by [X]" / "Designed by [X]"* — entire constructions retired 2026-05-17 across the site; replaced everywhere by *"Curated by [X]"* (Brian is a consultant, not staff/owner — see voice.md Words to Avoid) · *"Chef-inspired" / "Chef-driven"* — entire family retired 2026-05-17 (venue has no executive chef); replacements: *"from-scratch,"* *"built to share,"* or describe the food itself. |
| Desktop section architecture (`/snap-test/`) | Parallel mobile/desktop tracks via `display: none/flex` swap at 1025px. Mobile retains 8-snap track exactly. Desktop renders Hero (100dvh) → Tap Wall (70vh, split) → Cocktails (70vh, split, alternates) → Events (60vh, full-bleed) → EBG (70vh, gated on stills) → Footer. Reveal motion: `[data-reveal]` fade-up 12px / 450ms via IntersectionObserver + window/.snap scroll fallback. |
| Bowl copy (two variants) | Mobile snap 6: *"17 traditional lanes plus a 6-lane VIP suite. (yes, you can take it over)"* — VIP-leading with aside. Desktop EBG card: *"17 lanes plus a 6-lane VIP suite."* — tighter, no aside, VIP differentiator preserved. |
| Cocktails copy (two variants) | Mobile snap 4: *"Curated by America's Top Mixologist. (their words, not ours)"* — terse, fits stub. Desktop section 3 (50/50 split): *"Cocktails this serious aren't supposed to live at bowling alleys. Menu curated by Brian Van Flandern, America's Top Mixologist."* — long-form. (Both variants used "Built by" until 2026-05-17 — see Decisions Log.) |
| Workflow | Direct-to-main pushes after one-time `feat/hero-round-2` round. Vercel auto-deploys on push. |

---

## Traps (the ones that have bitten)

- **Never hardcode a booking/inquiry platform URL in prose.** "Plan an Event" resolves through `PLAN_EVENT_URL` in `src/lib/links.ts` (`AVERY_ON_URL` = Zite / `AVERY_OFF_URL` = Heyflow); one line flips ~19 CTAs. Blog posts and `public/llms.txt` link **`/events/`**, whose closing CTA carries the live toggle — a hardcoded URL bypasses the switch and mis-routes real leads (2026-06-12).
- **`public/email/` is load-bearing.** Gmail renders images only from a public URL, so the 8 signature PNGs serve from `twistedpin.com/email/*` — never Drive / Dropbox / Docs (blocked). Filenames are stable, so swapping an icon needs no re-paste.
- **THE MOBILE TRAP (signatures).** Gmail's phone app does **not** scale a too-wide message down — it forces the table to the column width and lets cells fight. Table `max-width:100%`, **no width on the logo cell** (logo `max-width:100%`, rides 200px→45px), `white-space:nowrap` on name / title / contact. **Do not re-add a width to that cell.** No media queries — Gmail strips `<style>` from pasted signatures.
- **Browser measurement runs optimistic.** Gmail Android substitutes **Roboto for Arial** (wider for letterspaced uppercase): a one-line fit in Chrome wraps on a real phone. One-line elements need margin, not a hairline fit.
- **`MAPS_VENUE_URL` vs `GOOGLE_REVIEW_URL`** (`src/lib/schema.ts`). Venue surfaces (footer proof card, `/pricing` "verify on Google", `hasMap`, signature badge) use `MAPS_VENUE_URL`; `GOOGLE_REVIEW_URL` only where the *ask* is a review. Both derive from `PLACE_ID` — never paste a `maps.app.goo.gl` short link (dead since Aug 2025) or a `share.google/…` link.
- **Price parity with the live TPRS catalog.** `/reserve/*` is the source of truth for package prices; the marketing pages are what go stale (Extra Suite Birthday sat $20 high for months). Render from the constant, never a second literal, or display and schema.org `Offer` drift apart silently.
- **Mobile type rubric: 16 / 14 / 12 px** — read-to-decide / secondary / hard floor (Lighthouse fails under 12). Inputs always ≥16px, and that alone is not enough on the booking pages: a cross-origin iframe (Stripe PaymentElement) makes iOS auto-zoom a *top-level viewport* action, so `Base.astro` caps `maximum-scale=1` on those three pages only. Never bloat the dense cart ledger.
- **Google-hours midnight spillover.** `currentOpeningHours` starts at midnight *today*, so Friday's past-midnight tail reads as a Saturday 12am–1am opening — and on a specially-closed day that is the ONLY period, erasing the closure (Roy announced phantom hours, 2026-07-04). `stripLeadingSpillover()` in `src/lib/google-hours.ts` guards the leading edge, `mergeHours()` the 23:59 clip. Chain: Roy ← n8n `roy-pre-call` ← `/api/hours/` ← the daily 4am Places snapshot.
- **A Vercel cron `path` needs the trailing slash.** `trailingSlash: 'always'` 308s everything, and **Vercel Cron does not follow 3xx** — `/api/cron/rebuild` silently did nothing for 5 days.
- **The LCP fix pattern** for a new page with a typography hero over a first section video: AVIF Q50 poster, direct `poster=` (not `data-poster`) on the first video, `lcpPreloadHref` in `Base.astro`, bounded `media="(max-width: 480px)"` / `"(min-width: 481px)"` on every `<source>`. **The hero preload is homepage-gated** — unconditional, it starves the real LCP element on pillar pages. Recipe: `Context/session-handoffs/2026-05-17-schema-lcp-perf-sweep.md`.
- **A desktop media query placed ABOVE the base rules in a page-scoped `<style>` silently loses on cascade order** (`/pricing` shipped 3 dead rounds that way). Keep the desktop pass LAST in the block.

---

## Open / watch

- **Real photography** — pillar pages still use placeholders / homepage reuses. Encoder pipeline ready (`scripts/build-snap-images.mjs`); when sources land in `Context/pictures/`, AVIFs auto-generate.
- **Outstanding ops confirmations (post-launch sweep):** VIP suite capacity, fundraiser stat, NYE packages. Phone number is real (`(815) 782-7790` in `PHONE_DISPLAY`/`PHONE_TEL` in `src/lib/schema.ts`).
- **Post-cutover GSC actions:** (1) Validate Fix on `/events` Review-Snippets error (per 2026-05-17 schema-LCP handoff). (2) Submit `/sitemap-videos.xml` (shipped in Stage 4 of 2026-05-17 punch list). (3) Spot-check that the 18 production 301 redirects are firing on real traffic. **All four GSC fixes validated 2026-05-19** — Review Snippets (from 2026-05-17), Videos uploadDate timezone, Events organizer.url+performer, Redirect error on apex `twistedpin.com`. Resolutions expected in 3-10 days via Google's natural re-crawl cadence.
- **Mobile hero video splice** — direction approved (pour → tap wall → cocktail), window timestamps still pending user. Live today: Bank Vs Stories 0–4s, single shot.
- **Desktop type sweep still open:** `/free-kids-bowling` (18 sub-15px values, 1 desktop query), `/coupon`, `/rewards`, `/upcoming-events` (partial). The 8/03 batch swept the *globals* — **when a page "still looks small" after it, check that page's own `<style>` block.** Mobile floors were reviewed and CLOSED by Jon 2026-08-03; don't re-raise without a new trigger.
- **`/leagues`** — `~Sept 15` in-season reframe of the cards (TODO in file); the leagues promo drops Sept 1 despite Tuesday's Sept 8 meeting (Jon's call).
- **Singo music bingo is a trial through Nov 29.** `src/content/events/singo-sundays.md` drives the card, the JSON-LD, `/api/hours` and `/api/music-bingo/` — extend the promo bar and the markdown `until` together. Road sign / Meta / GBP not done.
- **`/liquor` is now `/cogs`** (section param, defaults to bar). Any doc still saying `/liquor` is stale.
- **❌ Mixology event — CANCELLED 2026-07-26 (low signups). Do not rebuild from the archived notes without re-reading the 2026-07-26 entry in `Context/history/2026-website-decisions.md`** — both URLs are deliberately **302** (not 301) to `/upcoming-events/`, the built `/public/snap/mixology-*` files are deliberately left in place, and TPRS product code 500 is deactivated rather than deleted.

### Watch list

- **Future family-bowling page** — name TBD per ops (NOT "Kids Bowl Free" — TM'd by another operator + venue doesn't currently run that program). When it lands: build the page, update `/free-kids-bowling/` redirect target in vercel.json, add cross-link card back to `/bowl`.

---

## Out of Scope (don't touch unless asked)

- Print and signage applications — those still follow the original brand-guidelines mood
- Rewriting `seo.md` — it's authoritative; honor the URL plan and the targets
- Inventing new logos or sub-brands
