# TPRS booking pages — handoff brief

For whoever builds out the customer-facing booking pages. Everything below is
decided + wired; this is the map + the patterns so you can build pages without
re-litigating infra.

_Last updated 2026-06-08._

---

## TL;DR

The booking experience is React islands in **this repo** (not a separate SPA),
mounted on Astro pages. One page already exists — **`/reserve-preview`** (open
bowl). Build more pages by copying it + a `pageConfig`. Everything is **parked +
noindexed** until the Roller→TPRS cutover; the live "Reserve a Lane" CTAs still
point at Roller and **don't touch them yet**.

---

## Architecture (decided — don't change without a reason)

- **Same-origin.** Booking lives on the marketing site (`twistedpin.com/<url>`),
  NOT a separate `book.` subdomain. The SPA fetches **`/tprs-api/*`** (same-origin
  → no CORS, cart cookie stays host-only). In preview/prod a root
  **`middleware.ts`** (Vercel Routing Middleware) proxies
  `/tprs-api/* → https://api.twistedpin.com/*`; `astro.config.mjs`'s Vite proxy
  does the same in dev (→ `localhost:3000`).
  - **NOT a `vercel.json` rewrite.** That was the first attempt and it silently
    fails here: `vercel.json` rewrites are "afterFiles" and the `@astrojs/vercel`
    adapter's catch-all 404 shadows them (redirects work, rewrites don't — that's
    why `/reserve-preview` loaded but "Couldn't load the lanes" 404'd the API).
    Middleware runs BEFORE routing, so it intercepts `/tprs-api/*` first. It
    buffers the body + strips wire-encoding headers (else fetch's already-decoded
    body gets re-decoded + truncated). The dead `vercel.json` rewrite is left in
    place (harmless, ignored). See `middleware.ts` for the full why.
  - **`PUBLIC_TPRS_API_BASE` must stay UNSET on Vercel** (defaults to `/tprs-api`).
    Setting it to a cross-origin host re-introduces CORS + cookie pain.
  - The backend runs `ignoreTrailingSlash`, so the site's `trailingSlash:'always'`
    form forwards cleanly — no client slash-juggling needed.
- **Backend:** single Render service, **`api.twistedpin.com`** (API/webhooks) +
  **`admin.twistedpin.com`** (staff console). Currently **Stripe TEST + a temp
  Supabase DB**; promoted in place at go-live. So: **never expose a reachable,
  linked booking page to real customers pre-cutover** (test-mode checkout can't
  charge them) — that's why pages are parked + noindexed + unlinked.

## Per-URL pages = one `pageConfig` each

`src/tprs/pageConfig.ts` is the pattern. A page is the shared `<BookingWizard>` +
a config. To curate a page to a product subset, set `productCodes` (integer
Product `code`s from TPRS) — the grid/calendar then scope to just those via
`GET /api/products?codes=…` (endpoint already exists; no backend work).

A new page = a copy of **`src/pages/reserve-preview.astro`** that imports its own
config (+ its own hero copy/imagery). See the docstring in that file + the
"how to build a curated booking page" block at the bottom of `pageConfig.ts`.

## The parked-preview discipline (do this for EVERY new booking page)

Each booking page must be noindexed + unlinked until cutover. Three places, all
mirroring `/reserve-preview` and `/coupon-preview`:
1. **Page:** `<meta name="robots" content="noindex,nofollow">` in the head slot.
2. **`public/robots.txt`:** add `Disallow: /<slug>/`.
3. **`astro.config.mjs`** sitemap `filter`: add `!page.includes('/<slug>')`.

And **don't** wire any nav/footer/CTA to it — the live booking path stays Roller.

## The URL map

| Now (parked, noindexed) | Final (at cutover) | Products |
|---|---|---|
| `/reserve-preview` ✅ built | `/reserve` | open bowl — the 4 lane products (codes 4/5/121/123) |
| `/reserve/birthdays` ✅ built AT ITS REAL SLUG | `/reserve/birthdays` (no rename — the `/reserve{/}?` redirect is exact-match, so the nested path never collided) | Suite Birthday 109 + Extra Suite 118 (guest steppers 110/119, cap 14) |
| `/reserve-preview2` ✅ built (parked REFERENCE) | — decision page; loser deleted | party-size-first variant of the lane page |
| `/reserve-preview/vip-suite` (only if needed) | `/reserve/vip-suite` | the 2 VIP lane products |

Birthday launch ≠ lane cutover: the birthday page can go live independently by
repointing `ROLLER_KIDS_URL` in `birthday-parties-booking.astro` (the live SEO
lander) to `/reserve/birthdays/` + lifting its noindex/robots/sitemap entries.

(Slug names aren't locked beyond `/reserve` for the hub — adjust the children if
a better IA emerges. Marketing pages `/vip-suite`, `/birthday-parties-booking`
should eventually deep-link to the matching booking page.)

## Launch SEO pass (EVERY booking page, at ITS go-live — Jon asked to be reminded)

Lifting the parked triad is necessary but not sufficient. Before a booking page
goes live, give it the full SEO treatment per `Context/seo.md`:

1. **Title + meta description** — the parked stubs are minimal ("Reserve a
   Lane — Twisted Pin" / one-liner). Write real ones (keywords, ≤60/≤155 chars).
2. **Social preview image** — the pages currently inherit the default og:image.
   Set a per-page `og:image` (1200×630 crop of the page's hero shot; sources in
   `Context/og images/`) via Base.astro's og props.
3. **Lift the parked triad** — noindex meta + robots.txt Disallow + the
   astro.config.mjs sitemap filter entry (then the page enters the sitemap).
4. **Repoint the funnel** — the marketing lander's booking CTAs to the local
   page (birthdays: `ROLLER_KIDS_URL` in `birthday-parties-booking.astro`).
5. **GSC** — resubmit the sitemap; spot-check indexing after a few days.
6. **Schema (optional)** — the landers carry Product/Offer schema; decide
   whether the booking page needs its own or stays schema-quiet.

## Cutover checklist (when backend is on Stripe LIVE + prod DB — NOT yet)

1. `git mv src/pages/reserve-preview.astro src/pages/reserve.astro` (+ children).
2. Remove the `/reserve{/}?` → Roller redirect in `vercel.json` (a page at
   `/reserve` can't coexist with a redirect — the redirect wins). Same for any
   child slugs that have Roller redirects (`/book`, `/kb`).
3. Repoint the 3 CTA components — `StickyCTABar.astro`, `SiteHeader.astro`,
   `NavDrawer.astro` — from the hardcoded Roller URL to `/reserve`.
4. Remove the `noindex` meta + the `robots.txt` Disallow + the sitemap filter
   entry; the pages now belong in the sitemap.

## Reference

- `src/tprs/README.md` — running the flow locally.
- `src/tprs/client.ts` — API base resolution + the dev/prod proxy story.
- `src/tprs/pageConfig.ts` — the config shape + curated-page how-to.
- Backend hosting/infra decisions: `dev/tprs/docs/hosting-recommendation.md §5b`.
