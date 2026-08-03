# 2026-08-02 — Deposit-link lifecycle, WF3 fanout, stale-money fix

**One-line:** Two customers' deposit links died silently (Kris INV-2026-00307, Tiffany INV-2026-00308); pulling that thread surfaced and fixed a state-corruption bug, built the entire expired-link lifecycle, shipped a staff reactivate button, and closed the last path by which Avery could quote a wrong price.

Everything below is LIVE in production unless marked otherwise. Repos touched: `tprs` (PR #67, merged + Render-deployed, migration 0135), `Marketing Avery` (brain deploys + changelogs), n8n (WF3, Outbox Listener, TPRS Link Reminder, new TPRS Expiry Win-back, WF2 graph). This Website repo: only this handoff.

---

## 1. The root-cause bug: WF3 case-0 fanout (FIXED)

`Missive Label Listener` WF3 (`Z3jBdKVBc0FgEFDhUeXmW`) `Route By Rule` output 0 (Needs-Attention-REMOVED) was wired to **all seven** downstream branches. Every human NA-label clear simultaneously fired `Set Cancelled` + `Set Deposit Link Sent` + `Set AI Status Paused` + `Set AI Status Active` + the HC/FP/PE setters. Proven on 5/5 retained NA-removed executions; fingerprint = `cancelled_at` within 12–26ms of `link_sent_at` plus the full hc/pe/fp signature.

Consequences: ~36 `avery_event` rows carry phantom cancelled state (33 are leads with NO booking — never cancelled by anyone); by n8n canvas-order the pause always beat the unpause, so **clearing NA was silently re-pausing contacts**; and the 22h link reminder was structurally disarmed for its whole life (it requires `pending_deposit`; the fanout stamped `cancelled`). That is why Kris + Tiffany got no reminder and lapsed unnoticed.

**Fix:** `replaceConnections` — output 0 now targets only `Search Contact - Reactivate AI`. Validator 0/0. Zero new contamination since.

**Jon's ruling: NO backfill.** Fix forward only; the ~36 rows and ~18 wrongly-paused contacts stay as-is. Fully-built, adversarially-reviewed runbook shelved at `Marketing Avery/backfill-2026-08-02-wf3-fanout-runbook.md` if ever reversed. Known consequences accepted: paused contacts get no Avery reply if they text in (check `customers.ai_status` when "Avery didn't answer" comes up); E-2412144 (paid, completed) stays marked cancelled in the mirror. Flagged by name: Eric Stoudt E-7709804 (live Aug-5 booking, phantom "headcount confirmed" — Shanna to verify count by hand), James Ford E-2535803 (hot lead, event Aug 8, rescuable by manual text).

**Regression trap:** the nightly drift canary fingerprints node CODE + KB, **not connections**. An n8n version-rollback of WF3 (rollbacks overshoot — see memory) silently resurrects the fanout. After ANY WF3 rollback, re-verify output 0 has exactly 1 target.

## 2. The deposit-link lifecycle (ALL LIVE)

- **T+22h reminder** — `TPRS Link Reminder` (`fixOnaoNY8sBrwFi`): unblocked by the WF3 fix + hardened same day: `cancelled_at IS NULL` belt, do_not_market/sms_bounced/is_test/dry_run guards, past-event guard, CT 10–19 window, and the fire-once stamp moved OFF `pe_status` (collided with the post-event campaign AND permanently disarmed the row) onto `last_campaign_sent_type='link_reminder'` vs `link_sent_at` — **re-arms automatically per new link**. Before today it had sent exactly ONE SMS ever (Jon's own July test row).
- **`link_expired` state** — Outbox Listener writeback now writes `booking_status='link_expired'` (not `cancelled`) when `cancellation_path='cron_expired_deposit_window'`. The state existed in Avery's prompt since v0 but nothing ever wrote it. Staff cancels still write `cancelled` → the win-back is structurally unable to hit them.
- **Expiry win-back** — NEW workflow `TPRS Expiry Win-back` (`9VKLZq98hgHgDAff`, ACTIVE): 2h cron, CT 10–19, keys on `link_expired` only, Jon-approved copy (money-free, link-free by design), fire-once per lapse, 26h backfill-guard ceiling, skips rebooked/past/paused/DNM/bounced/test. Historically the trigger has fired 3× ever (Kris, Tiffany, Jon's test) → measured zero false-positive surface.
- **Staff reactivate** — tprs PR #67: `POST /admin/bookings/:id/reactivate` on cancelled Avery events (permission `booking.edit_state`, needs `engine_input_snapshot`, window from `booking_dates` not the snapshot). Wraps `createAveryEditBooking`: capacity re-check, fresh `expires_at`, **same magic-link token slug revives** — the URL already in the guest's thread comes back to life; never send a new link. Same PR: admin deposit-link card + email-deposit-link now match `avery_initial_deposit` too — **no Avery booking's deposit link had EVER been visible in admin** (they mint a different purpose than the staff filter expected).
- **`booking.reactivated` outbox event** (migration 0135) — emitted by the shared primitive so staff button AND Avery resurrect both fire it. Listener consumes: mirror → `pending_deposit`, `cancelled_at` NULL, real link expiry, `link_sent_at=now()` (re-arms reminder), removes the Missive `Cancelled` label unconditionally. Deliberately never touches `Needs Attention` (human-only), never puts the payment URL in the payload, never resets `conversation_color`.
- **Avery resurrect un-gated** — the chain existed since 7/04 and never fired: four unconditional KB "link expired → silent escalation" lines beat the one scoped resurrect instruction. Fixed: KB carve-outs (3 lines + FAQ; final-payment lines deliberately untouched — paid-tier escalation stays correct) + prompt states a resend request IS readiness. Zone gates already encode Jon's spec (≤60 guests, 10–365 days; out-of-zone → warm staff tag; `edit-booking` re-checks capacity itself). Deployed versionId `16628241`, golden 8/8. **Still has never fired with a real guest — watch the first one and capture it as a golden case.**

## 3. Kris + Tiffany (Jon handles manually)

Both reactivated via the new button 8/02 (~21:40/21:44Z) — real bookings back to `pending_deposit`, original links live to Aug 4 ~4:40pm CT, links texted by Jon manually. **Both stay Needs-Attention-gated for this lifecycle per Jon** — their mirror rows still say `cancelled` (reactivation predated the listener branch) and Tiffany's mirror money is stale ($1,125/$2,245 vs booked $1,440/$2,875), so Avery must NOT be un-gated on these two threads. If they pay: `deposit_paid` webhook self-heals the mirror. If they lapse Tue 8/04: mirror flips `link_expired`, but the stale mirror expiry keeps them outside the win-back window (and Tiffany is pause-blocked) → no automated text either way. Kris has a NEW inquiry E-2212545 owned by a PAUSED duplicate contact (`2c64e7a6`) — if she texts, Avery stays silent until Jon unpauses or handles it.

## 4. The stale-money fix (deployed last — see WF2.changelog 2026-08-02)

**Rule established: `avery_event` remembers the conversation; TPRS remembers the sale; only the sale may quote a price.** The event-row money scalars are LAST-QUOTE-DELIVERED (the book-turn writer `Write Booking State` writes no money column), so a comparison shopper's row holds the wrong package's numbers — and the old validator whitelisted that scalar on every post-quote turn ("the guard certified the stale number"). Measured: 2 of 15 booked rows diverged (Tiffany; E-3594431 $1,330 stored vs $1,657.50 charged).

**Fix (per-package quote panel):** new read-only WF2 node `Lookup Quote Log (Context)` (inbound path, `Reset Engagement State → node → Load Context`) feeds `ctx.quote_history` — one engine-authored entry per (food_package, lane_type) from `avery_quote_log`. Prompt repointed: offer beat + restatements + booked-row answers draw from the panel entry matching the package under discussion; scalars no longer injected anywhere. Checks repointed: whitelist = panel numbers (gated `!_tprsPaidTier` — paid-tier money questions escalate, because pre-drift-guard charges can differ from quotes) + breakdown numbers only on `breakdown_requested` turns (regex extended — it was missing the prompt's own trigger phrases). Menu path deliberately carries no money. New golden case `tiffany-multiquote-offer-beat` (captured from real exec 10937) pins it: must state $1,440, must not state $1,125. **Suite is 9 cases now.**

**Rollback for this fix:** git revert + `deploy-n8n.mjs --yes` (never n8n version-restore), AND the revert must flip the tiffany case to `status: stub` or the rollback deploy's own golden gate fails. Graph half: restore `Reset Engagement State → Load Context` edge; the orphaned node is inert.

**Known residuals (accepted):** panel speaks quote-truth, not payment-truth — post-booking edits that change amounts are invisible (future hardening = additive `amount_due_now_cents` on the TPRS Avery read endpoint); a stale-headcount panel row's numbers stay whitelisted (prompt staleness rule mitigates; 3-line Pre-Assemble filter is the next increment if it bites); the tiffany golden case dates from the real Aug-30 event — **bump its dates (case + overrides, consistently) or stub it before 2026-08-30** or it will block deploys.

## 5. Watch list

1. First real Avery resurrect execution → verify + `capture.mjs` it.
2. First real 22h reminder send (never happened for a real guest before today).
3. First real win-back send after the next organic lapse.
4. `dollar_amount_in_response` frequency for ~a week post-deploy — a spike means a breakdown phrasing outside the regex; extend the regex, not the whitelist gate.
5. `tiffany-multiquote-offer-beat` date-bump before Aug 30.
6. Kris/Tiffany resolution (Jon manual).

Memory files: [[deposit-link-lifecycle-build]], [[wf3-fanout-contamination]], [[avery-event-money-columns-are-last-quote]].
