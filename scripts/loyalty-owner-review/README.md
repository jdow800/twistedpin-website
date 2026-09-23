# Local owner booking review

This operator surface reuses the current Website booking wizard and real catalog. It is not an
Astro page and is not published by the Website build. Default mode cannot acquire a hold, create
a payment, book, upload, change an account or issue/send an invitation. It uses the Stripe stub.

From this isolated Website worktree:

    node scripts/loyalty-owner-review/server.mjs

It binds only127.0.0.1:55443, expires after45 minutes, accepts only the known owner reward for
read-only quotes, and never forwards browser credentials or request headers to arbitrary hosts.
The owner's phone/email and public Stripe key live in Loyalty's ignored local configuration;
fictional numbers are used by the policy tests. Real source assets use the existing Website CSS.

The --live-owner mode is prepared separately and is OFF unless the operator supplies the fresh
Loyalty/scripts/points-notice/owner-private-checkout-window.local.json activation packet. It
requires the verified owner/code, known deployed backend commit, live public Stripe key, designated
booking phone/email, and a future deadline within45 minutes. The activation operator must first
verify the backend, code/offer/rule, disabled notices, independent database shutoff and closed-hours
timing. This server does not activate or mint anything itself. Never fabricate the packet as a way
to bypass those prerequisites.

When armed it permits one eligible regular lane, one test cart and only the designated owner's
payment. Only payment IDs returned by this test may convert. A completed booking blocks another
payment. Already-started payments can still reach conversion/refund for30 minutes after the test
cutoff; blocking them immediately could strand a captured charge. The backend remains authoritative
for points, product eligibility, single use, amount, coupon expiry and refund recovery.

The upstream cart cookie is held in server memory; it is not exposed in logs. Payment client secrets
are forwarded to Stripe Elements in the owner's browser, never written in the operator report.
The operator report records payment IDs and booking ID for cleanup. Do not restart an armed server
during checkout: inspect/reconcile any recorded intents before arranging another trial.

Checks:

    node --test scripts/loyalty-owner-review/policy.test.mjs scripts/loyalty-owner-review/live-policy.test.mjs

Loyalty/scripts/points-notice/owner-readonly-browser-proof.mjs exercises actual real-catalog reads
and proves HTTP write rejection. Its ignored screenshots/reports are under Loyalty/scripts/points-notice.
Payment-gate unit checks are not a completed production payment or kiosk/refund proof.

A second owner refund-webhook trial uses `--refund-retest` with `--live-owner`. It reads
separate `owner-refund-retest-preview.local.json` and `owner-refund-retest-window.local.json`
packets, and writes `owner-refund-retest-server.local.json`. The first used-code evidence
is preserved. All existing contact, payment, product and deadline gates still apply.
