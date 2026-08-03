# 2026-08-03 — Inna birthday incident → kids-party-first routing overhaul (Marketing Avery, cross-layer)

**Status: ALL SHIPPED LIVE same session. Golden suite 9/9 PASS after. This doc is the narrative of record; the technical diffs live in the Marketing Avery changelogs (WF1 / WF2 / AfterHoursRelease / kb CHANGELOG, all 2026-08-03 entries). Memory note: `wf1-birthday-selfbook-regression`.**

---

## The incident (what a guest actually experienced)

Inna Batsala (E-9127481, conv `175c77bc-0607-497d-9ce5-2d7b436b5391`), evening of Aug 2: Zite form "Birthday or Family Gathering", 10 guests, notes "Birthday party."

1. **WF1 first touch offered the lanes-vs-event fork** ("just want lanes → twistedpin.com/book") — a fork the WF1 prompt itself EXCLUDES for birthdays. Byte-for-byte regression of Shane Coyne (exec 1323, 2026-05-29), the incident the intent-first redesign was built to prevent.
2. Guest replied with maximal event intent ("daughter birthday, 10-12 kids, with food. Can I bring my cake?"). She qualified for the Kids Party package on every axis: turning 12 (gate 4-12), 12 kids (≤14), Sunday (kids parties run Sat/Sun). Avery even named the package — then the KB's scripted clarify ("supervising, or seating and food for them at the lanes too?") bundled seating with participation, her ambiguous "I prefer everything at the lanes" was read as 4 participating adults → blended 16 → catered flip, and KB's "never name or pitch the Kids Party package" cliff made the one product that permits her cake vanish.
3. Asked "how much approximately" at 10:57pm → numberless readback ("here's what I have for a bowling-and-lanes estimate" — no estimate) + "food package or just the lanes?" — the model was structurally unable to state a number (quote_history empty + needs_summary_yes gate + availability-probe dollars deliberately hidden from it; TPRS had already computed $415/$210 internally).
4. "Lanes for now" at 11:02pm → parked by the after-hours gate (11pm–9am hold). At the 9:10am release, attempt 1 tried the lanes-only quote → killed by the 7/04 `bowling_only_quote_attempted` hard check; the retry silent-escalated exactly as the KB prescribes → killed by `unjustified_silent_escalation`; retries exhausted → "AVERY EXHAUSTED ALL RETRIES" NA note, empty draft, guest got nothing. Jon's overnight NA label was invisible to the run (the replay re-POSTs the frozen 11pm payload; the front gate reads snapshot labels).

## The meta-lesson (why it happened)

**Every rule Jon restated already existed somewhere in the system. The failures were LAYER CONTRADICTIONS** — flag builder vs prompt vs KB vs deterministic checks — and when layers disagree, the model follows whichever side ships a verbatim customer-facing script (same class as the 7/25 VIP-pairs lesson). Specific contradictions found and closed:

- `self_book_candidate` still listed Birthday + Company as eligible (flag script beat the prompt's exclusion sentence); `cateringSignal` had no party-language though the KB's 7/19 ruling counts it (the v15.7 changelog claim that they matched was false).
- KB contradicted itself: route table (self-book lead ≤15 no-signal, Birthday catered row moved to 16+) vs opener list ("do NOT offer a self-book off-ramp" for Birthday) — the long-open "WF1 fork-vs-link" question.
- Tier-2 flag hardcoded "food nudge already sent **and declined**. OK to quote bowling-only" (trigger is merely tier_2 + link-sent; no decline is checked) — directly contradicting the 7/04 staff-only check. The prompt's DELIVERY PLAN branch A instructed the exact `bowling_compare` quote the checks categorically ban.
- KB counted "needing lane seating" as a catered trigger vs the 7/18 participation-only ruling.
- No check tied recorded cake intent to a later lanes-only offer; the WF1 quote-promise check was exempt for any self_book_candidate intake.

## Jon's rulings (2026-08-03)

- **A:** Totals are what we accommodate; for a KIDS birthday, adults are always present — participation (bowl/eat) is the only reroute trigger, and it's the *guest's* move to raise it. Default: right age → right qty of kids → send them to book a kids party.
- **B:** Kids-party-first: age 4-12 + ≤14 kids qualified → ship the /kb link; not qualified → catered.
- **C:** Birthday first touch = qualify-then-route on whatever the form gave: count + age known and qualified → "we host awesome kids' parties — availability, pricing, package differences online at [link]"; age missing → ask the age; count unreliable → ask a range. 13+ or 15+ → catered.
- Bowling-only: never quoted by Avery for this scenario — kids party or catered, "end of story."
- After-hours: an NA label applied overnight should stop the 9:10 release from firing at all.

## What shipped (all live, all rollback-anchored by `2026-08-03` comments in the nodes)

**WF1 (`GiHrq3Ce-rMeROSCh5e46`), 4 nodes:** Clean and Flag (types narrowed to Small Group + Group Event; party-language signal; **child_age extracted from notes** + kids_age_qualified/ineligible; kids_near_date extended to birthday-family) · Build Claude Request (Birthday branch → qualify-then-route a/b/c/d per ruling C; new BIRTHDAY KID AGE + KIDS PARTY AGE-QUALIFIED context lines) · Parse and Check (**`self_book_link_excluded_event_type`** — /book on non-fork types is a hard fail; `kids_self_book_over_cap`; the 13+ age gate is now live; link-sentence exemption on the quote-promise check) · Prep Event Update (variant-aware thread summary; the old template lied to WF2).

**WF2 (`dYG_0_MVmIpS_EQCBZ-Tl`), 4 nodes:** Build Avery Request (DELIVERY PLAN branch A → ROUTE, don't quote: kids-package fit → cake-caveat/disambiguation → /book ≤15 with lanes-only caveat + 10-day window → silent escalate 16+; bowling* plans removed from the roster; "You CAN quote food none" inverted; tier lines aligned) · Pre-Assemble Context (tier-2 flag de-"declined") · Build Retry Request (kids-first branch in the bowling fix rule) · Re-Check (silent-escalate carve-out when first pass failed `bowling_only_quote_attempted` — fixes the retry double-bind).

**KB v15.9 → v16.0:** 13 exact-string edits applied live to the Google Doc (all 1/1 matches) + synced to brain mirrors + new `kb/Avery_KB_v16_0.txt`. Kids-party-first opener, birthday types excluded from the self-book-lead row, seating removed as a catered trigger everywhere, clarify script rewritten (participation-only) and demoted to reactive-only, DEFAULT TO THE KIDS PROGRAM added.

**After-Hours Release (`EDsiVNx0qxP5D091`):** new `Fetch Live Labels` (live GET per held row, fail-open) → `skip-na` action → `Mark Skipped (NA)` (status reuses `superseded` + `last_error='skip-na: …'` because the table CHECK constraint widening was permission-blocked). Validator clean; zero-held-row smoke test clean. Also: release actually runs at **9:10am** (`10 9 * * *`), hold window is 11pm–9am — the 8:10/8am figures in older docs were stale (Marketing Avery CLAUDE.md + after-hours-handling.md corrected).

**Verification:** golden suite 9/9 PASS on the edited brain + KB (kristen et al. passed via normal retry variance); WF1 + Release validate 0 errors; all brain mirrors synced so the nightly drift canary should stay quiet.

## Open items (the actual starting point for a future session)

1. **WF2 escalation send path has NO pre-send NA gate** — `Send Escalation Reply` (regular_escalation / book_event_staff_tag / booking-conflict / quote-drift routes) texts the guest despite a Needs Attention label. The quote + normal-reply paths are gated; this one isn't. Same pattern as `Pre-Send NA Check` would fix it.
2. **NA-skip first natural exercise pending** — the release's skip branch is validated but hasn't run against a real overnight NA'd hold yet; verify the first occurrence (row → `superseded` + `skip-na` marker, no WF2 exec).
3. **Distinct `skipped_na` queue status** (optional) — the CHECK-constraint ALTER was blocked this session; currently audit lives in `last_error`.
4. **Watch the first live birthday intake** (expect /kb first touch or the age question + accurate thread summary) and **the first lanes-only decline** (expect kids-fit/caveat//book/escalate routing, no exhausted-retry NA spam). Intended behavior change to know about: small birthdays/company events ≤3 days out now short-notice-escalate (they were wrongly fork-exempt before).
5. **Golden `tiffany-multiquote-offer-beat` needs its date bump before Aug 30** (pre-existing; blocks deploys after that).
6. **Inna's thread** — never answered; manual-only now (NA'd, parked message consumed). If replying, the on-ruling move is the kids-party pitch.
7. Parked idea from the review pipeline (pre-existing, related): EMAIL-channel quote-with-readback in one message; check severity tiers (warn-and-send vs block) — "silence is the costliest failure for a sales agent."

## Where the details live

- Marketing Avery: `n8n/workflows/WF1.changelog.md`, `WF2.changelog.md`, `AfterHoursRelease.changelog.md`, `kb/CHANGELOG.md` (all 2026-08-03) + `after-hours-handling.md` update. Live workflow JSON is truth; brain/ mirrors synced.
- Memory: `wf1-birthday-selfbook-regression` (durable cross-session summary + links).
- Key execs for archaeology: WF1 12082 (the bad first touch), WF2 12097 (numberless price turn — TPRS availability probe had $415/$210 computed), 12099 (after-hours park), 12144 (the 9:10 double-bind exhaustion).
