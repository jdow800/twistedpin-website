# Jingle Bowl final closeout — October 22, 2026

This is the Jingle portion of Jon's combined NYE/Jingle closeout. It records saved release evidence and a read-only local/Git audit. **No production probe, deploy, database change, fixture stop or customer send was performed for this closeout.** Main integration belongs to the NYE coordinator; the Jingle changes below are saved on feature branches only.

## Last verified releases and incorporation order

| Surface | Last verified release | Evidence |
| --- | --- | --- |
| Website | `0729566add2a3692853c2a577c394990194f514e`; Vercel `dpl_2aAcz3cFMiFdpAL8oqibQAtdd5Wr` | Public launch and styled handoffs in `Context/history/2026-website-decisions.md`; release receipts listed below. |
| TPRS backend | `0a724bfb066f9640eed214281bb41f107b5d22da`; Render `dep-dbd3cuvavr4c73d9s8bg`, live October 22 at 16:17:20 UTC | PR469 / CI39810950076. Saved 16:18:57 observer: exact revision, one ready instance, session port 5432, inventory protection, normal pre-deploy and automatic deploy, no targeted errors in its bounded observation. |
| Roy | Marketing Avery main `710b117538f7a9dc4de01d19d9300ba3dcdc1538` (PR25) | Feature `4dd3fefd3cdd3814bc0cf0738669019e35a0834c` has the identical full tree. Live workflow version and proof below. |

All three `origin/main` refs were freshly fetched for this audit and match the SHAs above. This confirms source state, not a new production observation.

Website feature `codex/jingle-public-launch-20261022` needs, in order:

1. `91f99d8afff86ac5554ad83d78f07f42a6ad2150` — launch/Desktop evidence and publishing-note corrections; docs only.
2. `b3fd8f23180ced247feac662ec2a537eb09b13f3` — dedicated Facebook cover, master, prompt, renderer and crop proof; art/docs only.
3. The closeout commit containing this file — current-status pointers, corrected cover recommendation and refreshed delivery manifest; docs only.

No Jingle runtime remains unmerged. Backend `8bfded69cea8c953585ff522487f3120d54d6140` is already patch-equivalent to main `ec32ebd3`; do not cherry-pick it again. Its new closeout pointer correction is a separate docs-only successor to be supplied to the coordinator. Older `jingle-booking-20261021` and `jingle-capacity-20261021` implementations were adapted into main; do not replay their old commits. The deferred performance note `9d32025d` is already incorporated as `8568c048`. Roy's feature commits were squash-merged in PR25; do not replay them. NYE-owned evidence commits remain the coordinator's responsibility.

## What is live

- Public landing and booking: `https://www.twistedpin.com/jingle-bowl/` and `https://www.twistedpin.com/jingle-bowl/booking/`. Landing indexing/schema/calendar/nav and homepage invitation shipped; checkout remains noindex/no-store. Concepts, calendar review and rehearsal stay protected.
- Explicit Traditional/VIP navigation works on repeat visits. An unheld browsing draft yields to the chosen lane link; retained payments, discovery, held/pending carts and recovery keep priority. Shared Link removal and BrandShell stylesheet imports are preserved.
- Production Jingle roots 128/129, food 130, forms, components, 10% fee, Dec 6 exclusivity and ten per-start limits totaling 39 are installed. No coupons, including $10/signup/$50 points rewards. Accepted frozen payments retain their original amounts and recovery.
- The existing 10am–1pm morning event is preserved, including its 17-lane hold ending 1:20pm. Staff-party closure is5:30–11:30pm. Activation emitted no 7shifts event.
- Roy announces: “Jingle Bowl is December sixth. Reservations are open.” This stops at December6 midnight Central, when the existing event-only date notice takes precedence. Thanksgiving/full-day closures suppress promotion. Wider proposed NYE greeting rotation was not shipped by this slice.

## Release proof and troubleshooting starting points

Website durable history records 42 settled 200 Jingle reads, 22 regular reads with six times and 16 birthday reads with two times. Root visually reviewed mobile/desktop screens. There were no time selections, holds, payments or customer submits in those release checks. A focused final handoff repeat passed 51 assertions after distinguishing intentional unused-catalog `net::ERR_ABORTED` cancellations from actual failures.

Local ignored Website receipts, relative to `jingle-website-resume-20261022`:

- `.astro/jingle-public-live-1792689451701/` — main journeys and initial actual-page styling finding.
- `.astro/jingle-public-handoff-live-1792689579510/` — intentional cancellation diagnosis.
- `.astro/jingle-public-handoff-live-1792689950642/` — final styled handoff PASS.

Regression entry points: `scripts/check-jingle-booking-entry.mjs`, `check-jingle-public-build.mjs`, `check-jingle-review-auth.mjs`, `check-nye-date-handoff.mjs`, homepage campaign checks and `check-checkout-recovery.mjs`. Inspect each target before running; do not turn a diagnosis into repeated production load or new bookings.

Backend durable authority: `docs/JINGLE-PRODUCTION-CONNECTION-20261022.md`. PR468 tested `84fe204acd6002b8270a96884c7f1c60ed3c569e` under CI39802819258 and merged as `09d937c0248e2ec63fb1a8ccfccc85e7046be574` with the identical tree. Activation receipts under `apps/backend/.backups/jingle-catalog-apply/`: `plan-1792682978812.json`, `apply-1792683027396.json`, `verify-1792683045934.json`. The production GET/quote proof `apps/backend/.local/jingle-production-api-proof/proof-1792683057240.json` records 16 requests/40 assertions, including one Traditional quote $169.22 and one VIP plus two arcade cards $243.22, with wrong-date/exclusivity/coupon refusals. No checkout/payment/email was created by that proof. Final connected source/FakeRail proof is `apps/backend/scripts/jingle-connected-proof/local/proof-1792681930478.json` (5/5); catalog proof passed 35 cases. These local receipts are retained, not Git-backed; the durable summaries and reproducible harnesses are tracked.

Roy authority in `roy-jingle-20261021`: `retell/CHANGELOG.md`, `n8n/workflows/RoyPreCall.changelog.md`, `retell/greeting/README.md`, `retell/JINGLE-BOWL-2026.md`. Workflow `eculAxaxG7zvbY0C`, saved/active version `2ee31cf1-caf6-4c52-8c5d-1c01343edfb4`, code SHA256 `14d953de57a5087a2c67a9edf0bad6dbc1475a98148a234fc1c516e9fe1296ca`. Published 18:17:28 UTC and verified 18:17:46 UTC. 92 offline checks, a no-caller webhook and a clean Retell drift comparison passed; phone version 88/voice/model/tools/46 knowledge sources were unchanged. No real call/audio was tested. Keep private rollback file `brain/deploy/.emit/roy-jingle-greeting-20261022-final.json` ignored. The workflow-only runner `retell/deploy/deploy-jingle-greeting.mjs` requires that exact state for guarded verification/rollback; do not run a deploy or rollback as routine closeout. Unknown/lost writes refuse; the GET-to-PUT race cannot be made atomic by this client.

For availability issues, start with TPRS `docs/BOOKING-READ-INCIDENT-20261021.md` and its deferred performance note. Preserve session-mode transport and inventory protection. First-day/visible-days/calendar-range optimization remains parked; no new speed work is authorized by this content handoff.

## Local fixtures: preserve, do not reset

At 13:39 Central on October 22, read-only process metadata showed:

| Port | State/purpose |
| --- | --- |
|55682|PostgreSQL capacity/regression running|
|55684|Jingle rehearsal API running|
|55686|Jingle rehearsal Website not listening|
|55688|PostgreSQL interactive rehearsal running|
|55692|PostgreSQL coupon/labor tests running|
|55932|PostgreSQL catalog proof running|
|55942|PostgreSQL guest proof running|
|55952|PostgreSQL connected proof running|
|55922/55924/55926|NYE API/PostgreSQL/Website running; owned by NYE coordinator|

All these processes were left untouched. Under `C:/Users/jdow8/dev/tprs/.claude/worktrees/jingle-resume-20261022`, preserve the entire `local/` folders in `apps/backend/scripts/jingle-rehearsal`, `jingle-capacity-test`, `jingle-coupon-test`, `jingle-catalog-apply` and `jingle-connected-proof`, plus `.local/jingle-guest-55942/`, `.local/jingle-guest-samples/` and `apps/backend/.backups/`. The interactive rehearsal retains three synthetic bookings/attempts and 13 answers; its `session.json`, `fake-rail.json`, `fixture.json`, `recovery-readback.json` and database belong together. Those older untaxed/fee-free snapshots are not production pricing evidence. Connected-proof checkouts were rolled back; its committed catalog/morning-event fixture remains.

Preserve older `jingle-booking-20261021` and `jingle-capacity-20261021` fixture directories too. Do not bootstrap, initialize, delete, archive or repurpose their ports. Website `.astro/jingle-booking-rehearsal`, `jingle-saved-rehearsal` and `jingle-arcade-food` contain private saved state/evidence; do not blindly stage them. Operational helpers in `.local`/`.backups` may read credentials: inspect scope and verify targets before use, never publish their state wholesale.

Read backend `docs/jingle-bowl-2026/resume-20261022.md` and each harness README before resuming. A stopped existing cluster must use its verified existing data directory. Website `scripts/start-jingle-booking-rehearsal.ps1` can select the existing DEV-only session; it does not need a fresh fixture. Do not rerun connected checkouts merely to confirm a saved booking, as this consumes synthetic quota.

NYE's owner sandbox invoice `INV-2026-00002` and received email are retained in its separate fixture. Preserve `nye-final-rehearsal-20261022/apps/backend/.backups/nye-rehearsal/pgdata/` and `scripts/nye-rehearsal/local/`. Its old empty-fixture restart procedure is inappropriate now. The NYE coordinator owns further operations and its canonical receipt/staff origin.

## Artwork, staff copy and delivery

Editable source is Git-tracked under this Website's `Context/jingle-bowl-2026/`; public social derivatives are under `public/jingle-bowl/`. Actual Windows Desktop delivery is `C:/Users/jdow8/OneDrive/Desktop/2026 Jingle Bowl`. Desktop is a copy, not the source repository. `delivery/closeout-verification.json` records final source/copy hashes after the documentation refresh. No durable untracked source was found; ignored LED dependencies/intermediates are regenerable. Raw local runtime state is deliberately not in Git.

- `facebook/Jingle-Bowl-Facebook-Event-Cover-1920x1005.png`: use for Meta Event. Master/prompt/exporter and 2.7:1 simulated centered crop proof are beside it. 1920x1005 is a common recommendation, not a mandatory Meta rule. No saved public Facebook event was inspected.
- `public/jingle-bowl/jingle-square.png`: square social; `jingle-wide.png`: 1200x630 general landscape/GBP. Current art says “A VISIT WITH SANTA.” Never republish historical `artwork/jingle-wide-master.png` with superseded “BOWL WITH SANTA.”
- `led/Jingle-Bowl-LED-1920x1080.mp4`: silent 20-second 30fps H264 loop; matching PNG and five optional native-size PNGs. QR points directly to public `/jingle-bowl/booking/`. 50 decoded video-frame/static checks passed; physical wall playback/phone scanning is still untested. Renderers, dependency lock, masters and validation JSON are tracked.
- `delivery/staff-7shifts-tldr.txt`: delivered for Jon to send. `recommended-copy.txt`: Meta/GBP/social/text recommendations. No staff send, customer message, social publication/scheduling or wall upload was performed. No portrait/story composition is finished yet.

## Approved facts and outstanding observations

Sunday December 6, 2026; five 90-minute starts at 1:45, 2, 2:30, 3:30 and 3:45pm Central. 30-minute cutoff before each, subject to remaining inventory. 39 initial lane reservations: Traditional 6/6/5/6/6 and VIP 2/2/2/2/2. Do not turn initial capacity into a current scarcity claim.

Traditional $149.95 and VIP $189.95 per lane plus 10% Online Booking Fee and applicable tax. Each includes shoes, one large pizza and one pitcher of soda (no pitcher refills), cookie/cocoa bar, and a Santa photo on the guest's device. VIP adds one basket of fries per lane. Use “A visit with Santa”; Santa is not bowling with each group. Operational limits are five guests per Traditional lane/six VIP, counting non-bowlers; keep capacity numbers out of unsolicited broad marketing per the current website voice rule. No coupons. The ordinary 72-hour cancellation policy applies; use the approved guest-copy wording rather than inventing refund promises.

Arrive on time; clear the booked lane/seats/belongings at the reserved end. Activities end 5:15pm and guests depart by 5:30pm. Staffed opening and an independent Santa staffing interval remain unconfirmed. No early-entry promise. The preserved morning booking can collect its balance/cancel and retain unchanged or reduced resource demand; adding product lines, moving it within December 6 or resurrecting after cancellation is restricted by the exclusive day. The catalog runner's deactivate mode is pre-sales rollback, not an emergency stop-sales procedure.

Live customer payment/email delivery was intentionally not exercised by launch probes; source/FakeRail integration proved confirmation/calendar/receipt/staff-food behavior. First organic transaction remains an observation opportunity. Existing post-confirmation repeated-payment copy says “being recovered” while safely refusing a second payment; this is an ordinary-flow wording issue, not a new Jingle financial failure. Physical LED QA, saved-public Facebook crop QA and any real call/audio review remain separate observations, not completed checks.

## Jingle input for the next content/drip campaign agent

Prepare a reviewable Jingle/NYE content plan and draft assets/copy using the current source handoffs and Desktop packs. Jingle reservations are already open: use benefit-focused weekly posts/event updates with “Book now,” not a countdown to sales opening. Vary Santa photos, cookie/cocoa, included food and 90-minute reservation planning. Propose portrait/story derivatives if useful. Never imply Santa bowls with guests, unlimited refills, flexible arrival, coupons, unverified scarcity or unapproved operating hours.

Preserve the single homepage campaign selector: Jingle retires December 6 at 3:15pm Central; NYE leads December 7 at midnight Central. NYE sales open November 18 at 9am Central, independently of that homepage handoff; NYE promotion ends December 31 at 9:30pm Central. Broader Roy/NYE greeting rotation is not implied by the homepage policy. Consult the NYE coordinator's final handoff for NYE offer/content facts.

Keep editable campaign work under the relevant dev repository and explicit delivery copies on Desktop. Jon selected a ready-to-paste prompt only; do not launch a new agent automatically. This handoff authorizes preparation/review, **not posting, scheduling, sending, paid ads, website/backend/Roy releases or touching retained fixtures**. Ask only for actual missing campaign choices after consulting the saved source; do not reopen completed launch approvals.
