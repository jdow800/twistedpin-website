# Twisted Pin Website — Project Context

This file is the entry point for any session working on this project. Read it first.

---

## Refined Thesis (load-bearing)

**Twisted Pin is a bar-program-led venue.** The website sells the bar, not the bowling alley.

Two cornerstone differentiators carry equal weight:

1. **A craft cocktail program built by *America's Top Mixologist*** (Food Network) — Brian Van Flandern, who set the program up as a consultant and is back to retrain the team summer 2026. He is not staff, not an owner, not a daily presence; the credential is the lever, the relationship is the truth. Per Se / Thomas Keller / Michelin three-star framing is **retired for primary positioning** — see `voice.md` for the long version.
2. **The 28-tap self-serve beer & wine wall** — unique in our immediate market.

The bowling experience exists, but it isn't the lead. **When bowling shows up on the homepage, it's the VIP suite specifically** — that's the actual differentiator vs Bowlero / Lucky Strike, not "we have lanes." Traditional lanes get acknowledged lower on the page.

**Reference frame:** Flight Club Chicago and similar dark experiential venues — they lead with food/beverage, the activity is implied, customers figure it out fast. We do the same.

**Adults-first, group-friendly, family-welcome — in that order.** Female-led decision-making, mixed-gender photography, real groups. Not target-only-women marketing.

---

## Context Files (the brief)

All context lives in `Context/`. Read all four for any meaningful work.

| File | What it owns |
|---|---|
| **`Context/voice.md`** | Voice, tone, words to use / avoid, locked headline copy, Brian Van Flandern credential lines |
| **`Context/visual-direction.md`** | Web visual thesis (current). Color usage, typography application, photo direction, hero specs. Overrides the original neon brief. |
| **`Context/brand-guidelines.md`** | Logo system, typography roster, hex values, "the Pin" / Formation marks. Mood description partially deprecated (see header note); everything else is authoritative. |
| **`Context/seo.md`** | Keywords, page structure, URL migration plan, page-speed targets, meta requirements |

Supporting assets:
- `Context/pictures/` — photo library (with `events-catering/` subfolder)
- `Context/videos/` — vertical reels and event footage
- `Context/visual-inspiration/` — reference site mobile screenshots
- `Context/logos/` — brand mark files

---

## Working Preferences

- **Mobile-first.** 90% of traffic is mobile. Design and test mobile before desktop. Don't build desktop and squish.
- **Mobile and desktop hero are separate decisions.** Vertical video hero on mobile; hero photograph on desktop. Never letterbox or stretch the vertical video to fit desktop.
- **Page-speed targets are non-negotiable.** Mobile LCP < 2.5s, performance score 85+. See `seo.md` for the full table. Every other SEO win is wasted if speed isn't there.
- **Lock visual decisions before structure work.** Color, type, hero composition decided first. Then sections. Then components.
- **Push the edge, don't play it safe.** I'd rather see you push the attitude on copy and I dial back than see safe-corporate defaults. Confident and playful with attitude is the register. Just not gross.
- **Don't bake new design language into everything before it's approved.** If you propose a new pattern (e.g., the scribble art treatment), mock it up on a placeholder page first.
- **No homepage decoration that fights the moody thesis.** Arcade and LED-video-wall photography do not appear on the homepage. They live on `/arcade/` and `/bowling/` respectively.
- **Specifics beat adjectives.** *"17 traditional lanes + a 6-lane VIP suite"* beats *"upscale bowling experience."* Use real numbers in copy and alt text.
- **Brian Van Flandern in cocktail/bar contexts only.** Don't force the name into food, bowling, arcade, or generic copy.

---

## Locked Decisions (so far)

| Decision | Locked value |
|---|---|
| Lane phrasing (canonical) | *"17 traditional lanes + a 6-lane VIP suite"* — traditional first, VIP as upgrade |
| Mobile hero source | Splice direction locked: pour (`Bank Vs Stories.mp4`) → tap wall (`Beer Wall.mov`) → cocktail (`Best Things To Order.mov`). Total ≤4–5s at current CRF. **Specific window timestamps pending user.** Currently live: Bank Vs Stories 0–4s, single shot. |
| Desktop hero | Video placeholder (`After Social Highlight…_v2.mp4`, 8s recut). Final desktop hero (photo or video) still pending shoot. |
| Hero eyebrow | *PLAINFIELD, IL* — warm-white at 85% opacity, no Glow |
| Hero headline | *"Built for adults."* / *"Fine, bring the kids."* — two lines, all caps, Barlow Cond Black 900 |
| Hero subhead | *"28 self-serve taps · A 6-lane VIP suite · 17 traditional lanes · A chef-inspired menu"* — stats trio + menu beat. Roboto Slab Regular, no italics, narrative "A" articles. 4th item drops below 600px viewport. |
| Hero CTA | **None in the hero.** Sticky bar carries all conversion (*Reserve a lane* solid Glow + *Plan an event* outlined). |
| Closing band (homepage) | *"You can keep doing dinner-and-a-movie. Or you can do this."* |
| Cocktail credential (primary) | *America's Top Mixologist* (Food Network). Per Se / Keller / Michelin three-star framing **retired for the website** — long-form `/craft-bar/` body copy only. |
| Type stack (substitutes) | Display: Barlow Condensed 900 · UI: Montserrat 700 · Body: Roboto Slab 400. Production swap to Adobe Fonts (Proxima Nova Extra Cond Black + Proxima Nova + Yorkten Slab) deferred until kit ID is provided. One CSS-variable change. |
| Headline scale | `clamp(34px, 11vw, 80px)` mobile + `letter-spacing: -0.015em`. Verified glyph fits at 360 / 390 / 412 with ≥8px slack. |
| Eyebrow color rule | Warm-white only. Glow is reserved for the primary CTA in the first viewport. |
| Button radius | 7px on all buttons (not pill, not sharp) |
| Brand mark (hero, top-left) | Logo image (`LogoGBED_Horizontal_White`). Mobile 41px / desktop 56px. Round-4 sizes. |
| Drawer header | Logo image (`Logo_Horizontal_GlowInTheDark`, no GBED tagline). Mobile 73px / desktop 84px. Replaces the retired *"The works."* text. |
| Drawer rows | Lucide line icons right-aligned, 24px, `currentColor` (Glow on hover): martini / bowling-pin / calendar / utensils-crossed / map-pin. Bowling pin hand-drawn in matching Lucide stroke style — Lucide doesn't ship one. |
| Sticky CTA bar (mobile) | Always-visible bottom bar. *Reserve a lane* = primary (Glow solid). *Plan an event* = deliberate alternate (Indigo Deep solid + warm-white outlined border + warm-white text). Lives in layout, not Hero. |
| CTA hierarchy (global) | Primary: Glow solid. Alternate: Indigo Deep solid + warm-white outlined. Same recipe in desktop header and mobile sticky bar. *Restraint as confidence* — the deliberate user finds the quieter button. |
| Persistent header (desktop) | `SiteHeader` global component. Logo (left) + inline nav BAR · EAT · BOWL · GAME · EVENTS · MORE ▼ (center) + Reserve / Plan CTAs (right). Light translucent scrim + backdrop blur. MORE dropdown click-only. Active-page underline (Glow, 1px) on current page only. |
| Persistent header (mobile) | Logo (left) + hamburger (right). Inline nav + CTAs hidden; CTAs live in the bottom sticky bar. |
| Coupon banner | Retired (built and removed same-day). Coupon reaches users via MORE dropdown (`/free-10/`) + footer. |
| Visual mood | Moody/neutral, dark backgrounds, warm wood + copper accents, photo-led, bold display type. *Not* neon. |
| Bowling positioning | VIP suite is the bowling shot on the homepage. Traditional lanes acknowledged lower. |
| Reserved copy (cocktail/bar section H2) | Short: *"Built by America's Top Mixologist. (Their words, not ours.)"* · Full: *"Cocktails this serious aren't supposed to live at bowling alleys. Built by America's Top Mixologist."* — held for the future cocktail/bar block. Don't pre-spend. |
| Deprecated copy | *"The bar that bowls."* (retired) · *"Built for adults. Kids will come."* (superseded by *"Fine, bring the kids."*) · *"Built by America's Top Mixologist. (Their words, not ours.)"* in **hero subhead slot** (retired — moved to reserved-copy for cocktail/bar H2; "built by" carried through from headline and misimplied the mixologist built the venue). |
| Workflow | Direct-to-main pushes after one-time `feat/hero-round-2` round. Vercel auto-deploys on push. |

---

## In Progress

- **Hero is live** (2026-04-30) at https://twistedpin-website.vercel.app — main-tip auto-deploys from each push.
- **Ornamental comparison (deliverable #3)** — next up. Formation arrows / Pin mark / clean-minimal / scribble-watermark, rendered as section dividers between the live hero and a placeholder second section.
- **Homepage structure planning (deliverable #4)** — queued after the ornamental decision lands.
- **Mobile hero video splice** — direction approved (3 sources), specific window timestamps pending user.
- **Adobe Fonts kit ID** — pending; substitutes ship in their place.
- **Phase 2 desktop architecture** — 6-section weighted-height structure spec'd and approved; held pending Phase 1 review.
- **API batch round** — Hours sync (Google Places), real phone, social URLs, footer route hrefs, real cocktail video. Bundled rather than one-at-a-time.

---

## Out of Scope (don't touch unless asked)

- Print and signage applications — those still follow the original brand-guidelines mood
- Rewriting `seo.md` — it's authoritative; honor the URL plan and the targets
- Inventing new logos or sub-brands

---

## Decisions Log

- **2026-04-30 — Hero copy locked.** Eyebrow / headline / subhead / CTA all locked (see table above). Type stack approved with substitute fonts (Barlow Cond / Montserrat / Roboto Slab). Eyebrow shifted from Glow to warm-white; Glow reserved for primary CTA.
- **2026-04-30 — *"The bar that bowls."* deprecated.** Removed from locked copy. Reads as a tagline competing with the headline.
- **2026-04-30 — *"Built for adults. Kids will come."* revised** to *"Built for adults. Fine, bring the kids."* Concessive register replaces the Field-of-Dreams reference. Also re-classified from hero subhead to hero headline.
- **2026-04-30 — Per Se / Keller / Michelin three-star framing retired** for the website's primary positioning. *"America's Top Mixologist"* (Food Network) is the lead credential. The Per Se framing borrowed more prestige than the consulting relationship warranted and pulled the brand toward fine-dining-with-bowling, which is not the locked thesis. Per Se context may still appear in long-form `/craft-bar/` body copy.
- **2026-04-30 — Astro project initialization authorized.** Handoff doc claimed Astro was already initialized — this was wrong. Root contained only `node_modules` (sharp + image utilities), no `package.json` or `astro.config.mjs`. Initializing fresh as part of the live hero deliverable. The "don't initialize until structure planning is approved" rule is now satisfied — visuals are locked enough to ship the hero.
- **2026-04-30 — Sticky CTA bar always-visible on mobile** (vs. hide-on-scroll). Primary conversion element; ~64px is small relative to viewport. Hide-on-scroll can be A/B'd later.
- **2026-04-30 — Self-hosted fonts via `@fontsource`** (vs. Google CDN). LCP-critical: removes second-origin DNS+TLS, enables explicit preload control.
- **2026-04-30 — Vercel deploy via GitHub integration** (vs. CLI direct). Auto-deploys per branch from day one per the established workflow.
- **2026-04-30 — Hero subhead changed from credential to stats trio + menu beat.** New copy: *"28 self-serve taps · A 6-lane VIP suite · 17 traditional lanes · A chef-inspired menu"*. Reason: the old subhead *"Built by America's Top Mixologist…"* started with "Built by", which carried through from the headline *"Built for adults. Fine, bring the kids."* — readers were misimplying the mixologist had built the venue itself, not just the bar program. The credential lines moved to reserved-copy for the future cocktail/bar section H2 (see voice.md).
- **2026-04-30 — In-hero CTA killed.** *"Reserve a lane"* button removed from Hero. The global sticky bar (always-visible bottom on mobile, top-right on desktop) carries 100% of hero conversion now.
- **2026-04-30 — Headline overflow on narrow viewports fixed.** Settled on `clamp(34px, 11vw, 80px)` + `letter-spacing: -0.015em`. Verified glyph fit (not block fit) at 360 / 390 / 412 with 8.78 / 13.09 / 16.31 px slack via Range API.
- **2026-04-30 — Brand mark wired as image.** `LogoGBED_Horizontal_White` for the hero (mobile 41px / desktop 56px after two rounds of size bumps). `Logo_Horizontal_GlowInTheDark` (no GBED tagline) for the drawer header (mobile 73px / desktop 84px).
- **2026-04-30 — Drawer header *"The works."* retired.** Replaced with the GlowInTheDark logo per the Pints & Paddle / Swingers pattern.
- **2026-04-30 — Drawer rows get Lucide line icons.** Right-aligned, 24px, `currentColor`. 4 directly from Lucide; bowling pin hand-drawn in matching stroke style (Lucide doesn't ship one).
- **2026-04-30 — Mobile hero video splice direction locked.** Three sources: pour (Bank Vs Stories) → tap wall (Beer Wall) → cocktail (Best Things To Order). Specific window timestamps pending user. Currently live: Bank Vs Stories single 4s shot.
- **2026-04-30 — Workflow returned to direct-to-main pushes.** One-time `feat/hero-round-2` feature-branch round complete; iteration cadence too fast for ongoing branch ceremony. Vercel auto-deploys on every push to main.
- **2026-05-01 — Persistent SiteHeader shipped (Phase 1 of desktop architecture).** Logo + inline nav (BAR · EAT · BOWL · GAME · EVENTS · MORE ▼) + two solid CTAs (Reserve = Glow, Plan = Copper) on desktop; logo + hamburger on mobile. Resolves the long-standing desktop CTA placement question — both elements now share a single header bar. Active-page indicator: 1px Glow underline, current page only, never on hover. MORE dropdown click-only (no hover-open) for accessibility + touch reliability in 1024–1279px range.
- **2026-05-01 — Live hero copy promoted to match `/snap-test/`.** Eyebrow *PLAINFIELD, IL* and stat-trio subhead retired from `/`. New subhead: *"Plainfield's premier night out. Bowling optional."* Same headline. Brings the live hero in line with the snap-test staging hero — was reading stale on the deployed desktop.
- **2026-05-01 — Coupon banner removed from desktop chrome.** Built and shipped in Phase 1, then killed after review of the deployed treatment. Reasons: (1) didn't earn its space — read promo-y, undercut premium positioning; (2) auto-hides on scroll past hero anyway, so impact was limited; (3) coupon stays reachable via MORE dropdown (`/free-10/`) and footer — those surfaces are sufficient for the audience that wants it. Component file retained at `src/components/CouponBanner.astro` in case it returns; import commented out in `Base.astro`.
- **2026-05-01 — `.btn-copper` added globally.** Documented exception to the "Glow only on the primary CTA" rule. Reserve a Lane (Glow) and Plan an Event (Copper) are co-equal primaries for two different audiences. Contrast verified: Copper #D88B5C with Indigo Deep #0E0A1F text computes to ~6.9:1 (passes WCAG AA at 4.5:1). Mobile sticky CTA's "Plan an event" switched from outlined to copper-solid for brand consistency. **REVERSED 2026-05-01 same day** — see entry below.
- **2026-05-01 — Two co-equal primary CTAs decision REVERSED.** Reviewing the deployed Glow + Copper treatment, two saturated solid buttons competed for attention and read less premium than the brand direction calls for. New treatment, locked: *Reserve a Lane* = primary (Glow solid, Indigo Deep text); *Plan an Event* = deliberate alternate (Indigo Deep solid background + warm-white outlined border + warm-white text). Strategic frame: Reserve is highest-volume / most impulsive intent; Plan is lower-volume / higher-LTV — the motivated user finds the quieter button. **This is the restraint-as-confidence pattern, not a demotion of Plan an Event.** `.btn-copper` class removed from `global.css` (no usages remain). Same hierarchy applies in the desktop header and mobile sticky bar.
- **2026-05-01 — MORE dropdown polish.** Bumped from flat opaque (`rgba(14,10,31,0.95)` + blur 14px) to premium glass (`rgba(14,10,31,0.78)` + blur 18px saturate 140%) so the backdrop blur actually shows through. Border opacity bumped 0.10 → 0.14. Single drop-shadow replaced with a two-tier shadow (`0 8px 16px rgba(0,0,0,0.30), 0 24px 48px rgba(0,0,0,0.45)`) for depth. Picks up the persistent header's chrome vocabulary; sits between fully translucent (header) and fully opaque (modal) on the spectrum because dropdown text needs to read cleanly.
- **2026-05-01 — MORE dropdown overflow fix.** Initial build had `.site-nav ul { display: flex }` which inadvertently selected the dropdown's inner UL too — turned the dropdown into a 663px-wide horizontal flex row that overflowed off the left edge of the viewport. Scoped to `.site-nav > ul` and added explicit `display: block` on `.more-dropdown` for safety.
- **2026-05-01 — Mobile hero logo retired.** `.hero-brand` removed from `Hero.astro` (live `/`) and from the `/snap-test/` snap 1 inline hero. The persistent SiteHeader's logo is now the only logo across all routes. Resolves the mobile-hero-logo redundancy flagged in the desktop architecture brief.
