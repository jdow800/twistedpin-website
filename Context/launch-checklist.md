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
| `/event-spaces-for-teams-...` | `/events/#corporate` | Old promotional URL |
| `/group-and-company-events-twisted-pin/` | `/events/#corporate` | Old promotional URL |
| `/experience-the-ultimate-group-event-destination.../` | `/events/` | Old promotional URL |
| `/event-venues-with-a-twist-...` | `/events/` | Old promotional URL |
| `/16378-2/` | `/events/` | Junk URL |
| `/twisted-pin-2024-bowling-league-season-free-beer/` | (keep at original URL — blog post, kept live per 2026-05-04 blog decision) | |
| All NYE 2025 / seasonal promo posts | (keep at original URLs — blog posts) | |
| `/why-us/*` (8 geo subpages) | (keep live, not in nav) | SEO equity preserved |

To do: implement these in `vercel.json` rewrites/redirects. Validate after deploy: hash anchors work where used (`/bar#cocktails`, etc.) — some servers strip fragments on 301.

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
| **Roller booking** | URL confirmed: `https://ecom.roller.app/twistedpin/openbowl/en-us/home`. Currently used as direct external link from sticky-bar "Reserve a Lane" CTA | Wire into `/reserve` page when built (Roller iframe wrapper) — until then, keep direct external link |
| **Zite events platform** | Subdomain not yet deployed (`events.twistedpin.com`) | Coordinated launch with Avery's polish. **After deploy: sweep all "Plan an event" hrefs** from `/events` (main, placeholder) → `events.twistedpin.com` (subdomain). Currently several locations reference `/events` as placeholder: SiteHeader CTA, StickyCTABar, /vip-suite, etc. |
| **GoTab API** | Not integrated. Quick-start docs say GraphQL + OAuth 2.0 (Client Credentials Grant). Menu endpoint + data shape live in separate "Products & Menus 101" docs (not yet read) | OAuth credentials provisioned by ops. Powers `/bar` "View what's on tap" + "View cocktail menu" CTAs and `/eat` "View the menu" CTAs. Spike the menu data shape before designing the menu component |
| **TablesReady waitlist** | Iframe URL needed for `/waitlist` page | Get iframe URL/embed snippet from ops; build branded chrome wrapper |
| **Cross-subdomain tracking** | UTM-tagging set up per user | Verify: GTM / Meta Pixel / GA4 tags set on `.twistedpin.com` (with leading dot) so they fire on both main + `events.twistedpin.com` subdomain |

---

## Pages to build before launch

Pillars (real pages with content):
- [ ] `/events` — popular events listing + "Plan My Event" CTA → Zite. Most important page (ad-spend landing target)
- [ ] `/bowl` — anchor sections to leagues / free-kids / vip-suite (cross-link)
- [ ] `/game` — arcade pillar (no full-neon photography per visual-direction.md)
- [ ] `/reserve` — Roller iframe wrapper with brand chrome
- [ ] `/gift-cards` — pending fact-check that gift card flow exists today; if yes, "available in-store only" page

Tier 2 (utility / secondary):
- [ ] `/leagues` — port from old site or rebuild
- [ ] `/rewards` — port from old site or rebuild
- [ ] `/upcoming-events` — listing page (CMS or static markdown)
- [ ] `/faq` — port from old site or rebuild
- [ ] `/careers` — port from old site or rebuild
- [ ] `/coupon` — kept as-is operationally (renamed from `/free-10`); confirm it ports cleanly
- [ ] `/waitlist` — TablesReady iframe with brand chrome

Already shipped: `/`, `/bar`, `/eat`, `/vip-suite`.

Decisions made: `/contact` page killed (rerouted to footer); `/blog/` index killed (posts kept live at original URLs, no new content).

---

## Pre-launch sweeps

- [ ] **Hard-ban word sweep**: grep every built page for `private`, `cheap`, `discount`, `value`, `deals`, `budget-friendly`. Zero hits required. (See `voice.md` Words to Avoid for the full list.)
- [ ] **Nav-coverage sweep**: every built page has at least one inbound nav link OR is intentionally not in nav (geo SEO pages, blog posts, 301-only). Document the intentional exceptions
- [ ] **404 sweep**: every internal link resolves. Especially after the Zite subdomain launches and we sweep `/events` placeholders
- [ ] **Sitemap regen**: build a new `sitemap.xml` with the new URL structure; submit to Google Search Console
- [ ] **301 monitoring**: after deploy, monitor Search Console for crawl errors weekly for the first 60 days
- [ ] **Lighthouse / performance check**: hit the seo.md targets — Mobile LCP < 2.5s, Performance score 85+

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
