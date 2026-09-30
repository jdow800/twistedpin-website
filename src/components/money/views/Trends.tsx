import { useEffect, useState } from "react";
import { getTrends, REGISTER_LABEL, signedMoney, type TrendsResponse } from "../api";

// 2026-09-30: count-down RUNS (not pairs), charged to whoever counted the drawer
// down (the bartender for the bar), shown against their closes, plus the run
// list with who else was closing, and people no longer on staff left out.

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

/** "2026-09-21" → "9/21" */
function md(iso: string): string {
  const p = iso.split("-");
  return p.length === 3 ? `${Number(p[1])}/${Number(p[2])}` : iso;
}

function shortRange(a: string, b: string): string {
  return a === b ? md(a) : `${md(a)}–${md(b)}`;
}

/** Old backends reported pairs; 2026-09-30+ reports runs and miss nights. */
function runsCopy(data: TrendsResponse): string {
  if (data.lens2.totalRuns != null) {
    const runs = data.lens2.totalRuns;
    const misses = data.lens2.totalMisses ?? 0;
    return `⚖️ ${runs} count-down run${runs === 1 ? "" : "s"} in the window (${misses} miss night${misses === 1 ? "" : "s"}).`;
  }
  return `⚖️ ${data.lens2.totalPairs ?? 0} offsetting pair(s) in the window.`;
}

function unattributed(data: TrendsResponse): number {
  return data.lens2.unattributedMisses ?? data.lens2.unattributedPairs ?? 0;
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
            Drawer-days off by a notable amount (over <em>or</em> short) that aren't part of a ⚖️ count-down run.{" "}
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
          <p className="lq-section-label">Count-down misses — coaching</p>
          <p className="lq-muted mn-hint">
            {runsCopy(data)} Each miss night is charged to whoever counted that drawer down: the closing
            bartender for the bar, the closing shift lead for the front desk. Shown against how many nights
            they closed it. Every one evened out a night or few later, so this is a counting habit, not
            theft.{" "}
            {unattributed(data) > 0 ? `${unattributed(data)} miss night(s) had no roster to attribute.` : ""}
          </p>
          {data.lens2.closers.length === 0 ? (
            <p className="lq-muted">No attributable count-down misses in this window.</p>
          ) : (
            <table className="mn-table">
              <thead>
                <tr>
                  <th>Closer</th>
                  <th className="mn-r">Misses / closes</th>
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
                    <td className="mn-r">
                      <strong>{c.misses ?? c.pairs ?? 0}</strong>
                      {c.closes != null && <span className="lq-muted"> of {c.closes}</span>}
                    </td>
                    <td className="mn-r lq-muted">
                      {c.byRegister
                        ? Object.entries(c.byRegister)
                            .filter(([, r]) => r.misses > 0)
                            .map(([k, r]) => `${regLabel(k)} ${r.misses}/${r.closes}`)
                            .join(", ")
                        : c.registers.map(regLabel).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(data.lens2.incidents?.length ?? 0) > 0 && (
            <>
              <p className="lq-section-label">Count-down runs — who was closing</p>
              <p className="lq-muted mn-hint">
                Each run, newest first: the nights the drawer was off and who counted it down. On bar nights the
                shift lead who closed the building is shown too, so overlaps are easy to spot.
              </p>
              <table className="mn-table">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Miss nights</th>
                    <th className="mn-r">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lens2.incidents!.map((inc) => (
                    <tr key={`${inc.registerKey}-${inc.nights[0]}`}>
                      <td>
                        {regLabel(inc.registerKey)} {shortRange(inc.nights[0]!, inc.fixedOn)}
                        <span className="lq-muted"> · evened out {md(inc.fixedOn)}</span>
                      </td>
                      <td>
                        {inc.detail
                          .filter((n) => n.role === "miss")
                          .map((n) => (
                            <div key={n.salesDate}>
                              {md(n.salesDate)} {signedMoney(n.varianceCents)} · {n.closer ?? (n.closerLeft ? "no longer on staff" : "no roster")}
                              {n.alsoClosing && <span className="lq-muted"> (closing: {n.alsoClosing})</span>}
                            </div>
                          ))}
                      </td>
                      <td className="mn-r lq-muted">{signedMoney(inc.netCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {(data.leftOut?.length ?? 0) > 0 && (
            <p className="lq-muted mn-hint" style={{ marginTop: 12 }}>
              Left out, no longer on staff{data.staffSource === "rosters" ? " (not on any roster in 30 days)" : " (inactive in 7shifts)"}:{" "}
              {data.leftOut!.join(", ")}.
            </p>
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
