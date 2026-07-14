import { useEffect, useRef, useState } from "react";
import {
  createKegCount,
  getKegKnown,
  saveKegLines,
  submitKegCount,
  type KegCategory,
  type KegKnownItem,
  type KegLineInput,
} from "../api";
import { parseQuantity } from "../matcher";
import { useSpeech } from "../useSpeech";

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
  const keySeq = useRef(0);
  const nextKey = () => `r${keySeq.current++}`;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [sid, k] = await Promise.all([createKegCount(), getKegKnown()]);
        if (!live) return;
        setSessionId(sid);
        setKnown(k);
        setRows([{ key: nextKey(), kegName: "", category: "beer", qty: 1, source: "grid" }]);
        setPhase("ready");
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

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

  const speech = useSpeech((transcript) => {
    const qty = parseQuantity(transcript) ?? 1;
    // strip leading quantity/filler words → keg name
    const name = transcript
      .replace(
        /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|point|and|a|an|half|full|fulls|case|cases|keg|kegs|backup)\b/gi,
        " ",
      )
      .replace(/[0-9.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const hit = known.find(
      (k) => name && (k.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.name.toLowerCase())),
    );
    addRow({
      kegName: hit ? hit.name : titleCase(name),
      category: hit ? hit.category : "beer",
      qty: Math.round(qty),
      source: "voice",
      raw: transcript,
    });
  });

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
      <div className="lq-toolbar">
        {speech.supported && (
          <button
            type="button"
            className={`lq-mic${speech.listening ? " lq-mic-on" : ""}`}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
          >
            {speech.listening ? "● Listening…" : "🎤 Say a keg"}
          </button>
        )}
        <p className="lq-muted lq-keg-hint">Untapped / backup kegs only.</p>
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

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
