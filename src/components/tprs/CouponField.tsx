// "Have a code?" — visible labeled input + explicit Apply until a points reward
// is confirmed. A compact applied card then replaces the entry controls.
// Apply is the explicit code-entry action; never "discount" vocabulary (ADR-0029 §4).
// Lives at CHECKOUT (the payment step) — the conventional place guests hunt for
// it — after starting life collapsed on the guest-details step, where it was
// easy to miss (Jon, 2026-06-10). Extracted so any step can mount it.

import { useEffect, useRef, useState } from "react";
import { previewCoupon, TprsApiError } from "../../tprs/client";
import type { CouponPreviewResponse } from "../../tprs/schemas";
import { pointsRewardMessage } from "./pointsRewardCopy";
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
  disabled?: boolean;
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
  disabled = false,
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
  const requestVersion = useRef(0);
  const currentInputs = JSON.stringify([couponCode, productId, startTime, laneQty, email, phone]);
  const latestInputs = useRef(currentInputs);
  latestInputs.current = currentInputs;
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
    if (code === "" || disabled) return;
    const version = ++requestVersion.current;
    const inputs = currentInputs;
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
      if (version !== requestVersion.current || inputs !== latestInputs.current) return;
      // A link-landed code the guest never typed must not poison the field:
      // an invalid auto-applied code would keep riding the quote + payment
      // requests (both 400 on it) with the guest unaware they should clear
      // it. Show the reason (couponResult renders below), empty the input.
      if (auto && !res.valid && res.reason !== 'phone_mismatch') onCouponCode("");
      // Clearing the code resets reducer state; record the explanation AFTER that reset.
      onCouponResult(res);
    } catch (e) {
      if (version !== requestVersion.current || inputs !== latestInputs.current) return;
      const msg =
        e instanceof TprsApiError
          ? "Couldn't check that code right now."
          : "Something went wrong.";
      setError(msg);
      onCouponResult(null);
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }

  function removeCode() {
    ++requestVersion.current;
    setBusy(false);
    setError(null);
    onCouponCode("");
  }

  if (!error && couponResult?.valid && couponResult.requiredPoints !== undefined) {
    return (
      <div className="tprs-code-block tprs-reward-applied">
        <div className="tprs-reward-applied-copy" role="status">
          <strong className="tprs-reward-applied-title">
            {formatUsd(couponResult.discountAmountCents ?? 0)} reward applied
          </strong>
          <p className="tprs-reward-applied-detail">
            Uses {couponResult.requiredPoints} points when you book.
          </p>
        </div>
        <button
          type="button"
          className="tprs-link-btn tprs-reward-remove"
          aria-label="Remove reward"
          disabled={disabled}
          onClick={removeCode}
        >Remove</button>
      </div>
    );
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
          disabled={disabled}
          onChange={(e) => { ++requestVersion.current; setBusy(false); setError(null); onCouponCode(e.currentTarget.value); }}
        />
        <button
          type="button"
          className="tprs-btn tprs-btn--ghost tprs-btn--small"
          disabled={disabled || busy || couponCode.trim() === ""}
          onClick={() => applyCode()}
        >
          {busy ? "Checking…" : "Apply"}
        </button>
      </div>
      {couponCode.trim() !== '' && (
        <button type="button" className="tprs-link-btn" disabled={disabled} onClick={removeCode}>Remove code</button>
      )}
      {error && <p className="tprs-code-msg is-err">{error}</p>}
      {!error && couponResult?.valid && (
        <p className="tprs-code-msg is-ok">
          Code applied — {formatUsd(couponResult.discountAmountCents ?? 0)} off.
        </p>
      )}
      {!error && couponResult && !couponResult.valid && (
        <p className="tprs-code-msg is-err">
          {couponResult.requiredPoints !== undefined || ['insufficient_points','phone_mismatch','reward_used','reward_unavailable'].includes(couponResult.reason ?? '')
            ? pointsRewardMessage(couponResult as Parameters<typeof pointsRewardMessage>[0])
            : COUPON_REASON_COPY[couponResult.reason ?? ''] ?? "That code can't be applied."}
          {couponCode.trim() === '' && <> You can continue without this reward at the price shown.</>}
        </p>
      )}
    </div>
  );
}
