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

To do: implement remaining 301s in `vercel.json` rewrites/redirects (the /reserve one is shipped). Validate after deploy: hash anchors work where used (`/bar#cocktails`, etc.) — some servers strip fragments on 301.

---

## Operational data — needs ops input

| Item | Currently | Need before launch |
|---|---|---|
| Phone number | `(815) 555-0100` placeholder in SnapFooter + Contact link target | Real number from operations team |
| Hours | Static "Open today / until 11:00 PM" | Real-time hours via Google Places API (cached daily) OR static schedule + JS open/closed calculator OR confirm "Open today / until 11:00 PM" is accurate enough as a placeholder |
| Reviews ratings | Hardcoded `4.5` / `1,053` (Google) and `4.2` / `80` (Yelp) | Real-time pull from Google Places API / Yelp Fusion API, or accept periodic manual updates |
| Email address | `contactus@twistedpin.com` (Email Us button in SnapFooter) | Confirm this is the right inbox; route to operations |
| VIP Suite capacity | "Up to 80" on `/vip-suite` | Confirm with ops |
| Fundraiser stat | "50% of bowling revenue back to host" on `/vip-suite` | Confirm with ops — public-facing claim |

---

## Integrations — credentials / wiring needed

| Integration | Status | Need |
|---|---|---|
| **Roller booking** | URL confirmed: `https://ecom.roller.app/twistedpin/openbowl/en-us/home`. **2026-05-05**: `/reserve` page killed — all "Reserve a lane" CTAs (SiteHeader, StickyCTABar, NavDrawer, /waitlist closing band) link directly to Roller in a new tab. Stray `/reserve` traffic gets a 308 redirect via vercel.json. Revisit if/when we launch our own reservation platform | Direct link is the pattern. No further wiring needed unless we build our own platform |
| **Zite events platform** | Subdomain not yet deployed (`events.twistedpin.com`) | Coordinated launch with Avery's polish. **After deploy: sweep all "Plan an event" hrefs** from `/events` (main, placeholder) → `events.twistedpin.com` (subdomain). Currently several locations reference `/events` as placeholder: SiteHeader CTA, StickyCTABar, /vip-suite, etc. |
| **GoTab API** | **Shipped 2026-05-05.** OAuth Client Credentials wired in `src/lib/gotab.ts`. Cocktail menu (`/menu/cocktails`) reads from "View Only Cocktail Menu"; food menu (`/menu/food`) reads from "View Only Menu" (filtered to food categories). Build-time fetch + 4am cron rebuild keeps data fresh within ~24h. 3 env vars on Vercel: `GOTAB_CLIENT_ID`, `GOTAB_CLIENT_SECRET`, `GOTAB_LOCATION_ID` | Done |
| **Untappd Business API** | **Shipped 2026-05-05.** HTTP Basic auth in `src/lib/untappd.ts`. Tap list (`/menu/taps`) reads location → menus → sections → items. 28 taps confirmed (23 Draft + 1 NA + 4 Wine). 3 env vars on Vercel: `UNTAPPD_EMAIL`, `UNTAPPD_API_KEY`, `UNTAPPD_LOCATION_ID` | Done |
| **Daily auto-rebuild cron** | **Shipped 2026-05-05.** Vercel Cron (`vercel.json`) at 9 UTC daily hits `/api/cron/rebuild` → POSTs deploy hook → fresh build re-fetches GoTab + Untappd. 2 env vars on Vercel: `CRON_SECRET`, `VERCEL_DEPLOY_HOOK_URL` | Done |
| **TablesReady waitlist** | `/waitlist` shipped 2026-05-04 wrapping `host.tablesready.com/p/waitlist/twistedpin` (no X-Frame headers, embeds cleanly). User flagged inner iframe content as ugly; webhook-derived state explored and **tabled** pending plan upgrade. See [waitlist-theory.md](waitlist-theory.md) for full theory + revisit checklist | When revisiting: upgrade TablesReady plan tier → run webhook.site test → capture real payloads → resolve `party.checked_in` ambiguity → build webhook receiver + state store + 4am reset → swap iframe for live-data render |
| **Cross-subdomain tracking** | UTM-tagging set up per user | Verify: GTM / Meta Pixel / GA4 tags set on `.twistedpin.com` (with leading dot) so they fire on both main + `events.twistedpin.com` subdomain |
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
- [x] `/upcoming-events` — shipped 2026-05-05 as a tier-2 stub. Routes users to Instagram for the live calendar. Pending: real events feed (CMS, content collection, or third-party feed)
- [x] `/faq` — shipped 2026-05-05 with all 16 Q&As scraped from live `/faqs/` + voice cleanup (Brian Van Flandern → "America's Top Mixologist" framing) + FAQPage JSON-LD schema for Google rich results. Native `<details>/<summary>` accordion
- [x] `/careers` — shipped 2026-05-05 as a tier-2 stub. Email-resume-to-contactus framing. Pending ops: open positions list, confirm if HR platform (Indeed/Workable/ADP) handles applications
- [x] `/gift-cards` — shipped 2026-05-05 as a tier-2 page. FAQ-confirmed in-store-only flow ("bowling and arcade purchases only"). Live site /gift-cards/ was 404 — this fills the gap
- [x] `/coupon` — shipped 2026-05-05 as a native form (replaces legacy iframe). POSTs to `/api/coupon-signup` → Patch Retention upsert. Voice reframe applied: "$10 OFF" → "$10 lane credit" (matches /rewards reframe). Pending: `PATCH_API_KEY` + `PATCH_TAG` env vars on Vercel
- [x] `/waitlist` — shipped 2026-05-04 (TablesReady iframe wrapped in brand chrome). Webhook-derived state version tabled — see [waitlist-theory.md](waitlist-theory.md)

Already shipped: `/`, `/bar`, `/eat`, `/vip-suite`, `/waitlist`, `/events`, `/bowl`, `/game`, `/faq`, `/leagues`, `/upcoming-events`, `/rewards`, `/careers`, `/gift-cards`, `/menu/cocktails`, `/menu/taps`, `/menu/food` (17 pages — three menu pages added 2026-05-05).

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
- [ ] **Lighthouse / performance check**: hit the seo.md targets — Mobile LCP < 2.5s, Performance score 85+. **Baseline captured 2026-05-05 against `https://twistedpin-website.vercel.app/`:**
  - **Desktop:** Performance / Accessibility / Best Practices / SEO all 100. FCP 0.3s, LCP 0.7s, TBT 10ms, CLS 0. **No work needed.**
  - **Mobile:** Perf 86, A11y 100, BP 100, SEO 100. FCP 1.5s ✓, **LCP 3.9s ❌** (target < 2.5s), TBT 0ms ✓, CLS 0 ✓, Speed Index 4.1s. Above the 85 threshold but LCP is in the yellow band.
  - **Lighthouse insights flagged:** Render-blocking requests (~720 ms savings), Improve image delivery (~120 KiB savings), Avoid enormous network payloads (5,900 KiB total — driven mostly by hero video on mobile).
  - **Re-test cadence:** re-run after real photography + final hero video splice land — adding real content typically *worsens* perf, so the baseline above is optimistic. Don't ship optimization work until content is final or you'll optimize twice.
- [ ] **LCP optimization session (mobile)** — single-issue fix for the failing Web Vital. ~1-2 hours when content's stable. Specific items:
  1. **Mobile hero serves 1080w video when 540w exists.** `hero-mobile-h264-1080.mp4` is 1.8 MB, `hero-mobile-h264-540.mp4` is 749 KB. Add `<source media="(max-width: 480px)" src="/hero/hero-mobile-{av1,h264}-540.mp4">` entries before the 1080 sources in `src/pages/index.astro`. Saves ~1 MB per mobile load. **Biggest single win.**
  2. **Hero poster may not be painting before video bytes arrive.** Filmstrip showed 5 blank frames then content — suggests the `poster` attribute isn't acting as the LCP element. Investigate: add `<link rel="preload" as="image" href="/hero/hero-poster.webp">` to `Base.astro` head, verify `<video>` element is in the initial layout (not delayed by render-blocking CSS), consider replacing poster-on-video with a separate `<img>` first-frame that fades to video.
  3. **Render-blocking CSS — 720 ms savings.** Mostly the `@fontsource/*` imports in `global.css`. Verify `font-display: swap` is set; consider preloading Barlow Cond 900 (used on H1) via `<link rel="preload" as="font" crossorigin>`; consider moving `@fontsource` imports to the bottom of `global.css` so they don't block initial render.
  4. **Tap wall video has no 540w variant.** `beerwall-mobile-{av1,h264}-1080.mp4` is the only encoded variant; gets fetched when user scrolls to the tap wall section. Add 540w encodes to `scripts/build-snap-video.sh` and add a `<source media>` query, same pattern as #1.
  5. **Image delivery 120 KiB savings.** Re-encode the `<picture>` images as AVIF in addition to webp+jpg. AVIF is 20-30% smaller than webp at equivalent quality. Update `scripts/build-snap-images.mjs` to add `.avif` outputs and add `<source type="image/avif">` entries to `<picture>` blocks before the webp source.
  - **Expected outcome:** Mobile perf 86 → 92-96, LCP 3.9s → ~1.5-2.0s.
- [ ] **Video compression audit (mobile bandwidth)** — user observation 2026-05-05: hero video looks "very HD" on mobile, suggesting room to push CRF higher without quality loss. Current settings: H.264 CRF 28 / AV1 CRF 36 on mobile. Could push to CRF 32-34 H.264 / CRF 40 AV1 for an additional 30-40% byte reduction with minimal visible quality loss on phone screens. Lower priority than #1 above (which addresses the same bandwidth concern by using the existing 540w variants); revisit only if 540w switch isn't enough.
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
