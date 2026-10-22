# NYE Mirrorball homepage campaign and marketing pack

## Owner decisions and scope

Jon selected the Mirrorball treatment and confirmed December 7 for the homepage lead. On October 21 local time he authorized the next-step list's items 2 and 3: schedule that campaign and prepare Meta/Facebook plus Google Business Profile event visuals and copy. The connected booking rehearsal and sold-out display work are separate.

This slice starts from released Website `1a5089125488694a9fe8105b3c782b6d357615c4`, preserving the protected Jingle revision and NYE opening/recovery work. Backend `f268d51f` remains unchanged. Further general performance optimization is parked.

## Campaign timing

| Boundary | Venue time | UTC |
| --- | --- | --- |
| NYE sales open, unchanged | November 18, 2026, 9am | `2026-11-18T15:00:00Z` |
| Mirrorball homepage lead begins | December 7, 2026, midnight | `2026-12-07T06:00:00Z` |
| Homepage invitation retires | December 31, 2026, 9:30pm | `2027-01-01T03:30:00Z` |
| Last party ends, unchanged | January 1, 2027, 12:30am | `2027-01-01T06:30:00Z` |

The start is inclusive and retirement exclusive. A bounded read of the public catalog `/tprs-api/api/products/?codes=124,126` on October 22 UTC returned `salesCutoffMinutesBefore: 30` for VIP 124 and `60` for Traditional 126. With the final 10pm party, 9:30pm is the latest possible online purchase cutoff. The homepage uses that fixed campaign retirement; checkout remains authoritative for availability and purchasing. Revisit this campaign constant if operational cutoffs change. Do not claim a blanket 30-minute cutoff for both rooms.

The Jingle owner reconfirmed that Jingle leads through December 6 when public readiness is approved, but its promotion start and earlier event-day retirement are unselected. Its public readiness remains false. Neither its protected page nor production booking is activated here. Activities ending at 5:15pm and departure at 5:30pm do not define an approved marketing interval.

## Website behavior

One homepage selector owns the seasonal invitation and generic promo area. The obsolete November 15 NYE rotating-bar entry is replaced, preventing duplicate or premature NYE homepage promotion. Other navigation and the seasonal drawer remain separate discovery surfaces.

The original homepage hero videos, headline, logo/menu and ordinary booking actions remain. The Mirrorball has one brief entrance, a compact invitation, pause and dismiss controls, and a static reduced-motion presentation. The browser checks current time on load and resume, so cached static HTML or a missed rebuild cannot keep an expired campaign visible. With JavaScript unavailable, the normal homepage/navigation remain usable without a time-sensitive overlay.

The campaign links to the public NYE landing page and does not claim remaining inventory, a guaranteed price, or a seat at a particular party. No future-time query parameter can activate the promotion for public guests.

## Marketing deliverables

`Context/marketing/nye-2026/` owns the editable artwork, exported PNGs, platform references and ready-to-paste copy. Original supplied logo files and the approved Mirrorball direction are used; the unapproved September 8 generated brand package is excluded.

Separate pre-opening and reservations-open variants distinguish the November 18 sales opening from the December 31 event. Pre-opening artwork omits party times/prices. Event descriptions must not imply that a booking grants all-day admission or that every party includes a midnight toast. Social/Google publishing is not part of this task.

Sources, exported deliverables and reproduction instructions are versioned with the Website repository. Temporary browser screenshots, test receipts, dependencies and build output remain ignored. The marketing README identifies actual export dimensions and platform source limits; it must not mislabel a design choice as a verified platform requirement.

## Verification and release

Local source review is clear. The offline policy guard passes 39 cases, including exact venue boundaries, other browser timezones, DST dates, disabled Jingle readiness and generic-promo expiry. The actual-homepage browser harness passes 130 checks across narrow/mobile/tablet/desktop and short landscape layouts, mounted clock transitions, resume events, real menu controls, original video playback/pause, dismissal, reduced motion and no JavaScript. At very short mobile landscape heights (360px or less), the decorative invitation hides to preserve the original headline and navigation; it does not silently pause the video without visible controls. It blocks external/API requests and makes no booking calls. Screens and receipts are in ignored `.astro/homepage-campaign/`.

Strict TypeScript passes for the two new TypeScript files. Existing protected-review auth checks pass 17/17 and native emitted-middleware/proxy checks pass 7/7. The full production build and all prebuild checks pass; this isolated environment has no GoTab/Untappd credentials, so unrelated menu prerenders use their existing empty-data fallback. The existing large-chunk advisory remains. No credentials were copied into this worktree.

The creative pack contains eight reviewed PNGs (13,054,168 bytes total, each under 2.4 MB), source HTML/SVG, a deterministic renderer, contact sheet, gallery, manifest and platform copy. Every export passed dimensions/hash/font/bounds checks; all local documentation links resolve. No Meta or Google account was accessed and nothing was posted there.

**Released and verified:** Website main `2c6b1f12e53d4d788f0a984013a66ff07074d277`, parent `1a508912`, Vercel `dpl_7k5FvtcYf5z4TT36T2hjrwJdKmnb`. GitHub's Vercel status is successful, and the custom-domain HTML and loaded browser assets identify that exact deployment.

The bounded production acceptance on October 22 UTC verified homepage, NYE landing, regular/NYE/birthday reservation pages and proxied health at HTTP 200; Jingle and NYE concept reviews remain anonymous HTTP 401. Actual homepage checks showed no Mirrorball today, one invitation at December 7 midnight and removal at the final purchase cutoff on resume. The simulated date existed only inside the browser, never in a server or booking request. True mobile 390 and landscape 844, plus desktop 1440, had no application errors/overflow, preserved videos playing and original navigation/booking actions. The first capture used desktop scrollbar emulation at mobile widths; the final visual receipt corrects that harness setting rather than changing the site's existing gutter behavior.

One sequential regular and birthday journey reached available times without selecting a time or continuing checkout. Regular at `2026-10-22T02:42:56Z` had six visible times and 22 settled HTTP 200 API requests; birthday at `02:43:35Z` had two visible times and 14 settled HTTP 200 requests. Both had zero page errors or horizontal overflow. The script blocked mutations except the established read-only accepted-attempt discovery/status calls; no hold, booking, payment or customer submission was created. These are bounded stability checks, not speed benchmarks.

Ignored production evidence and reproductions: `.astro/nye-campaign/live-proof.json` (route/deployment proof), `live-browser-proof.json` (final true-mobile readback), `live-*.png`, `incident-{regular,birthday}-nye-campaign.{json,png}`, `live-proof.mjs` and `booking-proof.mjs`. Browser processes are closed; no continuous probes remain. The editable marketing source and final exports are committed and pushed in the released source. Social publication remains unperformed.

This release receipt is a documentation-only successor on `codex/nye-campaign-20261022`; it does not trigger a second main deployment. Subsequent campaign changes should preserve the single selector and retain Jingle's disabled/null readiness until its owner supplies the separate approved activation facts.
