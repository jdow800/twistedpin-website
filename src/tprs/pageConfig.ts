// Per-URL booking page config (ADR-0025 §1 `pageConfig` — terms + UX copy live
// client-side; no backend URL-config entity at v1). The Slice-1 preview drives
// its product grid from GET /api/products/bookable (the grouped browse surface)
// rather than a curated `codes` list, so `productCodes` is unset here; it stays
// available for when a curated checkout URL is wanted.
//
// Copy obeys the ADR-0029 brand rules: "lanes" never "tickets", "Reserve a
// Lane", no discount vocabulary, English-first.

export interface BookingPageConfig {
  /** Optional curated Product code set (ADR-0025 AH-1). Unset = use bookable. */
  productCodes?: number[];
  /** SPA-rendered terms text (ADR-0025 §1 AH-8). Shown at checkout in Slice 2. */
  termsText: string;
  uxCopy: {
    eyebrow: string;
    headline: string;
    sub: string;
  };
  /**
   * Quantity-step wording — editable PER PAGE since we almost always sell by
   * the lane but the framing varies (/nye, /birthday, etc.). `quantityLabel`
   * is the question ("How many lanes?"); `quantityHelp` is the line beneath it
   * (defaults to the product category's capacity subtitle when unset).
   */
  quantityLabel?: string;
  quantityHelp?: string;
  /**
   * Products that sell a FIXED base package + a per-guest add-on (e.g. the Suite
   * Birthday Party — priced for 10 guests, grows to 14 via the "Additional
   * Guest" add-on). For these, the detail screen shows ONE "How many guests?"
   * stepper whose +/- drives the linked add-on's quantity — base stays fixed —
   * instead of a base-quantity ("How many lanes?") stepper. The base package's
   * own `maxQuantityPerBooking` (1) keeps the package itself uncountable.
   * Keyed by the base product's integer `code`; `baseGuests` is the count the
   * base price covers (the stepper's floor), `addOnCode` the guest add-on.
   */
  guestSteppers?: Record<
    number,
    { baseGuests: number; addOnCode: number; label?: string }
  >;
}

/** Defaults when a page doesn't override the quantity wording. */
export const DEFAULT_QUANTITY_LABEL = "How many lanes?";

/** Default question for a guest stepper when its config doesn't override it. */
export const DEFAULT_GUEST_LABEL = "How many guests?";

/**
 * Where to send guests who outgrow the self-serve packages — over the kids-party
 * guest cap, or trying to book a last-minute / custom event. The Twisted Events
 * (Zite) planner. NOTE: this is the marketing site's "Avery ON" destination; the
 * site's main Plan-an-Event CTA is toggled separately in src/lib/links.ts. Here
 * the planner is always the right target (these are genuinely custom events), so
 * it's pinned, not toggled. */
export const CUSTOM_EVENT_URL = "https://twistedevents.zite.so/";

export const bookingPageConfig: BookingPageConfig = {
  // Generic operational terms only — per-product capacity ("5 / 6 guests per
  // lane") lives in each product's booking-form acknowledgements + card copy, so
  // it isn't asserted here (where it can't be product-accurate).
  termsText:
    "Reservations hold your lanes for the time you select. " +
    "Outside food and drink isn't permitted — the bar and kitchen have you covered. " +
    "Arrive a few minutes early to get your group set up.",
  uxCopy: {
    eyebrow: "Reserve a Lane",
    headline: "Book your night.",
    // Outlaw register (voice.md) — pokes at the line you skip by reserving.
    // Swap freely; alternates floated in chat (DMV line, "skip the line", etc.).
    sub: "Reserve now — the line's for people who didn't.",
  },
  // Birthday party packages: a fixed base (priced for 10 guests) that grows to
  // 14 via a per-guest add-on. One "How many guests?" stepper instead of a
  // base-package counter. Base price + per-guest price are read live off the
  // product/add-on, so each package keeps its own pricing automatically.
  //   9  → Suite Birthday Party  ($419,    +$30/guest via add-on code 10)
  //   18 → Extra Suite Birthday  ($469.90, +$40/guest via add-on code 19)
  guestSteppers: {
    9: { baseGuests: 10, addOnCode: 10 },
    18: { baseGuests: 10, addOnCode: 19 },
  },
};

// ── How to build a curated booking page (e.g. twistedpin.com/nye) ──────────
//
// Every booking page reuses the SAME <BookingWizard>; a page is just a config.
// To curate one to a product subset, set `productCodes` (the integer Product
// codes from TPRS) — the grid + calendar then scope to ONLY those products via
// GET /api/products?codes=… instead of the full bookable catalog. No backend
// work: the endpoint already exists. (When curated-page count or ops-edit
// cadence outgrows hardcoding, graduate to the backend slug-assignment table —
// ADR-0025 §FA-1.)
//
//   // src/tprs/pageConfig.nye.ts
//   export const nyePageConfig: BookingPageConfig = {
//     productCodes: [/* the NYE product codes */],
//     termsText: "…NYE-specific terms…",
//     uxCopy: { eyebrow: "New Year's Eve", headline: "Ring it in.", sub: "…" },
//     quantityLabel: "How many tables?",   // per-page wording (sells by the lane)
//     quantityHelp: "Each table seats up to 6.",
//   };
//
//   // src/pages/nye.astro  (copy of tprs/index.astro)
//   //   import { nyePageConfig } from "../tprs/pageConfig.nye";
//   //   <BookingWizard client:only="react" config={nyePageConfig} />
//   //   render the hero from nyePageConfig.uxCopy
//
// Subtle per-page copy/imagery lives in each config + its .astro hero; the
// checkout UX stays identical across pages by construction.
