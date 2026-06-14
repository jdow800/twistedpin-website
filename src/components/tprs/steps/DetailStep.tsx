// Step 2 (v2.0) — product detail. The date strip STAYS here (Roller pattern):
// you can flick between days to see times without leaving the product. Then:
//   - Select a time: AVAILABLE-only slots, progressively disclosed ("Show more
//     times"); for TODAY, past times are hidden entirely (5pm → no 3pm).
//   - Lanes (never "tickets"): stepper + capacity helper + a "Details" expander.

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import DateStrip from "../DateStrip";
import { useDayAvailability, loadDaySlots } from "../useAvailability";
import type {
  AvailabilitySlot,
  BookableCategory,
  CustomerProduct,
} from "../../../tprs/schemas";
import { laneMaxFor } from "../state";
import type { ResolvedGuestStepper } from "../guestStepper";
import {
  CUSTOM_EVENT_URL,
  type BookingPageConfig,
} from "../../../tprs/pageConfig";
import { flyToCart } from "../flyToCart";
import { scrollPageToBottom } from "../scroll";
import Markdown from "../Markdown";
import {
  addDays,
  formatTime12h,
  formatUsd,
  todayIso,
  nowMinutes,
  timeToMinutes,
  truncateSentences,
} from "../format";

/** Slots shown before "Show more times". */
const SLOTS_VISIBLE = 6;
/** Sentences of long copy shown before the "Read more" cut (D). */
const DESC_SENTENCES = 3;

interface Props {
  date: string;
  category: BookableCategory | null;
  product: CustomerProduct;
  selectedSlot: AvailabilitySlot | null;
  laneQty: number;
  /** Per-page quantity wording (pageConfig). Defaults below when unset. */
  quantityLabel: string;
  quantityHelp?: string;
  /** Per-product replacement for the at-cap events nudge (pageConfig
   *  .laneCapNotes by code) — for products whose online cap IS the whole room
   *  (NYE VIP: 6 lanes = the entire suite, "need more" routes nowhere).
   *  Plain text, no events link. Unset = the default nudge. */
  laneCapNote?: string;
  /** When set, this product sells a base package + per-guest add-on — show a
   *  "How many guests?" stepper that drives the add-on, not a base counter. */
  guestStepper: ResolvedGuestStepper | null;
  /** Party-size mode (pageConfig.partySize): the quantity question is GUESTS;
   *  lanes are derived (BookingWizard keeps laneQty synced) and never directly
   *  editable here. */
  partyConfig?: BookingPageConfig["partySize"];
  partySize: number | null;
  onPartySize: (size: number | null) => void;
  addOnQtys: Record<string, number>;
  onPickDate: (date: string) => void;
  onSlot: (slot: AvailabilitySlot) => void;
  onLaneQty: (qty: number) => void;
  onAddOnQty: (addOnId: string, qty: number) => void;
  onRemoveLane: () => void;
}

export default function DetailStep({
  date,
  category,
  product,
  selectedSlot,
  laneQty,
  quantityLabel,
  quantityHelp,
  laneCapNote,
  guestStepper,
  partyConfig,
  partySize,
  onPartySize,
  addOnQtys,
  onPickDate,
  onSlot,
  onLaneQty,
  onAddOnQty,
  onRemoveLane,
}: Props) {
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const qtyRef = useRef<HTMLDivElement>(null);

  // The detail calendar probes THIS product — its availability + per-day
  // pricing — so days/prices match exactly what the slot grid will offer.
  const availability = useDayAvailability(undefined, product.id);

  // Long copy capped to ~3 sentences with a loud "Read more" (D). The card
  // carries the short one-liner; the detail screen carries the full pitch.
  const desc = useMemo(
    () => truncateSentences(product.description, DESC_SENTENCES),
    [product.description],
  );

  // Collapse the read-more when the product changes.
  useEffect(() => {
    setDescOpen(false);
  }, [product.id]);

  // H2 — picking a time reveals "How many lanes?" (now the last thing on the
  // page since the footer's gone). Scroll all the way down so it's front and
  // centre — that's exactly the next action. scrollPageToBottom double-rAFs past
  // the cart-height reflow so it actually lands at the true bottom.
  useEffect(() => {
    if (selectedSlot) scrollPageToBottom();
  }, [selectedSlot]);

  // Slot load goes through the shared loadDaySlots cache — a prefetched or
  // recently-viewed (product, date) resolves instantly, and a click that lands
  // while its prefetch is in flight JOINS that request instead of racing a
  // duplicate. Cancellation is a stale-closure guard rather than an abort (the
  // shared promise may have other consumers).
  useEffect(() => {
    let stale = false;
    setSlots(null);
    setError(null);
    setShowAll(false);
    loadDaySlots(product.id, date)
      .then((s) => {
        if (!stale) setSlots(s);
      })
      .catch(() => {
        if (!stale) setError("Couldn't load times for this date.");
      });
    return () => {
      stale = true;
    };
  }, [product.id, date]);

  // PREFETCH the next week: once this date's slots land, warm THIS product's
  // upcoming bookable days in the background — hopping along the date strip
  // then shows times instantly instead of paying the ~0.5s first-view fetch
  // per day. Bounded (7 days, available-only — skips days whose month verdict
  // hasn't loaded), and re-fires are absorbed by the cache.
  useEffect(() => {
    if (!slots) return;
    for (let i = 1, d = addDays(date, 1); i <= 7; i++, d = addDays(d, 1)) {
      if (availability.isAvailable(d)) {
        void loadDaySlots(product.id, d).catch(() => {});
      }
    }
  }, [slots, date, product.id, availability]);

  // Available-only, and for today drop past times (belt-and-suspenders on the
  // backend's lead-time rule — a stale slot can't sneak through).
  const bookable = useMemo(() => {
    if (!slots) return null;
    const isToday = date === todayIso();
    const cutoff = isToday ? nowMinutes() : -1;
    return slots.filter(
      (s) => s.available && timeToMinutes(s.time) >= cutoff,
    );
  }, [slots, date]);

  const capacityHelp =
    quantityHelp?.trim() ||
    category?.subtitle?.trim() ||
    "Reserved by the lane for your group.";

  // Lanes→people translator for the standard lane stepper — the #1 guest hangup
  // is "how many lanes do I need?". Pull the per-lane capacity from the category
  // subtitle ("Up to 6 per lane" / "5 players per lane") so it tracks the same
  // number the guest reads (one source, no drift). If the phrasing ever changes
  // and no number is found, the live readout simply doesn't render — it's an aid,
  // not load-bearing.
  const perLaneMatch = category?.subtitle?.match(
    /(\d+)\s*(?:players?\s+)?per\s+lane/i,
  );
  const perLane = perLaneMatch ? Number(perLaneMatch[1]) : null;

  // Party mode: the quantity question is GUESTS — lanes are derived (synced by
  // BookingWizard) and never directly editable. Max guests for THIS setup =
  // its online lane cap × per-lane capacity, never past the events threshold.
  const partyCap =
    partyConfig && category
      ? partyConfig.capacities[category.slug ?? ""]
      : undefined;
  const partyMode = !!(partyConfig && partySize !== null && partyCap);
  const partyMaxGuests =
    partyConfig && partyCap
      ? Math.min(laneMaxFor(product) * partyCap, partyConfig.threshold)
      : 0;

  const visible = showAll ? bookable : bookable?.slice(0, SLOTS_VISIBLE);
  const hasMore = (bookable?.length ?? 0) > SLOTS_VISIBLE;

  return (
    <div>
      {/* Product header — the LONG copy, capped to ~3 sentences with a loud
          inline "Read more" (the card carries the short one-liner). */}
      <div className="tprs-detail-head">
        <h2 className="tprs-h2">
          <Markdown text={product.name} />
        </h2>
        {product.description ? (
          <p className="tprs-sub">
            <Markdown text={descOpen ? product.description : desc.shown} />
            {desc.truncated && !descOpen && (
              <>
                {" "}
                <button
                  type="button"
                  className="tprs-readmore"
                  onClick={() => setDescOpen(true)}
                >
                  Read more
                </button>
              </>
            )}
          </p>
        ) : (
          product.shortDescription && (
            <p className="tprs-sub">{product.shortDescription}</p>
          )
        )}
      </div>

      {/* Date stays on the detail screen. */}
      <DateStrip
        availability={availability}
        probeKey={product.id}
        selected={date}
        onPick={onPickDate}
        label="Select a date"
      />

      <h3 className="tprs-section-h">Select a time</h3>

      {error && <p className="tprs-error">{error}</p>}
      {bookable === null && !error && <p className="tprs-loading">Loading times…</p>}

      {bookable !== null && bookable.length === 0 && (
        <p className="tprs-empty">
          No times left for this date. Trying to throw a last-minute or custom
          event?{" "}
          <a
            className="tprs-inline-link"
            href={CUSTOM_EVENT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Contact us →
          </a>
        </p>
      )}

      {visible && visible.length > 0 && (
        <>
          <div className="tprs-slot-grid" role="listbox" aria-label="Available times">
            {visible.map((slot) => {
              const isSel = selectedSlot?.time === slot.time;
              return (
                <button
                  key={slot.time}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  className={[
                    "tprs-slot is-available",
                    isSel ? "is-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(e) => {
                    onSlot(slot);
                    flyToCart(e.currentTarget);
                  }}
                >
                  <span className="tprs-slot-time">{formatTime12h(slot.time)}</span>
                  <span className="tprs-slot-price">{formatUsd(slot.priceCents)}</span>
                </button>
              );
            })}
          </div>
          {hasMore && !showAll && (
            <button
              type="button"
              className="tprs-link-btn"
              onClick={() => setShowAll(true)}
            >
              Show more times ⌄
            </button>
          )}
        </>
      )}

      {/* Quantity — a "guests" stepper (base package + per-guest add-on) for
          birthday-style products, else the lane stepper (never "tickets"). */}
      {selectedSlot && guestStepper && (
        <GuestStepper
          stepper={guestStepper}
          qty={addOnQtys[guestStepper.addOn.id] ?? 0}
          blockRef={qtyRef}
          onQty={(q) => onAddOnQty(guestStepper.addOn.id, q)}
        />
      )}

      {/* Party mode — guests are the only editable number; lanes follow. */}
      {selectedSlot && !guestStepper && partyMode && partySize !== null && (
        <div className="tprs-qty-block" ref={qtyRef}>
          <h3 className="tprs-section-h">
            {partyConfig?.label ?? "How many guests?"}
          </h3>
          <div className="tprs-stepper-row">
            <div className="tprs-stepper-help">
              <strong>
                {laneQty} {laneQty === 1 ? "lane" : "lanes"}
              </strong>{" "}
              reserved for your {partySize} — shoes included.
            </div>
            <div className="tprs-stepper" role="group" aria-label="Guest count">
              <button
                type="button"
                className="tprs-stepper-btn"
                aria-label="Fewer guests"
                disabled={partySize <= 1}
                onClick={() => onPartySize(Math.max(1, partySize - 1))}
              >
                −
              </button>
              <span className="tprs-stepper-count" aria-live="polite">
                {partySize}
              </span>
              <button
                type="button"
                className="tprs-stepper-btn"
                aria-label="More guests"
                disabled={partySize >= partyMaxGuests}
                onClick={(e) => {
                  onPartySize(partySize + 1);
                  flyToCart(e.currentTarget);
                }}
              >
                +
              </button>
            </div>
          </div>
          {partySize >= partyMaxGuests && (
            <p className="tprs-qty-note" role="status">
              This setup fits up to {partyMaxGuests} guests online. Bigger
              group? That's event territory — we'll set you up.{" "}
              <a
                className="tprs-inline-link"
                href={CUSTOM_EVENT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Plan your event →
              </a>
            </p>
          )}
        </div>
      )}

      {selectedSlot && !guestStepper && !partyMode && (
        <div className="tprs-qty-block" ref={qtyRef}>
          <h3 className="tprs-section-h">{quantityLabel}</h3>
          <div className="tprs-stepper-row">
            <div className="tprs-stepper-help">
              <Markdown text={capacityHelp} />
            </div>
            <div className="tprs-stepper" role="group" aria-label="Lane quantity">
              <button
                type="button"
                className="tprs-stepper-btn"
                aria-label={laneQty <= 1 ? "Remove lane" : "Fewer lanes"}
                onClick={() =>
                  laneQty <= 1 ? onRemoveLane() : onLaneQty(laneQty - 1)
                }
              >
                −
              </button>
              <span className="tprs-stepper-count" aria-live="polite">
                {laneQty}
              </span>
              <button
                type="button"
                className="tprs-stepper-btn"
                aria-label="More lanes"
                disabled={laneQty >= laneMaxFor(product)}
                onClick={(e) => {
                  onLaneQty(laneQty + 1);
                  flyToCart(e.currentTarget);
                }}
              >
                +
              </button>
            </div>
          </div>
          {/* Live lanes→people readout — the guest steps until their group fits,
              no division. aria-live so it re-announces as the count changes. */}
          {perLane && (
            <p className="tprs-qty-capacity" aria-live="polite">
              Seats up to{" "}
              <strong>
                {laneQty * perLane} {laneQty * perLane === 1 ? "guest" : "guests"}
              </strong>
            </p>
          )}
          {/* At the online lane cap (data-driven from maxQuantityPerBooking):
              say WHY the + stopped instead of a silently dead button. Default
              routes the bigger night to events; a laneCapNote override (when
              the cap IS the whole room — NYE VIP) just states the fact. */}
          {laneQty >= laneMaxFor(product) &&
            (laneCapNote ? (
              <p className="tprs-qty-note" role="status">
                {laneCapNote}
              </p>
            ) : (
              <p className="tprs-qty-note" role="status">
                Online bookings cap at {laneMaxFor(product)}{" "}
                {laneMaxFor(product) === 1 ? "lane" : "lanes"} here. Need more?
                That's event territory — we'll set you up.{" "}
                <a
                  className="tprs-inline-link"
                  href={CUSTOM_EVENT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Plan your event →
                </a>
              </p>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * The "How many guests?" stepper — base guests fixed, the +/- drives the linked
 * "Additional Guest" add-on (0…max). The displayed number is the TOTAL party
 * size (base + add-ons); the base package quantity stays 1 (priced once).
 */
function GuestStepper({
  stepper,
  qty,
  blockRef,
  onQty,
}: {
  stepper: ResolvedGuestStepper;
  qty: number;
  blockRef: RefObject<HTMLDivElement>;
  onQty: (qty: number) => void;
}) {
  const { baseGuests, addOn, maxGuests, label } = stepper;
  const addOnMax = addOn.maxQuantity ?? 0;
  const guests = baseGuests + qty;
  const atCap = qty >= addOnMax;
  return (
    <div className="tprs-qty-block tprs-qty-block--guests" ref={blockRef}>
      <h3 className="tprs-section-h">{label}</h3>
      <div className="tprs-stepper-row">
        <div className="tprs-stepper-help">
          Priced for {baseGuests} guests · additional guests{" "}
          {formatUsd(addOn.defaultPriceCents)} each (up to {maxGuests}).
        </div>
        <div className="tprs-stepper" role="group" aria-label="Guest count">
          <button
            type="button"
            className="tprs-stepper-btn"
            aria-label="Fewer guests"
            disabled={qty <= 0}
            onClick={() => onQty(qty - 1)}
          >
            −
          </button>
          <span className="tprs-stepper-count" aria-live="polite">
            {guests}
          </span>
          <button
            type="button"
            className="tprs-stepper-btn"
            aria-label="More guests"
            disabled={atCap}
            onClick={(e) => {
              onQty(qty + 1);
              flyToCart(e.currentTarget);
            }}
          >
            +
          </button>
        </div>
      </div>
      {/* Hit the cap → tell them WHY, and route the bigger party to custom events. */}
      {atCap && (
        <p className="tprs-qty-note" role="status">
          Our kids parties cap at {maxGuests} guests. Want a bigger event? We do
          those too — they're custom and awesome.{" "}
          <a
            className="tprs-inline-link"
            href={CUSTOM_EVENT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Plan your epic birthday →
          </a>
        </p>
      )}
    </div>
  );
}
