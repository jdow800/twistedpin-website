import type { LineEditedBy, LineEvent, QuantityHeard, VoiceExtractItem, VoiceSourceRef } from "./api";

/**
 * The liquor count's edit log, client half (TPRS 0226 bar_count_line_event;
 * the 2026-10-16 count review, Jon's fix 1).
 *
 * The 10/16 review could not tell a number the counter typed on the review
 * sheet from one the voice set: a line only keeps its last value. Every
 * quantity change of a (zone, product) cell now becomes one event here, and
 * the next PUT /lines carries the queue to the server.
 *
 * ⚠ RETENTION ONLY. Nothing here changes a number, a hold, an amber edge, a
 * question or what the screen shows. The server stores events in a savepoint
 * and never refuses a save over one; this side only has to keep them in
 * order, keep an id stable across a resend, and keep their fields inside the
 * table's bounds so the server never has to drop one.
 */

export type LineEventInput = Omit<LineEvent, "id" | "clientAt">;

/** The most events one save carries (TPRS MAX_LINE_EVENTS). */
export const MAX_EVENTS_PER_SAVE = 500;
/** About 400 KB of event JSON per save, well under the server's 1 MiB body
 *  limit with a full count's lines beside it. A spare event waits for the
 *  next save. */
export const MAX_EVENT_CHARS_PER_SAVE = 400_000;

/** Worst first: a guessed number outranks an unclear one, and so on. */
const HEARD_RANK: Record<QuantityHeard, number> = { guessed: 3, unclear: 2, implicit_one: 1, proved: 0 };

/** The worst of the labels given (guessed > unclear > implicit_one > proved),
 *  or undefined when none is known. */
export function worstHeard(labels: ReadonlyArray<QuantityHeard | null | undefined>): QuantityHeard | undefined {
  let worst: QuantityHeard | undefined;
  for (const l of labels) if (l && l in HEARD_RANK && (worst === undefined || HEARD_RANK[l] > HEARD_RANK[worst])) worst = l;
  return worst;
}

/** The server rows behind one review row: a merged row's list, else its own
 *  ref, else none (an older server sends no extractionId). */
export function sourceRefsOf(it: Pick<VoiceExtractItem, "sourceRef" | "sourceRefs">): VoiceSourceRef[] {
  return it.sourceRefs ?? (it.sourceRef ? [it.sourceRef] : []);
}

/** A person set this number (typed it, picked a choice, kept a high number).
 *  null, as_heard and case_size are the voice's own number. */
export function personEdited(editedBy: LineEditedBy | null | undefined): boolean {
  return !!editedBy && editedBy !== "as_heard" && editedBy !== "case_size";
}

const QTY_MAX = 1_000_000_000;
const INT_MAX = 1_000_000;
const CLIENT_AT_MIN = Date.UTC(2020, 0, 1);
const CLIENT_AT_MAX = Date.UTC(2100, 0, 1);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const qty = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= QTY_MAX ? v : null);
const whole = (v: number | null | undefined) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= INT_MAX ? v : null);
const uuidOrNull = (v: string | null | undefined) => (typeof v === "string" && UUID_RE.test(v) ? v : null);
/** Postgres text refuses NUL, and the server caps each text field. */
function text(v: string | null | undefined, max: number): string | null {
  if (typeof v !== "string") return null;
  let s = v.replace(/\u0000/g, "");
  if (s.length > max) {
    s = s.slice(0, max);
    if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1); // never end on half a character
  }
  return s;
}

/** One event as TPRS lineEventZ takes it. A field outside the table's bounds
 *  is sent as null, since a bad field makes the server drop the whole event. */
export function cleanLineEvent(e: LineEvent): LineEvent {
  const out: LineEvent = { id: e.id, zoneId: e.zoneId, skuId: e.skuId, kind: e.kind };
  const nums = ["beforeQty", "afterQty", "afterCases", "heardCases", "heardUnits", "heardQty"] as const;
  for (const k of nums) if (e[k] !== undefined) out[k] = qty(e[k]);
  if (e.caseSize !== undefined) out.caseSize = whole(e.caseSize);
  if (e.itemIndex !== undefined) out.itemIndex = whole(e.itemIndex);
  if (e.quantityWords !== undefined) out.quantityWords = text(e.quantityWords, 200);
  if (e.spoken !== undefined) out.spoken = text(e.spoken, 300);
  if (e.findingKind !== undefined) out.findingKind = text(e.findingKind, 32);
  if (e.takeId !== undefined) out.takeId = uuidOrNull(e.takeId);
  if (e.extractionId !== undefined) out.extractionId = uuidOrNull(e.extractionId);
  if (e.quantityHeard !== undefined) out.quantityHeard = e.quantityHeard ?? null;
  if (e.editedBy !== undefined) out.editedBy = e.editedBy ?? null;
  if (e.restateAnswer !== undefined) out.restateAnswer = e.restateAnswer ?? null;
  if (e.clientAt != null) {
    const t = Date.parse(e.clientAt);
    // A phone with a broken clock sends no time rather than losing the event.
    if (Number.isFinite(t) && t >= CLIENT_AT_MIN && t < CLIENT_AT_MAX) out.clientAt = e.clientAt;
  }
  return out;
}

/** A v4 UUID. crypto.randomUUID needs a secure context; the fallbacks keep an
 *  id the server accepts on anything else. */
export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  const b = new Uint8Array(16);
  try {
    crypto.getRandomValues(b);
  } catch {
    for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  }
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

type Entry = {
  event: LineEvent;
  /** In the save that is out right now. */
  inFlight: boolean;
  /** Ever handed to a save. Such an event is never merged into: the server may
   *  already hold it under this id, and a resend with the same id stores nothing. */
  sent: boolean;
};

/**
 * The queue between the screen and PUT /lines. Saves are already one at a
 * time (draftSync's chain), so at most one batch is in flight.
 *
 * - push: a new event, with its id and the phone's time.
 * - pushGrid: a grid keystroke. Typing "0", "0.", "0.8" is one change of the
 *   cell, so it merges into the cell's latest event when that is the same kind
 *   and has never been sent: the first beforeQty stays, afterQty and the rest
 *   follow the last keystroke.
 * - take: the batch for the next save, in order, marked in flight.
 * - ack: the server answered; those events are done.
 * - release: the save failed or was refused (409); its events go back to
 *   waiting, ahead of anything newer, and the next save sends the same ids.
 * - clear: the count was submitted or replaced.
 */
export function createLineEventQueue(opts: { now?: () => Date; newId?: () => string } = {}) {
  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? newEventId;
  let entries: Entry[] = [];
  const stamp = (e: LineEventInput): LineEvent => cleanLineEvent({ ...e, id: newId(), clientAt: now().toISOString() });
  return {
    push(e: LineEventInput): LineEvent {
      const event = stamp(e);
      entries.push({ event, inFlight: false, sent: false });
      return event;
    },
    pushGrid(e: LineEventInput): LineEvent {
      // Only the cell's LATEST event may absorb a keystroke, so the cell's own
      // order is kept (a voice apply between two typings stays between them).
      let last: Entry | undefined;
      for (let i = entries.length - 1; i >= 0; i--) {
        const x = entries[i]!;
        if (x.event.zoneId === e.zoneId && x.event.skuId === e.skuId) { last = x; break; }
      }
      if (last && !last.sent && !last.inFlight && last.event.kind === e.kind && (last.event.findingKind ?? null) === (e.findingKind ?? null)) {
        last.event = cleanLineEvent({ ...last.event, ...e, beforeQty: last.event.beforeQty, id: last.event.id, clientAt: now().toISOString() });
        return last.event;
      }
      const event = stamp(e);
      entries.push({ event, inFlight: false, sent: false });
      return event;
    },
    take(max = MAX_EVENTS_PER_SAVE, maxChars = MAX_EVENT_CHARS_PER_SAVE): LineEvent[] {
      const out: LineEvent[] = [];
      let chars = 0;
      for (const x of entries) {
        if (x.inFlight) continue;
        if (out.length >= max) break;
        const size = JSON.stringify(x.event).length + 1;
        if (out.length > 0 && chars + size > maxChars) break;
        chars += size;
        x.inFlight = true;
        x.sent = true;
        out.push(x.event);
      }
      return out;
    },
    ack(ids: readonly string[]) {
      const done = new Set(ids);
      entries = entries.filter((x) => !(x.inFlight && done.has(x.event.id)));
    },
    release(ids?: readonly string[]) {
      const back = ids ? new Set(ids) : null;
      for (const x of entries) if (x.inFlight && (!back || back.has(x.event.id))) x.inFlight = false;
    },
    clear() {
      entries = [];
    },
    /** Events not yet acknowledged, in order (tests and diagnostics). */
    pending(): LineEvent[] {
      return entries.map((x) => x.event);
    },
  };
}
export type LineEventQueue = ReturnType<typeof createLineEventQueue>;
