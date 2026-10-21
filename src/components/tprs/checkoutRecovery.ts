import { z } from "zod";
import { checkoutAttemptActiveResponseSchema, type ActiveCheckoutAttempt, paymentIntentCreateRequestSchema, paymentIntentCreateResponseSchema, quoteResponseSchema,
  customerProductSchema, bookableCategorySchema, availabilitySlotSchema, couponPreviewResponseSchema, formAnswerInputSchema } from "../../tprs/schemas";
import type { WizardState } from "./state";

// One tab-scoped active checkout across booking pages. Never expires an
// unresolved charge, and never logs contact data or payment recovery secrets.
export const CHECKOUT_RECOVERY_KEY = "tprs:checkout:active:v1";
export const DISCOVERED_CHECKOUT_KEY = "tprs:checkout:discovered:v1";
const activeCheckoutAttemptSchema = checkoutAttemptActiveResponseSchema.shape.attempt.unwrap();
export function loadDiscoveredCheckout(storage: Pick<Storage, "getItem">): ActiveCheckoutAttempt | null {
  const value = storage.getItem(DISCOVERED_CHECKOUT_KEY);
  return value ? activeCheckoutAttemptSchema.parse(JSON.parse(value)) : null;
}
export function saveDiscoveredCheckout(storage: Pick<Storage, "setItem" | "removeItem">, value: ActiveCheckoutAttempt | null): void {
  if (value) storage.setItem(DISCOVERED_CHECKOUT_KEY, JSON.stringify(activeCheckoutAttemptSchema.parse(value)));
  else storage.removeItem(DISCOVERED_CHECKOUT_KEY);
}
const draftSchema = z.object({
  step: z.literal("payment"), date: z.string(), partySize: z.number().nullable(), category: bookableCategorySchema.nullable(),
  product: customerProductSchema, slot: availabilitySlotSchema, laneQty: z.number().int().positive(), addOnQtys: z.record(z.number()),
  guest: z.object({ firstName: z.string(), lastName: z.string(), email: z.string(), phone: z.string(), zip: z.string() }),
  marketingOptIn: z.boolean().optional(), couponCode: z.string(), couponResult: couponPreviewResponseSchema.nullable(),
  formAnswers: z.array(formAnswerInputSchema), booking: z.null(), checkoutLocked: z.boolean(),
});
export const checkoutRecoverySchema = z.object({
  version: z.literal(1), draft: draftSchema, quote: quoteResponseSchema,
  request: paymentIntentCreateRequestSchema, cartToken: z.string().min(1),
  payment: paymentIntentCreateResponseSchema.optional(), confirmStarted: z.boolean(),
  status: z.enum(["creating", "prepared", "processing", "confirmed", "needs_review", "refund_requested", "refunded", "refund_failed", "cancelled"]),
});
export type CheckoutRecovery = Omit<z.infer<typeof checkoutRecoverySchema>, "draft"> & { draft: WizardState };
export function loadCheckoutRecovery(storage: Pick<Storage, "getItem">): CheckoutRecovery | null {
  const value = storage.getItem(CHECKOUT_RECOVERY_KEY);
  if (!value) return null;
  return checkoutRecoverySchema.parse(JSON.parse(value)) as CheckoutRecovery;
}
export function saveCheckoutRecovery(storage: Pick<Storage, "setItem" | "removeItem">, value: CheckoutRecovery | null): void {
  if (value) storage.setItem(CHECKOUT_RECOVERY_KEY, JSON.stringify(checkoutRecoverySchema.parse(value)));
  else storage.removeItem(CHECKOUT_RECOVERY_KEY);
}
export function attemptIdentity(value: CheckoutRecovery) {
  const p = value.payment;
  return p?.attemptId && p.recoveryToken ? { attemptId: p.attemptId, recoveryToken: p.recoveryToken } : null;
}
export function canReleaseCheckout(status: CheckoutRecovery["status"]): boolean {
  return status === "cancelled" || status === "refunded";
}
/** Call only after a confirmed booking, cancellation or refund. */
export function resolvedCheckoutUrl(href: string): string {
  const url = new URL(href);
  for (const key of ["payment_intent", "payment_intent_client_secret", "redirect_status"]) url.searchParams.delete(key);
  return url.href;
}
export function recoveryMessage(status: CheckoutRecovery["status"]): string {
  switch (status) {
    case "processing": return "Your payment is still processing. Check its status before starting another reservation.";
    case "needs_review": return "This payment needs our team's review. Please call (815) 782-7790 before making another payment.";
    case "refund_requested": return "A refund has been requested. We’re waiting for confirmation; please check again before starting another reservation.";
    case "refunded": return "Your refund is confirmed. You can now review your details and start a new reservation.";
    case "refund_failed": return "We couldn't complete the refund. Please call (815) 782-7790 so our team can help with this payment.";
    case "cancelled": return "This payment was cancelled. You can now edit your reservation.";
    default: return "Your payment details are saved in this tab. Check or continue this payment before editing your reservation.";
  }
}
