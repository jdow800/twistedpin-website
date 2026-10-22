# NYE final copy, share image and release verification

## Released source

Website `6277c9f22c78843e15c40f05d64f916a2ad8cd0d` extends Jingle's connected `8eeb976` release. Vercel `dpl_FpAVPHmaJhUh38EfP1QjQEvS6TX7` is READY on both production domains; live HTML identifies that exact deployment. Runtime changes are singular/plural display wording in `NyeBrandWizard`, the public NYE page's share metadata, and the new JPEG. Jingle connection, Link removal, shared styling, password gates, payment recovery and campaign/opening rules are preserved.

Backend [PR469](https://github.com/jdow800/tprs/pull/469) merged as `0a724bfb066f9640eed214281bb41f107b5d22da`, with the same tree as tested head `77efdb92442620059f6de257218bd000e31f3dfe`. [CI39810950076](https://github.com/jdow800/tprs/actions/runs/39810950076) passed. Render `dep-dbd3cuvavr4c73d9s8bg` became live at 16:17:20 UTC on October 22. Its three runtime changes correct NYE email/receipt lane/card wording; saved financial data and already-queued messages are unchanged. Jingle's activation and Desktop delivery records are carried into both repositories.

## Final live evidence

One sequential 390px regular-lane and birthday journey ran at 16:18:56 and 16:19:07 UTC. All 22 + 16 API responses settled with 200; six regular times and two birthday times were visible. No page errors, horizontal overflow or forbidden mutations occurred. Root visually inspected both final screenshots. These journeys open the calendar, select a date and inspect a package. They are bounded functional checks, not matched startup-speed measurements. No time, Continue, cart hold, payment or guest submission was made.

Actual-clock NYE checks at 390/1280px show November 18 at 9am with a ticking countdown. Pre-opening checkout performs read-only accepted-payment discovery without exposing a fresh purchase. Public landing/ordinary/NYE checkout/health return 200; anonymous Jingle landing, `/jingle-bowl/booking/` and NYE concepts return 401. A first static harness used the nonexistent `/reserve/jingle-bowl/` path and received 404; correcting the assertion to the source-defined route produced the passing result without any runtime change.

At 16:18:57 UTC the backend observer verified the exact live revision, one ready instance, session port 5432, inventory protection, normal migration command and automatic deployment. Targeted decoder/protocol/capacity/worker-error log categories were empty. This is a bounded observation, not worker-completion telemetry or another sustained soak.

Regenerable live receipts/screens remain in this worktree under:

- `.astro/nye-final-audit/incident-{regular,birthday}-nye-final-release.{json,png}`
- `.astro/nye-final-audit/live-static.json`
- `.astro/nye-public-live/results.json` and `closed-{390,1280}.png`

Backend sanitized observer receipts remain in its matching final-release worktree under `.local/release-status.json` and `.local/session-runtime-observation-nye-final-copy.json`. No production probe remains running. All retained paid rehearsal runtimes, records and origins are untouched.

## Search, speed and artwork

The public NYE page is 200, self-canonical, in the sitemap and not noindexed. It has event/location title and description, one H1, and Event/VideoObject/Breadcrumb structured data. This verifies crawlability and page configuration; it does not verify Google indexing, ranking or future rich-result eligibility.

Fresh Lighthouse 13.5.0 samples with normal third-party loading scored mobile 94 performance / 96 accessibility / 77 best practices / 100 SEO and desktop 100 / 100 / 77 / 100. Mobile LCP was 2.77s, above the 2.5s house target; desktop LCP was 0.68s. These are single controlled lab samples, not field Core Web Vitals or a checkout speed comparison. Poster sizing, the existing mobile navigation focusability finding and third-party diagnostics remain recorded refinements. General booking performance optimization remains parked. See `Context/perf-history.md` and `Context/marketing/nye-2026/page-audit-20261022.json`.

The live `/og/og-nye-2026.jpg` is 1200 x 630, 104276 bytes, SHA256 `05765193985674e0f8f4408fb07a7fffee7c2ea459e805331dbbeb9783441f59`. Its live bytes match the tracked approved-artwork render. Existing social platform caches may need a fresh fetch to show it.

Actual Windows Desktop delivery is complete at `C:/Users/jdow8/OneDrive/Desktop/NYE 2026`: eight platform PNGs, overview, recommended Meta/Google/social/SMS copy, and the additional link-preview JPEG. Historical sellout wording is an optional copy recommendation supported by Jon's statement; it makes no current inventory claim. Jingle's separate `2026 Jingle Bowl` folder is complete as recorded by its owner. No posts or text blasts were sent.

## Schedule and limits

Sales open November 18, 2026 at 9am America/Chicago (`2026-11-18T15:00:00Z`). The Mirrorball lead begins at midnight after December 6 (`2026-12-07T06:00:00Z`) and retires December 31 at 9:30pm Central. The ordinary December 31 calendar handoff remains in place. This release changes none of those rules, inventory allocations or coupon exclusions. Clock/cache and recovery tests provide controlled opening evidence; actual future demand cannot be observed in advance.

This final evidence is committed and pushed on the feature branch only, without a second production deployment.
