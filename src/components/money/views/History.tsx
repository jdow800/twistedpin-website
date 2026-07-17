import { useEffect, useState } from "react";
import { getHistory, type HistorySession } from "../api";

/** Past count sessions — when, and how many bags. (No totals here by design.) */
export default function History({ onDone }: { onDone: () => void }) {
  const [sessions, setSessions] = useState<HistorySession[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHistory()
      .then((r) => setSessions(r.sessions))
      .catch((e) => setError((e as Error).message));
  }, []);

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mn-history">
      <div className="lq-row-between">
        <h2 className="lq-h2">Past sessions</h2>
        <button type="button" className="lq-btn" onClick={onDone}>← Back</button>
      </div>
      {error && <p className="lq-error">{error}</p>}
      {!sessions && !error && <p className="lq-muted">Loading…</p>}
      {sessions && sessions.length === 0 && <p className="lq-muted">No finished count sessions yet.</p>}
      {sessions && sessions.length > 0 && (
        <div className="mn-session-list">
          {sessions.map((s) => (
            <div key={s.id} className="mn-session-row">
              <span>{s.submittedAt ? fmt.format(new Date(s.submittedAt)) : "—"}</span>
              <span>{s.bagCount} bag{s.bagCount === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
