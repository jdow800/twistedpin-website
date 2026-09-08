import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCount,
  extractVoice,
  getCatalog,
  getOpenCount,
  getZones,
  precheckCount,
  setSkuActive,
  setSkuZone,
  saveCountLines,
  setCaseSize,
  submitCount,
  type BarSkuItem,
  type BarZoneItem,
  type CountLineInput,
  type OpenCountLine,
  type PrecheckFinding,
  type RetiringSku,
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

/**
 * Hard stop, matching the liquor screen (240s) rather than the 90s this
 * shipped with — that number carried no comment, and a food shelf is not
 * smaller than a liquor one. Fryer Line is 41 SKUs.
 *
 * ⚠ THE RECORDER IS NOT LIMITED BY THIS. useRecorderDictation ROTATES the
 * MediaRecorder every ~60s on the same never-released stream and joins the
 * transcripts in order, so length is not a technical constraint. This is a
 * safety rail on how much work a single failed clip can lose.
 *
 * And each recording ADDS to the zone — bursts accumulate, they never
 * replace. Stopping and starting again costs nothing but a breath.
 */
const CAP_SECONDS = 240;
/** "Wrap up" warning, the same 30s of runway the liquor screen gives. */
const WARN_SECONDS = 210;

type Cell = {
  /**
   * ⚠ null means the BOX IS BLANK. 0 means the counter typed a zero.
   *
   * They were the same number here, and that was a real bug: with cases
   * explicitly 0 and units 2, erasing units read "cases is falsy, so both
   * boxes are empty" and deleted the whole cell — destroying an answer the
   * counter had actually given. Blankness has to be representable.
   */
  cases: number | null;
  units: number | null;
  /** Individual containers — the canonical number the server stores. */
  qty: number;
  caseSize: number | null;
  source: "grid" | "voice";
  raw?: string;
  /**
   * The counter SAID there are none here, rather than leaving it blank.
   *
   * An absent cell means nobody looked; a stored 0 means somebody looked and
   * found nothing. The bracket reads those differently, so blanking a box
   * must not manufacture the second one. Only this flag (or a saved 0 line
   * being resumed) keeps a zero alive.
   */
  none?: boolean;
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
/**
 * Opsi's names are inverted for sorting — "Cup, Clear, Plastic 12Oz",
 * "Plate, Oval, Velvet Paper, Black". Read down a shelf list on a phone and
 * every row starts with a different noun buried at a different depth.
 *
 * Split on the FIRST comma and weight the head: **Cup** · Clear, Plastic 12Oz.
 * DISPLAY ONLY — the stored name is untouched and stays in the title, because
 * the name is the identity the invoice matcher and the voice extractor key on.
 * Never "tidy" it into the database.
 */
export function splitDisplayName(name: string): [string, string | null] {
  const i = name.indexOf(", ");
  return i < 0 ? [name, null] : [name.slice(0, i), name.slice(i + 2)];
}

function unitLabel(sku: BarSkuItem | undefined, n: number): string {
  const u = sku?.countUnit ?? "each";
  if (n === 1) return u;
  if (u === "box") return "boxes";
  if (u === "each") return "each";
  if (u === "lb" || u === "gal" || u === "bib") return u;
  return `${u}s`;
}

/** m:ss, so three minutes reads as 3:00 rather than 180. */
function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function cellQty(c: { cases: number | null; units: number | null; caseSize: number | null }): number {
  return round2((c.units ?? 0) + (c.cases ?? 0) * (c.caseSize ?? 0));
}

function rebuild(lines: OpenCountLine[]): Counts {
  const out: Counts = {};
  for (const l of lines) {
    const zone = (out[l.zoneId] ??= {});
    const cases = l.enteredCases == null ? null : Number(l.enteredCases);
    const caseSize = l.caseSizeAtEntry == null ? null : Number(l.caseSizeAtEntry);
    const qty = Number(l.qtyUnits);
    zone[l.skuId] = {
      cases,
      caseSize,
      // Loose = whatever the stored total is beyond the case part, so a resumed
      // draft shows the counter the two numbers they actually typed.
      units: round2(qty - (cases ?? 0) * (caseSize ?? 0)),
      // A saved 0 was explicit when it was written; resuming must not
      // quietly downgrade it to "never answered".
      none: qty === 0,
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
  /** The shelf list is one tap wide on a phone, so the zone strip is a header
   *  with prev/next rather than a horizontal scroller — 10 shelves put 838px
   *  of tabs off-screen at 390px wide, and the counter could not see which
   *  shelf they were on, let alone how far through the walk. */
  const [zonePicker, setZonePicker] = useState(false);
  const [checking, setChecking] = useState(false);
  const [findings, setFindings] = useState<PrecheckFinding[] | null>(null);
  // Answers to the "you counted this somewhere new" questions, keyed
  // sku:zone. Local only — "just this count" writes NOTHING anywhere, which
  // is the whole point of offering it.
  const [locAnswer, setLocAnswer] = useState<Record<string, "added" | "kept">>({});
  // What this walk WAS. Asked at Finish, because that is when the counter
  // knows. Defaults to a trial: a shakedown of a few zones is the common
  // case early on, and the expensive mistake runs the other way — a partial
  // walk recorded as a full count becomes the bracket baseline and every
  // unwalked zone reads as stock that vanished.
  const [fullCount, setFullCount] = useState(false);
  // Answers to "you didn't count these", keyed by sku.
  const [missedAnswer, setMissedAnswer] = useState<Record<string, "archived" | "counting">>({});
  // Products that look like we have stopped carrying them. Kept apart from
  // `findings` for the reason in api.ts: the money sort buries exactly the
  // ones that are most certainly dead.
  const [retiring, setRetiring] = useState<RetiringSku[]>([]);
  // §11.27's failsafe, and deliberately the WHOLE of it: a reminder, not a
  // gate. Purchases now date by the invoice, so one that has not been
  // scanned yet is simply missing from the bracket this count opens. The
  // ruling was explicit that this must not block Submit and must not ask a
  // question the counter cannot answer holding a phone in a walk-in.
  const [scanNote, setScanNote] = useState(true);
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

  // The soft keyboard shrinks the VISUAL viewport, not the layout viewport, so
  // this is the event that says "half the screen just went away". Re-centre the
  // row being typed into; without it the box slides behind the fixed footer.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Read document.activeElement at resize time rather than tracking focus in
    // a ref: whatever the counter is typing into RIGHT NOW is what has to stay
    // visible, and that is one fewer thing to keep in sync.
    // `behavior: auto` on purpose — a smooth scroll races the keyboard's own
    // animation and the box visibly drifts.
    const recentre = () => {
      const el = document.activeElement;
      if (!el || el.tagName !== "INPUT") return;
      el.closest(".lq-fc-row")?.scrollIntoView({ block: "center", behavior: "auto" });
    };
    vv.addEventListener("resize", recentre);
    return () => vv.removeEventListener("resize", recentre);
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
        cases: next.cases !== undefined ? next.cases : (cur?.cases ?? null),
        units: next.units !== undefined ? next.units : (cur?.units ?? null),
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
        none: next.none ?? cur?.none,
      };
      merged.qty = cellQty(merged);
      zoneCells[skuId] = merged;
      return { ...prev, [zoneId]: zoneCells };
    });
    scheduleSave();
  }

  /**
   * A number box changed.
   *
   * ⚠ EMPTY IS NOT ZERO. Backspacing a box back to blank means "I have not
   * answered", and an unanswered item must stay UNCOUNTED. An absent row
   * means nobody looked; a stored 0 means somebody looked and found none.
   * The bracket reads them differently, so the screen must not turn a
   * change of mind into a counted zero.
   *
   * Typing a literal 0 still records a zero — that is explicit input. So
   * does the "none here" button. Only a cell that ends up blank on BOTH
   * boxes, with no explicit zero behind it, is dropped.
   */
  function editBox(
    skuId: string,
    field: "cases" | "units",
    raw: string,
    caseSize: number | null,
  ) {
    const cur = (counts[zoneId] ?? {})[skuId];
    const n = Number(raw);
    // null = blank. NOT 0 — see the Cell type.
    const value = raw === "" || Number.isNaN(n) ? null : n;
    const other = field === "cases" ? (cur?.units ?? null) : (cur?.cases ?? null);
    // The cell disappears only when BOTH boxes are genuinely blank and no
    // "none here" is standing behind it. An explicit 0 in the other box is an
    // ANSWER and keeps the cell alive.
    if (value === null && other === null && !cur?.none) {
      clearCell(skuId);
      return;
    }
    // Typing anything — including a literal 0 — is the counter answering, so
    // it supersedes an earlier "none here". Erasing does not.
    const none = value === null ? cur?.none : false;
    writeCell(
      skuId,
      field === "cases" ? { cases: value, caseSize, none } : { units: value, none },
    );
  }

  /** "I looked at this shelf and there are none." The one way, besides
   *  typing a 0, that a zero legitimately gets recorded. */
  function markNone(skuId: string) {
    // units 0 (an answer), cases blank — so the both-blank clear can never
    // fire on it, and the box shows an honest empty rather than a typed 0.
    writeCell(skuId, { cases: null, units: 0, none: true });
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
        // A spoken quantity is an explicit answer, including a spoken zero.
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
  // ⚠ `scope` is what makes the shelf in front of the counter claim the
  // Deepgram keyterm budget first. Without it the server ranks every active
  // SKU alphabetically and the budget runs out at the letter E — measured
  // 48% coverage, against 94-100% zone-scoped (Opsi/analysis/keyterm-by-zone.ts).
  // zoneId changes as he walks; the hook reads it through a ref so the NEXT
  // rotation segment is biased to the NEW shelf.
  const dict = useVoiceDictation((t) => void onTranscript(t), {
    vocabulary: "liquor",
    scope: { section: "food", zoneId },
  });
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
      setRetiring(res.retiring ?? []);
    } catch {
      // A check that cannot RUN must not block a finished walk.
      setFindings([]);
      setRetiring([]);
    } finally {
      setChecking(false);
    }
  }

  /**
   * Answer one location question.
   *
   * ⚠ NEITHER ANSWER TOUCHES THE COUNT. The quantity was observed on that
   * shelf and stays recorded there either way; this only decides whether
   * next month's checklist lists it. "Yes" adds a usual location WITHOUT
   * removing any other — a product legitimately lives in several places.
   */
  async function answerLocation(f: PrecheckFinding, lives: boolean) {
    if (!f.zoneId) return;
    const key = `${f.skuId}:${f.zoneId}`;
    if (locAnswer[key]) return;
    if (!lives) {
      setLocAnswer((a) => ({ ...a, [key]: "kept" }));
      return;
    }
    try {
      await setSkuZone(f.skuId, f.zoneId, true);
      setLocAnswer((a) => ({ ...a, [key]: "added" }));
    } catch {
      // A checklist that failed to learn must not block a finished walk.
      setLocAnswer((a) => ({ ...a, [key]: "kept" }));
    }
  }

  /** "We do not carry this any more." Takes it off the checklist; the
   *  quantities it had in past counts are untouched. */
  async function archiveMissed(skuId: string) {
    try {
      await setSkuActive(skuId, false);
      setMissedAnswer((a) => ({ ...a, [skuId]: "archived" }));
    } catch {
      /* leave the question open rather than claiming it was handled */
    }
  }

  /** "I missed it — let me count it now." Jumps to a shelf it usually
   *  lives on (or the current one, if nothing is recorded) and drops the
   *  row in, so the counter can type the number without hunting. */
  function countMissed(skuId: string) {
    const home = zones.find((z) => z.memberSkuIds?.includes(skuId));
    const target = home?.id ?? zoneId;
    setZoneId(target);
    setAdded((prev) => {
      const cur = prev[target] ?? [];
      return cur.includes(skuId) ? prev : { ...prev, [target]: [...cur, skuId] };
    });
    setMissedAnswer((a) => ({ ...a, [skuId]: "counting" }));
    setFindings(null);
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
      setDoneCount(await submitCount(sessionId, fullCount));
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

  // Walk position, for the zone header. A counter needs to know how far
  // through the kitchen they are without scrolling a tab strip sideways.
  const zoneIdx = Math.max(0, zones.findIndex((z) => z.id === zoneId));
  const zoneCounted = Object.keys(zoneCells).length;
  /** Move shelves and close the picker. Scroll to the top: a phone left at the
   *  bottom of a 45-item shelf would open the next one halfway down. */
  /** Keep the box being typed into clear of the sticky header AND the fixed
   *  footer once the soft keyboard takes its half of the screen.
   *
   *  A timer does NOT do this reliably — focus fires first and the keyboard
   *  animates in afterwards, so a scroll scheduled off the focus lands against
   *  the OLD viewport. Measured before this: focused input at y=557 in a 544px
   *  viewport with the footer starting at 448 — off screen and behind the
   *  footer. The keyboard's actual signal is visualViewport resize. */
  function keepInView(e: { currentTarget: HTMLInputElement }) {
    e.currentTarget.closest(".lq-fc-row")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function goZone(i: number) {
    const z = zones[Math.min(Math.max(i, 0), zones.length - 1)];
    if (!z) return;
    setZoneId(z.id);
    setSearch("");
    setZonePicker(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

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
      {scanNote && totalLines === 0 && (
        <div className="lq-fc-scannote">
          <span>Scan any delivery invoices that aren&rsquo;t in yet.</span>
          <button type="button" onClick={() => setScanNote(false)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="lq-fc-zonehead">
        <button
          type="button"
          className="lq-fc-zonestep"
          aria-label="Previous shelf"
          disabled={zoneIdx <= 0}
          onClick={() => goZone(zoneIdx - 1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="lq-fc-zonepick"
          aria-expanded={zonePicker}
          onClick={() => setZonePicker((o) => !o)}
        >
          <span className="lq-fc-zonename">{zone?.name ?? "—"}</span>
          <span className="lq-fc-zonemeta">
            Shelf {zoneIdx + 1} of {zones.length} · {zoneCounted} of {rows.length} counted
            <span className="lq-fc-zonecaret">{zonePicker ? "▲" : "▼"}</span>
          </span>
        </button>
        <button
          type="button"
          className="lq-fc-zonestep"
          aria-label="Next shelf"
          disabled={zoneIdx >= zones.length - 1}
          onClick={() => goZone(zoneIdx + 1)}
        >
          ›
        </button>
      </div>

      {zonePicker && (
        <div className="lq-fc-zonelist">
          {zones.map((z, i) => {
            const n = Object.keys(counts[z.id] ?? {}).length;
            return (
              <button
                key={z.id}
                type="button"
                className={`lq-fc-zonerow${z.id === zoneId ? " lq-fc-zonerow-on" : ""}`}
                onClick={() => goZone(i)}
              >
                <span className="lq-fc-zonerow-n">{i + 1}</span>
                <span className="lq-fc-zonerow-name">{z.name}</span>
                {n > 0 && <span className="lq-fc-zonerow-done">{n} counted</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* ── voice ── */}
      <div className="lq-fc-voicebar">
        {!dict.recording ? (
          <button type="button" className="lq-btn" onClick={() => dict.start()} disabled={voiceBusy}>
            🎙️ Talk through {zone?.name ?? "this zone"}
          </button>
        ) : (
          <button type="button" className="lq-btn lq-btn-rec" onClick={() => dict.stop()}>
            {/* Elapsed / total, not a countdown. A countdown reads as a
                deadline on a job that does not have one — bursts accumulate,
                so running out is an inconvenience and not a loss. */}
            ⏹ Stop {mmss(dict.seconds)} / {mmss(CAP_SECONDS)}
          </button>
        )}
        {dict.recording && dict.seconds >= WARN_SECONDS && (
          <span className="lq-rec-warntext">
            Wrap up this shelf — stopping at {mmss(CAP_SECONDS)}. Starting again adds to it.
          </span>
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
          const [head, rest] = splitDisplayName(s.name);
          return (
            <div key={s.id} className={`lq-fc-row${c ? " lq-fc-row-counted" : ""}`}>
              <div className="lq-fc-row-name" title={s.name}>
                <span className="lq-fc-row-label">
                  <span className="lq-fc-row-head">{head}</span>
                  {rest && <span className="lq-fc-row-rest">{rest}</span>}
                  {c?.source === "voice" && <span className="lq-fc-row-voice" title={c.raw}>🎙️</span>}
                </span>
                {/* "none here" is OUTSIDE the has-a-cell guard on purpose: its
                    whole job is the first answer on an untouched row — the
                    counter reaches a listed item, sees an empty shelf, and
                    says so. Behind the guard it only appeared once a cell
                    already existed, which is exactly when it is least needed. */}
                <span className="lq-fc-row-sum">
                  {c && <span className="lq-fc-row-total">= {c.qty}</span>}
                  <button
                    type="button"
                    className={`lq-fc-row-none${c?.none && !c.qty ? " lq-fc-row-none-on" : ""}`}
                    onClick={() => markNone(s.id)}
                    title="I looked — there are none here"
                  >
                    none here
                  </button>
                  {c && (
                    <button
                      type="button"
                      className="lq-fc-row-clear"
                      onClick={() => clearCell(s.id)}
                    >
                      clear
                    </button>
                  )}
                </span>
              </div>
              <div className="lq-fc-row-inputs">
                {s.unitsPerCase != null && (
                  <label className="lq-fc-row-box">
                    {/* The "× N" chip is what tells a MULTIPLIER box apart from a
                        loose box that happens to be counted in cases. Without it
                        two different boxes both read "cases". */}
                    <span className="lq-fc-row-lab">
                      cases <span className="lq-fc-row-mult">×{s.unitsPerCase}</span>
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={c?.cases ?? ""}
                      onFocus={keepInView}
                      onChange={(e) => editBox(s.id, "cases", e.target.value, s.unitsPerCase)}
                    />
                  </label>
                )}
                <label className="lq-fc-row-box">
                  <span className="lq-fc-row-lab">{unitLabel(s, 2)}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={c?.units ?? ""}
                    onFocus={keepInView}
                    onChange={(e) => editBox(s.id, "units", e.target.value, null)}
                  />
                </label>
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
          {findings.map((f, i) => {
            const locKey = f.zoneId ? `${f.skuId}:${f.zoneId}` : null;
            const answered = locKey ? locAnswer[locKey] : undefined;
            return (
              <div key={i} className="lq-fc-rev-row">
                <span className="lq-fc-rev-spoken">{f.name}</span>
                <span className="lq-fc-rev-note">{f.detail}</span>
                {/* NOT purchased_not_counted: that one arrived on an invoice
                    this period, so we demonstrably still carry it. Offering to
                    retire it would contradict the rule the timed list is built
                    on — a recent purchase is exactly what proves a product is
                    incoming rather than dying. Its remedy is "count it now". */}
                {f.kind === "not_counted" && (
                  <div className="lq-fc-rev-loc">
                    {missedAnswer[f.skuId] === "archived" ? (
                      <span className="lq-fc-rev-match">
                        Archived. It will not be asked about next count — and every
                        past count still reads exactly as it did.
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="lq-btn lq-fc-rev-locbtn"
                          onClick={() => countMissed(f.skuId)}
                        >
                          I missed it — count it now
                        </button>
                        <button
                          type="button"
                          className="lq-btn lq-btn-ghost lq-fc-rev-locbtn"
                          onClick={() => void archiveMissed(f.skuId)}
                        >
                          We don't carry it any more
                        </button>
                      </>
                    )}
                  </div>
                )}
                {f.kind === "purchased_not_counted" && (
                  <div className="lq-fc-rev-loc">
                    <button
                      type="button"
                      className="lq-btn lq-fc-rev-locbtn"
                      onClick={() => countMissed(f.skuId)}
                    >
                      Count it now
                    </button>
                  </div>
                )}
                {f.kind === "zone_unexpected" && locKey && (
                  <div className="lq-fc-rev-loc">
                    {answered ? (
                      <span className="lq-fc-rev-match">
                        {answered === "added"
                          ? `Added to ${f.zoneName ?? "that shelf"} — it will be on the list next time.`
                          : "Kept for this count only. The list is unchanged."}
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="lq-btn lq-fc-rev-locbtn"
                          onClick={() => void answerLocation(f, true)}
                        >
                          {f.homeless ? "Yes, that's where it lives" : "It lives there too"}
                        </button>
                        <button
                          type="button"
                          className="lq-btn lq-btn-ghost lq-fc-rev-locbtn"
                          onClick={() => void answerLocation(f, false)}
                        >
                          Just this count
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {retiring.length > 0 && (
            <div className="lq-retiring">
              <p className="lq-retiring-h">Have we stopped carrying these?</p>
              <p className="lq-muted lq-retiring-sub">
                No stock seen and nothing bought in months. Retiring one takes it off
                the count sheet. Every past count keeps the numbers it already has.
              </p>
              {retiring.map((r) => (
                <div key={r.skuId} className="lq-retiring-row">
                  <span className="lq-fc-rev-spoken">{r.name}</span>
                  <span className="lq-fc-rev-note">
                    Last seen with stock {r.daysSinceStock} days ago;{" "}
                    {r.daysSincePurchase == null
                      ? "never purchased on a scanned invoice"
                      : `last bought ${r.daysSincePurchase} days ago`}
                    .
                  </span>
                  {missedAnswer[r.skuId] === "archived" ? (
                    <span className="lq-fc-rev-match">
                      Retired. It will not be on the next count sheet.
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="lq-btn lq-btn-ghost lq-fc-rev-locbtn"
                      onClick={() => void archiveMissed(r.skuId)}
                    >
                      We don't carry it any more
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="lq-fc-kind">
            <p className="lq-fc-kind-q">What was this walk?</p>
            <label className="lq-fc-kind-opt">
              <input
                type="radio"
                name="countkind"
                checked={!fullCount}
                onChange={() => setFullCount(false)}
              />
              <span>
                <strong>A trial run</strong> — a few shelves, to see how this works.
                Recorded, but it will not start an inventory period.
              </span>
            </label>
            <label className="lq-fc-kind-opt">
              <input
                type="radio"
                name="countkind"
                checked={fullCount}
                onChange={() => setFullCount(true)}
              />
              <span>
                <strong>The whole kitchen</strong> — every shelf walked. This one
                starts the inventory period everything is measured against.
              </span>
            </label>
          </div>
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
