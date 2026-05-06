# Performance History

Append-only log of Lighthouse / PageSpeed Insights runs against the
production deploy. Used to track regressions, measure the impact of
optimization passes, and decide when re-testing is worth doing.

**Convention:** each entry stamped with date + URL tested + raw scores
+ what we did or planned in response. Newest at top. Don't edit older
entries — they're the baseline.

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
