# COGS phone usability — 2026-10-02

Prepared on `fix/cogs-phone-usability-current`, based on refreshed main
`d1e98d1466885498d38fc1a34cbb4d78b5816b2d`. No backend changes, production writes,
push or deployment. The primary Website checkout was 128 commits behind main;
the abandoned earlier worktree is not the source of this result.

## Changes

- Food grid: large case/loose plus/minus controls, visible multipliers and
  formatted totals. Frozen case/pack provenance and the current food unit
  protocol stay intact. Blank, observed zero and None left retain their meanings.
- Food speech: brief unit/case questions, automatic review positioning and a
  working `Review N heard` footer that navigates to questions without checking
  or submitting the count.
- Liquor: clearer loose quantity labels and case steppers, editable draft input,
  explicit human zero, and no automatic one-unit guess for missing model quantity.
- Display quantities remove binary tails. Editable inputs preserve meaningful
  precision; food case and batch steps preserve `0.125`.
- Shared `FindingSummary`: brief decision + structured real history. Narrative
  `big_loss`, `sibling_swap`, `zone_missed` findings show their actual detail;
  backend placeholder numbers are never displayed as history. Missed-shelf
  detail remains visible because the current API does not provide its zone name
  in a separate field.
- Count forms lock all mutations while checking/submitting; Home/Exit cannot
  discard a pending take. Capture intent follows live recorder state so a
  failed first take does not disable Stop on the next one.
- Keg child flush failures now block combined Send. Pending microphones prevent
  accordion/navigation/send actions. Beer has an explicit observed-empty action
  and compact case/six-pack/bottle controls.
- All-COGS copy/layout pass: page titles, visible errors, target floors, recipe
  editor wrapping, and native pour-cost expansion. Invoice costs/quantities keep
  their established accounting precision.
- Keg home tile says `Kegs + bottled beer` so the beer path is discoverable.

## Evidence

`scripts/qa-cogs-mobile/README.md` documents the isolated Chromium/CDP harness.
It compiles the exact baseline through `git show`, intercepts all APIs with
fictional data, and blocks external connections. No new npm dependency.

Visual evidence is preserved outside this public Website repository at:
`C:\Users\jdow8\dev\Alcohol Pricing\incidents\2026-10-02\cogs-phone-ui`.
That folder holds a paired gallery, raw screenshots, result JSON and the fuller
audit report. All displayed data there is synthetic.

Sizes: 412×915 CSS px approximating S24 Ultra, 360×800 phone, 1280×900 desktop.
DPR 1 captures. Actual Samsung hardware/keyboard/browser chrome, Bluetooth,
incoming calls, live transcription and backend reliability are unverified.

## Validation

- Strict `tsconfig.liquor.json` TypeScript passes.
- `git diff --check` passes.
- Current food voice regression suite: 42/42 pass.
- Current liquor voice regression suite: 9/9 pass.
- Beer regression suite: 8/8 pass.
- Food discontinued regression suite: 6/6 pass.
- Invoice regression suite: 50/50 pass.
- Count-session-scope unit suite: 9 pass.
- Two durable count-mobile scenarios pass: explicit zero versus missing, exact
  resumed/batch precision, and held-check/held-submit control locks. Reproduce
  with `scripts/qa-liquor-bottle-sizes/check-count-mobile-guards.mjs` and its README.
- 75 before + 75 after screenshots; 21 touch/save assertions per matrix pass.
  Updated UI has 27 additional safety assertions. All pass, no horizontal
  overflow. Invoice six-decimal cost displays are intentional. See final JSON
  beside the captures for measurements and fixtures.
- `npm run build`: four prebuild checks pass; Astro server/client/routes compile.
  Full command exits at Vercel packaging with Windows symlink `EPERM` for the
  shared worktree `node_modules`. Do not claim complete production packaging.

User-requested independent review: GPT-6 Astra, Ultra. All flagged P1/P2 issues
were fixed; independent browser retests and refreshed phone screenshots cleared
the final changes. No outstanding P1/P2 finding in that review.

## Next checks

Physical GM-phone inventory walk, including fractional cases, keyboard editing,
headset and interruption. Recent counts still lacks Food history; that needs
separate product/API work. Teacher Group initial surface was captured, not its
spreadsheet-to-packet pipeline.

Source and QA belong on this Website branch; screenshot evidence belongs in the
Alcohol Pricing repository. No production release was performed.
