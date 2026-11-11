# Handoff: "Full payment, allow split payment" + the receipt email box (TPRS), 2026-11-11

Written by the Claude session that did the work (cwd `C:\Users\jdow8\dev\Marketing Avery`, code in `tprs`). It stands on its own: what the guest asked, what Jon ruled, what shipped, how to switch it off, and where to look when it misbehaves.

## Outcome in one paragraph
A guest (Ashish Thareja, E-3397065, work holiday party, Wed Nov 18) asked for two invoices, then agreed to one itemized invoice paid on two cards. TPRS could not do that: a catered event booked 9 days out or less takes exactly one payment. Two things shipped the same day. (1) The pay page's "email a receipt" box, which had never sent anything, now emails the payer a copy of the receipt (tprs PR #549). (2) New Event and Edit event got a third Payment type, **Full payment, allow split payment**, which lets staff open a split for one event while nothing tells the guest they are booked until it is all paid (tprs PR #550). Both are live. As of 2pm the guest had not replied, no booking exists, and the new option has had no real use yet.

## What the guest hit
- 11/10 9:36pm: "I will need two separate invoice for bowling and food, possible?" Avery flagged it (formal document) and left a draft with a blank where the answer should be.
- 11/11 8:38am: Shanna offered one itemized invoice paid on different cards. 11:17am the guest confirmed that works.
- 12:20pm: a text went out telling them to "pick Split the payment". That option did not exist for their event (7 days out, catered). The text was wrong when it was sent; #550 is what makes it true.
- They sent the event page at 9:38pm on 11/10 (VIP suite, 2 hours, 20 guests, Stars & Strikes, $1,190). At 11:31am on 11/11 they recalculated at 15 guests, 5:30pm, $810 and did not send it. The inquiry form said 18. **Confirm the count before creating the event.**
- Their customer record has a phone and no email. TPRS emails need one.

## Rulings (Jon, 2026-11-11)
- One itemized invoice, as many payments as they like, "they are welcome to do their own math on how they want to split the payment", and one paid-in-full invoice at the end. No second invoice, no per-line-item checkout.
- Why short notice took one payment in the first place: "we didn't want to give the false confidence that, if you paid a portion of an event that is fully due, you think you are booked. Because you're not booked until we have full payment."
- The override is a staff choice per event, not a global switch: a third Payment type beside Deposit and Full payment.
- On the receipt box: "I kind of like the theory of it", so it was made to work instead of removed.
- "We will always watch these closely ... I doubt we use it often."
- Not done, by choice: automatic cancel and refund when the rest never arrives; a deadline on the remainder; a line-item checkbox checkout; telling Avery the option exists.

## What shipped (LIVE)
| What | Where | Version / rollback |
|---|---|---|
| **The receipt box sends a receipt.** On a split or pay-in-full link, the box now reads "Email a receipt to (optional)" and shows for either choice. When that payment settles, the typed address gets a copy of the receipt (neutral greeting, permanent receipt link). Skipped when the address is the booker's own. A failed copy can never block a payment. | tprs PR #549 | commit `18eecf6a`, merge `b6d7e710`, merged 12:41pm CT. Rollback: revert the merge in a PR. |
| **Payment type "Full payment, allow split payment."** New Event and Edit event. Still full payment (short-notice terms unchanged), but the link offers "Pay it all now" / "Split the payment". | tprs PR #550 | commits `4caeef98` + `6a22805d` (review fixes), merge `8d5fe187`, merged 1:52pm CT. Rollback: revert the merge in a PR. No migration either way. |
| **Nothing says "booked" until it is all paid** (same PR). See the list below. | tprs PR #550 | same |

Confirmed serving on the production pay page by fetching it and reading the new wording in the HTML. **Not confirmed: the staff dropdown itself** (it needs a login; it shipped in the same deploy).

### What a part payment does on a split-allowed event
- The pay page, the email and the screen after paying all say the event is booked once the full amount is paid. "Your date's held" and "locked in" never show.
- The guest gets a "Your event is not booked yet" email with a button back to the same link. That link now stays alive until the event.
- Staff get an alert whose subject starts **NOT BOOKED YET**. The booking page shows **Part paid. NOT booked yet.**
- Avery gets no deposit signal, so she sends no deposit thank-you. No invitation is created.
- The GM's short-notice ordering and staffing alert waits for full payment.
- The 48-hour reminder is skipped while a balance remains.
- **The lanes are held and nothing cancels on its own.** If the rest never comes, staff cancel and refund by hand. The 10am readiness email lists the event in red every morning until it is paid (events in the next 7 days).
- When the last part lands: the normal paid-in-full confirmation, and the option switches itself off for that event.

## How staff use it
1. New Event, fill it in as usual, Payment type **Full payment, allow split payment**, create.
2. Check the booking page shows the "Split payment allowed" banner, then send the link.
3. Tell the guest: "Your event is booked once both payments are in."
4. To switch it on for an event that already exists: Edit event, change Payment type, Update. To switch it off: same, pick Full payment. Neither changes what is owed.

## Who can split a payment (the whole picture)
| Link | Split offered? |
|---|---|
| Balance link after a real deposit | Yes ("Pay part of it now"). The date is already held. |
| Pay-in-full link, event more than 9 days out | Yes ("Split the payment"), old wording ("Your date's held" after part one). |
| Catered event booked 9 days out or less | **No**, one payment, unless staff chose the new Payment type. |
| Any event with "Full payment, allow split payment" | Yes, with the "not booked until it is all paid" wording. |
| Advertising invoice | No. |
| A true deposit link | No, fixed amount. |

A split is by dollars. There is no per-line-item payment: the guest reads the itemized invoice and types an amount ($25 minimum).

## Facts worth knowing next time
- **No card receipt comes from Stripe.** TPRS turned Stripe's receipt email off on 6/14 because guests read it as a double charge. The receipt box shipped a month later built around it, so it sent nothing until 11/11. What exists is one permanent receipt page listing each payment with its date and card last four. Staff can email a copy of it to any address from the booking page.
- **"Record external payment" is cash or check only.** It is not a way to take a second card.
- **Where the option is stored:** `staff_allow_split_payment` on the booking's saved engine input (`bookings.engine_input_snapshot`). No booking flag, no migration. Avery cannot set it. It is added at save time and cleared at full payment. **Any new code that rebuilds that saved input from a fresh one must carry the option over** (the Avery edit path does), or it silently switches splitting off.
- The three rules live in `tprs/apps/backend/src/services/short-notice-payment.ts`: `allowsSplitPayment`, `requiresSinglePayment`, `isSplitNotBookedUntilPaid`. A booking with a real deposit ignores the option.
- **Quick check that a pay-page change is live, no login:** fetch `https://pay.twistedpin.com/m/anything` and search the HTML for a phrase from the change.
- Short-notice full payment itself is tprs `22f84d8d` (migration 0247). Its notes are dated 11/2, and three production bookings carried the flag by 11/10.

## If it comes back
- **"The link has no Split option."** Is the event catered and booked 9 days out or less? Then it needs the Payment type set (Edit event). Is it a true deposit link, or a balance of $25 or less? Those never split.
- **"Edit event will not save when I switch it on."** A short-notice edit is refused while the guest has a payment open on the link ("A payment is already open or processing. Review or retire that payment before changing this short-notice event."). That rule is from the 11/2 short-notice work, not from this change. I did not check where staff retire an open payment.
- **"A payer says no receipt came."** Look for a `booking.receipt_copy` row in `email_outbox_event` for the booking, addressed to what they typed. No row: they left the box blank, typed the booker's own address, or paid on a link with no chooser. A `[payer-receipt] copy failed` line in the Render log means the copy failed and was skipped so the payment could record. Send one by hand: booking page, email receipt, override address.
- **"The guest was told they are booked after paying part."** Check `outbox_events` for a `booking.deposit_paid` row on that booking (there should be none), and whether the option was still on when they paid (`engine_input_snapshot->>'staff_allow_split_payment'`). If something rebuilt the saved input and dropped it, that is the bug.
- **"A paid-up event says NOT booked yet."** The option should clear itself at full payment. If the banner shows on a fully paid event that later got a balance from an edit, the clear did not run: check both payment paths (`rail-webhook-handler.ts`, `payment.ts`).
- **"Avery texted a part-paid guest that their link is unpaid."** Expected. Her records do not see a part payment (see limits).
- **"Create event booking said event details changed after I only changed Payment type."** That was fixed in #550's second commit. If it returns, something put the option back on the quoted input (`new-event.ts` `buildEngineInputFromForm` must not set it).

## Known limits
- Avery's records do not see a part payment. Her unpaid-link reminder and money-clock still treat the guest as unpaid, and a raw booking read shows deposit-paid.
- The 48-hour reminder is skipped while part paid, not delayed. If the rest lands later, the paid-in-full confirmation is the guest's last email.
- No automatic cancel, refund or deadline for an unpaid remainder.
- "Not booked" is wording over a booking the system still treats as deposit-paid. The pay page, emails, Avery's signal, the reminder, the GM alert and the booking page were changed. Other staff screens that list deposit-paid events (front-desk board, reports) were not audited and may show it as a normal event.
- Plain Full payment more than 9 days out still splits with the old "Your date's held" wording.

## Outside review after merge (GPT-6-Astra, max, 2026-11-11)
Asked for after both PRs were live, because the second commit of #550 (the eight fixes) had no independent review. Read-only against main `8d5fe187`. Verdict: **"fix before the first real use"**, with this reason: ordinary staff edits can confirm an unpaid event early or leave a fully covered event unconfirmed.

**Clean (the part that mattered most):** no way found for a captured payment to go unrecorded or be recorded twice; the two savepoints are real savepoints on the same connection; first, middle and last part, overpayment and replay all end in the right status; no booking without the option can split now that could not before; the new `outstandingCents` field leaks nothing; clearing the option at full payment loses nothing else from the saved input.

**Findings, each checked against the code by this session. NONE ARE FIXED as of this writing. Jon decides.**

| # | What happens | How likely | Checked |
|---|---|---|---|
| 1 | **Part paid, then staff lower the total to at or below what was paid.** A staff edit never promotes a deposit-paid booking to fully paid (true for every booking; `staff-direct-booking.ts` step 10b). For a split event the guest was told nothing at part one, so they never get any confirmation and Avery is never told. | Plausible on a booking whose count is still moving. | Yes |
| 2 | **Switching the option ON for an event that was already confirmed** (paid in full, then guests added, then staff allow a split for the extra). The guest and staff see "NOT booked yet" on a booked event. The clear-at-full-payment fix does not cover a staff re-enable. | Rare, but it is the natural move when a confirmed group wants the extra on two cards. | Yes |
| 3 | **Switching the option OFF after part one.** The event is then treated as an ordinary deposit-paid booking (reminder and kitchen alert fire) though the guest never got a confirmation. | Needs a deliberate staff action. | Yes |
| 4 | **Event more than 12 days out, option on, first part early, rest inside 12 days.** The kitchen's short-notice alert keys on the FIRST payment date, so it never fires for that event. | Only for the option used far out, which is not what it is for. | Yes |
| 5 | **Event more than 9 days out, option on, Avery changes headcount before payment.** Avery's edit turns full payment into a 50% deposit (it always did that to staff pay-in-full events). A deposit then books it the ordinary way. | Same: only far out. | Yes |
| 6 | **Part paid, then the event is moved EARLIER.** The link was extended to the old event end and is not pulled back (`reclampExpiryToEventEnd` only handles unpaid bookings; this was already true of balance links). | Rare, low cost. | Yes |
| 7 | A link being opened at the same instant a part payment settles can deadlock. The payment still records; the worst case is the page errors once or the link keeps its shorter life. | Contrived. | Yes (verify does lock the token on every open) |
| 8 | The two crons rebuild the invoice total from two separate reads; a payment landing between them can fool the far-out case. | Contrived. | Read only |

**This session's recommendation (not yet agreed):** one small follow-up that (a) makes "not booked until it is all paid" apply only to last-minute events, the only place the one-payment rule exists, which removes 4, 5 and 8; (b) remembers whether the guest has ever been told they are booked, which fixes 2; (c) announces full payment when a staff edit leaves a part-paid split event with nothing owed, which fixes 1. Record 3, 6 and 7. Until then, the workaround for 1 is manual: if the total drops to what is already paid, email the receipt from the booking page.

The reviewer's full text was at `%TEMP%\tprs-astra-review\astra-review.md` on Jon's PC (not committed).

## Open
- **This guest:** waiting on their reply. Needs an email and a confirmed count and time (20 at 5pm sent, 15 at 5:30pm calculated, 18 on the form). Shanna knows the option exists.
- **First real use of the split option has not happened.** After part one, expect the "not booked yet" email, a NOT BOOKED YET alert, and no `booking.deposit_paid` row.
- **First real use of the receipt box has not happened.** Expect one `booking.receipt_copy` row to the typed address.
- **The staff dropdown was not seen in production by this session.**
- **Avery and the KB were not touched.** If a last-minute guest asks Avery whether they can split, she has no instruction about this option. Decide whether she should route that to staff.

## What went wrong on the way
- **Stale checkouts, twice.** `dev\tprs` was 355 commits behind main; I read it as current and told Jon a pay-in-full link could be split, which was false for short notice. That became the 12:20pm text. `dev\Website` was 445 behind and on a feature branch when I came to write this. Fetch and read `origin/main`, or work in a fresh worktree, before saying how either behaves.
- I said each card gets its own Stripe receipt (taken from `docs/SPLIT-PAYMENTS.md` and the page's own label). It did not.
- I said a card run on the POS could be recorded as an external payment. That form is cash or check only.
- The review pass on #550 found ten real issues in the first commit, including the kitchen alert firing on part one and an error on the most likely staff path. Eight were fixed before merge; the two left are in Known limits.

## Where the records live
- tprs: `BUILD_NOTES.md` (two 2026-11-11 entries, the second includes the review round) and `docs/SPLIT-PAYMENTS.md` ("Who gets the chooser today" at the top). PRs #549 and #550.
- Tests: `server.m-payment.test.ts` ("allow split", "payer receipt"), `admin/new-event.test.ts` ("payment type: Full payment, allow split payment"), `services/short-notice-payment.test.ts`, `workers/short-notice-cron.test.ts`, `workers/booking-reminder-cron.post-commit.test.ts`, `email/renderer.test.ts`, `services/rail-webhook-handler.post-commit.test.ts` ("PAYER RECEIPT").
- Missive thread: `457b77d8-e224-479b-95cd-dfbe9953139b`. Read it with `node brain/deploy/dump-missive-conversation.mjs <id>` from `Marketing Avery`.
- Claude memory: `tprs-guest-payment-rail.md`, `tprs-main-checkout-is-stale.md`.
