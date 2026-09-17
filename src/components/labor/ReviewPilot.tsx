import { useEffect, useState } from "react";
import { useDictation } from "../liquor/useSpeech";
import { getReview, listReviews, saveReviewResponse, LaborApiError, type LaborReview, type ReviewQuestion, type ReviewResponse } from "./api";
import "./review-pilot.css";
const contexts=[["training","Training"],["crew_support","Crew needed support"],["experienced_crew","Experienced crew"],["weather","Weather"],["event","Party / event"],["building_activity","Different building activity"],["other","Other"]];
const decisions:[ReviewResponse["decision"],string][]=[["keep","Keep this coverage"],["adjust","Try an adjustment"],["data_wrong","The comparison is wrong"],["ask_owner","I need Jon’s input"]];
const money=(c:number|null)=>c===null?"Awaiting inputs":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);

export default function ReviewPilot(){
  const [review,setReview]=useState<LaborReview|null>(null);
  const [list,setList]=useState<{id:string;weekStart:string;open:number}[]>([]);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const load=async(id?:string)=>{
    setLoading(true);setError("");
    try{
      const rows=await listReviews();setList(rows);
      const selected=id??new URLSearchParams(window.location.search).get("review")??rows[0]?.id;
      setReview(selected?await getReview(selected):null);
    }catch(e){setError(e instanceof LaborApiError&&e.status===404?"The pilot is not enabled yet. Your existing labor notes are still available.":"Couldn’t load the review. Please retry; your saved answers remain on the server.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  return <section className="lr-pilot">
    <p className="lr-kicker">Labor review · pilot</p><h1>A few minutes to plan a better week</h1>
    <p>Add what the numbers missed. Keep useful coverage, correct the data, or choose one change to check next time.</p>
    {loading?<p role="status">Loading review…</p>:null}
    {error?<div role="alert"><p>{error}</p><button onClick={()=>void load()}>Retry</button> <a href="/labor/">Existing labor notes</a></div>:null}
    {!loading&&!error&&!review?<p>No pilot review has been prepared yet.</p>:null}
    {review&&!loading&&!error?<>
      <label className="lr-week">Review week<select aria-label="Review week" value={review.id} onChange={e=>void load(e.target.value)}>{list.map(r=><option key={r.id} value={r.id}>Week of {r.weekStart} · {r.open} open</option>)}</select></label>
      <div className="lr-metric"><p>Week of {review.packet.weekStart} · Monday–Sunday</p><strong>{review.metric.percent===null?"Labor % pending":`${review.metric.percent.toFixed(1)}%`}</strong><p>{review.metric.estimate?"Estimated earned wages":"Earned wages"} + management salaries / venue net sales</p><p>{review.metric.exclusions}</p>
        <details><summary>Calculation and source coverage</summary><p>{review.packet.basisNotes}</p><p>Labor: {money(review.metric.laborCents)} · Reported sales inputs: {money(review.metric.salesCents)}</p>{review.metric.issues.length?<ul>{review.metric.issues.map(i=><li key={i}>{i}</li>)}</ul>:null}<p>Snapshot prepared {new Date(review.packet.generatedAt).toLocaleString()}.</p></details>
      </div>
      <p>{review.questions.length} {review.questions.length===1?"question":"questions"}. Saved answers stay available after the week ends.</p>
      {review.questions.map(q=><Question key={`${review.id}:${q.id}:${q.revision}`} question={q} review={review} onSaved={r=>{setReview(r);setList(old=>old.map(x=>x.id===r.id?{...x,open:r.questions.filter(q=>q.response?.status!=="closed").length}:x));}}/>)}
    </>:null}
  </section>;
}

function Question({question:q,review,onSaved}:{question:ReviewQuestion;review:LaborReview;onSaved:(r:LaborReview)=>void}){
  const [editing,setEditing]=useState(!q.response),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [form,setForm]=useState<ReviewResponse>(q.response??{decision:"keep",context:[],note:"",action:"",followUpDate:q.followUpDate,outcome:"",status:"follow_up"});
  const [usedSpeech,setUsedSpeech]=useState("");
  const speech=useDictation();
  const update=(patch:Partial<ReviewResponse>)=>setForm(f=>({...f,...patch}));
  const save=async(undo=false)=>{
    setBusy(true);setError("");
    try{onSaved(await saveReviewResponse(review.id,{questionId:q.id,expectedRevision:q.revision,...(undo?{undo:true}:{response:form})}));}
    catch(e){setError(e instanceof LaborApiError&&e.status===409?"Another answer was saved while this page was open. Your text is still here. Copy it if needed, then reload to review the newer answer.":"Save didn’t complete. Your answer is still here; please retry.");}
    finally{setBusy(false);}
  };
  return <article className="lr-question" aria-labelledby={`q-${q.id}`}>
    <p className="lr-kicker">{q.date} · {q.response?.status==="closed"?"Outcome recorded":q.response?"Saved · follow-up pending":"Needs context"}</p>
    <h2 id={`q-${q.id}`}>{q.title}</h2><p>{q.prompt}</p>
    <details><summary>What this question is based on</summary><ul>{q.evidence.map(e=><li key={e}>{e}</li>)}</ul><p className="lr-sources">Sources: {q.sources.join("; ")}</p></details>
    {!editing&&q.response?<div className="lr-saved" role="status"><strong>Saved: {decisions.find(d=>d[0]===form.decision)?.[1]}</strong><p>{form.note}</p>{form.action?<p>Next step: {form.action}</p>:null}<p>{form.status==="closed"?`Outcome: ${form.outcome}`:`Follow up: ${form.followUpDate}`}</p>{form.decision==="ask_owner"?<p>Owner input requested in this review. No notification has been sent during the pilot.</p>:null}<button onClick={()=>setEditing(true)}>Edit / add outcome</button>{q.canUndo?<button disabled={busy} onClick={()=>void save(true)}>Undo last save</button>:null}</div>:null}
    {editing&&!confirm?<form onSubmit={e=>{e.preventDefault();setConfirm(true);}}>
      <fieldset><legend>Anything the numbers missed? <span>(optional)</span></legend><div className="lr-chips">{contexts.map(([value,label])=><button type="button" key={value} aria-pressed={form.context.includes(value)} onClick={()=>update({context:form.context.includes(value)?form.context.filter(c=>c!==value):[...form.context,value]})}>{label}</button>)}</div></fieldset>
      <label>What was happening?<textarea required maxLength={1600} rows={3} value={form.note} onChange={e=>update({note:e.target.value})}/></label>
      {speech.supported?<div className="lr-dictation"><button type="button" onClick={()=>speech.recording?speech.stop():speech.start()}>{speech.recording?"Stop dictation":"Dictate a note"}</button>{speech.transcript&&speech.transcript!==usedSpeech?<><p>{speech.transcript}</p><button type="button" onClick={()=>{update({note:[form.note,speech.transcript].filter(Boolean).join(" ").slice(0,1600)});setUsedSpeech(speech.transcript);}}>Use dictated text</button></>:null}{speech.error?<p>{speech.error} You can type above.</p>:null}</div>:<p className="lr-small">Type your note, or use your phone keyboard’s microphone.</p>}
      <fieldset><legend>What should we do next?</legend>{decisions.map(([value,label])=><label className="lr-choice" key={value}><input type="radio" name={`decision-${q.id}`} checked={form.decision===value} onChange={()=>update({decision:value})}/>{label}</label>)}</fieldset>
      <label>Next step {form.decision==="adjust"?"(required)":"(optional)"}<textarea rows={2} maxLength={600} required={form.decision==="adjust"} value={form.action} onChange={e=>update({action:e.target.value})}/></label>
      <label>Check back on<input type="date" required value={form.followUpDate} onChange={e=>update({followUpDate:e.target.value})}/></label>
      {q.response?<><label>What happened afterward?<textarea rows={2} maxLength={1000} value={form.outcome} onChange={e=>update({outcome:e.target.value})} required={form.status==="closed"}/></label><label className="lr-choice"><input type="checkbox" checked={form.status==="closed"} onChange={e=>update({status:e.target.checked?"closed":"follow_up"})}/>Outcome recorded — close this question</label></>:null}
      <button className="lr-primary" type="submit">Review answer</button>{q.response?<button type="button" onClick={()=>{setForm(q.response!);setEditing(false);}}>Cancel edit</button>:null}
    </form>:null}
    {editing&&confirm?<div className="lr-confirm"><h3>Ready to save?</h3><p><strong>{decisions.find(d=>d[0]===form.decision)?.[1]}</strong></p><p>{form.note}</p>{form.action?<p>Next step: {form.action}</p>:null}<p>Follow up: {form.followUpDate}</p>{form.outcome?<p>Outcome: {form.outcome}</p>:null}<p className="lr-small">This records your explanation and decision. It does not automatically change the staffing baseline.</p><button className="lr-primary" disabled={busy} onClick={()=>void save()}>Save answer</button><button disabled={busy} onClick={()=>setConfirm(false)}>Back to edit</button></div>:null}
    {error?<p role="alert">{error}</p>:null}
    {q.history.length?<details><summary>Answer history ({q.history.length})</summary>{q.history.map(h=><div className="lr-history" key={h.revision}><p>Revision {h.revision} · {h.kind} · {new Date(h.createdAt).toLocaleString()}</p><p>{h.response?.note??"Answer reopened"}</p>{h.response?.outcome?<p>Outcome: {h.response.outcome}</p>:null}</div>)}</details>:null}
  </article>;
}
