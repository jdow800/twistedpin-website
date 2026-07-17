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
 * Session review grid + deposit seal (spec §4.5). Sealing submits the session,
 * writes the immutable deposit, and fires Jon's to-bank email in the same
 * transaction — the "I'm done counting" moment.
 */
export default function Review({ onDone }: { onDone: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sealed, setSealed] = useState<{ totalCents: number } | null>(null);

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

  async function seal() {
    if (!sessionId || busy) return;
    if (!window.confirm("Seal the deposit? This locks the session and emails the to-bank total.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await submitSession(sessionId);
      setSealed({ totalCents: res.totalCents });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sealed) {
    return (
      <div className="lq-center">
        <p className="mn-big">🏦 Deposit sealed</p>
        <p className="mn-sealed-total">{money(sealed.totalCents)} to the bank</p>
        <p className="lq-muted" style={{ maxWidth: 340, textAlign: "center" }}>
          The itemized to-bank email is on its way. Bag it, slip it, done.
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
  const verified = rows.filter((r) => r.varianceCents != null);
  const sumExpected = verified.reduce((s, r) => s + (r.expectedCents ?? 0), 0);
  const sumVariance = verified.reduce((s, r) => s + (r.varianceCents ?? 0), 0);
  const dep = review.deposit;

  return (
    <div className="mn-review">
      <div className="lq-row-between">
        <h2 className="lq-h2">Review &amp; seal</h2>
        <button type="button" className="lq-btn" onClick={onDone}>Back</button>
      </div>

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
          <tr className="mn-total-row">
            <td>TOTAL</td>
            <td className="mn-r">{money(sumExpected)}</td>
            <td className="mn-r">{money(rows.reduce((s, r) => s + r.totalCents, 0))}</td>
            <td className={`mn-r ${sumVariance === 0 ? "mn-even" : sumVariance > 0 ? "mn-over" : "mn-short"}`}>
              {sumVariance === 0 ? "✓ even" : signedMoney(sumVariance)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mn-card mn-card-deposit">
        <p className="lq-section-label">Deposit</p>
        <p className="mn-sealed-total">{money(dep.totalCents)}</p>
        <p>
          Currency {money(dep.currencyCents)} · Coin {money(dep.coinCents)}
          {dep.checks.length > 0 && <> · Checks {money(dep.checksCents)} ({dep.checks.length})</>}
        </p>
        {dep.checks.length > 0 && (
          <p className="lq-muted">{dep.checks.map((c) => `${c.payer} ${money(c.cents)}`).join(" · ")}</p>
        )}
      </div>

      <button type="button" className="lq-btn lq-btn-primary lq-btn-wide" disabled={busy} onClick={() => void seal()}>
        {busy ? "Sealing…" : "Seal deposit & finish"}
      </button>
    </div>
  );
}
