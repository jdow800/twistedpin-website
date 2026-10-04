import { useState } from "react";
import { revalueBeverage,type getBeverageValues } from "../beverage-api";
export default function BatchCostReview({values,reason,busy,work}:{values:{id:string;data:Awaited<ReturnType<typeof getBeverageValues>>};reason:string;busy:boolean;work:(fn:()=>Promise<unknown>)=>Promise<void>}){
  const [prices,setPrices]=useState<Record<string,string>>({});
  const b=values.data.batch;
  if(!b)return <p>Historical batch components and their physical costs were not captured. They remain unknown.</p>;
  const ingredients=[...new Map(b.lines.map(l=>[l.skuId,l])).values()];
  return <div><h3>Frozen batch ingredient costs</h3>{!!b.concerns.length && <p>Physical basis needs review: {b.concerns.join(", ")}. A cost edit cannot supply missing physical evidence.</p>}{ingredients.map(l=><label key={l.skuId}>{l.name} · cost per {l.countUnit} · captured {l.cost ?? "unknown"}<input type="number" min="0" step="0.000001" value={prices[l.skuId] ?? ""} onChange={e=>setPrices({...prices,[l.skuId]:e.target.value})}/></label>)}<button className="lq-btn" disabled={busy || !!b.concerns.length || reason.trim().length<3 || !Object.values(prices).some(v=>v!=="")} onClick={()=>work(async()=>{await revalueBeverage(values.id,reason,[],{batchRevision:values.data.batchOverride?.revision ?? 0,batchChanges:Object.entries(prices).filter(([,v])=>v!=="").map(([skuId,v])=>({skuId,cost:Number(v)}))});setPrices({});})}>Revalue batch costs in both adjacent brackets</button></div>;
}
