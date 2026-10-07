# Invoice package source-check UI verification

From the Website repository with its locked dependencies installed:

```powershell
node scripts/qa-invoice-source-check/check.mjs
```

The suite bundles the actual invoice screen, comparison component and API client,
serves them on a temporary localhost port and launches a fresh native Chromium
profile. Every invoice and API response is fictional. The fetch fixture controls
all application calls, and independent browser interception blocks external
traffic. It uses no existing login, invoice source, database or paid provider.

`COGS_QA_CHROME` can select a Chromium executable. The default is the installed
Playwright headless shell used by the other COGS UI suites.

Thirty-seven scenarios check source explanations, pending status, explicit rejection,
lost write responses, failed readback, stale fingerprints, deliberate retries,
duplicate taps, older responses and escaped source text. Layout checks cover
320, 390, 412 and 1280 pixels, horizontal overflow and 44-pixel touch targets.
Screenshots and the result record are regenerated under ignored
`scripts/qa-invoice-source-check/.qa/`, ignored by the folder's `.gitignore`.

These synthetic checks verify the interface and request contract. They do not
measure source-reading accuracy or prove physical phone behavior.
