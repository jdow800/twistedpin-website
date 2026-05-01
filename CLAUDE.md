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
| Mobile hero source | `Context/videos/Best Things To Order.mov`, recut 0–4s, hold first frame ~0.4s extra |
| Desktop hero | Hero photograph (not vertical video). Placeholder: `AIV01579.jpg` (cocktail pour). Final selection still pending. |
| Hero eyebrow | *PLAINFIELD, IL* — warm-white at 85% opacity, no Glow |
| Hero headline | *"Built for adults."* / *"Fine, bring the kids."* — two lines, all caps, Barlow Cond Black 900 |
| Hero subhead | *"Built by America's Top Mixologist. (Their words, not ours.)"* — Roboto Slab Regular, parenthetical italicized |
| Hero CTA (primary) | *Reserve a lane* — Glow background, 7px radius, only Glow element in first viewport |
| Closing band (homepage) | *"You can keep doing dinner-and-a-movie. Or you can do this."* |
| Cocktail credential (primary) | *America's Top Mixologist* (Food Network). Per Se / Keller / Michelin three-star framing **retired for the website** — long-form `/craft-bar/` body copy only. |
| Type stack (substitutes) | Display: Barlow Condensed 900 · UI: Montserrat 700 · Body: Roboto Slab 400. Production swap to Adobe Fonts (Proxima Nova Extra Cond Black + Proxima Nova + Yorkten Slab) deferred until kit ID is provided. One CSS-variable change. |
| Eyebrow color rule | Warm-white only. Glow is reserved for the primary CTA in the first viewport. |
| Button radius | 7px on all buttons (not pill, not sharp) |
| Sticky CTA bar (mobile) | Always-visible bottom bar, two equal-weight buttons: *Reserve a lane* (solid Glow) + *Plan an event* (outlined warm-white). Lives in layout, not Hero. |
| Sticky header (desktop) | Same two CTAs top-right of a sticky header. |
| Drawer header | *"The works."* — when hamburger drawer opens (hero menu icon, no text label) |
| Visual mood | Moody/neutral, dark backgrounds, warm wood + copper accents, photo-led, bold display type. *Not* neon. |
| Bowling positioning | VIP suite is the bowling shot on the homepage. Traditional lanes acknowledged lower. |
| Reserved copy (cocktail/bar section header) | *"Cocktails this serious aren't supposed to live at bowling alleys."* — held for the cocktail/bar block lower on the homepage. Don't pre-spend. |
| Deprecated copy | *"The bar that bowls."* (retired) · *"Built for adults. Kids will come."* (superseded by *"Fine, bring the kids."*) |

---

## In Progress

- **Live hero shipping to Vercel preview** (current deliverable, 2026-04-30) — Astro + Motion One, mobile-first, with global sticky CTA bar
- Ornamental comparison (deliverable #3) — Formation arrows / Pin mark / clean-minimal / scribble-watermark, rendered as section dividers against the live hero. Queued behind the preview ship.
- Homepage structure planning — queued after ornamental decision lands
- Adobe Fonts kit ID — pending; substitutes (Barlow Cond / Montserrat / Roboto Slab) ship in their place

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
