# Jingle Bowl resumed Website rehearsal

This supersedes the active setup instructions and pending-price/schedule notes in
`2026-10-21-jingle-booking-rehearsal.md`. That file remains a historical account
of the original review. The original review on ports 55632/55634/55636 is intact.

## Approved facts and remaining gates

Jon confirmed Sunday, December 6, 2026 is Jingle Bowl only, with no ordinary
reservations before, during or after the event. He approved $149.95 Traditional
and $189.95 VIP per lane, and explicitly locked the 39-reservation schedule and
a 30-minute booking cutoff before each start. Each reservation includes 90
minutes of bowling with 15 minutes of turnover. Times are America/Chicago.

| Start | Traditional lanes | VIP lanes |
| --- | ---: | ---: |
| 1:45 PM | 6 | 2 |
| 2:00 PM | 6 | 2 |
| 2:30 PM | 5 | 2 |
| 3:30 PM | 6 | 2 |
| 3:45 PM | 6 | 2 |

The shared NYE pizza/soft-drink choices, per-lane food pairs, no pitcher refills,
and ordinary arcade offer ($15 per separate card for $20 play) remain as reviewed.
The compact food UI retains all seven complete operational information blocks
inside a native disclosure and the exact visible required acknowledgment.

Final tax/fee allocation, production product/form identities, sales opening,
final staffed/Santa/closing hours, cancellation terms, VIP appetizer, and Shanna's
proof remain pending. Base lane prices and the schedule are approved, not price
placeholders. This fixture's untaxed totals do not approve final tax treatment.

## Source and isolated profile

Worktree: `jingle-website-resume-20261022`, branch
`codex/jingle-website-resume-20261022`, based on live Website `b6458eb`.
Saved Jingle commits `e02ccc2`, `1941d69`, and `a9fa9eb` were integrated without
adopting unpublished NYE opening changes. Only decision-log prepends conflicted;
both histories are retained. Selected-day priority, the eight-second complete
read deadline, and the initial-today smart-forward guard remain intact.

The current isolated backend is sibling `jingle-resume-20261022`, with interactive
PostgreSQL 55688 and HTTP 55684. Its separate quota-test database uses 55682.
Website development uses 55686. The backend's fresh session file is
`apps/backend/scripts/jingle-rehearsal/local/session.json`; it is ignored runtime
state and is never copied into source. Synthetic products remain 9106/9107/9108,
with explicit per-caller paired-form scope. No production mapping is inferred.

Start the fresh backend using its rehearsal instructions, then from this Website
worktree run:

```powershell
powershell -NoProfile -File scripts/start-jingle-booking-rehearsal.ps1
```

Open `http://127.0.0.1:55686/jingle-bowl/booking/`, password `jingle`. The launcher
refuses an occupied 55686 and reads only the fresh sibling session. Use a fresh
browser profile. Synthetic contact is prefilled; do not enter real contact/card
data. Real `node_modules` were installed with `npm ci --offline --no-audit
--no-fund`; no dependency junction or dependency source patch is required.

The SSR proxy is fixed to loopback 55684 and requires the signed review cookie,
matching origin, explicit transport, and server-only fixture capability. Payment
and draftless recovery use FakeRail adapters. Production compilation returns404
for the booking route. Public Jingle registration/readiness flags, homepage,
campaign timing, and live booking configuration remain unchanged. This is not a
production launch. The ordinary December 6 handoff is opt-in; readiness false
never exposes the protected URL. Accepted checkout recovery keeps priority.

## Verification and evidence

Run the scripts below with Node from this worktree. Browser suites either fulfill
synthetic requests or block every origin except the fresh local Website.

- `check-jingle-event-config.mjs`, `check-jingle-pairs.mjs`: dated event identity,
  approved copy, explicit form scope, complete required information and NYE defaults.
- `check-jingle-review-auth.mjs`: 17 checks; `check-routing-middleware.mjs`: seven
  native emitted-entrypoint/proxy checks.
- `check-nye-pairs.mjs`, `check-nye-cart-selection.mjs` (29),
  `check-nye-selection-catalog.mjs` (nine), `check-nye-brand-flow.mjs` (23 groups).
- `check-nye-date-handoff.mjs`: 28 actual ordinary-wizard scenarios, including
  Chicago expiry in a Tokyo browser and recovery/draft/history precedence.
- `check-checkout-recovery.mjs`, `check-booking-date-policy.mjs`,
  `check-availability-first-day.mjs` (23 groups), and
  `check-availability-read-deadline.mjs` (22 checks).
- Focused strict TypeScript passes for both wizards, event form/preview, MainStep,
  DateStrip, Jingle wrapper/adapters, and the rehearsal proxy.
- `PUBLIC_TPRS_API_BASE=/tprs-api`, `NODE_ENV=production`, `npm run build` passes,
  including all repository prebuild checks. Existing missing menu-provider
  credentials render their documented local fallback; no provider secrets were used.

The standalone browser harnesses explicitly define `import.meta.env.DEV` so the
new development-only transport branch is tested in the intended build environment.

Connected `check-jingle-booking-rehearsal.mjs` passed Traditional390 and VIP1280
against the fresh quota-aware backend: two indexed food pairs, no marketing,
one accepted attempt, persisted confirmation, lost-completion-response recovery,
and draftless recovery with the original cookie. It creates two synthetic bookings.
Captures and result receipts are ignored under `.astro/jingle-booking-rehearsal/`.

`check-jingle-arcade-food.mjs` passed at320/390/1280: approved product prices,
90-minute duration and30-minute cutoff, regular arcade attachment, full
information disclosure, acknowledgment validation, input/footer clearance, one
lane with two cards and one food pair, $179.95 persisted test total, and one
simulated checkout. Captures/results are in `.astro/jingle-arcade-food/`.

Its first attempt stopped before any hold or accepted attempt when day reads
took14.2/15.9seconds; the eight-second client deadline correctly offered Check
again. Backend review found no ongoing query wait. A bounded proxy read then
returned all five starts in126ms, and the unchanged flow passed on retry. Heavy
offline testing was concurrent, but the earlier slowdown's cause is not proven.
Exactly three synthetic bookings were completed; no fixture reset, provider
call, or production change was made in response.

Screenshots are regenerable local evidence, not a Git backup. Source and these
reproduction instructions are tracked. Connected checks consume isolated quota;
do not run repeatedly without coordinating the owned fixture.

## Next safe integration step

NYE owns the first Website release. Its upcoming initialization-generation and
memory-first discovered-recovery changes touch `NyeBrandWizard.tsx`. Before any
Jingle release, rebase onto the exact released main and retain those guards around
the event-aware `loadEventCatalog(eventConfig)` path and all awaited recovery work.
Repeat affected recovery/opening tests and the production build after reconciliation.
No push or deployment is part of this local integration commit.
