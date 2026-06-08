// VENDORED COPY of @tprs/shared-schemas — source of truth is
// dev/tprs/packages/shared-schemas/src/cart.ts. Keep in lockstep; do not
// hand-edit shapes. See src/tprs/README.md for the sync rule.
//
// Customer-flow cart-endpoint API schemas per ADR-0025 §3 (Slice B). NOT
// exercised by the Slice-1 lean read-only cut (cart-commit is gated on the
// backend cart-token-cookie amendment) — vendored now so the Slice-2 cart
// wiring has the contract on hand.
//
// POST   /api/cart/items       — batch add + cart-token cookie + soft-hold acquire
// GET    /api/cart             — active holds + hold expiry (thin cart)
// DELETE /api/cart/items/:id   — release a line's hold (:id = cartLineRef)

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
});
export type CartState = z.infer<typeof cartStateSchema>;

/* ── DELETE param + error shapes ───────────────────────────────────────── */

export const cartLineRefParamSchema = z.object({
  /** The cart line's `cartLineRef`. */
  id: z.string().min(1),
});

export const cartErrorResponseSchema = z.object({
  error: z.string(),
  code: z.enum(["capacity_exhausted", "invalid_item", "missing_start_time"]),
  failureReason: z.string().optional(),
});
export type CartErrorResponse = z.infer<typeof cartErrorResponseSchema>;
