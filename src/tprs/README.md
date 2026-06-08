# TPRS booking flow — `/tprs` (ADR-0029)

The customer self-serve lane-booking experience, built as React islands inside
this Astro site (ADR-0029 §1) and consuming the TPRS customer-flow HTTP API
(ADR-0025). It lives at **`/tprs`** as an internal preview: `noindex,nofollow`,
sitemap-excluded, robots-disallowed, unlinked. The live `/reserve` → Roller path
and every `ROLLER_URL` CTA are untouched — the cutover is a separate, gated step.

> **Authoring product copy?** See [FORMATTING.md](FORMATTING.md) — how to add
> bold / color / links / line breaks to TPRS fields (names, descriptions,
> category subtitles) + the allowed brand-color names (glow, copper, tango, …).

## What's here (full flow — real checkout)

`date/slot → grouped product grid → detail (time-slot + lane qty / guest stepper)
→ add-ons → guest details (+ ADR-0030 form renderer, gated on required fields +
"Have a code?") → real Stripe payment → convert → confirmation w/ invoice`. It
**writes to the backend**: cart-hold, PaymentIntent, convert (real bookings +
email). Proven end-to-end against staging with a test card. The earlier
"read-only Slice 1" framing is retired.

```
src/tprs/
  schemas/        VENDORED copy of @tprs/shared-schemas (see "Vendored schemas")
  client.ts       typed API client — reads + coupon-preview + quote + cart-hold +
                  payment-intents + convert (TprsCheckoutError carries the code)
  pageConfig.ts   ADR-0025 §1 pageConfig (terms + UX copy + guestSteppers)
  text-dialect/   shared product-copy markup parser/emitters (see "Text dialect")
  README.md        this file
src/components/tprs/
  BookingWizard.tsx   single client:only React island, useReducer state machine
  state.ts            reducer + derived selectors (incl. booking result, ZIP regex)
  stripe.ts           Stripe.js singleton + brand Appearance
  Markdown.tsx        React emitter over text-dialect
  format.ts           cents/time/date/calendar helpers
  StickySummary.tsx   cart rail — server-authoritative subtotal / sales tax / total
  FormRenderer.tsx    ADR-0030 §5.1 generic form renderer (all field types + validity)
  guestStepper.ts     base-package + per-guest add-on resolver (birthday packages)
  useAvailability/useQuote/useMediaQuery   hooks
  steps/              MainStep, DetailStep, AddOnsStep, GuestDetailsStep,
                      PaymentStep (real Stripe), ConfirmationStep
  tprs.css            scoped styles on the global design tokens
src/pages/tprs/index.astro   the noindex host page
```

## Run it locally

1. **Backend** — in `dev/tprs/apps/backend`: `pnpm dev` (listens on `:3000`,
   needs its `.env` `DATABASE_URL`).
2. **Website** — here: `npm run dev` (Astro on `:4321`).
3. Open `http://localhost:4321/tprs/`.

> Use **`npm run dev`**, not `pnpm dev` — pnpm v11's build-script approval gate
> (esbuild/sharp) blocks `pnpm dev` here; `npm run dev` runs the same `astro dev`.
> Also: `TaskStop`/Ctrl-C on `npm run dev` can leave the astro child alive on the
> port — if a restart says "port in use," kill the stale node on 4321–4323.

The booking islands fetch a same-origin `/tprs-api/*` path that the Vite dev
proxy (`astro.config.mjs`) forwards to the backend. Same-origin sidesteps CORS
and the cart-token cookie. **Cart cookie in dev:** the backend serializes it
env-aware now (drops `Domain`/`Secure` on localhost), and the proxy *also* strips
them as belt-and-suspenders — without one of those the `Secure`/`Domain`-pinned
cookie a browser on http://localhost rejects, the hold never sticks, and
`/checkout/payment-intents` 400s "No active cart" (ADR-0029 §3).

**Stripe key:** `PUBLIC_STRIPE_PUBLISHABLE_KEY` (a `pk_test_…`) lives in
`dev/Website/.env` (gitignored). The backend's `dev/tprs/.env` carries the
matching `STRIPE_SECRET_KEY` + (for emails) a Resend key — note a local backend
may lack the Resend key, in which case confirmation emails *enqueue* but don't
send (they send on Render staging, which has it).

## Vendored schemas — keep in lockstep

`src/tprs/schemas/*` is a **vendored copy** of
`dev/tprs/packages/shared-schemas/src/*`. Reason: this site is a separate repo
deploying on Vercel with no access to the sibling `dev/tprs` workspace at build
time — a `file:../tprs/...` import would break the Vercel build. The copy is the
ADR-0029 open item ("import workspace package vs. a generated client") resolved
as **vendor** for Slice 1.

Rules:
- Treat it as generated. **Don't hand-edit shapes** — if the contract changes in
  `dev/tprs`, re-copy the changed file and re-normalize the imports
  (`./forms.js` → `./forms`).
- Pinned to **zod 3** (the version the source targets) — don't bump to zod 4
  without re-verifying the schemas.
- Only the customer-facing subset is vendored: `common`, `customer-flow`, `cart`,
  `checkout`, `forms`.

## Deployed preview (not local)

The Vite proxy is dev-only. To run the preview on a Vercel deployment, set
`PUBLIC_TPRS_API_BASE` to a reachable API host (e.g. `https://api.twistedpin.com`)
— which then requires CORS allowlisting of the Website origin on the backend.

## Checkout (the real payment path) — how it works + gotchas

`PaymentStep.tsx` runs the ADR-0025 §4 two-step flow with Stripe's **deferred**
PaymentElement. Read this before touching it — the ordering is load-bearing:

1. **On mount:** `POST /api/cart/items` (lane only) acquires the **10-minute**
   capacity hold + sets the cart-token cookie. The response body carries
   `cartToken` (we read it from there, never the HttpOnly cookie) + `holdExpiresAt`
   (drives the countdown).
2. **Render:** `<Elements mode="payment" amount=…>` — *deferred*, so the
   PaymentElement renders WITHOUT a PaymentIntent. **Why deferred:**
   `/checkout/payment-intents` resets the hold to a **60-second** grace
   (`extendCartHoldsForPayment`). If we created the PI on mount (non-deferred),
   the guest would get 60s to type a card → expiry + a charge-then-stuck trap.
   Deferred keeps the full 10 min on the form; the 60s grace only starts at Pay.
3. **On Pay:** `elements.submit()` → `POST /api/checkout/payment-intents` (server
   sizes the amount authoritatively from the cart cookie) → `stripe.confirmPayment`
   (`redirect:'if_required'`, inline for card + 3DS) → `POST /api/checkout/convert`
   (`cartToken` from step 1, `paymentIntentId`, `formAnswers`, `acceptedTerms`).
   Convert is idempotent: a transient post-charge failure re-runs convert only
   (button → "Finish reservation"), never a second `confirmPayment`.
4. **Countdown + Refresh:** when the hold expires, Pay disables; **Refresh**
   re-acquires (re-checks availability — shows "filled up" if someone took it).

**Payment-method GOTCHA (don't re-fight this):** the backend creates the PI with
`automatic_payment_methods`. Stripe **forbids confirming** a PI when the Elements
method config differs from the PI's — so `paymentMethodTypes` (manual) AND
`allowedPaymentMethodTypes` BOTH fail to confirm ("collected using … cannot be
confirmed through the API configured with automatic payment methods"). The client
**must be pure automatic**, which means **method filtering can only happen in the
Stripe Dashboard** (disable ACH / Cash App / Klarna / Affirm there). The clean
fix is a BACKEND change: create the PI with explicit
`payment_method_types: ['card','link']` — then the frontend can match it
(`paymentMethodTypes: ['card','link']`) and filter in code, keeping Apple/Google
Pay. Until then, Dashboard is the only lever.

## Going live — the cutover checklist

The build is deliberately isolated (`noindex`, `Disallow: /tprs/`, unlinked, and
the live `/reserve`→Roller CTAs untouched). To stand it up for guests:

1. **Prod backend** — deploy `dev/tprs` to a real host (staging is on Render).
2. **`PUBLIC_TPRS_API_BASE`** (Vercel env) → that host, OR a same-origin Vercel
   rewrite `twistedpin.com/tprs-api/*` → backend (simplest for the cart cookie).
3. **Cart cookie / CORS** — same-origin (rewrite) just works; cross-origin needs
   CORS allowlist + cookie scoped `.twistedpin.com` + `SameSite=None`. (Backend
   cookie is env-aware; the dev-proxy cookie rewrite is dev-only.)
4. **Stripe → live** — `pk_live` (Vercel) + live secret (backend) + **Apple Pay
   domain registration** + repoint the Stripe **webhook** at the prod backend.
5. **Resend** — prod key + verified sending domain (else emails enqueue, don't send).
6. **Un-hide + cut over** — drop `noindex` (`index.astro`) + the robots
   `Disallow` + sitemap exclusion; pick the public URL; **repoint the Reserve-a-Lane
   CTAs from `ROLLER_URL` to the SPA** (the deliberate Roller→own-checkout switch).

## Open backend items (coordinate in `dev/tprs`)

1. **Pricing bug.** `/api/availability` applies time-windowed price rules but
   `/api/checkout/quote` + `computeCheckoutAmountCents` use the catalog default —
   so the cart shows a rule-priced line over a default subtotal, and bookings are
   undercharged. Repro: product `aea165f3…`, `startTime 2026-06-13T12:30:00-05:00`
   (Sat) → availability 7995, quote 6995. Quote + checkout-amount must apply the
   same day-of-week + start-time rule resolution as availability.
2. **PI payment methods.** Switch the PI from `automatic_payment_methods` to
   explicit `payment_method_types: ['card','link']` so the frontend can match +
   filter inline-only methods in code (see the payment-method gotcha above).

## Text dialect — shared parser, no markup leaks (name / descriptions)

TPRS product fields (name, short/long description, category subtitle, add-on
name/description) are authored in a small inline-markup dialect — `**bold**`,
`*italic*`, `[links](url)`, `<u>`, `<font color="brand">`, `<br>` (see
[FORMATTING.md](FORMATTING.md)). The website renders it richly. The risk: any
**other** channel that interpolates a raw field renders the markup literally —
`**bold**`, `[Wait List](…)`, `<font color="tango">` show up verbatim in
confirmation emails, receipts, and Stripe line items.

The fix is one **canonical, framework-agnostic** dialect module — `src/tprs/text-dialect/`:

- `parseDialect()` → a shared AST (one parser, so tokenization can't drift)
- `toPlainText()` — every NON-HTML sink (Stripe names, plain emails/SMS, receipts,
  admin tables, reports). Strips markup; links → their text.
- `toHtml()` — HTML emails / receipt pages (brand colors → inline styles; escaped).
- React emitter — `src/components/tprs/Markdown.tsx` (website only).
- `fixtures.ts` — `input → plain → html` cases, a **parity test** both repos run.

**This module is vendorable on the same rail as `schemas/`** — zero framework
imports in the core, so the Fastify backend imports it clean. Promote it to a
shared package in `dev/tprs` (alongside `@tprs/shared-schemas`) and vendor into
both repos, kept in lockstep via `fixtures.ts`.

**Website side (done):** the React renderer is now just an emitter over the shared
parser; plain-text leaks fixed at their sources (ConfirmationStep, `alt`, aria-labels).

**Backend side (done in `dev/tprs`):**
1. **Stripped at the single name-resolution point** — `computeBookingTotals`
   (the join to `products` that resolves `li.name`) runs the name through
   `toPlainText`. One place feeds BOTH emails (`views/emails/`) and receipts
   (`views/receipt/`); the Eta templates needed zero edits. (My original note said
   "strip per-template" — the backend found the better choke point; this is the
   record of what shipped.)
2. **`receiptName` explicit field** wired as `receiptName ?? toPlainText(customerFacingName ?? name)`
   — the planned "receipt-level copy" evolution: when set it wins; when absent the
   stripped display name is the safe fallback. Ships with no required schema churn;
   upgrades later with zero consumer changes.
3. **Stripe (Slice 2): nothing to do** — it reads the same already-clean line-item
   name, so no leaked-markup receipt can send once payments are built.
4. **Parity-guarded** via `fixtures.ts` (both repos assert the same `input → plain → html`).

## Backend enhancement — per-day unavailable *reason* (for "Sold out" labels)

The booking calendar can't honestly say "Sold out" today because
`GET /api/availability/month` returns a bare boolean per day
(`{ date, available, priceCents }`) — no reason. A day is `available: false`
for four very different reasons, and only two of them are "sold out":

| Reason | Honest label |
|---|---|
| `past` | "Sold out" / greyed (genuinely unbookable) |
| `booked` (party room taken) | "Sold out" |
| `lead_time` (e.g. Suite Birthday needs 7 days) | "Books 7 days ahead" — NOT sold out |
| `not_offered` (product doesn't run that weekday) | plain greyed — NOT sold out |

Mislabeling a Tuesday or a lead-time day as "Sold out" reads as "you're always
booked," which is worse than the current neutral "Unavailable." So the SPA stays
neutral until the feed carries a reason.

**The ask:** add an optional `unavailableReason` enum to each month-availability
day (`"past" | "lead_time" | "not_offered" | "booked"`, present only when
`available: false`). Then the SPA can: label `booked`/`past` as "Sold out", show
a lead-time hint for `lead_time`, and grey `not_offered` silently. **Until then,
smart-forward** (DateStrip jumps a product to its soonest open day) already
removes the main "why is everything empty?" confusion — see `DateStrip.tsx`.
