# `per_unit_select` — pizza-topping picker: cross-repo handoff spec

> **STATUS: PARKED 2026-06-13 — not building this.** The owner chose the simple
> Roller-style approach instead: make "Pizza Toppings" a **free-text field**
> (`long_text`/`short_text`) with help text — *"Most choose between Cheese,
> Pepperoni or Sausage. You'll get 2 pizzas for up to 10 guests, 3 pizzas if you
> add additional guest(s)."* That's an **admin-only** change (the website already
> renders text fields; zero code). This spec — the scaled +/− stepper with
> per-pizza enforcement — stands **only if** exact per-pizza topping enforcement
> at checkout is ever genuinely needed (kitchen ambiguity complaints, or
> premium/charged toppings). Until then it's gold-plating; see the decision
> thread 2026-06-13.

_Authored 2026-06-13 (design-panel + adversarial-review workflow). The synthesize
pass is grounded in live API curls + the real code; three blockers below were
caught by the adversarial lenses and are baked into this contract._

This is the contract between **dev/tprs** (backend: shared-schemas + forms API +
convert validator) and **dev/Website** (this repo: `FormRenderer` + the booking
wizard). Implement to it on both sides; the seams in §4 are where a mismatch
turns into a **booking failure at the Pay step**, so they must match exactly.

---

## 1. What we're building + the confirmed rule

Kids birthday packages, when **Birthday Food Option = "Pizza (comes with fries)"**,
let the guest pick a topping **for each large pizza**. The number of pizzas scales
with the party:

> **N = ceil( kids / 5 )**, where **kids = 10 (base) + additional-guest add-on qty**.
> 10 kids → **2** pizzas · 11–14 kids → **3** · capped at 14 kids (→ max 3).

UX (website): a **+/− stepper per topping** (Cheese / Pepperoni / Sausage); the
**total across toppings caps at N**; header reads _"Pick a topping for each of your
N large pizzas"_ with **N updating live** as the guest count changes.

Applies to the shared **"Kids Party"** form (`822693de-2163-437b-a875-7368d8b7745a`),
field **"Pizza Toppings"** (`29a43494-a9af-4818-969a-6f58e8e8fc82`), attached to
both **Suite Birthday (code 109, add-on 110)** and **Extra Suite (code 118,
add-on 119)**.

---

## 2. ⚠️ Baseline reality (caught by review — the spec is NOT the current state)

- **The live field is `checkbox_list`, not `per_unit_select`.** It was switched to
  `checkbox_list` in admin on 2026-06-13 as the interim unblock (min/max null →
  unbounded "choose as many as you like"). `per_unit_select` exists today only as
  an **enum value** in the schema — **no field instance uses it**, and the forms
  API carries **no count metadata**.
- Therefore right now an unbounded checkbox_list lets a guest submit 1 topping for
  a 3-pizza party and convert accepts it. Functional, just not scaled.
- **The website `renderField` switch has no `per_unit_select` case** → it falls
  through to `default: return null`. So if the backend flips the field type to
  `per_unit_select` **before** the website renderer ships, the field renders
  **nothing** while `required:true` + visible → the wizard's validation gates an
  **invisible** field → **hard deadlock at the guest step** (scroll target
  `getElementById(field.id)` is null → Continue silently does nothing). The
  sequencing in §5 exists to prevent this.

---

## 3. The two halves

### 3a. Backend (dev/tprs)

1. **Add count config to `formFieldDefinitionSchema`** (shared-schemas), all
   optional/nullable so it's additive and only meaningful for `per_unit_select`:
   - `countBaseGuests: number | null` — the base coverage (here **10**).
   - `countAddOnCode: number | null` — the linked per-guest add-on **code** whose
     quantity is added to the base (**110** for product 109, **119** for 118).
   - `countDivisor: number | null` — kids per pizza (**5**). **This is the pizza
     yield, NOT lane capacity** (VIP 6 / traditional 5) — do not source it from
     any capacity map.
   - `countRound: "ceil"` (lock to ceil; not floor, not round-half).
2. **Migrate field `29a43494…`**: `checkbox_list` → `per_unit_select`, set the four
   count fields above, **preserve** `visibleWhenFieldId=36432eb8…` /
   `visibleWhenValues=["Pizza (comes with fries)"]` and `required:true`.
3. **Expose the count fields on `GET /api/products/:id/forms`** for that field.
4. **Convert validator** (`POST /api/checkout/convert`): for a **visible**
   `per_unit_select` field, compute `N = ceil((countBaseGuests + qty(countAddOnCode)) / countDivisor)`
   from the submitted convert payload, and require the field's answer rows to be a
   **multiset of size exactly N over `options`** — i.e. **count of rows == N**,
   **repeated values allowed** (2× Pepperoni = two rows). Do **not** treat it like
   `checkbox_list` (distinct-set / dedupe). When the field is **hidden** (food ≠
   Pizza), require **no** answer and enforce **no** count.

### 3b. Website (dev/Website — me, after the schema syncs)

1. **Sync the vendored schema** `src/tprs/schemas/forms.ts` from dev/tprs in
   lockstep (the file's header forbids hand-editing; `zod` strips unknown keys, so
   the website literally cannot read the count fields until they're in the vendored
   schema).
2. **Thread N down**: `BookingWizard` already computes the kids count
   (`guestStepper.baseGuests + (state.addOnQtys[guestStepper.addOn.id] ?? 0)`).
   Derive a per-field `N` map and pass it through `GuestDetailsStep` → `FormRenderer`
   as a new prop. (`FormRenderer` has no access to wizard state today — this prop is
   the only way N can update live.)
3. **`renderField` `per_unit_select` case**: the +/− steppers. Store picks **only**
   in `answers[field.id]` as **N repeated option strings** (so `flatten()` and the
   one-row-per-value `booking_form_answers` storage stay unchanged). Stepper qty for
   a topping = count of that value in the array. `+` appends (allowed only while
   `array.length < N`); `−` removes one occurrence (floor 0). Invariant:
   `answers[field.id].length <= N` always. Put `id={field.id}` on the **first
   topping's `+` button** (a real focusable control — the scroll/focus target) with
   `aria-invalid` when invalid, mirroring the radio/checkbox_list "id on first
   control" pattern.
4. **`requiredSatisfied` per_unit_select branch** = `values.length === N` (exactly
   N — under- **and** over-count are invalid). Signature must take N (it's a pure
   module fn today taking only `(field, values)`).
5. **Trim effect** (convergent, `if (changed)`-guarded, like the existing
   hidden-field-clear effect): when N **drops** below the stored count, slice the
   array to the **first N** (earliest picks survive); when N **rises**, leave it
   (the new pizza is unassigned → `length < N` → required-unsatisfied until the
   guest assigns it). N can change from **outside** `FormRenderer` (the guest
   stepper on the detail step / sticky cart), so this **must** be a `useEffect` on
   the N prop, not an onChange handler.
6. **Dependencies**: add N to the `invalidIds` `useMemo` deps **and** the
   `fieldInvalid` derivation, or a guest-count change alone won't re-evaluate the
   gate (the memo keys on `[forms, answers]` today).
7. **Cap UX**: disable **every** topping `+` when `sum === N` (cap is on the
   **total**, not per topping); disable a topping `−` at 0. Interpolate the live N
   into the header.
8. **Seed**: start **empty** (no pre-filled topping) and require the guest to
   assign all N — explicit topping choice is the intent, and the failed-Continue
   reveal already handles "assign your pizzas." Never use empty-string slot
   sentinels — `flatten()` drops `value === ""`, which would silently under-count.
9. **Defensive fallback**: if a `per_unit_select` field arrives **without** count
   config (counts null — e.g. flipped before §3a step 1/3 land), render the options
   as a plain multi-select (require ≥1) — **never** fall through to `return null`
   while required+visible. This keeps every sequencing step deadlock-free.

---

## 4. 🔒 The contract seam — get these three identical or convert rejects

1. **Count source = `countBaseGuests + qty(countAddOnCode)`, NOT a raw line qty.**
   The convert payload carries the **lane** line (`quantity:1`, the base package is
   `maxQuantityPerBooking:1`) and the **add-on** line (`quantity:0–4`). The actual
   kids number (10 + add-on) appears **nowhere** as a first-class field — the
   website computes it in JS. So the server **must** reconstruct it the same way:
   `countBaseGuests (10)` + the **add-on** line's quantity. Reading lane qty → N=1;
   reading add-on qty alone → N=ceil(0..4/5)=0..1. Both are catastrophically wrong.
   `countBaseGuests=10` is **website-only today** (`pageConfig.ts`) — it must become
   machine-readable on the field def (above) so the server can add the +10.
2. **Answer shape = exactly N rows, duplicates required & meaningful.** Website
   emits one `{formFieldId, value:<topping>}` row per pizza — `[Pepperoni,
   Pepperoni, Cheese]` for N=3. The website's `flatten()`/`toggleInList` use
   `Set`-dedupe for checkbox_list — the per_unit_select path **must bypass that** and
   emit the flat repeated list. The server **must** accept repeated values and check
   **row-count == N**, not distinct-set. No aggregate encoding (no
   `"Cheese:2,Pepperoni:1"` — that's a non-enum string the option validator rejects
   and it breaks one-row-per-value storage).
3. **N math = `ceil((10 + addOnQty) / 5)`, divisor 5 = pizza yield.** Test vectors
   **both sides must pass**: addOnQty `0 → 10 kids → 2`; `1 → 11 → 3`; `4 → 14 → 3`.
   Forbid computing N off the add-on qty alone (forgetting +10 → 10-kid party gets
   N=2 on the web but N=0 on the server → reject on the **most common** booking).
   Re-confirm `countBaseGuests`/`countAddOnCode`/cap at the prod-DB cutover — the
   catalog re-seeded once (9→109 / 18→118); codes + add-on `maxQuantity` are not
   guaranteed stable.

**Conformance:** kids=11 → N=3 → `[Pepperoni,Pepperoni,Cheese]` ✅ ·
`[Pepperoni,Cheese]` (2 rows) ❌ `form_answer_invalid` ·
`[Pepperoni×4]` (4 rows) ❌ · food=Nuggets → field hidden → **0 rows, no count** ✅.

---

## 5. Deadlock-free sequencing

| # | Repo | Step | Safe because |
|---|---|---|---|
| 1 | backend + website (paired) | Add the 4 count fields to shared-schemas `formFieldDefinitionSchema`; **re-vendor** `src/tprs/schemas/forms.ts` identically. Field stays `checkbox_list`. | Purely additive, no field uses them — zero behavior change. |
| 2 | website | Ship the `per_unit_select` renderer + `requiredSatisfied(===N)` + N threading + trim effect + the §3b.9 fallback. | No field is `per_unit_select` yet → the new case is dormant. |
| 3 | backend | Add count **values** to field `29a43494…`, flip its type `checkbox_list → per_unit_select` (preserve visibleWhen + required), ship the convert validator. | Website renderer is already live → reads the config → renders the stepper the instant the field flips. No deadlock. |
| 4 | both | Verify a live pizza booking at **10 kids (expect 2)** and **11+ (expect 3)**, plus a Nuggets booking (no toppings required). | — |

**Until step 3 lands, the interim `checkbox_list` keeps pizza bookings working**
(unbounded, no scaling) — no customer is blocked in the meantime.

---

## 6. Open question for ops

Within 10–14 kids the rule gives 2 (at 10) or 3 (at 11+). Confirm that's intended
— 11 kids already bumps to a 3rd pizza. If the line should sit elsewhere (e.g. 3
only at 13+), change **`countDivisor`** (and/or `countRound`); the formula and both
implementations stay identical.
