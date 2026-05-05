# /waitlist — Theory & Revisit Plan

**Status:** Tabled 2026-05-04. Live `/waitlist` page is shipped wrapping
TablesReady's iframe (`host.tablesready.com/p/waitlist/twistedpin`). User
flagged the iframe content as ugly. We explored four paths to improve it,
picked one (#1 below), then deferred the build pending operational steps.

This file captures the full arc so when we pick this back up, we don't
re-derive the conclusions.

---

## Current shipped state

`/waitlist` (`src/pages/waitlist.astro`) — typography hero + brand-framed
iframe wrapping `host.tablesready.com/p/waitlist/twistedpin` + closing
"Reserve a lane" CTA + SnapFooter.

- TablesReady returns no `X-Frame-Options` and no CSP `frame-ancestors`,
  so the iframe embeds cleanly from any domain (verified via
  `curl -sI host.tablesready.com/p/waitlist/twistedpin` 2026-05-04).
- Iframe content is dark navy background with their own logo + multiple
  paragraphs of defensive copy ("If you're not here, you're NOT on the
  list" etc.) that we can't restyle (Same-Origin Policy).
- Fallback "Open the live page →" link sits below the frame in case
  TablesReady ever adds X-Frame headers.

---

## What the page actually needs to convey

User-facing information the page should answer:

1. **Is there a waitlist right now?** (yes/no)
2. **If yes, how many groups?** (1 vs 20 — affects the user's "should I
   walk in or reserve?" decision)

That's it. Position-in-line, estimated wait time, etc. are nice-to-have
but not load-bearing — TablesReady's own page doesn't show position
either.

---

## Paths considered

### Path 1 — Webhook-derived state (PICKED, then tabled)

**The plan:** TablesReady fires webhooks for party events → our endpoint
maintains a count → page renders "X parties on waitlist" or "No wait,
come on in" from our state.

**Webhook events** (per [TablesReady webhook docs](https://support.tablesready.com/article/86-webhooks)):
- `party.created` — party added to waitlist
- `party.updated` — party edited
- `party.checked_in` — **AMBIGUOUS** (could mean "arrived to be seated"
  → remove from active, OR "arrived for a reservation" → no-op for
  waitlist count)
- `party.marked` — marked as served/canceled (remove from active)

**Webhook payload** (per [API docs](https://support.tablesready.com/article/13-api-documentation)):
`_id`, `name`, `size`, `type` (walk-in vs reservation), `phone`,
`created_time`, `checkin_time`, `quoted_time`, `waitlistId`, `loyalty_count`.

**What's NOT in the payload** (the architectural reality):
- ❌ Total parties on waitlist
- ❌ Position in line
- ❌ Status enum

**So we'd derive the count ourselves** — events, not snapshots:
- `party.created` → +1, store `_id` in active set
- `party.checked_in` → unknown until tested
- `party.marked` → -1, remove `_id` from active set
- 4am cron → reset state to 0 (mitigates drift from missed webhooks /
  unclear `checked_in` semantics)

**State store options** (rated for this use case):
- **Google Sheets** — ✅ operator can see + manually fix from phone,
  ✅ free, ✅ daily reset = trivial Apps Script, ⚠️ ~500ms writes (fine
  for webhook receivers). User-friendly choice.
- **Vercel KV / Upstash Redis** — ✅ fast, ⚠️ opaque to non-engineers.
  Engineery-correct choice.
- **n8n data tables** — only if user is already running n8n for other
  automations (currently not).

User said: *"I don't really care where we build out and structure it —
probably wherever we think will be more accurate."* So we have latitude
when we revisit.

**Estimated effort:** ~3-4 hrs once we have real webhook payloads
captured and the `checked_in` semantics resolved.

### Path 2 — Switch waitlist platforms (REJECTED)

Research a competitor with a better API (esp. a `GET /waitlist/current`
endpoint).

**Why rejected:** User pays $79/mo for TablesReady's *operational*
features (employee dashboard, voice-to-text guest alerts, 1k SMS/mo,
deliverability infra). Switching for an API improvement misallocates
effort — migration costs weeks of staff retraining vs ~3-4 hrs to build
the webhook layer.

### Path 3 — Build own waitlist app + Twilio (REJECTED for now)

Replace TablesReady entirely. Twilio at our volume is ~$9/mo (vs $79
TablesReady) — would save ~$70/mo.

**Why rejected:** Operational software is always more than it seems.
Edge cases TablesReady has solved over years (party arrives but never
checks in, duplicate phone numbers, mid-wait re-quoting, network
drops mid-add, voice alerts, deliverability). Building this is a 2-4
week project; pulls focus from website launch. Filed as a
**Q3 2026 reconsideration** *after* the website ships AND after we've
actually felt operational pain that justifies the rebuild.

### Path 4 — Link-out from `/waitlist` (alternative to current iframe)

`/waitlist` page replaces the iframe with a brand-voiced static section
+ a "Check live wait status →" button that opens
`host.tablesready.com/p/waitlist/twistedpin` in a new tab.

User: *"I'd rather just send them off the site if they're going to see
crap."* — preference is for link-out > current iframe IF we're not
building the webhook version yet.

**Status:** Pending user confirmation on whether to swap before tabling
(see "Open question" below).

---

## CSS scroll-clip hack — REJECTED

Considered: wrap iframe in `overflow:hidden` 240px container + push
iframe up with negative `top` to show only TablesReady's white "Upcoming
Parties" card.

User rejected (2026-05-04, "#2 no"). Rationale: brittle (TablesReady
redesigns break it), viewport-dependent, hides legitimate "wait active"
content if it grows. Don't revisit this path.

---

## Pre-build checklist (when we resume Path 1)

1. **User upgrades TablesReady plan tier** if webhooks aren't on current
   plan (user indicated this is the gating step).
2. **Set up webhook.site bucket** (free, instant: https://webhook.site
   gives a unique URL).
3. **Configure TablesReady to fire webhooks at the bucket URL** (one
   form in TablesReady admin).
4. **Walk a real party through the flow at the front desk:**
   - Add a walk-in → captures `party.created` payload
   - Mark them served → captures `party.marked` payload
   - Add another, then check in → captures `party.checked_in`
     (resolves the ambiguity — does it remove from active or no-op?)
   - Edit a party → captures `party.updated`
5. **Send captured payloads to next session** — we write the state
   machine against the real data, not assumptions.
6. **Build:** Vercel Function webhook receiver → state store
   (Sheets or KV per user choice at the time) → 4am reset → Astro page
   reads state → ship.

The webhook.site test resolves all the unknowns *before* we write any
code. ~5 min of user effort de-risks the whole project.

---

## What we'd render (once we own the state)

Better than the current iframe in copy AND visual fidelity:

```
RIGHT NOW
No wait — come on in.
[last party served 12 min ago]
```

OR

```
RIGHT NOW
3 groups on the waitlist.
[joined the wait at 7:45pm — quoted ~25 min]
```

Brand voice intact, no third-party UI on our page, accurate live data.

---

## Cost framing

- **TablesReady current:** $79/mo (covers ops features we use)
- **Webhook layer cost:** $0/mo (Vercel + Sheets free tiers crush this
  workload)
- **Build own + Twilio:** ~$9/mo Twilio + 2-4 weeks of build + ongoing
  ops responsibility. Saves ~$70/mo at the cost of weeks of focus.

The webhook layer is the cheapest path that actually solves the problem.

---

## Open question (resolve before next chapter)

**Should `/waitlist` swap to the link-out version (Path 4) right now,
or stay on the iframe until we build the webhook version?**

User stated preference for link-out over iframe ("send them off the site
if they're going to see crap"). Pending explicit go-ahead before
implementing.
