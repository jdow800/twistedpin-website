import { useState } from "react";
import { BarApiError, explainInvoice, type InvoiceDetail } from "../api";

export default function InvoiceExplanation({ detail, onRefresh }: { detail: InvoiceDetail; onRefresh: () => void }) {
  const saved = detail.depositResolution;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const inv = detail.invoice;
  if (!detail.explanationToken || inv.duplicateOf || inv.status === "pending") return null;
  const hasDeposit = detail.lines.some(line => line.lineType === "deposit");
  if (!saved && !hasDeposit) return null;
  const showForm = editing || (!saved && inv.status === "flagged" && (inv.reviewNotes ?? inv.handwrittenNotes ?? []).some(note => /\bempt(?:y|ies)\b/i.test(note)));
  async function save() {
    setBusy(true); setError(null); setStale(false);
    try {
      await explainInvoice(inv.id, detail.explanationToken!, text.trim());
      setEditing(false); setText(""); onRefresh();
    } catch (err) {
      let body: { question?: string; error?: string } = {};
      if (err instanceof BarApiError && typeof err.body === "string") { try { body = JSON.parse(err.body); } catch { /* response was not JSON */ } }
      if (body.error === "invoice_changed") {
        setStale(true); setError("This invoice changed while you were answering. Refresh it before saving your explanation.");
      } else if (body.error === "deposit_credit_already_present") {
        setError("A deposit credit is already on this invoice. Check that line before adding another return.");
      } else if (body.error === "check_invoice_amounts") {
        setError("The saved lines do not add up to the invoice total yet. Check those amounts before applying a deposit return.");
      } else setError(body.question ?? "Could not save this answer. Reopen the invoice and try again.");
    } finally { setBusy(false); }
  }
  return <section className="lq-invd-review" id="invoice-explanation" aria-label="Invoice explanation">
    <h3>{saved && !editing ? saved.source === "automatic" ? "Handled automatically" : "Answer recorded" : showForm ? "Tell us what happened" : "Deposit returns"}</h3>
    {!saved && !showForm && <button type="button" className="lq-linkbtn" onClick={() => setEditing(true)}>Record a deposit return</button>}
    {saved && <>
      <p>Original bill <strong>${saved.original_total}</strong> − empty-keg deposit return <strong>${saved.credit}</strong> = <strong>${saved.total} due</strong>.</p>
      <p>Product quantities and costs are unchanged. The credit is recorded separately from the products.</p>
      {saved.source === "staff" && <p className="lq-muted">Your answer: {saved.explanation}</p>}
      {saved.remaining_questions && <p>Other questions on this invoice still need an answer.</p>}
      {!editing && <button className="lq-linkbtn" type="button" onClick={() => { setEditing(true); setText(`Empty-keg deposit return $${saved.credit}; total due $${saved.total}.`); }}>Correct this answer</button>}
    </>}
    {showForm && <form onSubmit={event => { event.preventDefault(); if (!busy && text.trim().length >= 5 && !stale) void save(); }}>
      <label htmlFor="invoice-explanation-text">Explain the empty-keg deposit return</label>
      <p className="lq-muted">For example: “Returned one empty keg. Deposit credit $30; total due $559.” This records the credit. If a full keg was missing, record that on its item below.</p>
      <textarea id="invoice-explanation-text" className="lq-invd-explanation-text" rows={4} maxLength={2000} value={text} onChange={event => setText(event.target.value)} />
      <div className="lq-invd-review-actions">
        <button className="lq-btn" type="submit" disabled={busy || stale || text.trim().length < 5}>{busy ? "Saving answer…" : "Save answer"}</button>
        {saved && <button className="lq-linkbtn" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>}
        {stale && <button className="lq-btn lq-btn-ghost" type="button" onClick={onRefresh}>Refresh invoice</button>}
      </div>
    </form>}
    {error && <p className="lq-error" role="alert">{error}</p>}
  </section>;
}
