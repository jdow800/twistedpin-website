import { useEffect, useMemo, useRef, useState } from "react";
import {
  createCount,
  getCatalog,
  getZones,
  saveCountLines,
  submitCount,
  type BarSkuItem,
  type BarZoneItem,
  type CountLineInput,
} from "../api";
import { parseCountUtterance, type SkuCandidate } from "../matcher";
import { useSpeech } from "../useSpeech";

type Cell = { qty: number; source: "grid" | "voice"; raw?: string };
// counts[zoneId][skuId] = Cell — only SKUs the counter actually entered.
type Counts = Record<string, Record<string, Cell>>;

type VoicePrompt = { candidates: SkuCandidate[]; qty: number; raw: string; picked: string };

const sizeLabel = (s: BarSkuItem) => (s.sizeMl != null ? `${s.sizeMl} ml` : "each");

export default function CountLiquor({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [zones, setZones] = useState<BarZoneItem[]>([]);
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [zoneId, setZoneId] = useState<string>("");
  const [counts, setCounts] = useState<Counts>({});
  const [search, setSearch] = useState("");
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [voice, setVoice] = useState<VoicePrompt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<number | null>(null);

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

  function setQty(skuId: string, qty: number, source: "grid" | "voice", raw?: string) {
    setCounts((prev) => {
      const zone = { ...(prev[zoneId] ?? {}) };
      if (qty <= 0 && source === "grid") delete zone[skuId];
      else zone[skuId] = { qty: Math.max(0, qty), source, ...(raw ? { raw } : {}) };
      return { ...prev, [zoneId]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  // ── voice ──
  const speech = useSpeech((transcript) => {
    const { candidates, qty } = parseCountUtterance(transcript, catalog);
    if (candidates.length === 0) {
      setVoice({ candidates: [], qty: qty ?? 1, raw: transcript, picked: "" });
      return;
    }
    setVoice({
      candidates,
      qty: qty ?? 1,
      raw: transcript,
      picked: candidates[0]!.sku.id,
    });
  });
  function confirmVoice() {
    if (!voice || !voice.picked) return;
    setQty(voice.picked, voice.qty, "voice", voice.raw);
    setVoice(null);
  }

  async function finish() {
    if (!sessionId || submitting) return;
    setSubmitting(true);
    setSave("saving");
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Explicit save that can THROW — a failed save must abort the submit so we
      // never close a count with lines that didn't persist (flush() swallows).
      await saveCountLines(sessionId, flatten(countsRef.current));
      const n = await submitCount(sessionId);
      setDone(n);
    } catch {
      setSave("error");
      setSubmitting(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = q ? catalog.filter((s) => s.name.toLowerCase().includes(q)) : catalog;
    const byCat = new Map<string, BarSkuItem[]>();
    for (const s of items) {
      const c = s.category ?? "Other";
      const arr = byCat.get(c);
      if (arr) arr.push(s);
      else byCat.set(c, [s]);
    }
    return [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog, search]);

  const zoneCounts = counts[zoneId] ?? {};
  const enteredThisZone = Object.keys(zoneCounts).length;
  const enteredTotal = Object.values(counts).reduce((n, z) => n + Object.keys(z).length, 0);

  if (phase === "loading") return <div className="lq-center lq-muted">Starting count…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't start the count.</p>
        <button className="lq-btn" onClick={onDone}>
          Back
        </button>
      </div>
    );
  if (done !== null)
    return (
      <div className="lq-center">
        <p className="lq-done-emoji" aria-hidden="true">✅</p>
        <h2 className="lq-h2">Count submitted</h2>
        <p className="lq-muted">{done} line{done === 1 ? "" : "s"} recorded.</p>
        <button className="lq-btn lq-btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    );

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

      {/* voice + search */}
      <div className="lq-toolbar">
        {speech.supported && (
          <button
            type="button"
            className={`lq-mic${speech.listening ? " lq-mic-on" : ""}`}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            aria-label="Voice entry"
          >
            {speech.listening ? "● Listening…" : "🎤 Say a bottle"}
          </button>
        )}
        <input
          className="lq-search"
          type="search"
          inputMode="search"
          placeholder="Search bottles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* voice confirm card */}
      {voice && (
        <div className="lq-voice-card">
          <p className="lq-voice-heard">Heard: “{voice.raw}”</p>
          {voice.candidates.length === 0 ? (
            <p className="lq-error">No bottle matched — try again or type it.</p>
          ) : (
            <>
              <div className="lq-voice-picks">
                {voice.candidates.map((c) => (
                  <button
                    key={c.sku.id}
                    type="button"
                    className={`lq-chip${c.sku.id === voice.picked ? " lq-chip-on" : ""}`}
                    onClick={() => setVoice({ ...voice, picked: c.sku.id })}
                  >
                    {c.sku.name}
                  </button>
                ))}
              </div>
              <div className="lq-voice-qty">
                <span>Qty</span>
                <input
                  className="lq-qty-input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  value={voice.qty}
                  onChange={(e) => setVoice({ ...voice, qty: Number(e.target.value) })}
                />
              </div>
            </>
          )}
          <div className="lq-voice-actions">
            <button type="button" className="lq-btn lq-btn-ghost" onClick={() => setVoice(null)}>
              Cancel
            </button>
            {voice.candidates.length > 0 && (
              <button type="button" className="lq-btn lq-btn-primary" onClick={confirmVoice}>
                Set
              </button>
            )}
          </div>
        </div>
      )}

      {/* grid */}
      <div className="lq-grid">
        {filtered.map(([cat, items]) => (
          <div key={cat} className="lq-catgroup">
            <h3 className="lq-cat">{cat}</h3>
            {items.map((s) => {
              const cell = zoneCounts[s.id];
              const qty = cell?.qty ?? 0;
              return (
                <div key={s.id} className={`lq-row${qty > 0 ? " lq-row-set" : ""}`}>
                  <div className="lq-row-name">
                    <span className="lq-name">{s.name}</span>
                    <span className="lq-size">{sizeLabel(s)}</span>
                  </div>
                  <div className="lq-stepper">
                    <button
                      type="button"
                      className="lq-step"
                      aria-label={`decrease ${s.name}`}
                      onClick={() => setQty(s.id, Math.max(0, round1(qty - 1)), "grid")}
                    >
                      −
                    </button>
                    <input
                      className="lq-qty-input"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min={0}
                      value={cell ? qty : ""}
                      placeholder="0"
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") setQty(s.id, 0, "grid");
                        else setQty(s.id, Math.max(0, Number(v)), "grid");
                      }}
                    />
                    <button
                      type="button"
                      className="lq-step"
                      aria-label={`increase ${s.name}`}
                      onClick={() => setQty(s.id, round1(qty + 1), "grid")}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* footer */}
      <div className="lq-footer">
        <div className="lq-savestate">
          {save === "saving" && "Saving…"}
          {save === "saved" && "Saved ✓"}
          {save === "error" && <span className="lq-error">Save failed — will retry on submit</span>}
        </div>
        <div className="lq-footer-actions">
          <span className="lq-muted lq-count-tally">
            {enteredThisZone} here · {enteredTotal} total
          </span>
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>
            Exit
          </button>
          <button
            type="button"
            className="lq-btn lq-btn-primary"
            disabled={submitting || enteredTotal === 0}
            onClick={finish}
          >
            {submitting ? "Submitting…" : "Finish & submit"}
          </button>
        </div>
      </div>
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
