# Jingle Bowl resumed Website rehearsal

## October22 protected copy follow-up

The local branch was reconciled with live Website2c6b1f12, preserving its NYE
Mirrorball campaign. The prior Jingle release-verification documentation was
rebased ase996274; only the decision-log prepend conflicted and both entries
were retained. The new copy revision is local and unpushed.

Scoped runtime changes: `src/pages/jingle-bowl.astro`,
`src/pages/jingle-bowl-concepts.astro`, and Jingle's `config.ts` plus the
recovered-test-total sentence in `RehearsalDiscovered.tsx`. VIP now includes one
basket of fries per lane. Fee/cancellation wording follows the approvals and
source evidence below. Shared wizard/payment/controller code, homepage timing,
password, DEV-only transport, public readiness, and retained financial data are
unchanged. No production probes or fixture resets were used.

Verification passes: focused strict TypeScript, `check-jingle-event-config.mjs`,
`check-jingle-pairs.mjs`,17 auth checks, and normal `/tprs-api` production build
with all prebuild checks. Actual protected landing/concepts pages at320/390/1280
pass copy, exact72-hour wording and horizontal-overflow checks while API and
external browser traffic are blocked. Local receipts/screenshots live under
`.astro/jingle-copy-20261022/`, and build output at `.astro/jingle-copy-build.log`.
The temporary page-only server55689 was stopped; it used no backend capability.

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
Jon confirmed the VIP appetizer is one basket of fries per VIP lane.
The compact food UI retains all seven complete operational information blocks
inside a native disclosure and the exact visible required acknowledgment.

Jon relayed Shanna's final closing direction: "5:15 we're done -
kicking people out as of 5:30." Jingle Bowl activities end at 5:15pm. The venue
closes and all guests depart by 5:30pm. Arrive on time; clear the booked lane,
seats and belongings at the reservation's end. Guests may then use the arcade
or an available waiting area only until 5:30pm. This is not a requirement to
leave the venue at each reservation's end, and it does not establish early
entry, doors-open or staffed opening hours. Protected landing/concepts and
rehearsal essentials now agree; the backend form owner updates its complete
informational text separately. No live hours/booking flag changes are implied.

Jon approved opening sales immediately at2026-10-22T01:19:04Z (October21 Central),
with no announcement yet. That decision does not imply technical sales readiness.
Jon also approved the same financial setup as NYE: four shoes at $5.95 and a
$25 food allocation carved out of each lane's base price, plus the 10% Online
Booking Fee. The allocations are not additional charges and do not limit the
package to four guests or four shoe rentals. Guest copy says base price plus
the booking fee and applicable tax. No tax rate or all-in total is inferred.
Actual production product/quote setup still requires verification. The three
retained rehearsal bookings keep their original untaxed, fee-free snapshots;
copy must not relabel those amounts as including the newly approved fee.

Cancellation follows ordinary one-/two-hour reservations: "Cancellations must
be made at least 72 hours before your reservation to avoid forfeiting payment."
The current deployed Website2c6b1f12 `src/tprs/pageConfig.ts:264` and
`src/pages/terms.astro:198` establish this rule; backend
`apps/backend/src/services/magic_link.ts:625` corroborates it.
Within72 hours payment is final; exactly72 hours is outside that final-payment
threshold. No refund method, gift certificate or service-fee-retention promise
is added. NYE's14-day policy does not apply.

Production product/form identities, verified sales configuration and quote
totals, final staffed/opening/Santa hours, and Shanna's proof remain pending.
Base lane prices, financial structure, cancellation and the schedule are approved.
The password and DEV-only booking boundary remain.

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

After rebase, `check-jingle-saved-rehearsal.mjs` reads an existing booking's
persisted projection and its confirmation/kitchen pages at390px with the original
cookie. All new cart/payment/booking writes and external browser traffic are
blocked. The backend owner generated ignored `local/recovery-readback.json` from
the exact synthetic owner/attempt association; its capability is not logged.
Confirmed attempts are not returned by active-attempt discovery, so this is
saved-output readback, not a claim of a new discovered-checkout recovery run.
Actual interrupted-payment recovery was covered by the first two connected
journeys and the merged offline suites. No additional reservation was created.
Evidence is under `.astro/jingle-saved-rehearsal/`.

The earlier timeout capture remains separately preserved as
`.astro/jingle-arcade-food/failure-availability-timeout.png`. The arcade captures
include a transient quote-loading frame and the320px food capture deliberately
includes the required-acknowledgment validation notice; the later completed
booking receipt is the settled total evidence. Do not present those test frames
as final clean marketing screenshots.

Run development processes with different API/Stripe-alias profiles sequentially
within a worktree: they share the Vite development cache. The temporary synthetic
NYE route server55687 was stopped, then fresh55686 was restarted with its isolated
rehearsal alias. Original55636 and the fresh backend/database stayed untouched.

Screenshots are regenerable local evidence, not a Git backup. Source and these
reproduction instructions are tracked. Connected checks consume isolated quota;
do not run repeatedly without coordinating the owned fixture.

## Released NYE reconciliation

The initial validated local state was saved as4d26155, then rebased onto released
NYE46bf92c as3f9f5bb. Three conflict blocks in `NyeBrandWizard.tsx` retain both
the event-aware catalog/form scope and NYE's post-await generation checks,
guarded catch/finally, and cleanup invalidation. The memory-first discovered
recovery barrier remains unchanged. Independent source review cleared the merge.
After rebase, strict TypeScript,23 actual-route opening/recovery scenarios,
175 clock checks, and23 full-flow groups pass. The final normal production build,
protected auth and Jingle config/form checks also pass; final build output is
ignored at `.astro/jingle-resumed-build.log`. Frontend review copy now reflects
approved prices/times, while the older backend projection template's provisional
wording has been flagged to its owner separately. No push or deployment is part
of this local integration.

## Protected revision release checks

The October22 closing-copy revision on54dbb23 passed a fresh full production
build, all six prebuild scripts, focused strict TypeScript across ordinary/NYE/
Jingle checkout entrypoints,17 review-auth checks,7 native middleware/proxy checks
and the Jingle event-config check. Build used `/tprs-api` with outbound connections
blocked; existing GoTab fallback and chunk-size warnings are unchanged. The log
is ignored at `.astro/jingle-final-build.log`. Both emitted rehearsal routes are
unconditional404 in production, and protected routes remain outside the sitemap.
The shared no-coupon owner cleared the release hold after independent ordinary
and birthday mobile checks. Root owns the subsequent protected Website release
and live readback. No public campaign or Jingle booking activation is included.

## Verified protected release

Main1a5089125488694a9fe8105b3c782b6d357615c4 deployed successfully to Vercel
5qgWNwWA2KyEi8rcQZBzpd7J7KnS. At02:12UTC on October22, all41 bounded live checks
passed: anonymous/encoded page and asset401, normal password303, authenticated
Jingle/concepts/calendar200 with noindex/no-store, and authenticated production
booking/rehearsal API404. The revised landing was visually reviewed at390/1280,
including prices and5:15/5:30 copy, with no overflow, trackers or browser errors.
Public home/calendar remain Jingle-free; ordinary, birthday, NYE and proxy health
routes returned200. Reproduction and captures are ignored under
`.astro/jingle-protected-live.mjs` and `.astro/jingle-protected-live/`.

One independent sequential390px regular then birthday journey subsequently
passed: all38 tracked API requests settled200 (36GET plus2 read-only active-attempt
discovery calls), visible times, zero errors/overflow/pending requests. No time,
Continue, hold, payment or customer submission occurred. Regular times appeared
at4.744s/all reads6.551s; birthday times4.304s/all reads5.594s. These deliberately
include calendar interaction and are not pristine first-load performance claims.
Receipts and screenshots remain in the retained jingle-capacity worktree under
`.local/incident-{regular,birthday}-jingle-website-release.{json,png}`. Further
production probes stopped after this checkpoint.

Backend draftPR468 now reconciles actual shared mainf268d51f asdb0f5d3e and includes
the NYE owner's docs-onlycf2352ea release evidence. Runtime/CI files are unchanged
from the already reviewed local156f3010 tree. No backend Jingle release or
production identity registration occurred. This evidence follow-up is saved on
the Website feature branch; production remains the exact1a508912 source above.
