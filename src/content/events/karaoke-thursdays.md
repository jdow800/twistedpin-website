---
title: Karaoke Night
# First occurrence. Every later Thursday inherits these times via the
# `recurring` block below — 7–11pm CT, week in, week out.
#
# TIMEZONE, the part that bites: this is a *dated instant*, so it carries
# an explicit -05:00 (Sept 10 2026 is inside US DST). The recurring
# schedule itself does NOT carry an offset — the season crosses two DST
# boundaries (CDT→CST Nov 1 2026, back Mar 14 2027) and is resolved by
# `scheduleTimezone: America/Chicago` in the JSON-LD instead. Same split
# /leagues uses; do not "fix" one to match the other.
start: 2026-09-10T19:00:00-05:00
end: 2026-09-10T23:00:00-05:00
location: Twisted Pin · Plainfield, IL
recurring:
  frequency: weekly
  # Last night of the season. Card + schema self-expire the morning
  # after via the daily 4am cron rebuild.
  until: 2027-05-27
  # QUOTED on purpose: bare YAML dates are parsed into Date objects
  # (at UTC midnight), and these are venue-local calendar dates, not
  # instants. Unquoted, they fail the schema — and if they didn't,
  # UTC midnight in Central is the PREVIOUS day, so the wrong night
  # would go dark.
  skip:
    # Thursday Night Football — Bears play.
    - "2026-10-22"
    # Thanksgiving. The night before runs instead, LATE — see
    # 2026-11-25-karaoke-black-wednesday.md (9pm–1am, its own card).
    - "2026-11-26"
    # Christmas Eve.
    - "2026-12-24"
    # New Year's Eve — the venue's own NYE event owns that night
    # (see 2026-12-31-new-years-eve.md).
    - "2026-12-31"
    - "2027-04-01"
# Free to sing. lowPrice == highPrice == 0 collapses to a plain Offer at
# $0 in the JSON-LD (not an AggregateOffer) — see /upcoming-events.astro.
lowPrice: "0"
highPrice: "0"
validFrom: 2026-08-27T00:00:00-05:00
# Schema only — the neon promo flyer is what Google and Facebook show when
# they surface this Event. Deliberately NOT rendered on the card: with every
# night listed it would repeat four or five times a month, its baked-in text
# duplicates the card copy (and goes stale silently), and the neon fights the
# site's moody direction. Ruling 2026-08-27.
image: /snap/event-karaoke-810.jpg
# The host's Facebook event — the only place with more detail than this card.
# Supplied by Jon 2026-08-27. NOTE: Facebook login-walls automated requests,
# so this URL cannot be verified from CI or by fetching it; it takes a human
# with the page open. It's a /share/ redirect wrapper, so if it ever dies,
# this is the one line to change.
cta:
  label: See it on Facebook
  href: https://www.facebook.com/share/19PaKBkqdg/
---

Free karaoke every Thursday, hosted by Joe Son. Sing it straight or absolutely
butcher it — either way the 28 self-serve taps, the cocktail menu, and the
kitchen stay open the whole time, and there are giveaways. Start the weekend
three days early.
