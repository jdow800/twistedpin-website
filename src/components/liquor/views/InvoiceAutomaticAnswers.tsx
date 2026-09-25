import { useEffect, useState } from "react";
import { BarApiError, correctAutomaticInvoiceAnswer, getAutomaticInvoiceAnswers,
  type AutomaticInvoiceAnswer, type InvoiceAnswerCorrection } from "../api";

const money = (value: number | null) => value == null ? "unknown" : `$${value.toFixed(2)}`;
const plural = (unit: string) => unit === "each" ? "items" : /(?:ch|sh|x)$/.test(unit) ? `${unit}es` : unit.endsWith("s") ? unit : `${unit}s`;

function Consequences({ result }: { result: InvoiceAnswerCorrection }) {
  return <div role="status">
    <p>Saved: 1 billed case = {result.unitsPerCase} {result.unitsPerCase === 1 ? result.countUnit : plural(result.countUnit)}.</p>
    <p>{result.currentCost == null ? "No current price yet." : result.costCorrected
      ? `Current price corrected from ${money(result.previousCost)} to ${money(result.currentCost)} per ${result.countUnit}.`
      : `Current price ${money(result.currentCost)} has a different source and was kept.`}</p>
    {!result.countingDefinitionChanged && result.countCaseSize != null && <p>A counted case still means {result.countCaseSize} {plural(result.countUnit)}.</p>}
    {result.affectedCounts?.map(count => <p key={count.id}>
      {new Date(count.started_at).toLocaleDateString()}: {count.status === "draft"
        ? "Re-enter this item's case counts before submitting the draft."
        : `${Number(count.old_cases) > 0 ? `${count.old_cases} case(s) were recorded with the previous case size. ` : ""}This submitted count keeps its recorded quantities and prices.${count.has_unpriced_lines ? " It had no saved price for this item; its value uses the current price." : ""}`}
    </p>)}
  </div>;
}

function Answer({ answer, invoiceId, onSaved }: {
  answer: AutomaticInvoiceAnswer; invoiceId: string; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [factor, setFactor] = useState(String(answer.unitsPerCase));
  const [defaultUnit, setDefaultUnit] = useState<"case" | "base">(answer.defaultSpokenUnit === "case" ? "case" : "base");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvoiceAnswerCorrection | null>(null);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!answer.lineId || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await correctAutomaticInvoiceAnswer(invoiceId, answer.id, { token: answer.token,
        lineId: answer.lineId, unitsPerCase: Number(factor),
        ...(answer.definitionEditable ? { defaultSpokenUnit: defaultUnit } : {}),
      });
      setResult(response.result); setEditing(false); onSaved();
    } catch (err) {
      setError(err instanceof BarApiError && err.status === 409
        ? "This answer changed. Reload its latest details before saving again."
        : "Could not save this correction. Check your connection and try again.");
    } finally { setBusy(false); }
  }
  return <div className="lq-invd-line" style={{ marginTop: 12 }}>
    <strong>{answer.name}</strong>
    <p>1 billed case = {answer.unitsPerCase} {answer.unitsPerCase === 1 ? answer.unitLabel : plural(answer.unitLabel)}. Invoice price: {money(answer.costPerUnit)} per {answer.unitLabel}.</p>
    <p className="lq-muted">Invoice and supplier record: {answer.sourcePack} × {answer.sourceSize}.
      {answer.defaultSpokenUnit === "case" ? " Counts default to cases; named packages still work."
        : answer.defaultSpokenUnit ? ` Counts default to ${plural(answer.unitLabel)}.` : " Your counting setup was kept."}</p>
    {answer.status === "superseded" && <p>A later answer or item match replaced this conversion.</p>}
    {(result || answer.correction) && <Consequences result={(result || answer.correction)!} />}
    {answer.canCorrect && !editing && <button className="lq-btn lq-btn-ghost" type="button" onClick={() => setEditing(true)}>Correct unit</button>}
    {editing && <form className="lq-invd-auto-form" onSubmit={save}>
      <label style={{ display: "block", margin: "12px 0" }}>
        How many {plural(answer.unitLabel)} in one billed case?
        <input className="lq-input" type="number" min="1" max="1000" step="1" required
          aria-label="Correct units per billed case" value={factor} onChange={e => setFactor(e.target.value)}
          style={{ display: "block", fontSize: 16, width: "100%", boxSizing: "border-box", marginTop: 6 }} />
      </label>
      {answer.definitionEditable ? <label style={{ display: "block", margin: "12px 0" }}>
        When someone counts without naming a unit
        <select className="lq-input" aria-label="Default counting unit" value={defaultUnit}
          onChange={e => setDefaultUnit(e.target.value as "case" | "base")}
          style={{ display: "block", fontSize: 16, width: "100%", boxSizing: "border-box", marginTop: 6 }}>
          <option value="case">Cases / fractions</option>
          <option value="base">{answer.unitLabel}</option>
        </select>
      </label> : <p>Your existing counting definition stays as it is. This answer converts the supplier's billed case.</p>}
      <p className="lq-muted">This saves the answer for future invoices and corrects the current price if it came from this conversion.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className="lq-btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save correction"}</button>
        <button className="lq-btn lq-btn-ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
      </div>
      {error && <><p className="lq-error" role="alert">{error}</p><button type="button" className="lq-linkbtn" onClick={onSaved}>Reload answers</button></>}
    </form>}
  </div>;
}

export default function InvoiceAutomaticAnswers({ invoiceId, revision, onSaved }: {
  invoiceId: string; revision: unknown; onSaved: () => void;
}) {
  const [answers, setAnswers] = useState<AutomaticInvoiceAnswer[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setError(false);
    getAutomaticInvoiceAnswers(invoiceId).then(data => { if (alive) setAnswers(data.answers ?? []); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [invoiceId, revision]);
  if (error) return <p className="lq-muted">Automatic-answer details could not load. <button className="lq-linkbtn" type="button" onClick={onSaved}>Try again</button></p>;
  if (!answers.length) return null;
  return <section className="lq-invd-review" style={{ borderColor: "#4EECC4" }} aria-labelledby="automatic-answers-title">
    <h3 id="automatic-answers-title">Handled automatically</h3>
    <p>These package answers were checked against supplier records. No answer needed unless something looks wrong.</p>
    {answers.map(answer => <Answer key={`${answer.id}:${answer.token}`} answer={answer} invoiceId={invoiceId} onSaved={onSaved} />)}
  </section>;
}
