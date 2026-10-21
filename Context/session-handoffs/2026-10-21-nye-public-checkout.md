# NYE public Brand checkout integration

## Scope and current status

Jon selected the Brand design and asked to continue toward the November 18,
2026, 9am Chicago sales opening. This extracts the approved Website rehearsal
source `942b77e` onto production `6a71dfe`; it does not merge the rehearsal branch.
The release is rebased onto repaired Website main `9101cbf`. The combined build,
strict type check, thirteen inherited Jingle security checks and six emitted
middleware/proxy checks pass. Its independent review found no blocking extraction
defects. Use the Website commit's Vercel status and public route readback as
deployment evidence; local test success alone is not proof of a live release.

Only `/reserve/nye/` uses the new Brand flow. The ordinary wizard, reward hook,
Stripe loader, API routing, marketing landing/video and production infrastructure
are unchanged. Shared form/payment additions are optional and preserve ordinary
defaults. No owner rehearsal, staff demo, database, payment or email was changed.

## Opening and recovery

The landing page and booking entry share `src/config/nye-opening.ts`, including
the exact `2026-11-18T15:00:00Z` instant. Direct visits before opening show
"Reservations open / Nov 18th @ 9am" and the clock, without package prices,
time choices, catalog requests or new cart sessions. At opening a mounted tab
loads current choices. Backend eligibility remains authoritative; the browser
clock grants no permission to purchase.

Shared payment discovery runs before new-sale gating. Existing ordinary or NYE
payments retain their original order and recovery, including when sales are
closed. A discovery outage retains the opening message and offers a retry; it
cannot start checkout. Sales-mode initialization is distinct from closed-page
initialization, preventing the opening tick from overwriting a stored draft.
Fresh visits after the final party ends show the next-visit link. An already
open checkout is not torn down at midnight; server cutoffs still apply.

## Production differences from the owner rehearsal

- Plain optional, initially unchecked SMS consent. Untouched, declined and
  accepted states persist in the draft and agree between quote and payment.
- No NYE reward lookup, signup offer or coupon field. Server coupon exclusions
  still require their separate production audit.
- No rehearsal notice, test-card setup, email relay, proxy or secret handling.
- NYE sales-cutoff copy directs guests to another party time, without ordinary
  walk-in guidance.
- Early deliberate holds and full-cart atomic replacements use the released
  session/replace API. Exact complete cart contents and lane coverage are
  verified again before preparing a new payment. Retained payment recovery does
  not depend on the original soft-hold timer.

## Verification

Run locally from this checkout, with Node24 and locked dependencies:

```text
node scripts/check-nye-cart-selection.mjs
node scripts/check-nye-selection-catalog.mjs
node scripts/check-nye-selection-rules.mjs
node scripts/check-checkout-recovery.mjs
node scripts/check-nye-brand-flow.mjs
node scripts/check-nye-opening.mjs
npm.cmd run build
npm.cmd run dev -- --host 127.0.0.1 --port 55612
node scripts/check-nye-public-page.mjs
node scripts/check-nye-landing.mjs http://127.0.0.1:55612
```

All browser API requests are synthetic/intercepted. Full Brand coverage includes
23 scenario groups, 29 atomic-cart checks, 9 catalog checks, selection rules and
shared recovery regression. Consent states, opening in another browser timezone,
saved draft at the boundary, shortages, alternatives, lost responses, indexed
food, catalog changes and payment locks are covered. Existing countdown coverage
has 175 checks; landing checks cover seven widths. Actual Astro booking-route
checks cover four widths, closed/end states and recovery-discovery outage.
Strict TypeScript5.9.3 checks include the NYE entry, ordinary BookingWizard,
their transitive imports and the shared clock/client, with `astro/client` types.

Screenshots/results regenerate under ignored `.astro/nye-brand-flow`,
`.astro/nye-public-page` and `.astro/nye-landing`. Synthetic fixtures are tracked
at `scripts/fixtures/nye-brand.mjs`; no customer data or credentials are included.
Original existing images/fonts remain in their repository homes. The interactive
synthetic harness (`node scripts/check-nye-brand-flow.mjs --serve`) uses55614 and
must not be mistaken for production pricing or real payment evidence.

## Still required before sales open

This is a Website integration, not final sales-launch approval.

- Payment-owned inventory creation is still OFF in the backend. Activate only
  after shared-writer compatibility and real processor/contention rehearsal.
- Availability reason codes: partial inventory, held inventory, sold out, cutoff
  and unknown must be distinguished. Current boolean failures use neutral copy.
- Verify/resolve exact-opening availability cache behavior; a fresh browser
  fetch alone does not invalidate edge/server cached pre-opening results.
- December31 ordinary-booking exclusion and handoff; per-party Traditional
  reserve blocks for16 of17 initial sale capacity.
- Final real end-to-end booking/email/calendar, staff edits, bowl-near alert,
  operations export, cancellation/release and production coupon checks.
- Page-speed work remains explicitly deferred by Jon.
- Prepare Meta event and Google Business Profile event visuals/copy before
  opening. The event date is December31; November18 is the sales opening.
