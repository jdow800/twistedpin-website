# Lane Rebook Campaign — Runbook

**Built 2026-07-27, ARMED-BUT-DARK.** The evergreen fast nudge from the 2026-07-19 rebook spec
(Part B, as amended by the 2026-07-27 update block): attended, non-refunded lane booking →
21–56 days later → **50% off ONE lane** (either type), single-use code, **10-day book-by window**,
sent from the **loyalty number (+1 779-234-4062)** via the `scheduled_message` rail.
Only to guests with `sms_marketing_opt_in = true`. No Visit-Feedback sentiment gate.

- n8n workflow: **`WF-Lane-Rebook-Campaign`** (`SRMB0xdrcKmZuigE`), daily 11:30 CT, currently **inactive**
- Measurement: [`measurement.sql`](measurement.sql) (holdout comparison = query 3)
- Spec of record: `Context/session-handoffs/2026-07-19-avery-rebook-campaign-spec.md`
- Consent ground truth: `Context/consent-surface-map.md`

## How it works (one daily run, three chains)

1. **Campaign Config** (Code node) — `ARMED` master switch + every knob + the SMS copy. `ARMED=false`
   returns zero items, halting everything.
2. **Reconcile Log Status** — syncs `avery_campaign_log` rows (`queued` → `sent`/`failed`/`skipped`)
   from what the rail actually did. The rail is delivery truth; the log is the campaign ledger.
3. **Offer chain**: eligibility query → daily slice (`daily_cap`, oldest visit first) → deterministic
   holdout split (phone-hash bucket, `holdout_pct`) → ONE mint call to TPRS
   `POST /api/avery/coupons` (`generate_count` = send-arm size → one parent discount **per daily
   cohort**, named `Lane Rebook YYYY-MM-DD`, so `/admin/discounts` + `v_campaign_results` show
   per-cohort rows) → per-guest ledger rows (`LR-<invoice>` offers, `LRH-<invoice>` holdouts) →
   `scheduled_message` inserts. `cron_flush_due_messages()` drains within ~5 min;
   **WF-Loyalty-Send re-checks consent at send time** (opt-in, do_not_market, bounced, 14-day cap).
4. **Reminder chain**: offers expiring in 1–2 days, unredeemed, guest hasn't rebooked, still
   `marketing_sms_sendable()` → T-2 reminder (`LR-<invoice>-R`), `cap_exempt=true` (the offer 8 days
   earlier would otherwise trip the rail's 14-day frequency cap; cap_exempt never bypasses consent).

Everything is idempotent: `log_id` and `idempotency_key` are unique; re-runs no-op. A failed mint
aborts **before** any write. Codes minted then orphaned by a later-step failure are harmless
(single-use, never distributed).

## The SMS carries a magic link (built 2026-07-30, supersedes the typed-code plan)

`twistedpin.com/book/<CODE>` 302s to `/reserve/?code=<CODE>` (vercel.json); the wizard pre-fills
the coupon, shows a "code is ready" note until checkout, and auto-previews the dollar drop at the
payment step (Website `b48b76a`). An invalid/stale link-landed code shows its reason once and
clears itself. The URL itself carries the code, so a guest reading the text aloud still has
everything they need. Redemption timing unchanged — preview only; nothing redeems until pay.

**Discount basis (tprs PR #54, 2026-07-30):** every lane product is a carve_out package (lane time
+ 4 shoe rentals), and the engine originally discounted only the lane-time remainder — a $99.95
lane showed −$38.08, not −$49.98. PR #54 makes a rule scoped to a package cover the package's full
sticker, with `max_discounted_quantity` counting PACKAGES. Do not arm the campaign before that PR
is deployed, or the SMS's "50% off" under-delivers at checkout.

## Hard guardrails (all implemented in the eligibility query — do not relax)

- **Checks `sms_marketing_opt_in` AND `do_not_market` AND `sms_bounced` itself.** Visit Feedback's
  predicates deliberately skip marketing consent (it's transactional) — they were NOT copied.
- **Newest-explicit-decision rule**: if the most recent SMS consent event on the *phone* (across all
  customer rows sharing it) is an opt-out, no send — a STOP that landed on a different customer row
  sharing the number still wins.
- **Drip, never blast**: `daily_cap` (default 15) bounds each day's entries; the backlog drains
  oldest-first and anything older than `max_days` (56) ages out silently.
- **Per-guest dedupe**: one campaign entry per phone per 365 days (holdout counts as the entry);
  skip if rebooked since the visit (incl. an upcoming reservation); skip inside an open code window
  (the 365-day rule subsumes it); < 2 loyalty-rail marketing sends in the last 365 days; 14-day
  outbound pre-check; never over an active Avery conversation (14-day recency); never when
  human-paused.
- **Holdout always**: ~15% of each daily slice, deterministic on phone hash, logged (`LRH-*`) and
  measured, never sent.

## Arming ritual (Jon)

Dark today by THREE independent layers: workflow inactive · `ARMED=false` · the eligibility query
returns 0 while the `do_not_market` park/quarantine holds (dry-run 2026-07-27: 88 in window → 20
opted-in → 0 addressable).

0. Confirm tprs PR #54 (package discount basis) is merged + deployed to Render — without it the
   50% computes on the lane-time carve-out, not the sticker price.
1. Approve the SMS copy (in Campaign Config; drafts also in the session handoff). Current drafts
   use the `twistedpin.com/book/{code}` magic link.
2. Optional dress rehearsal: set `TEST_MODE=true` (only Jon's cell eligible, no holdout), activate,
   run once, confirm the text arrives from +1 779-234-4062 with a working code, then `TEST_MODE=false`.
   (Jon's own INV-2026-00287 booking makes him genuinely eligible ~3 weeks after his 7/27 visit,
   provided his row is opted-in and not parked.)
3. Lift the park/quarantine for whatever slice you want addressable (owner decision, separate step).
4. Set `ARMED = true` in Campaign Config **and** activate the workflow. Two deliberate flips.
5. Watch week one: `measurement.sql` query 6 (STOP rate) and query 1 (funnel). Kill switch =
   deactivate the workflow (or `ARMED=false`); in-flight queued messages can be killed with
   `UPDATE scheduled_message SET status='skipped', skip_reason='killed' WHERE status='queued'`.

## Knobs (all in Campaign Config)

| Knob | Default | Meaning |
|---|---|---|
| `min_days` / `max_days` | 21 / 56 | offer window after the attended visit; >56d ages out |
| `daily_cap` | 15 | max guests entered per day (send + holdout from the same slice) |
| `holdout_pct` | 15 | no-offer measurement slice |
| `book_by_days` | 10 | code expiry — gates the **checkout** date, not the visit date |
| `reminder_enabled` | true | T-2 pre-expiry reminder |
| `discount_value` | 0.5 | 50%, communicated as 50% (Jon 2026-07-27, locked) |

`usage_end` is set to just past midnight CT after the book-by day, so "Book by Fri Aug 14" holds
through Friday evening.

## Known limits / future hardening

- If a run dies between ledger insert and enqueue, that guest stays `queued` in the ledger with no
  `scheduled_message` (visible in measurement query 1; fix by hand or wait for the row to age out).
- Season gate (defer Jun–Aug sends to Sept) deliberately NOT built for this arm: Jon's locked offer
  is "shortly after their reservation" — arming date is the season decision. The anniversary nudge
  and Part A (both out of scope here, offers still unapproved) are where the season gate belongs.
- Anniversary nudge + Part A "The Return" are NOT built — offers explicitly rejected 2026-07-20
  ("don't love these, we will revisit"); re-design with Jon before the late-Aug build.
