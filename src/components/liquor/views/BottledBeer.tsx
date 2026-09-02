import { useEffect, useRef, useState } from "react";
import {
  createCount,
  getCatalog,
  getOpenCount,
  getZones,
  saveCountLines,
  type BarSkuItem,
  type CountLineInput,
} from "../api";

/**
 * BOTTLED BEER — the third half of the Keg Check screen.
 *
 * We only sell bottled beer on league nights (Mon/Tue), so it lives in the
 * walk-in next to the kegs and gets counted on the same trip. But unlike the
 * keg halves, these are REAL liquor-count rows against real bar_sku records:
 * ordinary bar_count_line writes, in a session flagged is_full_count = false.
 * That is what lets it reach costs, invoices and the order guide while staying
 * invisible to the spirits variance engine, which only ever reads full counts.
 *
 * NO VOICE, deliberately. "Three cases, one six-pack, and two" is exactly the
 * utterance shape that produced the 93-bottle prosecco and read "point four" as
 * 4. Five bottles times three boxes is faster to tap than one wrong number is
 * to find and fix.
 *
 * THREE TIERS, because that is how the stack is read: cases, six-packs, loose
 * bottles. qty_units stays the canonical total; the tiers ride along as
 * provenance so the email can print the split and a resumed draft restores what
 * was actually typed.
 */

/** Bottles in a six-pack. The case size comes from the catalog per SKU (24
 *  here), because pack size is a BRAND fact and the app never guesses one — but
 *  a six-pack is a six-pack. */
const PACK_SIZE = 6;
const ZONE_NAME = "Walk In Cooler";

type Row = {
  skuId: string;
  name: string;
  caseSize: number | null;
  cases: number;
  packs: number;
  loose: number;
};

const totalOf = (r: Row) => r.cases * (r.caseSize ?? 0) + r.packs * PACK_SIZE + r.loose;

export default function BottledBeer({
  embedded = false,
  onEmbedState,
  embedFlushRef,
}: {
  embedded?: boolean;
  onEmbedState?: (s: { sessionId: string | null; count: number }) => void;
  embedFlushRef?: { current: (() => Promise<void>) | null };
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [resumed, setResumed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // `false` — resume only PARTIAL drafts. Passing true here would hand
        // this screen the GM's in-progress full liquor count.
        const [zones, catalog, open] = await Promise.all([
          getZones(),
          getCatalog(),
          getOpenCount(false),
        ]);
        if (!live) return;
        const zone =
          zones.find((z) => z.name === ZONE_NAME) ??
          [...zones].sort((a, b) => b.walkOrder - a.walkOrder)[0];
        setZoneId(zone?.id ?? null);

        const beers = catalog
          .filter((s: BarSkuItem) => (s.category ?? "").toLowerCase() === "beer")
          .sort((a, b) => a.name.localeCompare(b.name));

        // Prior entries win over the empty defaults so a resumed draft shows
        // what was typed, tier by tier.
        const prior = new Map(open ? open.lines.map((l) => [l.skuId, l]) : []);
        setRows(
          beers.map((s) => {
            const p = prior.get(s.id);
            const cases = p?.enteredCases ? Number(p.enteredCases) : 0;
            const packs = p?.enteredPacks ? Number(p.enteredPacks) : 0;
            // The case size FROZEN on the line beats the catalog's current one —
            // reopening a draft after a case-size edit must not rescale it.
            const caseSize = p?.caseSizeAtEntry ?? s.unitsPerCase ?? null;
            const qty = p ? Number(p.qtyUnits) : 0;
            const packSize = p?.packSizeAtEntry ?? PACK_SIZE;
            return {
              skuId: s.id,
              name: s.name,
              caseSize,
              cases,
              packs,
              loose: Math.max(0, qty - cases * (caseSize ?? 0) - packs * packSize),
            };
          }),
        );
        if (open && open.lines.length > 0) setResumed(true);
        // Only open a draft once there is something to count. Without this the
        // section mints an empty partial session on every visit — including
        // before the beer SKUs exist at all, which is exactly the window where
        // the frontend can ship ahead of its migration.
        if (beers.length > 0) setSessionId(open ? open.id : await createCount(false));
        setPhase("ready");
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsRef = useRef<Row[]>(rows);
  rowsRef.current = rows;

  function validLines(rs: Row[]): CountLineInput[] {
    if (!zoneId) return [];
    // A ZERO IS A REAL OBSERVATION, and it is the strongest order signal there
    // is — "we are out of Bud Light" is exactly what should trigger a case.
    //
    // The whole beer list is FIVE rows on one screen, so unlike the liquor
    // count there is no such thing as counting some of it: if anything was
    // entered, the counter looked at the cooler and the empty rows are empty
    // shelves. So the moment ANY row has a number, every row is sent, zeros
    // included. Until then nothing is sent — an untouched section means "not
    // counted", which is a different claim from "none on the shelf", and the
    // two must not collapse into each other.
    if (!rs.some((r) => r.cases > 0 || r.packs > 0 || r.loose > 0)) return [];
    return rs
      .map((r) => ({
        zoneId,
        skuId: r.skuId,
        qtyUnits: totalOf(r),
        source: "grid" as const,
        ...(r.cases > 0 && r.caseSize
          ? { enteredCases: r.cases, caseSizeAtEntry: r.caseSize }
          : {}),
        ...(r.packs > 0 ? { enteredPacks: r.packs, packSizeAtEntry: PACK_SIZE } : {}),
      }));
  }

  async function flush() {
    if (!sessionId) return;
    setSave("saving");
    try {
      await saveCountLines(sessionId, validLines(rowsRef.current));
      setSave("saved");
    } catch {
      setSave("error");
    }
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 1400);
  }

  function bump(skuId: string, field: "cases" | "packs" | "loose", delta: number) {
    setRows((rs) =>
      rs.map((r) => (r.skuId === skuId ? { ...r, [field]: Math.max(0, r[field] + delta) } : r)),
    );
    setSave("idle");
    scheduleSave();
  }
  function setField(skuId: string, field: "cases" | "packs" | "loose", raw: string) {
    const n = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (!Number.isFinite(n)) return;
    setRows((rs) => rs.map((r) => (r.skuId === skuId ? { ...r, [field]: n } : r)));
    setSave("idle");
    scheduleSave();
  }
  function clearRow(skuId: string) {
    setRows((rs) => rs.map((r) => (r.skuId === skuId ? { ...r, cases: 0, packs: 0, loose: 0 } : r)));
    setSave("idle");
    scheduleSave();
  }

  // Flush on screen-lock / app-switch so the last edit survives eviction.
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

  // Reassigned every render so the handle always closes over the current rows.
  useEffect(() => {
    if (embedFlushRef) embedFlushRef.current = flush;
  });

  // Hoisted above the early returns — hooks cannot live after a conditional one.
  const total = validLines(rows).reduce((n, l) => n + l.qtyUnits, 0);
  // The accordion badge counts beers with an actual NUMBER, not the rows that
  // will be sent — validLines sends all five (zeros included) the moment one is
  // filled in, so using its length would flash "5" after the first entry.
  const touched = rows.filter((r) => r.cases > 0 || r.packs > 0 || r.loose > 0).length;
  useEffect(() => {
    onEmbedState?.({ sessionId, count: touched });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, touched, total]);

  if (phase === "loading") return <div className="lq-center lq-muted">Loading bottled beer…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't load the beer list.</p>
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="lq-center lq-muted">
        No bottled beer in the catalog yet.
      </div>
    );

  return (
    <div className="lq-beer">
      {resumed && (
        <p className="lq-beer-resumed">Picked up where you left off.</p>
      )}
      {rows.map((r) => {
        const t = totalOf(r);
        return (
          <div className="lq-beer-row" key={r.skuId}>
            <div className="lq-beer-head">
              <span className="lq-beer-name">{r.name}</span>
              <span className={t > 0 ? "lq-beer-total on" : "lq-beer-total"}>
                {t > 0 ? `${t} bottle${t === 1 ? "" : "s"}` : "—"}
              </span>
              {t > 0 && (
                <button
                  type="button"
                  className="lq-beer-clear"
                  onClick={() => clearRow(r.skuId)}
                  aria-label={`Clear ${r.name}`}
                >
                  ✕
                </button>
              )}
            </div>
            <div className="lq-beer-steppers">
              {(
                [
                  {
                    f: "cases" as const,
                    // The case size is named on the control itself: it is the
                    // multiplier, and an unlabelled 3 that means 72 is the whole
                    // reason case entry needs a visible trace.
                    label: r.caseSize ? `cases of ${r.caseSize}` : "cases",
                    disabled: !r.caseSize,
                  },
                  { f: "packs" as const, label: "six-packs", disabled: false },
                  { f: "loose" as const, label: "bottles", disabled: false },
                ]
              ).map(({ f, label, disabled }) => (
                <div className="lq-step" key={f}>
                  <span className="lq-step-label">{label}</span>
                  <div className="lq-step-ctl">
                    <button
                      type="button"
                      onClick={() => bump(r.skuId, f, -1)}
                      disabled={disabled || r[f] <= 0}
                      aria-label={`One fewer ${label} of ${r.name}`}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={r[f] || ""}
                      placeholder="0"
                      disabled={disabled}
                      onChange={(e) => setField(r.skuId, f, e.target.value)}
                      aria-label={`${label} of ${r.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => bump(r.skuId, f, 1)}
                      disabled={disabled}
                      aria-label={`One more ${label} of ${r.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="lq-beer-foot">
        <span>
          {total} bottle{total === 1 ? "" : "s"} on hand
        </span>
        <span className="lq-beer-save">
          {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Not saved" : ""}
        </span>
      </div>

      {!embedded && (
        <p className="lq-beer-note">
          This section is part of the keg check — finish there to send it.
        </p>
      )}
    </div>
  );
}
