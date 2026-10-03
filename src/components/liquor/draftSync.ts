import { DraftChangedError, type CountLineInput, type OpenCountLine } from "./api";

/**
 * Keeps one count screen's saves from overwriting edits made elsewhere.
 *
 * PUT /lines replaces the whole draft. A screen opened before an edit made
 * somewhere else (an admin's correction, an old tab, a second phone) used to
 * save its stale copy straight over it (Jon's phone pass, 2026-10-02). Each
 * save now says which draft it was built on (TPRS countLinesHash); a refused
 * save merges this screen's own edits onto the draft as it is now and saves
 * that instead.
 */

const keyOf = (l: { zoneId: string; skuId: string }) => `${l.zoneId}:${l.skuId}`;
/** One cell's quantity, comparable across the two wire shapes. */
const qtyOf = (l: CountLineInput | OpenCountLine) => JSON.stringify([
  Number(l.qtyUnits),
  l.enteredCases == null ? null : Number(l.enteredCases),
  l.caseSizeAtEntry ?? null,
  l.enteredPacks == null ? null : Number(l.enteredPacks),
  l.packSizeAtEntry ?? null,
]);

/** Server lines in the shape a screen saves. */
export function toInputLines(lines: OpenCountLine[]): CountLineInput[] {
  return lines.map((l) => ({
    zoneId: l.zoneId,
    skuId: l.skuId,
    qtyUnits: Number(l.qtyUnits),
    source: l.source,
    ...(l.rawUtterance ? { rawUtterance: l.rawUtterance } : {}),
    ...(l.enteredCases != null ? { enteredCases: Number(l.enteredCases), caseSizeAtEntry: l.caseSizeAtEntry } : {}),
    ...(l.enteredPacks != null ? { enteredPacks: Number(l.enteredPacks), packSizeAtEntry: l.packSizeAtEntry } : {}),
  }));
}

/** Lines in the shape a screen rebuilds its state from (resume's). */
export function toOpenLines(lines: CountLineInput[]): OpenCountLine[] {
  return lines.map((l) => ({
    zoneId: l.zoneId,
    skuId: l.skuId,
    qtyUnits: String(l.qtyUnits),
    enteredCases: l.enteredCases != null ? String(l.enteredCases) : null,
    caseSizeAtEntry: l.caseSizeAtEntry ?? null,
    enteredPacks: l.enteredPacks != null ? String(l.enteredPacks) : null,
    packSizeAtEntry: l.packSizeAtEntry ?? null,
    source: l.source,
    rawUtterance: l.rawUtterance ?? null,
  }));
}

/**
 * base = what this screen last saved or loaded; mine = what it holds now;
 * theirs = the draft as the server holds it now. A cell this screen didn't
 * change takes the server's value, or its removal. A cell it did change keeps
 * its own value: the counter standing at the shelf has the latest word on it.
 */
export function mergeDraft(base: CountLineInput[], mine: CountLineInput[], theirs: CountLineInput[]): CountLineInput[] {
  const b = new Map(base.map((l) => [keyOf(l), l]));
  const m = new Map(mine.map((l) => [keyOf(l), l]));
  const t = new Map(theirs.map((l) => [keyOf(l), l]));
  const out: CountLineInput[] = [];
  for (const key of new Set([...b.keys(), ...m.keys(), ...t.keys()])) {
    const before = b.get(key), now = m.get(key);
    const untouched = before && now ? qtyOf(before) === qtyOf(now) : !before && !now;
    const pick = untouched ? t.get(key) : now;
    if (pick) out.push(pick);
  }
  return out;
}

/**
 * One screen's saves, in order, each built on the draft the last one left.
 * Saves can start from several places at once (the autosave timer, the page
 * being hidden, Finish), and two in flight on the same fingerprint would
 * refuse each other, so they queue.
 */
export function createDraftSaver(opts: {
  save: (lines: CountLineInput[], baseHash: string | null) => Promise<{ linesHash?: string }>;
  /** The screen's lines right now. */
  current: () => CountLineInput[];
  /** Replace the screen's lines with a merge (the draft changed elsewhere). */
  adopt: (lines: CountLineInput[]) => void;
}) {
  let base: CountLineInput[] = [];
  let baseHash: string | null = null;
  let chain: Promise<void> = Promise.resolve();
  const run = async () => {
    const lines = opts.current();
    try {
      const res = await opts.save(lines, baseHash);
      base = lines;
      baseHash = res.linesHash ?? null;
    } catch (e) {
      if (!(e instanceof DraftChangedError)) throw e;
      const theirs = toInputLines(e.lines);
      // Read the screen again: the counter may have typed while this was out.
      const merged = mergeDraft(base, opts.current(), theirs);
      opts.adopt(merged);
      base = theirs;
      baseHash = e.linesHash;
      const res = await opts.save(merged, baseHash);
      base = merged;
      baseHash = res.linesHash ?? null;
    }
  };
  return {
    /** A draft as loaded from the server, or a new empty one (no hash). */
    loaded(lines: OpenCountLine[], hash: string | null | undefined) {
      base = toInputLines(lines);
      baseHash = hash ?? null;
    },
    /** The server's fingerprint of the draft as this screen last saved or
     *  loaded it: what a review the counter has since answered in place
     *  actually covers (the food submit panel writes counts). */
    currentHash(): string | null {
      return baseHash;
    },
    /** Queue a save. Resolves when it, and every save before it, is done. */
    save(): Promise<void> {
      const p = chain.then(run);
      chain = p.catch(() => {});
      return p;
    },
  };
}

/**
 * The same queued, fingerprinted saves for other rows a save replaces
 * wholesale: the liquor count's prep-batch rows (TPRS PUT /batches, 2026-10-03).
 * A refused save merges as mergeDraft does: a cell this screen changed keeps
 * its value, and every other cell takes the server's, or its removal.
 */
export function createCellSaver<T>(opts: {
  save: (rows: T[], baseHash: string | null) => Promise<{ hash?: string }>;
  current: () => T[];
  adopt: (rows: T[]) => void;
  keyOf: (row: T) => string;
  same: (a: T, b: T) => boolean;
  /** The server's rows and fingerprint when a save was refused as stale. */
  conflict: (e: unknown) => { rows: T[]; hash: string } | null;
}) {
  let base: T[] = [];
  let baseHash: string | null = null;
  let chain: Promise<void> = Promise.resolve();
  const merge = (mine: T[], theirs: T[]) => {
    const b = new Map(base.map((r) => [opts.keyOf(r), r]));
    const m = new Map(mine.map((r) => [opts.keyOf(r), r]));
    const t = new Map(theirs.map((r) => [opts.keyOf(r), r]));
    const out: T[] = [];
    for (const key of new Set([...b.keys(), ...m.keys(), ...t.keys()])) {
      const before = b.get(key), now = m.get(key);
      const untouched = before && now ? opts.same(before, now) : !before && !now;
      const pick = untouched ? t.get(key) : now;
      if (pick) out.push(pick);
    }
    return out;
  };
  const run = async () => {
    const rows = opts.current();
    try {
      const res = await opts.save(rows, baseHash);
      base = rows;
      baseHash = res.hash ?? null;
    } catch (e) {
      const c = opts.conflict(e);
      if (!c) throw e;
      const merged = merge(opts.current(), c.rows);
      opts.adopt(merged);
      base = c.rows;
      baseHash = c.hash;
      const res = await opts.save(merged, baseHash);
      base = merged;
      baseHash = res.hash ?? null;
    }
  };
  return {
    loaded(rows: T[], hash: string | null | undefined) {
      base = rows;
      baseHash = hash ?? null;
    },
    save(): Promise<void> {
      const p = chain.then(run);
      chain = p.catch(() => {});
      return p;
    },
  };
}
