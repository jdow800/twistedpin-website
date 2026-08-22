# Staged n8n edits — approved 2026-08-21 · ✅ APPLIED + VERIFIED 2026-08-21 evening

Jon approved this build 2026-08-21. Application is **blocked on the n8n MCP dashboard
config** (server responds `not_configured` — the instance API URL + key dropped off
dashboard.n8n-mcp.com sometime after 2026-08-15, when reads still worked). Once the
instance is re-added, apply these edits to **WF-Lane-Rebook-Campaign
(`SRMB0xdrcKmZuigE`)** exactly as written, then run the verification section.

**Deadline: before Thu Aug 27 6pm CT** (2-guest dress-rehearsal run — we want the new
offer copy proven on 2 people before the 45-guest Sep 3 cohort). Hard deadline for the
reminder items: **Thu Sep 3 6pm CT** (Michelle's reminder — first reminder-path
exercise ever, verified sole eligible via 3-timepoint dry-run 2026-08-21).

Editing notes: the workflow is ACTIVE + ARMED=true + TEST_MODE=false — node edits are
safe (schedule only fires Thu 6pm CT), do NOT touch those flags. Prefer replacing the
whole parameter (query / jsCode / config source) over find-replace: the MCP patch
matcher is fuzzy, and `$'`/`` $` ``/`$&` in replacements expand ([[n8n-mcp-findreplace-dollar-expansion]]).

---

## Edit 1 — Campaign Config (Code node): two copy strings + one knob + one guard comment

**`offer_body`** — replace with (change: visit date IN as anti-spam proof, "Discount
applied automatically." OUT — the `/book/` landing page already proves auto-apply;
new `{visit_date}` token is rendered by Prep Cohort, Edit 2):

```
50% OFF your next Twisted Pin reservation!\n\nThanks for bowling with us on {visit_date}, {{first_name}}. Book one VIP or traditional lane by {book_by} and save 50% - your visit can be any date.\n\nBook here: twistedpin.com/book/{code}\nQuestions? Just reply. Reply STOP to opt out.
```

272 chars with an 11-char first name → 2 GSM-7 segments, 34 slack (vs 12 slack before
— the swap *loosens* the budget).

**`reminder_body`** — replace with (approved by Jon 2026-08-21; kills the "must use it
tonight" misread — book-by gates PAYMENT, the visit rides the 10-day booking horizon
on all four lane products, venue open 7 days):

```
Hey {{first_name}}, last call! Your 50% OFF Twisted Pin lane discount expires tonight ({expires}) - but your visit doesn't have to be. Book tonight, bowl any night in the next 10 days.\n\nBook here: twistedpin.com/book/{code}\nQuestions? Just reply. Reply STOP to opt out.
```

269 chars with an 11-char first name → 2 segments, 37 slack.

**New knob:**

```js
// Blast tripwire: if eligibility ever returns more than this, the run ABORTS and
// sends NOTHING (throw in Prep Cohort — halt, don't truncate: a cap would send the
// first 150 of a bug's 500 before anyone noticed). Biggest forecast week is 76
// (Sep 10); a legitimate week can't reach 150, so this only fires on an
// eligibility-SQL bug. Uncapped-by-design otherwise (Jon 2026-07-30).
tripwire_max: 150,
```

**Guard comment on `book_by_days: 14`:**

```js
// ⚠️ COUPLED to the reminder: Thursday send + 14-day book-by + expiry just past
// midnight lands EVERY expiry on a Thursday night — the only reason the reminder's
// hardcoded "expires tonight" is true (7-day band catches it with 6h59m margin,
// verified 2026-08-21). Change this off a multiple of 7 and the last-call fires on
// the wrong day claiming "tonight". Re-derive band + copy together or not at all.
```

## Edit 2 — Prep Cohort (Code node): tripwire + {visit_date} render

**(a) Tripwire — FIRST thing after the eligible list exists, BEFORE the mint call**
(Prep Cohort throwing kills the run before any discount is minted or message queued;
ledger untouched, nothing sent, n8n surfaces the error):

```js
const TRIPWIRE = config.tripwire_max ?? 150;
if (eligible.length > TRIPWIRE) {
  throw new Error(
    `TRIPWIRE: ${eligible.length} eligible guests exceeds ${TRIPWIRE} — aborting run, ` +
    `nothing minted or sent. A legitimate week can't reach this; suspect an ` +
    `eligibility-SQL regression (window bounds, consent gate, or rebooked-since clause).`
  );
}
```

**(b) `{visit_date}` render** — alongside the existing `{code}` / `{book_by}`
replacements. Eligibility SQL already outputs `visit_date` as `YYYY-MM-DD` text; noon
anchor avoids TZ off-by-one:

```js
const visitDateLabel = new Date(`${g.visit_date}T12:00:00`)
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); // "Aug 12"
// then in the body build:  .replace('{visit_date}', visitDateLabel)
```

{{first_name}} stays untouched — the rail renders it at send time, never Prep Cohort.

## Edit 3 — Reminder eligibility SQL: the full-price-rebook skip

Add to the reminder query's WHERE (aliases: adapt to the node's actual query — the
offer row's phone10 and its `created_at` are the anchors):

```sql
  -- Skip if ANY live booking on this phone was CREATED after the offer went out:
  -- they came back on their own (usually full price — the code redemption path is
  -- already excluded above). Never text "last call! 50% off" to someone who just
  -- paid full price. Their new visit re-arms the next cycle instead (per-visit
  -- re-entry). Cancelled bookings deliberately DON'T suppress — plans fell through,
  -- the code still works, the last-call is genuinely useful there.
  AND NOT EXISTS (
    SELECT 1 FROM bookings b3
    JOIN customers bc3 ON bc3.id = b3.customer_id
    WHERE right(regexp_replace(coalesce(bc3.phone,''),'\D','','g'),10) = <offer_phone10>
      AND b3.block_kind IS NULL
      AND b3.status::text IN ('deposit_paid','fully_paid','completed')
      AND b3.created_at > <offer_created_at>
  )
```

## Verification (run ALL of this after applying — Jon's explicit ask)

1. **Read back every edited node** (`n8n_get_workflow` mode=filtered) and diff against
   this file. No blind writes.
2. **Node order**: confirm on the connection graph that **Reconcile Log Status runs
   before the reminder selection** in the same run. The ledger stays `queued` between
   runs (heals at run start); if the reminder selects on `status='sent'` before the
   heal, Michelle's Sep 3 reminder silently skips.
3. **Reminder dry-run** (SQL only, DB-wide — re-run the 3-timepoint query from the
   2026-08-21 session): expect **0 eligible now, 0 at the Aug 27 run, exactly 1
   (Michelle, VK8VZ3RU) at the Sep 3 run** — fewer if she redeems/rebooks first, never
   more. Test codes XS7G9BWS/QQD9JMAN have no ledger rows → structurally invisible.
4. **Offer dry-run for Aug 27**: expect **2 eligible** (forecast 2026-08-15; shrinks if
   they rebook, never grows beyond visits already in the past).
5. **Confirm untouched**: ARMED=true, TEST_MODE=false, trigger `0 18 * * 4`,
   holdout_pct 15, min/max_days 28/42, book_by_days 14, the four product UUIDs.
6. **Fri Aug 28 morning**: audit the 2-guest run — both `message_event` rows
   `delivered`, offer bodies show a real "on Aug NN" visit date and no literal
   `{visit_date}`, ledger rows LR-*, one "Lane Rebook 2026-08-27" rollup row in
   /admin/discounts.
7. **Fri Sep 4 morning**: the big audit — ~45 offers sent + Michelle's reminder
   (first `cap_exempt` exercise in production: offer→reminder gap is 13d23h55m, five
   minutes inside the rail's 14-day frequency cap — cap_exempt is the only reason it
   sends). Remember: **check `scheduled_message`/`message_event`, NOT the ledger** —
   ledger rows sit `queued` until the NEXT run's reconcile ([[lane-rebook-campaign-built]]).

---

## ✅ APPLIED 2026-08-21 ~7:55pm CT — verification results

Connector fix: the n8n-mcp session was bound to a stale instance context (`f17cb75a`);
Jon's MCP reconnect rebound it to the real instance (`d80a20dc` / n8n-twistedpin-com).

Applied as 3 atomic `updateNode` ops (full jsCode replacement, no fuzzy patches).
**The published graph carries the edits** (activeVersionId `29af7fde` stamped at the
update — the partial update auto-published; verified via mode='active', not the draft).

- Edit 1 (Campaign Config: both copy v2 strings, tripwire_max 150, book_by guard) ✓ read back
- Edit 2 (tripwire in Prep Cohort, thrown BEFORE the mint) ✓ read back
- {visit_date} render landed in **Assign Codes + Build Rows** (the body is built there,
  not Prep Cohort as this file guessed) ✓ read back
- **Edit 3 was already live** — the full-price-rebook skip has been in Find Due
  Reminders since the original build (`b2.created_at > l.created_at`, cancelled
  excluded). No write needed; semantics verified identical to the staged clause.
- Node order ✓ (Config → Reconcile → both chains; ledger heals before reminder selects)
- `marketing_sms_sendable(c)` verified: opt_in AND NOT do_not_market AND NOT bounced
  AND NOT loyalty_sms_opt_out — the reminder honours the loyalty STOP overlay.
- Knobs untouched ✓ (ARMED=true, TEST_MODE=false, cron 0 18 * * 4 America/Chicago,
  holdout 15, window 28/42, book_by 14, 4 product UUIDs, reminder cap_exempt=true)
- Reminder dry-run stands (predicate unchanged): 0 now / 0 Aug 27 / 1 (Michelle) Sep 3.
- Aug 27 offer forecast: 2 guests — the dress rehearsal for the new offer copy.

Remaining = the two morning audits (steps 6–7 above): Fri Aug 28 + Fri Sep 4.
