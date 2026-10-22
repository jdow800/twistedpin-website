import {useEffect, useState} from 'react';
import JingleBookingWizard from './JingleBookingWizard';
import RehearsalPayment from './RehearsalPayment';
import RehearsalDiscovered from './RehearsalDiscovered';

export const REHEARSAL_BASE = '/jingle-bowl/rehearsal-api';
export default function JingleRehearsal() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.PUBLIC_TPRS_API_BASE !== REHEARSAL_BASE) { setError('The isolated rehearsal transport is not configured.'); return; }
    const controller = new AbortController();
    fetch(`${REHEARSAL_BASE}/rehearsal/config/`, {credentials:'same-origin', signal:controller.signal})
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(config => {
        if (config.rehearsal !== true || config.paymentMode !== 'simulation' || config.provider !== 'FakeRail'
          || config.eventDate !== '2026-12-06' || typeof config.sessionId !== 'string'
          || !config.products?.some((p:{id:string;code:number})=>p.code===9106&&p.id==='c0d96e76-cbfc-4e5b-98ec-cddac2fd9106')
          || !config.products?.some((p:{id:string;code:number})=>p.code===9107&&p.id==='d61e83c0-5cb4-4cc8-a391-cddac2fd9107')) throw new Error();
        // A fresh fixture cannot silently adopt a previous fixture's cart/payment.
        const previous=sessionStorage.getItem('jingle:rehearsal-session');
        if(previous&&previous!==config.sessionId) {setError('This browser belongs to an older rehearsal. Open a fresh private window for the new rehearsal.');return;}
        sessionStorage.setItem('jingle:rehearsal-session',config.sessionId);setReady(true);
      }).catch(() => {if(!controller.signal.aborted)setError('The isolated booking service could not be verified. Please start the local rehearsal service.');});
    return ()=>controller.abort();
  }, []);
  if(error)return <section style={{padding:32}} role="alert"><h1>Jingle Bowl rehearsal</h1><p>{error}</p></section>;
  return ready?<JingleBookingWizard PaymentComponent={RehearsalPayment} DiscoveredComponent={RehearsalDiscovered}/>:<p style={{padding:32}} role="status">Checking the isolated booking service…</p>;
}
