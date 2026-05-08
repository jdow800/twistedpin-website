# Twisted Pin — Session Handoff (2026-05-08, page-by-page copy + SEO infra + SMS compliance)

Paste this verbatim as the first message of the next chat. Read `CLAUDE.md` (especially the Decisions Log), `Context/voice.md`, `Context/launch-checklist.md`, `Context/session-handoffs/2026-05-08-schema-rebuild-lcp-fundraisers.md` (earlier today), and this handoff before doing any work.

---

## TL;DR

Three commits today on top of the prior 2026-05-08 schema-rebuild handoff:

1. **`ed7dfa3` — Page-by-page copy review pass** (18 files, 352+/137-). Voice + accuracy sweep across every pillar driven by ops corrections. Brian Van Flandern named directly across 5 surfaces. "Main floor" purged from public copy (single-level venue). VIP suite partial-booking framing (2/4/6 lanes, not implied takeover). `/events` billing model corrected (run a tab or drink tickets only — not "open bar/host bar"). `/eat` H2 swapped from the dishonest "no fryer hideout" to "Plates worth ordering twice." `/game` stripped of pinball (lives in bar area) and the giant-bear-as-ticket-prize claim. `/leagues` full rewrite with real Fall 2026 USBC lineup. Plus a content-collection PINNED_PICKS pattern in `gotab-food.ts`.

2. **`8be7391` — On-page SEO infrastructure** (14 files). Closed the consensus findings from three SEO audits: `robots.txt` w/ Sitemap directive, `llms.txt` for GEO, OG + Twitter Card tags via `Base.astro` (default og:image = DSC_0344 cropped 1200×630), canonical link, brand-correct favicon (Pin logo replacing Astro default), YouTube confirmed and added to SnapFooter + schema `sameAs`, SnapFooter review counts synced to schema (1,141 / 99), homepage title trimmed 69→58 chars, meta trimmed 179→146 chars, HSTS header.

3. **`9f8e119` — Privacy + Terms: SMS messaging program update** (2 files). Substantive rewrite for SMS approval. Dow Holdings Inc named as operating entity. Verbal phone opt-in path documented (AI receptionist offers to send info via text; consent logged with timestamp + call recording). CTIA "no mobile sharing for marketing" boilerplate. AI communication agents/platforms disclosed. Last Updated bumped to May 8, 2026.

The site has now had a full content correctness sweep + SEO infrastructure layer + legal compliance layer in one day.

---

## Decisions locked this session

- **Brian Van Flandern canonical phrasing:** *"Curated by Brian Van Flandern, America's Top Mixologist."* Replaces "Built by..." / "Designed by..." everywhere.
- **"Main floor" banned in public copy.** Use *"set apart from the traditional lanes"* + *"divided by a wall, semi-private."* Operational shorthand still allowed in internal docs (`seo.md` fundraiser context).
- **VIP suite reservations:** 2, 4, or 6 lanes. *"Take the whole suite"* is the takeover-only framing. Up to 80 people only when whole suite.
- **5 players max per lane** on traditional lanes only. VIP suite flexes — no per-lane number listed.
- **Fundraisers run on traditional lanes**, not VIP suite. 50% of bowling + shoe + arcade revenue, Thursdays 5–9pm.
- **Bar billing options for events:** run a tab or hand out drink tickets. Not "open bar / host bar."
- **VIP suite event types** (8 listed on /vip-suite): adult birthdays, corporate offsites, holiday parties, staff appreciation, graduation parties, gender reveals, bridal showers, reception dinners. **No weddings** (technically possible but rare). **No kids' birthdays** on /vip-suite (those land on /events).
- **/eat staff favorites pinned in code:** Kernitas Craze Tacos / Hog Wild Trio / Splits Hops Trio. Cap dropped 5→3. Build-warning fallback if a pin doesn't match any GoTab item.
- **/upcoming-events lookahead = 60 days.** NYE only surfaces ~Nov 1.
- **/leagues architecture:** hardcode the season in the page (PR per turn), not a content collection. Same two leagues run year over year; only dates and times change.
- **Pinball + darts → bar, not arcade.** /game stripped of pinball entirely; future fold-in on /bar.
- **Giant bear** stays as venue decor, NOT framed as a redemption prize. Real prize tier mentions Xbox controllers ("when we have them") instead.
- **og:image** = DSC_0344 (catering buffet, 1200×630 centered crop). Brand-led 1200×630 social card later, optional.
- **Favicon** = Favicon-100p Pin logo. All sizes generated from 100×100 source.
- **YouTube exists:** `https://www.youtube.com/@TwistedPin` — added to SnapFooter social row + schema `sameAs`.
- **Analytics deferred to launch.** GA4 chosen (because Google Ads is running). GTM container ID pending — user will check live site.
- **Google Places API hours** — confirmed live in production (env vars ARE set on Vercel as of today, despite stale CLAUDE.md note from 2026-05-06). All hours surfaces read through `getLiveHours()` / `formatHoursAnswer()`.

---

## Carryforward — three batches in priority order

### Batch 2 (highest leverage) — Content-led SEO

| Item | Why |
|---|---|
| **Naperville service-area page** | #1 paid market with near-zero organic per `seo.md`. Single biggest SEO gap. |
| **3 evergreen blog posts** + content collection scaffold | Zero blog content currently. Topics: *Plainfield things-to-do*, *Naperville corporate event venues*, *Plainfield date-night spots*. |
| **Service area pages 2–6** | Shorewood / Oswego / Bolingbrook / Romeoville / Joliet (Joliet = corporate angle). |

### Batch 3 — Quick-ship polish (~75 min combined)

| Item | Effort |
|---|---|
| `<main>` landmark audit (every page except `/` ships without one) | 30m |
| Brian Van Flandern Person schema `sameAs` (Wikipedia / Food Network / IMDb URLs if findable) | 15m |
| Per-page `og:image` overrides on the 6 pillars (each gets a distinct shot — `bar-cocktails-900` for /bar, `eat-share-540` for /eat, etc.) | 30m |
| Vitest schema parse-and-shape test | 1h |
| Address normalization sweep — pick canonical between *"15610 Joliet Rd"* (legal pages) and *"15610 S Joliet Rd"* (schema, SnapFooter) | 5m |

### Pre-launch (DNS + ops gates, NOT code-blocking now)

- **`astro.config.mjs` site URL** → swap Vercel staging to `https://www.twistedpin.com` (1-line change at launch)
- **GA4 + GTM install** (deferred to launch per ops; need GTM container ID + GA4 measurement ID + Google Ads conversion ID)
- **Vercel env var cleanup:** remove `PATCH_API_KEY`, `PATCH_ACCOUNT_ID` (Patch was abandoned 2026-05-07)
- **DMARC + SPF records** (DNS-level, `Context/dns-migration.md`)
- **GBP website URL** verification at launch (point at twistedpin.com)
- **DNS cutover execution** (`Context/dns-migration.md`)
- **Counsel pass** on `/privacy`, `/terms`, `/accessibility` — newly updated SMS compliance language needs review

### Ops-gated (waiting on inputs)

- NYE 2026 `Event.offers` schema (need package details)
- `/leagues` `Event` schema with `eventSchedule.byDay` (need Tuesday Night Mixed dates + season end)
- Real fundraiser-night photography (currently reusing `events-bg`)
- Distinct VIP-suite photography (currently reusing `events-bg`)
- Optional: dedicated 1200×630 brand-led social card (replaces DSC_0344 catering shot)

---

## Watch list

- **`maps.app.goo.gl` Firebase Dynamic Links sunset** — Aug 25, 2025. Used on `/pricing` "verify on Google" + SnapFooter Google review card. Swap-in: `https://www.google.com/maps/search/?api=1&query=Twisted+Pin+Plainfield+IL`.
- **INP 0.664s ("poor")** flagged by HOTH audit. Real-world is fast (GTmetrix LCP 524ms, two other audits agree). Don't chase synthetic INP — wait for real CrUX data after launch. If CrUX confirms INP > 200ms on real traffic, the suspects are: snap-scroll IntersectionObservers, sectionVideo() play/pause, sticky CTA hide watcher, sectionReveal() motion.
- **PSI mobile redirect chain** (0.63s lab, ~100ms real-world) — HSTS header now shipped for repeat-visitor benefit. Synthetic single-run lab data won't improve. Don't chase.
- **The 6 IG grid placeholder alt attributes** now have generic alt text. When real IG content lands (Basic Display API embed deferred), alt text should be specific to each post.

---

## Tech debt (post-launch)

- **`.pillar-*` CSS hoist** — rule of NINE hit (`.bar-*` / `.eat-*` / `.vip-*` / `.events-*` / `.game-*` / `.bowl-*` / `.fundraiser-*` / `.league-*` / now also pseudo-`.legal-*`). Each pillar after this hoist saves ~150 lines.
- Delete `Hero.astro` (unused since `/snap-test/` was promoted)
- Delete `CouponBanner.astro` (retired component)
- Old single-video bash scripts → migrate to `build-snap-videos.mjs` table

---

## SMS messaging program — context for the next chat

The carrier reviewer is the audience for the legal-page rewrites. They will likely look at the **live twistedpin.com** (WordPress) URLs:
- `twistedpin.com/privacy-policy`
- `twistedpin.com/terms-and-conditions`

Not the new website's `/privacy` or `/terms`. The user updates those WordPress pages with the same content for the SMS approval submission. The new site's pages (this repo) will mirror the language once the new site goes live.

**Verbal opt-in path is the load-bearing addition** — the AI receptionist offers to send info via text on phone calls; verbal consent is captured with timestamp + recording; single informational SMS is sent. This is what carrier compliance review will scrutinize.

---

## Useful greppable handles

- `BUSINESS_ENTITY_ID` — canonical `@id` for venue entity unification (`src/lib/schema.ts`)
- `SOCIAL_SAME_AS` — schema `sameAs` array (now includes YouTube)
- `PINNED_PICKS` / `TEASER_CAP` — editorial pins for /eat staff favorites (`src/lib/gotab-food.ts`)
- `LOOKAHEAD_DAYS` — /upcoming-events 60-day filter (`src/pages/upcoming-events.astro`)
- `getLiveHours()` / `formatHoursAnswer()` — single source of truth for hours, live from Google Places (`src/lib/google-hours.ts`, `src/lib/schema.ts`)
- `Astro.site` — drives canonical + og:url; reads from `astro.config.mjs` `site` field (currently Vercel staging, flips at launch)
- `ogImage` / `ogImageAlt` / `ogType` — per-page Props on `Base.astro` for og:image overrides (default = `/og/og-default.jpg`)
- `legal-preamble` — CSS class for the new entity-disclosure block on `/privacy`
- `Dow Holdings Inc` — operating legal entity (referenced in /privacy + /terms; flag for any future legal copy)

---

## Recommended next session

Pick whichever has user energy. In priority order:

1. **Naperville service-area page** — highest-leverage SEO move on the board. Per `seo.md`: 21.6% of paid clicks come from Naperville with near-zero organic presence. One session, content-led.
2. **`<main>` landmark audit** — easy a11y/SEO win, ~30 min, no ops dependencies.
3. **Three evergreen blog posts** — content-led, drafts can be produced in chat.
4. **Per-page og:image overrides** — small visual polish on the 6 pillars.
5. **Address normalization sweep** — 5 min once user picks canonical "15610 Joliet Rd" vs "15610 S Joliet Rd".

Not recommended: PSI/INP optimization (synthetic noise — wait for real CrUX). Re-running audits before content + photography land (results unchanged).

---

## Audit findings — round 2 (post-shipping triage)

After the three commits above, a fresh site-wide audit ran (572 issue rows in `Downloads/twistedpin-website.vercel.app issues 2026-05-08.csv`). **A parallel chat is working on most of these**; capturing the triage here so handoffs stay consistent.

### Already fixed by today's commits (will clear on re-audit)

| Issue | Count | Status |
|---|---|---|
| Missing HSTS header | 25 | ✓ Shipped in `8be7391` (`vercel.json` `Strict-Transport-Security` header) |
| Pages with long title | 1 of 3 | ✓ Homepage trimmed (was 69 → 58); `/bar` + `/pricing` still need trim |
| Pages with long meta description | 1 of 11 | ✓ Homepage trimmed (was 179 → 146); 11 inner pages still long |

### False positives — ignore

| Issue | Count | Why |
|---|---|---|
| URLs with underscore characters | 185 | All `/_astro/*` build artifacts (CSS, JS, fonts). Astro's internal output naming. Not user-facing URLs. |
| Pages with external follow links | 34 | Standard hygiene flag. External links to Roller, Zite, Maps are legitimate. |
| Pages with external links to redirect URLs | 34 | Zite, Roller, etc. legitimately redirect. Third-party. |
| URLs with incorrect media type (GoTab/Untappd) | 27 | Third-party servers (img.gotab.io, labels.untappd.com) serve `.png` with `image/jpeg` Content-Type. Not our infrastructure. |
| Slow TTFB | 112 | All `img.gotab.io/products/*`. GoTab's CDN is slow — third-party. Tech debt: proxy/cache menu images at build time (significant change). |
| Timeout (1) | 1 | Specific GoTab image. Transient or third-party. |

### Real findings to address (parallel-chat scope)

| # | Issue | Count | Action |
|---|---|---|---|
| 1 | **Trailing-slash duplication** — both `/bar` AND `/bar/` indexed | 18 dup-content + 9 non-canonical-in-sitemap | Set `trailingSlash: 'always'` in `astro.config.mjs` + `vercel.json`. Forces single canonical per page. ~10 min |
| 2 | Long meta descriptions | 11 pages | Trim each to 120-160 chars: `/bar`, `/menu`, `/vip-suite`, `/privacy`, `/terms`, `/free-kids-bowling`, `/leagues`, `/rewards`, `/fundraisers`. ~20 min |
| 3 | Long titles | `/bar`, `/pricing` | Trim to ≤60 chars. ~5 min |
| 4 | Missing alt on `/menu/taps` | 2 | Likely Untappd brewery label `<img>`. Add alt. ~5 min |
| 5 | Missing `X-Content-Type-Options: nosniff` | 34 | One-line header rule in `vercel.json`. ~2 min |
| 6 | Pages with broken external links | 34 | Need to identify *which* links — could be flaky audit or real dead destination. Investigate. ~20 min |
| 7 | Pages with little content | 8 | `/coupon`, `/waitlist`, `/free-kids-bowling`, `/menu`, `/careers`, `/gift-cards`, `/upcoming-events`, `/leagues`. Add SEO body block beneath each iframe / thin page. ~45 min |

### Defer / pre-launch

| Issue | Why |
|---|---|
| Missing CSP (34) | Requires careful policy definition (third-party embeds: TablesReady iframe, GoTab/Untappd images, Maps, Roller, Zite). Pre-launch decision. |
| GoTab image proxy/cache | Closes 100+ TTFB warnings. Build pipeline change. Post-launch tech debt. |

### Trailing-slash decision context (load-bearing)

Astro currently uses default `trailingSlash: 'ignore'` — both `/bar` and `/bar/` work, no preference. The canonical tag we shipped today reads `Astro.url.pathname`, so canonical is *per-request* — `/bar` canonicalizes to `/bar`, `/bar/` canonicalizes to `/bar/`. **Both think they're canonical.** That's why duplicate-content + sitemap-mismatch flagged.

Recommended fix: `trailingSlash: 'always'` in both `astro.config.mjs` and `vercel.json`. Sitemap, links, canonical tags all align on `/bar/`. Vercel 308-redirects `/bar` → `/bar/`.

---

## Open the next chat with

> *"Read CLAUDE.md and Context/session-handoffs/2026-05-08-copy-pass-seo-infra-sms.md. [Then state the task — Naperville page / `<main>` audit / blog posts / address normalization / new bug found / etc.]"*
