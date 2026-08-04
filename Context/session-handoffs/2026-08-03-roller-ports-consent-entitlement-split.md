# 2026-08-03/04 — Roller→TPRS port planning + the consent-entitlement split

Two-day, cross-repo session (Website · tprs · Loyalty · prod DB · n8n · Zite vendor). Started as
"double-check the Summer Pin Pass game plan," ended having found and fixed a live consent bug and
shipped a three-layer consent overhaul. Read this before touching: the Pin Pass / Jingle Bowl
builds, `loyalty_segment_predicate` or the windowed-program engine, the FKB signup form, or the
Zite kiosk consent flow.

---

## Thread 1 — Roller → TPRS ports (planning; nothing sells yet)

**Docs of record (committed):**
- `tprs/docs/RUNBOOK-summer-pin-pass-tprs-setup.md` — the SALE side
- `tprs/docs/RUNBOOK-jingle-bowl-tprs-setup.md` — full 2025 as-built capture, both rooms
- `Loyalty/docs/summer-pin-pass-2027-plan.md` — the PROGRAM side (pre-existing, now corrected + committed)
- Memory: [[roller-to-tprs-event-ports]] (triage rule + conventions), [[summer-pin-pass-2027-plan]]

**Decisions (Jon):**
1. **Pin Pass sells via direct Stripe** (Option A), NOT the TPRS checkout — one-off payment, no
   date/lane/capacity, nothing for the engine to enforce. Kills the no-date-wizard-mode work.
   Note TPRS *is* Stripe (live keys since 6/06) — "use Stripe" never distinguished the rails.
2. **Jingle Bowl stays in TPRS** — it consumes finite lanes on a fixed morning; a Payment Link
   can't stop 25 lanes selling on a 17-lane floor. It's the NYE pattern: config only, zero code.
3. **Jingle Bowl runs Dec 2026** (exact date TBD — gates only `sales_start_at` + the `added`
   override; build everything else now). Both rooms' sales open the SAME day (2025's stagger retired).
4. Roller's shared-copy bug does not repeat: per-room forms + terms (2025's VIP product told
   buyers "not valid in our VIP Suite").

**Built in prod TPRS (all attached to ZERO products — inert until a `product_forms` row):**
| Form | id |
|---|---|
| Summer Pin Pass 2027 (9 acks + intro) | `fd98b0f0-cc69-4ab7-814b-d69bc380abd4` |
| Jingle Bowl - Traditional Lanes '26 (5 acks) | `cff200fb-b5e5-4c32-bb1c-4caaa4ba6218` |
| Jingle Bowl - VIP Lanes '26 (5 acks) | `74f2d8b0-366e-45cb-8a05-ec4dd0db0bc7` |

Per-year forms, clone-never-edit (`booking_form_answers` FKs to `form_fields`). Under Option A the
Pin Pass form won't render at checkout — it's the canonical ack wording to reproduce on the lander.

**⏰ The only hard deadline anywhere: pull both Jingle Bowl Santa images off
`cdn.rollerdigital.com` before Roller dies (~Sep 1).** Everything else in the capture is retypeable
text. Roller must survive to Sep 1 for Pin Pass front-desk verification; export the final Members
CSV at season end (note: the Roller customer export has `AcceptMarketingSMS=False` on ALL 7,846
rows — it is NOT a spring SMS list; reaching 2026 buyers requires matching against loyalty records
with their own consent).

---

## Thread 2 — The consent-entitlement split (the incident)

**Jon's ruling (2026-08-03, the organizing principle):** marketing consent governs OUTBOUND
MESSAGING ONLY. Never the kiosk, points, redemption, or anything purchased/earned. STOP means
"stop texting me," not "forfeit what you have." Test: *is anything leaving our system?*

**What a 15-agent audit found:** `loyalty_segment_predicate` seeds EVERY predicate with the SMS
send-hygiene floor (written for blasts, 5/31). Two grant-minting paths that send nothing inherited
it → **810 of ~3,317 tagged FKB members received zero daily grants all season**, and
`grant_windowed_today` told staff `"not_enrolled"` for enrolled guests. Silent both ways (the cron
reports granted-count only, never skipped).

**Severity — CORRECTED after Jon pushed back (important):** of the 810, all were Patch bulk-import
residue; only ONE ever visited during program hours; only ONE native registrant was broken (by
`sms_bounced` — a landline, not a choice). The mechanism was real, the harm was ~1 person. The
front desk's silence was correct evidence. Method lesson recorded in the memory: verify impact as
hard as mechanism (I used wrong proxies twice — any-hour visits, import-tag-as-provenance).
The fix still mattered: the Pin Pass rides this exact engine at $159.95/head.

**Shipped (all live + verified):**
1. **`Loyalty/db/062`** — `p_require_messaging_consent boolean DEFAULT true` on the predicate;
   the two mint paths pass `false`. DEFAULT true is LOAD-BEARING (consent enforcement for sends
   lives inside this function; send rails don't re-check). Entitlement mode keeps
   `do_not_market = false` — the pre-flight's key catch: `reactivate_on_visit()` clears dnm on
   kiosk check-in, so a granted card could silently resurrect marketing. Also: COALESCE fail-closed
   on NULL, unbounded-segment guard, ACL/owner/SECURITY-DEFINER preservation with in-txn
   assertions. Rollback = replay `ops_snapshot.fn_backup` label
   `segment-predicate-consent-split-2026-08-03` (KEEP that table). Verified 8/4 first mint:
   3,318 granted, the 810 recovered, 0 messages, all cron ticks green.
2. **`Loyalty/db/063`** — `customer.has_explicit_sms_optout` (opt_out event newer than newest
   opt_in) for the Zite kiosk: STOP-senders no longer re-prompted for consent at the kiosk
   (silent skip, consent:false), while the ~32.5k never-asked imports STILL get prompted
   (deliberate — the kiosk is where their real consent gets earned). Zite published; checked
   BEFORE `sms_marketing_opt_in` so opt-out wins the merge edge case. **Live-tested end-to-end on
   Jon's record** (RPC opt_out → kiosk skipped consent, offers intact → RPC opt_in revert).
3. **Website `beb968b`** — `/free-kids-bowling` form: consent checkbox optional (real value sent),
   landline hard-stop → non-blocking amber warning, success panel self-adjusts when no text will
   arrive. Covers live form + Aug-15 waitlist branch + 2027 relaunch. n8n needed zero changes
   (Enroll Member always unconditional; validator verified — consent derived, never required).
   **Sequencing was load-bearing: 062 first, form second** — the required checkbox had been
   accidentally shielding the predicate bug.
4. **Zite build brief corrected** — "(required for offer grant)" retracted in both places; Zite
   confirmed they never implemented it and the DB never did (`intake_form_submission` grants on
   offer-slug presence alone; its consent branch only writes the consent_event).

**Memory of record: [[consent-must-not-gate-entitlements]]** — full mechanics, the two deliberate
exceptions (TPRS $10 opt-in reward; patch-import dnm quarantine), STOP-keyword handling (loyalty
first-word vs Avery whole-message, measured + deliberate — don't "unify"), and every correction.

---

## Open items

| Item | When |
|---|---|
| **Transactional audit** (what `do_not_market` wrongly suppresses — likely unsent payment reminders; `transactional_sms_sendable` exists with ZERO callers) | Jon's call; workflow died with the session, resumes from cache (`resumeFromRunId: wf_6cb09b22-e39`) |
| Jingle Bowl Santa images off Roller CDN | **before ~Sep 1** |
| Jingle Bowl 2026 date → fills `sales_start_at` + override; promo-bar slot needed (Nov is Holiday-Parties + NYE) | when ops sets it |
| Pin Pass: CPA question (pass tax category + deferred-revenue GL), lander + Stripe Checkout + **sale→tag reconciliation (§4b — the real risk)** | ~Feb 2027 |
| Roller Members CSV export | season end (Aug 31) |
| Backlog: `merge_customer` permissive consent OR-merge (TCPA-adjacent send risk) · `EXECUTE` granted to PUBLIC/anon on sensitive fns · non-customer STOP hole (`record_sms_consent` no-ops, loyalty rail would still confirm) | unscheduled |
