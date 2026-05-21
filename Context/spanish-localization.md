# Spanish Localization

Source-of-truth doc for Spanish-language pages on twistedpin.com. Mirrors the spirit of `Context/dns-migration.md` and `Context/waitlist-theory.md` — a topic-specific reference that outlives any single session.

---

## Status

**Phase 1 live (2026-05-18):** `/es/bowl/` only.

- Hreflang triplet (en-US / es-US / x-default) declared on both `/bowl` and `/es/bowl`
- Matching `@id` in both pages' BowlingAlley schema (Google treats them as one business entity, two languages)
- `inLanguage: "es-US"` on the Spanish schema node
- Translation-freshness tracker hooked into `npm run build` via `prebuild` (`scripts/check-translation-freshness.mjs`)
- Production correction-link footer on `/es/bowl/` (mailto + cross-link to English version)
- Side-by-side translation audit lives in this doc

**Phases 2 + 3 deferred:** see "Phase plan" below.

---

## Why this matters (the commercial case)

Per `seo.md:44`:
> Spanish: `boliche cerca de mi`, `bolos cerca de mi` | 9.6% Hispanic local population. Zero competition. 68 clicks already.

The 68 clicks are happening **without any Spanish targeting** — Google is already serving the English `/bowl/` to Spanish searchers because there's nothing better to serve. Two compounding problems with that:

1. **Organic.** Google ranks pages with real translated content above pages that *could* be auto-translated. We're leaving rank lift on the table.
2. **Paid.** Spanish ads run TODAY (Bar-Led campaign → Spanish Test ad group → 5 keywords at $1.50 max CPC) all currently land on the English `/bowl/`. Predictable bounce-rate problem on paid traffic.

Conservative organic estimate: 3-5x lift on Spanish-query impressions. Aggressive (zero-competition market): 8-15x. Either way the bar is low and the cost of NOT shipping is real ad spend wasted today.

---

## Translation principles

These are the rules the next translator (human or LLM) should follow.

### Dialect

**Mexican Spanish** is the target dialect. Plainfield / Joliet / Aurora Hispanic market is predominantly Mexican (per `project_geo_targets.md` memory + local demographics). Choices when Mexican and Castilian Spanish diverge:

| English | Mexican | Castilian (avoid) | Notes |
|---|---|---|---|
| bowling alley | boliche | bolera | Both valid, "boliche" is universally understood in Mexico + US Mexican-American communities |
| bowling lane | pista | línea / canchita | "pista" is standard |
| cocktail | coctel | cóctel | Both valid; "coctel" is more common in casual MX Spanish |
| computer | computadora | ordenador | "Computadora" universal in Latin America |
| you (singular) | tú (informal) / usted (formal) | vos / vosotros | We use **tú** — matches "confident, slightly informal" brand register |
| bumpers (kid-rails) | rampas | barras de protección | "Rampas" is the common venue term |

### Register

Twisted Pin's English brand voice is "confident with attitude, slightly needling, specifics > adjectives." Spanish equivalents:

- **Use `tú` / implied subject**, NOT `usted` — formality would code as corporate / stuffy
- **Imperative verbs are fine** ("Llega," "Reserva," "Llévate") — match the English imperative cadence
- **Avoid empty intensifiers** — "increíble," "espectacular," "el mejor lugar de Plainfield" — same rule as the English voice.md "no perfect / magical / memorable" ban
- **Specifics over adjectives** — "17 pistas tradicionales más una suite VIP de 6 pistas" beats "el mejor boliche del área"
- **Slight informal punchlines OK** — "(sí, te la puedes llevar entera)" matches the English "(yes, you can take it over)" register

### Hospitality terms

Translation choices specific to bar/bowling vocabulary, picked deliberately:

| English | Spanish | Why |
|---|---|---|
| Reserve a lane | Reservar una pista | "Reservar" universal; some venues use "Apartar una pista" — both work, "reservar" matches the cleaner brand voice |
| See the suite | Ver la suite | "Suite" is a loanword that's universal in MX hospitality |
| LED video wall | Pantalla LED | "Pantalla" is the natural Spanish term; "video wall" loanword is needlessly English |
| AV solutions | Soluciones de audio y video | Spelled out for clarity; A/V is anglo-coded |
| tab (bar tab) | una cuenta (running) | "Abrir una cuenta" is the Mexican Spanish phrase for "run a tab" |
| open bowling | boliche libre | "Boliche libre" is the Mexican-Spanish hospitality term; not "open bowling" calque |
| walk-in | sin reservación | Functional translation; "walk-in" loanword exists but reads English |
| set apart from | separada/o de | Past participle agreement with the noun being separated |

### Brand-name handling

- **"Twisted Pin"** — stays in English. Brand names don't translate.
- **"Brian Van Flandern"** — stays in English.
- **"America's Top Mixologist"** — translated to "Top Mixólogo de Estados Unidos" (keeping "Top" since "Mixólogo Principal" sounds odd; "Top" reads as a brand credential).
- **"Food Network"** — stays in English. US TV network brand name.

### Cultural-connotation traps

Specific failure modes to watch for (these have been audited):

- ❌ "Diversión Para Adultos" — reads as adult-entertainment euphemism in Mexican Spanish. **Banned.**
- ❌ "Para toda la familia" — fine literal translation but codes as family-friendly first, contradicts our adults-first thesis. Use "para adultos. Los niños también vienen." constructions if family-welcome needs surfacing.
- ❌ Overly-formal `usted` constructions — code as corporate / hotel marketing, not the Twisted Pin register.
- ❌ Calques like "rolar las pistas" for "rolling the lanes" — confusing. Use natural Spanish bowling verbs.

---

## /es/bowl/ — side-by-side audit

The full translation, paragraph-by-paragraph. Future review pass (bilingual staff member, ops, or native speaker) can audit specific sections against the English source.

### Meta

| Field | English (`/bowl/`) | Spanish (`/es/bowl/`) |
|---|---|---|
| Title | Bowling in Plainfield, IL — Twisted Pin | Boliche en Plainfield, IL — Twisted Pin |
| Description | 17 traditional lanes plus a 6-lane VIP suite. Walk in, reserve, or join a league. Plainfield, IL — 5 minutes from Naperville and Bolingbrook. | 17 pistas tradicionales más una suite VIP de 6 pistas. Llega sin reservación, reserva, o únete a una liga. Plainfield, IL — a 5 minutos de Naperville y Bolingbrook. |
| OG image alt | A bowling lane at Twisted Pin in Plainfield, IL | Una pista de boliche en Twisted Pin en Plainfield, IL |

### Hero

| Element | English | Spanish |
|---|---|---|
| Eyebrow | Bowling | Boliche |
| H1 | 17 lanes. Plus a 6-lane VIP suite. | 17 pistas. Más una suite VIP de 6 pistas. |
| Sub | Walk in any time. Reserve a few lanes in the VIP suite — or take all six. | Llega cuando quieras. Reserva unas pistas en la suite VIP — o llévate las seis. |

### Traditional Lanes section

| Element | English | Spanish |
|---|---|---|
| Eyebrow | Traditional Lanes | Pistas Tradicionales |
| H2 | 17 lanes. Walk in or reserve. | 17 pistas. Llega o reserva. |
| Body P1 | 17 traditional lanes for the actual bowling — the part of a bowling alley that's supposed to do bowling. Open bowling almost any time you walk in. Reserve a lane if you'd rather lock one in for a busy night. | 17 pistas tradicionales para bolear en serio — la parte de un boliche que debería ser para bolear. Boliche libre casi siempre que llegas. Reserva una pista si prefieres asegurarla para una noche concurrida. |
| Body P2 | Bumpers when the kids need them. Cocktail in hand when they don't. | Rampas cuando los niños las necesiten. Coctel en la mano cuando no. |
| List | 17 traditional lanes / 5 players max per lane / Open bowling almost any time / Reservations for busy nights, not the rule / Bumpers available / Shoe rental at the counter | 17 pistas tradicionales / Máximo 5 jugadores por pista / Boliche libre casi siempre / Reservaciones para noches concurridas, no la norma / Rampas disponibles / Renta de zapatos en el mostrador |
| CTA | Reserve a lane | Reservar una pista |
| Cross-link 1 | **Leagues** · weekly mixed leagues, casual + competitive | **Ligas** · ligas mixtas semanales, casuales + competitivas |
| Cross-link 2 | **Free summer kids bowling** · 2 games/day, weekdays 11–4, June 1–30 | **Boliche gratis para niños en verano** · 2 juegos/día, lunes a viernes 11–4, 1–30 de junio |

### VIP Suite Preview section

| Element | English | Spanish |
|---|---|---|
| Eyebrow | The VIP Suite | La Suite VIP |
| H2 | Two lanes, four, or six. | Dos pistas, cuatro, o seis. |
| Aside | (yes, you can take it over) | (sí, te la puedes llevar entera) |
| Body P1 | The 6-lane VIP suite sits behind a wall, set apart from the traditional lanes — semi-private, yours when you book it. Reserve two lanes, four, or all six. Up to 80 people when you take the whole suite. Couch seating wraps the lanes for whoever'd rather watch than throw. LED video wall for slideshows or the game. AV solutions available. | La suite VIP de 6 pistas está detrás de una pared, separada de las pistas tradicionales — semi-privada, tuya cuando la reservas. Reserva dos pistas, cuatro, o las seis. Hasta 80 personas cuando te llevas la suite entera. Sillones que rodean las pistas para quien prefiera ver en lugar de tirar. Pantalla LED para presentaciones o el partido. Soluciones de audio y video disponibles. |
| Body P2 | The 28-tap self-serve wall sits next door. The cocktail bar runs the program curated by Brian Van Flandern, *America's Top Mixologist*. In-house catering through the kitchen. | El muro de 28 grifos de autoservicio está a un lado. La barra de cocteles tiene el programa curado por Brian Van Flandern, *Top Mixólogo de Estados Unidos* (Food Network). Catering desde la cocina. |
| List | Up to 80 people / Reserve 2, 4, or 6 lanes / Semi-private couch seating / LED video wall + AV solutions / Tap wall + cocktail bar + kitchen access | Hasta 80 personas / Reserva 2, 4 o las 6 pistas / Sillones semi-privados / Pantalla LED + soluciones de audio y video / Muro de grifos + barra de cocteles + acceso a cocina |
| CTA | See the suite | Ver la suite |

### Breadcrumbs

| English | Spanish |
|---|---|
| Home → Bowl | Inicio → Boliche |

---

## Known v1 gaps (intentional)

These are conscious trade-offs to ship Phase 1 fast; flagged for Phase 1.5 work:

1. **SnapFooter renders in English** on `/es/bowl/`. Hybrid experience (Spanish hero + body + schema, English footer + nav + hours). Phase 1.5 options:
   - Thread a `locale` prop through `SnapFooter.astro` → render Spanish strings when locale === "es-US"
   - Build a `SnapFooterES.astro` component variant
   - Lift footer microcopy to a shared `src/data/i18n.ts` keyed by locale
2. **SiteHeader (top nav) renders in English.** Same fix path as SnapFooter.
3. **Cross-links from `/es/bowl/`** point at English destinations (`/vip-suite/`, `/leagues/`, `/free-kids-bowling/`). A Spanish reader who can read this page can navigate the English destinations, but a real Spanish UX would route to `/es/vip-suite/` etc. — Phase 2+ work as sibling pages get built.
4. **Hours block in body** — `/bowl/` doesn't currently render hours in body, only in SnapFooter. If we add an explicit hours mention to `/bowl/` later, `formatHoursAnswer()` in `src/lib/schema.ts` returns English-only ("Monday", "closed", "Hours may vary on holidays..."). Would need a `formatHoursAnswerEs()` variant or i18n key approach.

---

## Phase plan

| Phase | Scope | Timing | Trigger |
|---|---|---|---|
| **1** ✅ | `/es/bowl/` only | shipped 2026-05-18 | Spanish ads bleeding into English LP today |
| **1.5** | SnapFooter + SiteHeader Spanish localization (or accept hybrid for now) | TBD | When `/es/bowl/` data shows meaningful Spanish traffic AND we want to retain it through the funnel |
| **2** | `/es/menu/cocktails/` + `/es/menu/food/` | 30-60 days after Phase 1 | If Phase 1 generates measurable Spanish-query traffic + reservations |
| **3** | Events family (`/es/events/`, `/es/vip-suite/`, `/es/corporate-events/`) | data-required | If (a) Google Ads shows Spanish impressions on event keywords, OR (b) Phase 2 shows Spanish customers booking events |
| **— SKIP —** | Homepage Spanish version | not planned | Voice-locked English copy is high translation-risk; revisit only with deliberate Spanish brand-voice work |

---

## Maintenance workflow

When `/bowl/` copy is updated:

1. Make the English edit on `/bowl/` as normal
2. `npm run build` runs the prebuild freshness check
3. If `/es/bowl/` is now >14 days behind, the build warns: `[translation-freshness] WARN: src/pages/es/bowl.astro is N days behind src/pages/bowl.astro`
4. Re-translate the changed sections using the same workflow:
   - Claude translation pass (Mexican-Spanish + hospitality + brand-voice prompt)
   - Cross-LLM-style self-QA pass
   - Update this side-by-side doc to match
   - Commit Spanish + English together

When the production correction-link surfaces a real bug:

1. Email arrives at `contactus@twistedpin.com` with subject "Corrección de traducción /es/bowl/"
2. Triage: is it a regional vocabulary preference, a grammar fix, or a cultural-connotation problem?
3. Patch the Spanish page + update this doc + commit

---

## References

- **`seo.md:44`** — original Spanish-keyword opportunity (9.6% Hispanic local, 0 competition, 68 clicks)
- **`project_geo_targets.md`** memory — Plainfield/Joliet/Aurora Mexican-Spanish predominance
- **`scripts/check-translation-freshness.mjs`** — freshness tracker source
- **`src/pages/es/bowl.astro`** — Phase 1 page
- **Hreflang docs** — Google's [reference](https://developers.google.com/search/docs/specialty/international/localized-versions) on hreflang triplet + x-default + reciprocal declaration
- **Ads team translation feedback** — captured in this session's pushback (2026-05-18); recommended Mexican-Spanish dialect, flagged "Diversión Para Adultos" failure mode, identified urgent ad-spend bleed as the timeline driver
