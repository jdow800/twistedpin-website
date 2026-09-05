# 2026-09-04 (evening) — Singo Music Bingo: website + Roy, end to end

Tone Bar Games announced a weekly music bingo residency at Twisted Pin
(Sundays 7pm from Sept 13). Jon: put it on the site as a trial through the
end of November, then decide; teach Roy about it. Everything below is LIVE.

## What shipped

| Piece | Where | Commit / version |
|---|---|---|
| Event (recurring, tag `music-bingo`, Sept 13 → Nov 29, 7–9pm, free) | `src/content/events/singo-sundays.md` | `f4a6f67` |
| Shared endpoint helper + `/api/music-bingo/` (karaoke.ts refactored onto it) | `src/lib/program-endpoint.ts`, `src/pages/api/{karaoke,music-bingo}.ts` | `f4a6f67` |
| Sunday-program phrasing fix (tomorrow / next-7-days / real dark week) | `src/lib/programs.ts` + `scripts/check-programs.mjs` | `f4a6f67` |
| Flyer as Event art, padded 4:5 → 1:1 (new `pad`/`background` encoder option) | `public/snap/event-singo-810.*`, `scripts/build-snap-images.mjs` | `f582be0` |
| CTA → Tone Bar Games' Facebook event (Twisted Pin co-host) | event file | `65afbd8` |
| Promo bar: launch beat (→ Sept 13) + season beat (Sept 14 → Nov 29, last in rotation) | `src/config/promos.ts` | `30ef698` |
| Roy: `check_music_bingo` tool, Rule 13 → "Standing programs", keywords | Retell agent **v72** | published, then superseded |
| Roy: voice revert to `11labs-Paul` (v72 had inherited Jon's Nico experiment) | Retell agent **v73**, phone pinned 73 | published |
| Docs | `Context/adding-events.md`, `Retell Phone System/Roy_Music_Bingo_Awareness.md`, CLAUDE.md In Progress | — |

**Rollback of the whole Roy change:** pin +17792178754 to agent v71. The
website endpoint can stay; nothing else calls it.

## Rulings (Jon, same night)

- 9pm end confirmed. Free to play, assumed by Jon. No dark Sundays yet.
- Trial ends Nov 29 — extending = move `until:` in the event file AND
  `showUntil` on `singo-sundays-2026` in promos.ts (commented at both ends).
- Voice: Paul. The v72 draft Jon had opened "messing around with voices" was
  reused for the bingo publish and carried `retell-Nico` + expressive mode
  live for ~30 minutes. Fixed in v73.
- Facebook: co-host acceptance is enough; do NOT create a duplicate event
  (splits RSVPs). Share it to the Page as a post; check whether his event
  is one date or a recurring series.

## Traps hit, worth knowing

- **Reusing someone's unpublished Retell draft:** diff the AGENT fields
  (voice, expressive mode) against the published version, not only the
  LLM prompt. The prompt matched v71; the voice did not.
- **Order of operations for a new Roy tool:** push the website, confirm the
  endpoint returns 200 (trailing slash!), THEN publish Retell, THEN bump the
  phone-number pin (it never follows a publish).
- **Shell backticks in `node -e "..."`** are command substitution — two
  backticked voice names vanished from a doc. Use a heredoc script file.
- `scripts/build-snap-images.mjs` re-encodes EVERYTHING; `git checkout` the
  unrelated `public/snap/*` files it dirties.
- Local `npm run build` still ends in the known Vercel-adapter crash on
  Windows after all pages generate; verify in `dist/client/`.

## Watch

- First real caller asking about bingo: `check_music_bingo` should appear in
  the transcript's tool calls; the answer should be a finished sentence.
- Sept 12 (Saturday): the answer should say "tomorrow", not "Not this week".
- Nov 30: the card, the promo, and Roy's answer all roll over on their own
  (Roy: "finished for the season … September through November").

## Date catalog (reference only — the endpoint is the live answer)

Sundays, 7:00–9:00 PM, 12 nights: **Sep** 13, 20, 27 · **Oct** 4, 11, 18, 25
· **Nov** 1 (DST-change Sunday — still 7pm), 8, 15, 22, 29. No dark nights.
