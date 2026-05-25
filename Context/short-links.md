# Short Links — twistedpin.com/*

One-page reference for every short link configured on the production site. All redirects live in `vercel.json` (top-level `redirects` array).

**Use these in ads, SMS campaigns, business cards, verbal mentions, QR codes, anywhere a memorable URL beats a long one.** UTM params on the short link survive the redirect to the destination, so `twistedpin.com/nye?utm_source=instagram` lands at `/new-years-eve/?utm_source=instagram` and GA4 attribution stays clean.

---

## Booking & commerce (Roller)

| Short link | Destination | Type | Notes |
|---|---|---|---|
| `/reserve` | `ecom.roller.app/twistedpin/openbowl/en-us/home` | 301 | Canonical "Reserve a lane" CTA — wired into the site's sticky bar and header |
| `/book` | `ecom.roller.app/twistedpin/openbowl/en-us/home` | 301 | Alias for `/reserve`. Shorter mnemonic for ads/SMS |
| `/kb` | `ecom.roller.app/twistedpin/kidsbirthdayparties/en-us/products` | 301 | Kids birthday party booking |

## Menus (subdomain)

| Short link | Destination | Type | Notes |
|---|---|---|---|
| `/essential` | `menu.twistedpin.com/essential` | 302 | SMS short link for the Essential menu |
| `/elevated` | `menu.twistedpin.com/elevated` | 302 | SMS short link for the Elevated menu |

## Internal page shortcuts

| Short link | Destination | Type | Notes |
|---|---|---|---|
| `/nye` | `/new-years-eve/` | 301 | Stealth — reserved for NYE ad campaigns |
| `/summerpinpass` | `/summer-pin-pass/` | 301 | Summer Pin Pass landing page |

### Pricing day deep-links

Each day-of-week short link opens `/pricing/` pre-activated to that day's tab (powered by the page's `?day=` / `#day` deep-link support — see `src/pages/pricing.astro`). Built for SMS replies and day-specific ads (e.g. linking the Wednesday Penny A Pin special directly to Wednesday's view).

| Short link | Destination | Type |
|---|---|---|
| `/mon` | `/pricing/#mon` | 301 |
| `/tue` | `/pricing/#tue` | 301 |
| `/wed` | `/pricing/#wed` | 301 |
| `/thu` | `/pricing/#thu` | 301 |
| `/fri` | `/pricing/#fri` | 301 |
| `/sat` | `/pricing/#sat` | 301 |
| `/sun` | `/pricing/#sun` | 301 |

## Marketing & social

| Short link | Destination | Type | Notes |
|---|---|---|---|
| `/tour` | `youtube.com/watch?v=PgQcmTXUn88` | 302 | Venue walkthrough video |
| `/review` | `search.google.com/local/writereview?placeid=ChIJURI15Tr1DogRLKYdPWWuY-M` | 302 | Direct-to-Google-review form |

## Staff / internal tools

| Short link | Destination | Type | Notes |
|---|---|---|---|
| `/avery` | `script.google.com/macros/s/AKfycbx.../exec` | 302 | Internal Apps Script tool for staff |

---

## Conventions

- **301 (permanent)** when the destination is stable and we want browsers to cache the redirect — used for Roller commerce URLs and our own internal pages.
- **302 (temporary)** when the destination may change, points at an external service we don't control, or could be replaced — used for subdomains, social, and staff tools.
- **Trailing-slash tolerance:** every entry uses `{/}?` (path-to-regexp) so `/book` and `/book/` both work. The one exception is `/reserve` (predates the convention — works either way because Vercel handles trailing slashes per `trailingSlash: true`).

## Adding a new short link

1. Edit `vercel.json` → `redirects` array.
2. Match the pattern of the closest category above (301 vs 302, trailing-slash form).
3. Update this file's table.
4. Commit + push. Vercel auto-deploys in ~90s.

## Related (not short links, but adjacent)

- **Event-platform toggle (`PLAN_EVENT_URL`):** lives in `src/lib/links.ts`, not `vercel.json`. Flips every "Plan an Event" CTA between Heyflow (`event.twistedpin.com/#start`) and Zite (`twistedevents.zite.so`). One-line edit, ~19 CTAs propagate. See CLAUDE.md Decisions Log 2026-05-17 for context.
- **Legacy WordPress slug 301s:** also in `vercel.json` — preserve SEO from the old site. Not short links; not in this doc. See `Context/launch-checklist.md` for the legacy redirect map.
