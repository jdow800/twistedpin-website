import { useEffect, useRef, useState } from "react";
import { BarApiError, explainInvoice, STALE_ANSWER_MESSAGE, type InvoiceDetail } from "../api";
import {
  composeDepositSentence, countPlan, depositAmounts, depositPlan, exampleText, formatMoney, hasCannedDollars, hasDepositCredit,
  parseKegCount, printedTotalRead, rangeHint, rejectionMessage,
} from "../deposit-sentence";

export default function InvoiceExplanation({ detail, onRefresh }: { detail: InvoiceDetail; onRefresh: () => void }) {
  const saved = detail.depositResolution;
  const inv = detail.invoice;
  const [editing, setEditing] = useState(false);
  const [describe, setDescribe] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorIn, setErrorIn] = useState<"count" | "words">("words");
  const [stale, setStale] = useState(false);
  // One rate of whole kegs on a read total: ask for a count. Otherwise (mixed rates, a credit already on the invoice, a saved
  // answer being corrected) the person writes it out. The example always comes from THIS invoice, from the original bill.
  const byCount = countPlan(detail.lines, inv.printedTotal, !!saved);
  const plan = saved ? depositPlan(detail.lines, saved.original_total) : hasDepositCredit(detail.lines) ? null : byCount;
  const [kegsText, setKegsText] = useState(() => byCount ? String(byCount.kegsBilled) : "");
  const wordsRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (describe) wordsRef.current?.focus(); }, [describe]);
  if (!detail.explanationToken || inv.duplicateOf || inv.status === "pending") return null;
  const hasDeposit = detail.lines.some(line => line.lineType === "deposit");
  if (!saved && !hasDeposit) return null;
  // No original bill to subtract a credit from (BUILD-SPEC 11.95; a total of 0.00 is no more a read total than null),
  // so the server refuses. Say why up front instead of offering a form that cannot save.
  if (!saved && !printedTotalRead(inv.printedTotal)) return <section className="lq-invd-review" id="invoice-explanation" aria-label="Invoice explanation">
    <h3>Deposit returns</h3>
    <p>The printed total was not read, so the credit cannot be recorded here yet. Check the original invoice.</p>
  </section>;
  const showForm = editing || (!saved && inv.status === "flagged" && (inv.reviewNotes ?? inv.handwrittenNotes ?? []).some(note => /\bempt(?:y|ies)\b/i.test(note)));
  const showCount = showForm && !!byCount;
  const showWords = showForm && (!byCount || describe);
  const count = byCount ? parseKegCount(kegsText, byCount.kegsBilled) : null;
  const amounts = byCount && count && "kegs" in count ? depositAmounts(count.kegs, byCount.rateCents, byCount.originalCents) : null;
  const countError = byCount && count && !("kegs" in count) ? rangeHint(count, byCount.kegsBilled) : null;

  // `answer` is the composed sentence from the count box, or what was typed in the words box.
  async function send(answer: string, from: "count" | "words") {
    setBusy(true); setError(null); setStale(false); setErrorIn(from);
    try {
      await explainInvoice(inv.id, detail.explanationToken!, answer);
      setEditing(false); setText(""); onRefresh();
    } catch (err) {
      let body: { question?: string; error?: string } = {};
      if (err instanceof BarApiError && typeof err.body === "string") { try { body = JSON.parse(err.body); } catch { /* response was not JSON */ } }
      if (body.error === "invoice_changed") {
        setStale(true); setError(STALE_ANSWER_MESSAGE);
      } else if (body.error === "deposit_credit_already_present") {
        setError("A deposit credit is already on this invoice. Check that line before adding another return.");
      } else if (body.error === "printed_total_not_read") {
        setError("The printed total was not read, so the credit cannot be recorded here yet. Check the original invoice.");
      } else if (body.error === "check_invoice_amounts") {
        setError("The saved lines do not add up to the invoice total yet. Check those amounts before applying a deposit return.");
      // The server's questions do not say what to type, and its "does not add up" one ends in another invoice's example
      // ("total due $559"). Free text is answered with this invoice's own numbers; a question about a sentence this screen
      // composed (which the server reads) is shown only when it carries no dollars from elsewhere.
      } else if (body.question && from === "words") setError(rejectionMessage(body.question, answer, plan));
      else if (body.question && !hasCannedDollars(body.question)) setError(body.question);
      else setError("Could not save this answer. Reopen the invoice and try again.");
    } finally { setBusy(false); }
  }
  const refresh = stale && <button className="lq-btn lq-btn-ghost" type="button" onClick={onRefresh}>Refresh invoice</button>;
  const problem = error && <p className="lq-error" role="alert">{error}</p>;

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
    {showCount && byCount && <form className="lq-invd-dep" onSubmit={event => {
      event.preventDefault();
      if (!busy && !stale && count && "kegs" in count) void send(composeDepositSentence(count.kegs, byCount.rateCents, byCount.originalCents), "count");
    }}>
      <label htmlFor="invoice-deposit-kegs">How many empty kegs went back?</label>
      <input id="invoice-deposit-kegs" className="lq-invd-dep-kegs" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
        enterKeyHint="done" maxLength={3} value={kegsText} aria-invalid={countError && kegsText.trim() ? true : undefined}
        aria-describedby="invoice-deposit-preview" onChange={event => { setKegsText(event.target.value); if (!stale) setError(null); }} />
      <p id="invoice-deposit-preview" className={`lq-invd-dep-line${countError ? " lq-invd-dep-bad" : ""}`} aria-live="polite"
        role={countError && kegsText.trim() ? "alert" : undefined}>
        {amounts && byCount ? `Credit ${formatMoney(amounts.creditCents)}. Amount due becomes ${formatMoney(amounts.dueCents)} (was ${formatMoney(byCount.originalCents)}).` : countError}
      </p>
      <div className="lq-invd-review-actions">
        <button className="lq-btn" type="submit" disabled={busy || stale || !amounts}>
          {busy ? "Saving answer…" : amounts ? `Record ${formatMoney(amounts.creditCents)} credit` : "Record credit"}
        </button>
        {refresh}
      </div>
      {errorIn === "count" && problem}
      {!describe && <p className="lq-muted">If a full keg was missing, record that on its item below.</p>}
    </form>}
    {showCount && <button type="button" className="lq-linkbtn" aria-expanded={describe} aria-controls={describe ? "invoice-explanation-words" : undefined}
      onClick={() => setDescribe(open => !open)}>{describe ? "Use the keg count instead" : "Describe something else"}</button>}
    {showWords && <form id="invoice-explanation-words" onSubmit={event => { event.preventDefault(); if (!busy && text.trim().length >= 5 && !stale) void send(text.trim(), "words"); }}>
      <label htmlFor="invoice-explanation-text">Explain the empty-keg deposit return</label>
      <p className="lq-muted">{exampleText(plan)}</p>
      <textarea id="invoice-explanation-text" ref={wordsRef} className="lq-invd-explanation-text" rows={4} maxLength={2000} value={text} onChange={event => setText(event.target.value)} />
      <div className="lq-invd-review-actions">
        <button className="lq-btn" type="submit" disabled={busy || stale || text.trim().length < 5}>{busy ? "Saving answer…" : "Save answer"}</button>
        {saved && <button className="lq-linkbtn" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>}
        {!byCount && refresh}
      </div>
    </form>}
    {(errorIn === "words" || !showCount) && problem}
  </section>;
}
