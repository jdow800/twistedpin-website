# Reserve availability investigation and release closeout

October 23, 2026. This is the current handoff for the October 22–23 investigation across Website and TPRS. It supersedes the recommendations and release status in the earlier availability investigation and frontend experiment notes. Their measurements remain historical evidence.

**Decision:** ordinary `/reserve/` now restores the older package-first browsing experience, while retaining current payment recovery and authoritative time/capacity checks. Jon explicitly accepted that an immediate package click may wait longer for actual times. NYE and Jingle keep their dedicated event flow; a modest initial wait is acceptable there. Cold backend latency and event-opening concurrency are follow-up work, not solved claims.

## Shipped state and repository status

All accepted runtime changes are on their respective `main` branches. There is no unmerged runtime fix waiting for the next session.

| Change | Source and release evidence |
| --- | --- |
| First ordinary loading improvement | Website `99440c3`; grouped catalog reuse, guarded tomorrow shortcut and removal of broad detail prefetch. Receipt: [first fast-start release](2026-10-22-reserve-fast-start.md). |
| Reuse one special-day guard per day request | [TPRS PR 474](https://github.com/jdow800/tprs/pull/474), merged as `6fb4c15126424e681ccd336e185bef80530747ed`; reviewed tree was `e633cdbf`. Render `dep-dbde01tg1s2s73diah20` was verified live and `/health` matched. No migration or configuration change. |
| Restore ordinary package browsing | Website `771d1552781f97d84d4dc1b0cfa195d122343fce`; measurements/observer update `2396822`. Production release `dpl_BZGgcxLckqkL76C1nN7inEnh3bdW`. |
| Neutral retry message and email support | Website `1a4805b`; general-questions versus technical-support rule and remaining fallback copy in `756e58e197049a197f8288c2ba3a0732df045666`. Latest runtime verified as Vercel `dpl_EoxPcajbar7rve7pTCDVoA7ZQvj8`, serving `www.twistedpin.com`. |

This closeout changes documentation only. Later documentation or daily hours deployments can have a newer SHA/deployment without changing booking behavior.

The rejected frontend implementation is deliberately preserved on remote branch `codex/reserve-month-first-20261022`, commit `2665aecf04cba24aef71ca98e27e066964007503`. **Do not merge that branch wholesale.** Its experiment code and [read-order report](https://github.com/jdow800/twistedpin-website/blob/2665aec/Context/session-handoffs/2026-10-22-reserve-availability-read-order.md) are reference material.

The original TPRS investigation is now backed up on remote branch `codex/availability-deep-dive-20261022`, commit `293ff525`. Its [deep dive](https://github.com/jdow800/tprs/blob/293ff525/docs/BOOKING-AVAILABILITY-DEEP-DIVE-20261022.md), [backend findings](https://github.com/jdow800/tprs/blob/293ff525/docs/availability-performance-20261022/BACKEND-FINDINGS.md), sanitized public measurements, query-count model and measurement scripts are preserved. Its proposed priorities predate the final browsing decision and PR 474.

The TPRS PR's own build note and `docs/session-handoffs/2026-10-22-reserve-read-performance.md` retain pre-deploy wording. The merged revision, deployment and post-release results above/below supersede that status.

## What caused the visible regression

Jon's observation that older previews felt faster was useful evidence. We compared source ancestry, actual deployed HTML and JavaScript import graphs, Vercel metadata, the supplied log export and bounded browser/API observations. The old and new production clients reached the same live TPRS backend. The proxy implementation was unchanged; the modest bundle growth did not explain the extra request stages.

The named NYE owner-rehearsal preview used a separate backend tunnel. It was not a valid production breakpoint or latency baseline. The production ancestry was:

| Production source | Relevant behavior |
| --- | --- |
| `36e5be1`, October 20 | Last production with the old booking client. The earlier `9647bb7` and `e162fd6` fast previews had the same relevant booking behavior. |
| `d665181`, October 20 | Blocking saved-payment discovery and policy-bearing availability responses reached production. |
| `b6458eb`, October 21 | Exact selected-day availability gated package cards; today's exact result had to settle before automatic forwarding. |
| `99440c3`, October 22 | Tomorrow shortcut removed the intervening month stage on a common after-hours journey, but retained discovery plus today's and tomorrow's waits. |
| `771d155`, October 23 | Ordinary package browsing restored using bare month summaries and concurrent payment discovery for a proven-clean tab. |

The typical single-month request order explains the difference:

| Client | Before packages become usable |
| --- | --- |
| Old fast client | Main mounts immediately → grouped/flat catalogs → four bare month summaries → packages and next ordinary date. Exact times prefetch afterward. |
| Previous exact-day production | Payment discovery → catalog → four exact today reads → if exhausted, four exact tomorrow reads → packages. Month reads follow. |
| Current ordinary reserve | Clean local recovery check → catalog and payment discovery overlap → four bare month summaries → packages and next ordinary date. Exact times prefetch for positive packages on the selected date. |

Counts vary with visible months, legitimate catalog omissions, cache hits and when Main unmounts. Four month reads are the usual case, not a maximum.

Bare summaries still enforce server eligibility, event exclusions and capacity. Omitting the policy **explanation envelope** does not remove those rules. Exact time selection retains its policy-bearing read. Warm policy metadata had been material extra work, while cold month and cold day computations cost roughly similar amounts in the observations.

## Approaches tried and their outcomes

| Approach | Outcome and reason |
| --- | --- |
| Grouped catalog reuse, finish priority reads first, tomorrow shortcut, remove seven-date detail prefetch | Shipped first. Reduced observed request count and one after-hours stage, but did not reproduce the old browsing experience. |
| Strictly require all four ordinary catalog products | Rejected during review. Admins may legitimately deactivate products/categories; preserve fallback and consistency checks instead of taking down the booking page. |
| Month-first with blocking recovery and policy envelopes | Correctness checks passed. Earlier after-hours packages, but an extra stage before available-day times. It was rejected when time readiness was the acceptance criterion; it also retained costs absent in the historical client. |
| Parallel month and day reads | Correctness checks passed; performance did not. Eight startup availability requests competed for backend capacity, with up to twelve near a visible-month boundary. Did not ship. |
| Reuse the TPRS request-local policy guard | Shipped. Same response bodies with less duplicate database work; modest measured improvement, not a solution to frontend request order. |
| Faithful ordinary browsing restoration | Shipped after Jon clarified package browsing was the priority. Bare summaries, clean-tab browsing alongside discovery, queued clicks, exact-time prefetch. Matched the old fast client's browsing behavior. |
| Selected-day-only with calendar on demand | Discussed, not shipped. Could reduce speculative work, but changes next-date discovery; in the prior fast-start path, months already followed the first cards. Revisit as a product decision, not a proven speed fix. |
| Bounded range or multi-product API | Deferred. A complete contract and measured backend reuse are needed; an approximation or eleven separate day reads is not equivalent. |

The important correction was the success criterion. First usable packages, first preferred package and usable exact times are different milestones. Optimizing only time readiness rejected a browsing trade-off Jon later explicitly accepted. Passing synthetic behavior tests did not make the hybrid a performance improvement.

## Measurements worth retaining

These are small sequential observations, not production percentiles, load tests or promised speedups. The tables preserve the cache state and timing origin needed to interpret them.

### Rejected frontend trials

Seconds from the first booking API request to first usable package / exact times. All availability responses in these rows reported backend cache misses. The available-day case advanced only the browser clock to Friday noon; the backend clock and inventory stayed live.

| Version | Available-day package / times | After-hours package / times |
| --- | ---: | ---: |
| Exact-day baseline | 1.761 / 1.829 | 3.799 / 4.040 |
| Policy-bearing month-first trial | 1.721 / 3.107 | 2.721 / 4.122 |
| Parallel month/day trial | 2.672 / 2.748 | 2.785 / 4.686 |

### Final browsing comparison

Seconds from booking bootstrap to first usable package / exact times, selecting the VIP two-hour package without selecting a time. Routing disabled browser HTTP cache on every side.

| Case | Old fast browsing | Previous exact-day release | Final browsing candidate |
| --- | ---: | ---: | ---: |
| After hours, package / times | 2.796 / 3.637 s; 15 misses | 3.198 / 3.275 s; 12 misses | 2.726 / 3.582 s; **7 misses, 1 hit** |
| Available-day request shape, package / times | 2.036 / 3.439 s; 12 misses | 1.794 / 1.876 s; 5 misses | 1.733 / 3.122 s; 8 misses |

The after-hours candidate matched the old fast preview, but the mixed cache row is not a controlled cold percentage improvement. The available-day measurements show the accepted trade-off: similar package readiness, longer immediate wait for times. The old client also did extra detail prefetch that was deliberately not restored.

The final live Friday smoke had eight availability misses: first package at 1.781 seconds, VIP two-hour at 2.605, and exact times at 3.460 from booking start. All eleven API calls succeeded. Progressive display does not make every package instantly ready.

### Browser cache comparison

Seconds from each navigation to the VIP package, using one fresh context followed by an ordinary reload, no routing and no clicks. Corrected Node-side timestamps were used.

| Version | First visit | Reload | Reload availability responses |
| --- | ---: | ---: | --- |
| Old production client | 0.903 | 0.450 | 8 of 8 browser-cached |
| Previous exact-day release | 3.179 | 0.614 | 12 of 12 browser-cached |
| Final restoration | 0.897 | 0.445 | 8 of 8 browser-cached |

**First visits were not backend-cache matched:** old/final had eight hits; previous production had twelve misses. This establishes old-like warm/repeat browsing, not a 3.5-times cold improvement. Browser caching also worked in the previous exact-day release; it was not uniquely broken there.

Earlier fixed-clock observer reload values around seven seconds were instrumentation artifacts. Playwright's virtual clock affected `performance.now()` across reload. Use only corrected `realMilestones` in `old-main-http-cache-final.json`, `current-http-cache-final.json` and `candidate-http-cache-final.json`. A browser-cached response also retains its original `Server-Timing`; an old `miss` header is not evidence of a new computation. Expected blocked telemetry is separate from booking failures.

### Backend guard reuse

Cookie-free cold reads before and after TPRS PR 474 returned identical response bodies:

| Ordinary VIP two-hour request | Before total app time | After total app time |
| --- | ---: | ---: |
| October 23 | 920.2 ms | 694.5 ms |
| December 6 event restriction | 743.4 ms | 522.5 ms |
| December 31 event restriction | 729.0 ms | 531.5 ms |

The fix removes one duplicate special-day guard load on cold/private policy-bearing day reads. Warm hits already loaded one guard, so no warm-hit gain is claimed. Measure `app;dur`: loading the guard outside the compute timer makes `compute;dur` fall by more than the actual saving.

The isolated PostgreSQL fixture proved 18 fewer SQL statements with four configured event products. That is not eighteen serial round trips. The original 56-statement cold-day model predates PR 474; the equivalent model becomes 38, and counts vary with configuration, pools and retries. Serial read depth and pool waiting remain plausible costs requiring tracing, not measured production SQL-profile conclusions.

## Current behavior that must survive future changes

`reserveBrowseFirst` defaults off in shared components; only `/reserve/` opts in. Birthdays, `/tprs/` and dedicated event checkout retain their existing loading behavior.

- Early ordinary browsing requires readable storage, both raw recovery keys exactly absent, and no payment-return client secret. Damaged/empty-string records or blocked storage do not qualify.
- A product tap during discovery queues the choice without moving history or mounting Detail. A clean result applies it; an accepted payment discards it; a failure keeps it through retry. Date selection and automatic forwarding can work while discovery is pending.
- Summary and policy-bearing month caches stay separate. A monthly-positive package is advisory and may later have no available exact times. Detail retains exact policy explanations. Neither summary data nor a missing explanation authorizes a purchase.
- Keep server capacity, hold ownership, payment recovery, sales opening, cutoffs and event exclusivity. Cart-token availability remains private and self-excludes the customer's own holds.
- Preserve partial-catalog fallback, finite browsing-read deadlines, explicit retry and stale-response protection. Unknown/error must not become sold out.
- Manual choices own the date; automatic suggestions skip event destinations. Explicit Jingle/NYE links must survive discovery failure and retry, while accepted payments retain priority.
- Keep the disabled seven-date detail prefetch. The ordinary limit is today through today plus ten, inclusive, as enforced per product by the server. Existing device-local versus Chicago date handling was not changed.

Refreshing an ordinary uncompleted browse draft can still restart its selection; this release did not add draft persistence. Accepted-payment recovery remains. Event drafts separately preserve selections and answers, while an expired hold still requires current availability and a new valid hold before payment.

## NYE and Jingle decisions

These flows already request two products and one fixed event date, using bare day availability. Their extra startup stages are saved-payment discovery → cart session → payment recheck → catalog → two parallel availability reads. Jingle has its configuration bootstrap first. They do not perform ordinary month/today/tomorrow scanning.

Their recovery and cart-ownership checks matter when someone returns midway through food/add-ons or payment. The wait itself prevents nothing; server ownership and capacity enforcement do. Presentation could eventually overlap more public reads without removing those protections, but no event loading change shipped here.

Jon accepts a modest wait for these one-off events. Before the November 18, 9am Chicago NYE opening, a controlled concurrency rehearsal is the most useful remaining event check. Functional opening-race tests do not prove throughput when waiting tabs become active together. Jingle campaign traffic can also cluster.

Jon later returned to Jingle, probably from arcade before payment, and saw a generic restore error saying to call before another payment. That catch also covers network, catalog, storage and cart failures, so it did not establish any attempted charge. The release changed its wording to neutral retry, with email fallback. Tests reproduce transient catalog/session failures from arcade and prove retry preserves the draft/cart without creating another hold or payment. The original screenshot's cause remains unidentified. A source-level expiry-during-discovery race was considered, not reproduced as this incident or fixed; ordinary already-expired holds are filtered by the backend.

The maintained [support rule](../voice.md#guest-questions-and-technical-support) is: general venue questions may use the phone; website/browser, reservation and payment troubleshooting use the supported retry/status check or **contactus@twistedpin.com**. Front-desk staff cannot troubleshoot those systems. Known payment problems keep their actual recovery warnings; generic loading failures must not imply a payment happened.

## Future work in priority order

1. **Measure the remaining wait by phase.** Capture actual daytime and after-hours distributions for hydration, discovery, catalog, availability and time display. Compare the same product/date, authentication mode and cache state. Keep package readiness and exact-time readiness separate. Add enough tracing to distinguish database execution, sequential round trips and connection-pool waiting before changing hosting, indexes or pool size.
2. **Rehearse event opening concurrency safely.** Use an isolated environment and bounded plan with realistic configuration and cart ownership. Verify opening-boundary behavior, timeouts and recovery as well as throughput. No production burst test was authorized or performed by this investigation.
3. **Reduce backend work with measured parity.** Parallelize genuinely independent reads or batch repeated event-member lookups where tracing supports it. Anonymous identical in-flight requests could share one computation, with bounded keys and failure cleanup. Preserve cart isolation, fresh policies, opening boundaries and database-time capacity. Batching statements alone may reduce load without shortening the critical path.
4. **Design a bounded browse response if still needed.** Reuse shared product/configuration/inventory work across the ordinary horizon rather than making many independent day calls. To remove the later time stage, the response must carry complete dated times/prices/durations/policies, not just booleans. Compare per-product ranges against a multi-product contract before building the larger API. The proposed `next_open=true` day response was aimed at the former today-then-tomorrow flow; reassess it against the now-shipped summary flow.
5. **Consider earlier event public reads.** Jingle config already provides product IDs/date. Starting public reads before session setup might shorten presentation and improve anonymous cache reuse. Existing cookies, held-lane self-exclusion, stale results and payment takeover require explicit reconciliation; it is not safe to blindly reuse anonymous data as cart-owned truth.
6. **Revisit calendar-on-demand or venue-date handling separately.** Both are legitimate product/correctness choices, not proven fixes for the remaining cold computation. Longer cache TTLs also require a separate inventory-staleness decision; this evidence does not justify extending them.

Do not undo the October 21 session-mode database connection repair, globally strip event rules, or substitute a pre-NYE whole-site rollback. Event rules also stop event products being booked on ordinary dates. Removing recovery checks to recreate old startup would discard protections the accepted restoration deliberately kept.

## Validation and reproduction

The browse restoration passed 34 new isolated groups, 32 existing fast-start groups, 23 first-day groups, 38 event handoff scenarios, 22 deadline checks, checkout recovery/date policy, full TypeScript and production builds. Default and both flag-off builds were checked. Screenshots covered narrow mobile widths. Independent Claude Opus 5.5 Ultra review inspected deployed artifacts/source and caught real catalog/rollback-path defects before release; the final runtime was cleared.

TPRS PR 474 passed 76 isolated PostgreSQL tests and monorepo typecheck, including body parity, cart self-exclusion, fresh warm-hit metadata and opening-boundary retries. The subsequent retry/email work passed 12 Jingle entry groups, checkout recovery and the production build; it changed wording/help markup, not booking logic. Live `/reserve/` packages/times, both direct event handoffs, route opt-ins and deployed bundles were checked without a real booking or payment.

Useful checks from a clean Website worktree with installed locked dependencies:

```powershell
npm.cmd ci --no-audit --no-fund
node scripts/check-reserve-browse-first.mjs
node scripts/check-reserve-fast-start.mjs
node scripts/check-availability-first-day.mjs
node scripts/check-availability-read-deadline.mjs
node scripts/check-booking-date-policy.mjs
node scripts/check-checkout-recovery.mjs
node scripts/check-nye-date-handoff.mjs
node scripts/check-jingle-booking-entry.mjs
npm.cmd run build
```

These isolated browser suites use synthetic transport/payment responses. The live observers are separate:

```powershell
node scripts/measure-reserve-loading.mjs https://www.twistedpin.com/reserve/ sample-label
node scripts/measure-reserve-browser-cache.mjs https://www.twistedpin.com/reserve/ sample-cache-label
```

The first observer selects one package, never a time, and disables HTTP caching through routing. `--stay-main` avoids the click. The second observes a first visit and reload with cache enabled and no clicks. Optional `--clock=ISO` changes only browser time; historical dates may no longer be bookable when this is rerun. Use representative current dates instead of expecting the archived numbers to recur. Preview credentials must remain outside Git/output and confined to the exact target origin.

Scripts are committed. Raw comparison receipts remain local under ignored `.astro/reserve-comparison/` in `website-reserve-fast-20261022` and `website-reserve-browse-20261022`; they are **not Git-backed**. Screenshots are under the suites' `.astro/reserve-browse-first/`, `.astro/reserve-fast-start/` and `.astro/reserve-month-first/` folders; the retry screenshots are under `.astro/jingle-booking-entry/` in `website-event-resume-20261023`. The substantive sanitized results are preserved in this handoff and the committed original investigation. Key final receipt names are `old-browse-baseline-night`, `current-browse-baseline-night`, `browse-candidate-night-1`, `old-main-browse-day`, `current-browse-baseline-day`, `browse-candidate-day-1`, `released-browse-friday`, and the three corrected HTTP-cache receipts named above. Backend before/after receipts are in the archived fast worktree.

## Comparison deployments and rollback

Use these historical immutable deployment URLs for source comparisons, subject to Vercel retention/protection. Their APIs still reach current backend data, so an old website deployment does not recreate the old backend or date.

| Role | URL |
| --- | --- |
| User's old fast preview, `9647bb7` | https://twistedpin-website-1x24gkadb-jon-9416s-projects.vercel.app/reserve/ |
| Last old-client production, `36e5be1` | https://twistedpin-website-j2zi8xix3-jon-9416s-projects.vercel.app/reserve/ |
| Previous exact-day production, `89db79b` | https://twistedpin-website-2nmi9qy00-jon-9416s-projects.vercel.app/reserve/ |
| Rejected policy month-first | https://twistedpin-website-huvzaoj2t-jon-9416s-projects.vercel.app/reserve/ |
| Rejected parallel hybrid | https://twistedpin-website-6f7sk5djd-jon-9416s-projects.vercel.app/reserve/ |
| Reviewed final browsing Git preview, `771d155` | https://twistedpin-website-rcka33nff-jon-9416s-projects.vercel.app/reserve/ |

For ordinary browsing rollback, set **`PUBLIC_RESERVE_BROWSE_FIRST=false` and rebuild**. It restores the tested exact-day path while retaining later support copy and other work. `PUBLIC_RESERVE_FAST_START=false` disables both ordinary opt-ins. These are build-time switches, not instant runtime toggles.

For code rollback, revert the relevant isolated change against current main. Website pushes auto-deploy. TPRS uses PR → main → Render. Neither frontend flag rolls back TPRS PR 474. The backend change has no migration to undo.

Historical hosting targets are not evergreen rollback instructions. Before the browsing restoration, Website was `dpl_5dDay1N7t973WqjXTEy4SK12r5uJ` (`89db79b`). Before support copy it was `dpl_5BhrsCEVNfUnRrVm2FTk83gzcjWj` (`e1bed4e`). Before TPRS PR 474 it was Render `dep-dbdblvlbedkc73cqooe0` (`85d8a5fd`). Restoring any whole deployment now would also remove intervening changes. Prefer the narrow switch/revert; verify current aliases, commits and intervening releases before an emergency hosting rollback.

The shared `Website` working directory contains unrelated work. This investigation used isolated worktrees and named-path commits. Do not reset or clean the shared tree, delete the archived worktrees casually, or merge the rejected experiment to “finish” this session.
