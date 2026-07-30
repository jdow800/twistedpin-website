// "Have a code?" — ALWAYS-VISIBLE labeled input + explicit Apply (Baymard's one
// sanctioned Apply-button case), never "discount" vocabulary (ADR-0029 §4).
// Lives at CHECKOUT (the payment step) — the conventional place guests hunt for
// it — after starting life collapsed on the guest-details step, where it was
// easy to miss (Jon, 2026-06-10). Extracted so any step can mount it.

import { useEffect, useRef, useState } from "react";
import { previewCoupon, TprsApiError } from "../../tprs/client";
import type { CouponPreviewResponse } from "../../tprs/schemas";
import { formatUsd } from "./format";

const COUPON_REASON_COPY: Record<string, string> = {
  not_found: "We don't recognize that code.",
  inactive: "That code isn't active.",
  not_yet_active: "That code isn't active yet.",
  expired: "That code has expired.",
  exhausted: "That code has been fully redeemed.",
  already_redeemed: "Looks like you've already used this code.",
  no_matching_products: "That code doesn't apply to these lanes.",
};

interface Props {
  productId: string;
  /** Lane start, ISO-8601 with offset (what coupon-preview validates against). */
  startTime: string;
  laneQty: number;
  /** Contact (when known) so a "once per guest" code previews as
   *  already-redeemed for a guest who used it before. */
  email?: string;
  phone?: string;
  couponCode: string;
  couponResult: CouponPreviewResponse | null;
  onCouponCode: (code: string) => void;
  onCouponResult: (result: CouponPreviewResponse | null) => void;
}

export default function CouponField({
  productId,
  startTime,
  laneQty,
  email,
  phone,
  couponCode,
  couponResult,
  onCouponCode,
  onCouponResult,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // [MAGIC LINK 2026-07-30] A code pre-filled by /book/<CODE> (BookingWizard's
  // URL read) auto-previews once on mount so the link-tapping guest sees
  // "Code applied — $X off" without touching the field. Once only — after
  // that the guest owns the field (clearing/retyping behaves as always).
  const autoApplied = useRef(false);
  useEffect(() => {
    if (autoApplied.current) return;
    if (couponCode.trim() !== "" && couponResult === null) {
      autoApplied.current = true;
      void applyCode(true);
    }
    // Mount-only by design; applyCode closes over current props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyCode(auto = false) {
    const code = couponCode.trim();
    if (code === "") return;
    setBusy(true);
    setError(null);
    try {
      const res = await previewCoupon({
        startTime,
        items: [
          {
            productId,
            quantity: laneQty,
            cartLineRef: "preview-lane", // opaque; preview mints no hold
          },
        ],
        couponCode: code,
        ...(email?.trim() && { email: email.trim() }),
        ...(phone?.trim() && { phone: phone.trim() }),
      });
      onCouponResult(res);
      // A link-landed code the guest never typed must not poison the field:
      // an invalid auto-applied code would keep riding the quote + payment
      // requests (both 400 on it) with the guest unaware they should clear
      // it. Show the reason (couponResult renders below), empty the input.
      if (auto && !res.valid) onCouponCode("");
    } catch (e) {
      const msg =
        e instanceof TprsApiError
          ? "Couldn't check that code right now."
          : "Something went wrong.";
      setError(msg);
      onCouponResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tprs-code-block">
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
          disabled={busy || couponCode.trim() === ""}
          onClick={() => applyCode()}
        >
          {busy ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && <p className="tprs-code-msg is-err">{error}</p>}
      {!error && couponResult?.valid && (
        <p className="tprs-code-msg is-ok">
          Code applied — {formatUsd(couponResult.discountAmountCents ?? 0)} off.
        </p>
      )}
      {!error && couponResult && !couponResult.valid && (
        <p className="tprs-code-msg is-err">
          {COUPON_REASON_COPY[couponResult.reason ?? ""] ??
            "That code can't be applied."}
        </p>
      )}
    </div>
  );
}
