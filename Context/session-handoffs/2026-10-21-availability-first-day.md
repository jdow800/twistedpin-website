# Initial availability: selected day first

Jon authorized implementation and deployment after reviewing the source audit.
This Website slice follows the backend connection repair; deployment waits for
its independent acceptance so the two changes can be measured separately.

## Behavior and boundaries

Ordinary lane and birthday package pages prioritize the selected date's existing
availability-details read. The full calendar continues to use range-batched
month requests. Pending package cards show useful catalog information without
claiming bookability or a verified date price. Catalog/availability failures get
an explicit retry path and bounded read handling.

Existing-payment discovery remains ahead of editable booking. The scope does not
change cart/payment requests, accepted-order recovery, event activation, sales
opening, booking cutoffs or any product's advance-booking rule. NYE's dedicated
opening/checkout wrapper and protected Jingle readiness retain their own gates.

The ordinary backend limit is configured per product: today through today+10 in
Chicago, inclusive. Birthday/event products keep their own limits. Capacity
computation already skips beyond-limit dates and reads only eligible buffered
occupancy ranges. The customer catalog does not expose this limit, so this slice
does not invent a global ten-day frontend rule or replace one month request with
ten separate day requests. The backend repair separately batches the old
per-date month policy metadata.

## Source and validation

Starting Website base: `cd645c09`. NYE opening work `babcefb` remains separately
owned until its coordinated integration. Performance audit:
`tprs/docs/BOOKING-AVAILABILITY-PERFORMANCE-20261021.md` on the isolated Jingle
branch at `f3767805`.

Runtime changes are limited to the TPRS client, availability hook, MainStep,
DetailStep, DateStrip, CalendarModal and their existing stylesheet. Ordinary
codes 4/5/121/123 and birthday codes 109/118 opt into the selected-day priority.
The existing shared 90-second day cache carries the response into time selection.
Background month reads begin after priority reads settle, after 1,200 ms, or on
explicit calendar interest, whichever comes first. Failed selected-day reads
cannot borrow a positive month result to make a package appear bookable.

Catalog and availability GETs have an absolute 8-second deadline covering both
headers and body. Retry handles catalog, selected-day, month and time-list
failures. The deadline does not apply to forms, cart reads, payment discovery,
payment status or mutations. Empty/partial mismatches between the two existing
catalog views produce an explicit retry while verified positive cards can remain
usable. Late responses from a previous date or product scope are ignored.

Completed offline verification:

- 23 real-component/typed-client behavior groups at 320/390 px, including day
  priority, shared day-cache reuse, payment discovery, policy precedence, stale
  date replies, explicit retries, NYE handoff and distinct server booking limits.
  Four added timing cases reproduce and prevent a fast month consuming the
  initial smart-forward decision while today's exact read is still pending.
  Late unavailability advances, availability stays, errors remain unknown, and
  a manually selected future date stays selected even after a late denial.
- 22 bundled-client deadline checks, including pending headers/body, absolute
  deadline, caller abort, cleanup and untouched cart/form/payment read behavior.
- Strict TypeScript, full production Astro/Vercel build and repository prebuild
  checks; existing booking-date-policy and checkout-recovery regressions.
- 14 NYE date-handoff scenarios and 23 NYE Brand flow groups, retaining ordinary
  recovery and the dedicated NYE wrapper.
- Visual review of narrow pending, usable and retry states. Synthetic fixtures
  block external services and create no holds, payments or customer submissions.

Run the new checks with `node scripts/check-availability-first-day.mjs` and
`node scripts/check-availability-read-deadline.mjs`. Regenerable screenshots and
the 23-group receipt live under ignored `.astro/availability-first-day/`.

## Production baseline and release status

Before changing Website, one sequential read-only 390 px regular/birthday
walkthrough passed on session-mode backend `7f69d038` (00:01 UTC October 22).
All 18 regular and 12 birthday API requests settled with HTTP 200, no browser
errors and no horizontal overflow. Regular selected-day reads took 1,357–1,425 ms;
birthday day reads took 1,062–1,138 ms. The baseline explicitly opens the calendar
and selects the date, so it is not an untouched startup benchmark or proof of
this frontend improvement. Its screenshots/receipts are retained in the sibling
Jingle worktree under `.local/incident-*-session-first.{json,png}`.

Website source remains local while the backend's 30-minute acceptance runs.
Deployment identity and fresh production evidence must be recorded after the
coordinated release; no live performance improvement is claimed yet.
