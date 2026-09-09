# Payment-claim buffer — why Samantha Rufo was flagged 48 seconds after paying, and what changed (2026-09-08)

**Read this first for anything touching "I just paid" / "I just sent it" handling, the claim hold, the Claim Hold Watcher, the TPRS Outbox Listener's ack branch, or the KB's deposit_link / final_payment_link sub-cases.** The append-only record is the WF2 changelog (four entries, 20:45 to 22:10 CT), the watcher changelog and the Outbox changelog in `Marketing Avery/n8n/workflows/`; the ruling and the traps are in memory `avery-payment-claim-buffer`. Commits `65dcff5` and `06f21e0` on Marketing Avery `main`.

---

## 1. The ruling

Jon, 2026-09-08: a guest who pays the link and texts "I just paid it" in the same minute is the normal case, not a broken one. Avery never flags Needs Attention on the turn a payment claim arrives. She sends one hold line, a five-minute timer runs, and only the watcher may flag, and only when nothing has landed by the deadline. "Instead, Avery instantly responded and flagged. It's unacceptable."

## 2. What happened (all times CT, Sept 8)

| Time | Event |
|---|---|
| 7:02:00pm | Samantha's $1,027.50 deposit cleared in Stripe; TPRS `payment_records` row existed by 7:02:31 |
| 7:02:48pm | WF2 loaded her `avery_event` row: `payment_status null` |
| 7:03:01pm | TPRS `booking.deposit_paid` webhook reached the Outbox Listener |
| 7:05:49pm | Avery sent "Awesome, thanks for letting me know! Let me make sure it all lines up on my end." and raised Needs Attention |
| 7:07:32pm | The Outbox Listener wrote the payment to the mirror; its deposit ack was dropped because Needs Attention was already on |

## 3. Three root causes, each fixed at its own layer

1. **Detection.** `DEPOSIT_CLAIM` in Pre-Assemble Context had no contraction form; "it's paid" was not a claim, so Set Route's hold never armed.
2. **The KB ordered the flag.** deposit_link / final_payment_link Sub-case B said "claim with no webhook: ack and reply-and-flag". Avery's reply was that rule's customer language verbatim.
3. **The watcher measured the mirror.** `avery_event.deposit_paid_at` is written by the Outbox Listener after its 3-7 minute ack wait, because the ack branch sat topmost on the canvas and `executionOrder: v1` runs branches in canvas order.

## 4. What shipped (all live, drift clean)

- **Pre-Assemble Context** (`brain/checks/pre-assemble-context.js`): the paid family with contractions, adverbs and bare replies; typographic apostrophes and HTML entities normalized; negation scoped to the clause; payment text classified before the build family and never falling through; a payment claim counts only while a payment is owed and asked for (unpaid row + deposit link out, or deposit-tier row + final link out); deposit-vs-balance on the final path; explicit receipt questions are payment text, generic ones follow the latest ask; the referent of "sent it" / "done" is whatever we asked for last, including a builder link re-sent; new `submission_state.claim_solo`.
- **Set Route** via the new in-place `brain/deploy/patch-wf2-claim-hold-buffer.mjs` (swaps the CLAIM HOLD block from `SR_BLOCK` without moving it): a whole-message payment claim outranks a regular escalation; a repeat claim keeps its original deadline.
- **KB**: Sub-cases B and C merged into the 21.4 hold ("never raises Needs Attention on the turn it arrives"); 21.4 says about five minutes; a new FAQ entry "Do you have any specials, deals, or promotions?" (Penny A Pin, then the small-group fork; company events and chosen-catered groups never get the /book steer).
- **Claim Hold Watcher**: joins TPRS `bookings` + `payment_records` (`bookings.id = tprs_booking_id`, `bookings.avery_event_id = event_id`, the E-number), counts external cash/check settlements, 10-minute deposit lookback, a paid tier alone is not a landing, the "asked AGAIN" variant retired (it fired on every five-minute hold).
- **Outbox Listener**: the seven Ack nodes moved to y=1000 so the writeback runs before the ack wait (`patch-outbox-ack-branch-order.mjs`, applied ~22:10 CT, versionId c1e640dc).

Harness `brain/checks/test-claim-hold.mjs` 104 to 146 passing, every case red first. A read-only GPT-6-Astra review via Codex found the wrong join key, the apostrophe miss and the fall-through; the command is in `brain/README.md`.

## 5. Traps found tonight

- `bookings.avery_event_id` holds the `E-xxxxxxx` id, not the avery_event uuid. `tprs_booking_id` on avery_event IS a uuid.
- External payments have `settlement_channel = 'external'`, `settled_at` set, `paid_at` and `rail_status` null.
- Phones send U+2019; every regex in the brain is written with a straight apostrophe.
- An undefined identifier anywhere inside the `submission_state` try block nulls the whole subsystem silently on every inbound turn. A `perl -pi` that mangles a call name produces exactly that.
- `claude plugin uninstall` drops `effortLevel` from user settings, same as `marketplace add`. pstack was removed tonight; Bun stays.

## 6. Open

- **Verify the Outbox reorder on the next organic deposit**: `tprs_event_log.received_at` and `avery_event.deposit_paid_at` within seconds of the webhook, the guest ack still 3-7 minutes later. If the writeback is still late, canvas order is not the lever.
- Samantha's thread: a human reply confirming the deposit, then clear Needs Attention (Jon is handling).
- J. Cooper E-2487857: watch whether Avery answers the specials question on the next turn.
