# 2026-08-12 — Needs-Attention resume safety: the reconciler heal, staff-money whitelist, gate hygiene, receipt note, and label digest (ALL LIVE)

**Cross-repo: Marketing Avery (n8n + brain) · Supabase `twistedpin-platform` · tprs (doc only).**
Triggered by Jon's question: staff take over NA-flagged threads, finish the work (quote, book, send a deposit link), and then *fear removing the label* because Avery would resume unaware. Investigated with a 16-agent evidence pass + adversarial verification; built the same day on Jon's greenlight.

## The finding that shaped everything

Avery is **fully blind during a takeover** — the Missive rule feeding WF2 (`751509cc`, "Label is not Needs Attention") stops delivery upstream, so zero WF2 executions happen while NA is on (proven: 7 guest messages on Ornella's thread between two executions 12h44m apart). There is no cursor to maintain because nothing runs that could maintain one. On resume, WF2's live last-10-message fetch + the manual-quote CRITICAL RULE already recover the modal case (81% of takeovers are ≤10 messages). What was actually missing was **one NULL column**: `tprs_booking_id`. The `_bk` EXISTING BOOKING prompt block — which already encodes exactly the resume behavior Jon wanted — keys entirely on it, and the 15-min reconciler refused to write it until money landed (`b.status IN ('deposit_paid','fully_paid')` — a payment reconciler wearing a booking reconciler's name).

Flagship case: **E-8243279 / Ornella Dian / INV-2026-00400** ($1,316.49 total, $657.50 deposit, link expires 2026-08-15 02:05Z). Staff renegotiated Italiano→Stars & Strikes at $1,320, sent the link, collected an email — and every Avery column stayed NULL while `thread_summary` confidently instructed "treat $1,475 as active quote."

## What shipped (all live, in apply order)

1. **Supabase migration `reconcile_avery_booking_state_widen_pending_deposit`** (Supabase chain, NOT drizzle — per `tprs/docs/avery-conversation-reconciliation.md` these functions deliberately live outside CI). Arm B heals unlinked rows at `pending_deposit` too: `tprs_booking_id`, `booking_reference`, `booking_status`, `payment_rail`, magic-link url/expiry/`link_sent_at` (newest `magic_link_token`), `quote_confirmation_status` `needs_summary_yes`→`not_ready`. Arm A's first-write-only latch (`tprs_booking_id IS DISTINCT FROM`) became a **real difference test** so out-of-band payments (cash/comps) still propagate to pre-linked rows. **Both ambiguity guards write NOTHING** (>1 booking per event row; >1 matching event row per booking — 3 live duplicate pairs exist; booking already claimed). Job 8 (`reconcile_avery_conversation_ids`, fills `bookings.avery_conversation_id`, was daily 9:00 UTC) → `*/15` so a fresh staff booking links within ~15–30 min, not next morning. **Verified: first manual run healed exactly Ornella's row; second run returned 0 (converges). Dry-run SELECT before apply showed exactly 1 would-write.** Caught during apply: the draft's arm B referenced an unjoined `fp` alias — fixed before apply (would have failed at first execution).
2. **WF2 booking-money read** (n8n direct, NOT brain): `Lookup Event` gained a LEFT JOIN LATERAL producing `booking_total_dollars` / `booking_deposit_dollars` (earliest frozen `quote_snapshot->>'totalIncludingTax'` wins — never re-price; line-item + 8.75% fallback only when no snapshot; **the 0.0875 literal couples to tprs `SALES_TAX_RATE_BPS`**). `Load Context` maps both fields (named-field mapper — nothing flows until listed there).
3. **Brain deploy (4 files, `deploy-n8n.mjs --only WF2 --skip-golden --yes`, byte-verified, canary re-baselined):**
   - **Dollar whitelist extension** (det-checks + re-check, both): booking figures (NOT gated on `_tprsPaidTier` — booked truth per Jon's ruling *"booking figures win when a booking exists"*) + **staff-typed thread dollars** (regex over [AVERY]-tagged history lines, extracted once in Build Avery Request, exported as `thread_staff_dollars`; guest figures never enter; entities decoded `&amp;` before `&#36;`). Accepted limitation: Avery's own prior figures share the AVERY tag and are whitelisted too.
   - **quote_preface leak closed**: the dollar check now ALWAYS runs (was skipped on `quote_needed===true`) and scans `fixed + quote_preface`; multi-date guard keeps its non-quote-turn scope.
   - **`_bk` money lines**: paid + unpaid branches (and `_bkRetry` mirrors) state total/deposit with cents — "what was my total?" is now answerable on booked rows; remaining-balance math stays banned.
   - **headcountFlexPreQuote suppressed** when `isBooked` (no readback-before-quote on booked events; revive flows keep flex).
4. **Set Route LIVE-BOOKING HARD BLOCK** (hand-mirror node, MCP edit): live booking + `book_event_intent=true` → intent forced off, `book_block_reason` set, falls through to a NORMAL reply (empty commit-shaped drafts get a deterministic first-person ack + `escalate=true` — never the old silent_escalation ghost, never a double-book). RESURRECT path byte-preserved.
5. **Gate hygiene (three fixes):** WF5 `fp_chase_send` gained the live NA label check (clone of the HC pair; skips WITHOUT stamping `fp_status`, re-evaluates next run; `fp_escalate` untouched) — it was the last money path on the leaky `ai_status` mirror. WF1's escalation branch gained `Esc Contact Paused?` (paused contacts get the staff-note chain instead of an Avery-voiced holding message — this hole let Avery speak into staff-held threads TODAY). API Replay Queue's `Decide Action` now live-checks NA before replaying (NA → `supersede`, terminal; fetch-fail → `defer`; stale pre-takeover label snapshots can no longer re-arm WF2).
6. **WF3 case-0 receipt** (2 nodes after `Set AI Status Active`): on NA removal, force-run the reconciler, then post a Missive note — *"Avery resumed on this thread. What she believes: booking / payment link + expiry CT / food package + menu state / guests + date / contact on file. Wrong or incomplete? Re-apply Needs Attention, or correct it in the thread."* Un-healed rows say the booking "links automatically within 15 minutes" (never "no booking exists"). Idempotent `[Avery resumed …]` line appended to `thread_summary` (POSITION guard; per-field COALESCE so NULLs can't blank it). Note POST is `executeOnce` + non-fatal.
7. **`Avery - Label Hygiene Digest`** (NEW workflow `eVXMYwPzUy3tGNTz`, 4:50am CT + test webhook `label-hygiene-test` w/ brain-canary secret, ACTIVE). **v2 the same evening after Jon saw the v1 email ("a 101-line wall nobody would read"): MONEY-CLOCK-ONLY.** It emails jon@ **only** when a payment link on an NA-flagged thread dies within 48h — a few lines with Missive deep-links + a one-line standing-counts footer (A: label-on+active / B: the ~70 fanout fossils / C: stale-NA as bare numbers). Zero money clock = **no email at all**, even when A/B/C have rows. Full inventory stays queryable via the SQL node (test webhook + read the execution). Reads `avery_conversation_sync.labels_current` — zero Missive API calls. Day-one counts: A=12, B=70, C=19, money=0; v2 test-fire correctly sent nothing (exec 16402).

## Rulings recorded this session (Jon)

- **Whitelist scope: DB + staff-typed** dollars (guest-typed never).
- **Label on = staff own the money clock** (the reminder/win-back `ai_status` clause STAYS; the digest's money-clock section is the countdown). Label off = Avery owns the cadence, staff promises included.
- **LLM catch-up + awareness cursor: deliberately SHELVED** (recorded in 3 changelogs). Revisit only on a real bad resume or the Q4 volume check-in. The pre-red-teamed design lives in this session's workflow outputs.
- Skip the golden suite on this deploy (standing ruling, `--skip-golden`).

## Traps discovered

- **The n8n MCP `patchNodeField` matcher is FUZZY** — it reported "found 2/4 times" for strings that occur exactly once (byte-counted). Similar sentences (the four `_bk` branch endings) cross-match. Long unique-context anchors work; fine-grained suffix edits don't. The brain deploy script is the reliable path for brain nodes.
- **WF2.changelog.md is CRLF**; the other changelogs are LF. Script edits must match.
- Prior sessions' claim that "Load Context is the Postgres query node" was wrong — the SQL lives in **`Lookup Event`**; Load Context is a Code-node mapper. Neither is brain-mirrored.

## Watch list

- **First real NA removal** → expect the receipt note in-thread within seconds; check `WF3` execution + the healed fields it renders.
- **Ornella (E-8243279):** said she'd pay "tomorrow" (8/13). If NA is still on at 4:50am 8/13, the digest's money-clock line is the countdown (link dies Fri 8/14 9:05pm CT (2026-08-15 02:05Z)). If staff clear NA, the 22h reminder becomes eligible immediately (all predicates now pass except `ai_status`).
- **First money question on a booked row** → expect $-figures stated with cents and passing checks (not an NA bounce).
- **First commit-shaped turn on a live-booked row** → expect the deterministic ack + NA flag, never silence.
- ~~Digest day 2+ noise~~ — resolved same day (v2 money-clock-only). Remaining open item on the fossils: the 70 paused-no-label contacts still have every campaign silently off; surfacing them is now on-demand, and clearing them is a one-time SQL under Jon's own ruling if he ever wants it.

## Rollback

Migration: `CREATE OR REPLACE` back to Supabase migration `20260718232147` body + `cron.alter_job(8, schedule => '0 9 * * *')`. WF2 nodes: revert via brain git history + `deploy-n8n.mjs`; Lookup Event/Load Context per WF2.changelog entry. WF5/WF1/WF3/replay: delete the added nodes / restore the single connection (WF3 rollback trap: never restore a pre-2026-08-02 version — fanout). Digest: deactivate `eVXMYwPzUy3tGNTz`.
