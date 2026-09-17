# Food voice count latency

Status: implemented on `fix/food-count-voice-latency`; not deployed.

The GM's first food trial covered the small beverage cooler and pizza freezer. He clarified that the slowdown was the wait for results after recording stopped. Jon asked to mirror the earlier liquor fix.

## Change

Liquor commit `601e9cb` (2026-07-27) starts item extraction when each roughly 60-second transcript arrives, while the rest of the recording continues. The shared recorder already transcribed food segments during recording, but `CountFood` called item extraction only once, after the whole recording ended.

`CountFood` now starts `extractVoice(text, "food")` for each segment, orders the results by segment index, and waits for unfinished extraction at the end. Review still opens after the recording ends and requires an explicit Apply. Existing shelf attribution, one outstanding recording at a time, and submission guards remain in place. It never extracts the complete transcript again after processing segments. The Web Speech fallback, which emits no segments, retains its existing complete-transcript path.

Background failures are handled immediately. Partial failure opens the surviving items with a visible missing-part warning; complete failure retains the server's explanation. A new recording clears prior extraction state and errors. A processed transcript with no items now receives an explicit response.

## Verification

Use the existing isolated QA dependencies in `scripts/qa-liquor-bottle-sizes`; see that directory's README. The food fixture exercises the real component and API client with synthetic responses and a controlled recorder. It does not contact production or create a real inventory count.

Run from the QA directory:

```powershell
node serve.mjs --food-voice --build-only
node check-food-voice.mjs
```

From Website, run the focused TypeScript check with the available TypeScript compiler and the required prebuild checks:

```powershell
node ../tprs/apps/backend/node_modules/typescript/bin/tsc -p tsconfig.liquor.json --noEmit
npm run prebuild
```

All nine food voice DOM scenarios pass, along with focused liquor/COGS TypeScript and all required `npm run prebuild` checks. The synthetic food component bundle builds successfully. TypeScript and the fixture bundler required execution outside the Windows sandbox to read the existing shared tool installations; no application dependency changed.

Real phone/microphone timing remains unmeasured. A recording shorter than one segment still needs its final transcription and extraction; this change overlaps work for longer recordings and does not eliminate service/network time.

## Separate findings

The GM also confirmed water displayed a case count unit and described a pack-size answer of 1 for what is likely sliced pepperoni, one 10-pound bag. The imported water unit and the end-to-end minimum case size of 2 are separate unresolved issues. This speed change does not alter units, pack rules, saved quantities or production data. The original trial session still needs inspection before any unit repair.
