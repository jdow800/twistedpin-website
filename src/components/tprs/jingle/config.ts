import type { EventBookingConfig } from '../nye/eventConfig';

/** Fresh loopback rehearsal identities. These are not production catalog codes
 * and must never be used to activate or reinterpret existing Jingle products. */
export const JINGLE_REVIEW_PRODUCT_CODES = {traditional: 9106, vip: 9107} as const;

export const jingleReviewConfig: EventBookingConfig = {
  id: 'jingle', date: '2026-12-06', utcOffset: '-06:00',
  traditionalCode: JINGLE_REVIEW_PRODUCT_CODES.traditional,
  vipCode: JINGLE_REVIEW_PRODUCT_CODES.vip,
  guests: {traditional: 5, vip: 6}, maxLanes: 6,
  draftKey: 'tprs:jingle:review-draft:v1', historyKey: 'jingleStep',
  identity: {
    name: 'Jingle Bowl', headline: ['JINGLE', 'BOWL!'],
    invitation: ['Santa has a lane with your name on it.', 'Bring your people.'],
    closing: ['Bowling, pizza and a visit with Santa.', 'Activities end at 5:15pm. All guests depart by 5:30pm.'],
    photo: '/snap/tile-trad-540.webp', theme: 'jingle',
  },
  termsText: 'This is an owner-only booking rehearsal using approved lane prices of $149.95 Traditional and $189.95 VIP, the approved 39-reservation schedule, and a 30-minute booking cutoff before each start. Jingle Bowl activities end at 5:15pm. The venue closes at 5:30pm, and all guests must depart by then. Tax and fee allocation and final cancellation terms remain under review. No real reservation, payment, email or text is created.',
  intro: ['Bowling, pizza & a visit with Santa.', 'Choose one lane type for this reservation.'],
  included: ['90 minutes of bowling & shoes', '1 large pizza per lane', '1 soft-drink pitcher per lane', 'Hot cocoa, cookies & Santa photos'],
  packageDescription: '90 minutes of bowling with shoes, one large pizza and one soft-drink pitcher per lane, self-serve hot cocoa and cookies, and Santa photos on your device. Pitcher refills are not included. The VIP appetizer is still being reviewed.',
  foodHelp: 'Each lane includes 1 large pizza + 1 soda pitcher. No pitcher refills.',
  pairedPresentation: {
    intro: '', unitLabel: 'Lane', useFieldLabels: true, showFieldHelp: false,
    controlLabels: {pizza: 'Pizza', pitcher: 'Soda'},
    laneNote: 'Lane numbers here organize your food choices. Bowling lanes are assigned at the venue.',
    reservationInfo: {
      heading: 'Before you book',
      essentials: [
        'Arrive on time. Clear your lane, seats and belongings at your reserved end time.',
        'Jingle Bowl activities end at 5:15pm. After bowling, enjoy the arcade or an available waiting area until 5:30pm, when the venue closes and all guests must depart.',
        'Everyone attending counts toward lane capacity, including non-bowlers.',
        'No outside food, drinks, cakes, decorations or presents.',
      ],
      detailsLabel: 'Read full reservation information',
    },
  },
  arcadeCardOffer: {code: 9108, priceCents: 1500, playCreditCents: 2000},
  pricingSummaryNote: 'Approved lane prices · final total pending',
  reviewNotice: 'Owner review · approved prices and schedule · no real payment or reservation',
  marketingEnabled: false,
  initialGuest: {firstName: 'Jingle', lastName: 'Rehearsal', email: 'jingle-rehearsal@example.invalid', phone: '8155550198', zip: '60544'},
  contactNotice: 'Test contact details are already filled in; leave them as shown. This owner rehearsal sends no booking emails, texts or marketing messages.',
  confirmation: {heading: 'Rehearsal complete.', amountLabel: 'Test total', message: 'Your test reservation is saved in the isolated rehearsal. No real lanes, payment, email or text were created.', previewPath: '/jingle-bowl/rehearsal-api/rehearsal/booking'},
  salesClosedMessage: 'Choose another available Jingle Bowl time. December 6 is reserved for Jingle Bowl.',
  closedMessage: 'This Jingle Bowl rehearsal is unavailable right now.',
};
