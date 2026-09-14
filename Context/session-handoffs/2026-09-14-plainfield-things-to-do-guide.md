# Plainfield things-to-do guide — September 14, 2026

## Owner direction

After the corporate/regional, adult-birthday, company-holiday and bowling releases, Jon selected the existing things-to-do guide as the next focused update. The guide should connect local discovery to the venue's revenue-producing experiences while retaining useful outdoor and brewery alternatives. This release does not include NYE packages, a bar-page redesign, homepage event modules or Google Ads changes.

## Implementation

- Existing URL: /blog/things-to-do-plainfield-il/. The title retains the Plainfield search topic without claiming a market-wide best; the description reflects the revised article.
- The opening serves tonight/weekend planning. Karaoke and Singo mentions point to the existing calendar and explicitly require choosing a listed date. No recurring days, times or season-end dates are copied into this static article, and no nightly or year-round availability is promised.
- Craft cocktails retain the approved Brian Van Flandern/Food Network credit. Craft beer, food and cocktail sections link the current menus. The 28-tap wall is described as a mixed selection, not 28 craft beers.
- Adult/milestone birthdays, company/staff appreciation outings, company holiday parties and showers link their corresponding landing pages and event-team booking route. Kids' packages link /birthday-parties/#kids and /reserve/birthdays/ for online booking. Ordinary bowling links /reserve/ and /bowl/.
- VIP capacity is up to 80, with up to 200 for full-venue buyouts. The event team confirms space, timing, layout, catering and bar arrangements; no all-night or unsupported exclusivity promise.
- Removed expired summer-program promotion, unsupported uniqueness/service-speed/competitor comparisons, the inaccurate blanket close time, unverified farmers' market timing and dismissive town/nightlife generalizations.
- Retained and made the local alternatives concrete: Werk Force Brewing's own taproom and Settlers' Park's trails, lake, playground and StoryWalk. These have official links for current details. No claim that breweries lack food or other entertainment.
- Plainfield remains the actual venue location. One compact arrival paragraph mentions Romeoville, Shorewood, Naperville, Joliet and Bolingbrook; directions and hours link to /pricing/, with no invented drive times or secondary venue locations.
- publishDate stays 2026-05-08; updateDate is 2026-09-14 and uses the existing visible header and BlogPosting dateModified support. The shared blog header now formats calendar dates in UTC: local rendering had shifted both May 8 and September 14 to the preceding day in America/Chicago. This keeps visible dates aligned with the existing BlogPosting values. No new schema type, layout, styling, client script, media or dependency.

## Evidence checked

Internal facts and routes were checked against the current production-aligned /bowl/, /corporate-events/, /adult-birthday-parties/, /holiday-parties/, /birthday-parties/, /fundraisers/ pages and src/content/events/karaoke-thursdays.md plus singo-sundays.md. The fundraiser's 50% applies to eligible bowling, shoe and arcade sales from supporters who identify the fundraiser, not every purchase. The parent/project context supplies the approved lane/capacity and Brian wording.

Official external references checked September 14, 2026:

- https://www.werkforcebrewing.com/locations — the taproom is on South Center Street in Plainfield; its own current hours are linked rather than copied.
- https://www.plainfieldil.gov/community/settlers-park — downtown location, walking trails, lake, playground, StoryWalk and a link to the community calendar. No future performance dates are inferred.

No organic keyword performance or ranking gain is claimed. Google Ads alignment remains the separate follow-up captured in the bowling-page handoff.

## Validation and release

Required prebuild checks passed: translation freshness, recurrence, program answers and all 103 estimate checks. Astro compiled and prerendered the guide. Local Vercel function packaging then hit the known Windows symlink EPERM caused by the shared node_modules junction. Vercel cloud packaging and deployment remain pending; local output is not deployed directly. This worktree lacks live-menu credentials, so production menus must be checked after deployment.

Rendered inspection passed: one H1, unique IDs, self-canonical/indexable metadata, title/description consistency, BlogPosting identity and unchanged publication date plus the September 14 modification date. Visible dates agree with the schema; all three blog headers now show their original May 8 publication date in the local America/Chicago build. The guide has all 17 intended internal destinations, two official external references, the correct kids' package anchor and separate adult/company/kids booking paths. No new event schema, scripts, images or video.

No connected browser was available (CUA inventory returned no apps or browsers). Responsive visual and browser-interaction review have not been performed. The established article layout and styles are unchanged.

Vercel deployment and live verification remain pending. Use npm run build and inspect dist/client/blog/things-to-do-plainfield-il/index.html. Confirm one H1, self-canonical/indexable metadata, matching article description, unchanged publication date and the September 14 modification date; follow every article link and confirm #kids resolves to the package section. Check the sitemap after deployment. No booking or inquiry should be submitted during verification.
