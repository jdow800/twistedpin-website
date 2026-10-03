# Isolated COGS phone QA

Runs the application with synthetic inventory, invoices, speech transcripts and
review findings. It never loads credentials or production inventory. The fetch
fixture returns every API response in browser memory; CDP blocks API and external
network requests as a second guard. The optional baseline server has no upstream
proxy and rejects any API request that escapes the fixture.

## Requirements

Node 22.12 or newer, the project's existing dependencies, and a local Chromium
headless executable. No additional npm dependency is needed. Set
`COGS_QA_CHROME` if the cached Chromium path in `cdp.mjs` differs on your machine.

## Baseline capture

Run from the Website worktree. Use an explicit commit so later fetches cannot
move the baseline. The October 2 baseline is
`d1e98d1466885498d38fc1a34cbb4d78b5816b2d`. For the October 3 integration, use `307caa5773a6feda3e26cdc4bc0ff0b6a79a6cd6`.

```powershell
$env:COGS_QA_BASELINE_REF = '307caa5773a6feda3e26cdc4bc0ff0b6a79a6cd6'
node scripts/qa-cogs-mobile/serve.mjs --stage=before
```

Leave that process running, then in another terminal:

```powershell
$env:COGS_QA_OUTPUT = (Join-Path $PWD 'scripts\qa-cogs-mobile\output\before')
node scripts/qa-cogs-mobile/run.mjs --stage=before
```

The baseline is compiled directly from committed TS, TSX and CSS via `git show`;
it does not depend on current app edits. The server defaults to port 4197. Use
`COGS_QA_PORT` and `COGS_QA_URL` to change it. Generated bundles and browser
profiles are ignored by this directory's `.gitignore`.

## Updated UI capture

Start the isolated application server in one terminal (no upstream proxy):

```powershell
$env:COGS_QA_PORT = '4349'
node scripts/qa-cogs-mobile/serve.mjs --stage=after
```

Then capture in another terminal:

```powershell
$env:COGS_QA_OUTPUT = (Join-Path $PWD 'scripts\qa-cogs-mobile\output\after')
node scripts/qa-cogs-mobile/run.mjs --stage=after
node scripts/qa-cogs-mobile/interactions.mjs
$env:COGS_QA_GALLERY_OUTPUT = (Join-Path $PWD 'scripts\qa-cogs-mobile\output')
node scripts/qa-cogs-mobile/gallery.mjs
node scripts/qa-cogs-mobile/check-gallery.mjs
```

Set `COGS_QA_URL` for another local app URL. Capture one viewport with
`--viewport=s24-ultra`, `--viewport=small-phone`, or `--viewport=desktop`.
Use `--scene='invoice detail'` to refresh only that scene in an existing matrix.
Without output environment variables, regenerable captures and the gallery stay
under this script directory's ignored `output/`, inside the Website project.
The October 2 evidence is intentionally preserved in Alcohol Pricing instead.
Do not overwrite that earlier evidence when testing this integration.
The added case-only scenes check frozen historical crust quantities and new
half-case/crust and six-case/flatbread canonical saves. Draft saves return
fingerprints, prechecks name them, and read-only count status is mocked locally.

## Coverage and limits

The matrix captures 27 states at 412×915 CSS px, 360×800, and 1280×900. The first
approximates a Samsung S24 Ultra browser viewport; screenshots use DPR 1 so files
remain easy to compare. States include food and liquor grid, recording, voice
review, unresolved product/package choices, prechecks, backup/empty/bottled beer,
upload, invoices, counts, price watch, pour costs, mapping, recipes, login, and
Teacher Group Organizer. It waits for fonts and scrolling to settle.

`results.json` records screenshots, visible copy, short controls, horizontal
overflow, long decimals, fixture calls, and test outcomes. The matrix uses native
touch events for inventory steppers and choices. Additional assertions check
explicit zero vs blank, frozen case size on resume, pack preservation, fractional
case precision, recording guards, pending review navigation, original-shelf
application after an async read, zero beer, and failed-save submission guards.

Audio is a fake MediaRecorder transport feeding the real recorder/review UI with
synthetic transcripts and extraction results. This does not validate a physical
phone, Android soft keyboard, Samsung browser chrome, live transcription,
phone microphone quality, network reliability, or actual backend behavior.
No upload, report email, microphone permission, recording, or LLM call is made.
