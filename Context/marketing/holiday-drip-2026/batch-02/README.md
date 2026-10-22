# Batch 02 · Cinematic visual direction

**Recommended creative proposal, October 22, 2026. Not scheduled or published.** Jon invited stronger creative judgment: “open to whatever suggestion(s) ... it just needs to be epic.” This batch takes the existing Mirrorball and Santa ideas into new campaign illustrations, keeping event facts and typography editable.

My recommended pair is the mirrored bowling ball for NYE and the festive Santa scene for Jingle. Under Jon's revised cadence, these are alternative visuals for the NYE October 28 and Jingle October 23 occasions. The separate historical-sellout reminder is now proposed for November 9. The alternatives do not add posts; the current cadence and family/earlier/later audience direction are in the parent calendar and campaign manifest.

**Grip corrections:** Jon's two bowling-ball references guide the close finger pair and distinctly lower thumb. Current NYE exports use `artwork/nye-hero-v3-grip-corrected.png`; current Santa exports use `artwork/jingle-hero-v3-grip-corrected.png`. The prior heroes and reference images remain preserved. [NYE edit provenance](artwork/nye-grip-correction.provenance.json) and [Santa edit provenance](../artwork/santa-grip-correction.provenance.json) record the built-in imagegen calls. Guest time-zone labels were removed in copy revision series-copy-v3; actual dates and times are unchanged.

## Review and use

- [Preview/contact sheet](contact-sheet.png) and [gallery with actual copy](review.html).
- [Batch copy](copy.txt), [asset manifest](render-manifest.json), and [full scheduling manifest](../campaign.json).
- [Original calendar](../calendar.md) and [publishing checklist](../publishing-checklist.md).

| Concept | Proposed occasion, America/Chicago | Angle | Formats |
|---|---|---|---|
| 04-nye-mirrorball-moment | Wed Oct 28, 12pm | Give 2026 a proper send-off. Silver mirrorball reimagined as a bowling ball; save the Nov 18 9am reservations opening. | 1080×1350 feed + 1080×1920 Story |
| 05-jingle-santa-arrives | Fri Oct 23, 12pm | Make way for Santa. Festive illustrated Santa, December 6; reservations already open. | 1080×1350 feed + 1080×1920 Story |

One 4:5 feed composition can be used on both Facebook and Instagram, with the platform-specific caption. Each 9:16 Story is laid out separately. The new generated imagery is illustrative, not a claim about an actual installation or a photograph of the venue. Santa carries a bowling ball in keeping with the approved character; the offer remains a visit/photo with Santa, not bowling alongside him.

The first batch is preserved. `campaign.json` records mutually exclusive visual choices: select either the original or the new proposal for each of the first two occasions, never both as an accidental duplicate. Recommended does not mean approved or scheduled. No approval fields or publishing permissions were changed by Jon's invitation to explore.

## Editable source and preservation

`artwork/campaign.html` and `scripts/render-holiday-drip-batch02.mjs` own final compositions, logo, text, opening/date lines and format positioning. `artwork/nye-hero-v3-grip-corrected.png` and `artwork/jingle-hero-v3-grip-corrected.png` are the current hero masters; the v2 masters preserve the prior proposals. Exact generation/edit prompts, references and built-in-tool provenance remain with the campaign. Originals remain at their generated-images location too; project consumption does not depend on that location. Files in `artwork/reference-grips/` are user-supplied geometry references, not campaign publication assets.

The built-in image-generation tool was used; no external API/CLI fallback was used. It produced the hero art only. Jingle's unselected initial generation is archived in `artwork/source-history/` so its subsequent composition edit has a preserved input; it is not a publication asset. The supplied logo and existing Barlow Condensed/Montserrat/Roboto Slab font assets remain independent editable layers. The rejected September brand kit was not used.

From the Website worktree root, after the locked dependencies and matching Playwright Chromium are installed:

```powershell
node scripts/render-holiday-drip-batch02.mjs
node scripts/package-holiday-drip-batch02.mjs
```

Rendering the saved hero pixels is repeatable using recorded tool versions. Regenerating a hero from its saved prompt is generative and may produce a different image; the saved original PNG is the visual authority for this proposal. Keep hero masters, final PNGs, HTML, scripts, manifests and copy in Git. Temporary screenshots and dependencies stay ignored.

Actual platform crop/overlay/sticker preview remains a publishing check. New visual exploration does not change NYE's Nov 18 opening, Jingle's booking status, the website/backend/Roy runtime, or the homepage promotion schedule.
