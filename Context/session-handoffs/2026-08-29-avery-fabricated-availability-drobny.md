# 2026-08-29 — Avery fabricated availability (Robert Drobny) + Sarah Asa NA: forensics and fixes, ALL LIVE

**Cross-repo:** Marketing Avery (brain + KB + changelogs) + n8n WF2 (one wiring edit) + Supabase (read-only forensics). Nothing in the Website repo changed except this handoff and the CLAUDE.md bullet.

**Review of record (8 defects, adversarially verified, with the fix classification and ship order):** `Marketing Avery/avery-drobny-review-2026-08-29.md`. Read that before touching any of the five brain nodes, `blocked_slot_not_addressed`, the weekday binder, or the VIP band checks. This file is the chronology and the watch list.

## What happened (one paragraph)

Robert Drobny, E-0123702, 40-guest kids birthday, Sat Sep 19 3pm VIP, Pizza & Pop, in the thread since 7/31. On 8/29 between 4:44pm and 5:18pm CT Avery ran seven turns. Exactly ONE TPRS availability check ran the whole thread (Sep 19 3pm VIP: blocked by INV-2026-00138, next start 7pm). She then told him Sep 26 and Sep 12 at 2pm VIP were "already spoken for" (`pool_holds` on the VIP pool: Sep 26 genuinely held, never checked; **Sep 12 zero holds, wide open**), offered Sep 19's 7pm on both other dates, answered a pricing question with "5 per lane vs 6 in VIP" (6 is the online self-book cap; catered VIP seats ~8), and corrected him about a weekday he never got wrong ("I can move into a Sunday as well" is an offer, not a claim). Zero quotes were ever produced. Staff took the thread by hand. The same evening Sarah Asa (E-1235782) hit Needs Attention because `vip_lane_capitulation` failed a correct reply twice on the words "if you want".

**The sentence that explains it:** on four of six turns Avery's FIRST draft was correct and a deterministic check rejected it; `blocked_slot_not_addressed` (keyed to stored `confirmed_details`, blind to the inbound) failed the honest "happy to look at Sep 26, which start time?" draft, the retry rule ("the guest's requested slot is NOT bookable, offer those specifics") dictated the fabrication, `_bsMarkers` (contains "spoken for") accepted it, and `thread_summary` laundered it into a fact she repeated with zero failures two turns later. Validator-authored defects, instances 6-9 of the [[avery-validator-can-force-the-defect]] class. Twenty-five instances of "the correct rule already existed and was scoped one case short" are enumerated in the review.

## Shipped (all LIVE by ~9:15pm CT)

| Layer | Change | Where |
|---|---|---|
| Prompt | Blocked CALENDAR line names its date/time from `_avail.key` + "THIS RESULT APPLIES TO NO OTHER DATE, TIME OR LANE TYPE"; every `next_start` anchored to that date; alt-lane offer in the 2026-08-04 non-temporal register; per-lane numbers removed; rule 5a for `thread_summary` availability | `brain/prompts/build-avery-request.js` |
| Retry | `blocked_slot_not_addressed` remediation stops saying "the guest's requested slot" | `brain/prompts/build-retry-request.js` |
| Checks | `blocked_slot_not_addressed` stands down when `ctx.candidate_dates` (current inbound only) is non-empty and none is the checked date; `vip_lane_capitulation` requires `really` (`if you really want` / `if you insist`); sentences containing "traditional" skip the VIP band loop | `brain/checks/deterministic-checks.js`, `re-check.js` |
| Context | `suppressed:hypothetical_weekday` (generic reference "a/any/another Sunday" or proposal frame), hoisted above the `_dvConfirmed` money-proxy gate; claim blanked; event day pinned | `brain/checks/pre-assemble-context.js` |
| KB | Traditional quoting ceiling **10 -> 8** (**Jon's ruling 8/29: engine is authoritative**; KB had drifted with no changelog), rows 9-10 annotated not truncated, escalation trigger 11+ -> 9+, "5/lane vs VIP 6/lane" removed | `brain/kb/Avery_KB.md` (Doc pushed) |
| Wiring | `TPRS Alt Availability -> Update Event - Availability` (the alt probe's `alt_available` was rebuilt but never persisted; stored blocked results were alt-blind, so the two-option offer was unreachable after the live check) | `brain/deploy/patch-wf2-alt-availability-persist.mjs` |

**Rollback handles:** WF2 versionIds `6a733c27` (before) -> `27bdc607` (brain) -> `8ef60750` (wiring). KB: `git show HEAD~1:brain/kb/Avery_KB.md` + `deploy-kb.mjs --yes --skip-golden`. **Trap:** n8n-mcp `addConnection` fails on this workflow ("settings must NOT have additional properties") - use the patch script, which goes through `lib.mjs sanitizeSettings`.

**Tests:** four new offline harnesses in `Marketing Avery/brain/checks/` run the REAL node bodies with a stubbed `$()`: `test-hypothetical-weekday.mjs` (14), `test-blocked-slot-scope.mjs` (12), `test-vip-lane-band.mjs` (20), `test-kb-engine-lane-policy.mjs` (10, KB prose vs `tprs constants.ts`, exit 0 without tprs). All green; all red against HEAD via `BRAIN_BASE=`. Golden suite: dry run 9/9; live run skipped (Jon: cost). `drift-check.mjs` CLEAN.

## Rulings (8/29)

- **Traditional quoting ceiling = 8 lanes** (= 40 guests at ceil(g/5); 48 when the guest says not everyone bowls). Engine constant `customerModeMaxLanes` is authoritative; the KB follows it.
- Alt-lane result persists (approved on recommendation); no TTL added (predates this; would have to apply to both polarities).
- Golden suite not run live when it costs money.
- Jon handled Robert's recovery and Sarah's thread by hand. Avery stays off E-0123702: her own sent fabrications replay into PRIOR CONVERSATION every turn and cannot be edited.

## Deliberately NOT done (each is a ruling or an ordering constraint, not an oversight)

- **`availability_claim_off_key` net** (Ornella-ruling generalization, "fail toward vague"): must ship AFTER the stand-down, never before - attempt 1 fails the forcer, attempt 2 fails the net, no attempt 3, NA. Now safe to build.
- **Alt-DATE probe** (send `candidate_dates` to TPRS): `avery-tprs-playbook.md` lists the multi-date batch check as post-launch. Hard constraint if built: a candidate slot must never be written into `tprs_check_key` (Set Route / Build Book-Event Request read it to arm a real booking).
- **`_dvConfirmed` widening (D6-b):** flips a genuine "we actually want it on Sunday" from flagged to silent. Separate ruling.
- **Capitulation siblings** `your call` / `we can make that work` / `stretch` / `cramped`: same latent exposure (the check is armed on every catered VIP thread of 17+ because Pre-Assemble assumes VIP at 10+), untouched.
- **`headcount_comfort_missing` on question-answering turns (D5)** and per-shape thread_summary validation (D7 check): not this pass.

## Watch

- First stored-blocked turn after 8ef60750: `avery_event.availability_state` should carry `alt_available` (query `select event_id, availability_state from avery_event where availability_state like '%alt_available%'`). If it never appears, the Alt-fed write is not landing.
- First `suppressed:hypothetical_weekday` in the wild - confirm no DAY/DATE MISMATCH flag and `verified_day_of_week` still populated.
- Any new `blocked_slot_not_addressed` NA where the guest DID name a different date = the `candidate_dates` parser missed that date format.
- `avery_metrics_buffer`: retry rate on blocked-slot turns should drop (4 of 6 Drobny turns needed a retry).

Memory: [[avery-blocked-slot-forced-fabrication]], [[avery-vip-capitulation-if-you-want]], [[avery-vip-per-lane-capacity-8-not-6]].
