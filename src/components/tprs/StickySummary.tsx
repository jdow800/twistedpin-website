// "Your selections" (v3 pass). ONE component, two presentations via CSS:
//   - mobile: fixed bottom bar; tap the figures to expand the editable lines.
//   - desktop: a sticky right-rail panel with a "Your selections" header and the
//     lines always visible.
// Lines are editable inline (qty steppers; Remove for add-ons), aligned in a
// fixed column grid (K). The cart icon BUMPS when the item count rises (G).
//
// Total is SERVER-AUTHORITATIVE when a quote is present: the headline shows
// `quote.totalIncludingTax` and the expanded block itemizes Subtotal / Sales tax
// / Total. Tax is NEVER computed client-side. Until the quote endpoint responds
// (e.g. it's still 404 on the backend), it falls back to the pre-tax line-item
// subtotal labeled "taxes & fees at checkout".

import { useEffect, useRef, useState } from "react";
import {
  lineItemSubtotalCents,
  couponDiscountCents,
  laneMaxFor,
  type WizardState,
} from "./state";
import { formatUsd } from "./format";
import { toPlainText } from "../../tprs/text-dialect";
import { flyToCart } from "./flyToCart";
import { scrollPageToBottom } from "./scroll";
import Markdown from "./Markdown";
import type { QuoteResponse } from "../../tprs/schemas";

interface Props {
  state: WizardState;
  /** Party mode (pageConfig.partySize): lanes are DERIVED from this guest
   *  count — the cart shows the lane line read-only ("2 lanes · for 8 guests")
   *  instead of lane steppers, so lanes can't drift from the headcount. */
  partyGuests?: number | null;
  /** Max bookable lanes at the selected slot (wizard-fetched); null = unknown.
   *  Caps the cart-rail lane stepper so it can't bump past what's free. */
  slotMaxUnits?: number | null;
  /** Server-authoritative subtotal+tax+total; null until the endpoint responds. */
  quote: QuoteResponse | null;
  quoteLoading: boolean;
  /** Quote endpoint 404'd — not live yet; don't show a "calculating" state. */
  quoteUnavailable: boolean;
  onBack: () => void;
  onNext: () => void;
  onLaneQty: (qty: number) => void;
  onAddOnQty: (addOnId: string, qty: number) => void;
  onRemoveLane: () => void;
  /** Cart empty hint when the unit isn't "lanes" (pageConfig.selectionCopy.
   *  cartHint) — a seated event sells seats. Falls back to the lane default. */
  cartHint?: string;
}

interface Line {
  key: string;
  kind: "lane" | "addon";
  id?: string;
  name: string;
  /** Markup-stripped name for aria-labels (no dialect tokens read aloud). */
  plainName: string;
  /** Short description under the name (lane only — add-ons lack it in the API). */
  desc?: string;
  qty: number;
  cents: number;
  min: number;
  max: number;
}

function lineItems(state: WizardState, slotMaxUnits: number | null): Line[] {
  const lines: Line[] = [];
  if (state.slot && state.product) {
    // Cap the cart-rail stepper at the lower of the product's online max and
    // the lanes actually free at this slot (wizard-fetched) — without this the
    // sidebar "+" let a guest bump past availability and fail at checkout.
    const laneMax =
      slotMaxUnits === null
        ? laneMaxFor(state.product)
        : Math.min(laneMaxFor(state.product), slotMaxUnits);
    lines.push({
      key: "lane",
      kind: "lane",
      name: state.product.name,
      plainName: toPlainText(state.product.name),
      desc: state.product.shortDescription || undefined,
      qty: state.laneQty,
      cents: state.slot.priceCents * state.laneQty,
      min: 1,
      max: laneMax,
    });
  }
  if (state.product) {
    for (const a of state.product.addOnProducts) {
      const q = state.addOnQtys[a.id] ?? 0;
      if (q > 0) {
        lines.push({
          key: a.id,
          kind: "addon",
          id: a.id,
          name: a.name,
          plainName: toPlainText(a.name),
          desc: a.shortDescription || undefined,
          qty: q,
          cents: a.defaultPriceCents * q,
          min: a.isRequired ? (a.minQuantity ?? 1) : 0,
          max: a.maxQuantity ?? 99,
        });
      }
    }
  }
  return lines;
}

function itemCount(state: WizardState): number {
  const lanes = state.slot ? state.laneQty : 0;
  const addOns = Object.values(state.addOnQtys).reduce((s, q) => s + q, 0);
  return lanes + addOns;
}

function addOnsSelected(state: WizardState): boolean {
  return Object.values(state.addOnQtys).some((q) => q > 0);
}

export default function StickySummary({
  state,
  partyGuests = null,
  slotMaxUnits = null,
  quote,
  quoteLoading,
  quoteUnavailable,
  onBack,
  onNext,
  onLaneQty,
  onAddOnQty,
  onRemoveLane,
  cartHint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [taxesOpen, setTaxesOpen] = useState(false);
  const [bumping, setBumping] = useState(false);
  const subtotal = lineItemSubtotalCents(state);
  // Coupon line: prefer the QUOTE's resolved figure (tprs PR #55 — carries the
  // code, present on every step once the quote nets it, and can never disagree
  // with the total). Fall back to the payment-step preview result when the
  // quote hasn't returned / older backend.
  const quoteCoupon = quote?.couponDiscount ?? null;
  const discount = quoteCoupon
    ? quoteCoupon.amountCents
    : couponDiscountCents(state);
  const net = Math.max(0, subtotal - discount);
  const count = itemCount(state);
  const lines = lineItems(state, slotMaxUnits);

  // Headline = server total (incl. tax) when available, else pre-tax fallback.
  const displayTotal = quote ? quote.totalIncludingTax : net;
  const tax = quote?.taxBreakdown;
  const itemizeTax =
    !!tax && tax.shoesRentalSubtotal > 0 && tax.foodBeverageSubtotal > 0;
  const caption =
    count === 0
      ? (cartHint ?? "Pick a date and your lanes")
      : quote
        ? `${count} item${count === 1 ? "" : "s"} · incl. taxes & fees`
        : quoteLoading && !quoteUnavailable
          ? `${count} item${count === 1 ? "" : "s"} · calculating tax…`
          : `${count} item${count === 1 ? "" : "s"} · taxes & fees at checkout`;

  // G — bump the cart when the count rises (add-to-cart feedback).
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) setBumping(true);
    prevCount.current = count;
  }, [count]);

  // Publish the (mobile) cart bar's live height to `--tprs-cart-h` so the page's
  // bottom padding tracks it — collapsed OR expanded — and content can always
  // scroll clear of it (fixes the expanded cart chopping off "How many lanes?").
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--tprs-cart-h",
        `${el.offsetHeight}px`,
      );
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When the cart is expanded on mobile, scroll to the (now taller) bottom so
  // the content above it bumps up into view rather than getting covered.
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current && window.innerWidth < 1025) {
      scrollPageToBottom();
    }
    prevOpen.current = open;
  }, [open]);

  function changeLine(line: Line, qty: number) {
    if (line.kind === "lane") onLaneQty(qty);
    else if (line.id) onAddOnQty(line.id, qty);
  }

  let ctaLabel: string | null = null;
  let ctaEnabled = false;
  if (state.step === "detail") {
    ctaLabel = "Continue";
    ctaEnabled = state.slot !== null && state.laneQty >= 1;
  } else if (state.step === "addons") {
    ctaLabel = addOnsSelected(state) ? "Continue" : "Skip Add-ons";
    ctaEnabled = true;
  } else if (state.step === "guest") {
    // Just "Continue" — only the button that CHARGES needs to be explicit, and
    // that's the payment step's "Pay $X". The long label was also the widest
    // element in the bar (part of the in-app-browser squeeze).
    ctaLabel = "Continue";
    // ALWAYS tappable — a dead disabled button left guests asking "what did I
    // miss?" Now Continue always fires; the wizard's handleNext reveals every
    // required-field error + scrolls to the first miss, and only advances when
    // the guest fields AND any booking-form fields are clean. The gate lives
    // entirely in handleNext now (no client-side disable).
    ctaEnabled = true;
  }
  // No payment-step CTA here — the Stripe <PaymentElement> form owns the Pay
  // button (it must live inside the <Elements> provider). The sticky bar keeps
  // showing the authoritative total + Back.

  const showBack = state.step !== "main";

  return (
    <aside
      ref={asideRef}
      className="tprs-summary"
      role="region"
      aria-label="Your selections"
    >
      <div className="tprs-summary-head">Your selections</div>

      <div className={`tprs-summary-items${open ? " is-open" : ""}`}>
        {lines.length === 0 ? (
          <p className="tprs-summary-empty">Nothing added yet.</p>
        ) : (
          lines.map((l) => {
            // Party mode: the lane line is guest-derived → read-only here.
            // Guests change their HEADCOUNT (on the product screen), never the
            // lane count directly.
            const partyLane = l.kind === "lane" && partyGuests !== null;
            return (
            <div className="tprs-line" key={l.key}>
              <span className="tprs-line-name">
                <span className="tprs-line-name-text">
                  <Markdown text={l.name} inline />
                </span>
                {partyLane ? (
                  <span className="tprs-line-desc">
                    For {partyGuests} guests · shoes included
                  </span>
                ) : (
                  l.desc && (
                    <span className="tprs-line-desc">
                      <Markdown text={l.desc} inline />
                    </span>
                  )
                )}
              </span>
              {partyLane ? (
                <span className="tprs-line-qty tprs-line-qty--static">
                  {l.qty} {l.qty === 1 ? "lane" : "lanes"}
                </span>
              ) : (
              <span className="tprs-line-qty" role="group" aria-label={`${l.plainName} quantity`}>
                <button
                  type="button"
                  className="tprs-line-step"
                  aria-label={l.kind === "lane" && l.qty <= 1 ? `Remove ${l.plainName}` : `Fewer ${l.plainName}`}
                  disabled={l.kind === "addon" && l.qty <= l.min}
                  onClick={() => {
                    if (l.kind === "lane" && l.qty <= 1) onRemoveLane();
                    else changeLine(l, l.qty - 1);
                  }}
                >
                  −
                </button>
                <span className="tprs-line-count">{l.qty}</span>
                <button
                  type="button"
                  className="tprs-line-step"
                  aria-label={`More ${l.plainName}`}
                  disabled={l.qty >= l.max}
                  onClick={(e) => {
                    changeLine(l, l.qty + 1);
                    flyToCart(e.currentTarget);
                  }}
                >
                  +
                </button>
              </span>
              )}
              <span className="tprs-line-price">{formatUsd(l.cents)}</span>
              <button
                type="button"
                className="tprs-line-remove"
                aria-label={`Remove ${l.plainName}`}
                onClick={() => (l.kind === "addon" && l.id ? onAddOnQty(l.id, 0) : onRemoveLane())}
              >
                ✕
              </button>
            </div>
            );
          })
        )}
        {discount > 0 && (
          <div className="tprs-line is-discount">
            <span className="tprs-line-name">
              {quoteCoupon ? `Code ${quoteCoupon.code}` : "Code applied"}
            </span>
            <span />
            <span className="tprs-line-price">−{formatUsd(discount)}</span>
            <span className="tprs-line-remove tprs-line-remove--empty" />
          </div>
        )}
        {/* Server-applied discounts the guest never typed (the SMS opt-in
            reward). Rendered from the QUOTE, not from client state, so the line
            can only appear when the server actually applied it — the number and
            the label can never disagree. Its own line rather than folded into
            "Code applied" so a guest using both sees each one. */}
        {(quote?.autoDiscounts ?? []).map((d, i) => (
          <div className="tprs-line is-discount" key={`auto-${i}`}>
            <span className="tprs-line-name">{d.name}</span>
            <span />
            <span className="tprs-line-price">−{formatUsd(d.amountCents)}</span>
            <span className="tprs-line-remove tprs-line-remove--empty" />
          </div>
        ))}

        {/* Server-authoritative totals — only when the quote endpoint responds.
            Fees (online booking fee) are untaxed lines folded into
            subtotalExcludingTax; we subtract them so "Subtotal" reads as
            products-only, and group tax + fees under an expandable
            "Taxes & fees" line so nothing is hidden in the subtotal. */}
        {quote && (() => {
          const fees = quote.fees ?? [];
          const feesTotal = fees.reduce((s, f) => s + f.amountCents, 0);
          const productsSubtotal = quote.subtotalExcludingTax - feesTotal;
          const taxesAndFees = quote.taxBreakdown.totalTax + feesTotal;
          const hasBreakdown = taxesAndFees > 0;
          return (
            <div className={`tprs-summary-totals${quoteLoading ? " is-loading" : ""}`}>
              <div className="tprs-tot-row">
                <span>Subtotal</span>
                <span>{formatUsd(productsSubtotal)}</span>
              </div>
              <button
                type="button"
                className="tprs-tot-row tprs-tot-toggle"
                aria-expanded={taxesOpen}
                disabled={!hasBreakdown}
                onClick={() => setTaxesOpen((o) => !o)}
              >
                <span className="tprs-tot-label">
                  Taxes &amp; fees
                  {hasBreakdown && (
                    <span className="tprs-tot-caret" aria-hidden="true">
                      {taxesOpen ? "▲" : "▼"}
                    </span>
                  )}
                </span>
                <span>{formatUsd(taxesAndFees)}</span>
              </button>
              {taxesOpen && hasBreakdown && (
                <>
                  {itemizeTax ? (
                    <>
                      <div className="tprs-tot-row tprs-tot-sub">
                        <span>Shoe rental tax</span>
                        <span>{formatUsd(quote.taxBreakdown.shoesRentalTax)}</span>
                      </div>
                      <div className="tprs-tot-row tprs-tot-sub">
                        <span>Food &amp; beverage tax</span>
                        <span>{formatUsd(quote.taxBreakdown.foodBeverageTax)}</span>
                      </div>
                    </>
                  ) : (
                    quote.taxBreakdown.totalTax > 0 && (
                      <div className="tprs-tot-row tprs-tot-sub">
                        <span>Sales tax</span>
                        <span>{formatUsd(quote.taxBreakdown.totalTax)}</span>
                      </div>
                    )
                  )}
                  {fees.map((f, i) => (
                    <div className="tprs-tot-row tprs-tot-sub" key={`fee-${i}`}>
                      <span>{f.name}</span>
                      <span>{formatUsd(f.amountCents)}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="tprs-tot-row tprs-tot-grand">
                <span>Total</span>
                <span>{formatUsd(quote.totalIncludingTax)}</span>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="tprs-summary-inner">
        <button
          type="button"
          className="tprs-summary-figures"
          aria-expanded={open}
          disabled={lines.length === 0}
          onClick={() => setOpen((o) => !o)}
        >
          <span
            className={`tprs-summary-cart${bumping ? " is-bump" : ""}`}
            aria-hidden="true"
            onAnimationEnd={() => setBumping(false)}
          >
            🛒
          </span>
          <span className="tprs-summary-figures-text">
            <span className="tprs-summary-total">
              {!quote && discount > 0 && <s>{formatUsd(subtotal)}</s>}
              {formatUsd(displayTotal)}
              {lines.length > 0 && (
                <span className="tprs-summary-chevron">{open ? "⌄" : "⌃"}</span>
              )}
            </span>
            <span className="tprs-summary-caption">{caption}</span>
          </span>
        </button>

        <div className="tprs-summary-actions">
          {showBack && (
            <button
              type="button"
              className="tprs-btn tprs-btn--ghost tprs-btn--small"
              onClick={onBack}
            >
              Back
            </button>
          )}
          {ctaLabel && (
            <button
              type="button"
              className="tprs-btn tprs-btn--solid"
              disabled={!ctaEnabled}
              onClick={onNext}
              title={
                state.step === "payment"
                  ? "Preview — no card is charged"
                  : undefined
              }
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
