import type { CustomerProduct } from '../../../tprs/schemas';
import type { EventBookingConfig } from './eventConfig';
import { guestsPerLane, onlineMax, type PartyChoice } from './selection';

/** Total people attending, not just the people who plan to bowl. */
export function parseAttendeeCount(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

export function minimumAttendeeLanes(count: number | null, product: CustomerProduct, event: EventBookingConfig) {
  return event.id === 'jingle' && count !== null ? Math.ceil(count / guestsPerLane(product, event)) : 1;
}

export function attendeesFitChoice(count: number | null, choice: Pick<PartyChoice, 'product' | 'quantity'> | null, event: EventBookingConfig) {
  if (event.id !== 'jingle') return true;
  return count !== null && Number.isSafeInteger(count) && count > 0 && !!choice && Number.isInteger(choice.quantity)
    && choice.quantity >= minimumAttendeeLanes(count, choice.product, event)
    && choice.quantity <= onlineMax(choice.product, event);
}
