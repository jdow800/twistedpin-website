---
title: Paint Night — Autumn Harvest Glow
start: 2026-09-15T18:00:00-05:00
end: 2026-09-15T20:30:00-05:00
location: Twisted Pin · Plainfield, IL
cta:
  label: Reserve your seat
  # /paint-night is a 302 short link (vercel.json) → the (very long) Painting
  # Parties by Lucy booking URL. Absolute https form on purpose: the calendar
  # opens it in a new tab (keeps Twisted Pin open) and the JSON-LD Event.url
  # falls back to /upcoming-events/ rather than a redirect. Update the booking
  # target in ONE place (vercel.json) when the next round is scheduled.
  href: https://www.twistedpin.com/paint-night
# Flat $38/person — lowPrice == highPrice so the JSON-LD AggregateOffer is a
# single point (clears GSC "Missing field 'offers'/'highPrice'").
lowPrice: "38.00"
highPrice: "38.00"
validFrom: 2026-08-14T00:00:00-05:00
# Promo flyer, encoded via scripts/build-snap-images.mjs. Site-relative;
# the Event JSON-LD prepends the absolute origin.
image: /snap/event-paint-night-autumn-610.jpg
---

Grab a canvas and a drink — a guided, step-by-step session (this round, an autumn
harvest scene on a 16×20 canvas) led by Painting Parties by Lucy. All materials and
instruction included, no experience required. The bar and kitchen stay open the
whole time. $38 per person.
