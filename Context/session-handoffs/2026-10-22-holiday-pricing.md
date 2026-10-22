# Dated holiday pricing and Penny exclusions

Owner request: finish the public pricing/Penny work from the school-break
operating packet. Jon also reported December 6 entered as Closed in Yext.
That listing status means closed for ordinary visits; Jingle Bowl reservations
still operate. The existing public event record supplies its confirmed link.

## Sources and behavior

- `/pricing/` renders at request time, with a GET date selector and `no-store`.
  It works without client JavaScript. Old `?day=wed` and `#wed` links select the
  next matching weekday. Exact date links take precedence.
- `src/data/pricing.ts` retains ordinary hourly tiers.
- `scripts/project-visit-policy.mjs` projects approved, applied hourly profiles
  from TPRS `docs/holiday-operations-2026-27/calendar.json` into optional
  `walk_in_hourly` fields in `src/data/visit-policy-2026-27.json`.
  The 21 selected Monday-Friday dates use $50 Traditional/$70 VIP per lane/hour.
  Standard Saturdays/Sundays retain their ordinary tiers.
- The separate 17-date online holiday-package pricing policy is not copied
  into marketing. TPRS checkout remains authoritative for package prices.
  The page identifies two-hour-only online dates and tells guests to choose
  their date in booking; ordinary checkout does not consume date preselection.
- Four Penny exclusions derive from the dated records: November 25,
  December 23/30, 2026, and March 31, 2027. Next-season Wednesdays show
  unconfirmed eligibility rather than inheriting this year's approvals.
- `src/lib/pricing-date.ts` combines the projection with the existing event
  authority and Google snapshot. Confirmed event-only days and planned hard
  closures win. Fresh Google closures also suppress rates. Otherwise fresh
  Google intervals within their actual seven-day dates override planned hours;
  approved hours cover later selected dates. Uncovered dates clearly label
  the ordinary baseline. A stale rolling Sunday never becomes a future
  Sunday's date-specific hours. Rate tiers clamp to the opening interval.
- December 6 shows Jingle-only admission and its public page; December 31
  describes bowling reservations only. Both suppress ordinary rates,
  waitlist and coupon actions. No event departure time is volunteered.
- The FAQ's rendered answer and JSON-LD share updated pricing wording.
  The date-night blog links to the dated Penny exclusions.

## Next season / edits

1. Follow TPRS `docs/RUNBOOK-HOLIDAY-OPERATIONS.md` and approve the new calendar
   first. Do not roll this year's dates automatically into the next year.
2. Update the projector's season source deliberately when the approved season
   changes. Run it with `--source <absolute-approved-calendar.json>` as shown
   in its usage. Inspect the output and source fingerprint.
3. Update the exact-date assertions in `scripts/check-pricing-policy.mjs` for
   the approved replacement calendar. Keep the original nonprice/event
   fingerprint guard: the added hourly fields must not alter Roy's API facts.
4. Maintain normal weekly rates in `src/data/pricing.ts`; do not duplicate
   dated hourly amounts in page prose. Confirmed event facts remain in
   `src/data/special-events-2026.json`, separately reviewed.
5. Run `npm run build` (includes date/policy checks), then start Astro locally
   and run `node scripts/check-pricing-browser.mjs`. That browser smoke uses
   this season's future dates and must be deliberately revised next season.
   Optional `PRICING_ARTIFACT_DIR` saves local screenshots;
   `PRICING_BASE_URL` targets the deployed read-only page for release proof.
6. Verify the deployed page on a normal weekday, each price tier, an overnight
   holiday, a closure, excluded/restored Penny Wednesdays, Jingle and NYE.
   Record release evidence in the TPRS season status sheet.

No booking, product, payment, campaign, Roy greeting or live Google setting
is changed by this Website release. Google/Yext propagation remains separate.
