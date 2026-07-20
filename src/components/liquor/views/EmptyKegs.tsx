import { useEffect, useRef, useState } from "react";
import {
  createEmptyKegReport,
  extractEmptyKegVoice,
  getKegBrands,
  getOpenEmptyKegReport,
  saveEmptyKegLines,
  submitEmptyKegReport,
  BarApiError,
  type EmptyAmount,
  type EmptyKegLineInput,
  type KegBrand,
} from "../api";
import { useDictation } from "../useSpeech";

/**
 * "Do you have a lot of empty kegs from any particular brand?" — the owner's
 * weekly verbal question, as a 30-second flow.
 *
 * Sibling of CountKegs (which counts FULL backup stock). Two deliberate
 * differences, both downstream of the fact that nobody counts an empty stack:
 *
 * - THE AMOUNT IS A BAND. A few / some / a lot, with an optional exact number
 *   for when the counter genuinely knows. Forcing a number would print
 *   invented precision that reads as if someone had counted.
 * - TAP-FIRST, VOICE SECOND. The tap-wall brands are listed most-recently-
 *   pulled first, because a keg that left the wall two weeks ago is exactly
 *   what is stacked in the back. Most nights this is pure tapping.
 */

const CAP_SECONDS = 90; // shorter than the full count — this is a handful of brands
const WARN_SECONDS = 70;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const AMOUNTS: { value: EmptyAmount; label: string; hint: string }[] = [
  { value: "a_few", label: "A few", hint: "a couple sitting there" },
  { value: "some", label: "Some", hint: "several stacked up" },
  { value: "a_lot", label: "A lot", hint: "the pile is big" },
];

type Row = {
  key: string;
  brandId: string | null;
  label: string;
  brewery: string | null;
  amount: EmptyAmount;
  qty: number | null;
  source: "grid" | "voice";
  raw?: string;
};

/** "3 weeks ago" / "on tap now" — why this brand is in the suggestion list. */
function whenPulled(b: KegBrand): string {
  if (b.isOnTap) return "on tap now";
  if (!b.lastOnTap) return "";
  const days = Math.floor((Date.now() - new Date(b.lastOnTap).getTime()) / 86_400_000);
  if (days <= 1) return "pulled yesterday";
  if (days < 14) return `pulled ${days}d ago`;
  if (days < 60) return `pulled ${Math.round(days / 7)}w ago`;
  return `pulled ${Math.round(days / 30)}mo ago`;
}

export default function EmptyKegs({
  onDone,
  embedded = false,
  onEmbedState,
  embedFlushRef,
}: {
  onDone?: () => void;
  /** Embedded as the empties half of Keg Check: own session + autosave, parent owns Send. */
  embedded?: boolean;
  onEmbedState?: (s: { sessionId: string | null; count: number }) => void;
  embedFlushRef?: { current: (() => Promise<void>) | null };
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [brands, setBrands] = useState<KegBrand[]>([]);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const keySeq = useRef(0);
  const nextKey = () => `e${keySeq.current++}`;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [b, open] = await Promise.all([getKegBrands(), getOpenEmptyKegReport()]);
        if (!live) return;
        setBrands(b.brands);
        setImportedAt(b.importedAt);
        if (open) {
          setSessionId(open.id);
          if (open.lines.length > 0) {
            setRows(
              open.lines.map((l) => ({
                key: nextKey(),
                brandId: l.brandId,
                label: l.label,
                brewery: l.brewery,
                amount: l.amount,
                qty: l.qty,
                source: l.source,
                ...(l.rawUtterance ? { raw: l.rawUtterance } : {}),
              })),
            );
            setResumed(true);
          }
        } else {
          setSessionId(await createEmptyKegReport());
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
      const sid = await createEmptyKegReport();
      setSessionId(sid);
      setRows([]);
      setResumed(false);
      setSave("idle");
    } catch {
      setSave("error");
    }
  }

  // Flush on screen-lock / app-switch so the last tap can't be lost on eviction.
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

  // Live flush handle for the embedding parent, reassigned every render.
  useEffect(() => {
    if (embedFlushRef) embedFlushRef.current = flush;
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef<Row[]>(rows);
  rowsRef.current = rows;
  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 1400);
  }
  function validLines(rs: Row[]): EmptyKegLineInput[] {
    return rs
      .filter((r) => r.label.trim())
      .map((r) => ({
        brandId: r.brandId,
        label: r.label.trim(),
        brewery: r.brewery,
        amount: r.amount,
        qty: r.qty && r.qty > 0 ? Math.round(r.qty) : null,
        source: r.source,
        ...(r.raw ? { rawUtterance: r.raw } : {}),
      }));
  }
  async function flush() {
    if (!sessionId) return;
    setSave("saving");
    try {
      await saveEmptyKegLines(sessionId, validLines(rowsRef.current));
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
  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setSave("idle");
    scheduleSave();
  }

  /** Tapping a brand adds it at "some" — the middle band, so either direction is one tap. */
  function addBrand(b: KegBrand) {
    setRows((rs) => {
      if (rs.some((r) => r.brandId === b.id)) return rs; // already on the list
      return [
        ...rs,
        {
          key: nextKey(),
          brandId: b.id,
          label: b.name,
          brewery: b.brewery || null,
          amount: "some" as EmptyAmount,
          qty: null,
          source: "grid" as const,
        },
      ];
    });
    setSearch("");
    setSave("idle");
    scheduleSave();
  }

  /** Anything the tap wall never carried — guest kegs, one-offs. */
  function addFreeText(name: string) {
    const label = name.trim();
    if (!label) return;
    setRows((rs) => [
      ...rs,
      {
        key: nextKey(),
        brandId: null,
        label,
        brewery: null,
        amount: "some" as EmptyAmount,
        qty: null,
        source: "grid" as const,
      },
    ]);
    setSearch("");
    setSave("idle");
    scheduleSave();
  }

  // ── voice: say the whole answer at once ──────────────────────────────────
  const dict = useDictation((t) => void processTranscript(t));
  useEffect(() => {
    if (dict.recording && dict.seconds >= CAP_SECONDS) dict.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict.seconds, dict.recording]);

  async function processTranscript(transcript: string) {
    if (!transcript.trim()) return;
    setVoiceBusy(true);
    setVoiceErr(null);
    try {
      const items = await extractEmptyKegVoice(transcript);
      if (items.length === 0) {
        setVoiceErr("Didn't catch any brands — try again or tap them below.");
        return;
      }
      setRows((rs) => {
        const next = [...rs];
        for (const it of items) {
          // Re-saying a brand updates the amount rather than duplicating the row.
          const i = next.findIndex((r) =>
            it.brandId ? r.brandId === it.brandId : r.label.toLowerCase() === it.label.toLowerCase(),
          );
          const brand = it.brandId ? brands.find((b) => b.id === it.brandId) : undefined;
          if (i >= 0) {
            next[i] = { ...next[i]!, amount: it.amount, qty: it.qty, raw: transcript };
          } else {
            next.push({
              key: nextKey(),
              brandId: it.brandId,
              label: it.label,
              brewery: brand?.brewery || null,
              amount: it.amount,
              qty: it.qty,
              source: "voice" as const,
              raw: transcript,
            });
          }
        }
        return next;
      });
      setSave("idle");
      scheduleSave();
    } catch (e) {
      setVoiceErr(
        e instanceof BarApiError ? e.message : "Couldn't process that — try again or tap the brands.",
      );
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
      await saveEmptyKegLines(sessionId, lines);
      const n = await submitEmptyKegReport(sessionId);
      setDone(n);
    } catch {
      setSave("error");
      setSubmitting(false);
    }
  }

  // Reported to the parent for its section header. Declared above the early
  // returns so the effect stays unconditional.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    onEmbedState?.({ sessionId, count: rows.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, rows.length]);

  if (phase === "loading") return <div className="lq-center lq-muted">Starting empty-keg report…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't start the empty-keg report.</p>
        <button className="lq-btn" onClick={() => onDone?.()}>
          Back
        </button>
      </div>
    );
  if (done !== null)
    return (
      <div className="lq-center">
        <p className="lq-done-emoji" aria-hidden="true">✅</p>
        <h2 className="lq-h2">Empties reported</h2>
        <p className="lq-muted">
          {done} brand{done === 1 ? "" : "s"} sent.
        </p>
        <button className="lq-btn lq-btn-primary" onClick={() => onDone?.()}>
          Done
        </button>
      </div>
    );

  const chosen = new Set(rows.map((r) => r.brandId).filter(Boolean) as string[]);
  const needle = search.trim().toLowerCase();
  const suggestions = brands
    .filter((b) => !chosen.has(b.id))
    .filter(
      (b) =>
        !needle ||
        b.name.toLowerCase().includes(needle) ||
        b.brewery.toLowerCase().includes(needle),
    )
    .slice(0, needle ? 12 : 14);
  // Only offer free-text when the search genuinely matches nothing known —
  // otherwise it competes with a perfectly good brand row.
  const canAddFreeText = needle.length >= 2 && suggestions.length === 0;

  return (
    <div className={embedded ? "lq-count lq-empties lq-count-embedded" : "lq-count lq-empties"}>
      {resumed && (
        <div className="lq-resumed">
          <span>↩ Picked up your empty-keg report in progress.</span>
          <button type="button" className="lq-linkbtn" onClick={startFresh}>
            Start a new one
          </button>
        </div>
      )}
      <p className="lq-muted lq-keg-hint">
        Empty / spent kegs stacked out back — roughly how many of each brand.
      </p>

      <div className="lq-voicebar">
        {!dict.supported ? (
          <p className="lq-muted lq-voice-unsupported">
            Voice isn't available on this browser — tap the brands below.
          </p>
        ) : dict.recording ? (
          <div className={`lq-rec${dict.seconds >= WARN_SECONDS ? " lq-rec-warn" : ""}`}>
            <div className="lq-rec-head">
              <span className="lq-rec-dot" aria-hidden="true" />
              <span className="lq-rec-label">Listening…</span>
              <span className="lq-rec-timer">
                {mmss(dict.seconds)} / {mmss(CAP_SECONDS)}
              </span>
            </div>
            <p className="lq-rec-transcript">
              {dict.transcript || (
                <span className="lq-muted">
                  “Lots of empty Modelo, a bunch of Werk Force, couple Emancipation…”
                </span>
              )}
              {dict.interim && <span className="lq-muted"> {dict.interim}</span>}
            </p>
            <button
              type="button"
              className="lq-btn lq-btn-primary lq-rec-stop"
              onClick={() => dict.stop()}
            >
              ■ Stop &amp; process
            </button>
          </div>
        ) : voiceBusy ? (
          <div className="lq-rec">
            <p className="lq-muted">Reading that back…</p>
          </div>
        ) : (
          <button
            type="button"
            className="lq-record"
            onClick={() => {
              setVoiceErr(null);
              dict.start();
            }}
          >
            <span className="lq-record-emoji" aria-hidden="true">🎤</span>
            <span>Say what's empty</span>
          </button>
        )}
        {voiceErr && <p className="lq-error lq-voice-err">{voiceErr}</p>}
        {dict.error && !dict.recording && (
          <p className="lq-muted lq-voice-err">
            Mic stopped ({dict.error}). Tap record to try again.
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="lq-empty-rows">
          {rows.map((r) => (
            <div key={r.key} className="lq-empty-row">
              <div className="lq-empty-head">
                <div className="lq-empty-names">
                  <span className="lq-empty-label">{r.label}</span>
                  {r.brewery && r.brewery !== r.label && (
                    <span className="lq-empty-brewery">{r.brewery}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="lq-keg-remove"
                  aria-label={`remove ${r.label}`}
                  onClick={() => removeRow(r.key)}
                >
                  ✕
                </button>
              </div>
              <div className="lq-band" role="group" aria-label={`How many empty ${r.label}`}>
                {AMOUNTS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    className={`lq-band-btn${r.amount === a.value ? " lq-band-on" : ""} lq-band-${a.value}`}
                    aria-pressed={r.amount === a.value}
                    onClick={() => patch(r.key, { amount: a.value })}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              {/* Optional exact count — blank is the norm, not a gap to fill. */}
              <label className="lq-empty-qty">
                <span className="lq-muted">Exact count</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="optional"
                  value={r.qty ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    patch(r.key, { qty: v === "" ? null : Math.max(1, Math.round(Number(v) || 0)) });
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="lq-brandpick">
        <input
          className="lq-brandsearch"
          type="search"
          placeholder="Search a brand or brewery…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canAddFreeText) {
              e.preventDefault();
              addFreeText(search);
            }
          }}
        />
        <div className="lq-brandgrid">
          {suggestions.map((b) => (
            <button key={b.id} type="button" className="lq-brandchip" onClick={() => addBrand(b)}>
              <span className="lq-brandchip-name">{b.name}</span>
              <span className="lq-brandchip-meta">
                {b.brewery}
                {whenPulled(b) ? ` · ${whenPulled(b)}` : ""}
              </span>
            </button>
          ))}
        </div>
        {canAddFreeText && (
          <button
            type="button"
            className="lq-btn lq-btn-ghost lq-btn-wide"
            onClick={() => addFreeText(search)}
          >
            + Add “{search.trim()}” as a new brand
          </button>
        )}
        {!needle && brands.length === 0 && (
          <p className="lq-muted lq-brand-stale">
            No tap-wall data imported yet — search finds nothing, but you can still type a brand
            and add it.
          </p>
        )}
        {/* The export is manual, so say how old it is rather than let a stale
            suggestion list quietly imply it is current. */}
        {importedAt && (
          <p className="lq-muted lq-brand-stale">
            Tap list as of {new Date(importedAt).toLocaleDateString()}.
          </p>
        )}
      </div>

      {!embedded && (
      <div className="lq-footer">
        <div className="lq-savestate">
          {save === "saving" && "Saving…"}
          {save === "saved" && "Saved ✓"}
          {save === "error" && <span className="lq-error">Save failed — will retry on submit</span>}
        </div>
        <div className="lq-footer-actions">
          <span className="lq-muted lq-count-tally">
            {rows.length} brand{rows.length === 1 ? "" : "s"}
          </span>
          <button type="button" className="lq-btn lq-btn-ghost" onClick={() => onDone?.()}>
            Exit
          </button>
          <button
            type="button"
            className="lq-btn lq-btn-primary"
            disabled={submitting || rows.length === 0}
            onClick={finish}
          >
            {submitting ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
