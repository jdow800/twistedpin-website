# Script 20: connect event searches to the new landing pages

Prepared and applied September 14, 2026. **All 22 operations were accepted in the supplied live log.** The four new RSAs were created paused. Fresh readback via [Script 20B](20b_verify_activate_event_ads.md) passed. The four replacements remain under review and paused; activation is pending. See [execution record](20_live_2026-09-14.md).

September 14 Preview correction: Jon's log (`2026-09-15T00:01:42.983Z`) reported `EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE` for `ad_group.id` in the sitelink-association lookup. That query filtered on the ID but omitted it from SELECT. Added the ID to that query; the other two lookups using the same ad-group filter already select it. A regression test reproduced the original failure, and all 28 local tests pass with the correction. The original mocks did not validate this GAQL requirement. The corrected Preview subsequently passed and printed the complete expected 22-operation plan. No rollback is needed for the failed read-only run.

This is a standalone Google Ads script for Twisted Pin, account **577-897-4265**. It follows the completed September 13 Script 19 cleanup. Do not rerun or replace Script 19. It neither changes paid budgets nor launches the proposed craft-beer, karaoke/Singo or NYE tests.

## What this script applies

| Change | Scope |
|---|---|
| Adult birthday destinations | Seven existing exact-match keywords in Events / Birthday & Celebrations go from `/birthday-parties/#adults` (or the original birthday page) to `/adult-birthday-parties/`. |
| Holiday destinations | Three existing exact-match keywords in Events / Corporate Events go from `/corporate-events/` to `/holiday-parties/`. |
| Birthday sitelinks | Adult Birthday Parties → `/adult-birthday-parties/`; Kids' Birthday Packages → `/reserve/birthdays/`. Both attach only to Birthday & Celebrations. |
| Company holiday sitelink | Company Holiday Parties → `/holiday-parties/`, attached to Corporate Events, Team Outings and Employee Appreciation. |
| Replacement ad drafts | One new responsive search ad, created **PAUSED**, in each of those four ad groups. All old ads keep their current status and history. |

First-run expectation: **22 API operations** = 10 keyword updates + 3 asset creations + 5 asset associations + 4 paused ads. Existing mobile keyword destinations, when present, are updated in the same keyword operation. Already-applied items are skipped; paused target keywords stay untouched, so the count may be lower. A normal repeat after application plans zero operations.

The seven adult keywords are `[50th birthday party venue]`, `[adult birthday party venue]`, `[bowling birthday party for adults]`, `[30th birthday party venue]`, `[birthday party venue for adults]`, `[40th birthday party venue]`, and `[adult birthday party venue near me]`.

The holiday keywords are `[corporate holiday party venue]`, `[holiday party venue]`, and `[holiday party venue near me]`.

## Run it

1. Open Twisted Pin in Google Ads. Go to **Tools → Bulk actions → Scripts** and create a **new** script named `20 - Event landing alignment`.
2. Paste the entire contents of `20_event_landing_alignment.js`, replacing the starter code. Leave `var DRY_RUN = true;` at the top. Save and authorize the script when Google requests it.
3. Click **Preview**. Read the **Logs**, including `PREFLIGHT PASSED` and each `PLAN` entry. This script intentionally calls no mutators in Preview; its Changes tab may be empty. Save the Logs for review.
4. After reviewing the actual account plan, set `DRY_RUN = false`, save and click **Run** once. Google Preview remains read-only even when this flag is false. Do not schedule recurring runs.
5. Check both **Logs and Changes**. Each accepted operation logs its returned resource name. Set `DRY_RUN` back to `true` and Preview again to check fresh state. Unchanged completed items should produce zero planned operations.

A Preview is a read-only account/configuration check, **not** a server-side validation of the mutations or an ad-policy approval. The corrected Google Ads Preview passed and its full 22-operation plan was reviewed. The subsequent live log confirms acceptance of all 22 mutations. Fresh-state checks subsequently passed in Script 20B. All four replacements are under review; approval and activation remain pending. If any expected campaign, ad group, keyword, URL or tracking source differs, the script stops before submitting changes instead of guessing.

The live mutations are sent in one request with `partialFailure: false`; Google documents this as an atomic batch. A timeout or transport failure can leave the client uncertain whether the server applied the request. Do not infer failure or success from that exception: inspect Changes and Preview fresh state before retrying. The script also checks every returned result, rather than treating a non-throwing call as success.

## Ad copy and activation

All copy is in the `ADS20` array near the top of the script and appears in the Preview log. Examples:

| Ad group | Pinned first headline | Destination |
|---|---|---|
| Birthday & Celebrations | Birthday Parties in Plainfield | `/birthday-parties/`, with the adult keyword overrides above |
| Corporate Events | Company Parties in Plainfield | `/corporate-events/`, with the holiday keyword overrides above |
| Team Outings | Team Outings in Plainfield | `/corporate-events/` |
| Employee Appreciation | Employee Appreciation Events | `/corporate-events/` |

The birthday group currently mixes adult, generic birthday and other celebration searches. Its draft therefore describes both routes: **kids' packages book online; adults start with Plan My Birthday**. An adult-only ad would also be eligible for other keywords in that group. Similarly, the corporate draft covers general company parties as well as holiday gatherings. Dedicated adult/holiday ad groups are a possible later restructuring, not part of this script.

Suite copy is semi-private and capacity wording distinguishes up to 80 in the suite from up to 200 with a full-venue buyout. Corporate, team and appreciation drafts retain craft-cocktail messaging. They do not promise automatic whole-suite exclusivity or an all-night reservation.

**Script 20 does not activate the drafts.** The exact-ID verification/activation step is now prepared as [Script 20B](20b_verify_activate_event_ads.md). After reviewing the actual copies and Google's policy status, enable the intended replacement in each group and confirm it is eligible to serve before pausing its corresponding old ad. The log records each old source ad and every new ad resource name. This preserves the recently cleared Corporate ad until the replacement is ready. Ads classified as alcohol information may be Eligible (Limited); that label alone is not a disapproval and is not a reason to misrepresent the offering.

## Safeguards and measurement

- Account and currency checks; exact named, enabled base Search campaigns; current Manual CPC strategy and budgets ($6 Brand / $6 Bar / $32 Open Play / $35 Events).
- Exact keyword and ad-group matching. Other match types and keywords remain untouched, including generic birthdays and bowling-near-me targets.
- Approved old/new URL allowlists; query strings and ValueTrack placeholders preserved verbatim. Existing mobile overrides follow the intended destination. Unknown paths/fragments stop the run.
- New drafts inherit the selected existing ad's URL query parameters, tracking template, suffix, custom parameters and optional mobile URL. Existing keyword tracking fields are not mutated.
- Exactly one current enabled source ad per group is expected. Multiple active ads stop the run for a deliberate tracking-source choice.
- New sitelinks have script-specific names and attach at ad-group scope. Existing assets and associations are not edited or removed. The script refuses to overwrite its own edited assets or reactivate a paused association.
- Complete discovery, copy-length checks, public HTTP/content checks and a second account-state read precede all writes. Mutations have a hard cap of 22 operations.
- No emails, Sheets, Drive, external reporting writes, credentials, customer records, new positive keywords, negatives, bids, budgets, geo, audiences, conversion goals or existing ad statuses.

Save the actual run date and review campaign/ad-group results after fourteen complete subsequent Ads account days. If applied September 14, the first complete window is **September 15–28**, reviewed September 29 or later. That is a different rollout from Script 19's September 14–27 window. Account timezone is **America/New_York**; align operational reporting. Keep purchases/value, event inquiries, directions and calls separate, and connect Avery's qualified/paid events where attribution permits. Do not treat an inquiry as a confirmed booking or a city winner.

## Rollback

Use saved `PLAN.before` URL records to restore only the changed keyword final/mobile URLs. Remove the five **new ad-group associations** by the logged IDs if needed; do not delete a shared sitelink asset or remove unrelated account/campaign associations. The new ads remain paused unless someone subsequently activates them. If an activated replacement needs reverting, restore the original eligible ad before pausing the replacement. Bids, budgets and targeting need no rollback from this script.

## Verification and sources

Run the standalone tests, with no dependencies or Ads account access:

```powershell
node --test --test-reporter=spec scripts/google-ads/20_event_landing_alignment.test.cjs
```

Local tests cover no-write Preview, exact mutation scope, idempotency, mobile/query/tracking preservation, wrong account/currency, drift, missing/duplicate criteria, ad ambiguity, HTTP/content failure, atomic rejection, unknown network outcome, protected paused entities and mixed-intent copy. These mocks validate our logic, not Google's API schema or policy decisions. All five public landing pages were fetched on September 14 and returned HTTP 200; the script's content checks passed against their actual HTML.

Evidence used: the September 12 keyword report and campaign review in the original `Website/Context/google-ads-reviews/2026-09-12/`, the owner-confirmed September 13 execution record in `Website/scripts/google-ads/19_live_2026-09-13.md`, and the September 14 website handoffs in this repository. Those original Ads exports are untracked in the separate original checkout; this branch does not claim to back them up.

Official references checked September 14, 2026:

- [Keyword-specific landing pages](https://support.google.com/google-ads/answer/6371202?hl=en)
- [Google Ads Scripts mutate and atomic batches](https://developers.google.com/google-ads/scripts/docs/concepts/mutate)
- [MutateResult: inspect success and errors](https://developers.google.com/google-ads/scripts/docs/reference/adsapp/adsapp_mutateresult)
- [Referenced-field query error](https://developers.google.com/google-ads/api/reference/rpc/v25/QueryErrorEnum.QueryError)
- [Sitelink asset creation](https://developers.google.com/google-ads/api/samples/add-sitelinks)
- [Responsive search ad creation](https://developers.google.com/google-ads/api/docs/responsive-search-ads/create-responsive-search-ads)
- [Alcohol policy troubleshooting](https://support.google.com/adspolicy/answer/16428720?hl=en)
