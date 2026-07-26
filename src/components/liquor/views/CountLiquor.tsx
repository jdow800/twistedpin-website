import { useEffect, useMemo, useRef, useState } from "react";
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
  BarApiError,
  type BarSkuItem,
  type BarZoneItem,
  type CountLineInput,
  type OpenCountLine,
  type PrecheckFinding,
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

/** Emoji marker for the handful of things on a "liquor" count that AREN'T a
 *  bottle of liquor — Luxardo cherries, Angostura, Red Bull, ginger beer, the
 *  canned cocktails. 14 of 115 SKUs today.
 *
 *  The rule is the whole point: a marker appears IF AND ONLY IF the item is not
 *  a bottle. That makes it self-documenting with no legend — an emoji on the row
 *  means "don't count this in tenths, count whole units" — and it stays
 *  meaningful precisely because 101 rows don't have one. Marking everything
 *  would mark nothing.
 *
 *  Keyed on CATEGORY rather than per-SKU so a new mixer inherits it for free.
 *  sizeMl == null is the gate: it correlates 1:1 with count_unit 'each' /
 *  tracking_mode 'stock_count' across the whole live catalog, so a bottle can
 *  never pick one up by accident. 📦 backs up an unmapped category, because the
 *  not-a-bottle signal disappearing is worse than a generic marker. */
const NON_BOTTLE_EMOJI: Record<string, string> = {
  Garnish: "🍒",
  Bitters: "🌿",
  Mixers: "🥤",
  "Energy Drinks": "🐂", // Red Bull. Yes, really.
  "Canned Cocktails": "🥫",
};
function nonBottleEmoji(s: { sizeMl: number | null; category: string | null }): string | null {
  if (s.sizeMl != null) return null;
  return (s.category ? NON_BOTTLE_EMOJI[s.category] : null) ?? "📦";
}
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
  // Pre-submit review: uncounted zones (client-side) + flagged bottles (server).
  const [confirmSubmit, setConfirmSubmit] = useState<{ zones: string[]; findings: PrecheckFinding[]; truncated: number } | null>(null);
  const [checking, setChecking] = useState(false);

  // voice
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  // "+ case size" on a grid row. Keyed "<where>:<skuId>" — a bottle can be on
  // screen twice at once (search result AND counted row), and a bare skuId
  // would open both editors with two inputs fighting over autoFocus.
  const [caseAsk, setCaseAsk] = useState<string | null>(null);
  // A STRING, so backspacing to empty renders empty instead of snapping to "0"
  // — the leading-zero problem the qty boxes already had to be fixed for.
  const [caseAskVal, setCaseAskVal] = useState("");
  const [caseAskBusy, setCaseAskBusy] = useState(false);
  const [caseAskErr, setCaseAskErr] = useState<{ skuId: string; msg: string } | null>(null);
  // Review-sheet case-size error, rendered inside the sheet (see answerCaseSize).
  const [caseErr, setCaseErr] = useState<{ idx: number; msg: string } | null>(null);
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
    // An empty list is SENT, not skipped — it is how "I removed the last
    // bottle" reaches the server. Skipping it left the deleted rows alive.
    const lines = flatten(countsRef.current);
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
      // A cell that ALREADY EXISTS survives at 0 rather than being deleted.
      // Deleting unmounted the input mid-edit, which closed the Android
      // keyboard — so backspacing the field to type "0.8" destroyed the row
      // before the decimal could be typed, on the one surface the counter is
      // told to use for corrections and for exactly that fractional case.
      // Removal is the explicit ✕ (clearCell), not an empty field.
      // It also records a real distinction: 0 means "I looked, none here",
      // where an absent row means "I never looked".
      if (qty <= 0 && !cur) delete zone[skuId];
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
    const cases = Math.max(0, roundQty(casesRaw));
    setCounts((prev) => {
      const zone = { ...(prev[zoneId] ?? {}) };
      const cur = zone[skuId];
      // A size ALREADY stamped on this cell wins over the catalog's current
      // value. Reading the catalog here would rescale a line entered earlier
      // under a different case size — e.g. resume a draft entered at 2x12,
      // correct the SKU to 24, touch the box, and 24 becomes 48 silently.
      const caseSize = cur?.caseSize ?? skuById.get(skuId)?.unitsPerCase ?? null;
      if (caseSize == null) return prev; // no size → the row shows "+ case size" instead of this box
      const prevFromCases = (cur?.cases ?? 0) * (cur?.caseSize ?? 0);
      const loose = Math.max(0, roundQty((cur?.qty ?? 0) - prevFromCases));
      const qty = roundQty(cases * caseSize + loose);
      // Same rule as setQty: an existing cell survives at 0 so backspacing the
      // case box doesn't unmount the input mid-edit. ✕ is the way to remove.
      if (qty <= 0 && !cur) delete zone[skuId];
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
      // SAME FREEZE RULE AS setCases: a size already stamped on this cell wins
      // over whatever the incoming delta carries. This used to read
      // `delta.caseSize ?? cur?.caseSize`, which silently rescaled bottles that
      // were already counted — because line 3 below re-multiplies the SUMMED
      // cases at whichever size wins. Enter 2 cases of Tito's at 12 (=24), let
      // the catalog learn 24 from an invoice, then say "two more cases": cases
      // becomes 4, and 4 x 24 = 96 is stored where the truth is 72. The DB
      // CHECK passes (96 >= 4x24) and the count detail reads "4 cs x 24", so
      // nothing anywhere shows the first 24 bottles were re-priced.
      const caseSize = cur?.caseSize ?? delta.caseSize ?? null;
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

  /** THE one path that learns a case size. Both surfaces that can teach us a
   *  case size — the voice review sheet and the "+ case size" button on a grid
   *  row — go through here, so the re-resolve below cannot be implemented on
   *  one and forgotten on the other.
   *
   *  Persists to the SKU (asked once, ever), updates the local catalog, and
   *  re-resolves EVERY pending review row for that bottle, not just the one
   *  that asked — a long dictation can name it more than once.
   *
   *  Deliberately does NOT touch `counts`. A cell that already stamped a case
   *  size keeps it (setCases and addQty both freeze); a cell with no cases
   *  carries no stamp and correctly picks the new size up on its next touch.
   *
   *  Never throws. Returns a message to show the counter, or null on success. */
  async function persistCaseSize(skuId: string, unitsPerCase: number): Promise<string | null> {
    // Mirror the server's zod (int, 2..500) exactly. A bare `< 2` check lets
    // 2.5 and 600 through to a 400 whose message is "PATCH … failed (400)".
    if (!Number.isInteger(unitsPerCase) || unitsPerCase < 2 || unitsPerCase > 500)
      return "Whole number, 2 to 500.";
    try {
      await setCaseSize(skuId, unitsPerCase);
    } catch (e) {
      if (e instanceof BarApiError && e.status === 400) return "Whole number, 2 to 500.";
      return "Couldn't save that case size — try again.";
    }
    setCatalog((prev) => prev.map((s) => (s.id === skuId ? { ...s, unitsPerCase } : s)));
    // A pending row holding `cases: 4` still has qty = units. Miss this and
    // four cases silently become ZERO.
    setReview((r) =>
      r
        ? r.map((x) =>
            x.chosenSkuId === skuId && x.needsCaseSize
              ? {
                  ...x,
                  unitsPerCase,
                  needsCaseSize: false,
                  qty: roundQty(x.cases * unitsPerCase + x.units),
                  // And re-arm the pre-multiply guard, for the same reason
                  // onPick has to. The server can only set that flag when it
                  // ALREADY knows the case size (cases > 0 && ups != null &&
                  // units >= ups), so on a needs_case row it is always false —
                  // which made the guard structurally unreachable on every
                  // bottle whose case size we don't know, i.e. exactly the
                  // population this ask-flow exists for. "Four cases of Tito's"
                  // heard as {cases: 4, units: 48} answers "12 per case" and
                  // applies as 4 x 12 + 48 = 96, double the truth.
                  suspectPreMultiplied: x.cases > 0 && x.units >= unitsPerCase,
                }
              : x,
          )
        : r,
    );
    return null;
  }

  /** Review-sheet caller. Errors render INSIDE the sheet — voiceErr paints in
   *  page content, underneath the sheet's own scrim, so a failure there was
   *  indistinguishable from the button doing nothing. */
  async function answerCaseSize(idx: number, unitsPerCase: number) {
    const skuId = review?.[idx]?.chosenSkuId;
    if (!skuId) return;
    const msg = await persistCaseSize(skuId, unitsPerCase);
    setCaseErr(msg ? { idx, msg } : null);
  }

  /** Grid caller — the "+ case size" button on a row whose bottle has none. */
  async function submitCaseAsk(skuId: string) {
    setCaseAskBusy(true);
    setCaseAskErr(null);
    const msg = await persistCaseSize(skuId, Number(caseAskVal));
    setCaseAskBusy(false);
    if (msg) {
      setCaseAskErr({ skuId, msg });
      return;
    }
    setCaseAsk(null);
    setCaseAskVal("");
  }

  /** The slot a row gets when its bottle's case size is UNKNOWN — the same
   *  wrapped full-width line CaseBox occupies once we know it, so learning a
   *  size mid-count swaps a link for the real box with no layout shift under
   *  the counter's thumb.
   *
   *  ADD-ONLY BY CONSTRUCTION: this renders only where there is no case size,
   *  so it can only ever write null → N. It is never an editor for an existing
   *  value, which is what keeps a catalog change from being able to disagree
   *  with a cell that already stamped its own size.
   *
   *  A plain function, not a <Component> — React reconciles it by position, so
   *  autoFocus fires once on the input's real mount rather than on every
   *  keystroke's re-render. */
  function renderCaseAsk(askKey: string, skuId: string) {
    const err = caseAskErr?.skuId === skuId ? caseAskErr.msg : null;
    if (caseAsk !== askKey)
      return (
        <div className="lq-casebox lq-caseask">
          <button
            type="button"
            className="lq-linkbtn lq-caseask-open"
            onClick={() => {
              setCaseAsk(askKey);
              setCaseAskVal("");
              setCaseAskErr(null);
            }}
          >
            + case size
          </button>
          {err && <span className="lq-caseask-err">{err}</span>}
        </div>
      );
    const n = Number(caseAskVal);
    const valid = caseAskVal.trim() !== "" && Number.isInteger(n) && n >= 2 && n <= 500;
    return (
      <div className="lq-casebox lq-caseask">
        <input
          className="lq-case-input"
          type="number"
          inputMode="numeric"
          step="1"
          min={2}
          placeholder="12"
          aria-label="bottles per case"
          autoFocus
          value={caseAskVal}
          onChange={(e) => {
            setCaseAskVal(e.target.value);
            setCaseAskErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !caseAskBusy) void submitCaseAsk(skuId);
          }}
        />
        {/* The number rides ON the button. A case size is sticky once set —
            invoices deliberately never overwrite a hand-entered one — so
            confirm the NUMBER, not just the intent. */}
        <button
          type="button"
          className="lq-chip"
          disabled={!valid || caseAskBusy}
          onClick={() => void submitCaseAsk(skuId)}
        >
          {caseAskBusy ? "Saving…" : valid ? `Save ${n}/case` : "Save"}
        </button>
        <button
          type="button"
          className="lq-linkbtn lq-caseask-open"
          onClick={() => {
            setCaseAsk(null);
            setCaseAskErr(null);
          }}
        >
          Cancel
        </button>
        {err && <span className="lq-caseask-err">{err}</span>}
      </div>
    );
  }

  /** A row can only be applied once it's matched to a bottle AND its quantity
   *  is unambiguous. An unanswered case size or a suspected pre-multiply keeps
   *  the row on screen rather than letting a guessed number through — that
   *  silent path is exactly what produced 93, 27 and 1 on 2026-07-24. */
  //  The qty > 0 clause is load-bearing alongside onResolve clearing
  //  needsCaseSize: without it, backspacing that box to empty makes a blocked
  //  row applyable at ZERO, and applyReview drops applied rows — so a spoken
  //  "four cases of Tito's" would vanish off the sheet having recorded nothing.
  //  A zeroed row stays on screen instead, where the counter can see it.
  const applyable = (r: ReviewItem) =>
    !!r.chosenSkuId && !r.needsCaseSize && !r.suspectPreMultiplied && r.qty > 0;

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
  /** The last moment anything can be fixed. The variance report is computed once
   *  ~30s after submit and can never be regenerated, so every check has to
   *  happen HERE — after that, a wrong number is permanent for the period. */
  async function tryFinish() {
    if (!sessionId || submitting || checking) return;
    const uncounted = zones.filter((z) => Object.keys(counts[z.id] ?? {}).length === 0).map((z) => z.name);
    setChecking(true);
    let findings: PrecheckFinding[] = [];
    let truncated = 0;
    try {
      // Flush FIRST — the check runs server-side against saved lines, so an
      // unsaved last edit would be checked in its old form.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveCountLines(sessionId, flatten(countsRef.current));
      setSave("saved");
      const res = await precheckCount(sessionId);
      findings = res.findings;
      truncated = res.truncated ?? 0;
    } catch {
      // A sanity check must never be able to prevent closing out a count. If it
      // fails we fall through to the zone confirmation exactly as before.
      findings = [];
    } finally {
      setChecking(false);
    }
    if (uncounted.length > 0 || findings.length > 0) {
      setConfirmSubmit({ zones: uncounted, findings, truncated });
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
              // Close any open "+ case size" editor — otherwise one left open
              // on Tito's in Back Bar reappears open on Tito's in Well.
              onClick={() => { setZoneId(z.id); setCaseAsk(null); setCaseAskErr(null); }}
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
            const emoji = nonBottleEmoji(s);
            return (
              <div key={s.id} className={`lq-row${qty > 0 ? " lq-row-set" : ""}`}>
                <div className="lq-row-name">
                  <span className="lq-name">
                    {emoji && (
                      <span className="lq-kind-tag" title="counted in whole units, not tenths" aria-hidden="true">
                        {emoji}{" "}
                      </span>
                    )}
                    {s.name}
                  </span>
                  <span className="lq-size">{sizeLabel(s)}</span>
                </div>
                {/* Cell-first, exactly like the captured row and like setCases
                    itself. Reading the catalog alone would label a resumed
                    2x12 row "cs ×24" after the catalog learned 24, while the
                    math correctly stayed at 12 — a label that lies. */}
                {(cell?.caseSize ?? s.unitsPerCase) != null ? (
                  <CaseBox
                    cases={cell?.cases ?? 0}
                    caseSize={(cell?.caseSize ?? s.unitsPerCase)!}
                    onChange={(n) => setCases(s.id, n)}
                  />
                ) : (
                  renderCaseAsk(`s:${s.id}`, s.id)
                )}
                <div className="lq-stepper">
                  <button type="button" className="lq-step" aria-label={`decrease ${s.name}`} onClick={() => setQty(s.id, roundQty(loose - 1))}>−</button>
                  {/* A can or a jar has no tenths. Whole-number step + a numeric
                      keypad on non-bottles removes the "2.3 Red Bulls" typo
                      outright, rather than catching it downstream. */}
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
                {(cell?.cases ?? 0) > 0 && <span className="lq-case-sum">= {qty} each</span>}
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
            const sku = skuById.get(skuId);
            const emoji = sku ? nonBottleEmoji(sku) : null;
            return (
            <div key={skuId} className="lq-row lq-row-set">
              <div className="lq-row-name">
                <span className="lq-name">
                  {cell.source === "voice" && <span className="lq-voice-tag" title="added by voice" aria-hidden="true">🎤 </span>}
                  {emoji && (
                    <span className="lq-kind-tag" title="counted in whole units, not tenths" aria-hidden="true">
                      {emoji}{" "}
                    </span>
                  )}
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
              {caseSize != null ? (
                <CaseBox cases={cell.cases ?? 0} caseSize={caseSize} onChange={(n) => setCases(skuId, n)} />
              ) : (
                renderCaseAsk(`c:${skuId}`, skuId)
              )}
              <div className="lq-stepper">
                <button type="button" className="lq-step" aria-label="decrease" onClick={() => setQty(skuId, roundQty(loose - 1))}>−</button>
                <input
                  className="lq-qty-input"
                  type="number"
                  // Non-bottles step in whole units — no tenths of a can.
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  // Render 0 as EMPTY, not "0". A literal zero sitting in the
                  // box means tapping in and typing 3 gives "03" — the value
                  // parses to 3, but it reads broken and invites a backspace
                  // war on a phone. The placeholder carries the meaning.
                  value={loose || ""}
                  placeholder="0"
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
          <button
            type="button"
            className="lq-btn lq-btn-primary"
            disabled={submitting || checking || enteredTotal === 0}
            onClick={() => void tryFinish()}
          >
            {submitting ? "Submitting…" : checking ? "Checking…" : "Finish & submit"}
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
                  onResolve={(res) =>
                    setReview((r) =>
                      r &&
                      r.map((x, i) => {
                        if (i !== idx) return x;
                        const ups = x.unitsPerCase ?? 0;
                        // The human has now stated the quantity explicitly, so
                        // the model's cases/units are superseded and the
                        // pre-multiply suspicion is answered — clearing the flag
                        // is what makes the row applyable again.
                        return {
                          ...x,
                          cases: res.cases,
                          units: res.units,
                          qty: roundQty(res.cases * ups + res.units),
                          suspectPreMultiplied: false,
                          // A row with no cases cannot need a case size — that
                          // is the server's own rule (cases > 0 && ups == null).
                          // Without this, typing an each-count to escape the
                          // "how many in a case?" prompt zeroed cases but left
                          // the row needing a size forever: permanently
                          // un-applyable, still showing the prompt, and the only
                          // exit was ✕ — which drops the bottle from the count.
                          needsCaseSize: res.cases > 0 ? x.needsCaseSize : false,
                        };
                      }),
                    )
                  }
                  onPick={(skuId) =>
                    setReview((r) =>
                      r &&
                      r.map((x, i) => {
                        if (i !== idx) return x;
                        // Re-evaluate the case size against the bottle just
                        // chosen. Without this, a row that spoke cases resolves
                        // with unitsPerCase still null: needsCaseSize stays
                        // false-y, cases get multiplied by 0, and "four cases"
                        // silently becomes ZERO. The whole point of picking the
                        // bottle is that we now know its case size.
                        const ups = skuById.get(skuId)?.unitsPerCase ?? null;
                        return {
                          ...x,
                          chosenSkuId: skuId,
                          assignOpen: false,
                          unitsPerCase: ups,
                          needsCaseSize: x.cases > 0 && ups == null,
                          qty: roundQty(x.cases * (ups ?? 0) + x.units),
                          // The pre-multiply guard has to be recomputed here for
                          // the same reason the case size is. The server decides
                          // it with `cases > 0 && ups != null && units >= ups`
                          // (admin/bar.ts) — but on an AMBIGUOUS row there is no
                          // SKU yet, so ups is null and the flag comes back
                          // false no matter what was said. "Four cases of
                          // Bulleit" heard as {cases: 4, units: 96} then picks
                          // Bulleit Bourbon (24/case) and resolves to
                          // 4 x 24 + 96 = 192, when 96 IS the multiplied-out
                          // number and the truth is 96. The one guard built to
                          // catch exactly that never fired, because it was
                          // evaluated before we knew which bottle it was.
                          suspectPreMultiplied: x.cases > 0 && ups != null && x.units >= ups,
                        };
                      }),
                    )
                  }
                  onToggleAssign={() => setReview((r) => r && r.map((x, i) => (i === idx ? { ...x, assignOpen: !x.assignOpen } : x)))}
                  // Indices shift on removal, so a stale error would re-attach
                  // itself to whichever row slid into this slot.
                  onRemove={() => { setCaseErr(null); setReview((r) => (r && r.length > 1 ? r.filter((_, i) => i !== idx) : null)); }}
                  onCaseSize={(n) => void answerCaseSize(idx, n)}
                  caseErr={caseErr?.idx === idx ? caseErr.msg : null}
                />
              ))}
            </div>
            <div className="lq-sheet-foot">
              <button type="button" className="lq-btn lq-btn-ghost" onClick={() => { setReview(null); setCaseErr(null); }}>Discard</button>
              <button type="button" className="lq-btn lq-btn-primary" disabled={reviewResolved === 0} onClick={applyReview}>
                Add {reviewResolved} to {zones.find((z) => z.id === zoneId)?.name ?? "zone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* pre-submit review: uncounted zones + flagged bottles */}
      {confirmSubmit && (
        <div className="lq-sheet" role="dialog" aria-label="Before you submit">
          <div className="lq-sheet-panel lq-confirm">
            <div className="lq-sheet-head">
              <h3 className="lq-h2">
                {confirmSubmit.findings.length > 0 ? "Double-check these first?" : "Submit an incomplete count?"}
              </h3>
              <p className="lq-muted">
                {confirmSubmit.zones.length > 0 && (
                  <>
                    No bottles counted in: <strong>{confirmSubmit.zones.join(", ")}</strong>.{" "}
                  </>
                )}
                Submitting closes this count out — you can't add to it after.
              </p>
            </div>
            {confirmSubmit.findings.length > 0 && (
              <div className="lq-precheck">
                {confirmSubmit.findings.map((f) => (
                  <div key={f.skuId} className="lq-precheck-row">
                    <span className="lq-precheck-name">{f.name}</span>
                    <span className="lq-precheck-detail">{f.detail}</span>
                    {/* NEVER "recount this". An impossible number and an unscanned
                        delivery produce the identical symptom, and only one of
                        them is the counter's mistake — telling him to recount
                        invites him to bend a CORRECT number until the warning
                        clears, which corrupts good data with confident-looking
                        advice. Name both causes; let him decide. */}
                    <span className="lq-precheck-why">
                      {f.kind === "impossible" &&
                        (f.unitsPerCase
                          ? `Either the count is off — cases vs bottles? ${f.unitsPerCase} per case — or a delivery hasn't been scanned.`
                          : "Either the count is off, or a delivery hasn't been scanned.")}
                      {f.kind === "not_counted" && "Still on the shelf, or gone? A missing line drops it out of the report entirely — a zero counts, nothing doesn't."}
                      {f.kind === "overuse" && "That's a lot to pour in one period. Worth a second look, unless it really moved."}
                    </span>
                  </div>
                ))}
                {confirmSubmit.truncated > 0 && (
                  <p className="lq-precheck-more">+ {confirmSubmit.truncated} more not shown.</p>
                )}
              </div>
            )}
            <div className="lq-sheet-foot">
              <button type="button" className="lq-btn lq-btn-ghost" onClick={() => setConfirmSubmit(null)}>
                Go back
              </button>
              {/* Always dismissible. The check is advice, not a gate — if the
                  count is right and an invoice is simply missing, forcing a
                  change here would be the worst outcome available. */}
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
  onResolve,
  onPick,
  onToggleAssign,
  onRemove,
  onCaseSize,
  caseErr,
}: {
  item: ReviewItem;
  catalog: BarSkuItem[];
  /** Set this row's quantity EXPLICITLY. Must carry cases and units, not a
   *  single total — applyReview reads those two fields, so a handler that only
   *  set `qty` would render a corrected number and then apply the old one. */
  onResolve: (res: { cases: number; units: number }) => void;
  onPick: (skuId: string) => void;
  onToggleAssign: () => void;
  onRemove: () => void;
  onCaseSize: (n: number) => void;
  /** Rendered INSIDE the sheet. The old path reported through voiceErr, which
   *  paints in page content — underneath this sheet's own fixed scrim — so a
   *  rejected save looked exactly like the button doing nothing. */
  caseErr: string | null;
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
  // IDENTIFY THE BOTTLE FIRST. needs_case used to outrank everything, so
  // "four cases of Bulleit" (Bourbon and 95 Rye both in the catalog) showed
  // "how many in a case?" with no way to say WHICH Bulleit — and the Save
  // button silently did nothing, because answering a case size requires a
  // chosen SKU. The row became a dead end whose only exit was deleting it,
  // which drops that bottle from the count entirely.
  const state: "needs_case" | "suspect" | "matched" | "ambiguous" | "unmatched" = !item.chosenSkuId
    ? item.candidates.length > 0
      ? "ambiguous"
      : "unmatched"
    : item.needsCaseSize
      ? "needs_case"
      : item.suspectPreMultiplied
        ? "suspect"
        : "matched";

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
            // Empty rather than "0" — see the captured-row input. This is the
            // correction surface, so a stray leading zero is worst here.
            value={item.qty || ""}
            placeholder="0"
            // A typed number is a plain each-count and REPLACES whatever the
            // model heard — cases go to 0 so cases x size can't be added on top.
            onChange={(e) => onResolve({ cases: 0, units: Math.max(0, Number(e.target.value)) })}
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
              // Mirror the server's zod (int, 2..500). A bare `< 2` let 2.5 and
              // 600 through to a 400 that used to render where nobody saw it.
              disabled={
                !(
                  caseAnswer.trim() !== "" &&
                  Number.isInteger(Number(caseAnswer)) &&
                  Number(caseAnswer) >= 2 &&
                  Number(caseAnswer) <= 500
                )
              }
              onClick={() => onCaseSize(Number(caseAnswer))}
            >
              Save
            </button>
          </div>
          {caseErr && <span className="lq-error lq-rev-hint">{caseErr}</span>}
        </div>
      )}

      {/* The model was told never to multiply cases out and appears to have
          done it anyway. Adding both readings would double; make a human pick. */}
      {state === "suspect" && (
        <div className="lq-rev-choices">
          <span className="lq-error lq-rev-hint">
            Heard {item.cases} case{item.cases === 1 ? "" : "s"} AND {item.units} each — which did you mean?
          </span>
          {/* Keep the case provenance on the "cases" branch so the count detail
              can still show "4 cs x 24"; the "each" branch is loose by definition. */}
          <button type="button" className="lq-chip" onClick={() => onResolve({ cases: item.cases, units: 0 })}>
            {item.cases} case{item.cases === 1 ? "" : "s"} ({item.cases * (item.unitsPerCase ?? 0)})
          </button>
          <button type="button" className="lq-chip" onClick={() => onResolve({ cases: 0, units: item.units })}>
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
    // Zeros are RESTORED, not dropped. `flatten` sends a 0 row, so the server
    // stores it — but dropping it here meant the next autosave omitted it and
    // the PUT's "delete everything not in the payload" quietly removed it. A
    // deliberate 0 is a real answer ("I looked, there are none"), and it is a
    // gradeable data point; an ABSENT row is an exclusion — the bottle goes
    // not_in_end, falls out of cleanForRollup, and leaves the grade and both
    // leader lists entirely. On a full-venue count, "we're out of X" is exactly
    // the kind of thing that gets discovered.
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
