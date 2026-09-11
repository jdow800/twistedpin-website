# Bottle-size UI verification

This isolated fixture renders the actual count and invoice components with synthetic data. All API requests are intercepted locally. It imports the actual recent-delivery helper from the companion TPRS checkout. The test-only esbuild plugin exposes the internal invoice matching component without changing its production exports.

Install the Website's normal dependencies first. From this directory:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
# Required only if the matching TPRS checkout is not ../tprs beside Website:
$env:BOTTLE_QA_TPRS_ROOT = 'C:\path\to\tprs-checkout'
node serve.mjs --build-only
node check-ui.mjs
```

The separate dependency lock is only for this QA fixture; it adds nothing to the application bundle. Generated bundles, installed dependencies and results are ignored. Node 22.12 or later is required by the Website.

Eight DOM scenarios verify size labels, recent-delivery evidence, preserving counts on Submit anyway, clearing the warning after a correction, save failure, unavailable/older advisory APIs, adding a new invoice size, and explicit confirmation for wrong-size manual matches (including the create/find path).

For a real mobile layout check, run `node serve.mjs` and open `http://127.0.0.1:4177` at 390px wide. Use `?mode=invoice` for matching, or `?mode=save-failure`, `?mode=check-failure`, and `?mode=old-api` for failure/compatibility paths. Stop the server with Ctrl+C.

The automated check uses jsdom and makes no visual-layout claim. A real microphone/LLM extraction run also remains separate from these deterministic tests. Backend tests live in `apps/backend/src/bar/voice-extraction.test.ts`, `recent-bottle-size.test.ts`, and `apps/backend/src/admin/bar-bottle-size-precheck.test.ts` in TPRS.
