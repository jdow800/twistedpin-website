import type { AvailabilitySlot, CartAddRequest, CustomerProduct, FormAnswerInput, FormDefinition } from '../../../tprs/schemas';
import { selectedProductDurationMinutes, formatTimeRange12h, timeToMinutes } from '../format';
import { fieldVisible, answerMapFromInput, indexedAnswersComplete, isIndexedField, nyePairFields } from '../formAnswers';
import type { WizardState } from '../state';
import { nyeEventConfig, type EventBookingConfig } from './eventConfig';

export const NYE_DATE = nyeEventConfig.date;
export type PartyChoice = { product: CustomerProduct; slot: AvailabilitySlot; quantity: number };
export const roomName = (product: CustomerProduct, event = nyeEventConfig) => product.code === event.vipCode ? 'VIP' : 'Traditional';
export const guestsPerLane = (product: CustomerProduct, event = nyeEventConfig) => product.code === event.vipCode ? event.guests.vip : event.guests.traditional;
export const onlineMax = (product: CustomerProduct, event = nyeEventConfig) => Math.min(event.maxLanes, product.maxQuantityPerBooking ?? event.maxLanes);
// This event is in CST, regardless of the guest's device time zone.
export const partyStart = (time: string, event = nyeEventConfig) => `${event.date}T${time}:00${event.utcOffset}`;
export function partyDuration(choice: PartyChoice, event = nyeEventConfig) {
  return selectedProductDurationMinutes(choice.product, event.date, choice.slot.time);
}
export function partyRange(choice: PartyChoice, event = nyeEventConfig) {
  const duration = partyDuration(choice, event);
  return `${formatTimeRange12h(choice.slot.time, duration)}${duration && timeToMinutes(choice.slot.time) + duration >= 1440 ? ` (ends ${new Intl.DateTimeFormat('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(Date.parse(`${event.date}T12:00:00Z`)+86400000))})` : ''}`;
}
export function laneCoverage(choice: PartyChoice, event = nyeEventConfig) {
  const duration = partyDuration(choice, event);
  if (!duration || duration <= 0) throw new Error('We could not confirm the party length. Please check again.');
  const startTime = partyStart(choice.slot.time, event);
  return [{ cartLineRef: 'lane', count: choice.quantity, startTime,
    endTime: new Date(Date.parse(startTime) + duration * 60000).toISOString() }];
}
export function selectionItems(choice: PartyChoice, addOns: Record<string, number> = {}, event = nyeEventConfig): CartAddRequest {
  return [{ productId: choice.product.id, cartLineRef: 'lane', quantity: choice.quantity, startTime: partyStart(choice.slot.time, event) },
    ...choice.product.addOnProducts.filter(a => (addOns[a.id] ?? 0) > 0).map(a => ({
      productId: a.id, cartLineRef: a.id, quantity: addOns[a.id],
    }))];
}
/** Keep space preference; never silently shrink a group or requested lane count. */
export function safeAlternativeQuantity(from: PartyChoice, target: CustomerProduct, guests?: number, event = nyeEventConfig) {
  const capacity = guests ?? from.quantity * guestsPerLane(from.product, event);
  return Math.max(from.quantity, Math.ceil(capacity / guestsPerLane(target, event)));
}
export function choiceFromDraft(draft: WizardState): PartyChoice | null {
  return draft.product && draft.slot ? { product: draft.product, slot: draft.slot, quantity: draft.laneQty } : null;
}
export function compatibleAddOns(draft: WizardState, target: CustomerProduct) {
  const out: Record<string, number> = {};
  for (const a of target.addOnProducts) {
    const count = draft.addOnQtys[a.id] ?? 0;
    if (count > 0 && count >= a.minQuantity && (a.maxQuantity === null || count <= a.maxQuantity)) out[a.id] = count;
  }
  return out;
}
export function answersAfterChange(draft: WizardState, target: PartyChoice, forms: FormDefinition[]): FormAnswerInput[] {
  if (draft.product?.id !== target.product.id) return [];
  const sameTime = draft.slot?.time === target.slot.time;
  const fields = forms.flatMap(f => f.fields);
  return draft.formAnswers.filter(answer => {
    const field = fields.find(f => f.id === answer.formFieldId);
    return !!field && (answer.unitIndex === undefined || answer.unitIndex <= target.quantity) &&
      (sameTime || field.fieldType !== 'checkbox');
  });
}
/** Fail closed on missing/malformed NYE food definitions and required answers. */
export function validNyeDefinitions(forms: FormDefinition[], code: number, productCodes?: readonly number[]) {
  return forms.length > 0 && forms.some(f => {
    const pair = nyePairFields(f, code, productCodes);
    return pair && pair.pizza.required && pair.pitcher.required && pair.pizza.options.length > 0 && pair.pitcher.options.length > 0;
  });
}
export function nyeAnswersComplete(forms: FormDefinition[], code: number, answers: FormAnswerInput[], quantity: number, productCodes?: readonly number[]) {
  if (!validNyeDefinitions(forms, code, productCodes)) return false;
  const map = answerMapFromInput(answers, forms);
  return forms.flatMap(f => f.fields).every(field => {
    if (!fieldVisible(field, map) || !field.required || field.fieldType === 'rich_text') return true;
    const values = map[field.id] ?? [];
    if (isIndexedField(field)) return indexedAnswersComplete(field, answers, quantity);
    if (field.fieldType === 'checkbox') return values[0] === 'true';
    if (field.fieldType === 'checkbox_list') return values.length >= Math.max(1, field.minSelections ?? 1) &&
      (field.maxSelections === null || values.length <= field.maxSelections) && values.every(v => field.options.includes(v));
    if (field.fieldType === 'dropdown' || field.fieldType === 'radio') return values.length === 1 && field.options.includes(values[0]);
    return values.length > 0 && values.every(v => v.trim() !== '');
  });
}

/** Bind event identity once; the selection/recovery algorithm remains shared. */
export function eventSelection(event: EventBookingConfig) {
  return {
    roomName: (p:CustomerProduct) => roomName(p,event),
    guestsPerLane: (p:CustomerProduct) => guestsPerLane(p,event),
    onlineMax: (p:CustomerProduct) => onlineMax(p,event),
    partyStart: (time:string) => partyStart(time,event),
    partyDuration: (choice:PartyChoice) => partyDuration(choice,event),
    partyRange: (choice:PartyChoice) => partyRange(choice,event),
    laneCoverage: (choice:PartyChoice) => laneCoverage(choice,event),
    selectionItems: (choice:PartyChoice,addOns:Record<string,number>={}) => selectionItems(choice,addOns,event),
    safeAlternativeQuantity: (from:PartyChoice,target:CustomerProduct,guests?:number) => safeAlternativeQuantity(from,target,guests,event),
  };
}
