# 2026-09-01/02 — A self-booked kids party Avery couldn't see, and the customer row split behind it

**Cross-repo: Marketing Avery (n8n) · Supabase `twistedpin-platform` · tprs (read-only this session).**
Trigger: Olga Mogildea texted Avery about a kids birthday, Avery answered correctly, Olga
self-booked online (**INV-2026-00512**, Sat 2026-09-12 2:00 PM, $505.38) — and Jon noticed
(a) Avery had no idea a booking existed, and (b) nobody had told the host the digital
invitation platform exists.

Design record (email proof, phone + desktop + spec): https://claude.ai/code/artifact/65dea992-b405-4743-8469-3b6e66a66d74

---

## The finding: ONE column, and a customer row split feeding it

`avery_event.tprs_booking_id` is the single point of failure. WF2's entire booking lateral
hangs off `WHERE b.id = e.tprs_booking_id` (`Lookup Event`). With it NULL, Avery loses
paid-tier language, the money line, and `_bkInviteClause` — which already contains,
verbatim, the whole invitation curriculum Jon was worried was missing:

> *EVENT PAGE (their hub): &lt;url&gt; … Invitation, event-dashboard, or RSVP questions are NOT
> booking changes — answer from the knowledge base without escalating.*

Its else-branch is *"This booking has NO live event page in your context … a host asking for
their event page link gets silent escalation."* **The curriculum was never missing. The valve
was stuck.**

**Why it was stuck (proven, not theorized):** `findOrCreateCustomerAtCheckout` matches on
**email only**; WF1's `Search Contact` looks up an SMS lead by **phone** and writes whatever
email the form gave — NULL for a pure SMS lead. Olga therefore has two `customers` rows with
an **identical phone**:

| row | created | email |
|---|---|---|
| `3933e7e8…` | 23:37:29Z | **NULL** ← Avery's contact |
| `5b857dcc…` | 00:02:00Z | olyamog@yahoo.com ← minted by checkout, 1s before payment |

`ae.contact_id = b.customer_id` could never match. Verified in prod:
`old_match=false, new_match=true`.

Execution **24859** (2026-09-02 00:02:33Z) is the receipt: `Resolve Missive Convo` → 0 rows
(no note ever posted to her thread), `Ack Context` → 0 rows (no ack).

**It self-heals, slowly.** `reconcile_avery_conversation_ids()` (pg_cron `*/15`) already
matches phone-last-10 OR email, so her row was linked within ~30 min and Avery is armed on
that thread now. What does NOT self-heal is the **Missive note** — her thread still carries
no record of the booking and no Fully Paid label.

---

## SHIPPED — Fix A (LIVE, `TPRS Outbox Listener` `uA47y94uBr7dwBfE`)

Two node queries now match on **phone-last-10 OR email** — the same predicate
`reconcile_avery_conversation_ids()` has used since 2026-07-08:

1. **`Resolve Missive Convo`** (posts the booking note + applies the paid label).
   **Deliberately NO `event_date` requirement** — preserves the pre-existing shape; the
   ORDER BY merely *prefers* a date-matching thread.
2. **`Avery Booking Writeback`** (sets `tprs_booking_id` + payment/booking status).
   **`event_date` guard KEPT STRICT.**

**Asymmetric guards by stakes, and that is the design:** the note is staff-facing and cheap
if slightly off; the writeback decides what Avery *says*, so attaching the wrong conversation
is worse than attaching none. (An earlier plan to relax the writeback's date guard for
undated conversations was **reversed** — the failure case is an undated corporate inquiry
getting stamped with an unrelated kids booking.)

**`Ack Context` deliberately UNTOUCHED.** Widening it is exactly what texted Dina Hejja a
wrong-date "payment received" (INV-2026-00440, 2026-08-16). This change therefore sends
**zero** new guest messages.

**Verification before apply** (all read-only, Supabase MCP):
- predicate on the real rows → `old_match=false, new_match=true`
- `EXPLAIN` writeback → index-backed (`idx_avery_event_tprs_booking_id`,
  `avery_event_event_date_idx`), cost ~22, no seq scan
- `EXPLAIN` note query → parses; seq-scans `avery_event` (647 rows, cost ~2.5k), but the
  **pre-change query had the identical OR-join shape**, so no regression

**Rollback:** n8n-mcp took local snapshots before each write —
`n8n_workflow_versions` mode `list`/`rollback`, workflowId `uA47y94uBr7dwBfE`.
The pre-change joins were `ae.tprs_booking_id = b.id OR (ae.tprs_booking_id IS NULL AND
ae.contact_id = b.customer_id)` in both nodes.

---

## SHIPPED — Olga's email (one-off, by hand)

Sent to olyamog@yahoo.com, subject **"Lavinia's party page is ready"**, Gmail message
`1a0625c411388204`. Went from jon@twistedpin.com (the TPRS template doesn't exist yet), so
replies land with Jon.

Real data throughout: birthday child **Lavinia, turning 12** from the Kids Party form;
window `Saturday, September 12 · 2:00 PM`; host URL
`rsvp.twistedpin.com/m/host/olgas-event-at-twisted-IvblR7PT-QQy` (curled 200, as were both
fallback forms).

**Her invitation minted at 00:02:03Z — two seconds after payment**, theme `confetti-strike`,
`display_title: NULL`, not revoked. Since the mint runs in the same transaction immediately
before the confirmation send, **the "Your event page is ready" block DID render in her
receipt.** She had the link all along, buried under a receipt table — which is the whole
argument for the standalone email.

---

## Verified risk analysis (WF5 `Filter Eligible`, read line by line)

Linking a self-serve kids party to an `avery_event` row has these consequences:

- **Headcount chase** — needs `PartiallyPaid` + `deposit_paid`. A kids party is
  `Paid`/`fully_paid`. **Structurally impossible.**
- **Final-payment chase** — needs `final_payment_due` + `PartiallyPaid` + a sent link.
  **Structurally impossible.**
- **Post-event day-after check-in** — **BECOMES ELIGIBLE.** `Read Events`' `booked_shape`
  classifier reads product mix and deliberately calls a Suite Birthday `'occasion'`, not
  `'self_serve'` (its own comment: *"a Suite Birthday Party is bookable online, so
  source='self_service' alone would strip the label from a real birthday"*). Guard B
  suppresses it if Visit Feedback texted within 3 days.
- **Annual rebook (~day 275)** — same reason, becomes eligible.

⚠️ **OPEN RULING (the only decision outstanding):** leave post-event + annual-rebook ON for
self-booked kids parties, or gate them out? **Note this is already true today via the cron**
— the real question is whether to *remove* existing behavior, not whether to add it.

---

## NOT BUILT

- **B — Kids facts for Avery.** Add to `Lookup Event`'s existing lateral:
  is-kids-party, package name, birthday child name + age (form `822693de`, on both codes
  109 and 118; **Name of Birthday Child is REQUIRED at checkout**, so it's always present).
  Then `Load Context` mapping (named-field mapper — nothing flows until listed) and one
  sentence in `_bk`'s paid branch. Goes through the brain deploy; re-baselines the drift canary.
- **C — The email as a real TPRS template.** Kids-only (codes 109/118), fires on
  `booking.fully_paid`, **T+10 min via `next_attempt_at = now() + 10 min`** (existing outbox
  column — no cron, no new table; the publisher claims on
  `pending AND (next_attempt_at IS NULL OR next_attempt_at <= now())`).
  ⚠️ **`email_type` is a Postgres enum** → new value needs a migration
  (`ALTER TYPE … ADD VALUE`) applied to prod before merge, per the usual order.
  Copy is locked in the artifact: bold **digital invitations** / **RSVPs**, underlined
  *entirely optional*, **no em dashes**, "a handful of designs" (never a number — a count in
  a sent email is wrong the moment the registry changes).

---

## Loose ends

- **Olga's Missive thread still has no booking note** (her booking predates the fix). Avery
  knows; staff looking at the thread do not. One manual note would close it.
- **Shared footer em dash.** *"Questions? Just reply to this email — it goes straight to our
  team."* lives in `_footer.eta`, used by **every** transactional email. The artifact shows
  it without the dash; sweeping it for real is a global change awaiting Jon's word.
- **`/reserve/birthdays` product 118 is $469.90** — Olga paid $505.38; the delta is add-ons,
  not a pricing bug. Not investigated, not suspected.

## Traps recorded

- **Supabase `service_role` has SELECT on the Avery-domain tables** (`avery_event`,
  `customer`, `customers`) **but NOT on the drizzle-created TPRS tables** (`bookings`,
  `booking_dates`, `event_invitation`, `booking_form_answers`) — `permission denied`. The
  **Supabase MCP connector runs as a different role and CAN read them.** This is what stalled
  the session overnight.
- **n8n workflow ACTIVATION is blocked by the Claude Code auto-mode classifier**, and this
  n8n instance has no MCP access token — so a throwaway workflow cannot be executed
  headlessly. Validate SQL through the Supabase connector instead (`EXPLAIN` without
  `ANALYZE` plans an `UPDATE` without running it).
- **`booking_form_answers.value`**, not `answer_text`.
- **sed replacement `&` expands to the whole match** — it mangled an artifact line this
  session. Use a different tool for replacements containing `&`.

Memory: [[avery-tprs-customer-row-split]].

---

## Funnel check (2026-09-02) — and why NOTHING further is worth building here

Volume, pulled from prod rather than assumed:

- **TPRS has exactly 3 kids parties, all time** (codes 109/118): one each in Jul / Aug / Sep,
  all `self_service`, first event 2026-07-19. Zero code-118 (Extra Suite) bookings ever.
- **TPRS contains NO Roller history** — earliest event date across all 490 bookings is
  2026-06-15, the reserve cutover. Roller sold in parallel until ~Sep 1 and none of it is
  visible here. No Roller booking export exists locally (only a customers CSV in
  `Loyalty/Patch Export/`).

**The trap I initially fell into:** "52 kids-birthday inquiries → 3 bookings" is the WRONG
read. `avery_event.event_type` is the INQUIRY type the guest picked on the form, not what
they would buy — the same trap CLAUDE.md already documents for the post-event copy. Split by
actual size:

| lane | inquiries | replied | linked booking |
|---|---|---|---|
| kids-package eligible (≤14) | 24 | 14 | 1* |
| too big → catered | 28 | 23 | 2* |

\* `tprs_booking_id` undercounts (linking was broken until today), but TPRS holds only 3 kids
parties total, so the true number is close.

**Conclusions:**

1. **The kids-package funnel is ~24 eligible inquiries → 3 bookings over 3.5 months.** Small
   absolute numbers, no obvious defect. Not worth engineering against.
2. **The money is in the 28 "too big" ones** — $1,000–3,500 catered events with 2 bookings to
   show. That is the SAME leak the 2026-08-29 marketing refresh already found (60+ band,
   ~$48k of parked Q4 pipeline) and the SAME thing the Zite event builder is being built to
   fix. No new work needed; it is already top of the queue.
3. **10 of 24 eligible kids inquiries never replied at all** — a first-touch question, and the
   WF1 first-touch redesign is already in flight (2026-09-01 ruling).

**Recommendation, recorded: stop here.** Fix A + the receipt block solve the stated problem.
**B (kids facts) and C (standalone email as a real template) are NOT worth their cost at
1–3 parties/month** — C in particular buys prominence on a link the receipt already carries,
at the price of a Postgres enum migration and a Render deploy. The one cheap option left on
the table is a **template-only hoist**: move the invitation block ABOVE the receipt table in
`fully-paid-confirmation.eta` for kids bookings and give it the artifact's stronger headline.
No migration, no new email type, one small PR. Optional.

**Also dropped (correcting an earlier recommendation in this session):** ungating the
`isDeposit` condition on the Avery payment-ack hub link. `Ack Context` requires
`ae.tprs_booking_id` to be set already, and `Avery Booking Writeback` runs in PARALLEL off the
same `Respond 200` — so on a fresh self-book it is still NULL at webhook time and the ack
cannot fire. For self-booked kids parties that change would be near-dead code.
