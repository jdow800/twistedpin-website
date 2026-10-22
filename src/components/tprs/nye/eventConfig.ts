import { nyePageConfig } from '../../../tprs/pageConfig';
import type { PairedFoodPresentation } from '../formAnswers';
import type { WizardState } from '../state';

export type EventBookingIdentity = {
  name: string;
  headline: readonly [string, string];
  invitation: readonly string[];
  closing: readonly string[];
  photo: string;
  theme: 'nye' | 'jingle';
};

/** Event presentation and catalog identity only. The server owns inventory,
 * prices, eligibility, food definitions, cutoffs and accepted payment terms. */
export type EventBookingConfig = {
  id: 'nye' | 'jingle';
  date: string;
  utcOffset: string;
  traditionalCode: number;
  vipCode: number;
  guests: { traditional: number; vip: number };
  maxLanes: number;
  draftKey: string;
  historyKey: string;
  identity: EventBookingIdentity;
  termsText: string;
  intro: readonly string[];
  included: readonly string[];
  packageDescription: string;
  foodHelp: string;
  pairedPresentation?: PairedFoodPresentation;
  salesClosedMessage: string;
  closedMessage: string;
  reviewNotice?: string;
  marketingEnabled?: boolean;
  initialGuest?: WizardState['guest'];
  contactNotice?: string;
  confirmation?: {heading: string; amountLabel: string; message: string; previewPath?: string};
  helpTextOverrides?: Readonly<Record<string, string>>;
  midnightToastTime?: string;
  arcadeMegaCode?: number;
  /** Visual credit amount is bound to a verified catalog offer, never inferred from price. */
  arcadeCardOffer?: {code: number; priceCents: number; playCreditCents: number};
  pricingSummaryNote?: string;
};

const bowlNearHelp = 'To bowl near another group, enter the name on their reservation. Both bookings must be for the same party time and lane type. Requests are not guaranteed.';

/** Existing public NYE behavior is the default for every existing caller. */
export const nyeEventConfig: EventBookingConfig = {
  id: 'nye', date: '2026-12-31', utcOffset: '-06:00', traditionalCode: 126, vipCode: 124,
  guests: { traditional: 5, vip: 6 }, maxLanes: 6,
  draftKey: 'tprs:nye:brand-draft:v1', historyKey: 'nyeStep',
  identity: {name: "New Year's Eve", headline: ['RING', 'IT IN.'],
    invitation: ['Good company.', 'One last round of 2026.'],
    closing: ['Pick your party time. Bring your people.', "We'll have the lanes ready."],
    photo: '/snap/nye-reserve-hero-1080.webp', theme: 'nye'},
  termsText: nyePageConfig.termsText,
  intro: ['Shoes, pizza, soda & party favors.', 'Included with every lane.'],
  included: ['Bowling & shoes', '1 large pizza', 'NYE party favors', '1 soda pitcher'],
  packageDescription: 'Bowling during your selected party time, shoe rental, one large pizza, one pitcher of soda and NYE party favors per lane. Only the 10pm party includes the champagne or sparkling cider midnight toast.',
  foodHelp: 'One pizza and one soda pitcher for each lane.',
  salesClosedMessage: "Choose another available party time. New Year's Eve is reservation-only.",
  closedMessage: 'NYE reservations are not available right now.',
  helpTextOverrides: {'e6dab680-9820-405f-aeb5-4c409c035ffb': bowlNearHelp, '4a0f5bea-3e39-4943-a171-fa83cf3d47a3': bowlNearHelp},
  midnightToastTime: '22:00', arcadeMegaCode: 125,
};

export function eventDateLabels(event: EventBookingConfig) {
  const date = new Date(`${event.date}T12:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', {...options, timeZone:'UTC'}).format(date);
  return {
    full: format({weekday:'long',month:'long',day:'numeric',year:'numeric'}),
    weekday: format({weekday:'long'}), day: String(date.getUTCDate()),
    monthYear: format({month:'long',year:'numeric'}).toUpperCase(),
    monthDay: format({month:'long',day:'numeric'}), year: String(date.getUTCFullYear()),
  };
}
