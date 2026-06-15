// Stripe browser singleton + brand-matched Appearance for the /tprs checkout.
// loadStripe must be called exactly once (each call re-injects the Stripe.js
// script), so the promise is memoized at module scope. The publishable TEST key
// is a PUBLIC_ env (client-safe) inlined by Vite at build.

import { loadStripe, type Stripe } from "@stripe/stripe-js";

const KEY = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY as string | undefined;

/** True when a publishable key is configured (else the payment step shows a config error). */
export const STRIPE_AVAILABLE = typeof KEY === "string" && KEY.length > 0;

let promise: Promise<Stripe | null> | null = null;

/** Memoized Stripe.js loader, or null when no key is configured. */
export function getStripe(): Promise<Stripe | null> | null {
  if (!STRIPE_AVAILABLE) return null;
  if (!promise) promise = loadStripe(KEY as string);
  return promise;
}

// PaymentElement Appearance themed from the booking --tw-* tokens: dark "night"
// base, Glow primary, warm-white text, 7px radius (the brand button radius).
export const STRIPE_APPEARANCE = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#4eecc4",
    colorBackground: "#1a1430",
    colorText: "#f4efe3",
    colorTextSecondary: "#b7adc6",
    colorDanger: "#ff8a8a",
    fontFamily: "Montserrat, system-ui, sans-serif",
    // 16px so iOS Safari doesn't zoom the viewport when the card field is
    // focused (same rule as our own inputs in tprs.css). Stripe sizes the
    // PaymentElement inputs from fontSizeBase.
    fontSizeBase: "16px",
    borderRadius: "7px",
    spacingUnit: "4px",
  },
};
