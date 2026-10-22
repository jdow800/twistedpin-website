import {useEffect, useRef, useState} from 'react';
import type {EventDiscoveredProps} from '../nye/NyeBrandWizard';
import {cancelCheckoutAttempt, createPaymentIntent, getCheckoutAttemptStatus} from '../../../tprs/client';
import {bookingConvertedResponseSchema, type BookingConvertedResponse} from '../../../tprs/schemas';
import {formatUsd} from '../format';

/** Cookie-owned recovery uses the server's accepted order. It never imports a
 * provider component, replaces an order, or re-quotes a previously accepted one. */
export default function RehearsalDiscovered(props:EventDiscoveredProps) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [booking,setBooking]=useState<BookingConvertedResponse|null>(null);
  const running=useRef(false), active=useRef(props.attempt);active.current=props.attempt;
  async function inspect(action:'check'|'complete'|'cancel'){
    if(running.current)return;running.current=true;setBusy(true);setError('');
    try{
      if(!import.meta.env.DEV||import.meta.env.PUBLIC_TPRS_API_BASE!=='/jingle-bowl/rehearsal-api')throw Error('The isolated rehearsal is unavailable.');
      let saved=active.current;
      const identity={attemptId:saved.attemptId,recoveryToken:saved.recoveryToken};
      const status=await getCheckoutAttemptStatus(identity);
      saved={...saved,status:status.status};props.onSave(saved);active.current=saved;
      if(status.status==='confirmed'&&status.booking){setBooking(status.booking);props.onClear();return;}
      if(['cancelled','refunded'].includes(status.status))return;
      if(!['prepared','processing'].includes(status.status))throw Error(`This test checkout needs review (${status.status}).`);
      if(action==='cancel'){
        const cancelled=await cancelCheckoutAttempt(identity);props.onSave({...saved,status:cancelled.status});return;
      }
      if(action==='check')return;
      if(!saved.paymentReady){
        const payment=await createPaymentIntent(saved.originalRequest);
        if(payment.attemptId!==saved.attemptId)throw Error('The recovered test checkout identity changed.');
      }
      const response=await fetch('/jingle-bowl/rehearsal-api/rehearsal/complete/',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(identity)});
      const body=await response.json();
      if(!response.ok)throw Error(typeof body.error==='string'?body.error:'The saved test checkout could not finish.');
      const result=bookingConvertedResponseSchema.parse(body);
      props.onSave({...saved,status:'confirmed'});props.onClear();setBooking(result);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not check the saved test checkout.');}
    finally{running.current=false;setBusy(false);}
  }
  useEffect(()=>{void inspect('check');},[]);
  const resolved=['cancelled','refunded'].includes(props.attempt.status);
  return <section aria-label="Saved test reservation">
    <p>Owner rehearsal · simulated payment · no real booking, charge, email or text</p>
    <h2>{booking?'Rehearsal complete.':'Your saved test checkout'}</h2>
    <p>Retained test total: {formatUsd(props.attempt.financialSnapshot.totalIncludingTax)}. Proposed pricing and tax allocation remain under review.</p>
    {booking?<><p>Confirmation {booking.invoiceNumber}</p><p>The original test reservation was recovered from the isolated service.</p>
      <p><a href={`/jingle-bowl/rehearsal-api/rehearsal/booking/${booking.bookingId}/confirmation/`} target="_blank" rel="noreferrer">Confirmation preview</a> · <a href={`/jingle-bowl/rehearsal-api/rehearsal/booking/${booking.bookingId}/kitchen/`} target="_blank" rel="noreferrer">Kitchen preview</a></p></>:resolved?<p>This test checkout is {props.attempt.status}.</p>:<>
      <button type="button" disabled={busy} onClick={()=>void inspect('complete')}>Complete recovered test reservation</button>
      <button type="button" disabled={busy} onClick={()=>void inspect('check')}>Check saved test reservation</button>
      <button type="button" disabled={busy} onClick={()=>void inspect('cancel')}>Cancel unpaid test checkout</button>
    </>}
    {error&&<p role="alert">{error}</p>}
    {(booking||resolved)&&<button type="button" onClick={props.onNewReservation}>Start another test reservation</button>}
  </section>;
}
