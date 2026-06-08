// "What you're reserving" — the reservation readout on the add-ons + guest
// steps (once the date strip is behind you). Shows the lane (+ its short desc) +
// date/time in LONG format (weekday spelled out — the anti-"wrong day" guard) +
// any selected add-ons. Edit jumps back to the detail step.
//
// Add-on SHORT descriptions aren't in the API yet (the add-on projection gap),
// so add-ons list by name × qty for now; the desc line lights up the moment the
// backend carries `shortDescription` on add-ons.

import { formatDateLong, formatTime12h } from "./format";
import Markdown from "./Markdown";
import type { ResolvedGuestStepper } from "./guestStepper";
import type { AvailabilitySlot, CustomerProduct } from "../../tprs/schemas";

interface Props {
  product: CustomerProduct;
  date: string;
  slot: AvailabilitySlot | null;
  laneQty: number;
  addOnQtys: Record<string, number>;
  guestStepper: ResolvedGuestStepper | null;
  onEdit: () => void;
}

export default function BookingContext({
  product,
  date,
  slot,
  laneQty,
  addOnQtys,
  guestStepper,
  onEdit,
}: Props) {
  // For guest products, the base line reads as a party size, and the linked
  // guest add-on is folded into that count (not listed as a separate add-on).
  const guestCount = guestStepper
    ? guestStepper.baseGuests + (addOnQtys[guestStepper.addOn.id] ?? 0)
    : null;
  const addOns = product.addOnProducts.filter(
    (a) => (addOnQtys[a.id] ?? 0) > 0 && a.id !== guestStepper?.addOn.id,
  );

  return (
    <div className="tprs-reserving">
      <div className="tprs-reserving-head">
        <span className="tprs-reserving-title">What you're reserving</span>
        <button type="button" className="tprs-context-edit" onClick={onEdit}>
          Edit
        </button>
      </div>

      <div className="tprs-reserving-line">
        <div className="tprs-reserving-main">
          <span className="tprs-reserving-name">
            <Markdown text={product.name} inline /> ·{" "}
            {guestCount !== null
              ? `${guestCount} ${guestCount === 1 ? "guest" : "guests"}`
              : `${laneQty} ${laneQty === 1 ? "lane" : "lanes"}`}
          </span>
          {product.shortDescription && (
            <span className="tprs-reserving-desc">
              <Markdown text={product.shortDescription} inline />
            </span>
          )}
        </div>
        <span className="tprs-reserving-when">
          {formatDateLong(date)}
          {slot ? ` · ${formatTime12h(slot.time)}` : ""}
        </span>
      </div>

      {addOns.map((a) => (
        <div className="tprs-reserving-line tprs-reserving-addon" key={a.id}>
          <div className="tprs-reserving-main">
            <span className="tprs-reserving-name">
              + <Markdown text={a.name} inline /> ×{addOnQtys[a.id]}
            </span>
            {a.shortDescription && (
              <span className="tprs-reserving-desc">
                <Markdown text={a.shortDescription} inline />
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
