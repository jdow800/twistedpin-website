## 2026-10-09 - The empty-keg deposit form asks one question: how many kegs went back

Built on branch feat/deposit-form-one-number; not deployed. Jon could not answer the empty-keg question on Werk Force INV-004038
($270: two kegs and two $30 deposits): the box's example was another invoice's ("total due $559") and "yes empty kegs" was refused
with a question that did not say what to type. When the invoice has a read printed total and exactly one deposit rate, the screen now
shows "How many empty kegs went back?" with a number box (a text box with a numeric keypad, 48px tall, 18px type) defaulted to the
kegs billed a deposit and limited to 1 up to that number. Under it a live line from THIS invoice ("Credit $60.00. Amount due becomes
$210.00 (was $270.00).") and one button naming the result ("Record $60.00 credit"). The button sends "Returned 2 empty kegs. Deposit
credit $60; total due $210." through the existing explanation call and token, then shows the saved answer. A stale invoice shows the
standard "This question changed while you were answering" line and keeps the number. The free-text box moved under a plain link,
"Describe something else", and its example now uses the invoice's own numbers. Free text with no dollar amount gets "Add the credit in
dollars, like: Returned two empty kegs. Deposit credit $60; total due $210." (no dollar figure when no single rate can be worked out).
Unread printed totals (null or 0.00), mixed deposit rates, no deposit line, or a credit already on the invoice keep the text box or
the honest unread message. Nothing is ever prefilled for a missing product; "If a full keg was missing, record that on its item below"
stays. No server change. The composer is `src/components/liquor/deposit-sentence.ts`; tprs holds a copy and proves its parser reads every
sentence it makes (`invoice-deposit-sentence-contract.test.ts`), with golden lists and one hash recorded in both repos.
Validation: `check-deposit-sentence.mjs`, 18 new `kegs-*` scenarios in `check-invoices.mjs`, and phone/desktop layout at 320, 390 and 960 px.

Review follow-up, same day. The server's other questions still reached the words box raw: after a typo like "Deposit credit $50;
total due $210" it ended in the fixed example "Deposit return $30; total due $559." (another invoice's numbers, the very thing Jon
reported), and "Returned 2 empty kegs, credit $60" or "Empty x2 -60" were told to "tell us the deposit credit in dollars" though they
had. Now, in the words box: amounts that do not add up get "That did not add up. The credit plus the amount due must equal the
original bill of $270.00. Try: Returned two empty kegs. Deposit credit $60; total due $210."; dollars without the words the server
reads get "Use the words empty keg, deposit and credit, like: ..."; a question with no dollar figure ("a full keg was missing", "two
decimal places") is still shown as the server wrote it. With no single rate there is no dollar figure at all. Any server question
that carries a dollar figure is replaced, and on the number-box path one is replaced by the plain save error. The QA fixture now
mirrors all four server questions word for word, and tprs pins them against the real parser (`QUESTIONS_SHA256` in both repos).

## 2026-10-09 — A scan copy that matches the emailed invoice settles itself

Jon: "lets fix things, yes", after an audit of every linked pair (13 pairs, 176 supplier-code rows): 38 rows differed only in a package column with identical units and dollars, and a question about an excluded copy never protects a cost. A scan copy with the same items, counts, dollars, charges and totals as its emailed invoice, and no ink that changes them, now arrives from the server as automatically reconciled with the basis `matching_units_and_dollars`. The linked-copy screen says "Copy matches the emailed invoice: same items, counts and dollars, and no ink that changes them. Package columns may read differently; the emailed invoice governs them. No answer needed." in the same handled-automatically style as the other bases; the package readings stay on each row. There is no new screen and no Not-right button (the older automatic bases have none either): the existing line "Open the purchase record if staff found a different delivery problem" still follows it. Anything with a different count, dollar amount, charge, total or ink asks exactly as before. Backend: tprs `INVOICE_COPY_MATCH_SETTLE` (default on, `off` restores the old behaviour). Deploy order: either order works; an older page shows the generic "settled automatically" line for the new basis.

Validation: strict COGS typecheck, production build, invoice QA scenario for the new basis (DOM and 320/390/960 px layout).

## 2026-10-09 — Plainer invoice labels and failure lines

Jon authorized shipping the reduced invoice plan. The linked-copy button reads "Mark copies checked" with a line saying it records the comparison and changes no prices or counts. The held-cost button reads "Save N per case". The copy screen names the field that differs and shows whole questions. A failed package save keeps the typed number and says the real reason (no connection, signed out, question changed, refused) instead of one generic error. Display only: the server's review key and review hash are untouched. Validation: strict typecheck, production build, 75 invoice QA scenarios, layout and source-check checks.

## 2026-10-09 — Substitute items show a tag and what is saved for the usual item

Jon authorized shipping the reduced invoice plan. A package question for a line that prints SUBSTITUTE shows a small "Substitute" tag and, when a sibling supplier item has a saved rule, a fact line such as "Also bought as 4999690 (8 CT): saved as 8 per case." The number box stays empty and nothing is suggested or prefilled. An older backend that does not send the field looks exactly as before. Validation: strict typecheck, production build, invoice QA scenarios.

## 2026-10-09 — An unread printed invoice total shows as "Printed total not read"

Jon authorized shipping the reduced invoice plan. When the backend stores an unreadable printed total as unknown, the invoice screens say "Printed total not read" (the list row says "total not read") instead of $0.00, keep the totals-differ warning, and explain that a deposit credit cannot be recorded until the total is read. Display only. Rows already stored at $0.00, including Nik & Ivy 1540, stay as they are. Validation: strict typecheck, production build, invoice and source-check QA scenarios.

## 2026-10-09 — Invoice answers send what the card showed, and a stale answer keeps what you typed

Jon authorized shipping the reduced invoice plan. Package, one-time price, match, new-item, delivery-count, carry-it-again and rule answers now send the state the card was showing (matched item, supplies flag, received quantity, saved rule). A typed delivery count, price or package answer pins that state when typing starts, so a re-read from another answer mid-edit cannot send it against someone else's newer answer. The server refuses an answer whose question changed; the screen says "This question changed while you were answering. Reload to see the latest." and keeps the typed number. The confirm button is hidden for an invoice with no lines, and a price answer that leaves a newer price alone says so.

Deploy order matters: this Website change first, then the matching backend change (the new server rejects an old page). Validation: strict typecheck of the COGS screens, production build, invoice QA scenarios and layout checks at 320, 390 and 960 px. Two QA failures already on main (the stale-comparison wording assertion and the count-screen timeout) were left alone.

## 2026-10-09 — Teacher Group packet and reservation status are separate

Jon authorized the first-use review fixes. The successful upload screen names
the created packet, outstanding food decisions and reservation outcome
separately. Sending the email is not an all-clear for food or lane coverage.
The existing upload, optional runner tickets and reupload-with-instructions
workflow remain in place; broader navigation and correction flows are deferred.

Validation: targeted strict TypeScript and the full Astro prebuild/production
build pass. Ten mocked Chromium checks cover current and legacy packet state,
carried instructions, escaped text, and phone/desktop layouts. No production
upload or email is created by this validation. Backend and website release
verification is recorded in the coordinated shipping report.

## 2026-10-08 — Labor reviews retain owner-withdrawn questions without requesting answers

The labor review consumes the backend's explicit owner-withdrawal disposition.
Withdrawn questions show Jon's reason and withdrawal time, with the original
question, whole-crew evidence, source references and genuine saved answer history
still readable. They offer no answer, edit or undo controls and do not count as
open questions. A checked review with zero active questions says “No questions to
answer”; withdrawal does not imply a GM answer or approved staffing context.

Live pending-review status takes precedence over the frozen issued packet. An
explicit null remains unknown and does not restore stale frozen pending links;
an empty live list clears those links. Older active unanswered questions remain
counted. Withdrawn explanations are excluded from active recap feedback and its
calls to action, while genuine historical answers remain on their question cards.
The issued packet, response revisions and existing staff PIN authentication are
preserved. A stale-page conflict says the question or answer changed, without
claiming another answer was saved.

Validation: 18 focused offline progress and actual server-rendered component
checks pass, including mixed active/withdrawn questions, null history, retained
evidence and answers, no withdrawn response controls and recap filtering. Targeted
strict TypeScript, git diff checks, the full prebuild and telemetry-disabled Astro
production build pass. Existing missing GoTab/Untappd configuration fallbacks are
expected in this isolated build. Browser layout checks and deployment remain with
the coordinated backend release; this UI work created no production answers or
mail.

## 2026-10-07 — Invoice comparisons explain a complete scan source reread

Jon authorized building the remaining invoice review gaps. Linked, excluded scans
with incomplete saved readings can now receive a bounded independent whole-source
read in the backend. The comparison screen distinguishes that check from a saved
package check: it names the scan reading, shows the read/saved row counts when
provided, and explains complete agreement without claiming receipt or a supplier
final. First saved scan rows and their total remain labeled and visible.

Reopen scan review uses the existing fingerprint rejection and authoritative
readback flow, including lost responses, stale evidence and deliberate retry.
An unresolved or rejected scan check restores the original questions. Price and
handwriting questions remain human questions. Older package responses keep their
existing wording and controls. Verification uses fictional invoices and mocked
APIs; native Chromium checks do not establish paid source-reading accuracy.

Validation: strict invoice component graph TypeScript and the full prebuild/Astro
production build pass. Seventy-five native Chromium scenarios pass, including
pending/completed/unresolved/rejected scan checks, lost responses, stale evidence,
duplicate taps, retained human price/mark questions and escaped source text.
Layouts at 320/390/412/1280px have no horizontal overflow and comparison controls
are at least 44px high; phone and desktop screenshots were inspected. Screenshots
and results remain in ignored scripts/qa-invoice-source-check/.qa/. The existing
missing GoTab/Untappd configuration fallbacks are expected for this isolated build.
No production change, invoice repair, email or paid source read was performed.

## 2026-10-06 — Invoice comparisons show the package source check and can reopen it

Jon authorized the invoice review to use source documents and existing supplier
facts before asking a person about a package reading. The existing comparison
panel now shows a queued/running source check as “Checking the package reading,”
without claiming completion or offering a completion acknowledgment. Check latest
status reads the saved result.

A source-checked comparison names that basis explicitly, preserves the first scan
reading beside the checked reading and stays in Completed document comparisons.
It does not claim that a supplier final invoice settled this kind of question.
Reopen package review rejects the explanation with its current evidence fingerprint;
the backend owns the audit and the underlying purchase remains unchanged.

After a reopen request, including a lost response or a 409, the screen reads the
exact current invoice before another write is possible. Failed readback keeps the
previous details visible and requires Reload comparison before retrying. Duplicate
taps send one request. Existing source links and human comparison acknowledgments
remain available.

Validation: strict TypeScript for the changed invoice component graph passes.
Thirty-seven native Chromium scenarios pass with fictional invoices and simulated API
responses: the recovery paths, truthful older responses, escaped text and layouts
at 320/390/412/1280px with no horizontal overflow and controls at least 44px high.
Screenshots and results stay in ignored `scripts/qa-invoice-source-check/.qa/`. An
authoritative refresh also removes a disappeared source check and its stale
reopen control. This checks
the UI/request contract, not source-reading accuracy or a physical phone. The full
prebuild and Astro production build pass without production integration settings
(the existing GoTab/Untappd missing-configuration fallbacks are expected). No live login, email,
invoice edit, deployment or paid source replay was performed by this UI change.

## 2026-10-06 — Food voice review shows the matched product and one count

Jon's next phone test found that successful BIB rows still showed the manual Cases/Loose form and a faint green product name. His explicit preference is the liquor review pattern: a prominent green selected-product pill and one editable count in the spoken unit or the current confirmed default. Alternative counting options belong behind a deliberate action. A matched product stays green even when its quantity needs an answer, and tapping the pill opens product choices/search.

Simple rows display the raw spoken amount, not a converted canonical total: one case remains one case and one BIB remains one BIB. Source-proved mixed cases and loose quantities keep both components. Count another way reveals the alternative form; switching from a mixed count to one quantity requires an explicit whole-amount answer. A single-field answer replaces the whole prior amount and clears its other component. Mixed-field answers retain independent numeric confirmation. Blank, negative, unknown product/unit and unconfirmed package conversion remain unresolved.

The Pizza Line follow-up exposed a separate backend grammar gap: product, physical unit, then count was rejected, which could also disrupt the next item's source boundary. The saved recording includes a tomatoes-to-salsa correction and an unquantified pasta remainder; legitimate follow-up questions must remain concise and must not manufacture a count. Backend reproduction, independent Astra review and final application verification are recorded in Alcohol Pricing incidents/2026-10-06/food-pizza-review/.

After recording, one primary sticky Add action applies the ready rows to the take's original shelf. It replaces the separate Review-then-inline-Add flow, remains reachable after scrolling and leaves held rows in review. Repeated taps consume a reviewed row once. Add remains available when an earlier count check is open, and normal count changes invalidate that check; recording, processing and submit gates remain.

Validation: 96 food DOM scenarios, 59 native food review scenarios / 77 assertions, 12 native recording/compact/footer scenarios / 48 assertions with 18 screenshots, strict COGS types and the complete prebuild/Astro production build pass. Independent GPT-6 Astra Ultra clears the final source after 10 component probes and nine source-guard/DTO-to-CountFood scenarios / 190 assertions. The complete two-clip Pizza Line replay saves the four grounded products and retains the corrected item and vague remainder. Checks use synthetic capture/provider/API responses and do not measure physical microphone recognition. Backend PR 356 passed 340 isolated test files / 5,033 tests and is healthy at its exact merge before Website publication. Final public revision and compiled module proofs are retained with the incident.

## 2026-10-06 — Food recording uses the same pinned Stop action as liquor

Jon's phone test found the kitchen recorder's small inline Stop/timer harder to use than the liquor walk. Food now uses the shared full-width, bottom-pinned **■ Stop & review** action, with elapsed/total time in the listening panel. After Stop the action becomes disabled Processing recording while pending speech finishes. The recording stays assigned to its original shelf; Finish, save and failed-clip guards remain in force.

Food speech review omits the duplicate Heard quantity line. Its original spoken phrase, editable quantities and genuinely unresolved quantity/unit questions remain visible. Ready rows do not gain extra confirmation questions.

Validation: 82 food voice DOM scenarios and 59 native food review scenarios pass. Native Chromium recording checks at 320/390/412px pass 9 scenarios and 27 assertions covering the pinned action after scrolling, touch Stop, processing/Finish guards and exact saved quantities. Twelve recording screenshots are retained with the food BIB voice incident. Four actual backend source/unit-guard and DTO-to-CountFood scenarios pass 126 assertions using the full 196-item catalog: the seven Beverage Room bare counts become one BIB each without redundant unit questions, while missing quantities and unknown flavors remain unresolved. Synthetic capture/API fixtures do not measure physical microphone recognition.

## 2026-10-06 — The /cogs landing page is grouped, and the invoice screen can't spin forever

Jon, on his phone: *"The visual here looks like crap"*, and the invoice questions page *"just sticks on loading invoices nothing loads."* He also asked for a visual pass on what John V sees when he logs in.

**Landing page.**
- **What was broken:** the Review tiles had no icon. The tile grid's first column is the 56px icon slot, so each title fell into it and wrapped one word per line, running into its subtitle ("My / recipe / questions").
- **The fix:** each part of a tile now sits in its own column, so a missing icon can never squeeze a title again. Every tile also has an icon now.
- **New grouping:** the page is grouped by why someone opens it:
  - **To do:** My recipe questions, with "N waiting" from the questions API. For admins, the Operations inbox joins it.
  - **Count**, then **Invoices**.
  - **Reports** and **Recipes & setup**: compact tiles, two to a row on a phone and three from 640px.
- **For John V:** he is a manager (bar.count + bar.read), so the Operations inbox sits in Recipes & setup. Every one of the 21 destinations keeps its tile for every role.

**Invoice screen.**
- **What happened:** at 7:36 Chicago the list request sat at the Vercel proxy for its full 300 s, twice (Vercel runtime logs). The screen waited on the list and the item catalog together, with no deadline.
- **Not the cause:** the same request takes 0.2 s locally on production's rows, the database showed no slow or stuck queries, and the backend answered normally an hour later.
- **The fix:**
  - The list, the catalog and an emailed invoice now load independently, each with a 25 s deadline (`INVOICE_READ_TIMEOUT_MS`).
  - An email link opens its invoice straight away.
  - A stalled list ends in "Couldn't load invoices" with Try again.
  - A failed item list says so at the match search, instead of "No items found".

Validation:
- `check-home-layout.mjs`: manager and admin at 320/360/390/412/1280px. It checks no sideways scroll, titles beside their icon (at most 2 lines big, 3 compact), nothing under 12px, tiles at least 44px, the badge, the sections, all 21 destinations and navigation. Before/after screenshots are in `dist/`.
- `check-invoice-loading.mjs`: 3 new cases. The stall case fails on the previous code.
- Existing invoice suite: 50 cases pass.
- Scoped TypeScript and the production Astro build pass.

## 2026-10-05 — A saved kitchen answer becomes the recipe, and the screen shows it

Jon, after the first two answers sat as "answered": *"Approve it when he submits --- but it just gives me some exposure and/or a moment to jump in."* When the backend has `FOOD_ANSWER_RECIPES_ENABLED` on (tprs migration 0217, Opsi BUILD-SPEC §11.139), the question screens get `autoRecipe: true`. Saving an answer then calls the new build endpoint with the exact saved revision.

- **Built:** the card turns "In the recipe" and lists the recipe the answer set: "Your answer set the recipe:" (past tense, still true after Jon edits it). The notice reads "Saved, and it's the recipe now. Jon gets a copy."
- **Part of it couldn't be matched:** nothing is written. The card says "Jon will finish this one", lists each unmatched part and why, and keeps the answer editable so he can add detail and save again.
- **The build can't finish** (a timeout or a 503): the answer is already saved, and the server builds it within minutes. The screen says so; nothing is retried blindly.
- The hint under Save becomes "Saving sets the recipe from your answer. Jon gets a copy and can adjust it." The manager review panel explains a held answer.

With the flag off, or on an older backend, nothing changes: no build call, and the old "awaiting recipe review" wording stays. The email to Jon is TPRS's.

Validation: all 57 native Chromium scenarios pass. That is the 48 existing ones plus build-after-save for the exact saved revision, the unmatched state with a re-save, the build that can't finish, and built and unmatched screens at 360/412/1280px with no overflow and every control at least 44px. The screenshots were checked by eye. Strict COGS TypeScript (only the known environmental `import.meta.env` error) and the complete Astro/Vercel production build pass.

## 2026-10-05 — Liquor count questions acknowledge normal stock movement

Jon reported submit warnings when a few backstock bottles moved to the bar or sold between weekly counts. The TPRS change gates liquor decrease warnings at a case-scale quantity using saved pack sizes (six bottles as a warning threshold where a pack is unknown). The count summary now describes a large drop as a question about sales, use, movement or a missed count. It keeps the server's evidence and the existing correction/submit actions. Other count checks and report grading are unchanged.

Validation: production Astro build; backend regression tests cover small drops, transfers, sales, saved case sizes, large gaps, explicit zero and completeness checks. Astra 6 ultra reviews both repositories before release.

## 2026-09-22 — Loyalty 2.0 isolated booking UI preparation

Jon authorized local implementation/tests only. Separate worktree codex/loyalty-2-ui-internal at 4b0767f. Add earned-points balance/rejection copy, preserve invalid-link explanations, and handle terminal payment recovery truthfully. Vendor the contract from the isolated TPRS worktree. Browser tests use synthetic members and simulated payments; no live settings, deployment, sends or coupon issuance. Validation complete: 80 joined checks (14 browser cases), 114 regressions and Website/backend typechecks passed. Mobile screenshots inspected. See scripts/loyalty-ui/README.md and Loyalty/docs/audits/2026-09-22-booking-ui-proof.md. Also corrected pre-existing confirmation type import/analytics declaration and React ref nullability exposed by compiling the whole booking component graph. All changes remain local and uncommitted/unpushed.

# Twisted Pin Website — 2026 decision history

Not auto-loaded. Reverse chronological. Each entry keeps its original text and handoff pointer. Rules extracted from these entries live in `../../CLAUDE.md`; where they disagree CLAUDE.md wins, this file is the audit trail.

Archived out of `Website/CLAUDE.md` on 2026-09-05. Entries are byte-for-byte copies and appear in their original source order (the source's two sections were themselves only roughly chronological).

---

- **2026-09-14 — NYE 2026 package preview and food-form verification.** Jon confirmed six party times, including two-hour evening parties and the 10pm–12:30am countdown. The landing page now shows all six times and live-verified per-lane prices, total guest limits, included pizza/soda choices and the 10pm-only toast. Updated calendar dates, booking metadata, selected-time VIP wording and the seasonal promo; removed invented sale/availability schema claims. The live food forms already require one pizza and soda choice per lane. **Actual backend reservation durations still need correction before sales open**; neither sales nor backend settings changed. Vercel preview/production and live page, calendar, sitemap and form checks passed. Details: `Context/session-handoffs/2026-09-14-nye-2026-packages.md`.

## Post-split entries (newest first; not archived copies)

- **2026-10-01 - `/api/hours/` also returns `regularHours`, Google's regular weekly schedule (Jon: Avery reads live Google hours).**
  - **Why:** Avery stated hours from hard-coded tables that never learned about the seasonal Thursday 11pm close, which Google has listed since 9/14 (karaoke season; Jon expects it to end around March or April). Jon chose live Google hours for Avery. The existing `hours` map can't serve: it is this week's view with holiday edits merged in, so during Thanksgiving week it would tell Avery every Thursday is closed.
  - **What:** `fetchLivePlacesData()` adds `regularHours` (`regularOpeningHours` alone, through the same `periodsToHours()`). The 4am cron writes it into `src/data/live-hours.json`, and `/api/hours/` returns it beside `hours`. `hours` is unchanged for Roy and the site.
  - **Seeded:** the committed snapshot's `regularHours` was copied from this week's `hours`, fetched 10/1 4am, with no holiday or special day Oct 1-7. The 10/2 4am cron rewrites it from Google.
  - **Consumer:** n8n WF2 `Fetch Venue Hours`, then Pre-Assemble Context, which falls back to its own tables when the feed is down or implausible. See `Marketing Avery/n8n/workflows/WF2.changelog.md`, 2026-10-01.

- **2026-10-01 - Arcade card promo on the booking add-on step (Jon: "lets ship proposed v2").**
  - **Why:** online arcade add-on sales fell from Roller's ~$2,000 (Sept 2025) to $360 on TPRS (Sept 2026) on about the same online booking volume. About 11% of self-service bookings add the card. Review trail: TP F's `reviews/2026-10/arcade-addon/` (opinion, Sol 6.1 review, mocks v1 and v2).
  - **What:** product 122, the $15 arcade card on lane products 4, 5, 121 and 123, renders as a bounded offer card.
    - Heading "Get $5 free arcade play", an ONLINE ONLY badge and a "+$5 FREE" sticker.
    - "Pay $15, play $20. This bonus is only online." and "You won't find this bonus at our kiosks." (Jon: the kiosks have deals, just not this one.)
    - "$15 → $20 of play" with one bright "Add a card". After the first add: a stepper and "✓ N cards added · $X free".
    - The sticky Skip becomes a quiet "Skip arcade"; the bright "Continue" returns once a card is added.
  - **Rules:**
    - The price comes from the catalog and the bonus is derived (play value minus price); a non-positive bonus turns the promo off.
    - Quantity still defaults to 0 (no pre-selection). Birthday and NYE add-ons are unchanged.
    - This is a deliberate exception to ADR-0029 §5.1 ("prominent low-friction Skip") for promo add-ons only. Skip stays one tap.
  - **Copy:** Jon 10/1: "free" is a magic word, plus online-only FOMO. The "deal/discount/value/cheap" ban still holds. The TPRS name "Arcade Deal (online pre-purchase only)" still shows in the recap, cart and receipts until it's renamed in TPRS admin; the rename is pending with Jon.
  - **Tracking:** GA4 `view_item` (once per page load), `add_to_cart` (first add), `add_on_skip`. Judge over about 8 weeks against the 10.9% baseline.
  - **Files:** `src/tprs/addOnPromos.ts`, `src/components/tprs/analytics.ts`, `steps/AddOnsStep.tsx`, `StickySummary.tsx`, and the `.tprs-promo-*` rules in `tprs.css`.
  - **Verified:** `astro build` passes. `tsc` reports no new errors (3 already exist in `api/estimate/track.ts`). A local harness with live catalog data for product 122 was checked at true 390px (0, 1 and 2 cards) and at desktop width.

- **2026-09-26 - AGENTS.md is a pointer, not a copy (Jon approved landing it).** AGENTS.md was a hand-maintained copy of CLAUDE.md frozen at its 2026-05-17 state, and it still carried since-retired wording ("set apart from the main floor", "built by America's Top Mixologist"). It now sends agents to the dev-root `CLAUDE.md`, then this repo's `CLAUDE.md`. The edit was written 2026-09-08 during the CLAUDE.md split but never committed. Prior contents: `git show 51a2b95:AGENTS.md`.

- **2026-09-26 - Google Ads records housekeeping (Jon asked for a cleanup).** Script 19 (September 13) had never been committed. Its script, tests, runbook, Preview and live records, negative-keyword export and two error screenshots are now in `scripts/google-ads/` beside Scripts 20 and 21, and its seven figure-free September 12-13 log entries are restored under those dates. `Context/google-ads-reviews/` is now git-ignored: the reviews hold spend and inquiry figures and this repository is public. The full reviews, the September 12 handoff and the five figure-bearing log entries are backed up in the private `twisted-pin-notes` repo (`google-ads-reviews/`, commit 135f03d). No site or Ads account change.

- **2026-09-25 - Teacher Group Organizer: "Added instructions" replace the paste box (Jon, after using the live screen).**
  - **Intro** cut to Jon's line: "Add the organizer's Word doc. If one email has two docs, add both." He found the rest wordy, and the field help got shorter too.
  - **The paste box is now "Added instructions":** anything to consider on top of their doc, one per line. Jon's examples: "Lane 15 is broken, skip it" and "the 2nd shift is ending late, maybe 8pm".
  - **How TPRS applies them:**
    - they win over the sheet;
    - a stated end time moves that shift's lane hold;
    - anything left for a person to decide becomes a cover-sheet question, and the tool never picks a replacement lane itself;
    - one the reader didn't act on holds the lanes.
  - **A Word doc is required.** Instructions go with it, never instead of it. To change something later, upload the doc again with the new instruction.
  - **The result screen** lists each instruction with what was done. The backend is tprs `feat/teacher-group-instructions`, which must deploy first.

- **2026-09-25 - Teacher Group Organizer tile in `/cogs`.** Jon wants the Friday teacher-group flow to run without him, and named it "Teacher Group Organizer."
  - **What staff do:** add the organizer's Word doc(s), or paste the email. The night is optional. At least one recipient is required (`@twistedpin.com` only, remembered on the device). Runner tickets are off by default; the kitchen lead called them likely unnecessary.
  - **What happens:** TPRS reads it twice and resizes that night's Teacher Group lane holds when everything checks out. It emails the packet (a "Questions That Need Answers" cover sheet, then the kitchen and POS pages) and copies Jon.
  - **The screen shows:** the lanes before and after; why lanes were held back; the wing choices to confirm at the lane; their sheet line by line next to how each line was read, with any unplaced line marked; the packet PDF. A failed read offers "Fix it and send again" with the inputs restored.
  - **Rulings kept:** staff confirm missing choices at the lane, never the organizer ("let's not put this on Miki"). Lanes change only when the read is clean ("auto when clean").
  - **Files:** `views/TeacherGroup.tsx`, CSS namespaced `lq-tg-*`, and the API client at the end of `api.ts`. The backend is tprs `admin/bar-teacher-group.ts` + `src/teacher-group/`, and must deploy first.
  - **Verified:** in headless Chromium (phone and desktop widths) against a local backend on test data. Covered: refusals, upload, reading, result, PDF link, a no-change re-upload, and the failed-read retry.

- **2026-09-25 - Homepage title leads with category and city (approved).** Jon approved the change.
  - **Old title:** "Twisted Pin — Cocktails, Taps & VIP Suite. Plainfield, IL."
  - **New title:** "Craft Cocktails & Bowling in Plainfield, IL | Twisted Pin" (57 characters).
  - **Why:** the homepage was the only page breaking `seo.md`'s "keyword first, brand last" checklist. It lacked "bowling", which is the Business Profile's primary category (Bowling alley) and the query family behind most paid and organic bowling demand. Google already prints the site name above each result, so a brand-first title repeated it.
  - **Kept:** bar-led word order. The meta description still carries the taps and VIP suite.
  - **Unchanged:** the locked hero copy (headline, subhead). `og:title` and `twitter:title` follow the same prop.
  - **Measure:** homepage impressions, CTR and average position for bowling queries in Search Console, over the four weeks after release against the four before. Branded queries should be unaffected.

- **2026-09-25 - Google Ads Script 21 applied.** Jon ran the Preview at 9:42am CT, and it passed with exactly 9 planned operations and no writes.
  - **Live run:** began at 9:47am CT. Google individually accepted all 9 operations:
    - the two fundraiser keyword URLs now point at `/fundraisers/`
    - three Brand campaign sitelink links
    - four campaign final URL suffixes
    - Bar-Led paused, with its budget unchanged
  - **Account state from the Preview:**
    - Search Partners and Display were already off on all four campaigns, so `networkHygiene` changed nothing.
    - AI Max is off, text asset automation is opted out, and no campaign uses campaign-level broad match.
    - Auto-tagging is on.
    - There is an undocumented legacy account-level tracking template with `gr_` parameters. It was left unchanged; under parallel tracking its parameters never reach landing pages.
  - **Verified:** the fresh read-only Preview at 9:57am CT planned zero operations. It read back all four suffixes, 7 Brand sitelinks, both fundraiser routes and Bar-Led paused.
  - **Pending:** confirmation that Avery's Google inquiries now carry `utm_campaign`.
  - **Measurement window:** September 26 to October 9, reviewed October 10 or later.

  [Execution record](../../scripts/google-ads/21_live_2026-09-25.md).

- **2026-09-25 - Google Ads Script 21 prepared, not executed.** Jon asked for the fixes from the September 25 mid-window Ads review, as one script.
  - **What it does:**
    - routes the two exact fundraiser keywords to `/fundraisers/`
    - links the three existing Script 20 sitelinks to the Brand campaign
    - adds a campaign-level final URL suffix, so event inquiries can be placed by campaign and town. The suffix carries UTM tags with readable campaign slugs plus the ad group, location and keyword.
    - switches Search Partners and Display off wherever either is still on
    - pauses Bar-Led without moving its budget
  - **How it runs:** each section has a `RUN21` switch. All writes go in one atomic batch, with one merged update per campaign, at most nine operations.
  - **What it leaves alone:** bids, budgets, targeting, ads, negatives and conversion settings. The replacement Events RSAs await their September 30 read. The "Open Until 1am" ad copy is left for a separate copy decision.
  - **Checks:** 41 local tests and eight public landing checks passed, including tagged URLs. Three deliberately broken variants were each caught.
  - **Status:** not yet previewed or run in Google Ads. Business figures stay in the local, untracked review record because this repository is public. [Script 21](../../scripts/google-ads/21_review_fixes.md).

- **2026-09-24 - Labor login normal-PIN hint.** Jon requested a reminder on the labor PIN page that staff use their normal PIN. Add "Hint: It's your normal staff PIN." beneath the entry dots and above the keypad, using existing muted text and a 14px mobile-readable size. This is display copy only; credentials, sessions and permissions are unchanged. Required prebuild and full build pass. Local 320/390/1280px checks show the hint below the dots, above the keypad and no horizontal overflow; the phone layout was visually inspected. Production readback follows publication.

- **2026-09-23 - Public Loyalty checkout release authorized.** Jon approved publishing the previously tested checkout controls after finalizing the rewards page. Merge current main (204a7db), preserve that page, validate current-request totals, shareable reward copy, plain signup consent and payment recovery, then publish to main. This is Website-only; points issuance/notices and the new offer/rule stay disabled. No new customer messages, codes, payments, catalog cutover or Zite publication. Validation passed: 114 joined/browser checks, 114 regressions, ten offline wizard scenarios, 26 harness guards, typechecks and full build. Details: `Context/session-handoffs/2026-09-23-loyalty-checkout-release.md`. Vercel and production readback follow the authorized push.

- **2026-09-23 - Finalize public Loyalty 2.0 copy before backend cutover (owner-directed).** Jon accepted the short Website/catalog timing gap and asked to finalize the page now. Remove Coming soon and the old 250/350-point hour rewards. Publish three in-store lower rewards plus the350-point $50 online/in-store feature, eligible products/exclusions, spending and live-balance instructions, and conditional next-day notice explanation. Match public/llms.txt. No catalog, Zite, checkout, invitation or campaign activation; old issued-gift pages remain intact. This supersedes the transitional copy in260a0e5. Required prebuild and full build passed; Chromium360/390/1440px verified four rewards, no transitional/old-hour copy, keyboard help and no overflow. Production readback follows publication.

- **2026-09-23 - Rewards-page refresh ahead of Loyalty 2.0 (publication authorized).** Jon asked to publish the Website edits now. This release scopes to /rewards/ and public/llms.txt; checkout preparation stays on its existing branch. Use current five in-store rewards while catalog/Zite changes remain off, and label the new 350-point $50 reward Coming soon. Correct first-check-in earning, one earning day, points spending, kiosk balance access, 24-month inactivity and optional Text Club distinction. Keep the site fonts/chrome; page-scoped solid backgrounds, clearer point/reward hierarchy and native keyboard-accessible help replace the patterned table. No reward-issuance CTA, automation, coupon, account or Zite change. Preserve old offer landing-page terms. Required prebuild checks and full build passed. Chromium360/390/720/1440px, keyboard help, metadata and no horizontal overflow passed. Production verification follows publication; see Context/session-handoffs/2026-09-23-rewards-page-refresh.md.

- **2026-09-22 - Preserve invoice answers and recover stalled voice requests (release pending).**
  Retry is offered only for a failed read without saved items. Existing invoice
  details remain protected from replacement. Voice transcription and food item
  matching receive bounded requests, including response-body reads, with a clear
  recovery message. Food now displays recorder/transcription errors, which it
  previously omitted, and shows processing after Stop. Successful segments remain
  available for review. This bounds
  a stalled request; it does not establish a real-phone speed improvement.
  Validation: strict affected-screen TypeScript, required prebuild checks, 42 food
  DOM scenarios, 29 invoice scenarios, seven API deadline/protection scenarios,
  four real-hook recorder simulations, and Chromium at 320/390/960px passed.
  No real microphone or production count was used.

- **2026-09-22 - Explicit food-unit review (release pending).** A unit that could
  not be verified against the spoken excerpt blocks Add until the counter picks
  cases, the item's confirmed base unit, or supplies another unit. Editing only
  a loose number cannot remove the question; an explicit Cases entry can.
  Typed units use a visible Use unit action. Confirmed base-unit labels reuse one
  unit without asking how many heads are in a head. Plural labels and protocol 2
  match the backend grounding fix. Existing case defaults remain in force for
  unitless counts. Strict UI typecheck, 37 DOM scenarios and Chromium checks at
  320/390/960px passed. Fixtures contain fictional data. Deploy the backend first,
  then this Website; old tabs must refresh before the next food recording.

- **2026-09-22 - Repeated-upload list label.** The invoice list now uses the same
  status wording as invoice detail: ordinary duplicates say Repeated upload;
  a linked delivery copy retains its comparison label. Purchase exclusion,
  invoice state and genuine item/receipt questions are unchanged.

- **2026-09-22 — Confirmed spoken defaults (release pending).** A saved human
  default can interpret a unitless freezer count as fractional cases while explicit
  bag counts remain bags. Review shows the interpreted case quantity, and its
  correction to loose bags overrides the default. Canonical bag storage preserves
  exact quantities even when a case contains six bags. No default is inferred from
  a large number. The matching backend change reuses the existing JSON column.

- **2026-09-22 — Reuse verified food count units (release pending).** Food review
  reads the catalog's human-confirmed package vocabulary, including inner bags,
  and invalidates it when the count unit or case factor changes. A recorded normal
  case range replaces generic high-count warnings for that item; exceptional stock
  still offers explicit confirmation without changing the quantity. The UI uses
  the confirmed unit label for the count grid and review. Backend migration 0188
  supplies the optional contract; synthetic fixtures cover mixed units, fractional
  cases, changed packages and plausibility. No real invoices or unit definitions
  are published with the Website source.

- **2026-09-22 - Shared invoice matching with separate food/liquor counts (release pending).** Jon's Sysco scan exposed an invoice search that loaded only the liquor catalog. Invoices now search both catalogs under “Search items,” label each result's inventory, and require inventory/count-unit choices for a new item. Count screens retain their section-scoped catalogs; the backend additionally checks scope on saves. Email/scan copies of the same vendor invoice open a comparison and one canonical purchase record. Copies cannot independently apply costs, matches or received quantities; staff can jump to the original item, record corrections, then acknowledge the current comparison. The companion backend enables food review emails without excluding eligible purchases and deduplicates unchanged questions. Validation: 22 invoice DOM scenarios, eight existing count/bottle-size scenarios and Chromium layouts at 320/390/960px pass. Local pages compile; Vercel packaging on Windows is blocked by a dependency-junction symlink permission, so deployment build verification remains required. No real invoice or count is confirmed by these tests.

- **2026-09-18 - Keep bottled-beer quantities readable on phones (local; not deployed).** John reported loose-bottle controls appearing to reset and very large totals on Android. A real Chromium render at 390px reproduced a 16px quantity field with only 10px available for digits: 14 rendered as 1. Give each case/six-pack/loose-bottle tier its own labelled row, retain at least 64px for the quantity and 44px tap targets, and label the sum as the total. Loose bottles remain independent and can accumulate across coolers without converting to packs. The reported jump to thousands is not reproduced and is not claimed fixed by this layout change; current and original arithmetic both use numeric independent tiers. Synthetic component and mobile-touch verification are recorded in the beer-counter handoff. No live counts are edited; reset beer rows require confirmation before inventory recovery.

- **2026-09-18 - Reject a count draft from the wrong walk.** The bottled-beer screen requested `full=false`, but the server's boolean coercion treated the query string as true and could return a full liquor draft. The client's authoritative beer save could then remove the liquor rows. The API client now verifies the returned section/full-count identity before any screen adopts the draft. Every count-line save declares its scope: full bar, partial bar for bottled beer, or full food. The matching backend validates that scope before writing. Keg check now identifies a rejected/closed draft instead of describing that 409 response as a connection failure. Deploy the backend first; a missing identity is refused rather than risking another replacement. Validation: nine synthetic browser-client regressions, focused liquor TypeScript, and required prebuild checks pass; 74 companion backend tests pass. No live data edits or deployment are claimed here.

- **2026-09-17 — Food voice counts inherit liquor's background item matching (local implementation; not deployed).** The GM reported waiting for results after stopping a food recording. Liquor commit `601e9cb` already starts item extraction as each roughly 60-second transcript arrives; food used the same recorder but waited for the whole take before extracting. `CountFood` now starts section-scoped extraction per segment, assembles results in spoken order, and keeps the review on the recording's original shelf. Staff still explicitly apply the review. Failed segments retain successful items with a visible warning, complete failures preserve the server's explanation, and Web Speech retains its whole-transcript fallback. Nine food voice DOM scenarios, focused TypeScript, the synthetic component bundle and required prebuild checks pass. Short recordings still require their final transcription and extraction; no production latency claim is made. Verification and reproduction: `Context/session-handoffs/2026-09-17-food-count-voice-latency.md`. Water's count unit and the one-bag pepperoni conversion are separate open findings, unchanged by this speed fix.

- **2026-09-17 - Product delivery review and confirmed shortage costs.** Jon narrowed the scope to actual product cost and quantities: explicit empty-container deposit returns are informational, with no deposit-credit ledger. Honor the backend's additive reviewAnnotation field while retaining source notes and conservatively handling older APIs. A crossed-off product asks for the delivered quantity, including zero. Jon also approved immediately excluding confirmed undelivered product from product-cost reports, preserving the original invoice. Show the received product amount and excluded shortage beside the original line, refresh the cost categories after saving, and expose a recovery message if that refresh fails. The backend uses the same rule for invoice breakdowns and the next monthly purchase close; finalized months are retained. Missing products, full-product returns and ambiguous notes still require review. Validation: 175 focused backend tests, all 2,752 backend CI tests, 18 invoice DOM scenarios, focused TypeScript and required prebuild checks pass. The hosted Vercel preview built and deployed successfully; backend PR #205 is merged and verified live on Render. No visual browser check was available. All fixtures are synthetic.
- **2026-09-22 - Scheduled / Worked / Proposed in Labor V2 (local).** Display anonymous actual punches alongside the whole department plan and proposal; retain unmatched work and distinguish unavailable from zero. The historical kitchen preview shows 108 recorded minutes inside a 120-minute proposed plan reduction and preserves later planned coverage. The real React display passes 320px/390px/desktop overflow and phone visual checks. Six existing TypeScript errors remain in unrelated booking/estimate files; none in labor. Old packets remain compatible. No response, send, production credential change or deployment.
- **2026-09-19 — name the department throughout the labor comparison (local).** Owner feedback on the kitchen preview: clearly label the full shift comparison, remaining scheduled coverage and closing context as Kitchen, Front desk or Bar. Added those labels and department-only count wording to the reusable component, including accessible table captions. Copy only; existing hours, response state and deployment status remain unchanged.
- **2026-09-19 — Labor V2 self-contained schedule comparison (local).** Jon wants to judge a proposal without opening 7shifts. Show every department shift in paired recorded/proposed columns by default, highlight changed spans, and calculate remaining coverage through the supplied service/building cutoffs. Keep the exact late crew and its limits visible before Yes/No/Maybe. Existing answer/save/recap behavior remains. The August 28 kitchen rehearsal is the concrete source-backed example; unchanged closing coverage is not a claim that cleanup or whole-building closing is adequately staffed. No deployment or GM send.

- **2026-09-17 - Labor pilot email and response-page design.** Jon requested a polished shared design before introducing V2 to the GM. The opt-in labor pilot now uses the original horizontal logo, indigo/Glow colors, a light working surface, compact weekly summary and evidence disclosures. A question opens a brief answer form; optional context and follow-up details stay secondary. No staffing decision is preselected. Readback/save/edit/undo/outcome behavior remains. This pass also styles the existing PIN screen and removes the marketing scrollbar gutter only while the pilot is mounted. Real local PIN login, unsaved form validation/readback and responsive screenshots passed at 320/390/736/1280 without adding an answer to the owner's review. Website typecheck retains the same six unrelated baseline diagnostics. Local only; no GM contact or deployment. See `Context/session-handoffs/2026-09-17-labor-review-pilot.md`.

- **2026-09-17 - Handwritten totals describe the expected vendor charge.** Jon clarified that a revised total on the driver's invoice is the amount the vendor's office should bill after processing the empty-keg return. Review instructions now ask staff to verify the return count, deposit credit and revised total; they do not imply a separate credit document or an already posted charge. Empty-return notes alone offer Review invoice items, while item annotations still direct staff to delivered quantities. Confirmation completes review and retains the notes; recording an adjusted charge or comparing it with the vendor's actual bill is not implemented by this copy change. Original totals and product costs remain unchanged. Validation: all 14 existing invoice DOM scenarios, focused TypeScript and required prebuild checks pass. No visual browser check was available.

- **2026-09-17 - Invoice review starts with the reason and next action.** A flagged invoice now opens with saved handwritten concerns, row annotations, missing catalog matches, total differences or duplicate status, plus a direct original-invoice link and the relevant next action. Empty-keg notes point to deposit-credit review; the screen explains that confirming does not enter a credit or rewrite printed totals. Replace the blanket bottle-matching/count claim with an explicit review-confirm action; duplicates cannot be confirmed. Move category estimates and re-reading tools into separate disclosures, and offer Match product only where a matching control exists. Original handwriting remains available after review. Additive TPRS detail fields supply the previously omitted notes and annotations. Validation: all 14 DOM scenarios, focused TypeScript, and required prebuild checks pass. The hosted Vercel preview built and deployed successfully. Local Vercel packaging hit the Windows symlink restriction after Astro compiled the pages; hosted build validation supplies that check. Backend PR #204 passed its full suite and is live. No browser was connected for visual layout QA. Fixtures use synthetic invoices only.

- **2026-09-15 - Ads source merged and pushed; repository closeout.** Jon requested publishing and merging the completed work. All 49 script checks passed. The Ads branch incorporated the latest main hours/reviews refresh without conflicts, then commit `602aa0e2bbf99eabced21878e0ed09e823b29b29` was pushed atomically to both `main` and `chore/google-ads-event-alignment`; both remote refs were verified. The eight-file release contains the two scripts, tests, runbooks, execution record and decision history. No script was rerun in Google Ads. [Execution record](../../scripts/google-ads/20_live_2026-09-14.md).

- **2026-09-15 - Script 20B activation complete and verified.** Jon supplied the live Run beginning `2026-09-15T18:57:36.182Z`: all eight exact ad-status changes were individually accepted. The final read-only Preview at `2026-09-15T19:05:23.775Z` verified all ten keyword destinations, three sitelink destinations and five enabled associations; all four replacements are ENABLED and all four originals PAUSED. Result: zero changes, zero waiting pairs, four already switched. Birthday is REVIEWED / APPROVED; Corporate Events, Team Outings and Employee Appreciation are REVIEWED / APPROVED_LIMITED. The logs do not identify specific policy topics or demonstrate impressions. No further activation run is needed. Bids, budgets, targeting and conversion settings were not changed by either script. Record September 15 as the ad-activation date, separately from the September 14 URL/sitelink release; review the replacements after the complete September 16-29 account days, September 30 or later. No monitoring was scheduled. Updated runbooks and [execution record](../../scripts/google-ads/20_live_2026-09-14.md); documentation only, with no script-code changes or new tests. Source and notes remain on the local `chore/google-ads-event-alignment` branch; no push or website deployment is claimed.

- **2026-09-14 - Script 20B readback verified; Google review still pending.** The owner supplied the Preview beginning 2026-09-15T00:26:08.750Z. All ten keyword destinations, three sitelink destinations and five enabled associations passed fresh verification. All four replacements remain paused with REVIEW_IN_PROGRESS / UNKNOWN, and their originals remain enabled. The script correctly planned zero status changes with four waiting pairs and made no writes. No code fix or activation was performed. Next step is another read-only Preview after review progresses, then the previously prepared switch when ready. [Execution record](../../scripts/google-ads/20_live_2026-09-14.md).

- **2026-09-14 - Script 20 live acceptance verified; exact ad activation prepared.** Jon supplied the live log beginning 2026-09-15T00:08:28.202Z. Google accepted all 22 operations, including the three actual sitelink IDs and four paused replacement ad IDs now saved in the execution record. Existing ads remain unchanged; policy approval and serving are not established by acceptance. Prepared Script 20B to read back the ten destinations/three assets/five associations, check each exact replacement's review status, and optionally switch only approved ad pairs through an atomic status-only batch. Twenty-one local tests passed. Script 20B defaults read-only and has not run in Google Ads. [Execution record](../../scripts/google-ads/20_live_2026-09-14.md) and [activation instructions](../../scripts/google-ads/20b_verify_activate_event_ads.md).

- **2026-09-14 - Script 20 Preview approved; owner reports live Run completed.** The corrected Google Ads Preview passed all checks and showed the expected 22 operations. All ten keyword destinations, scoped sitelinks and paused replacement ad payloads were reviewed. Jon then reported completing the instructed live Run. The acceptance log, Changes result and fresh-state verification have not yet been supplied, so the record does not claim all operations succeeded or the replacement ads are serving. Saved actual source IDs and keyword URL preimages from the successful Preview for verification and rollback. [Execution record](../../scripts/google-ads/20_live_2026-09-14.md).

- **2026-09-14 - Script 20 read-only Preview query correction.** Jon's first Google Ads Preview stopped with EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE for ad_group.id. The sitelink-association lookup filtered by that field without selecting it; the other two queries sharing that filter already selected it. Added the missing SELECT field and a regression check that reproduced the original runtime error. All 28 local tests pass. No account mutations were reached, and no rollback is needed. The corrected file awaits another Google Ads Preview; scope, budgets, destinations and ad copy are unchanged. [Script 20 instructions and execution note](../../scripts/google-ads/20_event_landing_alignment.md).

- **2026-09-14 - Google Ads event alignment script prepared, not executed.** Jon asked to script the next event-ad changes. Script 20 updates seven adult birthday and three company holiday keyword destinations, adds three scoped sitelinks across five ad-group associations, and creates four replacement RSAs paused. Mixed birthday/corporate groups retain appropriately broad creative; keyword overrides use the dedicated adult/holiday pages. It holds budgets, bids, targeting, conversion settings and existing ad statuses, preserves tracking, defaults to read-only, and submits its live batch atomically after complete preflight. The 27 local tests and five public landing checks passed; Google's actual runtime/approval remain unverified until an account Preview/Run. This work is on its own branch and does not rerun completed Script 19 or launch new keyword tests. Run and rollback instructions: [Script 20](../../scripts/google-ads/20_event_landing_alignment.md).

- **2026-09-14 — Plainfield things-to-do guide refresh (released).** Jon chose the existing guide as the next focused release. The opening now helps visitors plan tonight, with calendar-based karaoke/Singo discovery and hours/reservation links. Cocktail and craft-beer sections link current menus; adult birthdays, company/staff outings, holiday parties and showers route through their dedicated event pages, while kids' packages retain online booking. The guide removes unsupported exclusivity/speed/comparison claims, the all-night suite promise, expired summer-package copy, the blanket 1am close and the claim that music is only ambient. It keeps useful local alternatives, with official links for Werk Force Brewing and Settlers' Park. The original publication date remains; the existing updateDate field records this substantive revision. The shared blog header formats calendar dates in UTC to prevent the local build from displaying the preceding day. URL, article layout, global CTAs, booking products and Ads are unchanged. Code 4575b3f passed Vercel preview and production builds; live metadata/dates, all 17 internal article destinations, the kids' anchor and sitemap inclusion passed verification. The brewery reference returned 200; the official park page was verified through web research but returned 403 to the scripted GET check. Visual browser review was unavailable. Validation and release details: [guide refresh handoff](../session-handoffs/2026-09-14-plainfield-things-to-do-guide.md).

- **2026-09-14 — bowling visit-planning page and Spanish alignment (released).** Jon approved improving /bowl/ for bowling discovery and reservations: a Plainfield opening, Reserve a lane / Pricing & Hours / directions near the top, accurate walk-in availability wording, a compact Make a night of it section, and separate paths for ordinary reservations versus planned adult birthdays/company parties and kids' online packages. /es/bowl/ is updated alongside it, including the existing summer offer's off-season state. Rates and hours link to /pricing/; calendar mentions read the existing event collection and recurrence logic, with no duplicate dates or implied nightly karaoke/Singo. Suite copy distinguishes online lane reservations from a planned event for up to 80 guests. Existing videos, global controls, booking products, redirects, locale tags and Spanish correction link remain. Jon flagged Google Ads landing/copy alignment as a later follow-up; no advertising-account changes in this release. Code b36a083 passed Vercel preview and production builds. Both live pages, all 12 content destinations, locale/schema metadata, the legacy redirect and sitemap entries passed verification. Visual browser review was unavailable. Validation and follow-up details: [bowling page handoff](../session-handoffs/2026-09-14-bowling-visit-page.md).

- **2026-09-14 — company holiday-party page refresh (released).** Jon approved the next focused release on the existing /holiday-parties/ URL: a clearer company/Plainfield introduction, Plan My Holiday Party near the top and bottom through PLAN_EVENT_URL, compact capacity/catering/bar information, accurate reserved-space and party-time language, and one regional paragraph for Romeoville, Shorewood, Naperville, Joliet and Bolingbrook. The existing suite video stays immediately after the hero; its AVIF poster is preloaded, and catering footage remains deferred. Copy no longer promises the suite from setup to last call, unconfirmed catering formats or dietary accommodations, or a fixed quote-response speed. Practical FAQ HTML and schema share one answer source. Friends, families and community holiday groups remain welcome. The seasonal nav/promo schedule, global CTA hierarchy, booking/event-form behavior, Ads and other pages are unchanged. Code aad9c10 passed Vercel preview and production builds. Live content, both planning CTAs, all 11 content destinations, FAQ/schema parity and sitemap inclusion were verified. Visual browser review was unavailable. Validation and release status: [holiday party handoff](../session-handoffs/2026-09-14-holiday-party-page.md).

- **2026-09-14 — adult birthday landing page and birthday navigation (released).** Jon approved a dedicated /adult-birthday-parties/ page for adult and 21st/milestone birthdays. Kids' parties normally self-book online; adult parties use Plan My Birthday on the new page, then the existing Zite/event-team planning and booking flow. The generic Birthdays menu button continues to /birthday-parties/, whose opening now offers kids' online booking or the adult landing page. The #adults inbound anchor is preserved on the adult choice; #kids links directly to kids' package information. Longer adult copy/footage moves to the new page, with no featured teen-party pitch. Bridal/baby showers and gender reveals retain /showers/, with related links between pages. Existing videos, brand styles and global CTA hierarchy are reused; the first suite poster is eager/preloaded and catering footage deferred. Adult FAQ HTML/schema share one answer source, the new Service and breadcrumbs are page-specific, and sitemap inclusion uses the existing integration. Kids' products/prices/terms and the event form are unchanged. Code 1f4f45b passed Vercel preview and production builds; all four live pages, birthday routing and the new sitemap entry passed verification. Browser visual QA was unavailable. Validation and release status: [adult birthday handoff](../session-handoffs/2026-09-14-adult-birthday-landing.md).

- **2026-09-14 — corporate page video and regional-copy refresh (released).** Jon approved making and shipping the reviewed changes. Existing VIP-suite video moved directly after a shorter Plainfield introduction; its AVIF poster is eager/preloaded. Compact descriptive use-case cards retain team/staff outing and employee-appreciation intent. Room capacity is explicit (80 suite, 200 full venue), AV language is dependable, FAQs share one visible/schema answer source, and the existing regional text is consolidated with five contextual town links. Romeoville and Shorewood copy now uses factual venue features, removes unsupported competitor/uniqueness claims, and links to corporate-event planning. Bing URL Inspection and Live URL screenshots supplied by Jon show indexed successfully, crawlable and no SEO/GEO issues; the earlier Cromojo deindex alert is not the current status. No indexing-policy, Ads, global CTA, booking, or new-media changes. Code commit a7f8cd5 passed Vercel preview and production builds; all three live pages passed rendered-content, canonical and indexability checks. Validation details and deployment result: [release handoff](../session-handoffs/2026-09-14-corporate-regional-bing.md).

- **2026-09-13 (Ads cleanup complete; Jon confirmed manual fix)** — Jon replied "ok that worked" after the instructions to remove the exact positive `[employee appreciation ideas]` and add it as an exact negative in Events / Employee Appreciation. Original 48 changes are Google-reported successes; final conversion is owner-confirmed. Budgets now Brand $6, Bar $6, Open Play $32, Events $35. All intended landing changes and eight exact exclusions are accounted for; broader phrase employee appreciation remains preserved by the instructions. [Completion record](../../scripts/google-ads/19_live_2026-09-13.md). Do not rerun original Script 19 after positive removal; keep as an execution record. Compare September 14-27 with August 29-September 11 and review September 28 or later, using Ads account timezone America/New_York. No reminder scheduled, post-fix account export, ad-serving audit, website deployment, commit or push.

- **2026-09-13 (root cause: paused positive conflicts with identical negative)** — Jon's manual-save error states "You can't exclude keywords that are targeted" for employee appreciation ideas. Google's AdGroupCriterion reference confirms positive/negative is immutable and conversion requires remove then re-add. The original pause-plus-negative design and add-only retry advice were incorrect; local mocks missed the restriction. Corrected manual steps: remove only the Exact match positive `[employee appreciation ideas]` in Events / Employee Appreciation (preserve phrase `"employee appreciation"`), then add the same exact text as an ad-group negative. [Evidence, sources and repair steps](../../scripts/google-ads/19_live_2026-09-13.md). Original Script 19 is retained as the execution record with a do-not-rerun header; it would fail its positive-target lookup after manual removal. Original 48 changes remain Google-reported successes; removal and final negative save are unconfirmed. No automatic removal, scope expansion, live rerun, website deployment, commit or push.

- **2026-09-13 (CSV identifies Script 19's missing exclusion)** — The supplied Negative keyword report contains the other four intended Employee Appreciation exact ad-group negatives; `[employee appreciation ideas]` is missing. Told Jon to add only that exact negative in Events Campaign 2026 Setup / Employee Appreciation and save. [Source and repair record](../../scripts/google-ads/19_live_2026-09-13.md). Export archived byte-identical; 85 rows parsed with campaign, ad-group, level and match-type checks. No script change or further live execution; manual save remains unconfirmed.

- **2026-09-13 (Script 19 error isolated; manual completion requested)** — Jon's Changes screenshot confirms 48 Successful / 1 Error. Only an Events / Employee Appreciation negative-keyword addition failed, with the generic try-again-later message; exact term unspecified. The Bar budget reduction, both pauses, all 38 keyword URL changes and seven negatives are Google-reported successes. Jon chose manual completion: compare the five intended Employee Appreciation exact negatives and add only the missing one at ad-group scope. [Evidence and instructions](../../scripts/google-ads/19_live_2026-09-13.md). Screenshot archived byte-identical. Added one regression test covering each possible non-throwing rejection and isolated retry; all 26 tests pass, script behavior unchanged. Manual save and ad serving remain unverified.

- **2026-09-13 (9:18am Central: Script 19 live submission; one reported error unresolved)** — Jon's supplied log shows LIVE mode, passed preflight, SUBMITTED 1-49 and the completion message, with no thrown exception. The interface reportedly shows one error; its exact row is absent. [Execution record](../../scripts/google-ads/19_live_2026-09-13.md). Google documents unsuccessful mutations that do not throw, so neither 49 successes nor 48 successes can be inferred. Requested the Changes error row and a new DRY_RUN=true Preview to read remaining intended changes. No speculative live retry, rollback, code behavior change or completion claim. The runbook now distinguishes thrown exceptions from non-throwing rejected changes. September 14-27 remains the provisional full follow-up period, with any delayed completion recorded separately.

- **2026-09-13 (Script 19 account preview passed; no live changes yet)** — Jon supplied the read-only execution log. All 49 PLAN entries match the reviewed script: one Bar budget reduction, two pauses, eight exact ad-group negatives and 38 keyword destinations. Held budgets matched; both landing checks returned HTTP 200 with expected content. No script correction required. Account timezone is America/New_York, per the runtime log. [Preview review](../../scripts/google-ads/19_preview_2026-09-13.md). If applied September 13, the next fourteen complete account days are September 14-27, for review September 28 or later. Live submissions and refreshed state remain unverified; no scheduled task, deployment, commit or push.

- **2026-09-12 (Script 19 authored at Jon's request; not run in Ads)** — [Script and run instructions](../../scripts/google-ads/19_september_keyword_cleanup.md) implement the ready parts of the reviewed changes: Bar $12 to $6 only; pause the exact employee-appreciation-ideas and phrase girls-night-out-ideas targets; eight exact research-query negatives in the relevant ad groups; 31 reviewed Bowling keyword URLs to /bowl/ and seven explicit adult/milestone birthday keyword URLs to /birthday-parties/#adults. Both public destinations returned HTTP 200 and the live adults anchor was verified. The script defaults to dry run, validates the full plan before writing, preserves held budgets/CPCs/geography/goals/RSAs/tracking fields, and logs before/submitted values. New kids/family keyword experiments and speculative bid/geo changes remain separate. Source and tests live in Website/scripts/google-ads, beside this review, within the authorized writable repository. SOL/medium found no blocking code or API defect and approved it for Preview; its mobile-URL refinement was incorporated. Syntax validation and all 25 local behavior tests passed. No Google Ads execution, deployment, commit or push.

- **2026-09-12 - Google Ads performance review (no account changes; figures kept private).** The September 12 account review, its keyword follow-up and their evidence carry spend and conversion figures, so they stay out of this public repository. The working copy is the git-ignored `Context/google-ads-reviews/2026-09-12/`; the reviews, the session handoff and the original figure-bearing log entries are backed up in the private `twisted-pin-notes` repo under `google-ads-reviews/`. Script 19, above, implemented its ready changes.

- **2026-09-12 — reuse a saved recipe when GoTab sells the same option under another menu (released).** Green Tea Shot has six active Bar Mods occurrences across spirit categories. The recipe queue now shows same-named saved inventory recipes, their ingredient pours and source menus, with Use this recipe and Edit first. Identical saved specs are grouped; conflicting specs remain separate choices. Confirmation saves only the selected menu's mapping through the existing route, with existing Undo. Suggestions are optional, never automatic assignments; failures leave the manual builder available. Backend companion adds ounce/ounces wording support and regression coverage for old/new pour sizes under a reused button ID. Validation: eight UI DOM scenarios, 76 backend checks, and both TypeScript checks pass. Browser/phone check unavailable. Backend PR #196 is live on Render at 675b514 after 2,613 CI tests passed. Website release cdd1713 passed Vercel preview and production builds; the live COGS page and served recipe-reuse controls were verified. Manual: Context/session-handoffs/2026-09-12-liquor-recipe-reuse.md. No new application dependency or schema change.

- **2026-09-11 — liquor bottle sizes (released).** Tanqueray arrived as 1L alongside the older 750ml entry. Counted rows now display their size, invoice suggestions avoid known size mismatches, and the duplicate warning checks product plus size. Manually choosing a conflicting size asks the reviewer to confirm that the invoice size was read incorrectly. The pre-submit review displays the backend's recent-delivery size questions outside the dollar-ranked findings cap, showing delivery date, quantity, and counts by size. The counter may check the labels or submit the count as-is; no count is inferred from purchases. Optional response field supports either deployment order. Saving must succeed before checking/submitting; failure of the advisory check itself still permits submission. Backend companion implements exact and small/large voice size resolution plus the delivery check. Validation: eight UI DOM scenarios and 92 backend checks pass; backend TypeScript passes. Website TypeScript now passes after replacing the recorder capability guard with an explicit function-type check during release preparation. Standard build compiled, then Vercel packaging failed on a Windows symlink EPERM. Browser/microphone checks remain pending. Reproduction and release status: Context/session-handoffs/2026-09-11-liquor-bottle-sizes.md; saved fixture: scripts/qa-liquor-bottle-sizes/. No application dependency or schema changes. Release verified: backend PR #195 / Render commit 9796f5f live; Website 014eea4 passed preview and production Vercel builds; full backend CI passed 2,584 tests. The production COGS page, served feature code, and API health were checked. Real phone/microphone checks remain pending.

- **2026-09-07 (later) — the kitchen count screen, made usable on an actual phone.** Jon tried it on his phone the day it shipped; the verdict was tiny inputs, awkward sideways shelf navigation, raw catalog labels and content under the footer. **Inspected in a real browser at 390px** (headless Chrome driven over CDP — no new dependency; Node 24's built-in `WebSocket` is enough), which turned the complaints into numbers: **every number box was 32px tall — 15 of 15 under the 44px touch floor** — and the shelf strip pushed **838px of tabs off-screen**, so seven of ten shelves were unreachable without a sideways drag and nothing said which shelf you were on. **Changed:** the strip became a sticky header — `‹ Fryer Line · Shelf 7 of 10 · 0 of 41 counted ›` — with a tap-to-open list of all ten, numbered in walk order; there is now **no horizontal scrolling anywhere on the screen**. Boxes are **52px tall at 20px type**, label above rather than beside, and the multiplier moved into the label as a `× 36` chip — without it two different boxes both read "cases" (a case-counted SKU's loose box, and a pack SKU's multiplier). Names are split on the first comma and the head noun is weighted: **Cup** · Clear, Plastic 12Oz. **Display only — the stored name is the identity the invoice matcher and the voice extractor key on, and is untouched.** Footer clearance was 84px against a 96px footer; it now clears the measured height plus a thumb. **The find that needed the browser:** with the soft keyboard up the focused box sat at y=557 in a 544px viewport, *behind* the footer — a timer hung off focus fires before the keyboard animates in, so the fix listens to `visualViewport` resize and re-centres the row. Verified: **y=259, footer at 448.** **Two defects of my own, caught by looking at the render:** a `0` placeholder in every empty box (an empty box means NOT COUNTED and a zero means "none here" — the precheck and the report are built on that distinction), and `margin-left:auto` on a wrapping flex line orphaning the `clear` button off the right edge. **Save, unit conversion and submit are byte-identical** — the diff touches no `writeCell` / `doSave` / `doSubmit` / `caseSize` line, and every CSS selector is `lq-fc-*`, so the liquor count screen cannot move. The home screen was left alone as asked.

- **2026-09-07 — the kitchen count screen (`CountFood.tsx`) on `/cogs`, and the held-cost control on the invoice list.** Part of COGS platform M1; the backend half is tprs PR #171, the spec and approval doc are `../Opsi/BUILD-SPEC.md` §11.24–11.25 and `../Opsi/DEPLOY-M1.md`. **A sibling of `CountLiquor`, not an extension of it** — that screen is 1,700 lines about bottles, batches, tenths and millilitres, and a kitchen counts sacks, cases and each. What IS reused: the dictation hook, `/voice-extract`, the count API and the precheck. Zone-by-zone with membership pre-populated from the Opsi guides (a hint, not a constraint — search-to-add always works), cases + loose boxes labelled with the SKU's own count unit, debounced save/resume, and voice → review → apply with the three refusals (ambiguous name → the counter picks · cases with an unknown case size → ask, never multiply · a pre-multiplied-looking utterance → strand it). **Every food class is namespaced `lq-fc-*`** so the liquor grid cannot move. **Three traps worth keeping:** (1) a resumed count must NOT revalue its cases at today's multiplier — the existing cell's `caseSize` wins and the catalog is consulted only for a cell that does not exist yet, or a saved 2 × 12 = 24 becomes 72 on edit; (2) `doSave()` returns a boolean and both Finish and Submit abort on false — failing open on the *check* is fine, failing open on *persistence* closes the count over whatever older rows happened to reach the server; (3) that refusal has to render in the **fixed footer**, not the mic toolbar — the toolbar is at the top of a long shelf list and the buttons are at the bottom, so a correct message there is simply off-screen and the counter sees a Submit that does nothing. Blocking failures now sit next to the save state in red, and `not saved` is red too (it was muted grey, the same weight as `saved`). `astro check` was not run — it wants to install `@astrojs/check`; `astro build` compiles the screen and emits `/cogs/index.html`. **No React test harness exists in this repo**, so the count arithmetic is verified by the server-side tests around it and by reading, not by a component test.

- **2026-09-05 — cancellation terms split from TWO payment rails into FOUR (owner rulings, same day; Website half shipped, TPRS + Avery still to come).** Triggered by a live thread: Lisa Rayhill (E-5587028, SMS) asked a kids-birthday cancellation question and Avery answered with the catered deposit cadence, telling her she was *"fully refundable right up until your final payment"* on a product that takes the whole payment at booking. That answer contradicted the checkbox she would have ticked to pay. Root cause was mis-scoping, not a gap: nothing in the KB or on this site scoped cancellation by product, and the 2026-08-31 ruling had lumped kids birthdays in with lane reservations under a flat 72 hours. **The four rails:** **A Catered** (product codes 14/15/16/17 — Pizza & Pop, Stars & Strikes, Twisted Italiano, Burrito Bowl, already TPRS's `CATERING_PACKAGE_CODES`): 50% deposit, headcount requested at seven days, refundable until the final payment. The ONLY rail where "deposit" and "final payment" may be said — Jon: *"Those don't and shouldn't produce any final payment language terminology because the final payment is made when they book online. There's no deposit for any of those."* **B Kids birthday** (109/118, `twistedpin.com/kb`): paid in full at booking; cancel 14+ days out and we move you to another date OR refund in full, guest's choice. The refund is **unconditional** (never "may be eligible" / "case-by-case", which is what the legacy Roller-era confirmation email said) and the date move is deliberately **unbounded** — Jon was offered the Roller policy's two-month bound and declined it. **C Lane reservations** (4/5/121/123): paid in full, 72 hours, unchanged. **D NYE** (124/126): paid in full, no refunds, gift certificate at 14+ days less the service fee. **Why B and C differ at all:** lane products carry `max_advance_booking_days = 10`, so a 14-day rule is arithmetically impossible there. **The kids dead zone:** 109/118 have `sales_cutoff_minutes_before = 10080` (7-day minimum lead) with no ceiling, so a party booked 7–13 days out is past the 14-day line at purchase; Jon ruled *leave the cutoff, say it plainly* rather than move it. **NYE was the surprise:** both live TPRS NYE '26 forms already carry a REQUIRED "No refunds!" checkbox (`form_fields` display_order 5 on `6b6bc005` / `420143ce`) ported from the Roller '25 form, so an NYE guest was ticking two contradictory required boxes on one purchase — the forms were right and this site was wrong. Forms deliberately NOT touched. **Catered timing tightened to SEVEN DAYS** everywhere a guest reads it (Jon: *"we request your final headcount seven days prior. Once that's confirmed, we request your final payment"*); the day-6 check stays an internal Needs Attention backstop. Seven and six are not in conflict — we ask a day before it is due — so the 2026-08-11 dated-deadline work on the deposit emails stands. **Shipped here:** `terms.astro` §10 (one pay-in-full paragraph became three, plus the LAST_UPDATED bump and the hero sub dropping "deposit", which scoped that word across all four rails), `birthday-parties.astro` (both the FAQ answer AND `schemaA`, which feeds the FAQPage JSON-LD — the wrong 72-hour answer was published as structured data Google could serve), `pageConfig.ts` birthdays + NYE `termsText` (the checkboxes guests tick to authorize the charge), and the `about a week` → `seven days` sweep on `/faq`. Two banned words fixed in passing: "scheduled window" and two instances of "time slot". **The discretion clause at §10 is untouched and is the point** — Jon notes he has never actually failed to refund or issue a gift card on NYE, and a strict stated term plus that clause is what lets him keep saying yes without the courtesy rewriting the rule. **Still open:** TPRS products 109/118 `confirmation_email_notes` still carry the legacy transfer-only paragraph (live catalog data, not git); Avery's KB is still unscoped by rail; Roy has no cancellation content at all and his prompt wrongly asserts "Deposits for booked events or parties"; `balance-final-notice.eta:30` still says "due 6 days before your event" to a guest; `brain/checks/test-kb-cancellation-policy.mjs` has been RED since `a1365ee`; and the $15 Extra Birthday Guest of Honor (product 112, never sold once) is unruled. Separately root-caused the same night and NOT fixed: the Avery claim-hold false positive that ate two correct answers on that thread.

- **2026-09-05 — `AGENTS.md` converted from a stale copy of CLAUDE.md to a pointer.** The file was CLAUDE.md as of 2026-05-17 (`6a8459f`, plus two self-referential renames) and was never updated again; it still told Codex to write *"set apart from the main floor"* (banned in `../../../CLAUDE.md`) and *"built by America's Top Mixologist"* (retired 2026-05-17 in `cb6e278`), described `launch-checklist.md` as pre-launch, and listed four Context files where there are eight. Compared line-by-line against that CLAUDE.md commit: **no unique instruction existed in it**, so nothing was moved. Recoverable: `git show 51a2b95:AGENTS.md`; the lineage is byte-identical in `CLAUDE-2026-09-05-full.md`. Pattern follows `Marketing Avery/AGENTS.md` (2026-09-05). **Open:** this repo has no designated live changelog since the split — `../../../CLAUDE.md` still says "Website its own Decisions Log", which was the section archived into this file. This section is where post-split entries go until Jon rules otherwise. **Not verified:** that Codex actually loads `AGENTS.md` here in a fresh session, or walks up to `../CLAUDE.md` — only that the paths exist.

## In Progress (archived from Website/CLAUDE.md 2026-09-05)

- **2026-09-04 (late) — SINGO MUSIC BINGO on the site + Roy answers for it (ALL LIVE: Website `f4a6f67` → `30ef698`, Roy agent v73 pinned).** Handoff of record: [session-handoffs/2026-09-04-singo-music-bingo-roy.md](Context/session-handoffs/2026-09-04-singo-music-bingo-roy.md). Tone Bar Games' weekly music bingo, Sundays 7pm from Sept 13, put up as a TRIAL RUN through Nov 29 (Jon: "until the end of November as a safe starting point, then decide"). Wired the karaoke way, one markdown file drives everything: `src/content/events/singo-sundays.md` (tag `music-bingo`) → the /upcoming-events card (12 Sundays) + Event/Schedule JSON-LD + `programs.music-bingo` in /api/hours + a new `/api/music-bingo/` endpoint (trailing slash load-bearing) that Roy's new `check_music_bingo` tool calls. Both program endpoints now sit on one helper, `src/lib/program-endpoint.ts` (a third program = tag the markdown + a three-line route + a Retell tool). **programs.ts phrasing changed for BOTH programs:** "this week" is Sun–Sat, which trapped a Sunday program (a Saturday caller heard "Not this week" about a night 20 hours away) — now tomorrow → "is tomorrow, Sunday…", within 6 days → "The next X is…", 7+ days → "Not this week" (reserved for a real dark week); karaoke's Wed/Fri answers shift accordingly, all asserted in `scripts/check-programs.mjs` (its `EVENTS` fixture mirrors BOTH files now). Roy: draft v72 (an empty draft someone/the UI had opened at 22:25Z) got the tool + a "Standing programs" Rule 13 covering both + keywords (Singo / music bingo / bingo / Tone Bar Games), published, phone pin bumped 71→72; rollback = pin 71. Docs: `Roy_Music_Bingo_Awareness.md` (Retell folder), `Context/adding-events.md`. **Confirmed by Jon same night:** 9pm end, free to play, no dark Sundays yet (`skip:` empty until he checks). **Flyer added** (`Context/pictures/singo-flyer.jpg`, gitignored → `public/snap/event-singo-810.*`): the source is 4:5 and every 1:1 crop lost the headline or the Twisted Pin logo, so the encoder gained a `pad: [w,h]` + `background` option (letterbox on a near-white matching the flyer) alongside the existing `aspect` crop. **Still open:** no CTA (needs the Facebook post's /share/ link); CTA added later that night (Tone Bar Games' Facebook event, Twisted Pin co-host, `65afbd8`). **Roy voice trap, fixed:** Jon's v72 draft had been a voice experiment, so publishing it put `retell-Nico` + expressive mode live where v71 had `11labs-Paul`; Jon: "I want Paul back" → v73 = voice-only revert (11labs-Paul, expressive off), published, phone pinned 72→73. **Lesson: when reusing an existing unpublished draft, diff the AGENT fields (voice, expressive mode) against the published version, not just the LLM prompt** — the prompt was identical and the voice was not. Rollback of the bingo work = pin v71. Promo bar added on Jon's follow-up (`singo-launch-2026` to Sept 13, then `singo-sundays-2026` Sept 14 → Nov 29, LAST in rotation like karaoke's season beat — extend it together with the markdown `until`). NOT done: road sign / Meta / GBP (Jon: later), Roy KB text (Rule 13 routes every timing question to the tool, so nothing is waiting on it).

- **2026-08-28 — Ads check-in (Aug 14–28) + Script 18 LIVE + first attribution read + SiteGuru / alcohol-policy triage.** Full narrative + rulings + open items: [session-handoffs/2026-08-28-ads-checkin-script18-attribution-siteguru.md](Context/session-handoffs/2026-08-28-ads-checkin-script18-attribution-siteguru.md) — **read it before the ~Sept 14 Ads check-in.** Headlines: 9 real gclid inquiries (5 company events, two 100-head Oct 20 / Dec 12) vs 3 counted; **Script 18 ran live** — Aurora penalties removed on both campaigns (Jon: removal only, never a boost), Romeoville boost moved OP→Events, Shorewood boost removed, 30 negatives (`gift` singular — negatives don't stem); **Naperville/Events HELD by Jon** ("huge possibility, takes time"); **Bar-Led $12→$6 / Events →$41 built but OFF pending ruling**; **calls item CLOSED** — 2 real calls/14d, the July "$1.91/call" note misread the Interactions column. **Attribution lives in `avery_event.attribution_source`** (Jul 1→now: Direct 139/17 booked, Google 40/5, **Meta 9/0 — spend unknown, biggest blind spot**, ChatGPT 5/0; 237 no-attr SMS rows are feedback/rebook, not inquiries). SiteGuru 97% = nothing actionable (fresh PSI: /rewards 99, **/pricing 99 — closes the 5/17 "3.6s LCP" item**); `/es/bowl` KEEP (organic case survives cancelled ads). Google's Sept-30 alcohol-policy email = no US change; 0%-cert/suspension language is Egypt/India/Indonesia only. Memory: [[google-ads-checkin-2026-07-07]].

- **2026-08-02 — `/signatures` internal Gmail signature installer (LIVE, `985f6ce`→`88a4be5`).** Staff page at `twistedpin.com/signatures/` where **Jon Dow · John Valianos · Shanna Dow** each edit their details and hit Copy; the signature is table-based email HTML with inline styles, and the Copy button ships `innerHTML` to the clipboard. Ported from the Claude Design project *"Gmail signature optimization"* — specifically `Signature Install.dc.html`, the cleaned-up version of variant **2c** in the sibling exploration doc `Email Signatures.dc.html` (that sibling is a one-person previewer whose defaults are Jon's details — which is why Jon appeared "missing" at first; he was never in the file that was implemented). Unindexed the same four ways as `/liquor` `/money` `/playbook`: noindex,nofollow + robots.txt Disallow + `astro.config.mjs` sitemap filter + `STAFF_PATHS` in `Base.astro`. Orphan by design. **Add a teammate by adding ONE entry to `PEOPLE`** — step-1 fields, the preview and the Copy button all generate from it; `<key>PhoneHref` derives by suffix, and keys are `jonDow`/`johnV` deliberately (a one-letter `jon`/`john` difference between two real people's state keys is a bug waiting to happen).
  - **`public/email/` is load-bearing.** Gmail only renders images at a public URL, so the 8 PNGs live there and serve from `twistedpin.com/email/*`. The on-page preview uses `/email/…`; Copy rewrites that prefix to the absolute base. Never re-host on Drive/Dropbox/Docs — Gmail blocks those. Filenames are stable, so swapping an icon needs no re-paste (Google's image proxy may cache an old copy on already-sent mail).
  - **⚠️ THE MOBILE TRAP.** Gmail's phone app does **not** scale a too-wide message down — it forces the table to the column width and lets cells fight over the remainder. The design doc's claim that a 460px table *"renders identically on desktop and mobile without stacking"* is **false**; measured at 300/336/360/412px it is not. While the logo cell pinned `width="200"` the text column ate the whole shortfall and the phone number broke across **three lines** on a real device. Fixed by choosing which side yields: table `max-width:100%`, **no width on the logo cell**, logo img `max-width:100%`, `white-space:nowrap` on name/title/contact labels. Logo now rides 200px→45px. **Do not re-add a width to that cell.** Media queries are not available — Gmail strips `<style>` from pasted signatures.
  - **⚠️ Browser measurement runs optimistic here.** Gmail Android substitutes **Roboto for Arial**, and Roboto is wider for letterspaced uppercase — the footer fit on one line at 336px in Chrome yet wrapped on a real phone at the same width. Any one-line element needs margin, not a hairline fit. The footer is now two *deliberate* lines (explicit `<br>`), so width can't break it.
  - **Google badge → `MAPS_VENUE_URL`** (the listing), not the review form; `GOOGLE_REVIEW_URL` (new in `schema.ts`, built from `PLACE_ID`) is kept for surfaces where the ask *is* the point. Both derived, never pasted: the design hardcoded `maps.app.goo.gl/yyiVoLzTsHA2TNGW8` (**dead** — Firebase Dynamic Links, sunset Aug 2025) and `share.google/…` links resolve to a *search results* page carrying share-flow `utm_source` tracking. Clearing the field removes the badge entirely rather than hiding it, so an empty `href` can't reach the clipboard.
  - **Icons were rebuilt, not imported.** The design MCP returned corrupted base64 for 5 of 8 PNGs; they were recovered pixel-exact from the `-white` variants (identical alpha, RGB recoloured to `#111111`). The phone and Google glyphs were then **redrawn** — the phone was the only filled shape in an outlined set and read as a blob at 26px; the Google mark nested a second ring inside the ring. Ring geometry for any future icon: 56×56, centre r=24, 3px stroke, `#111111`, glyph ~24-26px.
  - **RESOLVED 2026-08-09 — the repo was right.** Facebook is `/twistedpin` (as in `schema.ts` `sameAs`, SnapFooter, `signatures.astro`, and `tprs/pageConfig.ts`); the design doc's `/twistedpinplainfield` was the wrong one. Jon confirmed against the live profile — **Facebook login-walls automated fetches, so this is not verifiable from the repo or by WebFetch; it needs a human with the page open.** `LocalBusiness` structured data has been pointing Google at the correct profile all along. Don't re-raise. Memory: [[gmail-signature-mobile-constraints]].

- **2026-08-01 MEGA-SESSION — ads check-in + holistic SEO review + seasonal pre-staging + FKB 2027 transition (ALL LIVE).** Full narrative, error ledger, and open-items table: [session-handoffs/2026-08-01-ads-checkin-seo-review-seasonal-prestaging.md](Context/session-handoffs/2026-08-01-ads-checkin-seo-review-seasonal-prestaging.md) — **read it before touching ads, seasonal pages, or the FKB/Pin-Pass flows.** Headlines: (1) **Ads** — Jul 18–31 read + Script 16 live (Q4 ramp funded: Events $35, corporate exacts $7; 51 negatives; geo verdicts — Romeoville conquest CONVERTED); ground truth beat the dashboard (9 real inquiries vs 2 counted, incl. a deposit-paid $790 company event) → standing rule: cross-check `avery_event` before trusting Ads conversion columns. Next check-in ~Aug 31. (2) **Verdicts** — NO paid GEO tracker (quarterly DIY prompt audit instead), NO blog cadence; the Yelp→OpenAI deal makes **Yelp/Bing Places/Facebook/TripAdvisor the ChatGPT supply chain → listings refresh is Jon's highest-leverage open item.** (3) **Site** (`4d55743`+`963cf8d`+`4d87cc4`) — font-swap CLS killed site-wide (size-adjusted fallbacks, capsize-computed), footer "Explore" row de-orphaned the 7 why-us pages + 3 guides, /holiday-parties got its FAQ block + FAQPage schema, birthday hero carries both audiences, league interest form on /leagues → Resend → contactus@, /reserve-preview2 deleted (was leaking into the sitemap). (4) **THE DATE-GATE PATTERN:** /free-kids-bowling → 2027-waitlist mode and /summer-pin-pass → off-season mode **flip THEMSELVES at midnight CT Aug 15** via build-time date gates + the daily cron rebuild (both future states build-verified; promo bar hands off to "Holiday parties — December books fast" the same morning, NYE joins Nov 15). **Waitlist sends NO confirmation text (Jon)** — the page panel is the confirmation; the n8n intake was fixed + live-verified same session (without it, waitlist joiners would've gotten the $10 SAVE10 coupon text). NO rollover: 2026's 3,307 (≈2,490 marketable) re-register in 2027; spring send = one SMS to both cohorts. **Nothing remains before Aug 15.** Memory: [[google-ads-checkin-2026-07-07]], [[seo-ai-search-posture-2026]], [[fkb-2027-transition-plan]].

- **🟢 SITE IS LIVE at https://twistedpin.com (cutover 2026-05-17).** New build replaces the legacy site. All 18+ production 301 redirects are load-bearing for real traffic; GSC actions affect real indexing; copy/schema/perf changes ship straight to production.

- **Audience-funnel event pages shipped (2026-05-18)** — 4 new pillar pages split out from `/events` to capture audience-specific search intent: `/corporate-events/` (`corporate event venue near me`), `/holiday-parties/` (seasonal nav Sep 1→Jan 5), `/showers/` (bridal + baby combined), `/wedding-receptions/` (intimate weddings + rehearsal dinners). All use the same recipe — pillar template, vip-lanes-* LCP + buffet-* lazy below the fold, Service schema with 8-city `areaServed`, Heyflow closing CTA. 4 legacy 301s retargeted from `/events/#corporate` (hash drops on 301) to the new top-level URLs. 11 `/why-us/*-il/` city pages cross-linked. Stage 6 from the punch list (which planned `/events/{type}/` URLs) is now SUPERSEDED — see Decisions Log 2026-05-18. **Latest session captured in [session-handoffs/2026-05-17-punch-list-stages-0-4.md](Context/session-handoffs/2026-05-17-punch-list-stages-0-4.md) — read first.** Prior session: [2026-05-17-schema-lcp-perf-sweep.md](Context/session-handoffs/2026-05-17-schema-lcp-perf-sweep.md).

- **Pre-ads-launch perf pass shipped (2026-05-17)** — 8 commits across schema, LCP, AVIF posters, cache headers, ES2020 build target, hero-preload gating. **Every ad-blocking page is now under 3.5s LCP** (`/events` 6.9s → 3.1s, `/game` 7.5s → 3.2s, `/bowl` → 2.5s green band, `/vip-suite` 4.0s → 2.9s green band, `/fundraisers` 4.7s → 3.5s, `/birthday-parties-booking` 3.5s). GSC `/events` Review-Snippets error fixed via dual `@type` + 6 missing schemas added. AVIF posters site-wide saved 367 KB. The "aha" fix was `47e7479`: hero LCP preload was unconditional in Base.astro, wasting 280 KB on every pillar page that doesn't display the hero — gated to homepage only. **One action remaining: in GSC, click Validate Fix on `/events` Review Snippets issue.**

- **301 redirect map shipped** (2026-05-06) — 18 legacy URLs preserved per launch-checklist. Plus `/essential` + `/elevated` SMS short links for text marketing.

- **`/upcoming-events` rebuilt** (2026-05-06) as a real calendar driven by an Astro content collection (`src/content/events/*.md`). Empty state when zero events; multi-day cross-month range support; CTA per event. NYE 2026 is the first entry.

- **`/new-years-eve` page live** (2026-05-06) with NYE.mp4 video hero. Exists at the URL year-round; surfaces in NavDrawer Visit section between `showFrom` / `showUntil` via the new `src/config/nav-seasonal.ts` system. Body copy is voice-y placeholder until ops gives package details.

- **`/pricing` page live** (2026-05-06) — day-tabbed walk-in pricing surfaced via NavDrawer Info section. Mon-Thu collapse to 2 columns; Fri/Sat/Sun show 3 columns (Time / Trad / Suite). Specials content collection (Penny A Pin Wednesday) renders as a callout above the table. Holiday note + "verify on Google" caveat preserved.

- **"Plan an Event" CTA destination is configurable via `src/lib/links.ts`** — `PLAN_EVENT_URL` toggles between `AVERY_ON_URL` (Zite, AI sales agent under test) and `AVERY_OFF_URL` (Heyflow `event.twistedpin.com/#start`). One-line flip propagates to all 19 importing CTAs in ~90s. **Currently set to Heyflow (OFF)** matching ops reality and ads sitelinks. The earlier 2026-05-06 locked decision (Zite) was provisional pending Avery proof-out; the toggle infrastructure supersedes the lock. (Mirrors the Reserve → Roller pattern. `/events` and other educational links stay on the local /events page.)

- **Google Places API live hours** (2026-05-06 wiring; **env vars confirmed set on Vercel as of 2026-05-08**) — `src/lib/google-hours.ts` reads live hours from the Business Profile when `GOOGLE_MAPS_API_KEY` + `GOOGLE_PLACE_ID` are set; falls back to static `src/data/hours.ts` otherwise. **Live in production** — confirmed empirically by ops (hours auto-updated 2026-05-08 with no commit). All hours surfaces (SnapFooter status strip, /pricing day tabs, /faq "What are your hours?", schema `openingHoursSpecification`) read through `getLiveHours()` / `formatHoursAnswer()`. Single point of truth: edit `src/data/hours.ts` only as a fallback if Google API ever errors.

- **GoTab + Untappd menu data is wired** (2026-05-05). Daily 4am cron rebuilds. See [session-handoffs/2026-05-05-menus.md](Context/session-handoffs/2026-05-05-menus.md).

- **`/menu` hub + thumbnails** (2026-05-05) — 7th inline nav slot; horizontal-split cards with real hero photography.

- **`/privacy`, `/terms`, `/accessibility`** (2026-05-05) — three compliance pages live. Counsel review status: unknown / open — confirm with ops whether these were reviewed before the 2026-05-17 cutover.

- **`/coupon` native form → LOYALTY PLATFORM (2026-07-24 cutover; this bullet corrected 2026-08-01 — it was two migrations stale).** History: native-Patch-API form (2026-05-05) → reverted to Patch iframe (2026-05-07) → **native loyalty form (2026-07-24): posts to `/api/coupon-signup` → n8n `WF-Loyalty-Forms-Intake` → Supabase loyalty platform; grants `signup-10off` ($10 / code SAVE10 / 21-day expiry) with first-join gating.** Patch is CANCELLED and not revivable; zero live Patch dependencies remain site-wide (verified 2026-08-01). `PATCH_API_KEY` + `PATCH_ACCOUNT_ID` on Vercel are dead — remove whenever convenient.

- **DNS migration runbook** (2026-05-05) — full cutover plan in [Context/dns-migration.md](Context/dns-migration.md). User picked GoDaddy DNS.

- **Lighthouse baseline + LCP optimization** (2026-05-05) — Desktop 100/100/100/100; Mobile 86 with LCP 3.9s. **Don't re-test until real photography + final hero splice land.**

- **Vercel auto-deploy** — main-tip auto-deploys to https://twistedpin.com (production domain since 2026-05-17 cutover). Preview deploys still spin up on every branch.

- **Mobile hero video splice** — direction approved (3 sources), specific window timestamps pending user.

- **Adobe Fonts kit** — declined 2026-05-06. Substitutes (Barlow Cond / Montserrat / Roboto Slab) ship for production; user opted out of the CC subscription cost. Swap is a 5-minute CSS-variable change if direction changes later.

- **Real photography** — pillar pages still use placeholders / homepage reuses. Encoder pipeline ready (`scripts/build-snap-images.mjs`); when sources land in `Context/pictures/`, AVIFs auto-generate.

- **Capacity copy + venue schema shipped 2026-05-19** — *"Up to 80 in the suite, or up to 200 for full-venue buyouts"* now appears across `/vip-suite/`, `/events/`, `/corporate-events/`, `/holiday-parties/`, `/fundraisers/`, and 5 `/why-us/*` city pages (lockport, naperville, oswego, romeoville, shorewood). `localBusinessBase()` schema gained `maximumAttendeeCapacity: 200` (venue-level); `/vip-suite/` EventVenue keeps its own 80 (suite-level). Deliberately excluded `/wedding-receptions/` + `/showers/` — both intimate-positioned; new docstring comments document the exclusion logic to prevent future-maintainer drift. Commit `17b2bed`.

- **Live Google reviews wired 2026-05-19** — extended the existing daily Places API cron to also fetch `rating` + `userRatingCount`. SnapFooter proof-card + LocalBusiness `aggregateRating` schema both read live values, falling back to `GOOGLE_RATING`/`GOOGLE_REVIEW_COUNT` constants when snapshot is missing. Zero additional API cost (same SKU, expanded field mask). Visual treatment in SnapFooter unchanged. Verified end-to-end: snapshot `live-hours.json` now carries `rating: 4.5, reviewCount: 1142` (bumped from the hardcoded 1141 — proof the data is live, not echoing constants). Commits `d8ee252` (wiring) + `6023192` (cron trailing-slash fix that made the cron actually fire — see below).

- **Cron silent-failure fixed 2026-05-19** — `vercel.json` cron `path` was `/api/cron/rebuild` (no trailing slash). `astro.config.mjs` sets `trailingSlash: 'always'` which 308-redirects every URL to the slash form. **Vercel Cron does NOT follow 3xx responses** — so the cron path needs the trailing slash to match the canonical form directly. Symptom of the bug: zero log entries for `/api/cron/rebuild` for 5 days (2026-05-14 → 2026-05-19); `live-hours.json` snapshot was empty `{}` the whole time; site fell back to static hours. One-character fix in `vercel.json`. Commit `6023192`.

- **Apex redirect type 307 → 308 (2026-05-19)** — Vercel Domains UI was defaulting to 307 Temporary Redirect for the `twistedpin.com → www.twistedpin.com` redirect. Google's Redirect error guidance specifically flags 307 on canonical URL changes (it tells Google "this page is temporarily here, don't update your records"). Flipped to 308 Permanent in the Vercel domain edit dialog. Full chain `http://twistedpin.com/` → `https://twistedpin.com/` → `https://www.twistedpin.com/` is now 308-308-200 (was 308-307-200).

- **❌ Mixology event — CANCELLED 2026-07-26 (low signups). Do not rebuild from the notes below without re-reading this paragraph.** Jon called it off two days before the date. **Website (removed):** `/mixology-experience/` + `/reserve/mixology/` pages deleted, `mixologyPageConfig` deleted from `src/tprs/pageConfig.ts`, promo-bar entry deleted from `src/config/promos.ts` (the homepage bar now runs a single static Free-Kids-Bowling promo — the rotation JS no-ops below 2 slides), seasonal NavDrawer entry deleted from `src/config/nav-seasonal.ts`, `src/content/events/2026-07-28-mixology-experience.md` deleted (drops it from `/upcoming-events` + its Event JSON-LD), `/reserve/mixology` sitemap exclusion removed from `astro.config.mjs`, `mixology-host`/`mixology-card` sources removed from `scripts/build-snap-images.mjs`. **Both URLs 302 → `/upcoming-events/` in `vercel.json` — deliberately 302, not 301,** because the lander was the printed-QR/social target and an indexed page: if the night is ever rescheduled we want the URLs back without fighting browser-cached permanent redirects. Flip to `permanent: true` once it's clear the event isn't returning. The built `/public/snap/mixology-*.{avif,webp,jpg}` files are intentionally LEFT in place so hosted URLs keep resolving. **TPRS:** product code 500 deactivated (see below) — the 20-seat pool, the 7/28 override, and the ack form are left in place, so a reschedule is a date change plus reactivation, not a rebuild. **`scripts/seed-2026-holidays.ts` still carries a comment saying 7/28 is deliberately NOT a venue closure "because the Mixology Experience sells that night" — that rationale is now dead** but the exclusion is harmless (7/28 is a Tuesday and the venue is closed Mon–Wed anyway, plus active VIP + Traditional pool closures already block lanes that day). **3 guests had already paid** ($238 each, 2 seats × $119: Cathy Hawkins, Rita Duque, Patricia Gwaltney) — refunds + personal outreach are an ops task, not a code one. Historical context below is retained for a possible reschedule.

- **[HISTORICAL — event cancelled, see above] Mixology event (2026-07-03) — LIVE (bar one deploy).** "An Evening with America's Top Mixologist," one-night ticketed cocktail experience, Brian Van Flandern (Tue **2026-07-28, 7 PM, $119/person, 20 seats, 21+**, venue closed to the public). **TPRS migration `0089_mixology_event_seats` APPLIED to prod:** "Mixology Event Seats" pool (20 resources) + per-seat product **code 500** ($119, 1 seat/unit, 120min, cap 10/order, tax `untaxed`, gl `BOWL - Special Event`) + single `product_date_availability_override` (7/28 19:00-19:30, NO product_schedule → only that one slot ever bookable) + 2 REQUIRED ack checkboxes (21+, ticket-only). FKs COALESCE to migration-seeded fallbacks (CI-portable). **Website DEPLOYED:** lander `/mixology-experience/` (Details→Host→Experience order; Brian photo `mixology-host-*` = desktop split-hero + mobile Host section; refund policy 10-day/resale), booking `/reserve/mixology/` (`mixologyPageConfig` code 500; noindex + sitemap-excluded), `/upcoming-events` entry, seasonal NavDrawer (martini, 7/3→7/28). **Social/QR link = `twistedpin.com/mixology-experience/`.** **⚠️ OWNER-APPROVED PER SE / MICHELIN EXCEPTION (2026-07-03):** the site-wide Per Se / Thomas Keller / three-Michelin-star ban STILL holds everywhere else, but Jon explicitly authorized the framing in this page's "Your Host" section ONLY (Brian = "only mixologist tied to a three-Michelin-star distinction, for opening Thomas Keller's Per Se"). Marked as a deliberate exception in the .astro — do NOT strip in a brand sweep, do NOT propagate to other pages or the checkout copy. **Closure trap RESOLVED:** the `[auto-holiday:2026-07-28]` VENUE closure (from `scripts/seed-2026-holidays.ts`, 3am→3am/day) zeroed the event's seat pool; Jon cancelled it + added VIP+Traditional POOL closures (public closed, event open); seed script patched to not re-add 7/28. **Catalog-visibility bug FIXED:** `getBookableProductsGrouped`/`filterScheduled` only listed products with a recurring `product_schedule`, so the override-only event was invisible in the grid; patched to also list products with an active `added` override (tprs `apps/backend/src/services/customer-catalog.ts`). **✅ CATALOG FIX IS IN MAIN (confirmed 2026-07-14):** the override-only-product listing fix shipped to main as `de59695 fix(catalog): list override-only products + Mixology Experience event (0089)` — the earlier "must be merged to main" note is RESOLVED, the override-only event is visible in the booking grid in prod. Branch `feat/teacher-group-recurring-blocks` now holds only 2 unmerged **cosmetic** commits (`0090` product-card image + trim 21+ ack copy · `0091` remove prize mention from code 500) — safe on `origin`, optional polish for 7/28, NOT load-bearing (event books fine without them). Memory: [[mixology-event-build]], [[tprs-venue-closure-blocks-all-pools]].

- **`/playbook` teammate culture book LIVE (2026-07-20).** Internal Playbook + (pending) Guidebook at `twistedpin.com/playbook/`, shared password **`onefamily`** (case-insensitive, whitespace-trimmed). Password-gated SERVER-SIDE in the route frontmatter (`prerender = false`) so unauthenticated requests never receive chapter content; noindex + robots Disallow + sitemap-excluded + `isStaffPage` (no GA4/Clarity/Meta). Paged reader — one chapter per screen — because the source doc gives every chapter a "Next CTA" and the short-line pacing IS the voice. **Part One is LOCKED and transcribed verbatim** into `src/content/playbook/chapters.ts`; do not rewrite or tighten it (source of record: `Context/Twisted Pin Playbook.txt`). End-of-book signature writes `public.playbook_acknowledgments` (Supabase `twistedpin-platform`) and emails info@ via Resend — DB failure fails the request, email failure does not (the row is the record). **Part Two shipped same day** — flow is now cover+password → "who are we talking to?" (name) → hub → **The Playbook** (paged, ends in signature) or **The Guidebook** (`src/content/playbook/guidebook.ts`, contents-first, unsigned, 8 chapters from `Context/Part Two Guidebook.docx`). The name **pre-fills the signature but never auto-signs it** — an acknowledgment has to be an act taken after reading, not a login. **No email on login by design**: the signal worth having is when someone *hasn't* finished, which no notification can report, and per-login mail would train info@ to ignore the completion alert; starts land silently in `playbook_sessions`, so "started but never finished" is `where completed_at is null`. Reading time accumulates **only while the tab is visible** and is client-reported → clamped server-side → **a coaching signal, never evidence**. Contents drawer (phone) / sidebar (≥1025px) spans both books. Walls-of-text handled typographically without touching locked copy (beats <52 chars get air, per-chapter lede, "03 / 17" counter, diamond at the story→principle turn); **Photography SHIPPED 2026-07-20** (`989014c` → `fe0e8ab`): 15 Part One chapters carry Jon's real photos via an additive `photos[]` field per chapter in `chapters.ts` — the locked copy was NOT touched. Four layouts: 1 photo → full-width 3:2 hero · 2+ → two-up 4:5 gallery · `photoLayout: 'timeline'` → the captioned Pioneer→Plainfield→Twisted Pin arc · `'stack'` → full-frame natural aspect, for group panos no tile crop can hold without amputating someone. Encoder: `scripts/build-playbook-images.mjs` → `/public/playbook/<name>-{w}.{avif,webp,jpg}` — re-run after swapping any source, and reach for its `focus: {x,y}` knob when sharp's `attention` crop clips a face. **Trap:** the reader CSS renders an odd LAST gallery tile full-width at 3:2, so that source must be ENCODED 3:2 or object-fit re-crops it live and chops faces. Source photos sit in the **gitignored** `Context/Playbook and guidebook photos/`; the committed outputs are what actually serve, so a fresh clone renders fine but can't re-encode. **Also live:** `/playbook/status` (manager view — signed / stalled 3+ days / signed-an-older-version, plus a button emailing the access brief to info@), `/playbook/poster` (printable 8.5×11 for the time clock, QR → `/welcome`; **single page is guaranteed by FIT, not by a fixed height — 2026-07-23 rewrite.** The old approach pinned the footer to the bottom via `margin-top:auto` and forced `height:10.5in` + `overflow:hidden`; that spilled onto a 2nd page whenever the browser applied *any* default print margin (Chrome/Edge ~0.4in, Firefox ~0.5in) because the 10.5in sheet was then taller than the usable area and broke across pages. Now the content stack is sized to ~9.5in tall — shorter than the usable area under every default margin — and the sheet sizes to its content (`min-height:0`), so it can't paginate no matter the margin setting. QR shrank 2.5→2.0in, headline 62→54pt, logo 2.6→2.15in. **If you add/enlarge content here, keep the stack under ~9.7in or it spills again;** there is NO safe fixed height because usable area depends on the user's margin. Verified 1 page at margins 0/0.4/0.5/0.6in via headless render.), `/welcome` short link. **Signatures are version-stamped** (`playbook_version`, derived from content, server-side only) so a tip-pool or policy change flags everyone who signed the old document. **Search** lives in the contents drawer — no LLM by design (it finds the passage; the book's own words render verbatim), with aliases on the QUERY in `src/content/playbook/search-aliases.ts` — **adding a teammate's exact words there is the whole maintenance story.** **⚠️ THIS REPO IS PUBLIC: `PLAYBOOK_ADMIN_PASSWORD` has no default and the status page fails closed without it — never add a fallback; and the team password's `onefamily` fallback is published, so override it with `PLAYBOOK_PASSWORD` on Vercel.** Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `PLAYBOOK_SESSION_SECRET`, `PLAYBOOK_NOTIFY_FROM`, `PLAYBOOK_PASSWORD`, `PLAYBOOK_ADMIN_PASSWORD`. Memory: [[twisted-pin-playbook]].

---

## Decisions Log (archived from Website/CLAUDE.md 2026-09-05)

- **2026-08-03 — TPRS booking wizard desktop size pass (all /reserve* pages).** Jon's desktop review: the ≥1025px block rebuilt the *layout* (2-col grid + sticky cart rail) but kept mobile *type/control scale* — 13.5px read-to-decide copy, ~165×112px purchase tiles on a 1920 screen, a 440px phone-sheet calendar modal. Shipped the 2026-06-17 rubric (read-to-decide 15–16 / secondary 14 / 12 floor) at desktop scale in `tprs.css`: 36px H2s, 15–15.5px decide-copy, full-column duration tiles (150px min-height), 118px+ time-slot cells w/ 16px times, 22px date chips, bigger calendar trigger, 600px modal w/ ~77px cells, frame 1140→1200px. Cart rail deliberately untouched (dense ledger — 13.5px is correct). **Process:** piloted live on /reserve only behind a `.tprs-desktop-pilot` mount class (per the "mock new patterns on one page first" rule), Jon compared against the ungated /reserve/birthdays, approved after 2 rounds → gate deleted, rules folded into the shared desktop block (`38d473c` → `6e725b7` → `a616acd`). Mobile untouched. **Parked pending Jon's mobile pass:** 13.5px `.tprs-details-body` ("What's included" sell) → 15px, and the 11px cart-bar caption → 12px. **Same-day follow-through:** two-agent site-wide sizing audit ran; Jon ruled mobile FINE as-is on the global 12px `.btn`, the sticky CTA bar, and the money-page section lists, and the NavDrawer fine on both form factors — don't re-raise. `/pricing` desktop rebuilt and APPROVED (`4516e8b`): solid `#141029` card (desktop-only exception to the 2026-05-06 transparent-calendar direction; opaque on purpose — alpha bleeds the watermark through), 72px day name / 48px rates / 16px pills, hero→card gap tightened, eyebrow 14px page-scoped. **Trap discovered:** in page-scoped `<style>` blocks a desktop media query ABOVE the base rules silently loses on cascade order — /pricing shipped 3 dead rounds that way; the desktop pass must stay LAST in the style block (comment in pricing.astro). **Desktop batch SHIPPED same day (`c00aacf`, Jon: "mostly fine with anything desktop-oriented"):** 13px `-section-list` → 15.5px @1025 on 11 pillar pages (the audit's 7 + bar/bowl/game/es-bowl which carried the same recipe), global `.btn` 12→14px @1025 (component-scoped rules keep their tuned values), global `.t-eyebrow` 11→14px @1025, menu-item dialogs 480→640px + 44px close + 11px badges, /upcoming-events first desktop type rules (meta/desc 16px, CTA 13.5px). Header shipped separately (`c01a0a3`+`07f10fc`): squeeze-zone-aware tiers — 1025–1279 keeps 13px nav (7 items barely fit), ≥1280 nav 14px + CTAs 15px, ≥1440 nav 15px. **Follow-through rounds (same day):** /vip-suite hero dead-air fix approved → swept to all 13 sibling typography heroes (`418651b` — min-height 55vh/640px flex-centered voids → content-defined height); inline 11px eyebrow styles stripped from 21 H2s across 11 pages so the global 14px desktop eyebrow actually lands (verified no element-h2 rules were being guarded against); /menu/taps legibility round 2 (name 20px, meta 16px + one color tier up); **NavDrawer VIP Suite "glint"** (`58ef3c4`+`c2a764d`) — periodic light sweep, keyed to drawer-open (`aria-hidden="false"`) with the sweep at the front of the cycle (500ms after open, then ~6.5s rhythm; page-load-clocked version landed mid-rest), reduced-motion gated. **Mobile-side items CLOSED (Jon reviewed the full sub-44px tap-target list + floor fixes and ruled them not needed, end of session):** form floor fixes (12.5px SMS consent, 11px /leagues labels), the ~28px Edit targets, card-link/footer/promo-dismiss tap targets, /rewards inline 13px, footer explore links + 36px social icons — all deliberately left as-is. Don't re-raise without a new trigger (real-user complaint, Lighthouse regression, or an a11y audit).

- **2026-08-23 — Header width tiers retuned to MEASURED fits; VIP SUITE had been wrapping to two lines on every viewport below ~1470px.** Jon's laptop (1920×1200 @ Windows 150% = exactly 1280 CSS px) showed the nav colliding with the Reserve CTA. Root cause: the 2026-08-03 tier boundaries were never measured against the recipes' single-line widths — the 14px recipe needs 1398px but fired at 1280px, and even the 13px squeeze recipe (1273px natural) never fit its own 1025px floor after the 5/11 logo bump + 8/03 CTA bumps. Flexbox hid the overflow at most widths by silently wrapping "VIP SUITE" to two lines (confirmed at every tested width 1025–1439 on the live site). Fix (SiteHeader.astro, all recipes headless-Chrome-measured to fit at their own min-width): nav links get `white-space: nowrap` (overflow is now honest, never a wrap); tiers are 1025 x-compact (44px logo) → 1180 compact (68px logo, covers landscape iPads) → **1280 squeeze (13px nav — what 1920@150% laptops actually see)** → 1440 mid (14px nav / 15px CTA) → **1536 wide (15px nav — 1920@125% and up, unchanged from Jon's approved look)**. Logo width now steps per tier via media query — a flex-shrink valve was tried and rejected (a flex item's min-content contribution to its parent is its *width*, not its `min-width`, so nested shrink never engages). **Trap for future edits: adding/renaming a nav item or CTA requires re-measuring the tier boundaries — and measure the last nav link's right edge against the CTA cluster's left edge, not container boxes (containers report a healthy gap while their content overflows them).**

- **2026-08-07/09 — Website session: /leagues desktop pass + content, the "main floor" sweep, promo-bar reshuffle, /feedback repoint (ALL LIVE, Website only).** Commits `49ab46a` → `b092dfb`.
  - **The 8/03 desktop type pass had a hole, and /leagues is how it surfaced.** The batch swept `-section-list` across 11 pillar pages plus the global chrome; it never touched **page-scoped** CSS. So `/leagues` had correct global `t2-*` sizing (body 17px, hero sub 18px, eyebrow 14px) wrapped around league cards still rendering mobile values on a 1900px screen — 11px labels, 14.5px dates. **When a page "still looks small" after that batch, check its `<style>` block, not the globals.** Fixed desktop-only (mobile floor list was CLOSED by Jon 8/03 and the 11px /leagues labels were explicitly ruled fine there).
  - **⚠️ The type bump exposed a latent layout bug, and the fix is the interesting part.** At the 720px prose measure a card is ~340px, and "ORGANIZATIONAL MEETING" + "Aug 31, 6:30pm" needs 334px of 293px available — **41px short**. So the label wrapped in the Monday card but NOT Tuesday's (whose values were "TBD"), leaving a matched pair ~38px out of step. **Alignment and "looks small" were the same problem:** the card grid was trapped in the text column. It now breaks out to `min(940px, 100vw - 128px)` via `margin-left:50% + translateX(-50%)`, clamped to the section gutters. Rows can no longer wrap at ANY desktop width, so cards align regardless of content — which mattered immediately, because Tuesday's TBDs became real dates hours later. **Prose stays at 720px; a spec grid is not prose.** Fit verified against real Montserrat/Roboto Slab advances (+48px slack at the tightest desktop width) — that arithmetic is the guard on adding any future row.
  - **Content:** Tuesday Night Mixed dates confirmed (meeting Sept 8 6:30pm, starts Sept 15) and a **weekly fee row on both cards — "~$23 per person."** The tilde and "Estimated" are load-bearing (figure is set by the league secretary), which is also why it is **NOT** expressed as a schema Offer: structured-data prices read as firm commitments. Clears the discount-language ban — it states a cost, it does not sell a bargain.
  - **`/leagues` Event JSON-LD shipped** (closes the 2026-05-08 SEO item, blocked 3 months on "need Tuesday dates + season end"). Four events: 2 organizational meetings + 2 recurring seasons with `eventSchedule.byDay`. Season ends Mon Apr 5 / Tue Apr 6 2027 — called a guess by Jon, but each lands on its own league weekday and yields exactly 30 sessions. Built through the hardened `eventSchema()` helper so it inherits the 2026-05-19 GSC fixes. **⚠️ TIMEZONE TRAP: the season crosses two DST boundaries (CDT→CST Nov 1, back Mar 14), so `eventSchedule.startTime` is deliberately BARE + `scheduleTimezone: America/Chicago`, while `startDate` carries an explicit `-05:00`. A fixed offset on `startTime` misreports league night by an hour Nov–Mar. Do not "fix" it to match `startDate`.** All four are date-gated off the 4am cron and self-clean.
  - **"Main floor" swept site-wide, 22 → 0** (Jon banned it 8/03; never actioned). Replacement is Jon's own: **"traditional lanes"**, already the house term in two blog posts. Two resisted the drop-in swap: the Naperville blog's "bar and arcade access is shared with the main floor" → *"the rest of the venue"* (you share a bar with people, not lanes), and a wedding-receptions bullet normalized to the sibling pages' "set apart from." **Also fixed 3 internal docstrings that QUOTE the phrase as canonical copy** — leaving those would steer the next copy pass back into the ban. FAQ answers are `plainA`/`htmlA` pairs feeding `FAQPage` JSON-LD; both halves swapped together so schema and visible copy stay in sync.
  - **Promo bar:** Free-Kids-Bowling pulled a week early (Jon) → *"Leagues Now Forming!"* alone through Aug 14 → **rotates with holiday-parties Aug 15–31** → holiday-parties alone Sept 1. Leagues takes first position (entry beat) as the more time-sensitive of the pair. **This supersedes the Aug-15 kids→holiday baton pass described in the 2026-08-01 bullet.** The `/free-kids-bowling` PAGE is untouched and still self-flips to 2027-waitlist mode Aug 15. **Aug 15 wakes rotation JS that has been dormant while the bar ran a single static promo** — worth one glance that morning.
  - **`/feedback` repointed** `app.giveme5.ai/twisted-pin` → `www.gm5.ai/twisted-pin` (verified serving "Twisted Pin - Review Bridge"). Kept a 302 — second address for this vendor. **The old URL does NOT 404; it serves a generic "Review Management" page, so anything still pointing there fails silently.** `Context/consent-surface-map.md` says the check-in trigger texts the RAW vendor URL rather than `twistedpin.com/feedback` — **if still true it is pointing at the dead domain, and it lives outside this repo.** Worth repointing it at `/feedback` so the next vendor move is a one-line repo change.
  - **Still open:** desktop type sweep on `/free-kids-bowling` (18 sub-15px values, 1 desktop query), `/coupon` (8/1), `/rewards` (11px, 0), `/upcoming-events` (partial) — survey method: count page-scoped sub-15px declarations against `min-width:1025px` query count. Also `~Sept 15` in-season reframe of the league cards (TODO in file), and the leagues promo drops Sept 1 despite Tuesday's Sept 8 meeting (Jon's call, flagged).

- **2026-04-30 — Hero copy locked.** Eyebrow / headline / subhead / CTA all locked (see table above). Type stack approved with substitute fonts (Barlow Cond / Montserrat / Roboto Slab). Eyebrow shifted from Glow to warm-white; Glow reserved for primary CTA.

- **2026-04-30 — *"The bar that bowls."* deprecated.** Removed from locked copy. Reads as a tagline competing with the headline.

- **2026-04-30 — *"Built for adults. Kids will come."* revised** to *"Built for adults. Fine, bring the kids."* Concessive register replaces the Field-of-Dreams reference. Also re-classified from hero subhead to hero headline.

- **2026-04-30 — Per Se / Keller / Michelin three-star framing retired** for the website's primary positioning. *"America's Top Mixologist"* (Food Network) is the lead credential. The Per Se framing borrowed more prestige than the consulting relationship warranted and pulled the brand toward fine-dining-with-bowling, which is not the locked thesis. Per Se context may still appear in long-form `/craft-bar/` body copy.

- **2026-04-30 — Astro project initialization authorized.** Handoff doc claimed Astro was already initialized — this was wrong. Root contained only `node_modules` (sharp + image utilities), no `package.json` or `astro.config.mjs`. Initializing fresh as part of the live hero deliverable. The "don't initialize until structure planning is approved" rule is now satisfied — visuals are locked enough to ship the hero.

- **2026-04-30 — Sticky CTA bar always-visible on mobile** (vs. hide-on-scroll). Primary conversion element; ~64px is small relative to viewport. Hide-on-scroll can be A/B'd later.

- **2026-04-30 — Self-hosted fonts via `@fontsource`** (vs. Google CDN). LCP-critical: removes second-origin DNS+TLS, enables explicit preload control.

- **2026-04-30 — Vercel deploy via GitHub integration** (vs. CLI direct). Auto-deploys per branch from day one per the established workflow.

- **2026-04-30 — Hero subhead changed from credential to stats trio + menu beat.** New copy: *"28 self-serve taps · A 6-lane VIP suite · 17 traditional lanes · A chef-inspired menu"*. Reason: the old subhead *"Built by America's Top Mixologist…"* started with "Built by", which carried through from the headline *"Built for adults. Fine, bring the kids."* — readers were misimplying the mixologist had built the venue itself, not just the bar program. The credential lines moved to reserved-copy for the future cocktail/bar section H2 (see voice.md).

- **2026-04-30 — In-hero CTA killed.** *"Reserve a lane"* button removed from Hero. The global sticky bar (always-visible bottom on mobile, top-right on desktop) carries 100% of hero conversion now.

- **2026-04-30 — Headline overflow on narrow viewports fixed.** Settled on `clamp(34px, 11vw, 80px)` + `letter-spacing: -0.015em`. Verified glyph fit (not block fit) at 360 / 390 / 412 with 8.78 / 13.09 / 16.31 px slack via Range API.

- **2026-04-30 — Brand mark wired as image.** `LogoGBED_Horizontal_White` for the hero (mobile 41px / desktop 56px after two rounds of size bumps). `Logo_Horizontal_GlowInTheDark` (no GBED tagline) for the drawer header (mobile 73px / desktop 84px).

- **2026-04-30 — Drawer header *"The works."* retired.** Replaced with the GlowInTheDark logo per the Pints & Paddle / Swingers pattern.

- **2026-04-30 — Drawer rows get Lucide line icons.** Right-aligned, 24px, `currentColor`. 4 directly from Lucide; bowling pin hand-drawn in matching stroke style (Lucide doesn't ship one).

- **2026-04-30 — Mobile hero video splice direction locked.** Three sources: pour (Bank Vs Stories) → tap wall (Beer Wall) → cocktail (Best Things To Order). Specific window timestamps pending user. Currently live: Bank Vs Stories single 4s shot.

- **2026-04-30 — Workflow returned to direct-to-main pushes.** One-time `feat/hero-round-2` feature-branch round complete; iteration cadence too fast for ongoing branch ceremony. Vercel auto-deploys on every push to main.

- **2026-05-01 — Persistent SiteHeader shipped (Phase 1 of desktop architecture).** Logo + inline nav (BAR · EAT · BOWL · GAME · EVENTS · MORE ▼) + two solid CTAs (Reserve = Glow, Plan = Copper) on desktop; logo + hamburger on mobile. Resolves the long-standing desktop CTA placement question — both elements now share a single header bar. Active-page indicator: 1px Glow underline, current page only, never on hover. MORE dropdown click-only (no hover-open) for accessibility + touch reliability in 1024–1279px range.

- **2026-05-01 — Live hero copy promoted to match `/snap-test/`.** Eyebrow *PLAINFIELD, IL* and stat-trio subhead retired from `/`. New subhead: *"Plainfield's premier night out. Bowling optional."* Same headline. Brings the live hero in line with the snap-test staging hero — was reading stale on the deployed desktop.

- **2026-05-01 — Coupon banner removed from desktop chrome.** Built and shipped in Phase 1, then killed after review of the deployed treatment. Reasons: (1) didn't earn its space — read promo-y, undercut premium positioning; (2) auto-hides on scroll past hero anyway, so impact was limited; (3) coupon stays reachable via MORE dropdown (`/free-10/`) and footer — those surfaces are sufficient for the audience that wants it. Component file retained at `src/components/CouponBanner.astro` in case it returns; import commented out in `Base.astro`.

- **2026-05-01 — `.btn-copper` added globally.** Documented exception to the "Glow only on the primary CTA" rule. Reserve a Lane (Glow) and Plan an Event (Copper) are co-equal primaries for two different audiences. Contrast verified: Copper #D88B5C with Indigo Deep #0E0A1F text computes to ~6.9:1 (passes WCAG AA at 4.5:1). Mobile sticky CTA's "Plan an event" switched from outlined to copper-solid for brand consistency. **REVERSED 2026-05-01 same day** — see entry below.

- **2026-05-01 — Two co-equal primary CTAs decision REVERSED.** Reviewing the deployed Glow + Copper treatment, two saturated solid buttons competed for attention and read less premium than the brand direction calls for. New treatment, locked: *Reserve a Lane* = primary (Glow solid, Indigo Deep text); *Plan an Event* = deliberate alternate (Indigo Deep solid background + warm-white outlined border + warm-white text). Strategic frame: Reserve is highest-volume / most impulsive intent; Plan is lower-volume / higher-LTV — the motivated user finds the quieter button. **This is the restraint-as-confidence pattern, not a demotion of Plan an Event.** `.btn-copper` class removed from `global.css` (no usages remain). Same hierarchy applies in the desktop header and mobile sticky bar.

- **2026-05-01 — MORE dropdown polish.** Bumped from flat opaque (`rgba(14,10,31,0.95)` + blur 14px) to premium glass (`rgba(14,10,31,0.78)` + blur 18px saturate 140%) so the backdrop blur actually shows through. Border opacity bumped 0.10 → 0.14. Single drop-shadow replaced with a two-tier shadow (`0 8px 16px rgba(0,0,0,0.30), 0 24px 48px rgba(0,0,0,0.45)`) for depth. Picks up the persistent header's chrome vocabulary; sits between fully translucent (header) and fully opaque (modal) on the spectrum because dropdown text needs to read cleanly.

- **2026-05-01 — MORE dropdown overflow fix.** Initial build had `.site-nav ul { display: flex }` which inadvertently selected the dropdown's inner UL too — turned the dropdown into a 663px-wide horizontal flex row that overflowed off the left edge of the viewport. Scoped to `.site-nav > ul` and added explicit `display: block` on `.more-dropdown` for safety.

- **2026-05-01 — Mobile hero logo retired.** `.hero-brand` removed from `Hero.astro` (live `/`) and from the `/snap-test/` snap 1 inline hero. The persistent SiteHeader's logo is now the only logo across all routes. Resolves the mobile-hero-logo redundancy flagged in the desktop architecture brief.

- **2026-05-02 — Phase 2A shipped: parallel mobile/desktop tracks on `/snap-test/`.** Mobile snap-track preserved exactly (8 sections, scroll-snap mandatory, locked). Desktop track adds 4 weighted-height placeholder sections — Tap Wall (70vh), Cocktails (70vh), Events (60vh), EBG (70vh, hidden via CSS until 2E) — that swap in via `display: none/flex` at 1025px. New `[data-reveal]` initial state + `sectionReveal()` motion module (IO + window/.snap scroll fallback, 450ms fade-up). DOM verification at 1280×800 desktop confirms 3 visible desktop sections at 560/560/480px (70/70/60vh) + collapsed mobile-only sections; total scroll ~3200px (down from ~6400px in the old long-scroll fallback). DOM verification at 390×844 mobile confirms 8 mobile sections render unchanged. Reveal motion logic verified by bypassing RAF (headless preview tab is `document.hidden = true`, which gates RAF callbacks — production browsers will fire normally). Phase 2B–2D queued (real content for the three split sections); Phase 2E gated on social-team stills.

- **2026-05-02 — Bowl gets two copy variants.** Mobile snap 6 keeps the locked VIP-leading line + parenthetical aside (*"17 traditional lanes plus a 6-lane VIP suite. (yes, you can take it over)"*). Desktop EBG card uses a tighter no-aside variant (*"17 lanes plus a 6-lane VIP suite."*) because the 33%-width column has no room for the aside. The original handoff variant — *"17 lanes, ready when you are."* — was rejected: dropping VIP from a card labeled "BOWL" reverts the card to Bowlero positioning (we have lanes), regardless of the VIP framing in the Events section above. The thesis is "when bowling shows up on the homepage, it's the VIP suite specifically" — the card has to carry that.

- **2026-05-02 — Cocktails long-form promoted from reserved to active (desktop only).** *"Cocktails this serious aren't supposed to live at bowling alleys. Built by America's Top Mixologist."* — was held as reserved copy for "a future cocktail/bar section on `/` that has more room than the snap-test stub." The desktop Cocktails section (50/50 split, ≥640px copy column) IS that room, so the line was promoted. Mobile snap 4 stays terse with the original *"Built by America's Top Mixologist. (their words, not ours)"* — a snap-stub doesn't have the breathing space for two-sentence copy. Two-variant model matches the Bowl decision above.

- **2026-05-02 — voice.md cleanup.** Three updates landed alongside Phase 2A. (1) Hero Locked Lines table updated to reflect the live `/` matching snap-test (eyebrow retired, subhead is *"Plainfield's premier night out. Bowling optional."*) — the 2026-05-01 promotion was previously documented in the Decisions Log but voice.md still showed the old eyebrow + stat-trio. (2) New "Desktop track copy" section documents the two Bowl variants and the Cocktails long-form. (3) "Reserved copy" section now empty — Cocktails long-form promoted; deprecated entry list updated.

- **2026-05-02 — Phase 2B shipped: Tap Wall split layout + sectionVideo() helper.** Desktop section 2 replaces its Phase 2A placeholder with a 50/50 grid: Spotify-style vertical 9:16 frame on the left (responsive height `min(640px, calc(70vh - 80px))` to guarantee 80px section breathing on common viewports), copy column on the right with the locked statement/aside pattern (*"28 self-serve taps / (only wall in the area)"*). Frame chrome: 1px warm-white border at 12% opacity, 12px radius, two-tier drop-shadow. Section background dropped to Indigo Deep so the frame stands out. Reuses the existing `/snap/beerwall-mobile-{av1,h264}-1080.mp4` source — the 9:16 portrait video is frame-friendly. New `sectionVideo()` motion module enforces the single-active-video rule across `[data-section-video]` elements: per-video IntersectionObserver at threshold 0.5 plays/pauses, lazy-source promotion at ratio > 0 (saves bandwidth before user reaches Tap Wall), `muted` enforced on every state transition (audio collision structurally impossible). Stacked-section geometry (Hero 100dvh + Tap Wall 70vh > 100vh) makes ratio > 0.5 mutually exclusive, so no central state manager needed. Hero desktop video and Tap Wall video opt in via `data-section-video`; mobile videos intentionally NOT marked — the locked mobile tapwall keeps its existing inline handler. Verified at 1280×800 / 1440×900 / 1920×1080 (frame at 270×480 / 309×550 / 360×640 with 80–116px breathing). Mobile DOM unchanged at 390×844 (8 visible sections, mobile tapwall handler intact).

- **2026-05-02 — Phase 2C shipped: Cocktails mirrored split + long-form credential + solid-default cleanup.** Desktop section 3 replaces its Phase 2A placeholder with a 50/50 grid that inverts Tap Wall's layout — copy on the left, 9:16 still frame on the right, so the two F&B cornerstones alternate visually instead of stacking the same composition twice. Long-form credential line *"Cocktails this serious aren't supposed to live at bowling alleys. Built by America's Top Mixologist."* promoted from voice.md reserved-copy to active. Two complete claims set on their own lines (provocation → credential), same weight/size — the credential is the load-bearing line, not a parenthetical aside. Asset: AIV01579 (copper-shaker pour) per handoff fallback. Real cocktail video remains held for the API batch round; swap point is replacing the `<picture>` with a `<video data-section-video>` + lazy-source pattern. `scripts/build-snap-images.mjs` refactored to a `SOURCES = [{src, name}, ...]` config with skip-on-missing-source warnings — fresh worktree pattern stays smooth. Encoded `/public/snap/cocktails-bg-{540,1080,1280}.{webp,jpg}` (24.7–60.8 KB webp). **Sub-decision:** solid Indigo Deep is now the default for all `.snap-section.desktop-only` (was a Phase 2A placeholder gradient). Rationale: structural variation between sections (frame-left / frame-right / full-bleed photo / 3-card row) already does the rhythm work; gradient variety on top is doubling up, and [visual-direction.md](Context/visual-direction.md) "remove decoration that doesn't earn its space" rule applies. The Tap Wall and Cocktails explicit overrides became redundant and were removed. Frame chrome on Cocktails duplicates Tap Wall's intentionally — refactor to a shared `.media-frame` utility flagged for the third use (rule of three). Verified at 1440×900: Cocktails section 630px (70vh), grid 544/544 + 64px gap, copy at col 1 (left edge 137), frame at col 2 (left edge 862), 309×550 frame matches Tap Wall's mirrored counterpart. All four desktop section backgrounds confirmed solid Indigo Deep (`rgb(14,10,31)`) with `background-image: none`. Mobile DOM unchanged at 390×844 (8 sections, Cocktails desktop section hidden).

- **2026-05-03 — Mobile snap titles harmonized to nav labels.** Snap 5 *Food* → *Eat*, snap 7 *Arcade* → *Game* — matches the locked SiteHeader inline nav (`BAR · EAT · BOWL · GAME · EVENTS`) and the desktop cluster section titles. Wayfinding wins over voice-table preservation when the nav and the section H2 are on screen together (user clicks GAME → lands on a section labeled GAME, no mental translation). voice.md 8-snap table updated to match. Locked surface (nav) wins over unlocked label table (voice.md).

- **2026-05-03 — NavDrawer hrefs harmonized to post-Phase-1 SiteHeader IA.** Drawer was built before Phase 1 SiteHeader and pointed at phantom slugs (`/craft-bar`, `/menu`, `/find-us`). Five slots retargeted to `/bar`, `/eat`, `/vip-suite`, `/events`, `/#find-us`. 5-slot structure preserved; broader sectioned-hamburger restructure (sitemap-tldr Q7) deferred post-launch.

- **2026-05-03 — `/snap-test/` promoted to `/`.** Live `/` was just `<Hero />` since Phase 2 shipped — the 8-snap experience lived at staging. Promoted via `git mv snap-test.astro index.astro` + metadata update. `/snap-test/` route gone (404). `src/components/Hero.astro` is now unused but retained for reference. Site isn't publicly consumable yet so no redirect needed.

- **2026-05-03 — `/bar` pillar mock landed; establishes inner-page rhythm.** First inner page. Pattern: hero (full-bleed image, headline, sub — NOT snap-mechanic) → long-scroll editorial sections (image one side, copy the other, alternating) → closing CTA band → SnapFooter. Inner pages are normal long-scroll; snap is reserved for `/` where the tasting-menu format earns it. Same rhythm to be applied to `/eat`, `/bowl`, `/game`, `/events`, `/vip-suite`, `/reserve` in series. Hero photo is stub (cocktails-bg-900 standing in for the Jan 29 atmosphere shot); GoTab API integration deferred for the two "View menu" CTAs.

- **2026-05-03 — Per Se / Keller / Michelin three-star framing FULLY retired** (no carve-out). The earlier 2026-04-30 retirement allowed the Per Se anchor to appear in long-form `/craft-bar/` body copy. That carve-out is now retired — Per Se / Keller / Michelin three-star does not appear *anywhere* on the website, including long-form body. Reason: brand prefers to lean entirely on the Food Network credential without the fine-dining anchor; the long-form carve-out was creating drift between intent and implementation. Updated: voice.md (lines 126, 131, 144–145, 160), CLAUDE.md table + thesis, visual-direction.md cocktail-program description, `/bar` cocktails section body. Long-form credential anchor on `/bar/` is now: *America's Top Mixologist* (Food Network) + cocktails served in 40+ countries + the consulting-relationship framing.

- **2026-05-03 — Pin Tilt watermark opacity tuning.** 5% (functionally invisible) → 12% (too loud IRL) → 8% (still loud) → 6% (final). Single value, dialed against deployed visual not screenshots.

- **2026-05-03 — Pin Tilt watermark lifted to global `body::before`.** Was `.snap::before` scoped to the homepage only. Inner pages (`/bar`, `/eat`, every future pillar) now get the watermark automatically without per-page CSS. Implementation: `body { position: relative }` + `body::before { position: fixed; z-index: -1 }`, with `html { background }` (moved from body) so painting-order is clean. Inner-page editorial sections changed from `background: var(--indigo-deep)` to `transparent` so the watermark shows through their gutters — same rhythm as the homepage cluster sections. Hero (image bg) and closing CTA band (lifted indigo bg) naturally cover the pattern in their regions.

- **2026-05-04 — "Private" terminology fully banned, voice.md contradiction fixed.** voice.md already had the rule documented (lines 81–83: no "private bar," no "private space," no "private" as a descriptor for the VIP suite — it's *semi-private*) but **also listed "private" in the approved Words to Use list** (line 52) — direct contradiction. Removed from approved list. Swept `/vip-suite` for all 5 instances of "private": eyebrow ("Private Events" → "Group Events"), hero sub ("Six private lanes" → "Six lanes of your own"), section body ("Six private bowling lanes, separated from the main floor" → "Six bowling lanes set apart from the main floor — yours for the night when you book the suite"), section list ("6 private lanes" → "6 lanes of your own"; "private functions" → "group functions"). Also patched seo.md H2-question example ("Can I host a private corporate event?" → "Can I take over the VIP suite for a corporate event?"). User had flagged this rule multiple times — Working Preferences in this file now calls it out at top-level so it's not buried.

- **2026-05-04 — `/vip-suite` added to MORE dropdown.** Page was an orphan on desktop (only reachable via mobile NavDrawer). Added to the top of `moreItems` in SiteHeader.astro — most-likely-to-click position in the dropdown. The 5-slot inline nav stays locked at BAR · EAT · BOWL · GAME · EVENTS; VIP Suite as a tier-1 conversion page belongs in MORE rather than crowding the inline strip.

- **2026-05-04 — VIP Suite promoted from MORE dropdown to inline desktop nav.** Was at the top of MORE (added earlier today). User: "the VIP Suite should end up in the top bar, maybe to the right of Events. That's a critical enough item to put up there." Inline nav grows from 5 items to 6: BAR · EAT · BOWL · GAME · EVENTS · VIP SUITE · MORE ▼. Sits right of Events as the natural events→suite pairing. The "5-slot inline nav locked" line from earlier decisions is superseded — VIP Suite as the revenue engine earns its inline slot. Mobile NavDrawer also lists it directly, unchanged.

- **2026-05-04 — Voice rule clarifications: distinguish hard bans from positioning rules.** Earlier audit framed `bowling alley` and `family-friendly` as bans alongside `private` and `cheap` — overstated. Refinements: (a) "Bowling alley" is **fine to use descriptively** (and the brand uses it deliberately in `"This isn't your parents' bowling alley."` and `"Cocktails this serious aren't supposed to live at bowling alleys."`) — the rule is just "don't lead with it as the primary descriptor." (b) "Family-friendly" is a **TRUE characteristic** of the venue (most attendees are families) — copy positions adults-first because the adult is the one who needs convincing (inverse of Chuck E. Cheese). Don't deny families; don't market with "family-friendly fun" as the lead. (c) Hard bans elevated to Working Preferences: `private`, `cheap/discount/value/deals/budget-friendly`. Soft positioning rules stay in `voice.md` only. Updated voice.md "Generic / flat" entries with this nuance. Pre-launch copy sweep should grep for the hard-ban list, not the soft-positioning list.

- **2026-05-04 — `/contact` page killed; "Contact" in MORE scrolls to SnapFooter.** User: "I have no intention of providing an actual contact page any longer." Everything users need to contact (address, hours, phone, email) already lives in SnapFooter. Implementation: SnapFooter `<section>` got `id="find-us"`; MORE "Contact" item href changed from `/contact/` → `#find-us`; NavDrawer "Find Us" item changed from `/#find-us` → `#find-us` (same anchor pattern, scrolls in-place on whatever page rather than forcing nav to /). Label "Contact" stays in MORE — the destination is what changed, not the call-to-action language. At launch, legacy `/contact-us/` 301 redirect target should be reconsidered (probably → `/`, since hash anchors don't survive 301s — user lands on homepage and finds the footer themselves).

- **2026-05-04 — MORE dropdown polish (3 rounds same day).** Round 1: section labels ("Programs & Events" / "Useful") + divider between groups + 220→260px width + 12→13px type. Round 2: dropped section labels (categorization didn't earn its weight), added per-item divider via `li + li > a { border-top }`, bumped header gap 6→18px so the panel lands clearly below the header band. Round 3: added 16px Lucide icons left of every item (calendar / ticket / clock / trophy / star / gift / help-circle / mail / briefcase) at 0.7 opacity → 1.0 on hover, currentColor; added `/coupon` (renamed from legacy `/free-10` — old URL gets a 301 to `/coupon` at launch) and `/waitlist` to the dropdown. Item order: visit-now intents first (Upcoming Events, Coupon, Waitlist), then engagement (Leagues, Rewards), then purchase (Gift Cards), then utility (FAQ, Contact, Careers). Pages for `/coupon` and `/waitlist` not yet built — they 404 until built, same situation as `/events`/`/bowl`/`/game`/etc placeholder slugs.

- **2026-05-05 — GoTab integration shipped (cocktails + food).** Auth: OAuth Client Credentials against `https://gotab.io/api/oauth/token`. Non-standard token response (`token` / `tokenType` instead of `access_token` / `token_type`) handled in `src/lib/gotab.ts`. GraphQL endpoint `https://gotab.io/api/graph` requires `locationUuid: String!` (not `id: ID!`) — schema discovery via `/api/gotab/schema` introspection probe surfaced the correct shape after initial guesses failed. Source menus selected: "View Only Cocktail Menu" for cocktails, "View Only Menu" filtered to food categories (Drinks 62068 excluded — soft drinks/water/juice boxes aren't a food menu beat). **No prices on the website** — premium positioning, captive-audience-pricing logic (movie theater / ballpark). **Category names rendered exactly as in GoTab**, including the truncated `"Cocktails - Reimagined & Handcrafted Fav"` (user opted to leave the truncation rather than override in code; GoTab is single source of truth for naming). 3 env vars: `GOTAB_CLIENT_ID` / `GOTAB_CLIENT_SECRET` / `GOTAB_LOCATION_ID`. Build-time fetch via `src/lib/gotab-cocktails.ts` + `src/lib/gotab-food.ts`.

- **2026-05-05 — Untappd Business integration shipped (tap list).** Auth: HTTP Basic with `email:api_token` base64-encoded — no OAuth dance, the API token is the long-lived credential. REST endpoint `https://business.untappd.com/api/v1`. Hierarchy: location → menus → sections → items. Confirmed: 28 taps map exactly (23 Draft Beer + 1 NA Draft + 4 Wine on Tap) — brand thesis aligns with the wall. Visual rhythm deliberately **list-led, not photo grid** (different job than cocktail menu — beer lists are scannable text with tap-number anchors). Each row: small label thumbnail (40/48px) + Glow tap number + beer name + brewery·location·style metadata + ABV. Filtered out Untappd's generic placeholder images at the lib level so we don't render 28 identical default-beer icons. 3 env vars: `UNTAPPD_EMAIL` / `UNTAPPD_API_KEY` / `UNTAPPD_LOCATION_ID` (note: `_KEY` not `_TOKEN` — matches the Untappd dashboard naming).

- **2026-05-05 — Daily auto-rebuild cron shipped.** Menu data is fetched at build time and baked into static HTML, so without a rebuild trigger, GoTab/Untappd edits stay invisible until someone pushes code. Vercel Cron entry in `vercel.json` (`0 9 * * *` = 9 UTC = 4–5am Central, after closing) hits `/api/cron/rebuild`, which validates `Authorization: Bearer ${CRON_SECRET}` (auto-injected by Vercel Cron) then POSTs `VERCEL_DEPLOY_HOOK_URL` to queue a fresh production build. Hobby-tier cron has a 1-hour flexible window — fires somewhere in 9–10 UTC, fine for menu data. Verified working end-to-end: manual "Run" via Vercel cron page returned 200, deploy hook fired, fresh production deploy went live.

- **2026-05-05 — Menu pages extracted to `/menu/*`.** User flagged: `/bar` at ~8000px mobile (~10 viewport heights) meant <20% of users likely saw the cocktail menu, which is the primary differentiator. Extracted to three dedicated pages: `/menu/cocktails`, `/menu/taps`, `/menu/food`. Each one: typography hero (eyebrow + H1 + 1-sentence SEO sub) + the menu component + a small SEO copy block (H2 + 1–2 paragraphs of keyword-relevant context, includes the address) + SnapFooter. **No image hero** on menu pages — would rebuild the scroll problem we just solved, and these are reference pages, not editorial. `/bar` and `/eat` retained their editorial structure with the 5-pick teasers; CTAs repointed (`View what's on tap` → `/menu/taps`, `View the cocktail menu` → `/menu/cocktails`, `View the menu` → `/menu/food`). Menu URLs use `/menu/*` namespace rather than `/bar/cocktails` so the menu URLs stay stable if pillar pages ever rebrand. Hero `data-hero` attribute originally missing on the new pages — caught + fixed (initial state was `opacity: 0` waiting for JS animation that never fired).

- **2026-05-05 — Mobile sticky CTA bar: backdrop strip below pill, no gradient haze above.** User flagged the floating pill had visible page content in the 12px gap below it — read as "pill mid-page" rather than anchored. First attempt added a gradient fade from transparent (above the pill) to dark (below) — landed visible blur haze above the pill that obscured content. Reverted. Final treatment: pill bottom margin tightened 12px → 6px, plus a solid (no-gradient) backdrop strip from viewport bottom up to where the pill starts (z-index 29 vs pill's 30, same blur + Indigo Deep wash as the pill). Pill reads as seated on a continuous base. No haze.

- **2026-05-04 — `/waitlist` shipped as iframe wrapper; webhook-derived state version explored and tabled.** Page wraps `host.tablesready.com/p/waitlist/twistedpin` in brand chrome (typography hero + framed iframe + closing Reserve CTA + SnapFooter). TablesReady has no read API and no X-Frame restrictions, so iframe is the only path to live data without infrastructure. User flagged inner-iframe content as ugly; explored four paths to improve it (CSS scroll-clip hack, switch platforms, build-own + Twilio, webhook-derived state). Picked **webhook-derived state** as the right path (TablesReady webhooks fire `party.created`/`updated`/`checked_in`/`marked` — derive count by tracking adds/removes, daily 4am reset to mitigate state drift). **Tabled pending:** user upgrades TablesReady plan tier → runs webhook.site test to capture real payloads → resolves `party.checked_in` ambiguity (could mean "remove from active" or "no-op for reservations"). Full theory + revisit checklist captured in [Context/waitlist-theory.md](Context/waitlist-theory.md). User preference noted: "send them off the site if they're going to see crap" — i.e. link-out > current iframe IF we're not building webhook version yet (page-swap decision still open).

- **2026-05-05 — Build-out + perf + DNS planning session shipped.** Major work bundle (full session captured in [Context/session-handoffs/2026-05-05-build-out.md](Context/session-handoffs/2026-05-05-build-out.md)):
  - **`/menu` hub page** (7th inline nav slot between Eat and Bowl) with horizontal-split cards + real hero photography (DSC_0110 cocktail / DSC05701 food platter / BeerWallHeyFlow tap wall, square 1:1 crops via attention-based focal detection). Card-body desc tightened to 1 sentence; title scaled to clamp(26-32px) for narrower body column. Padding on inline nav links tightened 12 → 10 horizontal to fit 7 items at the 1025 breakpoint.
  - **`/privacy`, `/terms`, `/accessibility`** — three compliance pages built. Privacy + Terms ported from live twistedpin.com with light voice/format cleanup; Accessibility is a standard hospitality-venue statement (WCAG 2.1 AA target, known limitations, 5-business-day remediation SLA). All three flagged for counsel pass before launch. Last-Updated dates preserved from the live policies for Privacy + Terms; Accessibility uses today.
  - **Global `:focus-visible` ring** added to `global.css` — keyboard users now get a 2px Glow outline on Tab. Browser defaults read poorly on Indigo Deep. `:focus-visible` (not `:focus`) so mouse clicks don't trigger the ring. Components with their own focus styles (`.menu-hub-card`) continue to use those.
  - **`/rewards` rebuilt** against actual program details (front-desk kiosk + 50pts/visit + 5-tier ladder + Text Club). Voice reframes: `$10 OFF Any Open Bowling` → `$10 lane credit` (drops discount framing, keeps dollar accuracy); `Score Stellar Deals + Exclusive Discounts!` → inside-line framing; `Bogo Hour` → `Buy an hour, second hour on us`.
  - **`/coupon` native form + Patch Retention API** — replaced legacy iframe. Architecture: browser → `POST /api/coupon-signup` (Astro server endpoint) → `PATCH api.patchretention.com/v2/contacts?match:phone={phone}`. Auth requires TWO headers (Bearer + `X-Account-Id`), caught via bundle scan. Birthday parsed from MM/DD form input → `MM/DD/1900` (placeholder year for Patch's date field). Voice reframe: `$10 OFF Open Bowling Certificate!` → `$10 toward your next lane.` Native dropdowns replaced with a single MM/DD text input (selects can't be styled cross-browser). Earlier broken `POST /v2/tags` step removed — no contact-tag association endpoint exists in v2 API. **Trigger pattern is OPEN** — pending Patch support response on DOI / event listener / canonical pattern. Submissions land in Patch's contact list; coupon SMS path TBD. `PATCH_API_KEY` + `PATCH_ACCOUNT_ID` set on Vercel.
  - **DNS migration runbook** captured in [Context/dns-migration.md](Context/dns-migration.md). Captured the full DNS audit (NS, MX, SPF, DKIM, DMARC, Freshdesk CNAMEs). Flagged: SPF record looks malformed (`include.com.spf.auto.dnssmarthost.net` missing colon) and may be causing silent permerror → DMARC quarantine. Cutover plan: GoDaddy DNS (consolidate at one vendor — registrar = ownership = no dev-company cooperation needed). Includes step-by-step + risk mitigations.
  - **Lighthouse baseline + LCP optimization pass.** Pre-fix: Desktop 100/100/100/100; Mobile 86 with LCP 3.9s (yellow band, all other Web Vitals excellent). Five fixes shipped same day: (1) mobile hero serves 540w on phones ≤480px (saves ~1 MB) — single-line markup change, files were already encoded but never referenced; (2) hero poster preload was already in place; (3) Latin-only `@fontsource` subsets (CSS file 5x smaller per face, was importing Vietnamese/Cyrillic/Greek/Latin Ext on an English-only site); (4) tap wall video gains 540w variants (encoder updated + ran); (5) AVIF added to `scripts/build-snap-images.mjs` (15-30% smaller than WebP, applied to menu hub `<picture>` tags). Deferred: CRF tuning + AVIF for non-menu-hub `<picture>` tags. Full history in [Context/perf-history.md](Context/perf-history.md). **Re-test discipline:** wait until real photography + final hero splice land, then re-run PSI once and compare against the 2026-05-05 baseline.
  - **TikTok removed from SnapFooter** — user confirmed business has no TikTok presence currently. Icon removed from social row; URL constant deleted. Code comment notes how to re-add when/if account launches.

- **2026-05-06 — Redirects + events + NYE + pricing session shipped.** Major work bundle (full session captured in [Context/session-handoffs/2026-05-06-pricing-events-redirects.md](Context/session-handoffs/2026-05-06-pricing-events-redirects.md)):
  - **301 redirect map** landed in `vercel.json` — 18 legacy URLs preserved per launch-checklist (e.g., `/bowling/` → `/bowl/`, `/free-10/` → `/coupon/`, `/contact-us/` → `/`). Path-to-regexp `{/}?` for optional trailing slash; 3 truncated old-promo slugs use prefix `:rest*`. PLUS `/essential` + `/elevated` SMS short links (302) for text-marketing flows pointing at `menu.twistedpin.com/{slug}` — DO NOT REMOVE.
  - **All "Plan an Event" CTAs swapped to direct Zite link** (`https://twistedevents.zite.so/`). Mirrors the Reserve → Roller pattern. 10 conversion-intent CTAs swapped (SiteHeader, NavDrawer × 2, StickyCTABar, /vip-suite, /events closing band, /gift-cards, /faq × 2, /upcoming-events). Educational links kept on local /events.
  - **`/upcoming-events` rebuilt as real calendar** — Astro content collection (`src/content/events/*.md`) with Zod schema (title / start / end / location / cta / tentative / virtual / draft). Cards group by month; multi-day cross-month renders range form ("31–1" + "DEC/JAN"). Empty state: *"Calendar's clear right now. Want to fill it? Plan an event →"*. First entry: 2026-12-31 NYE event linking to /new-years-eve/.
  - **`/new-years-eve` page + seasonal-nav system.** Full-bleed NYE.mp4 video hero (1080×1920 source → /public/snap/nye-* in 4 variants matching beerwall pipeline). Editorial section + closing CTA band (Plan an Event Glow / Reserve a lane outlined). Body copy is voice-y placeholder until ops gives package details. **`src/config/nav-seasonal.ts`** is the new SoT for seasonal page visibility — pages exist at URL year-round but only surface in NavDrawer between `showFrom` / `showUntil`. NYE shows Nov 15 → Jan 2; today (May 6) hidden. Active items render at top of drawer section with a Glow-tinted icon. Adds `sparkles` icon to `src/lib/icons.ts`.
  - **`/pricing` page (ground-up build)** — surfaced via NavDrawer Info section (top entry, above Leagues). NOT a homepage snap (the SnapToday concept was prototyped at `/draft-today/` and explicitly rejected after user review — pricing is reference content needing a stable URL with SEO chrome, not a homepage course). Architecture: typography hero ("Walk-in pricing.") → day-tabbed calendar (transparent over page bg, no card chrome — Pin Tilt watermark shows through) → "Holidays follow Friday 5pm pricing" note → SEO copy block (H2 "How pricing works." + 3 keyword-rich paragraphs + NAP) → SnapFooter. 7-pill day toggle; all 7 days pre-rendered server-side with vanilla JS toggle. Single-rate days (Mon-Thu) collapse to 2 columns; multi-rate days (Fri/Sat/Sun) show 3 columns. TODAY pill stacks above day name. Pricing data lives in `src/data/pricing.ts` (4 distinct schedules — note Sun is reversed peak/off-peak). **Specials content collection** (`src/content/specials/*.md`) shipped at the same time — separate from events (recurring/conditional vs dated one-shots). Penny A Pin (Wed, Traditional) is the first entry, renders as Glow-bordered callout above the table; does NOT replace the cell rate (user direction: keep $35 visible, special is referenced above). Two quick-action CTAs (Check the waitlist / Get the coupon) sit between the views and the holiday note — equal-width via `flex: 1 1 200px`. Multiple typography iterations during the session (final state: day name `clamp(40,10vw,60)`, prices `clamp(28,4.5vw,36)`, all column headers 13px / 0.08em with column widths 34/33/33 to fit TRADITIONAL without overflow).
  - **Google Places API graceful fallback** wired in `src/lib/google-hours.ts`. Reads live `regularOpeningHours` from the Business Profile when `GOOGLE_MAPS_API_KEY` + `GOOGLE_PLACE_ID` are set on Vercel; falls back to static `src/data/hours.ts` otherwise. /pricing displays "verify on Google" caveat only during fallback. **Decided to stay on static + verify-link for v1** — hours don't change weekly; the cheap API field doesn't capture holiday hours; no Google billing account friction; the verify link reads as transparent, not evasive. Code stays as a primitive — flip env vars on Vercel anytime to activate.
  - **Maps URL strategy locked** (revised 2026-05-10). All venue-page surfaces (SnapFooter Google review card, `/pricing` "verify on Google", LocalBusiness `hasMap`) now point at `MAPS_VENUE_URL` in `src/lib/schema.ts` — Google's documented canonical `search/?api=1&query=Twisted+Pin&query_place_id=…` pattern. Verified on iOS Safari + Android Chrome to open the Twisted Pin place card with Save/Share/Directions exposed. Replaces the prior `maps.app.goo.gl/yyiVoLzTsHA2TNGW8` short URL (Firebase Dynamic Links — Google sunset Aug 25, 2025) AND the prior `/maps/place/?q=place_id:…` form which was flagged unreliable for venue-page surfaces in earlier testing. SnapFooter Get Directions still uses `/maps/dir/?api=1&destination=…&destination_place_id=…` (a different deep-link — directions, not venue page).
  - **"Kids Bowl Free" stripped completely.** TM'd by another operator AND venue doesn't currently run that program. Removed from /bowl (cross-link card + meta + docstring), /pricing SEO copy, vercel.json (`/free-kids-bowling/` → `/bowl/`, dropped the dead anchor), launch-checklist, media-needs. Future family-bowling page is on the roadmap, name TBD per ops.
  - **NavDrawer auto-close on link click.** Mobile bug: `#find-us` scrolled to footer but left drawer open. Fix: `navDrawer()` in `motion.client.ts` binds a click listener on every `<a href>` inside the drawer that calls `close()`. Critical for in-page anchors; also fires for cross-page + external links (clean state on back nav).
  - **SnapFooter copy:** *"Plainfield's been talking."* → *"Everyone's been talking."* Local SEO comes from citations / schema / NAP, not body-copy geo mentions. Broader phrasing matches actual review distribution.
  - **Adobe Fonts kit declined.** User opted out of the CC subscription cost. Substitutes (Barlow Cond / Montserrat / Roboto Slab) ship for production. Discussed perf trade-offs (would add ~100-300ms LCP penalty on mobile, mitigatable to ~50-150ms). Swap is a 5-minute CSS-variable change if direction changes later.

- **2026-05-07 — Patch API abandoned, /coupon + /free-kids-bowling iframe-wrapped.** Patch Retention's native-form integration shipped 2026-05-05 never resolved the canonical "web form → coupon SMS" trigger pattern with Patch support, so user opted to revert both `/coupon` and the new `/free-kids-bowling` page to the legacy live-site iframe wrappers (`c-g.co/xORo1J` and `c-g.co/OskPxh` respectively). `src/pages/api/coupon-signup.ts` deleted; can be restored from git history if Patch ever clarifies the trigger. **Vercel env vars no longer used:** `PATCH_API_KEY`, `PATCH_ACCOUNT_ID` — safe to remove. Both pages mirror `/waitlist`'s iframe-in-brand-chrome pattern.

- **2026-05-11 — Positioning reframe: adults-first → two-mode time-segmented + logo cleanup + kids FAQ.** Triggered by 9-tester user video pass on the deployed site (parent testers V3 and V5 surfaced "is this for my kids?" friction; V8 and V9 validated the locked thesis works for both parents AND childless friends). Competitive scan (Lucky Strike / Dave & Buster's / Topgolf / Bowlero) showed Twisted Pin is currently *more adult-coded than Topgolf* — defensible, but the positioning gap from the prior "adults-first, group-friendly, family-welcome in that order" formulation was reading grudging rather than co-equal. Reframe: **same room, different night — Saturday at 6 with family, Saturday at 11 without**. Adult-quality is the lever, family-welcome is the permission slip; the 1am close is a positioning asset, not just an ops fact. Three concrete shipped changes: (1) **Header logo swap** — `LogoGBED_Horizontal_White` → `twisted-pin-horizontal-glow` (clean wordmark without GBED tagline). The "GAME · BOWL · EAT · DRINK" tagline was sub-10px and illegible at 41px mobile (V5 explicitly: "subtexts look like blobs") AND it led with GAME, contradicting the bar-led thesis. Drop solves both. Header now uses the same mark as the NavDrawer — unified logo system. (2) **FAQ entry `Can I bring my kids?`** added under Hours & Visiting — canonical long-form answer using bedtime as the dividing line, not age. (3) **Voice.md "Adults-first, group-friendly, family-welcome (in that order)" section renamed** to "Adults-first, family-welcome — segmented by hour, not by audience" with the full lever/permission-slip frame documented. Working Preferences in CLAUDE.md updated to match. **Pending from same session:** homepage permission-slip beat (A/B/C copy options awaiting user pick), `/birthday-parties-booking/` page (preserves legacy slug), NavDrawer Quick Actions strip (replaces current site's CTA-tile pattern in a brand-coherent way), VIP suite photo replacement (V4 flagged current photo reads as regular lanes — kills the differentiator).

- **2026-05-07 — `/free-kids-bowling` shipped.** Reuses the legacy slug from twistedpin.com (preserves any inbound SEO and removes the prior `/free-kids-bowling/` → `/bowl/` 308 redirect from `vercel.json`). The 2026-05-06 "Kids Bowl Free stripped completely" decision is partially superseded — venue is now running the program (June 1-30 summer window), so the page exists. The TM constraint stands ("Kids Bowl Free" is still owned by another operator); the page uses **"Free Summer Bowling For Kids"** / **"Free Kids Bowling"** as the descriptive H1 + label, which doesn't infringe. Architecture: hero → iframe (signup) → editorial sections (How It Works + While The Kids Bowl) → Glow-bordered Summer Pin Pass upsell ($159.95 unlimited household, links to `ecom.roller.app/twistedpin/summerpinpass`) → SEO body block (hyper-local: Naperville, Romeoville, Shorewood, Bolingbrook, Oswego, Joliet) → SnapFooter. Surfaces in NavDrawer Visit section between Apr 15 → Sep 1 via the seasonal-nav system (same mechanic as `/new-years-eve`). Cross-link card on `/bowl` restored. Voice-tightened version of the user-supplied existing copy (dropped "premier entertainment destination" / "ultimate summer value" boilerplate, kept hyper-local SEO mentions, reframed via the brand thesis — "while the kids bowl, you get the bar program"). **Future thread (parked):** homepage "nudge" pattern for highlighting time-limited programs (Pin Pass, summer kids, NYE) without dedicating a giant CTA — exploration deferred until we have 3+ items competing for attention.

- **2026-05-17 — Brian "Curated by" reframe + chef-language ban (ads-launch hygiene).** Triggered by [Context/session-handoffs/2026-05-17-google-ads-website-needs.md](Context/session-handoffs/2026-05-17-google-ads-website-needs.md): Google Ads policy plus truth-of-relationship both fail under the old "Built by" framing. Brian Van Flandern is a CONSULTANT who **curated** the cocktail program — not staff, not owner, never on site. Likewise the kitchen is run by the F&B team, not a named chef; "chef-driven" / "chef-inspired" is a deceptive claim. Three coordinated sweeps shipped: **(1) Verb swap** — "Built by [X]" / "Designed by [X]" → "Curated by [X]" across `/bar`, `/menu/cocktails`, `/eat`, `/free-kids-bowling`, `/faq`, `/birthday-parties-booking`, `/careers`, 6 `/why-us/*-il/` pages, 2 blog posts, 3 code-comment docstrings. **(2) Chef-language removal** — `/eat`, `/free-kids-bowling`, `public/llms.txt`, `Context/seo.md`. Replacement: "from-scratch" or "built to share." **(3) Heyflow/Zite toggle made explicit** — `src/lib/links.ts` already exposed the `PLAN_EVENT_URL` switch (Avery ON/OFF) but the comment claimed Zite was "current default" while the actual export pointed at Heyflow. Comment corrected; CLAUDE.md locked decision updated to reflect that the toggle supersedes the 2026-05-06 Zite-only lock. 3 hardcoded Zite URLs in blog posts + 1 in `llms.txt` flipped to Heyflow (the toggle doesn't auto-rewrite narrative prose). Voice.md Words-to-Avoid section gained two new banned-framings blocks (Brian-relationship, chef-language) so future copy passes don't quietly drift back. The earlier (2026-04-30) Brian memory note that "marketing copy has latitude with 'built by'" is now retired — ads policy makes the looser standard untenable.

- **2026-05-17 — Schema fix + LCP/perf sweep (pre-ads launch).** Major perf bundle (full session in [Context/session-handoffs/2026-05-17-schema-lcp-perf-sweep.md](Context/session-handoffs/2026-05-17-schema-lcp-perf-sweep.md)):
  - **Schema pass (`916cc84`):** Fixed GSC `/events` "Invalid object type for field `<parent_node>`" Review Snippets error. Root cause: `localBusinessBase()` carries `aggregateRating`; Google's Review Snippet policy only allows AR under LocalBusiness/Organization/Product/Service/Event/etc., but `/events` was bare `EventVenue` (Place subtype, not LocalBusiness). Fix: dual `@type: ["EventVenue", "EntertainmentBusiness"]`. Same commit hardened `eventSchema()` location with inline NAP (closes "Missing field 'name' in location" Event-validator footgun) + added Product/Service/Event schemas to 6 pages that had none (`/birthday-parties-booking` $419/$489.90, `/summer-pin-pass` $159.95, `/leagues` Service, `/gift-cards` $25 minPrice placeholder, `/fundraisers` malformed Offer dropped, `/free-kids-bowling` Event with eventSchedule). **GSC → Validate Fix on `/events` after deploy.**
  - **LCP fix pattern (`9980370`):** Spread the `/events` 6.9s → 3.1s pattern to 11 pillar pages. For each first section video: `data-poster` → direct `poster=` + Base.astro `lcpPreloadHref`. For every section video `<source>`: bounded `media="(max-width: 480px)"` / `media="(min-width: 481px)"` so exactly one source matches per viewport tier (no doubled fetches during v.load probing). Also deferred `sectionVideo()` to window.load via motion.client.ts so initial paint doesn't compete with video probing.
  - **AVIF poster sweep (`00f3905`):** Re-encoded every section-video poster from WebP Q65 → AVIF Q50. Total savings 367 KB across pillar pages. Arcade-poster specifically went to 720w (the only one) because its content compresses 3-5× worse than other posters at 1080w — went 209 KB WebP → 79 KB AVIF (720w). Updated every `poster=` and `data-poster=` reference. Browser support 95%+ globally; older browsers see black poster frame for ~200-500ms before video paints.
  - **Vercel cache headers (`4c4e3c9`):** Extended immutable 1-year cache to `/snap/*`, `/og/*`, `/favicon-*`, `/apple-touch-icon.png`. Was only `/hero/*` and `/_astro/*` before. PSI was flagging 146 KiB per page.
  - **Vite build target ES2020 (`4c4e3c9`):** Drops polyfills for optional chaining, nullish coalescing, async/await. ~14 KiB legacy-JS saved per page. ES2020 has 99%+ mobile browser support.
  - **Hero LCP preload gating (`47e7479`):** Caught after AVIF sweep that Base.astro was emitting hero-poster.webp (104 KB) + hero-desktop-poster.webp (176 KB) preloads on EVERY page — but only homepage displays the hero. The wasted preload was competing with each page's actual LCP element. Symptom: `/vip-suite` (43 KB poster) scored LCP 2.9s while `/bowl` (24 KB poster) scored 5.2s — SMALLER poster running slower because of preload-queue contention. Fix: `{Astro.url.pathname === '/' && ...}` gate. Pillar pages now emit exactly ONE image preload (their own AVIF poster).
  - **Confirmed wins (PSI mobile, all post-`47e7479`):** `/events` 6.9s → 3.1s LCP (perf 72 → 92). `/game` 7.5s → 3.2s LCP (perf 72 → 90). `/bowl` → 2.5s LCP (perf 97 — green band). `/vip-suite` 4.0s → 2.9s LCP (perf 88 → 94 — green band). `/fundraisers` 4.7s → 3.5s LCP (perf 82 → 86). `/birthday-parties-booking` 3.5s LCP (perf 88). The variance theory that kept us second-guessing PSI mid-session was wrong — wasn't run noise, was the wasted hero preload starving connection slots on pillar pages.
  - **Still flagged for future passes:** Reduce unused JS (~60 KiB GTM — Partytown territory), forced reflow on `/game`, homepage hero AVIF (currently WebP, not blocking since homepage scores 100/954ms LCP), `/menu/taps` iframe-related slowness, `/pricing` 3.6s LCP (no section video — separate investigation).
  - **The new "LCP fix pattern" for any future page** that has typography hero → first section video is documented in the handoff doc Step-by-step section. AVIF Q50 poster + bounded media + `lcpPreloadHref`.

- **2026-05-17 — Site cutover to twistedpin.com.** New build replaced the legacy site on the production domain. Operational implications: (1) `vercel.json` redirect map is now load-bearing for real traffic — any legacy URL hitting prod relies on those 18 entries firing correctly, plus the `/essential` / `/elevated` SMS short links. (2) GSC actions (Validate Fix on `/events` Review Snippets, submit `/sitemap-videos.xml`) now affect real indexing — earlier sooner than later. (3) Copy / schema / perf changes ship straight to production from each push to main — no staging cushion. (4) Pre-launch framing in this file has been retired; launch-checklist.md is now historical. Treat any "pre-launch" or "before the new build replaces twistedpin.com" language anywhere else as stale and rewrite when you see it.

- **2026-05-18 — Audience-funnel event pages shipped + Stage 6 superseded.** 4 new pillar pages built parallel to `/events`, each capturing a distinct audience-intent search cluster: `/corporate-events/` (corp planners — `corporate event venue near me` / `team building venue`), `/holiday-parties/` (seasonal Sep 1→Jan 5 — `holiday party venue near me` / `Christmas party spots`), `/showers/` (bridal + baby — female-planner audience), `/wedding-receptions/` (intimate weddings 25-80 + rehearsal dinners). All four follow the same pillar skeleton + LCP recipe established for `/events` and `/vip-suite` (typography hero, vip-lanes-* LCP-direct, buffet-* lazy below fold, bounded `<source media>`, AVIF Q50 posters, Service schema with 8-city `areaServed`). Both reused videos remain canonical on their primary pages per `src/data/videos.ts` — no `VideoObject` duplication. 4 legacy 301s in `vercel.json` retargeted: `/corporate-parties/`, `/group-and-company-events-twisted-pin/`, `/event-spaces-for-teams-*` all now → `/corporate-events/` (were dropping into `/events/#corporate` where hash strips on 301), `/ultimate-holiday-party-venue-*` → `/holiday-parties/`. NavDrawer Visit section gained 4 entries with new icons (building-2 / tree-pine / flower / wine). 11 `/why-us/*-il/` city pages cross-linked via prose. **Stage 6 from the 2026-05-17 punch list (which planned `/events/{type}/` nested URLs for `/events/corporate`, `/events/birthdays`, `/events/holiday-parties`) is now SUPERSEDED** — top-level URLs win for organic SEO (`corporate-events` keyword-matches the search phrase more directly than `events/corporate` does), and the legacy 301s now point at the top-level URLs. If marketing later needs distinct stripped-down ads landing pages at `/events/{type}/`, that's a deliberate "Option B" build on top of the existing top-level pages — kept open as a follow-up rather than a planned stage. **`/wedding-receptions/` launches without explicit ops sign-off** that the venue takes weddings — copy is honest about what we offer (room/catering/bar/AV) without over-promising on packages or planners; reverts cleanly if ops kills it.

- **2026-06-12 — Blog + llms.txt event links route through `/events/`; never hardcode a platform URL in prose.** A 2026-06-11 Heyflow lead arrived while the `PLAN_EVENT_URL` toggle was on Zite (Avery ON) — diagnosed via the `_gl` GA4 cross-domain linker param that Heyflow captures as a hidden form field (decoded: Google Ads click June 10, submission was the visitor's 4th session, June 11 evening). Path was one of the 3 blog posts' hardcoded `event.twistedpin.com/#start` links, which bypassed the toggle. Fix (commit `d675439`): all 5 prose links in `src/content/blog/*.md` + 1 in `public/llms.txt` now point at `/events/`, whose closing CTA always carries the live toggle destination. This supersedes the 2026-05-17 "manually sweep blog/llms.txt to match the toggle" pattern — prose links `/events/` and never needs re-sweeping. Side discovery, useful for the deferred ads-attribution plan (Offline Conversion Import, path B in the cutover runbook): Heyflow's `_gl` hidden-field capture preserves a decodable `gclid` per lead — the import mechanism already exists with zero extra wiring.

- **2026-06-17 — Events on-page SEO: corporate-events use-case reframe + gclid passthrough, FAQPage on event pages, GeoCoordinates, birthday slug flip.** Two handoff specs ([session-handoffs/2026-06-16-corporate-events-usecase-reframe.md](Context/session-handoffs/2026-06-16-corporate-events-usecase-reframe.md) + [session-handoffs/2026-06-16-onpage-seo-spec.md](Context/session-handoffs/2026-06-16-onpage-seo-spec.md)) from the Google Ads "Events" campaign restructure (use-case keyword pivot ahead of the Aug 1 Q4 corporate ramp). Shipped in 4 commits:
  - **`bb9d273` — `/corporate-events/` use-case reframe + site-wide gclid passthrough.** Page leads with the ad-group use-cases (hero H1 *"Not your average team outing"*; text-led 6-card grid: Team/Staff Outings ⭐ · Employee Appreciation · Team Building · Company & Holiday Parties · Meetings & Luncheons · Fundraisers) echoing live ad creative; VIP-suite + food/bar videos kept below as proof. **New `src/scripts/gclid-passthrough.client.ts`** (wired site-wide in Base.astro): captures `gclid`/`gbraid`/`wbraid`/`gad_source`/`utm_*`/`fbclid` → sessionStorage on landing, appends to every Zite/Heyflow inquiry CTA via the URL API (query before `#hash`). **Additive to the GA4 linker** — the linker alone was landing a clean `gclid` on 0/69 inquiries (buried in `_gcl_aw`, which Zite can't read). LCP: use-case text now sits above the videos, so dropped `lcpPreloadHref` + both section videos lazy `data-poster` (text LCP, 0 image preloads). Title/Service schema widened to "Corporate Events & Team Outings". *Title decision: stays "Team Outings" (lead ad group) over the SEO spec's "Team Building" — paid scent wins the tiebreak; team-building is covered on-page (use-case card + FAQ).*
  - **`43bca24` — Phase A: FAQPage + GeoCoordinates.** `/corporate-events/` gains a FAQPage + on-page FAQ (8 search-phrased Q&As) reusing the global `t2-faq` accordion. `localBusinessBase()` gains `GeoCoordinates` (41.599276, -88.195328 from the GBP place pin; new `GEO_LAT`/`GEO_LNG` constants) — the one schema completeness-pass gap; now on every LocalBusiness-subtype page. *Spec item A4 (multi-type the homepage `BowlingAlley`+`Restaurant`+`BarOrPub`) RETIRED — contradicts the locked one-@type-per-page architecture; those types are already distributed by page. FAQ rich-snippets are gov/health-only since 2023, so the FAQPage value is AI-Overview sourcing + on-page long-tail depth, not SERP star-FAQs.*
  - **`11d2567` + `c1c7921` — Phase B: birthday slug flip + FAQ + occasions.** Renamed `birthday-parties-booking.astro` → `birthday-parties.astro`; **`/birthday-parties-booking/` now 301s → `/birthday-parties/`** (was the reverse — the clean keyword URL redirected to the cruft slug). Mirrors the `/corporate-parties/` → `/corporate-events/` consolidation. Added FAQPage (7 Q&As) + an "Occasions" section (Milestone 30/40/50 · Bachelorette & Bachelor · Sweet 16 & Teen); broadened title/meta to kids + adult/milestone; internal links repointed (`/events` ×2, `/vip-suite`, NavDrawer ×2); Product+Offer ItemList + LCP poster + kids-package CTAs unchanged. **`11d2567` was a rename-only commit** (a `git add` aborted on the removed old pathspec and silently staged nothing else); `c1c7921` landed the content + the flipped redirect — without it `/birthday-parties/` would 301 to the removed slug (404). Verified in the build: 0 stale `/birthday-parties-booking/` refs anywhere, canonical is `/birthday-parties/`, redirect flipped. **The birthday canonical is now `/birthday-parties/`** — any `/birthday-parties-booking/` references earlier in this file are historical. **Ads side (other session, NOT done in-repo):** repoint the Birthday ad-group final URL → `/birthday-parties/` and the Corporate Parties sitelink → `/corporate-events/`.

- **2026-06-17 — Booking-flow UX + type/legibility + conversion-tracking levers.** Session on the live `/reserve*` flow, `/corporate-events`, and the events calendar. Durable levers + reasoning captured in [session-handoffs/2026-06-17-booking-ux-type-conversion-levers.md](Context/session-handoffs/2026-06-17-booking-ux-type-conversion-levers.md) (read the "Reusable levers" section — this is the track record for the ongoing optimization effort). Highlights:
  - **iOS input zoom (`dd7285c`)** — 16px inputs aren't enough when a cross-origin iframe (Stripe PaymentElement) is on the page; the auto-zoom is a *top-level viewport* action, so `Base.astro` `lockViewportZoom` caps `maximum-scale=1` on the 3 booking pages only (iOS still allows manual pinch — NOT the `user-scalable=no` a11y regression).
  - **GA4→Ads `purchase` tracking restored (`a3d25bb`)** — died at the Roller→`/reserve` cutover. `purchase` event in `ConfirmationStep.tsx` (txn=invoice, value, currency; deduped) riding the Base.astro gtag stub (GA4 `G-R64WB0Y4VW` + Ads `AW-961151619`). **OPEN / not verifiable from repo: confirm GA4 marks `purchase` a Key Event + GA4→Ads import is on** — the *firing* is in code, the *counting* is a dashboard step. Client-side = lossy; truth is Stripe/TPRS.
  - **Mobile type-size rubric (`63017cf`, `9e6578d`)** — consensus 16/14/12 px (primary / secondary / floor; Lighthouse fails <12px). Bump ONLY read-to-decide/consent text + sub-floor offenders; never bloat the dense cart (13–14px line items are convention). Inputs always ≥16px.
  - **Display-Black blurs at 1× desktop (`1bd44be`)** — fine on high-DPI mobile, soft on 1× monitors. It's a DPI signature, not a size bug: step small sentence-case *display* headlines down to a cleaner face on desktop (`.corp-uc-headline` → Montserrat 700 `@media ≥1025px`), keep condensed on mobile + big uppercase headers. We only load Barlow Condensed 900, so there's no lighter condensed fallback.
  - **Pre-sale notice (`f2f5f8c`)** — `presaleNotice` on `BookingPageConfig`: self-resolving "coming soon" beat for a not-yet-on-sale page (NYE), no date hardcoded in the frontend; disappears when the engine opens sales. Annual ops: `src/tprs/NYE-ANNUAL-PLAYBOOK.md`.
  - **Events (`8bfdbb0`, `af5ae11`)** — Paint Night (Jul 21, 6–8:30pm) is the first real `/upcoming-events` entry. Long external booking URLs get a `/slug` 302 short link in `vercel.json` (`/paint-night`) — one clean, updatable link for the CTA + FB/SMS/print. `AggregateOffer` with `lowPrice == highPrice` clears GSC offer warnings; the 60-day lookahead is why NYE doesn't show until ~Nov.
  - Also: 2-up fill-the-frame duration tiles (`c89519d`), add-on row polish (`9e6578d`).

- **2026-07-04 — Google-hours midnight-spillover artifact erased the July 4 closure; Roy announced phantom hours (`ca625fd`).** Ops had July 4 correctly marked closed in Google Business Profile (the Jul 3 snapshot showed Sat: Closed), but Google's `currentOpeningHours` rolling window starts at midnight *today* — so this morning's 4am cron saw Friday night's past-midnight tail (11am–1am close) reported as a truncated period "Sat 12am–1am." Normally the day's real period overwrites that tail; on a specially-closed day it's the ONLY period, so the snapshot recorded the holiday as open 12am–1am and Roy read it to a caller (call_dfe08ad8f5f2e9d0b96fa307547). This is the leading-edge mirror of the trailing-edge 23:59 clip `mergeHours()` already repaired. Fix: `stripLeadingSpillover()` in `src/lib/google-hours.ts` drops a 12am-opening same-day period when a previous-weekday period wraps past midnight to cover it (8-case logic test incl. genuine-midnight-open guard); same commit hand-corrected the committed snapshot. Same-day mitigation: self-expiring 2026-07-04 override in the n8n `Roy — Pre-Call Dynamic Variables` code node (closed all day, "back tomorrow at noon" greeting, promo suppressed) — date-gated, inert after Jul 4, delete at next touch. Recurrence class: only holiday closures landing on Sat/Sun (days following a past-midnight close). Chain of record: Roy ← n8n `roy-pre-call` ← `twistedpin.com/api/hours/` ← daily 4am Places snapshot — Roy never calls Google directly.

- **2026-07-20 — `/playbook` shipped; two silent-failure bugs caught only by an end-to-end test.** Both returned HTTP 200 to the client while doing nothing, which is why "the endpoint succeeded" was never sufficient evidence. **(1) Table grants.** `playbook_acknowledgments` was created through the Supabase MCP `apply_migration`, which does NOT apply Supabase's default role grants — every insert failed `42501 permission denied`. Easy to misdiagnose because `service_role` bypasses RLS, so the instinct is to go looking at policies; RLS and table-level GRANTs are independent. Fixed with `grant insert, select … to service_role`, plus `revoke all … from anon, authenticated` because those roles retained `TRUNCATE` and **RLS does not gate TRUNCATE**. **(2) Resend sender domain.** Only `mail.twistedpin.com` is verified on the Resend account — the apex `twistedpin.com` is not, and Resend matches the domain exactly. Sending from `noreply@twistedpin.com` (then `bookings@twistedpin.com`) returned 403 and, because notification failure is deliberately non-fatal, produced signatures that saved correctly while info@ got nothing — precisely the failure the email exists to prevent. Now sends from `playbook@mail.twistedpin.com`. **TPRS checked and CLEAR** (confirmed same day from a real guest thread) — it sends from `reservations@mail.twistedpin.com`; the `bookings@twistedpin.com` hits in that repo are test fixtures, a stale comment, and one fallback. **But that fallback is a live landmine: `tprs apps/backend/src/workers/main.ts:198` reads `options.emailFromAddress ?? "bookings@twistedpin.com"` — if the from-address env var is ever unset or renamed, every booking confirmation silently stops delivering to paying guests.** Should default to the `mail.` subdomain or throw on startup; not yet done. Sequence: `49680cb` (build) → `48e6ebd` (sender fix) → `a68277d` (docs).

- **2026-07-18 — Extra Suite Birthday was $20 over the live catalog on `/birthday-parties/` (`f9b7ffc`).** The TPRS booking catalog at `/reserve/birthdays/` sells Extra Suite Birthday at **$469.90**; this page said **$489.90** in body copy, the FAQ answer, and the schema.org `Offer` that Google reads. Surfaced by the Avery KB audit — the KB had the correct figure and the marketing page was the stale one, which is the opposite of the assumption the audit started with. **Source of truth for kid-package pricing is the live booking catalog, not this page.** Root cause was two independent literals: the card display hardcoded `$489.90` while the schema read `EXTRA_SUITE_BIRTHDAY_PRICE`, so they could drift silently. The card now renders from the constant, making that class of drift impossible; the constant's docstring points at the catalog. `SUITE_BIRTHDAY_PRICE` ($419) was correct on both and is deliberately still hardcoded in its card (constant is `"419.00"`, display is `$419`) — do not "fix" that to match without changing the display format.



## 2026-09-22 — Applied points reward visual refinement (local)

Jon found the checkout proof wordy and potentially confusing. A confirmed points reward now replaces code entry with a compact savings card and one points-cost line; Remove restores code entry. Ordinary coupon and error behavior is retained. Test disclosures stay in the local harness, with a restrained placeholder for the simulated payment form. Browser assertions and mobile/desktop screenshots are being refreshed; no deployed UI or real account changes.

Verified: 81/81 joined checks (15 browser) and Website booking-graph TypeScript passed. Removing/reapplying the reward updates the total without spending points or calling the rail. Screenshots inspected at 320px, 390px and 1280px. Disposable database and preview server stopped. Evidence: Loyalty/docs/audits/2026-09-22-booking-ui-proof.md, visual follow-up. All edits remain local/uncommitted/unpushed.

## 2026-09-22 - Isolated Stripe runtime preparation

Added separate synthetic-only Stripe harness and full booking-wizard preview. Requires test keys and refuses active provider webhook destinations. Actual Stripe execution remains pending sandbox access. No production entrypoint, live data, messaging worker or deployment changed.


Full-wizard screenshot review exposed product/date text overlap in the existing mobile reservation recap. Local CSS now stacks them below 540px; the offline journey asserts separate bounds. This fix remains undeployed with the Loyalty worktree.

Verified the separate Stripe runtime preparation: four offline setup/full-wizard checks and backend/Website harness typechecks passed. Real Stripe mode remains unexecuted: the supplied test key exposes an enabled webhook to the deployed backend. No payment created. See Loyalty/docs/audits/2026-09-22-stripe-runtime-preparation.md. Source remains local, uncommitted and unpushed.



## 2026-09-22 - Stripe sandbox execution results (local only)

Eight actual API/CLI-webhook checks passed: successful booking/debit/replay, no-intent low-balance refusal, card decline, post-capture kiosk spending/full refund/terminal retry, real refund callback and duplicate-event restoration. Backend/harness TypeScript passed. The mobile Elements/3DS journey reached confirmation once but a final test assertion caught an unlisted Stripe CDN host. After refunding that test and narrowing the allowlist correction, a repeat hit Stripe hCaptcha and timed out; no bypass attempted. Manual browser verification remains open. Final provider audit: four captured test charges, all four fully refunded; one incomplete attempt cancelled; zero active persistent webhook endpoints. No real member, message, deployment, Zite build or production change. Source remains local/uncommitted/unpushed. Evidence: Loyalty/docs/audits/2026-09-22-stripe-runtime-preparation.md.


## 2026-09-22 - Named loyalty benefit in the cart (local)

Owner requested "$50 off Loyalty (350 points)" instead of the raw personal code in Your selections. The authoritative quote now includes optional requiredPoints for validated bound rewards; Website and shared response schemas carry it through. The cart uses actual savings/point cost, with more label space, on all quoted steps. Ordinary coupons retain their existing labels. Checkout math and redemption timing are unchanged. Pending narrow local type/browser validation; no deployment. The owner-completed synthetic browser booking INV-2026-00339 was independently verified at $30.66, balance 0, one used grant; its full test refund and actual callback restored 350 exactly once.


Verified: 81/81 existing joined checkout/UI tests, five offline full-wizard checks, backend and Website typechecks. Desktop and mobile cart screenshots inspected with the requested label. A narrow desktop browser initially exposed scrollbar-gutter clipping; true mobile emulation removes that desktop artifact. No production CSS reset was changed. Manual browser test is now closed by the owner-completed synthetic booking and independent exact-booking/debit/full-refund/one-restoration verification. All source remains local and unpushed.


## 2026-09-22 - Opus correction slice (local, validation pending)

Preserve canonical points-member identity while saving the checkout confirmation email; suppress the signup reward presentation during an earned-reward checkout; retain personal codes after phone mismatch. Extend point restoration to fully refunded bookings. Add durable classification for points-funded rules and reject unbound codes, plus replace invalid unused invitations only on a new authorized request. No production migration, sends, Zite build or deployment. Targeted tests and existing regressions follow.

## 2026-09-22 - Opus correction validation completed (local)

Points checkout now keeps plain opt-in wording when the separate signup-$10 feature is enabled, including submitted consent. A mistyped phone no longer clears the personal code; correcting it permits reapplication. Backend canonical-member email handling sends the confirmation to the entered address without changing reward ownership or stored phone.

Passed: 87/87 joined checkout/UI, 114/114 regressions, six full-wizard harness checks, backend/harness/Website TypeScript. Separate Stripe run passed eight checks, including exact final cumulative-refund callback restoration and replay. One wizard check and one Stripe check are harness identity guards, not guest journeys. Earlier wording crediting the manual full-refund restoration to its callback is corrected: that restoration happened inline; this NEW cumulative-refund test proves callback causality separately. Full evidence: Loyalty/docs/audits/2026-09-22-opus-corrections-proof.md. No deployment, public changes, messages or Zite build; work remains local/uncommitted/unpushed.
## 2026-09-22 - Current-main local integration started

Checkpoint the tested Loyalty booking UI locally and merge current origin/main into this isolated branch. Revalidate against the matching backend without any push, public deployment or guest experience changes. Validation pending.
## 2026-09-22 - Current-main Loyalty integration verified locally

Merged fetched Website main b59510e into the isolated Loyalty branch (291d9c7), preserving the
current confirmation-duration behavior. Matching TPRS merged main 1578074. Fresh 87 checkout/UI
and 114 backend regression checks passed, plus Website booking-harness TypeScript and current
confirmation SSR/duration checks. No public push/deployment or guest changes. Local checkpoint
and merge commits exist; none were pushed. Further owner-only integration remains.
Evidence: Loyalty/docs/audits/2026-09-22-current-main-disabled-package-proof.md.

## 2026-09-23 - Back/contact-change checkout correction (local)

Owner trial exposed a stale coupon after changing phone, a misleading signup-$10 prompt,
and a failed authoritative quote falling back to a pretax Pay total. Invalidate contact-bound
previews, ignore late unmounted previews, key quotes to current inputs, and block payment
until pricing succeeds. Surface phone mismatch/retry instead of a fabricated total; retain
existing plain-consent suppression. Preserve captured-payment recovery. Add full-wizard
Back/edit/failure/recovery coverage against the isolated synthetic backend. Validation pending.
No Website publication or guest rollout. Owner's live code/rule are disabled during repair.

Local validation passed:109/109 joined checkout/config/browser tests,11 offline full-wizard
checks (including five new Back/edit/delayed-response/outage/removal scenarios), and Website
plus backend/harness TypeScript. Mobile error/recovery screenshots inspected. No publication.
The original frontend must not be used to certify these unpublished fixes. Evidence in
Loyalty/docs/audits/2026-09-23-contact-change-checkout-proof.md. Dependency check restored the
existing npm lockfile installation; no tracked package/lockfile change. Source uncommitted.

## 2026-09-23 - Shareable points reward (local preparation)

Jon approved use by whoever holds the link, using their own booking contact details. Backend
keeps the 350-point debit/restoration with the original member. Checkout copy now identifies
the account that earned the reward rather than assuming the booker owns those points.
Phone-error animation work is superseded. Retain current-input quote checks, tax/fee totals,
single use and signup-offer suppression. No publication or guest messaging. Tests pending.

Local sharing validation passed:114/114 joined checkout/config/browser tests,114/114 ordinary
checkout/customer/payment regressions,10 offline full-wizard checks and backend/Website harness
typechecks. Original members using their own normalized phone retain their canonical account
and may supply a first/current confirmation email; different-phone recipients are allowed and
resolve separately. Owner balance/consent/contact, recipient confirmation, single debit, replay,
full refund/duplicate restoration, balance races and legacy payment metadata are covered.
Exact refreshed preview at390/1280px passed with0 payment and0 external browser requests;
screenshots inspected. No production changes, provider calls, public deployment, messages,
commit or push. Evidence: Loyalty/docs/audits/2026-09-23-shareable-reward-proof.md.
## 2026-09-23 - Prepare owner-only corrected booking preview

Jon approved continuing after the shareable-reward Stripe TEST proof. Checkpoint the verified
booking UI fixes, incorporate current main without publishing, and prepare a loopback-only test
surface using the real catalog. It must refuse all holds, payments and other writes until a
separately armed owner test. Public Website and rewards page remain unchanged.

Owner preview preparation passed against current main:114 joined checks,114 ordinary backend
regressions, TypeScript and full TPRS PR238 CI. Added a separate local owner review using the real
catalog; actual HTTP attempts to create holds/payments/bookings/uploads/invitations were blocked.
Mobile/desktop authoritative taxes/fees were inspected, with no overflow or browser errors. The
actual inactive reward gives no usable total or false savings. Two harness-only assumptions were
corrected (mobile disclosure text and existing quote field names); no application change required.

An explicit future --live-owner mode pins the designated local-config contact/code, one eligible
lane/cart and issued payment IDs, with a short deadline and conversion recovery grace.26 policy
checks pass, and default read-only browser proof passed again after integration. It remains unarmed;
this does not prove a production card checkout. Real test contact/key stay outside this public repo.
Backend sharing PR238 deployed as4e31e9d with all feature controls/codes inactive; Website remains
unpublished. The earlier detached real Stripe sandbox proof remains separate.

## 2026-09-23 - Separate owner refund callback retest

The first real owner booking/kiosk/refund proved debit and restoration, but Stripe live
subscriptions omitted refund.created. Jon approved continuing and that exact subscription
was added. The private loopback harness can select a separate second trial packet using
--refund-retest; it preserves the first used code and evidence, and all existing gates.
No public Website changes or push. The second owner payment is a manual browser action.
## 2026-09-17 — Labor review pilot (local; not deployed)

Opt-in /labor/?pilot=1 reuses the staff PIN/API with a weekly metric and persistent question/answer/action/outcome cards. Added local proxy override and a staff-page drawer opt-out; other pages retain their defaults. Browser tests verify actual local persistence and mobile layout. Source reconciliation and real GM phone trial precede activation. See Context/session-handoffs/2026-09-17-labor-review-pilot.md.


## September 24, 2026 - Weekly labor replacement (implementation)

Jon authorized replacing the recurring labor report for the next regular delivery after GM return. The labor page now opens the durable V2 review by default, with the original notes at `?legacy=1`. A daily building-sales/hourly-wage/salary overview and relative hourly-share bars precede the one or two response cards. Percentages are not daily staffing grades. Backend creation, source validation and release checks are being completed; this entry does not claim deployment.


September 24 verification: local PIN login and the actual review API were exercised at 320/390/1280px. Email and app have no horizontal/cell overflow. Yes/Maybe responses persist after reload and queue one recap after 90 minutes. The production build and prebuild checks pass with the lockfile's Astro 6.2.1. The optional Astro checker reports 366 existing errors across six unchanged non-labor files (estimate tracking, Avery review, invite previews, menus and Naperville page); no labor diagnostic was reported. No golden-suite calls were made. Release activation is paired with the TPRS weekly sender starting October 1; no immediate duplicate email.
## 2026-09-25 - Invoice automatic answers (authorized release)

Show first-time automatic invoice conversions with their package evidence and a
Correct unit form. Corrections submit a state token; later edits require a refresh.
Explain current-price changes and affected counts. Reuse the inventory UI styles
and mobile form sizes. Fictional DOM tests include correction and stale-edit recovery;
15 browser layouts pass at 320/390/960px and screenshots were inspected. Strict
invoice component TypeScript and production build pass. Opus 5.5 / Extra High
read-only review cleared the correction contract. Backend must deploy first.
No source invoice documents, real product prices or internal notes are published.

## 2026-09-26 - Final invoice copies and written deposit answers

Jon wants routine delivery scans compared with emailed finals, and invoice
questions answered in plain words. A reconciled copy now says Copies agree
automatically and retains the paper's original line beside the reconciled result.
Deposit reviews expose Tell us what happened; saving an answer records a separate
credit and revised amount due. The result is visible and can be corrected again.
Stale edits refresh, and unclear answers display the specific missing detail.
Existing inventory styles are reused. QA uses fictional invoices only: 36 DOM
scenarios, strict component TypeScript, production build and 24 responsive layouts
at 320/390/960px pass. Deployment follows the corresponding backend release.

## 2026-09-27 - Finish the remaining review after a deposit answer

Once a deposit answer is recorded, the invoice keeps its correction action and
shows any remaining delivery notes without demanding the same deposit answer
again. The remaining-review confirmation stays available. A fictional DOM
scenario covers a saved credit beside a separate full-keg concern. Backend
completion separately clears only deposit notes explained by the staff answer.
Validation: 37 invoice DOM scenarios, strict component TypeScript and the
production build pass. No layout styles changed; fixtures contain fictional data.

## 2026-09-27 - Ordinary invoice copies can agree without another staff answer

Show automatic agreement for a fully matching email and delivery scan from any
supplier, using the backend's evidence checks. Distinguish literal matching copies
from the specialized supplier-final shortage resolution. Keep the purchase-record
link available for a staff correction; matching paperwork never asserts receipt.
When something remains unknown, show the specific questions supplied by the
comparison. Fictional scenarios cover ordinary agreement and an incomplete
reading, alongside the existing supplier-final and stale-review cases.
Validation: 39 DOM scenarios, strict component TypeScript and production build;
the two new states also pass six layouts at 320/390/960px, with phone screenshots
inspected. All fixtures are fictional. Optional response fields keep this UI
compatible with the previous backend during deployment.

## 2026-09-27 - Start food and liquor count processing every 20 seconds

Jon asked to reduce the existing interval for both counting screens. The shared
recorder now rotates every 20 seconds for callers that process segments during
recording (food and liquor), retaining the same microphone stream. Keg callers
that interpret the complete transcript retain 60 seconds. Review and Apply stay
at the end. Takes shorter than 20 seconds still start processing at Stop; this
does not implement pause detection or streaming. Longer takes make roughly
three times as many transcription/extraction requests, and fixed boundaries can
still divide speech. Validation passed: nine recorder interval scenarios, four
recorder recovery scenarios, 42 food voice scenarios, eight liquor/invoice UI
scenarios, strict component TypeScript, required prebuild checks and production
build. The synthetic recorder checks cover early processing, ordered assembly,
Stop during rotation, and microphone reuse. Physical phone timing and recognition
across the shorter boundaries remain to be checked in the next walk.

## 2026-09-29 - Invoice review questions first

Jon authorized an invoice usability pass after struggling to find the actual
questions and controls. Unanswered items now lead the detail page with readable
catalog names, visible answer forms, current unit labels, a remaining-item count
and an explicit completion state. A saved answer returns focus to the progress
message. Completed automatic answers, copy comparisons and other invoice rows
are compact expandable sections; delivery correction is a secondary action.
The invoice list prioritizes current attention instead of equating OCR status
with completion. The backend provides an optional current-attention value for
excluded copies; older responses remain conservative.

Case conversions accept a whole number or a narrowly parsed written answer such
as "1 case = 24 cans", using only the existing inventory label. Ambiguous replies,
new unit names and stale definitions cannot redefine a unit. The conversion and
calculated price are shown before Save. This is not a general invoice language
model or a change to count definitions, costs, receipt rules or re-read protection.
The current dark palette is retained, with staff-focused sans-serif text, larger
inputs, more consistent spacing and fewer competing actions. Validation and
release receipts are recorded in the private COGS ledger.

## 2026-09-29 - Liquor count voice: the shelf's bottles, the take's shelf, no submit over a take

From the 2026-09-28 COGS review (Opus, then an independent Sonnet 5.5 advisor),
the three liquor-screen defects the food screen fixed on 2026-09-08 and liquor
never did, on the screen actually used weekly.

- **Vocabulary scope.** CountLiquor sent no scope, so the transcriber biased
  toward every active SKU alphabetically; since the food catalog joined that
  list, only 50 of 162 bar SKUs got a keyterm (the budget ran out at
  "Chambord"). It now sends the bar section and the take's shelf, as food does.
  The server already builds liquor shelves from submitted count history.
- **A take stays on its shelf.** Apply wrote a take to whichever tile was
  selected when Apply was tapped. The shelf is now captured when recording
  starts. Tiles hold still while the mic is live and free up after Stop. The
  review sheet says where the take is going, and so does the Add button, which
  used to name the selected tile.
- **No submit over a take.** Finish stayed live while a take was recording,
  processing or waiting in review. Closing then dropped the spoken bottles, and
  the server refuses a line saved after submit. Finish now reads "Finish the
  recording first" until the take lands. A second take waits for the first
  one's review.

The food screen, the recorder hook and the backend are unchanged. Validation:
six new jsdom scenarios against the actual CountLiquor
(`scripts/qa-liquor-bottle-sizes/check-liquor-voice.mjs`), each failing
against the previous screen; the existing 8 liquor bottle-size, 42 food voice
and 9 recorder-interval scenarios; strict liquor TypeScript; prebuild checks
and the production build. There was no physical phone or microphone test. The
next GM walk is the first real use.

Independent review (Sonnet 5.5, Max) then asked for three fixes, all made:
- The tiles lock only while the recorder really reports recording, because
  the Web Speech fallback can start without ever doing so.
- An empty shelf id (the moment before shelves load) is never sent; the
  server's uuid check would reject every upload of that take.
- Locked tiles now look locked. The recording panel names its shelf, and
  Finish says what it is waiting for: the recording, the read-back, or the
  heard bottles.
Three more scenarios bring the suite to nine. The two fix-specific ones fail
on the pre-review screen. The mic-denied release passes on both, as the
reviewer said it would; it guards that path.

The 42-scenario food voice suite now flakes on this machine. "complete failure
preserves the server message and a new take starts clean" fails intermittently
even with main's files (3 of 3 runs at one point), so it is not caused by this
change, which does not touch CountFood. It needs its own look.

## 2026-10-01 - Discontinued items: count the leftovers, never order them

Jon, when the kitchen switched to fresh 3.5 oz patties: "he might still count
it, but we're not going to order it moving forward." He asked for counting to
be "smart and easy" through a changeover. TPRS migration 0196 adds a
discontinued state between active and archived, with a replacement item, and
these screens follow it.

- **Food walk.** A discontinued item sits last on its shelf under
  "Discontinued, count leftovers", with "Now: <replacement>". It is left out of
  the shelf's "X of Y counted". "None left" archives it and stays on screen
  with Undo for the rest of the walk. "None left" is hidden once a number is
  entered, because the two would contradict.
- **Liquor walk.** Search tags a discontinued bottle "discontinued, count
  leftovers" and sorts it after the bottles we still carry. The liquor walk has
  no shelf list to group.
- **Invoices.** A line that bought a discontinued item after the day it was
  discontinued becomes an item question: "Discontinued Oct 1. Still buying
  this?" It has two answers, "Yes, we carry it again" and "That's <replacement>"
  (a rematch). It never holds the purchase or the cost.

Validation:
- Five jsdom scenarios against the actual CountFood
  (`scripts/qa-liquor-bottle-sizes/check-food-discontinued.mjs`, with
  `?discontinued` in the food fixture). The first fails against the previous
  screen.
- Two invoice scenarios in `check-invoices.mjs` (49 total).
- The existing 42 food voice and 9 liquor voice scenarios.
- Strict liquor TypeScript.

There was no physical phone test. Server-side behaviour (precheck, voice,
order guides, the migration) is in TPRS BUILD_NOTES 2026-10-01.

## 2026-10-01 - "None left" records its zero; fixes from the GPT-6.1-Sol review of #55

An independent reviewer (GPT-6.1-Sol, Ultra) found two defects in the
discontinued screens shipped earlier the same day:

- **"None left" lost the count.** It archived the item but wrote no line, so
  a count that should have said "0 of the 10 left last time" said nothing,
  and the bracket dropped the item instead of recording it as used. It now
  saves an explicit zero on the shelf first, and archives only once that save
  lands. A failed save archives nothing. Undo removes only a zero the tap
  itself created.
- **It looked at one shelf only.** "None left" archives everywhere, so it is
  now hidden, and refused, while any shelf in the walk holds a counted
  quantity of the item.

The invoice screen's note on an automatically settled copy no longer claims a
supplier's final invoice explained a plain check mark. That wording is kept
for supplier finals; a matching-copies mark reads as a note (TPRS same day).

Validation:
- The food discontinued suite has 6 scenarios. The new zero check fails
  against the live screen.
- The existing 42 food voice and 49 invoice scenarios pass. The invoice
  suite's focus check is timing-sensitive: it passed on a rerun and is
  unrelated.
- Strict liquor TypeScript passes.

## 2026-10-01 - An email receipt opens as text, not a broken image

TPRS #286 brings Dip hot honey's order-confirmation emails into COGS. There is
no PDF: the body is stored as text (TPRS 0197), and the original-invoice URL
serves that text. This screen drew every page that wasn't a PDF as an `<img>`,
so the first one, Dip #00442, showed a broken thumbnail.

A page whose `contentType` is `text/plain` now gets an "✉️ Open email receipt"
button, styled like "📄 Open PDF", that opens the text in a new tab. TPRS
writes `text/plain` only for an email-body page (staff uploads accept images
and PDFs only), and its extraction worker branches on the same value. Scans
and PDFs are unchanged. TPRS already sends `contentType`, so nothing else has
to deploy.

Validation:
- A fictional `text-receipt` scenario in `check-invoices.mjs`. It fails
  against the previous screen.
- All 50 invoice scenarios pass.
- Strict liquor TypeScript and the production build pass.

## 2026-10-02 - Liquor submit sends a JSON body (hotfix)

John's liquor count could not submit. The screen showed "Save failed", and
both attempts, at 1:22 PM Central, got a 400 from TPRS: "body/ Expected object,
received null". The liquor screen calls `submitCount` without `isFullCount`, so
it sent a bodyless POST. The proxy delivers that as JSON `null`, and the submit
route's body schema (`z.object(...).optional()`, since TPRS #180 on 9/7) rejects
`null`. `createKegCount` already sent `{}` for the same reason. This is the first
liquor submit from the screen since 9/7: the 9/18 count was closed by a script.

`submitCount` now always sends an object body: `{}`, or `{ isFullCount }` when
the caller declares it. Saves were unaffected, so the 206-line draft was intact.

Validation: production logs for both failed requests. The server schema accepts
`{}`. The draft's SKUs pass the submit-time unit-basis stamp (TPRS 0198): no
non-positive yield and no null count unit.

## 2026-10-02 - The count report locks a minute after submit (copy)

TPRS #303 (merged 10-02) sets the variance auto-finalize window to zero, on
Jon's ruling, so the order guide and the graded email ship when the GM
submits. The draft banner on the Counts screen still said "Left alone, it locks
itself in 3 hours." It now says "about a minute after submit". No behavior
change.

## 2026-10-02 - Liquor voice: pause cuts and carry-forward (switch), and two review checks

On the 2026-10-02 count the recorder's 20-second clock cut 17 of 24 bottles
from their numbers ("Frangelico," | "three"). The bottle defaulted to 1, and
the orphan number was lost or shifted the next piece. The replay is in
`Alcohol Pricing/incidents/2026-10-02/stt-bakeoff`.

**Behind a switch, off by default.** Open the count page with `?pausecuts=1`
to turn it on for that phone (remembered); `?pausecuts=0` turns it off.
- `pauseDetector.ts`: a segment ends at the first 0.5 s pause after 20 s, and
  always by 30 s. The pause is measured against the counter's own loudness on
  the level watch's analyser, every 50 ms. A browser with no analyser keeps the
  20 s clock.
- `voiceCarry.ts`: a segment's unfinished last phrase ("…Frangelico,", "Bacardi,
  point") waits and leads the next segment. Segments are matched in spoken
  order, even when they finish transcribing out of order. Liquor only: food
  keeps the clock, because its phrasing ("we have five boxes of gloves") puts
  the product last.
- Replay on the 10-02 audio with this exact code, Deepgram with formatting off
  and TPRS #308's matcher: 108 of 112 products right, 2.5 bottles off. The
  wait after Stop was about 1.8 s typical and 4.6 s worst. With a 350 ms pause
  it scored 104, because a cut fell inside "point … eight"; 600 ms scored 105.

**Live for everyone:**
- The name-number prompt (`voiceReview.ts`). A count equal to a number in the
  bottle's name, or starting with it, asks before it can be added: "Seagram's
  7" at 7.9 offers 0.9 or 7.9, and "Dewar's 12" at 12 asks.
- Back-to-back repeats across a piece boundary are a correction. This is Jon's
  rule, which the server already applies inside a piece.

Tests: `check-voice-carry.mjs` (14), `check-recorder-pauses.mjs` (3), and 3 new
scenarios in `check-liquor-voice.mjs` (12 in all). The recorder segments (9),
recovery (4), deadlines (7) and food voice (42) suites still pass.

## 2026-10-02 - Stop stays on screen while recording

Jon's first pause-cut test, on Android: the live words grew and pushed "Stop &
process" below the fold, so he had to scroll to find it. While recording, the
Stop button is now pinned to the bottom of the screen, where the review sheet's
Add button sits. The capped live-words box keeps the newest words in view. The
liquor count and the two keg screens share that button, so they all get it.
Food has its own.

The test take itself, cut on pauses at 21.2, 22.6 and 21.8 s, read back all 20
scripted bottles with the right numbers. The first cut fell between
"Frangelico," and "three", and the carry-forward rejoined them.

## 2026-10-02 - Pause cuts are the default

After Jon's Android test (all 20 scripted bottles right, with cuts on pauses at
21.2, 22.6 and 21.8 s), Jon chose to convert rather than roll out by link.
Pause cuts and carry-forward are now on for every liquor count. `?pausecuts=0`
on the count page is a per-phone emergency fallback to the 20 s clock, and
`?pausecuts=1` undoes it.

One known trade: a piece that ends on a bottle name with no number after it
("…three titos", said number-first) waits for the next piece or for Stop. That
is a delay, never a miscount. John counts name-first ("Tito's, three").

## 2026-10-02 - Food voice: pause cuts and a food carry-forward

Jon read 20 scripted food items on the Pizza Freezer shelf. Production got 12
right. The 20 s clock cut "We have 4.2 cases" from "Pizza sauce" (two rows,
one with no product and one with no number). The cut also clipped the start of
"cranberries", which came back as "Banberries". The replay is in
`Alcohol Pricing/incidents/2026-10-02/stt-bakeoff/food`.
- **The food count gets the liquor recorder's pause cuts** (same switch: on by
  default, `?pausecuts=0` falls back to the clock).
- **A food carry-forward** (`voiceCarry.ts` `splitFoodTail`). Food is said both
  ways round ("Bacon bits, one case" and "we have four point two cases of pizza
  sauce"), so liquor's rule (hold a name waiting for its number) can't work.
  Instead each piece's last item always waits and leads the next piece, along
  with a name just before it that has no number yet.
- **Pause cuts alone were worse (10 of 20).** The cuts split "jalapeños, one
  case" from "No. Half a case", and 6 cans were saved instead of 3. With the
  carry it was 14–16 right. With TPRS's matching fixes from the same night as
  well, it was 16–17, with nothing saved wrong in 15 runs; the rest were
  one-tap questions.
- The live words box follows the newest words. Uploads keep the take's shelf
  for keyterms after the counter walks on, as liquor does.
- **Trade:** each piece's last item waits for the next piece (20 to 30 s) or
  for Stop. A one-item take is matched at Stop.

Tests: `check-voice-carry.mjs` (17). `check-food-voice.mjs` (45) runs the 42
earlier scenarios on `?pausecuts=0`, plus 3 on pause cuts. The liquor voice
(12), recorder (9, 4, 3) and deadline (7) suites still pass, and so does
`astro build`.

## 2026-10-03 - Liquor voice backlog: re-said bottles, a history check, "Show N more", clip labels

Jon's go on 2026-10-03. The server half is TPRS #313. Each piece works before
that merge and gains its data once it lands.
- **A bottle said again on the same shelf asks, in that take's review.** It
  asks "Recount" (replace the earlier take's number) or "More" (add to it). On
  10-02 several re-says double-counted, and the submit check only asked at the
  end, when nobody remembers. An answered row isn't asked again at submit.
- **A total far above the bottle's 90-day record asks before it can be added**
  (`voiceReview.ts` `historyCheck`): over three times the larger of the
  largest count and the largest delivery, and at least a case above it. It
  would have stopped 1,152 cans of tonic (record 72) and Seagram's at 14
  (record 3.5). "Keep" or a typed number answers it. It is silent until TPRS
  sends the record.
- **The submit check's capped lists expand with "Show N more".** That covers
  the dollar-ranked findings (from TPRS `more`; an older server keeps "+N more
  not shown") and the voice-added doubles.
- **Every voice upload names its take and its piece**, for replays (TPRS 0200
  stores them; an older server ignores them).
- Found by typecheck before release: the re-say "Recount" first added a second
  `clearCell`, which in JavaScript would have silently replaced the grid's ✕
  (remove bottle) handler. It now shares the one function, and a scenario taps
  the ✕.

Tests: `check-liquor-voice.mjs` (19), `check-voice-carry.mjs` (18), and the
recorder (9, 3, 4), deadline (7), food (45), discontinued (6) and bottle-size
UI (8) suites. `astro build` passes.

## 2026-10-03 - A stale count screen merges instead of overwriting

From Jon's 10-02 phone pass. A count save replaces the whole draft, so a
screen loaded before an edit made somewhere else (an admin's correction, an
old tab, a second phone) saved its old copy straight over it. TPRS now refuses
a save built on an older draft (`baseHash`, in the TPRS PR of the same day).
- **`draftSync.ts`:** the liquor and food count screens queue their saves, so
  their own overlapping saves can't refuse each other. Each save says which
  draft it was built on.
- **When a save is refused,** the screen merges: cells the counter changed
  keep their numbers, and every other cell takes the current draft's. It saves
  the merge and shows "included a change made elsewhere" by the save status.
- **Bottled beer is unchanged** (it builds its rows differently), so it still
  replaces the draft as before.
- **Deploy order doesn't matter:** a screen only sends a fingerprint once the
  server has handed it one.

Tests: `check-draft-sync.mjs` (6, new), plus one end-to-end scenario each in
`check-liquor-voice.mjs` (20) and `check-food-voice.mjs` (46). The
bottle-size (8), beer (8), discontinued (6), recorder and deadline suites still
pass, and so does `astro build`.

## 2026-10-03 - Food walk: where things live

Jon, 10-03: "for each zone, if we don't count something, it should ask us
why ... Are we out of it? Is it no longer stored in this location? Or,
'Whoops, I forgot'". Before Submit, it also asks about what we bought or cook
with that no zone lists. He approved the preview (Opsi
`previews/2026-10-03-walk-locations.html`) after asking for a bigger zone name
and "Remove from zone" in place of "Not kept here". The server half is TPRS
#314.
- **Leaving a zone** (‹, › or the zone list) opens a sheet when something was
  counted there and listed items are still blank. The zone being left is the
  biggest thing on it.
  - **None left** records a 0 there, the same as "none here".
  - **Count it** takes the count there, in cases and the item's unit.
  - **Remove from zone** asks where it is now, or "+ New spot". The count goes
    on that zone. The item is added to that zone's list before it comes off
    this one, so a failure halfway never leaves it on no zone.
  - **Skip** goes on. That zone doesn't ask again this walk, and Finish lists
    the skipped items as before.
- **When the sheet stays shut:**
  - A zone with nothing counted on it is the untouched-zone warning's at
    Finish.
  - A voice take still being read may yet fill the blanks.
  - Discontinued leftovers are never asked about.
- **"+ New spot"** names a zone and where the walk reaches it. TPRS places it
  in the walk order, and it is picked for the item that asked. A name already
  in use picks that zone instead.
- **"Things we think you have"** is in the submit panel, from the precheck's
  `unplaced`. These are items on no zone, bought in the last 90 days or used in
  a recipe. The answers:
  - **Yes, it's here** takes a zone and a count, and that zone lists it from
    then on.
  - **None left** records a 0. Where it lives is optional, and with no zone
    picked the 0 goes on the zone the counter is standing in, with no list
    change.
  - **We stopped buying it** discontinues it.
  - The list never blocks Submit; the button counts what's unanswered. An older
    server sends no list, and the panel is unchanged.
- **Every answer writes its count first, the way the grid does.** Then it
  changes a zone list. A failed list update keeps the count and says so.
- Found by a Chromium screenshot at 390px before release: 35vh of bottom
  padding on the sheet's scroller pinned its sticky buttons a third of the way
  up the screen, over the second item. That room is now a spacer after the
  sheet.

Tests: `check-food-walk-locations.mjs` (17, new). `check-food-discontinued.mjs`
(6) now taps through the sheet when it walks off a counted zone. Food voice
(46) and draft sync (6) still pass, as does `astro build`. One food voice
scenario ("complete failure ... a new take starts clean") fails on and off on
main as well: it looks for Stop 20ms after a new take.

## 2026-10-03 - The variance report lists a product in two bottle sizes as one

Jon buys a product in 750 ml or 1 L, whichever is cheaper per ounce. TPRS now
grades the sizes as one product, by the ounce at one price (`families`, in the
TPRS PR of the same day). Per size, the 9/18 to 10/2 Tanqueray read as a $33
gain and a $36 loss; as one product it was $2.77.
- **"All bottles" lists products** (`VarianceLines.tsx`): one row with the
  product's ounces and dollars, and each size underneath as counted, in
  bottles and ounces ("750 ml · 0.85 → 1.35 bottles · used -12.7oz · sold
  18.5oz").
- **Per-size dollars are left off.** They are the artifact the product row
  replaces.
- **A size missing from a count says so under its product.** A size's own
  negative usage doesn't: inside a product, that is the size the shelf was
  counted under.
- **Reports from before 10-03 have no families** and list every bottle exactly
  as before. The grade and totals at the top come from TPRS, so they already
  count products.

Tests: `check-variance-rows.mjs` (4, new) renders the real list from a stored
report with and without families.

## 2026-10-03 - Count screens: saves can't silently lose a count, and a check says when it didn't run

From the independent review of Jon's to-do list (GPT-6.1-Sol, 2026-10-03). The
TPRS half is #323.
- **Bottled beer:**
  - Saves queue and carry the draft's fingerprint, as the liquor and food
    counts do. A stale phone's save merges: any beer this screen didn't touch
    keeps the other phone's number.
  - An untouched beer screen never saves. Hiding it used to send an empty
    list over another phone's count.
  - **"None of these in the cooler"** records a zero for every beer. All
    zeros read as "not counted", so an empty cooler couldn't be recorded at
    all. Entering a number undoes it, so ✕ on every row still means "not
    counted".
- **Keg check:** Send stops when any half fails to save ("Couldn't save
  everything on this screen, so nothing was sent."). Each half swallowed its
  own save error and Send went on, closing drafts without what was on screen.
- **Food count:** findings past the first six sit behind "Show N more"; they
  were dropped. A check that can't run says so instead of "Nothing looks off in
  what you counted."
- **Liquor count:** a check that can't run stops at the submit dialog ("The
  check couldn't run") instead of submitting straight through; Submit anyway is
  one tap. The new size question (`size_mixup`) gets its line: "Check the size
  printed on the open bottles. If each bottle really is the size it says,
  submit as-is."

Tests: `check-beer.mjs` (12, 4 new), `check-liquor-voice.mjs` (22, 2 new),
`check-food-voice.mjs` (48, 2 new; the known "new take starts clean" flake
failed once and passed on the rerun), `check-ui.mjs` (8; its check-failure case
now taps Submit anyway), walk locations (17), discontinued (6), draft sync (6)
and variance rows (4). `astro build` passes.

## 2026-10-03 - Zone names: the beer screen finds the walk-in under either spelling

Jon asked for the zone names to be spelled and capitalized properly ("mop rrom"
came in verbatim from Opsi's count guide). The renames are database edits;
they include the bar's "Walk In Cooler" becoming "Walk-In Cooler". The bottled
beer section found its zone by that exact name, so it now matches either
spelling. Its fallback, the bar walk's last zone, was the same cooler anyway.

## 2026-10-03 - Food variance on /cogs: each food count against the one before

TPRS now writes a food variance report for every submitted full food count
(migration 0202, TPRS #326; Opsi BUILD-SPEC 11.121). This is its screen (Opsi
BACKLOG P2 slice 6).
- **The list:** a "Food variance" tile under Review opens it
  (`views/FoodVariance.tsx`, CSS `lq-fv-*`). It shows each food count, newest
  first:
  - the baseline;
  - a draft;
  - a final report, with its net over or under and the share of food sales
    that have a recipe;
  - a submitted count whose report hasn't landed yet.

  Partial counts stay off. Food counts are fetched with `?section=food`, and the
  liquor list is untouched.
- **One count's report** (`FoodVarianceReport.tsx`, pure):
  - At the top: the net variance in dollars, both completeness measures and why
    the report is incomplete, then the caveats.
  - Then the ingredients, biggest dollars first. Each says what it was counted
    in ("used 6 bags · recipes say 6.5") and carries a Watch or Look band when
    it runs past its class's band.
  - A line opens to its counts, cost and yield, and the dishes behind "recipes
    say", with estimates marked. An item with no yield says recipes use it but
    its share can't be counted yet, never "nothing sold uses it".
  - Flagged lines sit under "Left out of the totals", with the reasons in
    plain words.
  - Then the items used with no recipe, and the deliveries that couldn't be
    converted.
- **Versions:** the original shows first and stays the report of record. A
  re-run is a tab beside it, with who ran it, why, and what it changed against
  the original: the net, the recipes, and each ingredient whose recipe share,
  yield, dollars or standing moved.
- **Re-run** is for admins only (`bar.manage`). It needs a reason, and works on
  a final report that isn't a baseline. A draft says when it locks instead.
- **Deep link:** `/cogs?view=foodvariance&count=<id>` opens that count's report.

Tests:
- `check-food-variance.mjs` (13): the actual screen with synthetic reports,
  every request intercepted. A deliberate fault in the bundle fails it.
- `check-food-variance-layout.mjs`: 320, 390 and 960px in headless Chrome. No
  sideways scroll, nothing under 12px, tap rows at least 44px.
- Strict TypeScript on the COGS app shows only the five pre-existing voice
  `lib` errors. `npm run build` passes.

## 2026-10-03 - Recipes: no more guessed 1.5 oz pour

From the independent review of 2026-10-03. Every bottle added in the recipe
builder started at 1.5 oz and saved that way unless someone changed it. A
recipe whose real pour differs skews the expected usage, and with it the
variance grade.
- **The first bottle of an option whose label states one pour starts at that
  pour:** "Tanqueray 2oz" starts at 2. The label reader (`pourLabel.ts`) is a
  copy of TPRS `parsePourLabel`, so the screen reads a label the way the
  variance math does. A range, a fraction or two measures ("1-2 oz", "1/2 oz")
  states no pour.
- **Every other bottle starts empty**, marked "pour", and Save asks for it
  ("Enter a pour size for Jameson."). That covers a second bottle, a label with
  no pour ("Double Tito's", "Vegas Bomb") and every cocktail. A number in a
  drink's name ("Margarita 16oz") is often its size, and it doesn't say which
  bottle it belongs to.
- **Saved recipes keep their own numbers,** opened with Edit first or reused
  in the builder.

Tests: `check-recipes.mjs` (16, 8 new; 7 of the new ones fail on the old
code) and `check-pour-label.mjs` (3, new: the copy and TPRS agree on 53
labels). `astro build` passes.

## 2026-10-03 - Correct a locked count; batch saves and the submit check can't go stale

From the independent review of Jon's to-do list (GPT-6.1-Sol, 2026-10-03), and
Jon's "build all you can". The TPRS half is the PR of the same day.
- **Counts, the latest full liquor count:** an admin sees "Correct this count"
  (`CountCorrections.tsx`). Change a quantity, add a bottle on a shelf, or take a
  line out, with a reason. TPRS refuses a correction built on numbers that
  changed since. The count then shows "Corrected after the report locked" with
  each before → after, and that the locked grade and the order guide already
  sent stayed as they were. Corrected lines say so in the list.
  - The button appears only when TPRS says this person can correct this count,
    so nothing shows until the backend is live.
- **Liquor count batch rows** save the way count lines do: a save built on rows
  changed elsewhere merges instead of erasing them (`createCellSaver`,
  `draftSync.ts`).
- **Both count screens hand the check's fingerprints back at submit.** When
  TPRS says the count changed after the check, the screen checks again and says
  it is a fresh check.
  - The food submit panel's own answers write counts, so food sends the
    fingerprint after its own saves, unless a change from elsewhere was merged
    in since the check.

Tests:
- New or extended: `check-count-corrections.mjs` (3, new), `check-draft-sync.mjs`
  (7, 1 new), `check-liquor-voice.mjs` (23, 1 new) and `check-food-voice.mjs`
  (49, 1 new).
- Still passing: `check-ui.mjs` (8), beer (12), walk locations (17),
  discontinued (6) and variance rows (4). `astro build` passes.

## 2026-10-03 - Phone count recovery, visible submit review and food size details

Jon asked for another accuracy-first pass across the liquor and food count
work, Android with the phone microphone. The 10-02 count exposed misleading
"Save failed" wording after a successful save and rejected Submit; narrow
phone fixtures exposed clipped bottle names, long reviews whose actions could
fall offscreen, and error footers covering the final quantity.

- Save and Submit outcomes are separate on both count screens. A rejected
  Submit says the count saved and gives the next action. Autosaving does not
  erase that message. An unsaved count says to keep the screen open and has
  an explicit Retry save; failed checks have Retry check.
- A lost Submit response is followed by one read of the existing count detail
  endpoint. A submitted count completes without a duplicate write. If its
  status cannot be read, a dialog offers Check submission, a read-only action,
  or Home. It does not offer another Submit until it can read that the count
  is still open. Submit has a conservative 60-second deadline, followed by a
  status read; status reads have a 15-second deadline, including the body.
- The liquor submit review has one scroll area for all warnings, retirements
  and repeats; its actions remain visible. Narrow phone bottle names use a
  full line above 44px controls. Both screens observe the fixed footer when
  React attaches it after loading and reserve its actual height as text grows.
- Recording instructions refer to the phone microphone and calls. The liquor
  example says the name first, then the quantity, with pauses between bottles.
  Permission and microphone failures give a specific recovery action.
- Optional food report `sizeMembers` show the original package names and
  counts beneath a pooled product. Older reports render as before. Measured
  pooled units are displayed as oz or fl oz; portion products remain separate
  in the backend.
- Jon confirmed cauliflower crusts and flatbreads are counted in cases,
  including half cases. The existing catalog definitions (each/12 and each/60,
  default spoken case) already make the review display Cases and save exact
  canonical each quantities. These exact products now offer case inputs in
  the grid and shelf questions, with cases in summaries and warnings. Earlier
  loose entries remain visible and unchanged until an explicit case answer
  replaces the entire quantity. Explicit pieces or mixed model case/loose
  fields require restatement in cases; no individual correction is offered.
  The review action says "Add N items" so its item count is distinct from
  the case quantities beside it, with singular "item" for one reviewed row.
  The case rule stays with these product identities after package changes:
  new entries convert using the current confirmed size, while earlier cells
  retain their frozen size at entry. Missing or invalid sizes require package
  confirmation before entry; they do not restore individual-piece inputs.
  Vegetable Cauliflower still uses heads. UI fixtures prove the natural
  phrases; backend grounding is in the accompanying TPRS work.
- Retired shelves are suppressed from the shelf-missing question in TPRS.
  This screen continues to show the server's active-shelf details unchanged;
  no frontend text filtering hides count-integrity findings.

Validation: liquor voice 29, food voice 66, food variance 14, API deadlines and
submission recovery 18, food walk locations 18, discontinued food 6 and draft
sync 7. Chromium phone layout checks pass at 320/390/412px; generated screenshots
were visually inspected. Strict TypeScript on the COGS app passes with ES2023
libraries, and the complete Astro/Vercel production build passes. The fixtures
use synthetic requests; a real Android phone-mic count saved and reopened is
still owed by Jon.

## 2026-10-03 - Food cost on /cogs: each food bracket's cost of goods against its sales

TPRS now writes a food COGS report for every food bracket (migration 0206,
TPRS #335-#337; Opsi BUILD-SPEC 11.125-11.127). This is its screen (Opsi M3.8).
- **The list:** a "Food cost" tile under Review, after Food variance
  (`views/FoodCost.tsx`, CSS `lq-fco-*` on top of `lq-fv-*`). It shows each
  bracket at its **latest** version, the one trends read: the food + NA %,
  COGS on sales, Provisional and Draft badges, and "v3 of 3" once versions
  exist. It also lists the baseline and a submitted count still waiting.
- **One bracket** (`FoodCostReport.tsx`, pure):
  - **The headline:** the food + NA % against the 30% target and the 28-34% band (green at or under target, yellow inside the band, red past it).
  - **The money:** COGS on sales, before rebates and the rebate, and sales by source (GoTab, catering). Mocktails moved to pour cost, and the whole-check discounts named beside and never subtracted.
  - **USAR beside it,** with comps and staff meals out at recipe cost.
  - **Provisional,** with every reason in words on the line it affects: no cost yet, a cost that looks wrong, the rebate not known for these dates, catering not completed, invoices not read.
  - **Lines:** Food + NA (with food and NA apart under it), Paper (per cover), Supplies (below the line), bar produce on the food walk, and anything with no report line yet. Each opens to its items: opened, bought, closed and used, in the item's unit, with flags. A cost jump says "left out", never the dollars its bad cost would make.
- **Versions** are tabs named by why they exist: Original, Re-run, Revalued
  (by whom, with the reason; both brackets the count bounds moved together)
  or Updated (TPRS, when a missing Brunswick report, invoice or catered event
  arrived).
- **Admin only, on the latest version:**
  - **Fix costs** reads both counts' line costs (`/admin/bar/counts/:id/costs`, TPRS #337).
    - It lists what needs a price: unpriced items, and both ends of a cost jump with a hint to fix the wrong one.
    - It pre-fills TPRS's suggestion and sends every shelf of an item. Each count is revalued on its own.
    - It says which versions were written, and that a draft picks the cost up when it locks. It fetches nothing when nothing needs a price.
  - **Re-run** works as Food variance's does.
- **QA:**
  - `scripts/qa-liquor-bottle-sizes/check-food-cost.mjs`: 18 jsdom scenarios on the real screen.
  - `check-food-cost-layout.mjs`: 12 headless-Chrome states (list, latest, original, Fix costs at 320/390/960px). No sideways scroll, nothing under 12px, no tap target under 44px. The screenshots were looked at.
  - TypeScript on the COGS components is clean (its one `import.meta.env` error is environmental), and the full Astro production build passes.

## 2026-10-03 - A corrected invoice answer says which food counts need Fix costs

TPRS #338 adds `stale_estimate` to a corrected automatic answer's affected
counts. It flags a submitted food count whose stored cost estimate used the
price that answer wrote. The answers panel (`InvoiceAutomaticAnswers.tsx`) now
adds: "Its food cost used the price this answer wrote: fix it with Fix costs on
Food cost." "It had no saved price" now only appears for a line with neither a
cost nor an estimate; TPRS no longer reads an estimated line as unpriced. The
invoice QA fixture returns one of each, and `check-invoices.mjs` asserts each
message appears once. Removing the new message fails it. All 50 invoice
scenarios pass.

## 2026-10-02 - COGS phone usability pass (local, not deployed)

Reviewed all `/cogs` screens with fictional data at 412x915 (S24 Ultra viewport
approximation), 360x800 and desktop. Food/liquor count controls now have larger
steppers, clear case/loose labels and concise display quantities. Speech review
uses shorter questions; the food footer navigates directly to pending heard
items. Prechecks show real history as small numeric cards with expandable
detail, while narrative findings show the actual evidence instead of backend
placeholder numbers. Invoice accounting precision is retained.

All counting mutations lock during checking/submitting. Capture intent no
longer races the next take after a failed recorder start. Human-confirmed zero
is saved; missing model quantities are not guessed. A failed keg child save
blocks combined Send, and bottled beer has an explicit observed-empty action.
Current food unit/provenance and original-shelf voice safeguards stay intact.

GPT-6 Astra at Ultra independently reviewed the changes, then verified the
fixes and refreshed screenshots. No remaining P1/P2 findings. Strict COGS
TypeScript, 42 food voice, 9 liquor voice, 8 beer, 6 discontinued, 50 invoice,
and 9 count-scope checks pass. Final capture/interaction totals live with the
visual evidence. Astro compiles after all prebuild checks, but complete Vercel
packaging hits a local Windows node_modules-symlink EPERM.

See `Context/session-handoffs/2026-10-02-cogs-phone-usability.md` for reproduction,
evidence location and limitations. No production writes, push or deployment.
Physical S24 Ultra keyboard/headset/interruption behavior remains unverified.

## 2026-10-03 - Integrate the October 2 COGS phone audit with current count and cost work

The local audit commits `26559f6` (UI/QA) and `043b0e1` (gallery) were reconciled
with fetched Website main `307caa5773a6feda3e26cdc4bc0ff0b6a79a6cd6`.
The original dated audit above and its evidence remain intact. This integration
keeps the newer case-only food policy, pooled product reports, saved-count
recovery, draft fingerprints, locked-count corrections and food cost screens.

- Large labelled case/loose controls and short precheck questions come from the
  audit. Full server evidence remains visible for narrative findings, including
  size mixups and missed shelves; placeholder totals are never history cards.
- Food's Review N heard footer moves to unresolved items without submitting.
  Recorder intent follows live state, so a failed start cannot clear the next
  take. Checking and submission freeze count edits and pending voice navigation.
- Editable quantities and arithmetic retain saved thousandths, including 0.125.
  Summaries remove binary tails. Blank/negative liquor grid and batch text does
  not write zero; only a literal human zero resolves a zero voice quantity.
- Beer keeps stale-draft merge and observed-empty semantics. Earlier case and
  pack multipliers survive reopening and resaving; a frozen four-pack is shown
  as packs of four and never becomes six. A failed child save blocks Keg Send.
- Exact crust/flatbread case policy remains: partial cases are valid, new entries
  use the current confirmed package size, earlier cells keep their frozen size,
  and explicit pieces/mixed fields require restatement in cases. Legacy loose
  quantities remain visible until an explicit case answer replaces them.
- Current hardware scope is Android, phone microphone only. Historical headset
  notes are audit evidence, not the current recording workflow.

The complete Astro/Vercel production build and strict COGS TypeScript pass using
physical worktree dependencies, resolving the earlier Windows symlink packaging
failure. Current cost/accounting APIs and source are unchanged; their focused
regressions and mobile layouts also pass. Final reproduction, test totals and
synthetic screenshot locations are in
`Context/session-handoffs/2026-10-03-cogs-mobile-audit-integration.md`.
A real Android phone-mic count saved and reopened remains owed by Jon.

## 2026-10-03 - Recorder startup failures release the microphone and timers

Additional native Chromium tests reproduced failed-start cleanup defects in
the current recorder hook: permission denial or an unavailable device left the
elapsed timer running; a constructor failure installed a rotation timer after
finishing; and a native `start()` failure left the acquired microphone track
live. Both food and liquor use this hook.

Two pending-permission races were also reproduced. Resolving an old request
after Stop and a new Record started two live microphone tracks; rejecting it
could overwrite the newer take's state. Each Record now has a generation,
so old results release their own stream and old rejections cannot touch the
new take. Duplicate Start taps cannot acquire a second stream.
The same generation guard releases a delayed wake lock from an older take
without overwriting the newer take's lock.

Every failure now uses the same capture cleanup as a completed take. Native
recorder start errors finish gracefully, and a failed constructor/start returns
before installing the level watch, wake lock or rotation timer. Permission
failures retain the current recovery message and do not deliver a transcript.
Successful capture, partial text after device loss, segmentation and upload
recovery retain their behavior.

`check-recorder-lifecycle.mjs` adds 18 actual-hook/native Chromium scenarios,
including a functioning retry after every startup failure. Native WebM/Opus
clips from oscillator audio decode into nonzero signal. Acquisition and track
events plus transcription responses are controlled; there are no paid calls,
production requests or inventory writes. This does not replace physical Android
phone-microphone and interruption testing. Browser-profile cleanup now checks
its target directory and retries transient Windows file locks.

Validation: all 18 new lifecycle scenarios plus the existing 9 segmentation,
3 pause-cut and 4 timeout/partial-upload/retry scenarios pass. Strict TypeScript
for all COGS components and the complete Astro/Vercel production build pass.
## 2026-10-03 - Reviewed COGS correction and accounting workspace

Jon: "just review them -> then ship em" for all seven areas. GPT Astra at Ultra reviewed current main before implementation and the resulting changes. The existing staff `/cogs` interface gains food recipes/yields, atomic historical correction links, Brunswick department review, beverage dollars, independent tap observations, shared physical-walk links, the operations inbox, weighted trends and menu economics with reviewed manual price decisions.

PIN login preserves exact recipe, count, source and recommendation destinations. Saved draft links open that exact observation read-only, including older, partial and another counter's drafts. Cost and revenue unknowns remain explicit; a known partial subtotal never claims complete margin. The former pour-cost comparison now labels its spirit-only coverage, since 19% is an all-in target. Managers can correct records with reasons and current revisions; staff retain reads. Shelf prompts keep their shipped policy and additive multi-shelf behavior.

Physical cost findings open the exact SKU's cost review through PIN. Managers must confirm one displayed current counting unit, its price and a reason; stale physical/cost revisions and unsupported precision reject. The API records actor, before/after values and physical proof in the canonical cost ledger. Incompatible costs remain unknown until confirmation. Ten actual-app offline scenarios and inspected 360/412/1280px views verify this flow, including rejected capacity, unknown responses and usable zero costs; the final production build passed at 23:28 Chicago.

Offline fixtures intercept API calls and block external requests. Food recipes, insights, exact count deep links (10 scenarios), menu decisions (16 scenarios), shelf completeness (20 scenarios) and beverage save/reopen/submit/links were checked on desktop and phone widths, with screenshots inspected and no horizontal overflow. The final production Astro/Vercel build and required prechecks passed at 23:28 Chicago; Astra cleared the final changed paths with no remaining P1/P2 findings. These tests do not replace Jon's real Android count/save/reopen walk. Food email remains paused and the external GoTab writer remains disabled. Vercel commit verification is pending and will be recorded in the release PR and Opsi record.
## 2026-10-04 - Small recipe-question batches and a plain-language GM reply screen

Jon asked to resume "What's in it?" only after reviewing the previous email and
the answer screen. Food recipe questions now have a dedicated staff view:
one item at a time, ingredients and amounts in ordinary text, a concrete
example, individual Save answer, and a visible saved-for-review state. The
email's exact batch survives PIN login and reload. Draft text survives moving
between questions, returning home, network errors and revision conflicts.

The backend limits each Monday/Friday 1pm Chicago batch to five total questions.
Saving an answer does not update a recipe. Managers review the recorded answer,
open the exact recipe editor, and resolve only after a valid recipe is saved;
they can instead ask one specific follow-up. Staff can answer with bar.read.
Real notification activation stays off until Jon reviews the concrete email
and phone UI preview. No test email or production recipe mutation is part of QA.

Managers can queue one precise clarification from the selected saved recipe,
without typing identifiers. Queued clarifications remain visible before their
scheduled email. Exact question links from the operations inbox survive PIN
login; a newer batch or recipe destination supersedes an older URL identity.
Targeted questions ask only for that fact. Manager review cannot discard an
unsaved answer, and resolved questions support a specific follow-up.

Validation: 44 actual Chromium offline scenarios pass, including uncertain-save
readback, stale revisions, all session-expiry paths, deliberate follow-up,
manager queue and paired-identity regressions. Question, saved, error,
clarification, manager queue and review screens were visually inspected at
360/412/1280px; measured controls meet 44px and textareas use 16px. Strict COGS
TypeScript and the complete Astro/Vercel production build (all prechecks and
function packaging) pass. Physical locked dependencies installed from the
local npm cache resolve the Windows dependency-junction packaging issue.

## 2026-10-05 - Review liquor counts by shelf and correct them before submit

Jon's in-person liquor count found that the final review named suspect totals
without showing where they came from, and fixing a mistaken Jameson variant
required finding the original shelf. Each bottle finding's Details now shows
the current counted shelves, bottle sizes, frozen case/loose math and preserved
heard phrase. Cases and loose quantities can be edited there. Change item or
size moves the count on that same shelf, with explicit Add or Replace choices
when the replacement already has a count. Different frozen case sizes combine
only as individual-unit totals, with that consequence shown before the choice.

Edits invalidate the previous check and disable Submit until Recheck count
saves and requests a fresh server check. Recheck keeps review open even when
all findings clear, so it never submits a count by itself. Existing draft merge,
fractional precision, literal-zero and in-flight save/submit guards are retained.
The same confirmation stays open after editing, going back and tapping Finish.

Astra's independent ultra review found that ordinary local-wins merging could
overwrite a concurrently changed source or target of an item correction. Remaps
now protect both endpoints: a conflict restores their fresh server values,
keeps unrelated local edits, and pauses saving until a new explicit correction
or Keep saved counts. A remap made while a save is in flight stays protected.
Case stamps survive a transient zero when typing fractional cases or stepping
down and back up, including a bottle moved to a SKU whose catalog case size
differs. Historical cooler names use full-zone metadata without a cooler tile.

The count screen search now finds and filters existing counted items as well as
catalog items, with visible match counts, no-match copy and Clear search. A new
catalog editor remains mounted through its first saved digits so the phone
keyboard can finish a decimal; it is never duplicated in the captured list.
Shelf navigation clears the search. Case stepper inputs have a reserved 72px
width so the number cannot collapse between their plus/minus controls.

The liquor walk requests its own zone scope and omits the beer-only Walk In
Cooler, including a fallback for an older API. Saved rows and count history are
retained. Other coolers, including Beer Cooler (Produce), remain available.
Optional server quantity source words are visible on voice review. An unsafe
quantity cannot apply until a human enters it; choosing a bottle does not answer
that question. Clearing a voice quantity continues to hold the row, and source
ambiguity survives an additive case/loose merge.

Frozen case sizes survive typing zero, loose voice additions and adoption of an
unrelated save conflict. A fresh remote positive-case stamp still wins, and
restored identity-conflict endpoints keep their server metadata. Moving a
12-per-case count to a catalog 24-per-case bottle, entering zero then half a
case, continues to use 12 even if another phone changed a different bottle.

Scoped strict COGS TypeScript and the production build pass. Native Chromium
verification passes 36 scenarios and 90 assertions, plus 29 legacy voice
scenarios, with 13 regenerated screenshots. Browser checks use
synthetic inventory and intercepted requests; they do not claim a physical
Android count or transcription test.

## 2026-10-04 - Short factual kitchen answers are valid

Final hands-on review found that the three-character answer minimum prevented
the GM from answering a targeted question with "No", "32" or "1". Plain-text
answers now accept any nonempty trimmed text up to 4,000 characters. Whitespace
does not save. Manager review reasons retain their three-character minimum.
Each answer still saves as evidence awaiting recipe review; it does not change
ingredients or yield automatically. Real recipe-question emails stay paused.

Validation: all 48 native Chromium scenarios pass, including exact saves and
reopen for "No", "1" and "32", plus disabled blank/whitespace answers. Root's
independent eight actual-app checks and phone review pass. Strict COGS
TypeScript and the complete Astro/Vercel production build pass at 10:07am
Chicago. The backend ships its answer/API constraint change in forward
migration 0216; deployed 0215 remains unchanged.
## 2026-10-05 — Food inventory speech, review and corrections

Jon requested the liquor inventory improvements for food and authorized shipping after an independent GPT Astra Ultra audit. Food speech now requires product-attached quantity/unit evidence; unanswered counts remain unanswered. Food case-only, weight and confirmed package rules remain specific to food.

The count screen searches existing shelf rows as well as catalog additions. Review Details show each recorded shelf, frozen case/pack arithmetic and contributing spoken excerpts, and allow quantity and identity corrections. Incompatible food units require a fresh destination amount. Occupied or concurrently changed correction destinations require an explicit decision. Location membership changes follow a successful count save.

Count changes invalidate the check, and submission keeps the fingerprint actually checked. Blank/zero edits retain frozen package multipliers through unrelated conflicts; fresh remote metadata still wins. Fractions multiply before rounding totals, invalid inputs remain unresolved, and repeated speech additions preserve a bounded source trail.

The shared food/liquor recorder reports failed clips as boundaries. Successful speech on either side is reviewed separately, and a joined transcript containing a missing clip cannot be retried as continuous speech. Quantity-first food sentences stay attached to their following product.

Food voice protocol version 3 requires the updated numeric review controls. An older open screen receives a refresh instruction before food extraction; it cannot bypass the new quantity questions through the old unit chooser. Publish backend before Website.

Astra's final candidate review found that one quantity box could release an unverified model value in the other. Held quantities now require independent Cases and Loose answers; explicit case-only entry replaces the entire quantity. Product/unit changes reopen numeric confirmation for originally uncertain rows. Unresolved identity overrides an accidental API match and remains blocked until an explicit product pick. Duplicate-source rows explain the reused evidence and require a separate human count before applying.

Ambiguous food saves use a bounded readback of the exact draft, quantities, package memos and source fields. Only an exact match advances the save fingerprint and any shelf-list change; unavailable or mismatched reads leave a visible, usable retry. Explicit saves cancel the pending debounce timer.

Validation: 59 native food scenarios, 77 assertions and 20 reviewed screenshots; 80 food and 33 liquor DOM voice scenarios; 23 carry, 4 generation, 4 recovery, 18 lifecycle, 9 interval, 3 pause, 18 deadline, 7 draft-sync and 2 mobile guard checks. Strict COGS TypeScript and the full Astro production build pass. Release proof and final Astra Ultra review are recorded in Alcohol Pricing `incidents/2026-10-05/food-inventory-review/`. Physical headset/microphone recognition accuracy still requires field validation; synthetic fixtures do not measure it.

## 2026-10-06 - Voice review keeps bottle matches visible and editable

Jon's liquor retest displayed correct heard quantities but omitted matched-bottle pills and manual product choices. The initial review plus GPT-6 Astra ultra confirmed that quantity questions hid already-selected bottles, and the old matched-pill edit action never rendered its search. Jon authorized fixing and shipping the liquor and related food source-boundary regressions.

The selected bottle now stays visible during quantity, case-size, history and recount questions. Its pill and an explicit Change bottle action open a working catalog search. Ambiguous and unmatched rows also offer Find bottle, including when every suggested candidate is wrong. Candidate selection stays visible and editable. Search supports names, sizes, accents and stored aliases, with a no-results message and Cancel.

Product changes retain unresolved quantity questions and recompute the selected bottle's case-size, name-number, history and earlier-take checks. Recount/More answers belong to their original product, and changing or removing an earlier row recomputes later rows' questions and history totals. Only ready quantities gain the green treatment; the heard quantity words stay visible. The backend separately proves complete neighboring product/count boundaries for both liquor and food, preserving their different quantity/unit policies and unsafe-source holds. Existing landing/invoice changes on current main are preserved.

Validation: 45 liquor DOM scenarios, including twelve product-control/ordered-recount regressions, six new native Chromium scenarios at 320/412px, strict COGS types and the complete production build pass. Native checks use fictional inventory, verify alias-based correction and its saved shelf/quantity, block external traffic, and retain four visually inspected screenshots. Four source-guard/DTO-to-actual-component cases verify normal decimal lists, quantity-first sentences, cases plus loose quantities and a held unsafe count. Existing native regression checks, final Astra review, isolated backend CI and public deployment verification are recorded with the release in Alcohol Pricing `incidents/2026-10-06/voice-matching-review/`. These checks do not measure physical microphone/Android recognition accuracy.

## 2026-10-06 - Green means matched; compact voice review and whole bottle names

Jon's next field test confirmed the products matched, but the neutral pills made them look unmatched. His explicit ruling supersedes the earlier ready-only green treatment: green means the bottle is matched. The selected green pill remains the bottle-change control. The redundant Change bottle button, Heard quantity line and blanket Check the heard number instruction are removed. Ordinary rows show the spoken phrase, one quantity box and the green bottle pill. Specific case-size, name-number, history and recount decisions remain.

An unproved model quantity stays blocked and appears as an empty Qty field, rather than displaying a guessed one. Entering a quantity remains required for that row. Source-proved zero displays zero and saves the observed empty count. Product selection still cannot certify a held number.

The saved Step Shelf take ended its first successful clip with Indigo, gin, and its next successful clip said Point six. The prior carry emitted Indigo before that quantity arrived. Liquor carry now retains adjacent uncounted name phrases until their count arrives, without crossing a preceding completed quantity or a failed clip. Food's separate splitter already handled this pattern. The stored text establishes .6 rather than the displayed one; it does not establish the physical speech was .7.

The backend separately repairs source product spans for abbreviated catalog names and approved aliases, including Luxardo Original, Dos Hombres Mezcal and Indigo Gin. Final independent Astra ultra review, focused/isolated CI and public release verification are recorded in Alcohol Pricing incidents/2026-10-06/voice-matching-review/.
Validation: 50 actual liquor DOM scenarios, 6 native phone scenarios, 36 existing native liquor scenarios with 90 assertions, 26 carry rules, 13 actual recorder/carry/API scenarios, 80 food voice DOM scenarios, strict COGS TypeScript and the complete production build pass. Five actual source-guard/DTO-to-React scenarios verify the compact screen, blocked unsafe quantities and joined mezcal/Indigo .3/.6. Independent Astra ultra UI/carry checks found no remaining issue; backend and exact public revision proofs are retained with the follow-up release.

## 2026-10-06 - Show the food case contents during voice review

Jon's Pizza Line retest matched three cases of pizza sauce, but the review did not show the six cans inside each case. Food voice review now displays the catalog conversion beneath the existing amount: `3 cases × 6 cans = 18 cans`. The editable amount stays in cases. Fractional and default case counts use the same conversion; mixed counts include the converted loose amount in the total. Changing the amount or product recomputes the display from the current review calculation.

The breakdown uses the current catalog unit label and known case size. Held quantities, unresolved products or conversions, and catalog conflicts do not show a definitive total. Products whose inventory unit is itself a case do not show a cases-of-cases calculation. This is a display change; the existing canonical quantity, case-size provenance and save behavior remain in place. Validation and public release evidence are retained in Alcohol Pricing `incidents/2026-10-06/food-case-breakdown/`.

Validation: nine focused actual-app DOM scenarios, four native Chromium scenarios at 320/412px with sixteen assertions and six screenshots, strict COGS TypeScript and the complete production build pass. The native test edits three cases to two, updates eighteen cans to twelve and verifies the exact save; mixed case/package counts convert loose units once and save the displayed total. Independent GPT-6 Astra ultra review passes twenty-four additional actual-row render cases with no open P1/P2 findings. Fixtures use fictional inventory and intercepted APIs; these checks do not measure physical microphone recognition.

## 2026-10-06 - Audit the complete food walk before the next inventory

After two difficult field attempts, Jon requested a broader review of food versus liquor: speech, matching, measurement units, review UI and the complete saved count. The audit uses a read-only snapshot of all twelve current food shelves and 196 eligible catalog items, with 141 current human-confirmed counting definitions. It tests ordinary spoken names and aliases, not just supplier catalog names or prior examples. Findings and release evidence are kept in Alcohol Pricing `incidents/2026-10-06/food-readiness-audit/`.

Food's manual product lookup now uses aliases and normalizes accents and punctuation, consistently in voice review, shelf search and count correction. Stored `Black Olives` can find `Olives, Ripe, Sliced`, and accented `jalapeño` can find a plain-spelled catalog entry. The backend also exposes its approved food vocabulary, including `instant refried beans` and `Starry`, to the catalog DTO. Selected products and held quantities retain their separate review decisions.

Changing an already-selected product's implicit physical basis now clears the amount and asks for a fresh count, including amounts previously promoted to cases by product policy. Genuine explicit cases and equivalent supported units retain their meaning. Unapproved container words cannot bypass a current human-confirmed physical definition. Held model amounts no longer contribute to later rows' high-count warnings. Detected source omissions appear as separate matched/choice rows with blank amounts and a specific instruction to enter the count; product selection cannot certify their quantities. Food voice protocol 4 requires old clients to refresh before using the updated unit authority.

Fresh cells now use a current definition's confirmed case mapping when the catalog UPC is absent, including chocolate syrup's 24-bottle case. Existing cells keep their original case-size stamp. Canonical cases, stale definitions and conflicting positive UPC mappings remain guarded. Voice review, grid entry, corrections and location answers share the same rule.

Food now shows the resumed-count notice and Start a new count action already familiar from liquor. It saves and drains the old draft before creating the new count, preserves the old session's history, resets count-scoped review/correction/carry state and keeps a failed save or creation retryable. Recording, pending voice review, checking, submission and uncertain-submit recovery prevent a fresh switch. The mobile keyboard handler centers the focused input between the pinned shelf and footer, including tall voice and precheck rows and leaving-shelf sheets.

Validation: 28 focused actual-food-UI scenarios, 27 native Chromium scenarios at 320/390/412px and six fresh-session lifecycle scenarios pass. They cover raw/default/partial cases, mixed loose counts, mapped case-size save/reopen, all thirteen genuinely unknown case sizes, physical-basis product corrections, omitted-source quantity holds, aliases and keyboard visibility. The existing 105 food voice DOM scenarios and 59 native lifecycle scenarios with 77 assertions also pass against the frozen source, including save failures, retry/readback, concurrent edits, stale checks and uncertain submission. Strict COGS types, the four required prebuild checks and the production build pass. These fixtures intercept recording and APIs; they do not measure physical microphone recognition or replace the separate isolated backend route CI proof.

## 2026-10-07 — Compact food voice cards and explicit location selection

Jon's seated food-count tests succeeded, but each voice row used too much empty space and the arrow-based shelf header hid the available kitchen locations. Food now has a labelled, full-width Count location dropdown with every active food location, while retaining the pinned location and count progress. Voice cards use tighter spacing and put Count another way and Discard item side by side with 44px touch targets. Green product matches, editable spoken quantities and known case-content totals remain prominent.

The same test exposed a missing-items warning bypass: selecting another location before adding the current voice results moved the screen first, so adding the original location's items never ran its leaving check. Location changes now wait for the current review to finish, show the requested destination with a Stay here cancellation, and run the ordinary missing-items check against the original location's updated counts. Partial Add waits for the remaining rows; discarded untouched locations retain the final-count warning. Failed transcripts also stay in their original location until retried or explicitly discarded. Recording and processing pin the location. The leaving dialog makes background controls inert, and alternate finding jumps cannot bypass pending review or retry work.

Validation: 14 focused navigation cases, 8 compact-row DOM cases, 15 native phone cases at 320/390/412px, the existing 105 food voice cases, 20 location-walk cases and 59 native food review cases with 77 assertions pass. Representative case cards shrink by 64px without reducing touch targets. Strict COGS types and the four prebuild checks plus production Astro build pass. Independent GPT-6 Astra Ultra review and exact public release evidence are retained in Alcohol Pricing `incidents/2026-10-07/food-ui-followup/`. Tests use fictional inventory and intercepted recorder/API responses; no production count or catalog data changes are part of this release.

## 2026-10-07 — Visible voice processing and field transcript follow-up

Jon's next seated test exposed Orange Crush and blue cotton candy without product choices and a matched Diet Pepsi with its spoken one held blank. Read-only saved-source replays locate these failures in backend source ownership: an unknown neighboring product could consume the prior count boundary, and a final list item introduced by “and” was treated as a possible mixed-count continuation. The backend repair and shorter approved blue cotton candy alias retain the existing uncertain-source holds. No client override converts a held model amount into an accepted count.

Both food and liquor now show a shared, pinned Processing your recording panel from the end of microphone capture through matching. It names the original count location, explains the active phase, and animates an indeterminate bar without invented percentages or time estimates. Reduced-motion users receive a static indicator. The recorder exposes actual capture separately from its longer pending-upload lifetime, so manual Stop, automatic stops and device errors no longer leave a live microphone meter or Stop overlay covering the processing state. Recording, processing, review and save guards retain their original lifetimes.

Source replays, native phone layouts, recorder lifecycle tests, independent GPT-6 Astra Ultra review and release evidence are retained in Alcohol Pricing `incidents/2026-10-07/food-voice-field-followup/`. Intercepted API/recorder fixtures do not measure physical microphone accuracy. Historical model extraction responses were not stored; the incident distinguishes exact saved transcripts from controlled extraction responses.

Validation: 105 food and 50 liquor voice scenarios, 15 capture-state scenarios, 18 native recorder lifecycle scenarios, 4 generation controls and 12 native processing scenarios at 320/390/412px pass. Strict COGS TypeScript, all four prebuild checks and the production build pass. Astra independently cleared 112 backend source cases, 8 actual-view processing scenarios, the 15 capture controls and representative native screenshots with no remaining P1/P2 findings.

## 2026-10-07 — Choose whether to continue an unfinished count

Jon requested an explicit choice when opening Count food or Count liquor after PIN login, so seated test quantities are not silently resumed as a real kitchen count. Both walks now show an Unfinished count page with its start date, saved-entry count, Continue count, Start new count and Back. The choice appears for every existing draft, including an empty one; when no draft exists, opening the walk creates a new count as before.

An existing draft remains a pending snapshot with no active session or autosave until Continue. Continue restores its exact lines, package stamps, liquor batches and remembered location. Starting new creates a separate empty session in the same section, protected from duplicate taps; it does not save, clear, submit or delete the old snapshot. A failed creation leaves Continue and retry available. The copy does not promise that older drafts appear in submitted-count history.

The entry lookup opts into the backend's includeOlder query so yesterday's unsubmitted draft is eligible beyond the previous sixteen-hour cutoff. Actor, food/liquor, full-count and draft-state boundaries remain enforced; other callers retain the default cutoff. Backend support must deploy before this Website release. Focused actual-component/native tests, independent Astra Ultra review and release proof are retained in Alcohol Pricing `incidents/2026-10-07/count-entry-choice/`.

Validation: 21 focused actual-view cases, 6 native phone flows at 320/390/412px, 21 independent Astra entry probes, the existing 105 food and 50 liquor voice cases, strict COGS types and all prebuild/production-build checks pass. Continue/New/Back consume one synchronous entry decision, including stale same-frame clicks; only a failed New releases the choice for retry. Both primary choices fit initially at 320×568; Back is reachable by ordinary page scrolling. Backend age/ownership/section/state checks are verified separately in isolated route CI.

## 2026-10-07 — Resolve a voice question against an existing food count

The GM's Pizza Line count correctly saved one case plus one bag of refried beans, seven bags total, while two shortened voice questions remained above it. Exact saved source and controlled extraction replays reproduce this when one mixed count is split into partial provider rows. Historical provider responses were not retained, so the replay explains a supported failure path rather than proving the original response shape. The backend coalesces only source-proven components of a unique mixed occurrence, retaining a ready complete row or one held full-source question. Repeated physical counts and ambiguous source evidence stay separate.

Held food voice cards now offer Use count already entered when that same location contains an eligible count. The user explicitly chooses a product and its displayed total; this clears only that question and never adds to or rewrites the saved amount. Search uses the existing food aliases. A changed total, different session or location, conflicting count or consumed review row cannot accept a stale choice. Other pending questions remain visible. There is no automatic reconciliation by product name or equal quantity.

Focused actual-view/native checks, independent GPT-6 Astra Ultra review and release evidence are retained in Alcohol Pricing `incidents/2026-10-07/beans-review-recovery/`. Fixtures use intercepted APIs and fictional counts; the GM's production count is not modified by this release.

Validation: eleven recovery scenarios, four backend-source-to-UI/save scenarios, three native phone flows at 320/390/412px, nine independent Astra actual-view probes and twenty independent source cases pass. Existing food/liquor regressions pass 105/50 scenarios, strict types and the four prebuild checks plus production build pass. Isolated backend CI passes 5,977 tests across 375 files. Native checks preserve the seven-bag count byte for byte with no line-save request when only clearing questions; explicit grid edits and separate spoken counts still save normally.

## 2026-10-07 — Count flatbreads and cauliflower crusts individually by default

Jon explicitly changed the earlier cases-only policy after the GM said twelve flatbreads and saw a blank Cases field with a twelve-case warning. Both flatbreads and cauliflower crusts now default to their individual physical units; explicitly spoken cases retain the confirmed case conversion. Case and loose quantities can be entered together using the ordinary food controls. This supersedes the earlier product-name exceptions in voice review, the count grid, shelf answers and count corrections. Existing saved amounts and their package stamps keep their original meaning.

Large-count and case-overlap warnings now wait until the quantity and unit are resolved. An unconfirmed hidden model amount cannot produce a Keep as entered action while its input is blank. Plausibility asks for confirmation and does not silently choose a unit. Catalog-definition updates are scoped to flatbreads, cauliflower crusts and Rich's pizza dough; other food defaults, including vegetable cauliflower heads, remain governed by their own confirmed definitions. Validation and release evidence are retained in Alcohol Pricing `incidents/2026-10-07/food-individual-defaults/`.

Jon also confirmed Rich's 14-inch pizza dough contains twenty individual dough shells per case. Its shell vocabulary converts against the existing case-based catalog quantity without rebasing historical amounts. A separate recovery bug re-held a manually confirmed number whenever the user selected its unit: typing 0.8 and then choosing cases erased the visible amount. Unit selection now preserves a completed human quantity answer. Selecting a unit alone still cannot certify held model numbers, and changing the product's physical counting basis still requires a new answer.

The GM's saved Beverage Line transcript also reproduced a client carry bug: the 24 in Twenty four ounce cups was treated as an inventory count, so the following point nine moved into the extraction request for Lids. Food carry now distinguishes bounded package-size and product-dimension descriptions from counts, retaining the cup name and its quantity together. Real weights, separately spoken counts, failed-transcription barriers and liquor carry keep their existing behavior. Food voice protocol 5 requires the compatible client before the three catalog definitions are activated; backend support and scoped metadata deploy before this Website release.

Frontend validation passes 105 food and 50 liquor voice scenarios, 15 focused actual-view controls, seven native phone flows, 59 native count-review scenarios and 29 pause/carry rule checks. Independent Astra Ultra checks cover the conversion arithmetic, human quantity answers, historical package stamps and exact cup carry partition. Strict COGS types, the four repository prebuild checks and production build pass. All test sessions use intercepted APIs; they do not alter the GM's saved inventory.

## 2026-10-07 — Prevent related food counting failures across the catalog

Jon requested a broader preventive audit using the recent field failures as examples. The audit exercises all current food products and approved vocabulary through quantity placement, explicit packages, dimensions, review choices and saved totals. It separates legitimate product/conversion questions from preventable matching failures, lost answers and incorrect ready amounts. No unconfirmed physical conversions or new default-unit policies are inferred.

The first cross-layer discrepancy was plural bundles: the API normalized it to bundle but the browser did not, causing an unnecessary conversion question for confirmed bundle-counted products. Both now agree. A reusable count-definition contract check loads the actual browser/API modules, compares the union of their unit vocabularies and optionally tests an entire catalog, including deliberately invalidated physical definitions. Existing QA documentation has been corrected to reflect the approved individual flatbread/crust policy.

The UI audit reproduced the earlier cup pause failure with other catalog dimensions, including 120 slices / 5 lb cheese packs and 16.9 oz water. Food carry now uses bounded catalog name spans to distinguish those descriptors from inventory numbers, keeping quantities outside the name with their item. The liquor splitter and failed-transcription barriers retain their separate behavior. Same-product reselection preserves a human-entered package factor; pure unit choices preserve already confirmed components of a mixed count while the remaining model component stays unresolved.

The API separately holds explicitly conflicting package dimensions and binds a measured alias to its own size. These checks do not change catalog units or invent conversions. The static metadata audit found 141 current definitions among 196 products, with no inconsistent saved case factors; fourteen products still lack a confirmed physical case size. Individual Slider Buns exposed a separate precision limit (1/192 case stored at thousandths), which is recorded for a persistence/valuation follow-up rather than silently changing the SKU's historical basis. Full evidence is in Alcohol Pricing `incidents/2026-10-07/food-catalog-prevention/`.

Validation includes 105 food and 50 liquor regression scenarios, 59 native review scenarios, four focused mobile answer-order flows, and five actual source/request/API/review/save/reopen examples. A tracked prevention suite covers 196 catalog names in 784 partitions plus targeted interaction controls. The final native check also suppresses held model numbers in conversion hints while retaining the package-change action. GPT-6 Astra Ultra independently passed 154 backend/carry/actual-view checks and inspected final screenshots. Strict types, repository prebuild checks and production build pass; no live inventory or metadata was written by these tests.

## 2026-10-07 — Upload and review food waste logs

Jon requested a staff Waste Log under COGS for photographs already taken on a phone or tablet. The scope is food and non-alcoholic drinks, including purchased products and prepared menu items. Waste is recorded separately from physical inventory: it explains product loss already captured by the closing count and never subtracts stock or COGS again. The percentage uses logged waste cost divided by food/NA sales for the same inventory period; unavailable costs or an unfinished sales period remain explicit rather than appearing as zero.

The implementation uses a gallery-first multiple-photo selection, private staged pages and an actor-owned processing/review draft. Staff review source rows, product or recipe choices, amounts, physical units and dates, add omissions or discard non-entries, then post once. The existing photo preparation helper is shared unchanged with invoice upload; invoice endpoints and grouping remain separate. The completed flow offers Count food through the existing Continue/Start new choice without creating or resetting a count automatically. Period selection, reviewed valuation, history and reasoned voiding are supplied by the food-waste API contract. Implementation and release evidence are retained in Alcohol Pricing `incidents/2026-10-07/waste-log-upload/`.

All photos receive one explicit review confirmation, including logs with no reader warnings. Prepared sizes are mutually exclusive; ingredient changes remain independent. Human amounts survive unit and product selection, saving during later edits, and refresh of the same draft revision. Changed prices, recipes or counting definitions require a fresh unchecked server preview before posting again. Intentional photo removal and repeated photo selection cannot trap upload recovery. Posted and voided logs retain read-only source entries and cost details; a new log preserves the earlier saved draft.

Frontend validation passes 30 actual React scenarios and six native Chromium flows with 35 assertions at 320 and 412 pixels, using production theme tokens and local fonts. These checks include the unchanged invoice photo-staging contract, JPEG compression, retry/lost-response paths, explicit source acknowledgement, raw fractional quantities, prepared choices, period attribution, unpriced values, idempotent posting and reasoned void recovery. All fixture records are synthetic; no paid provider, live inventory, purchase or metadata writes occur. Strict COGS types pass; the release owner runs the final repository build and the backend separately verifies real valuation and ledger transactions.

## 2026-10-07 — Ask about waste before entering food inventory

Jon requested a reminder when staff begin food inventory so a waste sheet is easy to upload first. Food entry now asks whether the waste log has been uploaded, with Upload waste log, Already uploaded and No waste to upload choices plus Home. The reminder appears before the count view mounts, including a food-count deep link after PIN login, so it cannot create or edit a count before the staff choice. Upload opens the Waste Log; either skip answer proceeds to the existing Continue/Start new choice.

The posted Waste Log's Count food action bypasses this reminder for that immediate handoff. The answer remains in memory only and resets on Home, logout, authentication bootstrap and another Home-to-food entry. Shelf changes within a count do not repeat the question. Liquor inventory and links to historical count details retain their existing routing.

Twelve focused actual-app React scenarios pass, including saved quantity preservation, empty new food counts, Home cancellation/re-entry, upload routing, the posted-log handoff, authenticated/PIN deep links and the unchanged liquor entry. The 320-pixel native check uses production fonts and theme: all four choices fit initially with touch targets of at least 44 pixels, and tapping Upload reaches the gallery with no count API calls. Strict COGS types pass. Synthetic fixture evidence is retained in Alcohol Pricing `incidents/2026-10-07/waste-log-upload/ui-entry-*` and `native-entry/`; the release owner runs the final build.

## 2026-10-08 — Preserve individual food quantities and complete known names

Jon authorized the two software repairs left by the food audit: individual Slider Bun precision and the 32 known wording holds across five catalog products. The existing approved 192-bun case conversion is retained; neither catalog units nor historical counts are rebased. Food protocol 6 carries the actual entered physical amounts with frozen exact conversion ratios, separate from any unexplained legacy canonical remainder and the existing case/pack stamps. Different frozen factors remain separate; historical residuals are never reconstructed from raw speech or the current definition. Food arithmetic and save/resume paths retain this information instead of rounding canonical cases to thousandths. Liquor's quantity rounding remains unchanged.

The API exposes approved exact unit ratios and owns precise canonical persistence and report arithmetic. A manually reviewed conversion with no approved catalog ratio remains a precise canonical residual, preserving its existing count workflow without claiming an unapproved factor. Product correction cannot carry a physical component into an incompatible product's conversion. The wording repair keeps complete catalog names/aliases and separately spoken counts together while retaining unknown qualifier, contradictory package and repeated-source protections. Implementation and validation evidence are maintained in Alcohol Pricing `incidents/2026-10-08/food-precision-wording/`.

## 2026-10-09 — Keep leading liquor quantities with their product

The GM's new Backstock Room recording exposed a client request boundary: `One bottle, Don Julio Anejo` was sent as a quantity-only suffix followed by a separate product-only request. Liquor carry now distinguishes pure counts that finish a prior uncounted name from counts that lead a following product. Leading decimals, case counts and comma-separated names stay together; an already counted prior item retains its complete source. Name-before-quantity behavior, held-text limits and failed-clip isolation retain their existing contracts.

Focused actual CountLiquor request, backend DTO and review/save evidence is retained in Alcohol Pricing `incidents/2026-10-09/liquor-mixed-count-followup/`. The retained transcript says `to Captain Morgan`; replay provider rows are controlled fixtures because historical extraction responses were not retained. Tests do not rewrite the GM's active draft or certify an ambiguous source count.

Validation: 33 tracked pause/carry checks, the existing 50 actual liquor voice scenarios, eight focused source/request/DTO/React/save flows, strict COGS TypeScript and the four prebuild checks plus production build pass. Independent GPT-6 Astra Ultra review passes 25 carry controls, including numeric brands, preposed integer/decimal sizes, prefix counts and failed boundaries. Pending voice review remains in memory; staff must apply intended results and wait for Saved before reloading to obtain the frontend fix, then Continue count restores the saved inventory.

## 2026-10-09 — Preserve separate liquor source questions during review

The post-release audit found that the browser merged adjacent liquor API rows again after the backend had deliberately separated them. A held loose quantity next to a proved case count became one blank row, preventing the proved case from being applied independently. A duplicate provider row marked source already used could also replace its valid neighbor as an apparent correction. Browser merging now follows the same source-owner boundary as the API: unresolved mixed components and reused source questions remain separate; proved mixed arithmetic and ordinary same-unit corrections retain their existing policy.

Actual extractor DTO, recorder/request and React/save controls are retained in Alcohol Pricing `incidents/2026-10-09/liquor-mixed-count-followup/client-merge-*`. Tests use simulated provider rows with no network or live count writes and preserve the initial failure evidence. A related history control confirmed that an earlier held model amount of 999 could still block the separated, proved case count; history totals now omit source-held earlier quantities. Known earlier counts, completed human answers and genuinely high totals retain their plausibility check. This is a downstream merge repair, not evidence that the GM's historical extractor returned these controlled shapes.

## 2026-10-09 — Held liquor numbers stay in the box; leading-count split narrowed

Jon's rulings, today. (1) "Number in box, counts ready." When the API cannot re-prove a model quantity, the review row shows the model's number in the Qty box with an amber edge and no warning text, and the normal Add button saves it. This replaces the blank box from 5c4f948 (10/6), which was an agent design choice, not his ruling. On 10/6 he had called the verify warning screen waste: "Whatever it thinks it heard is going to be in the box ... We are aware that it might mess up every now and again." These stay blank and need a typed number, because a prefill could save a wrong number as ready: a reused source (the API's source already used, or a held row that is part of or repeats another row of the same bottle in the take, which the API flags only when the proved row came first), a lone number that may be the bottle's size (`Ketel One 0.75`, `Tanqueray 750`: the API asks for size and count but sends no reason, so the Website mirrors its rule, and picking the 750 does not make 0.75 a count), and a held zero. Every other question still asks: no match or Which one?, case size, pre-multiplied cases, name number, history and recount. Typing a number clears the amber edge. A prefilled number counts toward later history totals, because Add saves it. (2) Ship the Website today and the backend as a PR next.

341efa1 (the leading-count split above) is reverted. It cut name-first counts between a name and its number, stranding 10 pairs in 4 earlier takes, for example `Golden Falernum,` | `point three five.`. Earlier revisions strand no name-first pair. The plain revert reopened 341efa1's count-first case: `One bottle,` | `Don Julio Anejo.` (b29e5983) went out apart and the name alone proved an implicit one, right only because the count was one. A narrow rule replaces the split: a pure count that starts a sentence, after an item that already has its count, waits with the next name (`One case, Morgan. Two bottles, Don Julio Anejo.`). After `Name, number` the number still finishes that name. Over the 36 retained takes it changes only b29e5983, back to the split 341efa1 sent. Its entry stays as history. The 6bf3aa0 merge boundary is kept. The accepted risk is the 10/5 one: an unproved wrong number saves unless someone notices the amber. Root cause: Alcohol Pricing `incidents/2026-10-09/liquor-root-cause/`. The guard held 119 of 272 real rows, and 110 of those were right.

Validation: 74 liquor voice DOM scenarios pass. They include take 269e7c90 through the carry with its captured Sonnet 5.5 DTO: 7 ready and 1 Which one?, the pick keeps 0.8, and Add saves exactly the shown numbers. Five fail on the first prefill commit: a held 0.75 or 750 after the 750 pick, a matched 1.75 L at 1.75, a held copy before its full row (saved 26 for 14) and two held copies. A replay of the 36 retained takes with captured Sonnet 5.5 rows through the frozen live and candidate backends shows the same screens and saves as before these review fixes, apart from b29e5983's split; no real row loses its number. Also passing: 33 carry checks (name-first takes, count-first counts, the size and copy rules), 36 native review and 6 native phone scenarios at 320/412px, strict COGS types, the four prebuild checks and the production build. The native harnesses and mobile guards now tap Continue count past the 10/7 resume prompt. check-ui and check-count-phone-layout still stop there, as they do on 6bf3aa0.

## 2026-10-09 — Food voice split: corrections, "and" and count-first counts stay with their item

Jon approved the food voice fix list from the 10/9 food review on 2026-10-09 (Alcohol Pricing `incidents/2026-10-09/food-voice-review/`, findings 3, 5, 6 and 11). The food request splitter (`voiceCarry.ts`, `createFoodCarrySplitter` / `splitFoodTailWithNames`, food path only) now:

- keeps a spoken correction with the item it corrects and never lets it lead the next item: `Jalapenos, one case. No. Half of a case.` goes as one request, and so do "sorry", "wait", "I mean", "make that", "scratch that" and "actually". On 10/3 the correction led `Bananas eighteen.` and the first number (6 cans for 3) was ready. The server holds a correction it can see; the paired backend change makes the last count win.
- never moves an orphan number onto an item that already has its own (`Pizza sauce, three cases. Two cans.` keeps its two cans). A product still waiting for its number keeps taking the orphan count before it, as before.
- sends a held item that opens with "and", "plus" or "also" together with the item before it (`Fry seasoning, one container, and one Diet Pepsi.`). The "and" is neither stripped (that would certify items #365 deliberately holds) nor left at the end of the earlier request. With the captured 10/7 model rows, the joined request proves the Diet Pepsi that was never saved on 10/7.
- keeps a count-first comma with the name after it (`Two cases, sausage.`), as liquor's leadsNextName does: at the start, or after an item that has its number. After a name still waiting for its number, the count finishes that name.
- does not read a size inside a name as a finished count at a cut (`Two ounce patties`, `Fourteen inch dough`, `Third pound patties`, `Thirty three gallon trash bags`). Real weights stay counts (`Pepperoni, three pounds`, `two five pound bags`).
- treats "Alright.", "Hello?" and "um" as filler, not products.

Liquor's splitter (`splitUnfinished`, `leadsNextName`) is untouched. The 36 retained liquor takes, and every food corpus put through the liquor splitter, split byte-identically before and after. Of the 26 real food takes, 3 split differently, each on purpose: 6e88b59d (the jalapeño correction), 90cb6dd1 (`Pizza Dough. Oh, wait.` is one request) and 6dfb506f (the Diet Pepsi goes with the fry seasoning). Of the 30 synthetic stress takes, 3 change the same ways. Comparison: Alcohol Pricing `incidents/2026-10-09/food-voice-review/followups/website/split-compare-resume.*`.

Validation: 41 pause/carry checks (33 before), now including all 26 real food takes and the review's correction, "and", count-first, second-number and size cases; the 12 catalog prevention scenarios (784 partitions) and the 74 liquor voice DOM scenarios pass unchanged.

## 2026-10-09 — Food voice: Reload an out-of-date page; ask "add or replace" for a recounted product

Jon's rulings, 2026-10-09: he approved the food voice fix list from the 10/9 food review, and for a re-recorded shelf: "Ask: add or replace."

**Out-of-date page (finding 12).** A phone tab left open from 10/7 sent `foodUnitsVersion` 4, and TPRS refused every piece of a take (409 `voice_update_required`), which the counter only learned after saying the whole shelf. Now the first refused piece stops the take, and the fixed footer says "This page is out of date. Reload it to keep counting. Counts already saved stay saved." with a Reload page button. The Talk button reads "Reload the page to record" and stays off, and there is no Retry, since retrying from this page can never work. A save refused the same way (409 `refresh_required`) shows the same footer instead of Retry save, and Finish/Submit say to reload. Reload is a tap, not automatic: heard rows and unsaved typing live only on this page, so the footer names them first, typing still on the save timer is tried at once, and Reload waits for it. The page remembers the shelf, so Continue count reopens there.

**Add or replace (finding 7).** A re-recorded shelf added both takes into one cell (draft 81309ef9: pizza sauce 41 from two takes of about 26). A heard row for a product the take's shelf already holds, from an earlier take or an earlier row of the same review, now asks "Add to the N already here, or replace?" with Add: total and Replace: amount chips, and is not added until answered. Liquor's existing recount question asks only across takes; food also asks for a repeat inside one review, per the ruling. Replace makes the row's amount the shelf's count of the product (the earlier take's cell, or this review's earlier rows, go first). The answer is pinned to the N it answered, so a changed earlier row or product asks again, and Change reopens it. Amounts read in the row's own unit (`3 buns`, not `0.016 cases`). The question is per shelf: the same product on another shelf does not ask. A zero over a counted shelf asks too, and Replace saves the zero.

Validation: 114 food voice DOM scenarios (105 before; nine new: the stopped take and Reload tap, pause cuts with a partial take, a refused save, add/replace across takes, a repeat in one review, Change, a pinned answer re-asked, a replaced zero, another shelf); every save body is intercepted and is exactly the chosen cell. Food precision 13 (one new Replace), food review 56 with the same 3 failures as 997963d, 74 liquor voice and 36 liquor review scenarios pass. Existing scenarios that summed a repeat now answer Add first.
