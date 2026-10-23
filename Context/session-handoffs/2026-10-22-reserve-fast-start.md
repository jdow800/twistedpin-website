# Ordinary reserve availability release and rollback

Jon authorized a first improvement to `/reserve/` after the cross-repository
availability investigation and independent Claude Opus 5.5 Ultra Code review.
This release removes a request stage from the common no-times-today journey and
reduces competing reads. The backend's serial database work remains a separate
performance task.

## Behavior

Only `src/pages/reserve.astro` opts into `reserveFastStart`. The shared wizard
defaults to the existing behavior, including on birthdays and `/tprs`. Dedicated
Jingle and NYE checkout remain unchanged.

- Use the grouped catalog's four configured product IDs instead of fetching a
  second flat catalog. A failed fetch gets Retry packages. A successfully loaded
  subset falls back to the existing flat lookup and cross-check, because staff
  can legitimately deactivate a product or its category. This fallback also
  skips the tomorrow shortcut; it never blocks the remaining valid packages.
- Finish the selected date's four reads before starting automatic month reads.
  Remove the 1,200 ms release timer in this mode. Explicit calendar browsing
  still starts month reads immediately; the existing eight-second read deadline
  prevents an indefinite wait.
- On the initial today only, require all four exact reads to succeed with no
  policy restriction and no available times before checking tomorrow directly.
  Skip that shortcut when tomorrow is a registered event destination. One
  successful, policy-free tomorrow answer can select it; the cards and time list
  reuse those exact responses and in-flight requests. Other products remain
  pending until their own answers arrive.
- If tomorrow provides no verified opening, resume the existing month search.
  There is only one speculative next-day group, never a day-by-day scan. This
  adds one request stage when both today and tomorrow have no times; it saves the
  intervening month stage when tomorrow is available.
- The shortcut, manual choice and month search share one forward-decision owner.
  Late results cannot replace a guest's chosen date, and unmounted consumers
  ignore late replies. Unknown dates remain disabled in this release.
- Stop prefetching up to seven future dates after selecting a package. Changing
  dates in detail still checks the newly selected date, which may now require a
  fresh read. Loading the current date's times retains its shared cache.
- Use the neutral message “No more online times today” instead of claiming a
  sellout when online start times or their cutoffs have passed.

The existing payment-discovery barrier stays ahead of editable inventory.
There are no backend, schema, hosting-region, cache-TTL, sales-opening, booking
cap, policy, hold, price or payment mutations in this change. The existing
device-local ordinary date handling is also unchanged; the known Chicago/device
timezone discrepancy remains follow-up work.

## Reproduce validation

Install the locked dependencies physically in the isolated worktree. A shared
node_modules junction can fail Windows Vercel packaging; it is unnecessary.

```powershell
npm.cmd ci --prefer-offline --no-audit --no-fund
node scripts/check-reserve-fast-start.mjs
node scripts/check-availability-first-day.mjs
node scripts/check-availability-read-deadline.mjs
node scripts/check-booking-date-policy.mjs
node scripts/check-checkout-recovery.mjs
node scripts/check-nye-date-handoff.mjs
node scripts/check-nye-brand-flow.mjs
npm.cmd run build
```

These browser fixtures use synthetic local responses, including payment recovery;
they make no production holds, payments or customer submissions. Screenshots and
receipts regenerate under ignored `.astro/`. The old booking-date-policy fixture
needed its missing `import.meta.env.DEV=false` build definition: its prior crash
was reproduced with unchanged `origin/main` components before repairing the test.

Pre-release acceptance passed: 32 new reserve behavior groups, 23 existing
availability groups, 22 deadline checks, booking-date policy, checkout recovery,
38 NYE/Jingle handoff scenarios, 23 NYE full-flow groups, strict TypeScript, all
nine prebuild suites, and the full Astro/Vercel production build. The new suite
covers legitimate admin-omitted products, both catalog retry paths, late replies
after manual choice or unmount, the already-loaded calendar race, special-date
exclusion, and both feature-flag paths. Main/detail screenshots fit at 320/390 px;
detail also passes at 1280 px. Local menu credentials are absent, so the build
uses its existing GoTab/Untappd fallback; hosted production retains its own env.

The independent final review approved the scheduling guards and caught the
initially over-strict catalog assumption. The shipped fallback handles legitimate
deactivation, with explicit regression coverage, instead of requiring all four
configured products to remain active forever.

## Before-release measurements

Source base: `f9e8a5174664d133f5ea760acead7bdca863cd38`.
Production deployment recorded before release:
`dpl_6pEWS8J5ow7cNVnwbCQJybct9rnY`, URL
`twistedpin-website-jm4wpscut-jon-9416s-projects.vercel.app`.

Three fresh mobile Chromium contexts, 390 by 844, Chicago timezone, normal
caching, no CPU/network throttling, October 22 evening. All advanced to October
23 and selected the two-hour VIP package. Package clicks only; no time or
Continue action. Each journey made 23 API requests, including 19 availability
reads, all successful, with no page errors. Availability responses reported
backend cache misses.

| Sample | Navigation to usable package | Booking-request start to usable package | Package to times |
| --- | ---: | ---: | ---: |
| 1 | 7,418 ms | 4,320 ms | 68 ms |
| 2 | 4,694 ms | 4,381 ms | 89 ms |
| 3 | 4,312 ms | 3,884 ms | 84 ms |

The first navigation includes about three seconds before booking requests begin.
These are observations, not a controlled latency guarantee. Raw public-only
receipts stay in the separate investigation worktree's ignored
`.tmp/availability-deep-dive/reserve-before*-20261022.json`. Its committed
`scripts/measure-public-availability.mjs` reproduces the observer. Compare the
same selected date and product after release, including cache headers and both
timing intervals. Daytime success and exhausted-today are tested with controlled
clocks locally; an evening live run cannot establish real daytime performance.

## Rollback

The old runtime path is retained and tested. Set the Vercel production build
variable `PUBLIC_RESERVE_FAST_START=false` and redeploy to disable the change on
this page. This is a build-time switch, not an instant runtime toggle. Removing
the `reserveFastStart` prop in `reserve.astro` has the same effect.

For immediate hosting rollback, first check whether another release has landed.
If this release is still the newest, restore the recorded previous deployment:

```powershell
vercel.cmd rollback dpl_6pEWS8J5ow7cNVnwbCQJybct9rnY --yes --timeout 45s
```

Then revert only this release's commit and push that revert to main so source
and production agree. Do not reset main or erase unrelated intervening changes.
If other work has since shipped, use the page off switch or a targeted revert
instead of restoring an old whole-site deployment. There is no database or
backend rollback. Verify `/reserve/`, exact-date package/time loading, payment
recovery, and the event handoff routes after any rollback.
