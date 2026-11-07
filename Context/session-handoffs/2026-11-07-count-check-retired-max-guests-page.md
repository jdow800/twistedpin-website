# Handoff: count check retired, "Plan for your max" on the event page (Avery + Menu Selector), 2026-11-07

Written by the Claude session that did the work (cwd `C:\Users\jdow8\dev\Marketing Avery`). It stands on its own: what broke, what Jon ruled, what shipped, how to roll it back, and where to look if the problem comes back.

## Outcome in one paragraph
A guest (Joanne Vercelote, E-5905178) sent the event page and never got a price. Avery asked the "count question" because her Send (25) was well below her inquiry (35-40). She answered "25 about", and Avery replied with a "plan around your max ... update the event page and hit Send" dead end. Jon ruled that Avery stops arguing about the count after a Send and goes straight to the price, then the email, then the deposit link. The push to book for the max moved onto the event page itself. Both halves shipped and were live by about 10:05am CT on 11/7. Jon booked Joanne by hand.

## What broke (two defects, plus a design question)
1. **The count-answer path never worked.** Deterministic Checks and Re-Check don't pass `builder_decline` through their return object. Merge New Details reads it (via Build Missive Reply) to stamp `avery_event.count_check_pending_at`, so a model-written count question never stamped the row: zero rows ever had the stamp. On the answer turn, Avery had no permission to price (`quote_authorization.origin = none`), so the Stage B gate blocked the quote. The count harnesses stayed green because they inject the stamp themselves. Only Set Route's HOTFIX 3 (a taken start plus a count drop) ever stamped.
2. **A retry instruction wrote the dead end.** Draft 1 failed `gather_complete_stall`, and that check's retry entry said "end with the event page or a question; never a quote". After a Send, that produced "update the event page and hit Send".
3. **The count question wasn't earning its keep.** It went out 3 times over its life (10/1 E-3013231 "We are estimating", 10/9 E-2880716 "not sure how many parents will stay", 11/6 Joanne "25 about"), and not one answer came back with a higher count.

## Rulings (Jon, 2026-11-07)
- "Stop arguing w/ a guest after a submittal and just get to the quoting portion (email -> link)."
- Booking for the high end of the range still matters, but it is the guest's responsibility: "if they grow a bunch we just can't fit them ... or well can't guarantee it". The page carries that message, not the thread.
- Last-minute events (9 days or less) can't lower their count at 7 days, so the page never promises the 7-day window unless a picked date proves it applies.
- Not done, by choice: fixing the `builder_decline` forwarding (it would revive the retired conversation), and an amber "You told us about 35" callout on the page (the opening count comes from the event row, which every Send overwrites, and an inquiry range seeds only its low end).

## What shipped (LIVE)
| What | Where | Version / rollback |
|---|---|---|
| **Avery prices a Send as submitted.** Pre-Assemble never sets `builder_count_shrink.flagged` (the drop stays as `shrink` data), which stands down every consumer, including Set Route's HOTFIX 3, without editing Set Route (a Stage B whole-node unit). Lane e and the COUNT CHECK line are gone; a SUBMITTED COUNT rule is in. `builder_count_check_missing` is removed from both checks, and the forced-quote stand-down ignores the retired `count_check`/`count_check_philosophy` reasons. | WF2 `dYG_0_MVmIpS_EQCBZ-Tl`, 5 brain nodes | `6e3800af` -> `a32bbf41`. Marketing Avery PR #34 (merge `516b781`). Rollback: from a clean worktree of `898fa67`, `deploy-n8n.mjs --only WF2 --yes` + `deploy-kb.mjs --doc live --yes`, then `drift-check --ref HEAD`. |
| **The retry never hands a saved submission back to the page.** On an inbound turn with a saved submission, the `gather_complete_stall` retry says: never send them back to the page or ask them to resend the same choices (unless they asked to change something); ask the most useful question, and when it was never priced and nothing is left to ask, escalate silently. Every other turn gets the old wording. | WF2 Build Retry Request | same release |
| **KB 21.2b "Submitted guest count"** + 8 supporting edits (the count-check continuation, the count-answer opener and the reconcile/planting/spectator lines are scoped to before a Send) | live KB Doc | 391,581 -> 389,392 chars; same rollback |
| **Event page Step 2 "Who"**: label "Max guests expected". A teal-tinted panel with an accent bar: the "PLAN FOR YOUR MAX" headline (display font, teal), then "Count everyone coming, bowling or not. We plan space, seats and food for the whole group.", then fine print by date: no date "Adding guests later may not be possible." / 9 days or less "Your final count is set when you book, so adding guests later may not be possible." / 10+ days "You can lower it until we finalize, 7 days before your event. ..." | Zite Menu Selector `2cjjjapyec` (workspace `cfd64971bbc1cdf7`), `apps/menu-selector/src/components/builder/WhoSection.tsx` | rev 1 `5f5eb2a` (snapshot 5830134), rev 2 `a050ff5` (snapshot 5830378, live). Rollback: republish an earlier version in Zite. |

Proof: new `Marketing Avery/brain/checks/test-submitted-count.mjs` replays Joanne's two recorded turns through the real nodes and the live Set Route (26/0 on the new code, 20 failures on the old). Seven older harnesses were re-pinned. The full offline suite showed the same 33 pre-existing failures as main, with none new. Menu Selector browser suite 100/100 (desktop + mobile) on both revisions. Plan reviewed by GPT-6.1-Sol ultra (GO WITH CHANGES, all adopted except its "staff handle Joanne" point, which became moot).

## Facts worth knowing next time
- **Avery only books against a SYSTEM quote in the thread.** A page estimate the guest saw, or a price a teammate typed, is not a delivered quote. A staff-typed price plus "yes" goes to a silent Needs Attention by design (KB "A TOTAL ALREADY SENT"). To hand a stranded thread back to Avery, a system quote has to go out first.
- Every Send records the inquiry count beside the submitted one (`builder_payload._prior.inquiry_guest_count` vs `event.guests`), so whether guests still slide the count down can be measured later. Joanne priced 4 times on the page, from about $2,625 down to $1,315.
- The old answer-turn machinery (`count_check_pending`, the `count_check_answer` authorization, `count_check_answer_not_quoted`, the philosophy branch) is still in the code but dormant: nothing writes the stamp any more. Remove it in a later cleanup, or **forward `builder_decline` in both check returns first** if anyone ever revives the count check.

## If it comes back
- **A Send gets a count question or a "plan around your max" lecture:** pull the WF2 execution and check Pre-Assemble's `builder_count_shrink.flagged` (it must be false) and whether the draft carried `builder_decline: count_check` (the forced quote should override it). Then grep the KB and prompt for leftover count wording; the prompt out-shouts the KB.
- **A guest is told to update the page and Send again with nothing changed:** check which check failed draft 1, and whether `builder_payload_info._route === 'process'` was set on that inbound turn (that is what turns on the saved-submission clause).
- **The page copy looks wrong for a date:** `WhoSection.tsx` `countHelp` keys on `daysUntilEvent` (Chicago day). `selections.spec.ts` "headcount help ..." covers all three cases and the midnight/DST rollover.

## What went wrong on the way
- My local suite runner's skip filter missed Windows backslash paths, so `brain/hygiene/test-sql.mjs` ran twice. It creates and deletes a probe workflow on LIVE n8n, using fixtures and a rolled-back transaction. Both runs cleaned up; the filter now uses `hygiene.test-sql`.
- Backticks inside a double-quoted `node -e` string ran `npx playwright install` on Jon's PC: about 300 MB of browser files added, an old npx cache's browser garbage-collected (no project was affected), and a stray `test-results/` folder created, then removed. Lesson: never put backticks in shell strings; edit notes with the Edit/Write tools.

## Where the records live
- Marketing Avery: `n8n/workflows/WF2.changelog.md` and `kb/CHANGELOG.md` (2026-11-07 entries); evidence `brain/deploy/.emit/joanne-2026-11-06/` (git-ignored: both executions, the review brief, `sol-review.md`, suite runs); the page spec and ship record are in `drafts/zite-paste-who-max-guests-2026-11-07.md`.
- Zite: `apps/menu-selector/CHANGELOG.md`, 2026-11-07 and 2026-11-07 (rev 2).
- Claude memory: `joanne-count-check-dead-2026-11-06.md`.
