# Lane Rebook Campaign — Runbook

**Built 2026-07-27, ARMED-BUT-DARK. Cadence retimed 2026-07-30 per Jon.** The evergreen fast
nudge from the 2026-07-19 rebook spec (Part B, as amended by the 2026-07-27 update block):
attended, non-refunded lane booking → **~4 weeks later** (28–34d in the normal weekly-run case;
42d hard age-out — first touch never lands past 6 weeks, Jon 2026-07-30) → **50% off ONE lane**
(either type), single-use code via the `twistedpin.com/book/<CODE>` magic link, **14-day book-by
window**, sent from the **loyalty number (+1 779-234-4062)** via the `scheduled_message` rail.
Sends go out **Thursdays at 6pm CT** — family at dinner, planning the weekend. Only to guests
with `sms_marketing_opt_in = true`. No Visit-Feedback sentiment gate. Jon's 3yr baseline (80%
never rebook, ~0% rebook quickly) means redemptions ≈ pure lift; expect low single digits and
judge against the holdout, not against hopes.

- n8n workflow: **`WF-Lane-Rebook-Campaign`** (`SRMB0xdrcKmZuigE`), weekly Thursdays 6pm CT, currently **inactive**
- Measurement: [`measurement.sql`](measurement.sql) (holdout comparison = query 3). Day-to-day glance:
  **/admin/discounts** rolls the daily cohorts into one campaign row — Σ codes, Σ redemptions,
  redemption rate — with Expand for per-day rows (tprs PR #56)
- Spec of record: `Context/session-handoffs/2026-07-19-avery-rebook-campaign-spec.md`
- Consent ground truth: `Context/consent-surface-map.md`

## How it works (one weekly Thursday-6pm run, three chains)

1. **Campaign Config** (Code node) — `ARMED` master switch + every knob + the SMS copy. `ARMED=false`
   returns zero items, halting everything.
2. **Reconcile Log Status** — syncs `avery_campaign_log` rows (`queued` → `sent`/`failed`/`skipped`)
   from what the rail actually did. The rail is delivery truth; the log is the campaign ledger.
3. **Offer chain**: eligibility query (uncapped per Jon 2026-07-30; oldest visit first) →
   deterministic holdout split (phone-hash bucket, `holdout_pct`) → ONE mint call to TPRS
   `POST /api/avery/coupons` (`generate_count` = send-arm size → one parent discount **per run
   cohort**, named `Lane Rebook YYYY-MM-DD`, so `/admin/discounts` + `v_campaign_results` show
   per-cohort rows) → per-guest ledger rows (`LR-<invoice>` offers, `LRH-<invoice>` holdouts) →
   `scheduled_message` inserts. `cron_flush_due_messages()` drains within ~5 min;
   **WF-Loyalty-Send re-checks consent at send time** (opt-in, do_not_market, bounced, 14-day cap).
4. **Reminder chain**: offers expiring within 7 days (with the 14-day window that is the book-by
   Thursday itself — the **last Thursday prior to expiration**, 6pm, "expires tonight"), unredeemed,
   guest hasn't rebooked, still `marketing_sms_sendable()` → reminder (`LR-<invoice>-R`),
   `cap_exempt=true` (the offer 14 days earlier would otherwise trip the rail's 14-day frequency
   cap; cap_exempt never bypasses consent).

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

- **CHECKOUT OPT-INS ONLY (Jon 2026-07-30).** The audience is exclusively guests with a
  `consent_event(source='checkout', action='opt_in')` on their phone — i.e. they booked online and
  ticked the SMS box in our own /reserve checkout (the $10-reward flow, CTIA-evidenced). Patch
  import / kiosk / web-form consent does NOT qualify even though it is legally sendable. This
  excluded the 16 Patch-consent guests the 7/30 dry-run had surfaced.
- **Checks `sms_marketing_opt_in` AND `do_not_market` AND `sms_bounced` itself.** Visit Feedback's
  predicates deliberately skip marketing consent (it's transactional) — they were NOT copied.
- **Newest-explicit-decision rule**: if the most recent SMS consent event on the *phone* (across all
  customer rows sharing it) is an opt-out, no send — a STOP that landed on a different customer row
  sharing the number still wins.
- **No per-run cap** (Jon 2026-07-30 — expected volume is ~25–100/week and he wants every
  eligible guest reached). Pacing safety still exists at the rail: WF-Loyalty-Send drains 1
  message per ~4s and re-checks consent per message. The backlog drains oldest-first and anything
  older than `max_days` (42) ages out silently.
- **Per-VISIT re-entry, capped (Jon 2026-07-30)**: a guest who redeems and bowls again is
  re-armed — each new attended visit earns its own 4-week offer (the 2-visits/yr bowler becoming
  a 4-visits/yr one IS the campaign working). One entry per visit cycle (no visit is ever offered
  twice; holdout counts as the entry, and the deterministic phone-hash means holdout guests stay
  holdout across every cycle — a permanent control group), with a **max of 3 entries per phone
  per 365 days** as the backstop. This replaced the original one-entry-per-365d rule AND the
  generic <2-loyalty-sends budget (which would have starved repeat cycles once birthday/winback
  automations went live). Still enforced: skip if rebooked since the visit (incl. an upcoming
  reservation); 14-day outbound pre-check; never over an active Avery conversation (14-day
  recency); never when human-paused.
- **Holdout always**: ~15% of each daily slice, deterministic on phone hash, logged (`LRH-*`) and
  measured, never sent.

## Arming ritual (Jon)

**🟢 FULLY LIVE since 2026-08-01 (Jon's go): workflow ACTIVE + `ARMED=true` + `TEST_MODE=false`.**
No human step remains. Dry-run at go-live: 0 eligible (all gates, checkout scope) — so Thu Aug 6
and Aug 13 execute as zero-send runs (verify the Aug 6 execution succeeded in n8n), and **Thu Aug
20 6pm is the first real cohort** (earliest checkout opt-ins, visits 7/22+, cross day 28 ~Aug 19).
Audit the Aug 20 run next morning: ledger rows, "Lane Rebook 2026-08-20" rollup row in
/admin/discounts, delivery statuses, STOP rate (measurement.sql query 6). Kill switch = deactivate
the workflow or ARMED=false; TEST_MODE=true returns to allowlist-only rehearsal mode. The
2026-07-30 rail test (`lane-rebook-TESTFIRE-jon-2026-07-30`) sent the production offer template +
XS7G9BWS to Jon's cell via the real rail: rendered, sent, delivered (DLR).

**✅ RESOLVED 2026-07-30 — the checkout-optin park is gone.** Jon's ruling: the checkout SMS box
IS marketing consent. Trigger `trg_customers_park_checkout_optin` + function dropped; its 8 holds
released (all 13 checkout opt-in phones sendable; kill-switch + Patch-quarantine parks untouched).
Per Jon's explicit preference there is NO welcome/thanks text — the 4-week offer is the first
touch. The rail's `do_not_market` gate stays sacred (staff kill-switch).

**⚠️ Interplay note (2026-07-30, late):** the same day, the loyalty platform's proactive
automations went LIVE in a parallel workstream (birthday daily + Thursday winbacks, incl.
winback-50 targeting last visit 49–56d). So the "nothing else texts these guests" claim holds
only through the rebook window: a checkout guest who does NOT redeem can get the free-hour
winback ~7 weeks after their visit, ~2–3 weeks after the 50%-off offer expires. Read as an
escalation ladder (50% at 4wk → free hour at 7wk) this is arguably good sequencing — but it is
EMERGENT, not designed. If it should not happen, exclude open/recent lane_rebook entries from
the winback segments (loyalty side). A birthday text can also land at any point.

0. ~~Confirm tprs PR #54 (package discount basis) is merged + deployed~~ DONE 2026-07-30 — live
   on Render, verified via coupon-preview (50% of full sticker on all four lane products).
1. SMS copy: **offer + reminder APPROVED (Jon 2026-07-30**, headline-first, 2 segments OK, no "on
   us" phrasing — implied a free visit). Both use the `twistedpin.com/book/{code}` magic link and
   end with **"Questions? Just reply."** (Jon 2026-07-30: route questions to the loyalty inbox,
   not staff) — monitored via **Zite admin**, which surfaces loyalty-number inbound and emails
   Jon at least daily on unread messages (Jon's call; the auto-ack + info@ email loop built
   earlier that evening was REVERTED as redundant — WF-Loyalty-Inbound is back to its original
   shape: keywords handled, non-keyword replies stored + visible in Zite, no auto-reply). Two
   small trims ("lane" for "lane reservation", "any date" for "for any available date") keep the
   questions line inside 2 GSM-7 segments for long first names.
2. Optional dress rehearsal: set `TEST_MODE=true` (only Jon's cell eligible, no holdout), activate,
   run once, confirm the text arrives from +1 779-234-4062 with a working code, then `TEST_MODE=false`.
   (Jon's own INV-2026-00287 booking makes him genuinely eligible ~3 weeks after his 7/27 visit,
   provided his row is opted-in and not parked.)
3. ~~Resolve the checkout-optin park trigger~~ DONE 2026-07-30 — trigger dropped, holds released,
   all 13 audience phones sendable.
4. Set `ARMED = true` in Campaign Config **and** activate the workflow. Two deliberate flips.
5. Watch week one: `measurement.sql` query 6 (STOP rate) and query 1 (funnel). Kill switch =
   deactivate the workflow (or `ARMED=false`); in-flight queued messages can be killed with
   `UPDATE scheduled_message SET status='skipped', skip_reason='killed' WHERE status='queued'`.

## Knobs (all in Campaign Config)

| Knob | Default | Meaning |
|---|---|---|
| `min_days` / `max_days` | 28 / 42 | first touch 28–34d after the visit in practice (first Thursday past day 28); 42d = hard ceiling so a temporarily-blocked guest never gets a stale offer |
| `holdout_pct` | 15 | no-offer measurement slice |
| `book_by_days` | 14 | code expiry (2 weeks, Jon 2026-07-30) — gates the **checkout** date, not the visit date |
| `reminder_enabled` | true | final-Thursday 6pm reminder (fires on the book-by day — "expires tonight") |
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
