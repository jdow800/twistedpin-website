// VENDORED from isolated TPRS shared-schemas. See src/tprs/README.md.
import { z } from "zod";
import { formAnswerInputSchema } from "./forms";

/**
 * Checkout payload schema per slice-5a kickoff D9 + AH-2.
 *
 * **Self-service path:** the customer-frontend submits this shape to
 * `POST /api/checkout/convert`. Avery / staff_direct paths land at admin-UI
 * ADR with their own payload schemas (different actor + source enum).
 *
 * **Customer API rejection categories per ADR-0002 §8:** customer route
 * accepts only `customer_bookable_online = true` Products; rejects open-
 * price Products; rejects custom items / overrides / comps. Validation at
 * the orchestrator layer reads Catalog + applies ADR-0002 §8 customer-
 * facade discipline.
 *
 * **Tax-exempt at checkout per ADR-0005 §4 step 5 + §11:** customer-side
 * `claimsTaxExempt` is informational; never overwrites Customer.is_tax_exempt
 * directly. Sets Booking.flags `tax_exempt_claim_pending` for staff
 * verification.
 */
export const checkoutCustomerPayloadSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().max(255),
  phone: z.string().min(1).max(64),
  zip: z.string().min(1).max(32),
  /**
   * `true`/`false` = explicit checkbox interaction; absent = no interaction
   * (per ADR-0005 §4 step 4 + §5 implicit-default semantics distinction —
   * default-unchecked-without-touch is NOT the same as opt-out).
   */
  marketingOptIn: z.boolean().optional(),
  /**
   * SMS marketing consent — a SEPARATE channel decision from `marketingOptIn`
   * (email) per the ADR-0005 amendment 2026-05-17 Decision B per-channel
   * consent matrix. Same explicit-vs-absent semantics as above.
   *
   * The checkout UI currently renders ONE checkbox whose disclosure names both
   * channels, so both fields arrive with the same value — but they stay
   * separate fields on the wire because they are separate consents in the
   * evidence record, and a future UI may split them without a schema change.
   */
  smsMarketingOptIn: z.boolean().optional(),
  /**
   * The VERBATIM consent copy rendered next to the checkbox the guest ticked
   * (2026-07-27) — box label + fine print + the `*` footnote, concatenated.
   * Sent only when a marketing decision is being sent. This is the evidence
   * field: the checkout UI varies its copy (the "$10 OFF" reward card vs the
   * plain box), and only the CLIENT knows which variant actually rendered.
   * Recorded into consent_event.metadata.consent_language, mirroring what the
   * web_form/kiosk intake paths already capture. For an incentivized opt-in,
   * the two facts most likely to be contested are the exact disclosed language
   * and whether a reward was offered — this string carries both.
   */
  consentLanguage: z.string().max(2000).optional(),
  /**
   * `true` = customer claimed tax-exempt at checkout per ADR-0005 §4 step 5;
   * absent or `false` = no claim. Sets Booking.flags `tax_exempt_claim_pending`
   * when Customer.is_tax_exempt = false at conversion time.
   */
  claimsTaxExempt: z.boolean().optional(),
});
export type CheckoutCustomerPayload = z.infer<
  typeof checkoutCustomerPayloadSchema
>;

export const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  /**
   * Opaque frontend-supplied cart-line identifier (UUID generated client-
   * side by the cart UI). Used by cart-hold release-by-line operation per
   * ADR-0004 §2; carried through to Booking materialization for traceability.
   */
  cartLineRef: z.string().min(1),
});
export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

/** YYYY-MM-DD; Central Time per ADR-0002 §1 Q-E. */
const eventDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "eventDate must be YYYY-MM-DD",
});
/** ISO-8601 with timezone offset; UTC stored, Central-Time-of-day rendered presentation-side. */
const startTimeSchema = z.string().datetime({ offset: true });

/**
 * Request body for `POST /api/checkout/payment-intents` per ADR-0025 §4
 * (Slice C). Captures customer identity (find-or-create-by-email upstream of
 * the booking per AH-5) + the cart's line items so the server can recompute
 * the authoritative PaymentIntent amount (ADR-0025 §5 server-side amount
 * authority — the client total is never trusted). The cart-token is read from
 * the cookie, never the body (ADR-0025 §3 security). No `paymentType` — the
 * v1 PaymentIntent is the full cart total (PaymentRecord.amount = total).
 */
export const paymentIntentCreateRequestSchema = z.object({
  customer: checkoutCustomerPayloadSchema,
  eventDate: eventDateSchema,
  startTime: startTimeSchema,
  items: z.array(checkoutItemSchema).min(1),
  /**
   * Optional discount code (ADR-0028 §4). When present, the server recomputes
   * the authoritative PaymentIntent amount on the post-discount basis; an
   * invalid code bounces with a `coupon_rejected` 400 (no PaymentIntent
   * created). Server-authoritative — the discount recomputes at convert too;
   * the convert-time resolution is the one frozen.
   */
  couponCode: z.string().min(1).max(64).optional(),
  /**
   * Per-attempt nonce (2026-06-14). Folded into the PaymentIntent idempotency key
   * (server.ts) so a declined-card RETRY mints a FRESH PaymentIntent instead of
   * replaying the declined one — Stripe.js re-confirms a reused declined intent with
   * its already-attached payment method, ignoring the corrected card. The SPA holds
   * it stable within one attempt (dedups a double-submit) and regenerates it on each
   * decline. Absent on older clients → current single-key behavior.
   */
  attemptKey: z.string().min(1).max(64).optional(),
});
export type PaymentIntentCreateRequest = z.infer<
  typeof paymentIntentCreateRequestSchema
>;

/**
 * Response for `POST /api/checkout/payment-intents` 200. The clientSecret is
 * consumed by the Stripe `<PaymentElement>` (ADR-0012a §4.4); paymentIntentId
 * is carried to convert as the `paymentIntentId` body field.
 */
export const paymentIntentCreateResponseSchema = z.object({
  clientSecret: z.string(),
  paymentIntentId: z.string(),
});
export type PaymentIntentCreateResponse = z.infer<
  typeof paymentIntentCreateResponseSchema
>;

/**
 * Request body for `POST /api/checkout/convert` per ADR-0025 §4 (Slice C).
 *
 * **Identity capture moved UPSTREAM** to `/api/checkout/payment-intents` —
 * the convert body no longer carries `customer`; convert resolves the TPRS
 * Customer from the PaymentIntent's `tprs_customer_id` metadata (AH-5). The
 * body gains `paymentIntentId` (the sync-acceptance reference) + `acceptedTerms`
 * (required-true trust-with-audit precondition per §1 AH-8).
 */
export const checkoutPayloadSchema = z.object({
  cartToken: z.string().min(1),
  eventDate: eventDateSchema,
  startTime: startTimeSchema,
  paymentType: z.enum(["deposit", "balance", "full", "adjustment"]),
  items: z.array(checkoutItemSchema).min(1),
  /** Stripe PaymentIntent id from `/api/checkout/payment-intents` (AH-4). */
  paymentIntentId: z.string().min(1),
  /**
   * Customer accepted the SPA-rendered terms (AH-8). Required `true`; a `false`
   * (or absent) value bounces with `terms_not_accepted` 400. Trust-with-audit:
   * no backend storage of the terms text at v1 (§FA-2).
   */
  acceptedTerms: z.boolean(),
  /**
   * Optional discount code (ADR-0028 §4). Recomputed server-side at convert
   * (never trusted from the client); the convert-time resolution is frozen into
   * `quote_snapshot.discount_resolution` and the redemption is recorded in the
   * conversion tx. An invalid/exhausted code bounces with `coupon_rejected`
   * (tx rolls back, no booking). Should match the code sent to payment-intents.
   */
  couponCode: z.string().min(1).max(64).optional(),
  /**
   * ADR-0030 §5 (Slice 2) — optional answers to the booked products' attached
   * checkout forms. One entry per answered field; a `checkbox_list` repeats the
   * `formFieldId` once per checked value. Validated server-authoritatively at
   * convert (required-field presence, choice values ∈ options, checkbox_list
   * count ∈ [min, max], no unknown / unattached field ids) and persisted into
   * `booking_form_answers` in the SAME convert transaction. An invalid set
   * bounces the whole convert with `form_answer_invalid` (tx rolls back, no
   * booking). Absent/empty = no answers captured (e.g. products with no forms).
   */
  formAnswers: z.array(formAnswerInputSchema).max(200).optional(),
});
export type CheckoutPayload = z.infer<typeof checkoutPayloadSchema>;

/**
 * Response shape for `POST /api/checkout/convert` 200.
 */
export const bookingConvertedResponseSchema = z.object({
  bookingId: z.string().uuid(),
  paymentRecordId: z.string().uuid(),
  customerId: z.string().uuid(),
  invoiceNumber: z.string(),
  /**
   * Terminal rail status as convert returns (convert↔webhook race fix — Part B).
   * `'succeeded'` means the PaymentIntent was already captured and convert
   * advanced the booking inline (no wait on the webhook); `'pending'` means the
   * PaymentRecord awaits the `payment_intent.succeeded` webhook (async capture).
   */
  railStatus: z.enum(["pending", "succeeded"]),
});
export type BookingConvertedResponse = z.infer<
  typeof bookingConvertedResponseSchema
>;

/**
 * Response shape for `POST /api/checkout/convert` 4xx (sync_rejected /
 * cart-hold-expired / capacity-exhausted).
 *
 * Mirrors per ADR-0006 §6 Mode A failure-reason taxonomy distinction (rail
 * vs TPRS-side). Customer-frontend reads `error.code` for branching the
 * inline retry UX.
 */
export const pointsRewardDetailsSchema = z.object({
  reason: z.enum(['insufficient_points','phone_mismatch','reward_used','reward_unavailable','payment_reward_mismatch','reward_redemption_failed','payment_recovery_required']).optional(),
  pointBalance: z.number().int().nonnegative().optional(),
  requiredPoints: z.number().int().positive().optional(),
  refundStatus: z.enum(['needs_review','awaiting_payment','requested','succeeded','failed']).optional(),
});
export type PointsRewardDetails = z.infer<typeof pointsRewardDetailsSchema>;

export const checkoutErrorResponseSchema = z.object({
  ...pointsRewardDetailsSchema.shape,
  error: z.string(),
  code: z.enum([
    "sync_rejected_rail",
    "sync_rejected_tprs_cart_hold_expired",
    "cart_hold_expired",
    "capacity_exhausted",
    // ADR-0025 Slice C — two-step PaymentIntent flow.
    "terms_not_accepted",
    "payment_intent_invalid",
    // ADR-0028 — discount code rejected at sizing/convert.
    "coupon_rejected",
    "loyalty_reward_rejected",
    // ADR-0030 §5 — booking-question form answers failed server-side validation.
    "form_answer_invalid",
    "internal",
  ]),
  failureReason: z.string().optional(),
  /**
   * ADR-0028 §2 typed discount rejection reason, present when `code =
   * 'coupon_rejected'`. The SPA surfaces it inline on the coupon field.
   */
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
 * "what would this code save me" check the SPA calls on code-entry. Resolves
 * the discount against the cart's non-fee lines WITHOUT minting a PaymentIntent
 * or recording a redemption (no `FOR UPDATE`; `exhausted` is best-effort here —
 * the authoritative exhaustion check is the locked count at convert).
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
 * Deliberately its OWN endpoint rather than a `coupon-preview` call: that route
 * requires the code in the request body, which would mean shipping the reward's
 * code to the browser, and anything the browser holds can be pasted into the
 * manual coupon field — granting the $10 with no opt-in. Here the code stays in
 * server env and is never transmitted.
 *
 * Contact is REQUIRED (unlike coupon-preview, where it is optional). The
 * once-per-guest cap is SKIPPED by the engine when identity is absent, so an
 * identity-less answer would fail OPEN — telling an already-redeemed guest the
 * reward is available, i.e. exactly the promise-then-retract we are avoiding.
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

/**
 * Response for `POST /api/checkout/optin-reward-preview`. Intentionally the
 * narrowest useful shape — a boolean and an amount. No code, no reason, no
 * customer data. It reveals strictly less than `coupon-preview` already does
 * (which returns `already_redeemed` for the same contact), so it opens no new
 * signal; `available:false` covers "already redeemed", "not started yet",
 * "expired", "inactive" and "doesn't match this cart" indistinguishably.
 */
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
  pointBalance: z.number().int().nonnegative().optional(),
  requiredPoints: z.number().int().positive().optional(),
  /** Would-be discount in cents; present when `valid = true`. */
  discountAmountCents: z.number().int().nonnegative().optional(),
  /** Typed rejection reason; present when `valid = false`. */
  reason: z
    .enum([
      "insufficient_points", "phone_mismatch", "reward_used", "reward_unavailable", "payment_reward_mismatch", "reward_redemption_failed", "payment_recovery_required",
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
 * Request for `POST /api/checkout/quote` (2026-06-13) — the read-only display
 * quote the SPA calls to show the authoritative subtotal/tax/total before
 * payment, so the displayed number matches what the PaymentIntent will charge
 * (server-authoritative; the client total is never trusted, ADR-0025 §5). No
 * cart cookie / PaymentIntent / redemption — pure pricing read.
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
   * sizing/convert then refuse. Without it, the engine SKIPS the once-per-guest
   * cap (identity-absent = best-effort), and an already-redeemed guest who
   * ticked the plain opt-in box saw a phantom −$10 in the cart while the
   * PaymentIntent would have charged full price — display/charge divergence,
   * the exact class ADR-0025 §5 forbids (caught live by the owner on the
   * second booking attempt after the first redemption). Mirrors
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
 * NOTE: `subtotalExcludingTax` ALREADY INCLUDES these fee amounts (fees are
 * untaxed lines folded into the untaxed subtotal). To show a products-only
 * subtotal, the client subtracts the fee total; the fees are surfaced here so
 * the guest sees each one as its own line rather than an unexplained higher
 * subtotal. Empty array when no fees apply.
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
   * The TYPED coupon's resolved discount, when one is in the quote (2026-07-30).
   * Unlike `autoDiscounts`, the code IS echoed — the guest supplied it (typed
   * or via a /book/<CODE> magic link), so it reveals nothing. Lets the cart
   * render "Code X − $Y" as a line item on every step, not just at checkout
   * where CouponField previews; without it the discount silently shrinks the
   * subtotal and the guest can't see WHY the math moved. `.optional()` so an
   * older backend response still parses (deploy-order decoupling, like `fees`).
   */
  couponDiscount: z
    .object({
      code: z.string(),
      amountCents: z.number().int().nonnegative(),
      // Present only for a validated points-funded loyalty benefit.
      requiredPoints: z.number().int().positive().optional(),
    })
    .optional(),
  totalIncludingTax: z.number().int(),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
