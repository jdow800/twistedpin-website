# NYE booking: annual playbook

Current architecture reviewed October 22, 2026. Start with the
[events closeout](../../Context/session-handoffs/2026-10-22-events-closeout.md)
for release receipts, campaign material and the backend operating index.

The public landing page is evergreen. The dedicated Brand checkout now controls
the guest's sales-opening presentation, while the TPRS backend remains
authoritative for purchase eligibility, prices, inventory, holds and payments.
Changing the backend sales date alone no longer updates all frontend dates.

## Current 2026 behavior

| Boundary | America/Chicago | Source |
| --- | --- | --- |
| NYE sales open | November 18, 2026, 9am | `src/config/nye-opening.ts`: `2026-11-18T15:00:00Z`; coordinate with backend sales gates |
| Mirrorball homepage lead begins | December 7, 2026, midnight | `src/config/homepage-campaigns.ts`: `2026-12-07T06:00:00Z` |
| Mirrorball homepage lead retires | December 31, 2026, 9:30pm | Same campaign policy: `2027-01-01T03:30:00Z` |
| Last party ends | January 1, 2027, 12:30am | Opening policy: `2027-01-01T06:30:00Z` |

`/reserve/nye/` mounts `NyePublicCheckout`, which supplies the clock state to
`NyeBrandWizard`. Before opening, fresh checkout shows the November 18 notice
and countdown without offering new purchases. Existing-payment discovery and
recovery retain priority, including while new sales are closed. A mounted page
updates at opening and on focus/resume. A new visit after the final event end
shows the next-visit link; an already entered checkout is not torn down at that
boundary. Server rules still govern whether another purchase is allowed.

The event configuration fixes December 31, product codes 126 Traditional and
124 VIP, the event draft/history keys, food presentation and policy copy.
Traditional reservations allow 1-6 lanes; VIP sells in pairs of 2, 4 or 6.
Operational guest limits are five per Traditional lane and six per VIP lane.
These booking limits do not authorize attendance-capacity claims in marketing.

The six parties are 11am-12:30pm, 1pm-2:30pm, 3pm-4:30pm, 5pm-7pm,
7:30pm-9:30pm and 10pm-12:30am. Only the 10pm party includes the midnight
champagne or sparkling-cider toast. Each lane requires one pizza and one soda
choice; repeated choices are allowed. Prices, actual durations and food
definitions come from the backend catalog/forms, not this document.

The Brand flow acquires lane selection and uses atomic cart replacements.
Pending or accepted payment evidence must survive reloads, lost responses and
opening transitions. A temporary hold, cutoff, failed read or zero available
units must not be turned into an unsupported permanent "sold out" claim.

The checkout disables coupon entry and opt-in reward lookup/offer. It retains
plain optional SMS marketing consent, initially unchecked, with its selected
state carried into quote/payment evidence. Backend coupon exclusions remain a
separate enforcement requirement; hiding the field is not an exclusion rule.
Use the backend closeout/runbook for the current server policy and audit.

## Homepage, navigation and landing page

One shared homepage selector owns Jingle and NYE invitations and suppresses the
generic homepage promo area while a selected event campaign is active. Jingle
currently leads from its October 22 public launch until December 6 at 3:15pm,
the last party's online booking cutoff. Mirrorball begins December 7 at midnight.
The gap uses ordinary homepage behavior; it is not an instruction to prolong
Jingle or start NYE early. Both campaigns re-evaluate time on load/resume.

The NYE homepage retirement uses the final 10pm party's latest room cutoff:
30 minutes for VIP, versus 60 minutes for Traditional. Revisit the fixed
9:30pm retirement if these backend rules change. A visible promotion is not
proof that inventory remains.

Seasonal drawer entries are separate build-time discovery surfaces in
`src/config/nav-seasonal.ts`; the current NYE dates are November 15 through
January 2. Do not substitute that interval for the homepage policy or sales
opening. The calendar links to `/new-years-eve/`, whose booking action leads to
`/reserve/nye/`. Ordinary December 31 date selection also hands off to NYE.

The landing page has a dedicated `/og/og-nye-2026.jpg` share image. The approved
marketing pack, source, crop-corrected Facebook covers and reproduction scripts
are indexed by [the marketing README](../../Context/marketing/nye-2026/README.md).
Publishing a page or copying that pack does not publish social posts or messages.

## Annual review, before promoting the next season

1. Confirm the backend products, real IDs/codes, prices, event-only date,
   sales opening, room cutoffs, resources, inventory protections and ordinary
   booking exclusion. Review dated duration overrides for every party; changing
   labels alone cannot change lane holds, persisted ends or calendar attachments.
2. Coordinate the frontend opening/end instants and labels in
   `src/config/nye-opening.ts` with those backend gates. Review timezone/DST,
   event date, party schedule and midnight rollover together.
3. Update `src/components/tprs/nye/eventConfig.ts`: date, UTC offset, product
   identity, inclusions, guest/quantity rules and event-specific copy. Review
   draft/history key versioning deliberately so a previous season's draft
   cannot become a new event order. Preserve accepted-payment recovery.
4. Review `nyePageConfig` in `src/tprs/pageConfig.ts` for its still-consumed
   terms and retained legacy metadata. Updating its `defaultDate` or
   `presaleNotice` alone does not configure the current Brand entry.
5. Set the approved shared homepage interval independently of sales opening.
   Coordinate the preceding campaign, final purchase cutoff, reduced-motion
   behavior and normal homepage fallback. Review seasonal navigation, calendar,
   landing page/schema, opening labels and ordinary date handoff together.
6. Recheck required pizza/soda counts after lane changes, VIP pairs, inventory
   alternatives, coupon exclusions, plain consent and all payment-recovery
   paths. Do not infer availability or policy from a local fixture.
7. Review guest confirmation, receipt, calendar and staff/export output with the
   backend owner. Refresh campaign copy/artwork only after facts are confirmed;
   keep teaser, reservations-open and historical sellout wording distinct.
8. Run relevant offline checks, review the final diff, then follow the normal
   release authorization. Record exact deployed source and bounded acceptance
   evidence; local tests alone are not proof of production behavior.

## Troubleshooting source map

| File or directory | Responsibility |
| --- | --- |
| `src/config/nye-opening.ts`, `src/components/NyeOpening.astro`, `src/scripts/nye-opening.client.ts` | Landing/checkout opening instants, labels and presentation |
| `src/pages/reserve/nye.astro`, `src/components/tprs/nye/NyePublicCheckout.tsx` | Current public booking entry and clock wrapper |
| `src/components/tprs/nye/NyeBrandWizard.tsx`, `eventConfig.ts`, `selection*.ts`, `cartSelection.ts` | Event flow, food/quantity rules and retained selection; shared with Jingle through its configuration |
| `src/components/tprs/steps/PaymentStep.tsx`, `PaymentCheckoutForm.tsx`, `src/components/tprs/DiscoveredCheckout.tsx` | Shared payment and accepted-order recovery |
| `src/components/tprs/NyeDateHandoff.tsx` | Ordinary December 31 date-selection handoff |
| `src/config/homepage-campaigns.ts`, `src/scripts/homepage-campaign.client.ts` | Single homepage campaign selection and time boundaries |
| `src/pages/new-years-eve.astro`, `src/content/events/2026-12-31-new-years-eve.md` | Public landing, schedule and calendar entry |
| TPRS `docs/EVENTS-2026-CLOSEOUT.md` | Backend deployment, catalog/policy/runbook and retained rehearsal references |

Useful offline entrypoints are `scripts/check-nye-opening.mjs`,
`check-nye-date-handoff.mjs`, `check-nye-cart-selection.mjs`,
`check-nye-selection-rules.mjs`, `check-nye-selection-catalog.mjs`,
`check-nye-brand-flow.mjs`, `check-checkout-recovery.mjs` and
`check-homepage-campaign-policy.mjs`. Read each script's invocation requirements
before running it. Scripts named `*-live` are separate production probes and
are not routine documentation checks.

## Historical architecture

June 16 commits `393ff26` and `f2f5f8c` made the original ordinary-wizard NYE
page crawlable and added `nyePageConfig.presaleNotice`/`MainStep.showPresale`.
That old design waited for backend availability on `defaultDate`. Its claims
that the frontend had no NYE date gate and that changing `sales_start_at` alone
was sufficient are superseded by the October Brand/opening implementation.

The [September package receipt](../../Context/session-handoffs/2026-09-14-nye-2026-packages.md)
and [duration receipt](../../Context/session-handoffs/2026-09-14-nye-confirmation-durations.md)
record the earlier preview and duration work. Their December 1 sales-opening
observation was correct for that dated review and is superseded by the approved
November 18, 9am opening. Keep those receipts as evidence, not current settings.
