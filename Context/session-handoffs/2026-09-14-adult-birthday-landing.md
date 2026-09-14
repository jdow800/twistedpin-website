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

No connected browser is available; browser interaction and responsive visual QA have not been exercised. Vercel preview and production release are pending.
