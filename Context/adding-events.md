# Adding an Event to the Website

How a night gets onto `twistedpin.com/upcoming-events/`. Written 2026-08-27,
after the Karaoke Thursdays build.

**The whole job:** drop a markdown file in `src/content/events/`, push. Vercel
deploys in ~90s. Past events fall off by themselves via the daily 4am cron
rebuild — nothing ever needs deleting.

---

## ⚠️ Read this first — the four things that actually bite

1. **Never put a non-event `.md` file in `src/content/events/`.** The loader
   globs `**/*.md` and validates every match against the schema. A `README.md`
   or `notes.md` in that folder **fails the build**. (That's why this document
   lives in `Context/`.)

2. **Get the UTC offset right.** Central is `-05:00` in summer (CDT) and
   `-06:00` in winter (CST). Wrong one = the event advertises an hour off.

   | Dates | Offset |
   |---|---|
   | Mar 8 2026 → Nov 1 2026 | `-05:00` |
   | Nov 1 2026 → Mar 14 2027 | `-06:00` |
   | Mar 14 2027 → Nov 7 2027 | `-05:00` |
   | Nov 7 2027 → Mar 12 2028 | `-06:00` |

   Rule of thumb: **Nov–Feb is `-06:00`, Apr–Oct is `-05:00`**; look the
   boundary up if the date is in March or early November.

3. **`skip:` dates must be quoted, `until:` must not.** Bare YAML dates get
   parsed into `Date` objects at UTC midnight. `until` wants that; `skip`
   entries are venue-local calendar dates and will fail the schema unquoted.

4. **Only ~4 months show at a time.** The month pills are the horizon (this
   month + 3). An event further out is *in the build and in the schema* but
   has no pill yet — it appears on its own. Not a bug; don't go looking for one.

---

## Shape 1 — a one-off night

Filename: `YYYY-MM-DD-slug.md` (the date prefix is convention, not required).

```markdown
---
title: Paint Night — Autumn Harvest Glow
start: 2026-09-15T18:00:00-05:00
end: 2026-09-15T20:30:00-05:00
location: Twisted Pin · Plainfield, IL
lowPrice: "38.00"
highPrice: "38.00"
validFrom: 2026-08-14T00:00:00-05:00
image: /snap/event-paint-night-autumn-610.jpg
cta:
  label: Reserve your seat
  href: https://www.twistedpin.com/paint-night
---

One or two sentences of body copy. This is the card description and the
schema description — write it for a human, not a crawler.
```

## Shape 2 — a weekly recurring night

Filename: no date prefix (it isn't one date). E.g. `karaoke-thursdays.md`.

`start` / `end` carry the **first** occurrence, including the times every
later night inherits.

```markdown
---
title: Karaoke Night
start: 2026-09-10T19:00:00-05:00
end: 2026-09-10T23:00:00-05:00
location: Twisted Pin · Plainfield, IL
recurring:
  frequency: weekly
  until: 2027-05-27          # bare — last possible night, inclusive
  skip:                      # QUOTED — nights we're dark
    - "2026-10-22"
    - "2026-11-26"
lowPrice: "0"                # free night
highPrice: "0"
validFrom: 2026-08-27T00:00:00-05:00
image: /snap/event-karaoke-810.jpg
cta:
  label: See it on Facebook
  href: https://www.facebook.com/share/19PaKBkqdg/
---

Body copy. Shown on EVERY night of the run, so write it to read well the
fourth time someone scrolls past it.
```

**Every night in the run gets its own full card.** That's deliberate: a dark
night then explains itself by absence — October shows the 1st, 8th, 15th and
29th, and the 22nd simply isn't there, so no "skipping Oct 22" caption is
needed anywhere. The schema still ships **one** Event carrying a `Schedule`
and `exceptDate`.

**A night that moves rather than cancels** gets two edits: add the original
date to `skip`, and add a separate one-off file for the replacement. That's
how Thanksgiving works — Nov 26 is skipped and
`2026-11-25-karaoke-black-wednesday.md` runs instead, late.

---

## Field reference

| Field | Required | Notes |
|---|---|---|
| `title` | ✅ | Card H3 + schema name. Renders uppercase. |
| `start` | ✅ | ISO with offset. Recurring: the first occurrence. |
| `end` | | Omit for open-ended. Crossing midnight is fine — see below. |
| `location` | | Defaults to "Twisted Pin". We use `Twisted Pin · Plainfield, IL`. |
| `cta` | | `label` + `href`. See CTA rules below. |
| `tags` | | Machine-readable grouping, never rendered. Feeds `/api/hours` → Roy, the phone agent. See "Roy" below. |
| `tentative` | | `true` → amber "Tentative" chip. |
| `virtual` | | `true` → "Virtual" chip. |
| `draft` | | `true` → written but not published. Use this instead of deleting. |
| `lowPrice` / `highPrice` | | Strings. Both `"0"` = free (emits a plain `Offer` at $0). Different values = a price range. Omit entirely and the Event is rich-result ineligible. |
| `validFrom` | | "bookings opened" date. Set it to the day you add the event. |
| `image` | | **Schema only — never rendered on the card.** See below. |
| `recurring` | | `frequency: weekly` + `until` + `skip[]`. Weekly is the only frequency built. |

### CTA rules
- **External URL** → opens in a new tab. The Event's schema `url` stays
  `/upcoming-events/`.
- **Internal detail page** (`/new-years-eve/`) → also becomes the Event's
  schema `url`, so crawlers follow it.
- **`/reserve...`** is deliberately excluded from that — it's a booking tool,
  not a description of the event.
- **Free walk-in nights should usually have no CTA at all**, unless there's
  somewhere real to send people. A "Reserve a lane" button on a free karaoke
  night points at a wizard that can't sell it.
- **Long external booking URLs get a short link**: add a 302 in `vercel.json`
  (e.g. `/paint-night`) and point the CTA at that. One clean, updatable link
  for the card, Facebook, SMS and print.

### Late nights that cross midnight
A 9pm–1am event ends on the next calendar day. That's handled — anything
ending before 5am the following morning renders as **one** night ("25 NOV"),
not a two-day range. Just write the true `end`.

### Images
Event art is **schema only** — it's what Google and Facebook show when they
surface the event, and Google flags Events that lack one. It is deliberately
**not** rendered on the card (ruling 2026-08-27): promo flyers repeat badly
down a month of recurring nights, their baked-in text duplicates the card copy
and drifts stale, and neon flyers fight the site's moody direction.

To add one:
1. Put the source in `Context/pictures/` (**gitignored** — the encoded outputs
   in `public/snap/` are what actually ship, so commit those).
2. Add a line to `SOURCES` in `scripts/build-snap-images.mjs`:
   `{ src: "my-flyer.jpg", name: "event-my-thing", widths: [810] }`
3. Run `node scripts/build-snap-images.mjs`
4. Reference it: `image: /snap/event-my-thing-810.jpg`

Google accepts 16:9, 4:3 or 1:1. Don't upscale — encode at the source width.

⚠️ Running that script re-encodes **every** source and will dirty unrelated
`public/snap/*` files. `git checkout` the ones you didn't mean to touch.

---

## Roy, the phone agent, reads these events too

Any event carrying a `tags:` entry is assembled into `/api/hours/` under
`programs.<tag>` — a block containing **a finished sentence Roy can speak**
("Yes — karaoke night is this Thursday, October 8, seven PM to eleven PM").
Roy's pre-call webhook already fetches that endpoint for `is_open`.

This is why cancelling a night is one edit: adding a date to `skip:` updates
the calendar card, the schema, **and what the phone says**, together. Never
put a date list in Roy's knowledge base — it rots silently.

`scripts/check-programs.mjs` asserts the spoken answers across ~47 caller
scenarios (each weekday of a normal week, a dark week, Thanksgiving's moved
night, the holiday gap, pre-season, post-season, both DST crossings). It runs
on every build. **If you change the karaoke schedule, update the `EVENTS`
fixture at the top of that script to match.**

**Two programs are live: `karaoke` (Thursdays) and `music-bingo` (Singo,
Sundays, trial run to Nov 29 2026 — `singo-sundays.md`).** Each has a
dedicated endpoint Roy's tool calls (`/api/karaoke/`, `/api/music-bingo/`),
both three-line files over `src/lib/program-endpoint.ts`. A third program
is: tag the markdown, add `src/pages/api/<slug>.ts`, give Roy a
`check_<slug>` tool and a line in his Rule 13.

**If you change EITHER schedule, update the `EVENTS` fixture at the top of
`scripts/check-programs.mjs` to match** — it mirrors both files.

Full wiring notes, including the Retell steps:
`~/dev/Twisted Pin Full System/Retell Phone System/Roy_Karaoke_Awareness.md`
and `Roy_Music_Bingo_Awareness.md` (the Sunday-program wrinkle lives there).

---

## Verifying before you push

```bash
npm run build          # also runs the recurrence checks
node scripts/check-recurrence.mjs   # only if you touched recurring logic
```

`scripts/check-recurrence.mjs` is the guard on the date math. It walks a full
season asserting every night is the right weekday at the right local time
across both DST crossings — a recurrence stepped by fixed milliseconds looks
perfect until November, then silently advertises the wrong weekday for five
months, and nothing else in the build would go red. **If you change the skip
list or season dates in `karaoke-thursdays.md`, update the `KARAOKE` fixture
at the top of that script to match** — the occurrence-count assertion is what
catches a drift.

To eyeball a month that isn't the current one, deep-link it:
`/upcoming-events/?month=2026-12`

---

## Where an event surfaces

| Surface | Automatic? |
|---|---|
| `/upcoming-events/` card | ✅ |
| `ItemList` + `Event` JSON-LD on that page | ✅ |
| Falls off after it passes | ✅ (daily 4am cron) |
| Homepage promo bar | ❌ manual — `src/config/promos.ts` |
| NavDrawer seasonal entry | ❌ manual — `src/config/nav-seasonal.ts` |
| A dedicated landing page | ❌ manual — only worth it for something big |

The calendar is a **reference surface** — people arrive already interested.
Selling happens on the pillar pages. If a recurring night proves out and has
real search volume behind it, that's when it earns a dedicated page.

---

## Related

- `src/lib/recurrence.ts` — the date math, heavily commented
- `src/content.config.ts` — the schema, source of truth for fields
- `src/pages/upcoming-events.astro` — rendering + JSON-LD
- `Context/seo.md` — check the negative-keyword list before writing copy
- `Context/voice.md` — banned words. **"Private", "cheap/discount/value/deals"
  are hard bans**; don't lead with "family-friendly".
