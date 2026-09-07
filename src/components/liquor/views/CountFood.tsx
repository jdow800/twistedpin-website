import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCount,
  extractVoice,
  getCatalog,
  getOpenCount,
  getZones,
  precheckCount,
  saveCountLines,
  setCaseSize,
  submitCount,
  type BarSkuItem,
  type BarZoneItem,
  type CountLineInput,
  type OpenCountLine,
  type PrecheckFinding,
  type VoiceExtractItem,
  type VoiceMatch,
} from "../api";
import { useVoiceDictation } from "../useRecorderDictation";

/**
 * The FOOD count — a kitchen walk, zone by zone (BUILD-SPEC §8 P1, milestone M1).
 *
 * A SIBLING of CountLiquor, not an extension of it. That screen is 1,700 lines
 * with 66 "bottle" and 59 "batch" references, a tenths keypad, a bottled-beer
 * section and ml sizes — none of which exist in a walk-in freezer. Sharing the
 * plumbing (api.ts, the dictation hook, the voice-extract route, the precheck)
 * and forking the surface was less work than generalising, and it leaves the
 * liquor screen untouched, which is what "don't break the working workflow"
 * means in practice.
 *
 * What it reuses verbatim, on purpose:
 *   · save/resume — a draft survives a reload or a dead battery mid-walk
 *   · voice → extract → REVIEW → apply, with the ambiguity rules below
 *   · the pre-submit check (§6.2), which is already section-aware server-side
 *
 * THE THREE THINGS VOICE REFUSES TO GUESS, inherited from the liquor screen
 * because each one was paid for:
 *   1. an ambiguous name → the counter picks from candidates; never auto-pick
 *   2. cases spoken with no known case size → ASK, do not multiply. Guessing
 *      is what produced 93, 27 and 1 from three case utterances on 2026-07-24
 *   3. a pre-multiplied-looking row → strand it on screen, do not add
 *
 * What is deliberately NOT here: tenths (a bag of fries is not 0.4 of a bag —
 * the unit IS the bag), size_ml, batch prep, kegs, bottled beer.
 */

const CAP_SECONDS = 90;

type Cell = {
  cases: number;
  units: number;
  /** Individual containers — the canonical number the server stores. */
  qty: number;
  caseSize: number | null;
  source: "grid" | "voice";
  raw?: string;
};
type Counts = Record<string, Record<string, Cell>>;

interface ReviewItem {
  key: string;
  spoken: string;
  cases: number;
  units: number;
  qty: number;
  unitsPerCase: number | null;
  needsCaseSize: boolean;
  suspectPreMultiplied: boolean;
  chosenSkuId: string | null;
  candidates: VoiceMatch[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "3 cases · 2 lb" — the unit word comes from the SKU, never from this file. */
function unitLabel(sku: BarSkuItem | undefined, n: number): string {
  const u = sku?.countUnit ?? "each";
  if (n === 1) return u;
  if (u === "box") return "boxes";
  if (u === "each") return "each";
  if (u === "lb" || u === "gal" || u === "bib") return u;
  return `${u}s`;
}

function cellQty(c: { cases: number; units: number; caseSize: number | null }): number {
  return round2(c.units + c.cases * (c.caseSize ?? 0));
}

function rebuild(lines: OpenCountLine[]): Counts {
  const out: Counts = {};
  for (const l of lines) {
    const zone = (out[l.zoneId] ??= {});
    const cases = Number(l.enteredCases ?? 0);
    const caseSize = l.caseSizeAtEntry == null ? null : Number(l.caseSizeAtEntry);
    const qty = Number(l.qtyUnits);
    zone[l.skuId] = {
      cases,
      caseSize,
      // Loose = whatever the stored total is beyond the case part, so a resumed
      // draft shows the counter the two numbers they actually typed.
      units: round2(qty - cases * (caseSize ?? 0)),
      qty,
      source: l.source === "voice" ? "voice" : "grid",
      raw: l.rawUtterance ?? undefined,
    };
  }
  return out;
}

function flatten(counts: Counts): CountLineInput[] {
  const out: CountLineInput[] = [];
  for (const [zoneId, cells] of Object.entries(counts)) {
    for (const [skuId, c] of Object.entries(cells)) {
      // A zero is a REAL answer — "I looked, there are none" — and is what makes
      // a bracket symmetric. Only an absent cell means nobody looked.
      out.push({
        zoneId,
        skuId,
        qtyUnits: c.qty,
        source: c.source,
        rawUtterance: c.raw,
        enteredCases: c.cases || undefined,
        caseSizeAtEntry: c.cases ? c.caseSize : undefined,
      });
    }
  }
  return out;
}

export default function CountFood({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [zones, setZones] = useState<BarZoneItem[]>([]);
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [zoneId, setZoneId] = useState<string>("");
  const [counts, setCounts] = useState<Counts>({});
  const [added, setAdded] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  /** A blocking persistence/submit failure. Lives in the FIXED footer, not in
   *  the mic toolbar at the top of the page — the counter who just tapped
   *  Finish or Submit is looking at the bottom of a long shelf list and would
   *  never scroll up to find out why nothing happened. */
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [findings, setFindings] = useState<PrecheckFinding[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const countsRef = useRef<Counts>({});
  countsRef.current = counts;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const skuById = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);
  const zone = zones.find((z) => z.id === zoneId);

  // ── boot: resume the open FOOD draft, or start one ──
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [z, cat, open] = await Promise.all([
          getZones("food"),
          getCatalog("food"),
          getOpenCount(true, "food"),
        ]);
        if (!live) return;
        setZones(z);
        setCatalog(cat);
        if (z.length === 0) {
          setErr("No food zones are set up yet — seed the catalog first.");
          setPhase("error");
          return;
        }
        setZoneId(z[0]!.id);
        if (open) {
          setSessionId(open.id);
          setCounts(rebuild(open.lines));
        } else {
          setSessionId(await createCount(true, "food"));
        }
        setPhase("ready");
      } catch {
        if (!live) return;
        setErr("Couldn't load the kitchen count.");
        setPhase("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  /** Returns whether the sheet is actually on the server. Callers that are
   *  about to CLOSE the count must check it — a swallowed failure here would
   *  submit whatever older rows happened to land, which can be none of them. */
  const doSave = useCallback(async (): Promise<boolean> => {
    const sid = sessionId;
    if (!sid) return false;
    setSave("saving");
    try {
      await saveCountLines(sid, flatten(countsRef.current));
      setSave("saved");
      setSubmitErr(null);
      return true;
    } catch {
      setSave("error");
      return false;
    }
  }, [sessionId]);

  /** Debounced, because the counter types fast and a walk-in has no signal to
   *  spare. The ref (not state) is read at fire time so a burst coalesces into
   *  one authoritative save of the WHOLE sheet. */
  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void doSave(), 900);
  }

  function writeCell(skuId: string, next: Partial<Cell> & { source?: "grid" | "voice" }) {
    setCounts((prev) => {
      const zoneCells = { ...(prev[zoneId] ?? {}) };
      const cur = zoneCells[skuId];
      const sku = skuById.get(skuId);
      const merged: Cell = {
        cases: next.cases ?? cur?.cases ?? 0,
        units: next.units ?? cur?.units ?? 0,
        // ⚠ THE EXISTING CELL'S MULTIPLIER WINS. case_size_at_entry is frozen
        // at entry by design and must never be re-read from the catalog: a
        // resumed draft whose SKU had its case size corrected in between would
        // silently rescale what the counter already wrote (2 cases × 12 = 24
        // becoming 2 × 24 = 48 on the next keystroke). The catalog is consulted
        // only for a cell that does not exist yet.
        caseSize: cur?.caseSize ?? next.caseSize ?? sku?.unitsPerCase ?? null,
        qty: 0,
        source: next.source ?? cur?.source ?? "grid",
        raw: next.raw ?? cur?.raw,
      };
      merged.qty = cellQty(merged);
      zoneCells[skuId] = merged;
      return { ...prev, [zoneId]: zoneCells };
    });
    scheduleSave();
  }

  function clearCell(skuId: string) {
    setCounts((prev) => {
      const zoneCells = { ...(prev[zoneId] ?? {}) };
      delete zoneCells[skuId];
      return { ...prev, [zoneId]: zoneCells };
    });
    scheduleSave();
  }

  /** Voice ADDS to whatever is already in the cell — two passes at one shelf
   *  should total, not overwrite. */
  function addToCell(skuId: string, cases: number, units: number, caseSize: number | null, raw: string) {
    setCounts((prev) => {
      const zoneCells = { ...(prev[zoneId] ?? {}) };
      const cur = zoneCells[skuId];
      const merged: Cell = {
        cases: round2((cur?.cases ?? 0) + cases),
        units: round2((cur?.units ?? 0) + units),
        // Same freeze as writeCell: a second voice pass at the same shelf adds
        // to the cell, it does not revalue what is already in it.
        caseSize: cur?.caseSize ?? caseSize ?? skuById.get(skuId)?.unitsPerCase ?? null,
        qty: 0,
        source: "voice",
        raw,
      };
      merged.qty = cellQty(merged);
      zoneCells[skuId] = merged;
      return { ...prev, [zoneId]: zoneCells };
    });
    scheduleSave();
  }

  // ── voice ──
  const dict = useVoiceDictation((t) => void onTranscript(t), { vocabulary: "liquor" });
  useEffect(() => {
    if (dict.recording && dict.seconds >= CAP_SECONDS) dict.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict.seconds, dict.recording]);

  async function onTranscript(transcript: string) {
    if (!transcript.trim()) return;
    setVoiceBusy(true);
    setVoiceErr(null);
    try {
      const items = await extractVoice(transcript, "food");
      setReview((prev) => [...(prev ?? []), ...toReview(items, prev?.length ?? 0)]);
    } catch (e) {
      // extractVoice deliberately re-throws the SERVER's message when it has
      // one — "Voice isn't configured" (no ANTHROPIC_API_KEY, a 503) is the
      // common case, and it is not a retry. Swallowing it left the counter
      // tapping a button that would never work, with no way to know why.
      const msg = e instanceof Error && e.message ? e.message : null;
      setVoiceErr(msg ?? "Couldn't read that back — try again, or type it in.");
    } finally {
      setVoiceBusy(false);
    }
  }

  function toReview(items: VoiceExtractItem[], offset: number): ReviewItem[] {
    return items.map((it, i) => ({
      key: `v${offset + i}`,
      spoken: it.spoken,
      cases: it.cases,
      units: it.units,
      qty: it.qty,
      unitsPerCase: it.unitsPerCase,
      needsCaseSize: it.needsCaseSize,
      suspectPreMultiplied: it.suspectPreMultiplied,
      chosenSkuId: it.match?.id ?? null,
      candidates: it.candidates,
    }));
  }

  /** The refusals. A row is only applyable once it names ONE item THAT THIS
   *  SCREEN CAN SHOW, has a case size if cases were spoken, doesn't look
   *  pre-multiplied, and carries a number above zero.
   *
   *  `skuById.has` is not belt-and-braces: the grid only renders rows it can
   *  find in the FOOD catalog, so applying a SKU outside it would save a line
   *  the counter cannot see, edit or clear — an invisible row in a submitted
   *  count. Server-side sectioning makes this rare; this makes it impossible.
   *
   *  suspectPreMultiplied is re-derived against the CURRENT case size rather
   *  than trusted from the server's first pass. When the size was unknown the
   *  server could not evaluate it (it returned false), so answering "12 per
   *  case" on a spoken "two cases, twenty-four" would otherwise turn a
   *  stranded row into an applyable 48. */
  const preMultiplied = (r: ReviewItem) => {
    const size = r.unitsPerCase ?? (r.chosenSkuId ? skuById.get(r.chosenSkuId)?.unitsPerCase : null);
    return r.cases > 0 && size != null && r.units >= size;
  };
  const applyable = (r: ReviewItem) =>
    !!r.chosenSkuId &&
    skuById.has(r.chosenSkuId) &&
    !r.needsCaseSize &&
    !preMultiplied(r) &&
    (r.units > 0 || r.cases > 0);

  function applyReview() {
    if (!review) return;
    for (const r of review) {
      if (!applyable(r)) continue;
      const caseSize = r.unitsPerCase ?? skuById.get(r.chosenSkuId!)?.unitsPerCase ?? null;
      addToCell(r.chosenSkuId!, r.cases, r.units, caseSize, r.spoken);
    }
    // Anything unresolved STAYS on screen. Silently dropping a spoken item is
    // how a shelf goes missing from a count.
    const left = review.filter((r) => !applyable(r));
    setReview(left.length ? left : null);
  }

  async function answerCaseSize(r: ReviewItem, n: number) {
    if (!r.chosenSkuId || !(n >= 2)) return;
    try {
      // Persists on the SKU as 'manual', so the ask happens once per item ever
      // and invoice learning will never overwrite it.
      await setCaseSize(r.chosenSkuId, n);
      setCatalog((prev) => prev.map((s) => (s.id === r.chosenSkuId ? { ...s, unitsPerCase: n } : s)));
      setReview((prev) =>
        (prev ?? []).map((x) =>
          x.key === r.key ? { ...x, unitsPerCase: n, needsCaseSize: false } : x,
        ),
      );
    } catch {
      setVoiceErr("Couldn't save the case size.");
    }
  }

  // ── submit ──
  async function runCheck() {
    if (!sessionId || checking || submitting) return;
    setChecking(true);
    try {
      // ⚠ FAILING OPEN ON THE CHECK IS FINE; FAILING OPEN ON PERSISTENCE IS NOT.
      // If the sheet did not reach the server there is nothing to submit, and
      // going on would close the count over a partial or empty set of rows.
      if (!(await doSave())) {
        setSubmitErr("Couldn't save the count — fix the connection, then Finish again.");
        return;
      }
      const res = await precheckCount(sessionId);
      setFindings(res.findings);
    } catch {
      // A check that cannot RUN must not block a finished walk.
      setFindings([]);
    } finally {
      setChecking(false);
    }
  }

  async function doSubmit() {
    if (!sessionId || submitting) return;
    setSubmitting(true);
    try {
      if (!(await doSave())) {
        setSubmitErr("Couldn't save the count — nothing was submitted. Try again.");
        setSubmitting(false);
        return;
      }
      setDoneCount(await submitCount(sessionId));
    } catch {
      setSubmitErr("Couldn't submit — try again.");
      setSubmitting(false);
    }
  }

  // ── derived ──
  const zoneCells = counts[zoneId] ?? {};
  const memberIds = zone?.memberSkuIds ?? [];
  const extraIds = added[zoneId] ?? [];
  const rowIds = useMemo(() => {
    const ids = [...memberIds, ...extraIds, ...Object.keys(zoneCells)];
    return [...new Set(ids)].filter((id) => skuById.has(id));
  }, [memberIds, extraIds, zoneCells, skuById]);
  const rows = useMemo(
    () =>
      rowIds
        .map((id) => skuById.get(id)!)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rowIds, skuById],
  );
  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const have = new Set(rowIds);
    return catalog
      .filter((s) => !have.has(s.id) && s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, catalog, rowIds]);

  const totalLines = Object.values(counts).reduce((a, z) => a + Object.keys(z).length, 0);
  const zonesTouched = Object.entries(counts).filter(([, z]) => Object.keys(z).length > 0).length;

  if (phase === "loading") return <div className="lq-center lq-muted">Loading the kitchen…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">{err}</p>
        <button type="button" className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  if (doneCount != null)
    return (
      <div className="lq-center">
        <p className="lq-hi">Kitchen count submitted.</p>
        <p className="lq-muted">{doneCount} lines across {zonesTouched} zones.</p>
        <button type="button" className="lq-btn" onClick={onDone}>Done</button>
      </div>
    );

  return (
    <div className="lq-fc">
      <div className="lq-fc-zonebar">
        {zones.map((z) => {
          const n = Object.keys(counts[z.id] ?? {}).length;
          return (
            <button
              key={z.id}
              type="button"
              className={`lq-fc-zonetab${z.id === zoneId ? " lq-fc-zonetab-on" : ""}`}
              onClick={() => { setZoneId(z.id); setSearch(""); }}
            >
              {z.name}
              {n > 0 && <span className="lq-fc-zonetab-n">{n}</span>}
            </button>
          );
        })}
      </div>

      {/* ── voice ── */}
      <div className="lq-fc-voicebar">
        {!dict.recording ? (
          <button type="button" className="lq-btn" onClick={() => dict.start()} disabled={voiceBusy}>
            🎙️ Talk through {zone?.name ?? "this zone"}
          </button>
        ) : (
          <button type="button" className="lq-btn lq-btn-rec" onClick={() => dict.stop()}>
            ⏹ Stop ({CAP_SECONDS - dict.seconds}s)
          </button>
        )}
        {voiceBusy && <span className="lq-muted">reading that back…</span>}
        {voiceErr && <span className="lq-error">{voiceErr}</span>}
      </div>

      {review && (
        <div className="lq-fc-rev">
          <p className="lq-fc-rev-h">
            Heard {review.length} item{review.length === 1 ? "" : "s"} — check before adding
          </p>
          {review.map((r) => {
            const sku = r.chosenSkuId ? skuById.get(r.chosenSkuId) : undefined;
            return (
              <div key={r.key} className={`lq-fc-rev-row${applyable(r) ? "" : " lq-fc-rev-row-block"}`}>
                <span className="lq-fc-rev-spoken">“{r.spoken}”</span>
                {r.candidates.length > 1 && !r.chosenSkuId && (
                  <div className="lq-fc-rev-pick">
                    <span className="lq-muted">Which one?</span>
                    {r.candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="lq-linkbtn"
                        onClick={() =>
                          setReview((prev) =>
                            (prev ?? []).map((x) => (x.key === r.key ? { ...x, chosenSkuId: c.id } : x)),
                          )
                        }
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {!r.chosenSkuId && r.candidates.length === 0 && (
                  <span className="lq-fc-rev-note">not on the sheet — add it below, then say it again</span>
                )}
                {sku && (
                  <span className="lq-fc-rev-match">
                    → {sku.name} · {r.cases > 0 ? `${r.cases} case${r.cases === 1 ? "" : "s"}` : ""}
                    {r.cases > 0 && r.units > 0 ? " + " : ""}
                    {r.units > 0 ? `${r.units} ${unitLabel(sku, r.units)}` : ""}
                  </span>
                )}
                {r.needsCaseSize && (
                  <div className="lq-fc-rev-ask">
                    <label>
                      How many {unitLabel(sku, 2)} in a case of {sku?.name ?? "this"}?
                      <input
                        type="number"
                        min={2}
                        inputMode="numeric"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void answerCaseSize(r, Number((e.target as HTMLInputElement).value));
                        }}
                        onBlur={(e) => void answerCaseSize(r, Number(e.target.value))}
                      />
                    </label>
                    <span className="lq-muted">Cases aren’t counted until this is answered.</span>
                  </div>
                )}
                {r.suspectPreMultiplied && (
                  <span className="lq-fc-rev-note">
                    That sounded like it was already multiplied out — type it in instead.
                  </span>
                )}
                <button
                  type="button"
                  className="lq-linkbtn"
                  onClick={() => setReview((prev) => {
                    const left = (prev ?? []).filter((x) => x.key !== r.key);
                    return left.length ? left : null;
                  })}
                >
                  discard
                </button>
              </div>
            );
          })}
          <div className="lq-fc-rev-actions">
            <button
              type="button"
              className="lq-btn"
              disabled={!review.some(applyable)}
              onClick={applyReview}
            >
              Add {review.filter(applyable).length} to {zone?.name}
            </button>
          </div>
        </div>
      )}

      {/* ── the grid ── */}
      <div className="lq-fc-grid">
        {rows.length === 0 && (
          <p className="lq-muted lq-fc-grid-empty">
            Nothing listed for this shelf yet — search below to add an item.
          </p>
        )}
        {rows.map((s) => {
          const c = zoneCells[s.id];
          return (
            <div key={s.id} className={`lq-fc-row${c ? " lq-fc-row-counted" : ""}`}>
              <div className="lq-fc-row-name">
                {s.name}
                {c?.source === "voice" && <span className="lq-fc-row-voice" title={c.raw}>🎙️</span>}
              </div>
              <div className="lq-fc-row-inputs">
                {s.unitsPerCase != null && (
                  <label className="lq-fc-row-box">
                    <span>cases</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={c?.cases ?? ""}
                      onChange={(e) =>
                        writeCell(s.id, { cases: Number(e.target.value) || 0, caseSize: s.unitsPerCase })
                      }
                    />
                    <span className="lq-muted">×{s.unitsPerCase}</span>
                  </label>
                )}
                <label className="lq-fc-row-box">
                  <span>{unitLabel(s, 2)}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={c?.units ?? ""}
                    onChange={(e) => writeCell(s.id, { units: Number(e.target.value) || 0 })}
                  />
                </label>
                <span className="lq-fc-row-total">{c ? `= ${c.qty}` : ""}</span>
                {c && (
                  <button type="button" className="lq-linkbtn" onClick={() => clearCell(s.id)}>
                    clear
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="lq-fc-addbox">
        <input
          type="search"
          placeholder="Add an item to this shelf…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searchHits.map((s) => (
          <button
            key={s.id}
            type="button"
            className="lq-linkbtn"
            onClick={() => {
              setAdded((prev) => ({ ...prev, [zoneId]: [...(prev[zoneId] ?? []), s.id] }));
              setSearch("");
            }}
          >
            + {s.name}
          </button>
        ))}
      </div>

      {/* ── the pre-submit check ── */}
      {findings != null && (
        <div className="lq-fc-rev">
          <p className="lq-fc-rev-h">
            {findings.length === 0
              ? "Nothing looks off. Ready to submit."
              : `${findings.length} thing${findings.length === 1 ? "" : "s"} worth a second look`}
          </p>
          {findings.map((f, i) => (
            <div key={i} className="lq-fc-rev-row">
              <span className="lq-fc-rev-spoken">{f.name}</span>
              <span className="lq-fc-rev-note">{f.detail}</span>
            </div>
          ))}
          <div className="lq-fc-rev-actions">
            <button type="button" className="lq-btn" disabled={submitting} onClick={() => void doSubmit()}>
              {submitting ? "Submitting…" : "Submit the count"}
            </button>
            <button type="button" className="lq-linkbtn" onClick={() => setFindings(null)}>
              keep counting
            </button>
          </div>
        </div>
      )}

      <div className="lq-footer">
        <div className={`lq-savestate${submitErr || save === "error" ? " lq-fc-saveerr" : ""}`}>
          {submitErr ??
            (save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "not saved" : "")}
        </div>
        <div className="lq-footer-actions">
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>Home</button>
          <button
            type="button"
            className="lq-btn"
            disabled={checking || submitting || totalLines === 0}
            onClick={() => void runCheck()}
          >
            {checking ? "Checking…" : `Finish (${totalLines})`}
          </button>
        </div>
      </div>
    </div>
  );
}
