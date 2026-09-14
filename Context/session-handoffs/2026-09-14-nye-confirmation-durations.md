# NYE confirmation durations — September 14, 2026

The NYE confirmation used the product's single 90-minute default for every
party. It now resolves the selected venue-local date and start time from the
backend's optional `durationOverrides` catalog data.

For December 31, 2026, the approved lengths are 90 minutes at 11am, 1pm and
3pm; 120 minutes at 5pm and 7:30pm; and 150 minutes at 10pm, ending January 1
at 12:30am. Both traditional and VIP packages use these times.

Backend companion: [TPRS PR #197](https://github.com/jdow800/tprs/pull/197), migration 0180 and
`docs/session-handoffs/2026-09-14-nye-duration-overrides.md`. It corrects real
capacity checks, cart/final lane holds, line snapshots and booking end times.
Deploy the backend before this website change. The base duration remains 90;
the new arrays hold the date-specific values. The frontend falls back to the
base for other dates, starts and products, and preserves start-only displays.

Files: `src/tprs/schemas/customer-flow.ts` is re-vendored from the backend;
`src/components/tprs/format.ts` resolves the selected duration;
`src/components/tprs/steps/ConfirmationStep.tsx` uses it for the displayed range.
No booking prices, food-order logic, terms or calls to payment APIs change.

## Checks

Run on Node 24 (the current development runtime):

```text
node scripts/check-booking-durations.mjs
node scripts/check-booking-confirmation.mjs
npm run build
```

The first checks all six date/time rules and ordinary fallbacks. The second
server-renders the actual ConfirmationStep: all six ranges, midnight crossing,
December 31 date, two lanes, unchanged amount and start-only mode. It creates
and removes only its own uniquely named temporary bundle. No browser, booking,
payment or outbound email is invoked.

Both checks pass. Required translation, recurrence, program and 103 estimate
prebuild checks also pass; Astro compilation/prerendering passes. Local Vercel
packaging encounters the existing Windows node_modules symlink EPERM, so use
the cloud preview and production deployment checks to validate packaging.
No connected browser was available for phone or interactive checkout review.

After deployment, verify `/tprs-api/api/products/?codes=124,126` returns six
duration overrides for each product. Check the date/start matching rules and
12:30am finish in the delivered booking JS. Public availability should stay
empty until the existing December 1 sales opening; this is not a sales launch.
