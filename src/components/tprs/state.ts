// Booking-wizard state machine (ADR-0029 §5 flow). Plain useReducer — the
// multi-step state lives in the single island; no global store needed at this
// scale. Slice 1 is the read-only selection phase: nothing here writes to the
// backend (no cart-hold, no PaymentIntent). The shape is built so the Slice-2
// cart-commit/convert wiring can lift `items` + `formAnswers` straight off it.

import type {
  BookableCategory,
  CustomerProduct,
  AvailabilitySlot,
  CouponPreviewResponse,
  FormAnswerInput,
  BookingConvertedResponse,
} from "../../tprs/schemas";

// v2.0 — date + products merged into one "main" screen (Roller pattern); the
// per-product steps follow. The date strip lives on both `main` and `detail`.
// `payment` is a PREVIEW step (no real Stripe/processing yet — see PaymentStep);
// `confirmation` is the terminal success screen (excluded from the progress bar).
export type WizardStep =
  | "main"
  | "detail"
  | "addons"
  | "guest"
  | "payment"
  | "confirmation";

/** Ordered for the progress bar + linear next/back (confirmation is terminal). */
export const STEP_ORDER: WizardStep[] = [
  "main",
  "detail",
  "addons",
  "guest",
  "payment",
];

export const STEP_LABELS: Record<WizardStep, string> = {
  main: "Lanes",
  detail: "Time",
  addons: "Add-ons",
  guest: "Details",
  payment: "Payment",
  confirmation: "Done",
};

export interface GuestFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  zip: string;
}

const EMPTY_GUEST: GuestFields = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  zip: "",
};

export interface WizardState {
  step: WizardStep;
  /** YYYY-MM-DD (Central calendar date). */
  date: string | null;
  /** "How many bowlers?" — the party-size-first experiment (pageConfig.partySize).
   *  Null = not asked / guest skipped; the page then behaves catalog-style. */
  partySize: number | null;
  /** The category the chosen product came from (carries the capacity subtitle). */
  category: BookableCategory | null;
  product: CustomerProduct | null;
  slot: AvailabilitySlot | null;
  laneQty: number;
  /** addOnProductId → quantity (0 = not selected). */
  addOnQtys: Record<string, number>;
  guest: GuestFields;
  /**
   * Marketing-consent checkbox on the guest step (2026-07-19). ONE box covers
   * both channels — its fine print names texts AND emails — so this single
   * value feeds both `marketingOptIn` (email) and `smsMarketingOptIn` on the
   * checkout payload.
   *
   * `undefined` = the guest never touched it, and that is deliberately NOT
   * `false`: the backend treats an explicit `false` as a recorded opt-out
   * decision (ADR-0005 §4 step 4 — "default-without-touch ≠ explicit
   * opt-out"), writing a consent_event that claims a choice the guest never
   * made. Since most guests will simply ignore the box, sending `false` would
   * bury the real opt-outs under noise in the one record that has to hold up
   * as consent evidence. Untouched stays untouched.
   *
   * NOT part of GuestFields — that type is all-strings and drives the
   * required-field validation/scroll machinery, which this must stay out of
   * (it is optional by law: consent can't be a condition of purchase).
   */
  marketingOptIn: boolean | undefined;
  couponCode: string;
  couponResult: CouponPreviewResponse | null;
  /** ADR-0030 captured answers, submitted at convert. */
  formAnswers: FormAnswerInput[];
  /** The convert result (bookingId + invoiceNumber + …); set on success. */
  booking: BookingConvertedResponse | null;
}

export const initialState: WizardState = {
  step: "main",
  date: null,
  partySize: null,
  category: null,
  product: null,
  slot: null,
  laneQty: 1,
  addOnQtys: {},
  guest: EMPTY_GUEST,
  marketingOptIn: undefined,
  couponCode: "",
  couponResult: null,
  formAnswers: [],
  booking: null,
};

/** Soft cap on the base stepper — the fallback when a product carries no max. */
export const MAX_LANE_QTY = 8;

/** Effective max base quantity: the product's per-booking cap, under the soft cap. */
export function laneMaxFor(product: CustomerProduct | null): number {
  const cap = product?.maxQuantityPerBooking ?? MAX_LANE_QTY;
  return Math.min(MAX_LANE_QTY, Math.max(1, cap));
}

/** Effective min base quantity: the product's per-booking floor (≥ 1). */
export function laneMinFor(product: CustomerProduct | null): number {
  return Math.max(1, product?.minQuantityPerBooking ?? 1);
}

export type WizardAction =
  | { type: "SET_DATE"; date: string }
  | { type: "SET_PARTY_SIZE"; size: number | null }
  | {
      type: "SELECT_PRODUCT";
      category: BookableCategory;
      product: CustomerProduct;
      /** Pre-computed lane count (party-size mode does the ceil() math). */
      laneQty?: number;
    }
  | { type: "SET_SLOT"; slot: AvailabilitySlot }
  | { type: "SET_LANE_QTY"; qty: number }
  | { type: "SET_ADDON_QTY"; addOnId: string; qty: number }
  | { type: "SET_GUEST_FIELD"; field: keyof GuestFields; value: string }
  | { type: "SET_MARKETING_OPT_IN"; value: boolean }
  | { type: "SET_COUPON_CODE"; code: string }
  | { type: "SET_COUPON_RESULT"; result: CouponPreviewResponse | null }
  | { type: "SET_FORM_ANSWERS"; answers: FormAnswerInput[] }
  | { type: "CONVERTED"; booking: BookingConvertedResponse }
  | { type: "GO_STEP"; step: WizardStep }
  | { type: "REMOVE_LANE" }
  | { type: "BACK" }
  | { type: "RESET" };

function clampQty(qty: number, product: CustomerProduct | null): number {
  return Math.max(laneMinFor(product), Math.min(laneMaxFor(product), Math.round(qty)));
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "SET_DATE":
      // Date is picked on the main screen (and editable on detail). Changing it
      // invalidates any chosen slot (date-specific price/availability) but keeps
      // the product + step — no auto-advance (Roller single-screen pattern).
      return {
        ...state,
        date: action.date,
        slot: state.date === action.date ? state.slot : null,
      };
    case "SET_PARTY_SIZE":
      return {
        ...state,
        partySize:
          action.size === null ? null : Math.max(1, Math.round(action.size)),
      };
    case "SELECT_PRODUCT":
      return {
        ...state,
        category: action.category,
        product: action.product,
        // New product → reset slot + add-ons (they're product-specific). Seed the
        // base qty at the computed lane count when party-size mode did the math,
        // else the product's per-booking floor (almost always 1).
        slot: null,
        laneQty: clampQty(
          action.laneQty ?? laneMinFor(action.product),
          action.product,
        ),
        addOnQtys: {},
        formAnswers: [],
        step: "detail",
      };
    case "SET_SLOT":
      return { ...state, slot: action.slot };
    case "SET_LANE_QTY":
      return { ...state, laneQty: clampQty(action.qty, state.product) };
    case "SET_ADDON_QTY":
      return {
        ...state,
        addOnQtys: { ...state.addOnQtys, [action.addOnId]: Math.max(0, action.qty) },
      };
    case "SET_GUEST_FIELD":
      return {
        ...state,
        guest: { ...state.guest, [action.field]: action.value },
      };
    case "SET_MARKETING_OPT_IN":
      // Only ever dispatched by an actual toggle, so reaching here always means
      // an explicit decision — `undefined` (untouched) can't be re-entered.
      return { ...state, marketingOptIn: action.value };
    case "SET_COUPON_CODE":
      // Editing the code invalidates the prior preview result.
      return { ...state, couponCode: action.code, couponResult: null };
    case "SET_COUPON_RESULT":
      return { ...state, couponResult: action.result };
    case "SET_FORM_ANSWERS":
      return { ...state, formAnswers: action.answers };
    case "CONVERTED":
      // Booking materialized — freeze the result + land on the confirmation step.
      return { ...state, booking: action.booking, step: "confirmation" };
    case "GO_STEP":
      return { ...state, step: action.step };
    case "REMOVE_LANE":
      // Zeroing the lane out of the cart clears the product selection (+ its
      // add-ons/answers) and returns to the main screen so the guest re-chooses
      // their lanes. The date is kept (they already picked it).
      return {
        ...state,
        product: null,
        category: null,
        slot: null,
        laneQty: 1,
        addOnQtys: {},
        formAnswers: [],
        step: "main",
      };
    case "BACK": {
      const idx = STEP_ORDER.indexOf(state.step);
      return idx <= 0 ? state : { ...state, step: STEP_ORDER[idx - 1] };
    }
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

/* ── Derived selectors ─────────────────────────────────────────────────── */

/** Per-lane price × lanes + add-ons, in cents. Display only. */
export function lineItemSubtotalCents(state: WizardState): number {
  const lanes = state.slot ? state.slot.priceCents * state.laneQty : 0;
  const addOns = state.product
    ? state.product.addOnProducts.reduce((sum, a) => {
        const qty = state.addOnQtys[a.id] ?? 0;
        return sum + a.defaultPriceCents * qty;
      }, 0)
    : 0;
  return lanes + addOns;
}

/** Best-effort would-be discount from a validated coupon preview, in cents. */
export function couponDiscountCents(state: WizardState): number {
  return state.couponResult?.valid
    ? (state.couponResult.discountAmountCents ?? 0)
    : 0;
}

/** US ZIP — 5 digits, or ZIP+4 (`12345` / `12345-6789`). Rejects "6", letters, etc. */
export const ZIP_RE = /^\d{5}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Guest fields in VISUAL/DOM order — drives "scroll to the first thing you
// missed" + the reveal order. KEEP IN SYNC with GuestDetailsStep's markup
// order + input ids below.
export const GUEST_FIELD_ORDER: (keyof GuestFields)[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "zip",
];

export const GUEST_FIELD_DOM_ID: Record<keyof GuestFields, string> = {
  firstName: "g-first",
  lastName: "g-last",
  email: "g-email",
  phone: "g-phone",
  zip: "g-zip",
};

/** Per-field validation message, or null if valid. PURE — no touched gating;
 *  the caller decides whether to SHOW it. Single source of truth for both the
 *  on-blur message and the Continue-time reveal (GuestDetailsStep imports it). */
export function guestFieldError(
  field: keyof GuestFields,
  g: GuestFields,
): string | null {
  const v = g[field].trim();
  if (field === "email") {
    if (v === "") return "Email is required.";
    if (!EMAIL_RE.test(v)) return "Enter a valid email.";
    return null;
  }
  if (field === "zip") {
    if (v === "") return "Required.";
    if (!ZIP_RE.test(v)) return "Enter a 5-digit ZIP.";
    return null;
  }
  if (field === "phone") {
    if (v === "") return "Required.";
    // US-strict (the venue is local): exactly 10 digits, or 11 with a leading
    // country-code 1. This rejects the fat-finger / junk cases (e.g. a 14-digit
    // number) that a looser 10–15 range let through. Can't catch a well-formed
    // fake (5555555555) client-side — that's what SMS confirmation is for.
    const digits = v.replace(/\D/g, "");
    const ok =
      digits.length === 10 || (digits.length === 11 && digits[0] === "1");
    if (!ok) return "Enter a 10-digit phone number.";
    return null;
  }
  return v === "" ? "Required." : null;
}

/** Invalid guest field keys, in DOM order (empty = all valid). */
export function guestInvalidFields(g: GuestFields): (keyof GuestFields)[] {
  return GUEST_FIELD_ORDER.filter((f) => guestFieldError(f, g) !== null);
}

export function guestComplete(g: GuestFields): boolean {
  return guestInvalidFields(g).length === 0;
}
