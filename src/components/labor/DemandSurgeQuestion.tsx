import {useState} from 'react';
import {LaborApiError,saveReviewResponse,type LaborReview,type ReviewQuestion,type ServiceFeedback,type DemandMetric} from './api';
import {questionIsActive} from './review-progress';
import {answerLabel,departmentLabels,serviceOutcomes,serviceResponse,yesNoLabel} from './service-feedback';

const metricLabels:Record<DemandMetric,string>={food_and_beverage_net_sales:'Food & drink net sales',kitchen_net_sales:'Food net sales',bar_net_sales:'Drink net sales',desk_interactions:'Desk interactions'};
const displayValue=(metric:DemandMetric,value:number)=>metric==='desk_interactions'?new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value/100);
const minute=(value:number)=>{const hour=Math.floor(value/60)%24,minutes=value%60;return `${hour%12||12}${minutes?`:${String(minutes).padStart(2,'0')}`:''}${hour<12?'am':'pm'}`;};
const range=(low:number,high:number)=>low===high?String(low):`${low}-${high}`;
const hours=(minutes:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(minutes/60);
const day=(value:string)=>new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});

export function ServiceSummary({feedback}:{feedback:ServiceFeedback}){
  return <div className="lr-service-summary"><h3>{answerLabel(feedback.overall)}</h3>
    {feedback.affectedDepartments.length?<p><strong>Affected:</strong> {feedback.affectedDepartments.map(d=>departmentLabels[d]).join(', ')}</p>:null}
    <p><strong>Manager stepped in:</strong> {yesNoLabel(feedback.managerHelp)}</p>
    {feedback.extraStaffingAnticipated!=='unknown'||feedback.anticipatedReason?<p><strong>Extra coverage was planned for this:</strong> {yesNoLabel(feedback.extraStaffingAnticipated)}{feedback.anticipatedReason?` · ${feedback.anticipatedReason}`:''}</p>:null}
  </div>;
}

export function ServiceAnswer({question:q,review,onSaved,askAnticipation=false}:{question:ReviewQuestion;review:LaborReview;onSaved:(r:LaborReview)=>void;askAnticipation?:boolean}){
  const [editing,setEditing]=useState(!q.response),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [note,setNote]=useState(q.response?.note??'');
  const [feedback,setFeedback]=useState<Partial<ServiceFeedback>>(q.response?.serviceFeedback??{affectedDepartments:[]});
  const update=(patch:Partial<ServiceFeedback>)=>setFeedback(f=>({...f,...patch}));
  const ready=Boolean(feedback.overall&&feedback.managerHelp&&(!askAnticipation||feedback.extraStaffingAnticipated)&&note.trim());
  const response=()=>serviceResponse(note,{overall:feedback.overall!,affectedDepartments:feedback.affectedDepartments??[],managerHelp:feedback.managerHelp!,extraStaffingAnticipated:askAnticipation?feedback.extraStaffingAnticipated!:'unknown',...(askAnticipation&&feedback.anticipatedReason?.trim()?{anticipatedReason:feedback.anticipatedReason.trim()}: {})},q.followUpDate);
  const save=async(undo=false)=>{
    if(!questionIsActive(q)||(!undo&&!ready))return;
    setBusy(true);setError('');
    try{onSaved(await saveReviewResponse(review.id,{questionId:q.id,expectedRevision:q.revision,...(undo?{undo:true}:{response:response()})}));setEditing(false);}
    catch(e){setError(e instanceof LaborApiError&&e.status===409?'This question or answer changed while the page was open. Your text is still here. Reload to review its current status.':'Save did not complete. Your answer is still here; please retry.');}
    finally{setBusy(false);}
  };
  return <>
    {editing?<form className="lr-change-answer" onSubmit={e=>{e.preventDefault();void save();}}>
      <fieldset><legend>How did the crew handle it?</legend><div className="lr-decisions">{serviceOutcomes.map(([value,label])=><label className={`lr-choice ${feedback.overall===value?'lr-choice-selected':''}`} key={value}><input required type="radio" name={`service-${q.id}`} checked={feedback.overall===value} onChange={()=>update({overall:value})}/><span>{label}</span></label>)}</div></fieldset>
      <fieldset><legend>Where was the pressure? <span>Optional</span></legend><div className="lr-chips">{Object.entries(departmentLabels).map(([value,label])=>{const dept=value as 'desk'|'kitchen'|'bar',selected=feedback.affectedDepartments?.includes(dept);return <button type="button" key={dept} aria-pressed={Boolean(selected)} onClick={()=>update({affectedDepartments:selected?feedback.affectedDepartments?.filter(d=>d!==dept):[...(feedback.affectedDepartments??[]),dept]})}>{label}</button>;})}</div></fieldset>
      <label>Did a manager step in?<select required value={feedback.managerHelp??''} onChange={e=>update({managerHelp:e.target.value as ServiceFeedback['managerHelp']})}><option value="" disabled>Choose</option><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Not sure</option></select></label>
      {askAnticipation?<><label>Was the extra coverage planned for this?<select required value={feedback.extraStaffingAnticipated??''} onChange={e=>update({extraStaffingAnticipated:e.target.value as ServiceFeedback['extraStaffingAnticipated']})}><option value="" disabled>Choose</option><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Not sure</option></select></label><label>What prompted it? <span className="lr-small">Optional</span><textarea rows={2} maxLength={400} value={feedback.anticipatedReason??''} placeholder="Rain in the forecast, a busy night expected…" onChange={e=>update({anticipatedReason:e.target.value})}/></label></>:null}
      <label>What happened?<textarea required rows={2} maxLength={1600} value={note} onChange={e=>setNote(e.target.value)} placeholder="Queues, waits, ticket delays, or it went smoothly."/></label>
      <div className="lr-actions"><button className="lr-primary" type="submit" disabled={busy||!ready}>Save</button>{q.response?<button className="lr-text-button" type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button>:null}</div>
    </form>:<div className="lr-saved" role="status">{q.response!.serviceFeedback?<ServiceSummary feedback={q.response!.serviceFeedback}/>:null}<p>{q.response!.note}</p>{q.response!.serviceFeedback?.overall==='need_to_check'?<p className="lr-small">Saved. Check with the team, then update; this stays open until then.</p>:null}<div className="lr-actions"><button disabled={busy} onClick={()=>setEditing(true)}>Edit</button>{q.canUndo?<button className="lr-text-button" disabled={busy} onClick={()=>void save(true)}>Undo</button>:null}</div></div>}
    {error?<p role="alert">{error}</p>:null}
  </>;
}

/** Jon Oct15 TLDR: the rush in one line, the crew in a small table, the answer form open on the card and one Save.
 * Answers keep their meaning (serviceResponse); only the wording and the extra confirm step are gone. Undo stays. */
export default function DemandSurgeQuestion({question:q,review,onSaved}:{number:number;question:ReviewQuestion;review:LaborReview;onSaved:(r:LaborReview)=>void}){
  const surge=q.demandSurge!;
  const primary=surge.metrics.find(m=>m.metric===surge.primaryMetric)!;
  const askAnticipation=['material_adds','material_mixed'].includes(surge.staffing.classification)&&!surge.knownOperatingExplanation;
  const increase=primary.increasePercent===null?'':` (+${Math.round(primary.increasePercent)}%)`;
  return <article className="lr-question lr-change-question lr-surge-question" id={`q-${q.id}`} aria-labelledby={`q-${q.id}-title`}>
    <div className="lr-change-head"><h3 id={`q-${q.id}-title`}>{day(q.date)} · {surge.period.label}</h3>{q.response?<span className="lr-badge lr-badge-saved">{q.response.serviceFeedback?.overall==='need_to_check'?'Check with team':'Saved'}</span>:null}</div>
    <p className="lr-change-net">{metricLabels[surge.primaryMetric]}: {displayValue(surge.primaryMetric,primary.forecastValue)} expected → {displayValue(surge.primaryMetric,primary.actualValue)} actual{increase}</p>
    <table className="lr-change-table"><caption className="lr-visually-hidden">Staff on at once during {surge.period.label}: AI draft versus published schedule</caption>
      <thead><tr><th scope="col">Crew at once</th><th scope="col">AI draft</th><th scope="col">Published</th></tr></thead>
      <tbody>{surge.staffing.departments.map(d=><tr key={d.department}><th scope="row">{departmentLabels[d.department]}</th><td>{range(d.originalMin,d.originalMax)}</td><td>{range(d.publishedMin,d.publishedMax)}</td></tr>)}</tbody>
    </table>
    {surge.hotHours.length?<p className="lr-small">Biggest jump: {surge.hotHours.map(h=>`${minute(h.startMinute)}-${minute(h.endMinute)}`).join(', ')}</p>:null}
    {surge.knownOperatingExplanation?<p className="lr-small"><strong>Already noted:</strong> {surge.knownOperatingExplanation.length>300?`${surge.knownOperatingExplanation.slice(0,300)}…`:surge.knownOperatingExplanation}</p>:null}
    <details className="lr-change-shifts"><summary>Full shifts & sources</summary><div className="lr-detail-body">
      {surge.staffing.departments.map(d=><div className="lr-surge-shifts" key={d.department}><h4>{departmentLabels[d.department]}</h4><p><strong>AI:</strong> {d.original.map(s=>`${s.role} ${minute(s.startMinute)}-${minute(s.endMinute)}`).join('; ')||'No planned shifts'}</p><p><strong>Published:</strong> {d.published.map(s=>`${s.role} ${minute(s.startMinute)}-${minute(s.endMinute)}`).join('; ')||'No published shifts'}</p><p className="lr-small">Added {hours(d.addedPersonMinutes)} staff-hours; removed {hours(d.removedPersonMinutes)} staff-hours.</p></div>)}
      <p className="lr-small">{surge.staffing.published.basis==='pre_service_published_snapshot'?'Published roster captured before service.':'Published roster captured after the fact; later edits may be included.'} Roster captured {new Date(surge.staffing.published.capturedAt).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} Central.</p>
      {surge.hotHours.length?<p className="lr-small">Largest increases: {surge.hotHours.map(h=>`${minute(h.startMinute)}-${minute(h.endMinute)} (${metricLabels[h.metric].toLowerCase()}, +${displayValue(h.metric,h.increaseValue)})`).join('; ')}</p>:null}
      <p><strong>Original question:</strong> {q.prompt}</p>{surge.knownOperatingExplanation?<p><strong>Saved operating explanation:</strong> {surge.knownOperatingExplanation}</p>:null}<ul>{q.evidence.map(e=><li key={e}>{e}</li>)}</ul><p className="lr-sources">{q.sources.join('; ')}</p>
    </div></details>
    <ServiceAnswer question={q} review={review} onSaved={onSaved} askAnticipation={askAnticipation}/>
  </article>;
}
