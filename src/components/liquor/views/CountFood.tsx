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
  setCaseSize,
  submitCount,
  ZoneNameTakenError,
  type BarSkuItem,
  type BarZoneItem,
  type CountLineInput,
  type OpenCountLine,
  type PrecheckFinding,
  type RetiringSku,
  type UnplacedItem,
  type VoiceExtractItem,
} from "../api";
import { useVoiceDictation } from "../useRecorderDictation";
import { createDraftSaver, toOpenLines } from "../draftSync";
import { createCarry, splitFoodTail } from "../voiceCarry";
import { pauseCutsEnabled } from "../voiceSwitches";
import { forgetZone, rememberZone, resumeZone } from "../resume-zone";
import { foodCountWarning, foodReviewQuantity, foodUnitLabel as unitLabel, type FoodReviewItem as ReviewItem } from "../food-voice-review";

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

/** m:ss, so three minutes reads as 3:00 rather than 180. */
function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function cellQty(c: Pick<Cell, "cases" | "units" | "caseSize" | "packs" | "packSize">): number {
  return round2((c.units ?? 0) + (c.cases ?? 0) * (c.caseSize ?? 0) + (c.packs ?? 0) * (c.packSize ?? 0));
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
      units: round2(qty - (cases ?? 0) * (caseSize ?? 0) - (packs ?? 0) * (packSize ?? 0)),
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
  const [retryTranscript, setRetryTranscript] = useState<string | null>(null);
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
      save: (lines, baseHash) => saveCountLines(sessionIdRef.current!, lines, true, "food", baseHash),
      current: () => flatten(countsRef.current),
      adopt: (lines) => {
        const next = rebuild(toOpenLines(lines));
        countsRef.current = next;
        setCounts(next);
        setMerged(true);
      },
    });
  }
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
        // ⚠ SESSION FIRST, THEN ZONE. resumeZone is keyed by session, so
        // resolving the shelf before we know which count this is would always
        // miss and silently drop the counter on zone one (see resume-zone.ts).
        let sid: string;
        if (open) {
          sid = open.id;
          setSessionId(sid);
          setCounts(rebuild(open.lines));
          saverRef.current!.loaded(open.lines, open.linesHash);
        } else {
          sid = await createCount(true, "food");
          setSessionId(sid);
          saverRef.current!.loaded([], null);
        }
        setZoneId(resumeZone(sid, z));
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
      // A box on one of the where-it-lives sheets centres itself: the sheet
      // scrolls on its own, with no grid row around the box.
      (el.closest(".lq-fc-row") ?? (el.closest(".lq-fc-sheet") ? el : null))?.scrollIntoView({ block: "center", behavior: "auto" });
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
      await saverRef.current!.save();
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
        packs: next.packs !== undefined ? next.packs : cur?.packs,
        packSize: next.packSize !== undefined ? next.packSize : cur?.packSize,
        // ⚠ THE EXISTING CELL'S MULTIPLIER WINS. case_size_at_entry is frozen
        // at entry by design and must never be re-read from the catalog: a
        // resumed draft whose SKU had its case size corrected in between would
        // silently rescale what the counter already wrote (2 cases × 12 = 24
        // becoming 2 × 24 = 48 on the next keystroke). The catalog is consulted
        // only for a cell that does not exist yet.
        caseSize: cur?.caseSize ?? next.caseSize ?? sku?.unitsPerCase ?? null,
        qty: 0,
        source: next.source ?? "grid",
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
    if (value === null && other === null && !cur?.none && !cur?.packs) {
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
    writeCell(skuId, { cases: null, packs: null, packSize: null, units: 0, none: true });
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
  /** `zone` is explicit because a voice take must land on the shelf it was
   *  RECORDED on. Transcription is async: the counter taps Stop, walks to the
   *  next shelf while it processes, then taps Apply — and every item would
   *  otherwise be written to wherever they were standing by then. The food
   *  location prompt would then offer to make those wrong placements into
   *  permanent membership. */
  function addToCell(skuId: string, cases: number, units: number, caseSize: number | null, raw: string, zone: string = zoneId) {
    setCounts((prev) => {
      const zoneCells = { ...(prev[zone] ?? {}) };
      const cur = zoneCells[skuId];
      // A later correction to the case size must not reinterpret an earlier
      // entry. Fold a differently-sized incoming case into loose base units.
      const differentSize = cur?.caseSize != null && caseSize != null && cur.caseSize !== caseSize;
      const merged: Cell = {
        cases: round2((cur?.cases ?? 0) + (differentSize ? 0 : cases)),
        units: round2((cur?.units ?? 0) + units + (differentSize ? cases * caseSize! : 0)),
        packs: cur?.packs,
        packSize: cur?.packSize,
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
      return { ...prev, [zone]: zoneCells };
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
  /** Which shelf a pending voice take belongs to, captured when recording
   *  STARTS rather than read when Apply is tapped. */
  const [takeZoneId, setTakeZoneId] = useState<string | null>(null);
  /** Mic live — Start until Stop, NOT until the upload lands. This is what
   *  zone changes are refused during: once the counter has stopped talking,
   *  the take's destination is fixed and walking on is safe. Gating on
   *  `dict.recording` instead would let a stalled upload lock the shelf
   *  controls with no way out but Home, abandoning the take. */
  const [capturing, setCapturing] = useState(false);
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
  if (!carryRef.current) carryRef.current = createCarry(extractPiece, splitFoodTail);
  const dict = useVoiceDictation((t) => void finalizeVoice(t), {
    vocabulary: "liquor",
    // The take's shelf, so an upload retried after the counter walks on is
    // still biased toward what they were standing at (CountLiquor does the same).
    scope: { section: "food", zoneId: (takeZoneId ?? zoneId) || undefined },
    pauseCuts,
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
  // The take can also end without a tap — the 240s cap, or the recorder dying.
  useEffect(() => {
    if (!dict.recording) setCapturing(false);
  }, [dict.recording]);
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
    if (pauseCuts) carryRef.current!.flush(Number.MAX_SAFE_INTEGER);
    const pending = [...segExtractsRef.current.entries()].sort(([a], [b]) => a - b);
    segExtractsRef.current = new Map();
    // Web Speech has no segment callback. Keep its whole-transcript path;
    // never re-extract the full take after segment results, which would count
    // the same spoken stock twice.
    if (pending.length === 0) return void onTranscript(fullTranscript);
    setVoiceBusy(true);
    setVoiceErr(null);
    setRetryTranscript(null);
    try {
      const results = await Promise.all(pending.map(([, result]) => result));
      const items = results.flatMap((result) => result.items);
      const error = results.find((result) => result.error != null)?.error;
      // Replaying a partly successful take would duplicate the items already
      // offered for Apply. Only a wholly unsuccessful take is retryable.
      if (items.length === 0) setRetryTranscript(fullTranscript);
      if (items.length > 0) {
        setReview((prev) => [...(prev ?? []), ...toReview(items, prev?.length ?? 0)]);
      }
      if (error) {
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
      cases: it.cases,
      units: it.units,
      chosenSkuId: it.match?.id ?? null,
      candidates: it.candidates,
      spokenUnit: it.spokenUnit ?? null,
      quantityKnown: it.quantityKnown ?? true,
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
      .reduce((total, x) => total + reviewQuantity(x).qty, 0);
    return foodCountWarning(r, reviewSku(r), existing + earlier);
  };
  const applyable = (r: ReviewItem) => reviewQuantity(r).ready && (!warning(r) || r.largeCountConfirmed === warning(r));

  function editReview(r: ReviewItem, patch: Partial<ReviewItem>) {
    setReview(prev => (prev ?? []).map(x => x.key === r.key ? { ...x, largeCountConfirmed: undefined, ...patch } : x));
  }

  function answerSpokenUnit(r: ReviewItem) {
    const unit = r.unitDraft?.trim().toLowerCase();
    if (unit) editReview(r, { spokenUnit: unit, unitMultiplier: undefined, unitNeedsReview: false, unitChoiceConfirmed: true });
  }

  function chooseReviewSku(r: ReviewItem, id: string) {
    editReview(r, { chosenSkuId: id, unitMultiplier: undefined, unitChoiceConfirmed: false, search: "" });
  }

  function applyReview() {
    if (!review) return;
    for (const r of review) {
      if (!applyable(r)) continue;
      const q = reviewQuantity(r);
      const sku = reviewSku(r)!;
      const raw = `${r.spoken.slice(0, 1600)} [confirmed: ${q.cases} cases × ${q.caseSize ?? "?"} + ${q.units} ${unitLabel(sku, q.units)}]`;
      // A SKU whose base unit IS case has one input, not "cases of cases".
      addToCell(r.chosenSkuId!, sku.countUnit === "case" ? 0 : q.cases,
        q.units + (sku.countUnit === "case" ? q.cases : 0), q.caseSize, raw, takeZoneId ?? zoneId);
    }
    // Anything unresolved STAYS on screen. Silently dropping a spoken item is
    // how a shelf goes missing from a count.
    const left = review.filter((r) => !applyable(r));
    setReview(left.length ? left : null);
  }

  async function answerCaseSize(r: ReviewItem, n: number) {
    if (!r.chosenSkuId || !Number.isInteger(n) || n < 1 || n > 10000) return;
    try {
      // Persists on the SKU as 'manual', so the ask happens once per item ever
      // and invoice learning will never overwrite it.
      await setCaseSize(r.chosenSkuId, n);
      setCatalog((prev) => prev.map((s) => (s.id === r.chosenSkuId ? { ...s, unitsPerCase: n } : s)));
      setReview((prev) =>
        (prev ?? []).map((x) =>
          x.chosenSkuId === r.chosenSkuId ? { ...x, largeCountConfirmed: undefined } : x,
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
      setUnplaced(res.unplaced ?? []);
      setUnplacedMore(res.unplacedMore ?? []);
      setUnplacedAll(false);
    } catch {
      // A check that cannot RUN must not block a finished walk.
      setFindings([]);
      setRetiring([]);
      setUnplaced([]);
      setUnplacedMore([]);
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
    if (noneLeft[skuId] === "saving" || countedAnywhere(skuId)) return;
    setNoneLeft((a) => ({ ...a, [skuId]: "saving" }));
    const shelf = zoneId;
    const created = !countsRef.current[shelf]?.[skuId];
    if (created) {
      const zero: Cell = { cases: null, units: 0, packs: null, packSize: null,
        caseSize: skuById.get(skuId)?.unitsPerCase ?? null, qty: 0, source: "grid", none: true };
      const next = { ...countsRef.current, [shelf]: { ...(countsRef.current[shelf] ?? {}), [skuId]: zero } };
      // The ref first: doSave reads it now, before React re-renders.
      countsRef.current = next;
      setCounts(next);
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
    try {
      await setSkuActive(skuId, true);
      const shelf = noneLeftZero[skuId];
      if (shelf) {
        setCounts((prev) => {
          const cells = { ...(prev[shelf] ?? {}) };
          delete cells[skuId];
          return { ...prev, [shelf]: cells };
        });
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
    if (capturing) return;
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

  async function doSubmit() {
    if (!sessionId || submitting) return;
    // ⚠ The panel can be open while a NEW take is started behind it, so the
    // button's disabled state is not enough on its own.
    if (voicePending) return;
    setSubmitting(true);
    try {
      if (!(await doSave())) {
        setSubmitErr("Couldn't save the count — nothing was submitted. Try again.");
        setSubmitting(false);
        return;
      }
      setDoneCount(await submitCount(sessionId, fullCount));
      forgetZone(sessionId); // the walk is over; "where I was" means nothing now
    } catch {
      setSubmitErr("Couldn't submit — try again.");
      setSubmitting(false);
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
    const next = { ...countsRef.current, [zid]: { ...(countsRef.current[zid] ?? {}), [skuId]: cell } };
    countsRef.current = next;
    setCounts(next);
    scheduleSave();
  }

  /** "I looked and there are none": markNone's shape. */
  const zeroCell = (s: BarSkuItem): Cell =>
    ({ cases: null, units: 0, packs: null, packSize: null, caseSize: s.unitsPerCase ?? null, qty: 0, source: "grid", none: true });

  /** A fresh grid row's boxes: cases (× its case size) when it has one. */
  const hasCaseBox = (s: BarSkuItem) => s.countUnit !== "case" && s.unitsPerCase != null;

  /** The typed boxes as a cell, or null while there is nothing valid to save.
   *  A typed 0 is an answer, as on the grid. */
  function typedCell(s: BarSkuItem, q: PlaceQ): Cell | null {
    const read = (raw: string) => (raw.trim() === "" ? null : Number(raw));
    const cases = hasCaseBox(s) ? read(q.cases) : null;
    const units = read(q.units);
    if (cases == null && units == null) return null;
    if ([cases, units].some((n) => n != null && (!Number.isFinite(n) || n < 0))) return null;
    const cell: Cell = { cases, units, packs: null, packSize: null, caseSize: hasCaseBox(s) ? s.unitsPerCase : null,
      qty: 0, source: "grid", none: false };
    cell.qty = cellQty(cell);
    return cell;
  }

  /** "2 cases + 3 bags", how a saved answer reads back. */
  function cellText(s: BarSkuItem, c: Cell): string {
    const parts: string[] = [];
    if (c.cases) parts.push(`${c.cases} case${c.cases === 1 ? "" : "s"}`);
    if (c.units || parts.length === 0) parts.push(`${c.units ?? 0} ${unitLabel(s, c.units ?? 0)}`);
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
   * Every move off a zone in the walk comes through here: ‹, › and the zone
   * list. A zone with something counted on it and listed items left blank asks
   * first. A zone with nothing on it is the untouched-zone warning's at Finish,
   * and a take still being read may yet fill the blanks, so neither asks.
   */
  function requestZone(target: string) {
    if (capturing) return;
    const touched = Object.keys(countsRef.current[zoneId] ?? {}).length > 0;
    const missing = touched && target !== zoneId && !voicePending && !skippedLeaving.current.has(zoneId)
      ? unansweredMembers(zoneId)
      : [];
    if (missing.length === 0) return goZoneId(target);
    setZonePicker(false);
    setLeaving({ from: zoneId, to: target, skuIds: missing });
  }
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
    putCell(to.id, s.id, cell);
    setQ(key, { busy: true, err: undefined });
    const counted = `${cellText(s, cell)} counted in ${to.name}`;
    try {
      await setSkuZone(s.id, to.id, true);
      setMember(s.id, to.id, true);
    } catch {
      return setQ(key, { busy: false, done: `${counted}. Couldn't add it to that zone's list, so Finish will ask where it lives.` });
    }
    try {
      await setSkuZone(s.id, from, false);
      setMember(s.id, from, false);
      setQ(key, { busy: false, done: `Moved to ${to.name} · ${cellText(s, cell)} counted there. Off this zone's list from now on.` });
    } catch {
      setQ(key, { busy: false, done: `${counted} and on its list. Couldn't take it off this zone's list.` });
    }
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
      putCell(z.id, s.id, cell);
      setQ(key, { busy: true, err: undefined });
      try {
        await setSkuZone(s.id, z.id, true);
        setMember(s.id, z.id, true);
        setQ(key, { busy: false, done: `${cellText(s, cell)} · ${z.name}. It'll be on that zone's list from now on.` });
      } catch {
        setQ(key, { busy: false, done: `${cellText(s, cell)} counted in ${z.name}. Couldn't add it to that zone's list, so the next count asks again.` });
      }
      return;
    }
    if (q.pick !== "none") return;
    // A count line needs a zone. With none picked, the zero goes on the zone
    // the counter is standing in and lists nothing there: a zero is never
    // evidence of where a thing lives (the server's zone_unexpected rule).
    putCell(z?.id ?? zoneId, s.id, zeroCell(s));
    if (!z) return setQ(key, { done: "None left · 0 counted", err: undefined });
    setQ(key, { busy: true, err: undefined });
    try {
      await setSkuZone(s.id, z.id, true);
      setMember(s.id, z.id, true);
      setQ(key, { busy: false, done: `None left · 0 counted · lives in ${z.name}` });
    } catch {
      setQ(key, { busy: false, done: `None left · 0 counted. Couldn't add it to ${z.name}'s list.` });
    }
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
            <span>cases <span className="lq-fc-row-mult">×{s.unitsPerCase}</span></span>
            <input type="number" inputMode="decimal" min={0} step="any" aria-label={`${s.name}: cases`}
              value={q.cases} onFocus={centre} onKeyDown={onEnter} onChange={(e) => setQ(key, { cases: e.target.value })} />
          </label>
        )}
        <label>
          <span>{unitLabel(s, 2)}</span>
          <input type="number" inputMode="decimal" min={0} step="any" aria-label={`${s.name}: ${unitLabel(s, 2)}`}
            value={q.units} onFocus={centre} onKeyDown={onEnter} onChange={(e) => setQ(key, { units: e.target.value })} />
        </label>
        <button type="button" className="lq-btn lq-fc-q-save" disabled={!ready} onClick={onSave}>
          {q.busy ? "Saving…" : "Save"}
        </button>
      </div>
    );
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
  const carriedRows = rows.filter((s) => !s.discontinuedAt);
  const leftoverRows = rows.filter((s) => s.discontinuedAt);
  const carriedCounted = carriedRows.filter((s) => zoneCells[s.id]).length;
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
    // ⚠ A TAKE CANNOT SPAN TWO SHELVES. The destination is pinned when
    // recording starts, which correctly covers walking on WHILE IT
    // TRANSCRIBES — but a counter who changes shelves MID-SENTENCE and keeps
    // dictating would have both shelves' items written to the first one.
    // Reproduced in review against the real component. Keyterms re-read the
    // zone per segment, which changes recognition but attaches no destination
    // to the rows, so that is not a defence. Stop first; navigation during
    // extraction and review stays open.
    if (capturing) return;
    const z = zones[Math.min(Math.max(i, 0), zones.length - 1)];
    if (!z) return;
    setZoneId(z.id);
    // ⚠ THIS is the path that matters. Previous, Next and the shelf picker all
    // land here; countMissed() is the rare one. The first cut of this fix
    // remembered only countMissed, so a counter walking the kitchen the
    // ordinary way still came back to shelf one. Caught in review.
    rememberZone(sessionId, z.id);
    setSearch("");
    setZonePicker(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  const totalLines = Object.values(counts).reduce((a, z) => a + Object.keys(z).length, 0);
  const zonesTouched = Object.entries(counts).filter(([, z]) => Object.keys(z).length > 0).length;
  /** Shelves with not one line on them. "Counted zero" is an answer and does
   *  not appear here; only "never opened" does. */
  const untouchedZones = zones.filter((z) => Object.keys(counts[z.id] ?? {}).length === 0);
  const unplacedLeft = [...unplaced, ...unplacedMore].filter((u) => !placeQ[haveKey(u.skuId)]?.done).length;

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
          disabled={zoneIdx <= 0 || capturing}
          onClick={() => zones[zoneIdx - 1] && requestZone(zones[zoneIdx - 1]!.id)}
        >
          ‹
        </button>
        <button
          type="button"
          className="lq-fc-zonepick"
          aria-expanded={zonePicker}
          disabled={capturing}
          onClick={() => setZonePicker((o) => !o)}
        >
          <span className="lq-fc-zonename">{zone?.name ?? "—"}</span>
          <span className="lq-fc-zonemeta">
            Shelf {zoneIdx + 1} of {zones.length} · {carriedCounted} of {carriedRows.length} counted
            <span className="lq-fc-zonecaret">{zonePicker ? "▲" : "▼"}</span>
          </span>
        </button>
        <button
          type="button"
          className="lq-fc-zonestep"
          aria-label="Next shelf"
          disabled={zoneIdx >= zones.length - 1 || capturing}
          onClick={() => zones[zoneIdx + 1] && requestZone(zones[zoneIdx + 1]!.id)}
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
                onClick={() => requestZone(z.id)}
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
          <button
            type="button"
            className="lq-btn"
            onClick={() => {
              segExtractsRef.current = new Map();
              carryRef.current!.reset(); // a new take must not inherit a held item
              setVoiceErr(null);
              setRetryTranscript(null);
              setTakeZoneId(zoneId); // the shelf this take is about
              setCapturing(true);
              setZonePicker(false); // an open list would sit there looking live but inert
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
        ) : (
          <button
            type="button"
            className="lq-btn lq-btn-rec"
            disabled={!capturing}
            onClick={() => {
              setCapturing(false); // speech is over; the shelf is free again
              dict.stop();
            }}
          >
            {/* Elapsed / total, not a countdown. A countdown reads as a
                deadline on a job that does not have one — bursts accumulate,
                so running out is an inconvenience and not a loss. */}
            {capturing ? `⏹ Stop ${mmss(dict.seconds)} / ${mmss(CAP_SECONDS)}` : "Processing recording"}
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
            a phone in a noisy kitchen — or wearing no headset — has only eyes. */}
        {dict.recording && (
          <div className={`lq-rec${dict.seconds >= WARN_SECONDS ? " lq-rec-warn" : ""}`}>
            <div className="lq-rec-head">
              <span className="lq-rec-dot" aria-hidden="true" />
              <span className="lq-rec-label">{!capturing ? "Processing recording" : dict.quiet ? "Anyone there?" : "Listening…"}</span>
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
                Mic hasn’t heard anything for a bit — if you were on a call, stop and check what came back.
              </p>
            )}
            {/* Words spoken before the mic route comes up are LOST — the reason
                the liquor screen says this too. A Bluetooth headset takes a
                second or two, and the counter is already talking. */}
            {!dict.armed && <p className="lq-muted">Connecting to mic… (buzzes when ready)</p>}
            {dict.transcript && <p className="lq-rec-transcript" ref={liveTextRef}>{dict.transcript}</p>}
            <p className="lq-muted">
              Going to <strong>{zones.find((z) => z.id === (takeZoneId ?? zoneId))?.name ?? "this shelf"}</strong>
              {" — stop before moving to another shelf. Starting again adds to it."}
            </p>
          </div>
        )}
        {dict.recording && dict.seconds >= WARN_SECONDS && (
          <span className="lq-rec-warntext">
            Wrap up this shelf — stopping at {mmss(CAP_SECONDS)}. Starting again adds to it.
          </span>
        )}
        {voiceBusy && <span className="lq-muted">reading that back…</span>}
        {dict.error && !dict.recording && (
          <p className="lq-error" role="alert">
            {dict.error === "not-allowed" || dict.error === "service-not-allowed"
              ? "Allow microphone access, then try recording again."
              : dict.error === "audio-capture"
                ? "The microphone stopped. Check its connection, then record the missing items or type them."
                : dict.error === "transcription failed" || dict.error === "network"
                  ? "Part of the recording could not be transcribed. Record the missing items again or type them."
                  : dict.error}
          </p>
        )}
        {voiceErr && <span className="lq-error">{voiceErr}</span>}
        {retryTranscript && !review?.length && !voiceBusy && (
          <button type="button" className="lq-linkbtn" onClick={() => void onTranscript(retryTranscript)}>Retry reading this transcript</button>
        )}
      </div>
      {!dict.recording && dict.transcript && (review || voiceErr) && (
        <details className="lq-fc-transcript">
          <summary>Check the full transcript for anything missing</summary>
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
            Recording may have been interrupted — a call or the screen locking will do that.
            Check the captured items for anything missing before continuing.
          </p>
          <button type="button" className="lq-btn lq-btn-ghost" onClick={() => setInterrupted(false)}>
            Got it
          </button>
        </div>
      )}

      {review && (
        <div className="lq-fc-rev">
          <p className="lq-fc-rev-h">
            Heard {review.length} item{review.length === 1 ? "" : "s"} — check before adding
          </p>
          {review.map((r) => {
            const sku = r.chosenSkuId ? skuById.get(r.chosenSkuId) : undefined;
            const q = reviewQuantity(r);
            const caseOnly = (sku?.countUnit === "case" && !q.inputUnit) || /^cases?$/.test(q.inputUnit ?? "");
            const concern = warning(r);
            const hits = r.search?.trim() ? catalog.filter(s => r.search!.toLowerCase().split(/\s+/).every(word => s.name.toLowerCase().includes(word))).slice(0, 8) : [];
            return (
              <div key={r.key} className={`lq-fc-rev-row${applyable(r) ? "" : " lq-fc-rev-row-block"}`}>
                <span className="lq-fc-rev-spoken">“{r.spoken}”</span>
                {r.candidates.length > 0 && !r.chosenSkuId && (
                  <div className="lq-fc-rev-pick">
                    <span className="lq-muted">Which one?</span>
                    {r.candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="lq-linkbtn"
                        onClick={() => chooseReviewSku(r, c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {!r.chosenSkuId && r.candidates.length === 0 && (
                  <span className="lq-fc-rev-note">No catalog match. Search for this exact product; a different variety needs its own catalog item.</span>
                )}
                <details className="lq-fc-rev-product" open={!r.chosenSkuId}>
                  <summary>{sku ? "Change product" : "Find product"}</summary>
                  <input type="search" aria-label={`Find product for ${r.spoken}`} placeholder="Search the food catalog…"
                    value={r.search ?? ""} onChange={e => editReview(r, { search: e.target.value })} />
                  {hits.map(s => <button key={s.id} type="button" className="lq-linkbtn" onClick={() => chooseReviewSku(r, s.id)}>{s.name}</button>)}
                  {r.search?.trim() && hits.length === 0 && <p className="lq-muted">No matching product on file. Leave this item unresolved until the catalog is set up.</p>}
                </details>
                {sku && (
                  <>
                    <span className="lq-fc-rev-match">{sku.name}{q.ready ? ` · ${q.qty} ${unitLabel(sku, q.qty)}` : ""}</span>
                    <div className="lq-fc-rev-quantities">
                      <label>Cases
                        <input type="number" min={0} step="any" inputMode="decimal" aria-label={`Cases for ${sku.name}`}
                          value={r.quantityKnown ? r.cases + (caseOnly ? r.units : 0) : ""} onChange={e => editReview(r, { cases: Math.max(0, Number(e.target.value)), ...(caseOnly ? { units: 0, unitNeedsReview: false, spokenUnit: null, unitMultiplier: undefined, unitChoiceConfirmed: true } : {}), quantityKnown: e.target.value !== "" })} />
                      </label>
                      {!caseOnly && <label>{r.unitNeedsReview ? "Quantity (check unit below)" : q.inputUnit ?? unitLabel(sku, 2)}
                        <input type="number" min={0} step="any" inputMode="decimal" aria-label={`Loose quantity for ${sku.name}`}
                          value={r.quantityKnown ? r.units : ""} onChange={e => editReview(r, { units: Math.max(0, Number(e.target.value)), quantityKnown: e.target.value !== "" })} />
                      </label>}
                    </div>
                    {!r.quantityKnown && <span className="lq-fc-rev-note">No quantity was heard. Enter it before adding.</span>}
                  </>
                )}
                {sku && q.needsCaseSize && (
                  <div className="lq-fc-rev-ask">
                    <label>
                      How many {unitLabel(sku, 2)} in a case of {sku?.name ?? "this"}?
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        aria-label={`Units per case for ${sku.name}`}
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
                {sku && q.needsUnitChoice && (
                  <div className="lq-fc-rev-ask">
                    <span>{r.unitNeedsReview ? `Check the transcript: what unit does ${r.units} refer to?` : `Was ${r.units} part of a case or ${unitLabel(sku, 1)}?`}</span>
                    <button type="button" className="lq-linkbtn" onClick={() => editReview(r, { cases: r.cases + r.units, units: 0, spokenUnit: null, unitMultiplier: undefined, unitNeedsReview: false, unitChoiceConfirmed: true })}>{r.units} cases</button>
                    <button type="button" className="lq-linkbtn" onClick={() => editReview(r, { spokenUnit: sku.countUnit ?? "each", unitMultiplier: 1, unitNeedsReview: false, unitChoiceConfirmed: true })}>{r.units} {unitLabel(sku, r.units)}</button>
                    {r.unitNeedsReview && <>
                      <label>Another unit
                        <input type="text" maxLength={32} aria-label={`Spoken unit for ${sku.name}`} placeholder="For example, bag or tray"
                          value={r.unitDraft ?? ""} onChange={e => editReview(r, { unitDraft: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter" && r.unitDraft?.trim()) { e.preventDefault(); answerSpokenUnit(r); } }} />
                      </label>
                      <button type="button" className="lq-linkbtn" disabled={!r.unitDraft?.trim()} onClick={() => answerSpokenUnit(r)}>Use unit</button>
                    </>}
                  </div>
                )}
                {sku && q.needsUnitSize && (
                  <div className="lq-fc-rev-ask">
                    <label>{sku.countUnit === "case" ? `How many ${r.spokenUnit} in one case?` : `How many ${unitLabel(sku, 2)} in one ${r.spokenUnit}?`}
                      <input type="number" min={0.001} max={10000} step="any" inputMode="decimal" aria-label={`Package size for ${sku.name}`}
                        onBlur={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && n <= 10000) editReview(r, { unitMultiplier: sku.countUnit === "case" ? 1 / n : n }); }}
                        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                    </label>
                    <span className="lq-muted">{r.units} {r.spokenUnit} heard. The package size must be confirmed.</span>
                  </div>
                )}
                {sku && r.unitMultiplier != null && (
                  <span className="lq-muted">{r.units} {r.spokenUnit} = {round2(q.units)} {unitLabel(sku, q.units)} <button type="button" className="lq-linkbtn" onClick={() => editReview(r, { unitMultiplier: undefined })}>Change package size</button></span>
                )}
                {q.catalogConflict && <span className="lq-fc-rev-note">This product is labeled in cases but also has multiple units per case. Its catalog unit needs correction before adding.</span>}
                {concern && r.largeCountConfirmed !== concern && (
                  <div className="lq-fc-rev-ask" role="status">
                    <span>{concern}</span>
                    {q.cases > 0 && q.units === 0 && sku?.countUnit !== "case" && <button type="button" className="lq-linkbtn"
                      onClick={() => editReview(r, { units: q.cases, cases: 0, spokenUnit: sku?.countUnit ?? null, unitChoiceConfirmed: true, unitMultiplier: undefined })}>
                      Use {q.cases} {unitLabel(sku, q.cases)}
                    </button>}
                    <button type="button" className="lq-linkbtn" onClick={() => editReview(r, { largeCountConfirmed: concern })}>Keep as entered</button>
                  </div>
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
              {/* The take's OWN shelf, not the selected one — they differ the
                  moment the counter walks on while it transcribes. */}
              Add {review.filter(applyable).length} to{" "}
              {zones.find((z) => z.id === (takeZoneId ?? zoneId))?.name ?? "this shelf"}
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
        {[...carriedRows, ...leftoverRows].map((s, i) => {
          const c = zoneCells[s.id];
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
            <div className={`lq-fc-row${c ? " lq-fc-row-counted" : ""}${leftover ? " lq-fc-row-leftover" : ""}`}>
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
                {!!c?.packs && <span className="lq-muted">Includes {c.packs} packs × {c.packSize}, plus the quantities below.</span>}
              </div>
              <div className="lq-fc-row-inputs">
                {(s.countUnit !== "case" || !!c?.cases) && (c?.caseSize ?? s.unitsPerCase) != null && (
                  <label className="lq-fc-row-box">
                    {/* The "× N" chip is what tells a MULTIPLIER box apart from a
                        loose box that happens to be counted in cases. Without it
                        two different boxes both read "cases". */}
                    <span className="lq-fc-row-lab">
                      cases <span className="lq-fc-row-mult">×{c?.caseSize ?? s.unitsPerCase}</span>
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      aria-label={`${s.name}: cases`}
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
                    aria-label={`${s.name}: loose ${unitLabel(s, 2)}`}
                    value={c?.units ?? ""}
                    onFocus={keepInView}
                    onChange={(e) => editBox(s.id, "units", e.target.value, null)}
                  />
                </label>
              </div>
            </div>
            )}
            </Fragment>
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
        <div className="lq-fc-rev" ref={reviewRef}>
          <p className="lq-fc-rev-h">
            {findings.length === 0
              ? "Nothing looks off in what you counted. Ready to submit."
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
                          disabled={capturing}
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
              disabled={submitting || voicePending}
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
          {merged && !submitErr && save !== "error" && <span className="lq-muted"> · included a change made elsewhere</span>}
        </div>
        <div className="lq-footer-actions">
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>Home</button>
          <button
            type="button"
            className="lq-btn"
            // ⚠ SUBMIT IS A ONE-WAY DOOR and voice work is asynchronous. A
            // counter could tap Finish while a take was still recording or
            // transcribing, or with review rows never applied — and only
            // `counts` is saved, so those items were dropped silently. The
            // backend then 409s any later line save against a closed session,
            // so there was no way back.
            disabled={checking || submitting || totalLines === 0 || voicePending}
            onClick={() => void runCheck()}
          >
            {checking
              ? "Checking…"
              : dict.recording
                ? "Stop recording first"
                : voiceBusy
                  ? "Reading that back…"
                  : (review?.length ?? 0) > 0
                    ? "Finish the heard items first"
                    : `Finish (${totalLines})`}
          </button>
        </div>
      </div>

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
          <div className="lq-fc-sheetback">
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
        <div className="lq-fc-sheetback lq-fc-sheetback-top">
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
    </div>
  );
}
