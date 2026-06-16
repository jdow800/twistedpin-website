// Terminal step — the real booking confirmation. `booking` carries the convert
// result (invoice number + booking id); the card was charged and the booking +
// confirmation email are live. Falls back gracefully if booking is somehow null.

import { useEffect } from "react";
import {
  formatDateLong,
  formatTime12h,
  formatTimeRange12h,
  formatUsd,
} from "../format";
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
  /** Show the computed end time on the when-line (pageConfig.confirmEndTime,
   *  default true). Pages whose real-world end can drift from durationMinutes
   *  (birthdays: room-flip time) pass false → start time only. */
  showEndTime: boolean;
  /** Folded party size for guest-stepper packages (base + additional guests).
   *  When set, the headline unit is GUESTS — "11 guests", never "1 lane"
   *  (the package quantity is meaningless to the parent; the additional-guest
   *  add-on is folded in here rather than listed as a line). */
  guestCount: number | null;
  /** Selected add-ons (qty > 0) — shown so the card reflects the whole order. */
  addOns: { name: string; quantity: number }[];
  booking: BookingConvertedResponse | null;
  totalCents: number;
  guestEmail: string;
  onReset: () => void;
}

// Per-page-load guard so a booking's `purchase` event fires at most once,
// keyed on the unique invoice number. The confirmation screen can re-render
// (React re-render / StrictMode double-invoke) without re-firing. A full reload
// resets the SPA to step 1, so the same booking can't re-reach this screen —
// an in-memory Set is sufficient and never throws (unlike sessionStorage).
const trackedPurchases = new Set<string>();

export default function ConfirmationStep({
  product,
  date,
  slot,
  laneQty,
  showEndTime,
  guestCount,
  addOns,
  booking,
  totalCents,
  guestEmail,
  onReset,
}: Props) {
  // GA4 `purchase` conversion — the TPRS replacement for Roller's purchase
  // event (Roller's dies at cutover). gtag() is stubbed synchronously in
  // Base.astro and the gclid auto-attaches from the _gcl_aw cookie, so this
  // rides the existing GA4 → Google Ads import with no Ads-UI change. value +
  // transaction_id match the amount + confirmation number shown on this screen.
  useEffect(() => {
    const invoice = booking?.invoiceNumber;
    if (!invoice || trackedPurchases.has(invoice)) return;
    trackedPurchases.add(invoice);
    if (typeof window.gtag === "function") {
      window.gtag("event", "purchase", {
        transaction_id: invoice,
        value: Number.isFinite(totalCents) ? totalCents / 100 : 0,
        currency: "USD",
      });
    }
  }, [booking?.invoiceNumber, totalCents]);

  return (
    <div className="tprs-confirm">
      <div className="tprs-confirm-check" aria-hidden="true">✓</div>
      <h2 className="tprs-confirm-title">You're booked.</h2>
      {booking && (
        <p className="tprs-confirm-sub">
          Confirmation <strong>{booking.invoiceNumber}</strong>
        </p>
      )}

      {/* The WHEN gets top billing — it's the one thing guests screenshot and
          check again later. The card's muted date row below stays (receipts
          repeat themselves); this line is the read-at-a-glance version, with
          the end time so "how long do we have the lanes?" never needs asking. */}
      {slot && (
        <p className="tprs-confirm-when">
          {formatDateLong(date)}
          <span className="tprs-confirm-when-time">
            {showEndTime
              ? formatTimeRange12h(slot.time, product.durationMinutes)
              : formatTime12h(slot.time)}
          </span>
        </p>
      )}

      <div className="tprs-confirm-card">
        <div className="tprs-confirm-line">
          <span><Markdown text={product.name} inline /></span>
          <span>
            {guestCount !== null
              ? `${guestCount} ${guestCount === 1 ? "guest" : "guests"}`
              : `${laneQty} ${laneQty === 1 ? "lane" : "lanes"}`}
          </span>
        </div>
        {addOns.map((a) => (
          <div key={a.name} className="tprs-confirm-line tprs-confirm-line--muted">
            <span><Markdown text={a.name} inline /></span>
            <span>× {a.quantity}</span>
          </div>
        ))}
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
