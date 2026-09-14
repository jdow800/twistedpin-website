# Corporate events and regional copy — September 14, 2026

## Change

The corporate page made mobile visitors scroll through six text-heavy use-case cards before seeing the existing VIP-suite video. The video now follows a shorter introduction identifying Plainfield. Its AVIF poster is eager/preloaded; responsive video sources remain deferred and bounded by viewport width. The catering video remains below the fold.

Compact descriptive cards preserve the ad-aligned H1 and the team/staff outing, employee-appreciation, company-party and meeting topics. Duplicate card labels and the unsupported Most booked badge are removed. Capacity is explicit: up to 80 in the suite and up to 200 with a full-venue buyout. AV copy describes the available equipment and asks planners to confirm their setup requirements. Six FAQ answers share one visible/schema source.

The previous regional FAQ is consolidated into a visible paragraph alongside room information, with contextual links to Romeoville, Shorewood, Naperville, Joliet and Bolingbrook, the actual Plainfield address and directions. The broader service area remains in schema. The Romeoville and Shorewood pages replace unsupported competitor/uniqueness claims with venue facts and link directly to corporate-event planning. Their existing approximate mileage remains documented as ops-confirmed May 8; no new drive-time claims were introduced.

No new page URLs, new media, global CTA changes, ad-account changes, booking changes or indexing directives.

## Bing investigation

Before editing, the public corporate URL returned HTTP 200, a self-referencing www/trailing-slash canonical, no noindex meta or X-Robots-Tag, and accessible body content. Robots.txt allows the page and lists working sitemaps; the page is present in sitemap-0.xml.

The owner supplied current Bing Webmaster Tools screenshots: Bing Index says Indexed successfully / URL can appear on Bing. Live URL says URL can be indexed by Bing. Both show No SEO/GEO issues found, and JSON-LD/OpenGraph are detected. An earlier monitoring deindex alert does not describe this current status. A temporary change or monitoring discrepancy is possible; the exact cause was not established. No indexing-policy repair is warranted on this evidence. Request indexing after publication can notify Bing of the content update; it does not guarantee indexing.

Bing AI Performance is a separate citation report. Average cited pages is a daily average of unique pages cited in supported AI answers, not the number of indexed pages. Its trends do not establish the impact of this content update.

References: https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c and https://www.bing.com/toolbox/markup-validator

## Validation and release

- Existing prebuild checks passed: translation freshness, recurrence, event-program answers and 103 estimate assertions.
- Astro compiled and prerendered all three edited pages successfully. Local Vercel packaging hit the previously documented Windows EPERM symlink limitation with shared dependencies. No production configuration was changed to work around it; a Vercel preview build is the release check.
- Generated HTML checks passed for each edited page: one H1, expected canonical, no noindex, valid JSON-LD and descriptions under 170 characters. Corporate checks also cover section order, existing video assets/source breakpoints, one eager poster preload, deferred catering poster, exact FAQ/schema answer parity, six FAQs, the five town destinations, capacity wording, address and the configured inquiry destination. No prohibited marketing wording or unsupported uniqueness claims remained in the edited page bodies.
- No connected browser was available, so a fresh visual/mobile measurement has not been claimed. Existing layout patterns are retained; mobile card body text is 16px, and the shorter hero removes its minimum-height floor.
- Vercel preview and production verification: pending.

Prepared in an isolated worktree from origin/main. Unrelated work in the original checkout is not part of this release. Private advertising analysis and uploaded audit details are intentionally outside this public release record.
