# Performance History

Append-only log of Lighthouse / PageSpeed Insights runs against the
production deploy. Used to track regressions, measure the impact of
optimization passes, and decide when re-testing is worth doing.

**Convention:** each entry stamped with date + URL tested + raw scores
+ what we did or planned in response. Newest at top. Don't edit older
entries — they're the baseline.

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
