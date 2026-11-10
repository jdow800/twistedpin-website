import {useState} from 'react';
import {LaborApiError,saveReviewResponse,type LaborReview,type ReviewQuestion,type ReviewResponse,type ServiceFeedback,type DemandMetric} from './api';
import {questionIsActive} from './review-progress';
import {answerLabel,departmentLabels,quickOutcomes,serviceResponse,typedNote,yesNoLabel} from './service-feedback';

const metricLabels:Record<DemandMetric,string>={food_and_beverage_net_sales:'Food & drink net sales',kitchen_net_sales:'Food net sales',bar_net_sales:'Drink net sales',desk_interactions:'Desk interactions'};
const displayValue=(metric:DemandMetric,value:number)=>metric==='desk_interactions'?new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value/100);
const minute=(value:number)=>{const hour=Math.floor(value/60)%24,minutes=value%60;return `${hour%12||12}${minutes?`:${String(minutes).padStart(2,'0')}`:''}${hour<12?'am':'pm'}`;};
const range=(low:number,high:number)=>low===high?String(low):`${low}-${high}`;
const hours=(minutes:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(minutes/60);
const day=(value:string)=>new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});

export function ServiceSummary({feedback}:{feedback:ServiceFeedback}){
  return <div className="lr-service-summary"><h3>{answerLabel(feedback.overall)}</h3>
    {feedback.affectedDepartments.length?<p><strong>Where:</strong> {feedback.affectedDepartments.map(d=>departmentLabels[d]).join(', ')}</p>:null}
    {feedback.managerHelp!=='unknown'?<p><strong>Manager stepped in:</strong> {yesNoLabel(feedback.managerHelp)}</p>:null}
    {feedback.extraStaffingAnticipated!=='unknown'||feedback.anticipatedReason?<p><strong>Extra coverage was planned for this:</strong> {yesNoLabel(feedback.extraStaffingAnticipated)}{feedback.anticipatedReason?` · ${feedback.anticipatedReason}`:''}</p>:null}
  </div>;
}

type Department=ServiceFeedback['affectedDepartments'][number];
/** A tight answer with nothing said about it yet: offer the optional detail, open. The page remounts a card after each
 * save, so this is read from the saved answer and not from state set after the tap. */
const wantsDetail=(r:ReviewQuestion['response'])=>{const f=r?.serviceFeedback;return Boolean(f)&&(f!.overall==='strained'||f!.overall==='fell_behind')&&!f!.affectedDepartments.length&&f!.managerHelp==='unknown'&&!typedNote(r?.note);};
/** Jon 2026-11-09: "give him some buttons and/or a longer response if needed ... quick painless." One tap answers and
 * saves. Where it was tight, whether a manager stepped in and a note are optional and come after the tap. With nothing
 * typed, the note is the button's own words, so every saved answer still says something. */
export function ServiceAnswer({question:q,review,onSaved}:{question:ReviewQuestion;review:LaborReview;onSaved:(r:LaborReview)=>void}){
  const saved=q.response?.serviceFeedback,answered=Boolean(saved)&&saved!.overall!=='need_to_check';
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[changing,setChanging]=useState(false),[detail,setDetail]=useState(()=>wantsDetail(q.response));
  const [note,setNote]=useState(typedNote(q.response?.note)),[where,setWhere]=useState<Department[]>(saved?.affectedDepartments??[]),[manager,setManager]=useState(saved?.managerHelp==='yes');
  const send=async(body:{response?:ReviewResponse;undo?:boolean},after:()=>void)=>{
    if(!questionIsActive(q)||busy)return;
    setBusy(true);setError('');
    try{
      const next=await saveReviewResponse(review.id,{questionId:q.id,expectedRevision:q.revision,...body});onSaved(next);
      if(body.undo){const r=next.questions.find(x=>x.id===q.id)?.response??null;setNote(typedNote(r?.note));setWhere(r?.serviceFeedback?.affectedDepartments??[]);setManager(r?.serviceFeedback?.managerHelp==='yes');}
      after();
    }
    catch(e){setError(e instanceof LaborApiError&&e.status===409?'This question or answer changed while the page was open. Reload to see its current status.':'Save did not go through. Please try again.');}
    finally{setBusy(false);}
  };
  const build=(overall:ServiceFeedback['overall'])=>serviceResponse(note.trim()||answerLabel(overall),{overall,affectedDepartments:where,managerHelp:manager?'yes':saved?.managerHelp==='no'?'no':'unknown',extraStaffingAnticipated:saved?.extraStaffingAnticipated??'unknown',...(saved?.anticipatedReason?{anticipatedReason:saved.anticipatedReason}:{})},q.followUpDate);
  const typed=typedNote(q.response?.note);
  return <>
    {!answered||changing?<div className="lr-change-answer lr-quick-answer">
      <p className="lr-quick-ask" id={`ask-${q.id}`}>Did the crew keep up?</p>
      <div className="lr-quick" role="group" aria-labelledby={`ask-${q.id}`}>{quickOutcomes.map(([value,label])=><button type="button" key={value} aria-pressed={saved?.overall===value} disabled={busy} onClick={()=>void send({response:build(value)},()=>{setChanging(false);setDetail(value!=='handled');})}>{label}</button>)}</div>
      <p className="lr-small">{saved?.overall==='need_to_check'?'Saved earlier as checking with the team; this stays open until then. ':''}One tap saves it. You can add a note after.</p>
      {changing?<div className="lr-actions"><button className="lr-text-button" type="button" disabled={busy} onClick={()=>setChanging(false)}>Cancel</button></div>:null}
    </div>:<div className="lr-saved" role="status"><ServiceSummary feedback={saved!}/>{typed?<p>{typed}</p>:null}
      {detail?<form className="lr-change-answer lr-quick-detail" onSubmit={e=>{e.preventDefault();if(!where.length&&!manager&&!note.trim()&&wantsDetail(q.response)){setDetail(false);return;}void send({response:build(saved!.overall)},()=>setDetail(false));}}>
        <fieldset><legend>Where was it tight? <span>Optional</span></legend><div className="lr-chips">{(Object.keys(departmentLabels) as Department[]).map(dept=>{const on=where.includes(dept);return <button type="button" key={dept} aria-pressed={on} onClick={()=>setWhere(on?where.filter(d=>d!==dept):[...where,dept])}>{departmentLabels[dept]}</button>;})}</div></fieldset>
        <label className="lr-check"><input type="checkbox" checked={manager} onChange={e=>setManager(e.target.checked)}/><span>A manager stepped in</span></label>
        <label>Anything to add? <span className="lr-small">Optional</span><textarea rows={2} maxLength={1600} value={note} onChange={e=>setNote(e.target.value)} placeholder="Waits, ticket delays, what helped."/></label>
        <div className="lr-actions"><button className="lr-primary" type="submit" disabled={busy}>Save detail</button><button className="lr-text-button" type="button" disabled={busy} onClick={()=>setDetail(false)}>Skip</button><button className="lr-text-button" type="button" disabled={busy} onClick={()=>{setDetail(false);setChanging(true);}}>Change</button></div>
      </form>:<div className="lr-actions"><button disabled={busy} onClick={()=>setDetail(true)}>Add detail</button><button className="lr-text-button" disabled={busy} onClick={()=>setChanging(true)}>Change</button>{q.canUndo?<button className="lr-text-button" disabled={busy} onClick={()=>void send({undo:true},()=>{setDetail(false);setChanging(false);})}>Undo</button>:null}</div>}
    </div>}
    {error?<p role="alert">{error}</p>:null}
  </>;
}

/** Jon Oct15 TLDR: the rush in one line and the crew in a small table. Jon Nov 9: three one-tap answers under it.
 * Answers keep their meaning (serviceResponse). Undo stays. */
export default function DemandSurgeQuestion({question:q,review,onSaved}:{number:number;question:ReviewQuestion;review:LaborReview;onSaved:(r:LaborReview)=>void}){
  const surge=q.demandSurge!;
  const primary=surge.metrics.find(m=>m.metric===surge.primaryMetric)!;
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
    <ServiceAnswer question={q} review={review} onSaved={onSaved}/>
  </article>;
}
