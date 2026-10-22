import { z } from 'zod';
import type { EventBookingConfig } from '../nye/eventConfig';

const productIdentity = z.object({id: z.string().uuid(), code: z.number().int().positive()});
const fixtureCodes = new Set([9106, 9107, 9108]);

/** Public, non-sensitive identity/readiness only. Prices, forms, inventory and
 * accepted money are still read through the normal authoritative checkout API. */
export const jingleBookingBootstrapSchema = z.object({
  eventDate: z.literal('2026-12-06'),
  bookingReady: z.boolean(),
  products: z.object({traditional: productIdentity, vip: productIdentity}),
  arcade: productIdentity.extend({code: z.literal(122)}),
  guests: z.object({traditional: z.literal(5), vip: z.literal(6)}),
  maxLanes: z.literal(6),
}).superRefine((config, context) => {
  const identities = [config.products.traditional, config.products.vip, config.arcade];
  if(new Set(identities.map(p=>p.id)).size!==3 || new Set(identities.map(p=>p.code)).size!==3
    || identities.some(p=>fixtureCodes.has(p.code))) {
    context.addIssue({code:z.ZodIssueCode.custom, message:'Ambiguous production Jingle identity'});
  }
});
export type JingleBookingBootstrap = z.infer<typeof jingleBookingBootstrapSchema>;
export type JingleLaneType = 'traditional' | 'vip';

export function jingleInitialLaneType(search: string): JingleLaneType | undefined {
  const values = new URLSearchParams(search).getAll('lane');
  return values.length===1 && (values[0]==='traditional'||values[0]==='vip') ? values[0] : undefined;
}

/** Construct production copy explicitly; never spread the rehearsal config,
 * which carries synthetic customers, products and simulated payment notices. */
export function jinglePublicEventConfig(value: JingleBookingBootstrap): EventBookingConfig {
  const config = jingleBookingBootstrapSchema.parse(value);
  return {
    id:'jingle', date:config.eventDate, utcOffset:'-06:00',
    traditionalCode:config.products.traditional.code, vipCode:config.products.vip.code,
    productIds:{traditional:config.products.traditional.id, vip:config.products.vip.id},
    guests:config.guests, maxLanes:config.maxLanes,
    draftKey:'tprs:jingle:booking-draft:v1', historyKey:'jingleStep',
    identity:{name:'Jingle Bowl',headline:['JINGLE','BOWL!'],
      invitation:['Santa has a lane with your name on it.','Bring your people.'],
      closing:['Bowling, pizza and a visit with Santa.','Activities end at 5:15pm. All guests depart by 5:30pm.'],
      photo:'/snap/tile-trad-540.webp',theme:'jingle'},
    termsText:'Your reservation includes 90 minutes of bowling with shoe rental. Arrive on time and clear your lane, seats and belongings at your reserved end time. Each lane includes one large pizza and one pitcher of soft drink; pitcher refills are not included. VIP lanes also include one basket of fries per lane. A 10% Online Booking Fee and applicable tax are added at checkout. Cancellations must be made at least 72 hours before your reservation to avoid forfeiting payment. Jingle Bowl activities end at 5:15pm. The venue closes at 5:30pm, and all guests must depart by then.',
    intro:['Bowling, pizza & a visit with Santa.','Choose one lane type for this reservation.'],
    included:['90 minutes of bowling & shoes','1 large pizza per lane','1 soft-drink pitcher per lane','Access to cookie & cocoa bar','Photo with Santa on your device'],
    packageDescription:'90 minutes of bowling with shoes, one large pizza and one soft-drink pitcher per lane, access to the cookie and cocoa bar, and a photo with Santa on your device. Pitcher refills are not included. VIP lanes also include one basket of fries per lane.',
    foodHelp:'Each lane includes 1 large pizza + 1 soda pitcher. No pitcher refills.',
    pairedPresentation:{intro:'',unitLabel:'Lane',useFieldLabels:true,showFieldHelp:false,
      controlLabels:{pizza:'Pizza',pitcher:'Soda'},
      laneNote:'Lane numbers here organize your food choices. Bowling lanes are assigned at the venue.',
      reservationInfo:{heading:'Before you book',essentials:[
        'Arrive on time. Clear your lane, seats and belongings at your reserved end time.',
        'Jingle Bowl activities end at 5:15pm. After bowling, enjoy the arcade or an available waiting area until 5:30pm, when the venue closes and all guests must depart.',
        'Everyone attending counts toward lane capacity, including non-bowlers.',
        'No outside food, drinks, cakes, decorations or presents.',
      ],detailsLabel:'Read full reservation information'}},
    arcadeCardOffer:{code:config.arcade.code,priceCents:1500,playCreditCents:2000},
    salesClosedMessage:'Choose another available Jingle Bowl time. December 6 is reserved for Jingle Bowl.',
    closedMessage:'Jingle Bowl reservations are not available right now.',
  };
}
