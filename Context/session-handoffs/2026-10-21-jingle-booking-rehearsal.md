# Jingle Bowl booking rehearsal

October 21 follow-up in `codex/jingle-routing-20261021`: the ordinary wizard now
has a shared opt-in event-date controller, based on released NYE `cd645c09`.
Jingle is not registered by public page defaults. An enabled route without
verified public readiness has no guest link; DEV protected review may use the
isolated booking route. Twenty-eight network-blocked synthetic browser scenarios
exercise the actual ordinary wizard (separate from the API-free concepts demo),
including preserved drafts/history, accepted payment priority, NYE regression,
and the Chicago day boundary in a Tokyo browser. Captures live in ignored
`.astro/nye-date-handoff/`; reproduce with `scripts/check-nye-date-handoff.mjs`.
The running reviewed booking service remains in the original worktree below.

Local owner review built after Jon authorized continuing the booking/form work.
The approved Christmas landing and alternating ornament/Santa remain separately
protected on production. This booking route is development-only; it returns 404
in production even with a valid review cookie. No sales, products, homepage
campaigns or operational event flags are activated by this branch.

## Review and reproduce

Start the separate backend fixture documented in sibling
`jingle-booking-20261021/apps/backend/scripts/jingle-rehearsal/README.md`, then run
`powershell -NoProfile -File scripts/start-jingle-booking-rehearsal.ps1` here.
Open `http://127.0.0.1:55636/jingle-bowl/booking/`, password `jingle`.
The fixed synthetic contact is prefilled. Do not enter real card/contact data.
The service uses FakeRail; no payment processor, email, SMS or worker is started.

The local SSR proxy holds the generated backend capability on the server. It
requires the existing signed review cookie, exact local origin, explicit API
route allowlist and the dedicated local transport. Its destination is fixed to
127.0.0.1:55634. No browser key, arbitrary destination or live API fallback exists.
All API responses are no-store/noindex; month discovery is intentionally denied.
The installed lazy Stripe entry is aliased only for this local development
process because the normal SDK loads a script on import. The Jingle payment and
draftless-recovery adapters never mount or call Stripe. Production imports and
ordinary/NYE checkout defaults remain unchanged.

The shared Brand wizard accepts explicit event configuration, payment and
discovered-recovery components. NYE remains its default. Jingle uses its own
draft/date/identity/menu presentation while the cart mutation and payment
recovery identity remain shared: a campaign switch cannot replace an unknown
in-flight cart or accepted checkout. Extra indexed product scope is explicit;
synthetic codes 9106/9107 do not become general NYE form defaults.

## What is reviewable

Jon's follow-up selects the ordinary one-/two-hour arcade offer: $15 per card
with $20 in game play. It is now attached to both synthetic Jingle packages as
code9108, sourced from public code122 on ordinary roots4/5. The optional photo
card has quantity controls; each unit is a separate card. Accepted cart/quote and
confirmation retain its actual charge; it never adds lanes or food pairs.

The food page removes repeated helper copy, uses short Pizza/Soda labels and
shows a concise essentials panel. Native "Read full reservation information"
contains all seven unchanged blocks, followed by the unchanged required
acknowledgment. NYE's default presentation is unchanged. The footer marks test
pricing as pending; Jon says the current lane prices are not final.

Traditional/VIP choice, five proposed December 6 starts, quantity, indexed
pizza/pitcher pairs, seven information blocks, one acknowledgment, retained
checkout review, simulated completion and actual persisted confirmation/kitchen
previews. The approved NYE food choices are reused exactly. Refills are excluded.
Food ordinal means the first/second purchased lane, not an assigned physical lane.
The backend validates pairs before accepting payment. There is one room per order.
Both completion paths expose previews restricted to the originating cart cookie.

Prices 149.95/189.95 and the untaxed allocation are illustrative. The five-start
39-reservation proposal, 90-minute duration, 15-minute turnover and 30-minute
cutoff remain review configuration. Shared physical capacity and retained payment
claims are real in the isolated DB. Aggregate per-start quotas and production
all-channel December 6 exclusivity still need implementation; the local HTTP
guard is not that production enforcement. Final tax/fee allocation, actual
catalog IDs, VIP appetizer, hours/Santa/staffing, cancellation terms and on-sale
readiness remain pending. Do not infer any from NYE or Google's Closed label.

## Verification

`scripts/check-jingle-arcade-food.mjs` adds a connected follow-up covering both
products' regular arcade attachment,320/390/1280 layouts, the full information
disclosure, required acknowledgment and footer clearance. It creates ONE local
synthetic Traditional lane with TWO cards and verifies one food pair, $30 arcade
charge, $179.95 illustrative retained total and one simulated payment attempt.
External browser requests are blocked. Captures/results are ignored under
`.astro/jingle-arcade-food/`. This test and25 focused backend guard/projection
checks passed. The existing23 NYE browser scenario groups, shared cart/catalog
checks, focused strict types and production Website compilation also passed.

`scripts/check-jingle-booking-rehearsal.mjs` runs actual connected Traditional
390px and VIP 1280px flows with external browser requests blocked. It verifies
two indexed pairs, omitted marketing consent, one accepted attempt, persisted
projection, recovery after a completed response is lost, and draftless recovery
with the original cookie. Each run consumes isolated inventory and creates two
synthetic bookings; it never resets the database. Captures/results are in ignored
`.astro/jingle-booking-rehearsal/`; source and reproduction steps are tracked,
regenerable screenshots and synthetic runtime state are not Git backups.

NYE's 23 complete browser scenarios, 29 atomic-cart checks, nine catalog checks,
paired-form interactions and ordinary recovery checks passed during extraction.
Strict focused TypeScript and Jingle paired-form/config tests pass. Review-gate
checks include authenticated loopback mutations, wrong origins, anonymous access,
encoded paths and return allowlisting. Final build/recovery result is recorded
in the backend's `docs/jingle-bowl-2026/rehearsal-status.md`.

## Coordination and next step

Base is Website fc1d2c6 (protected NYE concepts plus Roy and Jingle predecessors).
Keep public homepage unchanged. Jon selected NYE Mirrorball and explicitly locked
December 7,2026 America/Chicago for the homepage transition after Jingle through
December 6. The date is confirmed; automatic scheduling is still pending. NYE sales still
open November 18 at 9am Chicago. Roy v88 is live but no final staffed/session/link
readiness is supplied by this rehearsal. Handoff final approved facts before gates.
Backend owner independently activated global payment inventory protection on
unchanged 6e61500; this branch does not change that production flag.

Next: trusted event policy and per-start allocation enforcement across availability,
cart/accepted claims and staff/Avery/recovery writers, plus ordinary-booking date
redirect. Keep this simulation separate until reviewed production configuration
and final business rules exist. Page-speed measurement remains deferred.
