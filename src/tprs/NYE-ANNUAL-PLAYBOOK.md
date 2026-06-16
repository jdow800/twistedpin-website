# NYE booking — annual playbook

How New Year's Eve booking is wired on the website, and the short list of what to
touch each year. The page is **evergreen** (lives at its URL year-round); the only
things that change annually are a couple of dates + the backend sales window.

> TL;DR: the website never hard-gates NYE. The **TPRS backend** gates booking via
> each product's `sales_start_at`. While sales are closed, the page shows a branded
> **pre-sale notice** ("drops late November — follow us") and **self-resolves to the
> live booking grid the moment the backend opens sales**. Each year you mostly just
> bump `defaultDate` + the nav window, and set the backend sale date.

---

## Each year (do this ~October)

**Backend — TPRS admin (separate repo/session):**
1. Confirm the two NYE products exist with the new year's pricing:
   - `124` → **NYE Party VIP Lanes**
   - `126` → **NYE Party Traditional Lanes**
   - (re-verify the codes — staging re-seeds have moved codes before)
2. Set each product's **`sales_start_at`** to the date you want online booking to
   open (this is the real gate; `validateSalesStart` blocks checkout and
   availability returns no slots until then).
3. Restrict each product's **availability to the new 12/31** (so the only bookable
   date is NYE).

**Frontend — this repo (`src/tprs/pageConfig.ts`, `nyePageConfig`):**
4. Update **`defaultDate`** → the new year's date, e.g. `"2027-12-31"`. (The
   calendar seeds here, and the pre-sale notice keys off it. A past `defaultDate`
   falls back to "today", which strands the page on a dead date — so this bump is
   the one that actually matters.)
5. Skim **`presaleNotice`** copy — it says "drops **late November**". If the
   `sales_start_at` you set is meaningfully different, reword it. It's date-soft on
   purpose so small shifts need no edit. Update `ctaHref` if the social URL changes.

**Frontend — nav + funnel:**
6. `src/config/nav-seasonal.ts` → bump the **"New Year's Eve"** window
   (`showFrom` / `showUntil`) to the new season (it controls when the item appears
   in the mobile NavDrawer "Visit" section; currently `2026-11-15 → 2027-01-02`).
7. `/upcoming-events` calendar entry (`src/content/events/*.md`) → update the NYE
   event's date (it routes to the **lander**, not /reserve/nye — right funnel:
   calendar → lander → booking).
8. Skim the lander copy: `src/pages/new-years-eve.astro` (hero video, package
   blurbs). Optional: a dedicated NYE `og:image` (today it reuses
   `/og/og-vip-suite.jpg`).

That's it. No file moves, no redirect changes, no robots/sitemap edits.

---

## What happens automatically (don't touch)

- **Pre-sale window** (products exist but `sales_start_at` hasn't hit): the
  pre-sale notice shows on `/reserve/nye`. No manual toggle.
- **Sales open** (`sales_start_at` passes): the backend starts returning slots for
  12/31 → the notice disappears and the normal lane grid appears. The frontend just
  reacts; nothing to deploy at the moment of opening.
- **Daily 4am cron rebuild** picks up the nav-seasonal window flip overnight (Nov 15
  "show NYE in the drawer" goes live without a manual deploy).

---

## How the pre-sale notice works

Config-driven and **reusable for any pre-sale event** — it's a `BookingPageConfig`
field, not NYE-specific code.

- **Config:** `nyePageConfig.presaleNotice = { heading, body, ctaLabel, ctaHref }`.
  `body` supports the text dialect (`**bold**`, `<font color="…">`, `[link](url)` —
  see `FORMATTING.md`).
- **Trigger** (`src/components/tprs/steps/MainStep.tsx`, `showPresale`): shows when
  **all** of these hold —
  1. the page set a `presaleNotice`,
  2. the selected day **is** the canonical `defaultDate`,
  3. that day's month availability has **loaded** (so it never flashes mid-fetch),
  4. **nothing** is bookable that day.
- **No date is hardcoded in the frontend.** A moved `sales_start_at` needs no
  frontend change (only `defaultDate` changes, and only when the *year* rolls).
- It renders in place of the "Choose your lanes" header + the bare "Sitting this
  one out" list, reusing the `.tprs-event-handoff` card. The **date strip stays**
  (it's what loads the availability the trigger reads, and it shows the NYE
  timeframe).

---

## Key files

| File | What it owns |
|---|---|
| `src/tprs/pageConfig.ts` → `nyePageConfig` | `defaultDate`, `presaleNotice`, `productCodes` (124/126), `laneCapNotes` |
| `src/pages/reserve/nye.astro` | the booking page (title / description / og, hero band) |
| `src/pages/new-years-eve.astro` | the SEO **lander**; its CTAs point to `/reserve/nye` |
| `src/config/nav-seasonal.ts` | the NavDrawer "New Year's Eve" show window |
| `src/content/events/*.md` | the `/upcoming-events` NYE entry (→ lander) |
| **TPRS backend (separate repo)** | the real gate: products 124/126 `sales_start_at` + 12/31 availability |

---

## History

- **2026-06-16** — `/reserve/nye` noindex lifted (page crawlable + in sitemap);
  booking left gated to the backend `sales_start_at` (~12/01). Commit `393ff26`.
- **2026-06-16** — pre-sale notice shipped (`presaleNotice` config + `showPresale`
  in MainStep) so the closed-sales window reads as an intentional "coming soon"
  beat instead of a bare unavailable list. Commit `f2f5f8c`.
