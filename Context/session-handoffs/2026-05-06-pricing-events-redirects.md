# Twisted Pin — Session Handoff (2026-05-06, redirects + events + pricing + NYE)

Paste this verbatim as the first message of the next chat. Read `CLAUDE.md` (especially the Decisions Log), `Context/voice.md`, `Context/launch-checklist.md`, and this handoff before doing any work.

---

## TL;DR

This session shipped the 301 redirect map, rebuilt `/upcoming-events` as a real calendar driven by an Astro content collection, built `/new-years-eve` (the first seasonal page) with the new NYE.mp4 video hero plus a generic seasonal-nav system that auto-shows/hides items by date, swapped every "Plan an Event" CTA to Zite directly, and built `/pricing` from scratch with day-tabbed walk-in pricing, a specials content collection (Penny A Pin), and Google Places API graceful fallback.

The site is now structurally complete with real content for every nav-linked URL. Most remaining work is operational (real photography, ops data confirmations) or one-line config swaps for launch day.

## What shipped this session

### 1. 301 redirect map (`vercel.json`)

- 18 legacy URLs preserved per the launch-checklist redirects table (old `/bowling/` → `/bowl/`, `/free-10/` → `/coupon/`, `/contact-us/` → `/`, the old promo URLs, etc.).
- `{/}?` path-to-regexp pattern matches both with and without trailing slash.
- 3 truncated old-promo slugs use prefix `:rest*` patterns (full URL tails weren't recoverable).
- **`/essential` and `/elevated`** — SMS short links pointing at `menu.twistedpin.com/{slug}` (Zite group-event menu picker). Used in text marketing — text customers `/essential` and they hit the picker. Kept as 302 (matches current live behavior). DO NOT REMOVE.
- All path-to-regexp patterns verified locally.

### 2. "Plan an Event" CTAs → `https://twistedevents.zite.so/`

- All 10 conversion-intent CTAs swapped to direct Zite link with `target="_blank" rel="noopener"`. Mirrors the Reserve → Roller pattern (CTA buttons skip the local funnel page and go direct to the conversion platform).
- Educational links kept on local `/events` (homepage SnapStub teaser, "Learn more" stub, `/leagues` "See group events").
- 3 stale comments referencing the never-deployed `events.twistedpin.com` subdomain stripped.
- If a vanity subdomain ever lands, swap the `ZITE_EVENTS_URL` constant in 3 files + the inline string in 5 files.

### 3. `/upcoming-events` rebuilt as real calendar

- Reads from `events` Astro content collection (`src/content/events/*.md`).
- Workflow: drop a markdown file with frontmatter (`title`, `start`, `end`, `location`, `cta`, `tentative`, `virtual`, `draft`) and push.
- Daily 4am cron rebuild surfaces it; past events auto-hide once `end` (or `start`) is in the past.
- Cards group by month, render with date block / title / time / location / optional description / single CTA.
- Multi-day cross-month events get range form on the date block (`31–1` + `DEC/JAN`).
- Empty state: *"Calendar's clear right now. Want to fill it? Plan an event →"* — brand-voiced fallback for zero-event windows.
- First entry: `2026-12-31-new-years-eve.md` linking to `/new-years-eve/`.

### 4. `/new-years-eve` + seasonal-nav config

- Full-bleed NYE video hero. NYE.mp4 (1080×1920, 9s) encoded to `/public/snap/nye-*` in 4 variants matching the beerwall pipeline (AV1+H264 × 1080w+540w + poster).
- One editorial section ("the night, the bar, the suite") + closing CTA band: Plan an Event (Zite, primary Glow) + Reserve a lane (Roller, outlined alternate).
- Body copy is voice-y placeholder until ops gives package details — flagged as TODO in the page.
- **`src/config/nav-seasonal.ts`** — single source of truth for "pages that exist year-round but only surface in NavDrawer between window dates." NYE shows in the Visit section from 2026-11-15 → 2027-01-02, hidden every other day. Daily 4am cron handles auto-show/hide without manual deploys around the holiday.
- Active seasonal items render at the TOP of their drawer section with a Glow-tinted icon — subtle "this is time-bound / promoted" cue.
- Window-boundary checks verified: today (2026-05-06) = hidden; Nov 15 / Dec 31 / Jan 2 = visible; Jan 3 = hidden.
- Adds `sparkles` icon to `src/lib/icons.ts`.

### 5. `/pricing` page (ground-up build)

The big one. Multiple iterations during the session — final state below.

- Surfaced via NavDrawer Info section (top entry, above Leagues). NOT on the homepage (decided against the `SnapToday` snap concept after user review).
- **Architecture:** typography hero → day-tabbed pricing calendar (transparent over page bg, no card chrome — let Pin Tilt watermark show through) → holiday note → SEO copy block → SnapFooter.
- **Day calendar:** 7-pill toggle (MON–SUN). All 7 days pre-rendered server-side; pill click flips `data-active-day` on the section root, CSS shows/hides views via `aria-hidden`. Today defaults from `todayKey()` in `src/data/hours.ts` (uses `America/Chicago` so build-server UTC doesn't misalign with venue local day).
- **TODAY pill** stacks above the day name (only on today's view).
- **Single-rate days (Mon–Thu)** collapse to 2 columns (Trad / Suite). **Multi-rate days (Fri/Sat/Sun)** show 3 columns (Time / Trad / Suite). Conditional rendering via `schedule.windows.length > 1` + `data-cols` attribute.
- **Pricing data** in `src/data/pricing.ts` — 4 distinct schedules: Mon-Thu single rate ($35/$55) / Fri ($45/$65 → $50/$70) / Sat ($45/$65 → $55/$75) / Sun ($45/$65 → $35/$55, reversed peak/off-peak).
- **Holiday note** preserved from current twistedpin.com: *"Holidays and school breaks follow Friday 5pm pricing. Hours can shift — call ahead if you're cutting it close."*
- **Two quick-action CTAs** (equal-width, stack on narrow): Check the waitlist → /waitlist · Get the coupon → /coupon. Reserve a Lane and Plan an Event are NOT included on this page — they're global (sticky bar / header).
- **Specials content collection** (`src/content/specials/*.md`) — separate from events, day-of-week recurring patterns. First entry: Penny A Pin (Wednesday, Traditional only). Schema fields: `name`, `days`, `tiers`, `tagline`, `showFrom`/`showUntil` (optional seasonal window), `draft`.
- **Penny A Pin renders as a Glow-bordered callout above the table** with `tagline + body` carve-outs. Does NOT replace the cell rate (user direction: keep showing $35 in Wed Traditional; the special is referenced above).
- **SEO chrome:** title meta keyword-rich; H1 *"Walk-in pricing."* (brand voice, terse, with period); H2 *"How pricing works."* (keyword-rich) + 3 SEO body paragraphs covering walk-in vs reserved + suite buyout hand-off to Zite + closing NAP line.
- **Multiple typography iterations** during the session (day name 40→60px clamp, prices 24→28-36px clamp, tier headers 11→14→13px / 0.12→0.08em letter-spacing, capacity moved into per-tier sub-lines, shoe rental promoted to own line with Glow $5.95). Final state holds at narrow + wide viewports without overflow.

### 6. Google Places API — graceful fallback wired (env vars not set)

- `src/lib/google-hours.ts` fetches the venue's Business Profile `regularOpeningHours` when `GOOGLE_MAPS_API_KEY` + `GOOGLE_PLACE_ID` env vars are set on Vercel.
- Falls back to static `src/data/hours.ts` when not. `/pricing` displays a "verify on Google" link only during fallback.
- **Decided 2026-05-06 to stay on static + verify-link for v1.** Hours don't change weekly; the API doesn't capture holiday hours cheaply (would need `currentOpeningHours` field, more expensive); requires a Google Cloud billing account for an integration that adds friction without solving the holiday-hours edge case. Static + "verify on Google" link is transparent and lower-friction.
- Code stays in repo as a primitive — flip env vars on Vercel anytime to activate.

### 7. SnapFooter copy: *"Plainfield's been talking"* → *"Everyone's been talking"*

- Geo-restricting body copy doesn't move local SEO (citations, schema, NAP do that work). Broader phrasing matches the actual review distribution.

### 8. NavDrawer auto-close on link click

- Mobile bug: hamburger → Find Us scrolled to SnapFooter but left the drawer open over the scroll target.
- Fix: `navDrawer()` in `motion.client.ts` now binds a click listener on every `<a href>` inside the drawer that calls `close()` when clicked. Critical for in-page anchors (`#find-us`); also fires for cross-page + external links (clean state on back nav).

### 9. Maps URL strategy locked

Three Google-Maps surfaces, two URL patterns:

- **`/pricing` "verify on Google" link** + **SnapFooter Google review card** → `https://maps.app.goo.gl/yyiVoLzTsHA2TNGW8` (user-supplied short URL).
- **SnapFooter Get Directions** → `dir/?api=1&destination=15610+S+Joliet+Rd…&destination_place_id=ChIJURI15Tr1DogRLKYdPWWuY-M` (place_id-based, pre-loads directions in the Maps app).

User testing confirmed the place_id place-page URL didn't open the venue reliably for verify/review surfaces — only the directions deep-link works. The short URL works for venue page links. Place ID stored in `SnapFooter.astro` as the `PLACE_ID` constant.

**Watch:** `maps.app.goo.gl` is built on Firebase Dynamic Links, which Google announced they're shutting down by **August 25, 2025**. May start failing inconsistently as that date approaches. If/when broken, fall back to the search-style URL pattern (`https://www.google.com/maps/search/?api=1&query=Twisted+Pin+Plainfield+IL`) — Google's documented canonical pattern that should survive any short-link service deprecation.

### 10. "Kids Bowl Free" references stripped (TM + venue doesn't run it)

- "Kids Bowl Free" is TM'd by another operator, AND the venue currently doesn't run a kids-bowl-free program. Both reasons to remove.
- Stripped from `/bowl` (cross-link card + meta description + docstring), `/pricing` SEO copy, vercel.json (redirect target simplified `/free-kids-bowling/` → `/bowl/`), launch-checklist, media-needs.
- Future family-bowling page is on the roadmap, name TBD per ops. When it lands, redirect target gets updated and a cross-link added back to `/bowl`.

## Open threads (the carryforward list)

### Ops / external

- **NYE package details** — `/new-years-eve` body copy is voice-y placeholder until ops gives real packages (price tiers, what's included, ticket vs walk-in, etc.). Page exists at the URL year-round; NavDrawer auto-promotes Nov 15.
- **Phone number placeholder** — SnapFooter still says `(815) 555-0100`. Real number from twistedpin.com footer is `(815) 782-7790`. One-line swap when confirmed.
- **Real photography** — pillar pages still use placeholders / homepage reuses. Encoder pipeline (`scripts/build-snap-images.mjs`) is ready; drop sources in `Context/pictures/` and AVIFs auto-generate. Distinct event-energy photography flagged for `/events`, `/vip-suite`, etc.
- **Privacy / Terms / Accessibility counsel review** — three pages live as working drafts modeled on twistedpin.com's live policies + standard hospitality language. Need attorney pass before launch.
- **VIP Suite capacity confirmation** — `/vip-suite` says "Up to 80." Ops confirm.
- **Fundraiser stat confirmation** — `/vip-suite` says "50% of bowling revenue back to host." Public-facing claim — ops confirm.
- **Patch Retention API trigger pattern** — `/coupon` form posts to Patch but the canonical "web form → coupon SMS" trigger is open. Pending Patch support response. Submissions land in Patch contact list; coupon SMS path is TBD.
- **TablesReady waitlist** — `/waitlist` iframe wrapper shipped 2026-05-04. Webhook-derived state version tabled pending plan upgrade. See `Context/waitlist-theory.md`.
- **DNS migration** — runbook in `Context/dns-migration.md`. GoDaddy DNS picked; SPF cleanup flagged.

### Code / pre-launch

- **NavDrawer height on mobile** — drawer is 17 items + a CTA pair + a meta line. Currently scrolls. Worth checking on smaller phones.
- **`/pricing` 13px headers on desktop** — current font matches mobile-first. If desktop feels tight, media-query bump back to 14px at ≥1025px is a one-line fix.
- **Tap wall photo reshoot** — user flagged the current image; flagged in `media-needs.md`.
- **Watch `maps.app.goo.gl`** — Firebase Dynamic Links shutdown Aug 25, 2025. If verify/review links break, swap to the search-style URL pattern.
- **Adobe Fonts kit** — explicitly declined this session. Substitutes (Barlow Cond / Montserrat / Roboto Slab) ship for production. If user changes their mind, the swap is a 5-minute CSS-variable change once a kit ID is provided.
- **Lighthouse / performance re-test** — don't re-test until real photography + final hero splice land. Compare against the 2026-05-05 baseline in `perf-history.md`.

### Visual / brand

- **`/events` page editorial photos** — currently reuse homepage section photos. Distinct event-energy photography flagged in `media-needs.md`.
- **`/vip-suite` photos** — ditto.
- **`/bar` cocktail photos** — currently use cocktails-bg-540 placeholder. AIV01579 (copper-shaker pour) and AIV01592 (cherry old fashioned) flagged as targets.

### Architectural / post-launch

- **Future family-bowling page** — name TBD per ops (NOT "Kids Bowl Free" due to TM). When it lands: build the page, update `/free-kids-bowling/` redirect target in vercel.json, add cross-link card back to `/bowl`. Captured in `/bowl.astro` docstring + launch-checklist.
- **Pricing page possible variants** — if "How pricing works" SEO body becomes ranking-relevant, consider lifting the section to `/pricing/how` or similar for keyword targeting. Don't do this preemptively.
- **`.pillar-*` CSS hoist** — `.bar-*` / `.eat-*` / `.vip-*` CSS is now tripled. Tech debt.
- **Hours single source of truth refactor** — SnapFooter still hardcodes "Open today / until 11:00 PM"; should read from `src/data/hours.ts` like `/pricing` does. ~30 min refactor.

## What I'd tackle next session (in order)

1. **Phone number swap** — one-line edit in SnapFooter, instant trust win.
2. **NavDrawer-height check on small phones** — quick visual audit.
3. **Real events to test the cards** — drop 2-3 markdown files in `src/content/events/` to see the calendar with multiple entries (multi-month, with/without specials, etc.).
4. **`/bowl` polish or `/eat` polish** — both have placeholder photos and could use a tighter editorial pass.
5. **301 monitoring after launch** — flag for Search Console crawl errors weekly for first 60 days.

If you've got an ops update on phone / NYE packages / hours / capacity / fundraiser stat / real photo drops — that's the highest-leverage thing to land first. Most code work is now waiting on those.

## Useful greppable handles

- `data-snap-today` — pricing calendar root selector (drives day-pill toggle + view visibility)
- `SEASONAL_ITEMS` — `src/config/nav-seasonal.ts` array; add new items here to surface them in NavDrawer during their date window
- `getCollection("events")` / `getCollection("specials")` — content collections; entry in `src/content/{events,specials}/*.md`
- `PLACE_ID` — Twisted Pin Google Place ID, used in SnapFooter directions URL
- `ZITE_EVENTS_URL` / `ROLLER_URL` — repeated per-file constants for the two main external conversion platforms
- `todayKey()` — returns the venue-local day-of-week key for date-aware rendering
