# 2026-06-17 — Booking UX, type/legibility, conversion-tracking levers

Session focused on the live TPRS `/reserve*` booking flow + a couple of
`/corporate-events` and events-calendar touch-ups. Most of it is small levers —
the value is the **reasoning**, captured below so we don't re-derive it. Read the
"Reusable levers" section first; the commit ledger at the bottom is the record.

Precursor in the same session arc: `005b1c7` (first mobile booking-flow polish —
inputs 16px, form-error reveal, density) + the `/reserve` cutover (`08e8154`,
`06694f6`). The NYE noindex lift (`393ff26`) was a parallel agent.

---

## Reusable levers (the "future logic" — apply these again)

### 1. Mobile type-size rubric — surgical, not blanket
Standards we benchmark against (confirmed with sources this session):

| | Primary / read-to-decide | Secondary | Hard floor |
|---|---|---|---|
| iOS HIG (Dynamic Type) | 17pt body | 13pt footnote | 11pt caption |
| Material 3 | 16sp Body Large | 14sp | 12sp |
| Baymard / NN/g | **16px** | 14px | 12px |
| Lighthouse "legible fonts" SEO audit | — | — | **<12px = fail** |
| **Consensus we use** | **16px** | **14px** | **12px** |

**Principle:** bump ONLY where the guest reads-to-decide-or-consent, or where text
is under the 12px floor. Do **not** drag dense financial surfaces to 16px — carts
run 13–14px line items by universal convention (Amazon/DoorDash/OpenTable); a
16px-everything cart pushes the Pay button down and reads as a generic
accessibility-checkbox UI. Keep secondary/caption text quiet so the bumped
read-text has contrast to stand out. Inputs are always ≥16px (see lever 3).
Applied this session: consent rules 14.5→16, payment terms 12.5→14, cart
sub-descriptor 11.5→12 (the only sub-floor offender), add-on name 14→16, policy
prose 13.5→15. Left alone: cart line items/totals, captions, labels.

### 2. Display-Black goes soft at 1× desktop (the "blurry on desktop, fine on mobile" lever)
Symptom: a heavy (900) **condensed display** headline at a **small, sentence-case**
size reads crisp on mobile but soft/blurry on desktop. **Cause = device pixel
ratio**, not size: phones are 2–3× DPI (plenty of physical pixels for the thick
strokes + tight counters); most desktop monitors are 1× and can't resolve it.
**Fix:** don't resize — change the *face* on desktop. Step the small headline down
to a cleaner/lighter face (`Montserrat 700` via `@media (min-width:1025px)`),
keep the condensed display font on mobile and for big uppercase headers where the
weight earns it. (We only load Barlow Condensed **900**, so there's no lighter
condensed weight to fall back to without a new font file.) Applied to
`.corp-uc-headline`. Reuse for any future small sentence-case display headline
(e.g. if the use-case card grid is copied to other event pages).

### 3. iOS input zoom on booking/checkout — 16px is necessary, not sufficient
`font-size:16px` on our inputs stops iOS auto-zoom-on-focus for elements **we
own**. It does NOT cover the Stripe PaymentElement (a cross-origin iframe we can't
restyle past `fontSizeBase`). The auto-zoom is a **top-level viewport** action, so
the fix that covers the iframe too is capping `maximum-scale=1` on the page —
`Base.astro` `lockViewportZoom` prop, set on the 3 `/reserve*` pages only. On
iOS 10+ this stops the programmatic zoom while **still allowing manual pinch**
(Apple's a11y override), so it's not the old `user-scalable=no` regression.
Reuse for any checkout/iframe page; keep it OFF site-wide.

### 4. GA4 → Ads purchase conversion tracking (the attribution lever)
Roller's purchase event died at the `/reserve` cutover, leaving the live booking
flow with zero conversion tracking. Restored: `gtag` stub in `Base.astro` (GA4
`G-R64WB0Y4VW` + Ads `AW-961151619`, deferred load + cross-domain linker) +
a `purchase` event fired from `ConfirmationStep.tsx`
(`transaction_id` = invoice, `value`, `currency`), deduped per invoice.
**Split that matters:** the *firing* is in code; turning it into a *counted Google
Ads conversion* is a dashboard step — mark `purchase` a **Key Event** in GA4, then
**GA4→Ads import**. Client-side = lossy (ad-blockers/consent); the revenue truth is
Stripe/TPRS — this is marketing attribution. **OPEN:** confirm the GA4 key-event +
Ads import are actually on (else it's analytics-only). Verify via GA4 DebugView /
Realtime after a live booking, GA4 Admin→Key Events, Ads→Goals→Conversions.

### 5. Events calendar + Event structured data
Add an event = drop one markdown file in `src/content/events/*.md` (schema in
`src/content.config.ts`). Levers:
- **AggregateOffer** via `lowPrice` (+ optional `highPrice`/`validFrom`) clears GSC
  "Missing field 'offers'/'highPrice'/'validFrom'" and keeps each Event
  rich-result-eligible. For a flat price set `lowPrice == highPrice`.
- **60-day lookahead** — events only render within ~60 days of start (no stale
  far-future dates); that's why NYE isn't on the calendar until ~November.
- **Long external booking URLs → a `/slug` 302 short link** in `vercel.json`
  (matches `/essential`, `/tour`, `/review`). One clean link for the calendar CTA
  + FB/SMS/print, updatable in one place. Use the absolute `https://www.twistedpin.com/slug`
  form in the event `cta.href` so the card opens it in a new tab and the Event
  JSON-LD `url` cleanly falls back to `/upcoming-events/`.

### 6. Pre-sale "coming soon" notice (config-driven, self-resolving)
`presaleNotice` on `BookingPageConfig`: when a page's products exist but none are
bookable on the canonical `defaultDate` (sales window not open in the TPRS engine),
render a branded "drops soon, follow us" beat instead of the bare "sitting this one
out" list — so a not-yet-on-sale page (now indexed) doesn't read broken to users or
crawlers. **No date hardcoded in the frontend**; self-resolves when sales open.
Reusable for any pre-sale event. Annual ops checklist: `src/tprs/NYE-ANNUAL-PLAYBOOK.md`.

---

## UI polish (one-offs, less "lever")
- **Duration tiles fill the frame** — `repeat(auto-fit, minmax(140px, 1fr))` (was
  capped 250px + centered → squeezed with watermark gutters). 2-up side-by-side,
  lone tile auto-expands to full-width hero, future 3rd duration wraps. Desktop cap
  preserved. (`c89519d`)
- **Add-on row** — centered name, desc 12.5→14, "$X each" 14→18 bold (parity with
  the qty stepper). (`9e6578d`)

---

## Open items
- **Confirm GA4 `purchase` is a Key Event + imported to Ads** (lever 4) — the one
  thing not verifiable from the repo.
- Corporate-events card-title face is desktop-Montserrat now; if the use-case grid
  is reused on other event pages, apply the same treatment (lever 2).

---

## Commit ledger (this conversation, oldest→newest)
| SHA | What |
|---|---|
| `dd7285c` | iOS zoom fix (viewport max-scale on booking pages) + tap targets/enterKeyHint/dvh |
| `a3d25bb` | GA4 `purchase` event on booking confirmation |
| `c89519d` | duration tiles 2-up fill-the-frame |
| `63017cf` | surgical mobile type-size bumps (read-to-decide + sub-floor) |
| `9e6578d` | add-on row polish (center name, bigger desc + "$X each") |
| `f2f5f8c` | pre-sale "coming soon" notice (config-driven, self-resolving) |
| `2437d27` | NYE annual playbook doc |
| `8bfdbb0` | Paint Night event (Jul 21) + `/paint-night` short link |
| `af5ae11` | Paint Night end time (6–8:30pm) |
| `90151b8` | corporate-events card titles — explicit 900 + size bump (superseded by ↓) |
| `1bd44be` | corporate-events card titles → Montserrat 700 on desktop (the real 1×-DPI fix) |
