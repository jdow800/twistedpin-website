# Twisted Pin — Media Needs

Working list of imagery, video, copy, and data assets we want for the new
build but don't yet have (or have only as stubs / homepage reuses).

**How to use this doc:**
- Each pillar adds entries when it ships. Per-page TODOs in the Astro file
  comments stay (they're the developer's running notes); this is the
  centralized list the user scans to source / brief / replace.
- For each entry: confirm what's needed, then either (a) source from the
  existing photo library, (b) brief a new shoot, or (c) confirm the stub
  is acceptable for launch.
- Cross out / remove rows as real assets land.
- New pillars add new sections as they're built.

---

## /bar — shipped

| Asset | Currently | Need |
|---|---|---|
| Hero photo | None (typography-only title section) | Optional: bar-room atmosphere shot at hero scale (the Jan 29 2024 photo was the original target). NOT blocking — typography hero is the locked pattern |
| Cocktails section photo | `cocktails-bg-540.webp` (same shot as homepage Cocktails snap) | Distinct cocktail editorial. Per `visual-direction.md`: AIV01579 (copper-shaker pour), AIV01592 (cherry old fashioned), DSC_0110 (orchid highball). Need ONE for the section |
| Tap Wall section photo | `beerwall-poster.webp` (same as homepage Tap Wall snap) | Reuse is acceptable — this IS the wall, so same shot reads as continuity not redundancy |
| Five signature cocktail names + 1-line descriptions | Placeholders ("[Signature Cocktail 2]" etc., one real: "The Twisted Old Fashioned") | Real cocktail names + 1-line descriptions. Could pull from cocktail menu when GoTab API integration lands |

## /eat — shipped

| Asset | Currently | Need |
|---|---|---|
| Hero photo | None (typography-only title section) | Optional: food-on-wood hero shot at ~900–1080px wide. NOT blocking |
| The Kitchen section photo | `stage-eat-600.webp` (same shot as homepage Eat snap) | Distinct food editorial — chef in action, plates being prepped, sauce on a board |
| Built to Share section photo | `stage-eat-540.webp` (same shot, smaller crop) | Distinct shareable-plates shot — multiple plates on a table, hands reaching, group-eating energy |
| Five signature dish names + 1-line descriptions | All placeholders | Real dish names + 1-line descriptions |

## /vip-suite — shipping next

| Asset | Currently | Need |
|---|---|---|
| Hero photo | None (typography-only title section per pattern) | Optional |
| The Room section photo | `events-bg-600.webp` (same shot as homepage Events snap) | Distinct VIP-suite room shot — could be the same `DSC00785-Enhanced-NR` already approved per `visual-direction.md`, or a wider room shot showing couch seating + LED video wall |
| What You Can Do section photo | `events-bg-540.webp` (same shot, smaller crop — placeholder) | Distinct event-energy shot — group celebrating, food on a table in the suite, AV in use, etc. |
| Capacity number | "Up to 80" (from `seo.md` / `CLAUDE.md`) | Confirm with operations; if different, update in copy + alt text |
| Fundraiser stat | "50% of bowling revenue back to the host" (from `seo.md`) | Confirm with operations — this is a public-facing claim |

## Site-wide / shared

| Asset | Currently | Need |
|---|---|---|
| Phone number | `(815) 555-0100` placeholder in SnapFooter | Real phone |
| Instagram handle + 6 thumbnails | `#` placeholder href on handle, `ig-1` through `ig-6` images (existing in `/public/snap/`) | Real `@twistedpin` handle linked to actual profile, real recent post URLs (or auto-feed integration via Instagram Basic Display API) |
| Facebook URL | `#` placeholder | Real URL |
| TikTok URL | `#` placeholder | Real URL |
| Mobile hero video splice | `Bank Vs Stories` 0–4s, single shot | Splice timestamps pending — direction is locked: pour → tap wall → cocktail (3 sources, ≤4–5s total) |
| Desktop hero video | `After Social Highlight v2.mp4`, 8s recut placeholder | Final desktop hero — pending a real shoot or Ken-Burns photo treatment per `visual-direction.md` |
| OG / share card image | None specified | Brand-coherent 1200×630 image for social link previews (Twitter, Facebook, LinkedIn). Should match the moody/photo-led visual direction |
| Reviews count | Hardcoded `4.5` / `1,053` (Google) and `4.2` / `80` (Yelp) | Real-time pull from Google Places API / Yelp Fusion API (or accept periodic manual updates) |
| Hours | Static "Open today / until 11:00 PM" placeholder | Real-time hours via Google Places API (cached daily) or static schedule with JS open/closed calculator |

## Future pillars (not yet built — needs catalogued when shipped)

- **/events** — listing of popular events, "Plan My Event" CTA → `events.twistedpin.com` (Zite). Will need: real event imagery (corporate, birthday, fundraiser), upcoming events data source (Zite API or static markdown)
- **/bowl** — anchor sections for traditional lanes, VIP suite (link to `/vip-suite`), leagues (link), free kids bowling (anchor), pro shop (anchor or omit). Will need: lane photography (per `visual-direction.md` traditional-lanes shots are OK on this page, NOT homepage), league night photography
- **/game** — arcade pillar. Will need: arcade imagery that AVOIDS full-neon (per `visual-direction.md`); skee-ball / pinball / redemption detail shots. The "giant bear" reference in the snap subhead suggests a literal giant bear prize photo could earn its place
- **/reserve** — Roller iframe wrapper. No media beyond brand chrome above the iframe
- **/gift-cards** — pending fact-check that a gift card flow exists on twistedpin.com today. If yes: photo of an actual gift card (warmly lit, on a bar or with a cocktail). If no: skip the page until the operation exists

---

## Backend / integration data (not strictly "media" but related)

| Item | Currently | Need |
|---|---|---|
| GoTab API access | Not integrated | OAuth 2.0 credentials (Client Credentials Grant) — Brian / operations to provision. Will power `/bar` "View what's on tap" + "View cocktail menu" CTAs and `/eat` "View the menu" CTAs |
| Zite app on `events.twistedpin.com` | Subdomain not yet deployed | Coordinated launch with Avery's polish. After deploy, sweep all "Plan an event" hrefs from `/events` (main) to `events.twistedpin.com` (subdomain) — currently they all point at `/events` as a placeholder |
| Roller booking URL | `https://ecom.roller.app/twistedpin/openbowl/en-us/home` confirmed | Wired into `/reserve` page when built; currently used by sticky-bar "Reserve a Lane" CTA via that direct URL |
| TablesReady waitlist | Iframe URL needed | For the waitlist polish task (branded chrome wrapper around the iframe) |

---

## Tech debt / cleanup notes (developer-facing)

- **Pillar CSS hoist**: `/bar`, `/eat`, and `/vip-suite` all share an identical hero + section pattern, currently duplicated as `.bar-*` / `.eat-*` / `.vip-*` classes. Rule-of-three has triggered — next refactor pass should hoist shared rules to `.pillar-*` utilities in `global.css`. Each page keeps only its content-specific overrides (e.g. `.bar-cocktail-list`, `.eat-dish-list`)
- **Section image variety**: Three pillars currently reuse the homepage's section photos. Once real photography lands for `/bar` cocktails, `/eat` kitchen, and `/vip-suite` room, the visual redundancy with the homepage clears
