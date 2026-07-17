import { useEffect, useState } from "react";
import { getHistory, money, type HistorySession } from "../api";

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
        <h2 className="lq-h2">Past deposits</h2>
        <button type="button" className="lq-btn" onClick={onDone}>Back</button>
      </div>
      {error && <p className="lq-error">{error}</p>}
      {!sessions && !error && <p className="lq-muted">Loading…</p>}
      {sessions && sessions.length === 0 && <p className="lq-muted">No sealed count sessions yet.</p>}
      {sessions && sessions.length > 0 && (
        <div className="mn-session-list">
          {sessions.map((s) => (
            <div key={s.id} className="mn-session-row">
              <span>{s.submittedAt ? fmt.format(new Date(s.submittedAt)) : "—"}</span>
              <span>
                {s.deposit ? money(s.deposit.totalCents) : "—"}
                {s.deposit && s.deposit.status !== "sealed" && <span className="lq-muted"> · {s.deposit.status}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
