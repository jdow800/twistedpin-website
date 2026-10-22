import type { AvailabilitySlot, CustomerProduct } from '../../../tprs/schemas';
import { partyDuration, type PartyChoice } from './selection';
import { nyeEventConfig } from './eventConfig';

/** Resolve the selected party against a current catalog. A failed/missing
 * availability response is not permission to reuse a persisted party price. */
export function resolveCatalogChoice(saved: PartyChoice, products: readonly CustomerProduct[],
  grid: Readonly<Record<string, readonly AvailabilitySlot[]>>, event = nyeEventConfig): PartyChoice | null {
  const product = products.find(p => p.id === saved.product.id && p.code === saved.product.code);
  const slot = product && grid[product.id]?.find(s => s.time === saved.slot.time);
  if (!product || !slot) return null;
  const fresh = {product, slot, quantity: saved.quantity};
  const duration = partyDuration(fresh,event);
  return duration && duration > 0 ? fresh : null;
}

function packageEvidence(choice: PartyChoice, event = nyeEventConfig) {
  const p = choice.product;
  return {
    productId: p.id, code: p.code, time: choice.slot.time, quantity: choice.quantity,
    duration: partyDuration(choice,event), price: choice.slot.priceCents,
    name: p.name, shortDescription: p.shortDescription, description: p.description,
    min: p.minQuantityPerBooking, max: p.maxQuantityPerBooking, cutoff: p.salesCutoffMinutesBefore,
    addOns: p.addOnProducts.map(a => ({id: a.id, code: a.code, name: a.name,
      shortDescription: a.shortDescription, price: a.defaultPriceCents,
      min: a.minQuantity, max: a.maxQuantity, required: a.isRequired})).sort((a,b) => a.id.localeCompare(b.id)),
  };
}

/** Compare what the guest accepted for this dated party. Stock changes, image
 * changes, array ordering and other parties' duration rules are not new terms. */
export function packageDetailsChanged(saved: PartyChoice, fresh: PartyChoice, event = nyeEventConfig): boolean {
  return JSON.stringify(packageEvidence(saved,event)) !== JSON.stringify(packageEvidence(fresh,event));
}
