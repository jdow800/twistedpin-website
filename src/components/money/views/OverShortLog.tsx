import { useEffect, useState } from "react";
import { getMonthlySummary, money, monthlySummaryCsvUrl, REGISTER_LABEL, signedMoney, type MonthlySummaryMonth } from "../api";

/**
 * ADMIN (cash.admin): the CPA over/short log — every closed month, forever.
 * Per-register rows + monthly venue total ($ and % of cash handled), with a
 * one-click CSV download for year-end handoff.
 */
export default function OverShortLog({ onDone }: { onDone: () => void }) {
  const [months, setMonths] = useState<MonthlySummaryMonth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMonthlySummary()
      .then((r) => setMonths(r.months))
      .catch((e) => setError((e as Error).message));
  }, []);

  const monthName = (iso: string) => {
    const [y, m] = iso.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  };

  return (
    <div className="mn-oslog">
      <div className="lq-row-between">
        <h2 className="lq-h2">Over/short log</h2>
        <button type="button" className="lq-btn" onClick={onDone}>← Back</button>
      </div>
      <div className="lq-row-between">
        <p className="lq-muted mn-hint">Closed months, kept forever. Detail rows prune at 365 days — this ledger doesn't.</p>
        <a className="lq-btn" href={monthlySummaryCsvUrl()}>Download CSV</a>
      </div>
      {error && <p className="lq-error">{error}</p>}
      {!months && !error && <p className="lq-muted">Loading…</p>}
      {months && months.length === 0 && (
        <p className="lq-muted">No closed months yet — the first rollup writes on the 1st of next month.</p>
      )}
      {months &&
        months.map((m) => (
          <div key={m.month} className="mn-osmonth">
            <p className="lq-section-label">{monthName(m.month)}</p>
            <table className="mn-table">
              <tbody>
                {m.registers.map((r) => {
                  const v = r.varianceCents ?? 0;
                  const pct =
                    r.expectedCashCents && r.expectedCashCents > 0 ? ((v / r.expectedCashCents) * 100).toFixed(1) : null;
                  return (
                    <tr key={r.registerKey}>
                      <td>{REGISTER_LABEL[r.registerKey as keyof typeof REGISTER_LABEL] ?? r.registerKey}</td>
                      <td className="mn-r">{money(r.expectedCashCents ?? 0)}</td>
                      <td className={`mn-r ${v === 0 ? "mn-even" : v > 0 ? "mn-over" : "mn-short"}`}>
                        {v === 0 ? "✓ even" : `${signedMoney(v)}${pct !== null ? ` (${Math.abs(Number(pct))}%)` : ""}`}
                      </td>
                      <td className="mn-r lq-muted">
                        {r.bagsCounted ?? 0}/{r.bagsExpected ?? 0} · ⚖️ {r.offsettingPairs ?? 0}
                      </td>
                    </tr>
                  );
                })}
                <tr className="mn-total-row">
                  <td>TOTAL</td>
                  <td className="mn-r">{money(m.total.expectedCashCents)}</td>
                  <td className={`mn-r ${m.total.varianceCents === 0 ? "mn-even" : m.total.varianceCents > 0 ? "mn-over" : "mn-short"}`}>
                    {m.total.varianceCents === 0
                      ? "✓ even"
                      : `${signedMoney(m.total.varianceCents)}${m.total.pct != null ? ` (${Math.abs(m.total.pct).toFixed(2)}%)` : ""}`}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
    </div>
  );
}
