import { useEffect, useMemo, useState } from 'react';
import NyeBrandWizard from '../nye/NyeBrandWizard';
import { getJingleBookingConfig } from '../../../tprs/client';
import { jingleBookingBootstrapSchema, jingleInitialLaneType, jinglePublicEventConfig, type JingleBookingBootstrap } from './publicConfig';
import './booking.css';

/** Real checkout uses the normal API/payment adapters. The isolated review
 * transport and synthetic guest never enter this bootstrap. */
export default function JinglePublicCheckout({enabled=false}:{enabled?:boolean}) {
  const [bootstrap,setBootstrap] = useState<JingleBookingBootstrap|null>(null);
  const [error,setError] = useState(false);
  const [retry,setRetry] = useState(0);
  const [initialLaneType] = useState(()=>jingleInitialLaneType(location.search));
  useEffect(()=>{
    const controller = new AbortController();
    let current = true;
    setError(false);
    // A production entry must never use the dedicated FakeRail proxy, including
    // an accidentally retained development environment value.
    if(import.meta.env.PUBLIC_TPRS_API_BASE==='/jingle-bowl/rehearsal-api') {
      setError(true);return;
    }
    const timeout=setTimeout(()=>controller.abort(),8000);
    getJingleBookingConfig(controller.signal)
      .then(value=>{if(!controller.signal.aborted)setBootstrap(jingleBookingBootstrapSchema.parse(value));})
      .catch(()=>{if(current)setError(true);})
      .finally(()=>clearTimeout(timeout));
    return()=>{current=false;clearTimeout(timeout);controller.abort();};
  },[retry]);
  const config = useMemo(()=>bootstrap?jinglePublicEventConfig(bootstrap):null,[bootstrap]);
  const closedContent=<section className="jingle-booking-message" aria-labelledby="jingle-booking-title">
    <a href="/jingle-bowl/" aria-label="About Jingle Bowl"><img src="/logo/twisted-pin-horizontal-white.webp" width="178" height="70" alt="Twisted Pin" /></a>
    <h1 id="jingle-booking-title">Jingle Bowl</h1>
    <p>Reservations are not available right now.</p>
    <p><a href="/jingle-bowl/">Explore the lane packages</a> or email <a href="mailto:contactus@twistedpin.com">contactus@twistedpin.com</a>.</p>
  </section>;
  if(!config)return <section className="jingle-booking-message" aria-labelledby="jingle-loading-title">
    <h1 id="jingle-loading-title">Jingle Bowl</h1>
    <p role={error?'alert':'status'}>{error?'We could not load booking right now. Your saved reservation details have not been changed.':'Getting your reservation ready…'}</p>
    {error&&<><button type="button" onClick={()=>setRetry(value=>value+1)}>Try again</button><p>Still having trouble? Email <a href="mailto:contactus@twistedpin.com">contactus@twistedpin.com</a>.</p></>}
    <p><a href="/jingle-bowl/">Back to Jingle Bowl</a></p>
  </section>;
  // Closed sales must not conceal an accepted payment. The shared wizard
  // performs recovery/discovery before checking salesOpen or loading products.
  return <NyeBrandWizard eventConfig={config} initialLaneType={initialLaneType}
    salesOpen={enabled&&bootstrap!.bookingReady} closedContent={closedContent}/>;
}
