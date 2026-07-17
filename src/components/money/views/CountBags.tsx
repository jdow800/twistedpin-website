import { useCallback, useEffect, useMemo, useState } from "react";
import {
  commitBag,
  dedupeBags,
  dollarsToCents,
  getDayDetail,
  getOpenSession,
  getWorklist,
  money,
  openSession,
  REGISTER_LABEL,
  saveBagNote,
  shortDate,
  docPdfUrl,
  type BagView,
  type CommitResponse,
  type DayDetail,
  type RegisterKey,
  type WorklistResponse,
} from "../api";

/**
 * The count flow (Jon's 2026-07-17 redesign): pick a LOCATION (Bar / Bowling /
 * Arcade / Kiosk pull) → pick a DATE from a 20-day-back calendar (no future —
 * you can't pre-count money) → enter bills / coin / checks-total → commit →
 * over/short reveal. Blind-count-first: expected values appear only after the
 * count is committed. ✓ marks already-counted days; tapping one recounts.
 * NO deposit totals anywhere on these screens — by design.
 */

type DrawerKey = Exclude<RegisterKey, "kiosk">;

type Target =
  | { kind: "drawer"; registerKey: DrawerKey; salesDate: string; takesChecks: boolean; recountOf?: string }
  | { kind: "kiosk"; windowStart: string; recountOf?: string };

type Mode = "loading" | "location" | "date" | "entry" | "reveal";

const DAYS_BACK = 20;

/** Local calendar date → "YYYY-MM-DD". */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CountBags({ onDone, onReview }: { onDone: () => void; onReview: () => void }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [worklist, setWorklist] = useState<WorklistResponse | null>(null);
  const [sessionBags, setSessionBags] = useState<BagView[]>([]);
  const [location, setLocation] = useState<DrawerKey | null>(null);
  const [target, setTarget] = useState<Target | null>(null);

  const [bills, setBills] = useState("");
  const [coin, setCoin] = useState("");
  const [checksTotal, setChecksTotal] = useState("");
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState<CommitResponse | null>(null);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [wl, open] = await Promise.all([getWorklist(), getOpenSession()]);
    setWorklist(wl);
    // Recounts supersede their originals — the session list shows each BAG once.
    setSessionBags(dedupeBags(open.bags));
    setMode("location");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await openSession();
        setSessionId(s.sessionId);
        await refresh();
      } catch (e) {
        setError((e as Error).message);
        setMode("location");
      }
    })();
  }, [refresh]);

  function startEntry(t: Target) {
    setTarget(t);
    setBills("");
    setCoin("");
    setChecksTotal("");
    setResult(null);
    setNote("");
    setNoteSaved(false);
    setDetail(null);
    setDetailOpen(false);
    setError(null);
    setMode("entry");
  }

  /** Tapping an already-counted day = recount it (needs the original bag id). */
  async function startRecount(registerKey: DrawerKey, salesDate: string, takesChecks: boolean) {
    setBusy(true);
    try {
      const d = await getDayDetail(registerKey, salesDate);
      const original = d.counts.find((c) => !c.recountOf) ?? d.counts[0];
      if (!original) throw new Error("Couldn't find the original count to recount.");
      startEntry({ kind: "drawer", registerKey, salesDate, takesChecks, recountOf: original.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const billsCents = dollarsToCents(bills);
  const coinCents = dollarsToCents(coin);
  const checksCents = dollarsToCents(checksTotal) ?? 0;
  const entryValid = billsCents != null && coinCents != null && dollarsToCents(checksTotal) != null;
  const entryTotal = (billsCents ?? 0) + (coinCents ?? 0) + checksCents;

  async function commit() {
    if (!sessionId || !target || busy || !entryValid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await commitBag(sessionId, {
        registerKey: target.kind === "kiosk" ? "kiosk" : target.registerKey,
        ...(target.kind === "drawer" ? { salesDate: target.salesDate } : {}),
        billsCents: billsCents ?? 0,
        coinCents: coinCents ?? 0,
        checks: checksCents > 0 ? [{ payer: "Checks", cents: checksCents }] : [],
        ...(target.recountOf ? { recountOf: target.recountOf, note: note || "recount" } : {}),
      });
      setResult(res);
      setMode("reveal");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const reveal = result?.reveal ?? null;
  const v = reveal?.varianceCents ?? null;
  const needsNote = useMemo(() => {
    if (!reveal || reveal.unverified || v == null) return false;
    const pct = reveal.severity?.pct;
    return (Math.abs(v) >= 2500 || (pct != null && Math.abs(pct) >= 20)) && !noteSaved && !result?.bag.note;
  }, [reveal, v, noteSaved, result]);

  async function persistNote() {
    if (!result || !note.trim()) return;
    setBusy(true);
    try {
      await saveBagNote(result.bag.id, note.trim());
      setNoteSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openDetail() {
    if (!target || target.kind !== "drawer") return;
    setDetailOpen(true);
    if (detail) return;
    try {
      setDetail(await getDayDetail(target.registerKey, target.salesDate));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function nextBag() {
    setMode("loading");
    await refresh().catch((e) => {
      setError((e as Error).message);
      setMode("location");
    });
  }

  // ── screens ─────────────────────────────────────────────────────────────────

  if (mode === "loading") return <div className="lq-center lq-muted">Loading…</div>;

  if (mode === "location" && worklist) {
    const counted = sessionBags.length;
    const locations: { key: DrawerKey; sub: string }[] = [
      { key: "gotab", sub: "GoTab drawer" },
      { key: "brunswick", sub: "Front desk drawer — cash & checks" },
      { key: "arcade", sub: "Arcade counter drawer" },
    ];
    return (
      <div className="mn-pick">
        <div className="lq-row-between">
          <h2 className="lq-h2">Record a count</h2>
          <button type="button" className="lq-btn" onClick={onDone}>← Home</button>
        </div>
        {error && <p className="lq-error">{error}</p>}
        <p className="lq-muted mn-hint">Where's this bag from?</p>
        <div className="lq-actions">
          {locations.map((l) => (
            <button key={l.key} type="button" className="lq-action" onClick={() => { setLocation(l.key); setMode("date"); }}>
              <span className="lq-action-emoji" aria-hidden="true">{l.key === "gotab" ? "🍺" : l.key === "brunswick" ? "🎳" : "🕹️"}</span>
              <span className="lq-action-title">{REGISTER_LABEL[l.key]}</span>
              <span className="lq-action-sub">{l.sub}</span>
            </button>
          ))}
          <button
            type="button"
            className="lq-action"
            onClick={() => startEntry({ kind: "kiosk", windowStart: worklist.kiosk.windowStart })}
          >
            <span className="lq-action-emoji" aria-hidden="true">🪙</span>
            <span className="lq-action-title">Kiosk pull</span>
            <span className="lq-action-sub">Emptied the arcade bill acceptors? Count it here.</span>
          </button>
        </div>
        {counted > 0 && (
          <>
            <p className="lq-section-label">Counted this session ({counted})</p>
            <div className="mn-session-list">
              {sessionBags.map((bag) => (
                <div key={bag.id} className="mn-session-row">
                  <span>
                    {bag.registerKey === "kiosk"
                      ? `Kiosks ${shortDate(bag.windowStart)}–${shortDate(bag.windowEnd)}`
                      : `${shortDate(bag.salesDate)} ${REGISTER_LABEL[bag.registerKey]}`}
                  </span>
                  <span className={varianceClass(bag.varianceCents, bag.verifyStatus)}>
                    {varianceLabel(bag.varianceCents, bag.verifyStatus)}
                  </span>
                </div>
              ))}
            </div>
            <button type="button" className="lq-btn lq-btn-wide" onClick={onReview}>
              Review today's counts →
            </button>
          </>
        )}
      </div>
    );
  }

  if (mode === "date" && worklist && location) {
    const takesChecks = worklist.registers.find((r) => r.key === location)?.takesChecks ?? false;
    const countedSet = new Set(
      worklist.counted.filter((c) => c.registerKey === location).map((c) => c.salesDate),
    );
    // Last 20 days, oldest first, laid out on a real week grid (Sun–Sat).
    const today = new Date();
    const days: { iso: string; d: Date }[] = [];
    for (let i = DAYS_BACK - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      days.push({ iso: localIso(d), d });
    }
    const leadBlanks = days[0]!.d.getDay();
    return (
      <div className="mn-pick">
        <div className="lq-row-between">
          <h2 className="lq-h2">{REGISTER_LABEL[location]} — which day?</h2>
          <button type="button" className="lq-btn" onClick={() => setMode("location")}>← Back</button>
        </div>
        {error && <p className="lq-error">{error}</p>}
        <p className="lq-muted mn-hint">The date on the bag's label. ✓ = already counted (tap to recount).</p>
        <div className="mn-cal">
          {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
            <span key={i} className="mn-cal-wd">{w}</span>
          ))}
          {Array.from({ length: leadBlanks }).map((_, i) => (
            <span key={`b${i}`} />
          ))}
          {days.map(({ iso, d }) => {
            const done = countedSet.has(iso);
            return (
              <button
                key={iso}
                type="button"
                className={`mn-cal-day${done ? " mn-cal-done" : ""}`}
                disabled={busy}
                onClick={() =>
                  done
                    ? void startRecount(location, iso, takesChecks)
                    : startEntry({ kind: "drawer", registerKey: location, salesDate: iso, takesChecks })
                }
              >
                <span className="mn-cal-mo">{d.toLocaleString("en-US", { month: "short" })}</span>
                <span className="mn-cal-num">{d.getDate()}</span>
                {done && <span className="mn-cal-check">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === "entry" && target) {
    const title =
      target.kind === "kiosk"
        ? `Kiosk pull · since ${shortDate(target.windowStart)}`
        : `${REGISTER_LABEL[target.registerKey]} · ${shortDate(target.salesDate)}${target.recountOf ? " · recount" : ""}`;
    return (
      <div className="mn-entry">
        <div className="lq-row-between">
          <h2 className="lq-h2">{title}</h2>
          <button type="button" className="lq-btn" onClick={() => setMode(target.kind === "kiosk" ? "location" : "date")}>← Back</button>
        </div>
        {error && <p className="lq-error">{error}</p>}
        <label className="mn-field">
          <span>Bills</span>
          <input inputMode="decimal" placeholder="0.00" value={bills} onChange={(e) => setBills(e.target.value)} />
        </label>
        <label className="mn-field">
          <span>Coin</span>
          <input inputMode="decimal" placeholder="0.00" value={coin} onChange={(e) => setCoin(e.target.value)} />
        </label>
        {target.kind === "drawer" && target.takesChecks && (
          <label className="mn-field">
            <span>Checks (total)</span>
            <input inputMode="decimal" placeholder="0.00" value={checksTotal} onChange={(e) => setChecksTotal(e.target.value)} />
          </label>
        )}
        {target.recountOf && (
          <label className="mn-field">
            <span>Why the recount?</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. double-checking a shortage" />
          </label>
        )}
        <p className="mn-entry-total">Total: <strong>{money(entryTotal)}</strong></p>
        <button
          type="button"
          className="lq-btn lq-btn-primary lq-btn-wide"
          disabled={!entryValid || busy || (!!target.recountOf && !note.trim())}
          onClick={() => void commit()}
        >
          {busy ? "Saving…" : "Count it"}
        </button>
      </div>
    );
  }

  if (mode === "reveal" && result && reveal) {
    const bag = result.bag;
    const title =
      bag.registerKey === "kiosk"
        ? `Kiosks · ${shortDate(bag.windowStart)}–${shortDate(bag.windowEnd)}`
        : `${REGISTER_LABEL[bag.registerKey]} · ${shortDate(bag.salesDate)}`;
    return (
      <div className="mn-reveal">
        <h2 className="lq-h2">{title}</h2>
        {error && <p className="lq-error">{error}</p>}
        {reveal.unverified ? (
          <div className="mn-card mn-card-warn">
            <p className="mn-big">⚠️ Can't verify yet</p>
            <p>{reveal.message}</p>
            <p className="lq-muted">Counted: {money(bag.totalCents)}</p>
          </div>
        ) : (
          <div className={`mn-card ${v === 0 ? "mn-card-even" : v! > 0 ? "mn-card-over" : "mn-card-short"}`}>
            <p className="mn-big">{varianceLabel(v, "verified")}</p>
            <p>
              Expected {money(reveal.expectedCents ?? null)} · Counted {money(bag.totalCents)}
              {reveal.severity?.pct != null && v !== 0 && <> · {Math.abs(reveal.severity.pct).toFixed(1)}% of the take</>}
            </p>
            {reveal.offset && (
              <p className="mn-offset">
                ⚖️ Offsets {shortDate(reveal.offset.neighborDate)}'s{" "}
                {reveal.offset.neighborVarianceCents > 0 ? "overage" : "shortage"} — likely a count-down error at close,
                not missing money.
              </p>
            )}
            {reveal.kioskCaveat && <p className="lq-muted">{reveal.kioskCaveat}</p>}
          </div>
        )}
        {needsNote && (
          <div className="mn-note">
            <p className="lq-section-label">That's a big miss — add a note before moving on</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What do you think happened?" />
            <button type="button" className="lq-btn" disabled={!note.trim() || busy} onClick={() => void persistNote()}>
              Save note
            </button>
          </div>
        )}
        {bag.registerKey !== "kiosk" && (
          <div className="mn-detail">
            {!detailOpen ? (
              <button type="button" className="lq-btn" onClick={() => void openDetail()}>
                See the day's POS detail
              </button>
            ) : !detail ? (
              <p className="lq-muted">Loading day detail…</p>
            ) : (
              <div className="mn-detail-body">
                {detail.tender && (
                  <>
                    <p className="lq-section-label">Payments that day</p>
                    {detail.tender.paymentLines.map((l, i) => (
                      <div key={i} className="mn-session-row">
                        <span>{l.label}</span>
                        <span>{money(l.cents)}</span>
                      </div>
                    ))}
                    {detail.tender.payouts.length > 0 && (
                      <p className="lq-muted">Payouts: {detail.tender.payouts.map((p) => `${p.name} ${money(p.cents)}`).join(" · ")}</p>
                    )}
                  </>
                )}
                {detail.adjustments.length > 0 && (
                  <>
                    <p className="lq-section-label">Comps / voids / refunds</p>
                    {detail.adjustments.slice(0, 8).map((a, i) => (
                      <div key={i} className="mn-session-row">
                        <span>
                          {a.kind}
                          {a.reason ? ` — ${a.reason}` : ""}
                        </span>
                        <span>{money(a.amountCents)}</span>
                      </div>
                    ))}
                  </>
                )}
                {detail.doc?.hasPdf && (
                  <a className="lq-btn" href={docPdfUrl(detail.doc.id)} target="_blank" rel="noreferrer">
                    Open the POS report PDF
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        <div className="mn-reveal-actions">
          <button
            type="button"
            className="lq-btn"
            onClick={() =>
              startEntry(
                bag.registerKey === "kiosk"
                  ? { kind: "kiosk", windowStart: bag.windowStart!, recountOf: bag.recountOf ?? bag.id }
                  : {
                      kind: "drawer",
                      registerKey: bag.registerKey as DrawerKey,
                      salesDate: bag.salesDate!,
                      takesChecks: (worklist?.registers.find((r) => r.key === bag.registerKey)?.takesChecks) ?? false,
                      recountOf: bag.recountOf ?? bag.id,
                    },
              )
            }
          >
            Recount this bag
          </button>
          <button type="button" className="lq-btn lq-btn-primary" disabled={needsNote} onClick={() => void nextBag()}>
            Next bag →
          </button>
        </div>
      </div>
    );
  }

  return <div className="lq-center lq-muted">Loading…</div>;
}

function varianceLabel(v: number | null, status: string): string {
  if (status === "unverified" || v == null) return "⚠️ unverified";
  if (v === 0) return "✓ Even";
  return v > 0 ? `+${money(v)} over` : `−${money(v)} short`;
}

function varianceClass(v: number | null, status: string): string {
  if (status === "unverified" || v == null) return "mn-chip mn-chip-warn";
  if (v === 0) return "mn-chip mn-chip-even";
  return v > 0 ? "mn-chip mn-chip-over" : "mn-chip mn-chip-short";
}
