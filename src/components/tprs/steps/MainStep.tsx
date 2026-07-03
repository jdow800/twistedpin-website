// Step 1 (v2.0) — the merged main screen: date strip on top, curated products
// right below, all on one screen (Roller pattern). Seeing the day while you
// choose the product is the anti-"booked the wrong day" guard. Products are
// driven by pageConfig.productCodes (curated, e.g. /nye) or the full bookable
// catalog (generic /tprs). Cards are TEXT-FORWARD — copy leads, image demoted
// to a side thumbnail (nobody picks bowling off a photo; and our catalog has no
// real imagery yet, so a small fallback reads far better than a big empty tile).

import { useEffect, useMemo, useState } from "react";
import DateStrip from "../DateStrip";
import { useDayAvailability, loadDaySlots } from "../useAvailability";
import { getBookableProducts } from "../../../tprs/client";
import type {
  BookableCategory,
  CustomerProduct,
} from "../../../tprs/schemas";
import { formatUsd, todayIso, addDays, formatDateLong, monthOf } from "../format";
import Markdown from "../Markdown";
import { toPlainText } from "../../../tprs/text-dialect";
import {
  CUSTOM_EVENT_URL,
  type BookingPageConfig,
} from "../../../tprs/pageConfig";
import { laneMaxFor } from "../state";

interface Props {
  productCodes?: number[];
  /** Render each card's short-description line (pageConfig.cardDescriptions). */
  showDescriptions?: boolean;
  /** Duration-led tiles instead of image cards (pageConfig.tileCards). */
  tileCards?: boolean;
  /** Category room shots behind the tiles (pageConfig.tileArt, by slug). */
  tileArt?: Record<string, { base: string; alt?: string }>;
  /** Short caution badge per product code (pageConfig.cardNotes) — e.g.
   *  "Limited times" on the intentionally-scarce 1-hour lanes. */
  cardNotes?: Record<number, string>;
  /** "Coming soon" beat (pageConfig.presaleNotice) — shown on the canonical
   *  defaultDate when the page's products aren't on sale yet, in place of the
   *  bare "sitting this one out" list. */
  presaleNotice?: BookingPageConfig["presaleNotice"];
  /** Always-on booking-window explainer (pageConfig.windowNotice) — tells guests
   *  the calendar's short window is the online cap, not a sellout, and routes
   *  bigger groups / outside food to events. Absent = no notice. */
  windowNotice?: BookingPageConfig["windowNotice"];
  /** Party-size-first mode (pageConfig.partySize) — the /reserve-preview2
   *  experiment. GUESTS, not bowlers: spectators count, they need a place to
   *  be. Absent = catalog behavior, identical to /reserve-preview. */
  partyConfig?: BookingPageConfig["partySize"];
  /** Per-page wording for the selection step when the unit isn't "lanes"
   *  (pageConfig.selectionCopy) — a seated event sells seats. Each field falls
   *  back to the lane default. */
  selectionCopy?: BookingPageConfig["selectionCopy"];
  partySize: number | null;
  onPartySize: (size: number | null) => void;
  /** Seed the calendar here instead of today (pageConfig.defaultDate) — for
   *  single-date pages (/reserve/nye). Past dates fall back to today. */
  defaultDate?: string;
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

/** "1 Hour" / "2 Hours" from durationMinutes — the tile's headline. Falls back
 *  to the product name when duration is unset. */
function durationLabel(mins: number | null): string | null {
  if (!mins || mins <= 0) return null;
  if (mins % 60 === 0) {
    const h = mins / 60;
    return h === 1 ? "1 Hour" : `${h} Hours`;
  }
  return `${mins} min`;
}

export default function MainStep({
  productCodes,
  defaultDate,
  showDescriptions = true,
  tileCards = false,
  tileArt,
  cardNotes,
  presaleNotice,
  windowNotice,
  partyConfig,
  selectionCopy,
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

  // Default the date on first mount: the page's configured date when one is
  // set and still ahead (single-date pages like /reserve/nye), else today
  // (Roller defaults "Today" selected). DateStrip's recenter effect rotates
  // the strip to a far-future seed; its smart-forward treats a not-yet-loaded
  // selection as valid, so it won't stomp the seed while Dec is in flight.
  useEffect(() => {
    if (selectedDate === null)
      onPickDate(defaultDate && defaultDate >= today ? defaultDate : todayIso());
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

  // PREFETCH the selected day's time slots for the page's products while the
  // guest is still choosing a card — by the time they tap one, DetailStep's
  // slot load is a cache hit (or joins the in-flight request) instead of a
  // ~0.5s first-view fetch. Curated pages only (≤4 products; the generic
  // catalog is too broad to warm blindly), available-products only, and
  // re-fires are absorbed by the loadDaySlots cache.
  useEffect(() => {
    if (!dateScoped || !categories) return;
    for (const cat of categories) {
      for (const p of cat.products) {
        if (availability.isProductAvailable(p.id, day) === true) {
          void loadDaySlots(p.id, day).catch(() => {});
        }
      }
    }
  }, [dateScoped, categories, day, availability]);

  // Party-size mode: the page does the lane math. ceil(guests ÷ per-lane
  // capacity) per category; over the threshold the grid yields to the events
  // handoff (big crews are event territory, not self-serve).
  const lanesFor = (cat: BookableCategory): number | null => {
    if (!partyConfig || partySize === null) return null;
    const cap = partyConfig.capacities[cat.slug ?? ""];
    return cap ? Math.ceil(partySize / cap) : null;
  };
  const overThreshold =
    !!partyConfig && partySize !== null && partySize > partyConfig.threshold;

  // Per-product ONLINE lane caps make some setups too small for the group
  // before the events threshold hits (VIP caps at 2 lanes = 12 guests; a crew
  // of 13-15 must NOT be offered VIP — clamping lanes would seat 12 of 15 and
  // ops eats the difference at the door). Too-big products are pulled from the
  // grid and listed honestly with their real fit.
  const tooBig: { p: CustomerProduct; maxGuests: number }[] = [];
  if (partyConfig && partySize !== null && !overThreshold && categories) {
    for (const cat of categories) {
      const cap = partyConfig.capacities[cat.slug ?? ""];
      if (!cap) continue;
      const lanes = Math.ceil(partySize / cap);
      for (const p of cat.products) {
        if (lanes > laneMaxFor(p)) {
          tooBig.push({ p, maxGuests: laneMaxFor(p) * cap });
        }
      }
    }
  }
  const tooBigIds = new Set(tooBig.map((t) => t.p.id));

  // Per-product verdicts for the selected day (curated pages only): a card
  // renders when its product is bookable that day, shimmers while the verdict
  // loads, and drops to the "not running" list when the day is a no for it —
  // including "no remaining times today" (the backend's day flag is
  // time-of-day aware, so after a product's last slot passes it reads false).
  const hidden: { p: CustomerProduct; next: string | null }[] = [];
  if (dateScoped && categories) {
    for (const cat of categories) {
      for (const p of cat.products) {
        if (tooBigIds.has(p.id)) continue; // size rules it out before the date does
        if (availability.isProductAvailable(p.id, day) === false) {
          hidden.push({ p, next: availability.nextOpenFor(p.id, addDays(day, 1)) });
        }
      }
    }
  }

  // Pre-sale beat: the page opts in (presaleNotice) and its products exist but
  // NONE are bookable on the canonical defaultDate yet — the sales window hasn't
  // opened (TPRS engine gates purchase by sales_start). Show the branded "coming
  // soon" notice on that date instead of the bare "sitting this one out" list.
  // Gated on the day's month having LOADED so it never flashes before the
  // verdicts resolve, and on the day BEING the canonical date so it doesn't fire
  // when a guest just navigates to a non-offered day post-launch. Self-resolves
  // once sales open (the date goes bookable → anyBookableToday true). No date is
  // hardcoded here — a moved sales_start needs no change.
  const dayMonthLoaded = availability.isMonthLoaded(monthOf(day));
  const anyBookableToday = !!categories?.some((cat) =>
    cat.products.some((p) => availability.isProductAvailable(p.id, day) === true),
  );
  const showPresale =
    !!presaleNotice &&
    defaultDate != null &&
    day === defaultDate &&
    categories !== null &&
    categories.some((c) => c.products.length > 0) &&
    dayMonthLoaded &&
    !anyBookableToday;

  return (
    <div>
      {/* The in-store question, asked FIRST (guests → date → options): GUESTS,
          not bowlers — 15 people with 5 bowling still need space for 15, so
          everyone gets counted. Seeded from config.default (≈4). */}
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

      <DateStrip
        availability={availability}
        probeKey={probeKey}
        selected={selectedDate}
        onPick={onPickDate}
        label="When are you attending?"
        windowNotice={windowNotice}
      />

      {showPresale && presaleNotice ? (
        <div className="tprs-event-handoff tprs-presale">
          <h3 className="tprs-event-handoff-h">{presaleNotice.heading}</h3>
          <p className="tprs-event-handoff-p">
            <Markdown text={presaleNotice.body} />
          </p>
          {presaleNotice.ctaHref && (
            <a
              className="tprs-event-handoff-cta"
              href={presaleNotice.ctaHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {presaleNotice.ctaLabel ?? "Follow along"}
            </a>
          )}
        </div>
      ) : (
      <>
      {/* Booking-window explainer (pageConfig.windowNotice) — always on, sits
          right under the date picker so the guest reads "this is the window,
          not a sellout" BEFORE concluding the back-half-greyed month means no
          availability. Also hands bigger groups / outside food to events. */}
      {windowNotice && (
        <div className="tprs-window-notice" role="note">
          {windowNotice.heading && (
            <p className="tprs-window-notice-h">{windowNotice.heading}</p>
          )}
          <p className="tprs-window-notice-p">
            <Markdown text={windowNotice.body} />
          </p>
          {windowNotice.eventLine && (
            <p className="tprs-window-notice-event">
              <Markdown text={windowNotice.eventLine} />
            </p>
          )}
          {windowNotice.ctaHref && (
            <a
              className="tprs-window-notice-cta"
              href={windowNotice.ctaHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {windowNotice.ctaLabel ?? "Plan your event →"}
            </a>
          )}
        </div>
      )}

      <h2 className="tprs-h2 tprs-products-h">
        {partySize !== null && !overThreshold
          ? `Your options for ${partySize}`
          : (selectionCopy?.heading ?? "Choose your lanes")}
      </h2>

      {error && <p className="tprs-error">{error}</p>}
      {!error && categories === null && (
        <p className="tprs-loading">{selectionCopy?.loading ?? "Loading lanes…"}</p>
      )}
      {categories?.length === 0 && (
        <p className="tprs-empty">
          {selectionCopy?.empty ?? "No lanes are bookable online right now."}
        </p>
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

      {!overThreshold && categories && (
      <div className="tprs-cats">
      {categories.map((cat) => {
        // Cards for this category on the selected day: bookable + still-loading
        // (skeleton). A category with nothing left that day disappears whole.
        const entries = cat.products.map((p) => ({
          p,
          verdict: dateScoped
            ? availability.isProductAvailable(p.id, day)
            : (true as boolean | undefined),
        }));
        const visible = entries.filter(
          (e) => e.verdict !== false && !tooBigIds.has(e.p.id),
        );
        if (visible.length === 0) return null;
        const lanes = lanesFor(cat); // party-size mode: computed lane count
        const art = tileCards ? tileArt?.[cat.slug ?? ""] : undefined;
        return (
        <section className="tprs-cat" key={cat.slug ?? "uncategorized"}>
          {cat.label && <h3 className="tprs-cat-label">{cat.label}</h3>}
          {cat.subtitle && (
            <p className="tprs-cat-subtitle">
              <Markdown text={cat.subtitle} />
            </p>
          )}
          <div className={`tprs-card-list${tileCards ? " tprs-card-list--tiles" : ""}`}>
            {visible.map(({ p, verdict }) =>
              verdict === undefined ? (
                <div
                  key={p.id}
                  className="tprs-card tprs-card--skel"
                  aria-hidden="true"
                />
              ) : tileCards ? (
                /* Duration tile — the card's whole job here is duration +
                   price (category header carries room/capacity/shoes). Full
                   product name stays in the aria-label + everywhere
                   downstream (detail/cart/receipt). */
                <button
                  type="button"
                  className="tprs-card tprs-tile"
                  key={p.id}
                  aria-label={
                    cardNotes?.[p.code]
                      ? `${toPlainText(p.name)} — ${cardNotes[p.code]}`
                      : toPlainText(p.name)
                  }
                  onClick={() => onSelectProduct(cat, p, lanes ?? undefined)}
                >
                  {art && (
                    <>
                      <picture>
                        <source
                          type="image/avif"
                          srcSet={`${art.base}-540.avif`}
                        />
                        <img
                          className="tprs-tile-art"
                          src={`${art.base}-540.webp`}
                          alt={art.alt ?? ""}
                          loading="lazy"
                          decoding="async"
                        />
                      </picture>
                      <span className="tprs-tile-scrim" aria-hidden="true" />
                    </>
                  )}
                  {cardNotes?.[p.code] && (
                    <span className="tprs-tile-badge">{cardNotes[p.code]}</span>
                  )}
                  <span className="tprs-tile-name">
                    {durationLabel(p.durationMinutes) ?? (
                      <Markdown text={p.name} inline />
                    )}
                  </span>
                  {lanes !== null && partySize !== null ? (
                    <span className="tprs-card-from">
                      <strong>
                        {lanes} {lanes === 1 ? "lane" : "lanes"}
                      </strong>{" "}
                      · <span>from</span>{" "}
                      {formatUsd(
                        lanes *
                          (availability.productPriceFor(p.id, day) ??
                            p.defaultPriceCents),
                      )}
                    </span>
                  ) : (
                    <span className="tprs-card-from">
                      <span>from</span> {formatUsd(p.defaultPriceCents)}
                    </span>
                  )}
                </button>
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
      </div>
      )}

      {/* Setups the group has outgrown ONLINE (per-product lane caps) — honest
          about the real fit, and the suite-wanters get routed to events rather
          than silently squeezed into fewer lanes than their headcount. */}
      {!overThreshold && tooBig.length > 0 && (
        <div className="tprs-not-today">
          <p className="tprs-not-today-label">
            Not sized for {partySize} online
          </p>
          {tooBig.map(({ p, maxGuests }) => (
            <div key={p.id} className="tprs-not-today-row" role="note">
              <span className="tprs-not-today-name">
                <Markdown text={p.name} inline />
              </span>
              <span className="tprs-not-today-next">
                Fits up to {maxGuests}
              </span>
            </div>
          ))}
          <a
            className="tprs-not-today-row tprs-not-today-eventlink"
            href={CUSTOM_EVENT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="tprs-not-today-name">
              Want that setup for your whole crew? That's an event — we do those.
            </span>
            <span className="tprs-not-today-next">Plan it →</span>
          </a>
        </div>
      )}

      {/* What this day can't offer — kept visible (muted, not bookable) so the
          weekend-only lanes stay discoverable; tapping jumps to their next
          open day. One-liner to delete if pure removal wins. */}
      {!overThreshold && hidden.length > 0 && (
        <div className="tprs-not-today">
          {/* Voice: sports idiom > ops-speak ("not running" is schedule
              vocabulary). Date-agnostic — works for today or any picked day;
              the row's payload is the forward pointer ("Next: Saturday →"). */}
          <p className="tprs-not-today-label">Sitting this one out</p>
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
      </>
      )}
    </div>
  );
}
