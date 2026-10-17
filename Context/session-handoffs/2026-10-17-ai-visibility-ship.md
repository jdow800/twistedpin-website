# AI-visibility fixes shipped — October 17, 2026

Three fixes Jon approved from the 2026-10-17 AI-search check and its independent review. Nothing else from the fixes doc shipped: no geo/"Illinois" title or meta rewrite, no multi-@type or OfferCatalog schema, no field-trips page, no footer NAP change, no aggregateRating change.

## 1. Footer open/closed status is computed in the browser

**Problem (live, 11:30 AM CDT Saturday):** every page said "Closed · opens 11am" while `/api/hours/` said `is_open: true`. The footer computed its state in the build, and the pages only rebuild once a day (4 AM cron), so the state was frozen at build time and wrong for most of the day.

**Now:**
- `src/lib/hours-status.ts` (pure, node-testable): `footerHoursStatus`, `centralClock`, `weekHoursSummary`.
- `SnapFooter.astro` emits only a **neutral weekly-hours line** ("Mon–Wed 3pm–10pm · Thu 3pm–11pm · …") plus the week's hours as JSON in `data-week`. No "Open"/"Closed" state in static HTML.
- The footer script computes the state at the venue's clock (America/Chicago, one `Intl.DateTimeFormat#formatToParts` call so day and minute cannot disagree), re-checks every 60 s and on tab refocus, and swaps the weekly line for the live status. The live node carries `data-nosnippet`.
- Same rules as `/api/hours/` `now.is_open`: last night's close past midnight (minutes ≥ 1440) wins first, a null day (holiday/special closure in the Google snapshot) reads "Closed today". Bad JSON, no `Intl` or a script error leaves the weekly line in place.
- `scripts/check-footer-hours.mjs` (wired into `prebuild`) pins the cases, both DST switches, and sweeps 30,240 minutes against `isOpenNow()`.

**Trap to remember:** do not compute "now" in Astro frontmatter on a static page. The weekly line is built from the holiday-overlaid `getLiveHours()` on purpose (same source as the JSON-LD hours and `/pricing`), so in a holiday week it shows that week's exception until the daily rebuild.

Not changed: `/pricing/` still bakes its "Today" pill and per-day view at build time (lower severity per the review; separate fix).

## 2. Copy fixes

- **`/faq/` "How much does bowling cost?"** no longer says "Walk-in starts at $35/hour". It states the rate for every day and time, generated from `src/data/pricing.ts` (so it cannot drift from `/pricing`): Mon–Thu, Fri, Sat and Sun with their time breaks, each line naming the lane type and "per lane per hour". Sunday after 7pm is correctly the Mon–Thu rate. The FAQPage JSON-LD answer is the same string.
- **Fundraiser arcade wording:** `/fundraisers/` hero and `/events/` fundraiser paragraph and list item now say "front-desk arcade cards" (kiosk cards can't be tagged to a fundraiser).
- **`/events/` VIP suite:** "semi-private, yours when you book it" → "semi-private. When you book all six lanes, the whole suite is yours during your event time."
- **`/vip-suite/`:** "The suite is yours from setup to last call." → the same conditional sentence.
- **`/events/` "December books fast — reach out by October"** removed. The brand guide (v1.0, Oct 14) allows scarcity only when current availability supports it; the repo holds assertions and Jon-approved promo copy for the claim (`promos.ts`, `holiday-parties.astro`, `nav-seasonal.ts`, the blog), but no availability data. It was removed from `/events/` only.

**Same problems still live on pages outside this scope** (not touched): `/wedding-receptions/` ("Yours from setup to last call"), the "December books fast" claim on the promo bar, `/holiday-parties/`, nav seasonal config and the corporate-venue blog, the unqualified "bowling, shoe and arcade sales" line in `src/content/blog/things-to-do-plainfield-il.md`, and `Context/seo.md` ("50% of bowling, shoe, and arcade revenue").

## 3. `/corporate-events/`

- Title: `Team Building Near Naperville | Twisted Pin` (43 chars; was "Corporate Events & Team Outings in Plainfield, IL | Twisted Pin").
- Meta (151 chars, CTA verb): "Team building and corporate events near Naperville, in Plainfield, IL. Bowling in the VIP suite, in-house catering and craft cocktails. Plan an outing."
- Eyebrow "Team Building · Corporate Events"; H1 "Team building near Naperville."; intro names Twisted Pin in Plainfield, IL, south of Naperville.
- Service JSON-LD `name` → "Team Building & Corporate Events" (the only schema edit; the page's WebPage name follows the title automatically).
- Deliberately not added: weekday-daytime FAQ (early opening is an owner decision), "groups come from <towns>" list (unverified; the existing invitational "Planning a company outing from…" wording stays), any drive-time claim (the blog, `/why-us/naperville-il/` and `seo.md` disagree), new wit.

**This overrides the 2026-06 paid-scent decision** (`bb9d273`, decisions log): the H1 "Not your average team outing" echoed the Team Outings ad creative. The page still says "team outing(s)" in the intro, first card, FAQ and schema, but the Google Ads Team Outings headline and landing page are no longer an exact match. Re-align the ad headline if message match matters.

## 4. Follow-up the same day (approved ~12:25 PM CDT)

Two of the "still live" items from section 2 are now fixed (live-checked first at 12:27 PM CDT, both still showed the old text):

- **`/wedding-receptions/`** list item "Yours from setup to last call" → "Book all six lanes: the whole suite is yours during your event time" (the list-item form `/why-us/lockport-il/` and `/why-us/oswego-il/` already use). The phrase was not in that page's JSON-LD, so no schema change.
- **`src/content/blog/things-to-do-plainfield-il.md`** fundraiser sentence → "50% of eligible bowling, shoe and front-desk arcade-card sales" (kiosk cards can't be tagged to a fundraiser; matches `/fundraisers/`).

Deliberately **not** changed: `Context/seo.md` ("50% of bowling, shoe, and arcade revenue") because it carries Jon's uncommitted edits in the main checkout and editing it there would conflict; it still needs the same "front-desk arcade-card" wording. Also untouched: "December books fast" everywhere, and the `/pricing/` "Today" pill.

**Team Outings ad headline: for Jon to apply in Google Ads (no repo copy changed).** The Team Outings RSA (ad group `203215948448`, ad `824656851547`, enabled 2026-09-15) pins "Team Outings in Plainfield" as headline 1, and `/corporate-events/` now reads "Team building near Naperville." Suggested replacement: **"Team Building Near Naperville"** (29 chars, inside the 30-char RSA headline limit). "Not Your Average Team Outing" belonged to the original ad `813141791896`, which the 2026-09-15 execution record shows paused (ad account not re-checked today). Editing an RSA headline restarts ad review, so it's Jon's call when.

Why no repo edit: the only copies are the one-time Script 20 source (`ADS20`, executed 2026-09-14), Script 20B (`PAIRS20B`, which verifies the live ad against that exact headline, and its test pins it), their runbooks and the execution record. Editing any of them would either make the 20B read-only verification fail against the live ad or falsify a record of what is live. There is no current ad-copy spec and no unrun next script (Script 21 does not touch RSAs). Nothing in the repo or any ad account was changed for this item.

## Validation

`npm run build` (prebuild checks + Astro build) passes. Built HTML checked for every change. Chromium (Playwright) checks against the built output with a mocked clock: Saturday 11:30 AM open, 10:30 AM closed, past-midnight carry-over, after-close, DST end, device time zones Tokyo / London / Los Angeles, a holiday closure, corrupt data, no-JS, and a page left open across closing. An independent four-lens review (brand/voice, footer engineering, scope/parity, SEO/structured data) found no confirmed defects.
