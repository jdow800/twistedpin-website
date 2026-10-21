# Roy: approved visit-date lookup

`GET /api/visit-date/?date=2026-11-25&topic=hours` and
`POST /api/visit-date/` with JSON `{ "date": "Christmas Day", "topic": "hours" }`
return a compact, public, read-only answer for the requested date. Retell uses POST
with `args_at_root: true`, sending only date/topic, not a caller transcript.

Topics are `hours`, `penny`, `reservations`, `services` and `all`. Roy should speak
the `answer` and its resolved date. `needs_date` asks for clarification. Unknown
is not permission to infer a regular schedule, Penny eligibility or one-hour booking.

## Sources and scope

- `src/data/visit-policy-2026-27.json` is a reviewed projection of the TPRS annual
  packet, identified by operation version and source SHA-256. It contains the 33
  applied school-break dates, six separately approved regular-hour dates and four
  Penny exclusions. It contains no prices, sales, staff or customer information.
- `src/lib/visit-date.ts` resolves bounded date phrases in America/Chicago and
  produces the answer. It does not call TPRS, query inventory, create a booking,
  quote a price or claim that a lane can be booked now.
- `/api/hours/` and RoyPreCall continue to own **current** opening status, exact
  Google dates in the seven-day hours list and human-transfer routing. Planned
  business-date hours do not cancel a previous night's legitimate midnight tail.
- On the 33 school-break dates and NYE, `service_cutoffs_must_confirm` blocks the
  ordinary kitchen/bar calculation. Future service times are unconfirmed. A
  successfully resolved current-day response with the flag false permits Roy's
  independently supplied ordinary pre-call service labels; absence from this
  projection does not itself supply a service time.
- NYE has a separate owner. Bowling is by reservation; its page owns party details.
  No building-wide arcade/bar walk-in policy is inferred.
- An unlisted Wednesday is unknown, including adjacent break Wednesdays. No
  positive Penny dates or next-return promises are derived from the exclusions.

There is no user-facing website calendar or pricing-page redesign in this change.
This public read can support later work, but checkout continues to use TPRS's
selected-date policy and quote APIs.

## Update next year or after a changed operating decision

1. Follow TPRS `docs/RUNBOOK-SCHOOL-BREAKS.md`, approve the new calendar, and apply
   and verify the relevant operational changes. Read that year's `CURRENT-STATUS.md`
   and `RUNBOOK.md`; the raw research calendar includes historical proposals.
2. Review `scripts/project-visit-policy.mjs` for the new approved scope, season
   bounds, operation version and assertions. Update the import/filename and explicit
   holiday aliases in `visit-date.ts` for a new year. Never roll dates automatically.
3. Generate only the public projection, inspect its diff, and compare it to the
   approved operating packet:

   ```sh
   node scripts/project-visit-policy.mjs --source <TPRS>/docs/holiday-operations-2026-27/calendar.json
   node scripts/project-visit-policy.mjs --source <TPRS>/docs/holiday-operations-2026-27/calendar.json --check
   node scripts/check-visit-date.mjs
   npm run build
   ```

4. Change the focused fixtures when an approved decision changes. Keep coverage for
   all projected dates, midnight closes, both DST transitions, ambiguous phrases,
   expired coverage, unknown Wednesdays and malformed/oversized request bodies.
5. Push the reviewed Website source and verify the production endpoint before
   publishing a Roy prompt/tool that depends on a changed contract. The date checks
   run during every build. Do not deploy locally rendered menu fallbacks; Vercel
   performs its own build using the existing production menu credentials.
6. Update Roy's source only if behavior or the contract changes. See Marketing
   Avery `retell/HOLIDAY-READINESS.md`. A calendar-only change usually requires no
   Retell version or knowledge-base edit.

The projection is not a live database mirror. Any revised approved hours or policies
must be reconciled here along with Yext, TPRS and the other operating surfaces.
After the finite season expires, dated plan answers become unknown until refreshed.

## Verification

The initial projection matches the released operating packet. All 1,080 focused
offline assertions and the production build passed. Local builds have no GoTab or
Untappd credentials and use their existing fallbacks; this endpoint needs neither.
Live deployment readbacks and Roy's exact version are recorded in the release
changelogs after publication. No bookings, payments or customer messages are part
of the verification.
