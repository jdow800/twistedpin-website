import {useEffect,useState} from 'react';
import {getSchedulingIdeas,getRecapPreview,type SchedulingIdea,type LaborReview} from './api';
export default function NextSchedule({review}:{review:LaborReview}){
  const [items,setItems]=useState<SchedulingIdea[]>([]),[error,setError]=useState(''),[email,setEmail]=useState<{subject:string;html:string;text:string}|null>(null),[showEmail,setShowEmail]=useState(false);
  const load=async()=>{try{const result=await getSchedulingIdeas();setItems(result.items);setError('');}catch{setError('Could not load saved scheduling ideas. Please retry.');}};
  useEffect(()=>{void load();setEmail(null);setShowEmail(false);},[review]);
  const preview=async()=>{try{setEmail((await getRecapPreview(review.id)).email);setShowEmail(true);}catch{setError('Could not load the recap preview. Your saved responses remain available.');}};
  const current=items.some(i=>i.reviewId===review.id);
  return <section id="next-schedule" className="lr-next-schedule" aria-label="Ideas for your next schedule">
    <div className="lr-section-heading"><h2>Next schedule</h2><span>Your Yes and Maybe ideas stay here</span></div>
    {error?<div role="alert"><p>{error}</p><button onClick={()=>void load()}>Retry</button></div>:null}
    {!items.length&&!error?<p className="lr-small">Ideas you agree with or want to check will appear here after you save.</p>:null}
    {items.map(i=><article key={i.reviewId+i.questionId} className="lr-plan-item"><span className="lr-badge">{i.response.trial?.state==='tried'?'Tried - check the outcome':i.response.decision==='adjust'?'Yes · idea to try':'Maybe · check condition'}</span><h3>{i.title}</h3><p>{i.response.action||i.proposal.action}</p>{i.response.note?<p><strong>Your context:</strong> {i.response.note}</p>:null}<details><summary>When it applies</summary><ul>{i.proposal.conditions.map(c=><li key={c}>{c}</li>)}</ul></details><a href={`/labor/?pilot=1&review=${encodeURIComponent(i.reviewId)}#q-${i.questionId}`}>Review or update this idea →</a></article>)}
    {current?<div className="lr-plan-footer"><p className="lr-small">{review.recapDeliveryEnabled?(review.recap?.state==='enqueued'?'Your weekly recap is in the email queue. Later edits stay on this page.':review.recap?.state==='pending'?`Recap planned for ${new Date(review.recap.dueAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}, about 90 minutes after completion.`:'Complete the remaining ideas to prepare one recap.'): 'Owner preview: your answers persist here. Automatic email delivery is off.'}</p><button onClick={()=>void preview()}>Preview follow-up email</button></div>:null}
    {showEmail&&email?<details className="lr-recap-preview" open><summary>{email.subject}</summary><iframe title="Scheduling recap email preview" sandbox="" srcDoc={email.html}/></details>:null}
  </section>;
}
