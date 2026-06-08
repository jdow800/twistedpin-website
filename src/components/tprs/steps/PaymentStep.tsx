// Step 6 — REAL payment (ADR-0025 §4 two-step checkout), deferred-PaymentElement
// pattern. The cart-hold is acquired on mount (10-min capacity reservation) and
// the card form renders immediately. The rail PaymentIntent is created only when
// the guest hits Pay — because `/checkout/payment-intents` resets the hold to a
// 60-SECOND grace window (it's meant to fire AT payment, with convert seconds
// later). Creating it on mount would give the guest only 60s to type a card and
// risk a charge-then-expired trap. So: Pay → elements.submit() → createPaymentIntent
// (server sizes the amount; 60s grace starts) → stripe.confirmPayment (inline for
// cards/3DS) → convert (idempotent). A visible countdown + "Refresh hold" handle
// the 10-minute budget.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe, STRIPE_AVAILABLE, STRIPE_APPEARANCE } from "../stripe";
import {
  addCartItems,
  createPaymentIntent,
  convertCheckout,
  TprsCheckoutError,
} from "../../../tprs/client";
import { formatUsd } from "../format";
import Markdown from "../Markdown";
import type {
  BookingConvertedResponse,
  CartAddRequest,
  CheckoutCustomerPayload,
  CheckoutItem,
  FormAnswerInput,
} from "../../../tprs/schemas";

interface Props {
  customer: CheckoutCustomerPayload;
  /** Resource-consuming lines that need a capacity hold (the lane). */
  cartHoldItems: CartAddRequest;
  /** Full priced line set (lane + add-ons) sent to payment-intents + convert. */
  checkoutItems: CheckoutItem[];
  eventDate: string; // YYYY-MM-DD
  startTime: string; // ISO-8601 with offset
  couponCode?: string;
  formAnswers: FormAnswerInput[];
  termsText: string;
  /** Authoritative total (incl. tax) for the Pay button + deferred amount. */
  totalCents: number;
  onConverted: (booking: BookingConvertedResponse) => void;
}

/** Friendly copy for the backend's typed checkout error codes. */
function checkoutErrorMessage(err: unknown): string {
  if (err instanceof TprsCheckoutError) {
    switch (err.code) {
      case "coupon_rejected":
        return "That code couldn't be applied. Go back and remove or change it.";
      case "cart_hold_expired":
      case "sync_rejected_tprs_cart_hold_expired":
        return "Your hold ran out.";
      case "capacity_exhausted":
        return "That time just filled up. Go back and choose another.";
      case "payment_intent_invalid":
        return "We couldn't verify the payment. Please try again.";
      default:
        return err.message || "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

function secondsLeft(expiresAtIso: string | null): number {
  if (!expiresAtIso) return 0;
  return Math.max(0, Math.floor((Date.parse(expiresAtIso) - Date.now()) / 1000));
}

export default function PaymentStep(props: Props) {
  if (!STRIPE_AVAILABLE) {
    return (
      <div>
        <div className="tprs-step-head">
          <h2 className="tprs-h2">How you'll pay</h2>
        </div>
        <div className="tprs-pay-error" role="alert">
          <p>Payments aren't configured (missing PUBLIC_STRIPE_PUBLISHABLE_KEY).</p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="tprs-step-head">
        <h2 className="tprs-h2">How you'll pay</h2>
        <p className="tprs-sub">Secure payment by Stripe. Your card is charged now to reserve.</p>
      </div>
      {/* Deferred mode: amount is provisional (server re-sizes at PI creation) —
          renders the card form WITHOUT a PaymentIntent so the 60s grace doesn't
          start until Pay. METHOD FILTERING: `paymentMethodTypes` MUST match the
          backend PI's `payment_method_types` (both manual now: ['card','link']).
          Stripe forbids confirming when the Elements method config differs from
          the PI's — so if the backend ever changes its `payment_method_types`,
          change this list to match, or confirm will fail with "collected using
          payment_method_types … cannot be confirmed". This keeps it inline-only
          (no ACH / Cash App / Klarna / Affirm — which redirect/async and break the
          inline convert) with NO Stripe-Dashboard dependency; Apple/Google Pay
          still ride on `card`. */}
      <Elements
        stripe={getStripe()}
        options={{
          mode: "payment",
          amount: Math.max(50, props.totalCents),
          currency: "usd",
          paymentMethodTypes: ["card", "link"],
          appearance: STRIPE_APPEARANCE,
        }}
      >
        <CheckoutForm {...props} />
      </Elements>
    </div>
  );
}

function CheckoutForm({
  customer,
  cartHoldItems,
  checkoutItems,
  eventDate,
  startTime,
  couponCode,
  formAnswers,
  termsText,
  totalCents,
  onConverted,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();

  // The 10-min cart-hold (capacity reservation) acquired on mount; refreshable.
  const [cartToken, setCartToken] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Set once the charge captures — a retry then re-runs only the idempotent
  // convert (never a second confirmPayment / second charge).
  const paidPid = useRef<string | null>(null);

  const [left, setLeft] = useState(0);
  useEffect(() => {
    setLeft(secondsLeft(holdExpiresAt));
    if (!holdExpiresAt) return;
    const t = setInterval(() => setLeft(secondsLeft(holdExpiresAt)), 1000);
    return () => clearInterval(t);
  }, [holdExpiresAt]);
  const expired = holdExpiresAt !== null && left <= 0;

  async function acquireHold() {
    setRefreshing(true);
    setHoldError(null);
    try {
      const cart = await addCartItems(cartHoldItems);
      setCartToken(cart.cartToken);
      setHoldExpiresAt(cart.holdExpiresAt);
    } catch (err) {
      setHoldError(checkoutErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }

  // Reserve capacity on mount (StrictMode-guarded).
  const acquired = useRef(false);
  useEffect(() => {
    if (acquired.current) return;
    acquired.current = true;
    void acquireHold();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    if (!termsAccepted) {
      setErrorMsg("Please accept the terms to complete your reservation.");
      return;
    }
    if (!cartToken || expired) {
      setErrorMsg("Your hold ran out — tap Refresh, then Pay.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      // Validate the card inputs up front (deferred-mode requirement).
      if (!paidPid.current) {
        const { error: submitError } = await elements.submit();
        if (submitError) {
          setErrorMsg(submitError.message ?? "Check your card details.");
          setSubmitting(false);
          return;
        }
        // Create the PI NOW (server sizes amount; 60s grace starts here)…
        const pi = await createPaymentIntent({
          customer,
          eventDate,
          startTime,
          items: checkoutItems,
          ...(couponCode && { couponCode }),
        });
        // …then confirm immediately (inline for cards + 3DS).
        const { error } = await stripe.confirmPayment({
          elements,
          clientSecret: pi.clientSecret,
          confirmParams: { return_url: window.location.href },
          redirect: "if_required",
        });
        if (error) {
          setErrorMsg(error.message ?? "Your card couldn't be charged.");
          setSubmitting(false);
          return;
        }
        paidPid.current = pi.paymentIntentId; // captured — convert-only from here
      }

      const booking = await convertCheckout({
        cartToken,
        eventDate,
        startTime,
        paymentType: "full",
        items: checkoutItems,
        paymentIntentId: paidPid.current,
        acceptedTerms: true,
        ...(couponCode && { couponCode }),
        ...(formAnswers.length > 0 && { formAnswers }),
      });
      onConverted(booking);
    } catch (err) {
      const charged = paidPid.current !== null;
      // Charged but the hold lapsed before convert (rare with the 60s grace):
      // re-secure capacity, then a tap of "Finish reservation" re-runs convert.
      if (charged && err instanceof TprsCheckoutError && err.code === "cart_hold_expired") {
        await acquireHold();
        setErrorMsg(
          'Re-secured your lanes — tap "Finish reservation" to complete it (you won\'t be charged twice).',
        );
        setSubmitting(false);
        return;
      }
      const base = checkoutErrorMessage(err);
      setErrorMsg(
        charged
          ? `${base} Your card was charged — tap "Finish reservation" to complete it (you won't be charged twice).`
          : base,
      );
      setSubmitting(false);
    }
  }

  const mins = Math.floor(left / 60);
  const secs = left % 60;

  return (
    <form onSubmit={handleSubmit} className="tprs-pay-form">
      <PaymentElement options={{ layout: "tabs" }} />

      {/* Hold status — how long the lanes are held + a refresh. */}
      <div className="tprs-hold" aria-live="polite">
        {holdError ? (
          <span className="tprs-hold-warn">{holdError}</span>
        ) : !cartToken ? (
          <span>Securing your lanes…</span>
        ) : expired ? (
          <span className="tprs-hold-warn">Your hold expired.</span>
        ) : (
          <span>
            Holding your lanes — <strong>{mins}:{secs.toString().padStart(2, "0")}</strong>
          </span>
        )}
        {cartToken && (
          <button
            type="button"
            className="tprs-link-btn tprs-link-btn--sm"
            onClick={acquireHold}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      <label className="tprs-terms">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.currentTarget.checked)}
        />
        <span className="tprs-terms-text">
          <Markdown text={termsText} inline /> I agree to the terms above.
        </span>
      </label>

      {errorMsg && (
        <p className="tprs-pay-error-msg" role="alert">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        className="tprs-btn tprs-btn--solid tprs-pay-submit"
        disabled={!stripe || submitting || !termsAccepted || !cartToken || (expired && !paidPid.current)}
      >
        {submitting
          ? "Processing…"
          : paidPid.current
            ? "Finish reservation"
            : `Pay ${formatUsd(totalCents)}`}
      </button>

      <p className="tprs-pay-note">🔒 Payments are processed securely by Stripe.</p>
    </form>
  );
}
