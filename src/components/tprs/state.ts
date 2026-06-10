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
export const ZIP_RE = /^\d{5}(-\d{4})?$/;

export function guestComplete(g: GuestFields): boolean {
  return (
    g.firstName.trim() !== "" &&
    g.lastName.trim() !== "" &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.email.trim()) &&
    g.phone.trim() !== "" &&
    ZIP_RE.test(g.zip.trim())
  );
}
