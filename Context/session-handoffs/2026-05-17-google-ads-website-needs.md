# Website edits needed to support Google Ads launch

**Date written:** 2026-05-17
**Context:** TwistedPin's Google Ads restructure completed Day 0 today (4 new/edited campaigns live, currently in 24-48hr ad review). Several website edits are now gating ad performance or future ad work. This file consolidates everything the website builder needs to know.

**Authoritative sources this file pulls from:**
- `Twisted Pin Full System/google_ads_restructure_brief_2026-05-17.md` §7 (WCE list)
- `Website/Context/session-handoffs/2026-05-16-pre-ads-lcp-fixes.md` (original LCP handoff — still applies)
- Memory: `project_brian_van_flandern_relationship.md` (copy framing reframe)
- Memory: `project_events_platform_state.md` (Heyflow vs Zite reality)

---

## ⚡ Critical — directly affects active ad performance

### 1. Replace "Built by America's Top Mixologist" → "Curated by" framing
**Location:** `/bar` page and `Context/voice.md` reserved-copy / locked-copy entries
**Why:** Brian Van Flandern was a consultant who CURATED the cocktail menu, did 2 days of bar training, and selected the spirit lineup. He doesn't own TwistedPin, has no equity, no ongoing role. "Built by" implies he built the venue or is a partner — overstates the relationship. "Curated by" is accurate and stronger anyway.

**Specific changes:**

| Current locked copy | New copy |
|---|---|
| *"Built by America's Top Mixologist. (Their words, not ours.)"* | *"Cocktails curated by Brian Van Flandern, America's Top Mixologist (Food Network)."* — or short form: *"Curated by America's Top Mixologist."* |
| *"Cocktails this serious aren't supposed to live at bowling alleys. Built by America's Top Mixologist."* | *"Cocktails this serious aren't supposed to live at bowling alleys. Menu curated by Brian Van Flandern, America's Top Mixologist."* |
| Long-form `/bar` body copy with "Built by..." | Replace all "Built by [X]" with "Curated by [X]" |

**Banned framings (per memory):**
- ❌ "Built by [Brian / Top Mixologist]" — implies he built the venue
- ❌ "Backed by" — implies financial stake
- ❌ "Partnered with" — implies ongoing partnership
- ❌ "Headed by" / "Led by" / "Run by" — implies active operational role
- ❌ "Brian Van Flandern presents" — implies branded/named partnership

**Approved framings:**
- ✅ "Curated by Brian Van Flandern"
- ✅ "Cocktail menu curated by..."
- ✅ "Bar program curated by..."
- ✅ "Curated by America's Top Mixologist (Food Network)"

Also update `Context/voice.md`: the "Reserved copy" / "Locked copy" entries with "Built by" need the same swap, and add to the Words to Avoid section.

### 2. Remove "chef-driven menu" / "chef-inspired" claims
**Location:** `/eat`, `/bar`, any RSA or copy referencing a chef
**Why:** TwistedPin doesn't have an executive chef per `project_fnb_operating_model.md`. The menu is built by the F&B team, not led by a named chef. "Chef-driven" or "chef-inspired" is a deceptive claim that could draw policy review on ads and is misleading on the website.
**Replacement framings:** "Built to share" (already in `/eat`), "Crafted in-house," "From-scratch where it matters," or just describe the food itself.

### 3. LCP fixes from original handoff (still in effect)
Per `Context/session-handoffs/2026-05-16-pre-ads-lcp-fixes.md`:

| Page | Current LCP | Target | Blocking |
|---|---|---|---|
| `/events` | 6.9s | <3.0s | **Events campaign restructure (Day 60)** + the 2 QS=1 keywords currently running |
| `/game` | 7.5s | <3.0s | Any arcade ad group (not built yet) |
| `/menu/taps` | 4.5s | <3.0s | Beer Wall ad group sitelink — currently points to `/bar` as workaround |
| `/vip-suite` | 4.0s | <3.5s | Acceptable interim; Corporate Events AG points here |
| `/fundraisers` | 4.7s | <3.0s | Fundraiser ad group (not built yet) |
| `/pricing` | 3.6s | <3.0s | Pricing-intent ad traffic — currently routes to `/bowl` interim |

Apply the proven playbook from the 2026-05-05 homepage LCP pass (540w mobile variants, AVIF, font subsets, preload tags, network/cache config).

---

## 🔜 High priority — gates Day 60 ad work

### 4. Build `/events/corporate`, `/events/birthdays`, `/events/holiday-parties` pages
**Deadline:** By ~Jul 17, 2026 for the Day 60 Events campaign restructure
**Why:** The Events campaign on Google Ads is currently in a holding pattern with 2 existing ad groups. At Day 60 we rebuild into 4 themed ad groups (Corporate Events, Birthday Parties, Holiday Parties, Special Occasions). Each needs its own dedicated LP — that's the Reunion Coffee Cart 17.82% conversion-rate finding from the research. Without dedicated LPs, the restructure has no signal lift.

**Structure suggested:**
- Hero section per page (corporate / birthday / holiday-themed photography or video)
- Lead with VIP suite as the differentiator (matches voice.md locked thesis)
- Each page has an inquiry form linking to **Heyflow (event.twistedpin.com)** — NOT Zite, per Q5 below
- Schema markup: Event + LocalBusiness
- ABV-friendly content for any cocktail mentions (alcohol-info policy)
- Follow the inner-page rhythm pattern from `/bar`

### 5. `/menu/taps` LCP fix unblocks beer-wall ad sitelink
**Current state:** Bar-Led's Beer Wall ad group has a sitelink reading "View Tap List" but it points to `/bar` because `/menu/taps` is at 4.5s LCP. Once you fix the LCP, the Google Ads script `04_extensions.js` CONFIG can be updated (`bar` → `menuTaps` for that one URL) and re-run to swap the sitelink target.

---

## 🟡 Medium priority — voice / copy hygiene

### 6. Plan an Event URLs — Heyflow vs Zite reality
**Current state in CLAUDE.md decisions log:** "All 'Plan an Event' CTAs go direct to Zite (2026-05-06) at https://twistedevents.zite.so/"

**Current ops reality:** Ops is still using Heyflow at `https://event.twistedpin.com/`. Zite migration hasn't completed. The new ad sitelinks correctly point to Heyflow (script `04b_fix_plan_an_event_url.js` swapped them).

**Decision needed from Jon (later, not blocking now):**
- Option A: Update the website's Plan an Event buttons to also point at Heyflow until Zite migration completes
- Option B: Leave website on Zite (per locked decision) and accept the temporary discrepancy

**When Zite migration completes:** Update the Google Ads sitelinks to swap back. Re-run `04b_fix_plan_an_event_url.js` with the URLs flipped. Update `project_events_platform_state.md` memory file.

---

## 🟢 Future builds — calendar-driven

### 7. `/valentines/` page
**Deadline:** Jan 15, 2027 (to capture Feb 1-14 reservation surge)
**Why:** Per seasonal calendar research, Valentine's Day shows a 433% reservation spike. Bar-Led campaign will pulse budget to $35/day × 14 days Feb 1-14.
**Suggested structure:** Similar to `/new-years-eve` — full-bleed hero, prix-fixe or cocktail menu, reservation CTA → Roller, seasonal-nav system surfaces it Jan 20 → Feb 15.
**Don't build it now** — too early. Calendar this for Q4 2026 / early Jan 2027.

---

## ❌ Explicitly DO NOT BUILD

| Page | Why not |
|---|---|
| `/happy-hour` | Cut per Jon decision. IL alcohol law complexity + happy-hour searchers are price-shoppers (wrong audience for premium positioning) |
| `/mothers-day/` | Cut per ops decision — brunch operationally not viable. Mother's Day push entirely skipped on the ad side |

---

## ❓ Open questions for Jon

1. **Brian Van Flandern reframe rollout:** When `voice.md` is updated with the "curated" framing, should we also update the `/bar` page copy immediately, or batch with the next pillar-page revision?
2. **`/eat` "chef" language audit:** Verify there are no remaining "chef-driven" or "chef-inspired" claims on `/eat`. The current homepage Eat section reads correctly per the page review I did earlier today.
3. **Page-rebuild priority:** Of the 6 LCP fixes + 3 new `/events/{type}` pages, what's the realistic ship sequence? The brief assumed `/events` LCP first (unblocks the existing Events campaign now), then `/events/{type}` builds (gates Day 60). The other LCP fixes can wait.

---

## How this file relates to other memory

| File | What it covers |
|---|---|
| `Context/session-handoffs/2026-05-16-pre-ads-lcp-fixes.md` | Original LCP-only handoff. Still authoritative on the LCP playbook details. This file consolidates + adds copy work |
| `project_brian_van_flandern_relationship.md` (memory) | The authoritative source on Brian framing rules. Used both for ads + this file |
| `project_events_platform_state.md` (memory) | Heyflow vs Zite reality |
| `google_ads_restructure_brief_2026-05-17.md` §7 | Original WCE-1 through WCE-10 list — this file is the expanded/refined version |
| `project_google_ads_implementation.md` (memory) | What's been done in Google Ads + future revisit triggers — references this file for the website-side work |
