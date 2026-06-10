// The single multi-step booking island (ADR-0029 §1). v2.0 flow (Roller-informed):
//   main (date strip + curated products) → detail (date strip + time + lanes) →
//   add-ons → guest details (+ ADR-0030 forms + "Have a code?").
// Lean read-only cut — no backend writes (no cart-hold / PaymentIntent / convert;
// those are Slice 2, gated on the cookie amendment + Stripe).

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./tprs.css";
import {
  wizardReducer,
  initialState,
  STEP_ORDER,
  STEP_LABELS,
  lineItemSubtotalCents,
  couponDiscountCents,
} from "./state";
import { useQuote } from "./useQuote";
import { useStepHistory } from "./useStepHistory";
import { toIsoWithOffset } from "./format";
import type {
  CheckoutItem,
  FormAnswerInput,
  QuoteRequest,
} from "../../tprs/schemas";
import {
  bookingPageConfig,
  DEFAULT_QUANTITY_LABEL,
  type BookingPageConfig,
} from "../../tprs/pageConfig";
import { resolveGuestStepper } from "./guestStepper";
import StickySummary from "./StickySummary";
import BookingContext from "./BookingContext";
import MainStep from "./steps/MainStep";
import DetailStep from "./steps/DetailStep";
import AddOnsStep from "./steps/AddOnsStep";
import GuestDetailsStep from "./steps/GuestDetailsStep";
import PaymentStep from "./steps/PaymentStep";
import ConfirmationStep from "./steps/ConfirmationStep";

interface Props {
  /** The page's config (ADR-0025 §1) — `productCodes` curates a page (e.g.
   *  /nye); absent = full bookable catalog. Same wizard, different config. */
  config?: BookingPageConfig;
}

export default function BookingWizard({ config = bookingPageConfig }: Props) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  // Browser/OS Back button steps back through the wizard instead of leaving the
  // page (critical on mobile). State-only history — URL stays /reserve-preview/.
  useStepHistory(state, dispatch);

  const currentIdx = STEP_ORDER.indexOf(state.step);
  const isDone = state.step === "confirmation";
  const progressPct = isDone
    ? 100
    : ((currentIdx + 1) / STEP_ORDER.length) * 100;

  // H1 — on step change, snap the view back to the top of the wizard so the
  // next step isn't left scrolled off-screen (the `scroll-margin-top` in CSS
  // keeps it clear of the fixed site header). Skips the very first render.
  const topRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state.step]);

  // Required booking-form fields satisfied? Gates "Continue to payment" (the
  // server also rejects an incomplete set at convert with form_answer_invalid).
  const [formComplete, setFormComplete] = useState(true);

  // A "guests" product (base package + per-guest add-on) vs the lane default.
  const guestStepper = useMemo(
    () => resolveGuestStepper(config, state.product),
    [config, state.product],
  );

  // The add-ons step is skipped when nothing is left to choose — i.e. no add-ons,
  // or the only one is the guest add-on (already handled by the guest stepper).
  const noAddOns =
    (state.product?.addOnProducts ?? []).filter(
      (a) => a.id !== guestStepper?.addOn.id,
    ).length === 0;

  // The priced line set (lane + selected add-ons) — the SAME list sent to quote,
  // payment-intents, and convert. "lane" is the base line; add-ons key on their id.
  const checkoutItems = useMemo<CheckoutItem[]>(() => {
    if (!state.product) return [];
    return [
      { productId: state.product.id, quantity: state.laneQty, cartLineRef: "lane" },
      ...state.product.addOnProducts
        .filter((a) => (state.addOnQtys[a.id] ?? 0) > 0)
        .map((a) => ({
          productId: a.id,
          quantity: state.addOnQtys[a.id],
          cartLineRef: a.id,
        })),
    ];
  }, [state.product, state.laneQty, state.addOnQtys]);

  // Server-authoritative quote (subtotal + tax + total) — recomputed whenever
  // the cart contents / time / coupon change. The SPA never computes tax; it
  // displays the returned totals. Null (→ pre-tax fallback) until a slot exists.
  const quoteRequest: QuoteRequest | null = useMemo(() => {
    if (!state.slot || !state.product || !state.date || checkoutItems.length === 0)
      return null;
    return {
      items: checkoutItems,
      startTime: toIsoWithOffset(state.date, state.slot.time),
      couponCode: state.couponCode.trim() || undefined,
      // claimsTaxExempt: no tax-exempt checkbox in the UI yet → omitted.
    };
  }, [state.slot, state.product, state.date, checkoutItems, state.couponCode]);
  const {
    quote,
    loading: quoteLoading,
    unavailable: quoteUnavailable,
  } = useQuote(quoteRequest);

  const handleNext = useCallback(() => {
    // The payment step owns its own Pay action (Stripe confirm → convert →
    // CONVERTED), so there's no sticky-bar "next" out of it.
    if (state.step === "payment") return;
    // Skip the add-ons step entirely when the product has none (no empty screen).
    if (state.step === "detail" && noAddOns) {
      dispatch({ type: "GO_STEP", step: "guest" });
      return;
    }
    const idx = STEP_ORDER.indexOf(state.step);
    if (idx < STEP_ORDER.length - 1) {
      dispatch({ type: "GO_STEP", step: STEP_ORDER[idx + 1] });
    }
  }, [state.step, noAddOns]);

  const handleBack = useCallback(() => {
    // Unify the in-wizard Back with the browser/OS Back: both go through history
    // so the step ↔ history mirror stays in sync (useStepHistory maps popstate →
    // the previous step, honoring the add-ons skip via the entry it pops to). At
    // the first step there's nothing to step back to in-wizard.
    if (state.step === "main") return;
    history.back();
  }, [state.step]);

  // Stable identity so FormRenderer's answer effect doesn't loop.
  const handleFormAnswers = useCallback(
    (answers: FormAnswerInput[]) =>
      dispatch({ type: "SET_FORM_ANSWERS", answers }),
    [],
  );

  return (
    <div className="tprs-wizard">
      {/* Scroll anchor for the step-change reset (H1). */}
      <div ref={topRef} className="tprs-anchor" aria-hidden="true" />

      <div
        className="tprs-progress"
        role="progressbar"
        aria-valuenow={isDone ? STEP_ORDER.length : currentIdx + 1}
        aria-valuemin={1}
        aria-valuemax={STEP_ORDER.length}
        aria-label={`${STEP_LABELS[state.step]} — step ${isDone ? STEP_ORDER.length : currentIdx + 1} of ${STEP_ORDER.length}`}
      >
        <span className="tprs-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Desktop: 2-col (flow + sticky cart rail). Mobile: single column with
          the cart as a fixed bottom bar (CSS-driven). */}
      <div className="tprs-layout">
        <div className="tprs-main">
      {state.step === "main" && (
        <MainStep
          productCodes={config.productCodes}
          showDescriptions={config.cardDescriptions !== false}
          partyConfig={config.partySize}
          partySize={state.partySize}
          onPartySize={(size) => dispatch({ type: "SET_PARTY_SIZE", size })}
          selectedDate={state.date}
          onPickDate={(date) => dispatch({ type: "SET_DATE", date })}
          onSelectProduct={(category, product, laneQty) =>
            dispatch({ type: "SELECT_PRODUCT", category, product, laneQty })
          }
        />
      )}

      {state.step === "detail" && state.date && state.product && (
        <DetailStep
          date={state.date}
          category={state.category}
          product={state.product}
          selectedSlot={state.slot}
          laneQty={state.laneQty}
          quantityLabel={config.quantityLabel ?? DEFAULT_QUANTITY_LABEL}
          quantityHelp={config.quantityHelp}
          guestStepper={guestStepper}
          addOnQtys={state.addOnQtys}
          onPickDate={(date) => dispatch({ type: "SET_DATE", date })}
          onSlot={(slot) => dispatch({ type: "SET_SLOT", slot })}
          onLaneQty={(qty) => dispatch({ type: "SET_LANE_QTY", qty })}
          onAddOnQty={(addOnId, qty) =>
            dispatch({ type: "SET_ADDON_QTY", addOnId, qty })
          }
          onRemoveLane={() => dispatch({ type: "REMOVE_LANE" })}
        />
      )}

      {(state.step === "addons" ||
        state.step === "guest" ||
        state.step === "payment") &&
        state.product &&
        state.date && (
          <BookingContext
            product={state.product}
            date={state.date}
            slot={state.slot}
            laneQty={state.laneQty}
            addOnQtys={state.addOnQtys}
            guestStepper={guestStepper}
            showDescriptions={config.cardDescriptions !== false}
            onEdit={() => dispatch({ type: "GO_STEP", step: "detail" })}
          />
        )}

      {state.step === "addons" && state.product && (
        <AddOnsStep
          product={state.product}
          addOnQtys={state.addOnQtys}
          hideAddOnId={guestStepper?.addOn.id}
          onQty={(addOnId, qty) =>
            dispatch({ type: "SET_ADDON_QTY", addOnId, qty })
          }
          onSkip={handleNext}
        />
      )}

      {state.step === "guest" && state.product && state.date && state.slot && (
        <GuestDetailsStep
          guest={state.guest}
          onGuestField={(field, value) =>
            dispatch({ type: "SET_GUEST_FIELD", field, value })
          }
          productId={state.product.id}
          date={state.date}
          slotTime={state.slot.time}
          laneQty={state.laneQty}
          couponCode={state.couponCode}
          couponResult={state.couponResult}
          onCouponCode={(code) => dispatch({ type: "SET_COUPON_CODE", code })}
          onCouponResult={(result) =>
            dispatch({ type: "SET_COUPON_RESULT", result })
          }
          onFormAnswers={handleFormAnswers}
          onFormValidityChange={setFormComplete}
        />
      )}

      {state.step === "payment" && state.product && state.date && state.slot && (
        <PaymentStep
          customer={{
            firstName: state.guest.firstName.trim(),
            lastName: state.guest.lastName.trim(),
            email: state.guest.email.trim(),
            phone: state.guest.phone.trim(),
            zip: state.guest.zip.trim(),
          }}
          cartHoldItems={[
            {
              productId: state.product.id,
              quantity: state.laneQty,
              cartLineRef: "lane",
              startTime: toIsoWithOffset(state.date, state.slot.time),
            },
          ]}
          checkoutItems={checkoutItems}
          eventDate={state.date}
          startTime={toIsoWithOffset(state.date, state.slot.time)}
          couponCode={state.couponCode.trim() || undefined}
          formAnswers={state.formAnswers}
          termsText={config.termsText}
          totalCents={
            quote
              ? quote.totalIncludingTax
              : Math.max(0, lineItemSubtotalCents(state) - couponDiscountCents(state))
          }
          onConverted={(booking) => dispatch({ type: "CONVERTED", booking })}
        />
      )}

      {state.step === "confirmation" && state.product && state.date && (
        <ConfirmationStep
          product={state.product}
          date={state.date}
          slot={state.slot}
          laneQty={state.laneQty}
          booking={state.booking}
          totalCents={
            quote
              ? quote.totalIncludingTax
              : Math.max(0, lineItemSubtotalCents(state) - couponDiscountCents(state))
          }
          guestEmail={state.guest.email}
          onReset={() => dispatch({ type: "RESET" })}
        />
      )}
        </div>

        {state.step !== "confirmation" && (
        <StickySummary
          state={state}
          quote={quote}
          quoteLoading={quoteLoading}
          quoteUnavailable={quoteUnavailable}
          formComplete={formComplete}
          onBack={handleBack}
          onNext={handleNext}
          onLaneQty={(qty) => dispatch({ type: "SET_LANE_QTY", qty })}
          onAddOnQty={(addOnId, qty) =>
            dispatch({ type: "SET_ADDON_QTY", addOnId, qty })
          }
          onRemoveLane={() => dispatch({ type: "REMOVE_LANE" })}
        />
        )}
      </div>
    </div>
  );
}
