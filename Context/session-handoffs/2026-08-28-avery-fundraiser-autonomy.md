# 2026-08-28 — Avery takes fundraisers end to end (ALL LIVE, cross-repo)

**Spec of record:** `Marketing Avery/fundraiser-autonomy-spec-2026-08-28.md` (rulings, three review rounds with Jon, implementation table). **Approved reply reference:** `Marketing Avery/kb/references/fundraiser-reply-reference-2026-08-28.md`. **Changelogs:** WF1 + WF2 2026-08-28 entries, KB CHANGELOG 2026-08-28, tprs ADR-0024 amendment 2026-08-28.

## What changed (one paragraph)

Before: a fundraiser inquiry got ONE scripted first touch, was flagged Needs Attention, and WF2 *forced silence* on every later turn — staff retyped the same explainer in 13 threads since June (Sarah Ward / Kobras E-8087967 emailed eight questions that were all on the website). Now: Avery answers from the KB §7 Fundraiser block (host-vs-promoter lead; 5–9; one org per Thursday; nothing reserved; F&B never counts; arcade cards ONLY at the front desk, never kiosks; no prizes; checks to organizations only), checks Thursdays through TPRS (month-anchored — never a year of dates), books the $0 placeholder herself on a confirmed OPEN Thursday, then gathers payable-to / EIN / mailing address. Every details write lands Needs Attention for a human review before a check is cut.

## Where the pieces live

| Layer | Artifact |
|---|---|
| TPRS | PR #107 (`8885a03`, fixes `ade32af`): migration 0154 (`fundraiser_details`, `fundraiser_blackout_dates` seeded with D202 2026-27 Thursday holidays), `services/fundraiser.ts`, routes `GET /api/avery/fundraiser-availability`, `POST /api/avery/book-fundraiser`, `PATCH /api/avery/bookings/:id/fundraiser-details`, `GET /api/avery/fundraisers/upcoming`; admin "Fundraiser check details" card with the review gate |
| WF2 brain | `pre-assemble-context.js` (fundraiser_mode + 3 context lines), `build-avery-request.js` (`fundraiserBlock`; catered tprsBlock suppressed in the mode), `build-retry-request.js`, `deterministic-checks.js` + `re-check.js` (forced silence RETIRED; ungated fundraiser guards) |
| WF2 plumbing | `brain/deploy/add-fundraiser-nodes.mjs` — 14 nodes (`Fundraiser Gate` → `Call TPRS Fundraiser` → `Fundraiser State`; `Build Book-Fundraiser Request` → `Call TPRS Book Fundraiser` → `IF - Fundraiser Booked?` → `Write Fundraiser Booking` + `Fundraiser Booked Reply` / `Build Fundraiser Conflict`; post-send `IF - Fundraiser Details?` → PATCH → note + NA); patches `Set Route` (route `book_fundraiser`) and `TPRS Availability Gate` (fundraiser rows skip the catered probe) |
| WF1 | `build-claude-request.js` (no "staff coordinate"/"team"), `patch-wf1-fundraiser-na.mjs` (no NA at first touch), `patch-wf1-parse-and-check-from-mirror.mjs` |
| Chase | n8n `Avery - Fundraiser Details Chase` (`Un65e8ncwFlifgZK`), **INACTIVE** — 11:00 Mon–Sat / 13:00 Sun CT; asks at 9 and 7 days out, NA at 6; log-deduped in `avery_campaign_log` (`fundraiser_details`); skips NA'd threads |
| Website | `/fundraisers` copy (`344023e`) |
| Harnesses | `n8n/tests/test-fundraiser-mode.cjs` (46/46) replaces `test-fundraiser-silence.cjs`; tprs `services/fundraiser.test.ts` (12) + `fundraiser.routes.test.ts` (4) |

## Traps for whoever touches this next

- **Node names are load-bearing** — brain files read `$('Fundraiser State')`, `$('Fundraiser Gate')`, `$('Fundraiser Booked Reply')`, `$('Set Route')` with try/catch. Renaming a node silently turns the mode into "nothing checked this turn".
- **The Route by Action fallback shifted from output 6 to 7** when the `book_fundraiser` rule was added. Anything that counts outputs must know.
- **Bookability = one org per Thursday + blackout/NYE + ≥10 Traditional lanes free at EVERY hour 5–9**, computed with `computePoolWindowState(..., releaseWalkinReserves=true)` (walk-in reserves are capacity FOR walk-ins). Booking takes `pg_advisory_xact_lock('fundraiser:<date>')` — the product holds no pool claim so the strict-mode lock never engages.
- **The comp path is DATA**: code-2 `default_price` must stay `$0`; `createFundraiserBooking` asserts `fully_paid` + total 0 and refuses otherwise (`FundraiserProductNotFreeError`). Both test files reshape the test catalog's $90 code-2 fixture.
- **Review gate refuses incomplete rows.** `reviewed_at` needs payable-to + EIN + address; any payable change clears it.
- **Details anti-hallucination**: an EIN whose digits are not in the inbound message is dropped; name/address need ≥60% word overlap. Dropped fields are auto-fixes, never a retry.
- **`fundraiser_availability_claim_unverified`** fires only on affirmative "X is open" sentences with no system read this turn; questions/promises to check pass.
- **The 2026-08-27 LATE SIDE work** (Jon / Rachel Smith, Sun Dec 6) was found authored-but-undeployed in the same brain files and shipped WITH this release; its changelog entries are dated 2026-08-27.
- **n8n public API PUT rejects GET-only settings keys** — every plumbing script uses `sanitizeSettings` from `lib.mjs`. And `tail` masks a script's exit code (`set -e` did not stop the deploy sequence) — capture `$?` explicitly.
- **Deliberately not built:** auto re-typing a Group Event that reveals fundraiser signals (still NA + staff re-type).
- **INVITATIONS ARE LIVE (same evening, other session) — read [2026-08-28-invitations-brief-for-fundraiser-session.md](2026-08-28-invitations-brief-for-fundraiser-session.md) before touching the booking reply.** The confirmation's invitation sentence is a PATCH on the `Fundraiser Booked Reply` node (`Marketing Avery/brain/deploy/patch-wf2-fundraiser-booked-reply.mjs`), not KB text and not in `add-fundraiser-nodes.mjs`'s `BOOKED_REPLY_CODE`. Any edit to that node — or a re-run of `add-fundraiser-nodes.mjs` on a fresh workflow — must be followed by re-running the patch and a clean drift-check. `ctx.invitation_host_url` comes from TPRS via `pre-assemble-context.js`; `link_not_from_tprs` whitelists exactly that URL.

## Rollback pointers

WF2 versionIds: pre-plumbing brain deploy → plumbing `cc0fb1d3` → Write-Fundraiser-Booking tweak `9b5e2c2d`. WF1: mirror patch `c23977b3`, NA patch `d97f186f`. TPRS: revert `8885a03` (migration 0154 is additive). KB: `deploy-kb.mjs` from the prior commit.

## Open

- Jon activates the chase workflow after one Manual Test Trigger run.
- Live end-to-end on Jon's record (book a throwaway Thursday → details → review NA → cancel) — not run; Jon's call.
- Watch the first real fundraiser turn past first touch (`auto_fixes` should be empty; no `fundraiser_*` failures) and the first `book_fundraiser` (expect `Write Fundraiser Booking` + confirmation reply + admin card).
- Existing upcoming fundraisers linked by SQL (E-3374051, E-0319848, E-4633838, E-1240170); INV-00454 (Matt Pociask) has no EIN on file; INV-00449 (Shelby) is complete and awaits review.
