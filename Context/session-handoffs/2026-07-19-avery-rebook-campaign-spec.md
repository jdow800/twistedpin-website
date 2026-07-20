# Avery Rebook Campaign — Build Spec & Handoff

**Written 2026-07-19. Purpose: a self-contained brief for the session that BUILDS the
Avery-driven rebook marketing engine for online (TPRS) bookings.** Everything below was
established across the 2026-07-19 marathon session (loyalty cutover + rebook-lever design).
Memory files: `loyalty-rebook-lever`, `loyalty-patch-cutover-plan`. Read this doc first;
memory corroborates.

---

## 1. The thesis (validated, not hypothesized)

Reservation guests are the premium segment and they do not rebook on their own:

- **~87-88% of online bookers never book again** (consistent across 3 measurements:
  Roller customer-level 87.4%, phone-grouped 85.7%, booking-level 87.9% over 6,008 paid
  bookings Sep 2023–May 2026).
- **Repeaters are worth 2.7×** (lifetime $572 vs $212 one-off; booking avg $233, and the
  lane fee understates the night — F&B/arcade ride on top).
- **Rebook cadence is TRI-MODAL** (measured, n=840 gaps): hot cluster 0–30d (16%),
  mid smear 31–180d, **dominant annual mode 271–548d (32%, biggest bucket 271–365)**.
- **Seasonality is dramatic:** Nov–Mar is the season (Jan 971 bookings vs Jul 160, 6:1).
  Repeat bookings ride the same curve.
- Jon's framing: this is a PLANNED GROUP NIGHT, not impulse. The blocker is organizer
  initiative, not price. The offer's job = give the organizer a reason + a DEADLINE.
  Baseline is ~zero, so aggression on aged cohorts is nearly free (cannibalization risk
  concentrates only in the fresh/annual-mode cohort).

## 2. Channel doctrine (locked)

- **All rebook messaging comes from AVERY** (her number, existing Missive threads) — NOT
  the loyalty blast rail. Booking guests already know Avery (booking confirmations, Visit
  Feedback). Replies land where Avery can converse AND close the booking (Avery×TPRS
  booking pipeline live since 2026-07-04).
- Loyalty number = walk-in ecosystem (points/kiosk). Avery = booking ecosystem. Data
  bridges (shared `customers` row); messaging never crosses.
- Codes redeem ONLY at /reserve checkout → structurally keeps bookers in the online
  booking eco-cycle (Jon: "not turn them into a walk-in guest").

## 3. What already EXISTS (verified in code 2026-07-19 — build NOTHING here)

- **`POST /api/avery/coupons`** (tprs server.ts ~L3068, ADR-0028 §4 "Avery-spawn",
  X-API-Key gated, audited): mints a `discounts` rule + either one shared code (marketing)
  or `generate_count` unique single-use codes (loyalty). Params: name, discount_type
  (fixed_amount|percentage), value, product_scope (all|specific + product_ids),
  usage_start/usage_end, max_discount_cents, max_uses. Returns code strings.
- **Discount engine** (`services/discounts.ts`): max_uses enforced (`exhausted` /
  `already_redeemed`), **per_customer_limit matches normalized email+phone = guest
  locking**, expiry via usage window, product scoping via `discount_products`.
- **Checkout**: `couponCode` live on `/api/checkout/*` incl. **`coupon-preview`** (guest
  sees the discount before paying); redemption commits inside the convert transaction;
  `discount_redemption` rows carry customer_id + booking_id + discount_amount_cents.
- **Admin** `/admin/discounts`: full lifecycle UI, shows per-discount code + redemption
  counts (= free per-arm A/B dashboard).
- **Avery Visit Feedback** (n8n `Avery - Visit Feedback`, TtRzMtdpMR6dsfw4, live since
  7/6 w/ per-customer dedupe): post-booking "how was it" texts + sentiment; its reply flow
  already contains a rebook-seed. **This is the GATE for the fast nudge.**
- **Measurement**: `v_campaign_results` view (migration 064) aggregates per-discount
  redemptions + discount dollars; `v_program_health` / `v_visits` count booking-visits.
- Booking data: `bookings` (status enum incl. completed/fully_paid/deposit_paid;
  block_kind NULL = real guest booking) + `booking_dates` (event_date, status active).

## 4. The design (research-calibrated; deep-research run wf_2244dc90-26c)

Research meta-finding: ALL published win-back benchmarks are unattributable vendor fiction
(14/14 refuted 0-3 in adversarial verification) → **every cohort keeps a random NO-OFFER
HOLDOUT; the campaign is self-benchmarking.** What survived (peer-reviewed): bimodal
redemption w/ pre-expiry regret spike (Inman & McAlister 1994) → send a reminder ~T-2
days; expiry length is a profitability lever, leaders profit from SHORT windows (Krishna
& Zhang 1999); dollar-framing beats % above $100 (rule of 100 — never say "50% off" a
$233 booking); free-unit/upgrade frames beat equivalent cash at moderate magnitudes,
flipping to cash at large magnitudes (mental accounting); habituation is real only under
SUSTAINED promotion (Mela 1997/98) → keep touches rare + unpredictable.

### Part B — evergreen nudges (the build)

**Fast bounce-back** (Jon's spec, research-converged):
- Trigger: ~3 weeks after an attended booking, **gated on POSITIVE Visit Feedback
  sentiment** (pre-qualified; aggressive offer only reaches people who said they had fun).
- Offer: **"Second hour on us"** (≡ Jon's 50%-off-2hr instinct, winning frame). Implement:
  fixed_amount = 1-hour price scoped to 2-hour lane products (or 50% w/ max_discount cap —
  decide at build; NEVER communicate as a percentage).
- Window: **~10-day BOOK-BY** (expiry gates the checkout date, NOT the visit date — frame
  as "lock it in by Fri the 14th"; the visit can be any future slot).
- **T-2 days: Avery reminder with live availability** ("code's up Friday — Sat 7pm has
  lanes, want it?") — harvests the second redemption mode; Avery-only capability.
- Season gate: nudges whose send-date lands Jun–Aug defer to early September.
- Group-aware copy from the booking's guest_count.

**Anniversary nudge**: ~10.5 months after booking (front-runs the dominant annual mode),
**$50-style dollar credit** (cold cohort: cash frame appropriate at magnitude + habituation
moot), code + deadline + T-2 reminder. Same season gate logic (annual mode largely
self-aligns with the season).

**Hard rules**: ≤2-3 marketing touches per guest per year · never predictable cadence ·
holdout slice always · per-guest dedupe (never re-nudge someone who rebooked or is inside
an open code window).

### Part A — "The Return" (one-time, mid-September)

- Audience: **2,508 textable one-off Roller bookers** (identify: `patch_import_staging`
  roller_bookings=1 joined to consented, non-bounced customers). Requires quarantine
  LIFTED (post-cutover).
- Tiered by recency of only visit: 2026 one-offs 798 (hot) · 2025 1,602 · 2024 1,643 ·
  2023 436 (cold). ~4 A/B arms of ~600, aggression rising with cohort age, e.g.:
  second-hour-free / VIP-upgrade / $25 credit / $50 credit (final economics = Jon's call
  at build). Every arm: unique single-use codes + holdout slice.
- Timing: **mid-September, expiry through late November** — front-runs the Nov–Jan wave +
  holiday-party planning. August would be wasted (dead season).
- One parent discount per arm → admin shows per-arm redemptions natively.
- Sender: Avery's number (replies → Avery converses/closes; escalation = existing
  Needs Attention flow). Volume note: ~2,508 sends + a few hundred replies over days is
  within Avery's normal operating pattern; batch the sends.

## 5. Build checklist (the actual n8n/session work)

1. n8n campaign workflow(s), mirroring the Visit Feedback pattern (campaign log, dedupe,
   batched sends):
   - Daily query: attended bookings ~21d ago w/ positive feedback + no later booking +
     no open/recent code + season gate → mint via /api/avery/coupons (generate_count:1,
     usage_end +10d) → Avery text w/ code.
   - Daily query: bookings ~318d ago (10.5mo) w/ no later booking → anniversary variant.
   - T-2 reminder query: open codes expiring in 2 days, unredeemed → reminder w/ live
     availability (reuse Avery's TPRS availability capability).
   - Holdout: deterministic slice (e.g., customer_id hash bucket) logged to
     avery_campaign_log, excluded from sends, INCLUDED in measurement.
2. Part A one-time script/flow: build the 4-arm audience from staging + customers, mint
   per-arm parent discounts + codes, batch-send via Avery, log arms.
3. Copy: Avery-voice drafts for fast nudge, anniversary, reminder (Jon approves; no
   "discount/off/%"-led phrasing; brand voice rules apply).
4. Measurement: confirm arms appear in v_campaign_results + admin discounts; define the
   holdout-comparison query.
5. ~~TPRS PR: SMS marketing opt-in checkbox at checkout~~ **BUILT 2026-07-19, awaiting
   deploy.** Branches: tprs `feat/checkout-sms-marketing-consent` · Website
   `feat/checkout-marketing-optin`. **⚠️ DEPLOY tprs FIRST** — Website pushes to main
   auto-deploy, and the old backend drops `smsMarketingOptIn` (zod strips unknown keys),
   so shipping the box alone promises texts while recording only email.

   **Two corrections to what this doc originally said here:**
   - *"email (Resend) covers the gap meanwhile"* is **FALSE**. Measured 2026-07-19:
     TPRS checkout has generated **zero** marketing consent of EITHER kind. All 44 SMS
     and all 46 email opt-ins on the 195-booker base are sourced `csv_import_patch`
     (the other two SMS: Jon's own START test, and one web form). There was no email
     fallback to lean on — `marketingOptIn` existed in the payload schema but no UI
     ever set it, so the field was never sent. There was never a box.
   - The real urgency isn't the 23% rate, it's that **Patch is cancelled before Aug 15**
     and every consent on the booking base is inherited from it. After cancellation
     there is no consent intake for the booking ecosystem at all.

   Avery's existing booking/visit texts are unaffected either way — they ride the
   transactional disclosure already on the guest step, not marketing consent.

## 6. Open decisions (Jon)

- Final offer economics per arm (amounts, VIP-upgrade value, Part A tiering).
- Expiry A/B (research open question: ~2-3wk vs 5-6wk with reminder — could BE one of
  the Part A arms).
- Holdout size (power question vs 2,508 base; ~10-15% per arm is a sane default).
- ~~Green-light the TPRS SMS-consent PR.~~ Approved + built 2026-07-19; needs merge +
  ordered deploy (tprs → Website). See §5.5.
- Part B go-live date (natural: after Part A reads, ~Nov).

## 7. Sequencing constraints

- BLOCKED until: loyalty cutover complete + quarantine lifted (~Jul 27+).
- **The quarantine gates Part B too — not just Part A** (§4 attaches it only to Part A;
  that's wrong). The Patch import merged into existing TPRS booking customers, so it set
  `do_not_market=true` on them as well. Measured 2026-07-19 across the 195 TPRS bookers:
  **42 of the 44 SMS-consented are blocked by `import:quarantine`**, leaving an
  addressable base of **2 today, 44 after the lift**.
- **23 bookers carry `do_not_market=true` with `acquired_via='manual'` and NO quarantine
  tag** — a permanent exclusion the lift will not clear. Campaign queries must filter
  `do_not_market` themselves; the tag does not cover it, and Avery's n8n rail does not
  inherit the loyalty base-segment predicate that would.
- **Still unverified: does `Avery - Visit Feedback` (TtRzMtdpMR6dsfw4) check
  `do_not_market`?** It runs daily and the import put 66 booking customers into that state
  on Jul 19. If it doesn't check, the quarantine is already leaking through Avery's number
  — and it's the designated gate for the Part B fast arm. Cheap to rule out; do it first.
- Part A window: mid-September (build during late Aug).
- Nothing here touches the walk-in loyalty ecosystem (separate memory/doctrine).
