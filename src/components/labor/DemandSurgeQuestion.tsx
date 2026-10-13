import {useEffect,useRef,useState} from 'react';
import {LaborApiError,saveReviewResponse,type LaborReview,type ReviewQuestion,type ServiceFeedback,type DemandMetric} from './api';
import {questionIsActive} from './review-progress';
import {answerLabel,departmentLabels,serviceOutcomes,serviceResponse,yesNoLabel} from './service-feedback';

const metricLabels:Record<DemandMetric,string>={food_and_beverage_net_sales:'Food & drink net sales',kitchen_net_sales:'Food net sales',bar_net_sales:'Drink net sales',desk_interactions:'Desk interactions'};
const displayValue=(metric:DemandMetric,value:number)=>metric==='desk_interactions'?new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value/100);
const minute=(value:number)=>{const hour=Math.floor(value/60)%24,minutes=value%60;return `${hour%12||12}${minutes?`:${String(minutes).padStart(2,'0')}`:''}${hour<12?'am':'pm'}`;};
const range=(low:number,high:number)=>low===high?String(low):`${low}-${high}`;
const hours=(minutes:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(minutes/60);
const date=(value:string)=>new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'});

export function ServiceSummary({feedback}:{feedback:ServiceFeedback}){
  return <div className="lr-service-summary"><h3>{answerLabel(feedback.overall)}</h3>
    {feedback.affectedDepartments.length?<p><strong>Affected:</strong> {feedback.affectedDepartments.map(d=>departmentLabels[d]).join(', ')}</p>:null}
    <p><strong>Manager stepped in:</strong> {yesNoLabel(feedback.managerHelp)}</p>
    {feedback.extraStaffingAnticipated!=='unknown'||feedback.anticipatedReason?<p><strong>Extra coverage was planned for this:</strong> {yesNoLabel(feedback.extraStaffingAnticipated)}{feedback.anticipatedReason?` · ${feedback.anticipatedReason}`:''}</p>:null}
  </div>;
}

export default function DemandSurgeQuestion({number,question:q,review,onSaved}:{number:number;question:ReviewQuestion;review:LaborReview;onSaved:(r:LaborReview)=>void}){
  const surge=q.demandSurge!;
  const primary=surge.metrics.find(m=>m.metric===surge.primaryMetric)!;
  const [editing,setEditing]=useState(false),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [note,setNote]=useState(q.response?.note??'');
  const [feedback,setFeedback]=useState<Partial<ServiceFeedback>>(q.response?.serviceFeedback??{affectedDepartments:[]});
  const noteRef=useRef<HTMLTextAreaElement>(null);
  const askAnticipation=['material_adds','material_mixed'].includes(surge.staffing.classification)&&!surge.knownOperatingExplanation;
  const update=(patch:Partial<ServiceFeedback>)=>setFeedback(f=>({...f,...patch}));
  const ready=Boolean(feedback.overall&&feedback.managerHelp&&(!askAnticipation||feedback.extraStaffingAnticipated)&&note.trim());
  const response=()=>serviceResponse(note,{overall:feedback.overall!,affectedDepartments:feedback.affectedDepartments??[],managerHelp:feedback.managerHelp!,extraStaffingAnticipated:askAnticipation?feedback.extraStaffingAnticipated!:'unknown',...(askAnticipation&&feedback.anticipatedReason?.trim()?{anticipatedReason:feedback.anticipatedReason.trim()}: {})},q.followUpDate);
  useEffect(()=>{if(editing&&!confirm)noteRef.current?.focus({preventScroll:true});},[editing,confirm]);
  const save=async(undo=false)=>{
    if(!questionIsActive(q)||(!undo&&!ready))return;
    setBusy(true);setError('');
    try{onSaved(await saveReviewResponse(review.id,{questionId:q.id,expectedRevision:q.revision,...(undo?{undo:true}:{response:response()})}));}
    catch(e){setError(e instanceof LaborApiError&&e.status===409?'This question or answer changed while the page was open. Your text is still here. Reload to review its current status.':'Save did not complete. Your answer is still here; please retry.');}
    finally{setBusy(false);}
  };
  return <article className="lr-question lr-surge-question" aria-labelledby={`q-${q.id}`}>
    <div className="lr-question-header"><div className="lr-question-date"><span className="lr-question-number">{String(number).padStart(2,'0')}</span><time dateTime={q.date}>{date(q.date)}</time></div><span className={`lr-badge ${q.response?'lr-badge-saved':''}`}>{q.response?.serviceFeedback?.overall==='need_to_check'?'Check with team':q.response?'Service feedback saved':'How did it go?'}</span></div>
    <div className="lr-question-content">
      <h2 id={`q-${q.id}`}>{q.title}</h2><p className="lr-prompt">Demand exceeded the original forecast. How did the team handle these hours?</p>
      <section className="lr-surge-evidence" aria-label="Forecast, actual demand and planned crew">
        <div className="lr-surge-period"><strong>{metricLabels[surge.primaryMetric]}</strong><span>{surge.period.label}</span></div>
        <div className="lr-comparison-pairs"><div><span>AI expected</span><strong>{displayValue(surge.primaryMetric,primary.forecastValue)}</strong></div><div><span>Actual</span><strong>{displayValue(surge.primaryMetric,primary.actualValue)}</strong><small>{primary.increasePercent===null?'Percentage unavailable':`${Math.round(primary.increasePercent)}% above forecast`}</small></div></div>
        {surge.hotHours.length?<p className="lr-small"><strong>Largest increases:</strong> {surge.hotHours.map(h=>`${minute(h.startMinute)}-${minute(h.endMinute)} (${metricLabels[h.metric].toLowerCase()}, +${displayValue(h.metric,h.increaseValue)})`).join('; ')}</p>:null}
        <table className="lr-surge-crew"><caption>Planned crew at once · {surge.period.label}</caption><thead><tr><th scope="col">Department</th><th scope="col">AI</th><th scope="col">Published</th></tr></thead><tbody>{surge.staffing.departments.map(d=><tr key={d.department}><th scope="row">{departmentLabels[d.department]}</th><td>{range(d.originalMin,d.originalMax)}</td><td>{range(d.publishedMin,d.publishedMax)}</td></tr>)}</tbody></table>
        <p className="lr-small">{surge.staffing.published.basis==='pre_service_published_snapshot'?'Published roster captured before service.':'Published roster captured after the fact; later edits may be included.'} Who worked and how service went need your context.</p>
        {surge.knownOperatingExplanation?<p className="lr-small"><strong>Already noted:</strong> {surge.knownOperatingExplanation.length>300?`${surge.knownOperatingExplanation.slice(0,300)}…`:surge.knownOperatingExplanation}</p>:null}
        <details className="lr-evidence"><summary>Shift details & source checks</summary><div className="lr-detail-body">
          {surge.staffing.departments.map(d=><div className="lr-surge-shifts" key={d.department}><h3>{departmentLabels[d.department]}</h3><p><strong>AI:</strong> {d.original.map(s=>`${s.role} ${minute(s.startMinute)}-${minute(s.endMinute)}`).join('; ')||'No planned shifts'}</p><p><strong>Published:</strong> {d.published.map(s=>`${s.role} ${minute(s.startMinute)}-${minute(s.endMinute)}`).join('; ')||'No published shifts'}</p><p className="lr-small">Added {hours(d.addedPersonMinutes)} staff-hours; removed {hours(d.removedPersonMinutes)} staff-hours.</p></div>)}
          <p><strong>Original question:</strong> {q.prompt}</p>{surge.knownOperatingExplanation?<p><strong>Saved operating explanation:</strong> {surge.knownOperatingExplanation}</p>:null}<p className="lr-small">Roster captured {new Date(surge.staffing.published.capturedAt).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} Central.</p><ul>{q.evidence.map(e=><li key={e}>{e}</li>)}</ul><p className="lr-sources">{q.sources.join('; ')}</p>
        </div></details>
      </section>
      {!editing&&!q.response?<div className="lr-question-action"><button className="lr-primary" onClick={()=>setEditing(true)}>How the crew handled it</button><span>A short note from you or the team.</span></div>:null}
      {!editing&&q.response?<div className="lr-saved" role="status"><p className="lr-kicker">Your service feedback</p>{q.response.serviceFeedback?<ServiceSummary feedback={q.response.serviceFeedback}/>:null}<p>{q.response.note}</p>{q.response.serviceFeedback?.overall==='need_to_check'?<p className="lr-small">Saved; check with the team, then update. This question remains open.</p>:null}<div className="lr-actions"><button onClick={()=>setEditing(true)}>Update service feedback</button>{q.canUndo?<button className="lr-text-button" disabled={busy} onClick={()=>void save(true)}>Undo last save</button>:null}</div></div>:null}
    </div>
    {editing&&!confirm?<form className="lr-answer" onSubmit={e=>{e.preventDefault();if(ready)setConfirm(true);}}>
      <div className="lr-form-heading"><h3>How did the crew cope?</h3><span>1 of 2 · Your report</span></div>
      <fieldset><legend>During {surge.period.label}</legend><div className="lr-decisions">{serviceOutcomes.map(([value,label])=><label className={`lr-choice ${feedback.overall===value?'lr-choice-selected':''}`} key={value}><input required type="radio" name={`service-${q.id}`} checked={feedback.overall===value} onChange={()=>update({overall:value})}/><span>{label}</span></label>)}</div></fieldset>
      <fieldset><legend>Where was the pressure? <span>Optional</span></legend><div className="lr-chips">{Object.entries(departmentLabels).map(([value,label])=>{const dept=value as 'desk'|'kitchen'|'bar',selected=feedback.affectedDepartments?.includes(dept);return <button type="button" key={dept} aria-pressed={Boolean(selected)} onClick={()=>update({affectedDepartments:selected?feedback.affectedDepartments?.filter(d=>d!==dept):[...(feedback.affectedDepartments??[]),dept]})}>{label}</button>;})}</div></fieldset>
      <label>Did management step in to keep service moving?<select required value={feedback.managerHelp??''} onChange={e=>update({managerHelp:e.target.value as ServiceFeedback['managerHelp']})}><option value="" disabled>Choose an answer</option><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Not sure / need to check</option></select></label>
      {askAnticipation?<><label>Was the extra published coverage planned for this busier period?<select required value={feedback.extraStaffingAnticipated??''} onChange={e=>update({extraStaffingAnticipated:e.target.value as ServiceFeedback['extraStaffingAnticipated']})}><option value="" disabled>Choose an answer</option><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Not sure / need to check</option></select></label><label>What prompted that extra coverage? <span className="lr-small">Optional</span><textarea rows={2} maxLength={400} value={feedback.anticipatedReason??''} placeholder="For example, rain was forecast or a busy period was expected." onChange={e=>update({anticipatedReason:e.target.value})}/></label></>:null}
      <label>What did you or the team notice?<textarea ref={noteRef} required rows={3} maxLength={1600} value={note} onChange={e=>setNote(e.target.value)} placeholder="Any desk queues, bar waits, kitchen ticket delays, or extra help? If it went smoothly, say so."/></label>
      <p className="lr-small">Ask the staff who worked {surge.period.label} if you need to check. Your phone keyboard's microphone works too.</p>
      <div className="lr-actions"><button className="lr-primary" type="submit">Review answer</button><button className="lr-text-button" type="button" onClick={()=>setEditing(false)}>Back to question</button></div><p className="lr-small lr-reassurance">Nothing is saved until you confirm.</p>
    </form>:null}
    {editing&&confirm?<div className="lr-confirm"><div className="lr-form-heading"><h3>Does this sound right?</h3><span>2 of 2 · Review</span></div><ServiceSummary feedback={response().serviceFeedback!}/><blockquote>{note}</blockquote>{feedback.overall==='need_to_check'?<p className="lr-small">This saves your note and keeps the question open until you check with the team.</p>:<p className="lr-small">This records your service report. It does not automatically change staffing rules.</p>}<div className="lr-actions"><button className="lr-primary" disabled={busy} onClick={()=>void save()}>Save service feedback</button><button className="lr-text-button" disabled={busy} onClick={()=>setConfirm(false)}>Back to edit</button></div></div>:null}
    {error?<p role="alert">{error}</p>:null}
    {q.history.length?<details className="lr-history-panel"><summary>Answer history ({q.history.length})</summary>{q.history.map(h=><div className="lr-history" key={h.revision}><p className="lr-small">Revision {h.revision} · {h.kind} · {new Date(h.createdAt).toLocaleString()}</p>{h.response?.serviceFeedback?<ServiceSummary feedback={h.response.serviceFeedback}/>:null}<p>{h.response?.note??'Answer reopened'}</p></div>)}</details>:null}
  </article>;
}
