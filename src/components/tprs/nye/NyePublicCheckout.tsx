import { useEffect, useState } from 'react';
import NyeBrandWizard from './NyeBrandWizard';
import { NYE_OPENING_AT, NYE_OPENING_DATE_LABEL, nyeOpeningState } from '../../../config/nye-opening';
import './public-checkout.css';

/** Sales presentation only. Server eligibility and payment recovery remain authoritative. */
export default function NyePublicCheckout() {
  const [clock, setClock] = useState(() => nyeOpeningState());
  // Do not interrupt a checkout already underway at the event's final boundary.
  // New visits after the event show the ended state; server cutoffs still reject
  // new sales, while retained payments keep their original recovery.
  const [entered, setEntered] = useState(() => nyeOpeningState().phase === 'open');
  useEffect(() => {
    const update = () => {
      const next = nyeOpeningState();
      setClock(next);
      if (next.phase === 'open') setEntered(true);
    };
    const timer = setInterval(update, 1000);
    window.addEventListener('focus', update);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return <NyeBrandWizard salesOpen={entered} closedContent={
    <section className="nye-public-closed" aria-labelledby="nye-closed-title">
      <a href="/new-years-eve/" className="nye-public-logo" aria-label="New Year's Eve at Twisted Pin">
        <img src="/logo/twisted-pin-horizontal-white.webp" width="178" height="70" alt="Twisted Pin" />
      </a>
      <p className="nye-public-eyebrow">NEW YEAR'S EVE</p>
      <h1 id="nye-closed-title">Ring it in.</h1>
      <div className="nye-public-opening">
        {clock.phase === 'ended' ? <p>This New Year's Eve event has ended.</p> : <>
          <p className="nye-public-opening-label">Reservations open</p>
          <time dateTime={NYE_OPENING_AT}>{NYE_OPENING_DATE_LABEL}</time>
          <div className="nye-public-countdown" aria-hidden="true">
            {(['days', 'hours', 'minutes', 'seconds'] as const).map(unit => <div key={unit}>
              <strong>{String(clock[unit]).padStart(2, '0')}</strong><span>{unit}</span>
            </div>)}
          </div>
        </>}
      </div>
      <p>{clock.phase === 'ended' ? <a href="/reserve/">Plan your next visit</a> : <a href="/new-years-eve/">About New Year's Eve</a>}</p>
    </section>
  } />;
}
