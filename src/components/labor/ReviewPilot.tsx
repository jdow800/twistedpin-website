import { useEffect, useRef, useState } from "react";
import { useDictation } from "../liquor/useSpeech";
import { getReview, listReviews, saveReviewResponse, LaborApiError, type LaborReview, type ReviewQuestion, type ReviewResponse } from "./api";
import "./review-pilot.css";
import ProposalCard from './ProposalCard';
import NextSchedule from './NextSchedule';
import WeeklyOverview from './WeeklyOverview';

const contexts = [["training", "Training"], ["crew_support", "Crew support"], ["experienced_crew", "Experienced crew"], ["weather", "Weather"], ["event", "Party / event"], ["building_activity", "Other building activity"], ["other", "Other"]];
const decisions: [ReviewResponse["decision"], string][] = [["keep", "Keep this coverage"], ["adjust", "Try an adjustment"], ["consider","Maybe, with a condition"], ["data_wrong", "The comparison is wrong"], ["ask_owner", "I need Jon’s input"]];
const money = (c: number | null) => c === null ? "Pending" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const date = (value: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
const week = (start: string) => { const end = new Date(`${start}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + 6); return `${date(start)} – ${date(end.toISOString().slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}`; };

export default function ReviewPilot() {
  const [review, setReview] = useState<LaborReview | null>(null);
  const [list, setList] = useState<{ id: string; weekStart: string; open: number }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async (id?: string) => {
    setLoading(true); setError("");
    try {
      const rows = await listReviews(); setList(rows);
      const selected = id ?? new URLSearchParams(window.location.search).get("review") ?? rows[0]?.id;
      setReview(selected ? await getReview(selected) : null);
    } catch (e) {
      setError(e instanceof LaborApiError && e.status === 404 ? "This review is not available. Your existing labor notes are still available." : "Couldn’t load the review. Please retry; your saved answers remain on the server.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const awaitingContext = review?.questions.filter(q => !q.response).length ?? 0;
  return <section className="lr-pilot">
    <header className="lr-heading">
      <div><p className="lr-kicker">The weekly check-in</p><h1>Weekly labor review</h1><p className="lr-intro">Practical scheduling ideas. Your experience completes the picture.</p></div>
      {review && !loading && !error ? <label className="lr-week">Review week<select aria-label="Review week" value={review.id} onChange={e => void load(e.target.value)}>{list.map(r => <option key={r.id} value={r.id}>{week(r.weekStart)} · {r.open} open</option>)}</select></label> : null}
    </header>
    {loading ? <p className="lr-notice" role="status">Loading your review…</p> : null}
    {error ? <div role="alert"><p>{error}</p><button onClick={() => void load()}>Retry</button> <a href="/labor/?legacy=1">Existing labor notes</a></div> : null}
    {!loading && !error && !review ? <p className="lr-notice">No review has been prepared yet. Check back after the next weekly report.</p> : null}
    {review && !loading && !error ? <>
      <div className={`lr-overview ${review.packet.version===2?'lr-overview-ideas':''}`}>
        <section className="lr-metric" aria-label="Weekly labor percentage">
          <div className="lr-metric-top"><span>Labor / net sales</span><span className="lr-badge lr-badge-dark">{review.metric.percent === null ? "Data checks pending" : review.metric.estimate ? "Estimated" : "Verified inputs"}</span></div>
          <strong className="lr-metric-value">{review.metric.percent === null ? "Pending" : `${review.metric.percent.toFixed(1)}%`}</strong>
          <p>Hourly wages + management salaries</p><p className="lr-metric-note">Employer taxes and benefits excluded.</p>
        </section>
        <section className="lr-review-count" aria-label="Review progress">
          <span className="lr-count-number">{String(awaitingContext).padStart(2, "0")}</span>
          <div><h2>{awaitingContext === 0 ? "Context is up to date" : `${awaitingContext === 1 ? "Question" : "Questions"} to review`}</h2><p>{awaitingContext === 0 ? "Saved decisions and follow-ups are below." : "A short note is enough. Tell us what the numbers missed."}</p></div>
        </section>
      </div>
      <WeeklyOverview days={review.daily??[]}/>
      <details className="lr-calculation">
        <summary>How this week is measured <span>{review.metric.percent === null ? "Reconciliation in progress" : "Cost basis & sources"}</span></summary>
        <div className="lr-detail-body"><p>{review.metric.label}. {review.metric.exclusions}</p><p>{review.packet.basisNotes}</p>
          <dl className="lr-totals"><div><dt>Earned labor inputs</dt><dd>{money(review.metric.laborCents)}</dd></div><div><dt>Reported sales inputs</dt><dd>{money(review.metric.salesCents)}</dd></div></dl>
          {review.metric.issues.length ? <details><summary>View source checks ({review.metric.issues.length})</summary><ul>{review.metric.issues.map(i => <li key={i}>{i}</li>)}</ul></details> : null}
          <p className="lr-small">Snapshot prepared {new Date(review.packet.generatedAt).toLocaleString()}.</p>
        </div>
      </details>
      <div className="lr-section-heading"><h2>{review.questions.length ? "Please review & answer" : "No questions this week"}</h2><span>{review.questions.length ? "Your answers stay with the review" : "No response needed"}</span></div>
      {review.packet.recommendationStatus==='incomplete'?<p className="lr-notice">Some staffing comparisons are waiting on source checks. Only supported ideas are shown below.</p>:null}
      {review.questions.map((q, index) => q.proposal?<ProposalCard key={`${review.id}:${q.id}:${q.revision}`} number={index+1} question={q} review={review} onSaved={r=>{setReview(r);setList(old=>old.map(x=>x.id===r.id?{...x,open:r.questions.filter(q=>q.response?.status!=="closed").length}:x));}}/>:<Question key={`${review.id}:${q.id}:${q.revision}`} number={index + 1} question={q} review={review} onSaved={r => { setReview(r); setList(old => old.map(x => x.id === r.id ? { ...x, open: r.questions.filter(q => q.response?.status !== "closed").length } : x)); }} />)}
      {review.packet.version===2?<NextSchedule review={review}/>:null}
      <p className="lr-footer-note">Good reviews need both the numbers and your experience.</p>
    </> : null}
  </section>;
}

function Question({ number, question: q, review, onSaved }: { number: number; question: ReviewQuestion; review: LaborReview; onSaved: (r: LaborReview) => void }) {
  const [editing, setEditing] = useState(false), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [form, setForm] = useState<ReviewResponse>(q.response ?? { decision: "keep", context: [], note: "", action: "", followUpDate: q.followUpDate, outcome: "", status: "follow_up" });
  const [decisionChosen, setDecisionChosen] = useState(Boolean(q.response));
  const [usedSpeech, setUsedSpeech] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const speech = useDictation();
  const update = (patch: Partial<ReviewResponse>) => setForm(f => ({ ...f, ...patch }));
  useEffect(() => { if (editing && !confirm) noteRef.current?.focus({ preventScroll: true }); }, [editing, confirm]);
  const save = async (undo = false) => {
    setBusy(true); setError("");
    try { onSaved(await saveReviewResponse(review.id, { questionId: q.id, expectedRevision: q.revision, ...(undo ? { undo: true } : { response: form }) })); }
    catch (e) { setError(e instanceof LaborApiError && e.status === 409 ? "Another answer was saved while this page was open. Your text is still here. Copy it if needed, then reload to review the newer answer." : "Save didn’t complete. Your answer is still here; please retry."); }
    finally { setBusy(false); }
  };
  const followUp = <label>Check back on<input type="date" required value={form.followUpDate} onChange={e => update({ followUpDate: e.target.value })} /></label>;
  const nextStep = <label>Next step {form.decision === "adjust" ? "(required)" : "(optional)"}<textarea rows={2} maxLength={600} required={form.decision === "adjust"} value={form.action} placeholder="What would you like to try or check?" onChange={e => update({ action: e.target.value })} /></label>;
  return <article className="lr-question" aria-labelledby={`q-${q.id}`}>
    <div className="lr-question-header"><div className="lr-question-date"><span className="lr-question-number">{String(number).padStart(2, "0")}</span><time dateTime={q.date}>{date(q.date, { weekday: "long", month: "short", day: "numeric" })}</time></div><span className={`lr-badge ${q.response ? "lr-badge-saved" : ""}`}>{q.response?.status === "closed" ? "Outcome recorded" : q.response ? "Context saved" : "Needs context"}</span></div>
    <div className="lr-question-content"><h2 id={`q-${q.id}`}>{q.title}</h2><p className="lr-prompt">{q.prompt}</p>
      <details className="lr-evidence"><summary>See the numbers behind this question</summary><div className="lr-detail-body"><ul>{q.evidence.map(e => <li key={e}>{e}</li>)}</ul><details><summary>Source references</summary><p className="lr-sources">{q.sources.join("; ")}</p></details></div></details>
      {!editing && !q.response ? <div className="lr-question-action"><button className="lr-primary" onClick={() => setEditing(true)}>Add context <span aria-hidden="true">→</span></button><span>Type a note or use your voice.</span></div> : null}
      {!editing && q.response ? <div className="lr-saved" role="status"><p className="lr-kicker">Your decision</p><h3>{decisions.find(d => d[0] === form.decision)?.[1]}</h3><p>{form.note}</p>{form.action ? <p><strong>Next step:</strong> {form.action}</p> : null}<p className="lr-small">{form.status === "closed" ? `Outcome: ${form.outcome}` : `Follow up: ${date(form.followUpDate)}`}</p>{form.decision === "ask_owner" ? <p className="lr-small">Owner input requested in this review. This request is saved here for owner review.</p> : null}<div className="lr-actions"><button onClick={() => setEditing(true)}>Edit / add outcome</button>{q.canUndo ? <button className="lr-text-button" disabled={busy} onClick={() => void save(true)}>Undo last save</button> : null}</div></div> : null}
    </div>
    {editing && !confirm ? <form className="lr-answer" onSubmit={e => { e.preventDefault(); if (decisionChosen) setConfirm(true); }}>
      <div className="lr-form-heading"><h3>Your take</h3><span>1 of 2 · Add context</span></div>
      <label>What was happening?<textarea ref={noteRef} required maxLength={1600} rows={3} value={form.note} placeholder="A short explanation is enough." onChange={e => update({ note: e.target.value })} /></label>
      {speech.supported ? <div className="lr-dictation"><button className="lr-text-button" type="button" onClick={() => speech.recording ? speech.stop() : speech.start()}>{speech.recording ? "Stop dictation" : "Dictate a note"}</button>{speech.transcript && speech.transcript !== usedSpeech ? <><p>{speech.transcript}</p><button type="button" onClick={() => { update({ note: [form.note, speech.transcript].filter(Boolean).join(" ").slice(0, 1600) }); setUsedSpeech(speech.transcript); }}>Use dictated text</button></> : null}{speech.error ? <p>{speech.error} You can type above.</p> : null}</div> : <p className="lr-small">You can also use your phone keyboard’s microphone.</p>}
      <fieldset><legend>Anything to keep in mind? <span>Optional</span></legend><div className="lr-chips">{contexts.map(([value, label]) => <button type="button" key={value} aria-pressed={form.context.includes(value)} onClick={() => update({ context: form.context.includes(value) ? form.context.filter(c => c !== value) : [...form.context, value] })}>{form.context.includes(value) ? <span aria-hidden="true">✓ </span> : null}{label}</button>)}</div></fieldset>
      <fieldset><legend>What should we do next?</legend><div className="lr-decisions">{decisions.map(([value, label]) => <label className={`lr-choice ${decisionChosen && form.decision === value ? "lr-choice-selected" : ""}`} key={value}><input required type="radio" name={`decision-${q.id}`} checked={decisionChosen && form.decision === value} onChange={() => { setDecisionChosen(true); update({ decision: value }); }} /><span>{label}</span></label>)}</div></fieldset>
      {form.decision === "adjust" && decisionChosen ? <div className="lr-next-fields">{nextStep}{followUp}</div> : <details className="lr-optional"><summary>Next step & follow-up <span>Optional</span></summary><div className="lr-next-fields">{nextStep}{followUp}</div></details>}
      {q.response ? <div className="lr-outcome"><label>What happened afterward?<textarea rows={2} maxLength={1000} value={form.outcome} onChange={e => update({ outcome: e.target.value })} required={form.status === "closed"} /></label><label className="lr-choice"><input type="checkbox" checked={form.status === "closed"} onChange={e => update({ status: e.target.checked ? "closed" : "follow_up" })} /><span>Outcome recorded — close this question</span></label></div> : null}
      <div className="lr-actions"><button className="lr-primary" type="submit">Review answer <span aria-hidden="true">→</span></button><button className="lr-text-button" type="button" onClick={() => { setEditing(false); if (q.response) setForm(q.response); }}>Back to question</button></div>
      <p className="lr-small lr-reassurance">Nothing is saved until you confirm.</p>
    </form> : null}
    {editing && confirm ? <div className="lr-confirm"><div className="lr-form-heading"><h3>Does this sound right?</h3><span>2 of 2 · Review</span></div><p className="lr-confirm-decision">{decisions.find(d => d[0] === form.decision)?.[1]}</p><blockquote>{form.note}</blockquote>{form.context.length ? <p className="lr-small">Context: {contexts.filter(([value]) => form.context.includes(value)).map(([, label]) => label).join(" · ")}</p> : null}{form.action ? <p><strong>Next step:</strong> {form.action}</p> : null}<p className="lr-small">Follow up: {date(form.followUpDate)}</p>{form.outcome ? <p><strong>Outcome:</strong> {form.outcome}</p> : null}<p className="lr-small">Your explanation stays with this review. It does not automatically change staffing targets.</p><div className="lr-actions"><button className="lr-primary" disabled={busy} onClick={() => void save()}>Save answer</button><button className="lr-text-button" disabled={busy} onClick={() => setConfirm(false)}>Back to edit</button></div></div> : null}
    {error ? <p role="alert">{error}</p> : null}
    {q.history.length ? <details className="lr-history-panel"><summary>Answer history ({q.history.length})</summary>{q.history.map(h => <div className="lr-history" key={h.revision}><p className="lr-small">Revision {h.revision} · {h.kind} · {new Date(h.createdAt).toLocaleString()}</p><p>{h.response?.note ?? "Answer reopened"}</p>{h.response?.outcome ? <p>Outcome: {h.response.outcome}</p> : null}</div>)}</details> : null}
  </article>;
}
