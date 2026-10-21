// VENDORED COPY of @tprs/shared-schemas from TPRS PR #458.
// Source: packages/shared-schemas/src/cart.ts. Keep in lockstep; see ../README.md.

// Customer-flow cart-endpoint API schemas per ADR-0025 §3 (Slice B).
//
// POST   /api/cart/session     — establish cookie ownership without taking inventory
// POST   /api/cart/replace     — revisioned complete selection, atomic hold replacement
// POST   /api/cart/items       — legacy batch add + cart-token cookie + soft-hold acquire
// GET    /api/cart             — active holds + hold expiry (thin cart)
// DELETE /api/cart/items/:id   — release a line's hold (:id = cartLineRef)
//
// The backend now persists unpriced selection/revision and mutation receipts,
// as well as temporary resource holds. These endpoints do not return prices.
// Checkout review prices the complete selection; payment preparation freezes
// its money/forms and transfers exact holds to payment-owned inventory.
// Non-resource items belong to the selection but consume no resource hold.

import { z } from "zod";

/* ── POST /api/cart/items ──────────────────────────────────────────────── */

export const cartAddItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  /** Opaque SPA-supplied cart-line id (UUID); the release-by-line key per ADR-0004 §2. */
  cartLineRef: z.string().min(1),
  /**
   * Event start, ISO-8601 with offset. Required for resource-consuming
   * Products (drives the soft-hold lock window); ignored for non-resource items.
   */
  startTime: z.string().datetime({ offset: true }).optional(),
});
export type CartAddItem = z.infer<typeof cartAddItemSchema>;

export const cartAddRequestSchema = z.array(cartAddItemSchema).min(1);
export type CartAddRequest = z.infer<typeof cartAddRequestSchema>;

/** Deliberate complete selection change. Retry the same key/body after a lost response. */
export const cartReplaceRequestSchema = z.object({
  items: z.array(cartAddItemSchema).max(100),
  expectedRevision: z.number().int().nonnegative(),
  mutationKey: z.string().uuid(),
}).strict();
export type CartReplaceRequest = z.infer<typeof cartReplaceRequestSchema>;

/* ── Cart state (POST / GET / DELETE response) ─────────────────────────── */

export const cartHoldViewSchema = z.object({
  id: z.string().uuid(),
  cartLineRef: z.string(),
  poolId: z.string().uuid(),
  count: z.number().int(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type CartHoldView = z.infer<typeof cartHoldViewSchema>;

export const cartStateSchema = z.object({
  cartToken: z.string(),
  holds: z.array(cartHoldViewSchema),
  /** Earliest hold expiry (Central-rendered countdown source); null when empty. */
  holdExpiresAt: z.string().datetime().nullable(),
  revision: z.number().int().nonnegative().optional(),
  items: z.array(cartAddItemSchema).optional(),
  /** Replay returns CURRENT state; appliedRevision identifies the original accepted change. */
  mutation: z.object({ key: z.string().uuid(), appliedRevision: z.number().int().positive(), replayed: z.boolean() }).optional(),
});
export type CartState = z.infer<typeof cartStateSchema>;

/* ── DELETE param + error shapes ───────────────────────────────────────── */

export const cartLineRefParamSchema = z.object({
  /** The cart line's `cartLineRef`. */
  id: z.string().min(1),
});

export const cartErrorResponseSchema = z.object({
  error: z.string(),
  code: z.enum(["capacity_exhausted", "invalid_item", "missing_start_time", "invalid_window", "event_date_mismatch", "holiday_removed", "date_removed", "unscheduled_start", "advance_booking_window_exceeded", "sales_not_started", "sales_cutoff", "venue_closed", "outside_venue_hours", "cart_revision_conflict", "cart_mutation_conflict", "cart_line_conflict", "cart_hold_expired", "payment_recovery_required", "cart_session_required"]),
  currentRevision: z.number().int().nonnegative().optional(),
  productId: z.string().nullable().optional(),
  date: z.string().optional(),
  failureReason: z.string().optional(),
});
export type CartErrorResponse = z.infer<typeof cartErrorResponseSchema>;
