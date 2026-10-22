# NYE and Jingle Bowl: Website closeout

Current source index for October 22, 2026. Read `CLAUDE.md` and
`Context/voice.md` first. Backend operations and preserved rehearsal references
belong to TPRS [`docs/EVENTS-2026-CLOSEOUT.md`](https://github.com/jdow800/tprs/blob/main/docs/EVENTS-2026-CLOSEOUT.md).
The new campaign-agent brief is TPRS
[`prompts/holiday-drip-campaign-2026.txt`](https://github.com/jdow800/tprs/blob/main/prompts/holiday-drip-campaign-2026.txt).
These are repository paths; use the corresponding local files when working in
the backend checkout.

## Current public behavior

Website runtime baseline `0729566` includes NYE final copy/share-image release
`6277c9f`, Jingle public launch `ba3b2e3`, repeat-visit lane selection
`27028c0` and the Jingle date-handoff stylesheet fix. The documentation/artwork
closeout does not change that runtime. Historical receipts below describe their
own observation times; their protected-Jingle or pending-release statements
are not current status.

| Surface | Current configuration |
| --- | --- |
| NYE landing `/new-years-eve/` | Public package/event page; dedicated share image `/og/og-nye-2026.jpg` |
| NYE checkout `/reserve/nye/` | Brand flow; fresh sales open November 18 at 9am Central, with retained payment recovery ahead of the gate |
| Jingle `/jingle-bowl/` and `/jingle-bowl/booking/` | Public landing and booking; Traditional/VIP links retain their intended lane choice on repeat visits |
| Jingle homepage invitation | October 22 through December 6 at 3:15pm Central; selected through the shared campaign policy |
| NYE Mirrorball invitation | December 7 at midnight through December 31 at 9:30pm Central |

Homepage promotion, seasonal navigation, event end and backend purchase
eligibility have separate boundaries. Read current source and the backend
catalog/runbook before changing copy or asserting availability. No new live
booking, payment, email or performance measurement is part of this
documentation closeout. Final hosting/HTTP acceptance is recorded in the [combined closeout ledger](https://github.com/jdow800/tprs/pull/470).

## Campaign content and editable sources

| Need | Start here |
| --- | --- |
| NYE platform copy and images | [`Context/marketing/nye-2026/README.md`](../marketing/nye-2026/README.md), [`recommended-social-copy.txt`](../marketing/nye-2026/recommended-social-copy.txt), [`copy.md`](../marketing/nye-2026/copy.md) and `exports/` |
| NYE reproduction | `Context/marketing/nye-2026/artwork/campaign.html`, `scripts/render-nye-marketing.mjs`, `scripts/render-nye-og.mjs` and the export/share manifests |
| Jingle campaign copy | [`Context/jingle-bowl-2026/delivery/recommended-copy.txt`](../jingle-bowl-2026/delivery/recommended-copy.txt) and [`README-delivery.txt`](../jingle-bowl-2026/delivery/README-delivery.txt) |
| Jingle artwork, staff and LED assets | `Context/jingle-bowl-2026/README.md`, `artwork/`, `delivery/staff-7shifts-tldr.txt`, `led/` and `public/jingle-bowl/`; derivative script `scripts/build-jingle-campaign-assets.mjs` |
| Current event facts and guest wording | `src/pages/new-years-eve.astro`, `src/pages/jingle-bowl.astro`, corresponding `src/content/events/` entries and backend event runbooks |

The NYE Facebook event covers have the October 22 crop correction from
`6d1de99`; upload full-size exports, not the QA crops. NYE's eight teaser/open
platform images and separate website share JPEG have distinct jobs. Jon chose
November 18 for Facebook event creation when reservations open. Jingle's
current artwork says "A VISIT WITH SANTA"; older "BOWL WITH SANTA" art is history.

Windows Desktop folders `NYE 2026` and `2026 Jingle Bowl` are delivery copies.
Editable sources and final exports belong in the repository. Prepared copy,
exported files and website publication do not establish that a social post or
text blast was sent. Use the campaign brief for the scope of the next agent's
work and verify publishing history before scheduling or sending anything.

The [combined local delivery check](2026-10-22-events-closeout-verification.json) verifies all eight NYE platform images and all 17 Jingle deliverables against their saved source/manifest. Five plain-text source checkouts differ only by Git CRLF conversion; normalized content matches, while binary and Desktop hashes match exactly. No media was regenerated during consolidation.

## Troubleshooting and dated evidence

| Question | Entry point |
| --- | --- |
| NYE opening, annual rollover or coupon/consent behavior | [`src/tprs/NYE-ANNUAL-PLAYBOOK.md`](../../src/tprs/NYE-ANNUAL-PLAYBOOK.md); `src/config/nye-opening.ts`; `src/components/tprs/nye/` |
| Why the Brand flow handles holds/recovery this way | [`2026-10-21-nye-public-checkout.md`](2026-10-21-nye-public-checkout.md) |
| Final NYE wording, link preview and bounded production evidence | [`2026-10-22-nye-final-release.md`](2026-10-22-nye-final-release.md), preserved from `df4f35c` |
| Shared homepage timing and released campaign proof | [`2026-10-22-nye-campaign.md`](2026-10-22-nye-campaign.md), latest dated receipt from `27474dc`; `src/config/homepage-campaigns.ts` |
| Mirrorball choice and December 7 approval | [`2026-10-21-nye-homepage-options.md`](2026-10-21-nye-homepage-options.md), preserved through `d7f8a81` |
| Ordinary/birthday first-load availability behavior | [`2026-10-21-availability-first-day.md`](2026-10-21-availability-first-day.md), latest receipt from `4b17292`; `src/components/tprs/useAvailability.ts` |
| Jingle implementation and release lineage | [Current Jingle closeout](2026-10-22-jingle-closeout.md), [`2026-10-21-jingle-resumed-rehearsal.md`](2026-10-21-jingle-resumed-rehearsal.md), Jingle README/delivery notes and the backend closeout |

The NYE opening-release receipt `71b7de7` is retained in branch history in
`Context/history/2026-website-decisions.md`; the final release receipt and
current opening policy are the easier present-day entrypoints. Restoration of
dated documents preserves their evidence and limitations, not obsolete release
instructions.

General booking performance optimization remains parked. The NYE landing's
recorded mobile lab LCP was 2.77s, above the 2.5s target; see
`Context/perf-history.md` and `Context/marketing/nye-2026/page-audit-20261022.json`.
That sample is not a checkout speed benchmark or field-performance guarantee.

## Retained rehearsals

Paid NYE previews, backend processes, booking records, protected staff/receipt
origins and their local configuration remain retained. Do not restart an
empty-fixture helper, repoint an origin, merge the rehearsal wrapper or clear a
fixture as part of campaign work. The backend closeout owns the private backup
references and preservation instructions. Unpublished rehearsal source is not
being backed up by publishing tags to the public Website repository.

The approved Brand/public behavior was extracted into production separately.
Old rehearsal branches also lack later shared Jingle safeguards, so they are
historical reproduction sources, not a deployment base. Start future Website
work from fresh `origin/main` in a new worktree and keep unrelated shared-tree
changes out of the task.
