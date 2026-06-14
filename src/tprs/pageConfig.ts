// Per-URL booking page config (ADR-0025 §1 `pageConfig` — terms + UX copy live
// client-side; no backend URL-config entity at v1). `bookingPageConfig` is the
// `/reserve-preview` (open-bowl) config: curated via `productCodes` to the four
// lane-rental products (1hr/2hr × Traditional/VIP) so the grid is just the
// open-bowl lanes, not the birthday packages / NYE products that also come back
// from `/api/products/bookable`. Curated child pages (vip-suite, birthdays) get
// their own config — see the how-to block at the bottom.
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
   * Per-URL hero image band (compact, ~40vh — identity + vibe, NOT Roller's
   * full-screen collapsing hero; the date question must peek into the first
   * viewport). `base` is a pre-encoded /snap/ basename — encode 540/1080/1600
   * AVIF+WebP via sharp (see reserve-hero-*). Unset = typography-only hero.
   * Each booking page gets its own shot at cutover (birthdays/NYE/suite).
   */
  heroImage?: {
    base: string;
    alt: string;
  };
  /**
   * Duration-led TILES instead of image cards. For pages whose products differ
   * only by duration within a category (the open-bowl lanes: 1hr/2hr), the
   * card's whole job is duration + price — a thumbnail repeats the name or
   * shows a placeholder, earning none of its space (the hero owns atmosphere).
   * Tiles render the duration big (from `durationMinutes`, so no admin rename
   * needed; full product name stays on detail/cart/receipts) over the "from"
   * price, matching the time-slot tile vocabulary. Pages whose products SELL
   * via art (birthdays, NYE) keep standard image cards (unset/false).
   */
  tileCards?: boolean;
  /**
   * Tile background art by CATEGORY slug (tile mode only) — the room is what
   * differs between sections (suite vs traditional floor), so imagery belongs
   * at category level: two photos total, no per-product art to maintain, and
   * the VIP tile shows what the upgrade buys. `base` = pre-encoded /snap/
   * basename with a -540 variant (avif+webp). Scrimmed for text legibility.
   */
  tileArt?: Record<string, { base: string; alt?: string }>;
  /**
   * Short caution badge on a product's grid card/tile, keyed by integer code —
   * sets expectations BEFORE the click. Used for the 1-hour lanes, whose time
   * slots are intentionally limited: the badge nudges toward the 2-hour option
   * up front instead of letting the guest discover a near-empty time grid on the
   * detail screen. Copper (--tw-danger) caution treatment, not alarm. Keep it
   * terse (≤~14 chars); unset codes show no badge.
   */
  cardNotes?: Record<number, string>;
  /**
   * Quantity-step wording — editable PER PAGE since we almost always sell by
   * the lane but the framing varies (/nye, /birthday, etc.). `quantityLabel`
   * is the question ("How many lanes?"); `quantityHelp` is the line beneath it
   * (defaults to the product category's capacity subtitle when unset).
   */
  quantityLabel?: string;
  quantityHelp?: string;
  /**
   * Show the product short description on the grid cards + the "What you're
   * reserving" recap (default true). Pages whose products are self-explanatory
   * from the name alone (e.g. "1 Hour w/ Shoes (VIP Suite)") set false — the
   * pitch line adds scroll, not information. The DETAIL screen's long copy is
   * unaffected.
   */
  cardDescriptions?: boolean;
  /**
   * Party-size-first mode (the /reserve-preview2 experiment): ask the in-store
   * question — how many GUESTS (not bowlers: spectators count, they need a
   * place to be) — and let the page do the lane math. Each product card shows
   * COMPUTED lanes + a group "from" total (lanes × that day's lowest lane
   * price); entering a product pre-fills the lane stepper. Above `threshold`
   * the grid yields to an events handoff (big groups are event territory).
   * `capacities` = guests-per-lane by category slug (not in the API yet —
   * mirror the category subtitle copy; re-confirm at the prod-DB cutover).
   * `default` seeds the stepper (most groups are ~4; never really 1).
   * `label`/`help` let each page word the question (birthdays: "How many
   * kids?").
   */
  partySize?: {
    capacities: Record<string, number>;
    threshold: number;
    default?: number;
    label?: string;
    help?: string;
  };
  /**
   * Show the computed end time on the confirmation's when-line (default
   * true → "3:00 PM – 5:00 PM"). Pages whose real-world end can drift from
   * the product's durationMinutes (birthdays: bowling → room-flip → party
   * table) set false so the screen never promises a minute we might not
   * keep — guests see the start time only.
   */
  confirmEndTime?: boolean;
  /**
   * Replace the at-cap events nudge ("Online bookings cap at N lanes here.
   * Need more? That's event territory… Plan your event →") for specific
   * products, keyed by integer code. For a product whose online cap IS the
   * room's entire inventory (NYE VIP: 6 lanes = the whole suite), "need more"
   * routes nowhere — the note should still explain the dead + button, just
   * without the handoff. Plain text, no link. Unset codes keep the default.
   */
  laneCapNotes?: Record<number, string>;
  /**
   * Seed the calendar at this ISO date (yyyy-mm-dd) instead of today — for
   * single-date pages (/reserve/nye) whose products are only bookable on one
   * day, where defaulting to today just shows greyed chips. Ignored once the
   * date is in the past (the page is evergreen; the config shouldn't strand
   * next year's guests on last year's date). The guest can still pick another
   * day if ops ever opens one.
   */
  defaultDate?: string;
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
  // /reserve-preview = open-bowl lanes only. The four lane-rental products by
  // TPRS `code` (NOT the birthday packages / NYE products in the same catalog):
  //   4   → 1 Hour w/ Shoes (Traditional)   $69.95
  //   5   → 2 Hour w/ Shoes (Traditional)   $99.95
  //   121 → 1 Hour w/ Shoes (VIP Suite)     $90.95
  //   123 → 2 Hour w/ Shoes (VIP Suite)     $145.95
  // NOTE: codes are TPRS-DB-specific — re-confirm them at the prod-DB cutover
  // (the temp staging DB re-seeded once already: birthdays went 9→109, 18→118).
  productCodes: [4, 5, 121, 123],
  // The four lane names say everything ("1 Hour w/ Shoes (VIP Suite)") — the
  // pitch line under each card was scroll without information.
  cardDescriptions: false,
  // Compact identity hero (encoded from Context/og images/bowl.jpg).
  heroImage: {
    base: "/snap/reserve-hero",
    alt: "Bowling lanes at Twisted Pin",
  },
  // Lanes differ only by duration within a category → duration tiles, no
  // per-product art to source/maintain on this page.
  tileCards: true,
  // Category room shots behind the tiles — Jon's picks (Context/pictures/
  // "VIP for front end.jpg" / "traditional for front end.jpg", encoded 540w).
  tileArt: {
    vip_suite_lanes: { base: "/snap/tile-vip", alt: "" },
    traditional_lanes: { base: "/snap/tile-trad", alt: "" },
  },
  // The 1-hour slots (both rooms) are intentionally scarce — flag them on the
  // card so the guest is steered to the 2-hour option before they hit the thin
  // time grid (which already carries the long "LIMITED…check the 2 hour options"
  // note). 4 = 1hr Traditional, 121 = 1hr VIP.
  cardNotes: {
    4: "Limited times",
    121: "Limited times",
  },
  // Generic operational terms only — per-product capacity ("5 / 6 guests per
  // lane") lives in each product's booking-form acknowledgements + card copy, so
  // it isn't asserted here (where it can't be product-accurate).
  termsText:
    "Reservations hold your lanes for the time you select. " +
    "Cancellations must be made at least 72 hours before your reservation to avoid forfeiting payment. " +
    "You can add time to your lane based on availability — if no group is booked in behind you, we're glad to sell you more. " +
    "Outside food and drink isn't permitted — the bar and kitchen have you covered. " +
    "Arrive a few minutes early to get your group set up.",
  uxCopy: {
    eyebrow: "Reserve a Lane",
    headline: "Book your night.",
    // Outlaw register (voice.md) — pokes at the line you skip by reserving.
    // Swap freely; alternates floated in chat (DMV line, "skip the line", etc.).
    sub: "Reserve now — the line's for people who didn't.",
  },
  // (Birthday guest-stepper mappings live on birthdaysPageConfig below — the
  // stale pre-re-seed copies that sat here were inert on this curated page.)
};

/**
 * /reserve-preview2 — the PARTY-SIZE-FIRST experiment (A/B against
 * /reserve-preview, parked). Same four lane products; the difference is the
 * "How many bowlers?" stepper driving computed lanes + group totals + the
 * over-threshold events handoff. Compare on a phone; whichever wins becomes
 * /reserve at cutover and the other config is deleted.
 */
export const bookingPage2Config: BookingPageConfig = {
  ...bookingPageConfig,
  uxCopy: {
    // "Book Bowling", not "Reserve a Lane" — guests reserve bowling for a
    // GROUP; lanes are our unit, not theirs (the whole thesis of this variant).
    eyebrow: "Book Bowling",
    headline: "Book your night.",
    // The variant's thesis in one line — the page does the lane math.
    sub: "Tell us the crew size — we'll handle the lane math.",
  },
  partySize: {
    // Guests-per-lane by category slug (mirrors each category's subtitle copy:
    // VIP couches seat 6, traditional lanes 5). Slugs from /api/products/bookable.
    capacities: { vip_suite_lanes: 6, traditional_lanes: 5 },
    // Over this many guests → events handoff (3+ traditional lanes territory;
    // ops can tune — it's just this number).
    threshold: 15,
    // Seed at 4 — groups are almost never 1-2; guests step from a realistic start.
    default: 4,
    // GUESTS, not bowlers (ops): 15 people with 5 bowling still need space for
    // 15 — everyone gets counted so the lanes fit the whole group.
    label: "How many guests?",
    help: "Count everyone — bowling or not, they need a place to be. We'll size the lanes to fit.",
  },
};

/**
 * /reserve/birthdays — kids birthday party bookings (PARKED at its REAL slug:
 * the /reserve→Roller redirect is exact-match, so the nested path is free today
 * and launch needs no rename — just repoint the /birthday-parties-booking
 * lander's ROLLER_KIDS_URL here + lift noindex/robots/sitemap).
 *
 * Packages sell via copy + art, so STANDARD cards (no tileCards) with
 * descriptions ON. Quantity is the GUEST STEPPER (base 10 kids + the required
 * "Additional Guest" add-on, cap 14 → over-cap note routes to the events
 * planner). Codes re-derived from the live catalog 2026-06-10.
 */
export const birthdaysPageConfig: BookingPageConfig = {
  // 109 → Suite Birthday Party        $419.00 · 2hr   · kids 4-12
  // 118 → Extra Suite Birthday        $469.90 · 2.5hr · kids 4-12
  // NOTE: the AGE RANGE in the product short/long descriptions ("kids 4-11" /
  // "turning 4–11") is served by the TPRS catalog (API), NOT this repo — edit
  // those in TPRS admin to match 4–12. This termsText (below) is the only
  // age string the website owns.
  productCodes: [109, 118],
  heroImage: {
    base: "/snap/birthdays-hero",
    alt: "The VIP suite set for a party at Twisted Pin",
  },
  termsText:
    "Reservations hold your party space for the scheduled window. " +
    "Packages are for ages 4–12, with a max of 14 kids. " +
    "Cancellations must be made at least 72 hours before your reservation to avoid forfeiting payment. " +
    "Arrive a few minutes early so your party host can get everyone set up.",
  uxCopy: {
    eyebrow: "Kids Birthday Parties",
    headline: "Book the party.",
    sub: "Two hours, zero cleanup. Bowling, arcade, food, cake — and a party host who handles it.",
  },
  // Party flow is bowling → room flip → party table; the wall-clock end can
  // drift from the package's durationMinutes, so the confirmation shows the
  // START time only (never promise a minute we might not keep).
  confirmEndTime: false,
  // Base package is priced for 10 kids; +/- drives the per-guest add-on
  // (max 4 → hard cap 14, then the "bigger event" note takes over).
  guestSteppers: {
    109: { baseGuests: 10, addOnCode: 110, label: "How many kids?" },
    118: { baseGuests: 10, addOnCode: 119, label: "How many kids?" },
  },
};

/**
 * /reserve/nye — New Year's Eve party-slot bookings (PARKED at its REAL slug,
 * same mechanic as /reserve/birthdays: the /reserve→Roller redirect is
 * exact-match, so the nested path is free today and launch is just the
 * parked-triad lift + funnel repoint — no rename).
 *
 * TWO products — one per room (90min party slots, max 6 lanes/booking each) —
 * that sell via their included-list copy, so STANDARD description cards (no
 * tileCards) with descriptions ON. Quantity is the normal lane stepper;
 * per-lane capacity differs by room (VIP 6 / traditional 5) so capacity copy
 * stays at category level, never page level. The NYE Arcade Mega Deal (125)
 * rides along as a regular optional add-on; no guest stepper. Codes
 * re-verified against the live catalog 2026-06-11.
 */
export const nyePageConfig: BookingPageConfig = {
  // 124 → NYE Party VIP Lanes          $129.95 · 90min · max 6 lanes per booking
  // 126 → NYE Party Traditional Lanes  $109.95 · 90min · max 6 lanes per booking
  productCodes: [124, 126],
  // Both packages are bookable ONLY on NYE (ops is restricting availability in
  // the backend) — seed the calendar there instead of today.
  defaultDate: "2026-12-31",
  // At 6 VIP lanes the guest holds the ENTIRE suite — there's nothing more to
  // sell, so the default "need more? plan an event" nudge is nonsense there.
  // Traditional (126) keeps the default: 6 of 17 lanes, bigger nights really
  // are event territory.
  laneCapNotes: {
    124: "That's the whole suite — all six lanes are yours for the night.",
  },
  heroImage: {
    base: "/snap/nye-reserve-hero",
    alt: "The VIP suite at Twisted Pin mid-party",
  },
  // No per-lane capacity here — it differs by room (VIP 6 / traditional 5) and
  // the category subtitles + product copy carry the accurate numbers.
  termsText:
    "Reservations hold your lanes for the party time slot you select. " +
    "Each lane comes with shoes, a large pizza, and a pitcher of soda. " +
    "Cancellations must be made at least 72 hours before your reservation to avoid forfeiting payment. " +
    "Outside food and drink isn't permitted — the bar and kitchen have you covered. " +
    "Arrive a few minutes early to get your group set up.",
  uxCopy: {
    eyebrow: "New Year's Eve",
    // The how-to block below floated "Ring it in." for /nye — promoted as-is.
    headline: "Ring it in.",
    // Accuracy guard: only the 10pm slot includes the champagne toast, so the
    // sub can't promise midnight to every slot.
    sub: "Pick your party slot. Unlimited bowling, pizza, and party favors — the 10pm crew gets the midnight toast.",
  },
  // quantityLabel/quantityHelp left to defaults — "How many lanes?" with the
  // category's own capacity subtitle (the rooms hold different counts).
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
