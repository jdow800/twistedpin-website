import type {DailyLaborMetric} from './api';
import {hasPendingAmounts,hasUnresolvedWages,hourlyAmountReady,salaryAmountReady,includesEstimate,percentDisplay} from './financial-display';
const day=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'});
const money=(value:number|null,ready=true)=>value===null||!ready?'Pending':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value/100);
/** Jon Oct15: cut the paragraphs, keep the visuals ("I like the table - visual elements are good").
 * One bar per day, then the daily dollar table. Shares are comparison points, not daily targets, so no day is ranked. */
export default function WeeklyOverview({days}:{days:DailyLaborMetric[]}){
 if(!days.length)return null;
 const available=days.filter(d=>!hasPendingAmounts(d)&&d.salesCents!>0&&hourlyAmountReady(d)&&salaryAmountReady(d));
 const hasProvisional=days.some(includesEstimate);
 const ceiling=Math.max(50,...available.map(d=>Math.ceil((d.percent??0)/10)*10));
 const mark=(d:DailyLaborMetric)=>includesEstimate(d)?'*':'';
 return <section className="lr-weekly-overview" aria-label="Daily labor and building sales">
  <div className="lr-labor-bars">{days.map(d=>{
   const ready=available.includes(d),hourly=ready?d.hourlyWagesCents!/d.salesCents!*100:0,salary=ready?d.managementSalaryCents!/d.salesCents!*100:0;
   const description=ready?`${day(d.date)}: ${hourly.toFixed(1)}% hourly wages plus ${salary.toFixed(1)}% salary`:hasPendingAmounts(d)?`${day(d.date)}: pending inputs`:`${day(d.date)}: no sales percentage`;
   return <div key={d.date} className="lr-labor-bar-row"><strong>{day(d.date)}</strong><div className="lr-labor-track" aria-label={description+(includesEstimate(d)?'; provisional':'')}><span style={{width:`${hourly/ceiling*100}%`,background:'#269c8b'}}/><span style={{width:`${salary/ceiling*100}%`,background:'#c4b7df'}}/></div><span>{percentDisplay(d)}{!hasPendingAmounts(d)?mark(d):''}</span></div>;
  })}</div>
  <p className="lr-labor-legend"><span><i/> Hourly wages</span><span><i/> Manager salary</span>{hasProvisional?<span>* Includes estimates</span>:null}</p>
  <div className="lr-daily-table"><table><thead><tr><th>Day</th><th>Building sales</th><th>Hourly wages</th><th>Mgmt salary</th><th>Total labor</th></tr></thead><tbody>{days.map(d=>{
   const partial=hasUnresolvedWages(d)?d.financialResolution!.resolvedHourlyWagesCents:null;
   return <tr key={d.date}><th scope="row">{day(d.date)}</th><td>{money(d.salesCents,d.salesReady)}</td><td>{partial!==null?<>{money(partial)}{mark(d)}<small>Partial</small></>:<>{money(d.hourlyWagesCents,hourlyAmountReady(d))}{hourlyAmountReady(d)?mark(d):''}</>}</td><td>{money(d.managementSalaryCents,salaryAmountReady(d))}</td><td>{money(d.laborCents,d.laborReady&&!hasUnresolvedWages(d))}{d.laborReady&&!hasUnresolvedWages(d)?mark(d):''}<small>{percentDisplay(d)}{!hasPendingAmounts(d)?mark(d):''}</small></td></tr>;
  })}</tbody></table></div>
 </section>;
}
