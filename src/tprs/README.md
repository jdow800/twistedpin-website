# TPRS booking flow — `/tprs` (ADR-0029)

The customer self-serve lane-booking experience, built as React islands inside
this Astro site (ADR-0029 §1) and consuming the TPRS customer-flow HTTP API
(ADR-0025). It lives at **`/tprs`** as an internal preview: `noindex,nofollow`,
sitemap-excluded, robots-disallowed, unlinked. The live `/reserve` → Roller path
and every `ROLLER_URL` CTA are untouched — the cutover is a separate, gated step.

> **Authoring product copy?** See [FORMATTING.md](FORMATTING.md) — how to add
> bold / color / links / line breaks to TPRS fields (names, descriptions,
> category subtitles) + the allowed brand-color names (glow, copper, tango, …).

## What's here (Slice 1 — lean read-only cut)

`date → grouped product grid → detail (time-slot + lane qty) → add-ons →
guest details (+ ADR-0030 form renderer + "Have a code?")`. It performs **no
backend writes** — no cart-hold, no PaymentIntent, no convert.

```
src/tprs/
  schemas/        VENDORED copy of @tprs/shared-schemas (see "Vendored schemas")
  client.ts       typed API client (reads + coupon-preview), parses every response
  pageConfig.ts   ADR-0025 §1 pageConfig (terms + UX copy)
  README.md        this file
src/components/tprs/
  BookingWizard.tsx   single client:only React island, useReducer state machine
  state.ts            reducer + derived selectors
  format.ts           cents/time/date/calendar helpers
  StickySummary.tsx   running subtotal bar (honest "taxes & fees at checkout")
  FormRenderer.tsx    ADR-0030 §5.1 generic form renderer (all 8 field types)
  steps/              DateStep, ProductGridStep, DetailStep, AddOnsStep, GuestDetailsStep
  tprs.css            scoped styles on the global design tokens
src/pages/tprs/index.astro   the noindex host page
```

## Run it locally

1. **Backend** — in `dev/tprs/apps/backend`: `pnpm dev` (listens on `:3000`,
   needs its `.env` `DATABASE_URL`).
2. **Website** — here: `npm run dev` (Astro on `:4321`).
3. Open `http://localhost:4321/tprs/`.

The booking islands fetch a same-origin `/tprs-api/*` path that the Vite dev
proxy (`astro.config.mjs`) forwards to the backend. Same-origin sidesteps CORS
and the `Secure`/`Domain`-pinned cart cookie on localhost http (ADR-0029 §3 dev
variant). No backend edit is needed for the read-only flow.

> **Thin catalog today:** `GET /api/products/bookable` currently returns one
> product ("8 Lane Rental", $70), no images, no real categories, and no attached
> forms. The flow degrades gracefully (branded fallback tile, single-bucket grid,
> dormant form renderer). Real imagery/categories/forms come from the backend
> "presentable catalog" + ADR-0030 seed work upstream.

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

## Slice 2 gates (NOT done here — coordinate in `dev/tprs` / infra)

Cart-commit + payment + convert are deferred because they need changes this repo
can't make:

1. **Cart-token cookie amendment (backend).** The cart cookie is hardcoded
   `Domain=.book.twistedpin.com; Secure; SameSite=Lax`
   (`dev/tprs/apps/backend/src/server.ts`) — dead on localhost http and pinned to
   the wrong parent domain for the `twistedpin.com` plan. This is the ADR-0029 §3
   cross-ADR cookie amendment: make the serialization environment-aware (drop
   `Secure` + the `Domain` attribute in dev; scope to `.twistedpin.com` in prod).
2. **Stripe provisioning.** Publishable key + Express Checkout / PaymentElement
   wiring (Link on, pay-later off per ADR-0029); Apple/Google Pay domain
   verification.
3. **`api.twistedpin.com` host + CORS** for any non-local preview.

When those land: wire `POST /api/cart/items` (hold + countdown) at the
"Continue" out of guest details, then `payment-intents` → Stripe → `convert`. The
wizard state already carries `items` + `formAnswers` in the shape those calls
need.

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
