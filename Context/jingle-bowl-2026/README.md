# Jingle Bowl campaign review

This Website worktree contains the event landing page, three homepage visual treatments, a calendar review and an isolated booking-date handoff demo. Jon authorized a live review protected by his chosen password on October 21, 2026. The intended event URL is `/jingle-bowl/`.

## Review routes

- `/jingle-bowl/` — event-page design with approved lane prices, package inclusions, reservation times and closing information; production checkout/tax verification remains pending.
- `/jingle-bowl-concepts/` — homepage options, downloadable art, booking-date demo, approved 39-reservation session table.
- `/review/jingle-calendar/?month=2026-12` — actual calendar renderer with the draft event included.

The ordinary Upcoming Events calendar excludes the draft. These paths are noindex and excluded from the sitemap; public booking and checkout are unchanged. The preview uses no TPRS inventory, carts or payments.

## Artwork preservation

Jon approved replacing the artwork's "Bowl with Santa" wording on October22.
Current square and wide masters are `artwork/jingle-square-santa-visit-master.png`
and `artwork/jingle-wide-santa-visit-master.png`. The built-in image_gen edits replace
only the supporting line with "A VISIT WITH SANTA". Exact prompts and provenance
are in `artwork/text-revision-20261022.json`. Earlier square artwork remains in Git
history; the original wide and transparent Santa masters and `artwork/prompts.json`
remain as historical source. All masters are Git-tracked, not ignored cache files.

`public/jingle-bowl/jingle-square.png` is the1254px download, and `jingle-wide.png`
is the1200×630 export. Current WebP derivatives are1000px square (127,324 bytes)
and1200×630 wide (118,522 bytes); the existing420px transparent Santa is unchanged.
Regenerate compression/resizing with `node scripts/build-jingle-campaign-assets.mjs`.
Visual text edits used the built-in image tool; Sharp only exports the derivatives.
No rejected September8 design kit was used.

## Operating assumptions

Confirmed Sunday, December 6, 2026; only Jingle Bowl reservations all day. The approved 39-reservation schedule contains 29 Traditional and 10 VIP reservations over five 90-minute starts, with a 30-minute per-start booking cutoff when space remains. Base lane prices are $149.95 Traditional and $189.95 VIP. Jingle Bowl activities end at 5:15pm; the venue closes and all guests depart by 5:30pm. Arrive on time, clear the booked lane/seats/belongings at the reserved end, and use the arcade or an available waiting area afterward only until 5:30pm. Opening/staffed and Santa visit times remain unconfirmed; no early entry is implied. Jon approved immediate sales opening without announcement, but production catalog/tax/fee verification and booking readiness remain separate gates. VIP includes one basket of fries per lane; ordinary72-hour cancellation and the10% fee are approved. Final production quote verification and Shanna proof remain pending. Google Closed must not block event reservations; Roy's guest link stays withheld until actual booking readiness is verified. See the resumed rehearsal handoff for current implementation evidence.

TPRS implementation needs all-channel event-day exclusivity and aggregate per-start quotas alongside shared physical pools, cart/payment ownership and turnover. Current NYE infrastructure is reusable, but event-specific reports/messages/forms need deliberate Jingle work.

## Validation

Local 390px and 1440px headless browser review checks landing layout, fonts/assets, anchor and FAQ behavior, date changes/focus, homepage selectors/replay and reduced motion. No TPRS requests are made. Six repository prebuild checks pass; Astro compile/prerender passes. Local Vercel packaging is blocked by Windows symlink privileges with a junction-backed node_modules tree, so Linux Vercel build success must be verified before calling the release complete. Sitemap exclusion was independently checked using the real integration. The dev/build Vite caches are separated to prevent production JSX runtime contaminating local hydration.

## Development

Use the existing repository Node version and install dependencies normally. `npm run dev -- --host 127.0.0.1 --port 4396` starts Astro. The two dedicated server environment variables are JINGLE_REVIEW_PASSWORD and JINGLE_REVIEW_SESSION_SECRET. Keep them out of source control. The local dependency junction is a workstation convenience, not part of the source project.

Launch removal requires a coordinated change: finalize checkout links and TPRS/Offer schema, remove password protection, publish the calendar entry, add selected homepage/nav/promo placements, restore public indexing/sitemap/tracking, update the legacy event redirect, and verify the live guest flow. Do not simply remove the password while proposal copy remains.
