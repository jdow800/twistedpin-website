# Jingle Bowl: six remaining dates

Six distinct editable compositions, each in 1080×1350 feed and 1080×1920 Story. These artwork files are prepared for the coordinated campaign; nothing is scheduled or published.

Edit artwork.html, then run `node scripts/render-holiday-series-jingle.mjs` from the Website repository. Install the locked dependencies and bundled Chromium first if needed. The renderer embeds tracked source assets and fonts, blocks external requests and writes exports, manifest.json and a 360-pixel-wide phone contact sheet.

The manifest is the integration contract: records[].calendar_id, format, path (relative to the campaign folder), width, height, sha256, alt, text and phase. It also records the exact input assets, provenance and reproduction steps.

The actual bowling and suite photos retain their original pixels. Santa uses the approved illustration with the owner-requested finger/thumb-hole correction; prior master retained. The cocoa piece uses symbolic code-native line art and typography, not a food-product photograph. The package quantities remain per lane. The grip correction used built-in imagegen. Exact edit prompts, references and selected masters are preserved in artwork/santa-grip-correction.provenance.json at the campaign root.

Story controls and a native link sticker must be checked in the actual app. Suggested sticker area: x260 y1620, 560×110. Verify availability before booking invitations; December4 is not a booking deadline.
