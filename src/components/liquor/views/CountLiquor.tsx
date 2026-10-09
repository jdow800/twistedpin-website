import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import {
  createCount,
  extractVoice,
  getCatalog,
  getBatches,
  getOpenCount,
  getZones,
  precheckCount,
  setSkuActive,
  saveBatchCounts,
  saveCountLines,
  setCaseSize,
  submitCount,
  BarApiError,
  BatchesChangedError,
  ChangedSinceCheckError,
  SubmissionUnknownError,
  type BarSkuItem,
  type BarBatchItem,
  type BarZoneItem,
  type CountLineInput,
  type OpenCountLine,
  type OpenCount,
  type PrecheckFinding,
  type BottleSizeWarning,
  type RetiringSku,
  type VoiceExtractItem,
  type VoiceMatch,
} from "../api";
import { useVoiceDictation } from "../useRecorderDictation";
import { createCarry } from "../voiceCarry";
import { historyCheck, mergeAdjacentRepeats, nameNumberCheck, possibleBareSize, repeatedSources, type HighCheck, type NameCheck } from "../voiceReview";
import { pauseCutsEnabled } from "../voiceSwitches";
import { createCellSaver, createDraftSaver, DraftMergePausedError, mergeDraft, sameDraftCell, toOpenLines } from "../draftSync";
import { forgetZone, rememberZone, resumeZone } from "../resume-zone";
import { BottleSizeWarnings } from "../BottleSizeWarnings";
import { CountSubmitRecovery } from "../CountSubmitRecovery";
import { useCountFooter } from "../useCountFooter";
import VoiceProcessing from "../VoiceProcessing";
import CountEntryChoice from "../CountEntryChoice";
import { formatQty, roundQty } from "../quantity";
import FindingSummary from "../FindingSummary";


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
type PendingRemap = { zoneId: string; from: string; to: string; skus: string[] };

/** A voice take that ADDED onto a cell an earlier take already filled — maybe a
 *  second bottle, maybe the same one re-said. Surfaced at submit; never
 *  auto-resolved (the app can't know which; the counter can). */
type Restatement = {
  key: string; // `${zoneId}:${skuId}`
  name: string;
  zone: string;
  before: number;
  added: number;
  after: number;
};

type ReviewItem = {
  key: string;
  spoken: string;
  quantityWords?: string;
  quantityNeedsReview?: boolean;
  /** The server's specific source question, e.g. a duplicate of a source
   *  another row already counted. See quantityBlocked. */
  quantityReviewReason?: VoiceExtractItem["quantityReviewReason"];
  /** A held number that may be the bottle's size or another row's source
   *  (voiceReview.ts possibleBareSize, repeatedSources). Set from the
   *  original response, so picking a bottle does not clear it. */
  keepBlank?: boolean;
  qty: number;
  cases: number;
  units: number;
  unitsPerCase: number | null;
  /** Cases were spoken but we have no case size — NOT applyable until answered. */
  needsCaseSize: boolean;
  /** Model looks to have multiplied cases itself — make a human pick. */
  suspectPreMultiplied: boolean;
  /** The count matches a number in the bottle's name ("Seagram's 7" at 7.9) —
   *  NOT applyable until the counter says which (voiceReview.ts). */
  nameCheck: NameCheck | null;
  /** The venue total is far above this bottle's 90-day record (voiceReview.ts
   *  historyCheck) — NOT applyable until kept or retyped. */
  highCheck: HighCheck | null;
  /** The take's shelf already has this bottle from an earlier take: a re-say
   *  or more of it? Asked on the take's first row of the bottle; NOT applyable
   *  until answered. "replace" sets the shelf to this take's number. */
  restate: { before: number } | null;
  restateAnswer?: "replace" | "add";
  chosenSkuId: string | null; // resolved (from a single match, a picked candidate, or manual assign)
  candidates: VoiceMatch[]; // ambiguous → the choices
  assignOpen?: boolean; // unmatched → inline search open
  /** A human entered literal zero; missing model quantities never become zeros. */
  explicitZero?: boolean;
};

/** Jon, 2026-10-09: "Number in box, counts ready." A model number the server
 *  could not re-prove from the transcript stays in the Qty box with an amber
 *  edge and is added like any other row. A reused source (a reason or
 *  keepBlank), a possible bottle size (keepBlank) and a held zero stay blank
 *  until a number is typed. Every other question (bottle, case size, name
 *  number, history, recount) still asks. */
const quantityBlocked = (r: ReviewItem) =>
  !!r.quantityNeedsReview && (!!r.quantityReviewReason || !!r.keepBlank || (r.cases === 0 && r.units === 0));

/** A stock_count item is counted in WHOLE UNITS, so it reads "each" even when a
 *  size is on file. Sizes were added to the cans/bottles in 2026-09-04 so the
 *  order-guide velocity export can emit OUNCES for them (Sculpture's history for
 *  those SKUs is in oz, and mixing units inside one SKU's history corrupts its
 *  burn rate) — that is a data fact for the export, never a counting
 *  instruction. Keyed on tracking_mode, not sizeMl, for exactly that reason. */
const sizeLabel = (s: BarSkuItem) =>
  s.trackingMode === "stock_count" || s.sizeMl == null ? "each" : `${s.sizeMl} ml`;

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
 *  tracking_mode 'stock_count' is the gate, so a bottle can never pick one up by
 *  accident. 📦 backs up an unmapped category, because the not-a-bottle signal
 *  disappearing is worse than a generic marker.
 *
 *  ⚠ This USED to gate on sizeMl == null, which correlated 1:1 with
 *  stock_count — until 2026-09-04, when sizes were put on the cans so the
 *  velocity export could emit ounces. That silently deleted the marker from
 *  every mixer and energy drink. Gate on the mode, which is what actually means
 *  "not a bottle"; a size is just a fact about the container. */
const NON_BOTTLE_EMOJI: Record<string, string> = {
  Garnish: "🍒",
  Bitters: "🌿",
  Mixers: "🥤",
  "Energy Drinks": "🐂", // Red Bull. Yes, really.
  "Canned Cocktails": "🥫",
};
function nonBottleEmoji(s: {
  sizeMl: number | null;
  category: string | null;
  trackingMode?: BarSkuItem["trackingMode"];
}): string | null {
  if (s.trackingMode !== "stock_count" && s.sizeMl != null) return null;
  return (s.category ? NON_BOTTLE_EMOJI[s.category] : null) ?? "📦";
}
/** Every case size this venue has ever recorded — 38 observations across three
 *  independent sources (bar_sku.units_per_case, the invoice pack columns, and
 *  entered count lines) — is 6, 12 or 24. Nothing else has appeared, ever. The
 *  Owens "6/4P" is six four-packs, normalised to 24 cans.
 *
 *  So these are QUICK PICKS, and anything else warns. Three EQUAL options, never
 *  a pre-filled default: a default invites tapping through, and a wrong case
 *  size is sticky forever because invoices deliberately never overwrite a
 *  hand-entered one. Picking fills the box rather than saving, so the number is
 *  still confirmed on the Save button.
 *
 *  A warning, NOT a block — a genuinely odd case exists somewhere and this must
 *  not be the reason it can't be entered. */
const COMMON_CASE_SIZES = [6, 12, 24] as const;
const isOddCaseSize = (n: number) => !COMMON_CASE_SIZES.includes(n as 6 | 12 | 24);

const skuLabel = (m: VoiceMatch) => `${m.name}${m.sizeMl != null ? ` · ${m.sizeMl}ml` : ""}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function CountLiquor({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [zones, setZones] = useState<BarZoneItem[]>([]);
  const [batches, setBatches] = useState<BarBatchItem[]>([]);
  /** zoneId -> batchId -> full-container equivalents. A key EXISTS only once
   *  the counter has touched that batch in that zone, because an absent row
   *  and a zero mean different things to the bracket (see saveBatchCounts). */
  const [batchCounts, setBatchCounts] = useState<Record<string, Record<string, number>>>({});
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [zoneId, setZoneId] = useState<string>("");
  const [zoneNames, setZoneNames] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Counts>({});
  const [search, setSearch] = useState("");
  // Keep a new catalog row mounted while its first quantity is being typed.
  // Otherwise recording the first digit moves it into the captured list and
  // closes the phone keyboard before a decimal or second digit can be entered.
  const [catalogEditing, setCatalogEditing] = useState<string | null>(null);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const [startingFresh, setStartingFresh] = useState(false);
  const footerRef = useCountFooter();
  const [done, setDone] = useState<number | null>(null);
  const [resumed, setResumed] = useState(false);
  const [entryDraft, setEntryDraft] = useState<OpenCount | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const entryBusyRef = useRef(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  // Pre-submit review: uncounted zones (client-side) + flagged bottles (server)
  // + voice restatements (client-side — see restatementsRef).
  const [confirmSubmit, setConfirmSubmit] = useState<{
    zones: string[];
    findings: PrecheckFinding[];
    sizeWarnings: BottleSizeWarning[];
    truncated: number;
    more: PrecheckFinding[];
    doubles: Restatement[];
    retiring: RetiringSku[];
    /** The pre-submit check could not run, so nothing above was checked. */
    checkFailed?: boolean;
  } | null>(null);
  // "Show N more" on the review's two capped lists. Each opening starts short.
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [showAllDoubles, setShowAllDoubles] = useState(false);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [reviewMoved, setReviewMoved] = useState<Record<string, string>>({});
  const pendingRemapsRef = useRef<PendingRemap[]>([]);
  const remapConflictsRef = useRef<PendingRemap[]>([]);
  const [remapConflicts, setRemapConflicts] = useState<PendingRemap[]>([]);
  // Bottles answered with "we don't carry it any more", so the row can
  // confirm itself without re-running the whole check.
  const [archived, setArchived] = useState<Record<string, true>>({});
  // The retire PATCH in flight, and its failure. Without these a counter on a
  // weak connection could tap retire, tap Submit before the request settled,
  // and finish the count never learning the bottle is still active — the
  // dialog closes on submit and the rejection had nowhere to go.
  const [retiringSkuId, setRetiringSkuId] = useState<string | null>(null);
  const [retireErr, setRetireErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // voice
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  /** Which shelf a voice take belongs to, captured when recording STARTS
   *  rather than read when Apply is tapped. Apply used to write the take to
   *  whichever tile was selected by then, so a counter who tapped the next
   *  shelf while the take was processing filed it on the wrong shelf. The
   *  food screen has done it this way since 2026-09-08. */
  const [takeZoneId, setTakeZoneId] = useState<string | null>(null);
  /** Mic live — Start until Stop, NOT until the uploads land. Shelf tiles are
   *  refused while this is true, so a take stays one shelf; after Stop the
   *  destination is fixed and walking on is safe. */
  const [captureRequested, setCapturing] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
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
  // Per-segment extraction: the recorder hands each ~20s segment's transcript
  // over DURING the recording, and the LLM extraction runs in the background.
  // Stop waits for the final segment and any older requests still running.
  // Keyed by segment index (NOT arrival order — an upload can complete late)
  // so the review sheet preserves
  // spoken order. The Web Speech fallback engine never fires onSegment; its
  // takes go through processTranscript whole, as before.
  const segExtractsRef = useRef<Map<number, Promise<VoiceExtractItem[] | null>>>(new Map());
  // Pause cuts (on by default; ?pausecuts=0 is the off-switch, voiceSwitches.ts):
  // segments end at a pause, and a segment's unfinished last phrase
  // ("…Frangelico,") waits to lead the next one, so pieces are extracted in
  // spoken order (voiceCarry.ts).
  const pauseCuts = useMemo(() => pauseCutsEnabled(), []);
  const carryRef = useRef<ReturnType<typeof createCarry> | null>(null);
  const segmentGapRef = useRef(false);
  if (!carryRef.current) {
    carryRef.current = createCarry((text, idx) => {
      segExtractsRef.current.set(idx, extractVoice(text).catch(() => null)); // null = this piece's extraction failed
    });
  }
  const dict = useVoiceDictation((t) => void finalizeVoice(t), {
    vocabulary: "liquor",
    // ⚠ WITHOUT A SCOPE THE SERVER BIASES TOWARD EVERY ACTIVE SKU, alphabetical,
    // and the food catalog now shares that list: measured 2026-09-28, only 50
    // of 162 bar SKUs got a keyterm (Tito's, Patron, Jameson did not). The bar
    // section alone covers 121, and the shelf in front of the counter goes
    // first — the server builds liquor shelves from submitted count history.
    // `|| undefined`: before the shelves load zoneId is "", and the server's
    // uuid check would 400 every segment upload of that take.
    scope: { section: "bar", zoneId: (takeZoneId ?? zoneId) || undefined },
    pauseCuts,
    onSegmentFailed: (index) => {
      segmentGapRef.current = true;
      if (pauseCuts) carryRef.current!.fail(index);
    },
    onSegment: (text, idx) => {
      // Every segment goes through the carry, even an empty one, so the next
      // segment isn't left waiting for it.
      if (pauseCuts) return carryRef.current!.add(text, idx);
      if (!text.trim()) return;
      segExtractsRef.current.set(idx, extractVoice(text).catch(() => null)); // null = this segment's extraction failed
    },
  });
  // A recorder ending or refusing Start releases the shelf immediately. Avoid
  // a delayed false-recording effect clearing the next take's Start flag.
  const capturing = captureRequested && dict.recording && dict.capturing !== false;
  const processingVoice = (dict.recording && !capturing) || voiceBusy;
  useEffect(() => {
    if (dict.quiet) setInterrupted(true);
  }, [dict.quiet]);
  useEffect(() => {
    if (!dict.recording) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") setInterrupted(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [dict.recording]);

  // The live words box is capped in height; keep the newest words in view.
  const liveTextRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    const el = liveTextRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dict.transcript, dict.interim]);

  const nameById = useMemo(() => new Map(catalog.map((s) => [s.id, s.name])), [catalog]);
  const skuById = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);

  // Hold the staffer's draft until they choose; page-hide must not save it yet.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [z, cat, open, bs] = await Promise.all([
          getZones("bar", "liquor"),
          getCatalog(),
          getOpenCount(true, "bar", { includeOlder: true }),
          // A batch list that fails to load must not block a liquor count —
          // the section simply does not render, exactly as before it existed.
          getBatches().catch(() => [] as BarBatchItem[]),
        ]);
        if (!live) return;
        // Saved lines can include a shelf excluded from today's liquor walk.
        // Fetch its display metadata without making it a tile/resume target.
        const knownZoneIds = new Set(z.map((zone) => zone.id));
        const needsHistoricalNames = open?.lines.some((line) => !knownZoneIds.has(line.zoneId));
        const namedZones = needsHistoricalNames ? await getZones("bar").catch(() => z) : z;
        if (!live) return;
        setZoneNames(Object.fromEntries([...namedZones, ...z].map((zone) => [zone.id, zone.name])));
        // A beer-only shelf belongs to Keg check. Older servers may ignore the
        // walk parameter; retain any saved lines there without asking to walk it.
        const liquorZones = z.filter((zone) => !/^walk[\s-]*in\s+cooler$/i.test(zone.name.trim()));
        setZones(liquorZones);
        setCatalog(cat);
        setBatches(bs);
        // ⚠ SESSION FIRST, THEN ZONE — see resume-zone.ts. The liquor walk
        // has the same failure as the kitchen one: a reload mid-count put the
        // counter back on Speedrails no matter which shelf they were on.
        if (open) {
          setEntryDraft(open);
        } else {
          const sid = await createCount(true);
          if (!live) return;
          setSessionId(sid);
          saverRef.current!.loaded([], null);
          batchSaverRef.current!.loaded([], null);
          setZoneId(resumeZone(sid, liquorZones));
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

  function continueEntry() {
    if (!entryDraft || entryBusyRef.current) return;
    entryBusyRef.current = true;
    setSessionId(entryDraft.id);
    setCounts(rebuildCounts(entryDraft.lines));
    saverRef.current!.loaded(entryDraft.lines, entryDraft.linesHash);
    const bc: Record<string, Record<string, number>> = {};
    for (const b of entryDraft.batches ?? []) (bc[b.zoneId] ??= {})[b.batchId] = Number(b.fullEquivalents);
    setBatchCounts(bc);
    batchSaverRef.current!.loaded(flattenBatches(bc), entryDraft.batchesHash);
    setZoneId(resumeZone(entryDraft.id, zones));
    setResumed(true);
    setEntryDraft(null);
  }

  async function startEntry() {
    if (!entryDraft || entryBusyRef.current) return;
    entryBusyRef.current = true;
    setEntryBusy(true);
    setEntryError(null);
    try {
      const sid = await createCount(true);
      setSessionId(sid);
      saverRef.current!.loaded([], null);
      batchSaverRef.current!.loaded([], null);
      setZoneId(resumeZone(sid, zones));
      setEntryDraft(null);
    } catch {
      entryBusyRef.current = false;
      setEntryError("Couldn't start a new count. Try again, or continue your previous count.");
    } finally {
      setEntryBusy(false);
    }
  }

  /** The shelf as of RIGHT NOW, not as of the render that queued the request.
   *  createCount is async and the counter can change shelves while it is in
   *  flight — the handler would then remember the shelf they left. */
  const zoneIdRef = useRef(zoneId);
  zoneIdRef.current = zoneId;

  async function startFresh() {
    if (startingFresh || submitting || checking || voicePending) return;
    setStartingFresh(true);
    setSubmitErr(null);

    try {
      const sid = await createCount(true);
      setSessionId(sid);
      // The shelf on screen does not change here, so the NEW session has to
      // be told about it — otherwise a counter who starts fresh, enters
      // quantities without switching shelves and then reloads comes back to
      // shelf one, having never touched the picker we listen to. Found in review.
      rememberZone(sid, zoneIdRef.current);
      setCounts({});
      pendingRemapsRef.current = [];
      remapConflictsRef.current = [];
      setRemapConflicts([]);
      saverRef.current!.loaded([], null);
      setBatchCounts({});
      batchSaverRef.current!.loaded([], null);
      setResumed(false);
      setSave("idle");
    } catch {
      setSubmitErr("Couldn't start a new count. Your current count is still here. Try again.");
    } finally {
      setStartingFresh(false);
    }
  }

  // ── debounced autosave (survives a tab close mid-count) ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countsRef = useRef<Counts>(counts);
  countsRef.current = counts;
  const batchCountsRef = useRef(batchCounts);
  batchCountsRef.current = batchCounts;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  /** Saves built on the draft this screen last saw, so a stale screen merges
   *  instead of overwriting an edit made elsewhere (draftSync.ts). */
  const [merged, setMerged] = useState(false);
  const saverRef = useRef<ReturnType<typeof createDraftSaver> | null>(null);
  if (!saverRef.current) {
    saverRef.current = createDraftSaver({
      beforeSave: () => {
        if (remapConflictsRef.current.length) throw new DraftMergePausedError("Review the changed item correction first.");
      },
      save: (lines, baseHash) => saveCountLines(sessionIdRef.current!, lines, true, "bar", baseHash),
      current: () => flatten(countsRef.current),
      saved: (lines) => {
        const saved = new Map(lines.map((l) => [`${l.zoneId}:${l.skuId}`, l]));
        const current = new Map(flatten(countsRef.current).map((l) => [`${l.zoneId}:${l.skuId}`, l]));
        // A remap made while this save was in flight must remain protected.
        pendingRemapsRef.current = pendingRemapsRef.current.filter((r) =>
          !r.skus.every((id) => sameDraftCell(saved.get(`${r.zoneId}:${id}`), current.get(`${r.zoneId}:${id}`))));
      },
      conflict: (base, mine, theirs) => {
        const before = new Map(base.map((l) => [`${l.zoneId}:${l.skuId}`, l]));
        const fresh = new Map(theirs.map((l) => [`${l.zoneId}:${l.skuId}`, l]));
        const pending = pendingRemapsRef.current;
        const changed = pending.some((r) => r.skus.some((id) =>
          !sameDraftCell(before.get(`${r.zoneId}:${id}`), fresh.get(`${r.zoneId}:${id}`))));
        if (!changed) return { lines: mergeDraft(base, mine, theirs), pause: false };
        // Restore every endpoint of the pending compound operations, retaining
        // ordinary local edits elsewhere. A fresh collision needs a fresh choice.
        const endpoints = new Set(pending.flatMap((r) => r.skus.map((id) => `${r.zoneId}:${id}`)));
        const lines = mergeDraft(base, mine, theirs).filter((l) => !endpoints.has(`${l.zoneId}:${l.skuId}`));
        lines.push(...theirs.filter((l) => endpoints.has(`${l.zoneId}:${l.skuId}`)));
        remapConflictsRef.current = pending;
        setRemapConflicts(pending);
        pendingRemapsRef.current = [];
        checkedRef.current = null;
        setReviewDirty(true);
        setReviewMoved((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !endpoints.has(key))));
        return { lines, pause: true };
      },
      adopt: (lines) => {
        const local = countsRef.current;
        const localLines = new Map(flatten(local).map((l) => [`${l.zoneId}:${l.skuId}`, l]));
        const next = rebuildCounts(toOpenLines(lines));
        // Zero-case stamps are local editing metadata and omitted on the wire.
        // Carry them through an unrelated merge only when that adopted cell is
        // still this screen's zero-case value. Fresh remote package answers and
        // restored remap endpoints must retain their server metadata instead.
        const restoredEndpoints = new Set(remapConflictsRef.current.flatMap((r) => r.skus.map((id) => `${r.zoneId}:${id}`)));
        for (const line of lines) {
          const key = `${line.zoneId}:${line.skuId}`;
          const previous = local[line.zoneId]?.[line.skuId];
          const cell = next[line.zoneId]?.[line.skuId];
          if (cell && previous?.caseSize != null && (previous.cases ?? 0) === 0 &&
            cell.caseSize == null && !restoredEndpoints.has(key) && sameDraftCell(line, localLines.get(key))) {
            cell.cases = 0;
            cell.caseSize = previous.caseSize;
          }
        }
        countsRef.current = next;
        setCounts(next);
        setMerged(true);
      },
    });
  }
  /** What the last pre-submit check looked at; submit hands it back so a count
   *  that moved since is checked again (TPRS 2026-10-03). */
  const checkedRef = useRef<{ linesHash?: string; batchesHash?: string } | null>(null);
  /** The check was re-run because the count moved after it. */
  const [rechecked, setRechecked] = useState(false);
  /** The prep-batch rows get the same protection (TPRS 2026-10-03): a save
   *  built on rows that changed elsewhere merges instead of erasing them. */
  type BatchRow = { zoneId: string; batchId: string; fullEquivalents: number };
  const batchSaverRef = useRef<ReturnType<typeof createCellSaver<BatchRow>> | null>(null);
  if (!batchSaverRef.current) {
    batchSaverRef.current = createCellSaver<BatchRow>({
      save: (rows, baseHash) => saveBatchCounts(sessionIdRef.current!, rows, baseHash).then((r) => ({ hash: r.batchesHash })),
      current: () => flattenBatches(batchCountsRef.current),
      adopt: (rows) => {
        const next: Record<string, Record<string, number>> = {};
        for (const r of rows) (next[r.zoneId] ??= {})[r.batchId] = r.fullEquivalents;
        batchCountsRef.current = next;
        setBatchCounts(next);
        setMerged(true);
      },
      keyOf: (r) => `${r.zoneId}:${r.batchId}`,
      same: (a, b) => Math.abs(a.fullEquivalents - b.fullEquivalents) < 1e-9,
      conflict: (e) => (e instanceof BatchesChangedError
        ? { rows: e.batches.map((b) => ({ zoneId: b.zoneId, batchId: b.batchId, fullEquivalents: Number(b.fullEquivalents) })), hash: e.batchesHash }
        : null),
    });
  }

  // Voice restatements — the Empress 1908 double-count (2026-08-07). The GM
  // said "Empress 1.1", wasn't sure it registered, and said it again in a
  // separate take two minutes later; applyReview ADDs by design (a second
  // Tito's found later in the zone must add), so the cell silently became 2.2.
  // The app cannot tell "another bottle" from "the same one re-said" — but the
  // counter can, so a cross-TAKE add onto an occupied cell is recorded here and
  // ASKED about at submit. Within-take repeats are exempt: one clip listing
  // "Tanqueray, point one … Tanqueray, one" is two rail spots, and applyReview
  // already merged them before this sees anything. Keyed zone:sku; a later
  // restatement of the same cell overwrites (latest state is what matters).
  const restatementsRef = useRef<Map<string, Restatement>>(new Map());
  function scheduleSave() {
    if (!sessionId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 1400);
  }
  /** Batch rows in the wire shape. Sends only batches the counter has
   *  TOUCHED — an untouched batch has no row, which is how the server learns
   *  nobody walked the prep shelf. A zero he typed IS a row. */
  function flattenBatches(bc: Record<string, Record<string, number>>) {
    const out: { zoneId: string; batchId: string; fullEquivalents: number }[] = [];
    for (const [zid, byBatch] of Object.entries(bc)) {
      for (const [bid, n] of Object.entries(byBatch)) {
        out.push({ zoneId: zid, batchId: bid, fullEquivalents: n });
      }
    }
    return out;
  }

  async function flush() {
    if (!sessionId) return;
    // An empty list is SENT, not skipped — it is how "I removed the last
    // bottle" reaches the server. Skipping it left the deleted rows alive.
    setSave("saving");
    try {
      await saverRef.current!.save();
      await batchSaverRef.current!.save();
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
  function setQty(skuId: string, loose: number, explicit = false, dest = zoneId) {
    setCounts((prev) => {
      const zone = { ...(prev[dest] ?? {}) };
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
      if (qty <= 0 && !cur && !explicit) delete zone[skuId];
      else
        zone[skuId] = {
          qty,
          // Keep the frozen multiplier while editing through zero. A phone
          // types 0 before 0.5; dropping the stamp there would silently switch
          // a corrected/remapped historical case to the catalog's new size.
          ...(caseSize != null ? { cases, caseSize } : {}),
          source: "grid",
          ...(cur?.raw ? { raw: cur.raw } : {}),
        };
      return { ...prev, [dest]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  /** SET how many CASES for (zone, sku), preserving the loose count. The case
   *  size is stamped from the catalog AT THIS MOMENT and frozen on the cell —
   *  never re-read later, so editing a SKU's case size can't rescale a count
   *  that's already been entered. */
  function setCases(skuId: string, casesRaw: number, dest = zoneId) {
    const cases = Math.max(0, roundQty(casesRaw));
    setCounts((prev) => {
      const zone = { ...(prev[dest] ?? {}) };
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
          cases,
          caseSize,
          source: "grid",
          ...(cur?.raw ? { raw: cur.raw } : {}),
        };
      return { ...prev, [dest]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  /** Remove a bottle from this zone entirely — clears cases AND loose. The ✕
   *  used to call setQty(0), which now only zeroes the loose part and would
   *  leave a case-only row stubbornly on screen. A re-said bottle ("Recount")
   *  clears the take's shelf this way before addQty writes its new number. */
  function clearCell(skuId: string, dest: string = zoneId) {
    setCounts((prev) => {
      const zone = { ...(prev[dest] ?? {}) };
      delete zone[skuId];
      return { ...prev, [dest]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  /** ADD to the running (zone, sku) total — the voice path. Cases and loose
   *  containers accumulate independently so the entry memo stays truthful.
   *  `dest` is the shelf the entry belongs to: the selected one for a grid
   *  edit, the one the take STARTED on for a voice take. */
  function addQty(
    skuId: string,
    delta: { cases: number; units: number; caseSize: number | null },
    source: "grid" | "voice",
    raw?: string,
    dest: string = zoneId,
    explicitZero = false,
  ) {
    setCounts((prev) => {
      const zone = { ...(prev[dest] ?? {}) };
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
      if (next <= 0 && !explicitZero) delete zone[skuId];
      else
        zone[skuId] = {
          qty: next,
          // A loose-only voice addition must not erase a multiplier retained
          // while the case field is zero. Later case edits still use that stamp.
          ...(caseSize != null ? { cases, caseSize } : {}),
          source,
          ...(raw ? { raw } : {}),
        };
      return { ...prev, [dest]: zone };
    });
    setSave("idle");
    scheduleSave();
  }

  // ── voice: record → cap → extract → review ──
  // Auto-stop at the hard cap; the transcript then arrives via the dictation
  // onFinal callback → processTranscript (so the last words aren't dropped).
  useEffect(() => {
    if (dict.recording && dict.seconds >= CAP_SECONDS) {
      setCapturing(false);
      dict.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict.seconds, dict.recording]);
  function toReviewItems(items: VoiceExtractItem[]): ReviewItem[] {
    const merged = mergeAdjacentRepeats(items);
    const repeated = repeatedSources(merged);
    const rows: ReviewItem[] = merged.map((it, i) => ({
      key: `v${i}`,
      spoken: it.spoken,
      quantityWords: it.quantityWords,
      quantityNeedsReview: it.quantityNeedsReview,
      quantityReviewReason: it.quantityReviewReason,
      keepBlank: repeated[i] || (!!it.quantityNeedsReview &&
        possibleBareSize(it.quantityWords, it.match ? [it.match, ...it.candidates] : it.candidates, catalog)),
      explicitZero: it.qty === 0 && it.quantityNeedsReview === false && !!it.quantityWords,
      // Don't default a case-bearing row to 1 — its qty legitimately
      // carries only the loose part until the case size is answered.
      qty: it.qty,
      cases: it.cases,
      units: it.units,
      unitsPerCase: it.unitsPerCase,
      needsCaseSize: it.needsCaseSize,
      suspectPreMultiplied: it.suspectPreMultiplied,
      nameCheck: nameNumberCheck(it.units, it.cases, it.match?.name),
      highCheck: null,
      restate: null,
      chosenSkuId: it.match?.id ?? null,
      candidates: it.candidates,
    }));
    return rows.map((r, i) => recheck(r, rows, i));
  }

  /** Already on the take's shelf from an earlier take? Asked once per bottle,
   *  on the take's first row of it (applyReview sums the take's rows). */
  function restateFor(r: ReviewItem, rows: ReviewItem[], i: number): { before: number } | null {
    const skuId = r.chosenSkuId;
    if (!skuId || rows.slice(0, i).some((x) => x.chosenSkuId === skuId)) return null;
    const before = countsRef.current[takeZoneId ?? zoneId]?.[skuId]?.qty ?? 0;
    return before > 0 ? { before } : null;
  }

  /** The history question for one review row. Its total is the whole venue:
   *  every shelf's count of the bottle so far, plus the take's earlier rows. */
  function highFor(r: ReviewItem, rows: ReviewItem[], i: number): HighCheck | null {
    const skuId = r.chosenSkuId;
    if (!skuId) return null;
    const counted = Object.values(countsRef.current).reduce((t, cells) => t + (cells[skuId]?.qty ?? 0), 0);
    // A blank held row (reused source or held zero) is not inventory evidence.
    // Keeping those source questions separate must not make a proved neighbor
    // inherit their speculative amount as a history warning. A prefilled
    // amber number is added as shown, so it counts like a human answer.
    const earlier = rows.slice(0, i).filter((x) => x.chosenSkuId === skuId && !quantityBlocked(x)).reduce((t, x) => t + x.qty, 0);
    const sku = skuById.get(skuId);
    return historyCheck(r.qty, counted + earlier, sku?.countHistory, r.unitsPerCase ?? sku?.unitsPerCase);
  }

  /** Recording ended. Segment extractions were launched as each transcript
   *  landed (see onSegment above) — assemble them in spoken order; only the
   *  last segment's extraction is typically still in flight here. */
  async function finalizeVoice(fullTranscript: string) {
    // Every segment has reported by now: send what the carry still holds (the
    // last unfinished phrase, and anything queued behind a failed segment).
    const gap = (pauseCuts ? carryRef.current!.flush(Number.MAX_SAFE_INTEGER) : false) || segmentGapRef.current;
    const pending = [...segExtractsRef.current.entries()].sort(([a], [b]) => a - b);
    segExtractsRef.current = new Map();
    // No segments → the Web Speech fallback engine (or an all-silence take):
    // the original whole-transcript path.
    if (pending.length === 0) {
      if (gap) {
        setVoiceErr("Part of the recording is missing — count that part again or type it in.");
        return;
      }
      return void processTranscript(fullTranscript);
    }
    setVoiceBusy(true);
    setVoiceErr(null);
    try {
      const results = await Promise.all(pending.map(([, p]) => p));
      const items = results.filter((r): r is VoiceExtractItem[] => r != null).flat();
      const failed = gap || results.some((r) => r == null);
      if (items.length === 0) {
        setVoiceErr(
          failed
            ? "Couldn't process that — try again or type it."
            : "Didn't catch any bottles — try again, closer to the shelf.",
        );
        return;
      }
      setReview(toReviewItems(items));
      // Partial loss must not be silent: the sheet still opens with what
      // survived, but the counter is told a piece is missing.
      if (failed) setVoiceErr("Part of the recording couldn't be processed — double-check the list.");
    } finally {
      setVoiceBusy(false);
    }
  }

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
      setReview(toReviewItems(items));
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
        ? r.map((x, i) =>
            x.chosenSkuId === skuId && x.needsCaseSize
              ? recheck({
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
                }, r, i)
              : x,
          )
        : r,
    );
    return null;
  }

  /** A row whose bottle or quantity just changed asks the history and
   *  earlier-take questions again. */
  function recheck(x: ReviewItem, rows: ReviewItem[], i: number, previousRows = rows): ReviewItem {
    const restate = restateFor(x, rows, i);
    const previous = previousRows.find((row) => row.key === x.key);
    return { ...x, highCheck: highFor(x, rows, i), restate,
      restateAnswer: restate && previous?.chosenSkuId === x.chosenSkuId && x.restate?.before === restate.before
        ? x.restateAnswer : undefined };
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
        {/* Fills the box; does NOT save. The number still gets confirmed on the
            Save button, because a wrong case size can't be corrected later. */}
        <span className="lq-caseask-quick">
          {COMMON_CASE_SIZES.map((c) => (
            <button
              key={c}
              type="button"
              className="lq-chip lq-caseask-pick"
              onClick={() => {
                setCaseAskVal(String(c));
                setCaseAskErr(null);
              }}
            >
              {c}
            </button>
          ))}
        </span>
        {valid && isOddCaseSize(n) && (
          <span className="lq-caseask-warn">
            {n} per case? Every case here has been 6, 12 or 24 — worth a look at the box.
          </span>
        )}
        {err && <span className="lq-caseask-err">{err}</span>}
      </div>
    );
  }

  /** A row can only be applied once it's matched to a bottle AND its quantity
   *  is unambiguous. An unanswered case size or a suspected pre-multiply keeps
   *  the row on screen rather than letting a guessed number through — that
   *  silent path is exactly what produced 93, 27 and 1 on 2026-07-24. */
  // Missing or backspaced quantities stay for review. A literal zero is an
  // observed empty shelf, and earlier-take questions still hold the bottle.
  // An amber (unproved) model number is ready; see quantityBlocked.
  const applyable = (r: ReviewItem) =>
    !!r.chosenSkuId && !quantityBlocked(r) && !r.needsCaseSize && !r.suspectPreMultiplied && !r.nameCheck && !r.highCheck && (r.qty > 0 || r.explicitZero === true) &&
    !(review ?? []).some((x) => x.chosenSkuId === r.chosenSkuId && x.restate && !x.restateAnswer);


  function applyReview() {
    if (!review) return;
    // The shelf the take was recorded on, not whichever tile is selected now.
    const dest = takeZoneId ?? zoneId;
    // Sum duplicates within this clip, then ADD each into the zone total.
    const merged = new Map<string, { cases: number; units: number; caseSize: number | null; spoken: string; explicitZero: boolean }>();
    for (const it of review) {
      if (!applyable(it)) continue;
      const skuId = it.chosenSkuId!;
      const caseSize = it.unitsPerCase ?? skuById.get(skuId)?.unitsPerCase ?? null;
      const e = merged.get(skuId);
      if (e) {
        e.cases = roundQty(e.cases + it.cases);
        e.units = roundQty(e.units + it.units);
        e.explicitZero ||= it.explicitZero === true;
      } else {
        merged.set(skuId, { cases: it.cases, units: it.units, caseSize, spoken: it.spoken, explicitZero: it.explicitZero === true });
      }
    }
    // The counter's earlier-take answers, per bottle.
    const answer = new Map(review.filter((r) => r.restate && r.restateAnswer).map((r) => [r.chosenSkuId!, r.restateAnswer!]));
    for (const [skuId, { cases, units, caseSize, spoken, explicitZero }] of merged) {

      // Cross-take add onto an occupied cell → remember it for the submit
      // dialog (the Empress double-count shape). Recorded BEFORE addQty so
      // `before` is what the earlier take(s) left, not the summed result.
      // Not when the counter already answered it on this sheet.
      const cur = countsRef.current[dest]?.[skuId];
      if (answer.get(skuId) === "replace") clearCell(skuId, dest);
      if (cur && cur.qty > 0 && !answer.has(skuId)) {
        const added = roundQty(units + cases * (caseSize ?? cur.caseSize ?? 0));
        if (added > 0) {
          restatementsRef.current.set(`${dest}:${skuId}`, {
            key: `${dest}:${skuId}`,
            name: skuById.get(skuId)?.name ?? "?",
            zone: zones.find((z) => z.id === dest)?.name ?? "?",
            before: cur.qty,
            added,
            after: roundQty(cur.qty + added),
          });
        }
      }
      addQty(skuId, { cases, units, caseSize }, "voice", spoken, dest, explicitZero);
    }
    // Keep any row that couldn't be applied, so nothing is silently dropped.
    const leftover = review.filter((r) => !applyable(r));
    setReview(leftover.length > 0 ? leftover : null);
  }
  const reviewResolved = review ? review.filter(applyable).length : 0;
  const reviewPending = review ? review.length - reviewResolved : 0;

  /** Voice work that must land before a count can close. Finish used to stay
   *  live through all of it, so a counter could submit over a take still
   *  recording, processing or waiting on the review sheet: the spoken bottles
   *  never reached the count, and the server 409s any line saved after
   *  submit. Guards the button, tryFinish and finish — the food screen's
   *  rule since 2026-09-08. */
  const voicePending = dict.recording || voiceBusy || (review?.length ?? 0) > 0;

  // Warn before submitting an incomplete count — don't close out a full-venue
  // inventory with a zone never touched (they can still choose to submit).
  /** The cheapest moment to fix anything: the counter is still standing at the
   *  shelf. The variance report lands ~30s after submit as a 3h-correctable
   *  DRAFT (review gate, 0136) — the draft window is the net, this check is the
   *  plan. After finalize, a wrong number is permanent for the period. */
  async function tryFinish(recheck = false, reviewOnly = false) {
    if (!sessionId || submitting || checking || voicePending) return;
    // Leaving Details and returning through Finish still owes an explicit
    // review of the changed count, even if the fresh server check is clean.
    const keepReviewOpen = reviewOnly || reviewDirty;
    setRechecked(recheck);
    setSubmitErr(null);
    const uncounted = zones.filter((z) => Object.keys(counts[z.id] ?? {}).length === 0).map((z) => z.name);
    setChecking(true);
    let findings: PrecheckFinding[] = [];
    let sizeWarnings: BottleSizeWarning[] = [];
    let truncated = 0;
    let more: PrecheckFinding[] = [];
    let retiring: RetiringSku[] = [];
    let checkFailed = false;
    try {
      // Flush FIRST — the check runs server-side against saved lines, so an
      // unsaved last edit would be checked in its old form.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saverRef.current!.save();
      await batchSaverRef.current!.save();
      setSave("saved");
    } catch {
      // A failed check may be dismissed; a failed save must not submit old
      // quantities. Keep the draft open so the counter can retry the save.
      setSave("error");
      setChecking(false);
      return;
    }
    checkedRef.current = null;
    try {
      const res = await precheckCount(sessionId);
      findings = res.findings;
      sizeWarnings = res.sizeWarnings ?? [];
      truncated = res.truncated ?? 0;
      more = res.more ?? [];
      retiring = res.retiring ?? [];
      // What it looked at: submit hands these back (finish).
      checkedRef.current = { linesHash: res.linesHash, batchesHash: res.batchesHash };
    } catch {
      // A sanity check must never be able to prevent closing out a count, but
      // it must not pass for a clean one either: it used to submit straight
      // through, and the counter never knew nothing had been checked
      // (independent review, 2026-10-03). Say so, and let them decide.
      findings = [];
      retiring = [];
      checkFailed = true;
    } finally {
      setChecking(false);
    }
    setReviewDirty(false);
    setReviewMoved({});
    if (
      keepReviewOpen ||
      checkFailed ||
      uncounted.length > 0 ||
      findings.length > 0 ||
      sizeWarnings.length > 0 ||
      retiring.length > 0 ||
      restatementsRef.current.size > 0
    ) {
      setShowAllFindings(false);
      setShowAllDoubles(false);
      setConfirmSubmit({
        zones: uncounted,
        findings,
        sizeWarnings,
        truncated,
        more,
        doubles: [...restatementsRef.current.values()],
        retiring,
        checkFailed,
      });
      return;
    }
    void finish();
  }

  /** "There are no batch bottles right now." Writes an explicit ZERO for every
   *  active batch, which is a different thing from leaving them blank: zero
   *  means the shelf was walked and found empty, blank means nobody looked,
   *  and the server refuses to expand a bracket built on the latter.
   *
   *  Re-runs the whole pre-submit check rather than just closing — the answer
   *  should be re-verified by the same code that raised the question, and any
   *  OTHER finding in the dialog has to survive. The ref is updated alongside
   *  state because tryFinish flushes from the REF and React has not re-rendered
   *  yet at that point. */
  /**
   * "We don't carry it any more."
   *
   * Reversible server-side and it touches no count — every past count keeps
   * the numbers it already has. It is deliberately direct (no confirm step):
   * the label says what it does and it sits inside the named row.
   */
  async function retireSku(skuId: string) {
    if (retiringSkuId) return;
    setRetiringSkuId(skuId);
    setRetireErr(null);
    try {
      await setSkuActive(skuId, false);
      setArchived((a) => ({ ...a, [skuId]: true }));
    } catch {
      // Say so. Failing silently here is worse than not offering the button:
      // the counter believes the question is answered and it will be back
      // next count with no explanation.
      setRetireErr("Couldn't retire that — check the connection and try again.");
    } finally {
      setRetiringSkuId(null);
    }
  }

  async function recordNoBatches() {
    if (!zoneId || batches.length === 0) return;
    const zeros = Object.fromEntries(batches.map((b) => [b.id, 0]));
    setBatchCounts((prev) => ({ ...prev, [zoneId]: { ...(prev[zoneId] ?? {}), ...zeros } }));
    batchCountsRef.current = {
      ...batchCountsRef.current,
      [zoneId]: { ...(batchCountsRef.current[zoneId] ?? {}), ...zeros },
    };
    setConfirmSubmit(null);
    await tryFinish();
  }

  async function finish() {
    // Behind the disabled Finish button, and before the dialog closes: a take
    // that has not landed keeps the count open, with the dialog still up.
    if (voicePending || reviewDirty) return;
    setConfirmSubmit(null);
    if (!sessionId || submitting) return;
    setSubmitting(true);
    setSubmitErr(null);
    setSave("saving");
    let saved = false;
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saverRef.current!.save();
      await batchSaverRef.current!.save();
      saved = true;
      setSave("saved");
      const n = await submitCount(sessionId, undefined, checkedRef.current);
      forgetZone(sessionId); // the walk is over; "where I was" means nothing now
      restatementsRef.current.clear(); // spent — must not leak into a later session
      setDone(n);
    } catch (e) {
      setSubmitting(false);
      if (e instanceof ChangedSinceCheckError) {
        // Another phone, or a merged save, moved the count after the check the
        // counter just read. Check it again rather than close on that review.
        setSave("saved");
        void tryFinish(true);
        return;
      }
      if (!saved) setSave("error");
      else if (e instanceof SubmissionUnknownError) setSubmissionUnknown(true);
      else setSubmitErr("Count saved. Couldn't submit it. Tap Finish count to try again.");
    }
  }

  // search-to-add grid (only shown while searching — no alphabetized wall by default)
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    // Discontinued bottles (tprs 0196) sort after the ones we still carry.
    return catalog
      .filter((s) => skuMatchesSearch(s, q) && (counts[zoneId]?.[s.id] == null || catalogEditing === s.id))
      .sort((a, b) => Number(!!a.discontinuedAt) - Number(!!b.discontinuedAt))
      .slice(0, 30);
  }, [catalog, search, counts, zoneId, catalogEditing]);

  /** Full-container equivalents for one batch in the CURRENT zone. Touching a
   *  batch creates its key even at zero — that is the counter saying "I looked
   *  and there are none", which is what keeps the bracket symmetric. */
  function setBatch(batchId: string, n: number) {
    setBatchCounts((prev) => {
      const zone = { ...(prev[zoneId] ?? {}), [batchId]: Math.max(0, n) };
      return { ...prev, [zoneId]: zone };
    });
    scheduleSave();
  }
  const batchCells = batchCounts[zoneId] ?? {};

  const zoneCells = counts[zoneId] ?? {};
  const capturedHere = Object.entries(zoneCells).sort((a, b) =>
    (nameById.get(a[0]) ?? "").localeCompare(nameById.get(b[0]) ?? ""),
  );
  const capturedMatches = capturedHere.filter(([id]) => !search.trim() || (skuById.get(id) && skuMatchesSearch(skuById.get(id)!, search)));
  const capturedVisible = capturedMatches.filter(([id]) => !search.trim() || catalogEditing !== id);
  const enteredTotal = Object.values(counts).reduce((n, z) => n + Object.keys(z).length, 0);

  function changedInReview(dest: string, skuId: string) {
    checkedRef.current = null;
    restatementsRef.current.delete(`${dest}:${skuId}`);
    setReviewDirty(true);
  }

  function changeCountedItem(dest: string, from: string, to: string, mode: "move" | "add" | "replace") {
    if (checking || submitting || from === to || !skuById.has(to)) return;
    const prev = countsRef.current;
    const zone = { ...(prev[dest] ?? {}) };
    const source = zone[from];
    if (!source || (zone[to] && mode === "move")) return;
    const chained = pendingRemapsRef.current.filter((r) => r.zoneId === dest && (r.skus.includes(from) || r.skus.includes(to)));
    pendingRemapsRef.current = [
      ...pendingRemapsRef.current.filter((r) => !chained.includes(r)),
      { zoneId: dest, from: chained[0]?.from ?? from, to, skus: [...new Set([from, to, ...chained.flatMap((r) => r.skus)])] },
    ];
    // This deliberate remap answers the paused correction for these endpoints.
    remapConflictsRef.current = remapConflictsRef.current.filter((r) => r.zoneId !== dest || (!r.skus.includes(from) && !r.skus.includes(to)));
    setRemapConflicts(remapConflictsRef.current);
    zone[to] = mode === "add" && zone[to] ? combineCorrectedCells(source, zone[to]) : { ...source, source: "grid" };
    delete zone[from];
    const next = { ...prev, [dest]: zone };
    countsRef.current = next;
    setCounts(next);
    setReviewMoved((prev) => ({ ...Object.fromEntries(Object.entries(prev).map(([key, value]) =>
      [key, key.startsWith(`${dest}:`) && value === from ? to : value])), [`${dest}:${from}`]: to }));
    changedInReview(dest, from);
    restatementsRef.current.delete(`${dest}:${to}`);
    scheduleSave();
  }

  function keepSavedRemapCounts() {
    remapConflictsRef.current = [];
    setRemapConflicts([]);
    setSave("idle");
    checkedRef.current = null;
    setReviewDirty(true);
    scheduleSave();
  }

  function remapConflictNotice() {
    if (!remapConflicts.length) return null;
    return <div className="lq-review-changed" role="alert">
      <strong>Item correction needs another look</strong>
      <p>Another save changed a bottle in this correction. These are the current saved counts. Use “Change item or size” again to confirm the correction.</p>
      {remapConflicts.map((r, i) => <p key={i}>
        {zoneNames[r.zoneId] ?? "Saved shelf"}: {r.skus.map((id) => {
          const cell = counts[r.zoneId]?.[id];
          return `${nameById.get(id) ?? "Item"}: ${cell ? formatQty(cell.qty) : "not counted"}`;
        }).join(" · ")}
      </p>)}
      <button type="button" className="lq-btn lq-btn-ghost" disabled={checking || submitting} onClick={keepSavedRemapCounts}>Keep saved counts</button>
    </div>;
  }

  function findingCountDetails(f: PrecheckFinding) {
    // Server findings may describe a pair or size family. Use stable SKU IDs
    // when supplied; the name fallback supports an older size-family reply.
    const ids = new Set(f.relatedSkuIds ?? [f.skuId]);
    if (f.skuId.startsWith("family:")) {
      const family = normalizedSearch(f.skuId.slice(7));
      for (const s of catalog) if (normalizedSearch(s.name) === family) ids.add(s.id);
    }
    if (![...ids].some((id) => skuById.has(id))) return undefined;
    const rows = Object.entries(counts).flatMap(([dest, cells]) =>
      Object.entries(cells).filter(([id]) => ids.has(id) || [...ids].some((old) => reviewMoved[`${dest}:${old}`] === id))
        .map(([id, cell]) => ({ dest, id, cell })),
    ).sort((a, b) => (zones.find((z) => z.id === a.dest)?.walkOrder ?? 999) - (zones.find((z) => z.id === b.dest)?.walkOrder ?? 999));
    return (
      <div className="lq-review-counts">
        <p className="lq-review-counts-heading">Where you counted</p>
        {rows.length === 0 && <p>No count entered for this item yet.</p>}
        {rows.map(({ dest, id, cell }) => {
          const s = skuById.get(id)!;
          const shelf = zoneNames[dest] ?? "Saved shelf";
          return <ReviewCountRow key={`${dest}:${id}`} sku={s} cell={cell} shelf={shelf}
            catalog={catalog} existing={counts[dest] ?? {}} disabled={checking || submitting}
            quantitiesDisabled={remapConflicts.some((r) => r.zoneId === dest && r.skus.includes(id))}
            onLoose={(n) => { setQty(id, n, true, dest); changedInReview(dest, id); }}
            onCases={(n) => { setCases(id, n, dest); changedInReview(dest, id); }}
            onChangeItem={(to, mode) => changeCountedItem(dest, id, to, mode)} />;
        })}
        <button type="button" className="lq-linkbtn" disabled={checking || submitting} onClick={() => {
          const dest = f.zoneId ?? rows[0]?.dest ?? zoneId;
          setZoneId(dest);
          rememberZone(sessionId, dest);
          setSearch(skuById.get(f.skuId)?.name ?? f.name);
          setCatalogEditing(null);
          setCaseAsk(null);
          setCaseAskErr(null);
          setConfirmSubmit(null);
          requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".lq-count > .lq-count-controls .lq-search")?.scrollIntoView({ block: "center" }));
        }}>Open on count screen</button>
      </div>
    );
  }

  if (phase === "loading") return <div className="lq-center lq-muted">Starting count…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't start the count.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );
  if (entryDraft) return <CountEntryChoice kind="liquor" draft={entryDraft} busy={entryBusy} error={entryError}
    onContinue={continueEntry} onNew={() => void startEntry()} onBack={() => {
      if (entryBusyRef.current) return;
      entryBusyRef.current = true;
      onDone();
    }} />;
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
      {!confirmSubmit && remapConflictNotice()}
      <fieldset className="lq-count-controls" disabled={checking || submitting || remapConflicts.length > 0} aria-label="Count stock">
      {resumed && (
        <div className="lq-resumed">
          <span>↩ Picked up your count in progress.</span>
          <button type="button" className="lq-linkbtn" disabled={startingFresh || submitting || checking || voicePending} onClick={() => void startFresh()}>
            {startingFresh ? "Starting…" : "Start a new count"}
          </button>

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
              // A take is one shelf: while the mic is live the tiles hold still.
              // After Stop they free up — the take's shelf is already pinned.
              // Both flags: a recorder that never reports `recording` (the Web
              // Speech fallback can no-op) must not latch the tiles shut.
              disabled={capturing || checking || submitting}
              // Close any open "+ case size" editor — otherwise one left open
              // on Tito's in Back Bar reappears open on Tito's in Well.
              onClick={() => { setZoneId(z.id); rememberZone(sessionId, z.id); setSearch(""); setCatalogEditing(null); setCaseAsk(null); setCaseAskErr(null); }}
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
        ) : capturing ? (
          <div className={`lq-rec${near ? " lq-rec-warn" : ""}`}>
            <div className="lq-rec-head">
              <span className="lq-rec-dot" aria-hidden="true" />
              <span className="lq-rec-label">{dict.quiet ? "Mic silent" : "Listening…"}</span>
              <span className="lq-rec-timer">{mmss(dict.seconds)} / {mmss(CAP_SECONDS)}</span>
            </div>
            <p className="lq-muted lq-rec-shelf">
              Counting <strong>{zones.find((z) => z.id === (takeZoneId ?? zoneId))?.name ?? "this zone"}</strong>
            </p>
            {dict.metering && (
              <div className={`lq-mic-meter${dict.quiet ? " is-quiet" : ""}`} aria-hidden="true">
                <div className="lq-mic-meter-fill" style={{ width: `${Math.round(dict.level * 100)}%` }} />
              </div>
            )}
            {dict.quiet && (
              <p className="lq-rec-warntext" role="status">The phone mic hasn't heard speech for a bit. If you're still counting, speak toward the phone. After a call, stop and check what came back.</p>

            )}
            <p className="lq-rec-transcript" ref={liveTextRef}>
              {dict.transcript ||
                (!dict.armed ? (
                  // Phone mic still starting — words spoken now would be lost.
                  <span className="lq-muted">Connecting to mic… (buzzes when ready)</span>
                ) : (
                  <span className="lq-muted">Say the bottle name, then how many: “Tito’s, three. Bulleit, four.” Pause between bottles.</span>
                ))}
              {dict.interim && <span className="lq-muted"> {dict.interim}</span>}
            </p>
            {near && <p className="lq-rec-warntext">Wrap up this bottle — stopping at {mmss(CAP_SECONDS)}.</p>}
            <button
              type="button"
              className="lq-btn lq-btn-primary lq-rec-stop"
              disabled={!capturing}
              onClick={() => {
                setCapturing(false); // speech is over; the shelf tiles are free again
                dict.stop();
              }}
            >
              ■ Stop &amp; review
            </button>
          </div>
        ) : processingVoice ? (
          dict.transcript ? <p className="lq-rec-transcript">{dict.transcript}</p> : null
        ) : (
          <button
            type="button"
            className="lq-record"
            // ONE OUTSTANDING TAKE AT A TIME: there is a single takeZoneId, so a
            // second take would re-point the first one's unreviewed rows.
            disabled={checking || submitting || (review?.length ?? 0) > 0}
            onClick={() => {
              if (checking || submitting) return;
              setVoiceErr(null);
              setTakeZoneId(zoneId); // the shelf this take is about
              setCapturing(true);
              carryRef.current!.reset(); // a discarded take must not leak its held phrase
              segmentGapRef.current = false;
              segExtractsRef.current = new Map();
              dict.start();
            }}
          >
            <span className="lq-record-emoji" aria-hidden="true">🎤</span>
            <span>Record count for {zones.find((z) => z.id === zoneId)?.name ?? "this zone"}</span>
          </button>
        )}
        {voiceErr && <p className="lq-error lq-voice-err">{voiceErr}</p>}
        {dict.error && !dict.recording && (
          <p className="lq-error lq-voice-err" role="alert">
            {dict.error === "not-allowed" || dict.error === "service-not-allowed"
              ? "Allow microphone access, then try recording again."
              : dict.error === "audio-capture"
                ? "The phone microphone stopped. Stop any call, then record the missing items or type them."
                : "Part of the recording couldn't be transcribed. Check the heard bottles, then record the missing items or type them."}
          </p>
        )}
      </div>

      {interrupted && (
        <div className="lq-resumed" role="status">
          <span>Recording may have paused. Check heard items for gaps.</span>
          <button type="button" className="lq-linkbtn" onClick={() => setInterrupted(false)}>Got it</button>
        </div>
      )}

      {/* search-to-add */}
      <input
        className="lq-search"
        type="search"
        inputMode="search"
        placeholder="Find a counted item or add a bottle…"
        aria-label="Search counted items and catalog"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setCatalogEditing(null); }}
      />
      {search.trim() && <button type="button" className="lq-linkbtn" disabled={checking || submitting}
        onClick={() => { setSearch(""); setCatalogEditing(null); }}>Clear search</button>}
      {searchResults.length > 0 && (
        <div className="lq-searchlist">
          <h3 className="lq-cap-title">Find or add item</h3>
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
                  {s.discontinuedAt && <span className="lq-muted lq-row-leftover">discontinued, count leftovers</span>}
                </div>
                {/* Cell-first, exactly like the captured row and like setCases
                    itself. Reading the catalog alone would label a resumed
                    2x12 row "cs ×24" after the catalog learned 24, while the
                    math correctly stayed at 12 — a label that lies. */}
                {(cell?.caseSize ?? s.unitsPerCase) != null ? (
                  <CaseBox
                    cases={cell?.cases ?? 0}
                    caseSize={(cell?.caseSize ?? s.unitsPerCase)!}
                    onChange={(n) => { setCatalogEditing(s.id); setCases(s.id, n); }}
                    disabled={submitting || checking}
                  />
                ) : (
                  renderCaseAsk(`s:${s.id}`, s.id)
                )}
                <div className="lq-quantity">
                  <span className="lq-qty-label">{s.trackingMode === "stock_count" ? "Loose each" : "Loose bottles"}</span>
                  <div className="lq-stepper">
                  <button type="button" className="lq-step" disabled={loose <= 0 || submitting || checking} aria-label={`decrease ${s.name}`} onClick={() => { setCatalogEditing(s.id); setQty(s.id, roundQty(loose - 1)); }}>−</button>
                  {/* A can or a jar has no tenths. Whole-number step + a numeric
                      keypad on non-bottles removes the "2.3 Red Bulls" typo
                      outright, rather than catching it downstream. */}
                  <CountQuantityInput
                    className="lq-qty-input"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={0}
                    value={loose}
                    blankZero={!cell}
                    disabled={submitting || checking}
                    placeholder="0"
                    onQuantity={(n, raw) => { if (raw !== "" && Number(raw) >= 0) { setCatalogEditing(s.id); setQty(s.id, n, true); } }}
                    aria-label={`Loose ${s.name}`}
                  />
                  <button type="button" className="lq-step" disabled={submitting || checking} aria-label={`increase ${s.name}`} onClick={() => { setCatalogEditing(s.id); setQty(s.id, roundQty(loose + 1)); }}>+</button>
                  </div>
                </div>
                {(cell?.cases ?? 0) > 0 && <span className="lq-case-sum">= {formatQty(qty)} each</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* PREP BATCHES (2026-09-04) — liquor already poured OUT of its bottles.
          Its own shelf, so its own block: the source bottle is low and recorded
          while the prep container holds ounces nothing counts, which reads as
          loss. Sept 4: Cointreau used 0.0oz against 7.0 rung, Tito's 175.8
          against 172.0 — the same distortion in both directions.

          The counter enters FULL CONTAINERS, never ounces. He already eyeballs
          a spirit bottle in tenths, so 2.5 is a shape he owns; the recipe and
          every conversion live on the server. Typing a value — INCLUDING a
          zero — is what tells the bracket somebody walked this shelf. */}
      {batches.length > 0 && (
        <div className="lq-captured">
          <h3 className="lq-cap-title">
            Batch bottles in {zones.find((z) => z.id === zoneId)?.name ?? "this zone"}
            <span className="lq-cap-n">{Object.keys(batchCells).length}</span>
          </h3>
          <p className="lq-muted lq-cap-empty">
            Full bottles here? Half = 0.5. None = 0.
          </p>
          {batches.map((b) => {
            const v = batchCells[b.id];
            const touched = v != null;
            return (
              <div key={b.id} className={`lq-row${touched ? " lq-row-set" : ""}`}>
                <div className="lq-row-name">
                  <span className="lq-name">
                    <span className="lq-kind-tag" title="prep batch — counted in full containers" aria-hidden="true">
                      🧪{" "}
                    </span>
                    {b.name}
                  </span>
                  <span className="lq-size">
                    {b.components.map((c) => `${c.oz}oz ${c.skuName}`).join(" · ") || "no recipe on file"}
                  </span>
                </div>
                <div className="lq-stepper">
                  <button
                    type="button"
                    className="lq-step"
                    aria-label={`decrease ${b.name}`}
                    disabled={(v ?? 0) <= 0 || submitting || checking}
                      onClick={() => setBatch(b.id, Number(Math.max(0, (v ?? 0) - 0.5).toFixed(10)))}
                  >
                    −
                  </button>
                  <CountQuantityInput
                    className="lq-qty-input"
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={0}
                    value={touched ? v : undefined}
                    placeholder="—"
                    aria-label={`${b.name} full containers`}
                    onQuantity={(n, raw) => { if (raw !== "" && Number(raw) >= 0) setBatch(b.id, n); }}
                  />
                  <button
                    type="button"
                    className="lq-step"
                    aria-label={`increase ${b.name}`}
                      onClick={() => setBatch(b.id, Number(((v ?? 0) + 0.5).toFixed(10)))}
                  >
                    +
                  </button>
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
        {search.trim() && <p className="lq-muted" role="status">{capturedMatches.length} of {capturedHere.length} counted items match.</p>}
        {capturedHere.length === 0 ? (
          <p className="lq-muted lq-cap-empty">Nothing here yet — record the shelf, or search above to add one.</p>
        ) : (
          capturedMatches.length === 0 ? <p className="lq-muted lq-cap-empty">No counted items match on this shelf. Try another name or clear the search.</p> : capturedVisible.map(([skuId, cell]) => {
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
                {sku && <span className="lq-size">{sizeLabel(sku)}</span>}
                {cell.raw && <span className="lq-size lq-heard">heard: “{cell.raw}”</span>}
                {(cell.cases ?? 0) > 0 && cell.caseSize && (
                  <span className="lq-size lq-case-total">
                    {formatQty(cell.cases)} case{cell.cases === 1 ? "" : "s"} × {formatQty(cell.caseSize)}
                    {loose > 0 ? ` + ${formatQty(loose)}` : ""} = {formatQty(cell.qty)}
                  </span>
                )}
              </div>
              {caseSize != null ? (
                <CaseBox cases={cell.cases ?? 0} caseSize={caseSize} onChange={(n) => setCases(skuId, n)} disabled={submitting || checking} />
              ) : (
                renderCaseAsk(`c:${skuId}`, skuId)
              )}
              <div className="lq-quantity">
                <span className="lq-qty-label">{sku?.trackingMode === "stock_count" ? "Loose each" : "Loose bottles"}</span>
                <div className="lq-stepper">
                <button type="button" className="lq-step" disabled={loose <= 0 || submitting || checking} aria-label={`decrease ${nameById.get(skuId) ?? "item"}`} onClick={() => setQty(skuId, roundQty(loose - 1))}>−</button>
                <CountQuantityInput
                  className="lq-qty-input"
                  type="number"
                  // Non-bottles step in whole units — no tenths of a can.
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  // Counted cells show a real zero; an untouched search result
                  // only has a placeholder. Focus/blur alone records nothing.
                  value={loose}
                  blankZero={!cell}
                  disabled={submitting || checking}
                  placeholder="0"
                  onQuantity={(n, raw) => { if (raw !== "" && Number(raw) >= 0) setQty(skuId, n, true); }}
                  aria-label={`Loose ${nameById.get(skuId) ?? "item"}`}
                />
                <button type="button" className="lq-step" disabled={submitting || checking} aria-label={`increase ${nameById.get(skuId) ?? "item"}`} onClick={() => setQty(skuId, roundQty(loose + 1))}>+</button>
                </div>
              </div>
              <button
                type="button"
                className="lq-row-x"
                aria-label={`remove ${nameById.get(skuId) ?? "bottle"}`}
                disabled={submitting || checking}
                onClick={() => clearCell(skuId)}
              >
                ✕
              </button>
            </div>
            );
          })
        )}
      </div>

      </fieldset>

      {/* footer */}
      <div className="lq-footer" ref={footerRef}>
        {processingVoice && <VoiceProcessing transcribing={dict.recording}
          destination={zones.find(z => z.id === (takeZoneId ?? zoneId))?.name ?? "this location"} />}
        <div className={`lq-savestate${submitErr || save === "error" ? " lq-fc-saveerr" : ""}`} role={submitErr || save === "error" ? "alert" : "status"}>
          {submitErr && <span>{submitErr}</span>}
          {!submitErr && <>
          {save === "saving" && "Saving…"}
          {save === "saved" && "Saved ✓"}
          {merged && save !== "error" && <span className="lq-muted"> · included a change made elsewhere</span>}
          {save === "error" && <span>Not saved yet. Keep this screen open and retry.</span>}
          </>}
          {save === "error" && <button type="button" className="lq-linkbtn lq-save-retry" disabled={submitting || checking} onClick={() => void flush()}>Retry save</button>}
        </div>
        <div className="lq-footer-actions">
          <span className="lq-muted lq-count-tally">{capturedHere.length} here · {enteredTotal} total</span>
          <button type="button" className="lq-btn lq-btn-ghost" disabled={voicePending || checking || submitting} onClick={onDone}>Home</button>
          <button
            type="button"
            className={`lq-btn lq-btn-primary${checking ? " lq-btn-spotchecking" : ""}`}
            disabled={submitting || checking || enteredTotal === 0 || voicePending}
            onClick={() => void tryFinish()}
          >
            {submitting
              ? "Submitting…"
              : checking
                ? "Checking…"
                : processingVoice
                  ? "Processing…"
                  : dict.recording
                    ? "Stop recording first"
                    : voicePending
                      ? "Review heard items"
                      : "Finish count"}
            {/* Progress over the server's 15s worst-case budget — never a fake
                "almost done". A typical check lands ~5s in with the bar ~40%
                full, which reads as finishing early rather than stalling. */}
            {checking && <span className="lq-spotbar" aria-hidden="true" />}
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
                Going to <strong>{zones.find((z) => z.id === (takeZoneId ?? zoneId))?.name ?? "this zone"}</strong>
                {" · "}
                {reviewResolved} ready{reviewPending > 0 && ` · ${reviewPending} need a tap`}
              </p>
              {voiceErr && <p className="lq-error" role="status">{voiceErr}</p>}
              {dict.error && <p className="lq-error" role="status">Some audio may be missing. Check this list.</p>}
            </div>
            <div className="lq-sheet-body">
              {review.map((it, idx) => (
                <ReviewRow
                  key={it.key}
                  item={it}
                  catalog={catalog}
                  onResolve={(res) =>
                    setReview((r) => {
                      if (!r) return r;
                      const next = r.map((x, i) => {
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
                          quantityNeedsReview: res.quantityConfirmed === false ? x.quantityNeedsReview : false,
                          nameCheck: null,
                          highCheck: null,
                          explicitZero: res.explicitZero,

                          // A row with no cases cannot need a case size — that
                          // is the server's own rule (cases > 0 && ups == null).
                          // Without this, typing an each-count to escape the
                          // "how many in a case?" prompt zeroed cases but left
                          // the row needing a size forever: permanently
                          // un-applyable, still showing the prompt, and the only
                          // exit was ✕ — which drops the bottle from the count.
                          needsCaseSize: res.cases > 0 ? x.needsCaseSize : false,
                        };
                      });
                      const before = r[idx], after = next[idx];
                      const changed = before && after && (before.qty !== after.qty ||
                        quantityBlocked(before) !== quantityBlocked(after));
                      // The current human answer stays confirmed. Only a
                      // changed prior amount/source hold can change the
                      // history total of later rows for this same bottle.
                      return changed ? next.map((x, i) => i > idx && x.chosenSkuId === after.chosenSkuId
                        ? { ...x, highCheck: highFor(x, next, i) } : x) : next;
                    })
                  }
                  onPick={(skuId) =>
                    setReview((r) => {
                      if (!r) return r;
                      const next = r.map((x, i) => {
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
                          // The bottle just picked may carry a number in its name.
                          nameCheck: nameNumberCheck(x.units, x.cases, skuById.get(skuId)?.name),
                        };
                      });
                      // Changing an earlier identity also changes which later
                      // row owns its recount question and cumulative history.
                      return next.map((x, i) => recheck(x, next, i, r));
                    })
                  }
                  onToggleAssign={() => setReview((r) => r && r.map((x, i) => (i === idx ? { ...x, assignOpen: !x.assignOpen } : x)))}
                  shelf={zones.find((z) => z.id === (takeZoneId ?? zoneId))?.name ?? "this shelf"}
                  onRestate={(a) => setReview((r) => r && r.map((x, i) => (i === idx ? { ...x, restateAnswer: a } : x)))}
                  // Indices shift on removal, so a stale error would re-attach
                  // itself to whichever row slid into this slot.
                  onRemove={() => { setCaseErr(null); setReview((r) => {
                    if (!r || r.length <= 1) return null;
                    const next = r.filter((_, i) => i !== idx);
                    return next.map((x, i) => recheck(x, next, i, r));
                  }); }}
                  onCaseSize={(n) => void answerCaseSize(idx, n)}
                  caseErr={caseErr?.idx === idx ? caseErr.msg : null}
                />
              ))}
            </div>
            <div className="lq-sheet-foot">
              <button type="button" className="lq-btn lq-btn-ghost" onClick={() => { setReview(null); setCaseErr(null); }}>Discard</button>
              <button type="button" className="lq-btn lq-btn-primary" disabled={reviewResolved === 0} onClick={applyReview}>
                Add {reviewResolved} to {zones.find((z) => z.id === (takeZoneId ?? zoneId))?.name ?? "zone"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* pre-submit review: uncounted zones + flagged bottles */}
      {confirmSubmit && (
        <div className="lq-sheet" role="dialog" aria-modal="true" aria-label="Before you submit">
          <div className="lq-sheet-panel lq-confirm">
            <div className="lq-confirm-body">
            <div className="lq-sheet-head">
              <h3 className="lq-h2">
                {confirmSubmit.findings.length > 0 || confirmSubmit.doubles.length > 0 || confirmSubmit.sizeWarnings.length > 0
                  ? "Double-check these first?"
                  : confirmSubmit.checkFailed
                    ? "The check couldn't run"
                    : confirmSubmit.zones.length > 0
                      ? "Submit an incomplete count?"
                      // Retirement candidates alone. The count is COMPLETE and
                      // nothing is wrong with it — calling it incomplete because
                      // an advisory list opened would be a plain lie.
                      : confirmSubmit.retiring.length > 0 ? "One thing before you submit" : "Ready to submit"}
              </h3>
              <p className="lq-muted">
                {rechecked && (
                  <>This is a fresh check of the saved count.{" "}</>
                )}
                {confirmSubmit.checkFailed && (
                  <>Nothing was checked: the pre-submit check couldn't reach the server. Retry the check, or submit anyway.{" "}</>
                )}
                {confirmSubmit.zones.length > 0 && (
                  <>
                    No bottles counted in: <strong>{confirmSubmit.zones.join(", ")}</strong>.{" "}
                  </>
                )}
                Submit closes this count.
              </p>
            </div>
            {reviewDirty && <p className="lq-review-changed" role="status">Count changed. Recheck before submitting.</p>}
            {remapConflictNotice()}
            {save === "error" && remapConflicts.length === 0 && <p className="lq-error" role="alert">Not saved yet. Check the connection and tap Recheck count.</p>}
            <BottleSizeWarnings warnings={confirmSubmit.sizeWarnings} />
            {confirmSubmit.findings.length > 0 && (
              <div className="lq-precheck">
                {(showAllFindings ? [...confirmSubmit.findings, ...confirmSubmit.more] : confirmSubmit.findings).map((f) => (
                  // kind in the key: one SKU can carry two findings (e.g. a
                  // zone_missed on a bottle that is also overused).
                  <div key={`${f.kind}:${f.skuId}`} className="lq-precheck-row">
                    <span className="lq-precheck-name">{f.name}</span>
                    <FindingSummary finding={reviewDirty && skuById.has(f.skuId) ? { ...f, counted: Object.values(counts).reduce((total, cells) => total + (cells[f.skuId]?.qty ?? 0), 0) } : f}
                      unit={skuById.get(f.skuId)?.countUnit ?? (skuById.get(f.skuId)?.trackingMode === "stock_count" ? "each" : "bottles")}
                      countDetails={findingCountDetails(f)} />

                    {/* One of TWO findings with a one-tap remedy (the other is
                        not_counted, below), because these are the two where the
                        honest answer is a fact the counter already knows rather
                        than a judgement he can only make at the shelf. Here the
                        answer is often simply "none", and he would otherwise
                        have to leave the dialog, find the section and type two
                        zeros.

                        Zone is bookkeeping here — the server sums batch rows
                        across zones — so this writes the zeros into whichever
                        zone he is on, and the label says plainly that it is a
                        claim about the whole venue, not this shelf. */}
                    {/* Hidden when the batch list failed to load — the handler
                        no-ops on an empty list, and a button that does nothing
                        is worse than none (QA 2026-09-04). */}
                    {f.kind === "batch_not_counted" && batches.length > 0 && (
                      <button
                        type="button"
                        className="lq-btn lq-btn-ghost lq-precheck-action"
                        disabled={checking || submitting}
                        onClick={() => void recordNoBatches()}
                      >
                        No batch bottles anywhere right now — record zero
                      </button>
                    )}
                    {/* "Do we still carry this?" asked where it actually comes
                        up — on the bottle that was counted last time and has no
                        line now. The timed list further down catches what nobody
                        noticed; this catches what the counter knows RIGHT NOW,
                        and waiting two months to ask about a bottle he already
                        knows is discontinued is just making him repeat himself.

                        Only on not_counted. NOT on purchased_not_counted: that
                        one arrived on an invoice this period, so we demonstrably
                        do still carry it — and offering to retire it would
                        contradict the rule the timed list is built on, where a
                        recent purchase is exactly what proves a product is
                        incoming rather than dying.

                        The other answer — "it's still there, I missed it" — has
                        no button on purpose. That one needs him at the shelf. */}
                    {f.kind === "not_counted" &&
                      (archived[f.skuId] ? (
                        <span className="lq-precheck-answered">
                          Retired. Off the next count sheet.
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="lq-btn lq-btn-ghost lq-precheck-action"
                          disabled={checking || submitting || retiringSkuId != null}
                          onClick={() => void retireSku(f.skuId)}
                        >
                          {retiringSkuId === f.skuId
                            ? "Retiring…"
                            : "No longer carried"}
                        </button>
                      ))}
                  </div>
                ))}
                {/* The cap decides what opens, not what can be seen. A server
                    without `more` keeps the old line. */}
                {!showAllFindings && confirmSubmit.more.length > 0 ? (
                  <button type="button" className="lq-linkbtn lq-precheck-showmore" onClick={() => setShowAllFindings(true)}>
                    Show {confirmSubmit.more.length} more
                  </button>
                ) : confirmSubmit.more.length === 0 && confirmSubmit.truncated > 0 && (
                  <p className="lq-precheck-more">+ {confirmSubmit.truncated} more not shown.</p>
                )}
              </div>
            )}
            {confirmSubmit.retiring.length > 0 && (
              <div className="lq-retiring">
                <p className="lq-retiring-h">Have we stopped carrying these?</p>
                <p className="lq-muted lq-retiring-sub">
                  No recent stock or purchases. Retire items we no longer carry.
                </p>
                {confirmSubmit.retiring.map((r) => (
                  <div key={r.skuId} className="lq-retiring-row">
                    <span className="lq-precheck-name">{r.name}</span>
                    <span className="lq-precheck-detail">
                      Last seen with stock {r.daysSinceStock} days ago;{" "}
                      {r.daysSincePurchase == null
                        ? "never purchased on a scanned invoice"
                        : `last bought ${r.daysSincePurchase} days ago`}
                      .
                    </span>
                    {archived[r.skuId] ? (
                      <span className="lq-retiring-done">
                        Retired. It will not be on the next count sheet.
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="lq-btn lq-btn-ghost lq-retiring-btn"
                        disabled={retiringSkuId != null}
                        onClick={() => void retireSku(r.skuId)}
                      >
                        {retiringSkuId === r.skuId
                          ? "Retiring…"
                          : "We don't carry it any more"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {confirmSubmit.doubles.length > 0 && (
              // Same never-say-recount discipline as the findings above: a
              // second bottle found later and a re-said first bottle produce
              // the identical cell state, and only the counter knows which.
              <div className="lq-precheck">
                {(showAllDoubles ? confirmSubmit.doubles : confirmSubmit.doubles.slice(0, 6)).map((d) => (
                  <div key={d.key} className="lq-precheck-row">
                    <span className="lq-precheck-name">{d.name}</span>
                    <span className="lq-precheck-detail">
                      {d.zone}: {formatQty(d.before)} + {formatQty(d.added)} = {formatQty(d.after)}
                    </span>
                    <span className="lq-precheck-why">
                      Extra stock or said twice? If repeated, correct the count to {formatQty(d.before >= d.added ? d.before : d.added)}.
                    </span>
                  </div>
                ))}
                {!showAllDoubles && confirmSubmit.doubles.length > 6 && (
                  <button type="button" className="lq-linkbtn lq-precheck-showmore" onClick={() => setShowAllDoubles(true)}>
                    Show {confirmSubmit.doubles.length - 6} more
                  </button>
                )}
              </div>
            )}
            </div>
            <div className="lq-sheet-foot">
              <button type="button" className="lq-btn lq-btn-ghost" onClick={() => setConfirmSubmit(null)}>
                Go back
              </button>
              {(confirmSubmit.checkFailed || reviewDirty) && <button type="button" className="lq-btn lq-btn-ghost" disabled={checking || submitting} onClick={() => { void tryFinish(true, true); }}>{checking ? "Checking…" : reviewDirty ? "Recheck count" : "Retry check"}</button>}
              {retireErr && <span className="lq-retire-err">{retireErr}</span>}
              {/* Always dismissible. The check is advice, not a gate — if the
                  count is right and an invoice is simply missing, forcing a
                  change here would be the worst outcome available. */}
              {/* Blocked only while a RETIREMENT is settling — a second or two,
                  and the alternative is finishing the count while the answer
                  you just gave is still in the air. Everything else stays
                  dismissible. */}
              <button
                type="button"
                className="lq-btn lq-btn-primary"
                disabled={retiringSkuId != null || voicePending || submitting || checking || reviewDirty}
                onClick={() => void finish()}
              >
                {confirmSubmit.findings.length > 0 ||
                confirmSubmit.sizeWarnings.length > 0 ||
                confirmSubmit.doubles.length > 0 ||
                confirmSubmit.zones.length > 0 ||
                confirmSubmit.checkFailed
                  ? "Submit anyway"
                  : "Submit the count"}
              </button>
            </div>
          </div>
        </div>
      )}
      {submissionUnknown && sessionId && <CountSubmitRecovery sessionId={sessionId} onDone={onDone}
        onDraft={() => { setSubmissionUnknown(false); setSubmitErr("Count saved. It is still open. Tap Finish count to try again."); }}
        onSubmitted={(n) => { forgetZone(sessionId); restatementsRef.current.clear(); setSubmissionUnknown(false); setDone(n); }} />}
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
  shelf,
  onRestate,
}: {
  item: ReviewItem;
  catalog: BarSkuItem[];
  /** The take's shelf, named in the earlier-take question. */
  shelf: string;
  /** The earlier-take answer; undefined asks again. */
  onRestate: (answer: "replace" | "add" | undefined) => void;
  /** Set this row's quantity EXPLICITLY. Must carry cases and units, not a
   *  single total — applyReview reads those two fields, so a handler that only
   *  set `qty` would render a corrected number and then apply the old one. */
  onResolve: (res: { cases: number; units: number; explicitZero?: boolean; quantityConfirmed?: boolean }) => void;
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
    const t = q.trim();
    if (!t) return [];
    return catalog.filter((s) => skuMatchesSearch(s, t)).slice(0, 6);
  }, [q, catalog]);

  // needs_case outranks everything: the bottle may be perfectly matched, but
  // without a case size the quantity is unknowable and must not be applied.
  // IDENTIFY THE BOTTLE FIRST. needs_case used to outrank everything, so
  // "four cases of Bulleit" (Bourbon and 95 Rye both in the catalog) showed
  // "how many in a case?" with no way to say WHICH Bulleit — and the Save
  // button silently did nothing, because answering a case size requires a
  // chosen SKU. The row became a dead end whose only exit was deleting it,
  // which drops that bottle from the count entirely.
  const blocked = quantityBlocked(item);
  const state: "quantity" | "needs_case" | "suspect" | "name_number" | "high" | "restate" | "matched" | "ambiguous" | "unmatched" = !item.chosenSkuId
    ? item.candidates.length > 0
      ? "ambiguous"
      : "unmatched"
    : blocked
      ? "quantity"
      : item.needsCaseSize
      ? "needs_case"
      : item.suspectPreMultiplied
        ? "suspect"
        : item.nameCheck
          ? "name_number"
          : item.highCheck
            ? "high"
            : item.restate && !item.restateAnswer
              ? "restate"
              : "matched";

  return (
    <div className={`lq-rev lq-rev-${state}`}>
      <div className="lq-rev-top">
        <span className="lq-rev-spoken">“{item.spoken}”</span>
        <div className="lq-rev-qtywrap">
          {item.cases > 0 && item.unitsPerCase != null ? (
            <span className="lq-rev-casemath">
              {formatQty(item.cases)} cs ×{formatQty(item.unitsPerCase)}
              {item.units > 0 ? ` + ${formatQty(item.units)}` : ""} =
            </span>
          ) : (
            <span className="lq-muted">×</span>
          )}
          <CountQuantityInput
            // Amber edge, no text: the server could not re-prove this model
            // number. Typing a number clears it (onResolve).
            className={`lq-qty-input${item.quantityNeedsReview && !blocked && item.qty > 0 ? " lq-qty-unproved" : ""}`}
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            // A reused source or a held zero is left for the counter to enter.
            value={blocked ? undefined : item.qty}
            blankZero={!item.explicitZero}
            placeholder="Qty"
            // A typed number is a plain each-count and REPLACES whatever the
            // model heard — cases go to 0 so cases x size can't be added on top.
            onQuantity={(n, raw) => onResolve({ cases: 0, units: raw !== "" && Number(raw) >= 0 ? n : 0,
              explicitZero: raw !== "" && Number(raw) === 0, quantityConfirmed: raw !== "" && Number(raw) >= 0 })}
            aria-label={`Total quantity for ${chosen?.name ?? item.spoken}`}
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
            Heard {formatQty(item.cases)} case{item.cases === 1 ? "" : "s"}
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
            {/* Same three picks as the grid. This is the likelier entry point —
                it fires the moment someone says "four cases of X" for a bottle
                we have no size on file for. */}
            {COMMON_CASE_SIZES.map((c) => (
              <button
                key={c}
                type="button"
                className="lq-chip lq-caseask-pick"
                onClick={() => setCaseAnswer(String(c))}
              >
                {c}
              </button>
            ))}
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
              {Number(caseAnswer) >= 2 ? `Save ${Number(caseAnswer)}/case` : "Save"}
            </button>
          </div>
          {caseAnswer.trim() !== "" &&
            Number.isInteger(Number(caseAnswer)) &&
            Number(caseAnswer) >= 2 &&
            isOddCaseSize(Number(caseAnswer)) && (
              <span className="lq-caseask-warn lq-rev-hint">
                {Number(caseAnswer)} per case? Every case here has been 6, 12 or 24 — worth a look at the box.
              </span>
            )}
          {caseErr && <span className="lq-error lq-rev-hint">{caseErr}</span>}
        </div>
      )}

      {/* The model was told never to multiply cases out and appears to have
          done it anyway. Adding both readings would double; make a human pick. */}
      {state === "suspect" && (
        <div className="lq-rev-choices">
          <span className="lq-error lq-rev-hint">
            Heard {formatQty(item.cases)} case{item.cases === 1 ? "" : "s"} AND {formatQty(item.units)} each — which did you mean?
          </span>
          {/* Keep the case provenance on the "cases" branch so the count detail
              can still show "4 cs x 24"; the "each" branch is loose by definition. */}
          <button type="button" className="lq-chip" onClick={() => onResolve({ cases: item.cases, units: 0 })}>
            {formatQty(item.cases)} case{item.cases === 1 ? "" : "s"} ({formatQty(item.cases * (item.unitsPerCase ?? 0))})
          </button>
          <button type="button" className="lq-chip" onClick={() => onResolve({ cases: 0, units: item.units })}>
            {formatQty(item.units)} each
          </button>
        </div>
      )}

      {/* "Seagram's, seven point nine" arrives as 7.9 bottles: the 7 is the
          name. Ask instead of adding 7.9 (voiceReview.ts). A typed number in
          the box above answers it too. */}
      {state === "name_number" && item.nameCheck && (
        <div className="lq-rev-choices">
          <span className="lq-error lq-rev-hint">
            Heard {item.units} — is the {item.nameCheck.n} part of the name “{chosen?.name ?? "this bottle"}”?
          </span>
          {item.nameCheck.alt != null && item.nameCheck.alt > 0 && (
            <button type="button" className="lq-chip" onClick={() => onResolve({ cases: 0, units: item.nameCheck!.alt! })}>
              {item.nameCheck.alt}
            </button>
          )}
          <button type="button" className="lq-chip" onClick={() => onResolve({ cases: 0, units: item.units })}>
            {item.nameCheck.alt != null && item.nameCheck.alt > 0 ? item.units : `Keep ${item.units}`}
          </button>
        </div>
      )}

      {/* 1,152 cans of tonic against a record of 72 (2026-10-02). Far above
          the bottle's 90-day record asks; "Keep" or a typed number answers. */}
      {state === "high" && item.highCheck && (
        <div className="lq-rev-choices">
          <span className="lq-error lq-rev-hint">
            {item.highCheck.total} in all is far above anything on record for {chosen?.name ?? "this bottle"} (
            {[item.highCheck.maxCount != null ? `largest count ${item.highCheck.maxCount}` : "",
              item.highCheck.maxDelivery != null ? `largest delivery ${item.highCheck.maxDelivery}` : ""]
              .filter(Boolean).join(", ")}
            , last {item.highCheck.days} days). Check the number.
          </span>
          <button type="button" className="lq-chip" onClick={() => onResolve({ cases: item.cases, units: item.units })}>
            Keep {item.qty}
          </button>
        </div>
      )}

      {/* A later take on the same shelf said this bottle again: a recount of
          the same bottles (the 10-02 re-says double-counted) or more of it.
          Asked here, while the counter still remembers. */}
      {state === "restate" && item.restate && (
        <div className="lq-rev-choices">
          <span className="lq-error lq-rev-hint">
            {formatQty(item.restate.before)} already counted on {shelf} from an earlier take. Did you just recount those, or find more?
          </span>
          <button type="button" className="lq-chip" onClick={() => onRestate("replace")}>
            Recount: {item.qty}
          </button>
          <button type="button" className="lq-chip" onClick={() => onRestate("add")}>
            More: {formatQty(item.restate.before + item.qty)} total
          </button>
        </div>
      )}
      {item.restate && item.restateAnswer && (
        <span className="lq-muted lq-rev-hint">
          {item.restateAnswer === "replace"
            ? `Replaces the earlier ${formatQty(item.restate.before)} on ${shelf}.`
            : `Adds to the earlier ${item.restate.before} on ${shelf}.`}{" "}
          <button type="button" className="lq-linkbtn" onClick={() => onRestate(undefined)}>Change</button>
        </span>
      )}

      {/* Product selection remains visible and editable while the number,
          case size, history or recount answer is still being reviewed. */}
      {chosen && (
        <button type="button" className="lq-chip lq-chip-on lq-rev-chosen" onClick={onToggleAssign}
          aria-label={`Change bottle: ${skuLabel(chosen)}`} aria-expanded={!!item.assignOpen}>
          ✓ {skuLabel(chosen)}
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

      <div className="lq-rev-choices">
          {state === "unmatched" && <span className="lq-error lq-rev-hint">Couldn't place this.</span>}
          {(!chosen || item.assignOpen) && <button type="button" className="lq-chip" onClick={onToggleAssign} aria-expanded={!!item.assignOpen}>
            {item.assignOpen ? "Cancel bottle search" : "Find bottle…"}
          </button>}
          {item.assignOpen && (
            <div className="lq-rev-assign">
              <input
                className="lq-search lq-rev-search"
                type="search"
                placeholder="Type the bottle…"
                aria-label={`Find bottle for ${item.spoken}`}
                value={q}
                autoFocus
                onChange={(e) => setQ(e.target.value)}
              />
              {assignHits.map((s) => (
                <button key={s.id} type="button" className="lq-chip" onClick={() => onPick(s.id)}>
                  {skuLabel(s)}
                </button>
              ))}
              {q.trim() && assignHits.length === 0 && <span className="lq-muted lq-rev-hint">No bottles found. Try another name or size.</span>}
            </div>
          )}
        </div>
    </div>
  );
}

function normalizedSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function skuMatchesSearch(sku: BarSkuItem, query: string): boolean {
  const terms = normalizedSearch(query).split(/\s+/).filter(Boolean);
  const size = sku.sizeMl != null ? `${sku.sizeMl} ml ${sku.sizeMl}ml ${sku.sizeMl / 1000} l ${sku.sizeMl / 1000}l` : "";
  const text = normalizedSearch(`${sku.name} ${(sku.aliases ?? []).join(" ")} ${size}`);
  return terms.every((term) => text.includes(term));
}

/** A correction keeps the entered pack memo when the two stamps agree. With
 * different case sizes only the truthful individual-unit total can be merged. */
function combineCorrectedCells(from: Cell, existing: Cell): Cell {
  const fromCases = from.cases ?? 0;
  const oldCases = existing.cases ?? 0;
  const compatible = !fromCases || !oldCases || from.caseSize === existing.caseSize;
  const cases = roundQty(fromCases + oldCases);
  const caseSize = oldCases ? existing.caseSize : fromCases ? from.caseSize : existing.caseSize ?? from.caseSize;
  return {
    qty: roundQty(from.qty + existing.qty), source: "grid",
    ...(compatible && caseSize != null ? { cases, caseSize } : {}),
    ...((from.raw || existing.raw) ? { raw: [existing.raw, from.raw].filter(Boolean).join("; ") } : {}),
  };
}

function ReviewCountRow({ sku, cell, shelf, catalog, existing, disabled, quantitiesDisabled, onLoose, onCases, onChangeItem }: {
  sku: BarSkuItem;
  cell: Cell;
  shelf: string;
  catalog: BarSkuItem[];
  existing: Record<string, Cell>;
  disabled: boolean;
  quantitiesDisabled: boolean;
  onLoose: (n: number) => void;
  onCases: (n: number) => void;
  onChangeItem: (id: string, mode: "move" | "add" | "replace") => void;
}) {
  const [changing, setChanging] = useState(false);
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const target = catalog.find((s) => s.id === targetId);
  const targetCell = targetId ? existing[targetId] : undefined;
  const caseSize = cell.caseSize ?? sku.unitsPerCase;
  const hits = catalog.filter((s) => s.id !== sku.id && skuMatchesSearch(s, query));
  return (
    <div className="lq-review-count-row" data-sku-id={sku.id}>
      <div className="lq-review-count-location"><strong>{shelf}</strong><span>{formatQty(cell.qty)} {sku.trackingMode === "stock_count" ? "each" : "bottles"} total</span></div>
      <span>{sku.name} · {sizeLabel(sku)}</span>
      {(cell.cases ?? 0) > 0 && cell.caseSize && <span>{formatQty(cell.cases!)} cases × {formatQty(cell.caseSize)} + {formatQty(looseOf(cell))} loose</span>}
      {cell.raw && <p className="lq-review-heard">Heard: “{cell.raw}”</p>}
      <div className="lq-review-count-inputs">
        {caseSize != null && <CaseBox cases={cell.cases ?? 0} caseSize={caseSize} onChange={onCases} disabled={disabled || quantitiesDisabled} label={`Cases of ${sku.name} on ${shelf}`} />}
        <label className="lq-quantity"><span className="lq-qty-label">{sku.trackingMode === "stock_count" ? "Loose each" : "Loose bottles"}</span>
          <CountQuantityInput className="lq-qty-input" type="number" inputMode="decimal" step="0.1" min={0} value={looseOf(cell)} disabled={disabled || quantitiesDisabled}
            aria-label={`Loose ${sku.name} on ${shelf}`} onQuantity={(n, raw) => { if (raw !== "" && Number(raw) >= 0) onLoose(n); }} />
        </label>
      </div>
      <button type="button" className="lq-linkbtn" disabled={disabled} onClick={() => setChanging(!changing)}>{changing ? "Cancel item change" : "Change item or size"}</button>
      {changing && <div className="lq-review-rematch">
        <input className="lq-search" type="search" value={query} disabled={disabled} placeholder="Find the bottle you actually counted…"
          aria-label={`Find replacement for ${sku.name} on ${shelf}`} onChange={(e) => { setQuery(e.target.value); setTargetId(""); }} />
        <select className="lq-review-replacement" value={targetId} disabled={disabled} aria-label={`Replacement for ${sku.name} on ${shelf}`} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">Choose item and size</option>
          {hits.map((s) => <option key={s.id} value={s.id}>{s.name} · {sizeLabel(s)}</option>)}
        </select>
        {query.trim() && hits.length === 0 && <p>No matching item. Try another name.</p>}
        {target && <>
          <p>Move {formatQty(cell.qty)} from {sku.name} · {sizeLabel(sku)} to {target.name} · {sizeLabel(target)} on {shelf}.</p>
          {targetCell ? <>
            <p>{target.name} already has {formatQty(targetCell.qty)} on this shelf. Choose how to correct it.</p>
            {(cell.cases ?? 0) > 0 && (targetCell.cases ?? 0) > 0 && cell.caseSize !== targetCell.caseSize && <p>These case sizes differ. Adding saves the combined total as loose units.</p>}
            <button type="button" className="lq-btn lq-btn-ghost" disabled={disabled} onClick={() => onChangeItem(target.id, "add")}>Add to existing count ({formatQty(cell.qty + targetCell.qty)})</button>
            <button type="button" className="lq-btn lq-btn-ghost" disabled={disabled} onClick={() => onChangeItem(target.id, "replace")}>Replace existing count ({formatQty(cell.qty)})</button>
          </> : <button type="button" className="lq-btn lq-btn-ghost" disabled={disabled} onClick={() => onChangeItem(target.id, "move")}>Move count</button>}
        </>}
      </div>}
    </div>
  );
}

/** The LOOSE portion of a cell — total minus whatever the cases contribute.
 *  Every stepper and number field edits this, never the total: feeding a
 *  case-bearing cell's `qty` back into setQty would re-add the cases. */
function looseOf(cell: Cell | undefined): number {
  if (!cell) return 0;
  const fromCases = (cell.cases ?? 0) * (cell.caseSize ?? 0);
  return Number(Math.max(0, cell.qty - fromCases).toFixed(10));
}

/** The case entry box. Deliberately a SECOND field beside the each-count, not
 *  a bottle/case mode toggle — a toggle is one mis-tap from a 24x error with
 *  no visual trace, whereas two labelled boxes plus a running total show their
 *  own work. The multiplier is always on screen ("x24") for the same reason. */
function CaseBox({
  cases,
  caseSize,
  onChange,
  disabled = false,
  label,
}: {
  cases: number;
  caseSize: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="lq-quantity lq-case-quantity">
      <span className="lq-qty-label">Cases ×{formatQty(caseSize)}</span>
      <div className="lq-case-stepper lq-stepper">
      <button type="button" className="lq-step" disabled={disabled || cases <= 0} aria-label="One fewer case" onClick={() => onChange(Math.max(0, roundQty(cases - 1)))}>−</button>
      <CountQuantityInput
        className="lq-case-input"
        type="number"
        inputMode="decimal"
        step="0.5"
        min={0}
        value={cases}
        blankZero
        disabled={disabled}
        placeholder="0"
        aria-label={label ?? `cases (${caseSize} each)`}
        onQuantity={(n, raw) => { if (raw !== "" && Number(raw) >= 0) onChange(n); }}
      />
      <button type="button" className="lq-step" disabled={disabled} aria-label="One more case" onClick={() => onChange(roundQty(cases + 1))}>+</button>
      </div>
    </div>
  );
}

/** Keep the text being typed until blur; 5.5 must not snap back to 5 mid-entry. */
function CountQuantityInput({
  value,
  onQuantity,
  blankZero = false,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | undefined;
  onQuantity: (n: number, raw: string) => void;
  blankZero?: boolean;
}) {
  // Summaries round for scanning; an editable field must show the value that
  // will be saved. Normalize binary tails without hiding a stored 0.125.
  const show = (n: number | undefined) => n == null || (blankZero && n === 0) ? "" : String(Number(n.toPrecision(15)));
  const [draft, setDraft] = useState(() => show(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(show(value));
  }, [value, blankZero]);
  return (
    <input
      {...props}
      value={draft}
      onFocus={(event) => {
        focused.current = true;
        if (draft === "0") event.currentTarget.select();
        event.currentTarget.closest(".lq-row, .lq-rev")?.scrollIntoView({ block: "center", behavior: "smooth" });
        props.onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        const number = Number(raw);
        if (Number.isFinite(number)) onQuantity(Math.max(0, number), raw);
      }}
      onBlur={(event) => {
        focused.current = false;
        setDraft(show(value));
        props.onBlur?.(event);
      }}
    />
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
