// Step 6 — REAL payment (ADR-0025 §4 two-step checkout), deferred-PaymentElement
// pattern. The cart-hold is acquired on mount (10-min capacity reservation) and
// the card form renders immediately. The rail PaymentIntent is created only when
// the guest hits Pay — `/checkout/payment-intents` floors the hold at a 180-second
// grace window (GREATEST(existing, now+180s) since 2026-07-18 — it EXTENDS a
// nearly-out hold and never shortens a healthy one; it was a hard reset to 60s
// before, which cut a mid-hold guest to a minute right before the 3DS-length
// confirm step). So: Pay → elements.submit() → createPaymentIntent (server sizes
// the amount; ≥180s of hold guaranteed) → stripe.confirmPayment (inline for
// cards/3DS) → convert (idempotent). A visible countdown + "Refresh hold" handle
// the 10-minute budget.

import { useRef, useState } from "react";
import CheckoutForm from "./PaymentCheckoutForm";
import type { CheckoutRecovery } from "../checkoutRecovery";
import type { WizardState } from "../state";
import { Elements } from "@stripe/react-stripe-js";
import { getStripe, STRIPE_AVAILABLE, STRIPE_APPEARANCE } from "../stripe";
import CouponField from "../CouponField";
import type {
  BookingConvertedResponse,
  CartAddRequest,
  CheckoutCustomerPayload,
  CheckoutItem,
  CouponPreviewResponse,
  FormAnswerInput,
} from "../../../tprs/schemas";

export interface PaymentProps {
  draft: WizardState;
  quote: import("../../../tprs/schemas").QuoteResponse | null;
  recovery: CheckoutRecovery | null;
  onRecovery: (value: CheckoutRecovery | null) => void;
  onDiscover?: () => Promise<void>;
  onLock: (locked: boolean) => void;
  customer: CheckoutCustomerPayload;
  /** Resource-consuming lines that need a capacity hold (the lane). */
  cartHoldItems: CartAddRequest;
  /** Full priced line set (lane + add-ons) sent to payment-intents + convert. */
  checkoutItems: CheckoutItem[];
  eventDate: string; // YYYY-MM-DD
  startTime: string; // ISO-8601 with offset
  /** Product's online-sales cutoff (minutes before start); null = none. Drives
   *  the mid-checkout "window closing" countdown + the closed hard-stop — the
   *  guest can pick a slot while it's sellable and cross the boundary during
   *  checkout, and the server rejects that at payment-intents/convert. */
  salesCutoffMinutesBefore: number | null;
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
  /** Back to the time picker (detail step) — the sold-out blocker's recovery
   *  action, so "pick another time" actually lands somewhere they can. */
  onFindNewTime: () => void;
  termsText: string;
  /** Authoritative total (incl. tax) for the Pay button + deferred amount. */
  totalCents: number;
  /** Wait for the authoritative total after a code/cart change. */
  pricingPending?: boolean;
  pricingError?: string | null;
  onRetryPricing?: () => void;
  onConverted: (booking: BookingConvertedResponse) => void;
}

export default function PaymentStep(props: PaymentProps) {
  const [checkoutLocked, setCheckoutLocked] = useState(false);
  // Keep Elements mounted through price checks/captured-payment recovery, but
  // do not replace its last confirmed amount with a pretax estimate.
  const lastTotal = useRef(props.totalCents);
  if (!props.pricingPending && !props.pricingError) lastTotal.current = props.totalCents;
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
        disabled={checkoutLocked || !!props.recovery}
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
          amount: Math.max(50, lastTotal.current),
          currency: "usd",
          paymentMethodTypes: ["card"],
          appearance: STRIPE_APPEARANCE,
        }}
      >
        <CheckoutForm {...props} onLock={(locked) => { setCheckoutLocked(locked); props.onLock(locked); }} />
      </Elements>
    </div>
  );
}
