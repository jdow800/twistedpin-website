# Script 21: September review fixes

Prepared and applied September 25, 2026.
- **Preview:** passed, with exactly 9 planned operations.
- **Live run:** all 9 operations were accepted at 9:47am CT, and Bar-Led is paused.
- **Verified:** the 9:57am fresh Preview planned zero operations, and the readback confirmed every change.
- **Account state found:** Search Partners and Display were already off everywhere, and the AI Max checks were clear.

See the [execution record](21_live_2026-09-25.md).

A standalone, one-time Google Ads script for Twisted Pin, account **577-897-4265**. It follows Script 19 (September 13) and Scripts 20/20B (September 14–15). Do not rerun or replace any of those.

The findings behind it are in the September 25 mid-window review. That review is kept in the local, untracked `Context/google-ads-reviews/2026-09-25/` folder of the original checkout, because this repository is public and the review holds spend and inquiry figures. This runbook records what the script does, not the business numbers.

## What this script applies

Each section has its own switch in `RUN21` at the top of the script. All five are on by default.

| Section | Change |
|---|---|
| `fundraiserRoutes` | Two exact keywords in Events / Birthday & Celebrations, `[fundraiser venue]` and `[bowling fundraiser]`, go from `/birthday-parties/` to `/fundraisers/`. Query strings are kept. A paused keyword is skipped. |
| `brandSitelinks` | The three sitelink assets Script 20 created are **linked** to the Brand campaign: Adult Birthday Parties (`/adult-birthday-parties/`), Kids' Birthday Packages (`/reserve/birthdays/`) and Company Holiday Parties (`/holiday-parties/`). Brand goes from four campaign-level sitelinks to seven. The assets and their Events ad-group links are not edited. |
| `trackingSuffix` | A campaign-level final URL suffix on all four campaigns: `utm_source=google&utm_medium=cpc&utm_campaign=<slug>&utm_content={adgroupid}_{loc_physical_ms}&utm_term={keyword}`. Slugs: `brand`, `bar`, `open-play`, `events`. |
| `networkHygiene` | Search Partners (`target_search_network`) and Display (`target_content_network`) are switched off on any of the four campaigns where either is still on. Google Search itself must already be on, or the script stops. |
| `pauseBarLed` | `Bar-Led_TwistedPin_2026` is paused. Its $6/day budget is left unchanged, and no money is moved to another campaign. |

First-run expectation: at most **9 API operations**. That's 2 keyword URL updates, 3 Brand sitelink links, and **one** campaign update per campaign (4). Each campaign update carries all of that campaign's changes: suffix, networks and, for Bar-Led, status. Items already applied are skipped, so a rerun after success plans **zero** operations.

### Why a campaign-level suffix, and what it gives us

The site's gclid pass-through (`src/scripts/gclid-passthrough.client.ts`) already forwards `utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` to the event-inquiry form. Google's final URLs carried no UTM tags, though, so Avery's inquiry rows could not be placed by campaign, ad group or town. With the suffix, every ad, keyword and sitelink click lands with a readable campaign slug, the ad group ID, the searcher's physical location ID and the keyword.

URL options at the campaign level do not resubmit ads for policy review. Campaign level was chosen over account level for two reasons: readable per-campaign slugs, and a well-supported mutate path. **Reporting trap:** once tagged, Avery's WF1 records the source as `google/cpc/<slug>`. Count Google inquiries by `gclid IS NOT NULL`, never by the `attribution_source` string.

The script refuses to overwrite an existing suffix. It stops if the account already has a final URL suffix, or if a campaign has a *different* one. Ad-group, keyword and ad-level URL options take precedence over a campaign suffix, so any that exist are listed as a `WARNING` in the Logs. They are reported, not changed.

## What it deliberately does not do

- **No changes to the replacement Events ads.** Script 20's own read of them is September 30 (September 16–29). They are not edited, paused or rewritten here.
- **No bids, budgets, geo or bid modifiers**, including Naperville, the ZIP-level read and day-of-week adjustments. Those need the day-of-week and location reports first.
- **No negatives or new keywords.** Search terms have not been reviewed yet.
- **No change to the "Open Until 1am" claim.** It appears in callouts, RSA headlines and descriptions across Brand, Open Play and Bar-Led. It is accurate only Friday and Saturday. Fixing it properly is an RSA copy refresh, which restarts ad review, so it is a separate decision.
- No conversion-goal, audience, asset-content or keyword-status changes. No emails, Sheets, Drive, external writes or credentials.

## Run it

1. Open Twisted Pin in Google Ads. Go to **Tools → Bulk actions → Scripts**, and create a **new** script named `21 - September review fixes`.
2. Paste the entire contents of `21_review_fixes.js`, replacing the starter code. Leave `var DRY_RUN = true;`. To skip a section, set its `RUN21` switch to `false`, for example `pauseBarLed: false`. Save, and authorize when Google asks.
3. Click **Preview**. Read the **Logs**:
   - `CAMPAIGN …` lines show each campaign's status, budget, networks and URL options before any change.
   - `ACCOUNT …` shows auto-tagging and any account-level URL options.
   - `CHECK …` lines are read-only AI Max checks. If any campaign shows AI Max enabled, text asset automation opted in, or a campaign-level match type of `BROAD`, turn it off in that campaign's settings in the UI. Google's September auto-upgrade to AI Max changes how exact and phrase match behave. A `CHECK … unavailable` line only means this API version could not read that field.
   - `PREFLIGHT PASSED | planned operations: N` is followed by one `PLAN` entry per operation, each with its before and after values. Save the Logs; they are the rollback record.
4. After reviewing the plan, set `DRY_RUN = false`, save, and click **Run** once. Preview stays read-only even with the flag false. Do not schedule it.
5. Check **Logs and Changes**. Each accepted operation logs its resource name. Set `DRY_RUN` back to `true` and Preview again: the fresh plan should be **zero** operations.

A Preview is an account and configuration check, not a server-side validation of the mutations or a policy review. If a campaign, budget, bidding strategy, keyword, sitelink asset, URL or landing page differs from what was reviewed, the script stops before submitting anything instead of guessing.

All writes go in one request with `partialFailure: false`, so Google applies all of them or none. A timeout or transport error can leave the outcome unknown. Inspect Changes and Preview fresh state before retrying.

## Safeguards

- Account, currency and exact campaign names are checked. All four campaigns must be Search, Manual CPC, with daily budgets of $6 Brand, $6 Bar, $32 Open Play and $35 Events. Brand, Open Play and Events must be enabled; Bar-Led may already be paused.
- Exact-match fundraiser keywords only. The phrase variant and every other keyword are untouched. Destinations must currently be `/birthday-parties/` (or already `/fundraisers/`); anything else stops the run.
- Sitelink assets are verified by ID, link text and URL. A paused Brand link is never re-enabled. Brand ad-group sitelinks (which would hide campaign-level ones) stop the run.
- Public landing checks run before any write, with no redirects allowed. Each page must return 200 with an `<h1>`, the expected content and no noindex. The checked pages are `/fundraisers/`, `/adult-birthday-parties/`, `/reserve/birthdays/` and `/holiday-parties/`, plus `/bowl/`, `/reserve/`, `/birthday-parties/` and `/corporate-events/` with a sample UTM query attached.
- Every GAQL query selects the IDs it filters on, which was the Script 20 Preview lesson. Account state is read a second time before submitting. There is a hard cap of 9 operations.

## Measuring it

- **Tracking suffix:** after the run, the next Google-attributed inquiry in `avery_event` should carry `utm_campaign` and `utm_content`. If it doesn't, check that the Zite form still stores `utm_*`. A read-only check:
  `select created_at, utm_campaign, utm_content, utm_term from avery_event where gclid is not null order by created_at desc limit 5;`
  Map `{loc_physical_ms}` IDs to towns with Google's geotargets list.
- **Networks:** if Search Partners or Display were on, expect slightly fewer impressions on the affected campaigns, and read the reduction as the removal of partner and display traffic.
- **Bar-Led pause:** account spend drops by about the Bar-Led budget. Watch Brand and Open Play for bar and nightlife queries that shift to them.
- **Brand sitelinks:** compare Brand CTR and conversions over the fourteen days after the run with the prior fourteen.

The first fourteen complete account days after the run are the measurement window. The account timezone is **America/New_York**. Keep purchases and value, event inquiries, directions and calls separate.

## Rollback

Use the saved `PLAN` entries.
- **Fundraiser URLs:** restore the two keyword URLs to `/birthday-parties/`.
- **Brand sitelinks:** remove the three new **Brand campaign** sitelink links by their logged resource names. Do not delete the sitelink assets; the Events ad groups still use them.
- **Suffix:** clear each campaign's final URL suffix under campaign Settings → Campaign URL options.
- **Networks:** switch back on only if deliberately wanted. The May brief ruled Search-only.
- **Bar-Led:** set it back to Enabled; its budget was never changed.

## Verification

Run the standalone tests. They need no dependencies or Ads account access:

```powershell
node --test --test-reporter=spec scripts/google-ads/21_review_fixes.test.cjs
```

41 local tests cover:
- no-write dry run and Preview
- selected WHERE-referenced IDs
- exact scope of the nine operations and one merged update per campaign
- idempotent reruns
- each `RUN21` switch
- query and mobile URL preservation
- every guard: account, currency, budget, bidding, missing or duplicate campaigns and keywords, destinations, hosts, sitelink drift, Brand ad-group sitelinks, paused links, landing status, content and noindex, and state changing during preflight
- lower-level URL-option warnings
- best-effort AI Max reads
- the auto-tagging report
- atomic rejection and unknown network outcomes

Three deliberately broken copies of the script were each caught by the suite: a non-atomic request, a removed ad-group-sitelink guard and a lowered operation cap. These mocks validate this script's logic, not Google's API schema or policy decisions.

All eight public landing checks were fetched on September 25 and returned HTTP 200 with the expected content, including the tagged URLs.

References:
- [Google Ads Scripts mutate and atomic batches](https://developers.google.com/google-ads/scripts/docs/concepts/mutate)
- [MutateResult: inspect success and errors](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_mutateresult)
- [Add a Final URL suffix](https://support.google.com/google-ads/answer/9054021?hl=en) (account, campaign, ad group, ad and keyword levels; checked September 25)
- [Set up tracking with ValueTrack parameters](https://support.google.com/google-ads/answer/6305348?hl=en) (`{adgroupid}`, `{keyword}`, and `{loc_physical_ms}` = the ID of the click's physical location, reported for campaigns that target people in the location; checked September 25)
