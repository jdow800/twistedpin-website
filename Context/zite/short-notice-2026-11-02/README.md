# Short-notice Zite draft

Unpublished implementation for owner-approved short-notice catering policy. Workspace `cfd64971bbc1cdf7`, app `2cjjjapyec` (Menu Selector), authored base `cc923824b9af21d448eaa35fb6b26c2bf8506f19`. Draft sandbox: `sbx:cfd64971bbc1cdf7:c7275929-0bcd-435d-9e42-710996b7ce37`.

The `apps/menu-selector/` tree contains every changed/new authored file, not generated SDK files or dependencies. Reapply these files over the exact base after checking for newer editor changes; never overwrite concurrent edits. The app is still uncommitted and unpublished in Zite. The Website API/rules and `/terms` changes are in this same Website worktree.

Policy: date picker starts today; future same-day requests can price for all four packages. Full payment uses the estimate total for every accepted catered event within nine Chicago calendar days. `deposit_shown` and the numeric 50% deposit contract stay unchanged. Pizza & Pop alone avoids the short-notice approval wording, subject to the same-day six hours at booking/link issuance. UI timing is advisory; n8n/TPRS recompute when handling the request. Seasonal restrictions still come from the existing menu API. Public `/eventmenu` remains a staff email route.

Validation in the isolated sandbox:

- `npx zitejs generate`, then Zite `check_app` for `2cjjjapyec`: clean TypeScript and endpoint bundles.
- `npm run test:pricing -w apps/menu-selector`: 109 new boundary checks, 72 contract/schema/mock endpoint checks and 21 existing retry checks passed.
- `npm run test:builder -w apps/menu-selector -- --grep 'same-day|day9|tomorrow|CT rollover' --workers=2`: 16 desktop/mobile tests passed. Tests block external calls and use synthetic submissions/email captures.
- New sandbox required `npx playwright install chromium` and `npx playwright install-deps chromium` before browser tests could launch.
- Website `node scripts/check-estimate.mjs`: 267 passed, zero failed, including all four same-day packages at and under six hours; tests use a mock engine, no live submissions.
- Website prebuild checks all passed, followed by a successful production Astro build. The isolated checkout lacks live GoTab credentials, so its existing build-time menu fallbacks were used; unrelated chunk-size warnings remain. Build verification required normal filesystem access for Astro dependency resolution after sandbox-only attempts failed.

Before release, review the complete multi-repository changes and sequencing in the Avery plan. Use Zite's supported check/commit/build/publish tools only after release authorization. Re-run checks against any newer editor base. Never publish this UI alone ahead of the same-day API and server policy support.
