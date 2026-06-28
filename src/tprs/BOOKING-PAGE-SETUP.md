# Booking-Page Setup & Inventory Checks (Website domain)

**How to stand up a new `/reserve*` page, and how the front-end keeps a guest from
building a cart it can't buy.**

This is the Website-domain companion to the backend's
[`tprs/docs/RESOURCE-CONSUMPTION-CONTRACT.md`](../../../tprs/docs/RESOURCE-CONSUMPTION-CONTRACT.md)
(which owns *how a product consumes resources* and *how the server never
oversells*). Read that one for the capacity model; read this one for the page +
UI layer. Written 2026-06-27; keep current when the booking flow changes.

The one-line split:
- **Backend** decides *what's actually available* and is the **authoritative**
  gate (cart-add soft hold + checkout strict check).
- **Website** is **advisory** — it asks the backend "how many can I sell at this
  slot?" and shapes the UI so the guest never overshoots and never gets a
  mystery "can't pay." If the web checks and the server ever disagree, the
  server wins; the web's job is to make that disagreement rare and graceful.

---

## 1. Architecture — one island, many pages

Every booking page is the **same React island** with a different config object.
**Never roll a bespoke booking flow — extend the wizard**, and every page
inherits the inventory checks below for free.

| Piece | File |
|---|---|
| The wizard island (`client:only="react"`) | `src/components/tprs/BookingWizard.tsx` |
| Step 1 — date + product grid/tiles | `src/components/tprs/steps/MainStep.tsx` |
| Step 2 — time slot + quantity stepper | `src/components/tprs/steps/DetailStep.tsx` |
| Step 4 — add-ons | `src/components/tprs/steps/AddOnsStep.tsx` |
| Step 5 — guest details + booking-question forms | `src/components/tprs/steps/GuestDetailsStep.tsx` |
| Step 6 — Stripe payment (+ sold-out blocker) | `src/components/tprs/steps/PaymentStep.tsx` |
| Confirmation | `src/components/tprs/steps/ConfirmationStep.tsx` |
| Sticky cart rail (desktop right / mobile bottom) | `src/components/tprs/StickySummary.tsx` |
| Reducer + selectors (`laneMaxFor`, subtotal, coupon) | `src/components/tprs/state.ts` |
| Availability/quote hooks | `src/components/tprs/useAvailability.ts`, `useQuote.ts` |
| API client (all backend calls) | `src/tprs/client.ts` |
| Per-page config + the 4 live configs | `src/tprs/pageConfig.ts` |

**Live pages** (each is a thin Astro shell that imports a config and mounts the
wizard):
- `src/pages/reserve.astro` → `/reserve` (open-bowl lanes; `bookingPageConfig`)
- `/reserve/birthdays` → `birthdaysPageConfig` (Suite Birthday packages)
- `/reserve/nye` → `nyePageConfig` (NYE party slots)
- `src/pages/reserve-preview2.astro` → parked A/B (party-size-first), noindexed.

---

## 2. The inventory-check layering (front-end view)

Five layers, cheapest first. They mirror the backend's read paths.

**1. Month/day grid is BOOLEAN.**
`getMonthAvailability` (`GET /api/availability/month`) and `getAvailability`
(`GET /api/availability`) return *available: true/false* per day/slot — a slot
shows green iff ≥1 unit is free. It **never leaks a count** (ADR-0025 AH-7) and
is cacheable. This is also where the **"10 days out" wall** lives — see §3.

**2. Per-slot COUNT probe — only when a slot is picked.**
`getSlotMaxUnits(productId, date, time)` (`GET /api/availability/slot` →
`{ maxUnits }`) returns how many units are actually bookable at that one slot.
Fired from the wizard on (product, date, slot) change
(`BookingWizard.tsx` ~L186–208), self-excluding the cart's own holds. `maxUnits`
is **raw capacity** — the caller does `min(onlineCap, maxUnits)`.

**3. Stepper cap — both steppers.**
The "How many lanes?" stepper (`DetailStep.tsx` ~L149) and the cart-rail stepper
(`StickySummary.tsx` ~L64–74) both cap at
`slotMaxUnits === null ? laneMaxFor(product) : Math.min(laneMaxFor(product), slotMaxUnits)`.
A carried-over selection is clamped down when the guest switches to a tighter
slot. **`null` probe (loading / fetch failure / party mode) falls back to the
static online cap** — a backend hiccup never hard-blocks a booking; the server's
strict check is still the real gate.

**4. Two-tier message at the boundary.**
- **Scarcity** ("**Sorry —** only N lanes are left at this time")
  (`DetailStep.tsx` ~L151–163, 449–457) shows in teal (`tprs-qty-note--scarce`)
  only when `slotMaxUnits < onlineCap` AND the guest taps **+** past the
  free-lanes ceiling (or the slot is already at 0). It solves for *any* N, not
  just 1 left — a Traditional slot with 2 free only says so when the guest
  reaches for the 3rd.
- **Online-cap nudge** ("event territory") fires at the *static* max
  (`max_quantity_per_booking`) and routes bigger groups to the events inquiry —
  this is a product rule, not scarcity. Per-product overrides via the
  `laneCapNotes` knob (e.g. NYE: "that's the whole suite").

**5. Graceful payment blocker — the unavoidable race.**
If a slot fills *between* selection and payment, `PaymentStep` (cart-hold acquired
on mount, ~L194–198) catches `capacity_exhausted` and **replaces the card form**
(~L467–495) with a loud blocker: *"That time just filled up — your card hasn't
been charged,"* plus a **"Find a new time"** button that routes back to the time
picker. Never let the guest stare at a card form they can't submit.

**Principle:** never let a guest build a cart they can't buy; if the race happens
anyway, explain it loudly and offer recovery.

---

## 3. The "10 days out" wall — grid vs probe (read this before debugging "missing availability")

The **boolean grid enforces `max_advance_booking_days`; the slot probe does
not.** This trips people up:

- Open-bowl VIP/Traditional products set `max_advance_booking_days = 10`, so the
  **customer grid is empty beyond 10 days** — by design. A future date looking
  "sold out" / blank is the *booking window*, **not** a capacity problem.
- The **slot probe (`/api/availability/slot`) ignores the advance window** and
  returns raw capacity for any date. That's how you verify a far-future date is
  consuming resources correctly even though no customer can book it yet (e.g.
  confirming an October party correctly leaves 4 of 6 VIP lanes — done live
  2026-06-27, 28/28 slot checks matched the hand-computed capacity).

So: **an empty future grid ≠ no inventory.** If you need to prove the engine is
removing the right lanes on a date past the window, hit the slot probe directly,
not the grid.

The **`windowNotice` page-config knob exists specifically to explain this to
guests** — it renders an always-on booking-window explainer ("Lanes open up to
**10 days ahead**…") plus a `calendarHint` in the date modal, so greyed-out
future dates don't read as "they're full." Set it on any page whose products
have a tight `max_advance_booking_days`.

---

## 4. Stand up a NEW booking page

Three steps. Most of the work is the config object.

**(a) Add a config to `src/tprs/pageConfig.ts`.** Copy the closest of the four
existing examples — `bookingPageConfig` (lanes, tile mode), `birthdaysPageConfig`
(packages + guest stepper), `nyePageConfig` (single-date + presale) — and adjust
the knobs below.

**(b) Add the Astro shell.** Copy `src/pages/reserve.astro`, import your config,
mount `<BookingWizard config={yourConfig} client:only="react" />`, and set the
page's hero/SEO. Match the existing LCP recipe (AVIF+WebP hero, preload) if the
page has an image hero.

**(c) Parked-preview discipline.** While iterating, keep the page out of the
index: `<meta name="robots" content="noindex">` + exclude from the sitemap +
`Disallow` in `robots.txt` + leave it unlinked (see `reserve-preview2.astro`).
Flip all four at go-live.

### `BookingPageConfig` knobs (`src/tprs/pageConfig.ts`)

| Knob | What it does |
|---|---|
| `productCodes: number[]?` | Curate the page to a product subset by integer TPRS code. Omit = full bookable catalog. |
| `uxCopy: { eyebrow, headline, sub }` | Hero copy. |
| `heroImage?: { base, alt }` | Compact identity hero (~40vh). `base` = pre-encoded `/snap/` basename (540/1080/1600, AVIF+WebP). Omit = typography-only. |
| `termsText: string` | Page-specific terms shown at checkout. |
| `tileCards?: boolean` | Duration-led TILES (big duration + "from" price) instead of image cards — for products that differ only by duration (open-bowl 1hr/2hr). |
| `tileArt?: Record<slug,{base,alt?}>` | Room shots behind tiles (tile mode), by category slug. |
| `cardNotes?: Record<code,string>` | Short copper caution badge on a product card (≤~14 chars), keyed by code (e.g. "Limited times"). |
| `cardDescriptions?: boolean` | Show product short description on grid cards (default true). |
| `quantityLabel?` / `quantityHelp?` | Stepper question + helper wording (default "How many lanes?"). |
| `partySize?: { capacities, threshold, default?, label?, help? }` | **Party-size-first mode** — guest counts instead of lanes; `capacities` = guests-per-lane by category; `threshold` = max guests before the events handoff. |
| `guestSteppers?: Record<code,{baseGuests,addOnCode,label?}>` | **Base-package + per-guest add-on** mode (Suite Birthday): base stays fixed, +/- drives a linked add-on. Keyed by base code. |
| `laneCapNotes?: Record<code,string>` | Replace the at-cap events nudge for a product whose online cap IS the whole room (e.g. NYE VIP = all 6 lanes). |
| `confirmEndTime?: boolean` | Show the computed end time on confirmation (default true); set false when end drifts (birthday room flip). |
| `defaultDate?: string` | Seed the calendar at an ISO date instead of today (single-date pages like NYE). |
| `presaleNotice?: { heading, body, ctaLabel?, ctaHref? }` | "Coming soon" beat when products exist but aren't on sale yet; shows on `defaultDate` when nothing's bookable. Self-resolves when the engine opens sales — **no date hardcoded in the front-end.** `body` supports the text dialect (**bold**, [link]). |
| `windowNotice?: { heading?, body, eventLine?, ctaLabel?, ctaHref?, calendarHint? }` | Always-on booking-window explainer (see §3) — counters "looks sold out" for dates past `max_advance_booking_days` and states the per-booking lane cap. |

Defaults: `DEFAULT_QUANTITY_LABEL = "How many lanes?"`, `DEFAULT_GUEST_LABEL =
"How many guests?"`. Bigger-group handoff URL: `CUSTOM_EVENT_URL`.

**You do NOT configure inventory checks per page** — the wizard does the slot
probe + stepper cap + blocker for every page automatically. Your only inventory
job is to set `windowNotice` if the products have a tight advance window, and to
make sure the *backend* product is configured to consume correctly (that's the
RESOURCE-CONSUMPTION-CONTRACT checklist).

---

## 5. The client → endpoint map (`src/tprs/client.ts`)

| Function | Endpoint | Role |
|---|---|---|
| `getBookableProducts` | `GET /api/products/bookable` | Full bookable catalog, grouped. |
| `getProducts(codes)` | `GET /api/products?codes=` | Curated set (pageConfig). |
| `getMonthAvailability` | `GET /api/availability/month` | Per-day boolean (grid). |
| `getAvailability` | `GET /api/availability` | Per-slot boolean + price (one date). |
| **`getSlotMaxUnits`** | **`GET /api/availability/slot`** | **Per-slot count probe `{maxUnits}` — the inventory check.** |
| `getProductForms` | `GET /api/products/:id/forms` | Booking-question forms (ADR-0030). |
| `previewCoupon` | `POST /api/checkout/coupon-preview` | Read-only coupon check. |
| `getQuote` | `POST /api/checkout/quote` | Server-authoritative subtotal+tax+total (SPA never computes tax). |
| `addCartItems` | `POST /api/cart/items` | Acquire soft hold per line (**authoritative** capacity check #1). |
| `getCart` | `GET /api/cart` | Adopt live hold on refresh (no new acquire). |
| `removeCartLine` | `DELETE /api/cart/items/:id` | Release a line. |
| `createPaymentIntent` | `POST /api/checkout/payment-intents` | Identity + rail PI (server sizes amount). |
| `convertCheckout` | `POST /api/checkout/convert` | Materialize the booking (**authoritative** capacity check #2, strict + locked). |

`TprsCheckoutError.code` carries the typed rejection (`capacity_exhausted`,
`cart_hold_expired`, `coupon_rejected`, `amount_mismatch`, …) — the UI branches
on these (e.g. `capacity_exhausted` → the sold-out blocker).

**API base:** dev → `/tprs-api` (Vite proxy to `localhost:3000`); deployed →
middleware proxies `/tprs-api/*` → `https://api.twistedpin.com/*`.

---

## 6. Checklist — new booking page

- [ ] Backend product(s) configured to consume correctly first — see
      [`RESOURCE-CONSUMPTION-CONTRACT.md`](../../../tprs/docs/RESOURCE-CONSUMPTION-CONTRACT.md)
      §2 (pool + duration set, or it silently oversells).
- [ ] New config in `pageConfig.ts` (copy the closest example).
- [ ] `windowNotice` set if the products have a tight `max_advance_booking_days`
      (so future greyed dates read as "not open yet," not "sold out").
- [ ] `presaleNotice` set if products exist but aren't on sale yet (no hardcoded
      date in the front-end).
- [ ] Astro shell mounts `<BookingWizard config={…} />` — **do not** reimplement
      the flow; the slot probe / stepper cap / sold-out blocker come with it.
- [ ] Parked-preview discipline (noindex + sitemap + robots + unlinked) until
      go-live.
- [ ] Verify with the slot probe, not just the grid, if you need to confirm a
      far-future date consumes resources (the grid hides past-window dates).

**The invariant:** the web is advisory and the server is authoritative — your
page's job is to ask the backend what's available, cap the UI to it, and fail
loudly + recoverably on the rare race. Never compute capacity (or tax) in the
front-end.
