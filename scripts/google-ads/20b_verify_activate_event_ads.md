# Script 20B: verify the applied changes and activate replacement event ads

Prepared September 14, 2026, after reviewing all 22 `ACCEPTED` results from Script 20. **First Google Ads Preview passed verification; all four replacements are still under review. No activation mutations have run.**

It uses the actual new ad, keyword and sitelink IDs from the successful live run. It verifies the ten keyword destinations, three sitelink destinations and five enabled associations, then reports the approval status of each exact replacement ad. Its only permitted writes are eight possible ad-status updates: enable the four approved replacements and pause their four corresponding originals. It does not rerun Script 20 or create anything.

## First Preview result

The owner supplied the Preview beginning 2026-09-15T00:26:08.750Z (displayed September 14, 7:26pm). All ten destinations, three sitelinks and five associations were verified. Every replacement was PAUSED / REVIEW_IN_PROGRESS / UNKNOWN; every original was ENABLED. The script planned zero changes, reported four waiting pairs and made no writes. Leave DRY_RUN true and check again after review progresses. No script fix is required.

## Run it

1. Create a **new** Google Ads script named `20B - Verify and activate event ads` in account `577-897-4265`. Paste the entire `20b_verify_activate_event_ads.js` file. Keep `DRY_RUN = true`.
2. Save, authorize if Google requests it, and click **Preview**. Read the Logs. All prerequisites must pass. Each `AD STATUS` entry names the group and its new ad's policy review/approval status.
3. If all four replacements are ready, the expected plan is **8 status changes, 0 waiting pairs**. After reviewing that exact plan, set `DRY_RUN = false`, save and **Run once**. Do not schedule it.
4. Set `DRY_RUN = true` again and Preview. If all four switched, expect **0 status changes, 0 waiting pairs, 4 already switched**. Save the live acceptance log and confirm the ad statuses in Google Ads.

For an ad still under review or disapproved, the script prints `WAIT` and makes no change to that pair. The old ad retains its current status. Ready pairs can switch while other pairs wait; a later run only switches the remaining ready pairs. If the original is already paused while the replacement is not ready, the log explicitly flags the group for inspection instead of claiming it is covered or switching an unapproved ad on.

The switch requires `reviewStatus = REVIEWED` and `approvalStatus = APPROVED` or `APPROVED_LIMITED`. Google reviews paused ads too. An alcohol-related Eligible (Limited) classification is not automatically a disapproval. See [Google's review process](https://support.google.com/adspolicy/answer/1722120?hl=en) and [approval-status fields](https://developers.google.com/google-ads/api/reference/rpc/v22/AdGroupAdPolicySummary).

## Exact ad pairs

| Ad group | Original ad to pause | Replacement to enable |
|---|---|---|
| Birthday & Celebrations | 799859327220 | 824656851541 |
| Corporate Events | 799841211558 | 824656851544 |
| Team Outings | 813141791896 | 824656851547 |
| Employee Appreciation | 813141808492 | 824656851550 |

Each ID is also bound to its expected account, campaign and ad-group ID. The replacement's pinned first headline and destination must match the reviewed creative. An unexpected change stops the script before any writes. It does not edit ads, tracking, keywords, sitelinks, budgets, bids, geography, audiences or conversion settings. Other ads are not altered.

Ready pairs are updated together in one `AdsApp.mutateAll` request with `partialFailure: false`. The replacement enable and corresponding original pause are therefore submitted in the same atomic batch. Each returned result is checked. A network error can leave the client unsure whether the server applied the batch; inspect Changes and Preview fresh state before trying a live run again. API acceptance does not guarantee impressions or future approval. [Google's atomic batch documentation](https://developers.google.com/google-ads/scripts/docs/concepts/mutate)

If a rollback is necessary, restore the corresponding eligible original ad before pausing its replacement. Use the exact pair table and confirm current policy status; do not bulk-enable historical ads or use a broad account-wide pause.

## Validation and reporting

```powershell
node --test --test-reporter=spec scripts/google-ads/20b_verify_activate_event_ads.test.cjs
```

Tests exercise no-write Preview, exact-ID/status-only scope, approved-limited handling, incomplete/disapproved review, mixed readiness, protected unrelated ads, changed prerequisites, concurrency, atomic rejection, ambiguous timeout and idempotent verification. The tests use mocks; the first Google Ads Preview now verifies the read-only queries and confirms all four current policy reviews are in progress. The live activation mutations remain untested in the account. Its GAQL ID-filter queries explicitly select the referenced IDs, including the sitelink association lookup that failed in the original Script 20.

Record the actual activation date separately from the September 14 URL/sitelink release. If activation is September 14, the first fourteen complete subsequent account days are September 15-28, reviewed September 29 or later. Account timezone is America/New_York. Report purchases/value, event leads, directions and calls separately; improvements are not yet established.

See [Script 20 execution record](20_live_2026-09-14.md) for the accepted source changes and rollback preimages.
