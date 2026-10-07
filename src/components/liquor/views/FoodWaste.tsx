import { useEffect, useRef, useState } from "react";
import { BarApiError, NotAuthedError } from "../api";
import FoodWastePhotos, { MAX_WASTE_PHOTOS, type WastePhotoSelection } from "../FoodWastePhotos";
import FoodWasteRow from "../FoodWasteRow";
import { money } from "../FoodCostReport";
import {
  addWastePhoto, createWasteImport, extractWaste, getWasteCatalog, getWasteImport, getWasteImports,
  getWastePeriods, getWasteSummary, postWasteImport, removeWastePage, saveWasteReview, voidWasteImport,
  wastePageUrl, wasteReviewFields,
  type WasteCatalog, type WasteImport, type WasteImportSummary, type WasteLine, type WastePeriod, type WasteReviewLine, type WasteSummary,
} from "../food-waste-api";

const PREBASELINE = "before-first-count";
const periodKey = (id: string | null) => id ?? PREBASELINE;
const uuid = () => crypto.randomUUID();
const dateLabel = (date: string | null) => date ? new Date(date).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Before first inventory";
const errorBody = (error: unknown): { error?: string; existingImportId?: string } => {
  try { return error instanceof BarApiError ? JSON.parse(String(error.body ?? "{}")) : {}; } catch { return {}; }
};
function remembered<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) ?? "null") as T | null; } catch { return null; } }
function remember(key: string, value: unknown) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* server draft remains authoritative */ } }

export default function FoodWaste({ actorId, canCount, canManage, onDone, onCountFood, onLoginExpired }: {
  actorId: string; canCount: boolean; canManage: boolean; onDone: () => void; onCountFood: () => void; onLoginExpired: () => void;
}) {
  const [catalog, setCatalog] = useState<WasteCatalog>({ items: [], recipes: [] });
  const [periods, setPeriods] = useState<WastePeriod[]>([]), [history, setHistory] = useState<WasteImportSummary[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<WasteImport | null>(null), [values, setValues] = useState<WasteReviewLine[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(""), [dirty, setDirty] = useState(false), [reviewed, setReviewed] = useState(false);
  const [photos, setPhotos] = useState<WastePhotoSelection[]>([]), [summary, setSummary] = useState<WasteSummary | null>(null);
  const [sourcePage, setSourcePage] = useState<string | null>(null), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false);
  const [duplicateImport, setDuplicateImport] = useState<string | null>(null), [voidReason, setVoidReason] = useState("");
  const [manualPage, setManualPage] = useState(""), [manualText, setManualText] = useState("");
  const [expectedPhotos, setExpectedPhotos] = useState(0);
  const activeRef = useRef<WasteImport | null>(null), valuesRef = useRef<WasteReviewLine[]>([]), periodRef = useRef("");
  const busyRef = useRef(false), dirtyRef = useRef(false), photosRef = useRef<WastePhotoSelection[]>([]), alive = useRef(true);
  const reviewedRef = useRef(false);
  const refreshPreviewRef = useRef(false);
  const content = useRef<HTMLDivElement>(null), closePhoto = useRef<HTMLButtonElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  const draftKey = `cogs:food-waste:draft:${actorId}`, createKey = `cogs:food-waste:create:${actorId}`;
  const pendingKey = (id: string) => `cogs:food-waste:review:${actorId}:${id}`;
  const uploadKey = (id: string) => `cogs:food-waste:photos:${actorId}:${id}`;
  function keepPending(next: WasteReviewLine[]) { const log = activeRef.current; if (log?.ownerId === actorId && log.status === "review") remember(pendingKey(log.id), { revision: log.revision, period: periodRef.current, values: next, reviewed: reviewedRef.current }); }
  const changeValues = (next: WasteReviewLine[]) => { valuesRef.current = next; setValues(next); dirtyRef.current = true; setDirty(true); keepPending(next); };
  function adopt(next: WasteImport, preserve = false) {
    activeRef.current = next; setActive(next); remember(draftKey, next.id);
    if (!preserve) { const fields = next.lines.map(wasteReviewFields); valuesRef.current = fields; setValues(fields); dirtyRef.current = false; setDirty(false); reviewedRef.current = next.warningsAcknowledged && fields.filter(row => row.decision === "include").every(row => row.acknowledged); setReviewed(reviewedRef.current); }
    periodRef.current = periodKey(next.openingSessionId); setSelectedPeriod(periodRef.current);
    if (next.summary) setSummary(next.summary);
    setExpectedPhotos(remembered<number>(uploadKey(next.id)) ?? 0);
  }
  function restorePending(next: WasteImport) {
    const pending = remembered<{ revision: number; period: string; values: WasteReviewLine[]; reviewed: boolean }>(pendingKey(next.id));
    if (!pending || next.ownerId !== actorId || next.status !== "review") return;
    if (pending.revision !== next.revision) { setError("An unsaved review uses an older version. The saved log was loaded; review it before posting."); return; }
    if (!Array.isArray(pending.values) || new Set(pending.values.map(row => row.id)).size !== pending.values.length || next.lines.some(line => !pending.values.some(row => row.id === line.id))) return;
    const missing = pending.values.filter(row => !next.lines.some(line => line.id === row.id));
    if (missing.some(row => !row.manualSource)) return;
    const restored = { ...next, lines: [...next.lines, ...missing.map(manualLine)] };
    activeRef.current = restored; setActive(restored); valuesRef.current = pending.values; setValues(pending.values);
    periodRef.current = pending.period; setSelectedPeriod(pending.period); reviewedRef.current = pending.reviewed; setReviewed(pending.reviewed); dirtyRef.current = true; setDirty(true);
  }
  function problem(error: unknown, fallback: string) {
    if (error instanceof NotAuthedError) { onLoginExpired(); return; }
    setError(error instanceof BarApiError && error.status === 403 ? "You do not have permission for this waste log." : fallback);
  }
  async function refreshHistory() { try { const result = await getWasteImports(); if (alive.current) setHistory(result.imports); } catch { /* the active log remains usable */ } }
  async function open(id: string) {
    if (busyRef.current || dirtyRef.current) return;
    busyRef.current = true; setBusy("Loading log…"); setError(null);
    try { const next = await getWasteImport(id); adopt(next); restorePending(next); setUncertain(false); setConflict(false); }
    catch (e) { problem(e, "This log could not be loaded. Try again."); }
    finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  async function boot() {
    setLoading(true); setError(null);
    try {
      const [targets, choices, logs] = await Promise.all([getWasteCatalog(), getWastePeriods(), getWasteImports()]);
      if (!alive.current) return; setCatalog(targets); setPeriods(choices.periods); setHistory(logs.imports);
      const savedId = remembered<string>(draftKey);
      const resume = savedId === "new" ? undefined : logs.imports.find(log => log.id === savedId && log.ownerId === actorId && !["posted", "void"].includes(log.status))
        ?? logs.imports.find(log => log.ownerId === actorId && !["posted", "void"].includes(log.status));
      if (resume) { const next = await getWasteImport(resume.id); adopt(next); restorePending(next); }
    } catch (e) { problem(e, "Waste logs could not be loaded. Try again."); }
    finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true;
    const url = new URL(location.href); url.searchParams.set("view", "foodwaste"); historyReplace(url);
    void boot();
    return () => { alive.current = false; photosRef.current.forEach(photo => URL.revokeObjectURL(photo.url)); };
  }, [actorId]);
  useEffect(() => {
    if (!active || !["queued", "processing"].includes(active.status)) return;
    let live = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await getWasteImport(active.id); if (!live) return; adopt(next); setError(null); if (["queued", "processing"].includes(next.status)) timer = setTimeout(poll, 3000); }
      catch (e) { if (!live) return; problem(e, "Still reading your log. The connection was interrupted; trying again."); timer = setTimeout(poll, 6000); }
    };
    timer = setTimeout(poll, 800); return () => { live = false; clearTimeout(timer); };
  }, [active?.id, active?.status]);
  useEffect(() => {
    if (!selectedPeriod) { setSummary(null); return; }
    let live = true; getWasteSummary(selectedPeriod === PREBASELINE ? null : selectedPeriod).then(result => { if (live) setSummary(result); }).catch(() => { if (live) setSummary(null); });
    return () => { live = false; };
  }, [selectedPeriod, active?.status]);
  useEffect(() => {
    if (sourcePage) previousFocus.current = document.activeElement as HTMLElement;
    if (content.current) content.current.inert = sourcePage != null;
    if (sourcePage) closePhoto.current?.focus();
    else previousFocus.current?.focus();
  }, [sourcePage]);
  useEffect(() => {
    const showFocused = () => requestAnimationFrame(() => {
      const input = document.activeElement;
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) || !content.current?.contains(input) || input.type === "file") return;
      const rect = input.getBoundingClientRect(), top = (document.querySelector(".lq-header")?.getBoundingClientRect().bottom ?? 0) + 8;
      const footer = content.current.querySelector(".lq-fw-footer")?.getBoundingClientRect();
      const bottom = Math.min(window.visualViewport?.height ?? innerHeight, footer?.top ?? innerHeight) - 8;
      if (rect.top < top || rect.bottom > bottom) window.scrollBy({ top: (rect.top + rect.bottom - top - bottom) / 2, behavior: "instant" });
    });
    document.addEventListener("focusin", showFocused); window.addEventListener("resize", showFocused); window.visualViewport?.addEventListener("resize", showFocused);
    return () => { document.removeEventListener("focusin", showFocused); window.removeEventListener("resize", showFocused); window.visualViewport?.removeEventListener("resize", showFocused); };
  }, []);
  const owns = active?.ownerId === actorId, working = active && ["queued", "processing"].includes(active.status);
  const editable = canCount && owns && active?.status === "review" && !uncertain && !conflict;
  const writing = !!busy && busy !== "Saving review…";
  const selected = periods.find(period => periodKey(period.openingSessionId) === selectedPeriod);

  function pickPeriod(value: string) {
    periodRef.current = value; setSelectedPeriod(value); reviewedRef.current = false; setReviewed(false);
    if (active?.status === "review") changeValues(valuesRef.current.map(row => ({ ...row, acknowledged: false })));
  }
  function edit(id: string, patch: Partial<WasteReviewLine>) {
    if (!editable || writing) return;
    reviewedRef.current = false; setReviewed(false); changeValues(valuesRef.current.map(row => ({ ...row, acknowledged: false, ...(row.id === id ? patch : {}) })));
  }
  function markReviewed(checked: boolean) { reviewedRef.current = checked; setReviewed(checked); changeValues(valuesRef.current.map(row => ({ ...row, acknowledged: checked }))); }
  async function save() {
    const log = activeRef.current; if (!log || !canCount || log.ownerId !== actorId || log.status !== "review" || busyRef.current || !periodRef.current) return false;
    const snapshot = valuesRef.current, period = periodRef.current, sourceReviewed = reviewedRef.current;
    busyRef.current = true; setBusy("Saving review…"); setError(null);
    try {
      const next = await saveWasteReview(log.id, log.revision, period === PREBASELINE ? null : period, snapshot, sourceReviewed);
      if (!alive.current) return false;
      const currentPeriod = periodRef.current, preserve = valuesRef.current !== snapshot || currentPeriod !== period;
      adopt(next, preserve); if (preserve) { periodRef.current = currentPeriod; setSelectedPeriod(currentPeriod); const known = new Set(next.lines.map(line => line.id)); const kept = valuesRef.current.map(row => { if (!known.has(row.id)) return row; const { manualSource: _source, ...fields } = row; return fields; }); valuesRef.current = kept; setValues(kept); keepPending(kept); } else remember(pendingKey(log.id), null);
      return !preserve;
    } catch (e) { if (e instanceof BarApiError && e.status === 409) { setConflict(true); problem(e, "The log or review basis changed. Reload the review before posting."); } else problem(e, "Your review was not saved. Your answers are still here; retry Save review."); return false; }
    finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  function selectFiles(files: File[]) {
    if (busyRef.current || working) return;
    const eligible = files.filter(file => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name));
    const room = MAX_WASTE_PHOTOS - (active?.pages.length ?? 0) - photos.filter(photo => photo.state !== "sent").length;
    if (eligible.length !== files.length) setError("Choose image files for the waste log.");
    if (eligible.length > room) setError(`Up to ${MAX_WASTE_PHOTOS} photos per log. Remove extras or start another log.`);
    const next = [...photosRef.current, ...eligible.slice(0, Math.max(0, room)).map(file => ({ id: uuid(), file, url: URL.createObjectURL(file), state: "waiting" as const }))];
    photosRef.current = next; setPhotos(next);
  }
  function reduceExpected(log: WasteImport, count: number) {
    const before = remembered<number>(uploadKey(log.id));
    if (before == null) return;
    const next = Math.max(log.pages.length, before - count);
    remember(uploadKey(log.id), next); setExpectedPhotos(next);
  }
  function continueUploaded() {
    const log = activeRef.current;
    if (!log || busyRef.current || !log.pages.length) return;
    remember(uploadKey(log.id), log.pages.length); setExpectedPhotos(log.pages.length);
    setError(null);
  }
  function removePhoto(id: string) {
    if (busyRef.current) return;
    const removed = photosRef.current.find(photo => photo.id === id);
    const log = activeRef.current;
    if (removed && removed.state !== "sent" && log) reduceExpected(log, 1);
    const next = photosRef.current.filter(photo => { if (photo.id !== id) return true; URL.revokeObjectURL(photo.url); return false; }); photosRef.current = next; setPhotos(next);
  }
  function photoState(id: string, state: WastePhotoSelection["state"], error?: string) { const next = photosRef.current.map(photo => photo.id === id ? { ...photo, state, error } : photo); photosRef.current = next; setPhotos(next); }
  async function readPhotos() {
    if (busyRef.current || !canCount || !selectedPeriod || working || activeRef.current && activeRef.current.ownerId !== actorId) return;
    busyRef.current = true; setBusy("Uploading photos…"); setError(null); setDuplicateImport(null);
    try {
      let log = activeRef.current;
      if (!log) { const rememberedCreate = remembered<{ requestId: string; period: string }>(createKey); const requestId = rememberedCreate?.period === selectedPeriod ? rememberedCreate.requestId : uuid(); remember(createKey, { requestId, period: selectedPeriod }); log = await createWasteImport(requestId, selectedPeriod === PREBASELINE ? null : selectedPeriod); adopt(log); remember(createKey, null); }
      const waiting = photosRef.current.filter(photo => photo.state !== "sent"), priorExpected = remembered<number>(uploadKey(log.id)) ?? 0;
      let expected = priorExpected > log.pages.length ? priorExpected : log.pages.length + waiting.length;
      remember(uploadKey(log.id), expected); setExpectedPhotos(expected);
      for (const photo of waiting) {
        photoState(photo.id, "sending");
        try { log = await addWastePhoto(log.id, photo.file); adopt(log); photoState(photo.id, "sent"); }
        catch (e) { const body = errorBody(e); if (body.error === "duplicate_photo" && body.existingImportId === log.id) { const before = log.pages.length; log = await getWasteImport(log.id); adopt(log); if (log.pages.length === before) { expected = Math.max(log.pages.length, expected - 1); remember(uploadKey(log.id), expected); setExpectedPhotos(expected); } photoState(photo.id, "sent"); } else { if (body.existingImportId) setDuplicateImport(body.existingImportId); photoState(photo.id, "failed", body.error === "too_large_log" ? "These photos are too large together. Remove a photo and upload it in another log." : "Photo not added. Retry or remove it."); throw e; } }
      }
      if (!log.pages.length) { setError("Choose at least one log photo."); return; }
      if (log.pages.length < expected) { setError(`${expected - log.pages.length} selected photos still need uploading. Reselect those photos before reading the log.`); return; }
      setBusy("Starting reading…"); const next = await extractWaste(log.id, log.revision); adopt(next);
      remember(uploadKey(log.id), null); setExpectedPhotos(0);
      photosRef.current.forEach(photo => URL.revokeObjectURL(photo.url)); photosRef.current = []; setPhotos([]); void refreshHistory();
    } catch (e) { const code = errorBody(e).error; problem(e, code === "duplicate_photo" ? "This photo already belongs to a waste log. Open that log to avoid recording it twice." : code === "too_large_log" ? "These photos are too large together. Remove a photo and upload it in another log." : "The log was not started. Uploaded photos are retained; retry the remaining photos."); }
    finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  async function removePage(pageId: string) {
    const log = activeRef.current; if (!log || busyRef.current) return;
    busyRef.current = true; setBusy("Removing photo…"); setError(null);
    try { const next = await removeWastePage(log.id, pageId, log.revision); reduceExpected(next, 1); adopt(next); } catch (e) { problem(e, "Photo was not removed. Reload the log and try again."); } finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  async function reloadReview() {
    if (!active || busyRef.current) return;
    busyRef.current = true; setBusy("Reloading review…");
    try {
      let next = await getWasteImport(active.id);
      const refreshing = refreshPreviewRef.current && next.status === "review" && next.ownerId === actorId;
      if (refreshing) next = await saveWasteReview(next.id, next.revision, next.openingSessionId, next.lines.map(line => ({ ...wasteReviewFields(line), acknowledged: false })), false);
      adopt(next); remember(pendingKey(next.id), null); refreshPreviewRef.current = false; setConflict(false); setUncertain(false);
      setError(refreshing ? "The price, recipe or counting units changed. Review the updated quantities and cost breakdown, then confirm the photos before posting." : null);
    } catch (e) { problem(e, "Could not check the saved log. Try again before posting."); } finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  async function post() {
    const log = activeRef.current; if (!log || busyRef.current || dirtyRef.current || !reviewed || !canPost(log)) return;
    const key = `cogs:food-waste:post:${actorId}:${log.id}`;
    const stored = remembered<{ requestId: string; revision: number }>(key), requestId = stored?.revision === log.revision ? stored.requestId : uuid();
    remember(key, { requestId, revision: log.revision }); busyRef.current = true; setBusy("Posting waste…"); setError(null);
    try { adopt(await postWasteImport(log.id, log.revision, requestId)); remember(draftKey, null); remember(pendingKey(log.id), null); void refreshHistory(); }
    catch (e) { refreshPreviewRef.current = e instanceof BarApiError && e.status === 409; setUncertain(true); problem(e, refreshPreviewRef.current ? "The review changed before posting. Check the saved log to refresh its quantities and cost preview." : "We could not confirm whether posting finished. Check the saved log before trying again."); }
    finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  async function voidLog() {
    const log = activeRef.current; if (!log || busyRef.current || voidReason.trim().length < 3) return;
    busyRef.current = true; setBusy("Voiding log…"); setError(null);
    try { adopt(await voidWasteImport(log.id, log.revision, voidReason.trim())); setVoidReason(""); void refreshHistory(); } catch (e) { setUncertain(true); refreshPreviewRef.current = false; problem(e, "We could not confirm whether the log was voided. Check its saved status before retrying."); } finally { busyRef.current = false; if (alive.current) setBusy(null); }
  }
  function newLog() { if (busyRef.current || dirtyRef.current || working) return; remember(draftKey, "new"); remember(createKey, null); activeRef.current = null; setActive(null); valuesRef.current = []; setValues([]); reviewedRef.current = false; setReviewed(false); setConflict(false); setUncertain(false); refreshPreviewRef.current = false; setError(null); setSelectedPeriod(""); periodRef.current = ""; photosRef.current.forEach(photo => URL.revokeObjectURL(photo.url)); photosRef.current = []; setPhotos([]); setSourcePage(null); setManualPage(""); setManualText(""); setVoidReason(""); }
  function addManual() {
    if (!manualText.trim() || !editable || busyRef.current) return;
    const id = uuid(); const line = manualLine({ id, decision: "include", targetType: null, skuId: null, recipeId: null, optionRecipeIds: [], quantity: null, unitText: null, occurredDate: null, reason: null, duplicateDecision: null, acknowledged: false, manualSource: { pageId: manualPage || null, rawText: manualText.trim() } });
    const log = activeRef.current!; activeRef.current = { ...log, lines: [...log.lines, line] }; setActive(activeRef.current); changeValues([...valuesRef.current, wasteReviewFields(line)]); setReviewed(false); setManualText("");
  }
  function canPost(log: WasteImport) { const included = log.lines.filter(line => line.decision === "include"); return log.ownerId === actorId && canCount && log.status === "review" && included.length > 0 && included.every(line => line.issues.length === 0); }

  return <>
    <div className="lq-fw" ref={content}>
      <h1 className="lq-h2">Waste Log</h1><p className="lq-muted">Food and non-alcoholic drinks. Review what was discarded, then count what remains.</p>
      {error && <p className="lq-error" role="alert">{error}</p>}
      {loading ? <p role="status">Loading waste logs…</p> : <>
        {!active && <button type="button" className="lq-btn" onClick={() => void boot()} disabled={!!busy}>Reload logs</button>}
        <label className="lq-fw-period">Inventory period<select aria-label="Waste inventory period" value={selectedPeriod} disabled={!!busy || !!working || !!active && active.status !== "review"}
          onChange={event => pickPeriod(event.target.value)}><option value="">Choose the inventory period</option>{periods.map(period => <option key={periodKey(period.openingSessionId)} value={periodKey(period.openingSessionId)}>{period.label}</option>)}</select></label>
        {selected && <p className="lq-fw-period-note lq-muted">{selected.label}. Entries with no written date are assigned to this chosen period.</p>}
        {active && <p className="lq-muted">Started {dateLabel(active.createdAt)} · {active.status === "review" ? "Review entries" : active.status === "posted" ? "Posted" : active.status === "void" ? "Voided — kept in history" : active.status}</p>}
        {active && !["posted", "void"].includes(active.status) && <button type="button" className="lq-linkbtn" disabled={!!busy || dirty || !!working} onClick={newLog}>Start another log</button>}
        {working ? <section className="lq-fw-processing" role="status" aria-live="polite"><h2>Reading your waste log</h2><div className="lq-fw-pulse" aria-hidden="true" /><p>Photos are saved. You can return to this log while it is being read.</p></section> : null}
        {active?.error && <p className="lq-error">{active.error}</p>}
        {active && expectedPhotos > active.pages.length && <div className="lq-fw-question" role="alert"><p>{expectedPhotos - active.pages.length} selected photos were not uploaded. Choose the remaining photos or continue with the uploaded photos.</p>{active.pages.length > 0 && <button type="button" className="lq-btn" disabled={!!busy} onClick={continueUploaded}>Use only uploaded photos</button>}</div>}
        {(!active || ["draft", "error"].includes(active.status)) && <FoodWastePhotos photos={photos} busy={!!busy || !canCount || !!active && !owns} onFiles={selectFiles} onRemove={removePhoto} />}
        {active && active.pages.length > 0 && <details className="lq-fw-details" open={active.status === "draft" || active.status === "error"}><summary>{active.pages.length} source photo{active.pages.length === 1 ? "" : "s"}</summary><div className="lq-fw-saved-photos">{active.pages.map(page => <div key={page.id}><button type="button" className="lq-fw-source-thumb" onClick={() => setSourcePage(page.id)}><img src={wastePageUrl(active.id, page.id)} alt={`Open source photo ${page.pageNumber}`} /><span>Photo {page.pageNumber}</span></button>{owns && ["draft", "error"].includes(active.status) && <button type="button" className="lq-linkbtn" disabled={!!busy} onClick={() => void removePage(page.id)}>Remove photo {page.pageNumber}</button>}</div>)}</div></details>}
        {active?.warnings.map((warning, index) => <p className="lq-fw-question" key={index}>{warning}</p>)}
        {duplicateImport && <button type="button" className="lq-btn" disabled={!!busy} onClick={() => void open(duplicateImport)}>Open the existing waste log</button>}
        {active?.status === "review" && <>
          <h2>{values.filter(row => row.decision === "include").length} waste entries</h2>
          {active.lines.map(line => { const value = values.find(row => row.id === line.id) ?? wasteReviewFields(line); return <FoodWasteRow key={line.id} line={line} value={value} catalog={catalog} disabled={!editable || writing} changed={dirty} onEdit={patch => edit(line.id, patch)} onPhoto={() => setSourcePage(line.pageId)} />; })}
          {editable && <details className="lq-fw-details"><summary>Add a missing entry</summary><label>Source photo (optional)<select aria-label="Source photo for missing waste entry" value={manualPage} onChange={event => setManualPage(event.target.value)}><option value="">Manually added entry</option>{active.pages.map(page => <option key={page.id} value={page.id}>Photo {page.pageNumber}</option>)}</select></label><label>Words on the log<input value={manualText} maxLength={2000} aria-label="Words for missing waste entry" onChange={event => setManualText(event.target.value)} /></label><button type="button" className="lq-btn" disabled={!manualText.trim() || !!busy} onClick={addManual}>Add entry</button></details>}
          {owns && <label className="lq-fw-review-confirm"><input type="checkbox" disabled={!editable || writing} checked={reviewed} onChange={event => markReviewed(event.target.checked)} />I reviewed all photos and entries, including any notes or repeats.</label>}
          {dirty && <p className="lq-muted" role="status">Unsaved review changes. Save before leaving or posting.</p>}
        </>}
        {active && ["posted", "void"].includes(active.status) && <><p className="lq-fw-posted" role="status">{active.status === "posted" ? "Waste recorded. Ready to count what remains." : "This waste log is voided and excluded from the totals."}</p><section aria-label="Recorded waste entries">{active.lines.map(line => <article className="lq-fw-row" key={line.id}><strong>{line.targetType === "sku" ? catalog.items.find(item => item.id === line.skuId)?.name ?? line.itemText : catalog.recipes.find(item => item.id === line.recipeId)?.name ?? line.itemText}</strong><p>{line.quantity ?? "Unknown"} {line.unitText ?? "unit not recorded"} · {line.decision === "discard" ? "Discarded entry" : line.valueCents == null ? "Unpriced" : money(line.valueCents)}</p><p className="lq-muted">{line.rawText}</p>{line.pageId && <button type="button" className="lq-linkbtn" onClick={() => setSourcePage(line.pageId)}>View source photo</button>}<details className="lq-fw-details"><summary>Recorded cost breakdown</summary>{line.ingredients.map((ingredient, index) => <p key={`${ingredient.skuId}-${index}`}>{ingredient.name}: {ingredient.quantity} {ingredient.unitLabel ?? ingredient.countUnit} · {ingredient.valueCents == null ? "Unpriced" : money(ingredient.valueCents)}</p>)}</details></article>)}</section></>}
        {summary && <WasteTotals summary={summary} />}
        {active?.status === "posted" && (canManage || owns && canCount) && <details className="lq-fw-details"><summary>Void this log</summary><p>The original stays in history. Its waste is removed from the logged totals.</p><label>Why should it be voided?<textarea maxLength={500} value={voidReason} onChange={event => setVoidReason(event.target.value)} /></label><button type="button" className="lq-btn" disabled={!!busy || voidReason.trim().length < 3} onClick={() => void voidLog()}>Void waste log</button></details>}
        <details className="lq-fw-details"><summary>Previous waste logs ({history.length})</summary><div className="lq-fw-history">{history.map(log => <button type="button" className="lq-btn lq-btn-ghost" key={log.id} disabled={!!busy || dirty} onClick={() => void open(log.id)}>{dateLabel(log.createdAt)} · {log.status} · {log.lineCount} entries</button>)}</div></details>
        {!active && history.length === 0 && !error && <p className="lq-muted">No waste logs yet.</p>}
      </>}
      <div className="lq-footer lq-fw-footer"><div className="lq-savestate" role="status">{busy ?? (dirty ? "Review not saved" : "")}</div><div className="lq-footer-actions">
        <button type="button" className="lq-btn lq-btn-ghost" disabled={!!busy || dirty} onClick={onDone}>Home</button>
        {uncertain || conflict ? <button type="button" className="lq-btn lq-btn-primary" disabled={!!busy} onClick={() => void reloadReview()}>Check saved log</button>
          : active?.status === "review" ? dirty ? <button type="button" className="lq-btn lq-btn-primary" disabled={!!busy || !selectedPeriod || !editable} onClick={() => void save()}>Save review</button> : <button type="button" className="lq-btn lq-btn-primary" disabled={!!busy || !reviewed || !canPost(active)} onClick={() => void post()}>Post waste log</button>
          : active?.status === "posted" ? <button type="button" className="lq-btn lq-btn-primary" disabled={!!busy || !canCount} onClick={onCountFood}>Count food</button>
          : active?.status === "void" ? <button type="button" className="lq-btn lq-btn-primary" disabled={!!busy} onClick={newLog}>New waste log</button>
          : working ? <button type="button" className="lq-btn lq-btn-primary" disabled>Reading…</button>
          : <button type="button" className="lq-btn lq-btn-primary" disabled={loading || !!busy || !canCount || !!active && !owns || !selectedPeriod || !photos.length && !active?.pages.length} onClick={() => void readPhotos()}>{active?.status === "error" ? "Retry reading" : "Read log photos"}</button>}
      </div>{active?.status === "posted" && <button type="button" className="lq-linkbtn" disabled={!!busy} onClick={newLog}>Upload another waste log</button>}</div>
    </div>
    {sourcePage && active && <div className="lq-fw-modal" role="dialog" aria-modal="true" aria-label="Waste log source photo" onKeyDown={event => { if (event.key === "Escape") setSourcePage(null); if (event.key === "Tab") { event.preventDefault(); closePhoto.current?.focus(); } }}><button ref={closePhoto} type="button" className="lq-btn" onClick={() => setSourcePage(null)}>Close source photo</button><img src={wastePageUrl(active.id, sourcePage)} alt="Original waste log photo" /></div>}
  </>;
}

function historyReplace(url: URL) { window.history.replaceState({}, "", url); }
function manualLine(fields: WasteReviewLine): WasteLine {
  const text = fields.manualSource?.rawText ?? "Manually added entry";
  return { ...fields, pageId: fields.manualSource?.pageId ?? null, rowNumber: 0, rawText: text, itemText: text, quantityText: null, sourceUnitText: null, sourceOccurredDate: null, sourceReason: null, reviewNotes: [], issues: ["Choose the item and enter its quantity and unit."], candidateSkuIds: [], candidateRecipeIds: [], duplicateLineIds: [], ingredients: [], valueCents: null };
}
function WasteTotals({ summary }: { summary: WasteSummary }) {
  const why = summary.salesStatus === "awaiting_closing_count" ? "Waste percentage is available after the closing food count and its cost report."
    : summary.salesStatus === "awaiting_food_report" ? "Waiting for this period’s food cost report and sales."
      : summary.salesStatus === "no_baseline" ? "No inventory baseline yet; a completed period percentage is not available."
        : summary.salesStatus === "provisional" ? "This period’s food cost report is still provisional." : summary.salesCents == null || summary.salesCents <= 0 ? "No positive sales denominator for this period." : null;
  return <section className="lq-fw-totals" aria-label="Logged waste for selected period"><h2>Logged waste in this period</h2><strong>{summary.totalCents == null ? `${money(summary.valuedCents)} priced so far` : money(summary.totalCents)}</strong>
    {summary.unvaluedCount > 0 && <p className="lq-error">Incomplete: {summary.unvaluedCount} unpriced {summary.unvaluedCount === 1 ? "entry" : "entries"}. The full cost and percentage are unknown.</p>}
    {summary.wastePct != null && <p className="lq-fw-percent">{summary.wastePct.toFixed(2)}% of food + NA sales</p>}{why && <p className="lq-muted">{why}</p>}<p className="lq-muted">Costs are frozen at reviewed posting time. Backdated logs use those recorded estimates.</p>
  </section>;
}
