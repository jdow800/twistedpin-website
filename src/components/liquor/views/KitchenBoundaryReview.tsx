import { useEffect, useState } from "react";
import { BarApiError } from "../api";
import { getKitchenBoundaries, saveKitchenBoundary, type KitchenBoundaryData, type KitchenBoundaryWalk } from "../beverage-api";

const walkRange = (walk: KitchenBoundaryWalk) => new Date(walk.startedAt).toLocaleString() + " → " + new Date(walk.submittedAt).toLocaleString();
const countHref = (walk: KitchenBoundaryWalk) => "?view=counts&section=" + walk.section + "&count=" + encodeURIComponent(walk.id);

export default function KitchenBoundaryReview({ onSaved }: { onSaved: () => Promise<void> }) {
  const [data, setData] = useState<KitchenBoundaryData | null>(null), [barId, setBarId] = useState(""), [foodId, setFoodId] = useState("");
  const [confirmed, setConfirmed] = useState(false), [reason, setReason] = useState(""), [error, setError] = useState(""), [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false), [needsReload, setNeedsReload] = useState(false);
  useEffect(() => { let live = true; void getKitchenBoundaries().then(fresh => { if (live) setData(fresh); }).catch(() => { if (live) setError("Count links could not be loaded. Reload count links to try again."); }); return () => { live = false; }; }, []);
  const bar = data?.barCounts.find(c => c.id === barId), food = data?.foodCounts.find(c => c.id === foodId), link = data?.links.find(l => l.barCountId === barId);
  const candidates = data?.foodCounts.filter(f => bar && f.countedBy === bar.countedBy
    && Math.max(new Date(f.startedAt).getTime(), new Date(bar.startedAt).getTime()) <= Math.min(new Date(f.submittedAt).getTime(), new Date(bar.submittedAt).getTime())
    && Math.max(new Date(f.submittedAt).getTime(), new Date(bar.submittedAt).getTime()) - Math.min(new Date(f.startedAt).getTime(), new Date(bar.startedAt).getTime()) <= 24 * 3600_000) ?? [];

  async function reload() {
    setBusy(true); setError(""); setStatus("");
    try {
      const fresh = await getKitchenBoundaries();
      const selectedBar = fresh.barCounts.find(c => c.id === barId), freshLink = fresh.links.find(l => l.barCountId === barId);
      await onSaved();
      setData(fresh); setBarId(selectedBar?.id ?? "");
      setFoodId(selectedBar ? freshLink?.foodCountId ?? (fresh.foodCounts.some(c => c.id === foodId) ? foodId : "") : "");
      setConfirmed(false); setNeedsReload(false);
      setStatus("Count links reloaded. Your reason is still here. Review both walks and confirm again before saving.");
    } catch { setError("Count links could not be reloaded. Your selected counts and unsaved reason are still here."); }
    finally { setBusy(false); }
  }

  async function save(active: boolean) {
    setBusy(true); setError(""); setStatus(""); let saved = false;
    try {
      await saveKitchenBoundary(barId, { foodCountId: active ? foodId : link!.foodCountId, revision: link?.revision ?? 0, confirmed, active, reason });
      saved = true; setConfirmed(false);
      setData(await getKitchenBoundaries()); await onSaved();
      setNeedsReload(false); setReason(""); setStatus("Kitchen boundary saved. Affected report versions were updated.");
    } catch (e) {
      if (saved) { setNeedsReload(true); setError("The link was saved, but its updated reports could not be loaded. Reload count links before making another change."); }
      else if (e instanceof BarApiError && e.status === 409) { setConfirmed(false); setNeedsReload(true); setError("The count link or its boundaries changed, or this pairing needs review. Reload count links, review both walks, and confirm again before saving."); }
      else setError("The kitchen boundary was not saved. Your selected counts and unsaved reason are still here.");
    } finally { setBusy(false); }
  }

  return <details className="lq-bv-card"><summary>Link kitchen produce from the same inventory walk</summary>
    <p>For all-in cost, pair the opening and closing food counts with their full bar counts. Start both walks during the same physical inventory walk. This retains each count's actual times and frozen units and costs; kitchen produce is calculated once at the shared bar boundaries.</p><p>{data?.policy}</p>
    {error && <p role="alert">{error}</p>}{status && <p role="status">{status}</p>}{!data && !error && <p>Loading count links…</p>}
    <button type="button" className="lq-btn" disabled={busy} onClick={() => void reload()}>Reload count links</button>
    {data && <fieldset disabled={busy}>
      <label>Full bar count<select aria-label="Full bar count for kitchen link" value={barId} onChange={e => { const id = e.target.value; setBarId(id); setFoodId(data.links.find(l => l.barCountId === id)?.foodCountId ?? ""); setConfirmed(false); setStatus(""); }}><option value="">Choose a submitted full bar count</option>{data.barCounts.map(c => <option key={c.id} value={c.id}>{new Date(c.submittedAt).toLocaleString()}</option>)}</select></label>
      {bar && <><p>Bar walk: {walkRange(bar)}.</p><div className="lq-bv-row"><a className="lq-btn" href={countHref(bar)} target="_blank" rel="noopener noreferrer">Open bar count details</a></div></>}
      <label>Food count from this physical walk<select aria-label="Food count for kitchen link" value={foodId} onChange={e => { setFoodId(e.target.value); setConfirmed(false); setStatus(""); }}><option value="">Choose a compatible food count</option>{candidates.map(c => <option key={c.id} value={c.id}>{new Date(c.submittedAt).toLocaleString()}</option>)}</select></label>
      {food && <><p>Food walk: {walkRange(food)}.</p><div className="lq-bv-row"><a className="lq-btn" href={countHref(food)} target="_blank" rel="noopener noreferrer">Open food count details</a></div></>}
      {bar && !candidates.length && <p>No overlapping full food count by this counter is available. Kitchen produce stays unknown for this boundary.</p>}
      {link && <p>Saved link v{link.revision}: {link.active ? "active" : "removed"}. Actual food submit {new Date(link.snapshot.foodSubmittedAt).toLocaleString()}; bar accounting boundary {new Date(link.snapshot.barSubmittedAt).toLocaleString()}. {link.reason}</p>}
      <label><input type="checkbox" aria-label="Confirm food and bar same physical walk" checked={confirmed} disabled={needsReload} onChange={e => setConfirmed(e.target.checked)} /> I reviewed both counts and confirm they represent the same physical inventory walk.</label>
      <label>Reason for kitchen boundary link<input aria-label="Reason for kitchen boundary link" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
      <div className="lq-bv-row"><button type="button" className="lq-btn" disabled={needsReload || !barId || !candidates.some(c => c.id === foodId) || !confirmed || reason.trim().length < 3} onClick={() => void save(true)}>Save link and version both neighbors</button>{link?.active && <button type="button" className="lq-btn" disabled={needsReload || reason.trim().length < 3} onClick={() => void save(false)}>Remove link and version both neighbors</button>}</div>
    </fieldset>}
  </details>;
}
