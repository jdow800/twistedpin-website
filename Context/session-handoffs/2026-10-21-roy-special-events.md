# Roy special-event facts and routing context

This is a read-only extension to `/api/visit-date/` and `/api/hours/`.
It does not activate marketing, remove the Jingle review gate, change Google
hours, query availability, modify checkout or authorize sales. Root release
coordination adds deployment and live verification evidence below.

## Current approved scope

`src/data/special-events-2026.json` is the separate, versioned event source.
The 33-date school-break projection remains unchanged.

- **Jingle Bowl, December 6, 2026:** event reservations only all day;
  regular visits are closed. A Google Closed label does not cancel the event.
  The Website page is still protected review, so guest responses withhold its
  URL. Entry, session, closing and staffed hours, reservation opening and
  per-session cutoffs remain unknown. No tentative schedule or cutoff is copied.
- **NYE, December 31, 2026:** bowling by reservation only. This does not set
  building-wide arcade/bar admission. Its public page is
  `https://www.twistedpin.com/new-years-eve/`. The confirmed sales-opening instant
  is November 18, 2026, 9am America/Chicago (`2026-11-18T15:00:00Z`). Passing that
  instant does not prove launch readiness or availability.
- Both records have empty `approved_staffed_intervals` and `sessions` arrays.
  No extra front-desk transfer permission is currently granted. Kitchen, bar
  and Beer Wall service cutoffs remain unknown.

## Requested-date contract

The existing date/topic GET and POST request shapes and schema version remain
compatible. `Jingle Bowl` and `Jingle Bowl 2026` now resolve to the confirmed
date. An implicit past event or a different year asks for an exact date; there
is no recurring annual event assumption.

An additive `event` field is null outside an event date. On a recognized event
date it contains identity, date, `status`, scoped `admission`, `ordinary_visits`,
`page_public`, nullable `public_url`, nullable `sales_open_at`,
`sales_open_answer`, `booking_status`, `sessions_status`, `sessions`,
`source_version` and a guest-safe `answer`. Verified sessions also contain a
finished spoken answer, so Roy does not convert timestamps itself.

`coverage: separately_managed` applies to both named events without conflating
their policies. `hours.status` remains unknown when event hours are unknown.
Jingle's `ordinary_online_reservations: closed` describes ordinary bookings,
not event cancellation. `service_cutoffs_must_confirm` is true on either date.
`capacity: not_checked` never changes. No monetary, customer or staff data is
included. Protected page URLs are never returned as guest links.

`booking_status` is `not_open` before a confirmed opening, `unverified` when
launch readiness is not verified, `verified` only after explicit readiness
and public-page approval, and `ended` after all verified session cutoffs or
record expiry. It never means a lane is available. A public page alone does
not establish booking readiness. Cutoffs are explicit verified timestamps,
not a fixed number of minutes inferred from starts.

## Current-hours and front-desk context

`src/lib/special-events.ts` exports `currentSpecialEventContext(now)`.
The hours route publishes it as `special_event_context`, using the same clock
as its ordinary current-hours calculation. Google's `now.is_open` is preserved.

The context contains:

- `generated_at`, `valid_until`, `timezone: America/Chicago`, current local `date`;
- `event`, the same bounded public event context, or null;
- `transfer: { allowed, reason, staffed_until }`.

`allowed` is true only inside an explicitly approved staffed interval. Start
is inclusive and end is exclusive. Freshness is at most 60 seconds and clips
at an upcoming staffing boundary or local midnight. Event-day responses use
`Cache-Control: no-store`. Consumers must validate freshness, identity/date,
admission scope and the affirmative permission before granting a transfer.

An approved overnight staffed interval retains its originating `event.date`;
the context's top-level `date` remains the current Chicago date. No overnight
event staffing is inferred from a weekly Google close. Conversely, Jingle's
calendar date must not erase Saturday's legitimate ordinary after-midnight
tail. Roy's separate routing evaluator owns that distinction, stale-context
fallback and the human-routing message. It must not treat public `is_open`
and event transfer permission as interchangeable.

## Updating an event safely

1. Obtain approved facts for this exact event and year. Keep pending session,
   cutoff and staffing arrays empty. Never copy protected proposals or prices.
2. Keep page readiness and booking readiness separate. Mark `page_public` true
   only after anonymous guest access and approval are verified. Mark
   `booking_ready_verified` true only after the separate launch gates pass.
3. Publish session cutoffs only with `session_cutoffs_verified: true` and exact
   `starts_at`/`booking_closes_at` UTC timestamps. Confirm every session; malformed
   sets fail closed. Do not derive a cutoff from a rough operating preference.
4. Populate `approved_staffed_intervals` only with approved UTC `starts_at` and
   `ends_at`, including any explicit overnight end. These are routing intervals,
   not public entry hours. The current records have none.
5. Increment `source_version`, preserve the bounded date/next-day expiry, run the
   checks, review the public response and coordinate Website/Roy release. Do not
   extend a prior year's record or change the frozen school-break projection.

Internal functions accept injected clocks/configuration for deterministic
offline tests. HTTP arguments cannot supply either one.

## Local verification

```text
node scripts/check-visit-date.mjs
node scripts/check-special-events.mjs
node scripts/check-special-events-route.mjs
npm.cmd run build
```

The first command includes all three suites. The event suite uses clearly
synthetic future readiness/staffing fixtures, not proposed Jingle times. The
route suite executes the actual stripped-TypeScript SSR route with an empty
program collection, synthetic Google snapshot and controlled clock; no HTTP
server, provider or external request is needed. It checks current event context,
protected-link absence, provider `is_open` preservation and overnight behavior.

Local production compilation must disable telemetry and outbound HTTP and omit
GoTab/Untappd/Google credentials. Existing missing-menu fallbacks are acceptable
for compile verification only. Never deploy the locally generated empty-menu
artifacts; Vercel's normal authorized build uses its existing production setup.

Local results: 1,080 requested-date assertions, 123 event/state assertions and
29 SSR-route assertions pass. All repository prebuild checks and the full
TypeScript 5.9.3 project check pass. Production compilation and prerendering
complete with outbound HTTP blocked. Final Vercel packaging stops at the known
Windows `EPERM` dependency-symlink operation; the complete build command does
not pass locally. The existing Website dependency directory was reused through
a worktree-local junction; no packages or credentials were copied or installed.

## Release evidence

Pending root release coordination. Local checks are not deployment evidence.
