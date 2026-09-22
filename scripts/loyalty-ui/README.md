# Local earned-reward payment-screen proof

September 22, 2026. Isolated Website branch codex/loyalty-2-ui-internal, base 4b0767f.
80 joined tests passed: 66 existing TPRS cases and 14 browser cases. 114 existing regressions and
Website booking-graph/backend TypeScript checks passed. No production build/deployment or real send.

This harness imports the actual PaymentStep, CouponField, wizard reducer, quote hook and styles.
The browser bridges API requests into the isolated backend's real Fastify routes and synthetic
PostgreSQL/FakeRail. Stripe is replaced only here with a simulated form. It does not exercise the
full date/product selection journey, deployed proxy, real Stripe Elements/3DS, Zite or SMS delivery.

Start only the previously verified disposable loopback PostgreSQL cluster from the Loyalty runbook.
From C:/Users/jdow8/dev/tprs-loyalty-2-internal/apps/backend:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/loyalty-internal/run.ps1 -UI
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/loyalty-internal/run.ps1 -Regression
pnpm.cmd exec tsc --noEmit -p tsconfig.loyalty-internal.json
pnpm.cmd exec tsc --noEmit -p ../../../Website-loyalty-2-internal/tsconfig.loyalty-ui.json
```

Dependencies are locked in this Website worktree; installed offline with npm ci --ignore-scripts.
Browser tests use pinned Playwright 1.49.1 and its already-installed Chromium. No browser download
or real provider key was used. Vite binds only 127.0.0.1:55441 and rejects a root credential .env.
The normal Astro/Vercel config and middleware are not loaded. Nonlocal browser requests are blocked;
the Node guard still permits only the disposable database socket. No sender or scheduler runs.
The UI server/browser close after the suite; stop the verified disposable database when done.

Browser cases are in the existing TPRS checkout.test.ts fixture and gated by LOYALTY_UI_TEST=1.
The -UI runner sets that alongside the synthetic-only guard. The full evidence and remaining gates
are in ../Loyalty/docs/audits/2026-09-22-booking-ui-proof.md (relative to the dev directory).

Ignored regenerable output/: reward-applied-mobile.png, insufficient-points-mobile.png,
refund-requested-mobile.png. Screenshots were visually inspected. Raw JSON results are ignored in
the backend harness. Source/notes/lockfile remain uncommitted and unpushed, not GitHub-backed.
Only Jon's designated phone is authorized for future real testing; this suite uses synthetic data.
Quiet prospective guest cutover and a first-run/24-hour/seven-day impact preview remain required.
