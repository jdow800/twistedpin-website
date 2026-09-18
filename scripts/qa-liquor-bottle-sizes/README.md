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

Invoice review uses the same isolated dependencies and the actual `Invoices` screen:

```powershell
node serve.mjs --invoices --build-only
node check-invoices.mjs
```

The fixture uses fictional invoices and intercepts all reads and writes. It checks handwriting visibility, original-image access, credit guidance, category/action separation, explicit confirmation and failure, missing matches, item annotations, duplicates, total differences, legacy responses, missing images, re-reading, and escaped scan text. `node serve.mjs --invoices` serves the same fixture for a separate browser layout check.

Food voice counts reuse these isolated dependencies:

```powershell
node serve.mjs --food-voice --build-only
node check-food-voice.mjs
```

The actual `CountFood` component and API client run with synthetic stock, deferred extraction responses and a controlled recorder boundary. Checks cover extraction starting during recording, explicit review before saving, out-of-order segments, the original shelf after navigation, partial and complete failures, fallback and blank takes, unknown case sizes, and the submit guard. All requests stay inside the fixture. This proves processing overlap and count preservation, not live service latency or microphone quality.

Bottled beer reuses the same fixture dependencies and imports the actual TPRS `resolveCountQuantity` helper:

```powershell
# Set BOTTLE_QA_TPRS_ROOT first if TPRS is not ../tprs beside Website.
node serve.mjs --beer --build-only
node check-beer.mjs
```

Eight DOM scenarios exercise incremental loose bottles across coolers, rapid taps, mixed cases/packs/loose quantities, restored numeric strings, frozen case sizes, decrement/clear, unknown case sizes, and five save/reopen cycles. Every API response and count is synthetic.

For the real Chromium mobile-layout and touch check, start `node serve.mjs --beer` in one terminal. In another:

```powershell
$env:BEER_QA_CHROME = 'C:\path\to\chrome.exe'
node check-beer-layout.mjs
```

The browser runs headless with a fresh temporary profile and tests 320, 360, 375, 390, 412, and 640 px. It checks room for four quantity digits, then dispatches touchscreen events to fixed button coordinates and confirms every tap adds one loose bottle without moving to another tier or zooming. Screenshots and measurements are saved in ignored `dist/`; the temporary profile is removed. This uses Chromium mobile emulation, not John's physical Android phone. It does not prove the separately reported jump to thousands.
