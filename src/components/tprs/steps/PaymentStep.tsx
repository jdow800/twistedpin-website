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
  getCart,
  removeCartLine,
  createPaymentIntent,
  convertCheckout,
  TprsCheckoutError,
} from "../../../tprs/client";
import { formatUsd } from "../format";
import Markdown from "../Markdown";
import CouponField from "../CouponField";
import type {
  BookingConvertedResponse,
  CartAddRequest,
  CheckoutCustomerPayload,
  CheckoutItem,
  CouponPreviewResponse,
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
  /** "Have a code?" lives HERE at checkout (CouponField) — code/result state
   *  stays in the wizard so the quote + PI pick it up. */
  couponResult: CouponPreviewResponse | null;
  onCouponCode: (code: string) => void;
  onCouponResult: (result: CouponPreviewResponse | null) => void;
  formAnswers: FormAnswerInput[];
  /** True when a per-lane (per_unit_select) answer count no longer matches the
   *  chosen lanes — the guest changed lane count after picking. Blocks Pay so a
   *  guaranteed convert 400 (form_answer_invalid) can't charge-then-fail. Only
   *  ever set for products with a per-lane field (NYE); a no-op otherwise. */
  formStale?: boolean;
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
      case "amount_mismatch":
        return "The price changed while you were checking out, so we couldn't finish this booking.";
      case "form_answer_invalid":
        return "Your booking details changed and need another look before we can finish.";
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

      {/* "Have a code?" — at checkout, where guests hunt for it. The quote
          (sticky cart) + the PI created at Pay both read the applied code. */}
      <CouponField
        productId={props.cartHoldItems[0]?.productId ?? ""}
        startTime={props.startTime}
        laneQty={
          props.checkoutItems.find((i) => i.cartLineRef === "lane")?.quantity ?? 1
        }
        email={props.customer.email}
        phone={props.customer.phone}
        couponCode={props.couponCode ?? ""}
        couponResult={props.couponResult}
        onCouponCode={props.onCouponCode}
        onCouponResult={props.onCouponResult}
      />

      {/* Deferred mode: amount is provisional (server re-sizes at PI creation) —
          renders the card form WITHOUT a PaymentIntent so the 60s grace doesn't
          start until Pay. METHOD FILTERING: `paymentMethodTypes` MUST match the
          backend PI's `payment_method_types` (both manual now: ['card']).
          Stripe forbids confirming when the Elements method config differs from
          the PI's — so if the backend ever changes its `payment_method_types`,
          change this list to match, or confirm will fail with "collected using
          payment_method_types … cannot be confirmed". Card-only: no ACH / Cash App
          / Klarna / Affirm (redirect/async — break the inline convert) and no Link
          (decluttered per the 2026-06-14 payment-methods decision). Apple Pay /
          Google Pay still ride on `card`. The Stripe Dashboard payment-method
          toggles are the authoritative surface-control; keep them in sync (Klarna /
          ACH / Cash App / Affirm / Link OFF, Card + Apple Pay + Google Pay ON). */}
      <Elements
        stripe={getStripe()}
        options={{
          mode: "payment",
          amount: Math.max(50, props.totalCents),
          currency: "usd",
          paymentMethodTypes: ["card"],
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
  formStale,
  termsText,
  totalCents,
  onConverted,
}: Props) {
  const stripe = useStripe();
  const elements = useElements();

  // Keep the deferred Elements amount in step with the live total — applying a
  // code at THIS step changes the quote after Elements mounted (the PI charges
  // the server-computed amount regardless; this keeps wallet sheets honest).
  useEffect(() => {
    elements?.update({ amount: Math.max(50, totalCents) });
    // A changed total (e.g. a coupon applied at this step) invalidates any
    // PaymentIntent we already created — drop it so the next Pay sizes a fresh
    // one rather than re-confirming the old amount.
    if (piAmountRef.current !== null && piAmountRef.current !== totalCents) {
      clientSecretRef.current = null;
      piIdRef.current = null;
      piAmountRef.current = null;
    }
  }, [elements, totalCents]);

  // The 10-min cart-hold (capacity reservation) acquired on mount; refreshable.
  const [cartToken, setCartToken] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  // True when the hold failed because the slot is full (capacity_exhausted) —
  // the stepper cap makes this rare, but a slot can fill in the gap between
  // selection and payment. Drives a prominent blocker that replaces the card
  // form (2026-06-27) instead of a tiny error line under a fillable form.
  const [holdSoldOut, setHoldSoldOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Terminal dead-end (amount_mismatch): the captured charge can't be reconciled
  // and a convert retry would fail identically, so stop offering "Finish
  // reservation" and block further submits.
  const [blocked, setBlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Set once the charge captures — a retry then re-runs only the idempotent
  // convert (never a second confirmPayment / second charge).
  const paidPid = useRef<string | null>(null);
  // The PaymentIntent is created once per attempt and dropped on a decline so the
  // next Pay mints a genuinely FRESH intent (see attemptKeyRef). A coupon applied
  // here changes the amount → the amount effect above drops the stored intent so the
  // next Pay sizes a fresh one too.
  const clientSecretRef = useRef<string | null>(null);
  const piIdRef = useRef<string | null>(null);
  const piAmountRef = useRef<number | null>(null);
  // Per-attempt nonce the backend folds into the PaymentIntent idempotency key.
  // Stable within one attempt (so a double-submit dedups to one PI); REGENERATED on
  // each decline so the retry gets a brand-new PaymentIntent. This is the only lever
  // that yields a fresh PI: a reused declined intent re-confirms with its already-
  // attached (declined) payment method instead of building one from the corrected
  // card, and the cart token is idempotent (same items → same token) so re-carting
  // can't change the key on its own.
  const attemptKeyRef = useRef(crypto.randomUUID());

  const [left, setLeft] = useState(0);
  useEffect(() => {
    setLeft(secondsLeft(holdExpiresAt));
    if (!holdExpiresAt) return;
    const t = setInterval(() => setLeft(secondsLeft(holdExpiresAt)), 1000);
    return () => clearInterval(t);
  }, [holdExpiresAt]);
  const expired = holdExpiresAt !== null && left <= 0;

  // Create exactly ONE fresh 10-min hold. Release this booking's line(s) first:
  // the backend inserts a NEW hold per add even for the same cartLineRef (verified
  // live), and `holdExpiresAt` is the EARLIEST across holds — so re-adding without
  // releasing stacked duplicates and made the countdown jump to the oldest hold's
  // seconds-left on refresh. Release clears all holds for a ref (verified), so
  // this leaves a single clean hold and makes "Refresh hold" actually extend.
  async function createFreshHold() {
    await Promise.all(
      cartHoldItems.map((it) => removeCartLine(it.cartLineRef).catch(() => {})),
    );
    const cart = await addCartItems(cartHoldItems);
    setCartToken(cart.cartToken);
    setHoldExpiresAt(cart.holdExpiresAt);
  }

  // Explicit "Refresh hold" button — always mint a clean fresh hold.
  async function acquireHold() {
    setRefreshing(true);
    setHoldError(null);
    setHoldSoldOut(false);
    try {
      await createFreshHold();
    } catch (err) {
      setHoldError(checkoutErrorMessage(err));
      setHoldSoldOut(
        err instanceof TprsCheckoutError && err.code === "capacity_exhausted",
      );
    } finally {
      setRefreshing(false);
    }
  }

  // On mount: ADOPT a live hold from a refresh / re-entry (GET the cart and use
  // its real remaining time) instead of stacking another hold; only create one
  // when there isn't a valid hold yet. This is what fixes the timer jumping to a
  // stale value on refresh — the guest now sees the true time left, and the hold
  // doesn't multiply. (StrictMode-guarded.)
  const acquired = useRef(false);
  useEffect(() => {
    if (acquired.current) return;
    acquired.current = true;
    void (async () => {
      setRefreshing(true);
      setHoldError(null);
      setHoldSoldOut(false);
      try {
        const cart = await getCart();
        if (
          cart.cartToken &&
          cart.holdExpiresAt &&
          Date.parse(cart.holdExpiresAt) > Date.now()
        ) {
          setCartToken(cart.cartToken);
          setHoldExpiresAt(cart.holdExpiresAt);
        } else {
          await createFreshHold();
        }
      } catch (err) {
        setHoldError(checkoutErrorMessage(err));
        setHoldSoldOut(
          err instanceof TprsCheckoutError && err.code === "capacity_exhausted",
        );
      } finally {
        setRefreshing(false);
      }
    })();
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
    // Per-lane picks (NYE pizza/soda) no longer match the lane count — a charge
    // here would convert-400 (form_answer_invalid) and strand the payment. Block
    // BEFORE confirmPayment; the guest taps Back to re-pick for the new lanes.
    if (formStale) {
      setErrorMsg(
        "Your lane count changed — tap Back and re-pick the pizza & soda for each lane, then return here to pay.",
      );
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
        // Create the PI for this attempt (server sizes amount; 60s grace starts
        // here). Reused while clientSecretRef is set; a DECLINE clears it below so
        // the next Pay mints a FRESH intent — Stripe.js won't cleanly re-confirm a
        // declined deferred PaymentIntent in place (verified on live), but a fresh
        // one works (it's what a page refresh did).
        let clientSecret = clientSecretRef.current;
        if (!clientSecret) {
          const pi = await createPaymentIntent({
            customer,
            eventDate,
            startTime,
            items: checkoutItems,
            attemptKey: attemptKeyRef.current,
            ...(couponCode && { couponCode }),
          });
          clientSecret = pi.clientSecret;
          clientSecretRef.current = pi.clientSecret;
          piIdRef.current = pi.paymentIntentId;
          piAmountRef.current = totalCents;
        }
        // Confirm (inline for cards + 3DS).
        const { error } = await stripe.confirmPayment({
          elements,
          clientSecret,
          confirmParams: { return_url: window.location.href },
          redirect: "if_required",
        });
        if (error) {
          // Declined. Drop the dead intent + bump the per-attempt nonce so the NEXT
          // Pay mints a genuinely FRESH PaymentIntent (the backend folds attemptKey
          // into the idempotency key) — a reused declined intent re-confirms with its
          // already-attached payment method, ignoring the corrected card. Also
          // re-secure the hold (createPaymentIntent dropped it to a 60s grace) so the
          // retry has time. The guest just fixes their card and taps Pay once.
          clientSecretRef.current = null;
          piIdRef.current = null;
          piAmountRef.current = null;
          attemptKeyRef.current = crypto.randomUUID();
          await acquireHold();
          setErrorMsg(
            (error.message ?? "Your card couldn't be charged.") +
              " Fix your card details and tap Pay to try again.",
          );
          setSubmitting(false);
          return;
        }
        paidPid.current = piIdRef.current; // captured — convert-only from here
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
      // Amount mismatch (a mid-checkout price change, or a tampered cart): convert
      // rolled back and the server auto-refunds the captured charge. A retry would
      // hit the same mismatch, so this is TERMINAL — block further submits; never
      // offer "Finish reservation" (it can't succeed).
      if (err instanceof TprsCheckoutError && err.code === "amount_mismatch") {
        setBlocked(true);
        setErrorMsg(
          charged
            ? "The price changed while you were checking out, so we couldn't finish this booking. Your card was charged and we've issued a refund — please start a new booking at the current price, or call (815) 782-7790."
            : "The price changed while you were checking out. Please start a new booking at the current price.",
        );
        setSubmitting(false);
        return;
      }
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
      // Booking details (e.g. per-lane picks) failed convert validation. The
      // server rolls back AND auto-refunds the captured charge (mirrors the
      // amount_mismatch path), so a retry would 400 identically — TERMINAL.
      // Block further submits; the guest goes Back, fixes the picks, starts over
      // (remounting this step clears `blocked`). The pre-charge formStale guard
      // above normally prevents ever reaching here for the lane-change case;
      // this covers the residual causes (stale tab, server-side form edit).
      if (err instanceof TprsCheckoutError && err.code === "form_answer_invalid") {
        setBlocked(true);
        setErrorMsg(
          charged
            ? "Your booking details changed, so we couldn't finish — your card was charged and we've issued a refund. Please go back, review your per-lane choices, and start a new booking, or call (815) 782-7790."
            : "Your booking details need another look — please go back, review your per-lane choices, and try again.",
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

  // Sold out (the slot filled between selection and payment): replace the whole
  // card form with a prominent blocker so the guest never types card details
  // into a form that can't pay — and knows exactly why. The stepper cap makes
  // this rare; this is the race backstop. Recovery is the wizard's Back button.
  if (holdSoldOut) {
    return (
      <div className="tprs-pay-blocker" role="alert">
        <span className="tprs-pay-blocker__title">That time just filled up</span>
        <p className="tprs-pay-blocker__body">
          Someone grabbed the last open lane while you were checking out, so we
          can’t reserve this time. Tap <strong>Back</strong> to pick another
          time — your card hasn’t been charged.
        </p>
        <button
          type="button"
          className="tprs-link-btn"
          onClick={acquireHold}
          disabled={refreshing}
        >
          {refreshing ? "Checking…" : "Try this time again"}
        </button>
      </div>
    );
  }

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

      {/* Proactive notice (before any Pay click) when the lane count changed and
          the per-lane picks are now out of sync — points the guest to Back. */}
      {formStale && !errorMsg && (
        <p className="tprs-pay-error-msg" role="alert">
          Your lane count changed since you picked the pizza &amp; soda. Tap Back
          to choose for each lane, then return here to pay.
        </p>
      )}

      {errorMsg && (
        <p className="tprs-pay-error-msg" role="alert">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        className="tprs-btn tprs-btn--solid tprs-pay-submit"
        disabled={blocked || formStale || !stripe || submitting || !termsAccepted || !cartToken || (expired && !paidPid.current)}
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
