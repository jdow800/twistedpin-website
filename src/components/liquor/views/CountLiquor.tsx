import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCount,
  extractVoice,
  getCatalog,
  getOpenCount,
  getZones,
  saveCountLines,
  setCaseSize,
  submitCount,
  BarApiError,
  type BarSkuItem,
  type BarZoneItem,
  type CountLineInput,
  type OpenCountLine,
  type VoiceMatch,
} from "../api";
import { useDictation } from "../useSpeech";

// Voice-first zone counting. Stand in a zone, hit Record, talk out the shelf in a
// run-on ("three Tito's, four Bulleit, a half Grey Goose…"); the browser
// transcribes, the server (Claude) maps it to the catalog + flags ambiguous names,
// and a review sheet lets the counter confirm/disambiguate before it lands in the
// zone. The grid is the manual fallback (search-to-add) + the correction surface —
// not the primary input. Voice ACCUMULATES into the zone total; the number field
// SETS an exact value (the correction tool).

const CAP_SECONDS = 240; // hard stop — you'll usually do shorter bursts (each recording adds to the zone)
const WARN_SECONDS = 210; // "wrap up this bottle"

// `qty` is the SINGLE authoritative value and is always individual containers.
// `cases`/`caseSize` are the entry memo — what the counter typed and the
// multiplier frozen at that moment. Invariant: loose = qty − cases × caseSize.
// Nothing downstream adds cases on top of qty; the DB has a CHECK that makes
// that reading impossible to store.
type Cell = {
  qty: number;
  cases?: number;
  caseSize?: number | null;
  source: "grid" | "voice";
  raw?: string;
};
type Counts = Record<string, Record<string, Cell>>; // counts[zoneId][skuId]

type ReviewItem = {
  key: string;
  spoken: string;
  qty: number;
  cases: number;
  units: number;
  unitsPerCase: number | null;
  /** Cases were spoken but we have no case size — NOT applyable until answered. */
  needsCaseSize: boolean;
  /** Model looks to have multiplied cases itself — make a human pick. */
  suspectPreMultiplied: boolean;
  chosenSkuId: string | null; // resolved (from a single match, a picked candidate, or manual assign)
  candidates: VoiceMatch[]; // ambiguous → the choices
  assignOpen?: boolean; // unmatched → inline search open
};

const sizeLabel = (s: BarSkuItem) => (s.sizeMl != null ? `${s.sizeMl} ml` : "each");
const skuLabel = (m: VoiceMatch) => `${m.name}${m.sizeMl != null ? ` · ${m.sizeMl}ml` : ""}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function CountLiquor({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [zones, setZones] = useState<BarZoneItem[]>([]);
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [zoneId, setZoneId] = useState<string>("");
  const [counts, setCounts] = useState<Counts>({});
  const [search, setSearch] = useState("");
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [resumed, setResumed] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState<string[] | null>(null); // uncounted zone names

  // voice
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const dict = useDictation((t) => void processTranscript(t));

  const nameById = useMemo(() => new Map(catalog.map((s) => [s.id, s.name])), [catalog]);
  const skuById = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);

  // ── bootstrap: resume the staffer's in-progress draft, else start a new one ──
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [z, cat, open] = await Promise.all([getZones(), getCatalog(), getOpenCount()]);
        if (!live) return;
        setZones(z);
        setCatalog(cat);
        setZoneId(z[0]?.id ?? "");
        if (open) {
          setSessionId(open.id);
          setCounts(rebuildCounts(open.lines));
          setResumed(true);
        } else {
          setSessionId(await createCount(true));
        }
        setPhase("ready");
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function startFresh() {
    try {
      const sid = await createCount(true);
      setSessionId(sid);
      setCounts({});
      setResumed(false);
      setSave("idle");
    } catch {
      setSave("error");
    }
  }

  // ── debounced autosave (survives a tab close mid-count) ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countsRef = useRef<Counts>(counts);
  countsRef.current = counts;
  function scheduleSave() {
    if (!sessionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 1400);
  }
  async function flush() {
    if (!sessionId) return;
    const lines = flatten(countsRef.current);
    if (lines.length === 0) {
      setSave("saved");
      return;
    }
    setSave("saving");
    try {
      await saveCountLines(sessionId, lines);
      setSave("saved");
    } catch {
      setSave("error");
    }
  }

  // Flush immediately when the page hides (screen lock / app switch) so the last
  // entries can't be lost if the tab is evicted while backgrounded.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /** SET the LOOSE container count for (zone, sku), preserving any cases
   *  already entered. The manual correction path. */
  function setQty(skuId: string, loose: number) {
    setCounts((prev) => {
      const zone = { ...(prev[zoneId] ?? {}) };
      const cur = zone[skuId];
      const cases = cur?.cases ?? 0;
      const caseSize = cur?.caseSize ?? null;
      const fromCases = cases > 0 && caseSize ? cases * caseSize : 0;
      const qty = roundQty(Math.max(0, loose) + fromCases);
      if (qty <= 0) delete zone[skuId];
      else
        zone[skuId] = {
          qty,
          ...(fromCases > 0 ? { cases, caseSize } : {}),
          source: "grid",
          ...(cur?.raw ? { raw: cur.raw } : {}),
        };
      return { ...prev, [zoneId]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  /** SET how many CASES for (zone, sku), preserving the loose count. The case
   *  size is stamped from the catalog AT THIS MOMENT and frozen on the cell —
   *  never re-read later, so editing a SKU's case size can't rescale a count
   *  that's already been entered. */
  function setCases(skuId: string, casesRaw: number) {
    const sku = skuById.get(skuId);
    const caseSize = sku?.unitsPerCase ?? null;
    if (caseSize == null) return; // no case size → the UI offers "set case size" instead
    const cases = Math.max(0, roundQty(casesRaw));
    setCounts((prev) => {
      const zone = { ...(prev[zoneId] ?? {}) };
      const cur = zone[skuId];
      const prevFromCases = (cur?.cases ?? 0) * (cur?.caseSize ?? 0);
      const loose = Math.max(0, roundQty((cur?.qty ?? 0) - prevFromCases));
      const qty = roundQty(cases * caseSize + loose);
      if (qty <= 0) delete zone[skuId];
      else
        zone[skuId] = {
          qty,
          ...(cases > 0 ? { cases, caseSize } : {}),
          source: "grid",
          ...(cur?.raw ? { raw: cur.raw } : {}),
        };
      return { ...prev, [zoneId]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  /** Remove a bottle from this zone entirely — clears cases AND loose. The ✕
   *  used to call setQty(0), which now only zeroes the loose part and would
   *  leave a case-only row stubbornly on screen. */
  function clearCell(skuId: string) {
    setCounts((prev) => {
      const zone = { ...(prev[zoneId] ?? {}) };
      delete zone[skuId];
      return { ...prev, [zoneId]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  /** ADD to the running (zone, sku) total — the voice path. Cases and loose
   *  containers accumulate independently so the entry memo stays truthful. */
  function addQty(
    skuId: string,
    delta: { cases: number; units: number; caseSize: number | null },
    source: "grid" | "voice",
    raw?: string,
  ) {
    setCounts((prev) => {
      const zone = { ...(prev[zoneId] ?? {}) };
      const cur = zone[skuId];
      const caseSize = delta.caseSize ?? cur?.caseSize ?? null;
      const cases = roundQty((cur?.cases ?? 0) + delta.cases);
      const prevFromCases = (cur?.cases ?? 0) * (cur?.caseSize ?? 0);
      const loose = Math.max(0, roundQty((cur?.qty ?? 0) - prevFromCases)) + delta.units;
      const fromCases = cases > 0 && caseSize ? cases * caseSize : 0;
      const next = roundQty(fromCases + loose);
      if (next <= 0) delete zone[skuId];
      else
        zone[skuId] = {
          qty: next,
          ...(fromCases > 0 ? { cases, caseSize } : {}),
          source,
          ...(raw ? { raw } : {}),
        };
      return { ...prev, [zoneId]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  // ── voice: record → cap → extract → review ──
  // Auto-stop at the hard cap; the transcript then arrives via the dictation
  // onFinal callback → processTranscript (so the last words aren't dropped).
  useEffect(() => {
    if (dict.recording && dict.seconds >= CAP_SECONDS) dict.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict.seconds, dict.recording]);

  async function processTranscript(transcript: string) {
    if (!transcript.trim()) return;
    setVoiceBusy(true);
    setVoiceErr(null);
    try {
      const items = await extractVoice(transcript);
      if (items.length === 0) {
        setVoiceErr("Didn't catch any bottles — try again, closer to the shelf.");
        return;
      }
      setReview(
        items.map((it, i) => ({
          key: `v${i}`,
          spoken: it.spoken,
          // Don't default a case-bearing row to 1 — its qty legitimately
          // carries only the loose part until the case size is answered.
          qty: it.qty > 0 || it.cases > 0 ? it.qty : 1,
          cases: it.cases,
          units: it.units,
          unitsPerCase: it.unitsPerCase,
          needsCaseSize: it.needsCaseSize,
          suspectPreMultiplied: it.suspectPreMultiplied,
          chosenSkuId: it.match?.id ?? null,
          candidates: it.candidates,
        })),
      );
    } catch (e) {
      setVoiceErr(e instanceof BarApiError ? e.message : "Couldn't process that — try again or type it.");
    } finally {
      setVoiceBusy(false);
    }
  }

  /** Answer "how many in a case?" for the bottle on review row `idx`.
   *  Persists to the SKU (so this is asked ONCE, ever), updates the local
   *  catalog, and re-resolves EVERY pending row for that bottle — not just the
   *  one that asked, since a long dictation can mention it more than once. */
  async function answerCaseSize(idx: number, unitsPerCase: number) {
    const row = review?.[idx];
    const skuId = row?.chosenSkuId;
    if (!skuId || !Number.isFinite(unitsPerCase) || unitsPerCase < 2) return;
    try {
      await setCaseSize(skuId, unitsPerCase);
    } catch (e) {
      setVoiceErr(e instanceof BarApiError ? e.message : "Couldn't save that case size.");
      return;
    }
    setCatalog((prev) => prev.map((s) => (s.id === skuId ? { ...s, unitsPerCase } : s)));
    setReview((r) =>
      r
        ? r.map((x) =>
            x.chosenSkuId === skuId && x.needsCaseSize
              ? {
                  ...x,
                  unitsPerCase,
                  needsCaseSize: false,
                  qty: roundQty(x.cases * unitsPerCase + x.units),
                }
              : x,
          )
        : r,
    );
  }

  /** A row can only be applied once it's matched to a bottle AND its quantity
   *  is unambiguous. An unanswered case size or a suspected pre-multiply keeps
   *  the row on screen rather than letting a guessed number through — that
   *  silent path is exactly what produced 93, 27 and 1 on 2026-07-24. */
  const applyable = (r: ReviewItem) =>
    !!r.chosenSkuId && !r.needsCaseSize && !r.suspectPreMultiplied;

  function applyReview() {
    if (!review) return;
    // Sum duplicates within this clip, then ADD each into the zone total.
    const merged = new Map<string, { cases: number; units: number; caseSize: number | null; spoken: string }>();
    for (const it of review) {
      if (!applyable(it)) continue;
      const skuId = it.chosenSkuId!;
      const caseSize = it.unitsPerCase ?? skuById.get(skuId)?.unitsPerCase ?? null;
      const e = merged.get(skuId);
      if (e) {
        e.cases = roundQty(e.cases + it.cases);
        e.units = roundQty(e.units + it.units);
      } else {
        merged.set(skuId, { cases: it.cases, units: it.units, caseSize, spoken: it.spoken });
      }
    }
    for (const [skuId, { cases, units, caseSize, spoken }] of merged) {
      addQty(skuId, { cases, units, caseSize }, "voice", spoken);
    }
    // Keep any row that couldn't be applied, so nothing is silently dropped.
    const leftover = review.filter((r) => !applyable(r));
    setReview(leftover.length > 0 ? leftover : null);
  }
  const reviewResolved = review ? review.filter(applyable).length : 0;
  const reviewPending = review ? review.length - reviewResolved : 0;

  // Warn before submitting an incomplete count — don't close out a full-venue
  // inventory with a zone never touched (they can still choose to submit).
  function tryFinish() {
    if (!sessionId || submitting) return;
    const uncounted = zones.filter((z) => Object.keys(counts[z.id] ?? {}).length === 0).map((z) => z.name);
    if (uncounted.length > 0) {
      setConfirmSubmit(uncounted);
      return;
    }
    void finish();
  }

  async function finish() {
    setConfirmSubmit(null);
    if (!sessionId || submitting) return;
    setSubmitting(true);
    setSave("saving");
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveCountLines(sessionId, flatten(countsRef.current));
      const n = await submitCount(sessionId);
      setDone(n);
    } catch {
      setSave("error");
      setSubmitting(false);
    }
  }

  // search-to-add grid (only shown while searching — no alphabetized wall by default)
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 30);
  }, [catalog, search]);

  const zoneCells = counts[zoneId] ?? {};
  const capturedHere = Object.entries(zoneCells).sort((a, b) =>
    (nameById.get(a[0]) ?? "").localeCompare(nameById.get(b[0]) ?? ""),
  );
  const enteredTotal = Object.values(counts).reduce((n, z) => n + Object.keys(z).length, 0);

  if (phase === "loading") return <div className="lq-center lq-muted">Starting count…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't start the count.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );
  if (done !== null)
    return (
      <div className="lq-center">
        <p className="lq-done-emoji" aria-hidden="true">✅</p>
        <h2 className="lq-h2">Count submitted</h2>
        <p className="lq-muted">{done} line{done === 1 ? "" : "s"} recorded.</p>
        <button className="lq-btn lq-btn-primary" onClick={onDone}>Done</button>
      </div>
    );

  const near = dict.seconds >= WARN_SECONDS;

  return (
    <div className="lq-count">
      {resumed && (
        <div className="lq-resumed">
          <span>↩ Picked up your count in progress.</span>
          <button type="button" className="lq-linkbtn" onClick={startFresh}>Start a new count</button>
        </div>
      )}

      {/* zone tiles — uniform grid, every zone visible; the badge doubles as a
          what's-been-counted gauge, the ✓-less tiles are what's left. */}
      <h3 className="lq-cap-title lq-zonebar-title">Where you're counting</h3>
      <div className="lq-zonebar" role="tablist" aria-label="Zones">
        {zones.map((z) => {
          const n = Object.keys(counts[z.id] ?? {}).length;
          return (
            <button
              key={z.id}
              type="button"
              role="tab"
              aria-selected={z.id === zoneId}
              className={`lq-zone${z.id === zoneId ? " lq-zone-on" : ""}${n > 0 ? " lq-zone-done" : ""}`}
              onClick={() => setZoneId(z.id)}
            >
              <span className="lq-zone-name">{z.name}</span>
              {n > 0 && <span className="lq-zone-badge">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* voice panel */}
      <div className="lq-voicebar">
        {!dict.supported ? (
          <p className="lq-muted lq-voice-unsupported">Voice isn't available on this browser — search below to add bottles.</p>
        ) : dict.recording ? (
          <div className={`lq-rec${near ? " lq-rec-warn" : ""}`}>
            <div className="lq-rec-head">
              <span className="lq-rec-dot" aria-hidden="true" />
              <span className="lq-rec-label">Listening…</span>
              <span className="lq-rec-timer">{mmss(dict.seconds)} / {mmss(CAP_SECONDS)}</span>
            </div>
            <p className="lq-rec-transcript">
              {dict.transcript || <span className="lq-muted">Say the bottles and how many — “three Tito’s, four Bulleit…”</span>}
              {dict.interim && <span className="lq-muted"> {dict.interim}</span>}
            </p>
            {near && <p className="lq-rec-warntext">Wrap up this bottle — stopping at {mmss(CAP_SECONDS)}.</p>}
            <button type="button" className="lq-btn lq-btn-primary lq-rec-stop" onClick={() => dict.stop()}>
              ■ Stop &amp; process
            </button>
          </div>
        ) : voiceBusy ? (
          <div className="lq-rec">
            <p className="lq-muted">Reading that back…</p>
          </div>
        ) : (
          <button type="button" className="lq-record" onClick={() => { setVoiceErr(null); dict.start(); }}>
            <span className="lq-record-emoji" aria-hidden="true">🎤</span>
            <span>Record count for {zones.find((z) => z.id === zoneId)?.name ?? "this zone"}</span>
          </button>
        )}
        {voiceErr && <p className="lq-error lq-voice-err">{voiceErr}</p>}
        {dict.error && !dict.recording && (
          <p className="lq-muted lq-voice-err">Mic stopped ({dict.error}). Tap record to try again.</p>
        )}
      </div>

      {/* search-to-add */}
      <input
        className="lq-search"
        type="search"
        inputMode="search"
        placeholder="Search to add a bottle by hand…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {searchResults.length > 0 && (
        <div className="lq-searchlist">
          {searchResults.map((s) => {
            const cell = zoneCells[s.id];
            const qty = cell?.qty ?? 0;
            // The steppers and the number field edit the LOOSE count. Feeding
            // them cell.qty would re-add the cases on every keystroke.
            const loose = looseOf(cell);
            return (
              <div key={s.id} className={`lq-row${qty > 0 ? " lq-row-set" : ""}`}>
                <div className="lq-row-name">
                  <span className="lq-name">{s.name}</span>
                  <span className="lq-size">{sizeLabel(s)}</span>
                </div>
                {s.unitsPerCase != null && (
                  <CaseBox
                    cases={cell?.cases ?? 0}
                    caseSize={s.unitsPerCase}
                    onChange={(n) => setCases(s.id, n)}
                  />
                )}
                <div className="lq-stepper">
                  <button type="button" className="lq-step" aria-label={`decrease ${s.name}`} onClick={() => setQty(s.id, roundQty(loose - 1))}>−</button>
                  <input
                    className="lq-qty-input"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={0}
                    value={loose || ""}
                    placeholder="0"
                    onChange={(e) => setQty(s.id, e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
                  />
                  <button type="button" className="lq-step" aria-label={`increase ${s.name}`} onClick={() => setQty(s.id, roundQty(loose + 1))}>+</button>
                </div>
                {(cell?.cases ?? 0) > 0 && (
                  <span className="lq-case-total">= {qty} {qty === 1 ? "each" : "each"}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* captured-in-this-zone (the primary view) */}
      <div className="lq-captured">
        <h3 className="lq-cap-title">
          Counted in {zones.find((z) => z.id === zoneId)?.name ?? "this zone"}
          <span className="lq-cap-n">{capturedHere.length}</span>
        </h3>
        {capturedHere.length === 0 ? (
          <p className="lq-muted lq-cap-empty">Nothing here yet — record the shelf, or search above to add one.</p>
        ) : (
          capturedHere.map(([skuId, cell]) => {
            const caseSize = cell.caseSize ?? skuById.get(skuId)?.unitsPerCase ?? null;
            const loose = looseOf(cell);
            return (
            <div key={skuId} className="lq-row lq-row-set">
              <div className="lq-row-name">
                <span className="lq-name">
                  {cell.source === "voice" && <span className="lq-voice-tag" title="added by voice" aria-hidden="true">🎤 </span>}
                  {nameById.get(skuId) ?? "—"}
                </span>
                {cell.raw && <span className="lq-size lq-heard">heard: “{cell.raw}”</span>}
                {(cell.cases ?? 0) > 0 && cell.caseSize && (
                  <span className="lq-size lq-case-total">
                    {cell.cases} case{cell.cases === 1 ? "" : "s"} × {cell.caseSize}
                    {loose > 0 ? ` + ${loose}` : ""} = {cell.qty}
                  </span>
                )}
              </div>
              {caseSize != null && (
                <CaseBox cases={cell.cases ?? 0} caseSize={caseSize} onChange={(n) => setCases(skuId, n)} />
              )}
              <div className="lq-stepper">
                <button type="button" className="lq-step" aria-label="decrease" onClick={() => setQty(skuId, roundQty(loose - 1))}>−</button>
                <input
                  className="lq-qty-input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  value={loose}
                  onChange={(e) => setQty(skuId, e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
                />
                <button type="button" className="lq-step" aria-label="increase" onClick={() => setQty(skuId, roundQty(loose + 1))}>+</button>
              </div>
              <button
                type="button"
                className="lq-row-x"
                aria-label={`remove ${nameById.get(skuId) ?? "bottle"}`}
                onClick={() => clearCell(skuId)}
              >
                ✕
              </button>
            </div>
            );
          })
        )}
      </div>

      {/* footer */}
      <div className="lq-footer">
        <div className="lq-savestate">
          {save === "saving" && "Saving…"}
          {save === "saved" && "Saved ✓"}
          {save === "error" && <span className="lq-error">Save failed — will retry on submit</span>}
        </div>
        <div className="lq-footer-actions">
          <span className="lq-muted lq-count-tally">{capturedHere.length} here · {enteredTotal} total</span>
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>Exit</button>
          <button type="button" className="lq-btn lq-btn-primary" disabled={submitting || enteredTotal === 0} onClick={tryFinish}>
            {submitting ? "Submitting…" : "Finish & submit"}
          </button>
        </div>
      </div>

      {/* voice review sheet */}
      {review && (
        <div className="lq-sheet" role="dialog" aria-label="Review what I heard">
          <div className="lq-sheet-panel">
            <div className="lq-sheet-head">
              <h3 className="lq-h2">Here's what I heard</h3>
              <p className="lq-muted">
                {reviewResolved} ready{reviewPending > 0 && ` · ${reviewPending} need a tap`}
              </p>
            </div>
            <div className="lq-sheet-body">
              {review.map((it, idx) => (
                <ReviewRow
                  key={it.key}
                  item={it}
                  catalog={catalog}
                  onQty={(q) => setReview((r) => r && r.map((x, i) => (i === idx ? { ...x, qty: q } : x)))}
                  onPick={(skuId) => setReview((r) => r && r.map((x, i) => (i === idx ? { ...x, chosenSkuId: skuId, assignOpen: false } : x)))}
                  onToggleAssign={() => setReview((r) => r && r.map((x, i) => (i === idx ? { ...x, assignOpen: !x.assignOpen } : x)))}
                  onRemove={() => setReview((r) => (r && r.length > 1 ? r.filter((_, i) => i !== idx) : null))}
                  onCaseSize={(n) => void answerCaseSize(idx, n)}
                />
              ))}
            </div>
            <div className="lq-sheet-foot">
              <button type="button" className="lq-btn lq-btn-ghost" onClick={() => setReview(null)}>Discard</button>
              <button type="button" className="lq-btn lq-btn-primary" disabled={reviewResolved === 0} onClick={applyReview}>
                Add {reviewResolved} to {zones.find((z) => z.id === zoneId)?.name ?? "zone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* incomplete-count confirm */}
      {confirmSubmit && (
        <div className="lq-sheet" role="dialog" aria-label="Confirm submit">
          <div className="lq-sheet-panel lq-confirm">
            <div className="lq-sheet-head">
              <h3 className="lq-h2">Submit an incomplete count?</h3>
              <p className="lq-muted">
                No bottles counted in: <strong>{confirmSubmit.join(", ")}</strong>. Submitting
                closes this count out — you can't add to it after.
              </p>
            </div>
            <div className="lq-sheet-foot">
              <button type="button" className="lq-btn lq-btn-ghost" onClick={() => setConfirmSubmit(null)}>
                Keep counting
              </button>
              <button type="button" className="lq-btn lq-btn-primary" onClick={() => void finish()}>
                Submit anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRow({
  item,
  catalog,
  onQty,
  onPick,
  onToggleAssign,
  onRemove,
  onCaseSize,
}: {
  item: ReviewItem;
  catalog: BarSkuItem[];
  onQty: (q: number) => void;
  onPick: (skuId: string) => void;
  onToggleAssign: () => void;
  onRemove: () => void;
  onCaseSize: (n: number) => void;
}) {
  const [q, setQ] = useState("");
  const [caseAnswer, setCaseAnswer] = useState("");
  const chosen = item.chosenSkuId ? catalog.find((s) => s.id === item.chosenSkuId) : null;
  const assignHits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return catalog.filter((s) => s.name.toLowerCase().includes(t)).slice(0, 6);
  }, [q, catalog]);

  // needs_case outranks everything: the bottle may be perfectly matched, but
  // without a case size the quantity is unknowable and must not be applied.
  const state: "needs_case" | "suspect" | "matched" | "ambiguous" | "unmatched" = item.needsCaseSize
    ? "needs_case"
    : item.suspectPreMultiplied
      ? "suspect"
      : item.chosenSkuId
        ? "matched"
        : item.candidates.length > 0
          ? "ambiguous"
          : "unmatched";

  return (
    <div className={`lq-rev lq-rev-${state}`}>
      <div className="lq-rev-top">
        <span className="lq-rev-spoken">“{item.spoken}”</span>
        <div className="lq-rev-qtywrap">
          {item.cases > 0 && item.unitsPerCase != null ? (
            <span className="lq-rev-casemath">
              {item.cases} cs ×{item.unitsPerCase}
              {item.units > 0 ? ` + ${item.units}` : ""} =
            </span>
          ) : (
            <span className="lq-muted">×</span>
          )}
          <input
            className="lq-qty-input"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            value={item.qty}
            onChange={(e) => onQty(Math.max(0, Number(e.target.value)))}
          />
          <button type="button" className="lq-rev-x" aria-label="remove" onClick={onRemove}>✕</button>
        </div>
      </div>

      {/* The ask-do-not-guess path. We heard cases but have no case size for
          this bottle, so the count is genuinely unknowable — rather than
          inventing a multiplier we ask once, persist it, and never ask again. */}
      {state === "needs_case" && (
        <div className="lq-rev-choices">
          <span className="lq-error lq-rev-hint">
            Heard {item.cases} case{item.cases === 1 ? "" : "s"}
            {chosen ? ` of ${chosen.name}` : ""} — how many in a case?
          </span>
          <div className="lq-rev-assign">
            <input
              className="lq-case-input"
              type="number"
              inputMode="numeric"
              step="1"
              min={2}
              placeholder="24"
              aria-label="containers per case"
              value={caseAnswer}
              onChange={(e) => setCaseAnswer(e.target.value)}
            />
            <button
              type="button"
              className="lq-chip"
              disabled={Number(caseAnswer) < 2}
              onClick={() => onCaseSize(Number(caseAnswer))}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* The model was told never to multiply cases out and appears to have
          done it anyway. Adding both readings would double; make a human pick. */}
      {state === "suspect" && (
        <div className="lq-rev-choices">
          <span className="lq-error lq-rev-hint">
            Heard {item.cases} case{item.cases === 1 ? "" : "s"} AND {item.units} each — which did you mean?
          </span>
          <button type="button" className="lq-chip" onClick={() => onQty(item.cases * (item.unitsPerCase ?? 0))}>
            {item.cases} case{item.cases === 1 ? "" : "s"} ({item.cases * (item.unitsPerCase ?? 0)})
          </button>
          <button type="button" className="lq-chip" onClick={() => onQty(item.units)}>
            {item.units} each
          </button>
        </div>
      )}

      {state === "matched" && chosen && (
        <button type="button" className="lq-chip lq-chip-on lq-rev-chosen" onClick={onToggleAssign}>
          ✓ {chosen.name}{chosen.sizeMl != null ? ` · ${chosen.sizeMl}ml` : ""}
        </button>
      )}

      {state === "ambiguous" && (
        <div className="lq-rev-choices">
          <span className="lq-muted lq-rev-hint">Which one?</span>
          {item.candidates.map((c) => (
            <button key={c.id} type="button" className="lq-chip" onClick={() => onPick(c.id)}>
              {skuLabel(c)}
            </button>
          ))}
        </div>
      )}

      {state === "unmatched" && (
        <div className="lq-rev-choices">
          <span className="lq-error lq-rev-hint">Couldn't place this.</span>
          {!item.assignOpen ? (
            <button type="button" className="lq-chip" onClick={onToggleAssign}>Find bottle…</button>
          ) : (
            <div className="lq-rev-assign">
              <input
                className="lq-search lq-rev-search"
                type="search"
                placeholder="Type the bottle…"
                value={q}
                autoFocus
                onChange={(e) => setQ(e.target.value)}
              />
              {assignHits.map((s) => (
                <button key={s.id} type="button" className="lq-chip" onClick={() => onPick(s.id)}>
                  {s.name}{s.sizeMl != null ? ` · ${s.sizeMl}ml` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 2 decimals: "a quarter bottle" must stay 0.25, not round to 0.3. (The DB
// column is numeric(12,3) — the client is the only place precision was lost.)
function roundQty(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The LOOSE portion of a cell — total minus whatever the cases contribute.
 *  Every stepper and number field edits this, never the total: feeding a
 *  case-bearing cell's `qty` back into setQty would re-add the cases. */
function looseOf(cell: Cell | undefined): number {
  if (!cell) return 0;
  const fromCases = (cell.cases ?? 0) * (cell.caseSize ?? 0);
  return Math.max(0, roundQty(cell.qty - fromCases));
}

/** The case entry box. Deliberately a SECOND field beside the each-count, not
 *  a bottle/case mode toggle — a toggle is one mis-tap from a 24x error with
 *  no visual trace, whereas two labelled boxes plus a running total show their
 *  own work. The multiplier is always on screen ("x24") for the same reason. */
function CaseBox({
  cases,
  caseSize,
  onChange,
}: {
  cases: number;
  caseSize: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="lq-casebox">
      <input
        className="lq-case-input"
        type="number"
        inputMode="numeric"
        step="1"
        min={0}
        value={cases || ""}
        placeholder="0"
        aria-label={`cases (${caseSize} each)`}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
      />
      <span className="lq-case-unit">cs ×{caseSize}</span>
    </div>
  );
}

function rebuildCounts(lines: OpenCountLine[]): Counts {
  const out: Counts = {};
  for (const l of lines) {
    const zone = (out[l.zoneId] ??= {});
    const qty = Number(l.qtyUnits);
    // Restore the case memo from the ROW's frozen values — deliberately NOT
    // from the catalog's current unitsPerCase. If someone corrects a SKU's case
    // size while a draft is open, reopening that draft must not rescale it.
    const cases = l.enteredCases != null ? Number(l.enteredCases) : 0;
    const caseSize = l.caseSizeAtEntry;
    if (qty > 0)
      zone[l.skuId] = {
        qty,
        ...(cases > 0 && caseSize ? { cases, caseSize } : {}),
        source: l.source,
        ...(l.rawUtterance ? { raw: l.rawUtterance } : {}),
      };
  }
  return out;
}

function flatten(counts: Counts): CountLineInput[] {
  const out: CountLineInput[] = [];
  for (const [zoneId, cells] of Object.entries(counts)) {
    for (const [skuId, cell] of Object.entries(cells)) {
      const usesCases = (cell.cases ?? 0) > 0 && cell.caseSize != null;
      out.push({
        zoneId,
        skuId,
        qtyUnits: cell.qty,
        source: cell.source,
        ...(usesCases ? { enteredCases: cell.cases, caseSizeAtEntry: cell.caseSize } : {}),
        ...(cell.raw ? { rawUtterance: cell.raw } : {}),
      });
    }
  }
  return out;
}
