import { useEffect, useRef, useState } from "react";
import { BarApiError, ForbiddenError, NotAuthedError } from "../api";
import { answerFoodQuestion, buildFoodQuestionRecipe, getFoodQuestion, getFoodQuestionBatch, listFoodQuestions, reviewFoodQuestion,
  type FoodAnswerBuild, type FoodQuestion, type FoodQuestionBatch, type FoodQuestionIndex } from "../food-questions-api";
import "../food-questions.css";

type Draft = { text: string; revision: string };
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
function message(error: unknown) {
  if (error instanceof NotAuthedError) return "Your login expired. Log in again; your draft is kept on this device.";
  if (error instanceof ForbiddenError) return "This account cannot make that change. Your draft is kept.";
  if (error instanceof BarApiError) {
    if (error.status === 404) return "This batch is no longer available. Return to My recipe questions to see the current list.";
    try { const detail = JSON.parse(String(error.body));
      if (typeof detail.message === "string") return detail.message;
      if (typeof detail.error === "string" && detail.error.length <= 500 && /\s/.test(detail.error)) return detail.error;
    } catch { /* use plain fallback */ }
    if (error.status === 409) return "This question changed. Check the latest saved answer before replacing it.";
  }
  return "Could not confirm the save. Your draft is kept. Check the saved answer before trying again.";
}
/** A 409 from the build call still carries the saved question and a plain message. */
function buildConflict(error: unknown): { question?: FoodQuestion; message?: string } {
  if (!(error instanceof BarApiError) || error.status !== 409) return {};
  try { const body = JSON.parse(String(error.body)); return { question: body.question, message: typeof body.message === "string" ? body.message : undefined }; }
  catch { return {}; }
}
function builtNotice(q: FoodQuestion): string {
  if (q.build?.current && q.build.outcome === "built") return "Saved, and it's the recipe now. Jon gets a copy.";
  if (q.build?.current && q.build.outcome === "needs_review") return "Saved. Part of it couldn't be matched to what we buy, so Jon will finish the recipe.";
  return "Saved. The recipe will be built from your answer in a few minutes.";
}
function BuiltLines({ build }: { build: FoodAnswerBuild }) {
  if (!build.lines.length) return <p>It changes nothing we count, so it's saved as an instruction.</p>;
  return <ul className="lq-fq-built">{build.lines.map((l, i) => <li key={i}><strong>{l.amount}</strong> {l.name}</li>)}</ul>;
}
function BuildProblems({ build }: { build: FoodAnswerBuild }) {
  return <div className="lq-fq-unmatched" role="note"><h3>Jon will finish this one</h3><p>These parts couldn't be matched to what we buy:</p>
    <ul>{build.problems.map((x, i) => <li key={i}>“{x.said}”: {x.why}</li>)}</ul>
    <p className="lq-fq-small">Nothing changed in the recipe. You can add detail above and save again.</p></div>;
}
/** Plain kitchen answers. With auto-recipes on (tprs 0217), saving one sets the recipe and copies Jon; otherwise it waits for review. */
export default function FoodQuestions({ actorId, onDone, onLoginExpired, initialBatchId = null, initialQuestionId = null }: {
  actorId: string; onDone: () => void; onLoginExpired?: () => void; initialBatchId?: string | null; initialQuestionId?: string | null;
}) {
  const [indexData, setIndexData] = useState<FoodQuestionIndex | null>(null);
  const [batch, setBatch] = useState<FoodQuestionBatch | null>(null);
  const [directQuestion, setDirectQuestion] = useState<FoodQuestion | null>(null), [directCanReview, setDirectCanReview] = useState(false);
  const [reviewing, setReviewing] = useState(false), [position, setPosition] = useState(0);
  const [queued, setQueued] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [loginExpired, setLoginExpired] = useState(false);
  const [autoRecipe, setAutoRecipe] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [needsCheck, setNeedsCheck] = useState<Record<string, boolean>>({});
  const [reviewReason, setReviewReason] = useState("");
  const card = useRef<HTMLElement | null>(null), generation = useRef(0);
  const storageKey = `lq-food-question-drafts:${actorId}`;
  const items = directQuestion ? [directQuestion] : queued ? indexData?.queuedQuestions ?? [] : reviewing ? indexData?.pendingReview ?? [] : batch?.questions ?? [];
  const question = items[position];
  const canReview = directQuestion ? directCanReview : reviewing || queued ? indexData?.canReview === true : batch?.canReview === true;
  const clarification = question?.source === "clarification";
  const draft = question ? drafts[question.id] : undefined;
  const text = draft?.text ?? question?.answer ?? "";
  const revision = draft?.revision ?? question?.revision ?? "";
  const conflicted = !!question && !!draft && draft.revision !== question.revision;
  const uncertain = !!question && !!needsCheck[question.id];
  const dirty = !!draft && draft.text !== (question?.answer ?? "");
  const editable = !!question && question.status !== "resolved";
  const valid = text.trim().length >= 1 && text.trim().length <= 4000;

  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
      const safe: Record<string, Draft> = {};
      for (const [id, value] of Object.entries(saved)) {
        const d = value as Partial<Draft>;
        if (typeof d.text === "string" && d.text.length <= 4000 && typeof d.revision === "string") safe[id] = { text: d.text, revision: d.revision };
      }
      setDrafts(safe);
    } catch { /* Unavailable storage never blocks answering. */ }
  }, [storageKey]);
  function updateDraft(id: string, value: Draft | null) {
    setDrafts(previous => { const next = { ...previous }; if (value) next[id] = value; else delete next[id];
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* In-memory draft remains. */ }
      return next;
    });
  }
  function markCheck(id: string, value: boolean) { setNeedsCheck(previous => ({ ...previous, [id]: value })); }
  function replaceQuestion(updated: FoodQuestion) {
    setDirectQuestion(previous => previous?.id === updated.id ? updated : previous);
    setBatch(previous => previous ? { ...previous, questions: previous.questions.map(q => q.id === updated.id ? updated : q) } : null);
    setIndexData(previous => previous ? { ...previous, pendingReview: previous.pendingReview.map(q => q.id === updated.id ? updated : q),
      queuedQuestions: previous.queuedQuestions?.map(q => q.id === updated.id ? updated : q) } : null);
  }
  function batchUrl(id: string | null) {
    const params = id ? `?view=foodquestions&batch=${encodeURIComponent(id)}` : "?view=foodquestions";
    window.history.replaceState({}, "", `${window.location.pathname}${params}`);
  }
  async function loadList() {
    const run = ++generation.current; setLoading(true); setError(null); setNotice(null);
    try { const data = await listFoodQuestions(); if (run !== generation.current) return;
      setIndexData(data); setAutoRecipe(data.autoRecipe === true); setBatch(null); setDirectQuestion(null); setReviewing(false); setQueued(false); setPosition(0); batchUrl(null);
    } catch (e) { if (run === generation.current) { setError(message(e)); setLoginExpired(e instanceof NotAuthedError); } }
    finally { if (run === generation.current) setLoading(false); }
  }
  async function openBatch(id: string) {
    const run = ++generation.current; setLoading(true); setError(null); setNotice(null);
    try { const data = await getFoodQuestionBatch(id); if (run !== generation.current) return;
      setBatch(data); setAutoRecipe(data.autoRecipe === true); setDirectQuestion(null); setReviewing(false); setQueued(false); setPosition(0); batchUrl(id);
    } catch (e) { if (run === generation.current) { setError(message(e)); setLoginExpired(e instanceof NotAuthedError); } }
    finally { if (run === generation.current) setLoading(false); }
  }
  async function openQuestion(id: string) {
    const run = ++generation.current; setLoading(true); setError(null); setNotice(null);
    try { const data = await getFoodQuestion(id); if (run !== generation.current) return;
      setDirectQuestion(data.question); setDirectCanReview(data.canReview); setAutoRecipe(data.autoRecipe === true); setBatch(null); setReviewing(false); setQueued(false); setPosition(0);
      window.history.replaceState({}, "", `${window.location.pathname}?view=foodquestions&question=${encodeURIComponent(id)}`);
    } catch (e) { if (run === generation.current) { setError(message(e)); setLoginExpired(e instanceof NotAuthedError); } }
    finally { if (run === generation.current) setLoading(false); }
  }
  useEffect(() => { if (initialQuestionId) void openQuestion(initialQuestionId); else if (initialBatchId) void openBatch(initialBatchId); else void loadList();
    return () => { generation.current++; };
  }, [initialBatchId, initialQuestionId]);
  useEffect(() => { setReviewReason(""); setError(null); setNotice(null); card.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }, [question?.id]);
  async function checkLatest() {
    if (!question || busy) return;
    const id = question.id, local = draft; setBusy(true); setError(null);
    try {
      const { question: latest } = await getFoodQuestion(id);
      replaceQuestion(latest);
      markCheck(id, false);
      if (local && latest.answer === local.text.trim() && latest.status !== "unanswered") {
        updateDraft(id, null); setNotice("Saved for recipe review. Your answer is safely recorded.");
      } else if (local && local.revision !== latest.revision) setNotice("The latest answer is shown below. Choose which text to keep.");
      else setNotice("Saved state checked. Your draft is ready to save.");
    } catch (e) { setError(message(e)); setLoginExpired(e instanceof NotAuthedError); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!question || busy || !editable || !valid || conflicted || uncertain) return;
    setBusy(true); setError(null); setNotice(null);
    try { const { question: saved } = await answerFoodQuestion(question.id, revision, text.trim());
      replaceQuestion(saved); updateDraft(question.id, null); markCheck(question.id, false);
      if (!autoRecipe) { setNotice("Saved for recipe review. You can come back to this answer anytime."); return; }
      setNotice("Saved. Building the recipe from your answer…");
      // The answer is already saved. Whatever happens here, it is never lost:
      // the server builds it within minutes if this call doesn't finish.
      try { const built = await buildFoodQuestionRecipe(saved.id, saved.revision); replaceQuestion(built.question); setNotice(builtNotice(built.question)); }
      catch (e) { const conflict = buildConflict(e); if (conflict.question) replaceQuestion(conflict.question);
        setNotice(conflict.message ?? "Saved. The recipe will be built from your answer in a few minutes."); }
    } catch (e) {
      setError(message(e));
      setLoginExpired(e instanceof NotAuthedError);
      if (e instanceof BarApiError && (e.status === 0 || e.status === 408 || e.status === 409 || e.status >= 500)) markCheck(question.id, true);
    } finally { setBusy(false); }
  }
  async function review(action: "resolve" | "reopen") {
    if (!question || !canReview || busy || dirty || uncertain || reviewReason.trim().length < 3) return;
    setBusy(true); setError(null); setNotice(null);
    try { const { question: updated } = await reviewFoodQuestion(question.id, question.revision, action, reviewReason.trim());
      replaceQuestion(updated); updateDraft(question.id, null); setReviewReason("");
      setNotice(action === "resolve" ? "Recipe reviewed and question resolved." : "Follow-up recorded. This item can return in a future small batch.");
    } catch (e) { setError(message(e)); setLoginExpired(e instanceof NotAuthedError); markCheck(question.id, true); }
    finally { setBusy(false); }
  }
  function move(next: number) { if (!busy) { setPosition(next); setNotice(null); setError(null); } }
  const answered = items.filter(q => q.status !== "unanswered").length;
  return <div className="lq-fq">
    <div className="lq-fq-top"><button type="button" className="lq-btn lq-btn-ghost" disabled={busy} onClick={batch || directQuestion || reviewing || queued ? () => void loadList() : onDone}>{batch || directQuestion || reviewing || queued ? "All questions" : "Home"}</button><h1>My recipe questions</h1></div>
    {loading && <p role="status">Loading your questions…</p>}
    {error && <div className="lq-fq-alert" role="alert"><p>{error}</p>{loginExpired && onLoginExpired && <button type="button" className="lq-btn" onClick={onLoginExpired}>Log in again</button>}{!question && <button type="button" className="lq-btn" disabled={loading} onClick={() => void (initialQuestionId ? openQuestion(initialQuestionId) : initialBatchId ? openBatch(initialBatchId) : loadList())}>Try loading again</button>}</div>}
    {!loading && !batch && !directQuestion && !reviewing && !queued && indexData && <>
      <p className="lq-fq-intro">A few kitchen details at a time. Each answer saves separately; you can finish later.</p>
      {indexData.batches.length === 0 && <section className="lq-fq-card"><h2>No emailed batches yet</h2><p>Recipe-question emails are scheduled Monday and Friday at 1pm, with no more than five questions in an email.</p></section>}
      <div className="lq-fq-batches">{indexData.batches.map(b => <button key={b.id} type="button" className="lq-fq-batch" onClick={() => void openBatch(b.id)}><strong>{date(b.scheduledDate)} questions</strong><span>{b.unanswered} to answer · {b.answered} awaiting review · {b.resolved} resolved</span><span className="lq-fq-open">Open {b.questionCount} {b.questionCount === 1 ? "question" : "questions"} →</span></button>)}</div>
      {indexData.canReview && indexData.pendingReview.length > 0 && <button type="button" className="lq-btn lq-btn-wide" onClick={() => { setReviewing(true); setPosition(0); setNotice(null); }}>Review {indexData.pendingReview.length} saved {indexData.pendingReview.length === 1 ? "answer" : "answers"}</button>}
      {indexData.canReview && !!indexData.queuedQuestions?.length && <button type="button" className="lq-btn lq-btn-wide" onClick={() => { setQueued(true); setPosition(0); setNotice(null); }}>View {indexData.queuedQuestions.length} queued kitchen {indexData.queuedQuestions.length === 1 ? "question" : "questions"}</button>}
      {indexData.canReview && <p className="lq-fq-small">Need one specific kitchen fact? Open a dish in <a className="lq-fq-link" href="/cogs/?view=foodrecipes">Food recipes</a> and choose “Ask the kitchen one question.”</p>}
    </>}
    {!loading && (batch || directQuestion || reviewing || queued) && <>
      <div className="lq-fq-progress"><span>{directQuestion ? "Linked recipe question" : queued ? "Queued kitchen questions" : reviewing ? "Answer review" : `${date(batch!.batch.scheduledDate)} batch`}</span><strong>{items.length ? `${position + 1} of ${items.length}` : "Complete"}</strong></div>
      {!directQuestion && !reviewing && !queued && <p className="lq-fq-small">{answered} of {items.length} answered or resolved</p>}
      {!question && <section className="lq-fq-card"><h2>Nothing left to review</h2><p>Saved answers stay recorded. Return to the batches to see their status.</p></section>}
      {question && <section ref={card} tabIndex={-1} className="lq-fq-card" aria-label="Recipe question" data-question-id={question.id}>
        <span className={`lq-fq-status lq-fq-status-${question.status}`}>{question.status === "resolved" ? (question.build?.current && question.build.outcome === "built" ? "In the recipe" : "Resolved") : question.status === "answered" ? (question.build?.current && question.build.outcome === "needs_review" ? "Saved · Jon is finishing the recipe" : autoRecipe ? "Saved · building the recipe" : "Saved · awaiting recipe review") : "Needs an answer"}</span>
        <h2>{question.productName}</h2>
        {question.optionLabel && <p className="lq-fq-option">Option: <strong>{question.optionLabel}</strong></p>}
        <p className="lq-fq-prompt">{question.prompt}</p>
        {question.status === "resolved" ? <>{question.build?.current && question.build.outcome === "built" ? <><p>Your answer is the recipe now:</p><BuiltLines build={question.build} /></> : <p>This recipe is mapped. No answer is needed.</p>}{question.answer && <blockquote>{question.answer}</blockquote>}<a className="lq-fq-link" href={question.recipeHref}>View recipe</a></> : <>
          <label className="lq-fq-label" htmlFor="food-question-answer">{clarification ? "Your answer" : question.kind === "option" ? "What does this option add or remove?" : "Ingredients and amounts for one order"}</label>
          <p id="food-question-example" className="lq-fq-small">{clarification ? "Answer just the question above. A product name, portion size or short explanation is fine." : question.kind === "option" ? "Example: BBQ sauce in a 2 oz cup on the side. The chicken stays the same." : "Example: 2 chicken tenders, 6 oz fries and one 2 oz ranch cup. Include sides and dipping sauces."}</p>
          <textarea id="food-question-answer" aria-describedby="food-question-example" maxLength={4000} rows={6} disabled={busy} value={text} onChange={e => updateDraft(question.id, { text: e.target.value, revision })} placeholder={clarification ? "Tell us what you know…" : question.kind === "option" ? "Tell us what changes and how much…" : "List what goes on the plate and how much…"} />
          <p className="lq-fq-small">Plain words are fine. Include what you know; note anything you are unsure about.</p>
          {conflicted && <div className="lq-fq-conflict"><h3>A newer answer is on file</h3><p>Your draft is still in the box above.</p><blockquote>{question.answer ?? "The question was reopened; no current answer is saved."}</blockquote><div className="lq-fq-buttons"><button className="lq-btn" type="button" disabled={busy || uncertain} onClick={() => updateDraft(question.id, null)}>Use saved answer</button><button className="lq-btn" type="button" disabled={busy || uncertain} onClick={() => { updateDraft(question.id, { text, revision: question.revision }); setNotice("Your text is ready. Save answer will replace the answer shown above."); }}>Keep my text to replace it</button></div></div>}
          {question.build?.current && question.build.outcome === "needs_review" && !dirty && <BuildProblems build={question.build} />}
          {uncertain && <p className="lq-fq-small">Check the saved state before another save.</p>}
          <div className="lq-fq-buttons"><button type="button" className="lq-btn lq-btn-primary" disabled={busy || !valid || conflicted || uncertain} onClick={() => void save()}>{busy ? "Saving…" : question.status === "answered" ? "Save updated answer" : "Save answer"}</button>{(uncertain || conflicted) && <button type="button" className="lq-btn" disabled={busy} onClick={() => void checkLatest()}>Check saved answer</button>}</div>
          <p className="lq-fq-small">{autoRecipe ? "Saving sets the recipe from your answer. Jon gets a copy and can adjust it." : "A manager reviews your answer before changing the recipe."}</p>
        </>}
        {question.reviewNote && <p className="lq-fq-review-note"><strong>Review note:</strong> {question.reviewNote}</p>}
        {notice && <p role="status" className="lq-fq-saved">{notice}</p>}
        {canReview && question.status !== "unanswered" && <details className="lq-fq-review" open={reviewing || !!directQuestion}><summary>Manager recipe review</summary><p>{question.status === "resolved" ? "This question was resolved. Ask a specific follow-up if the recipe needs clarification." : question.build?.current && question.build.outcome === "needs_review" ? "Part of this answer couldn't be matched, so nothing was written. Finish the recipe in the editor, then resolve." : "Use the saved answer to update the recipe first. Resolve records that review; it does not create ingredients automatically."}</p><a className="lq-btn lq-fq-editor-link" href={question.recipeHref} target="_blank" rel="noopener noreferrer">Open this recipe editor ↗</a>{dirty && <div className="lq-fq-conflict"><p>Save your edited answer or discard your edits before reviewing the recorded answer.</p><button type="button" className="lq-btn" disabled={busy} onClick={() => updateDraft(question.id, null)}>Discard answer edits</button></div>}<label className="lq-fq-label" htmlFor="food-question-review">Review note or specific follow-up</label><textarea id="food-question-review" maxLength={500} rows={3} value={reviewReason} disabled={busy} onChange={e => setReviewReason(e.target.value)} placeholder="What did you verify, or what still needs clarification?" /><div className="lq-fq-buttons">{question.status === "answered" && <button type="button" className="lq-btn" disabled={busy || dirty || uncertain || reviewReason.trim().length < 3} onClick={() => void review("resolve")}>Recipe updated · resolve</button>}<button type="button" className="lq-btn lq-btn-ghost" disabled={busy || dirty || uncertain || reviewReason.trim().length < 3} onClick={() => void review("reopen")}>Ask this follow-up</button>{question.status === "resolved" && uncertain && <button type="button" className="lq-btn" disabled={busy} onClick={() => void checkLatest()}>Check saved answer</button>}</div></details>}
      </section>}
      {question && <nav className="lq-fq-navigation" aria-label="Question navigation"><button type="button" className="lq-btn" disabled={busy || position === 0} onClick={() => move(position - 1)}>Previous</button>{position < items.length - 1 ? <button type="button" className="lq-btn" disabled={busy} onClick={() => move(position + 1)}>{draft || question.status === "unanswered" ? "Skip for now →" : "Next question →"}</button> : <button type="button" className="lq-btn" disabled={busy} onClick={() => void loadList()}>Finish for now</button>}</nav>}
      {draft && <p className="lq-fq-small">Unsaved text stays on this tab while you move between questions. Tap Save answer to record it for recipe review.</p>}
    </>}
  </div>;
}
