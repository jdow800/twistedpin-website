// VENDORED COPY of @tprs/shared-schemas — source of truth is
// dev/tprs/packages/shared-schemas/src/checkout.ts. Keep in lockstep; do not
// hand-edit shapes. See src/tprs/README.md for the sync rule.
//
// Checkout + coupon-preview schemas per ADR-0025 §4 + ADR-0028 §4 + ADR-0030
// §5. The Slice-1 lean cut uses only `checkoutItemSchema`,
// `couponPreviewRequestSchema`, and `couponPreviewResponseSchema`
// (coupon-preview is a read-only POST needing no cart cookie). The payment-
// intents / convert shapes are vendored for the Slice-2 wiring.

import { z } from "zod";
import { formAnswerInputSchema } from "./forms";

/**
 * Checkout customer payload (self-service path). name + email + phone all
 * required per ADR-0029; zip required by the stored shape.
 */
export const checkoutCustomerPayloadSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().min(1).max(64),
  zip: z.string().min(1).max(32),
  marketingOptIn: z.boolean().optional(),
  /**
   * VERBATIM consent copy rendered next to the checkbox (2026-07-27) — sent
   * only when a marketing decision rides along. Evidence field: the UI copy
   * varies (the "$10 OFF" reward card vs the plain box) and only the client
   * knows which variant rendered. Lands in consent_event.metadata.
   */
  consentLanguage: z.string().max(2000).optional(),
  /**
   * SMS marketing consent — a SEPARATE channel decision from `marketingOptIn`
   * (email) per the ADR-0005 amendment 2026-05-17 Decision B per-channel
   * consent matrix. Absent = the guest never touched the checkbox, which is
   * NOT the same as an opt-out (the backend records an explicit `false` as a
   * decision in the consent-evidence record).
   *
   * The guest step's checkbox currently discloses TEXTS ONLY, so it sends this
   * field alone and leaves `marketingOptIn` (email) absent. The two stay
   * separate fields on the wire precisely so the UI can disclose — and record
   * — one channel without implying the other.
   */
  smsMarketingOptIn: z.boolean().optional(),
  claimsTaxExempt: z.boolean().optional(),
});
export type CheckoutCustomerPayload = z.infer<
  typeof checkoutCustomerPayloadSchema
>;

export const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  /** Opaque frontend-supplied cart-line identifier (UUID). */
  cartLineRef: z.string().min(1),
});
export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

/** YYYY-MM-DD; Central Time per ADR-0002 §1 Q-E. */
const eventDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "eventDate must be YYYY-MM-DD",
});
/** ISO-8601 with timezone offset. */
const startTimeSchema = z.string().datetime({ offset: true });

/**
 * Request body for `POST /api/checkout/payment-intents` per ADR-0025 §4.
 */
export const paymentIntentCreateRequestSchema = z.object({
  customer: checkoutCustomerPayloadSchema,
  eventDate: eventDateSchema,
  startTime: startTimeSchema,
  items: z.array(checkoutItemSchema).min(1),
  couponCode: z.string().min(1).max(64).optional(),
  // Per-attempt nonce folded into the PI idempotency key so a declined-card retry
  // gets a FRESH PaymentIntent (lockstep with @tprs/shared-schemas).
  attemptKey: z.string().min(1).max(64).optional(),
});
export type PaymentIntentCreateRequest = z.infer<
  typeof paymentIntentCreateRequestSchema
>;

export const paymentIntentCreateResponseSchema = z.object({
  clientSecret: z.string(),
  paymentIntentId: z.string(),
});
export type PaymentIntentCreateResponse = z.infer<
  typeof paymentIntentCreateResponseSchema
>;

/**
 * Request body for `POST /api/checkout/convert` per ADR-0025 §4.
 */
export const checkoutPayloadSchema = z.object({
  cartToken: z.string().min(1),
  eventDate: eventDateSchema,
  startTime: startTimeSchema,
  paymentType: z.enum(["deposit", "balance", "full", "adjustment"]),
  items: z.array(checkoutItemSchema).min(1),
  paymentIntentId: z.string().min(1),
  acceptedTerms: z.boolean(),
  couponCode: z.string().min(1).max(64).optional(),
  formAnswers: z.array(formAnswerInputSchema).max(200).optional(),
});
export type CheckoutPayload = z.infer<typeof checkoutPayloadSchema>;

export const bookingConvertedResponseSchema = z.object({
  bookingId: z.string().uuid(),
  paymentRecordId: z.string().uuid(),
  customerId: z.string().uuid(),
  invoiceNumber: z.string(),
  railStatus: z.enum(["pending", "succeeded"]),
});
export type BookingConvertedResponse = z.infer<
  typeof bookingConvertedResponseSchema
>;

export const checkoutErrorResponseSchema = z.object({
  error: z.string(),
  code: z.enum([
    "sync_rejected_rail",
    "sync_rejected_tprs_cart_hold_expired",
    "cart_hold_expired",
    "capacity_exhausted",
    "terms_not_accepted",
    "payment_intent_invalid",
    "coupon_rejected",
    "form_answer_invalid",
    "internal",
  ]),
  failureReason: z.string().optional(),
  couponReason: z
    .enum([
      "not_found",
      "inactive",
      "not_yet_active",
      "expired",
      "exhausted",
      "already_redeemed",
      "no_matching_products",
    ])
    .optional(),
});
export type CheckoutErrorResponse = z.infer<typeof checkoutErrorResponseSchema>;

/**
 * Request for `POST /api/checkout/coupon-preview` (ADR-0028 §4) — the read-only
 * "what would this code save me" check the SPA calls on code-entry. No
 * PaymentIntent minted, no cart cookie required, so it's reachable in the
 * Slice-1 lean cut.
 */
export const couponPreviewRequestSchema = z.object({
  startTime: startTimeSchema,
  items: z.array(checkoutItemSchema).min(1),
  couponCode: z.string().min(1).max(64),
  /**
   * Optional guest contact (once-per-guest, 2026-06-07). When supplied, a
   * "limit to one per guest" code the contact has already redeemed previews as
   * `already_redeemed` instead of valid — so the guest sees it on code-entry
   * rather than only at payment. Best-effort (no lock); convert is authoritative.
   */
  email: z.string().max(255).optional(),
  phone: z.string().max(64).optional(),
});
export type CouponPreviewRequest = z.infer<typeof couponPreviewRequestSchema>;

/**
 * Request for `POST /api/checkout/optin-reward-preview` (2026-07-26) — "is the
 * SMS-marketing opt-in reward still available to this guest, for this cart?"
 *
 * Its own endpoint rather than a coupon-preview call, because that route takes
 * the code in the body — which would put the reward's code in the browser,
 * where it can be pasted into the manual coupon field and grant the $10 with no
 * opt-in. Here the code never leaves the server.
 *
 * Contact is REQUIRED (coupon-preview's is optional): the engine skips the
 * once-per-guest cap when identity is absent, so an identity-less answer would
 * fail OPEN and promise the reward to someone who already redeemed it.
 */
export const optInRewardPreviewRequestSchema = z.object({
  startTime: startTimeSchema,
  items: z.array(checkoutItemSchema).min(1),
  email: z.string().max(255),
  phone: z.string().max(64),
});
export type OptInRewardPreviewRequest = z.infer<
  typeof optInRewardPreviewRequestSchema
>;

/** Response for `POST /api/checkout/optin-reward-preview`. Boolean + amount only. */
export const optInRewardPreviewResponseSchema = z.object({
  available: z.boolean(),
  amountCents: z.number().int().nonnegative().default(0),
});
export type OptInRewardPreviewResponse = z.infer<
  typeof optInRewardPreviewResponseSchema
>;

/** Response for `POST /api/checkout/coupon-preview` (ADR-0028 §4). */
export const couponPreviewResponseSchema = z.object({
  valid: z.boolean(),
  /** Would-be discount in cents; present when `valid = true`. */
  discountAmountCents: z.number().int().nonnegative().optional(),
  /** Typed rejection reason; present when `valid = false`. */
  reason: z
    .enum([
      "not_found",
      "inactive",
      "not_yet_active",
      "expired",
      "exhausted",
      "already_redeemed",
      "no_matching_products",
    ])
    .optional(),
});
export type CouponPreviewResponse = z.infer<typeof couponPreviewResponseSchema>;

/**
 * Request for `POST /api/checkout/quote` — the server-authoritative tax preview
 * the cart/summary calls whenever its contents / start time / coupon / tax-
 * exempt flag change. Read-only (no PI, no redemption). Server is authoritative
 * on tax (per-product tax categories + package carve-out the client can't see),
 * so the SPA NEVER computes tax — it displays `totalIncludingTax` verbatim.
 */
export const quoteRequestSchema = z.object({
  items: z.array(checkoutItemSchema).min(1),
  startTime: startTimeSchema,
  couponCode: z.string().min(1).max(64).optional(),
  claimsTaxExempt: z.boolean().optional(),
  /**
   * Guest has ticked the SMS-marketing opt-in (2026-07-26). DISPLAY ONLY — this
   * is the client's claim and the quote is a read, so trusting it here is safe.
   * The actual charge re-derives eligibility from the PERSISTED
   * `customers.sms_marketing_opt_in` at /payment-intents and again at convert,
   * so a forged flag moves the previewed number and nothing else.
   */
  smsMarketingOptIn: z.boolean().optional(),
  /**
   * Guest contact (2026-07-27) — lets the quote run the SAME per-guest checks
   * the charge will run, so the preview can never promise a discount that
   * sizing/convert then refuse (the already-redeemed phantom −$10). Mirrors
   * couponPreviewRequestSchema's optional contact.
   */
  email: z.string().max(255).optional(),
  phone: z.string().max(64).optional(),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

/** Per-tax-category breakdown (integer cents). */
export const quoteTaxBreakdownSchema = z.object({
  shoesRentalSubtotal: z.number().int(),
  shoesRentalTax: z.number().int(),
  foodBeverageSubtotal: z.number().int(),
  foodBeverageTax: z.number().int(),
  untaxedSubtotal: z.number().int(),
  totalTax: z.number().int(),
});
export type QuoteTaxBreakdown = z.infer<typeof quoteTaxBreakdownSchema>;

/**
 * Customer-visible fee line (e.g. the online booking fee). Integer cents.
 * NOTE: `subtotalExcludingTax` ALREADY INCLUDES these fee amounts (untaxed
 * lines folded into the untaxed subtotal). To show a products-only subtotal,
 * subtract the fee total; the fees are surfaced here so the guest sees each one
 * as its own line rather than an unexplained higher subtotal. Empty when none.
 */
export const quoteFeeSchema = z.object({
  name: z.string(),
  amountCents: z.number().int(),
});
export type QuoteFee = z.infer<typeof quoteFeeSchema>;

/** Response for `POST /api/checkout/quote` (all amounts integer cents). */
export const quoteResponseSchema = z.object({
  subtotalExcludingTax: z.number().int(),
  taxBreakdown: quoteTaxBreakdownSchema,
  /**
   * Customer-visible fees folded into `subtotalExcludingTax` (see quoteFeeSchema).
   * `.default([])` so an older backend response (pre-fee field) still parses on
   * the client — decouples backend/frontend deploy order.
   */
  fees: z.array(quoteFeeSchema).default([]),
  /**
   * Server-applied discounts the guest did NOT type — today just the SMS opt-in
   * reward. Label + amount only: the CODE is deliberately never sent to the
   * browser, because anything the client can see it can also paste into the
   * manual coupon field, which would grant the reward with no opt-in.
   * `.default([])` mirrors `fees` so an older backend response still parses.
   */
  autoDiscounts: z.array(quoteFeeSchema).default([]),
  /**
   * The TYPED coupon's resolved discount, when one is in the quote (2026-07-30,
   * tprs PR #55). Unlike `autoDiscounts`, the code IS echoed — the guest
   * supplied it (typed or via a /book/<CODE> magic link). Lets the cart render
   * "Code X − $Y" on every step instead of silently netting the subtotal.
   * `.optional()` so an older backend response still parses.
   */
  couponDiscount: z
    .object({
      code: z.string(),
      amountCents: z.number().int().nonnegative(),
    })
    .optional(),
  totalIncludingTax: z.number().int(),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
