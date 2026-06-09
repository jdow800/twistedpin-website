// Step 1 (v2.0) — the merged main screen: date strip on top, curated products
// right below, all on one screen (Roller pattern). Seeing the day while you
// choose the product is the anti-"booked the wrong day" guard. Products are
// driven by pageConfig.productCodes (curated, e.g. /nye) or the full bookable
// catalog (generic /tprs). Cards are TEXT-FORWARD — copy leads, image demoted
// to a side thumbnail (nobody picks bowling off a photo; and our catalog has no
// real imagery yet, so a small fallback reads far better than a big empty tile).

import { useEffect, useMemo, useState } from "react";
import DateStrip from "../DateStrip";
import { useDayAvailability } from "../useAvailability";
import { getBookableProducts } from "../../../tprs/client";
import type {
  BookableCategory,
  CustomerProduct,
} from "../../../tprs/schemas";
import { formatUsd, todayIso, addDays, formatDateLong } from "../format";
import Markdown from "../Markdown";
import { toPlainText } from "../../../tprs/text-dialect";

interface Props {
  productCodes?: number[];
  /** Render each card's short-description line (pageConfig.cardDescriptions). */
  showDescriptions?: boolean;
  selectedDate: string | null;
  onPickDate: (date: string) => void;
  onSelectProduct: (category: BookableCategory, product: CustomerProduct) => void;
}

export default function MainStep({
  productCodes,
  showDescriptions = true,
  selectedDate,
  onPickDate,
  onSelectProduct,
}: Props) {
  const [categories, setCategories] = useState<BookableCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(todayIso, []);

  // ONE availability instance shared between the date strip and the product
  // grid, so both read the same per-product data: the strip greys a day only
  // when NOTHING on the page is bookable (union); the grid below scopes to
  // what's bookable on the SELECTED day.
  const availability = useDayAvailability(productCodes);
  const probeKey =
    productCodes && productCodes.length > 0
      ? `codes:${productCodes.join(",")}`
      : null;
  // Date-scoping only makes sense when the probe covers exactly this page's
  // products (the curated case) — the generic catalog probes one product.
  const dateScoped = probeKey !== null;
  const day = selectedDate ?? today;

  // Default the date to today on first mount (Roller defaults "Today" selected).
  useEffect(() => {
    if (selectedDate === null) onPickDate(todayIso());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const codes = productCodes;
    // Always load the GROUPED bookable catalog so the category headers +
    // subtitles ("VIP Suite Lanes · up to 6 guests…") render. A curated page
    // (productCodes set) keeps that grouping — we just filter each category down
    // to the curated codes and drop any category left empty. (The flat
    // /api/products?codes= endpoint loses the grouping + the per-category
    // subtitle that feeds the detail-screen capacity helper, so we don't use it
    // for the grid.)
    getBookableProducts(ctrl.signal)
      .then((res) =>
        codes && codes.length > 0
          ? res.categories
              .map((c) => ({
                ...c,
                products: c.products.filter((p) => codes.includes(p.code)),
              }))
              .filter((c) => c.products.length > 0)
          : res.categories,
      )
      .then((cats) => setCategories(cats))
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setError("Couldn't load the lanes. Please refresh.");
      });
    return () => ctrl.abort();
  }, [productCodes]);

  // Per-product verdicts for the selected day (curated pages only): a card
  // renders when its product is bookable that day, shimmers while the verdict
  // loads, and drops to the "not running" list when the day is a no for it —
  // including "no remaining times today" (the backend's day flag is
  // time-of-day aware, so after a product's last slot passes it reads false).
  const hidden: { p: CustomerProduct; next: string | null }[] = [];
  if (dateScoped && categories) {
    for (const cat of categories) {
      for (const p of cat.products) {
        if (availability.isProductAvailable(p.id, day) === false) {
          hidden.push({ p, next: availability.nextOpenFor(p.id, addDays(day, 1)) });
        }
      }
    }
  }

  return (
    <div>
      <DateStrip
        availability={availability}
        probeKey={probeKey}
        selected={selectedDate}
        onPick={onPickDate}
        label="When are you attending?"
      />

      <h2 className="tprs-h2 tprs-products-h">Choose your lanes</h2>

      {error && <p className="tprs-error">{error}</p>}
      {!error && categories === null && (
        <p className="tprs-loading">Loading lanes…</p>
      )}
      {categories?.length === 0 && (
        <p className="tprs-empty">No lanes are bookable online right now.</p>
      )}

      {categories?.map((cat) => {
        // Cards for this category on the selected day: bookable + still-loading
        // (skeleton). A category with nothing left that day disappears whole.
        const entries = cat.products.map((p) => ({
          p,
          verdict: dateScoped
            ? availability.isProductAvailable(p.id, day)
            : (true as boolean | undefined),
        }));
        const visible = entries.filter((e) => e.verdict !== false);
        if (visible.length === 0) return null;
        return (
        <section className="tprs-cat" key={cat.slug ?? "uncategorized"}>
          {cat.label && <h3 className="tprs-cat-label">{cat.label}</h3>}
          {cat.subtitle && (
            <p className="tprs-cat-subtitle">
              <Markdown text={cat.subtitle} />
            </p>
          )}
          <div className="tprs-card-list">
            {visible.map(({ p, verdict }) =>
              verdict === undefined ? (
                <div
                  key={p.id}
                  className="tprs-card tprs-card--skel"
                  aria-hidden="true"
                />
              ) : (
              <button
                type="button"
                className="tprs-card"
                key={p.id}
                onClick={() => onSelectProduct(cat, p)}
              >
                <div className="tprs-card-main">
                  <h4 className="tprs-card-name">
                    <Markdown text={p.name} />
                  </h4>
                  {/* Short one-liner on the grid card (falls back to the long
                      copy while shortDescription rolls out). Full copy lives on
                      the detail screen. Page-gated: off when the product names
                      carry the message themselves (pageConfig.cardDescriptions). */}
                  {showDescriptions && (p.shortDescription || p.description) && (
                    <p className="tprs-card-desc">
                      <Markdown text={p.shortDescription || p.description} />
                    </p>
                  )}
                  <p className="tprs-card-from">
                    <span>from</span> {formatUsd(p.defaultPriceCents)}
                  </p>
                </div>
                {p.thumbnailUrl ? (
                  <img
                    className="tprs-card-thumb"
                    src={p.thumbnailUrl}
                    alt={toPlainText(p.name)}
                    loading="lazy"
                  />
                ) : (
                  <div className="tprs-card-thumb tprs-card-thumb--fallback">
                    <span>TP</span>
                  </div>
                )}
              </button>
              ),
            )}
          </div>
        </section>
        );
      })}

      {/* What this day can't offer — kept visible (muted, not bookable) so the
          weekend-only lanes stay discoverable; tapping jumps to their next
          open day. One-liner to delete if pure removal wins. */}
      {hidden.length > 0 && (
        <div className="tprs-not-today">
          <p className="tprs-not-today-label">
            Not running {day === today ? "today" : "this day"}
          </p>
          {hidden.map(({ p, next }) => (
            <button
              key={p.id}
              type="button"
              className="tprs-not-today-row"
              disabled={!next}
              onClick={() => next && onPickDate(next)}
            >
              <span className="tprs-not-today-name">
                <Markdown text={p.name} inline />
              </span>
              {next && (
                <span className="tprs-not-today-next">
                  Next: {formatDateLong(next)} →
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
