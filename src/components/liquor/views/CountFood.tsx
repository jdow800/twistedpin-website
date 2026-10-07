import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCount,
  createZone,
  extractVoice,
  getCatalog,
  getOpenCount,
  getZones,
  precheckCount,
  setSkuActive,
  setSkuDiscontinued,
  setSkuZone,
  saveCountLines,
  confirmCountDraftSave,
  setCaseSize,
  submitCount,
  ChangedSinceCheckError,
  SubmissionUnknownError,
  ZoneNameTakenError,
  BarApiError,
  type BarSkuItem,
  type BarZoneItem,
  type CountLineInput,
  type OpenCountLine,
  type OpenCount,
  type PrecheckFinding,
  type RetiringSku,
  type UnplacedItem,
  type VoiceExtractItem,
} from "../api";
import { useVoiceDictation } from "../useRecorderDictation";
import { createDraftSaver, toOpenLines, sameDraftCell, mergeDraft, DraftMergePausedError } from "../draftSync";
import { createCarry, splitFoodTail } from "../voiceCarry";
import { pauseCutsEnabled } from "../voiceSwitches";
import { forgetZone, rememberZone, resumeZone } from "../resume-zone";
import { CountSubmitRecovery } from "../CountSubmitRecovery";
import { useCountFooter } from "../useCountFooter";
import VoiceProcessing from "../VoiceProcessing";
import CountEntryChoice from "../CountEntryChoice";
import { foodCasesOnly, foodCaseSize, foodCountWarning, foodReviewQuantity, confirmFoodQuantity, foodImplicitUnit, foodUnitLabel as unitLabel, type FoodReviewItem as ReviewItem } from "../food-voice-review";
import FindingSummary from "../FindingSummary";
import { formatQty, roundQty } from "../quantity";
import { appendFoodSource, compatibleFoodUnits, mergeFoodCells, retainFoodStamps, readFoodNumber, foodLineKey } from "../food-count-edit";
import FoodNumberInput from "../FoodNumberInput";
import FoodReviewCountRow, { foodSearchMatch } from "../FoodReviewCountRow";
import FoodVoiceReviewRow from "../FoodVoiceReviewRow";
import type { FoodCountChoice } from "../FoodCountRecovery";

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
 * Fractional cases and packs are valid here. Unlike liquor, the base unit
 * varies by product and an intermediate package needs its own conversion.
 */

/**
 * Hard stop, matching the liquor screen (240s) rather than the 90s this
 * shipped with — that number carried no comment, and a food shelf is not
 * smaller than a liquor one. Fryer Line is 41 SKUs.
 *
 * ⚠ THE RECORDER IS NOT LIMITED BY THIS. useRecorderDictation ROTATES the
 * MediaRecorder every ~20s on the same never-released stream and joins the
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
  packs?: number | null;
  packSize?: number | null;
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

/**
 * One question about where a thing lives (Jon, 2026-10-03; the approved
 * preview is Opsi previews/2026-10-03-walk-locations.html): an item left blank
 * on a zone being left, or an item on no zone at all, before Submit. The
 * boxes hold what was typed, as typed, until Save.
 */
type PlaceQ = {
  pick: "count" | "moved" | "yes" | "none" | null;
  zone: string | null;
  cases: string;
  units: string;
  busy?: boolean;
  /** The settled answer, shown in place of the buttons. */
  done?: string;
  err?: string;
};
const EMPTY_Q: PlaceQ = { pick: null, zone: null, cases: "", units: "" };

/** "Bought from Sysco Oct 2 · in a recipe · not in any zone yet" */
function whyUnplaced(u: UnplacedItem): string {
  const parts: string[] = [];
  if (u.lastBoughtAt) {
    const day = new Date(u.lastBoughtAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
    parts.push(`Bought${u.lastVendor ? ` from ${u.lastVendor}` : ""} ${day}`);
  }
  if (u.inRecipe) parts.push(u.lastBoughtAt ? "in a recipe" : "Used in a recipe");
  parts.push("not in any zone yet");
  return parts.join(" · ");
}

type VoiceSegmentResult = { items: VoiceExtractItem[]; error: string | null };

function voiceErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Couldn't read that back — try again, or type it in.";
}


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

/** m:ss, so three minutes reads as 3:00 rather than 180. */
function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function cellQty(c: Pick<Cell, "cases" | "units" | "caseSize" | "packs" | "packSize">): number {
  return roundQty((c.units ?? 0) + (c.cases ?? 0) * (c.caseSize ?? 0) + (c.packs ?? 0) * (c.packSize ?? 0));
}

function rebuild(lines: OpenCountLine[]): Counts {
  const out: Counts = {};
  for (const l of lines) {
    const zone = (out[l.zoneId] ??= {});
    const cases = l.enteredCases == null ? null : Number(l.enteredCases);
    const caseSize = l.caseSizeAtEntry == null ? null : Number(l.caseSizeAtEntry);
    const qty = Number(l.qtyUnits);
    const packs = l.enteredPacks == null ? null : Number(l.enteredPacks);
    const packSize = l.packSizeAtEntry == null ? null : Number(l.packSizeAtEntry);
    zone[l.skuId] = {
      cases,
      caseSize,
      packs,
      packSize,
      // Loose = whatever the stored total is beyond the case part, so a resumed
      // draft shows the counter the two numbers they actually typed.
      units: roundQty(qty - (cases ?? 0) * (caseSize ?? 0) - (packs ?? 0) * (packSize ?? 0)),
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
        enteredPacks: c.packs || undefined,
        packSizeAtEntry: c.packs ? c.packSize : undefined,
      });
    }
  }
  return out;
}

export default function CountFood({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [err, setErr] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const [entryDraft, setEntryDraft] = useState<OpenCount | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const entryBusyRef = useRef(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [startingFresh, setStartingFresh] = useState(false);
  const startingFreshRef = useRef(false);
  const [zones, setZones] = useState<BarZoneItem[]>([]);
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [zoneId, setZoneId] = useState<string>("");
  const [counts, setCounts] = useState<Counts>({});
  const [added, setAdded] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [reviewDirty, setReviewDirty] = useState(false);
  const reviewDirtyRef = useRef(false);
  const [reviewMoved, setReviewMoved] = useState<Record<string, string>>({});
  type Correction = { keys: string[]; fromZone: string; fromSku: string; toZone: string; toSku: string };
  const pendingCorrectionsRef = useRef<Correction[]>([]);
  const correctionConflictsRef = useRef<Correction[]>([]);
  const [correctionConflicts, setCorrectionConflicts] = useState<Correction[]>([]);
  const [locationCollision, setLocationCollision] = useState<{ key: string; zid: string; skuId: string; cell: Cell; from: string; afterSave: () => Promise<void> } | null>(null);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const reviewRowsRef = useRef(review);
  reviewRowsRef.current = review;
  const appliedVoiceRowsRef = useRef(new WeakSet<ReviewItem>());
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [showRecorderError, setShowRecorderError] = useState(true);
  const [caseSizeErrors, setCaseSizeErrors] = useState<Record<string, string | null>>({});
  const [retryTranscript, setRetryTranscript] = useState<string | null>(null);
  /** A blocking persistence/submit failure. Lives in the FIXED footer, not in
   *  the mic toolbar at the top of the page — the counter who just tapped
   *  Finish or Submit is looking at the bottom of a long shelf list and would
   *  never scroll up to find out why nothing happened. */
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submissionUnknown, setSubmissionUnknown] = useState(false);
  const footerRef = useCountFooter();
  /** Finish the current take before moving, then check its unanswered items. */
  const [queuedZone, setQueuedZone] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [findings, setFindings] = useState<PrecheckFinding[] | null>(null);
  /** Findings past the server's six, behind "Show N more" as on the liquor
   *  count: they were dropped, so the counter never saw them. */
  const [moreFindings, setMoreFindings] = useState<PrecheckFinding[]>([]);
  const [showMoreFindings, setShowMoreFindings] = useState(false);
  /** The check could not run. Saying "Nothing looks off" then was confidence
   *  it had not earned (independent review, 2026-10-03). */
  const [checkFailed, setCheckFailed] = useState(false);
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
  // "None left" on a discontinued row (tprs 0196), keyed by sku. Archived rows
  // stay visible for this walk so the tap can be undone.
  const [noneLeft, setNoneLeft] = useState<Record<string, "saving" | "archived" | "failed">>({});
  // The shelf where "None left" wrote its zero, so Undo removes only that.
  const [noneLeftZero, setNoneLeftZero] = useState<Record<string, string>>({});
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
  // ── where things live (Jon, 2026-10-03) ──
  /** Leaving a counted zone with listed items left blank. `skuIds` is frozen
   *  when it opens, so an answered item keeps its tick on the sheet. */
  const [leaving, setLeaving] = useState<{ from: string; to: string; skuIds: string[] } | null>(null);
  /** Zones the counter skipped past once. Skipping is an answer: the same
   *  zone does not ask again this walk, and Finish lists them anyway. */
  const skippedLeaving = useRef<Set<string>>(new Set());
  const [placeQ, setPlaceQ] = useState<Record<string, PlaceQ>>({});
  /** "Things we think you have": on no zone, so no walk asks about them. */
  const [unplaced, setUnplaced] = useState<UnplacedItem[]>([]);
  const [unplacedMore, setUnplacedMore] = useState<UnplacedItem[]>([]);
  const [unplacedAll, setUnplacedAll] = useState(false);
  /** "+ New spot": `key` is the question that asked, so the new zone is
   *  picked for it. `after` is the zone it follows, "" for first. */
  const [newSpot, setNewSpot] = useState<{ key: string; name: string; after: string; busy: boolean; err: string | null } | null>(null);
  const [newZoneIds, setNewZoneIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countsRef = useRef<Counts>({});
  countsRef.current = counts;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  /** Saves built on the draft this screen last saw, so a stale screen merges
   *  instead of overwriting an edit made elsewhere (draftSync.ts). */
  const [merged, setMerged] = useState(false);
  const saverRef = useRef<ReturnType<typeof createDraftSaver> | null>(null);
  if (!saverRef.current) {
    saverRef.current = createDraftSaver({
      beforeSave: () => { if (correctionConflictsRef.current.length) throw new DraftMergePausedError("Review the changed correction first."); },
      save: async (lines, baseHash) => {
        const sid = sessionIdRef.current!;
        try { return await saveCountLines(sid, lines, true, "food", baseHash); }
        catch (error) {
          // A lost response can follow an accepted write. Only an exact,
          // bounded readback certifies it; mismatches keep the usual retry.
          if ((error instanceof BarApiError && (error.status === 0 || error.status >= 500)) || error instanceof SyntaxError) {
            const confirmed = await confirmCountDraftSave(sid, lines, "food", true).catch(() => null);
            if (confirmed) return confirmed;
          }
          throw error;
        }
      },
      current: () => flatten(countsRef.current),
      saved: (lines) => {
        const saved = new Map(lines.map((line) => [foodLineKey(line), line]));
        const current = new Map(flatten(countsRef.current).map((line) => [foodLineKey(line), line]));
        pendingCorrectionsRef.current = pendingCorrectionsRef.current.filter((c) => !c.keys.every((key) => sameDraftCell(saved.get(key), current.get(key))));
      },
      conflict: (base, mine, theirs) => {
        const old = new Map(base.map((l) => [foodLineKey(l), l]));
        const fresh = new Map(theirs.map((l) => [foodLineKey(l), l]));
        const pending = pendingCorrectionsRef.current;
        if (!pending.some((c) => c.keys.some((key) => !sameDraftCell(old.get(key), fresh.get(key))))) return { lines: mergeDraft(base, mine, theirs), pause: false };
        const endpoints = new Set(pending.flatMap((c) => c.keys));
        const lines = mergeDraft(base, mine, theirs).filter((l) => !endpoints.has(foodLineKey(l)));
        lines.push(...theirs.filter((l) => endpoints.has(foodLineKey(l))));
        correctionConflictsRef.current = pending;
        setCorrectionConflicts(pending);
        pendingCorrectionsRef.current = [];
        setLocationCollision(null);
        markCountChanged();
        return { lines, pause: true };
      },
      adopt: (lines) => {
        const local = countsRef.current;
        const localLines = new Map(flatten(local).map((line) => [foodLineKey(line), line]));
        const next = rebuild(toOpenLines(lines));
        const restored = new Set(correctionConflictsRef.current.flatMap((c) => c.keys));
        for (const line of lines) retainFoodStamps(local[line.zoneId]?.[line.skuId], next[line.zoneId][line.skuId],
          sameDraftCell(line, localLines.get(foodLineKey(line))), restored.has(foodLineKey(line)));
        countsRef.current = next;
        setCounts(next);
        setMerged(true);
        // A change from elsewhere: the review on screen no longer covers it.
        mergedSinceCheckRef.current = true;
        markCountChanged();
      },
    });
  }
  /** What the last pre-submit check looked at (TPRS 2026-10-03). The panel's
   *  own answers write counts, so submit sends the fingerprint after this
   *  screen's own saves, unless a change from elsewhere was merged in since
   *  the check: then the check's, and the server has it checked again. */
  const checkedHashRef = useRef<string | null>(null);
  const mergedSinceCheckRef = useRef(false);
  const [rechecked, setRechecked] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const skuById = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);
  const zone = zones.find((z) => z.id === zoneId);

  // Keep an existing draft pending, with no active session/autosave until chosen.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [z, cat, open] = await Promise.all([
          getZones("food"),
          getCatalog("food"),
          getOpenCount(true, "food", { includeOlder: true }),
        ]);
        if (!live) return;
        setZones(z);
        setCatalog(cat);
        if (z.length === 0) {
          setErr("No food zones are set up yet — seed the catalog first.");
          setPhase("error");
          return;
        }
        // ⚠ SESSION FIRST, THEN ZONE. resumeZone is keyed by session, so
        // resolving the shelf before we know which count this is would always
        // miss and silently drop the counter on zone one (see resume-zone.ts).
        if (open) {
          setEntryDraft(open);
        } else {
          const sid = await createCount(true, "food");
          if (!live) return;
          setSessionId(sid);
          saverRef.current!.loaded([], null);
          setZoneId(resumeZone(sid, z));
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

  function continueEntry() {
    if (!entryDraft || entryBusyRef.current) return;
    entryBusyRef.current = true;
    setSessionId(entryDraft.id);
    setCounts(rebuild(entryDraft.lines));
    saverRef.current!.loaded(entryDraft.lines, entryDraft.linesHash);
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
      // Entry has no local edits or active saver. Never PUT the old snapshot.
      const sid = await createCount(true, "food");
      setSessionId(sid);
      saverRef.current!.loaded([], null);
      setZoneId(resumeZone(sid, zones));
      setEntryDraft(null);
    } catch {
      entryBusyRef.current = false;
      setEntryError("Couldn't start a new count. Try again, or continue your previous count.");
    } finally {
      setEntryBusy(false);
    }
  }

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
      if (!el.closest(".lq-fc-row, .lq-fc-rev-row, .lq-review-count-row, .lq-fc-sheet")) return;
      // A review row can be taller than the space above the keyboard. Centre
      // the actual input, then keep it between the pinned bars and actions.
      el.scrollIntoView({ block: "center", behavior: "auto" });
      const sheet = el.closest(".lq-fc-sheet");
      const viewportTop = vv.offsetTop;
      const pinnedBottom = sheet ? viewportTop : Math.max(viewportTop,
        document.querySelector(".lq-header")?.getBoundingClientRect().bottom ?? 0,
        document.querySelector(".lq-fc-zonehead")?.getBoundingClientRect().bottom ?? 0);
      const actions = (sheet?.querySelector(".lq-fc-sheet-foot") ?? document.querySelector(".lq-fc .lq-footer"))?.getBoundingClientRect();
      const bottom = Math.min(viewportTop + vv.height, actions?.top ?? Infinity) - 8;
      const top = pinnedBottom + 8;
      const rect = el.getBoundingClientRect();
      if (bottom > top && (rect.top < top || rect.bottom > bottom)) {
        const delta = rect.top + rect.height / 2 - (top + bottom) / 2;
        const scroller = sheet?.closest(".lq-fc-sheetback");
        if (scroller) scroller.scrollTop += delta;
        else window.scrollBy({ top: delta, behavior: "auto" });
      }
    };
    vv.addEventListener("resize", recentre);
    document.addEventListener("focusin", recentre);
    return () => { vv.removeEventListener("resize", recentre); document.removeEventListener("focusin", recentre); };
  }, []);

  /** Returns whether the sheet is actually on the server. Callers that are
   *  about to CLOSE the count must check it — a swallowed failure here would
   *  submit whatever older rows happened to land, which can be none of them. */
  const doSave = useCallback(async (forFreshStart = false): Promise<boolean> => {
    if (startingFreshRef.current && !forFreshStart) return false;
    const sid = sessionId;
    if (!sid) return false;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setSave("saving");
    try {
      await saverRef.current!.save();
      setSave("saved");
      return true;
    } catch (e) {
      setSave("error");
      if (e instanceof DraftMergePausedError) setSubmitErr("A correction changed elsewhere. Review the saved counts before retrying.");
      return false;
    }
  }, [sessionId]);

  /** Debounced, because the counter types fast and a walk-in has no signal to
   *  spare. The ref (not state) is read at fire time so a burst coalesces into
   *  one authoritative save of the WHOLE sheet. */
  function scheduleSave() {
    if (startingFreshRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void doSave(), 900);
  }

  function markCountChanged() {
    checkedHashRef.current = null;
    reviewDirtyRef.current = true;
    setReviewDirty(true);
    setSave("idle");
  }

  function adoptLocal(next: Counts) {
    countsRef.current = next;
    setCounts(next);
    markCountChanged();
  }

  function writeCell(skuId: string, next: Partial<Cell> & { source?: "grid" | "voice" }, dest = zoneId) {
    if (startingFreshRef.current || checking || submitting || submissionUnknown) return;
    if (correctionConflictsRef.current.some((c) => c.keys.includes(`${dest}:${skuId}`))) return;
    const prev = countsRef.current;
      const zoneCells = { ...(prev[dest] ?? {}) };
      const cur = zoneCells[skuId];
      const sku = skuById.get(skuId);
      const merged: Cell = {
        cases: next.cases !== undefined ? next.cases : (cur?.cases ?? null),
        units: next.units !== undefined ? next.units : (cur?.units ?? null),
        packs: next.packs !== undefined ? next.packs : cur?.packs,
        packSize: next.packSize !== undefined ? next.packSize : cur?.packSize,
        // ⚠ THE EXISTING CELL'S MULTIPLIER WINS. case_size_at_entry is frozen
        // at entry by design and must never be re-read from the catalog: a
        // resumed draft whose SKU had its case size corrected in between would
        // silently rescale what the counter already wrote (2 cases × 12 = 24
        // becoming 2 × 24 = 48 on the next keystroke). The catalog is consulted
        // only for a cell that does not exist yet.
        caseSize: cur?.caseSize ?? next.caseSize ?? foodCaseSize(sku),
        qty: 0,
        source: next.source ?? "grid",
        raw: next.raw ?? cur?.raw,
        none: next.none ?? cur?.none,
      };
      merged.qty = cellQty(merged);
      if (!Number.isFinite(merged.qty) || merged.qty < 0) return;
      zoneCells[skuId] = merged;
      adoptLocal({ ...prev, [dest]: zoneCells });
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
   * does the "none here" button. Intermediate blank/negative text preserves
   * the earlier recorded answer; Clear removes an observation explicitly.
   */
  function editBox(
    skuId: string,
    field: "cases" | "units" | "packs",
    raw: string,
    caseSize: number | null,
    dest = zoneId,
  ) {
    const cur = (countsRef.current[dest] ?? {})[skuId];
    const value = readFoodNumber(raw);
    // Keep the recorded answer through backspace/invalid intermediate text.
    // Clear is explicit; a missing field never invents an observed zero.
    if (value == null) return;
    if (field === "packs") {
      if (cur?.packSize != null && cur.packSize > 0) writeCell(skuId, { packs: value, packSize: cur.packSize, none: false }, dest);
      return;
    }
    if (field === "cases" && foodCasesOnly(skuById.get(skuId))) {
      // An explicit case answer replaces the whole cell. A legacy loose count
      // stays untouched until this edit, rather than being hidden and added
      // again underneath the new case amount.
      writeCell(skuId, { cases: value, units: null, packs: null, packSize: null, caseSize, none: false }, dest);
      return;
    }
    // Typing anything — including a literal 0 — is the counter answering, so
    // it supersedes an earlier "none here". Erasing does not.
    writeCell(
      skuId,
      field === "cases" ? { cases: value, caseSize: cur?.caseSize ?? caseSize, none: false } : { units: value, none: false }, dest,
    );
  }

  /** "I looked at this shelf and there are none." The one way, besides
   *  typing a 0, that a zero legitimately gets recorded. */
  function markNone(skuId: string) {
    // units 0 (an answer), cases blank — so the both-blank clear can never
    // fire on it, and the box shows an honest empty rather than a typed 0.
    writeCell(skuId, { cases: null, packs: null, units: 0, none: true });
  }

  function stepBox(skuId: string, field: "cases" | "units" | "packs", delta: number) {
    if (startingFreshRef.current || checking || submitting || submissionUnknown) return;
    const cur = (counts[zoneId] ?? {})[skuId];
    const sku = skuById.get(skuId);
    const caseSize = cur?.caseSize ?? foodCaseSize(sku);
    const casesOnly = field === "cases" && foodCasesOnly(sku);
    if (casesOnly && !(caseSize != null && caseSize > 0)) return;
    // The case-only box displays the WHOLE cell, including legacy loose or
    // pack entries. Stepping it must begin with that same equivalent amount.
    const current = casesOnly && cur ? cur.qty / caseSize! : cur?.[field] ?? 0;
    const value = Number(Math.max(0, current + delta).toFixed(10));
    editBox(skuId, field, String(value), caseSize);
  }

  function clearCell(skuId: string) {
    if (startingFreshRef.current || checking || submitting || submissionUnknown) return;
    if (correctionConflictsRef.current.some((c) => c.keys.includes(`${zoneId}:${skuId}`))) return;
    const prev = countsRef.current;
      const zoneCells = { ...(prev[zoneId] ?? {}) };
      delete zoneCells[skuId];
      adoptLocal({ ...prev, [zoneId]: zoneCells });
    scheduleSave();
  }

  /** Voice ADDS to whatever is already in the cell — two passes at one shelf
   *  should total, not overwrite. */
  /** `zone` is explicit because a voice take must land on the shelf it was
   *  RECORDED on. Transcription is async: the counter taps Stop, walks to the
   *  next shelf while it processes, then taps Apply — and every item would
   *  otherwise be written to wherever they were standing by then. The food
   *  location prompt would then offer to make those wrong placements into
   *  permanent membership. */
  function addToCell(skuId: string, cases: number, units: number, caseSize: number | null, raw: string, zone: string = zoneId) {
    if (correctionConflictsRef.current.some((c) => c.keys.includes(`${zone}:${skuId}`))) return;
    const prev = countsRef.current;
      const zoneCells = { ...(prev[zone] ?? {}) };
      const cur = zoneCells[skuId];
      // A later correction to the case size must not reinterpret an earlier
      // entry. Fold a differently-sized incoming case into loose base units.
      const differentSize = cur?.caseSize != null && caseSize != null && cur.caseSize !== caseSize;
      const merged: Cell = {
        cases: Number(((cur?.cases ?? 0) + (differentSize ? 0 : cases)).toPrecision(15)),
        units: Number(((cur?.units ?? 0) + units + (differentSize ? cases * caseSize! : 0)).toPrecision(15)),
        packs: cur?.packs,
        packSize: cur?.packSize,
        // A spoken quantity is an explicit answer, including a spoken zero.
        // Same freeze as writeCell: a second voice pass at the same shelf adds
        // to the cell, it does not revalue what is already in it.
        caseSize: cur?.caseSize ?? caseSize ?? foodCaseSize(skuById.get(skuId)),
        qty: 0,
        source: "voice",
        raw: appendFoodSource(cur?.raw, raw),
      };
      merged.qty = cellQty(merged);
      if (!Number.isFinite(merged.qty) || merged.qty < 0) return;
      zoneCells[skuId] = merged;
      adoptLocal({ ...prev, [zone]: zoneCells });
    scheduleSave();
  }

  // ── voice ──
  // ⚠ `scope` is what makes the shelf in front of the counter claim the
  // Deepgram keyterm budget first. Without it the server ranks every active
  // SKU alphabetically and the budget runs out at the letter E — measured
  // 48% coverage, against 94-100% zone-scoped (Opsi/analysis/keyterm-by-zone.ts).
  // zoneId changes as he walks; the hook reads it through a ref so the NEXT
  // rotation segment is biased to the NEW shelf.
  /** Which shelf a pending voice take belongs to, captured when recording
   *  STARTS rather than read when Apply is tapped. */
  const [takeZoneId, setTakeZoneId] = useState<string | null>(null);
  /** Mic live — Start until Stop, NOT until the upload lands. This is what
   *  zone changes are refused during: once the counter has stopped talking,
   *  the take's destination is fixed and walking on is safe. Gating on
   *  `dict.recording` instead would let a stalled upload lock the shelf
   *  controls with no way out but Home, abandoning the take. */
  const [captureRequested, setCaptureRequested] = useState(false);
  /** ⚠ STICKY. `dict.quiet` is a LIVE signal — it clears the instant sound
   *  returns, including on unmute. A counter who took a phone call for the
   *  whole gap comes back to a screen that has already forgotten, so the one
   *  question they have — "did I lose any of that?" — has no answer on it.
   *  This latches instead, and only an explicit tap clears it. */
  const [interrupted, setInterrupted] = useState(false);
  /** ⚠ THE PRE-SUBMIT REVIEW RENDERS INLINE, BELOW THE WHOLE SHELF. Found by
   *  screenshotting the real screen at phone size before the first count: tap
   *  Finish and nothing appears to happen, because the answer is two screens
   *  down on an 8-item shelf and about TWELVE on Fryer Line's 41. A counter
   *  gets no feedback from the one button that matters, so the reasonable
   *  reaction is to tap it again or decide the app is broken. */
  const reviewRef = useRef<HTMLDivElement | null>(null);
  const voiceReviewRef = useRef<HTMLDivElement | null>(null);
  const queuedLocationRef = useRef<HTMLDivElement | null>(null);
  function showBelowLocation(el: HTMLDivElement | null) {
    if (!el) return;
    const header = document.querySelector(".lq-header")?.getBoundingClientRect().height ?? 0;
    const shelves = document.querySelector(".lq-fc-zonehead")?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - header - shelves - 12, behavior: "smooth" });
  }
  function showVoiceReview() { showBelowLocation(voiceReviewRef.current); }
  useEffect(() => {
    if (queuedZone) showBelowLocation(queuedLocationRef.current);
    else if (review?.length) showVoiceReview();
  }, [!!review?.length, queuedZone]);
  // Match each ~20s segment while the counter keeps talking, as CountLiquor
  // does. Stop waits for unfinished segments instead of starting the entire
  // take's extraction. Index by spoken position: upload retries can finish
  // out of order. Resolve failures here so a background rejection is handled
  // immediately, then report any missing part when the review opens.
  const segExtractsRef = useRef<Map<number, Promise<VoiceSegmentResult>>>(new Map());
  const extractPiece = (text: string, index: number) => {
    segExtractsRef.current.set(index, extractVoice(text, "food")
      .then((items) => ({ items, error: null }))
      .catch((error) => ({ items: [], error: voiceErrorMessage(error) })));
  };
  // Pause cuts (on by default; ?pausecuts=0 is the off-switch, voiceSwitches.ts):
  // pieces end at a pause, and each piece's last item waits to lead the next,
  // so an item the cut split ("We have 4.2 cases" | "Pizza sauce", Jon's test
  // on 2026-10-02) is matched whole (voiceCarry.ts splitFoodTail).
  const pauseCuts = useMemo(() => pauseCutsEnabled(), []);
  const carryRef = useRef<ReturnType<typeof createCarry> | null>(null);
  const segmentGapRef = useRef(false);
  if (!carryRef.current) carryRef.current = createCarry(extractPiece, splitFoodTail);
  const dict = useVoiceDictation((t) => void finalizeVoice(t), {
    vocabulary: "liquor",
    // The take's shelf, so an upload retried after the counter walks on is
    // still biased toward what they were standing at (CountLiquor does the same).
    scope: { section: "food", zoneId: (takeZoneId ?? zoneId) || undefined },
    pauseCuts,
    onSegmentFailed: (index) => {
      segmentGapRef.current = true;
      if (pauseCuts) carryRef.current!.fail(index);
    },
    onSegment: (text, index) => {
      // Every piece goes through the carry, even an empty one, so the next
      // piece isn't left waiting for it.
      if (pauseCuts) return carryRef.current!.add(text, index);
      if (!text.trim()) return;
      extractPiece(text, index);
    },
  });
  // The live words box is capped in height; keep the newest words in view.
  const liveTextRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    const el = liveTextRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dict.transcript]);

  // Intent and recorder state stay in the same render; an effect clearing
  // intent after a failed take can otherwise cancel the next Start.
  const capturing = captureRequested && dict.recording && dict.capturing !== false;
  const processingVoice = (dict.recording && !capturing) || voiceBusy;

  // Two ways a take loses audio without the counter seeing it: the level watch
  // reports silence, or the OS backgrounds us (an incoming call does both, and
  // the beep and vibrate that go with them land on a phone held to an ear).
  useEffect(() => {
    if (dict.quiet) setInterrupted(true);
  }, [dict.quiet]);
  // `findings` going from null to an array is the only transition that should
  // move the page. Keyed on that rather than on its length, so re-answering a
  // finding does not yank the screen while the counter is reading.
  useEffect(() => {
    if (findings == null) return;
    const el = reviewRef.current;
    if (!el) return;
    // ⚠ NOT scrollIntoView({ block: "start" }). The app header is sticky, so
    // aligning the block's top with the VIEWPORT top parks its heading —
    // "2 things worth a second look", the sentence that says what this even
    // is — underneath the header. Measure the header and stop short of it.
    // Measure whatever is actually pinned to the top rather than naming it.
    // There are TWO stacked bars here — the app header and the shelf switcher —
    // and a hard-coded height for one of them silently stops working the day a
    // third appears or one of them grows a line.
    let chrome = 0;
    for (const node of document.querySelectorAll<HTMLElement>("body *")) {
      const cs = getComputedStyle(node);
      if (cs.position !== "sticky" && cs.position !== "fixed") continue;
      const r = node.getBoundingClientRect();
      // ⚠ `top <= 1` IS WRONG HERE and was my first attempt: the bars STACK,
      // so the shelf switcher sits at top:50 under the header and was excluded
      // by exactly the test meant to find it. Anything pinned in the top strip
      // counts.
      //
      // Height < 200 is what separates a BAR from a full-screen overlay — the
      // nav drawer and its backdrop are fixed at top 0 and ~840px tall, and
      // counting those would scroll the review clean off the other end.
      if (r.top <= 200 && r.height > 0 && r.height < 200) chrome = Math.max(chrome, r.bottom);
    }
    const offset = chrome + 12;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - offset,
      behavior: "smooth",
    });
  }, [findings != null]);
  useEffect(() => {
    if (!dict.recording) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") setInterrupted(true);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [dict.recording]);
  useEffect(() => {
    if (dict.recording && dict.seconds >= CAP_SECONDS) dict.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict.seconds, dict.recording]);

  async function finalizeVoice(fullTranscript: string) {
    // Stop: the held last item, and any piece still waiting, go out now.
    const gap = (pauseCuts ? carryRef.current!.flush(Number.MAX_SAFE_INTEGER) : false) || segmentGapRef.current;
    const pending = [...segExtractsRef.current.entries()].sort(([a], [b]) => a - b);
    segExtractsRef.current = new Map();
    // Web Speech has no segment callback. Keep its whole-transcript path;
    // never re-extract the full take after segment results, which would count
    // the same spoken stock twice.
    if (pending.length === 0) {
      if (gap) {
        setRetryTranscript(null);
        setVoiceErr("Part of the recording is missing — count that part again or type it in.");
        return;
      }
      return void onTranscript(fullTranscript);
    }
    setVoiceBusy(true);
    setVoiceErr(null);
    setRetryTranscript(null);
    try {
      const results = await Promise.all(pending.map(([, result]) => result));
      const items = results.flatMap((result) => result.items);
      const error = results.find((result) => result.error != null)?.error;
      // Replaying a partly successful take would duplicate the items already
      // offered for Apply. Only a wholly unsuccessful take is retryable.
      if (items.length === 0 && !gap) setRetryTranscript(fullTranscript);
      if (items.length > 0) {
        setReview((prev) => [...(prev ?? []), ...toReview(items, prev?.length ?? 0)]);
      }
      if (gap) {
        setVoiceErr("Part of the recording is missing — double-check the list and count the missing part again.");
      } else if (error) {
        setVoiceErr(items.length > 0
          ? "Part of the recording couldn't be processed — double-check the list."
          : error);
      } else if (items.length === 0) {
        setVoiceErr("Didn't catch any items — try again, or type them in.");
      }
    } finally {
      setVoiceBusy(false);
    }
  }

  async function onTranscript(transcript: string) {
    if (!transcript.trim()) return;
    setVoiceBusy(true);
    setVoiceErr(null);
    setRetryTranscript(null);
    try {
      const items = await extractVoice(transcript, "food");
      if (items.length) setReview((prev) => [...(prev ?? []), ...toReview(items, prev?.length ?? 0)]);
      else {
        setVoiceErr("Didn't catch any items — try again, or type them in.");
        setRetryTranscript(transcript);
      }
    } catch (e) {
      // extractVoice deliberately re-throws the SERVER's message when it has
      // one — "Voice isn't configured" (no ANTHROPIC_API_KEY, a 503) is the
      // common case, and it is not a retry. Swallowing it left the counter
      // tapping a button that would never work, with no way to know why.
      setVoiceErr(voiceErrorMessage(e));
      setRetryTranscript(transcript);
    } finally {
      setVoiceBusy(false);
    }
  }

  function toReview(items: VoiceExtractItem[], offset: number): ReviewItem[] {
    return items.map((it, i) => ({
      key: `v${offset + i}`,
      spoken: it.spoken,
      quantityWords: it.quantityWords,
      quantityNeedsReview: !!it.quantityNeedsReview || !!it.quantityReviewReason,
      identityNeedsReview: it.identityNeedsReview,
      quantityReviewReason: it.quantityReviewReason,
      quantityWasUncertain: !!it.quantityNeedsReview || it.quantityKnown === false || !!it.quantityReviewReason,
      unconfirmedQuantityFields: it.quantityNeedsReview || it.quantityKnown === false || it.quantityReviewReason ? ["cases", "units"] : [],
      cases: it.cases,
      units: it.units,
      chosenSkuId: it.identityNeedsReview ? null : it.match?.id ?? null,
      candidates: it.candidates,
      spokenUnit: it.spokenUnit ?? null,
      quantityKnown: !it.quantityNeedsReview && !it.quantityReviewReason && (it.quantityKnown ?? true),
      unitNeedsReview: it.unitNeedsReview ?? false,
    }));
  }

  /** Recalculate from the selected SKU and current answers. Unknown product,
   * quantity or package size blocks Apply; a large or pre-multiplied-looking
   * number requires an explicit confirmation. Spoken zero is a valid answer. */
  const reviewSku = (r: ReviewItem) => r.chosenSkuId ? skuById.get(r.chosenSkuId) : undefined;
  const reviewQuantity = (r: ReviewItem) => foodReviewQuantity(r, reviewSku(r));
  const warning = (r: ReviewItem) => {
    const existing = Object.values(counts).reduce((total, cells) => total + (cells[r.chosenSkuId ?? ""]?.qty ?? 0), 0);
    // Earlier occurrences in the same take count too; two small entries may
    // together be an implausible case count.
    const earlier = (review ?? []).slice(0, (review ?? []).indexOf(r))
      .filter(x => x.chosenSkuId === r.chosenSkuId)
      .reduce((total, x) => { const q = reviewQuantity(x); return total + (q.ready ? q.qty : 0); }, 0);
    return foodCountWarning(r, reviewSku(r), existing + earlier);
  };
  const applyable = (r: ReviewItem) => reviewQuantity(r).ready && (!warning(r) || r.largeCountConfirmed === warning(r))
    && !correctionConflictsRef.current.some((c) => c.keys.includes(`${takeZoneId ?? zoneId}:${r.chosenSkuId}`));

  const reviewZoneId = takeZoneId ?? zoneId;
  const enteredCounts: FoodCountChoice[] = sessionId ? Object.entries(counts[reviewZoneId] ?? {}).flatMap(([id, cell]) => {
    const sku = skuById.get(id);
    if (!sku || correctionConflicts.some(c => c.keys.includes(`${reviewZoneId}:${id}`))) return [];
    return [{ sku, total: `${formatQty(cell.qty)} ${unitLabel(sku, cell.qty)}`, sessionId, zoneId: reviewZoneId, snapshot: JSON.stringify(cell) }];
  }) : [];
  const reviewZoneRef = useRef(reviewZoneId);
  reviewZoneRef.current = reviewZoneId;

  function removeReviewRow(r: ReviewItem) {
    if (appliedVoiceRowsRef.current.has(r) || !reviewRowsRef.current?.includes(r)) return false;
    appliedVoiceRowsRef.current.add(r);
    const left = reviewRowsRef.current.filter(x => x !== r);
    reviewRowsRef.current = left.length ? left : null;
    setReview(reviewRowsRef.current);
    return true;
  }

  function useEnteredCount(r: ReviewItem, choice: FoodCountChoice) {
    if (startingFreshRef.current || checking || submitting || submissionUnknown || dict.recording || voiceBusy
      || choice.sessionId !== sessionIdRef.current || choice.zoneId !== reviewZoneRef.current
      || correctionConflictsRef.current.some(c => c.keys.includes(`${choice.zoneId}:${choice.sku.id}`))) return false;
    const current = countsRef.current[choice.zoneId]?.[choice.sku.id];
    if (!current || JSON.stringify(current) !== choice.snapshot) return false;
    // The human explicitly identifies this row as included in the shown total.
    // Do not copy it into the voice amount, add it again, or clear sibling rows.
    return removeReviewRow(r);
  }

  function editReview(r: ReviewItem, patch: Partial<ReviewItem>) {
    if (startingFreshRef.current || checking || submitting || submissionUnknown) return;
    setReview(prev => (prev ?? []).map(x => {
      if (x.key !== r.key) return x;
      const meaningChanged = (patch.chosenSkuId !== undefined && patch.chosenSkuId !== x.chosenSkuId)
        || (patch.spokenUnit !== undefined && patch.spokenUnit !== x.spokenUnit)
        || patch.cases !== undefined || patch.units !== undefined;
      const restate = x.quantityWasUncertain && meaningChanged && patch.unconfirmedQuantityFields === undefined;
      return { ...x, largeCountConfirmed: undefined,
        ...(restate ? { quantityKnown: false, quantityNeedsReview: true, unconfirmedQuantityFields: ["cases", "units"] as ("cases" | "units")[] } : {}), ...patch };
    }));
  }

  function answerSpokenUnit(r: ReviewItem) {
    const unit = r.unitDraft?.trim().toLowerCase();
    if (unit) editReview(r, { spokenUnit: unit, unitMultiplier: undefined, unitNeedsReview: false, unitChoiceConfirmed: true });
  }

  function chooseReviewSku(r: ReviewItem, id: string) {
    const before = reviewSku(r), after = skuById.get(id);
    const explicitCases = !r.spokenUnit && r.units === 0 && /\bcases?\b/i.test(`${r.quantityWords ?? ""} ${r.spoken}`);
    const basisChanged = !!before && before.id !== id && !r.spokenUnit && !explicitCases
      && foodImplicitUnit(before) !== foodImplicitUnit(after);
    editReview(r, { chosenSkuId: id, identityNeedsReview: false, unitMultiplier: undefined, unitChoiceConfirmed: false, search: "",
      ...(basisChanged ? { cases: 0, units: 0, quantityKnown: false, quantityNeedsReview: true,
        unconfirmedQuantityFields: ["cases", "units"] as ("cases" | "units")[] } : {}) });
  }

  function applyReview() {
    if (!review || startingFreshRef.current || dict.recording || voiceBusy || checking || submitting || submissionUnknown) return;
    for (const r of review) {
      if (!applyable(r) || appliedVoiceRowsRef.current.has(r)) continue;
      // Two taps can arrive before React replaces the footer. Consume this
      // exact reviewed amount once; a later take has new review objects.
      appliedVoiceRowsRef.current.add(r);
      const q = reviewQuantity(r);
      const sku = reviewSku(r)!;
      const raw = appendFoodSource(undefined, `${r.spoken} [confirmed: ${q.cases} cases × ${q.caseSize ?? "?"} + ${q.units} ${unitLabel(sku, q.units)}]`)!;
      // A SKU whose base unit IS case has one input, not "cases of cases".
      addToCell(r.chosenSkuId!, sku.countUnit === "case" ? 0 : q.cases,
        q.units + (sku.countUnit === "case" ? q.cases : 0), q.caseSize, raw, takeZoneId ?? zoneId);
    }
    // Anything unresolved STAYS on screen. Silently dropping a spoken item is
    // how a shelf goes missing from a count.
    const left = review.filter((r) => !applyable(r) && !appliedVoiceRowsRef.current.has(r));
    reviewRowsRef.current = left.length ? left : null;
    setReview(reviewRowsRef.current);
  }

  async function answerCaseSize(skuId: string, n: number) {
    if (checking || submitting || submissionUnknown) return;
    if (!Number.isInteger(n) || n < 1 || n > 10000) return;
    setCaseSizeErrors(prev => ({ ...prev, [skuId]: null }));
    try {
      // Persists on the SKU as 'manual', so the ask happens once per item ever
      // and invoice learning will never overwrite it.
      await setCaseSize(skuId, n);
      setCatalog((prev) => prev.map((s) => (s.id === skuId ? { ...s, unitsPerCase: n } : s)));
      setReview((prev) =>
        (prev ?? []).map((x) =>
          x.chosenSkuId === skuId ? { ...x, largeCountConfirmed: undefined } : x,
        ),
      );
    } catch {
      setVoiceErr("Couldn't save the case size.");
      setCaseSizeErrors(prev => ({ ...prev, [skuId]: "Couldn't save the case size. Enter it again to retry." }));
    }
  }

  // ── submit ──
  async function runCheck(recheck = false) {
    if (!sessionId || startingFreshRef.current || checking || submitting || submissionUnknown || voicePending || leaving) return;
    if (correctionConflictsRef.current.length) {
      setSubmitErr("Review the changed correction before rechecking.");
      return;
    }
    setChecking(true);
    setSubmitErr(null);
    setRechecked(recheck);
    checkedHashRef.current = null;
    try {
      // ⚠ FAILING OPEN ON THE CHECK IS FINE; FAILING OPEN ON PERSISTENCE IS NOT.
      // If the sheet did not reach the server there is nothing to submit, and
      // going on would close the count over a partial or empty set of rows.
      if (!(await doSave())) {
        setSubmitErr("Couldn't save the count — fix the connection, then Finish again.");
        return;
      }
      const res = await precheckCount(sessionId);
      checkedHashRef.current = res.linesHash ?? null;
      mergedSinceCheckRef.current = false;
      setFindings(res.findings);
      setMoreFindings(res.more ?? []);
      setShowMoreFindings(false);
      setCheckFailed(false);
      setRetiring(res.retiring ?? []);
      setUnplaced(res.unplaced ?? []);
      setUnplacedMore(res.unplacedMore ?? []);
      setUnplacedAll(false);
      reviewDirtyRef.current = false;
      setReviewDirty(false);
      setReviewMoved({});
    } catch {
      // A check that cannot RUN must not block a finished walk, and must not
      // pass itself off as a clean one either.
      setFindings([]);
      setMoreFindings([]);
      setCheckFailed(true);
      setRetiring([]);
      setUnplaced([]);
      setUnplacedMore([]);
      // The saved count is explicitly disclosed as unchecked. A later edit
      // invalidates this recovery choice just as it invalidates a clean check.
      reviewDirtyRef.current = false;
      setReviewDirty(false);
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

  /** Any shelf in this walk holding a positive count of it. "None left" is a
   *  claim about EVERY shelf, so one counted pack anywhere refutes it. */
  function countedAnywhere(skuId: string): boolean {
    return Object.values(countsRef.current).some((cells) => (cells[skuId]?.qty ?? 0) > 0);
  }

  /** "None left" on a discontinued row: nothing of it anywhere, so it comes
   *  off the walk for good (tprs 0196).
   *
   *  ⚠ THE ZERO IS SAVED FIRST. "None left" is a count of zero. Archiving
   *  alone left this count with no line for the item, and an absent line
   *  drops it from the bracket instead of recording that the 10 counted last
   *  time are gone. So the zero lands on the server before the archive, and a
   *  failed save archives nothing. Undo un-archives and removes only a zero
   *  this tap created. */
  async function markNoneLeft(skuId: string) {
    if (checking || submitting || submissionUnknown || noneLeft[skuId] === "saving" || countedAnywhere(skuId)) return;
    setNoneLeft((a) => ({ ...a, [skuId]: "saving" }));
    const shelf = zoneId;
    const created = !countsRef.current[shelf]?.[skuId];
    if (created) {
      const zero: Cell = { cases: null, units: 0, packs: null, packSize: null,
        caseSize: foodCaseSize(skuById.get(skuId)), qty: 0, source: "grid", none: true };
      const next = { ...countsRef.current, [shelf]: { ...(countsRef.current[shelf] ?? {}), [skuId]: zero } };
      adoptLocal(next);
    }
    if (!(await doSave())) {
      setNoneLeft((a) => ({ ...a, [skuId]: "failed" }));
      return;
    }
    try {
      await setSkuActive(skuId, false);
      if (created) setNoneLeftZero((z) => ({ ...z, [skuId]: shelf }));
      setNoneLeft((a) => ({ ...a, [skuId]: "archived" }));
    } catch {
      setNoneLeft((a) => ({ ...a, [skuId]: "failed" }));
    }
  }
  async function undoNoneLeft(skuId: string) {
    if (checking || submitting || submissionUnknown) return;
    try {
      await setSkuActive(skuId, true);
      const shelf = noneLeftZero[skuId];
      if (shelf && countsRef.current[shelf]?.[skuId]?.qty === 0) {
          const prev = countsRef.current;
          const cells = { ...(prev[shelf] ?? {}) };
          delete cells[skuId];
          adoptLocal({ ...prev, [shelf]: cells });
        scheduleSave();
      }
      setNoneLeftZero(({ [skuId]: _zero, ...rest }) => rest);
      setNoneLeft(({ [skuId]: _gone, ...rest }) => rest);
    } catch {
      setNoneLeft((a) => ({ ...a, [skuId]: "failed" }));
    }
  }

  /** "I missed it — let me count it now." Jumps to a shelf it usually
   *  lives on (or the current one, if nothing is recorded) and drops the
   *  row in, so the counter can type the number without hunting. */
  function countMissed(skuId: string) {
    // ⚠ THE THIRD setZoneId SITE, and it does not route through goZone(). The
    // findings panel can already be open when a take starts, so gating Finish
    // does not close this door.
    if (voicePending || retryTranscript || startingFreshRef.current || checking || submitting || submissionUnknown || leaving) return;
    const home = zones.find((z) => z.memberSkuIds?.includes(skuId));
    const target = home?.id ?? zoneId;
    setZoneId(target);
    rememberZone(sessionId, target);
    setAdded((prev) => {
      const cur = prev[target] ?? [];
      return cur.includes(skuId) ? prev : { ...prev, [target]: [...cur, skuId] };
    });
    setMissedAnswer((a) => ({ ...a, [skuId]: "counting" }));
    setFindings(null);
  }

  /** Voice work that must land before a count can close. Named once because
   *  it guards THREE things — Finish, the submit panel's own button, and
   *  doSubmit itself. Gating only the first still let a counter open the
   *  panel, start a recording behind it and tap Submit. */
  const voicePending = dict.recording || voiceBusy || (review?.length ?? 0) > 0;

  async function startFresh() {
    if (startingFreshRef.current || checking || submitting || submissionUnknown || voicePending
      || locationCollision || Object.values(placeQ).some(q => q.busy) || Object.values(noneLeft).includes("saving") || newSpot?.busy) return;
    startingFreshRef.current = true;
    setStartingFresh(true);
    setSubmitErr(null);
    try {
      // Drain the old draft's queued saves before switching any session refs.
      // A failed save or creation leaves that count on screen and retryable.
      if (!(await doSave(true))) {
        setSubmitErr("Couldn't save this count. Retry save before starting a new one.");
        return;
      }
      const sid = await createCount(true, "food");
      sessionIdRef.current = sid;
      setSessionId(sid);
      countsRef.current = {};
      setCounts({});
      saverRef.current!.loaded([], null);
      rememberZone(sid, zoneId);
      pendingCorrectionsRef.current = [];
      correctionConflictsRef.current = [];
      setCorrectionConflicts([]);
      setLocationCollision(null);
      reviewDirtyRef.current = false;
      setReviewDirty(false);
      setReviewMoved({});
      checkedHashRef.current = null;
      mergedSinceCheckRef.current = false;
      setMerged(false);
      setFindings(null);
      setMoreFindings([]);
      setShowMoreFindings(false);
      setCheckFailed(false);
      setRechecked(false);
      setRetiring([]);
      setUnplaced([]);
      setUnplacedMore([]);
      setUnplacedAll(false);
      setLocAnswer({});
      setMissedAnswer({});
      setNoneLeft({});
      setNoneLeftZero({});
      skippedLeaving.current.clear();
      setPlaceQ({});
      setLeaving(null);
      setNewSpot(null);
      setNewZoneIds([]);
      setAdded({});
      setSearch("");
      setQueuedZone(null);
      setFullCount(false);
      setScanNote(true);
      setReview(null);
      appliedVoiceRowsRef.current = new WeakSet();
      setTakeZoneId(null);
      setVoiceErr(null);
      setShowRecorderError(false);
      setRetryTranscript(null);
      segExtractsRef.current = new Map();
      carryRef.current!.reset();
      segmentGapRef.current = false;
      setInterrupted(false);
      setCaptureRequested(false);
      setCaseSizeErrors({});
      setToast(null);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = null;
      setResumed(false);
      setSave("idle");
    } catch {
      setSubmitErr("Couldn't start a new count. Your current count is still here. Try again.");
    } finally {
      startingFreshRef.current = false;
      setStartingFresh(false);
    }
  }

  async function doSubmit() {
    if (!sessionId || startingFreshRef.current || checking || submitting || submissionUnknown) return;
    // ⚠ The panel can be open while a NEW take is started behind it, so the
    // button's disabled state is not enough on its own.
    if (voicePending) return;
    if (reviewDirtyRef.current || correctionConflictsRef.current.length || locationCollision) {
      setSubmitErr("Count changed. Recheck before submitting.");
      return;
    }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      if (!(await doSave())) {
        setSubmitErr("Couldn't save the count — nothing was submitted. Try again.");
        setSubmitting(false);
        return;
      }
      if (reviewDirtyRef.current || correctionConflictsRef.current.length) {
        setSubmitting(false);
        setSubmitErr("Count changed while saving. Recheck before submitting.");
        return;
      }
      const checkedHash = checkedHashRef.current;
      setDoneCount(await submitCount(sessionId, fullCount, checkedHash ? { linesHash: checkedHash } : null));
      forgetZone(sessionId); // the walk is over; "where I was" means nothing now
    } catch (e) {
      setSubmitting(false);
      if (e instanceof ChangedSinceCheckError) {
        // Another phone moved the count after this check: check it again.
        void runCheck(true);
        return;
      }
      if (e instanceof SubmissionUnknownError) setSubmissionUnknown(true);
      else setSubmitErr("Count saved. Couldn't submit it. Try Submit the count again.");
    }
  }

  // ── where things live (Jon, 2026-10-03) ──
  // "for each zone, if we don't count something, it should ask us why ... Are
  // we out of it? Is it no longer stored in this location? Or, 'Whoops, I
  // forgot'". And before Submit, what we bought or cook with that no zone
  // lists. The preview Jon approved: Opsi previews/2026-10-03-walk-locations.html.
  //
  // ⚠ EVERY ANSWER WRITES ITS COUNT FIRST, exactly as the grid would, and only
  // then touches a zone list. The count is what the bracket reads; the lists
  // only say where to look next time, and a failed list update must never
  // cost the number (the server's own rule for PUT /skus/:id/zones).

  function setQ(key: string, patch: Partial<PlaceQ>) {
    setPlaceQ((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY_Q), ...patch } }));
  }

  /** One cell on a given zone, saved like the grid's. The ref first, so a save
   *  fired before React re-renders reads it (markNoneLeft's rule). */
  function putCell(zid: string, skuId: string, cell: Cell) {
    if (checking || submitting || submissionUnknown) return;
    if (!Number.isFinite(cell.qty) || cell.qty < 0) return;
    const next = { ...countsRef.current, [zid]: { ...(countsRef.current[zid] ?? {}), [skuId]: cell } };
    adoptLocal(next);
    scheduleSave();
  }

  /** "I looked and there are none": markNone's shape. */
  const zeroCell = (s: BarSkuItem): Cell =>
    ({ cases: null, units: 0, packs: null, packSize: null, caseSize: foodCaseSize(s), qty: 0, source: "grid", none: true });

  /** A fresh grid row's boxes: cases (× its case size) when it has one. */
  const hasCaseBox = (s: BarSkuItem) => foodCasesOnly(s) || (s.countUnit !== "case" && foodCaseSize(s) != null);

  /** The typed boxes as a cell, or null while there is nothing valid to save.
   *  A typed 0 is an answer, as on the grid. */
  function typedCell(s: BarSkuItem, q: PlaceQ): Cell | null {
    if (foodCasesOnly(s) && foodCaseSize(s) == null) return null;
    const read = (raw: string) => (raw.trim() === "" ? null : Number(raw));
    const cases = hasCaseBox(s) ? read(q.cases) : null;
    const units = foodCasesOnly(s) ? null : read(q.units);
    if (cases == null && units == null) return null;
    if ([cases, units].some((n) => n != null && (!Number.isFinite(n) || n < 0))) return null;
    const cell: Cell = { cases, units, packs: null, packSize: null, caseSize: hasCaseBox(s) ? foodCaseSize(s) : null,
      qty: 0, source: "grid", none: false };
    cell.qty = cellQty(cell);
    return Number.isFinite(cell.qty) && cell.qty >= 0 ? cell : null;
  }

  /** "2 cases + 3 bags", how a saved answer reads back. */
  function cellText(s: BarSkuItem, c: Cell): string {
    if (foodCasesOnly(s)) {
      const size = c.caseSize ?? foodCaseSize(s);
      if (size == null || size <= 0) return `${formatQty(c.qty)} individual pieces (case size needs confirmation)`;
      const cases = c.qty / size;
      return `${formatQty(cases)} case${cases === 1 ? "" : "s"}`;
    }
    const parts: string[] = [];
    if (c.cases) parts.push(`${formatQty(c.cases)} case${c.cases === 1 ? "" : "s"}`);
    if (c.units || parts.length === 0) parts.push(`${formatQty(c.units ?? 0)} ${unitLabel(s, c.units ?? 0)}`);
    return parts.join(" + ");
  }

  /** Mirror a membership the server accepted, so the grid and every later
   *  question see it without a reload. */
  function setMember(skuId: string, zid: string, member: boolean) {
    setZones((prev) => prev.map((z) => {
      if (z.id !== zid) return z;
      const ids = (z.memberSkuIds ?? []).filter((id) => id !== skuId);
      return { ...z, memberSkuIds: member ? [...ids, skuId] : ids };
    }));
  }

  /** Listed on this zone, still carried, and with no answer anywhere in this
   *  walk: the server's zone_members_uncounted, asked at the zone. */
  function unansweredMembers(zid: string): string[] {
    const answered = (id: string) => Object.values(countsRef.current).some((cells) => cells[id]);
    return (zones.find((z) => z.id === zid)?.memberSkuIds ?? [])
      .map((id) => skuById.get(id))
      .filter((s): s is BarSkuItem => !!s && !s.discontinuedAt && missedAnswer[s.id] !== "archived" && !answered(s.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => s.id);
  }

  /**
   * A requested move waits for the current take. Once its rows are resolved,
   * use the updated counts to check the original zone before moving away.
   * Untouched zones still belong to the warning at Finish.
   */
  function requestZone(target: string) {
    if (dict.recording || voiceBusy || startingFreshRef.current || checking || submitting || submissionUnknown || leaving) return;
    if (!zones.some(z => z.id === target)) return;
    if (target === zoneId) { setQueuedZone(null); return; }
    if (review?.length || retryTranscript) { setQueuedZone(target); return; }
    setQueuedZone(null);
    const touched = Object.keys(countsRef.current[zoneId] ?? {}).length > 0;
    const missing = touched && !skippedLeaving.current.has(zoneId)
      ? unansweredMembers(zoneId)
      : [];
    if (missing.length === 0) return goZoneId(target);
    setLeaving({ from: zoneId, to: target, skuIds: missing });
  }
  useEffect(() => {
    if (queuedZone && !voicePending && !retryTranscript && !startingFresh && !checking && !submitting && !submissionUnknown && !leaving) {
      requestZone(queuedZone);
    }
  }, [queuedZone, voicePending, retryTranscript, startingFresh, checking, submitting, submissionUnknown, leaving, zoneId]);
  function goZoneId(id: string) {
    const i = zones.findIndex((z) => z.id === id);
    if (i >= 0) goZone(i);
  }
  function leaveOn() {
    if (!leaving) return;
    skippedLeaving.current.add(leaving.from);
    const to = leaving.to;
    setLeaving(null);
    goZoneId(to);
  }

  const leaveKey = (from: string, skuId: string) => `leave:${from}:${skuId}`;

  /** "None left": a zero on the zone being left, the same as "none here". */
  function leaveNone(from: string, s: BarSkuItem) {
    putCell(from, s.id, zeroCell(s));
    setQ(leaveKey(from, s.id), { pick: "none", done: "None left · 0 counted", err: undefined });
  }
  /** "Count it": the whoops-I-forgot answer, counted on the zone being left. */
  function leaveCount(from: string, s: BarSkuItem) {
    const key = leaveKey(from, s.id);
    const cell = typedCell(s, placeQ[key] ?? EMPTY_Q);
    if (!cell) return;
    putCell(from, s.id, cell);
    setQ(key, { done: `${cellText(s, cell)} counted here`, err: undefined });
  }
  /** "Remove from zone": counted where it is now, then on that zone's list
   *  and off this one. Added before removed, so a failure halfway never
   *  leaves it on no zone at all. */
  async function leaveMoved(from: string, s: BarSkuItem) {
    const key = leaveKey(from, s.id);
    const q = placeQ[key] ?? EMPTY_Q;
    const cell = typedCell(s, q);
    const to = zones.find((z) => z.id === q.zone);
    if (!cell || !to || q.busy) return;
    setQ(key, { busy: true, err: undefined });
    await saveLocationCount(key, from, to.id, s.id, cell, async () => {
      const counted = `${cellText(s, countsRef.current[to.id][s.id])} counted in ${to.name}`;
      try { await setSkuZone(s.id, to.id, true); setMember(s.id, to.id, true); }
      catch { return setQ(key, { busy: false, done: `${counted}. Couldn't add it to that zone's list, so Finish will ask where it lives.` }); }
      try { await setSkuZone(s.id, from, false); setMember(s.id, from, false);
        setQ(key, { busy: false, done: `Moved to ${to.name} · ${counted}. Off this zone's list from now on.` }); }
      catch { setQ(key, { busy: false, done: `${counted} and on its list. Couldn't take it off this zone's list.` }); }
    });
    setQ(key, { busy: false });
  }

  const haveKey = (skuId: string) => `have:${skuId}`;

  /** "Yes, it's here" (a zone and a count), or "None left" (a zero, and where
   *  it goes when we have it, if they say). */
  async function saveHave(u: UnplacedItem) {
    const s = skuById.get(u.skuId);
    const key = haveKey(u.skuId);
    const q = placeQ[key] ?? EMPTY_Q;
    const z = zones.find((x) => x.id === q.zone);
    if (!s || q.busy) return;
    if (q.pick === "yes") {
      const cell = typedCell(s, q);
      if (!cell || !z) return;
      setQ(key, { busy: true, err: undefined });
      await saveLocationCount(key, zoneId, z.id, s.id, cell, async () => {
        const saved = countsRef.current[z.id][s.id];
        try { await setSkuZone(s.id, z.id, true); setMember(s.id, z.id, true);
          setQ(key, { busy: false, done: `${cellText(s, saved)} · ${z.name}. It'll be on that zone's list from now on.` }); }
        catch { setQ(key, { busy: false, done: `${cellText(s, saved)} counted in ${z.name}. Couldn't add it to that zone's list, so the next count asks again.` }); }
      });
      setQ(key, { busy: false });
      return;
    }
    if (q.pick !== "none") return;
    // A count line needs a zone. With none picked, the zero goes on the zone
    // the counter is standing in and lists nothing there: a zero is never
    // evidence of where a thing lives (the server's zone_unexpected rule).
    setQ(key, { busy: true, err: undefined });
    await saveLocationCount(key, zoneId, z?.id ?? zoneId, s.id, zeroCell(s), async () => {
      if (!z) return setQ(key, { done: "None left · 0 counted", err: undefined });
      try { await setSkuZone(s.id, z.id, true); setMember(s.id, z.id, true);
        setQ(key, { busy: false, done: `None left · 0 counted · lives in ${z.name}` }); }
      catch { setQ(key, { busy: false, done: `None left · 0 counted. Couldn't add it to ${z.name}'s list.` }); }
    });
    setQ(key, { busy: false });
  }
  /** "We stopped buying it": discontinued (tprs 0196), so it leaves the order
   *  guides and anything found can still be counted. */
  async function stopBuying(u: UnplacedItem) {
    const key = haveKey(u.skuId);
    if (placeQ[key]?.busy) return;
    setQ(key, { pick: null, busy: true, err: undefined });
    try {
      await setSkuDiscontinued(u.skuId, true);
      setCatalog((prev) => prev.map((s) => (s.id === u.skuId ? { ...s, discontinuedAt: new Date().toISOString() } : s)));
      setQ(key, { busy: false, done: "Off the order guides. If any turns up, it can still be counted." });
    } catch {
      setQ(key, { busy: false, err: "Couldn't save that. Try again." });
    }
  }

  function flash(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  /** "+ New spot": a zone in the walk where the counter says they reach it,
   *  then picked for the question that asked. */
  async function addSpot() {
    if (!newSpot || newSpot.busy) return;
    const name = newSpot.name.trim();
    if (!name) return;
    const asked = newSpot;
    setNewSpot({ ...asked, busy: true, err: null });
    try {
      const z = await createZone(name, asked.after || null);
      // By position, not walk order: the server may have renumbered the
      // others, and "after the Fryer Line" is what the counter said.
      setZones((prev) => {
        const next = [...prev];
        next.splice(asked.after ? prev.findIndex((x) => x.id === asked.after) + 1 : 0, 0, { ...z, memberSkuIds: [] });
        return next;
      });
      setNewZoneIds((ids) => [...ids, z.id]);
      setQ(asked.key, { zone: z.id });
      setNewSpot(null);
      flash(`Added “${z.name}” to the walk`);
    } catch (e) {
      const known = e instanceof ZoneNameTakenError ? zones.find((x) => x.id === e.zone.id) : undefined;
      if (known) {
        setQ(asked.key, { zone: known.id });
        setNewSpot(null);
        flash(`“${known.name}” is already on the walk, so it's picked`);
        return;
      }
      setNewSpot({ ...asked, busy: false, err: e instanceof ZoneNameTakenError
        ? `There's already a zone called “${e.zone.name}”. Try another name.`
        : "Couldn't add it. Check the connection and try again." });
    }
  }

  /** The zone choices under "where is it?", with "+ New spot" last. Tapping
   *  the picked one again unpicks it (the "None left" zone is optional). */
  function zoneChips(key: string, q: PlaceQ, exclude: string | null) {
    return (
      <div className="lq-fc-chips">
        {zones.filter((z) => z.id !== exclude).map((z) => {
          const isNew = newZoneIds.includes(z.id);
          return (
            <button
              key={z.id}
              type="button"
              aria-pressed={q.zone === z.id}
              className={`lq-fc-chip${q.zone === z.id ? " lq-fc-chip-on" : ""}${isNew ? " lq-fc-chip-new" : ""}`}
              onClick={() => setQ(key, { zone: q.zone === z.id ? null : z.id })}
            >
              {z.name}{isNew ? " (new)" : ""}
            </button>
          );
        })}
        <button
          type="button"
          className="lq-fc-chip lq-fc-chip-add"
          onClick={() => setNewSpot({ key, name: "", after: zoneId, busy: false, err: null })}
        >
          + New spot
        </button>
      </div>
    );
  }

  /** The count boxes on a question: the grid's own, then Save. */
  function qtyBoxes(key: string, s: BarSkuItem, q: PlaceQ, onSave: () => void) {
    const ready = typedCell(s, q) != null && !q.busy;
    const onEnter = (e: { key: string }) => { if (e.key === "Enter" && ready) onSave(); };
    const centre = (e: { currentTarget: HTMLInputElement }) =>
      e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" });
    return (
      <div className="lq-fc-q-qty">
        {hasCaseBox(s) && (
          <label>
            <span>cases <span className="lq-fc-row-mult">×{foodCaseSize(s) ?? "?"}</span></span>
            <input type="number" inputMode="decimal" min={0} step="any" aria-label={`${s.name}: cases`}
              disabled={foodCasesOnly(s) && foodCaseSize(s) == null}
              value={q.cases} onFocus={centre} onKeyDown={onEnter} onChange={(e) => setQ(key, { cases: e.target.value })} />
          </label>
        )}
        {!foodCasesOnly(s) && <label>
          <span>{unitLabel(s, 2)}</span>
          <input type="number" inputMode="decimal" min={0} step="any" aria-label={`${s.name}: ${unitLabel(s, 2)}`}
            value={q.units} onFocus={centre} onKeyDown={onEnter} onChange={(e) => setQ(key, { units: e.target.value })} />
        </label>}
        {foodCasesOnly(s) && foodCaseSize(s) == null && caseSizeQuestion(s)}
        <button type="button" className="lq-btn lq-fc-q-save" disabled={!ready} onClick={onSave}>
          {q.busy ? "Saving…" : "Save"}
        </button>
      </div>
    );
  }

  function caseSizeQuestion(s: BarSkuItem) {
    return <label className="lq-fc-row-box">
      <span>Check the package: how many pieces in one case?</span>
      <input type="number" min={1} max={10000} inputMode="numeric" aria-label={`Units per case for ${s.name}`}
        onBlur={e => void answerCaseSize(s.id, Number(e.target.value))}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      {caseSizeErrors[s.id] && <span className="lq-error" role="alert">{caseSizeErrors[s.id]}</span>}
    </label>;
  }

  /** The item's name, head first, as the grid shows it. */
  function qName(name: string) {
    const [head, rest] = splitDisplayName(name);
    return (
      <p className="lq-fc-q-name" title={name}>
        <strong>{head}</strong>
        {rest && <span className="lq-fc-q-rest"> {rest}</span>}
      </p>
    );
  }

  const choice = (on: boolean) => `lq-fc-choice${on ? " lq-fc-choice-on" : ""}`;

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
  // Discontinued items (tprs 0196) are leftovers: listed last under their own
  // heading, and left out of "X of Y counted", because nothing is owed on them.
  const visibleRows = rows.filter((s) => !search.trim() || foodSearchMatch(s, search));
  const allCarriedRows = rows.filter((s) => !s.discontinuedAt);
  const carriedRows = visibleRows.filter((s) => !s.discontinuedAt);
  const leftoverRows = visibleRows.filter((s) => s.discontinuedAt);
  const carriedCounted = allCarriedRows.filter((s) => zoneCells[s.id]).length;
  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const have = new Set(rowIds);
    return catalog
      .filter((s) => !have.has(s.id) && foodSearchMatch(s, q))
      .slice(0, 8);
  }, [search, catalog, rowIds]);

  // Walk position, for the zone header. A counter needs to know how far
  // through the kitchen they are without scrolling a tab strip sideways.
  const zoneIdx = Math.max(0, zones.findIndex((z) => z.id === zoneId));
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
    // Every route, including a jump from a finding, must finish the take first.
    if (voicePending || retryTranscript || startingFreshRef.current || checking || submitting || submissionUnknown) return;
    const z = zones[Math.min(Math.max(i, 0), zones.length - 1)];
    if (!z) return;
    setZoneId(z.id);
    rememberZone(sessionId, z.id);
    setSearch("");
    setQueuedZone(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const totalLines = Object.values(counts).reduce((a, z) => a + Object.keys(z).length, 0);
  const zonesTouched = Object.entries(counts).filter(([, z]) => Object.keys(z).length > 0).length;
  /** Shelves with not one line on them. "Counted zero" is an answer and does
   *  not appear here; only "never opened" does. */
  const untouchedZones = zones.filter((z) => Object.keys(counts[z.id] ?? {}).length === 0);
  const unplacedLeft = [...unplaced, ...unplacedMore].filter((u) => !placeQ[haveKey(u.skuId)]?.done).length;

  function trackCorrection(fromZone: string, fromSku: string, toZone: string, toSku: string) {
    const keys = [`${fromZone}:${fromSku}`, `${toZone}:${toSku}`];
    const chains = pendingCorrectionsRef.current.filter((c) => c.keys.some((key) => keys.includes(key)));
    pendingCorrectionsRef.current = [...pendingCorrectionsRef.current.filter((c) => !chains.includes(c)),
      { fromZone: chains[0]?.fromZone ?? fromZone, fromSku: chains[0]?.fromSku ?? fromSku, toZone, toSku,
        keys: [...new Set([...keys, ...chains.flatMap((c) => c.keys)])] }];
    correctionConflictsRef.current = correctionConflictsRef.current.filter((c) => !c.keys.some((key) => keys.includes(key)));
    setCorrectionConflicts(correctionConflictsRef.current);
  }

  function editVoiceQuantity(r: ReviewItem, field: "cases" | "units", raw: string, replacesAll = false) {
    const n = readFoodNumber(raw);
    editReview(r, { ...confirmFoodQuantity(r, field, n, replacesAll),
      ...(n != null && replacesAll && field === "cases" ? { units: 0, unitNeedsReview: false, spokenUnit: null, unitMultiplier: undefined, unitChoiceConfirmed: true } : {}) });
  }

  async function saveLocationCount(key: string, from: string, zid: string, skuId: string, cell: Cell, afterSave: () => Promise<void>, mode?: "add" | "replace") {
    if (checking || submitting || submissionUnknown) {
      setQ(key, { busy: false });
      return;
    }
    const existing = countsRef.current[zid]?.[skuId];
    if (existing && !mode) {
      setQ(key, { busy: false });
      setLocationCollision({ key, zid, skuId, cell, from, afterSave });
      return;
    }
    setQ(key, { busy: true, err: undefined });
    trackCorrection(from, skuId, zid, skuId);
    putCell(zid, skuId, mode === "add" && existing ? mergeFoodCells(cell, existing) : cell);
    const attempted = flatten(countsRef.current).find((l) => l.zoneId === zid && l.skuId === skuId);
    setLocationCollision(null);
    // Membership must never claim a shelf move whose observed count failed to
    // save. A refused compound save pauses here before any list request.
    try {
      const saved = await doSave();
      const current = flatten(countsRef.current).find((l) => l.zoneId === zid && l.skuId === skuId);
      if (!saved || !sameDraftCell(attempted, current)) {
        setQ(key, { err: correctionConflictsRef.current.length
          ? "This count changed elsewhere. Review the saved counts, then answer this location again."
          : "Couldn't confirm this count. The shelf list wasn't changed. Review the count, then Save again." });
        return;
      }
      await afterSave();
    } catch {
      setQ(key, { err: "Couldn't finish this location change. Review the count and shelf list, then Save again." });
    } finally {
      setQ(key, { busy: false });
    }
  }

  function changeFoodItem(zid: string, from: string, to: string, mode: "move" | "add" | "replace", answered?: Cell) {
    if (checking || submitting || submissionUnknown || from === to) return;
    const source = countsRef.current[zid]?.[from];
    const a = skuById.get(from), target = skuById.get(to);
    if (!source || !a || !target || (!compatibleFoodUnits(a, target) && !answered)) return;
    const existing = countsRef.current[zid]?.[to];
    if (existing && mode === "move") return;
    const replacement: Cell = answered ? { ...answered, raw: appendFoodSource(source.raw, answered.raw) } : { ...source, source: "grid" };
    if (!Number.isFinite(replacement.qty) || replacement.qty < 0) return;
    trackCorrection(zid, from, zid, to);
    const cells = { ...(countsRef.current[zid] ?? {}) };
    cells[to] = mode === "add" && existing ? mergeFoodCells(replacement, existing) : replacement;
    delete cells[from];
    adoptLocal({ ...countsRef.current, [zid]: cells });
    setReviewMoved((previous) => ({ ...Object.fromEntries(Object.entries(previous).map(([key, value]) =>
      [key, key.startsWith(`${zid}:`) && value === from ? to : value])), [`${zid}:${from}`]: to }));
    scheduleSave();
  }

  function keepSavedCorrection() {
    correctionConflictsRef.current = [];
    setCorrectionConflicts([]);
    markCountChanged();
    scheduleSave();
  }

  function correctionNotice() {
    if (!correctionConflicts.length) return null;
    return <div className="lq-review-changed" role="alert"><strong>Correction needs another look</strong>
      <p>Another save changed a count used in this correction. These are the current saved counts. Confirm the item or shelf correction again, or keep these counts.</p>
      {correctionConflicts.map((c, i) => <p key={i}>{c.keys.map((key) => {
        const split = key.indexOf(":"), zid = key.slice(0, split), id = key.slice(split + 1);
        const cell = counts[zid]?.[id];
        return `${zones.find((z) => z.id === zid)?.name ?? "Saved shelf"}: ${skuById.get(id)?.name ?? "Item"} ${cell ? cellText(skuById.get(id)!, cell) : "not counted"}`;
      }).join(" · ")}</p>)}
      <button type="button" className="lq-btn lq-btn-ghost" disabled={checking || submitting} onClick={keepSavedCorrection}>Keep saved counts</button>
    </div>;
  }

  function foodFindingDetails(f: PrecheckFinding) {
    const ids = new Set(f.relatedSkuIds ?? [f.skuId]);
    if (![...ids].some((id) => skuById.has(id))) return undefined;
    const entries = Object.entries(counts).flatMap(([zid, cells]) => Object.entries(cells)
      .filter(([id]) => ids.has(id) || [...ids].some((old) => reviewMoved[`${zid}:${old}`] === id))
      .map(([id, cell]) => ({ zid, id, cell })))
      .sort((a, b) => (zones.find((z) => z.id === a.zid)?.walkOrder ?? 999) - (zones.find((z) => z.id === b.zid)?.walkOrder ?? 999));
    return <div className="lq-review-counts"><p className="lq-review-counts-heading">Where you counted</p>
      {entries.length === 0 && <p>No count entered for this item yet.</p>}
      {entries.map(({ zid, id, cell }) => <FoodReviewCountRow key={`${zid}:${id}`} zid={zid} sku={skuById.get(id)!} cell={cell}
        shelf={zones.find((z) => z.id === zid)?.name ?? "Saved shelf"} catalog={catalog} existing={counts[zid] ?? {}}
        disabled={checking || submitting} quantitiesDisabled={correctionConflicts.some((c) => c.keys.includes(`${zid}:${id}`))}
        onEdit={(field, raw) => editBox(id, field, raw, cell.caseSize ?? foodCaseSize(skuById.get(id)), zid)}
        onNone={() => writeCell(id, { cases: null, packs: null, units: 0, none: true }, zid)}
        onChangeItem={(to, mode, answer) => changeFoodItem(zid, id, to, mode, answer)} />)}
      <button type="button" className="lq-linkbtn" disabled={voicePending || !!retryTranscript || checking || submitting || !!leaving} onClick={() => {
        if (voicePending || retryTranscript || startingFreshRef.current || checking || submitting || submissionUnknown || leaving) return;
        const dest = f.zoneId ?? entries[0]?.zid ?? zoneId;
        goZoneId(dest); setSearch(skuById.get(f.skuId)?.name ?? f.name); setFindings(null);
        requestAnimationFrame(() => document.querySelector(".lq-fc-count-search")?.scrollIntoView({ block: "center" }));
      }}>Open on count screen</button>
    </div>;
  }

  if (phase === "loading") return <div className="lq-center lq-muted">Loading the kitchen…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">{err}</p>
        <button type="button" className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  if (entryDraft) return <CountEntryChoice kind="food" draft={entryDraft} busy={entryBusy} error={entryError}
    onContinue={continueEntry} onNew={() => void startEntry()} onBack={() => {
      if (entryBusyRef.current) return;
      entryBusyRef.current = true;
      onDone();
    }} />;
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
      <fieldset className="lq-count-controls" disabled={startingFresh || checking || submitting || submissionUnknown || !!leaving} inert={!!leaving} aria-label="Kitchen count">
      {resumed && <div className="lq-resumed">
        <span>Picked up your count in progress.</span>
        <button type="button" className="lq-linkbtn" disabled={startingFresh || checking || submitting || submissionUnknown || voicePending}
          onClick={() => void startFresh()}>{startingFresh ? "Starting…" : "Start a new count"}</button>
      </div>}
      {scanNote && totalLines === 0 && (
        <div className="lq-fc-scannote">
          <span>Scan any delivery invoices that aren&rsquo;t in yet.</span>
          <button type="button" onClick={() => setScanNote(false)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="lq-fc-zonehead">
        <div className="lq-fc-location">
          <label htmlFor="food-count-location" className="lq-fc-location-label">Count location</label>
          <select id="food-count-location" className="lq-fc-location-select" value={zoneId} disabled={dict.recording || voiceBusy}
            aria-describedby="food-location-progress" onChange={e => requestZone(e.target.value)}>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <span id="food-location-progress" className="lq-fc-zonemeta">
            Location {zoneIdx + 1} of {zones.length} · {carriedCounted} of {allCarriedRows.length} counted
          </span>
        </div>
      </div>

      {queuedZone && (
        <div className="lq-fc-location-pending" role="status" ref={queuedLocationRef}>
          <span>{retryTranscript ? "Retry or discard this transcript" : "Add or discard the remaining items"} in <strong>{zone?.name}</strong> before moving to <strong>{zones.find(z => z.id === queuedZone)?.name}</strong>.</span>
          <button type="button" className="lq-linkbtn" onClick={() => setQueuedZone(null)}>Stay here</button>
        </div>
      )}

      {/* ── voice ── */}
      <div className="lq-fc-voicebar">
        {!dict.recording && (
          <button
            type="button"
            className="lq-btn"
            onClick={() => {
              if (startingFreshRef.current || voicePending || leaving || checking || submitting || submissionUnknown) return;
              segExtractsRef.current = new Map();
              carryRef.current!.reset(); // a new take must not inherit a held item
              segmentGapRef.current = false;
              setVoiceErr(null);
              setShowRecorderError(true);
              setRetryTranscript(null);
              setTakeZoneId(zoneId); // the shelf this take is about
              setCaptureRequested(true);
              dict.start();
            }}
            // ⚠ ONE OUTSTANDING TAKE AT A TIME. There is a single takeZoneId,
            // so starting a second take overwrote the first one's destination
            // and the older rows then applied to the NEW shelf. Finishing the
            // heard items first is the smallest correct rule — and reviewing
            // one shelf's worth at a time is what a counter does anyway.
            disabled={voiceBusy || submitting || (review?.length ?? 0) > 0}
          >
            {(review?.length ?? 0) > 0
              ? "Finish the heard items first"
              : `🎙️ Talk through ${zone?.name ?? "this zone"}`}
          </button>
        )}
        {/* ⚠ WHILE RECORDING, THIS SCREEN USED TO SHOW ONLY A TIMER.
            The liquor walk has had a level meter, a dead-mic warning and a
            "still connecting" state since the 2026-07-28 incident — a 103s
            count with a 38-SECOND capture blackout. The kitchen screen shipped
            without any of it, so a counter could talk into a dead phone for
            four minutes and the screen would look entirely normal: same button,
            same ticking timer, nothing wrong until an empty transcript came
            back. On Android a voice call takes the mic exactly this way.

            The hook already computed all of this (armed, level, quiet) and beeps
            and vibrates on it. Only the EYES were missing, and a counter holding
            a phone in a noisy kitchen needs visible feedback too. */}
        {capturing && (
          <div className={`lq-rec${dict.seconds >= WARN_SECONDS ? " lq-rec-warn" : ""}`}>
            <div className="lq-rec-head">
              <span className="lq-rec-dot" aria-hidden="true" />
              <span className="lq-rec-label">{dict.quiet ? "Mic silent" : "Listening…"}</span>
              <span className="lq-rec-timer">{mmss(dict.seconds)} / {mmss(CAP_SECONDS)}</span>
            </div>
            {dict.metering && (
              <div className={`lq-mic-meter${dict.quiet ? " is-quiet" : ""}`} aria-hidden="true">
                <div className="lq-mic-meter-fill" style={{ width: `${Math.round(dict.level * 100)}%` }} />
              </div>
            )}
            {dict.quiet && (
              <p className="lq-rec-warntext" role="status">
                {/* Same rule as the sticky notice: earlier speech may exist
                    only as unuploaded audio or unapplied rows, so "still
                    saved" is a promise this screen cannot keep. */}
                The phone mic hasn't heard speech for a bit. If you're still counting, speak toward the phone. After a call, stop and check what came back.
              </p>
            )}
            {/* Wait until the phone microphone is ready before speaking. */}
            {!dict.armed && <p className="lq-muted">Connecting to mic… (buzzes when ready)</p>}
            {dict.transcript && <p className="lq-rec-transcript" ref={liveTextRef}>{dict.transcript}</p>}
            <p className="lq-muted">
              Going to <strong>{zones.find((z) => z.id === (takeZoneId ?? zoneId))?.name ?? "this shelf"}</strong>
              {" — stop before moving to another shelf. Starting again adds to it."}
            </p>
            <button
              type="button"
              className="lq-btn lq-btn-primary lq-rec-stop"
              disabled={!capturing}
              onClick={() => {
                setCaptureRequested(false); // speech is over; the shelf is free again
                dict.stop();
              }}
            >
              ■ Stop &amp; review
            </button>
          </div>
        )}
        {capturing && dict.seconds >= WARN_SECONDS && (
          <span className="lq-rec-warntext">
            Wrap up this shelf — stopping at {mmss(CAP_SECONDS)}. Starting again adds to it.
          </span>
        )}
        {processingVoice && dict.transcript && <p className="lq-rec-transcript">{dict.transcript}</p>}
        {showRecorderError && dict.error && !dict.recording && (
          <p className="lq-error" role="alert">
            {dict.error === "not-allowed" || dict.error === "service-not-allowed"
              ? "Allow microphone access, then try recording again."
              : dict.error === "audio-capture"
                ? "The phone microphone stopped. Stop any call, then record the missing items or type them."
                : dict.error === "transcription failed" || dict.error === "network"
                  ? "Part of the recording could not be transcribed. Record the missing items again or type them."
                  : dict.error}
          </p>
        )}
        {voiceErr && <span className="lq-error">{voiceErr}</span>}
        {retryTranscript && !review?.length && !voiceBusy && (
          <>
            <button type="button" className="lq-linkbtn" onClick={() => void onTranscript(retryTranscript)}>Retry reading this transcript</button>
            <button type="button" className="lq-linkbtn" onClick={() => { setRetryTranscript(null); setVoiceErr(null); }}>Discard transcript</button>
          </>
        )}
      </div>
      {!dict.recording && dict.transcript && (review || voiceErr) && (
        <details className="lq-fc-transcript">
          <summary>Full transcript</summary>
          <p>{dict.transcript}</p>
        </details>
      )}

      {interrupted && (
        <div className="lq-fc-rev" role="status">
          <p className="lq-rec-warntext">
            {/* ⚠ CLAIM ONLY WHAT IS KNOWN. An earlier draft said "what you
                said before it is still saved" — but unuploaded audio,
                transcripts and unapplied rows are not durable count data. And
                the page being hidden does not prove capture stopped, so
                promising the gap is missing invites re-counting quantities we
                already have. */}
            Recording may have been interrupted. Check for missing items before continuing.
          </p>
          <button type="button" className="lq-btn lq-btn-ghost" onClick={() => setInterrupted(false)}>
            Got it
          </button>
        </div>
      )}

      {review && (
        <div className="lq-fc-rev" ref={voiceReviewRef}>
          <p className="lq-fc-rev-h">
            Check {review.length} heard item{review.length === 1 ? "" : "s"}
          </p>
          {review.map(r => <FoodVoiceReviewRow key={r.key} item={r} sku={reviewSku(r)} catalog={catalog}
            ready={applyable(r)} concern={warning(r)} onEdit={patch => editReview(r, patch)}
            onChoose={id => chooseReviewSku(r, id)} onQuantity={(field, raw, replacesAll) => editVoiceQuantity(r, field, raw, replacesAll)}
            onUnit={() => answerSpokenUnit(r)} onCaseSize={n => void answerCaseSize(r.chosenSkuId!, n)}
            enteredCounts={enteredCounts} countLocation={zones.find(z => z.id === reviewZoneId)?.name}
            onUseEntered={choice => useEnteredCount(r, choice)}
            onDiscard={() => { removeReviewRow(r); }} />)}
        </div>
      )}

      {/* ── the grid ── */}
      <div className="lq-fc-addbox lq-fc-count-search">
        {correctionNotice()}
        <input type="search" aria-label="Search counted items and catalog" placeholder="Find a counted item or add from catalog…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        {search.trim() && <>
          <button type="button" className="lq-linkbtn" onClick={() => setSearch("")}>Clear search</button>
          <p className="lq-muted" role="status">{visibleRows.filter((s) => zoneCells[s.id]).length} counted items · {visibleRows.length} listed matches on this shelf</p>
          {visibleRows.length === 0 && <p className="lq-muted">No matching items on this shelf.</p>}
        </>}
        {searchHits.length > 0 && <span className="lq-cap-title">Add from catalog</span>}
        {searchHits.map((s) => <button key={s.id} type="button" className="lq-linkbtn" onClick={() => {
          setAdded((prev) => ({ ...prev, [zoneId]: [...(prev[zoneId] ?? []), s.id] })); setSearch("");
        }}>+ {s.name}</button>)}
        {search.trim().length >= 2 && visibleRows.length === 0 && searchHits.length === 0 && <p className="lq-muted">No catalog matches. Try another name.</p>}
      </div>
      <div className="lq-fc-grid">
        {rows.length === 0 && (
          <p className="lq-muted lq-fc-grid-empty">
            Nothing listed for this shelf yet — search above to add an item.
          </p>
        )}
        {[...carriedRows, ...leftoverRows].map((s, i) => {
          const c = zoneCells[s.id];
          const caseSize = c?.caseSize ?? foodCaseSize(s);
          const knownCaseSize = caseSize != null && caseSize > 0;
          const casesOnly = foodCasesOnly(s);
          const displayedCases = c && casesOnly && knownCaseSize ? c.qty / caseSize! : c?.cases ?? 0;
          const [head, rest] = splitDisplayName(s.name);
          const leftover = !!s.discontinuedAt;
          const replacement = s.replacedBySkuId ? skuById.get(s.replacedBySkuId)?.name : undefined;
          return (
            <Fragment key={s.id}>
            {leftover && i === carriedRows.length && (
              <div className="lq-fc-leftovers-head">
                <p className="lq-fc-leftovers-title">Discontinued, count leftovers</p>
                <p className="lq-muted lq-fc-leftovers-sub">
                  We don't order these any more. Count any you find, or tap "None left" to take it off the walk.
                </p>
              </div>
            )}
            {leftover && noneLeft[s.id] === "archived" ? (
              <div className="lq-fc-row lq-fc-row-gone">
                <span>{s.name}: none left, off the walk.</span>
                <button type="button" className="lq-linkbtn" onClick={() => void undoNoneLeft(s.id)}>Undo</button>
              </div>
            ) : (
            <div className={`lq-fc-row${c ? " lq-fc-row-counted" : ""}${leftover ? " lq-fc-row-leftover" : ""}${foodCasesOnly(s) ? " lq-fc-row-cases" : ""}`}>
              <fieldset className="lq-fc-cell-controls" disabled={correctionConflicts.some((q) => q.keys.includes(`${zoneId}:${s.id}`))} aria-label={`${s.name} on ${zone?.name ?? "this shelf"}`}>
              <div className="lq-fc-row-name" title={s.name}>
                <span className="lq-fc-row-label">
                  <span className="lq-fc-row-head">{head}</span>
                  {rest && <span className="lq-fc-row-rest">{rest}</span>}
                  {c?.source === "voice" && <span className="lq-fc-row-voice" title={c.raw}>🎙️</span>}
                </span>
                {replacement && <span className="lq-muted lq-fc-row-replaced">Now: {replacement}</span>}
                {/* "none here" is OUTSIDE the has-a-cell guard on purpose: its
                    whole job is the first answer on an untouched row — the
                    counter reaches a listed item, sees an empty shelf, and
                    says so. Behind the guard it only appeared once a cell
                    already existed, which is exactly when it is least needed. */}
                <span className="lq-fc-row-sum">
                  {c && <span className="lq-fc-row-total">Total {casesOnly ? cellText(s, c) : `${formatQty(c.qty)} ${unitLabel(s, c.qty)}`}</span>}
                  <button
                    type="button"
                    className={`lq-fc-row-none${c?.none && !c.qty ? " lq-fc-row-none-on" : ""}`}
                    onClick={() => markNone(s.id)}
                    title="I looked — there are none here"
                  >
                    None here
                  </button>
                  {c && (
                    <button
                      type="button"
                      className="lq-fc-row-clear"
                      onClick={() => clearCell(s.id)}
                    >
                      Clear
                    </button>
                  )}
                  {/* Only while nothing is counted on ANY shelf: "none left"
                      archives everywhere, so a counted pack anywhere refutes it. */}
                  {leftover && !Object.values(counts).some((cells) => (cells[s.id]?.qty ?? 0) > 0) && (
                    <button
                      type="button"
                      className="lq-fc-row-noneleft"
                      disabled={noneLeft[s.id] === "saving"}
                      onClick={() => void markNoneLeft(s.id)}
                      title="There is none of this anywhere: take it off the walk"
                    >
                      None left
                    </button>
                  )}
                </span>
                {noneLeft[s.id] === "failed" && <span className="lq-error">Couldn't save that. Try again.</span>}
                {!!c?.packs && <span className="lq-muted">Includes {formatQty(c.packs)} packs × {formatQty(c.packSize)}, plus the quantities below.</span>}
                {casesOnly && !!c?.units && <span className="lq-muted lq-fc-legacy-units">Earlier entry includes {formatQty(c.units)} individual pieces. Its total is shown in cases. Entering a case amount replaces this earlier entry.</span>}
              </div>
              <div className="lq-fc-row-inputs">
                {!casesOnly && c?.packSize != null && <div className="lq-fc-row-box">
                  <span className="lq-fc-row-lab">Packs <span className="lq-fc-row-mult">×{formatQty(c.packSize)}</span></span>
                  <div className="lq-fc-stepper">
                    <button type="button" aria-label={`Decrease packs of ${s.name}`} disabled={checking || submitting || (c.packs ?? 0) <= 0} onClick={() => stepBox(s.id, "packs", -1)}>−</button>
                    <FoodNumberInput type="number" inputMode="decimal" step="any" min={0} aria-label={`${s.name}: packs`} value={c.packs ?? undefined}
                      disabled={checking || submitting} onFocus={keepInView} onRaw={(raw) => editBox(s.id, "packs", raw, c.caseSize)} />
                    <button type="button" aria-label={`Increase packs of ${s.name}`} disabled={checking || submitting} onClick={() => stepBox(s.id, "packs", 1)}>+</button>
                  </div>
                </div>}
                {(foodCasesOnly(s) || s.countUnit !== "case" || !!c?.cases) && (foodCasesOnly(s) || caseSize != null) && (
                  <div className="lq-fc-row-box">
                    {/* The "× N" chip is what tells a MULTIPLIER box apart from a
                        loose box that happens to be counted in cases. Without it
                        two different boxes both read "cases". */}
                    <span className="lq-fc-row-lab">
                      Cases <span className="lq-fc-row-mult">×{knownCaseSize ? formatQty(caseSize) : "?"}</span>
                    </span>
                    <div className="lq-fc-stepper">
                    <button type="button" aria-label={`Decrease cases of ${s.name}`} disabled={checking || submitting || (casesOnly && !knownCaseSize) || displayedCases <= 0} onClick={() => stepBox(s.id, "cases", -1)}>−</button>
                    <FoodNumberInput
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      aria-label={`${s.name}: cases`}
                      disabled={checking || submitting || (casesOnly && !knownCaseSize)}
                      value={c && foodCasesOnly(s) ? knownCaseSize ? c.qty / caseSize! : undefined : c?.cases ?? undefined}
                      onFocus={keepInView}
                      onRaw={(raw) => editBox(s.id, "cases", raw, caseSize)}
                    />
                    <button type="button" aria-label={`Increase cases of ${s.name}`} disabled={checking || submitting || (casesOnly && !knownCaseSize)} onClick={() => stepBox(s.id, "cases", 1)}>+</button>
                    </div>
                  </div>
                )}
                {!casesOnly && <div className="lq-fc-row-box">
                  <span className="lq-fc-row-lab">{caseSize != null && s.countUnit !== "case" ? "Loose " : ""}{unitLabel(s, 2)}</span>
                  <div className="lq-fc-stepper">
                  <button type="button" aria-label={`Decrease loose ${unitLabel(s, 2)} of ${s.name}`} disabled={checking || submitting || (c?.units ?? 0) <= 0} onClick={() => stepBox(s.id, "units", -1)}>−</button>
                    <FoodNumberInput
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    aria-label={`${s.name}: loose ${unitLabel(s, 2)}`}
                    value={c?.units ?? undefined}
                    disabled={checking || submitting}
                    onFocus={keepInView}
                    onRaw={(raw) => editBox(s.id, "units", raw, null)}
                  />
                  <button type="button" aria-label={`Increase loose ${unitLabel(s, 2)} of ${s.name}`} disabled={checking || submitting} onClick={() => stepBox(s.id, "units", 1)}>+</button>
                  </div>
                </div>}
                {foodCasesOnly(s) && !knownCaseSize && caseSizeQuestion(s)}
              </div>
              </fieldset>
            </div>
            )}
            </Fragment>
          );
        })}
      </div>

      {/* ── the pre-submit check ── */}
      {findings != null && (
        <div className="lq-fc-rev" ref={reviewRef}>
          <p className="lq-fc-rev-h">
            {checkFailed
              ? "The check couldn't run, so nothing was checked. You can still submit, or try Finish again."
              : findings.length + moreFindings.length === 0
                ? "Checked the entered quantities. Choose count type below."
                : `Check ${findings.length + moreFindings.length} item${findings.length + moreFindings.length === 1 ? "" : "s"}`}
          </p>
          {reviewDirty && <p className="lq-review-changed" role="status">Count changed. Recheck before submitting.</p>}
          {correctionNotice()}
          {rechecked && (
            <p className="lq-muted" style={{ fontSize: 13 }}>
              This is a fresh check of the saved count.
            </p>
          )}
          {(showMoreFindings ? [...findings, ...moreFindings] : findings).map((f, i) => {
            const locKey = f.zoneId ? `${f.skuId}:${f.zoneId}` : null;
            const answered = locKey ? locAnswer[locKey] : undefined;
            return (
              <div key={i} className="lq-fc-rev-row">
                <span className="lq-fc-rev-spoken">{f.name}</span>
                <FindingSummary finding={reviewDirty && !f.quantityUnit && skuById.has(f.skuId) ? { ...f,
                  counted: Object.values(counts).some((cells) => cells[f.skuId]) ? Object.values(counts).reduce((total, cells) => total + (cells[f.skuId]?.qty ?? 0), 0) : null } : f}
                  unit={f.quantityUnit ?? unitLabel(skuById.get(f.skuId), 2)} countDetails={foodFindingDetails(f)} />
                {/* NOT purchased_not_counted: that one arrived on an invoice
                    this period, so we demonstrably still carry it. Offering to
                    retire it would contradict the rule the timed list is built
                    on — a recent purchase is exactly what proves a product is
                    incoming rather than dying. Its remedy is "count it now". */}
                {f.kind === "not_counted" && (
                  <div className="lq-fc-rev-loc">
                    {missedAnswer[f.skuId] === "archived" ? (
                      <span className="lq-fc-rev-match">
                        Retired from future counts. Past counts kept.
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="lq-btn lq-fc-rev-locbtn"
                          disabled={voicePending || !!retryTranscript}
                          onClick={() => countMissed(f.skuId)}
                        >
                          Count it now
                        </button>
                        <button
                          type="button"
                          className="lq-btn lq-btn-ghost lq-fc-rev-locbtn"
                          onClick={() => void archiveMissed(f.skuId)}
                        >
                          We stopped carrying it
                        </button>
                      </>
                    )}
                  </div>
                )}
                {/* Same remedy as purchased_not_counted — jump to the shelf and
                    drop the row in. Deliberately NO "we don't carry it" here:
                    this finding says the item is ON A CHECKLIST THE COUNTER
                    JUST WALKED, which is evidence about attention, not about
                    whether the product is dead. Retiring on that basis would
                    let a rushed walk quietly shrink the catalog. */}
                {(f.kind === "purchased_not_counted" || f.kind === "zone_members_uncounted") && (
                  <div className="lq-fc-rev-loc">
                    <button
                      type="button"
                      className="lq-btn lq-fc-rev-locbtn"
                      disabled={voicePending || !!retryTranscript}
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
          {moreFindings.length > 0 && !showMoreFindings && (
            <button type="button" className="lq-linkbtn" onClick={() => setShowMoreFindings(true)}>
              Show {moreFindings.length} more
            </button>
          )}
          {/* ── things we think you have (2026-10-03) ── On no zone, so no
              walk asked: bought lately, or in a recipe. Asked here because
              the first walk has no "since the last count" to look back on.
              Advisory like everything in this panel: it never blocks Submit. */}
          {unplaced.length > 0 && (
            <div className="lq-fc-have">
              <p className="lq-fc-rev-h">
                {unplacedLeft > 0 ? `${unplacedLeft} thing${unplacedLeft === 1 ? "" : "s"} we think you have` : "All set"}
              </p>
              <p className="lq-muted lq-fc-have-sub">
                We bought these lately or use them in a recipe, but they&rsquo;re in no zone, so the walk never
                asked. Find each one, pick where it lives, and count it.
              </p>
              {(unplacedAll ? [...unplaced, ...unplacedMore] : unplaced).map((u) => {
                const s = skuById.get(u.skuId);
                const key = haveKey(u.skuId);
                const q = placeQ[key] ?? EMPTY_Q;
                return (
                  <div key={u.skuId} className="lq-fc-q">
                    {qName(u.name)}
                    {q.done ? (
                      <p className="lq-fc-q-done">✓ {q.done}</p>
                    ) : (
                      <>
                        <p className="lq-fc-q-why">{whyUnplaced(u)}</p>
                        {!s ? (
                          <p className="lq-muted">This screen's catalog doesn&rsquo;t have it yet. Reload to answer it.</p>
                        ) : (
                          <>
                            <p className="lq-fc-q-ask">Do we have any?</p>
                            <div className="lq-fc-choices">
                              <button type="button" className={choice(q.pick === "yes")} aria-pressed={q.pick === "yes"}
                                disabled={q.busy} onClick={() => setQ(key, { pick: "yes", err: undefined })}>
                                Yes, it&rsquo;s here
                              </button>
                              <button type="button" className={choice(q.pick === "none")} aria-pressed={q.pick === "none"}
                                disabled={q.busy} onClick={() => setQ(key, { pick: "none", err: undefined })}>
                                None left
                              </button>
                              <button type="button" className={choice(false)} disabled={q.busy}
                                onClick={() => void stopBuying(u)}>
                                We stopped buying it
                              </button>
                            </div>
                            {q.pick === "yes" && (
                              <>
                                <p className="lq-fc-q-ask">Where is it?</p>
                                {zoneChips(key, q, null)}
                                {q.zone && (
                                  <>
                                    <p className="lq-fc-q-ask">How many?</p>
                                    {qtyBoxes(key, s, q, () => void saveHave(u))}
                                  </>
                                )}
                              </>
                            )}
                            {q.pick === "none" && (
                              <>
                                <p className="lq-fc-q-ask">Where does it go when we have it? (optional)</p>
                                {zoneChips(key, q, null)}
                                <button type="button" className="lq-btn lq-fc-q-save lq-fc-q-save-solo" disabled={q.busy}
                                  onClick={() => void saveHave(u)}>
                                  {q.busy ? "Saving…" : "Save"}
                                </button>
                              </>
                            )}
                          </>
                        )}
                        {q.err && <p className="lq-error">{q.err}</p>}
                      </>
                    )}
                  </div>
                );
              })}
              {unplacedMore.length > 0 && !unplacedAll && (
                <button type="button" className="lq-linkbtn" onClick={() => setUnplacedAll(true)}>
                  Show {unplacedMore.length} more
                </button>
              )}
            </div>
          )}
          {retiring.length > 0 && (
            <div className="lq-retiring">
              <p className="lq-retiring-h">Have we stopped carrying these?</p>
              <p className="lq-muted lq-retiring-sub">
                Not stocked or bought in months. Retiring removes it from future counts.
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
                      We stopped carrying it
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="lq-fc-kind">
            <p className="lq-fc-kind-q">How much did you count?</p>
            <label className="lq-fc-kind-opt">
              <input
                type="radio"
                name="countkind"
                checked={!fullCount}
                onChange={() => setFullCount(false)}
              />
              <span>
                <strong>Trial / partial count</strong><br />Saved for reference. Does not start an inventory period.
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
                <strong>Whole kitchen</strong><br />Every shelf checked. Starts the inventory period.
              </span>
            </label>
            {/* ⚠ THE ONLY CHECK THAT KNOWS ABOUT SHELVES NOBODY VISITED.
                Every other pre-submit finding compares against COUNT HISTORY,
                so on the first-ever walk they all return nothing and the
                dialog says "Nothing looks off" — earned confidence it has not
                got. A full count makes every unvisited shelf read as stock
                that vanished, and the report is a one-way door. Advisory, like
                everything else here: it never blocks the submit. */}
            {fullCount && untouchedZones.length > 0 && (
              <p className="lq-rec-warntext">
                {untouchedZones.length} of {zones.length} shelves have nothing counted on them
                {untouchedZones.length <= 4 ? ` — ${untouchedZones.map((z) => z.name).join(", ")}` : ""}.
                A full count treats those as empty, not as unvisited.
              </p>
            )}
          </div>
          <div className="lq-fc-rev-actions">
            <button
              type="button"
              className="lq-btn"
              disabled={checking || submitting || voicePending || reviewDirty || correctionConflicts.length > 0 || locationCollision != null}
              onClick={() => void doSubmit()}
            >
              {submitting
                ? "Submitting…"
                : voicePending
                  ? "Finish the recording first"
                  : unplacedLeft > 0
                    ? `Submit the count (${unplacedLeft} unanswered)`
                    : "Submit the count"}
            </button>
            {(reviewDirty || checkFailed) && <button type="button" className="lq-btn lq-btn-ghost" disabled={checking || submitting || voicePending || correctionConflicts.length > 0}
              onClick={() => void runCheck(true)}>{checking ? "Checking…" : checkFailed ? "Retry check" : "Recheck count"}</button>}
            <button type="button" className="lq-linkbtn" onClick={() => setFindings(null)}>
              keep counting
            </button>
            {checkFailed && <button type="button" className="lq-btn lq-btn-ghost" disabled={checking || submitting || voicePending} onClick={() => void runCheck()}>Retry check</button>}
          </div>
        </div>
      )}

      </fieldset>
      <div className="lq-footer" ref={footerRef} inert={!!leaving}>
        {processingVoice && <VoiceProcessing transcribing={dict.recording}
          destination={zones.find(z => z.id === (takeZoneId ?? zoneId))?.name ?? "this location"} />}
        <div className={`lq-savestate${submitErr || save === "error" ? " lq-fc-saveerr" : ""}`} role={submitErr || save === "error" ? "alert" : "status"}>
          {submitErr ??
            (save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "Not saved yet. Keep this screen open and retry." : "")}
          {merged && !submitErr && save !== "error" && <span className="lq-muted"> · included a change made elsewhere</span>}
          {save === "error" && <button type="button" className="lq-linkbtn lq-save-retry" disabled={startingFresh || submitting || checking} onClick={() => void doSave().then((ok) => { if (ok) setSubmitErr(null); })}>Retry save</button>}
        </div>
        <div className="lq-footer-actions">
          <button type="button" className="lq-btn lq-btn-ghost" disabled={startingFresh || checking || submitting || voicePending} onClick={onDone}>Home</button>
          <button
            type="button"
            className={`lq-btn${review?.length && !dict.recording && !voiceBusy ? " lq-btn-primary" : ""}`}
            // ⚠ SUBMIT IS A ONE-WAY DOOR and voice work is asynchronous. A
            // counter could tap Finish while a take was still recording or
            // transcribing, or with review rows never applied — and only
            // `counts` is saved, so those items were dropped silently. The
            // backend then 409s any later line save against a closed session,
            // so there was no way back.
            disabled={startingFresh || checking || submitting || submissionUnknown || dict.recording || voiceBusy || (totalLines === 0 && !review?.length)
              || (!!review?.length && !review.some(applyable))}
            onClick={() => { if (review?.length) applyReview(); else void runCheck(); }}
          >
            {checking
              ? "Checking…"
              : processingVoice
                ? "Processing…"
                : dict.recording
                  ? "Stop recording first"
                  : (review?.length ?? 0) > 0
                    ? `Add ${review!.filter(applyable).length} item${review!.filter(applyable).length === 1 ? "" : "s"} to ${zones.find(z => z.id === (takeZoneId ?? zoneId))?.name ?? "this shelf"}`
                    : `Finish (${totalLines})`}
          </button>
        </div>
      </div>
      {submissionUnknown && sessionId && <CountSubmitRecovery sessionId={sessionId} onDone={onDone}
        onDraft={() => { setSubmissionUnknown(false); setSubmitErr("Count saved. It is still open. Try Submit the count again."); }}
        onSubmitted={(n) => { forgetZone(sessionId); setSubmissionUnknown(false); setDoneCount(n); }} />}

      {/* ── leaving a zone (2026-10-03) ── Jon couldn't tell which zone the
          preview's first draft meant, so the zone being left is the biggest
          thing on the sheet. A full-height sheet that scrolls, not a short
          one pinned to the bottom: the keyboard covers the bottom half of the
          screen, and "Count it" opens two number boxes. */}
      {leaving && (() => {
        const fromIdx = zones.findIndex((z) => z.id === leaving.from);
        const from = zones[fromIdx];
        const toIdx = zones.findIndex((z) => z.id === leaving.to);
        const left = leaving.skuIds.filter((id) => !placeQ[leaveKey(leaving.from, id)]?.done).length;
        const go = toIdx === fromIdx + 1 ? "next zone ›" : `on to ${zones[toIdx]?.name ?? "the next zone"} ›`;
        return (
          <div className="lq-fc-sheetback" inert={checking || submitting || submissionUnknown}>
            <div className="lq-fc-sheet" role="dialog" aria-modal="true" aria-label={`Leaving ${from?.name ?? "this zone"}`}>
              <div className="lq-fc-sheet-zone">
                <span className="lq-fc-sheet-zone-k">Leaving zone {fromIdx + 1} of {zones.length}</span>
                <span className="lq-fc-sheet-zone-n">{from?.name}</span>
              </div>
              <h3 className="lq-fc-sheet-h">
                {left > 0 ? `${left} ${left === 1 ? "item wasn’t" : "items weren’t"} counted` : "All answered"}
              </h3>
              <p className="lq-muted lq-fc-sheet-sub">They&rsquo;re on this zone&rsquo;s list. One tap each.</p>
              {leaving.skuIds.map((id) => {
                const s = skuById.get(id);
                if (!s) return null;
                const key = leaveKey(leaving.from, id);
                const q = placeQ[key] ?? EMPTY_Q;
                return (
                  <div key={id} className="lq-fc-q">
                    {qName(s.name)}
                    {q.done ? (
                      <p className="lq-fc-q-done">✓ {q.done}</p>
                    ) : (
                      <>
                        <p className="lq-fc-q-why">On this zone&rsquo;s list, nothing entered</p>
                        <div className="lq-fc-choices">
                          <button type="button" className={choice(false)} disabled={q.busy} onClick={() => leaveNone(leaving.from, s)}>
                            None left
                          </button>
                          <button type="button" className={choice(q.pick === "count")} aria-pressed={q.pick === "count"}
                            disabled={q.busy} onClick={() => setQ(key, { pick: "count", err: undefined })}>
                            Count it
                          </button>
                          <button type="button" className={choice(q.pick === "moved")} aria-pressed={q.pick === "moved"}
                            disabled={q.busy} onClick={() => setQ(key, { pick: "moved", err: undefined })}>
                            Remove from zone
                          </button>
                        </div>
                        {q.pick === "count" && (
                          <>
                            <p className="lq-fc-q-ask">How many are here?</p>
                            {qtyBoxes(key, s, q, () => leaveCount(leaving.from, s))}
                          </>
                        )}
                        {q.pick === "moved" && (
                          <>
                            <p className="lq-fc-q-ask">Where is it now?</p>
                            {zoneChips(key, q, leaving.from)}
                            {q.zone && (
                              <>
                                <p className="lq-fc-q-ask">How many are there?</p>
                                {qtyBoxes(key, s, q, () => void leaveMoved(leaving.from, s))}
                              </>
                            )}
                          </>
                        )}
                        {q.err && <p className="lq-error">{q.err}</p>}
                      </>
                    )}
                  </div>
                );
              })}
              <div className="lq-fc-sheet-foot">
                <button type="button" className="lq-btn lq-btn-ghost" onClick={() => setLeaving(null)}>
                  Back to {from?.name ?? "this zone"}
                </button>
                <button type="button" className="lq-btn lq-fc-sheet-go" onClick={leaveOn}>
                  {left > 0 ? `Skip ${left}, ${go}` : go.charAt(0).toUpperCase() + go.slice(1)}
                </button>
              </div>
              {left > 0 && <p className="lq-muted lq-fc-sheet-hint">Skipped ones come up again before you submit.</p>}
            </div>
          </div>
        );
      })()}

      {/* ── + New spot (2026-10-03): "table storage near Pete's oven" ── */}
      {newSpot && (
        <div className="lq-fc-sheetback lq-fc-sheetback-top" inert={checking || submitting || submissionUnknown}>
          <div className="lq-fc-sheet" role="dialog" aria-modal="true" aria-label="Add a spot to the walk">
            <h3 className="lq-fc-sheet-h">Add a spot to the walk</h3>
            <p className="lq-muted lq-fc-sheet-sub">For a place none of the zones cover. It goes on every walk from now on.</p>
            <label className="lq-fc-field">
              <span>What do you call it?</span>
              <input
                type="text"
                maxLength={64}
                autoFocus
                placeholder="Table storage near Pete's oven"
                value={newSpot.name}
                onChange={(e) => setNewSpot({ ...newSpot, name: e.target.value, err: null })}
                onKeyDown={(e) => { if (e.key === "Enter") void addSpot(); }}
              />
            </label>
            <label className="lq-fc-field">
              <span>When do you reach it on the walk?</span>
              <select value={newSpot.after} onChange={(e) => setNewSpot({ ...newSpot, after: e.target.value })}>
                <option value="">First, before {zones[0]?.name}</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>After {z.name}</option>
                ))}
              </select>
            </label>
            {newSpot.err && <p className="lq-error">{newSpot.err}</p>}
            <div className="lq-fc-sheet-foot">
              <button type="button" className="lq-btn lq-btn-ghost" disabled={newSpot.busy} onClick={() => setNewSpot(null)}>
                Cancel
              </button>
              <button type="button" className="lq-btn lq-fc-sheet-go" disabled={newSpot.busy || !newSpot.name.trim()}
                onClick={() => void addSpot()}>
                {newSpot.busy ? "Adding…" : "Add spot"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="lq-fc-toast" role="status">{toast}</div>}
      {locationCollision && (() => {
        const plan = locationCollision, s = skuById.get(plan.skuId)!;
        const old = counts[plan.zid]?.[plan.skuId];
        const shelf = zones.find((z) => z.id === plan.zid)?.name ?? "Saved shelf";
        return <div className="lq-fc-sheetback lq-fc-sheetback-top"><div className="lq-fc-sheet lq-fc-location-collision" role="dialog" aria-modal="true" aria-label="Confirm count on shelf">
          <h3 className="lq-fc-sheet-h">{s.name} · {shelf}</h3>
          <p>Already counted: {old ? cellText(s, old) : "not counted"}. New answer: {cellText(s, plan.cell)}.</p>
          <p>Choose how to record it before changing the shelf list.</p>
          {old && ((old.cases && plan.cell.cases && old.caseSize !== plan.cell.caseSize) || (old.packs && plan.cell.packs && old.packSize !== plan.cell.packSize)) && <p>Package sizes differ. Adding keeps their combined total in individual counting units.</p>}
          <div className="lq-fc-sheet-foot">
            {plan.cell.qty > 0 && <button type="button" className="lq-btn" disabled={save === "saving" || checking || submitting}
              onClick={() => void saveLocationCount(plan.key, plan.from, plan.zid, plan.skuId, plan.cell, plan.afterSave, "add")}>Add to existing count</button>}
            <button type="button" className="lq-btn" disabled={save === "saving" || checking || submitting}
              onClick={() => void saveLocationCount(plan.key, plan.from, plan.zid, plan.skuId, plan.cell, plan.afterSave, "replace")}>Replace existing count</button>
            <button type="button" className="lq-linkbtn" onClick={() => setLocationCollision(null)}>Keep existing count</button>
          </div>
        </div></div>;
      })()}
    </div>
  );
}
