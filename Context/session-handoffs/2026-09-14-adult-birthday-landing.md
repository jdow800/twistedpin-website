# Adult birthday landing page — September 14, 2026

## Owner direction

Kids' birthday parties normally self-book online. Adult birthday parties go through the existing event inquiry form and event team for planning and booking. Jon approved a dedicated adult birthday landing page with a Plan My Birthday CTA. Adult and 21st/milestone celebrations are the focus; the page does not pitch teen parties. Showers and gender reveals keep their existing destination.

## Implemented path

- Birthdays menu quick link remains /birthday-parties/.
- Kids' choice opens /reserve/birthdays/; existing package information remains on the birthday entry page at #kids.
- Adult choice opens /adult-birthday-parties/; existing /birthday-parties/#adults inbound links land on this choice.
- Plan My Birthday uses PLAN_EVENT_URL from src/lib/links.ts, so the existing inquiry-platform toggle remains authoritative.
- Related links connect the new page with /events/ and /showers/.

The adult page uses the existing VIP-suite and catering videos, the shared editorial layout and global FAQ accordions. Its introduction is short, with the suite video first. FAQ text has one source for HTML and JSON-LD. Page metadata, Service and breadcrumb markup are specific to adult birthday planning; the existing sitemap integration discovers the new route. The reused videos retain their existing canonical VideoObject entries.

Kids' package prices, inclusion lists, cancellation terms and booking behavior remain in place. Global header/drawer/sticky Reserve and Plan controls are unchanged. No booking-engine, event-form or advertising-account changes.

## Validation and release

Required prebuild checks passed: translation freshness, recurring dates, program answers and 103 estimate checks. Astro compiled and prerendered all pages, including the new route. Local Vercel packaging ends at the known Windows symlink EPERM; final packaging must pass on Vercel. Live menu credentials are intentionally absent from this isolated checkout, so menu rendering is checked on production.

Rendered HTML verification passed for the four affected pages: one H1, unique IDs, self-canonical/indexable metadata, valid JSON-LD, exact adult FAQ HTML/schema parity, correct birthday choices and Zite CTA targets, existing inbound anchors, working internal targets, and bounded/deferred video sources. Kids' package cards, prices, inclusions and cancellation FAQ match the previous release. The existing social-sharing image was inspected and its birthday-page alt text corrected to match the photo.

No connected browser is available; browser interaction and responsive visual QA have not been exercised. Vercel preview and production release both passed for code commit 1f4f45b.


### Production verification

- Code commit: `1f4f45b56c42bdd225578ba6eec03daf8c19e200`, pushed to main.
- Vercel Preview and Production builds succeeded. Production deployment ID: `6440806610`.
- Live /adult-birthday-parties/, /birthday-parties/, /events/ and /showers/ passed the rendered-content and navigation checks above.
- The adult page is present in /sitemap-0.xml and self-canonical/indexable; indexing/ranking outcomes are not asserted.
- Kids' booking and the existing Zite destination both returned HTTP 200. No form was submitted.
- Production tap list retained all 28 menu items; local missing menu credentials did not affect the deployed build.
- Birthday choices, legacy #adults, #kids, both Plan My Birthday links and the corrected social-image description were verified in production HTML.

Manual browser/phone review remains available as a follow-up; no browser was connected during this release. There were no changes to the event form or booking engine.
