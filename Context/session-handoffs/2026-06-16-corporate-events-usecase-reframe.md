# Handoff: Reframe `/corporate-events/` around use-cases (not generic "event venue")

**Date:** 2026-06-16
**From:** Google Ads work (Day 30 Events campaign restructure)
**Priority:** Medium-high — gates the payoff of a live ad pivot; wanted before the **Aug 1 Q4 corporate ramp**
**Page:** `https://www.twistedpin.com/corporate-events/`

---

## TL;DR — the ask

The Google Ads "Events" campaign just pivoted its corporate side **away from generic "event venue / event space" keywords** (which competed with wedding/banquet halls, pulled ~80% of spend at 0 conversions, wrong intent) **toward specific high-intent use-cases** that actually fit a bowling/entertainment venue.

For the keyword → ad copy → landing page alignment to pay off (Quality Score + conversion rate), **`/corporate-events/` should lead with those use-cases**, not generic "premier event venue" language.

## Why

Paid traffic now arrives on this page searching things like **"staff outing," "team outing," "company outing," "employee appreciation event."** If the page greets them with generic "event venue" copy, there's a keyword↔page mismatch that hurts Quality Score (raises CPC) and conversion. Align the page to how they searched and both improve.

This is the corporate expression of the brand's whole positioning: TwistedPin is **the fun team activity**, not a stuffy banquet hall.

## What the page should communicate (lead with these)

Reframe the hero + section structure around use-cases. Suggested sections (each a clear "this is for YOU" block):

1. **Team / Staff Outings** ⭐ (lead with this) — "The team outing your office will actually remember." Bowling + cocktails + catering + private VIP suite.
2. **Employee Appreciation** — reward-the-team framing. "Show your team you care."
3. **Team Building** — bowling as the team-building activity.
4. **Company & Holiday Parties** — (holiday = seasonal Q4 emphasis).
5. **Meetings & Luncheons** — *different vibe:* daytime, private room + catering (not "fun/bowling" — more "we need a space + food"). VIP suite fits.
6. **Fundraisers** — keep existing.

Keep the practical proof points visible: **groups of 10–200, private 6-lane VIP suite, full catering, minutes from Naperville.**

## Match the live ad copy (for scent/continuity)

The ad groups now sending traffic here, and their messaging — the LP should echo this language so the click→page feels continuous:

- **Team Outings** ad group: *"Team Outings in Plainfield," "Plan Your Staff Outing," "Staff Outings, Done Right," "Not Your Average Team Outing," "Company Outings + Catering"*
- **Employee Appreciation** ad group: *"Employee Appreciation Events," "Reward Your Team," "Show the Team You Care," "A Day They'll Remember"*
- (Existing Corporate Events terms still run: corporate event venue, company party venue, team building, etc.)

## Conversion / tracking note (important)

- The conversion is the **event inquiry form submission** (currently the Zite flow at `event.twistedpin.com` / `twistedevents.zite.so`), which fires a GA4 `generate_lead` event. So make the **"Inquire / Plan Your Event" CTA prominent** on this page — it's the conversion action.
- **Pass the `gclid` through to the inquiry form.** When this LP's inquiry CTA links out to the Zite form, append the page's own `?gclid=` (and UTMs) to that link. Without it, ad-driven inquiries won't attribute back to the Events campaign in Google Ads. (Zite captures `gclid` from its URL — but only if the link carries it.) This is the single most important technical item for ads attribution.

## Brand / vocabulary rules (must follow)

- **No "chef-driven" / "chef-inspired"** language (no exec chef on site).
- Brian Van Flandern framing: **"curated by"** only — never "built by," "partnered with," or "backed by."
- Keep it on-brand premium-but-fun, not corporate-stuffy.

## Timing

Ahead of the **Aug 1 Q4 corporate ramp** (Events budget scales for corporate-event season Aug–Nov). Having this LP reframed before then makes the Q4 push land on aligned messaging.

## Related

- Google Ads side already done (2026-06-16): new "Team Outings" + "Employee Appreciation" ad groups live; generic catch-all keywords paused. See `project_google_ads_implementation.md` (Script 12).
- Prior ads↔website handoff: `2026-05-17-google-ads-website-needs.md`
