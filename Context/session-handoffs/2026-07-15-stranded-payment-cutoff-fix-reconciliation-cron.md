# 2026-07-15 — Stranded payment #3 (Gwen Gilbert): root cause, fixes, reconciliation cron

**TL;DR:** Third "money captured, no booking" incident since launch — and the first one fully
diagnosed, because the observability shipped after the first two finally did its job. Root cause
was a **new systematic class**: the guest crossed the product's online-sales cutoff *mid-checkout*.
Fixed same-day at three layers (pre-charge rejection, auto-refund residual, guest-facing
countdown/hard-stop), plus a **15-minute reconciliation cron** as the universal net for every
strand class, known or unknown. **Fix A (manual capture) deliberately skipped — see decision.**

**⚠️ THE ONE THING THAT MATTERS IF PICKING THIS UP: tprs PR #7 must be merged by Jon.**
Until then the backend fixes + cron are NOT deployed (Claude is classifier-blocked from
`gh pr merge` on this repo). The Website half is already live (`7576f7f`).

---

## The incident

- **Guest:** Gwendolyn Gilbert, bitter-rondos-4y@icloud.com, 248-703-4362, Plainfield 60544.
  TPRS customer `8f650145-0747-4caa-badd-faf2c56ea875`.
- **Charge:** $78.97 Apple Pay (MC ••1631), PI `pi_3TtXzz1ffjY643K81dkXOTES`, captured
  2026-07-15 1:57:39 PM CT. **Zero rows** in bookings / payment_records.
- **What she was booking:** 1× traditional lane 1 hr (code 4), **same-day 2:30 PM slot**.
- **Alert:** Sentry TRPS-BACKEND-2 regression email at ~2:59 PM CT (the Jul-13 alert rule +
  re-resolve habit WORKED). "Seen 4 times" on the email = issue lifetime
  (Lily 1 + Mark 2 + Gwen 1), not four events for Gwen.

## Root cause (fully log-proven — Render logs, `checkout convert rejected` WARN lines)

Lane products carry `sales_cutoff_minutes_before = 45` → online sales for the 2:30 slot closed
at **1:45 PM**. The failure chain:

1. **Availability grid filters in-cutoff slots only at grid-COMPUTE time.** She picked 2:30
   while it was still legitimately sellable (before 1:45), then spent 12+ min in checkout.
2. **`/payment-intents` did NOT validate the cutoff** (only coupon/amount/hold-extend) → PI
   minted at 1:57:39, Apple Pay captured ~2s later.
3. **Convert re-validates against `now`** (checkout.ts step 4a-ii) → 400 `sales_cutoff_exceeded`
   at 1:57:42 — 3 seconds after capture.
4. **`sales_cutoff_exceeded` was NOT in the auto-refund set** (only amount_mismatch +
   form_answer_invalid) → charge stranded, no refund.
5. **Frontend had no handler for the code** → generic fallback told her *"Your card was charged —
   tap Finish reservation (you won't be charged twice)"* → she retried convert 6× over 82s
   (one retry even hit CartHoldExpiredError, re-acquired the hold via `acquireHold()`, and
   looped again). All retries doomed — time only moves forward.

No other victims in the 7-day log window. The 18:47Z Render deploy that preceded the incident
was a red herring (service healthy; pure validation-timing failure).

## What shipped

### tprs PR #7 — https://github.com/jdow800/tprs/pull/7 (branch `fix/sales-cutoff-strand`) — **UNMERGED**

**Commit `2fc1be8` — the cutoff-class fix:**
- `/payment-intents` runs `validateSalesCutoff` BEFORE minting the PI *and* before the identity
  tx (no charge, no customer-PII write on a doomed attempt). Typed 400 mirrors convert's.
- Convert's `sales_cutoff_exceeded` branch now auto-refunds a captured charge (bare rail refund,
  idempotency key `cutoff-refund:<pi>`, mirrors the form_answer_invalid pattern). Covers the
  residual PI-mint→confirm race.
- `CustomerProduct.salesCutoffMinutesBefore` exposed on the catalog (`.default(null)` — tolerant
  of deploy skew; vendored Website schema updated in lockstep).
- 4 new tests (payment-intents reject pre-charge / accept outside window / convert auto-refund /
  catalog field).

**Commit `6ebafb7` — the reconciliation cron (migration 0096):**
- `workers/payment-reconciliation-cron.ts`: every 15 min, list captured Stripe PIs (24h lookback,
  read-only) carrying `tprs_*` metadata → check each against `payment_records` → any gap past a
  15-min grace window emails the alerts inbox **once** (dedup table
  `payment_reconciliation_alerts`; dedup row + email land in ONE tx). Silence = clean. Alert-only,
  zero money-flow writes. Mounts iff `stripeSecretKey` worker option (start.ts passes
  `STRIPE_SECRET_KEY`); graceful sentinel degradation (`system:payment_reconciliation`, seeded in
  0096 — migration runs in Render pre-deploy, so a single deploy is ordering-safe).
- `/payment-intents` stamps booking intent into PI metadata (`tprs_items`, `tprs_event_date`,
  `tprs_start_time`, best-effort) → the alert email arrives pre-investigated: customer name/
  phone/email, what they were booking and when, amount, **ACTION NEEDED vs already refunded**
  (convert's auto-refund beat the sweep), Open-in-Stripe button. Subject:
  `Stranded payment $78.97 — Gwen Gilbert — ACTION NEEDED`.
- Webhook-path `StrandedPaymentError` (Sentry) carries the same intent string now.
- Email type `admin.stranded_payment_alert` (pgEnum + subject-lines + humanize + template
  `views/emails/admin-stranded-payment-alert.eta` + dev-email-preview) — full lockstep.
- **Routing:** `PAYMENT_ALERT_EMAIL` → `ADMIN_BOOKING_ALERT_EMAIL` → `info@twistedpin.com`.
  Set `PAYMENT_ALERT_EMAIL` on Render to split these from booking noise; nothing set = same
  inbox as deposit-paid alerts.
- 1509/1509 backend tests pass; 3 new post-commit sweep tests.

### Website `7576f7f` — LIVE on main
- PaymentStep: countdown banner when the sales window is inside 10 min ("closes in m:ss"),
  hard-stop blocker replacing the card form once it closes pre-charge (timer or server 400) —
  "Find a new time," no retry offered. **Blocker gated on `!submitting`** — unmounting the
  PaymentElement mid-confirmPayment can fail the confirm client-side AFTER Stripe captures,
  which IS the strand shape; a mid-flight cross is the server's residual case.
- `sales_cutoff_exceeded` from convert (charged) is now TERMINAL with honest copy ("your card
  was charged and we've issued a refund"), replacing the retry-forever loop.
- Deploy-skew safe: vendored schema defaults the new field to null → no timer until the backend
  ships it; server enforcement is independent.

## Sentry vs cron — why both (the design argument, for future reference)

Same goal, different failure domains. The webhook-driven Sentry alert is event-driven but
hostage to **Stripe's webhook retry schedule** (Gwen's alert landed an hour after capture —
first delivery was correctly 500'd as the benign race at age 2s; Stripe's next retry came ~1h
later) and to the **TRPS-BACKEND-2 re-resolve habit** (Mark's events grouped into an open issue
and emailed nobody for 11 days). The cron asks the ledger directly on a clock we control:
bounded ~30-min worst-case detection, no human-habit dependency, and it catches the class the
webhook path structurally can't reach cleanly — **no-convert-at-all** (browser/network death in
the seconds between capture and convert). Keep Sentry (free, catches everything else); the cron
is the authoritative net.

## Decision: Fix A (manual capture) SKIPPED — new trigger

Jon's call this session: fix A (authorize → convert → capture, void on failure) is "the nuclear
answer to a small problem" (~$200 stranded on ~$30k revenue, all recovered). The Jul-13 trigger
("two strands in any single month") technically FIRED (Mark Jul-2 + Gwen Jul-15), but it was
written against the pre-fix world. **New trigger: a strand of a genuinely NEW class occurring
after the cutoff fix + cron are live → fix A stops being optional.** Also do it opportunistically
if TPRS ever gets a staging env or the payment step gets rebuilt anyway. Design notes for fix A
live in the memory file (`requires_capture` already in ACCEPTED_STATUSES; kills the double-charge
class too; new failure modes: lingering auth holds on guest cards, capture-fails-after-booking).

## Open items at session close

1. **Merge tprs PR #7** (Jon — both commits ride together). Post-merge sanity: Render deploy log
   shows migration 0096 applied in pre-deploy; boot log line `[workers/main] all N workers
   started` (count +1); first cron ticks are silent (clean ledger = no output).
2. **Gwen refund** — pending Jon's staff check (he emailed her). If staff honored the lane
   in person: no refund, but the $78.97 has NO TPRS record → will show as **Unallocated in the
   monthly CPA reconciliation** (see tprs-cpa-report memory: "Unallocated ≈ $0" ritual) — leave
   a note for the books; also verify staff didn't double-charge her at POS.
3. **Sentry:** TRPS-BACKEND-2 re-resolved by Jon 2026-07-15 ✅ (habit stands: re-resolve after
   every strand).
4. **TRPS-BACKEND-5 (unrelated, OPEN):** bar-invoice-extraction worker ZodError — LLM returned
   `extendedAmount: null` on an invoice line; that invoice is stuck in the queue until the schema
   allows nullable + flags for review, or it's re-extracted.
5. Optional: set `PAYMENT_ALERT_EMAIL` on Render if stranded alerts should skip the info@ noise.

## Key files (future pickup map)

- tprs: `apps/backend/src/server.ts` (/payment-intents validation + metadata; convert catch
  ladder + auto-refunds), `services/booking-validation.ts` (`validateSalesCutoff`),
  `services/checkout.ts` step 4a-ii, `services/rail-webhook-handler.ts` (strand branch, 180s
  threshold), `workers/payment-reconciliation-cron.ts`, `drizzle/0096_payment_reconciliation.sql`.
- Website: `src/components/tprs/steps/PaymentStep.tsx` (cutoff clock/banner/blocker/terminal),
  `src/tprs/schemas/customer-flow.ts` (vendored — keep lockstep with @tprs/shared-schemas).
- Memory: `tprs-stranded-payment.md` holds the full three-incident history + fix-A design.
