# Liquor bottle sizes — September 11, 2026

Released September 11, 2026. Backend PR #195 merged as `9796f5ff7c224ac8f418bd7e6a225a2cd53c31e1`; Render deployment `dep-dai71bgu01pc73daggu0` is live. Website commit `014eea44ff5c4569b3b2bca5928246369fe6cac7` passed Vercel preview and production builds (production deployment `6401966953`). Both repositories use branch `feat/liquor-bottle-size-checks` in isolated worktrees under `Alcohol Pricing/.claude/worktrees/`. Backend worktree: `tprs-bottle-sizes` (base `1cb6036`). UI worktree: `website-bottle-sizes` (base `4b0767f`). The original working directories and live inventory were not edited.

Example: four 1L Tanqueray London Dry Gin bottles arrive while the catalog already contains 750ml bottles. Creating a separate bottle entry for 1L is correct. Keep both sizes: two 750ml plus four 1L bottles represent 5,500ml, not six interchangeable bottles.

## Count behavior

- Explicit sizes such as `750 milliliter`, `one liter`, `1-liter`, and catalog size shorthand resolve to that size. The deterministic guard corrects a model-selected sibling with the wrong size.
- `Small bottle` and `large bottle` resolve to the smaller/larger size only when that exact product has exactly two sizes. Three sizes, conflicting sizes, unsupported sizes, or ambiguity between different products still require a choice. `Small Batch` is a product name. A bare `six bottles` never supplies a size.
- The extraction prompt preserves size qualifiers and emits separate count items for separately named sizes. A live microphone/LLM extraction run was not performed; automated tests exercise the deterministic guard after extraction.
- Saved count rows display their bottle size.

## Delivery warning

The read-only pre-submit API returns `sizeWarnings` separately from capped, dollar-ranked findings. This also runs for a first count. The review shows the latest delivery quantity/date and the count by size, for example four 1L bottles received yesterday but six 750ml and zero/missing 1L counted. Staff can check labels or submit their physical count unchanged.

The initial recency rule is the last 14 days, bounded by the previous submitted full count when one exists. This is a tunable implementation choice, not a claim that recent purchases guarantee stock remains. Older purchases alone do not trigger this new warning.

Evidence uses accepted invoices (`extracted`/`confirmed`), actual received quantities when available, and `effective_at` as arrival time. Future arrivals are excluded. Returns that offset all received stock suppress the warning. The latest delivery size is compared within the same normalized product name; separate variants such as London Dry and No. Ten are never combined. Broad/fuzzy brand grouping is deliberately absent.

Counts sum every zone and duplicate catalog entries at the same size. Positive stock of the delivered size, even a partial bottle, clears the warning. A counted prep batch containing that SKU can also explain an empty loose-bottle shelf. That is a presence check only: variance expansion and its both-counts requirement are unchanged. If neither size is counted, the existing general missing-item checks apply.

The API never changes counts, purchases, or reports. The UI requires saving to succeed before prechecking/submitting; a failed advisory request itself still permits submission. The optional response field supports either deployment order.

## Invoice cleanup

Suggestions exclude known conflicting package sizes. New-bottle duplicate detection checks product and size together. Other sizes appear as context. A manual wrong-size match requires an explicit decision that the invoice size was read incorrectly, with an alternative to create the delivered size. The create/find path uses the same confirmation when it finds an existing entry. No cleanup of Jon's actual catalog was needed or performed.

## Verification

- 41 focused backend tests pass: 22 voice size checks, 12 delivery-rule checks, and seven authenticated API integration scenarios. The API fixtures require a local `_test` database and roll back their data.
- 51 existing `bar-food-session.test.ts` regression tests pass. Total backend checks: 92.
- Full GitHub CI passes: 194 test files / 2,584 tests, plus backend TypeScript. Run: https://github.com/jdow800/tprs/actions/runs/34648599297.
- Eight UI behavior scenarios pass with real components and synthetic requests in jsdom. Reproduction: `scripts/qa-liquor-bottle-sizes/README.md`; fixture source and its separate dependency lock are committed with this branch. No application dependencies changed.
- The focused Website TypeScript check passes. Release preparation fixed the pre-existing recorder TS2774 diagnostic by using an explicit function-type check; unsupported browsers still take the same fallback.
- Local Windows packaging encountered a symlink `EPERM`; both the Vercel preview and production builds subsequently succeeded in their normal hosting environment.
- No browser was available through the computer-use tool (`apps: []`, `browsers: []`). Real mobile layout and microphone checks remain pending. The localhost synthetic preview can be started from the QA folder; no live API is called.

To rerun backend checks from `tprs/apps/backend` with its existing development dependencies and local test configuration:

```powershell
node node_modules/vitest/vitest.mjs run src/bar/voice-extraction.test.ts src/bar/recent-bottle-size.test.ts src/admin/bar-bottle-size-precheck.test.ts src/admin/bar-food-session.test.ts --cache=false
node node_modules/typescript/bin/tsc --noEmit
```

No database migration is required. Production verification: `https://www.twistedpin.com/cogs/` returns 200; its served `LiquorApp.DrHcBCte.js` contains the new count warning and invoice size confirmation. `https://tprs-kxht.onrender.com/health` returns 200 with status `ok`, and Render independently confirms the merged commit is live. Real phone/microphone verification remains a distinct follow-up; no live count or invoice was changed for testing. Follow the existing repository release processes: TPRS PR to main/Render and Website main/Vercel. The backend PR and GitHub/Vercel deployment status are the release records; local compilation alone is not production verification.
