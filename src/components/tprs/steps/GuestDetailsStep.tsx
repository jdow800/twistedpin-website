// Step 5 — guest details + booking-question forms + "Have a code?".
//
// Guest form (ADR-0029 §5.1 minimization): first/last + email + phone all
// REQUIRED (ADR-0025 — name+email+phone required), zip required by the stored
// shape; autocomplete attributes for OS autofill; validate-on-blur that never
// wipes input on error. The ADR-0030 FormRenderer mounts here (dormant until a
// product has an attached form). The coupon entry is collapsed behind a "Have a
// code?" link with an explicit Apply (Baymard's one sanctioned Apply-button
// case) and reads "Have a code?" — never discount vocabulary (ADR-0029 §4).

import { useState, useCallback } from "react";
import FormRenderer from "../FormRenderer";
import { previewCoupon, TprsApiError } from "../../../tprs/client";
import type {
  CouponPreviewResponse,
  FormAnswerInput,
} from "../../../tprs/schemas";
import { ZIP_RE, type GuestFields } from "../state";
import { formatUsd, toIsoWithOffset } from "../format";

interface Props {
  guest: GuestFields;
  onGuestField: (field: keyof GuestFields, value: string) => void;
  productId: string;
  // Coupon-preview inputs (the chosen lane line).
  date: string;
  slotTime: string;
  laneQty: number;
  couponCode: string;
  couponResult: CouponPreviewResponse | null;
  onCouponCode: (code: string) => void;
  onCouponResult: (result: CouponPreviewResponse | null) => void;
  onFormAnswers: (answers: FormAnswerInput[]) => void;
  /** Bubbles booking-form required-field completeness up to gate the CTA. */
  onFormValidityChange: (complete: boolean) => void;
}

const COUPON_REASON_COPY: Record<string, string> = {
  not_found: "We don't recognize that code.",
  inactive: "That code isn't active.",
  not_yet_active: "That code isn't active yet.",
  expired: "That code has expired.",
  exhausted: "That code has been fully redeemed.",
  already_redeemed: "Looks like you've already used this code.",
  no_matching_products: "That code doesn't apply to these lanes.",
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function GuestDetailsStep(props: Props) {
  const {
    guest,
    onGuestField,
    productId,
    date,
    slotTime,
    laneQty,
    couponCode,
    couponResult,
    onCouponCode,
    onCouponResult,
    onFormAnswers,
    onFormValidityChange,
  } = props;

  const [touched, setTouched] = useState<Partial<Record<keyof GuestFields, boolean>>>({});
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

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

  async function applyCode() {
    const code = couponCode.trim();
    if (code === "") return;
    setCodeBusy(true);
    setCodeError(null);
    try {
      const res = await previewCoupon({
        startTime: toIsoWithOffset(date, slotTime),
        items: [
          {
            productId,
            quantity: laneQty,
            cartLineRef: "preview-lane", // opaque; preview mints no hold
          },
        ],
        couponCode: code,
        // Send contact when entered so a "once per guest" code the guest has
        // already used previews as already-redeemed (matched on phone or email).
        ...(guest.email.trim() !== "" && { email: guest.email.trim() }),
        ...(guest.phone.trim() !== "" && { phone: guest.phone.trim() }),
      });
      onCouponResult(res);
    } catch (e) {
      const msg =
        e instanceof TprsApiError
          ? "Couldn't check that code right now."
          : "Something went wrong.";
      setCodeError(msg);
      onCouponResult(null);
    } finally {
      setCodeBusy(false);
    }
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

      {/* "Have a code?" — collapsed + explicit Apply; never "discount". */}
      <div className="tprs-field">
        {!codeOpen ? (
          <button
            type="button"
            className="tprs-code-toggle"
            onClick={() => setCodeOpen(true)}
          >
            Have a code?
          </button>
        ) : (
          <>
            <label className="tprs-label" htmlFor="g-code">
              Have a code?
            </label>
            <div className="tprs-code-row">
              <input
                id="g-code"
                className="tprs-input"
                type="text"
                autoCapitalize="characters"
                placeholder="Enter your code"
                value={couponCode}
                onChange={(e) => onCouponCode(e.currentTarget.value)}
              />
              <button
                type="button"
                className="tprs-btn tprs-btn--ghost tprs-btn--small"
                disabled={codeBusy || couponCode.trim() === ""}
                onClick={applyCode}
              >
                {codeBusy ? "Checking…" : "Apply"}
              </button>
            </div>
            {codeError && <p className="tprs-code-msg is-err">{codeError}</p>}
            {!codeError && couponResult?.valid && (
              <p className="tprs-code-msg is-ok">
                Code applied — {formatUsd(couponResult.discountAmountCents ?? 0)} off.
              </p>
            )}
            {!codeError && couponResult && !couponResult.valid && (
              <p className="tprs-code-msg is-err">
                {COUPON_REASON_COPY[couponResult.reason ?? ""] ??
                  "That code can't be applied."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
