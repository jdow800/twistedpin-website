// Step 1 (v2.0) — the merged main screen: date strip on top, curated products
// right below, all on one screen (Roller pattern). Seeing the day while you
// choose the product is the anti-"booked the wrong day" guard. Products are
// driven by pageConfig.productCodes (curated, e.g. /nye) or the full bookable
// catalog (generic /tprs). Cards are TEXT-FORWARD — copy leads, image demoted
// to a side thumbnail (nobody picks bowling off a photo; and our catalog has no
// real imagery yet, so a small fallback reads far better than a big empty tile).

import { useEffect, useState } from "react";
import DateStrip from "../DateStrip";
import { getBookableProducts, getProducts } from "../../../tprs/client";
import type {
  BookableCategory,
  CustomerProduct,
} from "../../../tprs/schemas";
import { formatUsd, todayIso } from "../format";
import Markdown from "../Markdown";
import { toPlainText } from "../../../tprs/text-dialect";

interface Props {
  productCodes?: number[];
  selectedDate: string | null;
  onPickDate: (date: string) => void;
  onSelectProduct: (category: BookableCategory, product: CustomerProduct) => void;
}

export default function MainStep({
  productCodes,
  selectedDate,
  onPickDate,
  onSelectProduct,
}: Props) {
  const [categories, setCategories] = useState<BookableCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default the date to today on first mount (Roller defaults "Today" selected).
  useEffect(() => {
    if (selectedDate === null) onPickDate(todayIso());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const load =
      productCodes && productCodes.length > 0
        ? getProducts(productCodes, ctrl.signal).then((res) =>
            res.products.length
              ? [{ slug: null, label: "", subtitle: "", products: res.products }]
              : [],
          )
        : getBookableProducts(ctrl.signal).then((res) => res.categories);
    load
      .then((cats) => setCategories(cats))
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setError("Couldn't load the lanes. Please refresh.");
      });
    return () => ctrl.abort();
  }, [productCodes]);

  return (
    <div>
      <DateStrip
        productCodes={productCodes}
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

      {categories?.map((cat) => (
        <section className="tprs-cat" key={cat.slug ?? "uncategorized"}>
          {cat.label && <h3 className="tprs-cat-label">{cat.label}</h3>}
          {cat.subtitle && (
            <p className="tprs-cat-subtitle">
              <Markdown text={cat.subtitle} />
            </p>
          )}
          <div className="tprs-card-list">
            {cat.products.map((p) => (
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
                      the detail screen. */}
                  {(p.shortDescription || p.description) && (
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
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
