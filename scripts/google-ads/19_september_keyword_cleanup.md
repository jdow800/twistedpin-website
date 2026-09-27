# Script 19 - September Ads changes

**Completed September 13:** Google reported 48 successful changes. Jon then confirmed the [manual remove-then-add correction](19_live_2026-09-13.md) for `[employee appreciation ideas]` in Employee Appreciation. The reviewed cleanup is complete. **Do not rerun the original script live, or use it to verify after removing the positive.** It is retained as the implementation that produced the archived log; the run instructions below describe that original run. Review September 14-27 performance on September 28 or later.

Paste [19_september_keyword_cleanup.js](19_september_keyword_cleanup.js) into a **new Google Ads script** in Twisted Pin account **577-897-4265**. It is a one-time change script, not a scheduled optimizer.

This follows the [September account review](../../Context/google-ads-reviews/2026-09-12/REVIEW.md) and [keyword follow-up](../../Context/google-ads-reviews/2026-09-12/KEYWORDS.md). It replaces the old Script 18 budget proposal: **Events remains $35; the old $41 proposal is not part of this script.**

## Changes included

| Section | Result when applied |
|---|---|
| Bar budget | $12/day to $6/day. A budget already at $6 or lower stays there. |
| Employee Appreciation | Pause exact `[employee appreciation ideas]`; add the five exact-query exclusions below, in this ad group only. |
| Bar Occasion | Pause phrase `"girls night out ideas"`; add the three exact-query exclusions below, in this ad group only. |
| Bowling destinations | Change the 31 reviewed exact keywords from the homepage to `https://www.twistedpin.com/bowl/`. |
| Adult birthday destinations | Send seven explicit adult/milestone birthday keywords to `https://www.twistedpin.com/birthday-parties/#adults`, an existing live section. |

The seven adult targets are `[50th birthday party venue]`, `[adult birthday party venue]`, `[bowling birthday party for adults]`, `[30th birthday party venue]`, `[birthday party venue for adults]`, `[40th birthday party venue]`, and `[adult birthday party venue near me]`. Generic bowling-party/birthday keywords retain their current destination.

Employee Appreciation's **exact** exclusions:

- `[employee appreciation ideas]`
- `[staff rewards]`
- `[appreciation to team members]`
- `[staff appreciation ideas]`
- `[teammate appreciation ideas]`

Bar Occasion's **exact** exclusions:

- `[adult girls night game ideas]`
- `[bachelorette party ideas]`
- `[unique bachelorette weekend ideas]`

These are observed research queries, scoped to the relevant ad groups. They are not blanket negatives for ideas, parties, private, families or company events. The generic `"employee appreciation"`, `"bachelorette party"`, staff/team-outing, local nightlife, and generic venue targets are preserved. Existing negatives are read at ad-group, campaign and assigned shared-list levels to avoid redundant additions. This does not claim to audit all account-level coverage exclusions.

Brand stays $6, Open Play $32, Events $35. The script never changes CPCs, geographic/device/schedule adjustments, bidding strategy, conversion goals, ads or sitelinks. In particular, the Corporate Events RSA is not edited. New kids/family keyword and ad experiments remain separate; this script does not fully split the mixed birthday ad group.

## Run it

1. Create a new script in Google Ads and paste the entire `.js` file. Keep `DRY_RUN = true` at the top. Authorize the requested Google Ads/URL-fetch access if Google prompts.
2. Click **Preview**. Read **Logs** and look for `PREFLIGHT PASSED`. Every proposed update has a `PLAN` line showing its scope, original value and target.
3. If the plan is correct, change **`var DRY_RUN = true;`** to **`var DRY_RUN = false;`**, save, and click **Run** once.
4. Save the execution Logs and inspect the live execution's **Changes** log for errors. Set `DRY_RUN` back to `true`, Save, and Preview again to read fresh account state. Applied items should show `NO-OP`; inspect remaining PLAN entries before retrying. No recurring schedule is needed.

Both the dry-run flag and Google's Preview prevent the script from calling Ads mutation methods. The **Changes** tab can therefore be empty during Preview: the proposed changes are in **Logs**. Public landing-page GET requests still run during planning; the script sends no email and writes no external files, spreadsheets or properties.

Against the supplied report's state, with no existing matching negatives or separate mobile keyword URLs, expect **49 changes**: one budget, two keyword pauses, eight exact negatives and 38 desktop keyword destinations. Existing changes reduce that count; configured keyword mobile URLs can add corresponding destination updates. Counts are explanatory, not permission to ignore a preflight error.

The `RUN` switches can omit an entire section. For example, set `adultBirthdayLanding: false` to apply the other reviewed changes without that section. Do not remove a guard just to bypass an unexpected account difference; inspect the error first.

## Protections and limits

- Account ID, USD currency, campaign/ad-group identity and status, Manual CPC, held budgets and expected existing keyword URLs are checked before the first write. Duplicate/missing targets stop the plan.
- Bar cannot be increased and shared-budget changes are refused. A changed held budget is reported rather than reset.
- Only named, reviewed **exact-match** landing keywords are updated. Paused destination keywords are skipped, and no paused keyword is re-enabled.
- Existing URL query parameters, tracking templates, final-URL suffixes and custom parameters are preserved. Existing keyword-level mobile URLs are rerouted only if they match the expected source. Keyword final URLs take precedence over ad URLs; a keyword mobile URL is used when supplied for mobile traffic. Ad-level destinations remain unchanged.
- Both landing pages must respond with HTTP 200 and expected content; the birthday page must still contain `id="adults"`. Those conditions were independently checked against the public website on September 12.
- A proposed exact negative that conflicts with another enabled same-text positive keyword stops preflight. The deliberately paused ideas keyword is the explicit exception.
- A repeat run skips already-applied changes. A thrown runtime exception stops subsequent work and logs partial progress. Google can also reject a change without throwing an exception, recording the failure in the Changes log while execution continues. Inspect that log and refreshed state even when the script reaches `COMPLETE`. Google Ads does not provide a transaction spanning this script's operations; earlier writes, or a failing request, may already have reached Google.

`BEFORE` and `SUBMITTED` records contain the setting and entity IDs. `from` is the value to restore if needed; a negative with `from: null` was absent from the inspected scopes before this run. Restore only settings confirmed to have been changed by this execution. Save the log before retrying after a partial failure. There is no automatic rollback that could overwrite later owner changes.

The bowling destination change is a **before-and-after trial, not a randomized A/B experiment**. Record the actual execution date and compare fourteen complete subsequent days with the baseline, separating purchases/value, event leads, calls and directions. The change is a relevance hypothesis, not a promise of improved ROI. Kids/adult ad-copy separation, optional new keywords, unexplained geography and bid increases are separate follow-up decisions.

## Validation and maintenance

Local JavaScript syntax validation and **26 behavior tests passed**. The tests use the archived 177-keyword export as the fixture and cover dry run, Preview, exact scope, untouched bids/tracking/ads, repeat runs, mobile/query-string handling, budget guards, conflicts, missing/duplicate targets, bad destinations, API failure/retry and section switches. The September 13 regression additionally covers a non-throwing rejection of each Employee Appreciation negative and a retry of only the missing addition. The independent **SOL / medium** code review found no blocking code or API-compatibility defect and approved the script for Google Ads Preview. Its mobile-URL refinement is incorporated: an ad-level mobile URL does not block keyword routing, consistent with Google's serving hierarchy.

```powershell
node --check scripts/google-ads/19_september_keyword_cleanup.js
node --test scripts/google-ads/19_september_keyword_cleanup.test.cjs
```

The fixture carries spend figures, so it stays out of this public repository in the git-ignored `Context/google-ads-reviews/`. Without it the suite reports one skipped test; to run all 26, copy `google-ads-reviews/2026-09-12/` from the private `twisted-pin-notes` repo into `Context/google-ads-reviews/`.

The tests are local simulations of AdsApp. **September 13 update:** Jon's in-account read-only execution passed with all 49 expected planned changes. His subsequent 9:18am Central live execution submitted all 49. The supplied Changes screenshot confirms **48 Successful / 1 Error**. The later manual-save error identified a positive/negative criterion conflict for `[employee appreciation ideas]`. Jon confirmed that removing the paused exact positive and adding the exact negative in the same ad group resolved it. The mocks did not model that restriction, so their successful retry simulation does not establish compatibility for this case. See the [completed execution record](19_live_2026-09-13.md). Policy/serving status has not been independently audited. No website deployment, commit or push was performed.

API behavior was checked against Google's current documentation: [Keyword URLs](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_keywordurls), [serving URL hierarchy](https://developers.google.com/google-ads/api/docs/ads/upgraded-urls/serving-url-rules), [keyword text and pause](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_keyword), [ad-group negatives](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_adgroup), [budget periods and sharing](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_budget), and [Preview mode](https://developers.google.com/google-ads/scripts/docs/preview).
