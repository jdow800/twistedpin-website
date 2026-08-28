# Digital invitations — brief for the fundraiser-autonomy session (2026-08-28)

**Read this instead of re-authoring anything invitation-related.** The fundraiser session was "waiting on evite info"; all of it shipped tonight and is live.

## What exists (all LIVE)

- **Every fundraiser gets an invitation at booking** — deposit or full-pay setup, doesn't matter (`tprs/apps/backend/src/services/staff-direct-booking.ts` mints on create; Avery's `book-fundraiser` path goes through the same door).
- **Avery's Fundraiser Booked Reply already carries the link.** `Marketing Avery/brain/deploy/patch-wf2-fundraiser-booked-reply.mjs` appends Jon's approved line — *"Optional digital invitations for your fundraiser, if you want them: <url>"* — to the confirmation. It is a patch on the WF2 node, NOT KB text: if the Booked Reply wording is edited, re-run the patch (or keep the sentence) or the link disappears. KB fundraiser section (~line 520) states the behaviour.
- **The link arrives in Avery's context from TPRS** (`ctx.invitation_host_url`, built in `pre-assemble-context.js` with TPRS-parity slug rules). Avery never types or invents a link; `link_not_from_tprs` in both checks allows exactly that URL.
- **KB Section 20 "Digital invitations and RSVPs"** (Avery_KB.md ~2697) already covers: what the host dashboard does, the seven looks + photo/logo, how the host sends (dashboard → look → Save → Invite your guests → copy link; Twisted Pin never sends to guests), the guest list download (names/answers/party sizes; never emails), no host "blast" by design, guest data deleted two weeks after the event, and the fundraiser specifics below.

## Fundraiser-specific facts Avery already knows

- Guests RSVP as *people in the group*, cap 12 per answer, and can RSVP **until the event ends** (a 7pm walk-up deciding to come is the staffing signal).
- **RSVP tallies are a planning reference only.** They never become the fundraiser's headcount, never reserve lanes, never feed billing. Lanes stay first-come, first-served; nothing is held off the tally.
- The guest page's "Before you come" carries the two lines that decide whether the cause gets paid: *mention the fundraiser at check-in* and *lanes are first come, first served*. Venue-owned; the host cannot edit them out.
- Default tagline on fundraiser invitations is Jon's: *"Bowl for a cause. Make sure to tell the front desk you are there for our fundraiser!"*

## What the fundraiser session does NOT need to build

- No invitation minting, no link delivery, no KB invitation content — all done.
- No headcount plumbing from RSVPs — ruled out by design.
- No changes to the details-chase (payable-to / EIN / address) — unrelated to invitations.

## The one coupling to watch

If that session rewrites the **Fundraiser Booked Reply** node or its `Fundraiser Booked Reply` name, the invitation sentence and the EVENT PAGE line are load-bearing on that node name (see the 2026-08-28 fundraiser handoff's "node names are load-bearing" trap). Re-run `patch-wf2-fundraiser-booked-reply.mjs` after any edit and confirm drift clean.

Memory: [[tprs-invitations-rsvp-build]], [[avery-invitations-rsvp-curriculum]], [[avery-fundraiser-autonomy-initiative]].
