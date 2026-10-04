import { useEffect, useState } from "react";
import { BarApiError } from "../api";
import { getBrunswickDocs, reviewBrunswickDoc, type BrunswickDoc } from "../insights-api";
import { money } from "../FoodCostReport";
type Row = { label: string; amount: string; classification: string };
export default function BrunswickFood({ onDone, canManage, initialDocId }: { onDone: () => void; canManage: boolean; initialDocId?: string | null }) {
  const [docs, setDocs] = useState<BrunswickDoc[]>([]), [next, setNext] = useState<number | null>(null), [selected, setSelected] = useState<BrunswickDoc | null>(null), [rows, setRows] = useState<Row[]>([]), [total, setTotal] = useState(""), [reason, setReason] = useState(""), [complete, setComplete] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  function choose(d: BrunswickDoc) { setSelected(d); const answer = d.review ?? d.departments; setTotal(answer?.total == null ? "" : String(answer.total));
    setRows((answer?.rows ?? []).map(r => ({ label: r.label, amount: r.amount == null ? "" : String(r.amount), classification: "classification" in r ? String(r.classification) : "" }))); setComplete(false); setReason(""); setError(""); }
  async function load(offset = 0) { setBusy(true); try { const p = await getBrunswickDocs(offset); setDocs(old => offset ? [...old, ...p.documents] : p.documents); setNext(p.nextOffset); return p.documents; } catch { setError("Source reports could not be loaded."); return []; } finally { setBusy(false); } }
  async function reloadSelected() {
    if (!selected) return; const id = selected.id; setBusy(true);
    try { let offset = 0; const fresh: BrunswickDoc[] = [];
      while (true) { const p = await getBrunswickDocs(offset); fresh.push(...p.documents); const doc = p.documents.find(d => d.id === id);
        setDocs(fresh); setNext(p.nextOffset); if (doc) { choose(doc); return; } if (p.nextOffset == null) break; offset = p.nextOffset; }
      setError("This report is no longer available. Open All reports.");
    } catch { setError("Source reports could not be reloaded. Your unsaved review is still here."); } finally { setBusy(false); }
  }
  useEffect(() => { let live = true; void (async () => { let offset = 0; while (live) { const p = await getBrunswickDocs(offset); if (!live) return; setDocs(old => offset ? [...old, ...p.documents] : p.documents); setNext(p.nextOffset);
      const found = p.documents.find(d => d.id === initialDocId); if (found) { choose(found); return; } if (!initialDocId || p.nextOffset == null) return; offset = p.nextOffset; } })().catch(() => { if (live) setError("Source reports could not be loaded."); }); return () => { live = false; }; }, []);
  function update(i: number, key: keyof Row, value: string) { setRows(old => old.map((r, n) => n === i ? { ...r, [key]: value } : r)); }
  async function save(e: React.FormEvent) { e.preventDefault(); if (!selected || !complete) return; setBusy(true); setError("");
    try { await reviewBrunswickDoc(selected, reason, Number(total), rows.map(r => ({ label: r.label, amount: Number(r.amount), classification: r.classification as "food_na" | "other" }))); const fresh = await load(); const doc = fresh.find(d => d.id === selected.id); if (doc) choose(doc); else setSelected(null); }
    catch (e) { setError(e instanceof BarApiError && e.status === 409 ? "The source or review changed. Reload it before saving." : "The review was not saved. Check labels, amounts and the department total."); } finally { setBusy(false); }
  }
  return <section className="lq-source-review"><button className="lq-back" onClick={onDone}>← Home</button><h1>Brunswick food revenue</h1><p className="lq-muted">Review department sales from the original report. Tender, tax, rebates and prize funds are separate. Missing evidence stays unknown.</p>
    {error && <p role="alert" className="lq-error">{error}</p>}
    {selected ? <><button className="lq-btn" onClick={() => setSelected(null)}>All reports</button><button className="lq-btn" disabled={busy} onClick={() => void reloadSelected()}>Reload source</button><h2>{selected.salesDate}</h2><p>{selected.result.cents == null ? "Food revenue unknown" : `${money(selected.result.cents)} food + NA`}{selected.result.why ? ` · ${selected.result.why.replaceAll("_", " ")}` : ""}</p>
      {(selected.status !== "extracted" || selected.checksumOk !== true) && <p role="alert">Resolve the source extraction/checksum in Money Hub before reviewing its food revenue.</p>}
      <form onSubmit={save}><fieldset disabled={!canManage || busy || selected.status !== "extracted" || selected.checksumOk !== true}>
        <label>Printed department Sales Total ($)<input type="number" step="0.01" value={total} required onChange={e => setTotal(e.target.value)} /></label>
        {rows.map((r, i) => <div className="lq-review-card" key={i}><label>Printed department label<input value={r.label} required onChange={e => update(i, "label", e.target.value)} /></label>
          <label>Signed sales ($)<input type="number" step="0.01" required value={r.amount} onChange={e => update(i, "amount", e.target.value)} /></label>
          <label>Classification<select required value={r.classification} onChange={e => update(i, "classification", e.target.value)}><option value="">Review this department</option><option value="food_na">Food + non-alcoholic drinks</option><option value="other">Other department sales</option></select></label><button type="button" className="lq-btn" onClick={() => setRows(old => old.filter((_, n) => n !== i))}>Remove repeated row</button></div>)}
        <button type="button" className="lq-btn" onClick={() => setRows(old => [...old, { label: "", amount: "", classification: "" }])}>Add department</button>
        <label><input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} />I reviewed all department subtotals once; their sum matches the printed Sales Total.</label>
        <label>Why this review is correct<textarea required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button className="lq-btn" disabled={!complete || busy}>Save reviewed revenue</button>
      </fieldset></form><p className="lq-muted">Historical cost reports update through a new version on the next source check, or an admin re-run. Original versions remain readable.</p></> : <>
        {docs.map(d => <button className="lq-review-card" key={d.id} onClick={() => choose(d)}>{d.salesDate} · {d.result.cents == null ? "Unknown food revenue" : money(d.result.cents)}{d.result.basis ? ` · ${d.result.basis}` : ""}</button>)}
        {docs.length === 0 && !busy && <p>No reports loaded.</p>}{next != null && <button className="lq-btn" disabled={busy} onClick={() => void load(next)}>Older reports</button>}
      </>}
  </section>;
}
