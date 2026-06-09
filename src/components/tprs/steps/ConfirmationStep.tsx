// Terminal step — the real booking confirmation. `booking` carries the convert
// result (invoice number + booking id); the card was charged and the booking +
// confirmation email are live. Falls back gracefully if booking is somehow null.

import { formatDateLong, formatTime12h, formatUsd } from "../format";
import Markdown from "../Markdown";
import type {
  AvailabilitySlot,
  BookingConvertedResponse,
  CustomerProduct,
} from "../../tprs/schemas";

interface Props {
  product: CustomerProduct;
  date: string;
  slot: AvailabilitySlot | null;
  laneQty: number;
  booking: BookingConvertedResponse | null;
  totalCents: number;
  guestEmail: string;
  onReset: () => void;
}

export default function ConfirmationStep({
  product,
  date,
  slot,
  laneQty,
  booking,
  totalCents,
  guestEmail,
  onReset,
}: Props) {
  return (
    <div className="tprs-confirm">
      <div className="tprs-confirm-check" aria-hidden="true">✓</div>
      <h2 className="tprs-confirm-title">You're booked.</h2>
      {booking && (
        <p className="tprs-confirm-sub">
          Confirmation <strong>{booking.invoiceNumber}</strong>
        </p>
      )}

      <div className="tprs-confirm-card">
        <div className="tprs-confirm-line">
          <span><Markdown text={product.name} inline /></span>
          <span>
            {laneQty} {laneQty === 1 ? "lane" : "lanes"}
          </span>
        </div>
        <div className="tprs-confirm-line tprs-confirm-line--muted">
          <span>{formatDateLong(date)}</span>
          <span>{slot ? formatTime12h(slot.time) : ""}</span>
        </div>
        <div className="tprs-confirm-line tprs-confirm-total">
          <span>Paid</span>
          <span>{formatUsd(totalCents)}</span>
        </div>
      </div>

      <p className="tprs-confirm-email">
        A confirmation is on its way to{" "}
        <strong>{guestEmail || "your email"}</strong>.
      </p>

      <a href="/" className="tprs-btn tprs-btn--solid">
        Back to twistedpin.com
      </a>
      <button type="button" className="tprs-confirm-again" onClick={onReset}>
        Book another reservation
      </button>
    </div>
  );
}
