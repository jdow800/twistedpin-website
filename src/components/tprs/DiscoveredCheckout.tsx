import { useEffect, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { cancelCheckoutAttempt, convertCheckout, getActiveCheckoutAttempt, getCheckoutAttemptStatus, TprsCheckoutError } from "../../tprs/client";
import type { ActiveCheckoutAttempt, BookingConvertedResponse } from "../../tprs/schemas";
import { canReleaseCheckout, resolvedCheckoutUrl, recoveryMessage } from "./checkoutRecovery";
import { formatUsd } from "./format";
import { getStripe, STRIPE_APPEARANCE } from "./stripe";
import { trackConfirmedPurchase } from "./steps/ConfirmationStep";

interface Props {
  attempt: ActiveCheckoutAttempt;
  onSave: (attempt: ActiveCheckoutAttempt) => void;
  onClear: () => void;
  onNewReservation: () => void;
}
const incompleteCheckoutMessage = "This saved checkout is missing required booking details or terms acceptance. Please check its payment status or call (815) 782-7790 before making another payment. An unpaid payment can be cancelled below.";

/** Recovery without a browser draft uses only the server's accepted snapshot. */
export default function DiscoveredCheckout(props: Props) {
  return <Elements stripe={getStripe()} options={{ mode: "payment", amount: Math.max(50, props.attempt.financialSnapshot.totalIncludingTax), currency: "usd", paymentMethodTypes: ["card"], appearance: STRIPE_APPEARANCE }}>
    <RecoveredPayment {...props} />
  </Elements>;
}

function RecoveredPayment(props: Props) {
  const stripe = useStripe(), elements = useElements();
  const [busy, setBusy] = useState(false), running = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingConvertedResponse | null>(null);
  const active = useRef(props.attempt); active.current = props.attempt;
  const checked = useRef(false);
  function retain(attempt: ActiveCheckoutAttempt) {
    // Saving must succeed before any provider confirmation is allowed.
    props.onSave(attempt); active.current = attempt;
    return attempt;
  }
  function complete(result: BookingConvertedResponse) {
    try { history.replaceState(history.state, "", resolvedCheckoutUrl(location.href)); } catch { /* display the verified booking */ }
    try { props.onClear(); } catch { /* retained identity safely recovers the same booking */ }
    setReady(false); setBooking(result);
    trackConfirmedPurchase(result.invoiceNumber, active.current.financialSnapshot.totalIncludingTax);
  }
  async function inspect(allowConfirm: boolean) {
    setReady(false);
    let attempt = active.current;
    const identity = { attemptId: attempt.attemptId, recoveryToken: attempt.recoveryToken };
    const status = await getCheckoutAttemptStatus(identity);
    attempt = retain({ ...attempt, status: status.status, paymentIntentId: status.paymentIntentId ?? attempt.paymentIntentId });
    if (status.status === "confirmed" && status.booking) { complete(status.booking); return; }
    if (["confirmed", "needs_review", "refund_requested", "refund_failed", "refunded", "cancelled"].includes(status.status)) return;
    if (!attempt.clientSecret || !attempt.paymentIntentId) {
      const discovered = await getActiveCheckoutAttempt();
      if (!discovered || discovered.attemptId !== attempt.attemptId) throw new Error("We couldn't resolve this saved payment. Please check again or call (815) 782-7790.");
      attempt = retain(discovered);
      if (!attempt.clientSecret || !attempt.paymentIntentId || attempt.status !== "prepared") return;
    }
    if (!stripe || !elements) return;
    const provider = await stripe.retrievePaymentIntent(attempt.clientSecret);
    if (provider.error || !provider.paymentIntent) throw new Error("We couldn't check your payment. Your original reservation is still saved.");
    if (provider.paymentIntent.status === "succeeded") {
      if (!attempt.paymentReady) {
        setError("Your payment was received, but the saved reservation is missing required booking details or terms acceptance. Please call (815) 782-7790 so our team can help finish it. Do not make another payment.");
        return;
      }
      const result = await convertCheckout({ ...attempt.originalOrder, ...identity, paymentIntentId: attempt.paymentIntentId });
      complete(result); return;
    }
    if (["processing", "requires_capture"].includes(provider.paymentIntent.status)) { retain({ ...attempt, status: "processing" }); return; }
    if (provider.paymentIntent.status === "canceled") {
      const cancelled = await cancelCheckoutAttempt(identity);
      retain({ ...attempt, status: cancelled.status });
      if (cancelled.status === "confirmed" && cancelled.booking) complete(cancelled.booking);
      return;
    }
    if (attempt.status !== "prepared" || !["requires_payment_method", "requires_confirmation", "requires_action"].includes(provider.paymentIntent.status)) return;
    if (!attempt.paymentReady) { setError(incompleteCheckoutMessage); return; }
    setReady(true);
    if (!allowConfirm) return;
    const submitted = await elements.submit();
    if (submitted.error) throw new Error(submitted.error.message ?? "Please check your card details.");
    retain(attempt);
    const confirmed = await stripe.confirmPayment({ elements, clientSecret: attempt.clientSecret, confirmParams: { return_url: location.href }, redirect: "if_required" });
    setReady(false);
    if (confirmed.error) throw new Error(confirmed.error.message ?? "Payment wasn't completed. Check its status before trying again.");
    await inspect(false);
  }
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    try { await work(); }
    catch (err) {
      const refund = err instanceof TprsCheckoutError ? err.rewardDetails.refundStatus : undefined;
      const status = refund === "requested" ? "refund_requested" : refund === "succeeded" ? "refunded" : refund === "failed" ? "refund_failed" : refund === "needs_review" ? "needs_review" : null;
      if (status) { try { retain({ ...active.current, status }); } catch { /* keep the known attempt */ } }
      setError(status ? recoveryMessage(status) : err instanceof TprsCheckoutError && err.code === "form_answer_invalid"
        ? "Your saved reservation needs our team's help with its booking details. Please call (815) 782-7790 before making another payment."
        : err instanceof Error ? err.message : "We couldn't check your payment. Please try again.");
    } finally { running.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (checked.current || !stripe || !elements) return;
    checked.current = true; void run(() => inspect(false));
  }, [stripe, elements]);
  async function cancel() {
    await run(async () => {
      let attempt = active.current;
      if (!canReleaseCheckout(attempt.status)) {
        const result = await cancelCheckoutAttempt({ attemptId: attempt.attemptId, recoveryToken: attempt.recoveryToken });
        attempt = retain({ ...attempt, status: result.status });
        if (result.status === "confirmed" && result.booking) { complete(result.booking); return; }
      }
      if (canReleaseCheckout(attempt.status)) {
        history.replaceState(history.state, "", resolvedCheckoutUrl(location.href));
        props.onClear(); props.onNewReservation();
      }
    });
  }
  const attempt = props.attempt;
  const start = new Date(attempt.originalRequest.startTime);
  const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(start);
  const end = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(new Date(attempt.endTime));
  return <div className="tprs-wizard tprs-confirm">
    <h2 className="tprs-h2">{booking ? "You're booked." : "Your saved reservation"}</h2>
    {booking ? <p className="tprs-confirm-sub">Confirmation <strong>{booking.invoiceNumber}</strong></p> : <p className="tprs-sub">{attempt.paymentReady ? "We found your original payment. Check or continue it before starting another reservation." : "We found your original payment. Check it before starting another reservation."}</p>}
    <p className="tprs-confirm-when">{when} – {end}</p>
    <div className="tprs-confirm-card">
      {attempt.financialSnapshot.lineItems.map((line, index) => <div className="tprs-confirm-line" key={index}><span>{line.name} × {line.quantity}</span><span>{formatUsd(line.lineTotal)}</span></div>)}
      <div className="tprs-confirm-line tprs-confirm-total"><span>{booking ? "Paid" : "Accepted total"}</span><span>{formatUsd(attempt.financialSnapshot.totalIncludingTax)}</span></div>
    </div>
    {booking ? <><p className="tprs-confirm-email">A confirmation is on its way to <strong>{attempt.originalRequest.customer.email}</strong>.</p><button type="button" className="tprs-btn tprs-btn--solid" onClick={props.onNewReservation}>Book another reservation</button></> : <>
      <p role="status">{recoveryMessage(attempt.status)}</p>
      <div hidden={!ready || !attempt.paymentReady}><PaymentElement options={{ layout: "tabs", wallets: { link: "never" } }} /></div>
      {!attempt.paymentReady && !error && !canReleaseCheckout(attempt.status) && <p className="tprs-pay-error-msg" role="alert">{incompleteCheckoutMessage}</p>}
      {error && <p className="tprs-pay-error-msg" role="alert">{error}</p>}
      <button type="button" className="tprs-btn tprs-btn--solid" disabled={busy} onClick={() => void run(() => inspect(ready && attempt.paymentReady))}>{busy ? "Checking…" : ready && attempt.paymentReady ? `Continue saved payment ${formatUsd(attempt.financialSnapshot.totalIncludingTax)}` : "Check payment status"}</button>
      <button type="button" className="tprs-btn tprs-btn--ghost" disabled={busy} onClick={() => void cancel()}>{canReleaseCheckout(attempt.status) ? "Edit reservation" : "Cancel payment and edit"}</button>
    </>}
  </div>;
}
