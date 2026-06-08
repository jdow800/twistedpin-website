// Step 4 — add-ons (inline, pre-commit per ADR-0025 AH-10). Sourced from the
// product's `addOnProducts`. Default quantity 0, prominent low-friction Skip
// (ADR-0029 §5.1). When a product has no add-ons (the common case in the thin
// catalog today) the step shows a clean empty-state + Skip.

import type { CustomerProduct } from "../../../tprs/schemas";
import { flyToCart } from "../flyToCart";
import { formatUsd } from "../format";
import Markdown from "../Markdown";
import { toPlainText } from "../../../tprs/text-dialect";

interface Props {
  product: CustomerProduct;
  addOnQtys: Record<string, number>;
  /** Add-on driven by the detail "How many guests?" stepper — hidden here so it
   *  isn't double-controlled (its quantity is the guest count above the base). */
  hideAddOnId?: string;
  onQty: (addOnId: string, qty: number) => void;
  onSkip: () => void;
}

export default function AddOnsStep({
  product,
  addOnQtys,
  hideAddOnId,
  onQty,
  onSkip,
}: Props) {
  const addOns = product.addOnProducts.filter((a) => a.id !== hideAddOnId);

  return (
    <div>
      <div className="tprs-step-head tprs-step-head--center">
        <h2 className="tprs-h2">Make it a night</h2>
        <p className="tprs-sub">Optional — add what you want, skip the rest.</p>
      </div>

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
            // Optional add-ons must always be removable back to 0; only a
            // REQUIRED add-on is floored at its minQuantity.
            const min = a.isRequired ? (a.minQuantity ?? 1) : 0;
            const max = a.maxQuantity ?? 99;
            const aName = toPlainText(a.name); // plain for aria-labels (no markup)
            return (
              <div className="tprs-addon-row" key={a.id}>
                <div>
                  <div className="tprs-addon-name">
                    <Markdown text={a.name} />
                    {a.isRequired && <span className="tprs-req"> *</span>}
                  </div>
                  {a.shortDescription && (
                    <div className="tprs-addon-desc">
                      <Markdown text={a.shortDescription} />
                    </div>
                  )}
                  <div className="tprs-addon-price">{formatUsd(a.defaultPriceCents)} each</div>
                </div>
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
            );
          })}
        </>
      )}
    </div>
  );
}
