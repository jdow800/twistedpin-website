import { useRef, useState } from "react";
import { BarApiError, rejectInvoicePackageSourceCheck, reviewInvoiceCopy, type InvoiceCopyReview } from "../api";

/** The open questions in the server's wording (item and field named); older servers send only `questions`. */
const openQuestions = (review: InvoiceCopyReview): string[] =>
  review.display?.asks?.length ? review.display.asks.map(ask => ask.text) : review.questions ?? review.reasons;

export default function InvoiceCopies({ reviews, currentId, onOpen, onRefresh }: {
  reviews: InvoiceCopyReview[]; currentId: string;
  onOpen: (id: string, lineId?: string) => void; onRefresh: () => Promise<InvoiceCopyReview[]>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState<{ copyId: string; message: string; reloadRequired: boolean } | null>(null);
  async function confirm(review: InvoiceCopyReview) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(review.copyId); setError(null);
    try { await reviewInvoiceCopy(review.copyId, review.reviewHash); await onRefresh(); }
    catch { setError({ copyId: review.copyId, message: "Could not finish this review. Reload the comparison to check for changes, then try again.", reloadRequired: true }); }
    finally { inFlight.current = false; setBusy(null); }
  }

  async function reload(review: InvoiceCopyReview) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(review.copyId);
    try { await onRefresh(); setError(null); }
    catch { setError({ copyId: review.copyId, message: "Could not load the latest comparison. Your previous details are still shown. Try Reload comparison again.", reloadRequired: true }); }
    finally { inFlight.current = false; setBusy(null); }
  }

  async function reopen(review: InvoiceCopyReview) {
    if (inFlight.current || !review.sourceCheck || review.sourceCheck.status !== "resolved"
      || error?.copyId === review.copyId && error.reloadRequired) return;
    inFlight.current = true; setBusy(review.copyId); setError(null);
    let writeError: unknown;
    try { await rejectInvoicePackageSourceCheck(review.copyId, review.sourceCheck.evidenceHash); }
    catch (err) { writeError = err; }
    // A lost response may still mean the rejection committed. Read this exact
    // invoice before allowing a deliberate retry; never repeat a write blindly.
    try {
      const fresh = (await onRefresh()).find(copy => copy.copyId === review.copyId);
      if (fresh?.sourceCheck?.status !== "rejected") setError({ copyId: review.copyId,
        message: writeError instanceof BarApiError && writeError.status === 409
          ? "This source check changed. The latest comparison is loaded; check it before reopening the review."
          : "The latest comparison does not show a reopened review. Check the details before trying again.",
        reloadRequired: false });
    } catch {
      setError({ copyId: review.copyId,
        message: "Could not verify whether the review reopened. Your previous details are still shown. Reload the comparison before trying again.",
        reloadRequired: true });
    } finally { inFlight.current = false; setBusy(null); }
  }

  return <>{reviews.map(review => {
    const checking = review.sourceCheck?.status === "queued" || review.sourceCheck?.status === "running";
    const scanRecovery = review.sourceCheck?.kind === "scan_recovery" || review.automaticBasis === "source_checked_scan";
    const localError = error?.copyId === review.copyId ? error : null;
    return <section key={review.copyId} className="lq-invd-review" aria-label="Invoice and delivery comparison">
    <h3>{checking ? scanRecovery ? "Checking the scan reading" : "Checking the package reading" : review.automaticallyReconciled ? "Copies agree automatically" : review.reviewed ? "Comparison reviewed" : review.readingIncomplete ? "Check the invoice reading" : "Compare invoice and delivery"}</h3>
    <p>The email and delivery scan are linked to invoice #{review.invoiceNumber}. There is one purchase record. Matching paperwork does not verify what physically arrived.</p>
    {checking && <p role="status">{scanRecovery
      ? "The original scan pages are being read independently to check every billed item, charge and total. The comparison is still open."
      : "The original documents are being checked against the saved supplier package. The comparison is still open."}</p>}
    {review.automaticallyReconciled && !checking && <p>{review.automaticBasis === "source_checked_packages"
      ? "The original scan was read again against the emailed invoice and saved supplier package. The source check resolved the package reading. No answer needed."
      : review.automaticBasis === "source_checked_scan"
      ? "The original scan pages were read independently. Every billed item, package, separate charge and total agrees with the emailed invoice. No answer needed."
      : review.automaticBasis === "matching_copies"
      ? "Both copies agree on the billed items, packages, charges and totals. No answer needed."
      : review.automaticBasis === "supplier_final"
      ? "The supplier's final invoice accounts for the scanned items and adjustments. No answer needed."
      : "The document comparison settled automatically. No answer needed."} Open the purchase record if staff found a different delivery problem.</p>}
    {review.sourceCheck?.status === "resolved" && <div className="lq-invd-line">
      <strong>{scanRecovery ? "Scan reading checked against the source" : "Package reading checked against the source"}</strong>
      {scanRecovery && Number.isSafeInteger(review.sourceCheck.recoveredLineCount) && Number.isSafeInteger(review.sourceCheck.originalLineCount)
        && <p>The source check read {review.sourceCheck.recoveredLineCount} billed rows. The first saved scan had {review.sourceCheck.originalLineCount}.</p>}
      {!scanRecovery && review.sourceCheck.corrections.map((correction, i) => <div key={`${correction.vendorCode}:${i}`}>
        <p className="lq-muted">Supplier item: {correction.vendorCode}</p>
        <p>First scan reading: {correction.originalReading}</p>
        <p>Source-checked reading: {correction.correctedReading}</p>
      </div>)}
      <p className="lq-muted">{scanRecovery
        ? "The first saved scan rows remain on file. This source reading is used for the document comparison. The purchase and delivery answers are kept."
        : "This explanation changes the document comparison only. Prices, quantities and delivery answers are kept."}</p>
      <div className="lq-invd-review-actions">
        <button type="button" className="lq-btn lq-btn-ghost" disabled={!!busy || !!localError?.reloadRequired} onClick={() => void reopen(review)}>
          {busy === review.copyId ? "Checking latest details…" : scanRecovery ? "Reopen scan review" : "Reopen package review"}
        </button>
      </div>
    </div>}
    {review.sourceCheck?.status === "rejected" && <p role="status">The automatic {scanRecovery ? "scan" : "package"} explanation was rejected. Check the original document readings below.</p>}
    {review.sourceCheck?.status === "unresolved" && <p>The source check could not settle the {scanRecovery ? "scan" : "package"} reading.{review.sourceCheck.reason ? ` ${review.sourceCheck.reason}` : ""} Check the original documents below.</p>}
    <div className="lq-invd-review-actions">
      {currentId !== review.expected.id && <button className="lq-btn lq-btn-ghost" onClick={() => onOpen(review.expected.id)}>Open emailed invoice</button>}
      {currentId !== review.delivered.id && <button className="lq-btn lq-btn-ghost" onClick={() => onOpen(review.delivered.id)}>Open delivery scan</button>}
      {currentId !== review.originalId && <button className="lq-btn" onClick={() => onOpen(review.originalId)}>Match items or correct the purchase record</button>}
      {checking && <button type="button" className="lq-btn lq-btn-ghost" disabled={!!busy} onClick={() => void reload(review)}>{busy === review.copyId ? "Loading…" : "Check latest status"}</button>}
    </div>
    {!checking && !review.automaticallyReconciled && !review.reviewed && openQuestions(review).length > 0 && <ul>{openQuestions(review).map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
    <details open={!checking && review.differenceCount > 0 && !review.reviewed}>
      <summary>{checking ? "View the current document readings" : review.readingIncomplete ? "View item readings; check source pages first" : review.differenceCount ? `${review.differenceCount} item comparisons to check` : scanRecovery ? "Billed items agree; view source readings" : "Billed items agree; view package readings"}</summary>
      {[...review.rows].sort((a, b) => Number(!!b.issues.length) - Number(!!a.issues.length)).map(row => <div className="lq-invd-line" key={row.code}>
        <strong>{row.description}</strong>
        <p className="lq-muted">Supplier item: {row.code.startsWith("unidentified-") ? "not read" : row.code}</p>
        <p>Email: {row.expected ? `${row.expected.quantity ?? "?"} billed · $${row.expected.amount} · ${row.expected.packages.join(", ")}` : "Item not read"}</p>
        <p>{row.sourceDelivered ? "Scan after the documented shortage" : scanRecovery && review.sourceCheck?.status === "resolved" ? "Source-checked scan" : "Scan"}: {row.delivered ? `${row.delivered.quantity ?? "?"} billed · $${row.delivered.amount} · ${row.delivered.packages.join(", ")}` : "Item not read"}</p>
        {row.sourceDelivered && <p>Original paper line: {row.sourceDelivered.quantity ?? "?"} · ${row.sourceDelivered.amount}, crossed out.</p>}
        {!checking && (review.display?.rowLines?.[row.code] ?? row.issues).map((issue, i) => <p className="lq-muted" key={i}>{issue}</p>)}
        {row.information?.map((note, i) => <p className="lq-muted" key={`info-${i}`}>{note}</p>)}
        {!checking && row.issues.length > 0 && row.originalLineIds.map((lineId, i) => <button className="lq-linkbtn" key={lineId} onClick={() => onOpen(review.originalId, lineId)}>
          Review purchase item{row.originalLineIds.length > 1 ? ` ${i + 1}` : ""}
        </button>)}
      </div>)}
    </details>
    {!checking && !review.reviewed && !review.automaticallyReconciled && <>
      <p>Records that you compared the copies. Prices and counts are not changed. Matching papers do not prove what arrived.</p>
      <button className="lq-btn" disabled={!!busy || !review.ready || !!localError?.reloadRequired} onClick={() => void confirm(review)}>
        {busy === review.copyId ? "Saving…" : "Mark copies checked"}
      </button>
    </>}
    {localError && <div>
      <p role="alert" className="lq-error">{localError.message}</p>
      <div className="lq-invd-review-actions"><button type="button" className="lq-btn lq-btn-ghost" disabled={!!busy} onClick={() => void reload(review)}>Reload comparison</button></div>
    </div>}
  </section>; })}</>;
}
