import {useRef, useState} from 'react';
import type {EventPaymentProps} from '../nye/NyeBrandWizard';
import {createPaymentIntent, getCart, getCheckoutAttemptStatus} from '../../../tprs/client';
import {bookingConvertedResponseSchema} from '../../../tprs/schemas';
import {attemptIdentity, type CheckoutRecovery} from '../checkoutRecovery';
import {exactSelectionHeld} from '../nye/cartSelection';

/** Simulates only the provider confirmation. Quotes, holds, accepted forms,
 * idempotent attempts, conversion and persisted answers use the real backend. */
export default function RehearsalPayment(props:EventPaymentProps) {
  const [accepted,setAccepted]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const inFlight=useRef(false);
  async function complete() {
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');props.onLock(true);
    try {
      if(!import.meta.env.DEV || import.meta.env.PUBLIC_TPRS_API_BASE!=='/jingle-bowl/rehearsal-api')throw new Error('Rehearsal transport is not available.');
      let record:CheckoutRecovery|null=props.recovery;
      if(!record){
        if(!accepted||props.formStale||props.pricingPending||props.pricingError||!props.quote?.reviewToken)throw new Error('Review the terms, food choices and current total first.');
        const cart=await getCart();
        if(!cart.cartToken||!props.preAcquiredSelection||!exactSelectionHeld(cart,props.preAcquiredSelection.items,props.preAcquiredSelection.coverage))throw new Error('Your held lanes changed. Return to your selection and review them.');
        record={version:1,draft:{...props.draft,step:'payment',booking:null,checkoutLocked:true},quote:props.quote,cartToken:cart.cartToken,
          request:{customer:props.customer,eventDate:props.eventDate,startTime:props.startTime,items:props.checkoutItems,attemptKey:crypto.randomUUID(),formAnswers:props.formAnswers,acceptedTerms:true,checkoutContractVersion:1,reviewToken:props.quote.reviewToken},confirmStarted:false,status:'creating'};
        // Persist the request before creating an attempt; a lost response retries
        // this exact key and signed review, never starts a replacement payment.
        props.onRecovery(record);
      }
      if(!record.payment){record={...record,payment:await createPaymentIntent(record.request),status:'prepared'};props.onRecovery(record);}
      const identity=attemptIdentity(record);
      if(!identity)throw new Error('The rehearsal did not return an accepted checkout identity.');
      const status=await getCheckoutAttemptStatus(identity);
      if(status.status==='confirmed'&&status.booking){props.onRecovery(null);props.onConverted(status.booking);return;}
      if(!['prepared','processing'].includes(status.status))throw new Error(`This test checkout needs review (${status.status}).`);
      props.onRecovery({...record,confirmStarted:true,status:'processing'});
      const response=await fetch('/jingle-bowl/rehearsal-api/rehearsal/complete/',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(identity)});
      const body=await response.json();
      if(!response.ok)throw new Error(typeof body.error==='string'?body.error:'Could not complete the simulated payment.');
      const booking=bookingConvertedResponseSchema.parse(body);
      props.onRecovery(null);props.onConverted(booking);
    }catch(cause){setError(cause instanceof Error?cause.message:'The test checkout could not finish. Retry to check this same attempt.');}
    finally{inFlight.current=false;setBusy(false);props.onLock(false);}
  }
  return <section className="jingle-simulated-payment" aria-label="Simulated payment">
    <h3>Complete a test reservation.</h3><p>No card details. No charge. Confirmation and kitchen previews are created locally.</p>
    <p>{props.termsText}</p>
    {!props.recovery&&<label style={{display:'flex',gap:12,alignItems:'flex-start',margin:'20px 0'}}><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)} disabled={busy}/>I understand this is a rehearsal with no real reservation or payment.</label>}
    {error&&<p role="alert">{error}</p>}
    <button type="button" className="primary" disabled={busy||(!props.recovery&&(!accepted||!!props.formStale||!!props.pricingPending||!!props.pricingError))} onClick={()=>void complete()}>{busy?'Completing test reservation…':props.recovery?'Check and finish test reservation':'Complete test reservation'}</button>
  </section>;
}
