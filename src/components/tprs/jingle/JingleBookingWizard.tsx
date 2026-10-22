import type { ComponentType } from 'react';
import NyeBrandWizard, {type EventDiscoveredProps, type EventPaymentProps} from '../nye/NyeBrandWizard';
import { jingleReviewConfig } from './config';
import './booking.css';

/** The protected page must install its isolated transport before mounting.
 * Requiring explicit payment and recovery adapters prevents a review caller from
 * silently falling through to either production Stripe component. */
export default function JingleBookingWizard({PaymentComponent,DiscoveredComponent}:{PaymentComponent:ComponentType<EventPaymentProps>;DiscoveredComponent:ComponentType<EventDiscoveredProps>}) {
  if (!PaymentComponent || !DiscoveredComponent) return <p role="alert">The isolated Jingle Bowl rehearsal is unavailable.</p>;
  return <NyeBrandWizard eventConfig={jingleReviewConfig} PaymentComponent={PaymentComponent} DiscoveredComponent={DiscoveredComponent}/>;
}
