# Holiday event drips · 2026

**Latest recommendation: [Batch 02 cinematic direction](batch-02/README.md).** Two new hero illustrations with editable typography offer stronger NYE/Jingle visuals for the same first two proposed occasions. Review [the new gallery](batch-02/review.html). Original batch 01 remains below for comparison. The scheduling manifest records the alternatives as mutually exclusive choices, not additional posts.

**Review batch 01. All new dates, captions and compositions are proposed. Nothing in this pack is approved for publication, scheduled or published.** Prepared October 22, 2026 on `codex/holiday-drip-20261022`, from fresh Website `origin/main` at `f8d3e8e23964e554d721eb7725931800d87de489`.

This supplements the social team's regular content. Reserve roughly one weekly NYE feed insertion until reservations open, with a Jingle insertion about every 10–14 days. Some weeks have two event feed posts, separated by several days. Paired Facebook/Instagram versions count as one editorial occasion. Story versions are alternatives or a light companion, not an instruction to publish every asset everywhere.

## Review first

- [Visual gallery](review.html) and [contact sheet](contact-sheet.png): three new compositions, each with independent feed and Story layouts.
- [Calendar](calendar.md): proposed dated cadence, audience, objective and links, including later concepts that have not been produced.
- [Actual first-batch copy](batch-01-copy.txt): platform captions, Story/link treatment and selective SMS/Google options.
- [Scheduling manifest](campaign.json): structured copy, dates, timezone, asset mapping, phase and approval state for both batches. Choose one visual per occasion.
- [Brief research](research-notes.md): source links, evidence limits and the rationale for a light supplemental cadence.
- [Scheduling prompt](schedule-this-campaign.txt): bring this file and the campaign folder into a later session.
- [Publishing checklist](publishing-checklist.md): actual platform checks still needed.
- [QA receipt](qa/verification.json) and [handoff](HANDOFF.md): what was checked and actual Git/delivery status.

## The three ideas

| ID | Proposed first use, Central | Message | Asset files |
|---|---|---|---|
| 01-nye-set-the-clock | Fri Oct 23, 12pm, optional kickoff | The calendar reminder is for reservations opening | `01-nye-set-the-clock-feed.png`, `01-nye-set-the-clock-story.png` |
| 02-jingle-santa-coming | Mon Oct 26, 12pm | Santa is coming December 6; reservations are open now | `02-jingle-santa-coming-feed.png`, `02-jingle-santa-coming-story.png` |
| 03-nye-usually-sells-out | Wed Oct 28, 9am | Historical sellouts give guests a reason to plan ahead | `03-nye-usually-sells-out-feed.png`, `03-nye-usually-sells-out-story.png` |

These are starting proposals, not measured best posting times. The social team's existing calendar takes precedence over a needless collision. If a suitable NYE announcement has already run, skip the optional Oct 23 kickoff. Check recent Jingle posts/texts before adding another announcement. Recalculate relative wording after any date move; absolute dates are printed on these designs.

## Format choices

The 1080 × 1350 (4:5) portrait feed artwork is intended for both Facebook and Instagram feeds. They do not inherently require different files. Captions and link handling differ by platform. Stories use purpose-composed 1080 × 1920 (9:16) artwork with room for native controls and a link sticker. These are composition choices, not claims of mandatory platform dimensions or guaranteed safe zones. Verify the actual organic publishing preview.

The existing 1920 × 1005 Facebook event covers remain in their original packs. They are not substitutes for feed/Story assets. No new cover, video, Google-specific image or additional series artwork is included in batch 01. Optional Google copy can use the existing phase-appropriate landscape image referenced in the manifest.

## Phase and fact controls

- NYE: https://www.twistedpin.com/new-years-eve/. Reservations open **Wednesday, November 18, 2026 at 9am America/Chicago** (`2026-11-18T15:00:00Z`). The event date is December 31. Pre-opening copy does not disclose party times/prices. “Our NYE parties usually sell out” is the approved historical claim; it is not a current inventory statement.
- Jingle: https://www.twistedpin.com/jingle-bowl/. Public and bookable now; event **Sunday, December 6, 2026**. “Santa's coming. Let's roll.” and “Bowling, pizza & a visit with Santa.” remain the approved language. Do not imply Santa bowls alongside guests.
- Neither event takes coupons or loyalty reward offers. No new offer, age restriction, package inclusion or Santa appearance schedule is introduced here.
- November 18 Facebook event creation is separate from its December 31–January 1 event dates. Existing approved copy describes six distinct reservation times. Going/Interested is not a reservation. Jingle's Facebook event URL remains unverified; this pack uses its website link.

## Sources and reproduction

Original assets remain in their tracked source paths; see [NYE index](../nye-2026/README.md) and [Jingle index](../../jingle-bowl-2026/README.md). Current facts come from `src/pages/new-years-eve.astro`, `src/config/nye-opening.ts`, `src/pages/jingle-bowl.astro` and the October 22 event closeouts. New layouts live in `artwork/`, with source hashes and output details in `nye-manifest.json` and `jingle-manifest.json`. The rejected September brand kit was not used.

From the Website repository root, with Node meeting `package.json` and locked dependencies installed:

```powershell
npm ci --no-audit --no-fund
npx playwright install chromium
node scripts/render-holiday-drip-nye.mjs
node scripts/render-holiday-drip-jingle.mjs
node scripts/package-holiday-drip.mjs
```

The rendering scripts use local assets, block browser network requests and do not build/deploy the Website. `npm ci` / browser installation only prepare local dependencies. No environment files or production credentials are needed. Renderers write this campaign folder; final exports, editable sources, manifests and contact sheet are intended to stay in Git. Dependencies and temporary caches remain ignored. Desktop folders are convenience deliveries, not the only archive.

New work remains review material until Jon chooses the direction. His request specifies committing/pushing approved durable content to the feature branch; check the handoff for the actual approval and backup status rather than assuming that the folder's location means it is backed up.
