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

The actual `CountLiquor` component and API client run with two synthetic shelves, deferred extraction responses and a stubbed recorder. The first six scenarios cover:
- the transcriber scope (bar section plus the take's shelf);
- shelf tiles locked while the mic is live;
- a take landing on the shelf it started on after the counter taps another tile;
- the review sheet and Add button naming that shelf;
- Finish refused until the take lands;
- Discard releasing it.

The next three cover:
- the recorder ending on its own, where the tiles, Record and Finish are freed;
- a recorder that never reports recording (`?silent-start`), which must not latch the tiles;
- a take before any shelf has loaded (`?no-zones`), which sends no shelf id.

Ten more (19 in all) cover the 2026-10-02/03 voice fixes:
- pause-cut order, the off-switch, and the name-number prompt (`?seagrams`);
- the grid's remove button;
- a bottle said again on the same shelf: "Recount" replaces the earlier take, and "More" adds without a second ask at submit;
- the 90-day history question (`?history`), and an ordinary count that doesn't ask;
- the submit check's "Show 3 more" (`?many-findings`), and the old line from a server without `more` (`?many-findings-old`).

The script reports every scenario and exits non-zero on any failure. It proves the UI rules, not microphone quality or service latency.

Mobile quantity and submit guards reuse the liquor voice build:

```powershell
node serve.mjs --liquor-voice --build-only
node check-count-mobile-guards.mjs
```

Two additional scenarios protect the distinction between missing quantities and
human-confirmed zero, a visible counted zero versus an untouched placeholder,
focus/blur without recording zero, backspacing without recording zero, an editable resumed
`0.125` remaining exact through blur and save, and batch `+0.5` / `-0.5` preserving
that fraction. Deferred precheck and submit responses verify that every counting
control, Record and Home remain unavailable throughout both requests, including
after Submit anyway closes its dialog. The `?precision` fixture contains only
fictional stock; it makes no API calls outside the local mock. These are DOM
checks, without a physical microphone, Samsung keyboard or visual-layout claim.

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

Where things live (2026-10-03; TPRS #314) uses the same build:
`node check-food-walk-locations.mjs`. With `?walk`, each zone has its own
list, a third zone is empty, and two items are on no zone. The 17 scenarios
cover:
- **Leaving a zone:** the sheet and its zone banner, "None left", "Count it",
  "Remove from zone" (added before removed, and a failed list update keeps the
  count), Back versus Skip, the zone list, and a pending voice take, which
  never opens the sheet.
- **"+ New spot":** placement in the walk, a name already in use, and a
  failure.
- **"Things we think you have":** the why line, each answer, "Show 1 more"
  (`?walk&many`), and an older server sending no list.

For layout, serve with `node serve.mjs --food-voice` and open
`http://127.0.0.1:4177/?walk` at 320px and 390px wide.

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

## Stale-screen saves

`node check-draft-sync.mjs` covers `draftSync.ts` with no DOM, in 6 checks:
the three-way merge (my edits win, untouched cells take the server's), and the
ordered saver (each save is built on the last fingerprint, and a refused save
merges and saves once). The liquor (`?stale`) and food (`existing&stale`)
fixtures each refuse their first save once, so one scenario per screen proves
the merge end to end.

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
interval. Every upload carries one take id per Record tap and its piece number
(TPRS 0200). These checks do not measure recognition quality or live latency.

Pause cuts (2026-10-02; on by default, `?pausecuts=0` turns them off) have three suites:
- `node check-voice-carry.mjs` covers the pure rules, 18 checks with no DOM:
  - the pause detector: a half-second breath after 20 s, the 30 s cap, flat
    noise, and a room that gets louder;
  - the carry-forward: an unfinished bottle, spoken order, Stop after a
    failed piece, and food's rule (the last item always waits);
  - the name-number check, back-to-back repeats and the 90-day history check.
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

The variance report's "All bottles" list needs no server or fixture page:

```powershell
node check-variance-rows.mjs
```

It renders the actual `VarianceLines` component from a stored report, with and
without `families`: one row per product, its sizes underneath in bottles and
ounces, and a pre-10-03 report listed exactly as before (4 checks).

The 2026-10-03 count-integrity pass added fixture modes: `check-beer.mjs` runs
`?mode=stale` (a refused save merges), `?mode=save-fails` (the keg check is told)
and the "None of these in the cooler" path; `check-liquor-voice.mjs` adds
`?size-mixup` and `?check-fails`; `check-food-voice.mjs` adds `check-fails` and
`many-findings`.

Food variance (2026-10-03) runs the actual `FoodVariance` screen and its pure
`FoodVarianceReport` with synthetic reports; every request is intercepted:

```powershell
node serve.mjs --food-variance --build-only
node check-food-variance.mjs
```

The 14 checks cover:
- the list, and the states around it: no counts, a failed load, a pending count;
- one report: the net, completeness, caveats, units, bands, the dishes behind
  a line, flagged lines and no-yield wording;
- versions and what a re-run changed;
- an admin re-run, its refusal, and no re-run for a draft, a baseline or a
  manager;
- the deep link, and the pure unit and change helpers.
- optional pooled sizes, with their original package names and counts.

`?mode=empty`, `?mode=error` and `?mode=rerun-fail`, `?admin=0` and
`?count=count-b` switch the fixture. With `node serve.mjs --food-variance`
running, set `FOOD_QA_CHROME` to a Chromium executable and run
`node check-food-variance-layout.mjs`. It checks the list, a report, a re-run
and a draft at 320, 390 and 960px for sideways scroll, text under 12px and tap
rows under 44px. Screenshots stay in ignored `dist/`.

Food cost (2026-10-03) runs the actual `FoodCost` screen and its pure
`FoodCostReport` with synthetic brackets; every request is intercepted:

```powershell
node serve.mjs --food-cost --build-only
node check-food-cost.mjs
```

The 18 checks cover:
- the list at each bracket's latest version, and the states around it: no
  counts, a failed load, a pending count, a provisional draft, the baseline;
- one bracket: the headline against the target and band, sales by source,
  mocktails out, discounts named beside, USAR beside, each line with food and
  NA apart, paper per cover, and an empty line left off;
- the original version's provisional reasons in words, a cost jump "left out"
  and an unpriced item with no dollars; the revalued and updated versions'
  status lines;
- an admin re-run and its refusal;
- Fix costs: what needs a price, TPRS's suggestion pre-filled, every shelf of
  an item sent, each count revalued on its own, the neighbouring bracket's
  version, a refusal, and nothing fetched when nothing needs a price;
- no Fix costs or Re-run for a manager, a draft's lock time, the deep link,
  and the pure helpers.

`?mode=empty`, `?mode=error`, `?mode=rerun-fail`, `?mode=revalue-fail`,
`?admin=0` and `?count=count-b` switch the fixture. With
`node serve.mjs --food-cost` running, set `FOOD_QA_CHROME` to a Chromium
executable and run `node check-food-cost-layout.mjs`. It checks the list, the
latest version, the original and Fix costs at 320, 390 and 960px for sideways
scroll, text under 12px and tap targets under 44px.

## Recipes

The actual `RecipeBuilder` screen, with synthetic gaps, catalog and saved
recipes:

```powershell
node serve.mjs --recipes --build-only
node check-recipes.mjs
# Set BOTTLE_QA_TPRS_ROOT first if TPRS is not ../tprs beside Website.
node check-pour-label.mjs
```

`check-recipes.mjs` runs 16 DOM scenarios. The first 8 cover saved-recipe
reuse: Use this recipe, Undo, Edit first, conflicting recipes, a failed save,
a cocktail reusing an option's recipe, and the manual builder when nothing
matches or the lookup fails. The other 8 (2026-10-03) cover pour defaults:
- the first bottle of "Tanqueray 2oz" starts at 2;
- a second bottle, a label with no pour, a cocktail, and "1/2 oz" or "1-2 oz"
  labels start empty, and Save asks for the pour;
- a saved recipe, opened or reused, keeps its own pours (`?mode=pair`).

`?label=` names the option being built (with `?mode=cocktail`, the drink).

`check-pour-label.mjs` compares the builder's copy of the label reader
(`pourLabel.ts`) with TPRS `parsePourLabel` on 53 labels. With no TPRS
checkout to compare against, it fails.

## Phone count recovery and layout

The 2026-10-03 phone pass uses the actual food and liquor screens, with every
API request intercepted. No fixture submits a production count.

```powershell
node serve.mjs --liquor-voice --build-only
node serve.mjs --food-voice --build-only
node check-liquor-voice.mjs
node check-food-voice.mjs
node check-count-mobile-guards.mjs
node check-voice-deadlines.mjs
$env:COUNT_QA_CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node check-count-phone-layout.mjs
```

Liquor has 29 scenarios and food has 66, including failed saves and explicit
Retry save, rejected submits after successful saves, lost successful Submit
responses, uncertain outcomes and read-only Check submission, and Retry check.
Food also verifies that "two cauliflower crusts" and "six flatbreads" mean
cases, and half cases retain both the case answer and the canonical each total.
Those two catalog definitions are each/12 and each/60; no other product gets a
new case assumption. Manual entry and shelf questions also use cases. Earlier
loose entries remain visible and unchanged until explicitly replaced; conflicting
spoken pieces and mixed model fields require a new case answer. The API deadline
suite has 18 scenarios, including stalled Submit headers/bodies at 60 seconds,
status reads at 15 seconds, and recovery that must not send a second submit.
The case policy stays with those two exact product identities after a package
change: new entries use the current confirmed case size, while older cells keep
their size at entry. Missing or invalid case sizes ask for package confirmation.

The two mobile guard scenarios additionally verify a human-confirmed literal
zero, exact resumed loose/batch fractions, blank or negative edits preserving
saved answers, and held-check/held-submit locks. Rebuild `--beer` and run
`check-beer.mjs` for 13 scenarios, including a resumed four-bottle pack staying
four through a loose-bottle tap, save and reopen.

The layout script starts its own local fixture server and uses Playwright at
320, 390 and 412px with touch/mobile emulation. It verifies one scroll body for
the expanded submit review, visible actions, no sideways overflow, and that the
fixed footer is observed after async loading and again after a longer error.
The last count must clear the measured footer. Screenshots of the long review,
save/check retries and uncertain-submission dialog stay in ignored `dist/`.
`COUNT_QA_PLAYWRIGHT_PACKAGE` can point to a package.json with Playwright when
it is installed outside Website. These checks do not replace the Android
phone-microphone saved-and-reopened count still owed by Jon.

## Recorder startup and device lifecycle

`node check-recorder-lifecycle.mjs` runs the actual recorder hook and API client
in headless Chromium. Its 18 scenarios cover permission denial, unavailable
devices, native recorder constructor/start failures, successful Retry after
each failure, Stop/unmount during a pending permission request, old permission
results/rejections and delayed wake locks after a new take starts, duplicate
Start taps, mute/unmute,
track end, recorder errors and ordinary capture. Startup failures must leave no
timer or live microphone track. Device/recorder loss must preserve the captured
text and surface the error.

Chromium's native MediaRecorder encodes oscillator audio as WebM/Opus, then
decodes each clip and verifies nonzero signal. Acquisition, device events and
transcription responses are controlled; no provider calls or production writes
occur. All external browser requests are blocked. Results are written to ignored
`dist/recorder-lifecycle-results.json`. `COGS_QA_CHROME` can select a Chromium
executable, and `RECORDER_QA_DEPENDENCIES` can select another Website checkout's
installed dependencies when testing a new worktree. The source always comes
from the script's own checkout. These checks do not establish physical Android
phone-microphone, permission UI, screen-lock or call-interruption behavior.
# Recipe-question reply and manager review QA

Run `node scripts/qa-liquor-bottle-sizes/build-food-questions.mjs`, then
`node scripts/qa-liquor-bottle-sizes/check-food-questions.mjs` from the Website
root. The fixture bundles the actual COGS app, mocks every API request and uses
native Chromium through `scripts/qa-cogs-mobile/cdp.mjs`. Set `COGS_QA_CHROME`
if the documented Windows Chromium path is unavailable. External requests are
blocked, and any attempted external request fails the run.

The 57 scenarios cover the exact batch and question through PIN, individual
answers, skip/home/reload draft recovery, uncertain-save readback, revision
conflicts, staff permissions, manager resolution/follow-up, manual targeted
questions, all login-expiry paths and conflicting old/new destination IDs.
Short factual answers "No", "1" and "32" save exactly and remain awaiting
recipe review when reopened. Blank or whitespace-only answers never save.
With `auto=1` (the backend's FOOD_ANSWER_RECIPES_ENABLED, tprs 0217) a save calls
the build for the exact saved revision; `build=unmatched` and `build=down` cover
the held answer and the build that cannot finish, with built/unmatched shots.
Screenshots for question/saved/error/clarification and manager queue/review at
360/412/1280px are regenerated under `dist/food-questions-shots/` (ignored).
All fixture answers are illustrative; this harness sends no real email and
changes no production recipe or queue record. It does not replace physical
Android keyboard or kitchen-user validation.
