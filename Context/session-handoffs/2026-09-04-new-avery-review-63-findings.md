# 2026-09-04 (night) — New Avery review: 63 findings, 62 stand, 15 clusters, 4 rulings owed

**Read this before fixing anything in Avery's builder world.** The fix batch has NOT been built yet; this is the ruled list.

## What happened

Jon asked how to find "20 more things" without waiting weeks of live traffic. Options weighed: simulated guest on the clones (rejected — Jon didn't love it), Opus review agents with different goals (chosen: #1 layer-collision sweep, #3 real-guest-move walkthrough, #4 retry-exhaustion audit; #2 real-thread review skipped).

Inputs built in the scratchpad and then saved to `Marketing Avery/avery-review-2026-09-04/`:
- `pull-corpus.mjs` — PostgREST pull of the FIRST guest reply per real Jul–Aug inquiry (212 rows, 187 SMS / 25 email; Visit Feedback threads dropped → 162).
- `walkthrough.mjs` — runs the REAL Pre-Assemble (golden shim pattern) over every reply under two presets (offer went out / link out 40 min), dates shifted forward same weekday.
- `BRIEF.md` — the agent brief (read-only rules, this week's 14 rules, new check names, shim usage).
- `findings-51.json` / `findings-compact.txt` — the 63 findings (numbering = compact file).
- `verified-51.json` (6 Fable 5.1 verdicts) + `refuter-verdicts-sonnet.json` (9 clusters / 27 findings, all stand).

Run history (for the token post-mortem): pass 1 (Fable 5.1) hit the session usage limit at 4/16 finders; pass 2 (Fable 5.1, resume) finished ALL 16 finders + 6 verifiers before Jon asked to switch to Opus; the Opus restart re-spawned all 16 finders (resume did NOT cache-replay the finished ones) and the session ended 4 min later with nothing. Jon then asked for the cheap path: I clustered + pre-verified in-context, one Sonnet refuter per unconfirmed cluster (9 agents, ~2M tokens). **Lesson: `resumeFromRunId` re-ran completed finders here — extract results from `journal.jsonl` and pass them to a NEW small workflow instead of trusting the cache.**

## The ledger (artifact "New Avery Review Ledger", published 9/4 night)

Fix order, severity, verification:

1. **Builder-link turn fails its own hand-off draft** (HIGH, #1/#10/#41/#52/#55) — `food_nudge_skipped` + `gather_complete_stall` + `headcount_comfort_missing` have no `builder_link.due` gate; the TIER 2/3 flag (legacy /essential URL) renders beside the BUILDER LINK block. Retry weaves the legacy link in → guest gets both links. 3 real rows (E-0463160, E-4130436, E-6002801).
2. **fp_send dropped by both check return blocks** (HIGH, #17/#18/#36) — the 8/31 final-payment autonomy has NEVER fired; Set Route reads `$input`. Plus signoff_horizon fires on the chase-resolving turn (#18/#36), regex gaps (#19), co-fire with holding phrase (#20).
3. **Bare-hour / shorthand time parsing** (HIGH, #9/#40/#48 + "5p to 8pm") — real rows E-9371483 ("2:30"→AM), E-1419390 ("around 1:00"), E-0750793 ("at 7/31"→7am), E-2785025 (10:30 + afternoon tick → 10:30 PM past-closing), E-8231229 ("5p to 8pm" binds 8pm).
4. **Count-check chain deadlock** (HIGH, #37/#38/#39/#44/#45) — claim-word answer → Set Route stands down (empty reply); quote draft fails `quote_confirmation_skipped`, bare ack fails `count_check_answer_not_quoted` (real row state `not_ready`); retry entry names prior not inquiry (unsatisfiable on a 2nd Send); Jon's wording fails `headcount_comfort_missing`.
5. **Availability probe + blocked template** (HIGH, #56/#57/#13/#46/#47/#58/#59) — `_blockedReply()` takes `lc2.start_time` before the key → "6pm is spoken for … 6pm or 9pm available"; probe never reads the guest's DATE; bare "8 instead" can't stand the beat down; retry entry says "window"; CALENDAR line says "say you will get that one checked" while `availability_check_offered` bans it.
6. **LINK OUT scoping** (HIGH, #5/#6/#7/#12/#49/#60/#61/#55) — help-wall regex matches "if that doesn't work the 13th"/"Can't wait!"; details regex misses "September 18th", bare hours, kids/adults; no eligibility guard; collides with early-open flag.
7. **Builder link goes out regardless of the words** (HIGH, #2/#3/#11/#62) — decline / wrong number / call-me / lanes-only / same-turn count drop. Needs ruling on price objections.
8. **Retry-exhaustion traps** (HIGH, each tiny): #25 holding-phrase `i'?ll` no `\b` ("I will reach out" = KB refund answer; also 415 chars on SMS); #33 hold line "shortly" trips `timing_promise`; #34 `receipt_denial` matches "don't have to do the food form"; #35 pipe→bullets→`headcount_comfort_missing`; #27 price-scope retry busts the SMS cap; #21 WF1 before-open notes hard-fail the enforced opener (only School Field Trip is exempt); #22 WF1 SMS check is ASCII-only (`[^\x20-\x7E]`), accented names fail all three fixed texts.
9. **Kids / small-group seams** (MED, #29/#24/#30/#31/#32/#23 + pass-1) — ≤5 kids inside 8 days silenced on WF2; short-notice vs fixed plays (RULING); relation words block the fork; opener says "for the birthday" for every B/F inquiry (`_birthdayTyped` = group type); WF2 prompt still says /kb "even at 5 kids".
10. **Date parsing** (MED; #42 HIGH) — email signatures feed the date/time parsers; "Oct 1 or 15th" → two months; "this Thursday Sept 10th" → DATE NOT CONFIRMED; bare "the 26th" with no date on file → current month; "22nd or 29th of November".
11. **Price-scope check on system templates** (MED, #26/#27/#28 + pass-1 commit-step / booked figures / builder re-quote render).
12. **`builder_word_leak` vs own scripts** (MED, #8/#43/#15) — "build it out" in prompt :480 + Set Route fallback; "build around" in 5 KB/prompt exemplars.
13. **Fundraiser rows get catered flags** (MED, #50/#63).
14. **`timing_refusal_flagged` on an accepting guest** (HIGH, #14; #16 refuted).
15. Cosmetic: flag text says "slot" (#51).

Plus the Astra KB read (Jon pasted GPT's critique): confirmed — custom-menu handoff uses silent+response (validator blanks it → change to true); KB 661 "that slot is open"; "yours for the night"; Section 20 thresholds stale vs 8/31 ruling; held/hold wording; inbound stored reads have no TTL (builder has 6h). Deliberate/not defects: birthday age question, builder escape, AI-question deflection. Unverified: PartiallyPaid = deposit met.

## Rulings owed (Jon)

1. Short notice vs the fixed lane plays (5-kid / fork inside 3 days ships the text AND lands NA).
2. Plain-text selections (KB 811) vs LINK OUT (KB 808). My read: LINK OUT wins on a builder-eligible event.
3. 61–75 non-company Traditional: KB says "quoted as built", engine caps Avery at 8 Traditional lanes.
4. Builder link on a price objection: hold or send.

## Not done
- No fixes built. No deploys. Nothing changed on prod tonight after `c5a0b44`.
- The small-kids first-touch harness (`test-first-touch-small-kids.mjs`) is RED in its Parse and Check section ("anchor found 0x" — the patch script's anchor no longer matches the already-patched mirror). Harness bug, not prod.
