# NYE landing page and opening countdown

Jon chose **Wednesday, November 18, 2026 at 9am Central** for NYE sales.
`src/config/nye-opening.ts` carries the exact instant `2026-11-18T15:00:00Z`.
Both NYE products' backend `sales_start_at` values must match; the explicit
two-product update and audit live in TPRS's `docs/NYE-OPENING-2026.md`.

## Guest experience

The dark Brand direction stays. A compact hero shows the opening date and live
countdown immediately, with a desktop room photo and the existing mobile video.
Four short inclusion groups explain bowling/shoes, one pizza, one pitcher and
party favors. Comparable Traditional/VIP photo cards show the actual operational
per-lane booking limits. All six party times and both prices remain visible,
with 16px decision text on narrow phones. The 10pm-only toast has its own callout.

FAQs cover fixed food choices, per-lane headcount, same-time/same-room bowl-near
requests, arrival/check-in and the existing cancellation terms. The policies
were checked against the owner's actual confirmation email. Ordinary site
navigation is preserved; the NYE header action and mobile bottom action lead
to NYE. The bottom action appears after the hero has scrolled away.

Before opening, actions scroll to prices; at opening, they link to
`/reserve/nye/`. The countdown never calls a booking endpoint, acquires inventory,
asserts availability or navigates automatically. At the final party's end,
January1 at12:30amCentral, it retires the NYE action. Date text and a real booking
link remain usable without JavaScript. Per-second digits are excluded from
screen-reader announcements; only meaningful state transitions are announced.

## Validation and reproduction

All12 displayed prices and both rooms' six durations were checked against
production pricing and scheduling services in database-enforced READ ONLY.
No quote, customer booking, payment or email was created.

```powershell
$env:ASTRO_TELEMETRY_DISABLED='1'
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run dev -- --host 127.0.0.1 --port 55610
# Separate terminal:
node scripts/check-nye-opening.mjs
node scripts/check-nye-landing.mjs
npm.cmd run build
```

The opening suite renders the actual Astro component and runs its real client,
covering four browser timezones, DST, exact opening/end boundaries, no-JS,
clock resync and accessibility behavior. Integrated browser checks cover
320/390/430/768/1025/1280/1440px, header bounds, table sizes, FAQ/phone,
opening/end actions and the unchanged ordinary header. External requests are
blocked during these local tests. Screenshots and render results regenerate
under ignored `.astro/nye-landing/`. Original photo/video derivatives remain
tracked in `public/snap`; no new unbacked source media is introduced.

Independent visual/copy and source reviews passed. The production build and
required prebuild checks pass; isolated local menu builds use their existing
missing-credential fallback. Production menu credentials are not copied locally.

## Remaining NYE launch work

Publishing this landing page does not activate the protected Brand checkout or
payment-owned inventory claims. The public NYE booking page still needs its
reviewed Brand activation, final real-processor/contention checks, reason-aware
availability, December31 ordinary-reservation exclusion/handoff and per-party
Traditional reserve blocks. Complete those before the scheduled opening.
The owner rehearsals and editable staff demo remain intact. Page-speed
benchmarking stays deferred as Jon requested.

This page declares no InStock offer or sales quantity. Existing seasonal NYE
promotion starts November15, so it naturally leads into the November18 opening.
Changing the opening later requires both the website constant/copy and the
backend timestamp to be changed and verified together.
