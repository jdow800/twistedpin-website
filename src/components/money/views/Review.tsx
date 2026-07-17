import { useEffect, useState } from "react";
import {
  getOpenSession,
  getReview,
  money,
  REGISTER_LABEL,
  shortDate,
  signedMoney,
  submitSession,
  type ReviewResponse,
} from "../api";

/**
 * Review this session's counts — each one INDEPENDENT (deliberately no totals
 * and no deposit language anywhere on this screen; Jon 2026-07-17). "Done —
 * heading to the bank" tells the system counting is finished; what happens
 * server-side after that is not this screen's business.
 */
export default function Review({ onDone }: { onDone: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const open = await getOpenSession();
        if (!open.session) {
          setError("No open count session.");
          return;
        }
        setSessionId(open.session.id);
        setReview(await getReview(open.session.id));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  async function finish() {
    if (!sessionId || busy) return;
    if (!window.confirm("Done counting? This closes out the session.")) return;
    setBusy(true);
    setError(null);
    try {
      await submitSession(sessionId);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="lq-center">
        <p className="mn-big">✅ All logged</p>
        <p className="lq-muted" style={{ maxWidth: 340, textAlign: "center" }}>
          Counting's closed out. Safe travels to the bank.
        </p>
        <button type="button" className="lq-btn lq-btn-primary" onClick={onDone}>
          Home
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="lq-center">
        <p className="lq-error">{error}</p>
        <button type="button" className="lq-btn" onClick={onDone}>Home</button>
      </div>
    );
  }
  if (!review) return <div className="lq-center lq-muted">Loading…</div>;

  const rows = review.rows;

  return (
    <div className="mn-review">
      <div className="lq-row-between">
        <h2 className="lq-h2">This session's counts</h2>
        <button type="button" className="lq-btn" onClick={onDone}>← Back</button>
      </div>
      <p className="lq-muted mn-hint">Each count stands on its own — over, short, or even.</p>

      <table className="mn-table">
        <thead>
          <tr>
            <th>Bag</th>
            <th className="mn-r">Expected</th>
            <th className="mn-r">Counted</th>
            <th className="mn-r">Over/Short</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const label =
              r.registerKey === "kiosk"
                ? `Kiosks ${shortDate(r.windowStart)}–${shortDate(r.windowEnd)}`
                : `${shortDate(r.salesDate)} ${REGISTER_LABEL[r.registerKey]}`;
            const unv = r.varianceCents == null;
            return (
              <tr key={r.id}>
                <td>
                  {label}
                  {r.offset && <span className="mn-offset-inline"> ⚖️ offsets {shortDate(r.offset.neighborDate)}</span>}
                </td>
                <td className="mn-r">{unv ? "—" : money(r.expectedCents)}</td>
                <td className="mn-r">{money(r.totalCents)}</td>
                <td className={`mn-r ${unv ? "mn-warn" : r.varianceCents === 0 ? "mn-even" : r.varianceCents! > 0 ? "mn-over" : "mn-short"}`}>
                  {unv ? "⚠️" : r.varianceCents === 0 ? "✓ even" : signedMoney(r.varianceCents!)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button type="button" className="lq-btn lq-btn-primary lq-btn-wide" disabled={busy || rows.length === 0} onClick={() => void finish()}>
        {busy ? "Closing out…" : "Done — heading to the bank"}
      </button>
    </div>
  );
}
