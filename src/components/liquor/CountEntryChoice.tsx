import { useEffect, useRef } from "react";
import type { OpenCount } from "./api";

export default function CountEntryChoice({ kind, draft, busy, error, onContinue, onNew, onBack }: {
  kind: "food" | "liquor";
  draft: OpenCount;
  busy: boolean;
  error: string | null;
  onContinue: () => void;
  onNew: () => void;
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const entries = draft.lines.length + (draft.batches?.length ?? 0);
  const started = new Date(draft.startedAt);
  const startedLabel = Number.isFinite(started.getTime()) ? started.toLocaleString("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }) : null;
  return (
    <section className="lq-count-entry" aria-labelledby="count-entry-heading" aria-busy={busy}>
      <h2 id="count-entry-heading" className="lq-h2" ref={heading} tabIndex={-1}>Unfinished {kind} count</h2>
      <p>You have a count that hasn’t been submitted.</p>
      <div className="lq-count-entry-summary">
        {startedLabel && <span>Started {startedLabel}</span>}
        <strong>{entries} saved item count{entries === 1 ? "" : "s"}</strong>
      </div>
      <p className="lq-muted">Continue where you left off, or start with empty quantities.</p>
      {error && <p className="lq-error" role="alert">{error}</p>}
      <div className="lq-count-entry-actions">
        <button type="button" className="lq-btn lq-btn-primary" disabled={busy} onClick={onContinue}>Continue count</button>
        <button type="button" className="lq-btn" disabled={busy} onClick={onNew}>{busy ? "Starting new count…" : "Start new count"}</button>
        <button type="button" className="lq-linkbtn" disabled={busy} onClick={onBack}>Back</button>
      </div>
    </section>
  );
}
