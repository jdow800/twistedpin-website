import { useEffect, useState } from "react";
import { getFoodTrends, type Trends } from "../insights-api";
import { money, pctText } from "../FoodCostReport";
const bigMoney = (cents: string) => { const n = BigInt(cents), neg = n < 0n, v = neg ? -n : n; return `${neg ? "−" : ""}$${(v / 100n).toLocaleString()}.${String(v % 100n).padStart(2, "0")}`; };
export default function FoodTrends({ onDone }: { onDone: () => void }) {
  const [data, setData] = useState<Trends | null>(null), [months, setMonths] = useState(3), [error, setError] = useState("");
  useEffect(() => { let live = true; getFoodTrends().then(d => { if (live) setData(d); }).catch(() => { if (live) setError("Trends could not be loaded."); }); return () => { live = false; }; }, []);
  const r = data?.ranges.find(x => x.months === months);
  return <section><button className="lq-back" onClick={onDone}>← Home</button><h1>Food cost trends</h1><p>Food + non-alcoholic drinks · 30% target</p>
    <label>Range <select value={months} onChange={e => setMonths(Number(e.target.value))}>{[1, 3, 6, 12].map(n => <option key={n} value={n}>{n} month{n > 1 ? "s" : ""}</option>)}</select></label>
    {error && <p role="alert" className="lq-error">{error}</p>}{!data && !error && <p role="status">Loading…</p>}
    {r && <><p className="lq-muted">{data!.basis}</p><p>Closing dates since {r.cutoffDate}. {r.draft} draft · {r.provisional} provisional.</p>
      {[{ label: "Reliable final brackets", s: r.reliable }, { label: "All available brackets", s: r.all }].map(({ label, s }) => <article className="lq-review-card" key={label}><h2>{label}</h2><strong>{pctText(s.pct)}</strong>
        <p>{bigMoney(s.costCents)} cost / {bigMoney(s.salesCents)} matching sales · {s.usableBrackets} usable of {s.brackets} brackets</p>
        <p>USAR: {pctText(s.usar.pct)} across {s.usar.brackets} brackets with complete recipe deductions.</p><p>Paper per cover: {s.paper.perCoverCents == null ? "Unavailable" : money(s.paper.perCoverCents)} · {s.paper.covers} matching covers</p></article>)}
      {r.points.length === 0 && <p>No count-to-count brackets yet.</p>}
      {r.points.map(p => <article className="lq-review-card" key={p.sessionId}><a href={`/cogs/?view=foodcost&count=${p.sessionId}`}>{new Date(p.periodEnd).toLocaleDateString(undefined, { timeZone: "America/Chicago" })} · v{p.version}</a><p>{pctText(p.pct)} · {money(p.costCents)} / {money(p.salesCents)} · {p.status}{p.provisional ? " · provisional" : ""}</p><p className="lq-muted">Full bracket: {new Date(p.periodStart).toLocaleDateString(undefined, { timeZone: "America/Chicago" })}–{new Date(p.periodEnd).toLocaleDateString(undefined, { timeZone: "America/Chicago" })}</p></article>)}
    </>}
  </section>;
}
