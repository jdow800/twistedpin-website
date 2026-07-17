import { useCallback, useEffect, useMemo, useState } from "react";
import {
  commitBag,
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
 * The count flow (spec §4.2–4.4). Blind-count-first: the worklist shows only
 * that a bag-day EXISTS; the expected value appears in the reveal, after the
 * count is committed server-side. Notes are required post-reveal beyond the
 * threshold (|$25| or ≥20%) because the variance isn't knowable pre-commit.
 */

type Target =
  | { kind: "drawer"; registerKey: Exclude<RegisterKey, "kiosk">; salesDate: string; takesChecks: boolean; recountOf?: string }
  | { kind: "kiosk"; windowStart: string; recountOf?: string };

type Mode = "loading" | "pick" | "entry" | "reveal";

interface CheckDraft {
  payer: string;
  amount: string;
}

export default function CountBags({ onDone, onReview }: { onDone: () => void; onReview: () => void }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [worklist, setWorklist] = useState<WorklistResponse | null>(null);
  const [sessionBags, setSessionBags] = useState<BagView[]>([]);
  const [target, setTarget] = useState<Target | null>(null);

  const [bills, setBills] = useState("");
  const [coin, setCoin] = useState("");
  const [checks, setChecks] = useState<CheckDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState<CommitResponse | null>(null);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [wl, open] = await Promise.all([getWorklist(), getOpenSession()]);
    setWorklist(wl);
    setSessionBags(open.bags);
    setMode("pick");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await openSession();
        setSessionId(s.sessionId);
        await refresh();
      } catch (e) {
        setError((e as Error).message);
        setMode("pick");
      }
    })();
  }, [refresh]);

  function startEntry(t: Target) {
    setTarget(t);
    setBills("");
    setCoin("");
    setChecks([]);
    setResult(null);
    setNote("");
    setNoteSaved(false);
    setDetail(null);
    setDetailOpen(false);
    setError(null);
    setMode("entry");
  }

  const billsCents = dollarsToCents(bills);
  const coinCents = dollarsToCents(coin);
  const checkItems = checks
    .map((c) => ({ payer: c.payer.trim(), cents: dollarsToCents(c.amount) }))
    .filter((c) => c.payer && c.cents != null && c.cents > 0) as { payer: string; cents: number }[];
  const entryValid =
    billsCents != null &&
    coinCents != null &&
    checks.every((c) => !c.payer.trim() || (dollarsToCents(c.amount) ?? 0) > 0) &&
    billsCents + coinCents + checkItems.reduce((s, c) => s + c.cents, 0) >= 0;
  const entryTotal = (billsCents ?? 0) + (coinCents ?? 0) + checkItems.reduce((s, c) => s + c.cents, 0);

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
        checks: checkItems,
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
      setMode("pick");
    });
  }

  // ── render ──────────────────────────────────────────────────────────────────

  if (mode === "loading") return <div className="lq-center lq-muted">Loading…</div>;

  if (mode === "pick" && worklist) {
    const counted = sessionBags.length;
    return (
      <div className="mn-pick">
        <div className="lq-row-between">
          <h2 className="lq-h2">Pick a bag</h2>
          <button type="button" className="lq-btn" onClick={onDone}>Done for now</button>
        </div>
        {error && <p className="lq-error">{error}</p>}
        <p className="lq-muted mn-hint">Match the bag's label — oldest first. The expected amount stays hidden until you've counted.</p>
        <div className="mn-tiles">
          {worklist.uncounted.map((u) => (
            <button
              key={`${u.registerKey}|${u.salesDate}`}
              type="button"
              className="mn-tile"
              onClick={() =>
                startEntry({
                  kind: "drawer",
                  registerKey: u.registerKey as Exclude<RegisterKey, "kiosk">,
                  salesDate: u.salesDate,
                  takesChecks: worklist.registers.find((r) => r.key === u.registerKey)?.takesChecks ?? false,
                })
              }
            >
              <span className="mn-tile-date">{shortDate(u.salesDate)}</span>
              <span className="mn-tile-reg">{REGISTER_LABEL[u.registerKey]}</span>
            </button>
          ))}
          <button type="button" className="mn-tile mn-tile-kiosk" onClick={() => startEntry({ kind: "kiosk", windowStart: worklist.kiosk.windowStart })}>
            <span className="mn-tile-date">since {shortDate(worklist.kiosk.windowStart)}</span>
            <span className="mn-tile-reg">Kiosk pull</span>
          </button>
        </div>
        {worklist.uncounted.length === 0 && (
          <p className="lq-muted">No uncounted bags with expected cash — you're caught up. 🎉</p>
        )}
        {worklist.zeroDays.length > 0 && (
          <p className="mn-zero lq-muted">
            No cash expected (no bag needed):{" "}
            {worklist.zeroDays.map((z) => `${shortDate(z.salesDate)} ${REGISTER_LABEL[z.registerKey]}`).join(" · ")}
          </p>
        )}
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
            <button type="button" className="lq-btn lq-btn-primary lq-btn-wide" onClick={onReview}>
              Review &amp; seal deposit →
            </button>
          </>
        )}
      </div>
    );
  }

  if (mode === "entry" && target) {
    const title =
      target.kind === "kiosk"
        ? `Kiosk pull · since ${shortDate(target.windowStart)}`
        : `${shortDate(target.salesDate)} · ${REGISTER_LABEL[target.registerKey]}${target.recountOf ? " · recount" : ""}`;
    return (
      <div className="mn-entry">
        <div className="lq-row-between">
          <h2 className="lq-h2">{title}</h2>
          <button type="button" className="lq-btn" onClick={() => void nextBag()}>Back</button>
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
          <div className="mn-checks">
            <p className="lq-section-label">Checks (each one)</p>
            {checks.map((c, i) => (
              <div key={i} className="mn-check-row">
                <input
                  placeholder="Who it's from"
                  value={c.payer}
                  onChange={(e) => setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, payer: e.target.value } : x)))}
                />
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={c.amount}
                  onChange={(e) => setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                />
                <button type="button" className="mn-x" onClick={() => setChecks((cs) => cs.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button type="button" className="lq-btn" onClick={() => setChecks((cs) => [...cs, { payer: "", amount: "" }])}>
              + Add a check
            </button>
          </div>
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
        : `${shortDate(bag.salesDate)} · ${REGISTER_LABEL[bag.registerKey]}`;
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
            {!reveal.offset && v !== 0 && <p className="mn-offset lq-muted">No offsetting neighbor found yet — worth a look if it's big.</p>}
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
                      registerKey: bag.registerKey as Exclude<RegisterKey, "kiosk">,
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
