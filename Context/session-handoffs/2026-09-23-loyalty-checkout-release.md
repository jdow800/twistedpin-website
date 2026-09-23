# Public Loyalty checkout release - September 23, 2026

Jon authorized publishing the prepared booking UI after finalizing /rewards/. Current main
204a7db was merged without conflict; /rewards/ and public/llms.txt are unchanged by this release.

## Resulting behavior

- The cart names an earned reward as "$50 off Loyalty (350 points)" using the server's values.
- The applied reward card explains the points come from the account that earned the reward.
  A recipient can book with their own contact details; there is no guest-phone match gate.
- Back/contact edits invalidate stale coupon previews and quote totals immediately. Taxes,
  fees and savings only come from the quote for the current request.
- Pending/failed pricing cannot authorize Pay; retry or removing the code recalculates totals.
- Points checkout uses the plain text-marketing checkbox, avoiding a misleading signup-$10 offer.
- Captured-payment recovery remains available, with distinct refund/pending/failure copy.
- Mobile reservation dates have their own row; applied reward names fit the cart ledger.

## Verification on the merged source

- 114/114 joined checkout/config/browser checks; 114/114 ordinary checkout/customer/coupon/
  payment/refund regressions against disposable loopback PostgreSQL only.
- Ten full-wizard offline scenarios passed, including recipient contact changes, stale responses,
  low balance, quote outage, remove/reapply and signup consent wording.
- 26 owner-only harness guard checks; booking-graph and full-wizard TypeScript checks passed.
- Required prebuild checks and npm production build passed. Mobile screenshot inspected.
- 94 emitted static JS/HTML/CSS/JSON files checked: no owner identity or test-harness markers.
  No new public routes; emitted BookingWizard.Ca8G5Ew5.js includes the reward cart label.
- Prior real owner charge/kiosk/refund and SMS proofs are in Loyalty's September23 audit notes.
  This release does not repeat those actions and does not claim a new real payment test.

## Boundaries and release status

Website publication only. No points issuance/notices, offer/rule activation, guest coupons,
messages, account changes, Zite publication or campaign replacement. The dev-only test tools
under scripts/ are not public Astro pages and need their separate ignored local configuration.

Before publication, read-only controls show mode disabled, owner lookup404, owner400points,
one historical delivered owner notice and zero temporary jobs. The current backend is live
at a66066f11390941fd5a50ab89382308da6c0a818 (later docs-only merge); no backend deploy in this step.

Deployment and production readback will be recorded in Loyalty/docs/rollouts/
2026-09-loyalty-2-execution-map.md and its dated public-checkout audit after Vercel succeeds.
This source, its test tools and this handoff are included in the Website release commit.
