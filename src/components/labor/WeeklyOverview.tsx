import type {DailyLaborMetric} from './api';
const day=(date:string)=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'});
const money=(value:number|null,ready=true)=>value===null||!ready?'Pending':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value/100);
export default function WeeklyOverview({days}:{days:DailyLaborMetric[]}){
 if(!days.length)return null;
 const available=days.filter(d=>d.salesReady&&d.laborReady&&d.salesCents!==null&&d.salesCents>0&&d.hourlyWagesCents!==null);
 const leaders=[...available].sort((a,b)=>b.hourlyWagesCents!/b.salesCents!-a.hourlyWagesCents!/a.salesCents!||a.date.localeCompare(b.date)).slice(0,2);
 const ceiling=Math.max(50,...available.map(d=>Math.ceil((d.percent??0)/10)*10));
 return <section className="lr-weekly-overview" aria-label="Daily labor and building sales"><h2>The week at a glance</h2><p className="lr-small">Hourly wages are the main scheduling lever. Management salary stays in total labor.</p>
  <div className="lr-labor-legend"><span><i/> Hourly wages</span><span><i/> Management salary</span><span><i/> Highest hourly shares this week</span></div>
  <div className="lr-labor-bars">{days.map(d=>{const ready=available.includes(d),hot=leaders.includes(d),hourly=ready?d.hourlyWagesCents!/d.salesCents!*100:0,salary=ready?d.managementSalaryCents!/d.salesCents!*100:0;return <div key={d.date} className="lr-labor-bar-row"><strong>{day(d.date)}</strong><div className="lr-labor-track" aria-label={ready?`${day(d.date)}: ${hourly.toFixed(1)}% hourly wages plus ${salary.toFixed(1)}% salary`:`${day(d.date)}: pending inputs`}><span style={{width:`${hourly/ceiling*100}%`,background:hot?'#c38526':'#269c8b'}}/><span style={{width:`${salary/ceiling*100}%`,background:'#c4b7df'}}/></div><span>{d.percent===null?'Pending':d.percent.toFixed(1)+'%'}</span></div>;})}</div>
  <p className="lr-small">{leaders.length?`Highest hourly wage share: ${leaders.map(d=>`${day(d.date)} ${(d.hourlyWagesCents!/d.salesCents!*100).toFixed(1)}%`).join(' and ')}. `:''}These are comparison points, not daily targets. Quiet weekdays and busy weekends carry different percentages.</p>
  <div className="lr-daily-table"><table><thead><tr><th>Day</th><th>Building sales</th><th>Hourly wages</th><th>Mgmt salary</th><th>Total labor</th></tr></thead><tbody>{days.map(d=><tr key={d.date} className={leaders.includes(d)?'lr-high-share':''}><th scope="row">{day(d.date)}</th><td>{money(d.salesCents,d.salesReady)}</td><td>{money(d.hourlyWagesCents,d.laborReady)}</td><td>{money(d.managementSalaryCents)}</td><td>{money(d.laborCents,d.laborReady)}<small>{d.percent===null?'Pending':d.percent.toFixed(1)+'%'}</small></td></tr>)}</tbody></table></div><p className="lr-small">Estimated earned cost. Employer taxes and benefits excluded. Full amounts and source checks are available below.</p>
 </section>;
}
