# Script 22: holiday corrections

Prepared November 1, 2026. A standalone Google Ads script for Twisted Pin, account **577-897-4265**. It follows Scripts 19, 20, 20B and 21; do not rerun or replace any of those.

The findings behind it are in the October 31 reviews (Claude's verification of the Ryze audits), kept in the private `Twisted Pin Full System/Marketing/Advertising/2026-10-31-ai-ad-platforms/` folder. This repository is public, so the runbook records what the script does, not the business numbers.

## What this script applies

Each section has its own switch in `RUN22` at the top of the script. All six are on by default.

| Section | Change |
|---|---|
| `replaceAds` | Four RSAs say "Open Until 1am", which is true only Friday and Saturday. Two also say "Take over the suite", which is true only when all six lanes are booked. The script creates a **paused** corrected copy of each ad. "Open Until 1am" becomes "Open Until 1am Fri & Sat". "Take Over the VIP Suite" becomes "Upgrade to the VIP Suite". The suite description becomes the approved line, "When you book all six lanes, the whole suite is yours during your event time." Every other headline, description, pin and URL is copied unchanged. A later run switches each pair (pause the original, enable the copy) only after Google has reviewed and approved the copy. |
| `brandCallout` | Brand stops linking the "Open Until 1am" callout and links the existing, approved "Open Late Fri & Sat" callout that Open Play already uses. No asset is created or edited. |
| `openPlayLate` | Open Play's Friday and Saturday ad schedule runs to **midnight Central** instead of 10:45pm Central. The account clock is Eastern, so this is 10:00–24:00 ET plus a 00:00–01:00 ET window the next morning. The venue is open until 1am on those nights. Other days are unchanged. |
| `couponNegatives` | The shared list "TwistedPin Negatives 2026" also covers Brand, so its phrase negatives "coupon" and "coupons" block "twisted pin coupon". The script moves both onto every other campaign that uses the list (Events, Open Play and the paused Bar-Led) as campaign-level phrase negatives. |
| `ageExclusions` | Removes the age exclusions: Birthday & Celebrations 18–24, Corporate Events 18–24 and 65+. The owner ruled on October 31 that there is no age targeting on Search. |
| `birthdayIncome` | Birthday & Celebrations sets a −40% bid adjustment on the 41–50% and 31–40% income tiers. The lower-50% exclusion that already exists is left as it is. |

**First live run:** 25 operations. 8 removals: the callout link, two schedule windows, two shared negatives and three age exclusions. 2 updates: the income adjustments. 15 creations: four paused ads, one callout link, four schedule windows and six campaign negatives.

**Later run, after review:** up to 8 status changes. The originals are paused first, then the copies are enabled, so no ad group ever has more than three enabled RSAs. A finished account plans zero operations.

## What it deliberately does not do

- No budgets, bidding strategy, keyword bids, keywords, geo, networks or conversion goals. The bid split between near-me and Plainfield keywords was reviewed on October 31 and left alone, because near-me drives most of the walk-in signals.
- No change to the Events schedule. 8am–9pm Central is reasonable for event planners.
- Any other ad or asset is only reported. A `WARNING` line flags another enabled ad in these ad groups that still makes an unqualified 1am claim.

## Run it

1. In Google Ads, go to **Tools → Bulk actions → Scripts** and create a **new** script named `22 - Holiday corrections`.
2. Paste the entire contents of `22_holiday_corrections.js`, replacing the starter code. Leave `var DRY_RUN = true;`. Save, and authorize when Google asks.
3. Click **Preview** and read the Logs. A first run should end with `PREFLIGHT PASSED | planned operations: 25`, followed by 25 `PLAN` lines. Save the Logs; they are the rollback record.
4. Set `DRY_RUN = false`, Save, and click **Run** once. Do not schedule it. Then set `DRY_RUN` back to `true`.
5. **A few hours later** (Google usually reviews new ads within a day), Preview again.
   - `WAIT` lines mean the copies are still in review.
   - When it plans the ad switches (`PAUSE_ORIGINAL` / `ENABLE_COPY`), set `DRY_RUN = false` and Run once more.
   - A `STOP` line means a copy was disapproved. Its original keeps running; review that ad in the UI.
6. A final Preview should plan **zero** operations and show four `ALREADY SWITCHED` lines.

All writes in a run go in one request with `partialFailure: false`, so Google applies all of them or none. A timeout or transport error can leave the outcome unknown: inspect Change history and Preview fresh state before retrying. API acceptance is not policy approval or serving.

## Safeguards

- **Account and campaigns:** the account, currency and exact campaign names are checked. All four campaigns must be Search and Manual CPC with the reviewed daily budgets: Brand $6, Open Play $32, Events $35 and Bar-Led $6. Bar-Led may be paused.
- **Ads:** each original is found by ad-group and ad ID. It must have exactly the expected number of swappable assets, its reviewed final URL, no mobile URL and no ad-level URL options. Otherwise the run stops ("ad copy changed since review"). Corrected copy is checked for Google's length limits and for any remaining unqualified 1am or whole-suite claim.
- **Schedules:** Open Play's Friday and Saturday windows must match either the old or the new shape exactly, with no bid adjustment. Anything else stops the run.
- **Demographics:** age and income targeting must be **Observation** (bid-only) in the affected ad groups. Then removing an exclusion fully re-includes that age, and an income adjustment changes bids, not reach. If an income tier already has a different adjustment, the run stops.
- **Shared list:** any campaign using it that is not in the reviewed set stops the run.
- **Consistency:** every GAQL query selects the fields it filters on, which is the Script 20 Preview lesson. All queries were run read-only against the live account on November 1. Account state is read a second time before submitting. There is a hard cap of 30 operations.

## Rollback

Use the saved `PLAN` entries:

- **Ads:** re-enable the original and pause the copy (Ads & assets → filter by ad group).
- **Callout:** relink "Open Until 1am" to Brand and unlink "Open Late Fri & Sat" (Assets → Callouts).
- **Schedule:** restore Friday and Saturday to 10:00–23:45 ET and remove the two 00:00–01:00 windows.
- **Negatives:** add "coupon" and "coupons" (phrase) back to the shared list and remove the six campaign-level copies.
- **Ages:** re-add the exclusions under Audiences → Demographics.
- **Income:** set the two tiers' bid adjustments back to 0%.

## Measuring it

The account timezone is America/New_York. Compare the fourteen complete days after the switch with the fourteen before.
- **Late-night Open Play:** look for Friday and Saturday clicks, directions and calls between 11pm and midnight Central.
- **Brand:** search terms for coupon queries.
- **Birthday:** spend share and inquiries by income tier.
- **Ads:** Bowling and Things To Do CTR. The copy change should be neutral.

Keep reservations, event inquiries, directions and calls separate.

## Verification

```powershell
node --test --test-reporter=spec scripts/google-ads/22_holiday_corrections.test.cjs
```

10 local tests use fixtures copied from the live GAQL responses of November 1. They cover:
- copy limits and brand rules
- the 25-operation first run in removes, then updates, then creates order
- Preview and dry-run with no writes
- a second run during review (zero operations, four WAIT notes)
- approved switching with pauses before enables, then a clean rerun
- a disapproved copy stopping only its own pair
- eight guards: copy, budget, schedule drift, a Targeting demographic setting, ad URL, callout text, an unknown list user and an existing income adjustment
- each `RUN22` switch
- atomic rejection and transport errors

Two deliberately broken copies were each caught: one created before it removed, and one dropped the Observation guard. These mocks validate this script's logic, not Google's API schema or policy decisions.
