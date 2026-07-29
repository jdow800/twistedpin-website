# Loyalty Automation — Enable Runbook

> Everything below is **built but OFF**. This is the plan for turning the loyalty lifecycle
> automations on **safely, one deliberate flip at a time**. Companion to
> `loyalty-go-live-checklist.md`. Last updated 2026-07-28.

The whole point: Day 1 of loyalty must **not** blast the imported base. Two structural
safeties (below) make enabling a series of small, metered flips instead of a firehose.

---

## Safety infrastructure now in place (nothing sends without passing these)

| Migration | What it does |
|---|---|
| **067** quiet hours | Marketing (`cap_exempt=false`) sends are held to **11am–6pm America/Chicago** (DST-safe). Off-hours → next 11am. |
| **069** daily cap | **1 automated loyalty msg per customer per calendar day.** A 2nd that day is **dropped, not queued** (`freq_cap_1_per_day`). Welcomes + manual blasts exempt. Avery is a separate rail/number entirely — structurally exempt. |
| **070** priority | Adds **`priority`** so the runner enqueues best-first → the higher-value message wins a same-day cap collision. (Its cap_exempt change was reverted by 071 — see below.) |
| **071** un-overload `cap_exempt` | **Regression fix.** `cap_exempt` was ALREADY meaningful to the sender: WF-Loyalty-Send does `if (sm.cap_exempt !== true && capCount >= 1) skip('cap_exceeded')` where capCount = **`outbound_sent_count_14d`** — i.e. cap_exempt means *"exempt from a 1-per-**14-day** cap."* Every row historically was `true`, so that cap sat dormant. 070 flipped lifecycle to `false`, which would have silently armed a 14-day cap on exactly those messages (drip-10 fires ~14d after the welcome → would've been skipped `cap_exceeded`). 071 restores lifecycle to `cap_exempt=true` and moves OUR policy to a dedicated **`scheduled_message.daily_cap_exempt`** column + an `idempotency_key`-prefix discriminator. |

**How message classes are told apart (071)** — by `idempotency_key` prefix, NOT by cap_exempt:
| prefix | class | quiet hours | 1/day cap | fills the day's slot |
|---|---|---|---|---|
| `lifecycle:%` | automated marketing | ✅ clamped | ✅ capped (unless `daily_cap_exempt`) | yes |
| `blast:%` | operator-scheduled blast | ✗ operator's chosen time is respected | ✗ never suppressed | **yes** |
| anything else | transactional / welcome | ✗ | ✗ | no |

**Traps for future maintainers:**
- **Do NOT repurpose `cap_exempt`** — it belongs to the sender's 14-day cap. Use `daily_cap_exempt`.
- A new automation with `bypass_daily_cap=true` escapes the 1/day cap. Only birthday should.
- New enqueue paths must use a `lifecycle:` idempotency-key prefix or they escape both policies.
- The lifecycle runner only substitutes `{{offer_expires}}` and `{{loyalty_points}}` **in SQL** —
  but the n8n sender renders `{{first_name}}`, `{{last_name}}`, `{{days_since_last_visit}}` and
  `{{offer_link:slug}}` at send time. Audited 2026-07-28: every live template is safe.

---

## The enable sequence (flip order)

**Pre-flight (once):** STOP/START verified on the loyalty number ✅ · quiet hours + cap live ✅.
**Discipline:** before each flip, **dry-run the first-run count** (like we did) so you know the
one-time catch-up size, not just the steady-state.

1. **`birthday`** — priority 10, `bypass_daily_cap=true` (a blast can never eat someone's
   once-a-year message). **First enable ≈ 288** (birthdays in the next 7 days), then **~34/day**.
   $30 gift. **Ungated on purpose** — hits the dormant base too, because a lapsed guest's
   birthday is the best winback moment. Patch-validated economics: 2.4% redemption, 0.4% opt-out,
   roughly self-funding ($525 revenue / 30d).
2. **Coupon drips** (`drip-10-reminder` → `drip-20-escalate` → `drip-20-reminder`, + the two
   `*-suppress` terminators). Fire only on **unredeemed** coupons + **not-visited-since-join**,
   so they never nag someone who used it or came in. Small, grows with signups.
3. **Winbacks** (`winback-50-*`, `winback-330-*`). First-run **68 + 20**, then ~8/day. Enable on
   a morning you can watch the first Thursday wave (`run_days=[4]`).
4. **Later:** `points-expiry-warn-15mo/17mo` — bounded to the 450–548-day-lapsed window; enable
   once the base is warm.

**Deferred (needs design):** the smart reward notification + the post-visit review ask (below).

---

## Per-automation reference

| slug | priority | bypass cap | fires to | volume |
|---|---|---|---|---|
| birthday | 10 | ✅ yes | birthday in next 7d | 288 first, ~34/day |
| winback-50-initial/reminder | 20 | no | ~49–56d lapsed | 68 first, ~8/day |
| winback-330-initial/reminder | 20 | no | ~329–336d lapsed | 20 first |
| drip-10-reminder / drip-20-* | 30 | no | unredeemed coupon + not visited | trickle |
| points-expiry-warn-15/17mo | 40 | no | 450–548d lapsed w/ points | bounded |
| dormancy-suppress / drip-52-suppress | — | no | silent do-not-market state changes, no SMS | — |

---

## Retired: the per-tier reward trio (replaced by the smart build)

`reward-alert`, `reward-milestone-100`, `reward-milestone-200` are **neutered** (disabled +
zero-match segment + `[RETIRED]` name) because they double-text a high-balance guest (≥50 → alert,
≥100 → $10, ≥200 → $20, all at once) and `reward-alert` would blast **2,922** dormant members.
Original copy kept here for the smart build:
- reward-alert (≥50): *"Twisted Pin: {{first_name}}, you have {{loyalty_points}} points - enough for a reward! Show your phone at the front desk to redeem"*
- milestone-100 (≥100): *"Nice work @ Twisted Pin! You've earned a $10 reward - redeem it anytime at the kiosk."*
- milestone-200 (≥200): *"You're on a roll @ Twisted Pin! You've earned a $20 reward - redeem it at the kiosk."*

### Smart "coolest reward unlocked" — design spec (to build)
One notification that replaces the trio. Requirements:
1. **Reward ladder defined first** (Jon) — the tiers, what each reward *is*, ranked by coolness.
   This is also the ladder-reframe (cash $10/$20 → free-unit rewards) already on the roadmap.
2. Reads the guest's `point_balance`, picks the **highest/coolest reward they now qualify for**,
   sends **one** message showing that best reward.
3. **Only re-fires when they reach a NEW top tier.** Needs a per-customer "last-notified-tier"
   state (column or tag) that **resets on redemption** — otherwise a guest who redeems (balance
   drops) and re-earns never gets notified again.
4. **Active-gated** (`last_visit_at >= cutover`) so it never hits the ~2,900 dormant high-balance
   members. `last_visit_at` is reliably maintained by the behavior-stats trigger.
5. Pairs with the post-visit review ask as one coordinated "after your visit" touch; both ride the
   loyalty rail under the 1/day cap.

---

## Opt-out disclosure policy (migration 072, 2026-07-29)

**Not on every message** — that's over-strict and isn't required. The standard (CTIA / carrier codes)
is *opt-out at opt-in, plus periodically*. Implemented as: the trigger appends
`"\nReply STOP to opt out"` to a **lifecycle** message only when the customer has **not received a
message from this number in the last 90 days** (which includes never), and only when the body doesn't
already say STOP (so no doubles).

Why it matters here specifically: **only 23 of 18,358 marketable contacts had ever received a text
from 779-234-4062.** The prior disclosure went out from *Patch's* number, so for this list the first
send from this number is functionally a first contact. Self-tapers — birthday (yearly) and winbacks
(50/330-day bands) always carry it; a guest inside the drip ladder gets it on day 14, not day 31.

**Scope:** lifecycle only. Blasts are operator-composed with a visible segment count — include the
line in blast copy yourself. Welcomes carry it in their own template (below).

**Welcome copy:**
- `/coupon` welcome — already carried "Reply STOP to opt out" (154 chars, 1 seg). Unchanged.
- kids welcome — **updated 2026-07-29** in n8n `WF-Loyalty-Forms-Intake` → `Validate & Normalize`
  (full-node replace; never find/replace that node, it contains `$10`/`$input`/`$json`):
  > You're in! Free bowling @ Twisted Pin - ends Aug 14 / Enter your phone # at our kiosk. /
  > Share w/ a friend! twistedpin.com/free / Reply STOP to opt out

  147 chars, 1 segment. Two trims bought the room: *"ends August 14th"→"ends Aug 14"* and dropping
  *"when you visit"*.

**Copy edits so every template holds 1 segment WITH the appended line** (all verified via
`gsm_segments()` with `{{offer_expires}}` rendered):
| slug | change | chars w/ STOP |
|---|---|---|
| `winback-330-initial` | dropped "Come back for a" + "Details:" | 146 → 1 seg |
| `drip-20-escalate` | "Your offer is now" → "Now" | 148 → 1 seg |
| `winback-50-initial` | dropped "Full details: " | 142 → 1 seg |
| all others | unchanged | 131–145 → 1 seg |

**Verified behaviour:** cold contact → appended · contacted 10d ago → not appended · template that
already says STOP → exactly one, no double.

## Pre-launch audit results (2026-07-28)

Checked and **CLEAR**: all referenced offers exist + are `active` · no template contains a variable
its send path can't render · STOP→opt-out verified end-to-end on a real text (flag flipped 8:04pm) ·
lifecycle enqueue → clamp → cap → queue verified by regression test.

**FOUND + FIXED:** the 070 `cap_exempt` regression (see 071 above).

**FOUND, not blocking — points expire with no warning.** `expire_stale_points()` runs nightly
(pg_cron `loyalty-expire-points`, 9 UTC) and zeroes `point_balance` for anyone whose `last_visit_at`
is >18 months old. Tonight that's only **3 people / 250 pts**, but **475 more sit in the 15–18-month
warning window** and both `points-expiry-warn-15mo/17mo` automations are **OFF** — so those guests
will silently lose points over the coming months with no heads-up. Enable the warnings before that
cohort ages out, or accept silent expiry. (473 customers hold points with `last_visit_at IS NULL`;
they're immune — the function requires a non-null last visit.)

## Deliverability + resilience (2026-07-29)

**What was already built and working** (discovered, not added): SignalWire StatusCallback →
`record_delivery_status` captures every delivery receipt (43 sent → 43 delivered, 100%). Hard-bounce
error codes (30005/30006/21211/21614) auto-set `sms_bounced`; **21610 (carrier-level STOP) auto-flips
`sms_marketing_opt_in=false` AND writes a `consent_event`** — so opt-outs we never saw inbound still
reconcile. Twilio Lookup pre-validated 18,190 numbers as mobile. The plumbing was excellent; the
*instrumentation* was zero — nothing surfaced any of it.

- **074 — `reap_stuck_sending()`**, pg_cron `loyalty-reap-stuck` every 10 min. Fixes messages
  stranded in `sending` when n8n dies mid-batch. **The safety hinge is the SID, not the age:**
  stuck row *with* a `signalwire_message_sid` → the text WAS delivered, only bookkeeping failed →
  marked `sent` (requeueing would double-text a real guest); stuck row *without* a SID → never
  reached the carrier → requeued, with `send_attempts` capped at 3 then parked as `failed`.
  **A naive age-only reaper double-texts. Never write one.**
- **075 — `loyalty_daily_report()`** returns sends-by-automation, delivery rate, opt-outs, bounces,
  skips by reason, stuck count, queue depth, growth, and which automations are enabled.
- **n8n `WF-Loyalty-Daily-Report` (`Dy1Cx2yRgxcoLD2L`)** — 10:00am Central daily → emails
  jon@twistedpin.com (Gmail cred `ogWzToDGEu9TIHss`). Subject line self-summarizes
  ("delivery 100%, 1 opt-outs") and switches to `CHECK: …` when stuck/failed/opt-out-spike/0-delivered.
  10am is deliberate — read yesterday's numbers **before** the 11am lifecycle run.
  ⚠️ **Created INACTIVE — activate it in the n8n UI** (no API activation). Validated 0 errors.
  Also doubles as the out-of-band channel that fixes "the health alarm is delivered through the
  queue it monitors" — it's Gmail, not `scheduled_message`.

## Open threads
- **Unread inbound texts to the loyalty number, sitting in Zite Admin** — guests replying to the
  loyalty number; need a plan for who reads/handles them (parked 2026-07-28, Jon to scope).
- **Smart reward notification** — blocked on the reward ladder definition.
- **Post-visit review ask** — the parked ~2hr-after-visit review text; build dormant, coordinate
  with the smart reward.
