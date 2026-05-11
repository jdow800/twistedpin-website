# Twisted Pin — Sitemap & IA TL;DR

**Status:** Working draft. Open-ended, not a finalized spec. Intended as input for build chat / migration planning.

**Source of truth for current state:** `https://www.twistedpin.com/sitemap_index.xml` (Yoast-generated, WordPress)

---

## Current sitemap inventory

29 URLs in the page sitemap. Roughly grouped:

### Pillars (the core of the venue)
- `/` — homepage
- `/bowling/`
- `/craft-bar/`
- `/self-serve-tap-wall/`
- `/game/`
- `/vip-suite/`

### Events (currently fragmented across 5+ pages)
- `/special-events/`
- `/corporate-parties/`
- `/birthday-parties-booking/`
- `/fundraiser/`
- `/upcoming-events/`
- `/event-directory/`

### Bowl-adjacent
- `/leagues/`
- `/free-kids-bowling/`
- `/rewards/`

### Promo / acquisition
- `/free-10/` (coupon page — high traffic, project-state-locked to stay)

### Utility
- `/contact-us/`
- `/faqs/`
- `/join-our-team/`
- `/blog/`

### SEO geographic landing pages (not navigation)
- `/why-us/`
- `/why-us-plainfield-il/`
- `/why-us-joliet-il/`
- `/why-us-crest-hill-il/`
- `/why-us-shorewood-il/`
- `/why-us-naperville-il/`
- `/why-us-oswego-il/`
- `/why-us-romeoville-il/`
- `/why-us-bolingbrook-il/`

### Other / system
- `locations.kml`
- (sitemap also includes `ajde_events-sitemap.xml` and `event_location-sitemap.xml` — likely WP plugin-generated, not user-facing pages)

---

## Proposed consolidated sitemap

### Tier 1 — pillar pages (linked from snaps and hamburger)
| New slug | Replaces | Notes |
|---|---|---|
| `/bowl` | `/bowling/` | Sections: lanes, VIP suite, leagues, pro shop, rewards, free kids bowling. Anchor-linked. |
| `/bar` | `/craft-bar/`, `/self-serve-tap-wall/` | One page, two sections: The Wall (28 taps), Cocktails. |
| `/eat` | (new) | Currently no dedicated food page. Links to GoTab menu. |
| `/game` | `/game/` | Stays as-is. |
| `/events` | `/special-events/`, `/corporate-parties/`, `/birthday-parties-booking/`, `/fundraiser/`, `/vip-suite/` | One page, anchor sections per event type, single inquiry form, Avery handles the rest. |

### Tier 2 — secondary pages (hamburger only, not snaps)
| Slug | Status | Notes |
|---|---|---|
| `/upcoming-events` | Keep, redirect `/event-directory` here | Public events listing. Distinct from `/events` (which is "plan an event"). |
| `/leagues` | **Decision:** standalone or section of `/bowl`? | If league traffic / SEO warrants standalone, keep. Otherwise nest. |
| `/rewards` | **Decision:** standalone or section of `/bowl`? | Same question as leagues. |
| `/free-10` | Keep as-is | Project-state-locked. |
| `/waitlist` | Keep | Iframe to TablesReady, project-state-locked. |
| `/contact` | Rename from `/contact-us` | Cleaner slug. |
| `/faq` | Rename from `/faqs` | Cleaner slug. |
| `/careers` | Rename from `/join-our-team` | More standard. |
| `/gift-cards` | New (or surface existing if it lives somewhere) | Hamburger + footer. |

### Tier 3 — SEO pages (live but not in navigation)
| Slug | Status |
|---|---|
| `/why-us` | **Decision: keep, kill, or hide?** Currently in nav; proposing remove from nav. |
| `/why-us-[city]` × 7 | Keep live for SEO, remove from any user-facing nav. |

### Tier 4 — content
| Slug | Decision |
|---|---|
| `/blog` and 14 posts | **Decision: active or dormant?** If dormant, remove from main nav. Footer link or kill entirely. |

---

## Pages to delete or 301-redirect

| Old slug | Action | Redirect target |
|---|---|---|
| `/special-events` | 301 | `/events#special` |
| `/corporate-parties` | 301 | `/events#corporate` |
| `/birthday-parties-booking` | 301 | `/events#birthday` |
| `/fundraiser` | 301 | `/events#fundraiser` |
| `/vip-suite` | 301 | `/events#vip-suite` |
| `/craft-bar` | 301 | `/bar#cocktails` |
| `/self-serve-tap-wall` | 301 | `/bar#tap-wall` |
| `/event-directory` | 301 | `/upcoming-events` |
| `/contact-us` | 301 | `/contact` |
| `/faqs` | 301 | `/faq` |
| `/join-our-team` | 301 | `/careers` |
| `/bowling` | 301 | `/bowl` |
| `/free-kids-bowling` | 301 | `/bowl#free-kids` (or keep standalone if SEO traffic warrants) |

**SEO note for build chat:** preserve all redirect chains, update internal links, regenerate sitemap, resubmit to Search Console.

---

## Hamburger menu — proposed structure

**Format: sectioned single-page (no expandables, no nested taps).** Three sections, all items single-tap, scrollable.

### EXPERIENCE
- Bowl
- Bar
- Eat
- Game
- Events

### VISIT
- Reserve a Lane
- Plan an Event
- Upcoming Events
- Hours & Location
- Get $10 Off Coupon

### MORE
- Leagues *(if standalone)*
- Rewards *(if standalone)*
- Gift Cards
- FAQ
- Contact
- Careers

**Total: 14-16 items depending on standalone decisions.**

**Notes:**
- "Reserve a Lane" and "Plan an Event" appear in the sticky bottom CTA bar AND the hamburger. Intentional — some users hunt for the hamburger by habit.
- Coupon sits in VISIT, not highlighted as primary. Coupon-hunters find it; everyone else doesn't have it dominating their view.
- "Why Us" not in hamburger. Pillar pages do that work.
- "Blog" not in hamburger unless content strategy is active. Footer link if at all.

---

## Footer (snap 8) — proposed contents

Per architecture, footer is the bottom half of snap 8. Top half is hours/location.

- Logo
- FAQ · Careers · Gift Cards · Contact · Privacy · Accessibility
- Social icons (Facebook, Instagram, plus any active others)
- Copyright
- "Back to top" arrow

**Not in footer:** location SEO pages, duplicate primary nav, blog (unless active), "why us."

---

## Open decisions for Jon

1. **Leagues — standalone page or nest under `/bowl`?**
2. **Rewards — standalone or nest?**
3. **Pro Shop — does it earn its own page or fold into `/bowl` paragraph?**
4. **Blog — active or dormant?** Determines whether it stays in nav, footer, or gets removed.
5. **`/why-us` parent page — keep live for SEO and remove from nav, or kill entirely?**
6. **`/free-kids-bowling` — keep standalone (SEO value) or fold into `/bowl#free-kids`?**
7. **Hamburger structure — sectioned (recommended), flat, or two-level expandable?**

---

## Open questions / things to verify

- Does `/gift-cards` exist currently? Not visible in sitemap. May need to be created.
- `/event-directory` vs `/upcoming-events` — are these actually duplicates or do they serve different purposes?
- `ajde_events-sitemap.xml` — is the AJDE Events plugin still in use, or vestigial?
- `/blog/` last post date — drives the active/dormant call.
- Pro Shop — is there an existing page, or is it just menu item with no destination?

---

## Note for build chat

This is a working draft, not a finalized spec. Use as input to scope migration, redirect mapping, and IA decisions. Open decisions above need Jon's call before implementation.
