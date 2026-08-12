# 2026-08-11/12 — Front-desk check-in board: design, 13 demo rounds, prod launch (tprs)

**Status: LIVE IN PROD** since 2026-08-12 ~15:12 UTC. tprs PR #78 squash-merged as
main `389edf9`; legend hotfix `7ee03b8` same morning. Migration 0138 applied to
prod Supabase (`twistedpin-platform`) BEFORE the merge. Rollback = tag
`pre-checkin-board-snapshot` + code revert (migration is additive; no data risk).

Memory of record: `tprs-front-desk-checkin-build.md` (auto-memory). This doc is
the narrative + maintenance manual.

---

## What shipped

The `/admin/bookings` front-desk board gained an **attendance axis**: staff check
guests in, assign lanes, and the board self-cleans. Replaces the hand-typed
notes convention ("x Lane 4 ; checked in") that staff had invented.

- `booking_dates.checked_in_at` / `checked_in_by` (paired CHECK) +
  `lane_assignment` (free text) — migration 0138, additive only.
- Live board visibility: checked-in rows linger **30 min** (**60** for the four
  catered packages via `lib/catering-codes.ts`); un-checked-in rows stay until
  their **END time** with a red counting **"Late Xm"** state, then move to the
  **Cleared view** unmarked. Every exit is a human action or "window fully
  ended." **Nothing automatic ever marks a no-show; attendance never touches
  booking_status; check-in never gates payment.**
- **Cleared (n)** header toggle = exact complement of the live board minus
  cancelled, newest first, today only. Query param (`view=cleared`), not a
  drawer — survives the 60s auto-reload. Undo + confirm-guarded No show live
  there and on red rows.
- Columns 8 → 5: `Time | Customer (guests + money pill under the name) |
  Lane / Check-in | Items | Notes`. Board capped + centered at 1220px
  (`.fd-col`, the new-event round-2 pattern).
- **Touch-first rail sequencing** (the desk runs a touchscreen): un-laned rows
  show ONE big dashed "Set lane(s)" target and no button; once a lane exists
  the lane display goes inert, a full-width **✓ Check in** button is the
  column's only tap target, and lane edits move to a **"Lane 5 ✎" chip** above
  the note text in the Notes cell. No-lane bookings (arcade-only) skip the
  sequence. Sequencing is **UI-only** — the check-in endpoint never requires a
  lane.
- Lane intelligence: editor pre-fills "VIP " / "Lane " from the booked pool;
  bare typed digits display with the pool prefix ("Lane 6" vs "VIP 6");
  lettered input renders verbatim; mixed pools never guess.
- Items column: >5 lines collapses to 4 + explicit "+ N more" expander; lane +
  catering-package lines render semibold indigo (structural detection + name
  heuristic for the engine's product-less custom lines).
- Notes: whole cell is the note editor's hit area; amber left-border band marks
  noted rows; "+ note" ghost otherwise.
- Routes (all `booking.edit_state`, all audited): POST
  `/admin/bookings/:id/check-in`, `/undo-check-in` (PRG back to the list with a
  `#b-<id>` row anchor), `/lane` (JSON); `mark-no-show` gained validated
  `return_date`/`return_view`. Audit discriminators:
  `booking_date_checked_in` / `_check_in_undone` / `_lane_assigned`.

## The 13 rounds (why it looks the way it does)

Every structural choice came from Jon reviewing a live mimicked demo, most from
artifacts of the real operation:

1. Old-board screenshot proved staff already ran check-in + lanes by hand in
   notes → they became fields.
2. Cody (busiest-Saturday operator) wanted earlier clearing + a check-in button.
3. "A late caller must never drop off the board" → un-checked-in rows persist
   to END time; the end−30 auto-cutoff died; the Late counter was born (60s
   auto-reload IS the ticker — no client clock).
4. Notes is imperative for 1-3 events/night and empty for 20-30 lane rows → it
   is not entitled to permanent width; merged, then split back (round 8) once
   independent headers mattered more.
5. The Penske event (real Wednesday booking) sized the Details geometry: event
   notes are hard-newlined tickets; items sit BESIDE notes, not above.
6. The touchscreen settled the round-2 debate: sequencing beats co-location;
   one state = one dominant tap target. Mis-taps now open editors (harmless
   no-ops); state-changing taps are isolated and large.

## Maintenance traps (the expensive lessons)

- **`lib/catering-codes.ts` is triply load-bearing** for this board: the 60-min
  linger, the semibold menu lines, and (pre-existing) the Event-Hub form gate.
  A new catering package added there inherits all three automatically; one
  added elsewhere gets NONE.
- **Eta template traps** (each cost a debug cycle): a quote character inside a
  regex literal in an Eta tag breaks the tag scanner; emitting a whole
  attribute through `<%= 'class="x"' %>` HTML-escapes the quotes into a
  mangled attribute (emit values inside quoted attrs only); an inline
  `display: block` outranks any CSS class hide (the item cap shipped broken
  twice over and only Jon's screenshot caught it — HTML-level tests cannot see
  CSS precedence).
- **Guards for "my editor is open" must match the editor's own class** —
  `cell.querySelector("input")` silently ate every Set-lane tap on late rows
  because the no-show form's hidden inputs live in the same cell.
- **Mixed line endings in `list.eta`** made two scripted find/replace patches
  silently no-op (a dropped `<col>` gave Items+Notes equal leftover width —
  the "giant gap" Jon saw). Prefer the Edit tool; verify renders, not just
  markup.
- **No emoji on staff-hardware surfaces.** The desk monitor's older Windows
  emoji font lacks 2019-vintage glyphs (green/orange circles → tofu; 2010 red
  fine). Legend dots are CSS spans now; keep it that way.
- **Test-time trap:** tests seeding `startTime` relative to `Date.now()` are
  correct here; the old END_GRACE test survived the predicate change by
  accident of its fixture times — read visibility tests carefully before
  trusting them across rule changes.

## Prod/deploy facts learned

- **Render runs `scripts/migrate.ts` as `preDeployCommand`** on every tprs
  deploy (seen 2026-08-12) — migrations self-apply; manual pre-apply is only
  needed when deploy ORDER matters (new code reading new columns on first
  render, as here).
- **`drizzle.__drizzle_migrations` on prod UNDERCOUNTED by one** — a past
  migration went in via the Supabase SQL editor (db-target.ts "path 1"), which
  skips the ledger. The runner is COUNT-based, so an undercount makes it
  re-apply the tail (idempotent, but confusing). Healed 8/12: ledger = journal
  length (139). If applying SQL by hand, insert the ledger row too.
- Supabase MCP `execute_sql` is classifier-blocked for DDL; `apply_migration`
  is the path (grants trap only matters for NEW tables — none here).

## Watch items (open)

- **First busy Saturday: the Cleared count is the adoption meter.** Climbing
  all night = staff using check-in; rows piling to end-time = pre-shift nudge
  needed. The board itself reports it.
- 60s auto-reload on the desk touchscreen — validated day one (it delivered
  the legend fix unprompted), but watch for staff-interruption complaints; the
  reload skips while a field is focused.
- Tunables if ops asks: `CHECKIN_LINGER_MINUTES` (30) /
  `CHECKIN_LINGER_CATERED_MINUTES` (60) in `admin/bookings.ts`; item cap
  (4 shown / collapse >5) in `list.eta`; board cap 1220px (`.fd-col`).
- Future thread (parked by Jon, "not a build for today"): AI lane-assignment
  suggestions fed by `lane_assignment` history + the TablesReady waitlist —
  the typed lane field is quietly accumulating the training data.
