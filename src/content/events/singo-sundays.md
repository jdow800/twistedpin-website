---
title: Singo Music Bingo
# First occurrence. Every later Sunday inherits these times via the
# `recurring` block below.
#
# 7pm start is from Tone Bar Games' own announcement (Facebook, 2026-09-04).
# The 9pm END is an assumption — a two-hour music bingo is the usual shape
# and the venue closes at 10pm on Sundays — and nobody has confirmed it.
# Fix it here if it's wrong; the card, the schema and Roy all move together.
#
# TIMEZONE: this is a dated instant, so it carries -05:00 (Sept 13 2026 is
# inside US DST). The recurring schedule itself carries NO offset — the run
# crosses the Nov 1 CDT→CST boundary and is resolved by
# `scheduleTimezone: America/Chicago` in the JSON-LD. Same split
# karaoke-thursdays.md uses; do not "fix" one to match the other.
start: 2026-09-13T19:00:00-05:00
end: 2026-09-13T21:00:00-05:00
location: Twisted Pin · Plainfield, IL
# Groups this for /api/hours -> Roy (the phone agent) and the dedicated
# /api/music-bingo/ endpoint his `check_music_bingo` tool calls. Not
# rendered on the site.
tags: ["music-bingo"]
recurring:
  frequency: weekly
  # TRIAL RUN. Jon 2026-09-04: "put it up on the website until the end of
  # November as a safe starting point, then decide whether to continue."
  # The last Sunday in November is the 29th. To extend, move this date —
  # nothing else changes. The card + schema self-expire the morning after
  # via the daily 4am cron rebuild, and Roy switches to "finished for the
  # season" on his own.
  until: 2026-11-29
  # QUOTED on purpose: bare YAML dates are parsed into Date objects at UTC
  # midnight, and these are venue-local calendar dates, not instants.
  # Unquoted they fail the schema.
  #
  # Empty for now. Jon 2026-09-04: "I'll need to look up which weeks we're
  # going to skip — maybe not." Add a quoted "YYYY-MM-DD" per dark Sunday.
  skip: []
# Free to play. lowPrice == highPrice == 0 collapses to a plain Offer at $0
# in the JSON-LD. (Assumed — the announcement doesn't state a cover, and bar
# music bingo is free-to-play as a rule. Confirm with Tone Bar Games.)
lowPrice: "0"
highPrice: "0"
validFrom: 2026-09-04T00:00:00-05:00
# No `image` yet. Google flags Events without art; the Singo Chicago flyer
# from Tone Bar Games' announcement is the obvious candidate — drop the
# source in Context/pictures/, add a SOURCES line to
# scripts/build-snap-images.mjs, encode, and reference /snap/event-singo-810.jpg
# here. Never rendered on the card either way (ruling 2026-08-27).
#
# No `cta` yet either. A free walk-in night should have no CTA unless
# there's somewhere real to send people — the host's Facebook event would
# be that (karaoke-thursdays.md does this). Add `cta: { label: See it on
# Facebook, href: ... }` once Jon supplies the post's /share/ link.
---

Music bingo every Sunday night, hosted by Tone Bar Games. The caller plays
songs instead of numbers — you know it, you mark it, first full card wins.
Free to play. The 28 self-serve taps, the cocktail menu, and the kitchen stay
open the whole time. The game can wait till you get home.
