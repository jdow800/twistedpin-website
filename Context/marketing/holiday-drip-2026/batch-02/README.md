# Batch 02 · Cinematic visual direction

**Recommended creative proposal, October 22, 2026. Not scheduled or published.** Jon invited stronger creative judgment: “open to whatever suggestion(s) ... it just needs to be epic.” This batch takes the existing Mirrorball and Santa ideas into new campaign illustrations, keeping event facts and typography editable.

My recommended pair is the mirrored bowling ball for NYE and the festive Santa scene for Jingle. These are alternative visuals for the existing October 23 and October 26 occasions, not two additional posts. The October 28 historical-sellout reminder remains available from batch 01.

## Review and use

- [Preview/contact sheet](contact-sheet.png) and [gallery with actual copy](review.html).
- [Batch copy](copy.txt), [asset manifest](render-manifest.json), and [full scheduling manifest](../campaign.json).
- [Original calendar](../calendar.md) and [publishing checklist](../publishing-checklist.md).

| Concept | Proposed occasion, America/Chicago | Angle | Formats |
|---|---|---|---|
| 04-nye-mirrorball-moment | Fri Oct 23, 12pm, optional kickoff | Give 2026 a proper send-off. Silver mirrorball reimagined as a bowling ball; save the Nov 18 9am reservations opening. | 1080×1350 feed + 1080×1920 Story |
| 05-jingle-santa-arrives | Mon Oct 26, 12pm | Make way for Santa. Festive illustrated Santa, December 6; reservations already open. | 1080×1350 feed + 1080×1920 Story |

One 4:5 feed composition can be used on both Facebook and Instagram, with the platform-specific caption. Each 9:16 Story is laid out separately. The new generated imagery is illustrative, not a claim about an actual installation or a photograph of the venue. Santa carries a bowling ball in keeping with the approved character; the offer remains a visit/photo with Santa, not bowling alongside him.

The first batch is preserved. `campaign.json` records mutually exclusive visual choices: select either the original or the new proposal for each of the first two occasions, never both as an accidental duplicate. Recommended does not mean approved or scheduled. No approval fields or publishing permissions were changed by Jon's invitation to explore.

## Editable source and preservation

`artwork/campaign.html` and `scripts/render-holiday-drip-batch02.mjs` own final compositions, logo, text, opening/date lines and format positioning. `artwork/nye-hero-v2.png` and `artwork/jingle-hero-v2.png` are the saved original hero outputs. Their exact generation prompts, references and built-in-tool provenance are in the adjacent JSON files. Originals remain at their generated-images location too; project consumption does not depend on that location.

The built-in image-generation tool was used; no external API/CLI fallback was used. It produced the hero art only. Jingle's unselected initial generation is archived in `artwork/source-history/` so its subsequent composition edit has a preserved input; it is not a publication asset. The supplied logo and existing Barlow Condensed/Montserrat/Roboto Slab font assets remain independent editable layers. The rejected September brand kit was not used.

From the Website worktree root, after the locked dependencies and matching Playwright Chromium are installed:

```powershell
node scripts/render-holiday-drip-batch02.mjs
node scripts/package-holiday-drip-batch02.mjs
```

Rendering the saved hero pixels is repeatable using recorded tool versions. Regenerating a hero from its saved prompt is generative and may produce a different image; the saved original PNG is the visual authority for this proposal. Keep hero masters, final PNGs, HTML, scripts, manifests and copy in Git. Temporary screenshots and dependencies stay ignored.

Actual platform crop/overlay/sticker preview remains a publishing check. New visual exploration does not change NYE's Nov 18 opening, Jingle's booking status, the website/backend/Roy runtime, or the homepage promotion schedule.
