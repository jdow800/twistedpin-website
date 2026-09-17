import { invoiceImageUrl, type InvoiceDetail } from "../api";

export function jumpToInvoiceLine(id: string) {
  const row = document.getElementById(`inv-line-${id}`);
  row?.scrollIntoView({ block: "center", behavior: "smooth" });
  row?.focus({ preventScroll: true });
}

/** The delivery review is separate from the accounting category breakdown. */
export default function InvoiceReview({ detail, clearing, error, onConfirm }: {
  detail: InvoiceDetail;
  clearing: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const inv = detail.invoice;
  if (inv.status !== "flagged") return null;
  const notes = inv.reviewNotes ?? inv.handwrittenNotes ?? [];
  const marked = detail.lines.filter((line) => line.annotation);
  const unmatched = detail.lines.filter((line) => line.needsReview);
  const printed = Number(inv.printedTotal);
  const extracted = Number(inv.extractedTotal);
  const delta = inv.printedTotal != null && inv.extractedTotal != null
    && Number.isFinite(printed) && Number.isFinite(extracted) ? Math.abs(printed - extracted) : 0;
  const emptyKegNotes = notes.some((note) => /\bempties\b|\bempty\s+kegs?\b/i.test(note));
  const image = detail.images[0];
  const hasReason = inv.duplicateOf || notes.length || marked.length || unmatched.length || delta >= 0.01;

  return (
    <section className="lq-invd-review" aria-labelledby="invoice-review-title">
      <h3 id="invoice-review-title">Why this needs review</h3>
      {inv.duplicateOf ? (
        <p>This duplicates invoice {inv.duplicateOf}. It stays excluded so the delivery is counted once.</p>
      ) : (
        <>
          {notes.length > 0 && (
            <div>
              <p><strong>Check the handwritten notes:</strong></p>
              <ul className="lq-invd-review-notes">
                {notes.map((note, index) => <li key={index}>{note}</li>)}
              </ul>
              <p>{emptyKegNotes
                ? "These notes mention empty-keg returns. Check the deposit credit against the original receipt and the vendor's credit. Update a delivered quantity below only if full kegs were missing."
                : "Compare these notes with the original invoice and what arrived. Record any delivery shortage on the affected item below; check credits with the vendor."}</p>
              <p className="lq-muted">The totals below show the printed bill. Handwritten adjustments are kept as notes until reviewed; confirming does not enter a credit or change those totals.</p>
            </div>
          )}
          {marked.length > 0 && (
            <div>
              <p><strong>Check the marks beside these items:</strong></p>
              <ul>
                {marked.map((line) => (
                  <li key={line.id}>
                    <button type="button" className="lq-linkbtn" onClick={() => jumpToInvoiceLine(line.id)}>
                      {line.rawDescription || "View item"}
                    </button>: {line.annotation}
                  </li>
                ))}
              </ul>
              <p>Check what arrived and record any different quantity on the item.</p>
            </div>
          )}
          {unmatched.length > 0 && (
            <p><strong>{unmatched.length} item{unmatched.length === 1 ? " needs" : "s need"} a catalog match.</strong>{" "}
              Choose the matching product on each highlighted item below before confirming.
            </p>
          )}
          {delta >= 0.01 && (
            <p><strong>The printed and read totals differ by ${delta.toFixed(2)}.</strong>{" "}
              Compare the line amounts, deposits, fees and credits with the original invoice.
            </p>
          )}
          {!hasReason && <p>No specific review reason is available here. Compare the original invoice with the delivery before confirming.</p>}
        </>
      )}
      <div className="lq-invd-review-actions">
        {image ? (
          <a className="lq-btn lq-btn-ghost" href={invoiceImageUrl(image.id)} target="_blank" rel="noreferrer">
            View original invoice
          </a>
        ) : <p className="lq-muted">The image is no longer stored. Use your paper receipt or vendor copy.</p>}
        {!inv.duplicateOf && detail.lines.length > 0 && (
          <button type="button" className="lq-linkbtn" onClick={() => jumpToInvoiceLine((unmatched[0] ?? marked[0] ?? detail.lines[0])!.id)}>
            {unmatched.length ? "Go to items needing a match" : "Check delivered quantities"}
          </button>
        )}
      </div>
      {!inv.duplicateOf && unmatched.length === 0 && (
        <div className="lq-invd-review-confirm">
          <p>Once you have checked the delivery and the notes above, confirm this invoice to finish the review.</p>
          <button type="button" className="lq-btn" disabled={clearing} onClick={onConfirm}>
            {clearing ? "Confirming…" : "Review complete — confirm invoice"}
          </button>
        </div>
      )}
      {error && <p className="lq-error" role="alert">{error}</p>}
    </section>
  );
}
