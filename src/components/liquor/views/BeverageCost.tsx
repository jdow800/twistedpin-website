import { useEffect,useState } from "react";
import { getBeverageCost,getBeverageValues,revalueBeverage,rerunBeverageCost,type BeverageCostData,type BeverageReport } from "../beverage-api";
import "../beverage.css";
import ConsumableRecipes from "./ConsumableRecipes";
import BatchCostReview from "./BatchCostReview";
import KitchenBoundaryReview from "./KitchenBoundaryReview";
export const beverageMoney=(cents:number|null|undefined)=>cents==null ? "Unknown" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
export function BeverageReportView({row}:{row:BeverageReport}) {
  const r=row.report;
  return <article className="lq-bv-card"><h3>{row.scope.replaceAll("_"," ")} · v{row.version}</h3>
    <p>{r.periodStart ?? r.start ?? "Baseline"} → {r.periodEnd ?? r.end}</p>
    <strong>{r.baseline ? "Opening baseline" : r.estimated ? "Estimated cost" : "Cost of stock used"}: {beverageMoney(r.completeCogsCents)}</strong>
    {r.provisional && <p>Known portion {beverageMoney(r.knownCogsCents)}. This report needs review.</p>}
    <p>Matching sales: {beverageMoney(r.salesCents)} · Component percentage: {r.componentPct ?? r.cogsPct ?? "Unknown"}{r.componentPct!=null || r.cogsPct!=null ? "%" : ""}</p>
    {r.residualUncertainty && <p>{r.residualUncertainty}</p>}
    {r.kitchenProduce && <p>Kitchen bar produce, matching bracket v{r.kitchenProduce.version}: {beverageMoney(r.kitchenProduce.cogsCents)}. Shown separately; included once in the complete all-in calculation.</p>}
    {r.kitchenProduce?.basis && <p>Confirmed shared walk. Actual food counts: {new Date(r.kitchenProduce.basis.opening.submittedAt).toLocaleString()} → {new Date(r.kitchenProduce.basis.closing.submittedAt).toLocaleString()}. Accounting boundaries: {r.kitchenProduce.basis.accountingStart} → {r.kitchenProduce.basis.accountingEnd}. Link versions {r.kitchenProduce.basis.opening.linkRevision}/{r.kitchenProduce.basis.closing.linkRevision}.</p>}
    {!!r.kitchenProduce?.reasons?.length && <p>Kitchen produce review: {r.kitchenProduce.reasons.join(", ").replaceAll("_"," ")}</p>}
    <p>19% is the all-in target. A component percentage does not establish the all-in result.</p>
    {!!r.reasons.length && <ul>{r.reasons.map(s=><li key={s}>{s.replaceAll("_"," ")}</li>)}</ul>}
    <div className="lq-bv-scroll"><table><thead><tr><th>Item</th><th>Cost used</th><th>Review</th></tr></thead><tbody>{(r.items ?? r.lines ?? []).map((l,i)=><tr key={`${l.skuId}:${i}`}><td>{l.name}</td><td>{beverageMoney(l.cogsCents)}</td><td>{l.reasons.join(", ").replaceAll("_"," ")}</td></tr>)}</tbody></table></div>
    {r.lines && <div className="lq-bv-scroll"><table><thead><tr><th>Item</th><th>Actual used oz</th><th>POS poured oz</th><th>Unexplained oz</th></tr></thead><tbody>{r.lines.map((l,i)=><tr key={`${l.skuId}:${i}`}><td>{l.name}</td><td>{l.actualUsedOz ?? "Unknown"}</td><td>{l.pouredOz.toFixed(3)}</td><td>{l.lossOz==null ? "Unknown" : l.lossOz.toFixed(3)}</td></tr>)}</tbody></table></div>}
    {!!r.unmappedSales?.length && <p>Unmapped tap sales: {r.unmappedSales.map(s=>`${s.name ?? "unnamed"} / ${s.zoneId ?? "no zone"}`).join(", ")}</p>}
    <small>{row.reason}</small>
  </article>;
}
export default function BeverageCost({onDone,canManage}:{onDone:()=>void;canManage:boolean}) {
  const [data,setData]=useState<BeverageCostData|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[reason,setReason]=useState(""),[showHistory,setShowHistory]=useState(false);
  const [values,setValues]=useState<{id:string;data:Awaited<ReturnType<typeof getBeverageValues>>}|null>(null),[prices,setPrices]=useState<Record<string,string>>({});
  const load=async()=>{setData(await getBeverageCost());};
  useEffect(()=>{load().catch(e=>setError(String(e)));},[]);
  const work=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError("");try{await fn();await load();}catch(e){setError(String(e));}finally{setBusy(false);}};
  const rows=data?.reports.filter(r=>r.scope==="liquor" || r.scope==="packaged_beer") ?? [];
  const latest=rows.filter(r=>!rows.some(other=>other.scope===r.scope && other.closingId===r.closingId && other.version>r.version));
  return <section className="lq-bv"><button className="lq-btn" onClick={onDone}>Back</button><h2>Beverage cost</h2><p>Each component uses its own physical count boundaries. Original observations and report versions stay readable.</p>
    {error && <p role="alert">{error}</p>}{!data && !error && <p>Loading…</p>}
    {data?.allIn.map((r,i)=><article className="lq-bv-card" key={i}><h3>All-in beverage cost</h3><p>{r.periodStart ?? "Baseline"} → {r.periodEnd}</p><strong>{r.pct==null ? "Unknown" : `${r.pct.toFixed(2)}%`} · target {r.targetPct}%</strong><p>Cost {beverageMoney(r.cogsCents)} / sales {beverageMoney(r.salesCents)}. Kitchen produce is included once.</p>{!!r.reasons.length && <ul>{r.reasons.map(s=><li key={s}>{s.replaceAll("_"," ")}</li>)}</ul>}</article>)}
    {canManage && <KitchenBoundaryReview onSaved={load}/>}
    {canManage && data && <div className="lq-bv-card"><label>Reason for this report or cost correction<input value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {(["liquor","packaged_beer"] as const).map(scope=><div key={scope}><h3>{scope.replaceAll("_"," ")}</h3>{[...data.counts[scope]].reverse().map(c=><div className="lq-bv-row" key={c.id}><span>{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : c.id}</span><button className="lq-btn" disabled={busy || reason.trim().length<3} onClick={()=>work(()=>rerunBeverageCost(c.id,scope,reason))}>Create new version</button><button className="lq-btn" disabled={busy} onClick={()=>work(async()=>{setValues({id:c.id,data:await getBeverageValues(c.id)});setPrices({});})}>Review frozen costs</button></div>)}</div>)}
      {values && <div><h3>Cost per stamped count unit</h3>{values.data.lines.map(({line,name})=><label key={line.id}>{name} · {line.qtyUnits} {line.countUnitAtCount ?? "unstamped"} · observed {line.unitCostAtCount ?? "unknown"}<input type="number" min="0" step="0.000001" placeholder="New cost" value={prices[line.id] ?? ""} onChange={e=>setPrices({...prices,[line.id]:e.target.value})}/></label>)}<button className="lq-btn" disabled={busy || reason.trim().length<3 || !Object.values(prices).some(v=>v!=="")} onClick={()=>work(async()=>{const changes=Object.entries(prices).filter(([,v])=>v!=="").map(([lineId,v])=>({lineId,cost:Number(v),revision:values.data.overrides.find(o=>o.lineId===lineId)?.revision ?? 0}));await revalueBeverage(values.id,reason,changes);setValues(null);})}>Revalue both adjacent brackets</button></div>}
      {values && <BatchCostReview key={values.id} values={values} reason={reason} busy={busy} work={work}/>}
    </div>}
    <label><input type="checkbox" checked={showHistory} onChange={e=>setShowHistory(e.target.checked)}/> Show every version</label>
    {(showHistory ? rows : latest).map(r=><BeverageReportView key={r.id} row={r}/>)}{data && !rows.length && <p>No beverage dollar reports yet. The first count in each component is a baseline.</p>}
    <ConsumableRecipes canManage={canManage}/>
  </section>;
}
