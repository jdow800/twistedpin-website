# Menu Selector changes

## 2026-11-02 - Short-notice catering policy (unpublished implementation draft)

Today is selectable before food. All future same-day starts can price and be submitted. Pizza & Pop separates short-notice full payment from staff approval; same-day automatic eligibility requires at least six hours at booking/link issuance. Other short-notice packages still need staff approval. Seasonal availability and public staff-email routing remain unchanged. Reviews refresh timing copy at the six-hour boundary, while selection snapshots and retry identities stay frozen. Full payment displays the total; the numeric deposit stays 50% estimate data. Validation and durable export accompany this draft; no publication yet.

## 2026-11-01 - Mobile space photos and price comparison

Jon approved shipping the mobile-first UX changes for review. VIP Suite and traditional lanes now show real photo thumbnails and explicit View photo controls. Photo viewing is separate from selecting a space, including the traditional-only path. The dialog has a visible close action, keyboard dismissal and focus return; selected cards have a continuous outline and pressed semantics.

The estimate compares two space cards at one shared two-/three-hour duration, using each option's existing API total. Photos, brief differences and prices come first; full source descriptions and booking/payment details remain available below. Explicit unavailable choices are never silently replaced. Valid current alternatives remain immediately selectable; old amounts are labeled as previous estimates. The traditional-price difference now uses the selected duration.

The smaller sticky footer directs guests to the first validated missing/invalid date, start time or food choice, including after a priced selection becomes stale. It focuses the matching control, preserves manual-quote and retry rules, and reserves space based on its actual height. Date/time controls have explicit labels; the time select no longer nests inside a button.

Pricing endpoints, canonical selection/request contracts, availability/capacity rules and public/linked/staff routes are unchanged. Sol Ultra's final source review found no release blockers after separating current response prices from an unavailable selected option, correcting narrow-screen price alignment, and counting requested outside-hours time among the required details. The selected option must still pass every existing freshness/amount guard before review or sending.

Validation: the unchanged 72-case baseline passed, followed by the complete final 86-case desktop/touch browser suite (14 new UX cases). All 68 contract checks, 21 retry assertions, 10 producer-response cases and 126 diagnostic assertions passed. check_app, the TypeScript/Vite production build and git diff --check passed; existing nonblocking Browserslist/chunk-size warnings remain. Real-photo/real-font layouts were reviewed at 320, 390 and 430px, landscape 844px and desktop 1280px. Visual checks use synthetic pricing and intercept workflows/beacons; no production submission, operational alert or customer message was sent.

## 2026-10-28 - Use the edge-supported diagnostic redirect mode

Post-settings live forwarding verification exposed a runtime compatibility issue: Zite's edge fetch accepts only manual/follow redirect modes. The endpoint still recorded its local diagnostic, but redirect:error prevented the operational collector call from completing. Use redirect:manual and retain rejection of every non-2xx response before reading a receipt. The exact trusted destination restriction, server-only secret, bounded receipt handling and two-second deadline are unchanged; redirect destinations never receive another request.

Regression coverage models the edge restriction and tests 301/302/303/307/308 responses, including accepted-looking bodies, as rejected transport receipts with one call to the trusted destination. Production collector verification follows publication; no live customer pricing or submission is used by these tests. Validation: the regression failed against the prior transport mode, then all 126 isolated diagnostic assertions passed. `check_app`, the production build, and `git diff --check` passed. The build retains the existing nonblocking Browserslist/chunk-size warnings.

## 2026-10-28 - Preserve selections and clarify headcount planning

Guest and quantity inputs now keep an editable draft until blur or Enter. Guest counts retain the existing five-person bands, round upward (61 becomes 65), and keep numeric 100 distinct from 100+. URL prefills use the same normalizer. A draft immediately invalidates old pricing; clicking Calculate commits headcount and dependent quantities together. The stepper handles touch blur without losing the tap. Rounding feedback is inline and follows the current count, including staff resets.

Guest-sized arcade cards and goodie bags follow headcount only until explicitly edited; manual quantities survive increases and clamp only when the headcount cap requires it. Explicit lane preferences and durations remain authoritative within existing capacity/hours rules. Essential-link Pizza & Pop stays selected during a current availability check, with an actionable retry on failure; a confirmed denial clears it, and Elevated links never show it. Calculate, Recalculate and Retry share readiness rules. An explicit three-hour event clears an incompatible start and explains the earlier-start requirement; unavailable priced options must be chosen explicitly instead of silently substituted.

Headcount helper copy uses Chicago calendar dates: no date gets planning guidance, 10+ days gets qualified seven-day finalization reassurance, and nine days or fewer gets staff-confirmation wording without a later-reduction promise. The existing Chicago midnight/focus/DST refresh updates that copy.

Client pricing diagnostics now use a tab-session identity retained across reloads and track operational recovery across changed configurations separately from the input-specific manual-quote retry count. Bounded, server-only forwarding can send validated reports to the configured operational monitor; diagnostics remain best effort and cannot block pricing or submission. Expected policy restrictions do not become operational recovery incidents. Release marker: builder-reliability-2026-10-28.

Accepted Sol Ultra follow-ups: an API success is not recovery until a usable current option is displayed; recovery records the actual selected/fallback lane and duration. Fresh option chips and Step controls use the same reporter, while stale response panels cannot report recovery. The forwarding transport inspects bounded collector receipts and logs limited/conflict/rejected/invalid receipt outcomes instead of treating every HTTP 200 as ingestion.

Validation: the complete 66-case desktop/touch browser suite passed before the recovery follow-ups. Those follow-ups passed 20 focused cases, then 10 focused cases after Step-control recovery was added. Four final UI checks passed for Step-control warning clearance and Chicago/date-sensitive helper copy. These are full and targeted runs, not a claim that the expanded 72-case suite was rerun in full. The 68 pricing/submission contract checks, 21 retry assertions, 10 producer-response cases and 101 diagnostic assertions passed. Final check_app reported no diagnostics/endpoint errors, and the production TypeScript/Vite build passed. Desktop/mobile duration and short-notice/advance-headcount layouts were visually checked with mocked assets. No real guest submission, tracking beacon, operational alert or customer message is replayed by these checks.

## 2026-10-27 - Accept the Website pricing response contract

Four evening diagnostic failures for E-0268540 were HTTP 200 responses rejected by the client. A read-only pricing call returned a valid 75-guest estimate, including string notices and string add-on items. The client incorrectly required objects for both. Align types, validation and rendering with the producer; also use the producer's `guests` field for optional neighbor choices. Leave neighbor requests disabled and preserve all API amounts and existing request/freshness/retry rules.

A captured response reproduces both independent failures. Regression checks cover the reported selections, malformed responses, nullable alternatives and neighbor invalidation. Diagnostic release marker: `pricing-response-2026-10-27`. GPT-6.1 Sol with Ultra reasoning reviewed the diagnosis and contract alignment. Final diff review found no blocking findings. Validation passed: 10 captured-response contract cases (red before the fix, green after), 36 isolated desktop/touch-mobile browser cases, 21 retry-state assertions, 68 pricing/submission contract checks, 34 diagnostic checks, check_app and the production TypeScript/Vite build. Desktop/mobile estimate layouts were visually checked. README documents the captured versus synthetic fixtures and reproduction commands.

Jon's later tests are staff reproductions, not evidence of guest recovery. No real guest submission or beacon is replayed. This fix does not change Website pricing, availability, Avery WF2 or the separate missing-estimate classification issue.

## 2026-10-27 - Retry pricing before offering a manual quote

Jon clarified that E-9234687's successful 12:01pm calculation was his reproduction, not evidence the guest recovered. The 11:59am submission recorded `estimate_unavailable`; the original browser error was not retained. The same configuration prices successfully now. Do not describe the guest as having received that later estimate.

An ordinary pricing failure now asks the guest to retry. The secondary team-quote action appears only after two consecutive eligible failures for the same pricing inputs. Successful pricing, changed inputs, and non-transient policy errors reset the count. Aborted and superseded requests do not count. More than 100 guests and outside-hours inquiries retain their existing direct manual route.

Best-effort `pricingDiagnostic` endpoint logs capture current failures and subsequent recovery with an attempt/session ID, timestamp, safe pricing selections, response status, error category/code and consecutive-failure count. Reports are marked client-supplied; they do not drive quoting, routing or alerts. No contact details, free text, raw exception messages or URLs are logged. Logging cannot delay or block estimates or submission. Optional request IDs are recorded only when exposed by the pricing server's CORS policy.

Authoring source is this Zite workspace repository. Tests use isolated browser traffic and mocked endpoint calls. No existing guest record or thread is replayed by release verification.

Validation: 28 isolated desktop/touch-mobile browser cases, 21 retry-state assertions, 68 existing pricing/submission contract checks and 34 diagnostic/schema/mock-runtime checks passed. check_app and the production TypeScript/Vite build passed. Read-only review found no remaining blockers after handling malformed successful responses, option notices and policy-error messages. Error-state layouts were visually checked. External requests in browser tests are intercepted; no real guest submission or Calculate beacon is created.
