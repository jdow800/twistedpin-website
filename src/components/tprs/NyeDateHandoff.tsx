import { useEffect, useRef, useState } from "react";
import { NYE_EVENT_DATE_LABEL, NYE_OPEN_CTA, NYE_OPENING_REMINDER, nyeOpeningState } from "../../config/nye-opening";

/** The ordinary draft remains owned by BookingWizard while this invitation shows. */
export default function NyeDateHandoff({ onReturn }: { onReturn: () => void }) {
  const [phase, setPhase] = useState(() => nyeOpeningState().phase);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const update = () => setPhase(nyeOpeningState().phase);
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <section className="tprs-nye-handoff" aria-labelledby="nye-date-heading">
      <p className="tprs-nye-handoff-date">{NYE_EVENT_DATE_LABEL}</p>
      <h2 id="nye-date-heading" ref={heading} tabIndex={-1}>New Year's Eve parties only.</h2>
      <p>Regular one- and two-hour lane reservations aren't offered on December 31. Choose an NYE package instead.</p>
      {phase === "ended" ? <p className="tprs-nye-handoff-opening">This New Year's Eve event has ended.</p> : <>
        <p>Each lane includes bowling, shoes, one large pizza and one pitcher of soda.</p>
        {phase === "before" && <p className="tprs-nye-handoff-opening" role="status">{NYE_OPENING_REMINDER}</p>}
        <a className="tprs-btn tprs-btn--solid" href={NYE_OPEN_CTA.href}>
          {phase === "before" ? "See NYE opening countdown" : "Choose your NYE party"}
        </a>
      </>}
      <button type="button" className="tprs-btn tprs-btn--ghost" onClick={onReturn}>Back to regular reservations</button>
    </section>
  );
}
