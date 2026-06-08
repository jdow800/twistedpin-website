// Resolves a product's optional "guest stepper" (pageConfig.guestSteppers) — a
// fixed base package + a per-guest add-on (e.g. Suite Birthday: priced for 10,
// grows to 14 via the "Additional Guest" add-on). When present, the detail
// screen shows ONE "How many guests?" stepper that drives the linked add-on's
// quantity instead of a base-quantity stepper; the base package itself stays at
// 1 (its `maxQuantityPerBooking`).

import { DEFAULT_GUEST_LABEL, type BookingPageConfig } from "../../tprs/pageConfig";
import type { CustomerAddOnProduct, CustomerProduct } from "../../tprs/schemas";

export interface ResolvedGuestStepper {
  /** Guests the base price covers — the stepper's floor (shown at add-on qty 0). */
  baseGuests: number;
  /** The add-on whose quantity adds guests above the base. */
  addOn: CustomerAddOnProduct;
  /** Highest reachable guest count = baseGuests + the add-on's max. */
  maxGuests: number;
  /** The stepper question (defaults to "How many guests?"). */
  label: string;
}

/**
 * The guest stepper for `product`, or null when the product isn't configured as
 * a base-package + per-guest product (the common case — those use the lane
 * stepper). Null too if the configured add-on isn't actually on the product
 * (defensive: a config/catalog drift falls back to the normal lane stepper).
 */
export function resolveGuestStepper(
  config: BookingPageConfig,
  product: CustomerProduct | null,
): ResolvedGuestStepper | null {
  if (!product) return null;
  const cfg = config.guestSteppers?.[product.code];
  if (!cfg) return null;
  const addOn = product.addOnProducts.find((a) => a.code === cfg.addOnCode);
  if (!addOn) return null;
  return {
    baseGuests: cfg.baseGuests,
    addOn,
    maxGuests: cfg.baseGuests + (addOn.maxQuantity ?? 0),
    label: cfg.label ?? DEFAULT_GUEST_LABEL,
  };
}
