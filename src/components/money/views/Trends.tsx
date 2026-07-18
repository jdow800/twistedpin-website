import { useEffect, useState } from "react";
import { getTrends, REGISTER_LABEL, signedMoney, type TrendsResponse } from "../api";

/**
 * ADMIN (cash.admin): Phase 4 attribution trends. Two lenses, both longitudinal
 * signal — never a single-day accusation:
 *   Lens 1 — recurring shortages by who worked the drawer (clustering).
 *   Lens 2 — count-down-error coaching: ⚖️ pairs by who closed the first day.
 */

const WINDOWS = [30, 90, 180, 365] as const;

function regLabel(k: string): string {
  return REGISTER_LABEL[k as keyof typeof REGISTER_LABEL] ?? k;
}

export default function Trends({ onDone }: { onDone: () => void }) {
  const [days, setDays] = useState<number>(90);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    getTrends(days)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [days]);

  return (
    <div className="mn-trends">
      <div className="lq-row-between">
        <h2 className="lq-h2">Attribution trends</h2>
        <button type="button" className="lq-btn" onClick={onDone}>← Back</button>
      </div>

      <div className="mn-trend-windows">
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            className={`lq-pill ${days === w ? "lq-pill-on" : ""}`}
            onClick={() => setDays(w)}
          >
            {w}d
          </button>
        ))}
      </div>

      {error && <p className="lq-error">{error}</p>}
      {!data && !error && <p className="lq-muted">Loading…</p>}

      {data && !data.tokenWired && (
        <p className="lq-muted mn-hint">
          7shifts isn't connected yet — set <code>SEVENSHIFTS_API_KEY</code> on the backend and rosters
          will start stamping. Nothing below can populate until then.
        </p>
      )}

      {data && (
        <>
          <p className="lq-muted mn-hint">
            {data.rosterCoverageDays} day{data.rosterCoverageDays === 1 ? "" : "s"} with a staff roster ·{" "}
            {data.shortageDays} shorted drawer-day{data.shortageDays === 1 ? "" : "s"} in the last {data.windowDays} days.
            This is a pattern-finder, not proof — read it across weeks.
          </p>

          {data.lens1.unmappedRoles.length > 0 && (
            <p className="lq-error mn-hint">
              Unmapped 7shifts roles (not attributed to any drawer — fix the role map):{" "}
              {data.lens1.unmappedRoles.join(", ")}
            </p>
          )}

          {/* ── Lens 1 ─────────────────────────────────────────────────── */}
          <p className="lq-section-label">Unexplained variances — who was working</p>
          <p className="lq-muted mn-hint">
            Drawer-days off by a notable amount (over <em>or</em> short) with no ⚖️ offsetting neighbor.{" "}
            <strong>Index</strong> = their share of those days ÷ their share of all days worked.{" "}
            <strong>~1.0× just means they work a lot</strong> — only a sustained index well above 1 is a
            signal, and it's a place to look, never a conclusion.
          </p>
          {data.lens1.people.length === 0 ? (
            <p className="lq-muted">No flagged drawer-days to correlate in this window. Good sign.</p>
          ) : (
            <table className="mn-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="mn-r">Index</th>
                  <th className="mn-r">Flagged / worked</th>
                  <th className="mn-r">Σ variance</th>
                </tr>
              </thead>
              <tbody>
                {data.lens1.people.map((p) => (
                  <tr key={p.name}>
                    <td>
                      {p.name}
                      <span className="lq-muted">
                        {p.roles.length ? ` · ${p.roles.join("/")}` : ""}
                        {p.registers.length ? ` · ${p.registers.map(regLabel).join(", ")}` : ""}
                      </span>
                    </td>
                    <td className={`mn-r ${p.index != null && p.index >= 1.75 ? "mn-short" : ""}`}>
                      {p.lowSample || p.index == null ? (
                        <span className="lq-muted">low sample</span>
                      ) : (
                        <strong>{p.index.toFixed(2)}×</strong>
                      )}
                    </td>
                    <td className="mn-r lq-muted">
                      {p.shifts}/{p.workedDays} · {Math.round(p.flaggedShare * 100)}% of{" "}
                      {Math.round(p.baselineShare * 100)}%
                    </td>
                    <td className={`mn-r ${p.shortageOnShiftsCents < 0 ? "mn-short" : "mn-over"}`}>
                      {signedMoney(p.shortageOnShiftsCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Lens 2 ─────────────────────────────────────────────────── */}
          <p className="lq-section-label">Count-down errors — coaching</p>
          <p className="lq-muted mn-hint">
            ⚖️ offsetting pairs ({data.lens2.totalPairs} in window) attributed to whoever closed the first
            night — their bank was left wrong and the next day self-corrected. This is a rushing-the-count
            signal, not theft. {data.lens2.unattributedPairs > 0 ? `${data.lens2.unattributedPairs} pair(s) had no roster to attribute.` : ""}
          </p>
          {data.lens2.closers.length === 0 ? (
            <p className="lq-muted">No attributable count-down errors in this window.</p>
          ) : (
            <table className="mn-table">
              <thead>
                <tr>
                  <th>Closer</th>
                  <th className="mn-r">Miscounts</th>
                  <th className="mn-r">Drawers</th>
                </tr>
              </thead>
              <tbody>
                {data.lens2.closers.map((c) => (
                  <tr key={c.name}>
                    <td>
                      {c.name}
                      {c.source === "schedule" ? <span className="lq-muted"> · scheduled</span> : ""}
                    </td>
                    <td className="mn-r">{c.pairs}</td>
                    <td className="mn-r lq-muted">{c.registers.map(regLabel).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="lq-muted mn-hint" style={{ marginTop: 16 }}>
            Totals shown are shortage dollars on shifts worked — a clustering weight, not "what someone
            took." Money Hub never accuses; it points you at where to look.
          </p>
        </>
      )}
    </div>
  );
}
