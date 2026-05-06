# Twisted Pin — Launch Checklist

Operational + technical items that must be resolved before the new build
replaces twistedpin.com. This doc is the running list — update as items
land or change.

For media/imagery/copy needs, see `media-needs.md`. For voice/copy rules,
see `voice.md`. For SEO/page structure, see `seo.md`.

---

## Redirects (301s — preserve SEO equity)

| Legacy URL | Target | Notes |
|---|---|---|
| `/bowling/` | `/bowl/` | Slug rename; primary keyword preserved |
| `/craft-bar/` | `/bar/#cocktails` | Combined into /bar |
| `/self-serve-tap-wall/` | `/bar/#tap-wall` | Combined into /bar |
| `/special-events/` | `/events/` | Consolidated |
| `/corporate-parties/` | `/events/#corporate` | Consolidated |
| `/birthday-parties-booking/` | `/events/#birthday` | Consolidated, slug cleanup |
| `/fundraiser/` | `/events/#fundraiser` | Consolidated |
| `/event-directory/` | `/upcoming-events/` | Consolidated |
| `/free-kids-bowling/` | `/bowl/#free-kids` | Folded |
| `/contact-us/` | `/` | **Note 2026-05-04**: `/contact` page killed — Contact in MORE scrolls to SnapFooter (`#find-us`). Hash anchors don't survive 301s, so legacy `/contact-us/` redirects to `/` (homepage); user finds the footer themselves |
| `/faqs/` | `/faq/` | Slug cleanup |
| `/join-our-team/` | `/careers/` | Slug cleanup |
| `/free-10/` | `/coupon/` | **Renamed 2026-05-04** — old slug → new canonical |
| **DNS authority migration** | (separate runbook) | **2026-05-05**: full DNS cutover plan captured in [dns-migration.md](dns-migration.md). Moves DNS from dev company's Cloudflare account → GoDaddy DNS without their cooperation. Includes captured records, SPF cleanup notes, and step-by-step cutover. Read before launch day. |
| `/event-spaces-for-teams-...` | `/events/#corporate` | Old promotional URL |
| `/group-and-company-events-twisted-pin/` | `/events/#corporate` | Old promotional URL |
| `/experience-the-ultimate-group-event-destination.../` | `/events/` | Old promotional URL |
| `/event-venues-with-a-twist-...` | `/events/` | Old promotional URL |
| `/16378-2/` | `/events/` | Junk URL |
| `/twisted-pin-2024-bowling-league-season-free-beer/` | (keep at original URL — blog post, kept live per 2026-05-04 blog decision) | |
| All NYE 2025 / seasonal promo posts | (keep at original URLs — blog posts) | |
| `/why-us/*` (8 geo subpages) | (keep live, not in nav) | SEO equity preserved |
| `/reserve` | `https://ecom.roller.app/twistedpin/openbowl/en-us/home` | **2026-05-05**: `/reserve` page killed — direct redirect to Roller booking. All in-code "Reserve a lane" CTAs (SiteHeader, StickyCTABar, NavDrawer, /waitlist) point at the Roller URL directly with `target="_blank"`. The vercel.json 308 redirect handles any stray `/reserve` traffic. Revisit if/when we launch our own reservation platform |
| `/essential` | `https://menu.twistedpin.com/essential` | **SMS short link** — 302 (kept temporary; matches current live behavior). Group-event menu picker on Zite. Used in text marketing to customers (`text /essential` to land on the picker). Do not remove |
| `/elevated` | `https://menu.twistedpin.com/elevated` | **SMS short link** — 302. Higher-tier menu picker variant. Same context as `/essential`. Do not remove |

**Shipped 2026-05-06**: full 301 redirect map landed in `vercel.json` (308 permanent redirects via `"permanent": true`). Each legacy slug uses `{/}?` for optional trailing slash, so `/bowling` and `/bowling/` both fire. Three truncated old-promo slugs use prefix patterns (`:rest*`) since the full URL tail wasn't recoverable from existing docs:
- `/event-spaces-for-teams-*` → `/events/#corporate`
- `/experience-the-ultimate-group-event-destination*` → `/events/`
- `/event-venues-with-a-twist-*` → `/events/`

**Validate after deploy:** (1) hash anchors land correctly in browser address bar after redirect (Vercel includes `#fragment` in the Location header but some old crawlers/clients strip fragments on 301/308 — modern Google/Bing handle them); (2) `/contact-us/` → `/` (no anchor — hash anchors don't survive 301s and the 2026-05-04 decision is "user lands on homepage and finds the footer themselves"); (3) verify the prefix-pattern slugs match the real legacy URLs by spot-checking Google Search Console crawl errors after launch.

---

## Operational data — needs ops input

| Item | Currently | Need before launch |
|---|---|---|
| Phone number | `(815) 555-0100` placeholder in SnapFooter + Contact link target | Real number from operations team |
| Hours | **Wired 2026-05-06**: `/pricing` reads from `src/lib/google-hours.ts` (Places API) when `GOOGLE_MAPS_API_KEY` + `GOOGLE_PLACE_ID` are set on Vercel; falls back to static `src/data/hours.ts` until then. SnapFooter still hardcoded "Open today / until 11:00 PM" — pending the same env vars then a small refactor to read from the same lib. | Set `GOOGLE_MAPS_API_KEY` + `GOOGLE_PLACE_ID` on Vercel. Then refactor SnapFooter's `<p class="hours-line">` to use the same lib for consistency. |
| Reviews ratings | Hardcoded `4.5` / `1,053` (Google) and `4.2` / `80` (Yelp) | Real-time pull from Google Places API / Yelp Fusion API, or accept periodic manual updates |
| Email address | `contactus@twistedpin.com` (Email Us button in SnapFooter) | Confirm this is the right inbox; route to operations |
| VIP Suite capacity | "Up to 80" on `/vip-suite` | Confirm with ops |
| Fundraiser stat | "50% of bowling revenue back to host" on `/vip-suite` | Confirm with ops — public-facing claim |

---

## Integrations — credentials / wiring needed

| Integration | Status | Need |
|---|---|---|
| **Roller booking** | URL confirmed: `https://ecom.roller.app/twistedpin/openbowl/en-us/home`. **2026-05-05**: `/reserve` page killed — all "Reserve a lane" CTAs (SiteHeader, StickyCTABar, NavDrawer, /waitlist closing band) link directly to Roller in a new tab. Stray `/reserve` traffic gets a 308 redirect via vercel.json. Revisit if/when we launch our own reservation platform | Direct link is the pattern. No further wiring needed unless we build our own platform |
| **Zite events platform** | **Shipped 2026-05-06.** All "Plan an event" CTA buttons + intentful inline links now go direct to `https://twistedevents.zite.so/` with `target="_blank" rel="noopener"` — same pattern as Reserve → Roller. Locations swapped: SiteHeader CTA, StickyCTABar, NavDrawer (CTA + drawer row), `/vip-suite`, `/events` closing-band, `/gift-cards`, `/faq` (×2), `/upcoming-events`. Educational links kept on local `/events`: homepage SnapStub teaser, homepage "Learn more" stub, `/leagues` "See group events". | If a vanity subdomain (`events.twistedpin.com` or otherwise) lands later, swap the URL constant in NavDrawer.astro + faq.astro + events.astro and inline strings in SiteHeader/StickyCTABar/vip-suite/gift-cards/upcoming-events. The constant is repeated rather than hoisted (matches the existing ROLLER_URL pattern; refactor to shared constants module flagged as tech debt for the third use). |
| **GoTab API** | **Shipped 2026-05-05.** OAuth Client Credentials wired in `src/lib/gotab.ts`. Cocktail menu (`/menu/cocktails`) reads from "View Only Cocktail Menu"; food menu (`/menu/food`) reads from "View Only Menu" (filtered to food categories). Build-time fetch + 4am cron rebuild keeps data fresh within ~24h. 3 env vars on Vercel: `GOTAB_CLIENT_ID`, `GOTAB_CLIENT_SECRET`, `GOTAB_LOCATION_ID` | Done |
| **Untappd Business API** | **Shipped 2026-05-05.** HTTP Basic auth in `src/lib/untappd.ts`. Tap list (`/menu/taps`) reads location → menus → sections → items. 28 taps confirmed (23 Draft + 1 NA + 4 Wine). 3 env vars on Vercel: `UNTAPPD_EMAIL`, `UNTAPPD_API_KEY`, `UNTAPPD_LOCATION_ID` | Done |
| **Daily auto-rebuild cron** | **Shipped 2026-05-05.** Vercel Cron (`vercel.json`) at 9 UTC daily hits `/api/cron/rebuild` → POSTs deploy hook → fresh build re-fetches GoTab + Untappd. 2 env vars on Vercel: `CRON_SECRET`, `VERCEL_DEPLOY_HOOK_URL` | Done |
| **TablesReady waitlist** | `/waitlist` shipped 2026-05-04 wrapping `host.tablesready.com/p/waitlist/twistedpin` (no X-Frame headers, embeds cleanly). User flagged inner iframe content as ugly; webhook-derived state explored and **tabled** pending plan upgrade. See [waitlist-theory.md](waitlist-theory.md) for full theory + revisit checklist | When revisiting: upgrade TablesReady plan tier → run webhook.site test → capture real payloads → resolve `party.checked_in` ambiguity → build webhook receiver + state store + 4am reset → swap iframe for live-data render |
| **Cross-subdomain tracking** | UTM-tagging set up per user | Verify: GTM / Meta Pixel / GA4 tags set on `.twistedpin.com` (with leading dot) so they fire on both main + `events.twistedpin.com` subdomain |
| **Google Places API** (live hours) | **Wired 2026-05-06.** `src/lib/google-hours.ts` fetches the Business Profile's `regularOpeningHours` and exposes a `LiveHours` map per weekday. `/pricing` uses live data when available, falls back to static `src/data/hours.ts` when not. Same graceful-fallback pattern as gotab/untappd. Daily cron rebuild keeps cache fresh. | **2 env vars to set on Vercel:** `GOOGLE_MAPS_API_KEY` (Maps Platform → Places API enabled) and `GOOGLE_PLACE_ID` (the Twisted Pin Business Profile place ID — find via [Place ID Finder](https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder)). Once set, `/pricing` will drop the "verify on Google" caveat from the hours line on each day. |
| **Patch Retention API** (coupon signup) | **Shipped 2026-05-05.** `/coupon` ships a native form that POSTs to `/api/coupon-signup` (server endpoint) which upserts into Patch via `PATCH /v2/contacts?match:phone={phone}`. Replaces the legacy iframe. API key + Account ID kept server-side. **Trigger pattern is open** — pending Patch support response on how to replicate the iframe's DOI/verification + coupon SMS flow via API. Submissions land in Patch contact list; coupon SMS path is TBD. | **2 env vars set on Vercel:** `PATCH_API_KEY` and `PATCH_ACCOUNT_ID` (live as of 2026-05-05). Birthday is sent as `MM/DD/1900` (placeholder year — form asks for MM/DD only since year is irrelevant for birthday-month/day automations). **Pending from Patch support:** (1) does the API expose the DOI/phone-verification flow? (2) what's the canonical "web form → coupon SMS" trigger pattern (contact.created event listener, custom event type, etc.)? (3) is there an endpoint to apply a tag to a contact (the docs only show /v2/tags as create/list of tag definitions)? Update this row + the API endpoint when Patch responds. |

---

## Pages to build before launch

Pillars (real pages with content):
- [x] `/events` — shipped 2026-05-05 (typography hero + 2 editorial sections + closing CTA band → Zite at events.twistedpin.com)
- [x] `/bowl` — shipped 2026-05-05 (17 traditional lanes section + VIP suite preview + cross-links to /leagues + #free-kids anchor for the 301 from /free-kids-bowling/)
- [x] `/game` — shipped 2026-05-05 (arcade inventory + "adults play too" positioning, full-neon photography OK on this page per visual-direction.md)
- [x] `/reserve` — killed; direct redirect to Roller via vercel.json + in-code CTA swap. See Redirects table above
- [ ] `/gift-cards` — pending fact-check that gift card flow exists today; if yes, "available in-store only" page

Tier 2 (utility / secondary):
- [x] `/leagues` — shipped 2026-05-05 as a tier-2 stub. Will County service area + email contact for current schedule. Pending ops: real league schedule, signup form/destination
- [x] `/rewards` — shipped 2026-05-05 as a tier-2 stub. "Sign up at the front desk" framing + email contact for program specifics. Pending ops: program mechanics (earn rate, redemption rules, app vs in-store), confirm loyalty platform
- [x] `/upcoming-events` — **rebuilt 2026-05-06** as a real calendar page reading from the `events` Astro content collection (`src/content/events/*.md`). Workflow: drop a markdown file with frontmatter (`title`, `start`, optional `end`, `location`, `cta { label, href }`, `tentative`, `virtual`, `draft`), push, and the daily 4am cron rebuild surfaces it. Past events auto-hide once `end` (or `start` if no `end`) is in the past. Empty state: "Calendar's clear right now. Want to fill it? Plan an event →" — brand-voiced fallback for zero-event windows. Cards group by month (DECEMBER 2026 etc.) with a date block / title / time / location / optional description / single CTA per row.
- [x] `/faq` — shipped 2026-05-05 with all 16 Q&As scraped from live `/faqs/` + voice cleanup (Brian Van Flandern → "America's Top Mixologist" framing) + FAQPage JSON-LD schema for Google rich results. Native `<details>/<summary>` accordion
- [x] `/careers` — shipped 2026-05-05 as a tier-2 stub. Email-resume-to-contactus framing. Pending ops: open positions list, confirm if HR platform (Indeed/Workable/ADP) handles applications
- [x] `/gift-cards` — shipped 2026-05-05 as a tier-2 page. FAQ-confirmed in-store-only flow ("bowling and arcade purchases only"). Live site /gift-cards/ was 404 — this fills the gap
- [x] `/coupon` — shipped 2026-05-05 as a native form (replaces legacy iframe). POSTs to `/api/coupon-signup` → Patch Retention upsert. Voice reframe applied: "$10 OFF" → "$10 lane credit" (matches /rewards reframe). Pending: `PATCH_API_KEY` + `PATCH_TAG` env vars on Vercel
- [x] `/waitlist` — shipped 2026-05-04 (TablesReady iframe wrapped in brand chrome). Webhook-derived state version tabled — see [waitlist-theory.md](waitlist-theory.md)

Already shipped: `/`, `/bar`, `/eat`, `/vip-suite`, `/waitlist`, `/events`, `/bowl`, `/game`, `/faq`, `/leagues`, `/upcoming-events`, `/rewards`, `/careers`, `/gift-cards`, `/menu/cocktails`, `/menu/taps`, `/menu/food`, `/new-years-eve`, `/pricing`, `/privacy`, `/terms`, `/accessibility` (22 pages — `/pricing` added 2026-05-06).

`/pricing` notes (2026-05-06): day-tabbed walk-in pricing reading from `src/data/pricing.ts` (4 distinct schedules: Mon-Thu single rate / Fri Sat Sun two-window with peak/off-peak split — note Sun is reversed, late is cheaper). Specials surface inline via the `specials` content collection (Penny A Pin Wed first entry, replaces Trad rate). Holiday note preserved from current site ("Holidays follow Friday 5pm pricing"). Live Google hours wired but pending env vars on Vercel (see Integrations table). Page is in NavDrawer's Info section at the top, accessed via hamburger.

Seasonal pages (live at URL year-round, surface in NavDrawer only inside their date window — config in `src/config/nav-seasonal.ts`):
- [x] `/new-years-eve` — shipped 2026-05-06 with NYE.mp4 video hero (encoded to /public/snap/nye-* in 4 variants matching the beerwall pipeline). Auto-shows in drawer Nov 15 → Jan 2. Page is reachable year-round so the upcoming-events card deep-link always resolves. Body copy is voice-y placeholder; pending ops package details (price tiers, what's included, ticket flow).

Decisions made: `/contact` page killed (rerouted to footer); `/blog/` index killed (posts kept live at original URLs, no new content).

---

## Pre-launch sweeps

- [x] **Hard-ban word sweep** (2026-05-05): grep'd every page for `private`, `cheap`, `discount`, `value`, `deals`, `budget-friendly`. One real hit found and fixed: `/game` "the cheap stuff" → "the small stuff". All other matches are docstring references documenting the rule itself, or the explicitly-approved "semi-private" framing for the VIP suite.
- [x] **Nav-coverage / internal-href sweep** (2026-05-05): grep'd all internal hrefs across pages + components. Findings:
  - 6 homepage `SnapStub` placeholders fixed (`href="#"` → real pillar pages: `/bar/`, `/eat/`, `/bowl/`, `/game/`, `/events/`)
  - `SnapFooter` UTILITY_LINKS: FAQ/Careers/Gift Cards `#` placeholders fixed; Privacy/Accessibility kept `#` (those pages don't exist yet — flagged below)
  - `SnapFooter` social: Instagram + Facebook hrefs wired to real URLs from twistedpin.com JSON-LD schema (`instagram.com/twistedpinplainfield/`, `facebook.com/twistedpin`); TikTok kept `#` pending ops
  - **Known unresolved:** `/coupon/` linked in NavDrawer but page not built (intentional — kept on legacy operational flow per existing decision). The `#cocktail-menu`, `#menu`, `#tap-list` anchors on `/bar` and `/eat` were resolved 2026-05-05 by extracting menus to dedicated `/menu/*` pages and repointing the CTAs.
- [x] **Sitemap setup** (2026-05-05): `@astrojs/sitemap` integration added. `sitemap-index.xml` + `sitemap-0.xml` generate at build time with all 14 routes. **Pre-launch action:** swap `site` URL in `astro.config.mjs` from Vercel staging to `https://www.twistedpin.com` and resubmit to Google Search Console.
- [ ] **301 monitoring**: after deploy, monitor Search Console for crawl errors weekly for the first 60 days
- [ ] **Lighthouse / performance re-test** — full history (baseline + optimization passes + future runs) lives in [perf-history.md](perf-history.md). 2026-05-05 baseline: Desktop 100/100/100/100, Mobile 86 with LCP 3.9s. Five-fix optimization pass shipped same day (commits `7912752` + `881e397`); see perf-history for what's done vs deferred. **Don't re-test** until real photography + final hero splice land — placeholder content gives misleading numbers. Compare next run against the baseline in perf-history.md.
- [x] **Privacy + Terms + Accessibility pages** (2026-05-05): all three shipped. `/privacy` and `/terms` ported from live twistedpin.com with light voice/format cleanup; `/accessibility` is a standard hospitality-venue statement (WCAG 2.1 AA target, known limitations called out, remediation contact path). Global `:focus-visible` ring also added to `global.css` (biggest a11y gap before — keyboard users now get a Glow outline on Tab). All three pages flagged for counsel pass before launch — they're working drafts modeled on what's live, not attorney-reviewed

---

## Tech debt / pre-launch refactors (developer-facing)

- [ ] **`.pillar-*` CSS hoist** — `.bar-*` / `.eat-*` / `.vip-*` CSS is now triplicated. Hoist shared rules to `.pillar-*` utilities in `global.css`. Each page keeps only content-specific overrides
- [ ] **Section image variety** — `/bar`, `/eat`, `/vip-suite` reuse homepage section photos. Once distinct photography lands, swap
- [ ] **MORE icon module** — Lucide icon paths are duplicated between `SiteHeader.astro` (MORE dropdown) and `NavDrawer.astro` (mobile drawer). On a third use, hoist `ICON_PATHS` to a shared icon module
- [ ] **Hero.astro cleanup** — `src/components/Hero.astro` is unused since the homepage was promoted from `/snap-test/` and uses an inlined hero. Delete in a cleanup pass
- [ ] **CouponBanner.astro cleanup** — retired component file retained "in case it returns." If decision holds (it's been weeks), delete
- [ ] **launch.json autoPort** — set during this build for dev tooling; consider pinning Astro's port via `vite.server.port` so the preview tool's proxy stays aligned

---

## Out of scope for launch (filed for post-launch polish)

- Mobile hero video splice timestamps (3-source direction locked, timestamps pending)
- Desktop hero video — final treatment (photo Ken-Burns or video, pending shoot)
- OG / share card image (1200×630) for social previews
- "What's On" rename for `/upcoming-events`
- UTM-tagging refinement / Avery lead-prioritization workflow
- Hamburger restructure to sectioned EXPERIENCE / VISIT / MORE format if mobile audit shows current 5-slot drawer is insufficient (decision pending mobile audit)
- Per-pillar gallery pages (`/bar/photos`, etc.) if needed
- Blog: dormant (posts live, no new content). Reconsider only if SEO landscape shifts back toward content marketing for local businesses
