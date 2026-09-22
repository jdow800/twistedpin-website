# Company holiday-party page — September 14, 2026

## Owner direction

Jon approved a focused release on the existing /holiday-parties/ address after the corporate and adult-birthday releases. Company holiday parties, staff appreciation and end-of-year celebrations are the primary audience. Other holiday groups remain welcome. Inquiries use the existing planning form and event team for planning and booking.

## Changes

- The hero names company holiday parties and Plainfield, IL, with a short introduction and Plan My Holiday Party button. The closing button uses the same label and PLAN_EVENT_URL constant.
- Existing VIP-suite footage remains the first section after the hero. Its direct AVIF poster is preloaded at all sizes; bounded mobile/desktop video sources remain deferred. Catering footage remains below with a deferred poster.
- Capacity is explicit: up to 80 guests in the semi-private suite, up to 200 with a full-venue buyout. The event plan confirms space, party time and setup arrangements. The page does not promise all-night access or imply any VIP-lane booking reserves all six lanes.
- Catering and bar copy directs planners to confirm menu choices, dietary needs and billing arrangements. Unconfirmed plated/family-style service, seasonal menu promises, dietary guarantees and response-speed claims were removed.
- One compact paragraph links the five owner-priority surrounding towns and names the actual Plainfield address using shared NAP constants. No drive times or extra city pages.
- Six practical FAQs use one answer source for HTML and JSON-LD. The Service metadata now reflects the company focus, and the existing OG image description matches the inspected catering photograph.
- Existing URL, breadcrumbs and corporate/NYE links remain. Seasonal promos/navigation, global Reserve/Plan controls, Zite, booking products and Ads are unchanged. No new media or dependencies.

## Validation and release

Required prebuild checks passed: translation freshness, recurring dates, program answers and 103 estimate checks. Astro compiled and prerendered the holiday page and the rest of the site. Local Vercel packaging stopped at the known Windows node_modules-junction symlink EPERM; final cloud packaging passed on Vercel. Local live-menu credentials are absent, so local build output is not deployed directly.

Rendered HTML inspection passed: one H1, unique IDs, self-canonical/indexable metadata, the company/Plainfield title and accurate OG description, two Plan My Holiday Party links to the existing Zite destination, six exact FAQ HTML/schema matches, Service/provider/breadcrumb markup, one five-town paragraph with shared NAP, all 11 internal content destinations, preserved holiday section anchors and the existing deferred video sources. The suite video is immediately after the hero with an eager, preloaded poster. Retired all-night, menu-format and response-speed promises are absent.

Reproduce with npm run build, then inspect dist/client/holiday-parties/index.html (and the same live URL after deployment). Compare the six details answers with FAQPage JSON-LD; verify both named buttons use PLAN_EVENT_URL, the room/food/FAQ/closing anchors exist, the five town links plus venue/menu/corporate/NYE links resolve, and the route remains in the production sitemap. The Vercel cloud build is the final packaging check.

No connected browser is available in this session, so responsive visual and browser-interaction checks have not been performed. Vercel preview and production builds passed, and live verification completed successfully.


## Production verification

- Code commit: `aad9c10999fecb0dab7209a0af56448b86396ae9`, pushed to the existing public website repository and main branch.
- Vercel Preview deployment `6442288105` and Production deployment `6442317179` succeeded.
- The live /holiday-parties/ page passed the rendered HTML, CTA, metadata, FAQ/schema, regional-copy, anchor and video-loading checks above.
- All 11 content destinations and the existing Zite destination returned HTTP 200 on ordinary GET requests. A header-only request was rejected during the first link check; the normal page requests all succeeded. No form was submitted.
- The route remains in /sitemap-0.xml. Indexing and ranking outcomes are not asserted.
- The production tap menu retained 28 MenuItem entries; local missing credentials did not affect the deployed menu.
- Responsive visual and browser-interaction QA remain unperformed because no browser was connected. No new media, dependencies, global controls, booking rules or advertising changes.
