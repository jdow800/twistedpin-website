import { useEffect, useRef, useState } from "react";
import {
  createKegCount,
  extractKegVoice,
  getKegKnown,
  getOpenKegCount,
  saveKegLines,
  submitKegCount,
  BarApiError,
  type KegCategory,
  type KegKnownItem,
  type KegLineInput,
} from "../api";
import { useDictation } from "../useSpeech";

const CAP_SECONDS = 120; // kegs are few — short bursts; each recording adds more rows
const WARN_SECONDS = 95;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const CATEGORIES: { value: KegCategory; label: string }[] = [
  { value: "beer", label: "Beer" },
  { value: "red_wine", label: "Red wine" },
  { value: "white_wine", label: "White wine" },
  { value: "non_alcoholic", label: "N/A" },
  { value: "other", label: "Other" },
];

type Row = {
  key: string;
  kegName: string;
  category: KegCategory;
  qty: number;
  source: "grid" | "voice";
  raw?: string;
};

export default function CountKegs({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [known, setKnown] = useState<KegKnownItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const keySeq = useRef(0);
  const nextKey = () => `r${keySeq.current++}`;
  const starterRow = (): Row => ({ key: nextKey(), kegName: "", category: "beer", qty: 1, source: "grid" });

  // Resume the staffer's in-progress keg draft (across a reload), else start new.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [k, open] = await Promise.all([getKegKnown(), getOpenKegCount()]);
        if (!live) return;
        setKnown(k);
        if (open) {
          setSessionId(open.id);
          if (open.lines.length > 0) {
            setRows(open.lines.map((l) => ({
              key: nextKey(),
              kegName: l.kegName,
              category: l.category,
              qty: l.qty,
              source: l.source,
              ...(l.rawUtterance ? { raw: l.rawUtterance } : {}),
            })));
            setResumed(true);
          } else {
            setRows([starterRow()]);
          }
        } else {
          setSessionId(await createKegCount());
          setRows([starterRow()]);
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
      const sid = await createKegCount();
      setSessionId(sid);
      setRows([starterRow()]);
      setResumed(false);
      setSave("idle");
    } catch {
      setSave("error");
    }
  }

  // Flush on screen-lock / app-switch so the last edit can't be lost on eviction.
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

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef<Row[]>(rows);
  rowsRef.current = rows;
  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 1400);
  }
  function validLines(rs: Row[]): KegLineInput[] {
    return rs
      .filter((r) => r.kegName.trim() && r.qty > 0)
      .map((r) => ({
        kegName: r.kegName.trim(),
        category: r.category,
        qty: Math.round(r.qty),
        source: r.source,
        ...(r.raw ? { rawUtterance: r.raw } : {}),
      }));
  }
  async function flush() {
    if (!sessionId) return;
    setSave("saving");
    try {
      await saveKegLines(sessionId, validLines(rowsRef.current));
      setSave("saved");
    } catch {
      setSave("error");
    }
  }

  function patch(key: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
    setSave("idle");
    scheduleSave();
  }
  function addRow(init?: Partial<Row>) {
    setRows((rs) => [
      ...rs,
      { key: nextKey(), kegName: "", category: "beer", qty: 1, source: "grid", ...init },
    ]);
  }
  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setSave("idle");
    scheduleSave();
  }

  // When a name matches a known keg, adopt its category.
  function onName(key: string, name: string) {
    const hit = known.find((k) => k.name.toLowerCase() === name.trim().toLowerCase());
    patch(key, { kegName: name, ...(hit ? { category: hit.category } : {}) });
  }

  // ── run-on voice: record the whole cooler → extract → append editable rows ──
  const dict = useDictation((t) => void processKegTranscript(t));
  useEffect(() => {
    if (dict.recording && dict.seconds >= CAP_SECONDS) dict.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict.seconds, dict.recording]);

  async function processKegTranscript(transcript: string) {
    if (!transcript.trim()) return;
    setVoiceBusy(true);
    setVoiceErr(null);
    try {
      const items = await extractKegVoice(transcript);
      if (items.length === 0) {
        setVoiceErr("Didn't catch any kegs — try again.");
        return;
      }
      // The rows ARE the review — append each keg; fix name/category/qty inline.
      setRows((rs) => [
        ...rs.filter((r) => r.kegName.trim()), // drop the empty starter row
        ...items.map((it) => ({
          key: nextKey(),
          kegName: it.kegName,
          category: it.category,
          qty: it.qty > 0 ? it.qty : 1,
          source: "voice" as const,
          raw: transcript,
        })),
      ]);
      setSave("idle");
      scheduleSave();
    } catch (e) {
      setVoiceErr(e instanceof BarApiError ? e.message : "Couldn't process that — try again or type them.");
    } finally {
      setVoiceBusy(false);
    }
  }

  async function finish() {
    if (!sessionId || submitting) return;
    const lines = validLines(rows);
    setSubmitting(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveKegLines(sessionId, lines);
      const n = await submitKegCount(sessionId);
      setDone(n);
    } catch {
      setSave("error");
      setSubmitting(false);
    }
  }

  if (phase === "loading") return <div className="lq-center lq-muted">Starting keg count…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't start the keg count.</p>
        <button className="lq-btn" onClick={onDone}>
          Back
        </button>
      </div>
    );
  if (done !== null)
    return (
      <div className="lq-center">
        <p className="lq-done-emoji" aria-hidden="true">✅</p>
        <h2 className="lq-h2">Keg count submitted</h2>
        <p className="lq-muted">{done} keg{done === 1 ? "" : "s"} recorded.</p>
        <button className="lq-btn lq-btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    );

  const total = validLines(rows).reduce((n, r) => n + r.qty, 0);
  return (
    <div className="lq-count">
      {resumed && (
        <div className="lq-resumed">
          <span>↩ Picked up your keg count in progress.</span>
          <button type="button" className="lq-linkbtn" onClick={startFresh}>Start a new count</button>
        </div>
      )}
      <p className="lq-muted lq-keg-hint">Untapped / backup kegs only.</p>
      <div className="lq-voicebar">
        {!dict.supported ? (
          <p className="lq-muted lq-voice-unsupported">Voice isn't available on this browser — add kegs below.</p>
        ) : dict.recording ? (
          <div className={`lq-rec${dict.seconds >= WARN_SECONDS ? " lq-rec-warn" : ""}`}>
            <div className="lq-rec-head">
              <span className="lq-rec-dot" aria-hidden="true" />
              <span className="lq-rec-label">Listening…</span>
              <span className="lq-rec-timer">{mmss(dict.seconds)} / {mmss(CAP_SECONDS)}</span>
            </div>
            <p className="lq-rec-transcript">
              {dict.transcript || <span className="lq-muted">Say the kegs and how many — “two Miller Lite, one Kona…”</span>}
              {dict.interim && <span className="lq-muted"> {dict.interim}</span>}
            </p>
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
            <span>Record kegs</span>
          </button>
        )}
        {voiceErr && <p className="lq-error lq-voice-err">{voiceErr}</p>}
        {dict.error && !dict.recording && (
          <p className="lq-muted lq-voice-err">Mic stopped ({dict.error}). Tap record to try again.</p>
        )}
      </div>

      <datalist id="lq-keg-names">
        {known.map((k) => (
          <option key={k.name} value={k.name} />
        ))}
      </datalist>

      <div className="lq-keg-rows">
        {rows.map((r) => (
          <div key={r.key} className="lq-keg-row">
            <input
              className="lq-keg-name"
              list="lq-keg-names"
              placeholder="Keg name (e.g. Miller Lite)"
              value={r.kegName}
              onChange={(e) => onName(r.key, e.target.value)}
            />
            <select
              className="lq-keg-cat"
              value={r.category}
              onChange={(e) => patch(r.key, { category: e.target.value as KegCategory })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="lq-stepper lq-keg-stepper">
              <button type="button" className="lq-step" onClick={() => patch(r.key, { qty: Math.max(0, r.qty - 1) })}>
                −
              </button>
              <input
                className="lq-qty-input"
                type="number"
                inputMode="numeric"
                min={0}
                value={r.qty}
                onChange={(e) => patch(r.key, { qty: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              />
              <button type="button" className="lq-step" onClick={() => patch(r.key, { qty: r.qty + 1 })}>
                +
              </button>
            </div>
            <button
              type="button"
              className="lq-keg-remove"
              aria-label="remove row"
              onClick={() => removeRow(r.key)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="lq-btn lq-btn-ghost lq-btn-wide" onClick={() => addRow()}>
        + Add a keg
      </button>

      <div className="lq-footer">
        <div className="lq-savestate">
          {save === "saving" && "Saving…"}
          {save === "saved" && "Saved ✓"}
          {save === "error" && <span className="lq-error">Save failed — will retry on submit</span>}
        </div>
        <div className="lq-footer-actions">
          <span className="lq-muted lq-count-tally">{total} keg{total === 1 ? "" : "s"}</span>
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>
            Exit
          </button>
          <button type="button" className="lq-btn lq-btn-primary" disabled={submitting} onClick={finish}>
            {submitting ? "Submitting…" : "Finish & submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
