TWISTED PIN | ADAPTLYPOST SCHEDULING RECORD

Completed October 22, 2026 following Jon's explicit instruction to schedule the 16 prepared feed occasions on both Facebook and Instagram.

16 scheduled parent posts; 32 pending platform deliveries; zero scheduling failures or duplicates. Nothing is published yet.

receipt.json: exact saved platform accounts, parent and target IDs, dates, actual captions, media, alt text, verification and limitations.
submitted-payload.json: exact request body accepted by AdaptlyPost. Historical evidence only. DO NOT SUBMIT AGAIN.
server-validation.json: validation before scheduling. Does not guarantee later platform publication.

Accounts: Facebook Twisted Pin (Page 1482359171984495); Instagram @twistedpinplainfield. Dates use America/Chicago and explicit UTC. November17 is6pm, November18 is9am, the other14 occasions are noon. Feed artwork is1080x1350, with no crop transform or Story auto-share. Instagram uses the approved plain-address fallback because the event-specific bio links were unverified.

No optional Stories, Google/SMS extras, email, ads or Facebook event creation are part of this schedule.

Readback:
  adaptlypost --profile twisted-pin-holiday-2026 post get POST_ID --json
  adaptlypost --profile twisted-pin-holiday-2026 post list --status SCHEDULED --platform FACEBOOK --platform INSTAGRAM --all --json

Use the existing post IDs for authorized changes. Never automatically retry the bulk create request after an ambiguous error; reconcile the queue first because the CLI can retry a transport failure internally.

Recreate local status files without remote actions:
  node scripts/record-holiday-scheduling.mjs
  powershell -File scripts/deliver-holiday-posting-folders.ps1

The review packagers intentionally reject scheduled state. To reproduce the old review pack, use commit f96ca957845713d648e226bbdf0bde8a8a40fe70 in a separate checkout. Never clear execution fields to rerun it over the live schedule's source.

Jingle availability was checked when scheduled. Future inventory can change; review later booking invitations if choices sell out. In particular, December7's10pm invitation needs the10pm party to remain available. Watch November18's opening announcement if opening changes. No automated monitoring or guaranteed Meta reach/delivery is claimed.

Raw local CLI responses are under ignored .astro/holiday-adaptlypost/. No API token, credential file, signed upload URL, customer or payment data is part of these durable records.
