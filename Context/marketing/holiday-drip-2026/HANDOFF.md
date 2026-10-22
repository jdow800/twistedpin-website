# Holiday drips · Batch 01 handoff

Prepared October 22, 2026. **Creative review, not publication.**

## Current deliverable

Three new compositions, each in 1080×1350 feed and 1080×1920 Story: NYE “Set the clock,” Jingle “Santa's coming. Let's roll,” and NYE historical sellout reminder. Shared feed files work as the starting composition for both Facebook and Instagram; separate captions provide the correct link treatment. Story files are independently laid out, not crops of event covers.

The combined proposed calendar has 19 rows, including optional channels and later concepts. Only the first three creative concepts plus the optional Jingle Google/SMS copy have been prepared. The remainder are clearly `concept_only_not_ready_to_schedule` in `campaign.json`. No daily campaign is intended. The first NYE kickoff is optional; the lightest start is Jingle October 26 at noon and NYE October 28 at 9am Central.

NYE's opening remains November 18, 2026 at 9am America/Chicago, distinct from the December 31 parties. Jingle is bookable now for December 6. New artwork includes absolute dates and avoids fragile numeric countdowns. Historical sellout wording comes from Jon; no inventory count was accessed or invented.

## Start the next session

Use `schedule-this-campaign.txt` with this whole campaign folder. `campaign.json` owns the machine-readable dates, captions, variants, assets, URLs, phase constraints and execution states. `calendar.md` is the readable overview. The future agent must reconcile the team's existing calendar and the selected channels, rather than treating every optional image/variant as another post.

New creative, proposed times and channel selections await Jon's review. All approval fields are null and selected channels are empty. Publication/scheduling/SMS authorization is false. The separate authority needed for posting, scheduling, sends or ad spend is stated in Jon's task; this is not a new permission rule introduced by the pack.

## Validation completed

- Root visually inspected all six exports, then the combined contact sheet. The Jingle renderer's switch from Edge to bundled Chromium was also visually rechecked by its artwork reviewer.
- Fonts and images decode; canvas bounds and conservative Story text margins pass. All six PNGs are below 5MB. Source/output manifests retain dimensions and hashes, with LF normalization explicitly labeled for editable text and exact bytes for binary assets.
- Both renderers record Node, Playwright, Sharp and browser versions. Browser network is blocked during rendering. Reproduction uses locked dependencies plus the matching Playwright Chromium; no production configuration is needed.
- Packaging verifies six unique exports, dimensions/hashes, phase/asset mappings, NYE opening instant, Chicago offsets and all 19 calendar records. Independent review compared every FB/IG caption, alternate IG closing paragraph, optional Google/SMS draft and calendar timestamp to the human-readable sources.
- The local review gallery loaded all six images without horizontal overflow at 390px and 1440px. Root inspected both viewport captures. Temporary screenshots stay in ignored `.astro/holiday-drip/`.
- Direct anonymous GETs returned HTTP200 for both canonical landing URLs on October22, with no password form. This is link/readiness evidence only, not an inventory or checkout test. Web-search's cached NYE page was stale, so it was not used to override current tracked content or the direct read.
- `git diff --check` is clean. Only campaign documentation/artwork/render scripts and the Decisions Log are in scope; no runtime files were changed and no application test/build was necessary.

Actual Facebook/Instagram upload/reposition, grid crops and Story link/control overlays remain untested. No social account/schedule or messaging history was inspected. The Jingle Facebook event URL is unknown; this pack uses the canonical website. No guaranteed notifications, reach or sales outcome is claimed.

## Source and backup status

Worktree: `C:/Users/jdow8/dev/website-holiday-drip-20261022`.

Branch: `codex/holiday-drip-20261022`, freshly based on origin/main `f8d3e8e23964e554d721eb7725931800d87de489`. Shared Website/tprs checkouts and retained paid fixtures were left alone.

The review snapshot is committed locally on this branch. **It has not been pushed.** New creative remains unapproved; Jon's brief requests pushing approved durable source/content. Record approval and push the feature branch after review. Do not push/merge Website main; it auto-deploys. Obtain the actual snapshot commit with `git log -1 --oneline -- Context/marketing/holiday-drip-2026` rather than assuming the base hash above is the deliverable commit.

Editable HTML, render scripts, all six final PNGs, the existing Google reference image, copy, calendar, manifest, contact sheet and gallery are included in the review snapshot. Original Santa/Mirrorball/logo/photo assets remain in their tracked original locations. Dependencies/caches and temporary viewport screenshots are ignored. The rejected September brand kit was not used.

## Desktop delivery

The combined review pack is copied into `Drip review - batch 01` beneath both requested Desktop folders:

- `C:/Users/jdow8/OneDrive/Desktop/NYE 2026`
- `C:/Users/jdow8/OneDrive/Desktop/2026 Jingle Bowl`

Each parent also receives `Holiday-drip-2026-batch-01-REVIEW.zip`, a convenient bundle for a later prompt. The zip is a scheduling/review bundle; full asset reproduction uses this repository and its original tracked inputs. Existing Desktop files are retained. Source/delivery file hashes are checked; Desktop copies are not the editable authority or a claim of GitHub backup.

No posts, schedules, texts, emails, ad purchases, runtime edits, holds, charges, refunds or production data changes were made.
