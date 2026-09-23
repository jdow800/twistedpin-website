# September 23 rewards-page release

Jon authorized publishing the Website rewards revision ahead of the wider Loyalty 2.0 cutover.
The live catalog still has five in-store rewards, and new points notices are disabled. This
release therefore preserves the current 50/100/200/250/350 rewards and clearly labels the new
350-point $50 online/in-store reward as Coming soon. No claim link or generic coupon is offered.

## Changes

- /rewards/: existing brand fonts/chrome, quiet page-only background, clear points/benefit rows,
  current in-store channel, separate upcoming $50 panel, native expandable help and Text Club.
- First check-in earns50; only one qualifying check-in day earns points; booking online alone
  does not earn them. Redemption spends points; saving is optional; inactivity remains24 months.
- Text Club and its signup$10 are distinct from the100-point reward. Marketing consent is optional
  for earned rewards. Existing valid gifts keep their original terms/deadlines.
- public/llms.txt matches the current/coming-soon distinction. Metadata uses a147-character
  description and a single H1. No shared styles, navigation, redirects or old offer pages changed.

## Verification

npm ci using the current main lockfile; npm run build completed successfully, including translation,
recurrence, program and103 estimate checks. The credential-free local build used the existing menu
fallbacks; production must build with its normal Vercel credentials. Do not deploy local artifacts.

Headless Chromium inspected360/390/720/1440px, including a720px CSS viewport at2x density as the
reflow equivalent of1440px at200% zoom. No horizontal overflow, including expanded help. Keyboard
Enter toggles help and visible focus is retained. Five current rewards, Coming soon label,
no claim CTA, signup destination, singleH1 and metadata checked. External browser calls were blocked
for local QA. Screenshots and readout are regenerable under the machine temp directory
rewards-page-qa-20260923; no customer records used. Full-page screenshot placement of fixed chrome
must be captured after returning to the top, rather than after a scrolled focus check.

Source starts from origin/main cda2cc7 in the isolated Website-rewards-release worktree. Separate
checkout changes on codex/loyalty-2-ui-internal are not included. General campaign/Zite activation,
points or SMS are unaffected. Publication and live readback are recorded below after completion.

## At actual Loyalty 2.0 catalog cutover

1. Replace the current250-point BOGO and350-point free-hour rows with the350-point $50 reward.
2. Promote the Coming soon panel to available, and change its instructions to the live online and
   counter paths. Explain one eligible package, current point requirement, special-event exclusions,
   no stacking, no remaining-credit carry-forward, and the appropriate bundled-shoe distinction.
3. Update public/llms.txt simultaneously. Keep legacy gift landing pages accurate. Do not add a
   universal claim button or promise every member will receive marketing texts.

This page release does not authorize that catalog/campaign activation. Refresh the quiet-cutover
impact report before turning on new producers; do not issue a historical catch-up blast.
