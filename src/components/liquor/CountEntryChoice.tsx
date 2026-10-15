import { useEffect, useRef, useState } from "react";
import type { OpenCount } from "./api";

/** The shelves a draft's saved counts are on, in walk order where known:
 *  [{ name: "Walk-In Cooler (Kitchen)", count: 12 }]. Lines and prep batches
 *  both count, as the entry summary does. */
export function draftShelves(draft: { lines: readonly { zoneId: string }[]; batches?: readonly { zoneId: string }[] }, zoneNames: Readonly<Record<string, string>>): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of [...draft.lines, ...(draft.batches ?? [])]) counts.set(row.zoneId, (counts.get(row.zoneId) ?? 0) + 1);
  const order = Object.keys(zoneNames);
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const out: { name: string; count: number }[] = [];
  for (const [id, count] of [...counts].sort(([a], [b]) => rank(a) - rank(b))) {
    const name = zoneNames[id] ?? "a shelf no longer on the walk", same = out.find(s => s.name === name);
    if (same) same.count += count; else out.push({ name, count });
  }
  return out;
}

/** "Start over? The 12 saved counts on Walk-In Cooler (Kitchen) stay in the
 *  old count and won't be submitted." (Jon 2026-10-15: guard Start new count,
 *  so a section-a-day walk stays in one draft.) */
export function startOverQuestion(shelves: { name: string; count: number }[]): string {
  const n = shelves.reduce((total, s) => total + s.count, 0);
  const names = shelves.map(s => s.name);
  const where = names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `Start over? The ${n} saved count${n === 1 ? "" : "s"}${where ? ` on ${where}` : ""} stay${n === 1 ? "s" : ""} in the old count and won't be submitted.`;
}

/** The second ask before a new count leaves the saved ones behind.
 *  "Keep this count" comes first: the question opens where "Start new count"
 *  was tapped, so a double tap lands on Keep (or the question), never on a
 *  second Start (review 2026-10-15: 9 of 9 phone double taps started over).
 *  `busy` holds the start; only `starting` (the start in flight) holds Keep. */
export function StartOverConfirm({ shelves, busy, starting = busy, onConfirm, onKeep, className }: {
  shelves: { name: string; count: number }[]; busy: boolean; starting?: boolean; onConfirm: () => void; onKeep: () => void; className?: string;
}) {
  const question = useRef<HTMLParagraphElement>(null);
  useEffect(() => { question.current?.focus(); }, []);
  return (
    <div className={`lq-start-over${className ? ` ${className}` : ""}`} role="group" aria-label="Start a new count?">
      <p ref={question} tabIndex={-1}>{startOverQuestion(shelves)}</p>
      <div className="lq-start-over-actions">
        <button type="button" className="lq-btn lq-btn-primary" disabled={starting} onClick={onKeep}>Keep this count</button>
        <button type="button" className="lq-btn" disabled={busy} onClick={onConfirm}>{starting ? "Starting new count…" : "Start new count"}</button>
      </div>
    </div>
  );
}

export default function CountEntryChoice({ kind, draft, zoneNames = {}, busy, error, onContinue, onNew, onBack }: {
  kind: "food" | "liquor";
  draft: OpenCount;
  /** Shelf names by id, in walk order, to say where the saved counts are. */
  zoneNames?: Readonly<Record<string, string>>;
  busy: boolean;
  error: string | null;
  onContinue: () => void;
  onNew: () => void;
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { heading.current?.focus(); }, []);
  const entries = draft.lines.length + (draft.batches?.length ?? 0);
  const shelves = draftShelves(draft, zoneNames);
  const started = new Date(draft.startedAt);
  const startedLabel = Number.isFinite(started.getTime()) ? started.toLocaleString("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }) : null;
  const keep = () => { setConfirming(false); requestAnimationFrame(() => continueButton.current?.focus()); };
  return (
    <section className="lq-count-entry" aria-labelledby="count-entry-heading" aria-busy={busy}>
      <h2 id="count-entry-heading" className="lq-h2" ref={heading} tabIndex={-1}>Unfinished {kind} count</h2>
      <p>You have a count that hasn’t been submitted.</p>
      <div className="lq-count-entry-summary">
        {startedLabel && <span>Started {startedLabel}</span>}
        <strong>{entries} saved item count{entries === 1 ? "" : "s"}</strong>
        {shelves.length > 0 && <ul className="lq-count-entry-shelves" aria-label="Shelves in this count">
          {shelves.map(s => <li key={s.name}><span>{s.name}</span> <span className="lq-muted">{s.count} saved</span></li>)}
        </ul>}
      </div>
      <p className="lq-muted">Continue where you left off, or start with empty quantities.</p>
      {error && <p className="lq-error" role="alert">{error}</p>}
      {confirming ? <StartOverConfirm shelves={shelves} busy={busy} onConfirm={onNew} onKeep={keep} /> : (
        <div className="lq-count-entry-actions">
          <button type="button" className="lq-btn lq-btn-primary" ref={continueButton} disabled={busy} onClick={onContinue}>Continue count</button>
          <button type="button" className="lq-btn" disabled={busy} onClick={() => entries > 0 ? setConfirming(true) : onNew()}>{busy ? "Starting new count…" : "Start new count"}</button>
          <button type="button" className="lq-linkbtn" disabled={busy} onClick={onBack}>Back</button>
        </div>
      )}
    </section>
  );
}
