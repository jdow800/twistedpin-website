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
import {
  CUSTOM_EVENT_URL,
  type BookingPageConfig,
} from "../../../tprs/pageConfig";

interface Props {
  productCodes?: number[];
  /** Render each card's short-description line (pageConfig.cardDescriptions). */
  showDescriptions?: boolean;
  /** Party-size-first mode (pageConfig.partySize) — the /reserve-preview2
   *  experiment. GUESTS, not bowlers: spectators count, they need a place to
   *  be. Absent = catalog behavior, identical to /reserve-preview. */
  partyConfig?: BookingPageConfig["partySize"];
  partySize: number | null;
  onPartySize: (size: number | null) => void;
  selectedDate: string | null;
  onPickDate: (date: string) => void;
  onSelectProduct: (
    category: BookableCategory,
    product: CustomerProduct,
    laneQty?: number,
  ) => void;
}

/** Stepper ceiling — far enough past any threshold to trip the events handoff. */
const PARTY_MAX = 30;

export default function MainStep({
  productCodes,
  showDescriptions = true,
  partyConfig,
  partySize,
  onPartySize,
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

  // Party-size mode: the page does the lane math. ceil(bowlers ÷ per-lane
  // capacity) per category; over the threshold the grid yields to the events
  // handoff (big crews are event territory, not self-serve).
  const lanesFor = (cat: BookableCategory): number | null => {
    if (!partyConfig || partySize === null) return null;
    const cap = partyConfig.capacities[cat.slug ?? ""];
    return cap ? Math.ceil(partySize / cap) : null;
  };
  const overThreshold =
    !!partyConfig && partySize !== null && partySize > partyConfig.threshold;

  return (
    <div>
      <DateStrip
        availability={availability}
        probeKey={probeKey}
        selected={selectedDate}
        onPick={onPickDate}
        label="When are you attending?"
      />

      {/* The in-store question, asked first (party-size-first experiment).
          GUESTS, not bowlers — 15 people with 5 bowling still need space for
          15, so everyone gets counted. Seeded from config.default (≈4). */}
      {partyConfig && (
        <div className="tprs-party">
          <h3 className="tprs-section-h tprs-party-h">
            {partyConfig.label ?? "How many guests?"}
          </h3>
          <div className="tprs-party-row">
            <p className="tprs-party-help">
              {partyConfig.help ??
                "Count everyone — bowling or not, they need a place to be. We'll size the lanes to fit."}
            </p>
            <div className="tprs-stepper" role="group" aria-label="How many guests">
              <button
                type="button"
                className="tprs-stepper-btn"
                aria-label="Fewer guests"
                disabled={partySize !== null && partySize <= 1}
                onClick={() =>
                  onPartySize(Math.max(1, (partySize ?? 1) - 1))
                }
              >
                −
              </button>
              <span className="tprs-stepper-count" aria-live="polite">
                {partySize ?? "–"}
              </span>
              <button
                type="button"
                className="tprs-stepper-btn"
                aria-label="More guests"
                disabled={partySize !== null && partySize >= PARTY_MAX}
                onClick={() => onPartySize(Math.min(PARTY_MAX, (partySize ?? 0) + 1))}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="tprs-h2 tprs-products-h">
        {partySize !== null && !overThreshold
          ? `Your options for ${partySize}`
          : "Choose your lanes"}
      </h2>

      {error && <p className="tprs-error">{error}</p>}
      {!error && categories === null && (
        <p className="tprs-loading">Loading lanes…</p>
      )}
      {categories?.length === 0 && (
        <p className="tprs-empty">No lanes are bookable online right now.</p>
      )}

      {/* Over the threshold: big crews are event territory — hand off instead
          of selling N self-serve lanes badly. */}
      {overThreshold && (
        <div className="tprs-event-handoff">
          <h3 className="tprs-event-handoff-h">That's a party.</h3>
          <p className="tprs-event-handoff-p">
            Crews of {partySize} are event territory — reserved space, food
            &amp; drink packages, and someone who handles the details. Tell us
            what you're planning and we'll set you up.
          </p>
          <a
            className="tprs-event-handoff-cta"
            href={CUSTOM_EVENT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Plan your event →
          </a>
        </div>
      )}

      {!overThreshold && categories?.map((cat) => {
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
        const lanes = lanesFor(cat); // party-size mode: computed lane count
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
                onClick={() => onSelectProduct(cat, p, lanes ?? undefined)}
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
                  {lanes !== null && partySize !== null ? (
                    /* Group total — the comparison a real human wants: lanes
                       computed for THEIR crew × that day's lowest lane price. */
                    <p className="tprs-card-from">
                      <strong>
                        {lanes} {lanes === 1 ? "lane" : "lanes"}
                      </strong>{" "}
                      for your {partySize} · <span>from</span>{" "}
                      {formatUsd(
                        lanes *
                          (availability.productPriceFor(p.id, day) ??
                            p.defaultPriceCents),
                      )}
                    </p>
                  ) : (
                    <p className="tprs-card-from">
                      <span>from</span> {formatUsd(p.defaultPriceCents)}
                    </p>
                  )}
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
      {!overThreshold && hidden.length > 0 && (
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
