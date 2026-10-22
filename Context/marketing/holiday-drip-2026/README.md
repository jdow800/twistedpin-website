# Holiday event drips · 2026

**Start with the [dated posting folders](posting-dates/START-HERE.html).** Each of the 16 occasions has one recommended feed graphic, a separate optional Story graphic and the matching Facebook/Instagram copy in its own folder. The full delivery is `posting-folders-v1`; the original three concepts and two Batch 02 alternatives remain source material, not extra posts.

**Latest owner refinements:** guest-facing graphics and all caption/Story variants omit time-zone labels; the scheduler still uses America/Chicago and UTC. Both Santa illustrations now use corrected bowling-ball grips, with a close finger pair and a separated lower thumb. The exact imagegen edit prompts, original sources and corrected masters are preserved in [edit provenance](artwork/santa-grip-correction.provenance.json). Facebook copy includes the matching event URL; Instagram uses a verified bio link or the supplied plain-address fallback, and Stories require the supplied native link sticker.

**Current execution: all 16 occasions are scheduled through AdaptlyPost to Facebook Twisted Pin and Instagram @twistedpinplainfield, following Jon's explicit authorization on October 22.** This is 32 feed deliveries, October 23 through December 28. All saved accounts, captions, images, alt text and dates were read back and verified; zero failures or duplicates. Nothing is published yet. See the [schedule receipt](scheduling/receipt.json) and [current handoff](HANDOFF.md). Do not submit the campaign again. Optional Stories and Google/SMS extras remain unscheduled.

This supplements the social team's regular content. NYE starts slowly, has a tomorrow reminder on November 17 and an opening announcement on November 18, then continues with varied booking posts through December 28. Jingle runs weekly on Fridays through December 4, its final weekend reminder. Paired Facebook/Instagram versions count as one editorial occasion. Usually there are one or two combined event feed occasions a week; November 17, 18 and 20 deliberately create three during NYE opening week. Stories remain optional companions.

The active calendar has **16 Meta occasions plus three optional extras**, totaling 19 rows. The first NYE announcement is part of the revised plan, not an optional additional kickoff. The campaign contains no November 15 reminder or December 6 Jingle post.

**The scheduled series uses the 16 selected feed images and copy revision `series-copy-v3`.** The 16 optional Stories remain prepared only. Facebook uses the full canonical caption; Instagram uses the approved plain-address fallback because the corresponding bio links were unverified. Six captions use one relevant emoji each, ten use none, and there is no automatic hashtag block. GPT-6.1 Sol on Ultra reviewed the creative pack, final submission payload and remote readback.

**Audience direction:** Jingle is explicitly for families and may depart substantially from the venue's usual positioning. NYE's earlier parties strongly welcome families; later parties lean more adult in tone while still welcoming families. Jon's event-specific direction controls this campaign. The current positioning report may lightly inform imagery and copy, but generic adults-first emphasis must not crowd out this welcome. Do not invent an adults-only rule or a late-party age cutoff. Guest-facing Santa copy still promises a visit with Santa, not bowling alongside him.

## Review first

- [Dated-folder overview](posting-dates/START-HERE.html), [posting calendar](posting-dates/POSTING-CALENDAR.txt) and [complete contact sheet](posting-dates/CONTACT-SHEET.png): the recommended 16-occasion delivery.
- Each dated folder contains `01-FEED-Facebook-and-Instagram.png`, `02-OPTIONAL-STORY.png`, `RECOMMENDED-COPY.txt` and `post.json`.
- [Full-series copy gallery](copy-review.html) and [readable copy](full-series-copy.md): 16 artwork headlines, Facebook/Instagram captions, bio-link alternatives and optional Story messages for review.
- [Calendar](calendar.md): proposed dated cadence, audience, objective, links and actual artwork readiness.
- [First-batch copy](batch-01-copy.txt): synchronized prepared-art captions and the unchanged selective SMS/Google drafts.
- [Scheduling manifest](campaign.json): `post_copy_drafts` is canonical for all 16 occasions, keyed by `calendar_id`, with copy revision `series-copy-v3`. `delivery_folder`, `delivery_concept_id` and variant asset paths identify the supplied recommendation. `artwork_status: prepared_for_review` and calendar `ready_for_review` describe preparation, not approval.
- [Original gallery](review.html) and [Batch 02 gallery](batch-02/review.html): preserved source concepts and alternatives for comparison, not another publishing series.
- [Brief research](research-notes.md): source links, evidence limits and the rationale for a light supplemental cadence.
- [Creative brief](creative-brief.md): the identified October 2026 positioning report, later owner corrections and the campaign-specific family/daypart direction. Read it before new image or copy work; do not assume the maintained v1.0 file is the newest authority.
- [Scheduling prompt](schedule-this-campaign.txt): bring this file and the campaign folder into a later session.
- [Publishing checklist](publishing-checklist.md): actual platform checks still needed.
- [QA receipt](qa/verification.json) and [handoff](HANDOFF.md): what was checked and actual Git/delivery status.

## Preserved original concepts and current dates

| ID | Proposed first use, Central | Message | Asset files |
|---|---|---|---|
| 01-nye-set-the-clock | Wed Oct 28, 12pm | The calendar reminder is for reservations opening | `01-nye-set-the-clock-feed.png`, `01-nye-set-the-clock-story.png` |
| 02-jingle-santa-coming | Fri Oct 23, 12pm | Santa is coming December 6; reservations are open now | `02-jingle-santa-coming-feed.png`, `02-jingle-santa-coming-story.png` |
| 03-nye-usually-sells-out | Mon Nov 9, 12pm | Historical sellouts give guests a reason to plan ahead | `03-nye-usually-sells-out-feed.png`, `03-nye-usually-sells-out-story.png` |

The scheduled delivery selects Batch 02's `04-nye-mirrorball-moment` for October 28 and `05-jingle-santa-arrives` for October 23, plus the original historical-sellout layout for November 9. Thirteen additional feed/Story pairs complete the prepared series. Only the feed is scheduled. Retained originals and alternatives do not create extra occasions. The structured source records approval, chosen channels and exact AdaptlyPost IDs.

**Scheduled NYE dates:** October 28 and November 9 at noon; November 17 at 6pm; November 18 at 9am; November 25, December 7, 16, 23 and 28 at noon. **Scheduled Jingle dates:** October 23, 30, November 6, 13, 20, 27 and December 4 at noon. All are America/Chicago, with daylight saving offsets verified. These are practical chosen times, not measured engagement optima. The AdaptlyPost queue was empty before this submission; calendars outside AdaptlyPost were not inspected. Recalculate relative wording if a post is moved.

## Format choices

The 1080 × 1350 (4:5) portrait feed artwork is intended for both Facebook and Instagram feeds. They do not inherently require different files. Captions and link handling differ by platform. Stories use purpose-composed 1080 × 1920 (9:16) artwork with room for native controls and a link sticker. These are composition choices, not claims of mandatory platform dimensions or guaranteed safe zones. Verify the actual organic publishing preview.

The existing 1920 × 1005 Facebook event covers remain in their original packs. They are not substitutes for feed/Story assets. No new cover, video, Google-specific image or additional series artwork is included in batch 01. Optional Google copy can use the existing phase-appropriate landscape image referenced in the manifest.

## Phase and fact controls

- NYE: https://www.twistedpin.com/new-years-eve/. Reservations open **Wednesday, November 18, 2026 at 9am America/Chicago** (`2026-11-18T15:00:00Z`). The event date is December 31. Pre-opening copy does not disclose party times/prices. “Our NYE parties usually sell out” is the approved historical claim; it is not a current inventory statement.
- Jingle: https://www.twistedpin.com/jingle-bowl/. Public and bookable now; event **Sunday, December 6, 2026**. “Santa's coming. Let's roll.” and “Bowling, pizza & a visit with Santa.” remain the approved language. Do not imply Santa bowls alongside guests.
- Neither event takes coupons or loyalty reward offers. No new offer, age restriction, package inclusion or Santa appearance schedule is introduced here.
- November 18 Facebook event creation is separate from its December 31–January 1 event dates. Existing approved copy describes six distinct reservation times. Going/Interested is not a reservation. The canonical website link is primary for booking posts; a verified Facebook event URL may be a secondary link after the NYE event is created. Jingle's Facebook event URL remains unverified.
- Safe NYE convenience wording is “The party essentials are covered. You bring your people,” followed by the actual inclusions: bowling for the chosen party time, shoes, one large pizza, one soda pitcher and party favors per lane. “Everything handled” or “all-inclusive” overstates the package. Decor service is not promised. Arcade cards, cocktails and additional food/drinks are separate; only the 10pm party includes the specified midnight toast, and that time stays out of pre-opening copy.

## Sources and reproduction

Original assets remain in their tracked source paths; see [NYE index](../nye-2026/README.md) and [Jingle index](../../jingle-bowl-2026/README.md). Current facts come from `src/pages/new-years-eve.astro`, `src/config/nye-opening.ts`, `src/pages/jingle-bowl.astro` and the October 22 event closeouts. New layouts live in `artwork/`, with source hashes and output details in `nye-manifest.json` and `jingle-manifest.json`. The rejected September brand kit was not used.

The following render/package commands reproduce the historical review pack from commit `f96ca957845713d648e226bbdf0bde8a8a40fe70` in an isolated checkout. Review packagers intentionally refuse the now-scheduled manifest so they cannot erase execution records. Do not rerun them over this current delivery. Current status/receipt regeneration uses `node scripts/record-holiday-scheduling.mjs`, followed by `scripts/deliver-holiday-posting-folders.ps1`; neither sends or schedules a post.

Historical review reproduction, with Node meeting `package.json` and locked dependencies installed:

```powershell
npm ci --no-audit --no-fund
npx playwright install chromium
node scripts/render-holiday-drip-nye.mjs
node scripts/render-holiday-drip-jingle.mjs
node scripts/render-holiday-drip-batch02.mjs
node scripts/render-holiday-series-nye.mjs
node scripts/render-holiday-series-jingle.mjs
node scripts/package-holiday-posting-folders.mjs
node scripts/package-holiday-drip-copy.mjs
node scripts/package-holiday-drip.mjs
node scripts/package-holiday-drip-batch02.mjs
& scripts/deliver-holiday-posting-folders.ps1
```

The rendering scripts use local assets, block browser network requests and do not build/deploy the Website. `npm ci` / browser installation only prepare local dependencies. No environment files or production credentials are needed. Renderers write this campaign folder; final exports, editable sources, manifests and contact sheet are intended to stay in Git. Dependencies and temporary caches remain ignored. Desktop folders are convenience deliveries, not the only archive.

The dated-folder packager reads the canonical captions and source-art manifests, then produces the portable `posting-dates/` delivery, including `campaign-manifest.json`, the per-date `post.json` files, `START-HERE.html/.txt`, `POSTING-CALENDAR.txt`, `SCHEDULING-PROMPT.txt` and `CONTACT-SHEET.png`. The copy and historical packagers refresh their views afterward. Edit canonical fields and sources, then regenerate; do not maintain independent Desktop copy. Intermediate proposals remain only in the ignored `.astro/holiday-copy/` workspace. Optional Google/SMS extras remain separate and are not additional dated Meta folders.

The main convenient delivery is `C:/Users/jdow8/OneDrive/Desktop/Twisted Pin Holiday Campaign 2026`, containing the portable `posting-dates/` contents, with `Twisted-Pin-Holiday-Campaign-2026.zip` beside it. The prior Batch 02 full-pack locations are also refreshed. Desktop files and ZIP copies passed SHA-256 readback. Editable source and final exports were committed as `7606ced` and pushed to `origin/codex/holiday-drip-20261022`; see the handoff for the verified backup and subsequent documentation closeout. No Website main push or merge was performed, and nothing has been scheduled or published.
