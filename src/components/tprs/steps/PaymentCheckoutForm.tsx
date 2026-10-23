import { useEffect, useRef, useState, type FormEvent } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { addCartItems, getCart, removeCartLine, createPaymentIntent, convertCheckout, getCheckoutAttemptStatus,
  cancelCheckoutAttempt, TprsCheckoutError, type CheckoutAttemptStatus } from "../../../tprs/client";
import { attemptIdentity, canReleaseCheckout, resolvedCheckoutUrl, recoveryMessage, type CheckoutRecovery } from "../checkoutRecovery";
import { formatUsd } from "../format";
import Markdown from "../Markdown";
import { pointsRewardMessage } from "../pointsRewardCopy";
import type { PaymentProps } from "./PaymentStep";
import { exactSelectionHeld } from "../nye/cartSelection";

const selectionErrors: Record<string, string> = {
  capacity_exhausted: "There aren't enough lanes for this selection. Review another time or lane type.",
  cart_hold_expired: "Your lane hold expired. Review the available times and lanes before continuing.",
  cart_session_required: "We couldn't verify your held lanes. Return to your party choices to check them.",
  cart_revision_conflict: "Your selection changed in another tab. Review your party choices before continuing.",
  cart_mutation_conflict: "Your selection needs another look. Review your party choices before continuing.",
  cart_line_conflict: "Your selection needs another look. Review your party choices before continuing.",
};

function message(error: unknown, preAcquired = false): string {
  if (error instanceof TprsCheckoutError && error.code === "loyalty_reward_rejected") return pointsRewardMessage(error.rewardDetails);
  if (preAcquired && error instanceof TprsCheckoutError && error.code && selectionErrors[error.code]) return selectionErrors[error.code];
  return error instanceof TprsCheckoutError ? error.message : "We couldn't check the payment. Please try again; your saved payment is still protected.";
}
const reviewCodes = new Set(["checkout_review_required", "checkout_review_changed"]);
const rejectedBeforePayment = new Set(["coupon_rejected", "loyalty_reward_rejected", "cart_hold_expired", "capacity_exhausted", "sales_cutoff_exceeded", "form_answer_invalid",
  "holiday_removed", "date_removed", "unscheduled_start", "venue_closed", "outside_venue_hours", "advance_booking_window_exceeded", "sales_not_started", "sales_cutoff",
  "event_date_mismatch", "invalid_window", "invalid_item", "missing_start_time"]);

export default function PaymentCheckoutForm(props: PaymentProps) {
  const stripe = useStripe(), elements = useElements();
  const [cartToken, setCartToken] = useState<string | null>(props.recovery?.cartToken ?? null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [holdBusy, setHoldBusy] = useState(false);
  const [selectionLost, setSelectionLost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [ready, setReady] = useState(false);
  const [reviewNeeded, setReviewNeeded] = useState(false);
  const active = useRef(props.recovery);
  active.current = props.recovery;
  const restored = useRef(!!props.recovery);
  const holdStarted = useRef(false);
  const heldSelectionKey = JSON.stringify(props.preAcquiredSelection ?? null);
  const selectionKey = useRef(heldSelectionKey); selectionKey.current = heldSelectionKey;
  const holdCheck = useRef(0);
  const quoteKey = JSON.stringify(props.quote);
  const priorQuote = useRef(quoteKey);
  const left = expiresAt ? Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000)) : 0;
  const closed = props.salesCutoffMinutesBefore !== null && now >= Date.parse(props.startTime) - props.salesCutoffMinutesBefore * 60000;

  function retain(value: CheckoutRecovery | null) {
    // Parent persists synchronously before any provider confirmation. A storage
    // failure stops payment; never proceed with an un-recoverable new charge.
    try { props.onRecovery(value); }
    catch {
      throw new Error("We couldn't save your payment details in this tab. Please allow browser storage or email contactus@twistedpin.com before continuing.");
    }
    active.current = value;
    props.onLock(!!value);
  }
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (active.current) return;
    if (priorQuote.current !== quoteKey) setTerms(false);
    priorQuote.current = quoteKey;
    if (!props.pricingPending && !props.pricingError) elements?.update({ amount: Math.max(50, props.totalCents) });
  }, [elements, quoteKey, props.pricingPending, props.pricingError, props.totalCents]);

  async function verifyPreAcquiredSelection() {
    const selection = props.preAcquiredSelection;
    if (!selection || active.current) return null;
    const key = heldSelectionKey, check = ++holdCheck.current;
    let cart;
    try { cart = await getCart(); }
    catch {
      if (active.current || selectionKey.current !== key || holdCheck.current !== check) return null;
      setCartToken(null); setExpiresAt(null);
      throw new Error("We couldn't check your held lanes. Try again, or return to your party choices.");
    }
    if (active.current || selectionKey.current !== key || holdCheck.current !== check) return null;
    // The frozen payment request must describe the same complete selection,
    // including non-resource add-ons, that the party picker committed.
    const samePayment = selection.items.length === props.checkoutItems.length && props.checkoutItems.every(want =>
      selection.items.some(have => have.cartLineRef === want.cartLineRef && have.productId === want.productId && have.quantity === want.quantity
        && Date.parse(have.startTime ?? props.startTime) === Date.parse(props.startTime)));
    if (!samePayment || !exactSelectionHeld(cart, selection.items, selection.coverage)) {
      setCartToken(null); setExpiresAt(null); setSelectionLost(true); setTerms(false);
      return null;
    }
    setSelectionLost(false); setCartToken(cart.cartToken); setExpiresAt(cart.holdExpiresAt);
    return cart;
  }
  async function acquireHold(adopt = false) {
    if (active.current || busyRef.current) return;
    setHoldBusy(true); setError(null);
    try {
      if (props.preAcquiredSelection) { await verifyPreAcquiredSelection(); return; }
      const existing = adopt ? await getCart() : null;
      const same = existing?.holdExpiresAt && Date.parse(existing.holdExpiresAt) > Date.now() &&
        props.cartHoldItems.every(want => existing.holds.some(have => have.count === want.quantity && have.cartLineRef === want.cartLineRef && Date.parse(have.startTime) === Date.parse(want.startTime ?? "")));
      if (same && existing) { setCartToken(existing.cartToken); setExpiresAt(existing.holdExpiresAt); }
      else {
        for (const item of props.cartHoldItems) await removeCartLine(item.cartLineRef);
        const held = await addCartItems(props.cartHoldItems);
        setCartToken(held.cartToken); setExpiresAt(held.holdExpiresAt);
      }
    } catch (err) { setError(props.preAcquiredSelection ? "We couldn't check your held lanes. Try again, or return to your party choices." : message(err)); }
    finally { setHoldBusy(false); }
  }
  useEffect(() => {
    if (active.current) return;
    if (props.preAcquiredSelection) { void acquireHold(true); return; }
    if (holdStarted.current) return;
    holdStarted.current = true;
    void acquireHold(true);
  }, [heldSelectionKey]);

  function complete(booking: Parameters<PaymentProps["onConverted"]>[0]) {
    // Stripe's authentication return belongs to this resolved attempt. Leaving
    // its secret in the URL makes a later refresh look like an orphaned payment.
    try { window.history.replaceState(window.history.state, "", resolvedCheckoutUrl(window.location.href)); }
    catch { /* history access must not hide an already confirmed booking */ }
    // A failed local removal is safe: the next status check returns this same
    // server-confirmed booking. Never create a different attempt to repair it.
    try { retain(null); } catch { /* still show the confirmed server result */ }
    props.onConverted(booking);
  }
  function applyStatus(record: CheckoutRecovery, response: CheckoutAttemptStatus): CheckoutRecovery {
    const updated = { ...record, status: response.status };
    retain(updated);
    setError(recoveryMessage(response.status));
    if (response.status === "confirmed" && response.booking) complete(response.booking);
    return updated;
  }
  async function ensureIntent(record: CheckoutRecovery): Promise<CheckoutRecovery> {
    if (record.payment) return record;
    // A lost creation response is retried with the EXACT frozen request + nonce.
    // The server finds this attempt before considering an expired review token.
    const payment = await createPaymentIntent(record.request);
    const updated = { ...record, payment, status: "prepared" as const };
    retain(updated);
    return updated;
  }
  async function finish(record: CheckoutRecovery) {
    if (!record.payment) throw new Error("Missing saved payment reference");
    const identity = attemptIdentity(record);
    const booking = await convertCheckout({
      cartToken: record.cartToken, eventDate: record.request.eventDate, startTime: record.request.startTime,
      items: record.request.items, paymentType: "full", paymentIntentId: record.payment.paymentIntentId,
      acceptedTerms: true, couponCode: record.request.couponCode, formAnswers: record.request.formAnswers,
      ...(identity ?? { legacyClientSecret: record.payment.clientSecret }),
    });
    complete(booking);
  }
  async function inspect(record: CheckoutRecovery, allowConfirm: boolean): Promise<void> {
    if (!stripe || !elements) return;
    record = await ensureIntent(record);
    const identity = attemptIdentity(record);
    if (identity) {
      // A 404 is an unknown payment, never permission to clear it or charge again.
      record = applyStatus(record, await getCheckoutAttemptStatus(identity));
      if (["confirmed", "needs_review", "refund_requested", "refund_failed", "refunded", "cancelled"].includes(record.status)) { setReady(false); return; }
    }
    const provider = await stripe.retrievePaymentIntent(record.payment!.clientSecret);
    if (provider.error || !provider.paymentIntent) throw new Error("Provider status unavailable");
    const status = provider.paymentIntent.status;
    if (status === "succeeded") { setReady(false); await finish(record); return; }
    if (status === "processing" || status === "requires_capture") {
      retain({ ...record, status: "processing" }); setReady(false); setError(recoveryMessage("processing")); return;
    }
    if (status === "canceled") {
      // Provider cancellation is sufficient evidence only for a legacy intent;
      // modern attempts also resolve their server-side coupon reservation.
      if (identity) applyStatus(record, await cancelCheckoutAttempt(identity));
      else retain({ ...record, status: "cancelled" });
      setReady(false); return;
    }
    if (record.status === "processing") { setReady(false); setError(recoveryMessage("processing")); return; }
    if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(status)) throw new Error("Unknown provider status");
    setReady(true);
    if (!allowConfirm) { setError("Your saved payment is ready. Continue payment, or cancel it before editing your reservation."); return; }
    const { error: submitError } = await elements.submit();
    if (submitError) { setError(submitError.message ?? "Check your card details."); return; }
    record = { ...record, confirmStarted: true };
    retain(record); // survives authentication redirects and browser reload
    const confirmed = await stripe.confirmPayment({ elements, clientSecret: record.payment!.clientSecret,
      confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    setReady(false);
    if (confirmed.error) {
      setError(`${confirmed.error.message ?? "The payment wasn't completed."} Check its status, or cancel this payment before trying again.`);
      return;
    }
    // confirmPayment returning without an error does not establish capture.
    await inspect(record, false);
  }
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); props.onLock(true); setError(null);
    try { await work(); }
    catch (err) {
      const record = active.current;
      if (err instanceof TprsCheckoutError && err.code === "payment_recovery_required" && !record?.payment && props.onDiscover) {
        try { await props.onDiscover(); }
        catch { setError("We couldn't recover the saved payment yet. Check its status again, or email contactus@twistedpin.com before making another payment."); }
        return;
      }
      if (err instanceof TprsCheckoutError && !record?.payment && (reviewCodes.has(err.code ?? "") || rejectedBeforePayment.has(err.code ?? "") || !!props.preAcquiredSelection && !!selectionErrors[err.code ?? ""]) && !err.rewardDetails.refundStatus) {
        retain(null); setTerms(false); setReady(false);
        if (props.preAcquiredSelection && err.code && selectionErrors[err.code]) setSelectionLost(true);
        if (reviewCodes.has(err.code ?? "")) { setReviewNeeded(true); props.onRetryPricing?.(); }
        setError(message(err, !!props.preAcquiredSelection));
      } else {
        // Never infer that a generic conversion error means a refund succeeded.
        const refund = err instanceof TprsCheckoutError ? err.rewardDetails.refundStatus : undefined;
        const status = refund === "succeeded" ? "refunded" : refund === "requested" ? "refund_requested" : refund === "failed" ? "refund_failed" : refund === "needs_review" ? "needs_review" : null;
        if (record && status) retain({ ...record, status });
        setError(status ? recoveryMessage(status) : !record && err instanceof Error ? err.message : message(err, !!props.preAcquiredSelection));
      }
    } finally { busyRef.current = false; setBusy(false); props.onLock(!!active.current); }
  }

  // Reload/authentication return performs status/recovery only. Never confirms a
  // card automatically, never reacquires a hold and never replaces the order.
  const checkedRestore = useRef(false);
  useEffect(() => {
    if (!stripe || !elements || !restored.current || checkedRestore.current || !active.current) return;
    checkedRestore.current = true;
    void run(() => inspect(active.current!, false));
  }, [stripe, elements]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || busyRef.current) return;
    if (active.current) { const record = active.current; await run(() => inspect(record, ready)); return; }
    if (!terms || !cartToken || !expiresAt || left <= 0 || holdBusy || closed || props.formStale || props.pricingPending || props.pricingError || !props.quote || reviewNeeded) return;
    if (props.quote.reviewExpiresAt && Date.parse(props.quote.reviewExpiresAt) <= Date.now()) {
      setTerms(false); setReviewNeeded(true); setError("Please review the current total before paying."); props.onRetryPricing?.(); return;
    }
    await run(async () => {
      const validated = await elements.submit();
      if (validated.error) { setError(validated.error.message ?? "Check your card details."); return; }
      // Card validation can take time. Re-read exact live full-cart coverage at
      // the final boundary before accepting a NEW payment request. Retained
      // attempts above never depend on soft inventory or its original timer.
      const verified = props.preAcquiredSelection ? await verifyPreAcquiredSelection() : null;
      if (props.preAcquiredSelection && !verified) return;
      const record: CheckoutRecovery = {
        version: 1, draft: { ...props.draft, step: "payment", booking: null, checkoutLocked: true }, quote: props.quote!, cartToken: verified?.cartToken ?? cartToken,
        request: { customer: props.customer, eventDate: props.eventDate, startTime: props.startTime, items: props.checkoutItems,
          attemptKey: crypto.randomUUID(), couponCode: props.couponCode, formAnswers: props.formAnswers, acceptedTerms: true,
          ...(props.quote!.reviewToken ? { checkoutContractVersion: 1, reviewToken: props.quote!.reviewToken } : {}) },
        confirmStarted: false, status: "creating",
      };
      retain(record);
      await inspect(record, true);
    });
  }
  async function cancelAndEdit() {
    const record = active.current;
    if (!record) return;
    await run(async () => {
      let resolved = record;
      if (!canReleaseCheckout(resolved.status)) {
        resolved = await ensureIntent(resolved);
        const identity = attemptIdentity(resolved);
        if (!identity) { setError("Please email contactus@twistedpin.com to cancel this saved payment before starting another reservation."); return; }
        resolved = applyStatus(resolved, await cancelCheckoutAttempt(identity));
      }
      if (canReleaseCheckout(resolved.status)) {
        window.history.replaceState(window.history.state, "", resolvedCheckoutUrl(window.location.href));
        retain(null); setTerms(false); setReady(false); props.onFindNewTime();
      }
    });
  }

  const saved = props.recovery;
  if (props.preAcquiredSelection && !saved && !busy && (selectionLost || !!expiresAt && left <= 0)) return <div className="tprs-pay-blocker" role="alert">
    <span className="tprs-pay-blocker__title">Check your party choices</span>
    <p className="tprs-pay-blocker__body">{error ?? "Your held lanes no longer match this party, or the hold has expired. Review your choices before paying."}</p>
    <button type="button" className="tprs-btn tprs-btn--solid" onClick={props.onSelectionLost ?? props.onFindNewTime}>Return to party choices</button>
  </div>;
  if (closed && !saved && !busy) return <div className="tprs-pay-blocker" role="alert">
    <span className="tprs-pay-blocker__title">Online booking for this time has closed</span>
    <p className="tprs-pay-blocker__body">{props.salesClosedMessage ?? "Choose a later time, or come see us at the counter."}</p>
    <button type="button" className="tprs-btn tprs-btn--solid" onClick={props.onFindNewTime}>Find a new time</button>
  </div>;
  return <form onSubmit={submit} className="tprs-pay-form">
    <div hidden={!!saved && !ready || !saved && !!(props.pricingPending || props.pricingError)}>
      <PaymentElement options={{ layout: "tabs", wallets: { link: "never" } }} />
    </div>
    {saved ? <p className="tprs-hold" role="status">{recoveryMessage(saved.status)}</p> : <div className="tprs-hold" aria-live="polite">
      <span>{holdBusy ? "Securing your lanes…" : !cartToken ? "Your lanes aren't held yet." : left <= 0 ? "Your hold expired." : <>Holding your lanes — <strong>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</strong></>}</span>
      {props.preAcquiredSelection ? <>
        {!cartToken && <button type="button" className="tprs-link-btn tprs-link-btn--sm" disabled={holdBusy || busy} onClick={() => void acquireHold(true)}>Check held lanes</button>}
        <button type="button" className="tprs-link-btn tprs-link-btn--sm" disabled={holdBusy || busy} onClick={props.onSelectionLost ?? props.onFindNewTime}>Review party choices</button>
      </> : <button type="button" className="tprs-link-btn tprs-link-btn--sm" disabled={holdBusy || busy} onClick={() => void acquireHold()}>{holdBusy ? "Refreshing…" : "Refresh"}</button>}
    </div>}
    {!saved && <label className="tprs-terms"><input type="checkbox" checked={terms} disabled={busy || !!props.pricingPending || !!props.pricingError || reviewNeeded} onChange={e => setTerms(e.currentTarget.checked)} />
      <span className="tprs-terms-text"><Markdown text={props.termsText} inline /> I agree to the terms above.</span></label>}
    {props.formStale && !saved && <p className="tprs-pay-error-msg" role="alert">Your lane choices need another look. Go back and review them before paying.</p>}
    {error && error !== (saved && recoveryMessage(saved.status)) && <p className="tprs-pay-error-msg" role="alert">{error}</p>}
    {!saved && props.pricingError && <p className="tprs-pay-error-msg" role="alert">{props.pricingError}</p>}
    {!saved && reviewNeeded && <button type="button" className="tprs-link-btn" disabled={!!props.pricingPending || !!props.pricingError || !props.quote} onClick={() => { setReviewNeeded(false); setTerms(false); setError("Review your reservation and current total, then accept the terms to pay."); }}>Review current total: {formatUsd(props.totalCents)}</button>}
    {!saved && props.pricingError && <button type="button" className="tprs-link-btn" onClick={props.onRetryPricing}>Check current price</button>}
    <button type="submit" className="tprs-btn tprs-btn--solid tprs-pay-submit"
      disabled={!stripe || !elements || busy || (!saved && (!terms || reviewNeeded || holdBusy || !cartToken || left <= 0 || props.formStale || props.pricingPending || !!props.pricingError || !props.quote))}>
      {busy ? "Checking…" : saved ? ready ? `Continue payment ${formatUsd(saved.quote.totalIncludingTax)}` : "Check payment status" : props.pricingPending ? "Updating total…" : `Pay ${formatUsd(props.totalCents)}`}
    </button>
    {saved && <button type="button" className="tprs-btn tprs-btn--ghost" disabled={busy} onClick={() => void cancelAndEdit()}>{canReleaseCheckout(saved.status) ? "Edit reservation" : "Cancel payment and edit"}</button>}
    <p className="tprs-pay-note">Payments are processed securely by Stripe.</p>
  </form>;
}
