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

The invoice suite also checks food/liquor search, inventory labels, explicit food
item creation, linked delivery-copy review, amount questions, excluded supplies
and saved physical package answers (26 scenarios total). With the
invoice server running, set `INVOICE_QA_CHROME` to a Chromium executable and run
`node check-invoice-layout.mjs` to check food, linked-copy, package-answer and
amount-question layouts at 320, 390 and 960px. Screenshots and isolated browser
profiles stay in ignored `dist/`.

Liquor voice counts use the same isolated dependencies and a controlled recorder boundary, the way the food suite does:

```powershell
node serve.mjs --liquor-voice --build-only
node check-liquor-voice.mjs
```

The actual `CountLiquor` component and API client run with two synthetic shelves, deferred extraction responses and a stubbed recorder. Nine scenarios. The first six cover:
- the transcriber scope (bar section plus the take's shelf);
- shelf tiles locked while the mic is live;
- a take landing on the shelf it started on after the counter taps another tile;
- the review sheet and Add button naming that shelf;
- Finish refused until the take lands;
- Discard releasing it.

The last three cover:
- the recorder ending on its own, where the tiles, Record and Finish are freed;
- a recorder that never reports recording (`?silent-start`), which must not latch the tiles;
- a take before any shelf has loaded (`?no-zones`), which sends no shelf id.

The script reports every scenario and exits non-zero on any failure. It proves the UI rules, not microphone quality or service latency.

Food voice counts reuse these isolated dependencies:

```powershell
node serve.mjs --food-voice --build-only
node check-food-voice.mjs
```

The actual `CountFood` component and API client run with synthetic stock, deferred extraction responses and a controlled recorder boundary. Checks cover extraction starting during recording, explicit review before saving, out-of-order segments, the original shelf after navigation, partial and complete failures, fallback and blank takes, unknown case sizes, and the submit guard. All requests stay inside the fixture. This proves processing overlap and count preservation, not live service latency or microphone quality.

The food scenarios also cover confirmed unit labels, uncertain units, explicit
case answers, a typed unit and its conversion, and protocol 2. All 45 run: the
first 42 with `?pausecuts=0` (one extraction per piece), and the last 3 with
pause cuts and the food carry-forward (`splitFoodTail`). For mobile layout,
run `node serve.mjs --food-voice`, set `INVOICE_QA_CHROME` to a Chromium executable,
then run `node check-food-unit-layout.mjs`. It checks the unit question and blocked
Add action at 320, 390 and 960px with an isolated profile. Screenshots remain in
ignored `dist/`; this does not exercise a physical microphone.

Discontinued items (TPRS 0196) use the same build: `node check-food-discontinued.mjs`.
Five scenarios with `?discontinued`:
- the leftover row sits last under its heading and names its replacement;
- it is left out of the shelf progress;
- "None left" archives it and Undo restores it;
- the button is hidden once a number is entered;
- a walk with nothing discontinued is unchanged.

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

## Voice timeout recovery

Run `node check-voice-deadlines.mjs` for the actual API client with stalled
headers/bodies, and `node check-recorder-recovery.mjs` for the actual recorder
hook with a synthetic microphone. The latter verifies that timeout failures do
not retry, brief network failures retry once, Stop releases the microphone, and
successful segments survive a later failure. Neither uses a real microphone or
external transcription service. Rebuild `--food-voice` and run
`check-food-voice.mjs` to verify transcript retry and late-result isolation.

Run `node check-recorder-segments.mjs` to exercise the shared recorder's actual
intervals with a synthetic microphone and controlled clock. Food and liquor
process a 45-second take as 20 + 20 + 5 seconds, preserving spoken order even
when requests finish out of order. Stop during a rotation must retain the last
clip and release the microphone only once. Keg flows retain their 60-second
interval. These checks do not measure recognition quality or live latency.

Pause cuts (2026-10-02; on by default, `?pausecuts=0` turns them off) have three suites:
- `node check-voice-carry.mjs` covers the pure rules, 17 checks with no DOM:
  - the pause detector: a half-second breath after 20 s, the 30 s cap, flat
    noise, and a room that gets louder;
  - the carry-forward: an unfinished bottle, spoken order, Stop after a
    failed piece, and food's rule (the last item always waits);
  - the name-number check and back-to-back repeats.
- `node check-recorder-pauses.mjs` runs the real recorder hook with a scripted
  analyser. It checks that a breath at 21 s ends the piece and that nonstop talk
  hits the cap. With no analyser, or with the switch off, it keeps the 20 s
  clock.
- `check-liquor-voice.mjs` covers the screen side: pieces matched in spoken
  order with the switch on, and the name-number prompt (`?seagrams`).

The pause and carry rules were also replayed offline, on the 2026-10-02 count's
audio (Alcohol Pricing/incidents/2026-10-02/stt-bakeoff, `dg-pausec500`).

Invoice clarity checks cover 47 DOM scenarios, including question ordering,
written package answers, completing two independent holds, progress/focus,
unknown or stale unit labels, and rejection of mixed or ambiguous replies.
`check-invoice-layout.mjs` includes fictional `clarity` and `clarity-unknown-unit`
states at 320/390/960px. Case answers use the item's existing inventory unit;
these checks do not claim a general free-text invoice interpreter.
