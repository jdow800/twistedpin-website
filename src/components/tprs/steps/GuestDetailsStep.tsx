// Step 5 — guest details + booking-question forms.
//
// Guest form (ADR-0029 §5.1 minimization): first/last + email + phone all
// REQUIRED (ADR-0025 — name+email+phone required), zip required by the stored
// shape; autocomplete attributes for OS autofill; validate-on-blur that never
// wipes input on error. The ADR-0030 FormRenderer mounts here (dormant until a
// product has an attached form). The "Have a code?" coupon entry moved to the
// PAYMENT step (CouponField.tsx) — checkout is where guests hunt for it.

import { useState, useCallback } from "react";
import FormRenderer, { type UnitQuantities } from "../FormRenderer";
import type { FormAnswerInput } from "../../../tprs/schemas";
import { guestFieldError, guestInvalidFields, type GuestFields } from "../state";

interface Props {
  guest: GuestFields;
  onGuestField: (field: keyof GuestFields, value: string) => void;
  /** Marketing-consent checkbox value. `undefined` = never toggled — rendered
   *  unchecked, but distinct from an explicit `false` on the wire. */
  marketingOptIn: boolean | undefined;
  onMarketingOptIn: (value: boolean) => void;
  /** For the ADR-0030 booking-question forms lookup. */
  productId: string;
  onFormAnswers: (answers: FormAnswerInput[]) => void;
  /** Bubbles the booking-form's invalid field ids up so the wizard can gate the
   *  CTA + scroll to the first miss (was onFormValidityChange:boolean). */
  onFormInvalidIds: (ids: string[]) => void;
  /** Bumped by a failed Continue → reveal ALL required-field errors at once,
   *  not just blurred ones (the "what did I miss?" fix). 0 = nothing tried yet. */
  submitAttempt: number;
  /** How many BOOKING-FORM (FormRenderer) required fields are currently
   *  unsatisfied — folded into the screen-reader "N fields need attention"
   *  count so a missed VIP/NYE acknowledgement checkbox is announced too. */
  formInvalidCount: number;
  /** Lanes/guests chosen earlier — drives any per_unit_select form field's
   *  picker count (NYE one-pizza-per-lane). Passed straight to FormRenderer. */
  unitQuantities: UnitQuantities;
}

// Input-side limiting so junk never lands in the field (paste-safe slice +
// strip disallowed chars). Phone keeps digits + standard formatting; ZIP is
// digits-only, capped at 5 (US 5-digit; ZIP+4 isn't needed). Format is still
// validated on top (guestFieldError).
const sanitizePhone = (v: string) => v.replace(/[^\d\s+\-().]/g, "").slice(0, 20);
const sanitizeZip = (v: string) => v.replace(/\D/g, "").slice(0, 5);

export default function GuestDetailsStep(props: Props) {
  const {
    guest,
    onGuestField,
    marketingOptIn,
    onMarketingOptIn,
    productId,
    onFormAnswers,
    onFormInvalidIds,
    submitAttempt,
    formInvalidCount,
    unitQuantities,
  } = props;

  const [touched, setTouched] = useState<Partial<Record<keyof GuestFields, boolean>>>({});

  // Stable callback so FormRenderer's effect doesn't re-fire each render.
  const handleAnswers = useCallback(
    (answers: FormAnswerInput[]) => onFormAnswers(answers),
    [onFormAnswers],
  );

  // A failed Continue reveals every field's error; otherwise errors show on blur
  // (touched). Pure-derived from the prop — no extra state. Message logic is
  // shared via guestFieldError so the on-blur text and the reveal never drift.
  const showAll = submitAttempt > 0;
  function fieldError(field: keyof GuestFields): string | null {
    if (!touched[field] && !showAll) return null;
    return guestFieldError(field, guest);
  }

  // Screen-reader announcement for a failed Continue — focus moving to the first
  // invalid field announces only THAT one, so this says how many need attention.
  // Keyed on submitAttempt so a second failed Continue re-announces. Counts BOTH
  // guest fields AND booking-form fields (FormRenderer) — booking forms are live
  // on all products (VIP/NYE rules checkboxes, birthday Kids Party), so a missed
  // acknowledgement with otherwise-valid guest fields must still announce.
  const invalidCount = showAll
    ? guestInvalidFields(guest).length + formInvalidCount
    : 0;

  return (
    <div>
      <div
        key={submitAttempt}
        className="tprs-sr-only"
        role="alert"
        aria-live="assertive"
      >
        {invalidCount > 0
          ? `${invalidCount} ${invalidCount === 1 ? "field needs" : "fields need"} your attention. The first is focused.`
          : ""}
      </div>

      <div className="tprs-step-head">
        <h2 className="tprs-h2">Your details</h2>
      </div>

      <div className="tprs-field-row">
        <div className="tprs-field">
          <label className="tprs-label" htmlFor="g-first">
            First name<span className="tprs-req"> *</span>
          </label>
          <input
            id="g-first"
            className={`tprs-input${fieldError("firstName") ? " is-invalid" : ""}`}
            type="text"
            autoComplete="given-name"
            enterKeyHint="next"
            aria-invalid={fieldError("firstName") ? true : undefined}
            aria-describedby={fieldError("firstName") ? "g-first-err" : undefined}
            value={guest.firstName}
            onChange={(e) => onGuestField("firstName", e.currentTarget.value)}
            onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
          />
          {fieldError("firstName") && (
            <p className="tprs-field-error" id="g-first-err">{fieldError("firstName")}</p>
          )}
        </div>
        <div className="tprs-field">
          <label className="tprs-label" htmlFor="g-last">
            Last name<span className="tprs-req"> *</span>
          </label>
          <input
            id="g-last"
            className={`tprs-input${fieldError("lastName") ? " is-invalid" : ""}`}
            type="text"
            autoComplete="family-name"
            enterKeyHint="next"
            aria-invalid={fieldError("lastName") ? true : undefined}
            aria-describedby={fieldError("lastName") ? "g-last-err" : undefined}
            value={guest.lastName}
            onChange={(e) => onGuestField("lastName", e.currentTarget.value)}
            onBlur={() => setTouched((t) => ({ ...t, lastName: true }))}
          />
          {fieldError("lastName") && (
            <p className="tprs-field-error" id="g-last-err">{fieldError("lastName")}</p>
          )}
        </div>
      </div>

      <div className="tprs-field">
        <label className="tprs-label" htmlFor="g-email">
          Email<span className="tprs-req"> *</span>
        </label>
        <input
          id="g-email"
          className={`tprs-input${fieldError("email") ? " is-invalid" : ""}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          enterKeyHint="next"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={fieldError("email") ? true : undefined}
          aria-describedby={fieldError("email") ? "g-email-err" : undefined}
          value={guest.email}
          onChange={(e) => onGuestField("email", e.currentTarget.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
        />
        {fieldError("email") && (
          <p className="tprs-field-error" id="g-email-err">{fieldError("email")}</p>
        )}
      </div>

      <div className="tprs-field-row">
        <div className="tprs-field">
          <label className="tprs-label" htmlFor="g-phone">
            Phone<span className="tprs-req"> *</span>
          </label>
          <input
            id="g-phone"
            className={`tprs-input${fieldError("phone") ? " is-invalid" : ""}`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            maxLength={20}
            aria-invalid={fieldError("phone") ? true : undefined}
            aria-describedby={fieldError("phone") ? "g-phone-err" : undefined}
            value={guest.phone}
            onChange={(e) => onGuestField("phone", sanitizePhone(e.currentTarget.value))}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          />
          {fieldError("phone") && (
            <p className="tprs-field-error" id="g-phone-err">{fieldError("phone")}</p>
          )}
        </div>
        <div className="tprs-field">
          <label className="tprs-label" htmlFor="g-zip">
            ZIP<span className="tprs-req"> *</span>
          </label>
          <input
            id="g-zip"
            className={`tprs-input${fieldError("zip") ? " is-invalid" : ""}`}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            enterKeyHint="done"
            maxLength={5}
            aria-invalid={fieldError("zip") ? true : undefined}
            aria-describedby={fieldError("zip") ? "g-zip-err" : undefined}
            value={guest.zip}
            onChange={(e) => onGuestField("zip", sanitizeZip(e.currentTarget.value))}
            onBlur={() => setTouched((t) => ({ ...t, zip: true }))}
          />
          {fieldError("zip") && (
            <p className="tprs-field-error" id="g-zip-err">{fieldError("zip")}</p>
          )}
        </div>
      </div>

      {/* SMS service disclosure (visit-feedback program 2026-07-06): booking-
          related texts ride transactional consent; this line is the disclosed
          basis. Marketing opt-in, if/when added, is a separate UNCHECKED
          checkbox — never bundled into terms (TCPA: consent to marketing can't
          be a condition of purchase). */}
      <p className="tprs-help">
        We'll text you about your booking and visit. Msg &amp; data rates may
        apply. Reply STOP anytime.
      </p>

      {/* Marketing opt-in (2026-07-19) — the separate UNCHECKED checkbox the
          disclosure above anticipated. Deliberately NOT merged into the payment
          step's terms checkbox: consent to marketing can't be a condition of
          purchase, so it has to be its own affirmative act the guest can skip
          while still booking. Never pre-checked.

          SMS ONLY (2026-07-20 — Jon: "we ain't emailing them"). The fine print
          below names texts and nothing else, so BookingWizard sends ONLY
          `smsMarketingOptIn`; `marketingOptIn` (email) is deliberately absent.
          **The recorded consent must never be broader than what this copy
          discloses** — if the fine print ever names email again, re-add that
          field in the SAME commit. The wire carries both channels, so it's one
          line either way.

          Untouched → stays `undefined` → the payload omits the field, so no
          consent_event is written at all (see WizardState.marketingOptIn).

          ⚠️ OWNER-APPROVED VOICE EXCEPTION (Jon, 2026-07-20): "deals" is on the
          banned Words-to-Avoid list (cheap/discount/value/deals/budget-friendly)
          and "curated" is otherwise reserved for the Van Flandern credential.
          Both are deliberate here — Jon specified this exact string. Do NOT
          "fix" it in a brand sweep; the ban still holds everywhere else. */}
      <div className="tprs-consent">
        <label className="tprs-choice">
          <input
            type="checkbox"
            checked={marketingOptIn === true}
            onChange={(e) => onMarketingOptIn(e.currentTarget.checked)}
          />
          <span>
            <strong>Send me epic deals.</strong> Curated offers, you deserve.
          </span>
        </label>
        <p className="tprs-consent-fine">
          Occasional marketing texts from Twisted Pin. Not required to book. Msg
          &amp; data rates may apply. Reply STOP to opt out.
        </p>
      </div>

      {/* ADR-0030 booking-question forms — LIVE on all products (VIP/NYE booking
          agreement, birthday Kids Party). Bubbles invalid ids up for the gate +
          first-miss scroll; reveals per-field errors on a failed Continue. */}
      <FormRenderer
        productId={productId}
        onAnswersChange={handleAnswers}
        onInvalidIdsChange={onFormInvalidIds}
        submitAttempt={submitAttempt}
        unitQuantities={unitQuantities}
      />

    </div>
  );
}
