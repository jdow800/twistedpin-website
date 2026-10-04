import { useEffect, useState } from "react";
import { getOpsInbox, type OpsPage } from "../insights-api";
import { money } from "../FoodCostReport";
export default function OpsInbox({ onDone, canManage }: { onDone: () => void; canManage: boolean }) {
  const [page, setPage] = useState<OpsPage | null>(null), [offset, setOffset] = useState(0), [impact, setImpact] = useState("all"), [error, setError] = useState(""), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0);
  useEffect(() => { let live = true; setLoading(true); setError("");
    getOpsInbox(offset, impact).then(p => { if (live) setPage(p); }).catch(() => { if (live) { setPage(null); setError("The inbox could not be checked. Refresh to try again."); } }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [offset, impact, refresh]);
  return <section><button className="lq-back" onClick={onDone}>← Home</button><h1>Operations inbox</h1>
    <p className="lq-muted">Fix the owning record, then refresh. Dollar amounts describe different kinds of exposure.</p>
    <div className="lq-review-controls"><label>Impact <select value={impact} onChange={e => { setImpact(e.target.value); setOffset(0); }}><option value="all">All findings</option><option value="known">Known dollars</option><option value="unknown">Unknown dollars</option></select></label>
      <button className="lq-btn" disabled={loading} onClick={() => setRefresh(r => r + 1)}>Refresh</button></div>
    {error && <p role="alert" className="lq-error">{error}</p>}{loading && <p role="status">Checking sources…</p>}
    {page && !loading && <><p>{page.total} findings</p>{page.sources.filter(s => s.state === "unavailable").map(s => <p key={s.name} role="alert" className="lq-error">{s.name.replaceAll("_", " ")}: {s.error}</p>)}
      {page.allClear && <p>All checked sources are clear.</p>}{!page.allClear && page.findings.length === 0 && <p>No findings in this filter. See source warnings above.</p>}
      {page.findings.map(f => <article key={f.key} className="lq-review-card"><h2>{f.title}</h2><p>{f.detail}</p>
        <p><strong>{f.impact.cents == null ? "Impact unknown" : money(f.impact.cents)}</strong> · {f.impact.basis.replaceAll("_", " ")}</p>
        {f.impact.window && <p className="lq-muted">Window: {f.impact.window}</p>}{f.since && <p className="lq-muted">Since {new Date(f.since).toLocaleDateString()}</p>}
        <a className="lq-btn" href={f.href}>Open correction</a>{!canManage && f.capability === "bar.manage" && <p className="lq-muted">An admin must save the correction.</p>}
      </article>)}<p className="lq-muted">{page.note}</p>
      <div className="lq-review-controls"><button className="lq-btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}>Previous</button><button className="lq-btn" disabled={page.nextOffset == null} onClick={() => setOffset(page.nextOffset!)}>Next</button></div>
    </>}
  </section>;
}
