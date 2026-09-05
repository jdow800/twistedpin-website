# 2026-09-05 (Saturday, ~11:00-12:45 CT) - two live threads traced and fixed; the date-first first touch shipped

Jon, watching the inbox on the first Saturday of the event builder, brought two conversations. Both were traced through the n8n executions (WF2 27517 Susan, 27521 Julie), fixed in the brain, staged on a clone, deployed to WF2 (`4b599f0c`), WF1 (`ebb7051e`) and the live KB (315,613 chars), all offline harnesses green or at their pre-existing reds. Marketing Avery changelogs (WF1 + WF2, stamp 2026-09-05 ~12:45 CT) carry the mechanics; this file carries the story and the open items.

## Susan (E-0469290, exec 27517) - "we open at 2:30pm Wednesday"

She asked to nail down Fri Oct 9 (deposit) and to stop in when back in town Wednesday. Avery answered the deposit part right (food package first) and then invented a Wednesday opening time. **Cause:** the prompt carried `earliest_event_start: 2:30pm` (the FRIDAY event anchor = doors 2pm + 30) and no plain weekly hours; the model attached the only clock time it had to the wrong day. Wednesday doors are 3pm. **Jon's rulings:** a guest who wants to look around is welcome during any of our normal operating hours - say it that way, no clock time unless they ask for hours; operating hours differ from bookable hours (event starts are doors + 30). **Built:** `operating_hours` computed from the same tables as the anchors and passed to the prompt; a WALK-IN / HOURS ASK flag; a prompt rule; the `hours_claim_mismatch` check (weekday + "open at <time>" / "close at <time>" must match that weekday's doors/close) with its retry entry; KB In-person visits + EARLIEST START HELPER wording. Side find: "back in Plainfield on Wednesday" was counted as a weekday claim and pushed DATE NOT CONFIRMED with one option - fixed in the v4 weekday collector (travel / guest-availability frames are skipped).

## Julie Rosa (E-2054796, exec 27521) - the hold line for a link that was never coming

15th birthday, 14 guests, no date on the form. First touch (11:06) = the menu-and-pricing offer. Reply (11:08): "It's for tonight, but not everyone would bowl. Wasn't sure how to put it in." The model drafted the right thing (lanes tonight at twistedpin.com/book, the $39.99 cake add-on, outside items line, "what time?") and HELD the link itself. Set Route then replaced the draft with the claim hold line because `BUILD_CLAIM` matched `put ... it ... in` - "wasn't sure how to" is an ask, not a claim - and armed the 15-minute watcher, which raised Needs Attention at 11:24. Her "Ok thanks" at 11:12 (exec 27524) ran zero nodes (gated). **Validator-forced-defect instance #18.** Also: "tonight" resolved to nothing (no date on file -> `days_until_event` null -> no short-notice play; `builder_link.due` was TRUE). **Built:** per-sentence claim evaluation with a how-to / negation guard; RELATIVE DAY (tonight / today / tomorrow in an event frame -> a Chicago date onto `ctx.event_date` this turn + a flag); ruling A widened per Jon - inside 3 days, 14 or fewer books lanes online (birthday or not, kids or not; company / fundraiser / field trip excluded; 15+ stays the silent protocol), cake mentioned once on Birthday/Family, legacy food/headcount flags stand down; the builder-link gate refuses `short_notice`.

**Julie still needs a human text** - she never got a usable reply and the party is tonight.

## The date-first first touch (Jon's design, shipped)

Jon: the first touch should gather the date when the notes do not carry one - it is the pre-qualifier for short notice - but the date is never REQUIRED for the link ("we don't have a date yet, just wanted to review pricing" -> send it; never argue). Shipped as opener v5 in WF1 (`builder_opener_kind` date_ask | offer):
- SMS, no date: "Hi [First], this is Avery from Twisted Pin! Got your inquiry [for the birthday / for your company event / for your group of N]. What date are you thinking?"
- Email, no date: the v4 paragraphs with "What date are you thinking?" in place of the offer.
- Date known (form or notes): the v4 offer, unchanged.
WF2 reads the answer: a date -> LATE HORIZON (a date named this turn now feeds the horizon bands and the link gate - it used to reach the row one turn too late) -> short notice (lanes / protocol, no link) or the link; "no date yet" / a bare month / "flexible" -> engaged -> the link; "tonight" / "tomorrow" -> RELATIVE DAY -> short notice. **Copy is Jon's (12:55 CT):** SMS = "...What date are you thinking?" (no reassurance clause), email the same question in paragraph form. A vague or several-dates reply gets DATE OPEN on WF2's link turn: no re-ask, no pick, "Ok great, let me send over the menu and pricing" + the link (WF2 `7a1c2d1c`, WF1 `7324cd67`, KB 315,896 chars).

## Hanna (~12:10 CT) - the age question outranks the date question, so the link had no date gate

Birthday/Family, 13 guests, notes "birthday", no date. WF1 sent the age question (its play outranks the date-ask opener); she answered "14"; the link turn had no date at all. Jon: it could be tomorrow. **Built (WF2 ):** gate reason  - no date on file, none this turn, Avery never asked in this thread (her own outbound messages are scanned for the date question), the guest did not say "no date" or float several, not a browse re-offer -> DATE FIRST flag: answer, then "What date are you thinking?", hold the link, never twice. Decline / call / wrong number / question-only still win. Harness G1-G7.

## Verification

`brain/checks/test-live-threads-2026-09-05.mjs` 45/45; `test-builder-link-turn.mjs` 59/59 (adapted to v5 with a date-known control); the full offline set green or at its pre-existing reds (late-night-span improved 63/10 -> 65/8; kb-cancellation 15/1, kb-engine-lane-policy 8/2, wf1 late-close 24/3 identical at HEAD in a throwaway worktree). Golden --dry ALL PASS. Staged on a fresh clone with six assertions before prod; drift CLEAN after.

## Watch

- the first date-ask first touch and its reply turn (a date inside 3 days -> lanes/protocol and NO link; "no date yet" -> link)
- the first RELATIVE DAY turn ("tonight" / "tomorrow")
- the first `hours_claim_mismatch` retry (should be rare; if it fires on a correct sentence, loosen the regex, do not remove the check)
- the first walk-in ask after this ("any time during our normal operating hours", no clock time)

## Rollback

WF2 pin `d456e887`; WF1 pin `fa536c6f`; KB = the previous git text (`git show HEAD~1:brain/kb/Avery_KB.md` in Marketing Avery, then `deploy-kb.mjs --doc live --yes`).
