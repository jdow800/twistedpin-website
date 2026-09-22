import { useState } from "react";
import { reviewInvoiceCopy, type InvoiceCopyReview } from "../api";

export default function InvoiceCopies({ reviews, currentId, onOpen, onRefresh }: {
  reviews: InvoiceCopyReview[]; currentId: string;
  onOpen: (id: string, lineId?: string) => void; onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function confirm(review: InvoiceCopyReview) {
    setBusy(review.copyId); setError(null);
    try { await reviewInvoiceCopy(review.copyId, review.reviewHash); onRefresh(); }
    catch { setError("Could not finish this review. Reopen the invoice to check for changes, then try again."); }
    finally { setBusy(null); }
  }
  return <>{reviews.map(review => <section key={review.copyId} className="lq-invd-review" aria-label="Invoice and delivery comparison">
    <h3>{review.reviewed ? "Comparison reviewed" : "Compare invoice and delivery"}</h3>
    <p>The email and delivery scan are linked to invoice #{review.invoiceNumber}. There is one purchase record. Matching paperwork does not verify what physically arrived.</p>
    <div className="lq-invd-review-actions">
      {currentId !== review.expected.id && <button className="lq-btn lq-btn-ghost" onClick={() => onOpen(review.expected.id)}>Open emailed invoice</button>}
      {currentId !== review.delivered.id && <button className="lq-btn lq-btn-ghost" onClick={() => onOpen(review.delivered.id)}>Open delivery scan</button>}
      {currentId !== review.originalId && <button className="lq-btn" onClick={() => onOpen(review.originalId)}>Match items or correct the purchase record</button>}
    </div>
    {review.reasons.length > 0 && <ul>{review.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>}
    <details open={review.differenceCount > 0 && !review.reviewed}>
      <summary>{review.differenceCount ? `${review.differenceCount} item comparisons to check` : "Billed items agree; view package readings"}</summary>
      {[...review.rows].sort((a, b) => Number(!!b.issues.length) - Number(!!a.issues.length)).map(row => <div className="lq-invd-line" key={row.code}>
        <strong>{row.description}</strong>
        <p className="lq-muted">Supplier item: {row.code.startsWith("unidentified-") ? "not read" : row.code}</p>
        <p>Email: {row.expected ? `${row.expected.quantity ?? "?"} billed · $${row.expected.amount} · ${row.expected.packages.join(", ")}` : "Item not read"}</p>
        <p>Scan: {row.delivered ? `${row.delivered.quantity ?? "?"} billed · $${row.delivered.amount} · ${row.delivered.packages.join(", ")}` : "Item not read"}</p>
        {row.issues.map((issue, i) => <p className="lq-muted" key={i}>{issue}</p>)}
        {row.information?.map((note, i) => <p className="lq-muted" key={`info-${i}`}>{note}</p>)}
        {row.issues.length > 0 && row.originalLineIds.map((lineId, i) => <button className="lq-linkbtn" key={lineId} onClick={() => onOpen(review.originalId, lineId)}>
          Review purchase item{row.originalLineIds.length > 1 ? ` ${i + 1}` : ""}
        </button>)}
      </div>)}
    </details>
    {!review.reviewed && <>
      <p>Check the source pages and record any delivery corrections on the purchase record before finishing. This button records your review; it does not change prices or quantities.</p>
      <button className="lq-btn" disabled={!!busy || !review.ready} onClick={() => void confirm(review)}>
        {busy === review.copyId ? "Saving…" : "Both copies checked; corrections recorded"}
      </button>
    </>}
    {error && <p role="alert" className="lq-error">{error}</p>}
  </section>)}</>;
}
