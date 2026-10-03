# COGS mobile audit integration, October 3, 2026

Reconciled the unpublished October 2 Website commits `26559f6` (UI/QA) and
`043b0e1` (gallery) in an isolated worktree off fetched main
`307caa5773a6feda3e26cdc4bc0ff0b6a79a6cd6`. The original audit handoff and
October 2 dated Decisions entry are preserved verbatim. Its source worktrees
and Alcohol Pricing incident evidence remain in place.

Current scope: Android, phone microphone only. The October 2 headset notes are
historical evidence. This run uses synthetic stock, recordings and HTTP
responses, with external requests blocked. No real recording, inventory write,
report email, paid speech/extraction call or provider credential is used.

## Combined behavior

- Larger labelled case/loose controls, clean fractional display, short review
  questions, clearer errors and recipe/pour-cost navigation from the old audit.
- Food Review N heard scrolls to unresolved items; it does not precheck/submit.
  Recorder intent follows live state, avoiding a next-take start/stop race.
- Count controls and navigation freeze during checks, submissions and pending
  voice work. The current measured-footer and unknown-submission recovery stay.
  Liquor's complete warning/repeat/retirement review has one scroll body with
  visible actions. Narrative findings preserve the server's actual evidence.
- Human literal zero differs from model/missing/blank zero. Blank/negative
  liquor grid, case and batch text leaves saved quantities unchanged; review
  text remains unresolved until a valid answer. Saved thousandths and frozen
  case/pack provenance survive editing, steps, reopening and resaving.
- Exact Cauliflower Crust/Flatbread identities still count cases, including
  partial cases. Current confirmed size converts new entries; earlier entries
  retain frozen size. Explicit pieces/mixed fields require restatement in cases.
  Legacy loose quantity remains visible until a case answer replaces the cell.
  Vegetable Cauliflower still counts heads; the action still says Add N items.
- Beer retains current fingerprint merges, untouched-screen protection and
  None of these in the cooler semantics. Frozen four-packs stay four-packs,
  including the visible label. Failed child saves stop the combined Keg Send.
- Food cost, food variance, corrected invoice answers, report corrections,
  pooled liquor families and API/draft recovery implementations remain current.
  Recent counts adding Food history remains separate product/API work.

## Validation

- Focused DOM/pure checks: liquor voice 29, food voice 66, beer 13, mobile guards
  2, API deadline/recovery 18, food walk locations 18, discontinued food 6, food
  variance 14, food cost 18, invoices 50, recipes 16, pour labels 3, count
  corrections 3, pooled variance rows 4 and draft sync 7.
- Chromium count checks at 320/390/412px: one review scroller, visible submit
  actions, measured footer after asynchronous load and long errors, retry save/
  check actions, unknown-submit recovery and case-only history/review controls.
- Current food cost layouts: 12 states at 320/390/960px; no sideways scroll,
  text under 12px or tap row under 44px. Phone report/Fix costs screenshots read.
- Broad audit matrix: 81 fresh-main before + 81 integrated after screenshots,
  30 assertions per matrix, no failures, no blocked/unknown fixture requests
  and no horizontal overflow. Current count scenes have no binary tails;
  invoice unit-cost display intentionally retains six decimals. Its 27 extra
  safety assertions and 12 gallery assertions pass. New food cost/variance and
  correction views are covered by the focused current suites above.
- Strict COGS TypeScript passes with ES2023 libraries. Complete Astro/Vercel
  production build passes. Root dependencies are physical directories copied
  from an existing matching installation, avoiding the old Windows symlink
  packaging failure. No package/dependency manifest changes were needed.
- Phone screenshots inspected: long liquor review and footer, uncertain-submit
  recovery, case-only input/history/actions, and current Food cost/Fix costs.

## Reproduce and preserve

Use `scripts/qa-liquor-bottle-sizes/README.md` for focused fixtures. Set
`BOTTLE_QA_TPRS_ROOT=C:/Users/jdow8/dev/tprs` for the real offline quantity and
pour-label converters; set the documented Chromium executable variables for
layout checks. The scripts intercept API requests with fictional responses.

`scripts/qa-cogs-mobile/README.md` documents the 27-scene isolated matrix,
fresh-main baseline, native-touch assertions and gallery verification. Its
generated output and fixture bundles stay ignored inside the Website worktree.
Current evidence root:

`C:/Users/jdow8/dev/Alcohol Pricing/.claude/worktrees/website-mobile-audit-complete`

- `scripts/qa-cogs-mobile/output/index.html`: paired gallery.
- `scripts/qa-cogs-mobile/output/{before,after}/results.json`: each 81-state
  capture run. PNGs are beside the results.
- `scripts/qa-cogs-mobile/output/after/interaction-results.json`: safety checks.
- `scripts/qa-cogs-mobile/output/gallery-review/results.json`: gallery checks.
- `scripts/qa-cogs-mobile/output/integration-build.log`: complete build result.
- `scripts/qa-liquor-bottle-sizes/dist/count-*.png`: 320/390/412px review,
  unknown-submit, error/retry, case inputs/history/actions.
- `scripts/qa-liquor-bottle-sizes/dist/food-cost-*.png`: current cost layouts.

The matrix, gallery, focused phone screenshots and build result are also
preserved in Alcohol Pricing's `incidents/2026-10-03/mobile-audit-integration/`.
That archive is the durable evidence; these Website outputs remain regenerable
and ignored. The original October 2 incident is never overwritten.

Physical Android keyboard, phone-mic routing, calls/background interruption,
live transcription and real backend behavior remain unverified by these
fixtures. A real phone-mic count saved and reopened is still owed by Jon.
