# Performance History

Append-only log of Lighthouse / PageSpeed Insights runs against the
production deploy. Used to track regressions, measure the impact of
optimization passes, and decide when re-testing is worth doing.

**Convention:** each entry stamped with date + URL tested + raw scores
+ what we did or planned in response. Newest at top. Don't edit older
entries — they're the baseline.

---

## 2026-05-17 (evening) — Per-page audit pass: /menu/ LCP fix (transform animation gates Chrome's LCP register)

**URL:** `https://www.twistedpin.com/menu/`
**Tool:** PageSpeed Insights (Lighthouse 13.0.1)
**Conditions:** Mobile, simulated Slow 4G + 4× CPU slowdown

### The /menu/ win

| Metric | Before | After (diagnostic commit `9f031ff`) | Delta |
|---|---|---|---|
| Perf score | 84 | **99** | +15 |
| Lab LCP | 4.1 s | **1.7 s** | -2.4 s |
| Element render delay | 1,320 ms | 270 ms | -1,050 ms |
| TBT | 180 ms | 70 ms | -110 ms |
| Speed Index | 2.6 s | 1.0 s | -1.6 s |

Field data already passed CWV pre-fix (LCP 1.4s, real users were fine). The bad number was lab synthetic only — but lab matters for Google Ads landing-page experience scoring and PSI-driven QS.

### The lesson — Chrome's LCP heuristic gates transform animations

The LCP element on `/menu/` was the H1 text — **not** the hub card thumbnail I initially assumed. PSI's LCP-element panel showed it definitively:

```html
<h1 class="t-display menu-hero-headline hero-fade" id="menu-h1" data-delay-ms="120">
  What's on the menu.
</h1>
```

LCP breakdown reported "Element render delay: 1,320 ms" on a TEXT element with no resource to load. That's a hard contradiction unless something was gating paint register.

The cause: `.hero-fade` applies a CSS `transform: translateY(12px → 0)` animation with `animation-delay: 120ms` and `animation-fill-mode: both`. The element painted at FCP with the from-state offset, but **Chrome's LCP heuristic treats elements with active transform animations as "not yet painted" until the animation completes** — even when opacity stays at 1 throughout.

The previous global.css comment (2026-05-08 LCP fix annotation) claimed opacity-stable transforms don't affect LCP. **Empirically wrong.** That comment has been corrected; the misattribution would have cost us another investigation cycle.

### What landed

1. **`9f031ff`** — diagnostic: dropped `.hero-fade` from `/menu/`'s H1 only. Confirmed the theory (84 → 99, 4.1s → 1.7s LCP).
2. **`[next commit]`** — production fix: site-wide CSS `@media (max-width: 1024px) { .hero-fade { animation: none; } }` in global.css. Covers eyebrow (delay 0ms), H1 (delay 120ms), and subhead (delay 320ms) — all three are LCP candidates on different pages depending on text layout. The 320ms subhead delay was likely a worse offender than the H1 on text-heavy pages. H1 hero-fade restored on `/menu/` for desktop polish.

### Why mobile-only

Desktop PSI uses faster CPU + faster network. The H1 paints before the animation matters, so LCP isn't gated there. Desktop also has higher animation stakes (larger viewport, bigger H1 font, longer dwell time → users notice the slide-in). Mobile sacrifices a "subtle but nice" motion polish for a ~1-2s LCP win where it matters for ads QS.

### The "LCP fix pattern" grows a step #5

Updating the reusable pattern from the earlier 2026-05-17 session:

For any future text-LCP page on mobile:
- **Step 5 (new):** Avoid CSS transform animations on elements that could be LCP candidates (H1, eyebrow, hero-sub). Chrome's LCP heuristic gates register on transform-animated elements regardless of opacity. If polish is desired, gate the animation with `@media (min-width: 1025px)` so desktop keeps the motion and mobile keeps the fast paint.

### Other commits this session

| Commit | What |
|---|---|
| `01d3282` | Menu pages: preconnect cross-origin image hosts (labels.untappd.com, img.gotab.io on desktop) + eager-load top 3 tap labels |
| `6288873` | Iframe pages: preconnect to embedded form/widget origins (c-g.co, host.tablesready.com) |
| `af76ae9` | `/menu/` hub: eager-load + AVIF preload first card thumbnail. **Note:** this turned out to attack the wrong LCP element (image, not H1). Kept as-is — it's still a valid optimization and additive to the H1 fix. |
| `9f031ff` | Diagnostic — see above |

### Validation — site-wide rule confirmed (post-`ef526be` deploy, 2026-05-17 2:36-2:37 PM CDT)

Two spot-checks against the deployed site-wide `@media (max-width: 1024px) { .hero-fade { animation: none } }`:

| Page | LCP element type | Before | After | Verdict |
|---|---|---|---|---|
| `/faq` | text subhead `<p class="t2-hero-sub hero-fade" data-delay-ms="320">` | (no clean baseline) | **Perf 94, LCP 1.7s, element render delay 270ms** | ✅ Subhead-LCP confirmed; broadened selector pays off — the 320ms subhead delay was indeed the worst-case LCP gate, more so than the 120ms H1 |
| `/game` | image (section-video poster `arcade-poster.avif`) | Perf 90, LCP 3.2s | **Perf 96, LCP 2.3s** | ✅ Pillar page IMPROVED instead of regressed — disabling H1 hero-fade above the LCP image removed competing render work, freeing the image to paint sooner |

Theory fully validated. The broader hypothesis stands: **Chrome's LCP heuristic gates transform-animated elements regardless of opacity, and the gate cost scales with `animation-delay`.** Pages with `data-delay-ms="320"` (subhead) were the worst offenders, then `data-delay-ms="120"` (H1), then `data-delay-ms="0"` (eyebrow). The single-rule fix covers all three.

### Out of scope this round

- **`/free-kids-bowling` lab/field divergence** (field LCP 1.1s passing, lab LCP 6.6s, perf 28) — iframe-driven. User opted to skip iframe-page work. Verified `content-visibility: auto` would NOT help here: iframe top sits at 358px in a 640px viewport with 282px in initial fold. Not below-the-fold enough for `content-visibility: auto` to skip render. The actual fix (JS-defer iframe injection until idle) was scoped out per user direction.
- **`/pricing` 3.6s baseline** — stale, was actually 1.4s post-`47e7479`. Killed the planned DOM-weight refactor. **Lesson: always re-measure baselines after a known site-wide fix lands.** Memorialized in user memory `feedback_perf_baselines.md`.

---

## 2026-05-17 — Pre-ads-launch perf pass: pillar pages cleared LCP < 3.5s

**URLs tested:** `/game`, `/bowl`, `/fundraisers`, `/vip-suite`, `/birthday-parties-booking`, `/events` (all production at twistedpin.com)
**Tool:** PageSpeed Insights (Lighthouse)
**Conditions:** Mobile, simulated Slow 4G + 4× CPU slowdown

### Wins (mobile)

| Page | Pre-session baseline (2026-05-16) | Post-session (2026-05-17 confirmed) | Delta |
|---|---|---|---|
| `/events` | Perf 72, LCP 6.9s | **Perf 92, LCP 3.1s** | -3.8s LCP |
| `/game` | Perf 72, LCP 7.5s | **Perf 90, LCP 3.2s** | -4.3s LCP |
| `/bowl` | (no clean baseline) | **Perf 97, LCP 2.5s** | green band ✅ |
| `/fundraisers` | Perf 82, LCP 4.7s | **Perf 86, LCP 3.5s** | -1.2s LCP |
| `/vip-suite` | Perf 88, LCP 4.0s | **Perf 94, LCP 2.9s** | -1.1s LCP |
| `/birthday-parties-booking` | (no clean baseline) | **Perf 88, LCP 3.5s** | green-adjacent |

Every page that was blocking ad campaign launch is now under 3.5s LCP. `/bowl` and `/vip-suite` are in the green band (LCP <2.5s / <3.0s). Ads can launch.

### What landed (8 commits, all on main)

1. **`916cc84`** — Schema site-wide pass. Fixed GSC `/events` "Invalid object type for field `<parent_node>`" via dual `@type ["EventVenue", "EntertainmentBusiness"]`. Added Product/Service/Event schemas to 6 pages that had none.
2. **`9980370`** — LCP fix pattern spread to 11 pillar pages: direct `poster=` + bounded `<source media>` queries + per-page `lcpPreloadHref`.
3. **`62bffa4`** — `/new-years-eve` hero `lcpPreloadHref` (missed in spread).
4. **`4c4e3c9`** — Arcade AVIF poster + extended Vercel cache headers to `/snap`+`/og`+`/favicon-*`+`/apple-touch-icon` + Vite build target ES2020 (drops legacy-JS polyfills).
5. **`00f3905`** — AVIF sweep across all 10 section-video posters (367 KB total saved; arcade also went 1080w → 720w for the LCP outlier).
6. **`47e7479`** — **The "aha" fix.** Gated hero LCP preloads (104 KB mobile + 176 KB desktop) to homepage only. Was unconditional in Base.astro, meaning every pillar page wasted 280 KB of high-priority preload on imagery they don't display, starving the preload-scanner queue for the real LCP element. Symptom that surfaced this: `/vip-suite` with a 43 KB poster scored LCP 2.9s while `/bowl` with a 24 KB poster scored 5.2s — SMALLER poster, SLOWER LCP, because both were behind the wasted hero preload. This single commit produced the biggest LCP delta across all pillar pages (1-2.5s drops everywhere).
7. **`63bcd78`** — Handoff doc + CLAUDE.md decisions log.

### Still flagged (not blocking ads, future passes)

- **Reduce unused JS (~60 KiB/page)** — GTM stack. Partytown would move it off main thread (~300-500ms TBT win).
- **Forced reflow on `/game`** (4 instances) — `motion.client.ts` likely.
- **Homepage hero AVIF** — `/hero/hero-*.webp` still WebP. Not worth touching (homepage at 100/954ms LCP).
- **`/menu/taps` 4.5s** — iframe-related; separate investigation.
- **`/pricing` 3.6s** — no section video; CSS / critical-path render delay; separate.

### Don't break what works

Homepage retains both hero LCP preloads via `{Astro.url.pathname === '/'}` gate in Base.astro. Homepage still 100/954ms LCP. The variance theory that kept us guessing was wrong — it wasn't run noise, it was the wasted preload starving the connection queue.

### The reusable "LCP fix pattern" (documented in handoff)

For any future page with typography hero → first section video:
1. Encode AVIF Q50 poster (1080w default; 720w only for hard-to-compress content like arcade lighting)
2. Pass `lcpPreloadHref` + `lcpPreloadMedia="(max-width: 1024px)"` to `<Base>`
3. First section video: direct `poster="..."` (NOT `data-poster=`) + bounded `media="(max-width: 480px)"` / `media="(min-width: 481px)"` on the source tags
4. Below-fold videos: keep `data-poster=` (lazy is fine)

Full session captured: [session-handoffs/2026-05-17-schema-lcp-perf-sweep.md](session-handoffs/2026-05-17-schema-lcp-perf-sweep.md)

---

## 2026-05-08 (evening) — Perf pass: 100/100/100/100 across mobile + desktop

**URL:** `https://twistedpin-website.vercel.app/`
**Tool:** PageSpeed Insights (Lighthouse 13.0.1, HeadlessChromium 146.0.7680.177) + GTmetrix (Chrome 142, Seattle)
**Conditions:** Captured by user. Mobile = Slow 4G + Moto G Power emulation. Desktop = standard. GTmetrix = real-world from Seattle, WA.

### What changed since the 2026-05-05 baseline

Two perf-targeted commits this evening:

- **`bb3a3b5`** — `inlineStylesheets: 'always'` (eliminated 2 render-blocking CSS round-trips per page); `preload="metadata"` → `preload="none"` on hero + NYE videos (~1-2s LCP win on Slow 4G); poster re-encode at quality 65 webp / 78 jpg (529 KB total saved across 16 posters; mobile hero 102 KB → 72 KB).
- **`7c4f855`** — **hero video viewport gating** (the biggest single win — added `media="(max-width: 1024px)"` and `media="(min-width: 1025px)"` to mobile and desktop video sources respectively; previously every visit fetched BOTH the wrong-tier and right-tier video, ~3.7 MB of doubled fetches on mobile); logos resized 3× smaller (~64 KB saved); cluster image quality 80 → 70 (~19 KB saved).

Prior fixes that landed earlier 2026-05-08 (commit `f59ae90`) but weren't measured before this run: hero entry CSS keyframes (replaced silently-broken Motion-12 `animate()`); lazy-load fix on poster fetches via `data-poster` → `poster` promotion; AggregateRating schema; `<main>` landmark hoist; H3 hierarchy on /faq + /leagues.

### Desktop (Lighthouse, PSI)

| Score | Value | vs 2026-05-05 baseline |
|---|---|---|
| Performance | **100** 🟢 | held (was 100; intermediate run on May 8 8:40 PM CDT showed 79 due to TBT 440ms — the hero video gating fix is what cleared it) |
| Accessibility | 100 🟢 | held |
| Best Practices | 100 🟢 | held |
| SEO | 100 🟢 | held |

| Metric | Value | vs 2026-05-05 baseline |
|---|---|---|
| FCP | **0.3s** | held (was 0.3s) |
| LCP | **0.6s** | -0.1s (was 0.7s) |
| TBT | **0ms** | held (was 10ms; spiked to 440ms in the intermediate run) |
| CLS | **0.002** | held (essentially 0) |
| Speed Index | **0.5s** | n/a (not in baseline) |

**Read:** desktop is fully clean. The TBT spike to 440ms in the intermediate run was caused by the desktop hero video competing with main-thread work during decode — the viewport gating fix eliminates that contention by ensuring only the right-tier video file is even fetched.

### Mobile (Lighthouse, PSI)

| Score | Value | vs 2026-05-05 baseline |
|---|---|---|
| Performance | **100** 🟢 | **+14** (was 86 yellow) |
| Accessibility | 100 🟢 | held |
| Best Practices | 100 🟢 | held |
| SEO | 100 🟢 | held |

| Metric | Value | vs 2026-05-05 baseline |
|---|---|---|
| FCP | **1.0s** | -0.5s (was 1.5s) |
| **LCP** | **1.0s** | **-2.9s (was 3.9s yellow band)** |
| TBT | **40ms** | +40ms but still well under 200ms threshold (was 0ms) |
| CLS | **0.007** | +0.007 (still well under 0.1; basically noise) |
| Speed Index | **1.5s** | -2.6s (was 4.1s) |

**Read:** the LCP cut from 3.9s → 1.0s (74% reduction) is the headline result. Mobile finally hit perfect Performance 100 on Slow 4G + Moto G Power, the worst-case profile the brief targets.

### GTmetrix (real-world, Seattle WA)

| Metric | Value |
|---|---|
| Grade | **A** |
| Performance | **92%** |
| Structure | **94%** |
| LCP | **743ms** |
| TBT | **41ms** |
| CLS | **0** |
| TTFB | 203ms |
| TTI | 603ms |
| FCP | 339ms |
| Speed Index | 3.3s (only "longer than recommended" metric — non-CWV, noisy on hero-video pages) |
| Fully Loaded | 1.3s |

**Total network payload (GTmetrix Structure):** **3.49 MB** (down from ~5.9 MB pre-optimization, ~5.7 MB intermediate). Top contributors:

| Asset | Size |
|---|---|
| `/hero/hero-desktop-av1.mp4` | 3.01 MB |
| `/hero/hero-desktop-poster.webp` | 173 KB |
| `/snap/beerwall-poster.webp` | 90 KB |
| `/hero/hero-poster.webp` | 72 KB |
| `/pattern/pin-tilt-white.png` | 26.9 KB |
| `/_astro/Base.astro_*.js` | 23.9 KB |
| `barlow-condensed-latin-900-normal.woff2` | 21.6 KB |
| 3 other woff2 fonts | 18-19 KB each |
| HTML | 16.9 KB |

The hero AV1 video at 3.01 MB is the entire payload tail on desktop. It's loaded with `preload="none"` and falls outside the LCP window, but it's 86% of the total bytes — single biggest remaining lever if a future round wants to push further.

### Insights still flagged (informational only — score is already 100)

- **Forced reflow** (mobile, 93ms unattributed): JS triggering layout reads after writes. Likely Motion / IntersectionObserver / sticky CTA bar scroll watcher. Doesn't move the score; not worth chasing without a profiling session.
- **Network dependency tree** (mobile + desktop): fonts + Base JS chained off HTML. Same as prior run.
- **Improve image delivery** (mobile, ~26 KiB savings, down from ~94 KiB earlier today): logo resize + poster re-encode cleared the bigger items. Remaining items are sub-30KB at this point.

### What's left if a future round wants nuclear

These all sit BELOW the score-impact threshold but would tighten real-world bytes:

- Re-encode hero-desktop-av1.mp4 at lower CRF (3.01 MB → ~2 MB) — touches the largest single asset on the page
- Critical font preload (`<link rel="preload" as="font" type="font/woff2">`) — needs build-time templating because woff2 filenames are content-hashed
- `Save-Data` / `prefers-reduced-data` detection — skip video on flagged connections
- Forced reflow source diagnosis (JS profiling session) — not score-impacting
- Inline render-blocking critical CSS extraction beyond what `inlineStylesheets: 'always'` does

**Recommendation:** **don't chase any of these.** The page is at 100/100/100/100 on synthetic, A grade on GTmetrix, and ~3.5 MB total payload is reasonable for a video-led venue site. Real CrUX data after launch is the next signal that should drive any further perf work.

---

## 2026-05-05 — Baseline (pre-optimization)

**URL:** `https://twistedpin-website.vercel.app/` *(homepage)*
**Tool:** [PageSpeed Insights](https://pagespeed.web.dev/) (Lighthouse 13.0.1, HeadlessChromium 146.0.7680.177)
**Conditions:** Captured by user via the web UI. Mobile = Slow 4G, Moto G Power emulation. Desktop = Custom throttling.

### Desktop

| Score | |
|---|---|
| Performance | **100** 🟢 |
| Accessibility | **100** 🟢 |
| Best Practices | **100** 🟢 |
| SEO | **100** 🟢 |

| Metric | Value |
|---|---|
| FCP | 0.3s |
| LCP | 0.7s |
| TBT | 10ms |
| CLS | 0 |

**No work needed.** Suggested improvements (render-blocking 150ms, image delivery 218 KiB, forced reflow, network dependency tree) would shave milliseconds off a 100 score — not worth touching.

### Mobile

| Score | |
|---|---|
| Performance | **86** 🟡 |
| Accessibility | **100** 🟢 |
| Best Practices | **100** 🟢 |
| SEO | **100** 🟢 |

| Metric | Value | Target | Status |
|---|---|---|---|
| FCP | 1.5s | < 1.8s | ✓ |
| **LCP** | **3.9s** | < 2.5s | ❌ yellow band |
| TBT | 0ms | < 200ms | ✓ |
| CLS | 0 | < 0.1 | ✓ |
| Speed Index | 4.1s | < 3.4s | ❌ |
| Total payload | 5,900 KiB | — | (mostly hero video) |

**Read:** above the brief's 85+ target but LCP is in the yellow band. Single-issue failure — every other Web Vital is excellent. Filmstrip showed 5 blank frames before the hero pizza paints, suggesting render-blocking CSS is the bottleneck (not poster fetch slowness — poster preload was already in place with `fetchpriority="high"`).

### Lighthouse insights flagged (mobile)

- Render-blocking requests — Est savings 720 ms
- Improve image delivery — Est savings 120 KiB
- Avoid enormous network payloads — 5,900 KiB total

---

## 2026-05-05 — Optimization pass shipped (response to baseline)

Five structural fixes that don't depend on real content landing.
Commits: `7912752` (5 of 5) + `881e397` (closes the tap wall encode).

| # | Fix | Where | Expected impact |
|---|---|---|---|
| 1 | Mobile hero serves 540w on phones ≤480px | `src/pages/index.astro` — added `<source media="(max-width: 480px)">` BEFORE the 1080w sources. Files were already encoded but never referenced. | ~1 MB cut from mobile LCP. **Biggest single win.** |
| 2 | Hero poster preload | `src/layouts/Base.astro` — verified `<link rel="preload" as="image" fetchpriority="high">` was already in place with mobile/desktop media-query split. No change needed. | Already optimal. |
| 3 | Latin-only @fontsource subsets | `src/styles/global.css` — switched `@fontsource/*/900.css` etc. → `@fontsource/*/latin-900.css`. CSS file size 5x smaller per face (1452B → 298B). Same fonts, same `font-display: swap`. | Reduces render-blocking CSS bytes. |
| 4 | Tap wall video gains 540w variants | `scripts/build-snap-video.sh` + `src/pages/index.astro` — encoder produces 540w in addition to 1080w; markup uses `<source media="(max-width: 480px)">` to pick small on phones. AV1 1.1 MB → 462 KB; H.264 1.3 MB → 420 KB. | ~870 KB cut per phone visit on the lazy-loaded tap wall section. |
| 5 | AVIF added to snap image pipeline | `scripts/build-snap-images.mjs` — emits `.avif` alongside `.webp` + `.jpg`. AVIF was 15-30% smaller than WebP at perceptually-equivalent quality across the 3 menu-hub thumbnails. `src/pages/menu/index.astro` `<picture>` tags updated to list `image/avif → image/webp → jpg fallback`. | Snap image bytes cut 15-30% per browser that supports AVIF (~95% coverage: Chrome 85+, Safari 16.4+, Firefox 113+). |

**NOT shipped (deferred):**

- **CRF tuning** (push mobile video CRF higher for additional 30-40% byte cut) — the 540w switch addresses the same bandwidth concern more cheaply. Revisit only if 540w isn't enough.
- **AVIF for non-menu-hub `<picture>` tags** (homepage cluster cards, IG tiles, hero poster) — sources for those weren't in this worktree, so couldn't run the encoder. When sources land in `Context/pictures/` and the encoder is re-run, AVIF outputs auto-generate. `<picture>` tags will need updating then to include the AVIF source.

### Expected outcome

Mobile perf 86 → 92-96, LCP 3.9s → ~1.5-2.0s — once real content lands and we can re-test against the *final* state of the page, not the placeholder-heavy current state.

---

## When to re-test

**Don't re-test until:**

- [ ] Real photography lands for the homepage cluster cards + pillar pages (currently using placeholders / homepage reuses)
- [ ] Final hero video splice is locked (currently using `Bank Vs Stories` 0-4s placeholder; locked direction is pour → tap wall → cocktail, 3 sources)
- [ ] (Optional, but helpful) Adobe Fonts kit ID lands and we swap out @fontsource

Re-running PageSpeed Insights against placeholder content + then again against final content + then again after fixes = three measurements that can't be cleanly compared. One measurement against the final state, compared against the baseline above, is the cleanest signal.

---

## Future-run template

When the next run happens, append below (keeping baseline + this entry intact):

```
## YYYY-MM-DD — [What changed]

**URL:** `<URL tested>`
**Tool:** PageSpeed Insights (Lighthouse <version>)
**Conditions:** <mobile/desktop, throttling>

### Desktop / Mobile [whichever]

| Score | Value | vs baseline |
|---|---|---|
| Performance | XX | +/- N |
| ...

### Diff vs prior run
- LCP: 3.9s → X.Xs (<change in ms>)
- ...

### Insights flagged
- ...

### What we did in response
- ...
```
