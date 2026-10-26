import type {LaborReview,ReviewQuestion,OutcomeReview} from './api';
import {ServiceAnswer} from './DemandSurgeQuestion';

const day=(value:string)=>new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const money=(value:number|null)=>value===null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value/100);
const minute=(value:number)=>{const h=Math.floor(value/60)%24,m=value%60;return `${h%12||12}${m?`:${String(m).padStart(2,'0')}`:''}${h<12?'am':'pm'}`;};
const layers:[keyof OutcomeReview['staffing'],string][]=[['dataBaseline','Data baseline'],['finalIssued','Final AI draft'],['published','Published schedule'],['recorded','Recorded spans']];
const metricLabels={food_and_beverage_net_sales:'Food & drink',kitchen_net_sales:'Food',bar_net_sales:'Drinks'};
const stamp=(value:string|null)=>value?new Date(value).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' Central':'Capture time unavailable';
export function periodHours(source:OutcomeReview['staffing']['recorded'],period:OutcomeReview['period']){
  if(source.status==='unavailable'||source.status==='partial'&&!source.shifts.length)return 'Unavailable';
  const minutes=source.shifts.filter(s=>s.department!=='management').reduce((n,s)=>n+Math.max(0,Math.min(s.endMinute,period.endMinute)-Math.max(s.startMinute,period.startMinute)),0);
  return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(minutes/60)+(source.status==='partial'?' shown hours':' hours');
}
export default function OutcomeReviewQuestion({question:q,review,onSaved}:{number:number;question:ReviewQuestion;review:LaborReview;onSaved:(r:LaborReview)=>void}){
  const outcome=q.outcomeReview!;
  return <article className="lr-question lr-change-question lr-surge-question lr-outcome-question" id={`q-${q.id}`} aria-labelledby={`q-${q.id}-title`}>
    <div className="lr-change-head"><h3 id={`q-${q.id}-title`}>{day(q.date)} · {outcome.period.label}</h3>{q.response?<span className="lr-badge lr-badge-saved">{q.response.serviceFeedback?.overall==='need_to_check'?'Check with team':'Saved'}</span>:null}</div>
    <p className="lr-change-net">{outcome.reason==='applied_feedback'?'Feedback adjustment follow-up':'Routine service check'}</p>
    <p className="lr-small">{outcome.reason==='applied_feedback'?'The AI adjusted this period using earlier feedback. How did the crew handle service?':'How did the crew handle this service period?'}</p>
    <table className="lr-change-table"><caption className="lr-visually-hidden">Hourly staff-hours during {outcome.period.label}; management listed separately in details</caption><thead><tr><th scope="col">Coverage source</th><th scope="col">Period hours</th></tr></thead><tbody>{layers.map(([key,label])=><tr key={key}><th scope="row">{label}{outcome.staffing[key].status==='partial'||outcome.staffing[key].status==='provisional'?<span className="lr-small"> · {outcome.staffing[key].status}</span>:null}</th><td>{periodHours(outcome.staffing[key],outcome.period)}</td></tr>)}</tbody></table>
    <p className="lr-small">Recorded spans may be provisional or incomplete. Scheduled hours do not prove attendance or service capacity.</p>
    {outcome.metrics.map(m=><p className="lr-small" key={m.metric}>{metricLabels[m.metric]}: {money(m.forecastValue)} forecast → {money(m.actualValue)} actual</p>)}
    <details className="lr-change-shifts"><summary>Coverage & sources</summary><div className="lr-detail-body">
      <p className="lr-small">Coverage below is limited to this review period.</p>
      {layers.map(([key,label])=><div className="lr-surge-shifts" key={key}><h4>{label} · {outcome.staffing[key].status}</h4><p>{outcome.staffing[key].status==='unavailable'||outcome.staffing[key].status==='partial'&&!outcome.staffing[key].shifts.length?'Source unavailable':outcome.staffing[key].shifts.length?outcome.staffing[key].shifts.map((s,i)=><span key={i}>{i?'; ':''}{s.department}: {s.role} {minute(s.startMinute)}-{minute(s.endMinute)}</span>):'No coverage in this period'}</p><p className="lr-small">{stamp(outcome.staffing[key].capturedAt)}</p></div>)}
      <p className="lr-small">Published coverage is the roster as read; later edits may be included. Recorded spans are not confirmed station attendance. Management is separate from hourly totals.</p>
      <p className="lr-small">{!outcome.eventContext.complete?'Event context is incomplete.':outcome.eventContext.affected?'Booked-event work overlaps this period.':'No overlapping booked-event work in the retained check.'} This comparison does not establish savings or prove what caused the service result.</p>
      <p><strong>Original question:</strong> {q.prompt}</p><ul>{q.evidence.map(e=><li key={e}>{e}</li>)}</ul><p className="lr-sources">{[...new Set([...q.sources,...outcome.sourceRefs])].join('; ')}</p>
    </div></details>
    <ServiceAnswer question={q} review={review} onSaved={onSaved}/>
  </article>;
}
