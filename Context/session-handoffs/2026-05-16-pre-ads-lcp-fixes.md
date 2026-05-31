# Website Builder Handoff — LP Performance Fixes Pre-Ads Launch

**Date:** 2026-05-16
**Context:** Google Ads campaign launch is gated on Lighthouse mobile LCP across specific pillar/menu pages. This handoff lists what to fix, why, and the acceptance criteria.

---

## Goal

Several pages will serve as paid Google Ads landing pages. **Lighthouse mobile LCP under 3.0s is the floor; under 2.5s is the target.** Above 3.0s tanks Quality Score and burns ad budget. The proven playbook from the 2026-05-05 homepage LCP pass (homepage now 100/100, LCP 954ms) needs to be applied to the slow pillar/menu pages.

**Origin-level Core Web Vitals already passes** (field data: real-user LCP 1.4s, INP 138ms, CLS 0.02). The fixes below are about per-URL Lighthouse synthetic scores, not domain reputation.

---

## Proven playbook (from 2026-05-05 homepage pass)

These fixes took the homepage from poor to LCP 954ms. Apply to the slow pages below:

1. **540w mobile hero variants** on phones ≤480px (saves ~1 MB on heavy heroes)
2. **AVIF added to image pipeline** (15-30% smaller than WebP) — already in `scripts/build-snap-images.mjs`
3. **Latin-only `@fontsource` subsets** (was importing Vietnamese/Cyrillic/Greek/Latin Ext on an English-only site — CSS 5x smaller per face)
4. **Hero poster preload tag**
5. **Video 540w variants** (was applied to tap-wall mobile; not yet applied elsewhere)

Full history in `Context/perf-history.md`.

---

## Critical — these BLOCK ad campaigns

### `/events` — currently 6.9s LCP

- **Why critical:** This is the Events-campaign LP. Four themed ad groups (Corporate / Birthday / Holiday / Special Occasions) are gated on this page working
- **Diagnostic:** Network payload **4,140 KiB**, LCP request discovery + Network dependency tree flagged, image delivery savings 37 KiB
- **Probable cause:** Hero asset at desktop size on mobile — same issue homepage had pre-540w fix
- **Target:** < 3.0s, ideal < 2.5s

### `/game` — currently 7.5s LCP (worst page on site)

- **Why critical:** Will be the arcade-ads LP; cannot launch arcade-intent campaigns until fixed
- **Diagnostic:** Network payload **6,729 KiB** (worst on site), image delivery savings **259 KiB** (also worst)
- **Probable cause:** Arcade hero + photos at full desktop size; multiple oversized images
- **Target:** < 3.0s

---

## High — knock 300-700ms off every page at once

### Global JS + cache pass (affects every page)

Every page shows the same three findings — these are template/build-config fixes, not per-page work:

| Issue | Savings per page | Fix |
|---|---|---|
| Use efficient cache lifetimes | ~146 KiB | Server-side cache headers on static assets (one-time Vercel config) |
| Reduce unused JavaScript | ~90 KiB | Bundle splitting / tree-shaking |
| Legacy JavaScript | 12 KiB | Target modern browsers (ES2017+) — drop the polyfills |
| LCP request discovery / Network dependency tree | varies | Add `<link rel="preload">` for the LCP element in every page template |

**Do this before per-page hero work** — it reduces how much each individual page needs to improve.

### `/fundraisers` — currently 4.7s LCP

- Blocks the fundraiser ad group only (smallest event vertical, so deprioritizable)
- Same playbook

---

## Medium — run ads now, improve when possible

### `/menu/taps` — currently 4.5s LCP

- **Why it matters:** The 28-tap wall is a category-defining differentiator we want to advertise specifically. Until fixed, "self serve beer wall" / "28 tap beer wall" ads point at `/bar` (works, but doesn't show the wall menu directly)
- **Probable cause:** 28 tap-list rows each rendering a label thumbnail; either oversized or not lazy-loaded
- **Suggested fix:** Lazy-load below-fold tap rows; serve smaller thumbnail variants for the list view

### `/vip-suite` — currently 4.0s LCP

- Primary LP for the corporate-events ad group
- Acceptable to launch ads at 4.0s but should improve
- **Note:** CLAUDE.md flagged a separate "VIP suite photo replacement" item (2026-05-11) — V4 tester said current photo reads as regular lanes, killing the differentiator. **Sequence the photo replacement with the LCP optimization** — solves both at once

### `/pricing` — currently 3.6s LCP

- Bowling-pricing ad-intent LP for Open Play campaign
- Acceptable interim: send pricing-intent ad traffic to `/bowl` (2.5s) and let users scroll
- Lower priority

---

## New build — `/happy-hour` page

### Why this page needs to exist

"happy hour Plainfield" is the highest-intent / lowest-competition keyword in the Bar-Led ad campaign. Without an LP, adding that keyword to ads = QS=1 from day one (same trap as the `event venue near me` keywords).

### Architecture (light page, similar to `/menu/cocktails`)

- Typography hero (no image hero — keep it fast)
- H1: *"Happy hour in Plainfield."* (or similar; copy is open)
- 1-sentence subhead — when, what's featured, the bar program tie-in
- Days/times table
- 2-3 sentence "What you'll find" — cocktail program (Brian Van Flandern credential) + 28-tap wall
- CTAs: Reserve a lane (Glow) / View the menu (outlined)
- SnapFooter

### Voice constraints (from `voice.md`)

- **Banned:** "cheap," "discount," "deals," "budget-friendly," "value"
- **Frame as:** premium-bar-at-off-hours, "what happens before the night begins," "the bar program, on a schedule"
- Don't lean on price-savings framing; lean on access-to-the-bar-program framing

### Target LCP

< 2.5s at launch (greenfield build — get it right from the start)

---

## Acceptance criteria

| Page | Current | Target | Blocks which ads |
|---|---|---|---|
| `/events` | 6.9s | < 3.0s | All themed Events ad groups |
| `/game` | 7.5s | < 3.0s | All arcade ads |
| `/fundraisers` | 4.7s | < 3.0s | Fundraiser ad group only |
| `/menu/taps` | 4.5s | < 3.0s | 28-tap wall ad group |
| `/vip-suite` | 4.0s | < 3.5s acceptable | Corporate Events ad group (acceptable interim) |
| `/pricing` | 3.6s | < 3.0s | None (use `/bowl` interim) |
| `/menu/cocktails` | 3.0s | < 2.5s ideal | None (acceptable) |
| `/menu/food` | 3.1s | < 2.5s ideal | None (acceptable) |
| `/happy-hour` | doesn't exist | < 2.5s on launch | Happy hour ad group |

---

## Suggested sequence

| Day | Work | Unlocks |
|---|---|---|
| 1 | Global cache + JS pass (cache headers, bundle splitting, legacy-JS target, preload tags on templates) | ~300-700ms off every page |
| 2-3 | `/events` hero — 540w + AVIF + preload | Events campaign restructure |
| 4-5 | `/game` hero — 540w + AVIF + payload audit | Arcade ads |
| 6 | `/happy-hour` page build | Happy hour keyword |
| 7-8 | `/menu/taps` thumbnails + lazy-load; `/vip-suite` photo replacement + LCP | Beer wall + corporate ad groups |
| 9+ | `/fundraisers`, `/pricing` | Final ad groups |

After each fix ships, re-run PSI to confirm < 3.0s before unlocking the corresponding ad group.

---

## Reference: page-level diagnostic data (from 2026-05-16 PSI runs)

| Page | Perf | LCP | TBT | CLS | Network payload | Notes |
|---|---|---|---|---|---|---|
| `/` | 100 | 0.95s | — | 0.007 | — | Reference — fast |
| `/bar` | 99 | 2.1s | — | 0.042 | — | Reference — fast pillar |
| `/new-years-eve` | 99 | 1.8s | — | 0.021 | — | Fast |
| `/menu` (hub) | 98 | 2.2s | — | 0.034 | — | Fast |
| `/leagues` | 98 | 2.3s | — | — | — | Fast |
| `/bowl` | 97 | 2.6s | — | — | — | Borderline (51ms over) |
| `/birthday-parties-booking` | 96 | 2.7s | — | 0.020 | — | Borderline |
| `/eat` | 92/96 | 3.0–2.8s | 180ms | 0.006 | 4,879 KiB | Acceptable; flagged "Improve image delivery" 52 KiB |
| `/menu/food` | 93 | 3.1s | — | 0.019 | — | Borderline |
| `/menu/cocktails` | 90/87 | 3.0–3.9s | 240ms | 0 | — | Variable; was 3.9s in CSV, 3.0s in re-run |
| `/pricing` | 89 | 3.6s | — | 0.049 | — | Over target |
| `/menu/taps` | 83 | 4.5s | — | — | — | Over target |
| `/vip-suite` | 88 | 4.0s | 40ms | 0 | — | Over target; flagged "Improve image delivery" 51 KiB |
| `/fundraisers` | 82 | 4.7s | — | 0.012 | — | Over target |
| `/free-kids-bowling` | 76 | 4.1s | — | 0.038 | — | Iframe-wrapped — likely unfixable until iframe replaced |
| `/events` | 72 | 6.9s | 220ms | 0 | 4,140 KiB | **Critical** |
| `/game` | 72 | 7.5s | 190ms | 0.005 | 6,729 KiB | **Critical — worst on site** |

Common diagnostic findings across ALL pages tested:
- Use efficient cache lifetimes: ~146 KiB per page
- Reduce unused JavaScript: ~90 KiB per page
- Legacy JavaScript: ~12 KiB per page
- LCP request discovery: flagged on most pages
- Network dependency tree: flagged on most pages

These are global / template-level issues. Fix once, every page benefits.
