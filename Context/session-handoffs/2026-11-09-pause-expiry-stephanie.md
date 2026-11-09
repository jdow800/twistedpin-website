# Handoff: stale pauses now expire nightly (Avery Conversation Hygiene), plus the Stephanie Rivera booking fix, 2026-11-09

Written by the Claude session that did the work (cwd `C:\Users\jdow8\dev\Marketing Avery`). It stands on its own: what happened, what Jon ruled, what shipped, how to turn it off or roll it back, and where to look when something looks wrong.

## Outcome in one paragraph
A returning guest's new inquiry went to staff instead of Avery because her contact had been "paused" since August. Nothing in the system ever ended a pause: 201 contacts sat paused, most for events long over or guests long silent, which also kept them out of WF5's rebook and fundraiser campaigns. Jon ruled that guests "stagger in" and Avery should handle them, so a pause must expire. A nightly job now does that: **"Avery - Conversation Hygiene" (`PPDisBJedrTTgSZt`), PAUSE EXPIRY route, ARMED 2026-11-09, live version `912ec0d5`, first run 3:20am CT on 11/10, at most 10 releases a night.** Two GPT-6-Astra ultra reviews (scope, then code) shaped it. Separately, Stephanie's December field trip was found filed under the wrong customer, and was moved and linked by hand.

## 1. Stephanie Rivera (the trigger)
- **The form.** 11/9, 10:02am: "Needs a reply: Stephanie Rivera, School Field Trip for 80" (receipt `8a3e6972`, run 280488, reason `older_plausible_event`).
  - 0250's quiet-inquiry fresh start did not apply, because a PAUSED contact still goes to review.
  - Her contact `6be1892a` (708-724-9999) had been paused since 8/10. Field trips always flag Needs Attention after Avery's first text.
- **The trap.** `avery_event.last_customer_message_at` was NULL, but she HAD replied four times. Shanna booked a Fri Dec 4, 10:30am-12:30pm trip by text.
  - While Needs Attention is on, WF2 never runs, so nothing writes Avery's stamps or dates.
  - The truth is in Missive and the nightly `avery_message` mirror.
- **Wrong customer.** The booking (`ae40ec5e`, INV-2026-00388, staff-created 8/10, paying on site) had been filed under a DIFFERENT "Stephanie Rivera": `def519fb`, 630-544-8410, srivera213@gmail.com, who self-booked a lane on 8/2. Jon: two different people; "our bad".
- **Fixed by hand (11/9), one guarded transaction:**
  - the booking moved to `6be1892a`;
  - `bookings.avery_conversation_id` repointed from `c7fd13b0` (gmail Stephanie's thread) to `adc64838` (the teacher's thread), so "Open in Missive" works;
  - the teacher's email set to `srivera1@psd202.org`;
  - one `customer_pii_overwrite` audit row (actor Jon).
  - No email or outbox event fired (checked afterwards).
  - Then `node brain/deploy/link-staff-booking.mjs INV-2026-00388 E-2699081` (quiet, fingerprint `f2f1748a`) linked her August Avery inquiry. The row now shows Dec 4, 10:30 AM, `pending_deposit`.
  - Jon confirms with her by text: no TPRS confirmation email, by his choice.
- **Why not cancel and recreate:** a staff cancel ALWAYS emails the booking's current customer (`booking.cancellation_notification`). There is no "don't notify" switch, so gmail Stephanie would have been told about a booking she never made.
- **TPRS gap recorded:** there is no "change the customer on a booking" action (merge moves every booking and deletes a customer). tprs `docs/BACKLOG.md` 2.15, PR #539. Jon: "should be a thing but unlikely happens often".

## 2. Rulings (Jon, 2026-11-09)
- Never-replied paused contacts staying paused is "illogical". So is staying paused after they stopped talking, after a booked event has passed (plus a couple of days), or after a week of silence and a week past the date.
- Not a small problem: "Guests are going to stagger in; they might inquire, they may not book, and they might reach out again later. Ideally, we just need to have AI handle them." He chose the automatic nightly job over a monthly report.
- Name matching for bookings: not needed. Stephanie's wrong-customer filing was a one-off.
- This reopened the 10/20 "park all hygiene work" ruling for this one job only. The reconcile, the label purge and JIT clearing stay parked and disarmed.

## 3. What shipped
| What | Where | Version |
|---|---|---|
| PAUSE EXPIRY route (nightly 3:20am CT, own flag `armedExpiry`) | n8n `PPDisBJedrTTgSZt` | `7d22f296` -> `c5b333c2` (installed disarmed) -> `02acdbb0` (review fixes, disarmed) -> `912ec0d5` ARMED -> **`de1e1436` ARMED** (opt-outs no longer hold a pause, later the same night). The other jobs stay `armedReconcile: false`, `armedPurge: false`. |
| Source | `Marketing Avery/brain/hygiene/{sql,policy,workflow}.mjs`, installer `brain/deploy/install-conversation-hygiene.mjs` | PR #40, merge `b478f50` |
| Scope, numbers, both review dispositions | `Marketing Avery/brain/hygiene/PAUSE-EXPIRY-SCOPE.md` (v2) | |
| Changelog of record | `Marketing Avery/n8n/workflows/ConversationHygiene.changelog.md` (the top entries) | |
| Harnesses | `brain/hygiene/test-expiry.mjs` 69, `test-workflow.mjs` 99, `test-sql.mjs` 99 (real Postgres through a temporary n8n probe, fixtures, writes rolled back), `test-policy.mjs` 80. Every new test was RED against the pre-fix code. | |

## 4. The rule, in plain words
Every night, for each paused contact, the job releases it to Avery only if ALL of these hold.
1. **Every open inquiry is over.** That covers the person's sibling customer rows too (same 10-digit phone or same email). It means one of:
   - the date (the later of the Avery row and its linked TPRS booking) is 7+ days past; or
   - it is undated, and a booking of theirs created after the inquiry finished 3+ days ago; or
   - it is undated, older than 7 days, and the guest never wrote on it, proven from the full Missive message history.
2. **No booking of the same person is dated today minus 2 or later.** Unpaid counts (field trips pay on site). Cancelled, refunded and no-show bookings, resource blocks and advertising sales never count.
3. **Nothing happened on any of their Missive conversations for 7+ days.**
4. **Every thread with Needs Attention is CLOSED.** An open flagged thread is never touched.
5. **No hold applies:**
   - a manual hold (an opt-out is NOT a hold: see the ruling below);
   - a pause under an hour old;
   - an assigned thread;
   - Larger Quote or Pricing Engine FAILURE;
   - a live payment link or claim hold;
   - an unresolved earlier attempt;
   - a campaign that could restart: a WF5 fundraiser invite-back, an annual rebook, or an unsubmitted event-page link (Engagement Nudge has no age ceiling). Config `expiryAllowCampaigns: false`.

**Write order.**
1. A FINAL database re-check after the Missive reads.
2. A `pending` audit row (`avery_campaign_log`, `campaign_type = 'hygiene_expiry'`), written only if the pause is unchanged.
3. One PATCH per closed thread, removing Needs Attention only.
4. A read-back of each thread.
5. One statement that un-pauses (compare-and-set on `updated_at`) and closes the row as `done`, `conflict` or `failed`.

The guest is sent nothing. An API label removal on a closed thread fires no Missive rule and no WF3 (10/20 experiment), which is why the job un-pauses by SQL itself. Once released:
- a new form goes to Avery as a fresh start or a returning-guest opener (0250 + the 11/7 WF1 upgrade);
- a text into the old thread reaches WF2 (it only needs Needs Attention off), but Avery answers only if that inquiry had activity in the last 60 days. Older than that, WF2's own staleness gate (`Pick Latest Event`, `STALE_DAYS = 60`) treats the text as cold: Avery stays silent, and Needs Attention goes back on with a staff note. That is by design and safe. At launch every release was 90+ days quiet, so in practice the win is new FORMS and campaigns, not old-thread texts (corrected by the 11/9 review).

**Pace.** It reads up to 40 candidates a night, least-recently-checked first (workflow static data, so held ones never block the line), and releases at most 10. That cap is `maxUnpausePerDay`, shared with the disarmed reconcile.

**Email.** It emails jon@ only when it released someone or something failed. A disarmed or quiet night is silent.

## 5. Numbers at launch (preview exec 281385)
- 201 paused rows; 137 eligible by the database.
- Staying paused or listed: 23 date ahead, 15 opted out, 9 recent event or inquiry, 6 campaign due, 4 booking ahead (Stephanie among them), 4 no date on record, 2 no conversation, 1 paused under an hour.
- Of the first 40 checked in Missive: 37 release, 1 held (Larger Quote), 2 replied with no date.
- Most releases have no Needs Attention anywhere (the pause was simply never cleared). About 1 in 8 needs one closed thread unflagged.
- The backlog clears in about two weeks at 10 a night.

## 6. Troubleshooting
- **Turn it off:**
  ```
  node brain/deploy/install-conversation-hygiene.mjs --yes --disarm
  ```
  This flips constants only, and a run already in flight finishes. Run from a Marketing Avery checkout; in a worktree, set `AVERY_DEPLOY_ENV` to the main checkout's `brain/deploy/.env`.
- **See what it would do, with no writes:**
  ```
  node brain/hygiene/live-dry-run.mjs expiry
  ```
  This fires the Test Webhook dry run, reads up to 40 candidates and EMAILS the preview to jon@.
- **Find what it did to someone.** Run this read-only (`BEGIN READ ONLY`, never a session SET on the pooler):
  ```sql
  select log_id, status, touch, notes, sent_at from avery_campaign_log where campaign_type = 'hygiene_expiry' and contact_id = '<uuid>';
  ```
  - `touch` is the rule: `event_over`, `never_replied` or `no_open_inquiry`.
  - `notes` hold the observed pause, the conversations read, the threads unflagged and the inquiry dates.
  - Run executions are in n8n (`saveDataSuccessExecution: all`).
- **A guest went to Avery who should not have:**
  1. Put Needs Attention back on the thread in Missive. WF3 re-pauses the contact.
  2. Look at the row's rule and notes to see which fact was wrong (a stale `avery_event` date is the usual suspect).
  3. To keep the job away from one person, add their id to `holdContactIds` (or the thread to `holdConversationIds`) in the workflow's Config. Do that by editing the constants with the installer, never by hand-editing nodes.
- **A guest is still paused who should not be:** run the dry run and find their line in the report. Every non-release has a reason:
  - date ahead
  - booking ahead
  - recent event
  - campaign due
  - no date
  - replied, no date
  - open flagged thread
  - recent activity
  - special label
  - unverified

  Remember that 40 are read per night, so the rest wait their turn. Releasing one by hand: remove Needs Attention from their open thread in Missive, and WF3 activates them. If no thread carries it, add it and then remove it. Do not hand-`UPDATE` `ai_status`: WF3 also flips the person's split rows.
- **The nightly email says "NOT RELEASED":** the row is `failed` (a label did not come off cleanly, or a thread reopened) or `conflict` (the pause changed mid-run).
  1. Open the threads in the row's notes and decide by hand.
  2. Then `update avery_campaign_log set status = 'reviewed' where log_id = '<id>'`. Until then both the expiry and the reconcile leave that contact alone.
- **Roll back the code:**
  ```
  install-conversation-hygiene.mjs --rollback <snapshot>
  ```
  Snapshots `hygiene-before-{7d22f296,c5b333c2,02acdbb0,912ec0d5}-...json` (each with its `.meta.json`) are in `Marketing Avery/brain/deploy/.emit/` and in the worktree `.worktrees/pause-expiry-20261109/brain/deploy/.emit/`. Restoring `02acdbb0`'s snapshot means "this code, disarmed".
- **Missive rate limits:** the job paces its reads (3 per 0.7s) and PATCHes (1 per second) on the shared token. A 429 on a PATCH settles the contact as `failed`, not released.

## 7. Facts worth knowing next time
- **Avery's stamps lie after a staff takeover.** `last_customer_message_at`, `event_date` and the booking link stay frozen once Needs Attention is on. Read Missive or `avery_message`.
- **The pause and Needs Attention are two different locks.** The pause gates WF1 (new forms) and the campaigns; Needs Attention gates WF2 (texts). A release must clear both, which is why the job removes the label from closed threads.
- **Staff-made bookings can sit under the wrong same-name customer.** `link-staff-booking.mjs` is the tool to tie a staff booking to an Avery inquiry: preview, then apply with the fingerprint.
- **A TPRS staff cancel always emails the current customer.**
- The candidates query runs in about a second on prod. `avery_campaign_log` rows of type `hygiene_expiry` are the whole audit trail.

## 8. Open / watch
- **WATCH the first armed nights (11/10 onward):** the first email, the first real Needs Attention removal (about 1 in 8 releases), and that no released guest gets an unexpected campaign text.
- The 6 `campaign_due` guests stay paused while `expiryAllowCampaigns` is false. Jon could allow them later; a fundraiser invite-back or a rebook is arguably good marketing.
- The reconcile (30 min) and the label purge remain disarmed and parked (10/20).
- **RULED AND SHIPPED the same night: an opt-out never holds a pause.** Jon: "you can opt out that is fine, but, if you fill out the event form again - you are opting back in to be contacted".
  - The hold (inherited from the 10/20 review) is gone from the nightly job and from the disarmed reconcile. Live `de1e1436`, Avery PR #43.
  - It is safe because a pause decides who answers, not whether we may message: WF1 already answers a form from an opted-out guest (it stands down only when an Avery STOP came at or after the form), and every campaign checks consent itself.
  - Correction: the review first counted "15 opted-out guests". 13 of them are merge tombstones, dead rows left by the duplicate-customer merges, whose notes start `[merged-into:`. Only 2 are real guests: one staff-set do-not-market and one loyalty STOP. No paused contact carries an Avery STOP.
  - Cosmetic leftover: 14 of the 201 paused rows are tombstones. They never release, and 13 show under "no conversation" in a preview email. A filter on the notes prefix in `EXPIRY_CANDIDATES_SQL` would hide them; not done.
- **Jon's call: the "replied, no date" guests** (about 20 to 25 once the backlog is scanned). They stay paused for good, and nobody is prompted to look: the nightly email only reports releases and failures. Options: release after a long quiet stretch, or list them in a weekly email.
- **Loyalty marketing rejoins.** Loyalty's delivery-hold gate (Loyalty db/103, db/110) skips any phone with a paused customer row. Released guests who opted in to loyalty texts become eligible for birthday, lane-rebook and long-gap sends again. Expected, but neither review listed it.

## 9. Independent review (Fable 5.2, 2026-11-09 night)
Checked against production, with no data changed:
- **Database writes.** `avery_campaign_log` has no check constraints, `log_id` is unique, the system actor exists, and n8n logs in as the table owner. The `customer` view is updatable for `ai_status` and `updated_at`.
- **The two write statements** (pending row, settle) ran through n8n's own credential against the real tables with an unknown contact: they bind, type-check and write nothing. `brain/hygiene/probe-bound-writes.mjs` now covers them (7/7).
- **Message classifier on live SMS.** Missive SMS senders carry `username` (no `phone_number`); Avery's sends show the venue number there and classify as ours. The preview's two "replied, no date" verdicts were real guest replies.
- **Missive PATCH shape** matches the docs: a top-level `conversations` array with one object per id in the URL. The docs say label rules run on a PATCH; the 10/20 experiment saw none fire on a closed thread. If one does fire, the read-back sees the thread reopened and the row goes `failed`.
- **No nightly job bumps `customers.updated_at`** (paused rows were last touched between 8am and 10pm), so the "pause under an hour" hold cannot stall a 3:20am run.
- **Live equals main.** The installer's dry plan says "no change" at `de1e1436`, armed (it said the same at `912ec0d5` before the opt-out change).
- **The first night makes no label change.** The 10 oldest candidates carry no Needs Attention, so night one proves the database path only. The first real label removal comes a few nights later: watch that email.
- **What to expect on 11/10:** an email "Avery conversation hygiene: 10 pauses expired". No email means the run did not happen or released nobody: check the n8n executions of `PPDisBJedrTTgSZt` at 3:20am.
- tprs BACKLOG 2.15 (change the customer on a booking) is recorded, not built.
- The 10/20 handoff `2026-10-20-stale-pauses-and-needs-attention.md` exists only in the local Website checkout (never committed). The facts it holds are mirrored in `Marketing Avery/brain/hygiene/PLAN.md` and the hygiene changelog.
