# Reserve loading experiments: held from production

Jon authorized starting with `/reserve/` after identifying faster old Vercel
previews. Two website implementations were built and reviewed, then rejected on
live performance evidence. Website production remains the exact-day client at
`89db79ba49b91dc3d7c083e98f91ab28dbf690b6` during this comparison.

## Deployed artifacts

- Current: `dpl_5dDay1N7t973WqjXTEy4SK12r5uJ`,
  `https://twistedpin-website-2nmi9qy00-jon-9416s-projects.vercel.app/reserve/`.
- Month-first experiment: `dpl_CywESQR6kU4i5q1EKQi7mtZpBYo8`,
  `https://twistedpin-website-huvzaoj2t-jon-9416s-projects.vercel.app/reserve/`.
- Parallel month/day experiment (this branch):
  `dpl_3d1G4cBxezu8k9mJR5MDoPkxsbBx`,
  `https://twistedpin-website-6f7sk5djd-jon-9416s-projects.vercel.app/reserve/`.
- Last production with the old booking client:
  `dpl_7KiDwnKwAJypmhHA9Ppg98dZ7vfv`, commit `36e5be1`,
  `https://twistedpin-website-j2zi8xix3-jon-9416s-projects.vercel.app/reserve/`.

The NYE owner-rehearsal preview uses a different backend tunnel and is not a
valid production regression baseline. The independent Claude Opus 5.5 review
verified Vercel metadata, deployed bundles and source history before these edits.

## What the experiments changed

The first candidate loaded four monthly summaries, displayed packages and
advanced to an ordinary available date, then loaded its exact times. That made
after-hours cards earlier but inserted a second availability stage for a guest
booking an available today. The second candidate started four selected-day reads
and four month reads together. This avoided that serial dependency but made the
reads compete for backend capacity. Neither improved the whole journey reliably.

Both preserve payment discovery and recovery, policy envelopes, server booking
rules and event handoffs. The parallel experiment passes 30 synthetic behavior
groups, the unchanged 32 fast-start groups, TypeScript, existing availability,
deadline, recovery and NYE/Jingle suites, and full builds. Three flag builds
verified 36 emitted-prop assertions: month-first off restores the current path;
fast-start off disables both; birthdays and `/tprs/` never opt in. The actual
Jingle emitted-build check passes 30 assertions. This correctness evidence does
not overcome the measured performance regression.

## Cold live observations

Times below are seconds from the booking bootstrap request, measured with the
same fresh Chromium 390px Chicago context and the same VIP two-hour package.
Every availability response in the rows below reports a server cache miss.

| Case / receipt | First usable package | Exact times ready |
| --- | ---: | ---: |
| Current, available-day `current-day-2` | 1.761 | 1.829 |
| Month-first, available-day `candidate-day-1` | 1.721 | 3.107 |
| Parallel, available-day `hybrid-day-1` | 2.672 | 2.748 |
| Current, after-hours `current-night-1` | 3.799 | 4.040 |
| Current, after-hours `current-night-3` | 3.685 | 3.766 |
| Month-first, after-hours `candidate-night-1` | 2.721 | 4.122 |
| Parallel, after-hours `hybrid-night-1` | 2.785 | 4.686 |

The available-day case sets only the browser clock to October 23 noon CT while
the live backend is still on October 22 evening. It requests genuine October 23
inventory and exercises that request shape; it is not an actual daytime traffic
measurement. Warm and mixed-cache runs were retained separately and not pooled
with these cold observations. The samples are small and sequential, not a load
test or a statistical performance guarantee.

The observer clicks one package and stops at times. It never selects a time,
creates a cart/hold/quote, submits a customer form or reaches payment. A request
guard blocks those actions. There were no blocked or failed requests in these
live observations. `Server-Timing` captures cache state, computation and total
application time. Routing disables browser HTTP caching symmetrically for all
observations; these measurements cannot be pooled with earlier normal-cache runs.

## Reproduction

`node scripts/measure-reserve-loading.mjs <reserve-url> <label>` writes sanitized
receipts under ignored `.astro/reserve-comparison/`. Use
`--clock=2026-10-23T17:00:00Z` for the above client-clock case and `--stay-main`
for observation without a package click. Protected previews accept the existing
automation credential through `TP_PREVIEW_OBSERVATION_TOKEN`. Never print or
commit it. The helper applies it only to the target origin and will not forward
it across redirects. Use the same authentication mode on both sides.

`node scripts/check-reserve-month-first.mjs` reproduces the synthetic hybrid
coverage and narrow screenshots under `.astro/reserve-month-first/` without
external requests. Fixture timings are not production claims.

## Next narrow change

Keep the current website client and share the TPRS day request's special-day
guard between availability calculation and policy metadata. The month route
already uses this pattern. It removes duplicate database work without changing
the ordering of the website, caching private inventory, bypassing restrictions
or removing payment recovery. Measure total application time, not just compute
time: moving guard loading outside the compute timer alone is not a speedup.

The backend work is isolated at `dev/.wt/tprs-reserve-read-20261022` on
`codex/reserve-day-policy-read-20261022`; this document does not claim it is live.
Do not promote either website experiment as a substitute.
