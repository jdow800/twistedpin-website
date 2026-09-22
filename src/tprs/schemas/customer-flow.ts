// VENDORED COPY of @tprs/shared-schemas — source of truth is
// dev/tprs/packages/shared-schemas/src/customer-flow.ts. Keep in lockstep; do
// not hand-edit shapes. See src/tprs/README.md for the sync rule.
//
// Customer-flow read-endpoint API schemas per ADR-0025 §2 (Slice A).
//
// GET /api/products?codes=1,2,3        — curated per-URL Product set
// GET /api/availability?product_id=&date=  — per-slot pricing + boolean availability
//
// Field casing is camelCase to match the existing /api response convention
// (see users.ts); the ADR-0025 prose used snake_case illustratively. These zod
// schemas are the single source of truth consumed by the customer-frontend SPA
// via z.infer per ADR-0012a §4.6 SD6.

import { z } from "zod";

/* ── GET /api/products ─────────────────────────────────────────────────── */

export const productsQuerySchema = z.object({
  /** Comma-separated integer Product codes the SPA pageConfig curates (AH-1). */
  codes: z.string().min(1),
});
export type ProductsQuery = z.infer<typeof productsQuerySchema>;

export const customerAddOnProductSchema = z.object({
  id: z.string().uuid(),
  code: z.number().int(),
  name: z.string(),
  /** customer_facing_short_description (may be empty string). Mirrors the product-level field. */
  shortDescription: z.string().default(""),
  defaultPriceCents: z.number().int(),
  minQuantity: z.number().int(),
  maxQuantity: z.number().int().nullable(),
  isRequired: z.boolean(),
  /**
   * ADR-0029 §5 — add-on card thumbnail; null when unset (SPA falls back).
   * `.default(null)` keeps older producers/responses valid while the field
   * rolls out (mirrors the product-level `thumbnailUrl`).
   */
  thumbnailUrl: z.string().nullable().default(null),
});
export type CustomerAddOnProduct = z.infer<typeof customerAddOnProductSchema>;

export const productDurationOverrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().positive(),
});
export type ProductDurationOverride = z.infer<typeof productDurationOverrideSchema>;

export const customerProductSchema = z.object({
  id: z.string().uuid(),
  code: z.number().int(),
  /** customer_facing_name, falling back to the internal name when unset. */
  name: z.string(),
  /**
   * customer_facing_short_description — one-liner for the grid card (may be
   * empty string). `.default("")` keeps older producers/consumers compatible
   * while the field rolls out. Pairs with `description` (the long copy).
   */
  shortDescription: z.string().default(""),
  /** customer_facing_description — long copy for product detail / checkout (may be empty string). */
  description: z.string(),
  defaultPriceCents: z.number().int(),
  durationMinutes: z.number().int().nullable(),
  /** Dated lengths; match BOTH venue-local date and start, else use the default. */
  durationOverrides: z.array(productDurationOverrideSchema).optional(),
  /**
   * Per-booking purchase bounds (ADR-0001 §3.8) so the SPA can cap/seed the
   * quantity stepper instead of letting it run free — e.g. a party package with
   * `maxQuantityPerBooking=1` can't be added twice (you book ONE party, then add
   * guests via the add-on). Null = unbounded on that side. The server enforces
   * these at checkout regardless (`validateQuantityPerBooking`); exposing them
   * lets the UI prevent the rejection up front.
   */
  minQuantityPerBooking: z.number().int().nullable(),
  maxQuantityPerBooking: z.number().int().nullable(),
  /**
   * `sales_cutoff_minutes_before` — online sales close this many minutes before
   * the slot start; null = sellable up to start. Exposed (2026-07-15, post-
   * stranded-charge) so the SPA can warn mid-checkout when the window is about
   * to close and hard-stop Pay once it has — the server enforces the cutoff at
   * payment-intents + convert regardless. `.default(null)` keeps older
   * producers/responses valid while the field rolls out (mirrors thumbnailUrl).
   */
  salesCutoffMinutesBefore: z.number().int().nullable().default(null),
  /** ADR-0029 §5 — grid card thumbnail; null when unset (SPA falls back). */
  thumbnailUrl: z.string().nullable(),
  /** ADR-0029 §5 — product-detail hero banner; null when unset. */
  heroImageUrl: z.string().nullable(),
  addOnProducts: z.array(customerAddOnProductSchema),
});
export type CustomerProduct = z.infer<typeof customerProductSchema>;

export const productsResponseSchema = z.object({
  products: z.array(customerProductSchema),
});
export type ProductsResponse = z.infer<typeof productsResponseSchema>;

/* ── GET /api/products/bookable ─────────────────────────────────────────── */

/**
 * A grid section per ADR-0029 §5 — a `booking_categories` row + its bookable
 * products. `slug` is null for the trailing "uncategorized" bucket (products
 * with no `booking_category_id`).
 */
export const bookableCategorySchema = z.object({
  slug: z.string().nullable(),
  label: z.string(),
  subtitle: z.string(),
  products: z.array(customerProductSchema).min(1),
});
export type BookableCategory = z.infer<typeof bookableCategorySchema>;

/** Response for `GET /api/products/bookable` — all bookable products, grouped. */
export const bookableProductsResponseSchema = z.object({
  categories: z.array(bookableCategorySchema),
});
export type BookableProductsResponse = z.infer<
  typeof bookableProductsResponseSchema
>;

/* ── GET /api/availability ─────────────────────────────────────────────── */

export const availabilityQuerySchema = z.object({
  product_id: z.string().uuid(),
  /** Calendar date YYYY-MM-DD (Central Time per ADR-0002 §1). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date must be YYYY-MM-DD",
  }),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const availabilitySlotSchema = z.object({
  /** Slot start, Central wall-clock "HH:MM". */
  time: z.string(),
  priceCents: z.number().int(),
  /** Boolean only — never exposes remaining-count (AH-7; privacy + Roller pattern). */
  available: z.boolean(),
});
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;

export const availabilityResponseSchema = z.array(availabilitySlotSchema);
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

/* ── GET /api/availability/slot ─────────────────────────────────────────── */

/**
 * Per-slot max-bookable-units probe (2026-06-27) — backs the customer "How many
 * lanes?" stepper cap. UNLIKE the boolean grid (AH-7), this is an on-demand
 * probe for ONE already-selected slot, so it MAY return a count: the number of
 * units a guest can still book at this exact (product, date, time). The grid
 * stays boolean; this fires only after a slot is picked, so it never
 * reconstructs a browsable remaining-inventory surface.
 */
export const slotAvailabilityQuerySchema = z.object({
  product_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date must be YYYY-MM-DD",
  }),
  /** Slot start, Central wall-clock "HH:MM". */
  time: z.string().regex(/^\d{2}:\d{2}$/, { message: "time must be HH:MM" }),
});
export type SlotAvailabilityQuery = z.infer<typeof slotAvailabilityQuerySchema>;

export const slotAvailabilityResponseSchema = z.object({
  /**
   * Max bookable units (lanes) at this slot, NOT capped at the product's online
   * max — the client applies min(onlineCap, maxUnits) so it can distinguish
   * "only N left" from "you hit the online cap". 0 = the slot just filled.
   */
  maxUnits: z.number().int().nonnegative(),
});
export type SlotAvailabilityResponse = z.infer<
  typeof slotAvailabilityResponseSchema
>;

/* ── GET /api/availability/month ────────────────────────────────────────── */

export const monthAvailabilityQuerySchema = z.object({
  product_id: z.string().uuid(),
  /** Calendar month YYYY-MM (Central Time per ADR-0002 §1). */
  month: z.string().regex(/^\d{4}-\d{2}$/, { message: "month must be YYYY-MM" }),
});
export type MonthAvailabilityQuery = z.infer<typeof monthAvailabilityQuerySchema>;

/**
 * One day in the month-availability calendar per ADR-0029 §5. `available` is a
 * boolean only — the calendar greys unavailable days, never a remaining count
 * (ADR-0025 AH-7). A day is available iff the Product has >= 1 bookable slot.
 */
export const monthAvailabilityDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  available: z.boolean(),
  /**
   * Lowest slot price for the day in integer cents (the "from $X" the calendar
   * shows on each available day), or null when the day has no slots (no
   * schedule / beyond the max-advance cap). Reflects the day's matched price
   * rule (e.g. weekday vs Fri/Sat), falling back to the product default.
   */
  priceCents: z.number().int().nullable(),
});
export type MonthAvailabilityDay = z.infer<typeof monthAvailabilityDaySchema>;

export const monthAvailabilityResponseSchema = z.array(
  monthAvailabilityDaySchema,
);
export type MonthAvailabilityResponse = z.infer<
  typeof monthAvailabilityResponseSchema
>;
