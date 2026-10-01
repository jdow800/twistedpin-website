// Step 4 — add-ons (inline, pre-commit per ADR-0025 AH-10). Sourced from the
// product's `addOnProducts`. Default quantity 0, prominent low-friction Skip
// (ADR-0029 §5.1). When a product has no add-ons (the common case in the thin
// catalog today) the step shows a clean empty-state + Skip.
//
// PROMO add-ons (src/tprs/addOnPromos.ts — the $15 arcade card, Jon 2026-10-01)
// render as a bounded offer card instead of the plain row: "free" leads, an
// online-only badge, one bright "Add a card" button at zero (the stepper takes
// over after the first add), and the sticky bar's Skip goes quiet. Quantity
// still defaults to 0 — nothing is pre-selected. Every other add-on keeps the
// plain row below.

import { useEffect, type MouseEvent } from "react";
import type { CustomerProduct } from "../../../tprs/schemas";
import { fillPromo, promoFor, promoUnit, type ResolvedPromo } from "../../../tprs/addOnPromos";
import { addOnItem, track } from "../analytics";
import { flyToCart } from "../flyToCart";
import { formatUsd } from "../format";
import Markdown from "../Markdown";
import { toPlainText } from "../../../tprs/text-dialect";

type AddOn = CustomerProduct["addOnProducts"][number];

interface Props {
  product: CustomerProduct;
  addOnQtys: Record<string, number>;
  /** Add-on driven by the detail "How many guests?" stepper — hidden here so it
   *  isn't double-controlled (its quantity is the guest count above the base). */
  hideAddOnId?: string;
  onQty: (addOnId: string, qty: number) => void;
  onSkip: () => void;
}

// One GA4 view per promo add-on per page load (Back/forward re-renders don't recount).
const viewedPromos = new Set<number>();

/** "Get {bonus} arcade play" → "Get <em>$5 free</em> arcade play". */
function PromoHeading({ promo }: { promo: ResolvedPromo }) {
  const [before, after = ""] = promo.heading.split("{bonus}");
  return (
    <h2 className="tprs-h2 tprs-promo-heading">
      {before}
      <em>{formatUsd(promo.bonusCents)} free</em>
      {after}
    </h2>
  );
}

function PromoCard({
  addOn,
  promo,
  qty,
  onQty,
}: {
  addOn: AddOn;
  promo: ResolvedPromo;
  qty: number;
  onQty: (addOnId: string, qty: number) => void;
}) {
  const max = addOn.maxQuantity ?? 99;
  useEffect(() => {
    if (viewedPromos.has(addOn.code)) return;
    viewedPromos.add(addOn.code);
    track("view_item", {
      currency: "USD",
      value: promo.priceCents / 100,
      items: [addOnItem(addOn.code, promo.title, promo.priceCents)],
    });
  }, [addOn.code, promo.priceCents, promo.title]);

  function add(e: MouseEvent<HTMLButtonElement>) {
    onQty(addOn.id, 1);
    flyToCart(e.currentTarget);
    track("add_to_cart", {
      currency: "USD",
      value: promo.priceCents / 100,
      items: [addOnItem(addOn.code, promo.title, promo.priceCents)],
    });
  }

  return (
    <div className="tprs-promo">
      {promo.badge && <span className="tprs-promo-badge">{promo.badge}</span>}
      <div className="tprs-promo-top">
        {addOn.thumbnailUrl && (
          <div className="tprs-promo-thumb-wrap">
            <img className="tprs-promo-thumb" src={addOn.thumbnailUrl} alt="" loading="lazy" />
            <span className="tprs-promo-sticker" aria-hidden="true">
              +{formatUsd(promo.bonusCents)} free
            </span>
          </div>
        )}
        <div className="tprs-promo-main">
          <div className="tprs-promo-title">{promo.title}</div>
          <p className="tprs-promo-desc">{fillPromo(promo.description, promo)}</p>
          {promo.fomo && <p className="tprs-promo-fomo">{promo.fomo}</p>}
        </div>
      </div>
      <div className="tprs-promo-actions">
        {qty === 0 ? (
          <>
            <div className="tprs-promo-math">
              {formatUsd(promo.priceCents)} → <span>{formatUsd(promo.playValueCents)} of play</span>
            </div>
            <button type="button" className="tprs-btn tprs-btn--solid tprs-promo-add" onClick={add}>
              Add a {promo.unit.one}
            </button>
          </>
        ) : (
          <>
            <div className="tprs-promo-added" aria-live="polite">
              ✓ {qty} {promoUnit(promo, qty)} added · {formatUsd(promo.bonusCents * qty)} free
            </div>
            <div className="tprs-stepper" role="group" aria-label={`${promo.title} quantity`}>
              <button
                type="button"
                className="tprs-stepper-btn"
                aria-label={`Fewer ${promo.unit.many}`}
                onClick={() => onQty(addOn.id, qty - 1)}
              >
                −
              </button>
              <span className="tprs-stepper-count">{qty}</span>
              <button
                type="button"
                className="tprs-stepper-btn"
                aria-label={`More ${promo.unit.many}`}
                disabled={qty >= max}
                onClick={(e) => {
                  onQty(addOn.id, qty + 1);
                  flyToCart(e.currentTarget);
                }}
              >
                +
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AddOnsStep({
  product,
  addOnQtys,
  hideAddOnId,
  onQty,
  onSkip,
}: Props) {
  const addOns = product.addOnProducts.filter((a) => a.id !== hideAddOnId);
  // The promo's heading only replaces "Add-ons" when it's the step's sole offer
  // (lane products: just the arcade card). Mixed lists keep the generic heading.
  const solePromo = addOns.length === 1 && !addOns[0].isRequired ? promoFor(addOns[0]) : null;

  return (
    <div>
      {solePromo ? (
        <div className="tprs-step-head">
          <PromoHeading promo={solePromo} />
        </div>
      ) : (
        <div className="tprs-step-head tprs-step-head--center">
          <h2 className="tprs-h2">Add-ons</h2>
        </div>
      )}

      {addOns.length === 0 ? (
        <>
          <p className="tprs-empty">No add-ons for this reservation.</p>
          <button
            type="button"
            className="tprs-btn tprs-btn--ghost"
            onClick={onSkip}
          >
            Skip — continue to details
          </button>
        </>
      ) : (
        <>
          {addOns.map((a) => {
            const qty = addOnQtys[a.id] ?? 0;
            const promo = a.isRequired ? null : promoFor(a);
            if (promo) {
              return <PromoCard key={a.id} addOn={a} promo={promo} qty={qty} onQty={onQty} />;
            }
            // Optional add-ons must always be removable back to 0; only a
            // REQUIRED add-on is floored at its minQuantity.
            const min = a.isRequired ? (a.minQuantity ?? 1) : 0;
            const max = a.maxQuantity ?? 99;
            const aName = toPlainText(a.name); // plain for aria-labels (no markup)
            return (
              <div className="tprs-addon-row" key={a.id}>
                {/* Two-deck layout (the squeezed 3-column row read cramped on
                    mobile): copy + thumb on top, price | stepper row below. */}
                <div className="tprs-addon-top">
                  <div className="tprs-addon-main">
                    <div className="tprs-addon-name">
                      <Markdown text={a.name} />
                      {a.isRequired && <span className="tprs-req"> *</span>}
                    </div>
                    {a.shortDescription && (
                      <div className="tprs-addon-desc">
                        <Markdown text={a.shortDescription} />
                      </div>
                    )}
                  </div>
                  {a.thumbnailUrl && (
                    <img
                      className="tprs-addon-thumb"
                      src={a.thumbnailUrl}
                      alt={toPlainText(a.name)}
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="tprs-addon-actions">
                <div className="tprs-addon-price">{formatUsd(a.defaultPriceCents)} each</div>
                <div className="tprs-stepper" role="group" aria-label={`${aName} quantity`}>
                  <button
                    type="button"
                    className="tprs-stepper-btn"
                    aria-label={`Fewer ${aName}`}
                    disabled={qty <= min}
                    onClick={() => onQty(a.id, qty - 1)}
                  >
                    −
                  </button>
                  <span className="tprs-stepper-count" aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    className="tprs-stepper-btn"
                    aria-label={`More ${aName}`}
                    disabled={qty >= max}
                    onClick={(e) => {
                      onQty(a.id, qty + 1);
                      flyToCart(e.currentTarget);
                    }}
                  >
                    +
                  </button>
                </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
