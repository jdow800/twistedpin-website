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
| Tap Wall section photo | `beerwall-poster.webp` (same as homepage Tap Wall snap) | Reuse is acceptable — this IS the wall, so same shot reads as continuity not redundancy. **2026-05-05: user flagged a reshoot may be wanted** — current photo (`BeerWallHeyFlow.jpg` source, used here + on `/menu` hub thumbnail + homepage Tap Wall) leans wide-environmental with the "GUTTERS HAPPEN BEER HELPS" sign dominating. A tighter / more atmospheric tap-row composition (or hand-mid-pour on one of the taps) would refresh all three surfaces with one shoot |
| Five signature cocktail names + 1-line descriptions | Placeholders ("[Signature Cocktail 2]" etc., one real: "The Twisted Old Fashioned") | Real cocktail names + 1-line descriptions. Could pull from cocktail menu when GoTab API integration lands |

## /eat — shipped

| Asset | Currently | Need |
|---|---|---|
| Hero photo | None (typography-only title section) | Optional: food-on-wood hero shot at ~900–1080px wide. NOT blocking |
| The Kitchen section photo | `stage-eat-600.webp` (same shot as homepage Eat snap) | Distinct food editorial — chef in action, plates being prepped, sauce on a board |
| Built to Share section photo | `stage-eat-540.webp` (same shot, smaller crop) | Distinct shareable-plates shot — multiple plates on a table, hands reaching, group-eating energy |
| Five signature dish names + 1-line descriptions | All placeholders | Real dish names + 1-line descriptions |

## /birthday-parties-booking — shipped 2026-05-11

| Asset | Currently | Need |
|---|---|---|
| Hero photo | None (typography-only title section per pattern) | Optional |
| Kids section photo | `birthday-table-{540,900,1200}.{avif,webp,jpg}` — real photo from More Images (DSC00781): party table set up with Extra Suite Birthday placard, balloon party cups, "Reserved for [name]" sign | ✅ Real photo — no action needed |
| Adult section photo | `events-bg-{540,600}.{webp,jpg}` (same stub as homepage Events + /vip-suite) | Distinct adult-birthday-in-VIP-suite shot — clean, well-lit, group enjoying themselves. Could also reuse a future VIP-suite hero shot |
| Package prices | $419 Suite Birthday / $489.90 Extra Suite Birthday (mirrored from live twistedpin.com — confirmed accurate 2026-05-11) | Confirm with ops if prices change |

## New photo catalog (More Images folder, 2026-05-11)

Five photos added by the user to `Context/pictures/More Images/`. All encoded to `/public/snap/{name}-{540,900,1200}.{avif,webp,jpg}` at the same time. Catalog of where each fits:

| File | Encoded as | Where it fits |
|---|---|---|
| DSC00781 2.JPG | `birthday-table-*` | **Used on `/birthday-parties-booking` kids section.** The real-deal birthday photo — placard, cups, reserved sign. |
| DSC00795.JPG | `kid-bowling-*` | **Not yet placed.** Kid (jersey #23) bowling in the VIP suite with the LED video wall visible. Best fit: a *future* `/vip-suite` "what you can do" section showing group activity, OR a `/free-kids-bowling` editorial section. Could also work on `/birthday-parties-booking` if the page grows a second photo |
| F2_P32.jpg | `prize-wall-*` | **Not yet placed.** Redemption counter / prize wall with neon lighting. Best fit: `/game` page (V3 tester specifically asked "what are the Skee-Ball prizes?"). Could also work as a small thumbnail callout on `/birthday-parties-booking` (kids spend game cards here) |
| DSC04640.jpg | `teens-arcade-*` | **Not yet placed.** Three teens in the arcade, basketball, color-block wall. Best fit: `/game` or homepage Game snap. Reads as older-kid / teen-party (vs the kids-party-table photo which reads younger-kid) |
| DSC_0569.jpg | `arcade-interior-*` | **Not yet placed.** Wide arcade shot — Fast & Furious sim, ticket machine, neon dice game. Best fit: `/game` hero or section photo |

Three of these (kid-bowling, teens-arcade, arcade-interior) are queued for next pillar passes on `/game` and `/free-kids-bowling`. Adding them as the appropriate sections get visual refreshes.

## /careers — shipped (visual upgrade pending)

| Asset | Currently | Need |
|---|---|---|
| Staff photo or video | None — page is typography-only | **Fun staff-team shot or short video** (user has these — flagged 2026-05-05). Placement options: (a) replace typography hero with full-bleed staff photo + headline overlay, (b) drop an editorial `.t2-section` with the image between "What You Get" and "How to Apply" as social proof before the conversion ask. (b) recommended — lighter, matches other tier-2 pages. Video would land harder than a photo if available — short, vertical or 16:9, smiling/laughing crew, post-shift drink energy welcome |

## /vip-suite — shipping next

> **🚨 P0 — single highest-leverage photo on the site.** User tester V4 (2026-05-10 user video pass) on the deployed VIP suite page: *"This doesn't look like a VIP suite. This just looks like a regular lanes. Don't show me somebody else's parties. Show me a nice clean VIP suite."* If the VIP suite reads as "regular lanes," the load-bearing brand differentiator (vs Bowlero / Lucky Strike / D&B "we have lanes") is dead in the water. **The brief: clean, well-lit, empty-but-set VIP suite. Show the room, not a party in it.** Composition should make the differentiation (couch seating, LED wall, semi-private separation from main floor) legible at a glance.

| Asset | Currently | Need |
|---|---|---|
| Hero photo | None (typography-only title section per pattern) | Optional |
| **The Room section photo (P0)** | `events-bg-600.webp` (same shot as homepage Events snap) | **Clean, empty-but-set VIP suite shot.** Wide enough to show couch seating + LED video wall + the spatial separation that makes it semi-private. Empty room (not "party in progress" — V4 explicitly flagged that pattern). `DSC00785-Enhanced-NR` already approved per `visual-direction.md` may work; if not, dedicated shoot |
| What You Can Do section photo | `events-bg-540.webp` (same shot, smaller crop — placeholder) | Distinct event-energy shot — group celebrating, food on a table in the suite, AV in use, etc. (This is the place for the "people enjoying it" energy — NOT the room hero) |
| Capacity number | "Up to 80" (from `seo.md` / `CLAUDE.md`) | Confirm with operations; if different, update in copy + alt text |
| Fundraiser stat | "50% of bowling revenue back to the host" (from `seo.md`) | Confirm with operations — this is a public-facing claim |

## Site-wide / shared

| Asset | Currently | Need |
|---|---|---|
| Phone number | `(815) 555-0100` placeholder in SnapFooter | Real phone |
| Instagram handle + 6 thumbnails | `#` placeholder href on handle, `ig-1` through `ig-6` images (existing in `/public/snap/`) | Real `@twistedpin` handle linked to actual profile, real recent post URLs (or auto-feed integration via Instagram Basic Display API) |
| Facebook URL | Wired to `https://www.facebook.com/twistedpin` (2026-05-05) | Done |
| ~~TikTok URL~~ | Removed from footer 2026-05-05 — business has no TikTok presence currently | Re-add icon + URL constant in `SnapFooter.astro` if/when a TikTok account launches |
| Mobile hero video splice | `Bank Vs Stories` 0–4s, single shot | Splice timestamps pending — direction is locked: pour → tap wall → cocktail (3 sources, ≤4–5s total) |
| Desktop hero video | `After Social Highlight v2.mp4`, 8s recut placeholder | Final desktop hero — pending a real shoot or Ken-Burns photo treatment per `visual-direction.md` |
| OG / share card image | None specified | Brand-coherent 1200×630 image for social link previews (Twitter, Facebook, LinkedIn). Should match the moody/photo-led visual direction |
| Reviews count | Hardcoded `4.5` / `1,053` (Google) and `4.2` / `80` (Yelp) | Real-time pull from Google Places API / Yelp Fusion API (or accept periodic manual updates) |
| Hours | Static "Open today / until 11:00 PM" placeholder | Real-time hours via Google Places API (cached daily) or static schedule with JS open/closed calculator |

## Future pillars (not yet built — needs catalogued when shipped)

- **/events** — listing of popular events, "Plan My Event" CTA → `events.twistedpin.com` (Zite). Will need: real event imagery (corporate, birthday, fundraiser), upcoming events data source (Zite API or static markdown)
- **/bowl** — anchor sections for traditional lanes, VIP suite (link to `/vip-suite`), leagues (link), pro shop (anchor or omit). Will need: lane photography (per `visual-direction.md` traditional-lanes shots are OK on this page, NOT homepage), league night photography. **2026-05-06**: free-kids anchor removed (TM issue + venue doesn't currently run that program). Future family-bowling page is on the roadmap, name TBD
- **/game** — arcade pillar. Will need: arcade imagery that AVOIDS full-neon (per `visual-direction.md`); skee-ball / pinball / redemption detail shots. The "giant bear" reference in the snap subhead suggests a literal giant bear prize photo could earn its place
- **/reserve** — Roller iframe wrapper. No media beyond brand chrome above the iframe
- **/gift-cards** — pending fact-check that a gift card flow exists on twistedpin.com today. If yes: photo of an actual gift card (warmly lit, on a bar or with a cocktail). If no: skip the page until the operation exists
- **/coupon** — renamed from legacy `/free-10` 2026-05-04. Page itself is project-state-locked (kept as-is per existing operational flow); old `/free-10` URL gets a 301 to `/coupon` at launch. No new media needed — existing coupon-page imagery carries over
- **/waitlist** — shipped 2026-05-04 (typography hero + branded iframe wrapper around `host.tablesready.com/p/waitlist/twistedpin` + closing Reserve CTA + SnapFooter). Webhook-derived state version explored and tabled — see [waitlist-theory.md](waitlist-theory.md) for the full theory + revisit checklist. No new media needed for current iframe version; if we revisit Path 1 (webhook-derived), we render our own copy from live count + no media changes

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
