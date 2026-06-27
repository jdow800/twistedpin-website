// VENDORED COPY of @tprs/shared-schemas — source of truth is
// dev/tprs/packages/shared-schemas/src/customer-flow.ts. Keep in lockstep; do
// not hand-edit shapes. See src/tprs/README.md for the sync rule.
//
// Customer-flow read-endpoint API schemas per ADR-0025 §2 (Slice A) + the
// ADR-0029 §5 presentable-catalog additions (bookable + month-availability).
//
// GET /api/products?codes=1,2,3            — curated per-URL Product set
// GET /api/products/bookable               — all bookable products, grouped
// GET /api/availability?product_id=&date=  — per-slot pricing + boolean availability
// GET /api/availability/month?product_id=&month=  — per-day boolean availability

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
  /**
   * customer_facing_short_description of the add-on product. `.default("")`
   * tolerates the current API (which doesn't send it yet — the add-on
   * projection in customer-catalog.ts needs the 3-line fix) so this parses
   * clean now and lights up the moment the backend carries the field.
   */
  shortDescription: z.string().default(""),
  defaultPriceCents: z.number().int(),
  minQuantity: z.number().int(),
  maxQuantity: z.number().int().nullable(),
  isRequired: z.boolean(),
  /**
   * Add-on card thumbnail (ADR-0029 §5). Now projected by the backend add-on
   * projection (customer-catalog.ts loadAddOnsByParent) + mirrored in
   * @tprs/shared-schemas. `.default(null)` tolerates older cached responses.
   */
  thumbnailUrl: z.string().nullable().default(null),
});
export type CustomerAddOnProduct = z.infer<typeof customerAddOnProductSchema>;

export const customerProductSchema = z.object({
  id: z.string().uuid(),
  code: z.number().int(),
  /** customer_facing_name, falling back to the internal name when unset. */
  name: z.string(),
  /**
   * customer_facing_short_description — one-liner for the grid card. Defaults to
   * "" while the field rolls out; pairs with `description` (the long copy).
   */
  shortDescription: z.string().default(""),
  /** customer_facing_description — long copy for product detail / checkout (may be empty string). */
  description: z.string(),
  defaultPriceCents: z.number().int(),
  durationMinutes: z.number().int().nullable(),
  /**
   * Per-booking quantity bounds (nullable — null = unbounded on that side). The
   * base stepper is capped at `maxQuantityPerBooking` and floored at
   * `minQuantityPerBooking`; the server hard-rejects out-of-range with
   * 400 quantity_per_booking_out_of_range, so the UI just prevents the dead-end.
   * (e.g. "Suite Birthday Party" is max 1 — you buy one package, then grow the
   * party via the "Additional Guest" add-on, not by buying more packages.)
   */
  minQuantityPerBooking: z.number().int().nullable(),
  maxQuantityPerBooking: z.number().int().nullable(),
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

/** Per-slot max-bookable-units probe — vendored mirror of @tprs/shared-schemas.
 *  On-demand (only after a slot is picked); the grid stays boolean (AH-7). */
export const slotAvailabilityResponseSchema = z.object({
  /** Max bookable units (lanes) at this slot, uncapped at the online max — the
   *  client applies min(onlineCap, maxUnits). 0 = the slot just filled. */
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
   * The day's LOWEST slot price in integer cents (its matched price rule —
   * weekday vs Fri/Sat), rendered under the calendar day. null when the day has
   * no slots (no schedule / beyond the max-advance cap). Server-authoritative —
   * never recomputed client-side.
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
