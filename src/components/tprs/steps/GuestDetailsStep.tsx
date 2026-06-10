// Step 5 — guest details + booking-question forms.
//
// Guest form (ADR-0029 §5.1 minimization): first/last + email + phone all
// REQUIRED (ADR-0025 — name+email+phone required), zip required by the stored
// shape; autocomplete attributes for OS autofill; validate-on-blur that never
// wipes input on error. The ADR-0030 FormRenderer mounts here (dormant until a
// product has an attached form). The "Have a code?" coupon entry moved to the
// PAYMENT step (CouponField.tsx) — checkout is where guests hunt for it.

import { useState, useCallback } from "react";
import FormRenderer from "../FormRenderer";
import type { FormAnswerInput } from "../../../tprs/schemas";
import { ZIP_RE, type GuestFields } from "../state";

interface Props {
  guest: GuestFields;
  onGuestField: (field: keyof GuestFields, value: string) => void;
  /** For the ADR-0030 booking-question forms lookup. */
  productId: string;
  onFormAnswers: (answers: FormAnswerInput[]) => void;
  /** Bubbles booking-form required-field completeness up to gate the CTA. */
  onFormValidityChange: (complete: boolean) => void;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function GuestDetailsStep(props: Props) {
  const {
    guest,
    onGuestField,
    productId,
    onFormAnswers,
    onFormValidityChange,
  } = props;

  const [touched, setTouched] = useState<Partial<Record<keyof GuestFields, boolean>>>({});

  // Stable callback so FormRenderer's effect doesn't re-fire each render.
  const handleAnswers = useCallback(
    (answers: FormAnswerInput[]) => onFormAnswers(answers),
    [onFormAnswers],
  );

  function fieldError(field: keyof GuestFields): string | null {
    if (!touched[field]) return null;
    const v = guest[field].trim();
    if (field === "email") {
      if (v === "") return "Email is required.";
      if (!EMAIL_RE.test(v)) return "Enter a valid email.";
      return null;
    }
    if (field === "zip") {
      if (v === "") return "Required.";
      if (!ZIP_RE.test(v)) return "Enter a 5-digit ZIP.";
      return null;
    }
    return v === "" ? "Required." : null;
  }

  return (
    <div>
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
            value={guest.firstName}
            onChange={(e) => onGuestField("firstName", e.currentTarget.value)}
            onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
          />
          {fieldError("firstName") && (
            <p className="tprs-field-error">{fieldError("firstName")}</p>
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
            value={guest.lastName}
            onChange={(e) => onGuestField("lastName", e.currentTarget.value)}
            onBlur={() => setTouched((t) => ({ ...t, lastName: true }))}
          />
          {fieldError("lastName") && (
            <p className="tprs-field-error">{fieldError("lastName")}</p>
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
          value={guest.email}
          onChange={(e) => onGuestField("email", e.currentTarget.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
        />
        {fieldError("email") && (
          <p className="tprs-field-error">{fieldError("email")}</p>
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
            value={guest.phone}
            onChange={(e) => onGuestField("phone", e.currentTarget.value)}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          />
          {fieldError("phone") && (
            <p className="tprs-field-error">{fieldError("phone")}</p>
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
            maxLength={10}
            value={guest.zip}
            onChange={(e) => onGuestField("zip", e.currentTarget.value)}
            onBlur={() => setTouched((t) => ({ ...t, zip: true }))}
          />
          {fieldError("zip") && (
            <p className="tprs-field-error">{fieldError("zip")}</p>
          )}
        </div>
      </div>

      {/* ADR-0030 booking-question forms — dormant until a form is attached. */}
      <FormRenderer
        productId={productId}
        onAnswersChange={handleAnswers}
        onValidityChange={onFormValidityChange}
      />

    </div>
  );
}
