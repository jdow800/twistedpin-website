# 2026-09-04 — Custom event length (3.5 / 4 / 5 hours, even 10pm→2am) on the +New Paid Event calculator

**Status:** tprs PR #161 (`feat/custom-event-duration`, commit `5cb61a5`) — OPEN, awaiting Jon's merge (a human merges tprs PRs; `gh pr merge` is blocked by the auto-mode classifier). Full backend suite 176 files / 2,277 tests green at the commit. No migration.

Memory of record: [[tprs-custom-event-duration]].

---

## The question that started it

Jon: TPRS sells events as 2-hour or 3-hour only. How do we sell a 3.5 / 4 / 5-hour custom event "and it not be confusing to both customer end and/or resources"? Follow-ups clarified: custom pricing is expected (engine recommends, staff override), and the real worry was **cohesion** — the eVite, the emails, the resource allocation and the receipt all need to show the same duration.

## What the audit found before any code

- **The customer never saw "2hr/3hr".** Lane products 9–12 carry `customer_facing_name = "VIP Lanes" / "Traditional Lanes"`; the tier lived only in the internal `name`. Every guest surface (eVite guest page + host dashboard through one shared `buildWindow` projection, the .ics at all four call sites, RSVP confirmation / reminder / reschedule emails, the pay-page WHEN row, the food-form confirm block, the front-desk board's Late/linger) renders `booking_dates`. So the guest side was already correct by construction.
- **The resource layer already held arbitrary windows** — `resolveHoldEnd` honors `endTimeOverride` verbatim (+ back buffer); fundraisers book 5–9pm (4h) this way every Thursday; the line-item composer has a free-form End time.
- **2|3 was welded in only three places:** `durationSchema` / `VALID_DURATIONS` (+ the `non_standard_duration` hard stop, which correctly escalates), the `LANE_PRODUCT_CODES[type][duration]` nested map, and the mirrors (form zod, Website `type Hours = 2|3`, KB). The math already handled fractions — dwell produces 3.5/4.5 billed hours today.
- **The gap was on the side you'd least expect:** every BOOKER-facing surface shows START TIME ONLY — the hosted invoice/receipt (`receipt.ts` `eventTimeDisplay` from `firstStart`), and the deposit-paid / fully-paid / initial-deposit-link / booking-reminder emails all render `event_date at event_start_time`. Invisible while 2h is the unstated default; the weak link once duration is the thing being sold. → PR 3.
- **"Overrides apply to this save only"** (the calculator's own copy): an edit re-prefills line prices from a fresh engine quote, so a fully custom-priced event silently reverts on any later edit. → PR 2, mandatory before the first custom sale.
- **The engine's recommendation leans low on long events:** lane cost = start-hour rate × hours (a 3pm Saturday 4h event bills the 4–7pm crush at the pre-4pm rate; Sat VIP $65 vs $75). Fine while staff set the price; per-hour summation later.

## Decisions (Jon)

- Custom pricing expected; engine number is a recommendation. Type **hours**, echo the **end time** (my recommendation, accepted): hours is what the engine prices, so deriving the end from hours can never produce a window that disagrees with what was billed; an end-time picker can (1:00–4:45 = 3.75h). Half-hour steps enforceable on a number; 10pm + 4 needs no next-day date handling.
- Control lives under the **Adjustments** fold ("Custom End Time sort of vibe") — matches the fold's contract (rare knob, auto-opens when a value is carried), and keeps the 2/3 radios one-tap.
- "Customize the crap out of it, even the 2am example" — midnight crossing is in scope and tested.
- Ladder for Avery / the builder: 2 / 3 quotable; anything else stays staff-quoted (Avery still escalates `non_standard_duration`). NOT built into Avery or the estimate proxy.

## What shipped (PR #161)

- `pricing/custom-duration.ts` — `isValidCustomDuration` (2–12, 0.5 steps), `effectiveDurationHours` (custom replaces the tier), `laneProductCodeFor` (floor-map 2.5→2hr, ≥3→3hr; no catalog rows), `engineEventEndIso` (start + billed hours, pure UTC).
- `custom_duration_hours` on the `QuoteInput` TYPE only — off `quoteInputSchema` (the `bowling_only` pattern the docstring prescribes); added to `rejectStaffOnlyFields` (server.ts). Engine: `duration = effectiveDurationHours(input)`; hard stop relaxed only when the field is present (invalid = field error `invalid_custom_duration`); `recommend_3hr` suppressed; concept `lane_vip_4hr` / `lane_traditional_3.5hr`.
- Form: `customDurationHours` (zod preprocess blank→unset + refine w/ friendly message) → `buildEngineInputFromForm`; index.eta row + live "→ ends 5:00 PM (next day)" echo + radios greyed with an "overridden" note; fold auto-open list + summary text; confirm.eta hidden field + "4 hours (custom length)" label; edit-event prefill `customDurationHours: snap.custom_duration_hours`.
- **Four window writers derive the end from `engineEventEndIso`:** `createBookingFromEngineQuote` (always), `editEventFromQuote` (default), `createAveryEventBooking`, `createAveryEditBooking` (= the staff Reactivate replay) — and in BOTH Avery paths the `resolveStaffDirectLineItems` call carries `endTimeOverride` too, because the resolver sizes pool holds from the lane product otherwise. **The test caught exactly that split** (window 3.5h, holds 3h) on the edit path before the fix.

## Traps for the next session

- Never derive the window from `billedHours` — dwell is billing-only; using it would silently hold peak-Saturday lanes 90 min longer.
- Any new Adjustments knob must join the hardcoded auto-open expression on `<details id="ne-adjustments">` or an edit hides it.
- The concept string now embeds the length (`lane_vip_3.5hr`); nothing parses it, and the `lineOverride[...]` regex accepts the dot.
- `uniqueEventWindow()` in new-event.test.ts can hand out 2pm Mon–Thu, which the weekday rate matrix (15–23) rejects — pre-existing; the custom-length tests use a deterministic Thursday 17:00 window. Bookings are TRUNCATED before every test, so one window serves all cases.
- Files in tprs mix LF/CRLF; scripted exact-match edits need a CRLF fallback (`brain`-style applier in this session's scratchpad).

## Queued (ruled, not built)

1. **PR 2 — edit prefills from ACTUAL line prices** (the composer's edit already round-trips overrides at `bookings.ts` ~4638). Before the first custom-length sale.
2. **PR 3 — the window on the invoice + the four booker emails** (`receipt.ts`, `deposit-paid-confirmation`, `fully-paid-confirmation`, `initial-deposit-link`, `booking-reminder`, `email-action.routes.ts`). Also: `buildBookingIcs` falls back to start+2h when `end` is null (all callers pass a real end today).
3. Per-hour rate summation for long events (parity-safe: identical whenever the event doesn't cross a tier boundary).
4. KB line for Avery: custom lengths exist and are staff-quoted.
