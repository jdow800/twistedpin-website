import { useId, useRef, useState } from "react";
import { eventDateRoute, type EventDateRoute } from "../../tprs/eventDateRoutes";
import "./event-date-preview.css";

const REVIEW_DATES = [
  ["2026-12-04", "Fri", "4"],
  ["2026-12-05", "Sat", "5"],
  ["2026-12-06", "Sun", "6"],
  ["2026-12-07", "Mon", "7"],
  ["2026-12-08", "Tue", "8"],
] as const;

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

/** Shared message for the eventual normal-booking handoff. Does not claim
 * reservations are on sale and never reserves inventory or starts checkout. */
export function EventDateHandoff({ route, onChangeDate }: {
  route: EventDateRoute;
  onChangeDate: () => void;
}) {
  return (
    <div className="jingle-route-card">
      <p className="jingle-route-eyebrow">Jingle Bowl only · {route.dateLabel}</p>
      <h3>{route.title}</h3>
      <p>{route.message}</p>
      <p className="jingle-route-pending">Reservation details and sales opening are still being finalized.</p>
      <div className="jingle-route-actions">
        <a href={route.href}>{route.actionLabel} <span aria-hidden="true">↗</span></a>
        <button type="button" onClick={onChangeDate}>Choose another date</button>
      </div>
    </div>
  );
}

/** Isolated review, explicitly enabled by the password-protected concepts page.
 * Deliberately does not mount BookingWizard:
 * that island discovers accepted payments and connects to the real API. Here,
 * dates and route copy can be reviewed without cart, availability or payment calls. */
export default function EventDateHandoffPreview({ protectedPreview = false }: {
  protectedPreview?: boolean;
}) {
  const id = useId();
  const [selectedDate, setSelectedDate] = useState("2026-12-06");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateInput = useRef<HTMLInputElement>(null);
  const enabled = protectedPreview;
  const route = eventDateRoute(selectedDate, { enabled, surface: "ordinary_lanes" });

  if (!enabled) return null;

  const chooseAnotherDate = () => {
    setShowDatePicker(true);
    // Reveal and focus without substituting an arbitrary date for the guest.
    requestAnimationFrame(() => dateInput.current?.focus());
  };

  return (
    <section className="jingle-route-preview" aria-labelledby={`${id}-title`}>
      <div className="jingle-route-preview-head">
        <div>
          <p className="jingle-route-eyebrow">Normal lane booking · interaction preview</p>
          <h2 id={`${id}-title`}>Pick December 6. Find Jingle Bowl.</h2>
        </div>
        <span className="jingle-route-review-badge">Review only</span>
      </div>
      <p className="jingle-route-review-note">Try another date, then December 6. This preview checks the handoff; it does not check availability or take reservations.</p>
      <div className="jingle-route-date-head">
        <span>When are you attending?</span>
        <button type="button" onClick={chooseAnotherDate}>Change date</button>
      </div>
      <div className="jingle-route-dates" aria-label="December 2026 review dates">
        {REVIEW_DATES.map(([date, day, number]) => (
          <button type="button" key={date} aria-pressed={date === selectedDate}
            aria-label={`${dateLabel(date)}${date === "2026-12-06" ? ", Jingle Bowl only" : ""}`}
            onClick={() => setSelectedDate(date)}>
            <span>{day}</span><strong>{number}</strong>
            <small>{date === "2026-12-06" ? "Jingle Bowl" : "Dec"}</small>
          </button>
        ))}
      </div>
      {showDatePicker && (
        <label className="jingle-route-date-input" htmlFor={`${id}-date`}>
          Choose a date
          <input ref={dateInput} id={`${id}-date`} type="date" value={selectedDate}
            min="2026-10-21" max="2027-01-31"
            onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} />
        </label>
      )}
      <div aria-live="polite" aria-atomic="true">
        {route ? <EventDateHandoff route={route} onChangeDate={chooseAnotherDate} /> : (
          <div className="jingle-route-ordinary">
            <p className="jingle-route-eyebrow">Selected date</p>
            <h3>{dateLabel(selectedDate)}</h3>
            <p>Your chosen date stays in the normal lane-booking flow. Available reservations would be checked for this date.</p>
            <p className="jingle-route-review-note">No availability request or booking is made in this preview.</p>
          </div>
        )}
      </div>
    </section>
  );
}
