# 2026-08-30 — Holding a booking with no deposit: pay-on-site terms, line-item resurrect, and two money fixes

**Status: ALL LIVE IN PROD** (tprs PRs #134, #135, #136; migration 0160).
Verified at ship time: enum applied to prod, migration ledger 160 = journal 160,
`/health` 200, Render deploy `dep-daa8eru7bikc73bh4qg0` live 19:42:45 CT.

Read this before touching `pay_on_site`, `bookings.expires_at`, the Reactivate
button, the deposit-link card, or `amount_due_now_cents`.

---

## Why any of this exists

Jon: a school (PSD 202, Beth Ciszek) wants an **invoice from TPRS** and pays
**cash or a check that gets rung into the Brunswick POS**, so the money must not
appear in the TPRS CPA report.

Two thirds of that already existed and nobody remembered:

- **CPA exclusion — ADR-0027 external settlement channel.** `Record external
  payment…` writes `settlement_channel='external'`, and BOTH revenue readers
  exclude it by explicit filter (`services/cpa-report.ts`,
  `services/daily-event-revenue.ts`). **That, not the new flag, is what keeps a
  dollar out of CPA.** Don't conflate them.
- **The invoice — ADR-0027 §5.** Hosted `/m/receipt/:token`, copyable link +
  Email receipt on the booking page.

**What was missing was the ability to hold the booking without a card**, and a
way back for the one that had already died of it.

`INV-2026-00482` — 39-guest field trip, **Dec 16, 10:30am–12:30pm CT**, $813.00,
booked 8/28 — was auto-cancelled 8/30 09:39 CT (`booking_expired_auto_cancelled`,
`reason: expired_deposit_window`) with zero payment records. A December date
cannot survive a 48-hour August window.

---

## The two shapes, per Jon

| Shape | Requirement | Jon's words |
|---|---|---|
| Not paying online (cash/check on site) | Hold it, don't cancel. Presentation irrelevant. | *"IDGAF how it shows."* |
| Paying online, just later | Hold it → final headcount → **update event and pricing** → send payment link → they pay | *"they maybe get an invoice"* — **after** paying |

**RULING — do not rebuild:** a two-mode invoice-wording design (on-site vs
online copy) was raised and **DROPPED**. These hold-events get **no pre-payment
invoice at all**, so the wording never reaches the guest; after payment the
document reads *Receipt / Paid in full* anyway. Renaming the "Paying on site"
button was also raised and dropped.

---

## What shipped

### 1. `pay_on_site` settlement terms — PR #134, migration 0160

New `booking_flag` value + `services/pay-on-site.ts`. Setting it adds the flag
**and NULLs `bookings.expires_at` in the same UPDATE**.

**That single field is the entire hold mechanism**, and it needed no cron or
availability change because both already model "no deadline":

- `workers/booking-expiry-cron.ts` candidate query requires
  `expires_at IS NOT NULL` → a NULL row is **invisible** to it, not skipped.
- availability counts a `pending_deposit` booking's pool holds when
  `expires_at IS NULL` (`status <> 'pending_deposit' OR expires_at IS NULL OR
  expires_at > now()`) → **the lanes stay held.**

Also: invoice reads *Invoice / Due on site*; an unpaid document is now titled
**Invoice** generally (calling a nothing-paid statement a "Receipt" was the wrong
word on the one surface an AR department reads).

**Clearing the terms deliberately does NOT re-arm a deadline** — that would
schedule a real booking's death off a button that reads like an undo. The admin
page states the remaining "No deposit deadline" fact outright so the state is
never silent. Cancel the booking if it should not be held.

### 2. Line-item resurrect — PR #134

`POST /admin/bookings/:id/reactivate` gated on `engine_input_snapshot != null`,
so the button **silently never rendered** for a booking composed line-by-line in
the admin composer. A whole class of staff events had no way back, and the
symptom was an *absent button* — which is why nobody noticed.

**The insight:** reconstructing *engine input* from line items is genuinely
lossy (that's why it dead-ended), but **reviving a booking never needed engine
input.** Line items survive cancellation intact, so the new path leaves them
completely alone — no engine run, no catalog re-resolution, **no re-pricing at
all**. Strictly more faithful than the engine path, which re-quotes.

Only pool holds are rebuilt; every input is already persisted (window from
`booking_dates`, count from `quantity_consumed_snapshot`, only buffers read live
from product config). Capacity is re-checked before holds land. A magic-link
token is **required** — reviving into a payable-by-nothing state that still
carries a live auto-cancel deadline is worse than refusing.

The route dispatches on the snapshot: present → engine, absent → line items.
One button, one URL.

### 3. Deposit-link card fix — PR #135

**Regression from 0160, same day.** The card carrying the payment URL, the Copy
button **and the Email-deposit-link form** was gated on
`status = 'pending_deposit' AND expires_at IS NOT NULL` — the *same field*
pay-on-site NULLs. So it vanished from exactly the bookings staff collect from
later. Beth had a live valid token and no way to see or send it.

Now keys on **a live token existing** (the condition that actually decides
whether there's a link), with the legacy fuse still admitted so a booking with
neither renders nothing rather than an empty card.

### 4. Edit keeps a pay-in-full link paying in full — PR #136

`editStaffBooking` refreshes the frozen snapshot on PaymentRecords — its own
comment says why (*"without this refresh… the balance link would charge the
PRE-edit total"*). But a `pending_deposit` booking **has no PaymentRecord**; its
intent lives in `amount_due_now_cents`, which nothing updated.

The pay page computes
`collectsFullBalance = !isInitial || amount_due_now >= outstanding`, so a raised
booking's initial link **silently demoted to a deposit link**: an $813 hold
edited to $1,050 collected **$813**, left the guest in `deposit_paid` owing $237,
and told them a balance was due later — precisely at Jon's "update the event,
then send the link" step.

Only links that covered the **whole** pre-edit balance are re-pointed. Real
partial-deposit links keep their staff-chosen deposit (what a deposit should
become after an edit is a *pricing policy* question, deliberately out of scope);
NULL already falls back to the live balance.

---

## Traps — read before editing

- **⚠️ Postgres `GREATEST` ignores NULLs.** Any `GREATEST(expires_at, …)` would
  silently re-arm the fuse. The Event Hub 48h grace (`server.ts`) and
  `reclampExpiryToEventEnd` are safe **only** because both carry
  `isNotNull(expires_at)` guards. **Check that guard on any new `expires_at`
  writer.**
- **⚠️ Anything keyed on `expires_at` as a proxy for "is this a live staff
  event" is now wrong.** That's what broke the deposit-link card. Grep for
  `expiresAt !== null` before assuming.
- **⚠️ The `amount_due_now_cents` comparison MUST be tax-inclusive.**
  `priorTotalCents` in `editStaffBooking` is ex-tax while `amount_due_now_cents`
  is written from a tax-inclusive figure at creation — the obvious comparison
  misclassifies every taxed booking as pay-in-full. The fix captures
  `buildBookingQuoteSnapshot(...).totalIncludingTax` **before** line items are
  replaced.
- **`createAveryEditBooking` must preserve the NULL fuse** — an ordinary
  headcount edit otherwise re-arms the deadline silently, because nothing about
  editing a headcount looks like a settlement-terms decision. A control test
  asserts an ordinary booking still DOES get re-armed, so the guard is targeted.
- **Dunning is blocked** for pay-on-site: `eligible()` in
  `email-action.routes.ts` refuses them and the readiness digest neither offers
  the cancellation-notice button nor calls them "unpaid" (reads *"collect on
  site"*). The **manual** staff Send-cancellation-notice button is deliberately
  left available (Jon's 2026-07-31 manual-judgment ruling).
- **The tprs repo is checked out CRLF** (`core.autocrlf=true`), and `grep -c $'\r'`
  reports 0 anyway — scripted `\n` anchors silently fail to match. Normalize
  EOLs in any patch script, or use Edit.
- **Test exit codes lie here.** One full-suite run reported `exit code 0` with a
  real failure. **Read the "Test Files" line**, never the exit code.

## Durable lesson

Both follow-on fixes share one root cause: **extending a booking's lifetime
turned latent edit-path staleness into routine exposure.** Two separate fields
(`expires_at`, `amount_due_now_cents`) were written once at creation and were
safe only because a 48-hour window made "edit it months later" nearly
unreachable. If more long-hold workflows appear, go looking for other
write-once-at-creation fields that no edit path refreshes.

---

## Symptom → where to look

| Symptom | Look at |
|---|---|
| A held booking auto-cancelled anyway | `bookings.expires_at` non-NULL — something re-armed it. Check every writer for the `isNotNull` guard |
| Reactivate button missing on a cancelled event | `canReactivate` in `admin/bookings.ts` — needs `booking.edit_state` + `cancelled` + source in `EDIT_IN_PLACE_SOURCES` |
| Reactivate fails with a flash | Line-item path refusals: no token, no line items, event already past, or it has an engine snapshot (wrong path) |
| No payment link visible on a held booking | Deposit-link card needs a **live token**; mint one with Issue payment link |
| Guest paid less than the total | `amount_due_now_cents` vs outstanding — was it a real deposit link, or a stale full-pay one? |
| Money showed up in the CPA report | The payment was recorded on the **rail**, not via Record external payment. `settlement_channel` decides, nothing else |
| Guest got a "Payment Past Due" email | Should be impossible on `pay_on_site`; check `eligible()` — or a human pressed the manual button |

## Rollback

Revert the merge commits (`6a28a74`, `2c877e8`, `e3d6043`) on `main`. Migration
0160 is additive (`ALTER TYPE … ADD VALUE` ×3) and harmless left in place.

## Open / not done

- **The "Paying on site" button label** is read by staff for events that are
  really just *held, paying online later*. Cosmetic; Jon declined the rename.
- **A `pending_deposit` booking never auto-completes** — the completion cron only
  advances `deposit_paid`/`fully_paid`. If a check is never recorded, a
  pay-on-site booking sits at `pending_deposit` past its event rather than
  closing out. Inherent to "nothing reaps it"; record the payment and it behaves.
- Prod audit at ship time: exactly **one** live `pending_deposit` booking
  system-wide (Beth's), correctly set at pay-in-full — no historical
  under-collection, no backfill needed.

Memory: [[tprs-pay-on-site-terms]], [[tprs-line-item-resurrect]],
[[tprs-edit-keeps-pay-in-full]]
