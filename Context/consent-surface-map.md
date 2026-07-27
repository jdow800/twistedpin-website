# Consent & Opt-Out Surface Map

**Audited 2026-07-23.** Every surface that can text or email a guest, what legal basis it rides,
and whether an opt-out on that surface reaches the database.

Method: 57 parallel read-only agents across the Website / tprs / Loyalty / Marketing Avery repos, the
live n8n instance, and the `twistedpin-platform` Supabase project (`hdcoyqlskurvpjfrlnop`), with every
load-bearing claim independently re-verified by a second agent instructed to refute it. Claims that
survived are marked CONFIRMED below; claims corrected during verification are stated in their corrected
form. Two areas could not be resolved from this machine and are listed under **Unknown**.

> **Read this first if you are about to send marketing.** The blocker is not one gap on one number.
> It is that *recording* an opt-out and *honoring* an opt-out are wired to different things, and on
> most rails neither is wired at all. See "The four gaps" below.

---

## 1. Bottom line

| Question | Answer |
|---|---|
| Can we legally send marketing SMS today? | **No** — see the four gaps. |
| How many people can we actually market to right now? | **2**, and both are internal (owner test + one staff record). The 18,372-row imported opt-in base is entirely behind `do_not_market`. |
| Is anything sending marketing *right now*? | Not on the loyalty rail. **Yes on the Avery rail** — WF5's `annual_rebook` and `fundraiser_loyalty` already reached a real guest (2026-07-16), and Visit Feedback has cold-opened 67 threads since 2026-07-07. |
| Is the biggest risk the Avery STOP gap? | **No.** The nearer risk is the Jul 27 quarantine lift, which arms four unaudited lifecycle automations against ~18k people in one `UPDATE`. |

---

## 2. The consent model (how it is supposed to work)

One legal flag, one audit table, deliberately **not** split per program — the failure mode that design
prevents is "opted out of one system, still texted by another."

- `customers.sms_marketing_opt_in` — the single legal flag
- `customers.sms_marketing_opt_in_source` + `_decided_at` — provenance cache
- `consent_event` — append-only evidence (channel / action / source / source_ref / metadata)
- `record_sms_consent()` — plpgsql RPC; flips the flag **and** writes the event. The reference path.
- Gate functions: `marketing_sms_sendable()` = opt-in AND NOT `do_not_market` AND NOT `sms_bounced`

**Where the model breaks in practice:** the flag is authoritative only for rails that *read* it. Two of
the three sending rails never read it, and `record_sms_consent()` does not set `do_not_market`, which is
what several other paths actually check.

---

## 3. Sending numbers

Four numbers, two carriers — **not** one carrier per rail, which is easy to assume and wrong.

| Number | Carrier | Rail | Consent checked before send? | Inbound STOP → DB? |
|---|---|---|---|---|
| +1 779-234-4062 | SignalWire (`twisted-pin` space, project `2bcb6054…342dd`) | Loyalty | **Yes** (`Pre-Render & Gates`: opt-in, do_not_market, bounced, frequency cap) | **Yes** — reference implementation |
| +1 779-303-0261 | SignalWire (same project) | Avery (WF1/WF2/WF5/VF/Outbox/Link-Reminder) | **No** — never | **No** — zero events, ever |
| +1 815-676-5704 | Twilio | Avery legacy (historical threads; deliberate permanent dual-run since 2026-05-30, not a stale cutover) | **No** | **No** |
| +1 888-663-9074 | Twilio | Roy (Retell voice agent) | **No** | Auto-reply is suppressed on STOP/HELP, but nothing is recorded |
| +1 833-260-2926 | Patch / CityGro | **Third-party, still live** | Unknown to us | **Never reaches our DB** |

---

## 4. Surface map

### 4a. SMS — Loyalty rail (SignalWire +1 779-234-4062)

| Surface | Type | Opt-out captured | In DB | Notes |
|---|---|---|---|---|
| `WF-Loyalty-Send` (3IdBjlBRj99HsYBX) | marketing | yes | yes | Strongest basis in the estate. Fresh send-time re-read of consent. |
| `WF-Loyalty-Inbound` (y8uOz05FOSGIjscp) | inbound handler | **yes** | **yes** | 6 nodes. Webhook → `Classify Keyword` (first-token; 8 opt-out / 5 opt-in / 2 help) → IF → `record_sms_consent` → cXML. **The pattern to copy.** |
| `WF-Loyalty-Forms-Intake` (CFL7z6i2y6km2WZN) | marketing (welcome SMS) | n/a | yes | Fed by `/api/coupon-signup`, `/api/kids-signup`, and the kiosk. Captures full evidence (consent_language, IP, UA, page_url). |
| `WF-Loyalty-Send-Callback` | DLR receiver | no | partial | Ingests delivery receipts for this number only. |
| **pg_cron lifecycle automations** | **marketing** | via gate | yes | **See §5, gap 2.** Four enabled, running daily. |
| `customer_event_feedback_trg` DB trigger | marketing-ish | **no** | n/a | Fires on kiosk check-in at visits 1 and 3, `cap_exempt=true`. Visit-1 body is loyalty marketing copy. **No repo grep finds this sender.** |
| `send_conversation_reply()` RPC | free text | **no** | n/a | Staff-operated arbitrary send, `cap_exempt=true`, no consent check. Caller not on disk — presumed Zite inbox UI. |

### 4b. SMS — Avery rail (SignalWire +1 779-303-0261, via Missive drafts)

Every row below: **no consent flag consulted, no opt-out recorded.**

| Surface | Type | Notes |
|---|---|---|
| `WF2` Inbound Message Handler (dYG_0_MVmIpS_EQCBZ-Tl, 149 nodes) | transactional | Conversational replies. Legitimate basis. |
| `WF1` Contact Form Intake | transactional | Guest submitted an inquiry form. |
| `Avery — Visit Feedback` (TtRzMtdpMR6dsfw4) | **mixed / cold-open** | 67 texts since 2026-07-07. Opens a *new* thread day-after-visit and carries a review-ask arc. No STOP footer. |
| `WF5` Lifecycle Campaigns (e6bPjzyfxpjwP3y_YACK4) | **mixed** | `hc_chase`/`fp_chase` transactional; **`annual_rebook` + `fundraiser_loyalty` are marketing**. |
| `Avery — Engagement Nudge` | mixed | The "recovery" variant offers a reduced price — promotional in substance. |
| `TPRS Link Reminder`, `Outbox Listener` acks | transactional | Clean. |
| `Avery — Meta Lead Ads → WF1 Bridge` | transactional | Chain hops through a **Google Sheet**; anyone with sheet edit access can make Avery text arbitrary numbers. |
| `Avery — After-Hours Release` | scheduler | De-facto quiet-hours control for the whole rail. TCPA 8am–9pm local exposure is unaudited. |
| **Humans in Missive** | ungoverned | ≥166 staff-sent SMS + 14 emails from these identities. Zero gate, zero cap. Store only began capturing 2026-07-22, so 166 is a floor. |

### 4c. SMS — Roy rail (Twilio +1 888-663-9074)

| Surface | Type | Notes |
|---|---|---|
| `Roy SMS — Mid-call Info Texts` (cEIERZTpIoIg67Zy) | transactional | 4 nodes, direct Twilio API — **bypasses Missive entirely**, so no conversation record, no Avery label state, no `ai_status` pause check. No consent lookup of any kind. |
| `Roy SMS — Inbound Auto-Reply` (syN4IMs2HfEIvWmJ) | receiver | Has an explicit STOP/HELP guard that suppresses the auto-reply and defers to carrier toll-free opt-out. **Nothing is recorded in our DB.** |

### 4d. Email

CAN-SPAM, assessed separately from TCPA.

| Surface | Type | Unsubscribe? |
|---|---|---|
| TPRS confirmations, receipts, payment links, reminders, cancellations, refunds (Resend) | transactional — exempt | n/a |
| TPRS admin/ops alerts, Playbook notifications | staff-only — CAN-SPAM N/A | n/a |
| Avery WF1/WF2 replies, Engagement Nudge (events@twistedpin.com via Missive) | transactional/relationship | n/a |
| **Avery WF5 `annual_rebook`** | **marketing** | **None. No unsubscribe, no postal address.** |
| **Avery WF5 `fundraiser_loyalty`** | **marketing** | **None. No unsubscribe, no postal address.** |
| Avery outbound open-tracking pixel | — | Collects IP + UA per open; **not disclosed** in the privacy policy, which is SMS-centric. |

**No email surface anywhere in the platform has an unsubscribe mechanism** — no link, no
`List-Unsubscribe` header, no preference center. CONFIRMED.

### 4e. Third-party senders (messaging guests on our behalf — none audited)

| System | Status | Why it matters |
|---|---|---|
| **Patch / CityGro** | **LIVE, not historical** | Own number (833-260-2926), own kiosk device that texts on check-in, own birthday/check-in/coupon automations. Fed by two **nav-linked** pages: `/coupon` → `c-g.co/xORo1J` and `/free-kids-bowling` → `c-g.co/OskPxh`. A STOP to Patch never reaches our DB. |
| ↳ **Patch `TPR - 'Free KidsBowling Form' complete`** | **Confirmed sending, 2026-07-23 (owner screenshot)** | `Form Finished (FreeBowlingKids NEW)` **1,252** → `Send SMS` **1,250**. Body: *"You're in! Free bowling @ Twisted Pin starts June 1st. / Enter your phone # at our kiosk when you visit. / Share w/ a friend! https://c-g.co/…"*. This is the single highest-volume guest SMS in the estate and **none of it is in our database** — not the consent, not the send, not any STOP. Our `/free-kids-bowling` page feeds it. Replicating this on the loyalty rail is a build item (§9). |
| GiveMe5 | live | `/feedback` 302s to `app.giveme5.ai/twisted-pin` — the exact URL our check-in trigger texts. Review platforms typically collect contact and send their own follow-ups. |
| TablesReady | live | Waitlist product whose core function is texting "your table is ready" from a vendor number. |
| Roller | live | `WF4` still active; Summer Pin Pass sells there through 2026. Sends its own confirmations. |
| GoTab | integrated | Digital receipt delivery setting unknown. |
| Frame / Upshow | live | Hands out free-game coupons that "land in Patch"; mechanism unknown — if it's an SMS keyword, that's a fourth inbound number. |
| Stripe | unknown | Account-level "Customer emails" toggle emails guests regardless of `receipt_email`. Code deliberately omits `receipt_email`; the dashboard setting was not checked. |

---

## 5. The four gaps, ranked

### Gap 1 — An opt-out does not stop most sends, even when it *is* recorded

> **✅ LARGELY CLOSED 2026-07-23.** See §11 for what was applied. The description below is the
> pre-fix state, retained because it explains *why* the fix is shaped the way it is.

The one working opt-out path is incomplete. `record_sms_consent()` clears `sms_marketing_opt_in` but
**never sets `do_not_market`** — and:

- WF5 and Visit Feedback **do not check `sms_marketing_opt_in` at all**. They select from `avery_event`.
  **226 phone-bearing customers are reachable by them today with no SMS marketing opt-in.**
- The loyalty *transactional* gate is `transactional_sms_sendable(c) = SELECT NOT c.sms_bounced;` —
  the entire function. Opt-out is not consulted. Every `cap_exempt` insert (check-in feedback, welcome,
  staff replies) still fires at someone who texted STOP.

So a guest who opts out on the loyalty number keeps receiving Avery campaigns and kiosk feedback texts.

### Gap 2 — The Jul 27 quarantine lift arms four unaudited automations at once

`cron.job` has 9 entries; `run_lifecycle_cron()` runs daily at 16:00 UTC. Four `lifecycle_automation`
rows are **enabled**, three with `last_run_at` of today:

- `birthday` — *"Happy Birthday from Twisted Pin! Your gift is waiting - pick your $30 present…"*
- `winback-50-initial` — *"FREE Hour of bowling - for up to 5 players!…"*
- `winback-330-initial` — *"We miss you @ Twisted Pin!… FREE $30 arcade card OR a FREE hour…"*
- `kids-free-bowl-window` — season 6/01–8/14, Mon–Fri

They enqueue nothing **only because** 32,483 of 32,745 customers carry `do_not_market=true`. The cutover
runbook's step is literally "LIFT QUARANTINE" — one `UPDATE`. The morning after, three unaudited
marketing automations begin texting an 18k base whose consent is inherited from a platform we are
cancelling.

> "The loyalty rail has never sent to a real guest" is true, measured, and misleading. It describes
> delivery. The risk is **armament**.

### Gap 3 — Avery's number has no opt-out interpretation

> **✅ CLOSED 2026-07-24, proven on real hardware.** See §12. The description below is the pre-fix
> state. The DLR/observability half (no delivery-status feed for the 779 number) remains OPEN.

CONFIRMED: `consent_event` contains **zero** rows sourced `avery_inbound` in the platform's history.

Nuance that matters for the fix: the STOP *message itself* is not lost. Inbound to +1 779-303-0261 is
persisted verbatim in `avery_message` by the nightly `Avery — Message Store Sync` (755 inbound rows).
What is missing is **interpretation** — no keyword detection in WF2's 149 nodes, therefore no
`consent_event` and no flag flip. Two second-order gaps:

- The message-store capture is **bounded** — only conversations linked to a non-test `avery_event`
  updated within 45 days, 400 conversations/run. A STOP from an untracked or stale thread is unrecorded.
- **No DLR/error feed is ingested for the 779 number at all.** ~951 outbound SMS since 2026-05-30 with
  zero delivery status in our DB. If SignalWire starts returning 21610 (carrier-blocked), we cannot see
  it, and nothing converts it into an opt-out — the number gets retried on every future campaign.

⚠️ `Marketing Avery/n8n/workflows/VisitFeedback.changelog.md:28` claims *"STOP/bounce handling
pre-existing (WF2 STOP detection + signalwire_dlr → consent service)."* **The "WF2 STOP detection" half
is false.** Anyone reasoning from that line will conclude the estate is safer than it is.

### Gap 4 — Consent evidence is thin where it will be contested

`consent_event` covers 2 of ~7 CTIA-recommended evidence fields structurally (timestamp, acquisition
medium); 4 more only as optional metadata populated on **4 of 18,383 rows**; "specific campaign" not at
all. Both checkout-sourced events carry `source_ref = NULL` and `metadata = {}`.

Worse: the consenting **phone number is not snapshotted onto the evidence row** — it dereferences
through `customers.phone`, which is **overwritten on every checkout**
(`services/customer.ts:254-261, :562-569`). The evidence does not preserve which number consented.

The pattern that *is* CTIA-shaped already exists — the Website web-form/kiosk path records
`consent_language`, `ip`, `user_agent`, `page_url`, `form_slug`. It is 4 rows. Generalize it.

---

## 6. Checked and found clean

- **SMS-only enforcement at checkout is real.** The UI sends `smsMarketingOptIn` and never
  `marketingOptIn`; recorded consent cannot exceed the disclosure. Untouched box = `undefined` = no
  field on the wire = no `consent_event` at all.
- **Never pre-checked**; not bundled with the payment-step terms checkbox.
- **Visit Feedback does filter `do_not_market`** — the import quarantine is not leaking through it.
- **The apex-sender landmine is present in code but not firing** — production sends from a verified
  domain. `tprs apps/backend/src/workers/main.ts:198`'s `?? "bookings@twistedpin.com"` fallback remains
  one unset env var from silently killing every guest booking confirmation.
- **The FCC one-to-one consent rule is vacated and formally repealed** — it is not the operative
  standard, and nothing here needs to comply with it.
- **The per-guest coupon cap genuinely works** (verified 2026-07-23, code + data). An earlier
  unverified claim that it was keyed to `customer_id` — and therefore beatable with a fresh email —
  is **wrong**. `discounts.ts:296-318` counts prior redemptions of the *rule* whose **snapshotted
  `redeemed_email` OR `redeemed_phone`** matches the guest, so changing one channel still trips it.
  SAVE10 and SAVE20 both carry `per_customer_limit = 1`; all 11 SAVE10 redemptions have both
  snapshot columns populated and are 11 distinct emails / 11 distinct phones / 11 distinct customers
  — zero reuse. Residual holes: the cap no-ops if *neither* channel is present, it is beatable by
  changing **both** channels at once, it is skipped at preview (convert is authoritative), and
  SAVE10/SAVE20 are separate rules so one guest may use one of each.

---

## 7. Unknown — needs a credential or a human

1. **SignalWire platform-level opt-out state for +1 779-303-0261.** There is no REST endpoint that
   lists opt-outs; the readable proxy is the message log. **Blocked on credentials** — no local file
   holds a SignalWire token. This is the one place carrier/DB divergence would hide, and absence of
   bare-STOP text in `avery_message` is *not* evidence, because platform STOP handling typically
   consumes the keyword before the Missive webhook sees it.
2. **Patch's inbound log for 833-260-2926** — any STOP there is invisible to us and must be reconciled
   before that list is used.
3. **Stripe → Settings → Customer emails** toggle.
4. **Google Business Profile messaging** — if enabled, a live guest inbox, often routed to a personal phone.
5. **`WF4`'s `Upsert Remarketing Row`** Google Sheet — a marketing list of Roller bookers accumulating in
   a spreadsheet; consumer unknown.

## 8. Hygiene found en route (not consent, but found here)

- `WF-SignalWire-InboundTest` (lkYMGEiTSuXHWbwA) is **ACTIVE** despite the `(THROWAWAY)` name, silently
  swallowing inbound SMS at `/webhook/sw-inbound-test` and persisting nothing.
- The **Missive personal access token is hardcoded in plaintext** on at least three live send nodes.
- Three dormant loyalty senders (`WF-Loyalty-Welcome`, `WF-Loyalty-Lifecycle`,
  `WF-Loyalty-Blast-Dispatch`) are superseded by the pg_cron path and would **double-send** if reactivated.
- `do_not_market` now carries three unrelated meanings (staff kill-switch, import quarantine,
  checkout-optin park) with no provenance column.
- `apps/backend/scripts/create-teacher-group-bookings.ts:352` writes `do_not_market` directly, bypassing
  the single-write-path helper; it ran in prod (customer `ea608c31…`, 2026-07-03) with no evidence row.
- `/free` publishes `/kids-signup-preview/`, whose own handler docstring says to keep it parked and
  unlinked until the welcome-SMS handler exists.

---

## 9. What must be true before marketing can send

In order. Nothing below is optional for a *marketing* send; transactional sending is unaffected.

1. **Make opt-out actually suppress.** `record_sms_consent()` (or the gates) must cause every rail to
   stop — Avery WF5/VF queries must check the flag, and the loyalty transactional gate must consult it.
   *Without this, recording an opt-out is theater.*
2. **Interpret STOP/START/HELP on Avery's number** → `consent_event` + flag flip.
3. **Prove both with a real handset**, not a green workflow execution. Two silent-200 bugs have already
   been caught on this platform by exactly that distinction.
4. **Gate the Jul 27 quarantine lift** — either disable the four lifecycle automations before lifting,
   or lift in a narrow slice.
5. **Reconcile carrier + Patch opt-out state into the DB** before using the imported list.
6. **Add unsubscribe + postal address to the two WF5 marketing emails**, or disable them.
7. **Add HELP instructions and terms/privacy links** to the checkout consent CTA (CTIA-required,
   independent of any incentive change).

---

## 11. Changes applied 2026-07-23

All verified by read-back. Nothing here changed what any currently-messaged guest receives.

| # | Change | Where | Effect |
|---|---|---|---|
| 1 | Disabled 3 SMS lifecycle automations (`birthday`, `winback-50-initial`, `winback-330-initial`) | `lifecycle_automation.enabled = false` | The Jul 27 quarantine lift is now a data change only. Re-enable = one `UPDATE` per slug, after each one's copy and gating are reviewed. |
| 2 | Left `kids-free-bowl-window` **enabled** | — | It runs the offer-grant path (`run_windowed_programs`), which only calls `grant_offer_with_short_link` and sends no SMS. The SMS runner selects `WHERE enabled AND daily_on_time IS NULL`, which excludes it. Disabling it would have broken a live seasonal program for no safety gain. |
| 3 | Exposed `sms_opt_in` to WF5 | `Read Contacts` node query | Additive column; nothing consumed it until change 4. |
| 4 | Marketing-consent gate on the two solicitations | WF5 `Filter Eligible` | `fundraiser_loyalty` + `annual_rebook` now require `sms_marketing_opt_in`. `post_event`, `hc_chase`, `fp_chase` and both archive branches deliberately untouched. |
| 5 | Kiosk feedback texts respect the loyalty flag | `enqueue_feedback_on_checkin()` | Now calls `marketing_sms_sendable()` before enqueueing. Previously consulted no consent state at all — `cap_exempt` exempts the frequency cap, never consent. `SECURITY DEFINER` + pinned `search_path` preserved. |

**Classification rulings (owner, 2026-07-23), each verified against the actual send copy:**

- **`post_event` = transactional, ungated.** Its system prompt states verbatim: *"You're checking in after their
  event, not selling, not asking for a review yet"* and *"Do NOT include: review links, referral asks, upsell,
  sign-offs"*, plus *"No URLs"* on SMS. The audit's "carries a tracked menu link" note does not hold for this campaign.
- **Visit Feedback = transactional, ungated.** Its prompt is even more explicit: *"This is a courtesy check-in.
  NOT marketing, NOT a review ask, NOT selling, NOT a survey."* The audit's "review-ask arc" characterization
  was an unverified claim and is wrong.
- **Kiosk check-in texts = gated.** Unlike the two above, the visit-1 body promotes the points program and
  carries a URL, and owner direction was that kiosk / opt-in / coupon messaging all rides the loyalty flag.

**Also decided:** lane-rental retargeting sends from the **loyalty number**, event rebooking stays on **Avery's**.
The seam is how the offer closes — a lane rebook closes with a link (no conversation needed), an event rebook
closes conversationally. This is not consent-splitting: the flag stays single and brand-level. The reason to
split the *number* is that a carrier STOP is enforced per-number and cannot be cleared by us, so keeping
solicitation off Avery's number protects the sales line from being gagged. Bonus: the loyalty rail already
sends direct via SignalWire and already has a delivery-receipt callback, so the undeliverable-reconciliation
problem is already plumbed for that traffic.

**Undeliverables (owner direction):** do not gate checkout on a phone-type lookup. Let the first send fail,
record it, never retry. Two failure classes must stay distinguishable: a **landline/invalid** number is a
capability failure (`sms_bounced`, legally meaningless), a **21610 carrier block** is a consent failure (flip
the flag + write a `consent_event`). The suppression machinery already exists — `sms_bounced` column, the
`bounce` consent action that sets it sticky-true, and `marketing_sms_sendable()` reading it. Only the feed is missing.

## 12. Avery STOP/START/HELP — built and PROVEN 2026-07-24

Gap 3 closed. Verified on a real handset, not a green execution.

**Architecture: a sibling workflow, not an edit to WF2.** `WF-Avery-Consent-Inbound`
(n8n `WBGgsWatsaX1OlfB`, 8 nodes) fed by its own Missive rule — `To is +17793030261`, **no label
condition**. WF2's 149 nodes were never touched.

**Why the sibling won, decisively.** The original plan was a classifier inside WF2. Two findings killed it:

1. WF2's rule carries `Label is not Needs Attention`, so it never sees escalated threads — the ones most
   likely to contain an angry STOP.
2. **Proven live:** during the 2026-07-24 test, the consent workflow executed and **WF2 did not run at all**
   (its last execution was 10 hours earlier). A classifier inside WF2 would have missed that opt-out —
   the same way *"Please stop texting me"* was missed on 2026-07-19.

**The classifier deliberately differs from `WF-Loyalty-Inbound`.** Measured against 1,236 real inbound SMS
on this number, porting loyalty's first-token matcher verbatim would have **hijacked 73 conversational
"Yes" replies (5.9%)**, and the only STOP-leading message in the entire corpus is *"Stop giving me the run
around. I need a manager NOW!"* — an escalation it would have silently opted out and answered with a cheery
goodbye. So: **whole-message exact match, SMS-only, `YES`/`CONTINUE` removed.** The two keyword lists must
stay different — do not "fix" the inconsistency.

Case and punctuation are handled (`toUpperCase()` + strip non-letters): `stop`, `Stop.`, `sTOp!` all match.
Extra *words* deliberately do not.

**Proof (all four rows are the first `avery_inbound` consent events ever written):**

| Time (UTC) | Keyword | Result |
|---|---|---|
| 14:05:55 | STOP | flag → false, `consent_event` written |
| 14:12:58 | START | flag → true |
| 14:29:31 | STOP | flag → false + confirmation SMS |
| 14:29:43 | START | flag → true + confirmation SMS |
| 14:29:52 | HELP | reply sent, **no consent written** (correct) |

**Confirmations** send *after* the consent write — the row is the legal record, the text is courtesy, so a
failed send can never cost us the record. HELP previously was classified and dropped; it now returns the
CTIA-required program name + contact + opt-out instructions.

**"Reply START anytime to opt back in" is deliberate and compliant.** A review flagged it; adversarial
verification **refuted** that. SoundBite Declaratory Ruling (FCC 12-143) ¶12 expressly permits
*"instructions as to how a consumer can opt back in,"* and FCC 24-24 ¶27 cites it. What is prohibited is an
**inducement** to return (SoundBite's example: *"we are offering you a 10% discount"*). Keep the keyword
instruction; never add an offer or a reason to come back.

**Other verified findings:**

- **No loop.** 5 executions for 5 inbound texts — our own confirmations did not re-enter. The reason is the
  rule *type* (`incoming_sms_message` does not fire on outbound), which is stronger than the `To`-condition
  argument. A self-guard mirroring WF2's `Filter Self` is kept anyway, for the case of staff typing a literal
  "STOP" from the venue's own number.
- **SignalWire does not intercept STOP on this number, and sends no carrier confirmation** (owner received
  nothing on either keyword). Opt-out handling on this line is entirely ours.
- **The (a)(12) five-minute safe harbor is met** — observed end-to-end latency ~4 seconds.
- **Unbacked-claim guard.** `record_sms_consent` returns HTTP 200 with `{matched:false}` when the phone
  matches no customer row. The confirmation path now throws rather than telling someone they are opted out
  when nothing was recorded. Zero exposure today (all inbound phones resolve to a customer).
- **Better footing for the transactional carve-out** than "the DA 26-12 waiver": 64.1200(a)(10) limits the
  revocation duty to messages made under (a)(1)–(3) and (c)(2); one-to-one booking replies sent without a
  random/sequential number generator (*Facebook v. Duguid*, 592 U.S. 395 (2021)) are outside that set.

**⚠️ STILL OPEN — the schema cannot express "stop everything."** `sms_marketing_opt_in` is the only consent
flag, and `do_not_market` is already overloaded three ways. Per FCC 24-24 ¶30 a STOP replying to a
*booking* text is arguably an opt-out of **all** consent-required texts, and 64.1200(a)(12) sentence four
permits the confirmation to *request clarification* ("Reply STOP ALL to end those too"). We currently
classify every STOP identically and have nowhere to record an all-channel opt-out. **Decide before the first
marketing send.**

**Also still open:** no DLR/delivery-status feed exists for the 779 number (Missive exposes none), so a
carrier block or hard bounce on Avery's rail remains invisible. The inline-PAT exposure is broader than the
audit found — WF2 alone holds ~20 Missive HTTP nodes, several carrying the literal token.

## 13. Patch cutover — the subtractive pass (RUN THIS ON CUTOVER DAY)

**`patch_import_commit()` cannot turn consent off.** It merges with a one-way ratchet:

```sql
sms_marketing_opt_in = c.sms_marketing_opt_in OR agg.wants_sms
```

After the 2026-07-19 import every Patch contact already sits at `true`, so on a fresh export
`true OR false = true` — **anyone who texted STOP to Patch's number (833-260-2926) after 07-19 is
silently kept opted-in.** Patch's inbound number dies with the account (~07-27/28), after which that
opt-out is unrecoverable and we would keep marketing to someone who explicitly left.

**⚖️ OWNER RULING 2026-07-26 — the opt-out gap is ACCEPTED, not closed.** Jon is exporting recent
signups only, not a full list or the unsubscribed segment. That catches new contacts but *structurally
cannot* catch opt-outs, because an opt-out changes an existing record and never changes its created
date. Measured exposure: 4,447 opt-outs across an 8.3-year list ≈ **1.5/day ≈ ~15 people** in the gap
between the 07-19 export and cancellation.

Judged acceptable, and the reasoning holds: those contacts stay behind `do_not_market` with all three
SMS lifecycle automations disabled, so nothing reaches them today; and when marketing does go live,
anyone wrongly texted replies STOP — which now works and is recorded on both numbers — so it
self-corrects on first contact. ~15 of ~18k is 0.08%, inside carrier complaint-rate noise.

Residual risk, for the record: recent opt-outs are the *most* likely to report spam, and first-send
complaint rate is what carriers score a 10DLC campaign on. If deliverability ever degrades after the
first big send, this is a candidate cause.

**Cutover sequence:**

```
1. Export the FINAL contact list from Patch (do this BEFORE cancelling — the export dies with the account)
2. node scripts/patch-import/load-staging.mjs "Patch Export/cleaned"    # Loyalty repo
3. select patch_import_commit();                    -- additive delta (new contacts, new opt-ins)
4. select patch_reconcile_optouts();                -- DRY RUN, reports what it would do
5. select patch_reconcile_optouts(false);           -- applies the subtractive delta
```

`patch_reconcile_optouts()` (shipped 2026-07-26) mirrors the importer's own `wants_sms` predicate
exactly, so the two can never disagree about who is textable. It flips Patch-marked opt-outs to
`sms_marketing_opt_in = false` and writes a `consent_event` per person, `source_ref =
'patch-final-optout-reconcile'` so the subtractive pass stays separable in an audit.

**Safety:** it only touches customers whose opt-in is sourced `csv_import_patch` — i.e. Patch's word is
the *only* reason we believe they consented. A guest who later opted in first-party (checkout /
web_form / kiosk / avery_inbound) has fresher, better evidence and is never overridden by a stale
export. Currently 18,370 of 18,379 opt-ins are Patch-sourced; 9 are first-party and protected.

Dry run against the 07-19 staging snapshot returns **0**, which is correct — the 388 customers whose
staging rows show `sms_on=false` all have a duplicate Patch record still showing opted-in, and
`bool_or` keeps them in (the same tie-break the importer uses).

## 14. Gap 4 + the DLR feed — CLOSED 2026-07-27

**Consent evidence (gap 4):** checkout consent events now carry CTIA-shaped evidence (tprs #45 +
Website `b0066d1`): verbatim `consent_language` (variant-aware — the "$10 OFF" card and the plain box
are different disclosures, sent by the client which alone knows what rendered; transcription
single-sourced in `consentCopy.ts` with tripwire comments both sides), real client IP (first
x-forwarded-for hop — `request.ip` is Render's LB), user-agent, route, a phone/email snapshot (the
customers row's PII is overwritten every checkout), and `sourceRef` = cart token. Evidence is
additive: absent evidence writes the old bare row (test-locked). Urgency came from the $10 reward
making checkout the platform's highest-volume consent writer.

**21610 feed:** `record_delivery_status()` now converts a carrier-enforced STOP (error 21610 on a
loyalty-rail delivery receipt) into a real opt-out — flag false + `consent_event`
(`signalwire_dlr`, source_ref = message SID) — closing the "carrier honors it, DB never learns"
divergence on the one rail that has DLRs. Deliberately NOT `sms_bounced`: 21610 is consent, bounce
is capability; conflating them buries a legal signal in a deliverability flag. Idempotent on webhook
replay (event dedupe + the consent_event partial unique index). Capability codes
(30005/30006/21211/21614 → `sms_bounced`) unchanged. Avery's rail still has no DLR feed (Missive
exposes none) — that residual stands, mitigated by the lane-marketing-on-loyalty-number doctrine.

**Remaining before the first marketing send:** the rebook campaign build itself (new session; spec =
[2026-07-19 handoff](session-handoffs/2026-07-19-avery-rebook-campaign-spec.md)) · quarantine lift +
parked-cohort release (owner) · drip-don't-blast the accumulated opt-in backlog · watch STOP rate.

## 10. Operating rule on revocation scope

47 CFR 64.1200(a)(10): revocation may be made "by using any reasonable method" and must be honored
"within a reasonable time not to exceed ten business days."

FCC CGB order **DA 26-12** (Jan 6, 2026) extended the *revoke-all-on-unrelated-matters* portion to
Jan 31, 2027 — **but that waiver does not authorize continuing transactional booking texts after a
marketing STOP.** It is framed around informational messages pushed to unrelated matters (the record is
banks, healthcare, utilities), and 64.1200(a)(12) — in effect, never waived — says that where a recipient
consented to several categories, the sender "must cease all further texts for which consent is required
absent further clarification."

**Safe operating rule: treat a STOP on the SMS channel as stopping all consent-required texts from that
sender.** If we want booking texts to survive a marketing opt-out, the compliant path is the one the rule
names — a single confirmation text asking the guest to clarify scope — plus per-category consent captured
up front. (Separately: a genuinely one-to-one, non-autodialed booking text sits outside §227(b) consent
entirely. That is a stronger argument than the waiver and worth keeping distinct.)
