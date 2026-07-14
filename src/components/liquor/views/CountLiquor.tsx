import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCount,
  extractVoice,
  getCatalog,
  getZones,
  saveCountLines,
  submitCount,
  BarApiError,
  type BarSkuItem,
  type BarZoneItem,
  type CountLineInput,
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

const CAP_SECONDS = 180; // hard stop — Web Speech gets flaky + review lists get long past ~3 min
const WARN_SECONDS = 150; // "wrap up this bottle"

type Cell = { qty: number; source: "grid" | "voice"; raw?: string };
type Counts = Record<string, Record<string, Cell>>; // counts[zoneId][skuId]

type ReviewItem = {
  key: string;
  spoken: string;
  qty: number;
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

  // voice
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const dict = useDictation((t) => void processTranscript(t));

  const nameById = useMemo(() => new Map(catalog.map((s) => [s.id, s.name])), [catalog]);

  // ── bootstrap ──
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [sid, z, cat] = await Promise.all([createCount(true), getZones(), getCatalog()]);
        if (!live) return;
        setSessionId(sid);
        setZones(z);
        setCatalog(cat);
        setZoneId(z[0]?.id ?? "");
        setPhase("ready");
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

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

  /** SET an exact qty for (zone, sku) — the manual correction path. */
  function setQty(skuId: string, qty: number) {
    setCounts((prev) => {
      const zone = { ...(prev[zoneId] ?? {}) };
      if (qty <= 0) delete zone[skuId];
      else zone[skuId] = { qty: Math.max(0, round1(qty)), source: "grid", ...(zone[skuId]?.raw ? { raw: zone[skuId]!.raw } : {}) };
      return { ...prev, [zoneId]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  /** ADD to the running (zone, sku) total — the voice/count path. */
  function addQty(skuId: string, delta: number, source: "grid" | "voice", raw?: string) {
    setCounts((prev) => {
      const zone = { ...(prev[zoneId] ?? {}) };
      const next = round1((zone[skuId]?.qty ?? 0) + delta);
      if (next <= 0) delete zone[skuId];
      else zone[skuId] = { qty: next, source, ...(raw ? { raw } : {}) };
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
          qty: it.qty > 0 ? it.qty : 1,
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

  function applyReview() {
    if (!review) return;
    // Sum duplicates within this clip, then ADD each into the zone total.
    const merged = new Map<string, { qty: number; spoken: string }>();
    for (const it of review) {
      if (!it.chosenSkuId) continue;
      const e = merged.get(it.chosenSkuId);
      if (e) e.qty = round1(e.qty + it.qty);
      else merged.set(it.chosenSkuId, { qty: it.qty, spoken: it.spoken });
    }
    for (const [skuId, { qty, spoken }] of merged) addQty(skuId, qty, "voice", spoken);
    setReview(null);
  }
  const reviewResolved = review ? review.filter((r) => r.chosenSkuId).length : 0;
  const reviewPending = review ? review.length - reviewResolved : 0;

  async function finish() {
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
      {/* zone tabs */}
      <div className="lq-zonebar" role="tablist" aria-label="Zones">
        {zones.map((z) => {
          const n = Object.keys(counts[z.id] ?? {}).length;
          return (
            <button
              key={z.id}
              type="button"
              role="tab"
              aria-selected={z.id === zoneId}
              className={`lq-zone${z.id === zoneId ? " lq-zone-on" : ""}`}
              onClick={() => setZoneId(z.id)}
            >
              {z.name}
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
            const qty = zoneCells[s.id]?.qty ?? 0;
            return (
              <div key={s.id} className={`lq-row${qty > 0 ? " lq-row-set" : ""}`}>
                <div className="lq-row-name">
                  <span className="lq-name">{s.name}</span>
                  <span className="lq-size">{sizeLabel(s)}</span>
                </div>
                <div className="lq-stepper">
                  <button type="button" className="lq-step" aria-label={`decrease ${s.name}`} onClick={() => setQty(s.id, round1(qty - 1))}>−</button>
                  <input
                    className="lq-qty-input"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={0}
                    value={qty || ""}
                    placeholder="0"
                    onChange={(e) => setQty(s.id, e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
                  />
                  <button type="button" className="lq-step" aria-label={`increase ${s.name}`} onClick={() => setQty(s.id, round1(qty + 1))}>+</button>
                </div>
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
          capturedHere.map(([skuId, cell]) => (
            <div key={skuId} className="lq-row lq-row-set">
              <div className="lq-row-name">
                <span className="lq-name">
                  {cell.source === "voice" && <span className="lq-voice-tag" title="added by voice" aria-hidden="true">🎤 </span>}
                  {nameById.get(skuId) ?? "—"}
                </span>
                {cell.raw && <span className="lq-size lq-heard">heard: “{cell.raw}”</span>}
              </div>
              <div className="lq-stepper">
                <button type="button" className="lq-step" aria-label="decrease" onClick={() => setQty(skuId, round1(cell.qty - 1))}>−</button>
                <input
                  className="lq-qty-input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  value={cell.qty}
                  onChange={(e) => setQty(skuId, e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
                />
                <button type="button" className="lq-step" aria-label="increase" onClick={() => setQty(skuId, round1(cell.qty + 1))}>+</button>
              </div>
            </div>
          ))
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
          <button type="button" className="lq-btn lq-btn-primary" disabled={submitting || enteredTotal === 0} onClick={finish}>
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
}: {
  item: ReviewItem;
  catalog: BarSkuItem[];
  onQty: (q: number) => void;
  onPick: (skuId: string) => void;
  onToggleAssign: () => void;
  onRemove: () => void;
}) {
  const [q, setQ] = useState("");
  const chosen = item.chosenSkuId ? catalog.find((s) => s.id === item.chosenSkuId) : null;
  const assignHits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return catalog.filter((s) => s.name.toLowerCase().includes(t)).slice(0, 6);
  }, [q, catalog]);

  const state: "matched" | "ambiguous" | "unmatched" = item.chosenSkuId
    ? "matched"
    : item.candidates.length > 0
      ? "ambiguous"
      : "unmatched";

  return (
    <div className={`lq-rev lq-rev-${state}`}>
      <div className="lq-rev-top">
        <span className="lq-rev-spoken">“{item.spoken}”</span>
        <div className="lq-rev-qtywrap">
          <span className="lq-muted">×</span>
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function flatten(counts: Counts): CountLineInput[] {
  const out: CountLineInput[] = [];
  for (const [zoneId, cells] of Object.entries(counts)) {
    for (const [skuId, cell] of Object.entries(cells)) {
      out.push({
        zoneId,
        skuId,
        qtyUnits: cell.qty,
        source: cell.source,
        ...(cell.raw ? { rawUtterance: cell.raw } : {}),
      });
    }
  }
  return out;
}
