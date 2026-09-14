# Bowling visit-planning page — September 14, 2026

## Owner direction

Jon approved the bowling-page changes after the corporate, adult-birthday and holiday releases. The page should help bowling visitors understand their options, see pricing/hours/directions, reserve lanes and discover the bar, kitchen and scheduled nights. Planned adult birthdays and company events use their dedicated landing pages and the existing event-team booking path; kids' packages normally self-book online.

## Implementation

- /bowl/ and its existing Spanish counterpart /es/bowl/ receive the same structure and booking distinctions. Plainfield is explicit in the H1 and the address uses shared NAP constants.
- The opening includes Reserve a lane, Pricing & Hours and a directions URL derived from the venue Place ID. The existing global Reserve/Plan hierarchy remains untouched.
- Walk-ins are welcome during open hours, subject to lane availability. Walk-in prices/hours stay on /pricing/; online reservation pricing is shown during date/lane selection. No new price table or copied hours.
- Traditional lanes retain the five-player limit, bumpers and shoe-rental information. VIP copy distinguishes two/four/six-lane online reservations (six bowlers per lane) from a planned full-suite event for up to 80 guests, with space/time/setup confirmed by the event team.
- Existing traditional-lane and suite videos are reused. The first AVIF poster is direct/preloaded, the second deferred, with bounded mobile/desktop sources. The social image description matches the inspected traditional-lane photo.
- Make a night of it links the live food, tap and cocktail menus. Karaoke/Singo mentions use the same non-draft event collection, four-month horizon and occurrence expansion as the existing calendar; no event times are copied. Ended/draft programs disappear from these mentions on rebuild, and the generic calendar link remains.
- Adult/milestone birthdays link /adult-birthday-parties/; company parties link /corporate-events/; kids' online booking links /reserve/birthdays/. These paths are distinct from ordinary /reserve/ bowling.
- English and Spanish retain reciprocal hreflang, language metadata, self-canonicals and the same business entity. The Spanish correction/English-version link remains. Its stale summer dates now follow the existing English off-season cutoff and approved 2027 waitlist wording.
- Existing URLs, /bowling redirect, section anchors, leagues link, menus, booking products and advertising accounts are unchanged. No dependencies or new media.

## Google Ads follow-up — deferred

Jon explicitly raised applying this website work to future Google Ads landing pages and copy. Revisit the live account and current results before making changes. Review destination and message alignment for ordinary bowling (/bowl/), kids' birthdays (/birthday-parties/ and /reserve/birthdays/), adult/milestone birthdays (/adult-birthday-parties/), team/staff/company events (/corporate-events/), and company holiday parties (/holiday-parties/).

Check ad text, keyword-level final URLs, sitelinks and mobile booking paths together. Preserve existing attribution parameters and useful inbound anchors, and verify the inquiry/booking destination for each intent. Judge results using the appropriate campaign's inquiries and bookings. This is a follow-up note, not an account change or a claim of improved rankings/conversions.

## Validation and release

Required prebuild checks passed: translation freshness, recurring dates, program answers and 103 estimate checks. Astro compiled and prerendered both language pages and the rest of the site. The local build then hit the known Windows symlink EPERM while packaging the Vercel function from the shared node_modules junction. Vercel cloud packaging remains the final build check; local output is not deployed directly, and live-menu credentials are absent from this worktree.

Rendered inspection passed for both pages: one Plainfield H1, correct html/OG/schema language, reciprocal hreflang, self-canonical/indexable metadata, shared BowlingAlley identity/address and correct breadcrumbs, top Reserve/Pricing/directions targets, the real Place ID, distinct adult/company/kids paths, all 12 internal content destinations, current karaoke/Singo references with no copied times, matching 2027 summer waitlist wording, preserved section/leagues anchors, eager first poster and deferred/bounded original video sources. The Spanish correction and English-version links remain. No new Event or VideoObject markup is emitted.

Reproduce with npm run build, then inspect dist/client/bowl/index.html and dist/client/es/bowl/index.html. Compare heading, language/alternate/canonical tags, hero/party links and calendar text. Check the live destinations, /bowling/ redirect and sitemap entries after deployment. The recurrence prebuild check covers the shared date, season-end, dark-date and DST behavior used by the calendar references.

No connected browser was available. Responsive visual, browser-interaction and native-speaker translation review have not been performed. Vercel preview and production verification are pending.
