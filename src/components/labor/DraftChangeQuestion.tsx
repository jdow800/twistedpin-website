import {useEffect,useRef,useState} from 'react';
import {useDictation} from '../liquor/useSpeech';
import {LaborApiError,saveReviewResponse,type LaborReview,type ReviewQuestion,type ReviewResponse} from './api';
import {questionIsActive} from './review-progress';
import {changeDay,changeHeadline,changedIntervals,spanLabel} from './draft-change';

type Decision=Extract<ReviewResponse['decision'],'keep'|'data_wrong'|'ask_owner'>;
const saved:Record<Decision,string>={keep:'Saved',ask_owner:'Saved · sent to Jon',data_wrong:'Saved · comparison flagged'};

/** Jon Oct15: "VERY easy to digest and answer." The change as a small table, one box, one tap to save.
 * The published coverage is the GM's call ("keep"); asking Jon or flagging a bad comparison are the only
 * other answers. Whole crews stay one tap away. Saving needs no confirm step because Undo is right there. */
export default function DraftChangeQuestion({question:q,review,onSaved}:{number:number;question:ReviewQuestion;review:LaborReview;onSaved:(r:LaborReview)=>void}){
  const c=q.draftChange!;
  const rows=changedIntervals(c.original,c.scheduled);
  const [editing,setEditing]=useState(!q.response),[note,setNote]=useState(q.response?.note??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const noteRef=useRef<HTMLTextAreaElement>(null);
  const speech=useDictation(text=>{if(text.trim())setNote(n=>[n.trim(),text.trim()].filter(Boolean).join(' ').slice(0,1600));});
  useEffect(()=>{if(editing&&q.response)noteRef.current?.focus({preventScroll:true});},[editing]);
  const ready=Boolean(note.trim())&&!busy&&questionIsActive(q);
  const send=async(body:{response?:ReviewResponse;undo?:boolean})=>{
    setBusy(true);setError('');
    try{const next=await saveReviewResponse(review.id,{questionId:q.id,expectedRevision:q.revision,...body});onSaved(next);const r=next.questions.find(x=>x.id===q.id)?.response??null;setNote(r?.note??'');setEditing(!r);}
    catch(e){setError(e instanceof LaborApiError&&e.status===409?'This answer changed while the page was open. Your text is still here. Reload to see the latest.':'Save did not go through. Your text is still here; please try again.');}
    finally{setBusy(false);}
  };
  const save=(decision:Decision)=>{if(ready)void send({response:{decision,context:[],note:note.trim(),action:'',followUpDate:q.followUpDate,outcome:'',status:'follow_up'}});};
  const decision=(q.response?.decision??'keep') as Decision;
  return <article className="lr-question lr-change-question" id={`q-${q.id}`} aria-labelledby={`q-${q.id}-title`}>
    <div className="lr-change-head"><h3 id={`q-${q.id}-title`}>{changeDay(c)}</h3>{q.response?<span className="lr-badge lr-badge-saved">{saved[decision]??'Saved'}</span>:null}</div>
    <p className="lr-change-net">{changeHeadline(c.netPersonMinutes)}</p>
    <table className="lr-change-table"><caption className="lr-visually-hidden">Staff on at once: AI draft versus published schedule</caption>
      <thead><tr><th scope="col">Time</th><th scope="col">AI draft</th><th scope="col">Published</th></tr></thead>
      <tbody>{rows.map(r=><tr key={r.startMinute}><th scope="row">{spanLabel(c.date,r)}</th><td>{r.originalCount}</td><td>{r.scheduledCount}</td></tr>)}</tbody>
    </table>
    {rows.some(r=>spanLabel(c.date,r).includes('*'))?<p className="lr-small">* after the clock change</p>:null}
    <details className="lr-change-shifts"><summary>Full shifts</summary><div className="lr-change-columns">
      {([['AI draft',c.original],['Published',c.scheduled]] as const).map(([label,shifts])=><div key={label}><h4>{label}</h4><ul>{shifts.map((s,i)=><li key={i}>{s.sourceRole} {spanLabel(c.date,s)}</li>)}</ul></div>)}
    </div></details>
    {editing?<form className="lr-change-answer" onSubmit={e=>{e.preventDefault();save('keep');}}>
      <label>Why the change?<textarea ref={noteRef} required rows={2} maxLength={1600} value={note} placeholder="A few words is plenty." onChange={e=>setNote(e.target.value)}/></label>
      {speech.supported?<button type="button" className="lr-text-button lr-dictate" onClick={()=>speech.recording?speech.stop():speech.start()}>{speech.recording?'Stop and add to note':'Talk instead'}</button>:null}
      {speech.error?<p className="lr-small">{speech.error} You can type above.</p>:null}
      <div className="lr-actions"><button className="lr-primary" type="submit" disabled={!ready}>Save</button>
        {q.response?<button type="button" className="lr-text-button" disabled={busy} onClick={()=>{setEditing(false);setNote(q.response!.note);}}>Cancel</button>:null}
      </div>
      <p className="lr-alt-answers">Or: <button type="button" className="lr-text-button" disabled={!ready} onClick={()=>save('ask_owner')}>Ask Jon instead</button> · <button type="button" className="lr-text-button" disabled={!ready} onClick={()=>save('data_wrong')}>Comparison looks wrong</button></p>
    </form>:<div className="lr-saved" role="status"><p>{q.response!.note}</p><div className="lr-actions"><button disabled={busy} onClick={()=>setEditing(true)}>Edit</button>{q.canUndo?<button className="lr-text-button" disabled={busy} onClick={()=>void send({undo:true})}>Undo</button>:null}</div></div>}
    {error?<p role="alert">{error}</p>:null}
  </article>;
}
