# September 18 bottled-beer counter investigation

Status: local tested patch on `fix/beer-counter-quantities`, based on website main `251bb8b`. Not pushed or deployed. No production inventory changes.

John reported that adding loose bottled beer across coolers appeared to reset the control around six/seven and eventually showed totals in the thousands. Jon confirmed Android; the browser/home-screen mode and exact tap sequence were not supplied. John explicitly said he zeroed the beer afterward. Those reset rows cannot be treated as reliable physical counts during the September 18 recovery; confirm or recount them.

## What reproduced

The original `BottledBeer` layout packs three steppers into a narrow flex row. At a 390px viewport, the embedded keg-check container leaves 98px per stepper. Two 40px buttons and borders leave an input 16px wide, only 10px usable after its padding/borders. A saved loose count of **14 visibly displays as 1**, while the header still includes all 14 in the sum. The real Chromium layout test failed on that original code; a screenshot verified the clipped digit.

The patch gives each tier its own row, at least 64px for the quantity and 44px button targets. Labels identify cases, six-packs and loose bottles. The sum says “total”; a short instruction explains adding loose bottles across coolers. Rapid tapping has `touch-action: manipulation` on the buttons. No quantity conversion or saved-count semantics were changed.

## What did not reproduce

The jump to 156 or 6,982 bottles is **not proved to be an arithmetic defect**. Current main and the first bottled-beer implementation (`5e2f725`) both store independent numeric cases/packs/loose values; loose adds one with a functional React update and never rolls over at six. Resumed database numeric strings are converted with `Number`. The backend `resolveCountQuantity` sums the pack tiers before taking the loose remainder, so repeated persistence does not multiply the total again.

Eight tests use the actual component/API client and synthetic HTTP responses. They pass both normal transitions and a 156-tap burst; five save/reopen cycles pass through the actual backend quantity helper and numeric-string database representation. The original video, or a fresh recording showing the full screen and taps after reload, would help distinguish hidden digits, wrong tier taps, an older page, and another issue. Do not claim this layout patch fixed a proven multiplication bug.

## Validation

- `node serve.mjs --beer --build-only`, then `node check-beer.mjs`: eight synthetic scenarios pass. Set `BOTTLE_QA_TPRS_ROOT` to the companion backend checkout when needed.
- `node check-beer-layout.mjs` against `node serve.mjs --beer`: Chromium mobile emulation at 320/360/375/390/412/640 px passes. Fixed touch coordinates stay on the loose-bottle plus button. Fourteen touch sequences add exactly fourteen bottles; no zoom or pack-tier switch. Set `BEER_QA_CHROME` to a local Chromium executable. Generated screenshots/measurements are ignored under the fixture's `dist/` directory; screenshots at 320 and 390 px were visually inspected.
- `node --test scripts/check-count-session-scope.mjs`: all nine count-scope guards pass.
- Focused TypeScript: `tsc --project tsconfig.liquor.json` passes using the installed compiler from the companion backend's `apps/backend/node_modules/typescript/bin/tsc`.
- `npm run prebuild`: translation, recurrence, programs and estimate checks pass.

No full Astro/Vercel build or production release is claimed. The arithmetic tests use synthetic data, and Chromium mobile emulation is not a test on John's phone.

## Files

- `src/components/liquor/views/BottledBeer.tsx`: count wording and tier label.
- `src/components/liquor/liquor.css`: readable mobile controls and touch targets.
- `scripts/qa-liquor-bottle-sizes/beer-fixture.jsx`, `check-beer.mjs`, `check-beer-layout.mjs`: synthetic component, save/reopen and real-browser checks.
- Fixture `serve.mjs`/`README.md` and the website Decisions Log: reproduction and running instructions.

The shared `C:\Users\jdow8\dev\Website` checkout was not changed. The isolated clone is under the Alcohol Pricing workspace.
