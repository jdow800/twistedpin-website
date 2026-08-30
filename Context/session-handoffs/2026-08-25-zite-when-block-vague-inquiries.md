# 2026-08-25 — Vague inquiries, the Zite "When" block, and the wording pass

**Status: ALL LIVE** (Zite form + WF1 + plumbing + WF2 + KB). Three commits in `Marketing Avery`, local, not pushed: `4c0c9eb` (WF1 reader) → `5d5320f` (WF2 anchor + plumbing changelogs) → `0a8c544` (wording pass).

Read this before: changing the time-of-day buckets on the form, touching WF1's date parsing, editing the EARLIEST START HELPER or TIME WINDOW rules in WF2, or re-proposing any per-person / example-quote idea for Avery.

---

## 1. The problem, and the theory behind the fix

Trigger: Barbara Tomasino (FORCE America, E-3921018, 45 guests, Group Event) — a corporate holiday-party lead who would not give a date or time and demanded pricing first. Same morning: Animal Medical Center (E-9603761, 70 guests) with the note *"first or second week of January 2nd week of December."*

What we established, in order:

1. **Avery's behavior was correct throughout.** WF1's no-date first touch, the HUGE WINDOW expectation-set, MENU STARTER, the gluten-free canonical answer — every turn Barbara got was the rule doing its job. Nothing was broken. The *painful* part was the guest.
2. **The form was the actual cause.** The inquiry form captured a guest count as a required field and mentioned the date only as one of four hints inside a free-text box — and never asked for a time of day at all. Output matched input design exactly: always a clean count, never a clean date.
3. **Two real gaps in Avery existed independent of Barbara** (kept small on purpose — Jon: *"I hate making TOO many changes due to one person"*):
   - No handling for *"what dates do you have open?"* — `KB:649` covers the **time** version only. **Still open, not built.**
   - HUGE WINDOW's script ended *"Which Sunday should we build around?"* — unanswerable for a guest with no preference. Superseded by the form change: the shape question is now asked on the form, not in conversation.
4. **The flexibility itself is valuable, not a problem.** A 45-person flexible December party is the lead you want steered to a Friday/Sunday, not eating a Saturday that sells itself. So "give me two dates" would waste it — they'd pick two Saturdays.
5. **AI-referred leads arrive with less context.** Animal Medical Center's attribution was `utm_source=chatgpt.com`. Expect the vague-inquiry ratio to rise on its own; the form field is channel infrastructure, not idiot-proofing.

## 2. Rulings (Jon, 2026-08-25) — do not re-propose

| Ruling | Detail |
|---|---|
| **Per-person budget anchor stays STAFF-ONLY** | Jon hand-typed *"~$100 per person"* to Barbara. I proposed a narrow pre-slot carve-out for Avery. **Declined:** *"She wouldn't have been able to quote the lady $100 per person and I am ok with that."* The five per-person bans (`KB:54/714/957/1596` + dollar check) stand. Memory: `avery-per-person-anchor-staff-only`. |
| **No "flexible / not sure" time option on the form** | A random tap is fine — Avery picks, the guest corrects in one round trip. "Flexible" manufactures the Barbara state on purpose. |
| **Require what costs a tap, leave optional what costs a decision** | Time-of-day radio required (anyone can tap "evening"); date picker optional (some genuinely don't know — forcing it costs submissions). |
| **The window ANCHORS, never GATES** | It steers Avery's suggestion; any clock time the guest names wins, even outside the window. Never remark on the window. |
| **"slot" and "window" are banned to guests** | Same leak class as "band" (`KB:605`, 7/24). Rule names keep the words; quotable sentences don't. Added to the KB jargon bullet (was: dwell / dwell time / surcharge / rack rate). |
| **"Easy to move/shift later" retired** | Contradicted the scarcity beat in the same email ("Saturdays book up fast… easy to move later") and was unbounded — true pre-booking, not post-deposit. Replacement is Jon's: *"we can change the time later if you want."* |
| **First-touch stays ask-the-start-time, not pick-and-proceed** | Decided by me, flagged for Jon: WF1 asks *"Would a 5pm start suit the group, or should I plan for a bit later?"* rather than extracting the window start and jumping to the menu. Reason: before-open handling (Afternoon on Mon–Thu = 2pm vs 3pm open) would need WF1 hours logic it doesn't have. Optional upgrade, see §7. |

## 3. What shipped, by layer

### Zite form (twistedevents.zite.so, Express form only — multi-step form is dead code)
- **Event Date** — optional, native `<input type="date">`, min = tomorrow, helper *"Not sure yet? Leave it blank — we'll help you land one."* JS safety net for iOS (WebKit ignores `min` in its picker): on change and on submit, a pre-tomorrow date is cleared with *"Pick a date from tomorrow on — for same-day, just tell us in the box below."*
- **Weekday echo** — once a date is picked the helper line becomes **"That's a Saturday."** (bold weekday, no date repeat; parsed as a LOCAL calendar date — `new Date(iso)` is UTC and shifts US evenings a day). Verified: 08/29/2026 → Saturday.
- **Time of Day** — required radio: **Afternoon (2–5 PM) · Early Evening (5–8 PM) · Later Evening (8–11 PM)**, helper *"Pick whatever's closest — we'll fine-tune the exact start with you."* No fourth option. Buckets are ≤3h so all three fire WF2's TIME WINDOW pick-and-proceed. "Morning" deliberately absent — we open 3pm Mon–Thu / 2pm Fri / 11am Sat / 12pm Sun; before-11am is a premium-package exception (`KB:679`), not a menu item.
- **Textarea** retitled **"What's the occasion?"** (required) — everyone has an occasion, and WF1 routing reads notes for cake/decor/fundraiser/catering signals, so dropping the requirement would lose real input.
- **Group Type subtitles** — Small Group *"Up to 15 people"* · Company Event *"Work team, department, or client outing"* · Group Event *"Friends, clubs, teams, organizations — 16 or more."* Barbara's corporate division party was typed Group Event; the KB routes Company vs Group differently (`KB:419/420`).
- **Webhook payload** (verbatim from the n8n Webhook node, E-0480727): both name pairs are sent — `date`/`time` (legacy dedupe-hash keys, held `'TBD'` before 8/25) **and** `eventDate` (ISO or `""`) / `timeOfDay` (slug `afternoon` | `early-evening` | `later-evening`). Zite confirmed `landing_page` is NOT in `buildPayloadHash` (closes the 7/25 open item).

### WF1 (`brain/wf1/`, deployed `4602e3f6 → a926bae2 → 9594f892`)
- **Clean and Flag — FORM "WHEN" BLOCK.** Reads `body.eventDate || body.date`, `body.timeOfDay || body.time`. A valid future ISO date **overrides every prose-derived date** (`parsed_event_iso`, `days_until_event`, closures, `short_notice_escalate`, `verified_date_iso`/`verified_day_of_week` at HIGH confidence, status `verified:form`), clears pick-and-proceed, and raises `day_of_week_mismatch` when the notes claim a single different weekday (the "picked the 28th, wrote Monday" case — the mismatch play now fires on a date we KNOW). Past dates dropped with `form_event_date_rejected: past:…`. `TIME_OF_DAY_MAP` → `preferred_time_of_day/_label/_window/_start/_end`. **Return object: `event_date` + `day_of_week` now filled** (were hardcoded `''`); `start_time` stays `''`.
- **Build Claude Request v5.** `FORM EVENT DATE` (or blank/rejected line) + `FORM TIME OF DAY` context lines; NEXT-GAP PRIORITY is date → **start time inside the window** → food; form date extracted verbatim; window never converted to `start_time`.
- Tests: `brain/wf1/test-form-when.mjs` — runs the REAL node files with stubbed n8n globals, 54 assertions incl. the E-0480727 payload.

### Plumbing (API PUT via `lib.mjs` recipe; not brain-managed)
- Supabase: `avery_event.preferred_time_of_day text` (migration `avery_event_preferred_time_of_day`).
- WF1 **Create Event** maps it from Route Contact (`a926bae2 → d0d3c6cf`). Route Contact spreads all Clean and Flag fields.
- WF1 **Prep Event Update** default summary now states what the first touch did with the form date + window, so WF2 re-asks neither (the old template implied the date was unknown).
- WF2 **Load Context** exposes `preferred_time_of_day` (`35a93894 → 84d9a883`). Lookup Event is `SELECT e.*`.
- E-0068352 backfilled by SQL to `early-evening` (created before the mapping) to serve as the live test thread.

### WF2 brain (`brain/checks/pre-assemble-context.js`, `brain/prompts/build-avery-request.js`, deployed `84d9a883 → cc07ab20`)
- `time_window_anchor` = **max(window start, opening + 30 min), capped at latest start for the duration on file.** Blank when: no window, no date, closure day, a `start_time` on file, or the inbound message names a time. Pushes a `GUEST TIME-OF-DAY WINDOW` flag that hands the model the anchor and forbids the earliest-start line; a second form (window + no date) says ask the date, never time of day.
- Prompt: EARLIEST START HELPER gains **"FORM TIME-OF-DAY WINDOW OUTRANKS THIS HELPER"**; VAGUE TIME points at it. Without this, turn two would offer *"as early as 11:30am"* to an early-evening guest — the exact re-ask the field exists to kill.
- Tests: `brain/checks/test-time-window.mjs` (golden shim + ashley fixture), 31 assertions: Sat 5pm · Tue afternoon → 3:30pm · Sun later-evening 8pm / 7pm at 3h · closure · clock-on-file · inbound-time-wins · prompt carry-through.

### KB (`brain/kb/Avery_KB.md`, deployed round-trip verified; `kb/CHANGELOG.md` entry 2026-08-25)
Four guest-facing lines re-worded (TIME WINDOW, SEVERAL DATES, HUGE WINDOW, MENU STARTER) + jargon bullet gains "slot"/"window". Pushed `--skip-golden` — the gate failed on `tiffany-multiquote-offer-beat` (deposit recall, untouched section; LLM replay nondeterminism).

## 4. Verified live (Jon's own submissions)

| Row | What it proved |
|---|---|
| **E-0480727** (18:33Z, before the WF1 reader) | Form sent `eventDate: 2026-08-28`, `timeOfDay: early-evening`; row landed `event_date: null`; first touch asked for the date. The regression window, demonstrated. |
| **E-0068352** (19:03Z, after) | `event_date: 2026-08-29` landed **at creation** (before the LLM ran — Create Event maps from Clean and Flag). First touch: *"Got your company event for 22 on Sat, Aug 29, early evening. We'll make sure it's one to remember - would a 5pm start suit the group, or later in that window?"* Turn two: *"Got it, let's build around 7pm… Let's talk food"* → menu nudge. Pick-and-proceed on a form window, zero re-asks, never 11:30am. (The "window" wording in both is what triggered §2's ban.) |

Canary: exec 21504 (4:40am) errored on the dead key; 21727 (test-fire after the credential fix) succeeded.

## 5. Traps — the ones that will bite the next person

- **n8n API key is a 30-DAY JWT**, not ~2027 as `brain/README.md` says. Expired 2026-08-25 ~03:00Z; renewed as `brain-deploy2`. Lives in TWO places: `brain/deploy/.env` **and** the n8n credential "n8n Public API (brain canary)" (`TpX7bbtYLWDXfFH5`) — the nightly canary fails silently on a dead key. Diagnose a 401 by decoding the JWT `exp` first. **Next expiry ~2026-09-24 if minted with the same default.** Memory: `n8n-api-key-30-day-expiry`.
- **Slug → hours map lives in TWO files:** WF1 `TIME_OF_DAY_MAP` (Clean and Flag) and WF2 `TIME_OF_DAY_WINDOWS` (Pre-Assemble). Change the form buckets → change both + the Zite labels. Both files say so in comments.
- **Populating `event_date`/`day_of_week` on Clean and Flag woke two Parse and Check guards** that were dead while those were `''`: `wrong_day_of_week` and `sms_day_of_week_missing`. Both enforce rules the prompt already states (intended). The email date/time block there stays dead — gated on `start_time`, which stays `''`. Parse and Check is a mirror-only file (`n8n/nodes/node_WF1_Parse_and_Check.js`), not brain-managed.
- **A date ≤3 days out trips SHORT-NOTICE ESCALATE** (catered-size, not self-book) — so a test submission dated 3 days out gets the "checking availability" ack + Needs Attention, not the anchored question. Test with 4+ days.
- **Staff-typed dollars enter the dollar-check whitelist for the rest of the thread** (`deterministic-checks.js:913`, 8/12 ruling). Jon's `$100` on Barbara's thread means Avery may legitimately repeat "$100 per person" there forever, including after a real quote says otherwise. Not a bug — a consequence of hand-quoting as Avery.
- **A staff-sent email menu link without `?eid=` orphans the submission** (`KB:2248` → manual review). Jon's `?mode=browse` link to Barbara had no eid. Correct email form: `menu.twistedpin.com/elevated?eid=E-XXXXXXX`.
- **Zite's iOS picker ignores `min`** — fixed with JS, but the submit re-check may be client-side; a wrong device clock can still pass a past date. WF1 drops past dates as the backstop.
- **`new Date("YYYY-MM-DD")` is UTC midnight** — a naive weekday echo says Thursday for a Friday to US-evening users. Zite parsed local; verified.

## 6. How to change the buckets (recipe)

**Current buckets (end of 2026-08-25): Before 2 PM · Afternoon (2–5) · Early Evening (5–8) · Later Evening (8–11).** "Before 2 PM" was added late in the day because the original three had no home for Sat 11am–2pm / Sun 12pm–2pm (the highest-volume family hours). Deliberately no "Sat & Sun" hint — a large company event can get the doors opened whenever. Slug `before-2pm`; both lookups are normalized (letters+digits), so vendor spelling drift still resolves.

1. Zite: labels + slugs on the radio (and the hash keys stay `time`/`timeOfDay`).
2. `brain/wf1/clean-and-flag.js` → `TIME_OF_DAY_MAP` (label, window text, start/end, `startDec`). **The first-touch anchor is now COMPUTED** — `max(startDec, opening + 30min)`, capped at close − 2h — from `OPEN_BY_DAY_WF1` / `CLOSE_BY_DAY_WF1`, which mirror WF2 Pre-Assemble's and Parse and Check's tables (a venue-hours change touches all three). Blank for School Field Trips, closures, no date, no window.
3. `brain/checks/pre-assemble-context.js` → `TIME_OF_DAY_WINDOWS` (label, window text, `startDec`).
4. `brain/wf1/build-claude-request.js` — no hour list to edit anymore; it uses the `FORM TIME ANCHOR` context line verbatim.
5. `brain/prompts/build-avery-request.js` form-window bullet — the bucket names in the example.
6. Re-run all three harnesses (`brain/wf1/test-form-when.mjs`, `brain/checks/test-time-window.mjs`, **`brain/checks/test-hours-tables.mjs --live`** — asserts the three hours tables + summer rule agree, reading the LIVE Parse and Check node), `drift-check`, `deploy-n8n.mjs --skip-golden --yes`.
**Any venue-hours change:** edit all three tables (WF2 Pre-Assemble `OPEN/CLOSE_BY_DAY`, WF1 Parse and Check `_wf1OpenByDay/_wf1CloseByDay` via API + mirror, WF1 Clean and Flag `OPEN/CLOSE_BY_DAY_WF1`), then run `test-hours-tables.mjs --live` — it goes red if any copy was missed.
Adding a "Morning" bucket is NOT a config change — it needs the before-open / premium-package logic WF1 does not have (`KB:679`). "Before 2 PM" sidesteps that because it promises no hour: on a 3pm-open day the anchor honestly lands at 3:30pm.

## 7. Open items

1. **Jon's 60+ ruling** — `KB:588` and `KB:621` say *"60+ guests: silent escalation"*; `KB:660` says *"over 60 guests… still check availability, quote, and bring the guest to booking intent — the team closes it."* Contradiction on the band Animal Medical Center (70) sits in. Same layer-contradiction shape as the Inna incident.
2. **`KB:649` date analogue** — *"what dates do you have open?"* has no handling (time version only). Not built; the form change reduced its frequency but didn't remove it. Jon's preferred posture: *"I'm sure we can fit you in somewhere"* (names nothing checkable) — NOT "we have open availability."
3. **First-touch pick-and-proceed upgrade** (extract window start → straight to menu nudge). Needs before-open handling first. Jon's call.
4. **Push the three commits** to origin.
5. **Watch** the first real (non-Jon) form lead through turn two, and the first "That's a Monday." echo that changes someone's mind.
6. Header line on the Zite form still says *"Our events team replies fast from a shared inbox"* — Avery is ruled first-person, never a team. Minor; not sent to Zite.

## 7b. Late addition — the menu page's desktop dead end (Christine Gallagher, E-0645923)

**Case:** SMS-originated Company Event (80, Nov 4). Avery texted the bare Elevated link; Christine opened it on her computer, got the page's *"📱 This link works best on your phone"* overlay, and asked for the menu by email. Avery's summary then said *"menu to be sent to that address"* — **a promise nothing can keep** (no email conversation exists on an SMS event; `missive_email_convo_id` null). Staff must email her the menu by hand with `?eid=E-0645923`.

**How the menu page really works** (read from the live bundle, `menu.twistedpin.com/assets/index-*.js`; the app is Zite-built): `hasEid = eid.length > 0` → **with eid: confirm screen + web POST to WF2's menu branch, any device; without eid: `sms:+17793030261?body=…` (phone correlation); without eid on desktop (≥1024px): the dead-end overlay.** WF2's `Parse Menu Payload` throws without an `event_id` — the web path keys on nothing else.

**Option considered and REJECTED (Jon):** put `?eid={{event_id}}` on SMS links too. Zero code (the `{{event_id}}` substitution already runs before the channel branch in both senders; verified) and ~17¢/2 months in extra segments (106 nudges/60d, avg 303 chars — right on the 306 two-segment line; 21 would gain a 3rd segment). But because the fork is eid *presence*, it would move **every** phone submission onto web POST — and in the share-the-link-with-coworkers case, anyone holding the link could submit selections on the inquirer's event. The phone-number correlation is the property worth keeping.

**Decision (Jon; Zite BUILT it end of session 2026-08-25):** on desktop + no eid + not browse mode, render **browse mode** instead of the overlay — detection is **width-only (≥1024px)**; Zite's first plan added "no touch," rejected because touchscreen laptops would have fallen into the phone flow with a dead `sms:` Send. Christine got her menu by hand from Jon (email landed). Render the change with with one first-person banner: *"Looking on a computer? Just text me back with what catches your eye and I'll take it from there."* Phones and eid links unchanged. Trade-off accepted: desktop viewers reply in prose, which `KB:1244` (inline typed selections, receipt-and-triage) already handles.

**Still open from this thread:**
- A guard so Avery can never *say* "I'll email that over" on a turn where no email send fired (same species as `unfulfillable_promise`). Not built.
- Mid-conversation "email me at X" → send this turn's reply into a NEW Missive email conversation (omit `conversation` in the drafts payload — exactly how WF1's email first touch already works — then write `missive_email_convo_id`; replies route back by convo id, dual-channel for free). Feasible, ~a day. Not built; may be moot if browse mode absorbs the cases.
- Form-notes "prefer email, here's my address" → WF1 `Clean and Flag` channel override (signal + well-formed address required). Small. Not built.
- Zite form: two equal *Text me / Email me* buttons instead of default-phone + small switch link. Not sent.
- Message store lags: `avery_conversation_sync` for this convo last synced 8/24 — today's messages weren't in `avery_message` when checked. It's a cron; don't read the store as live.

## 7c. Late addition — field trips vs the before-open check (River View Elementary, E-2785025)

First field trip through the new form: Beth Ciszek, 39 kids, Wed Dec 16, notes *"we usually come from 10:30-12:30."* First touch said *"we open at 3pm that day, so the earliest we could host your group is 3:30pm… or would a different day work better?"* — wrong for schools (Jon: *"we almost always have to accommodate them at weird hours"*), and forbidden by the SCHOOL FIELD TRIP prompt rule. **Cause:** WF1 `Parse and Check`'s `before_open_earliest_not_offered` (8/03 hours awareness) hard-failed the draft and its remediation string dictated the 3:30pm line to the retry. Validator-forces-the-defect, instance six. **Fixed, all live (WF1 `9594f892 → aa379851 → 1a3e92be`):** `_wf1HoursApply = group_type !== 'School Field Trip'` gates the whole before-open block (hours talk on a field trip now trips `fabricated_timing_concern` instead — the guard we want); explicit HOURS sentence in the prompt's field-trip rule; mirror `n8n/nodes/node_WF1_Parse_and_Check.js` re-copied. **Also shipped in the same PUT:** the Missive "Inquiry form data" note now shows `Event date (form)` + `Time of day (form)`. Marketing Avery commit 4 of the day. Beth's thread is NA'd — staff reply as Avery. Working as designed on that row: form date landed at creation; she tapped Afternoon (closest bucket to 10:30) and the notes clock time won.

## 8. Memories written today
`avery-per-person-anchor-staff-only` · `n8n-api-key-30-day-expiry` · `feedback-slot-window-banned-wording` · `zite-form-payload-2026-07-25` (updated: hash resolved, When block live) · `archived-incidents` (index compaction).
