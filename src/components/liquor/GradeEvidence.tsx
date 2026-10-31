import { useState } from "react";
import type { DiscardSummary, GradeDetailResponse, GradeEvidenceLine, GradeLocation, RisataEvidence } from "./api";

const number = (n: number | null, digits = 1) => n == null || !Number.isFinite(n)
  ? "Unavailable" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
const oz = (n: number | null) => n == null ? "Unavailable" : `${number(n)} oz`;
const money = (n: number | null) => n == null || !Number.isFinite(n)
  ? "Unavailable" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Count timestamps are instants; model day labels are already venue-local dates. */
export function gradeDate(value: string, includeTime = false): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric",
    ...(includeTime && !dateOnly ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" } as const : {}),
  });
}

export function rankedGradeLines(lines: GradeEvidenceLine[]): GradeEvidenceLine[] {
  return [...lines].sort((a, b) => Math.abs(b.missingCost ?? 0) - Math.abs(a.missingCost ?? 0)
    || a.name.localeCompare(b.name));
}

const STATUS = {
  graded: "Included in grade", drift: "Parked · count drift", found: "Parked · found stock", excluded: "Excluded · incomplete data",
};

function Locations({ title, locations, batchOz }: { title: string; locations: GradeLocation[]; batchOz: number }) {
  return <div className="lq-grade-evidence-group">
    <h5>{title}</h5>
    {locations.length ? <ul>{locations.map((l, i) => <li key={`${l.skuId}:${l.zoneName}:${i}`}>
      <strong>{l.zoneName}</strong> · {number(l.bottles, 3)} bottles
      <span className="lq-muted"> · {l.skuName} · {l.source === "correction" ? "corrected count" : l.source}</span>
    </li>)}</ul> : <p className="lq-muted">No count location recorded.</p>}
    {batchOz !== 0 && <p>In prepared batches: {oz(batchOz)}</p>}
  </div>;
}

function EvidenceLine({ line, wholeBottleGap }: { line: GradeEvidenceLine; wholeBottleGap: boolean }) {
  const shortage = line.lossOz > 0;
  return <details className="lq-grade-line">
    <summary>
      <div className="lq-grade-line-title">
        <strong>{line.name}</strong>
        <span className={shortage ? "lq-grade-short" : "lq-grade-surplus"}>
          {money(line.missingCost == null ? null : Math.abs(line.missingCost))}
          <small>{line.lossOz === 0 ? "balanced" : shortage ? "short at cost" : "excess attribution"}</small>
        </span>
      </div>
      <div className="lq-grade-line-meta">
        {oz(Math.abs(line.lossOz))} {shortage ? "used beyond sales" : line.lossOz === 0 ? "difference" : "sales beyond use"}
        <span>{STATUS[line.status]}{wholeBottleGap ? " · Whole-bottle review" : ""}</span>
      </div>
      <span className="lq-grade-open">Counts, receipts &amp; sales</span>
    </summary>
    <div className="lq-grade-line-body">
      <dl className="lq-grade-math">
        <div><dt>Opening</dt><dd>{oz(line.startOz)}</dd></div>
        <div><dt>+ Receipts</dt><dd>{oz(line.purchasedOz)}</dd></div>
        <div><dt>− Ending</dt><dd>{oz(line.endOz)}</dd></div>
        <div><dt>= Used</dt><dd>{oz(line.usedOz)}</dd></div>
        <div><dt>− Sales / recipes</dt><dd>{oz(line.soldOz)}</dd></div>
        <div><dt>= Difference</dt><dd>{oz(line.lossOz)}</dd></div>
      </dl>
      <p className="lq-muted">Inventory cost: {money(line.costPerOz)} / oz. The full difference stays visible even when a possible substitution is flagged.</p>
      {line.flags.length > 0 && <p className="lq-grade-note">Data flags: {line.flags.map(f => f.replaceAll("_", " ")).join(", ")}</p>}
      <Locations title="Opening count by location" locations={line.openingLocations} batchOz={line.batchOpeningOz} />
      <div className="lq-grade-evidence-group">
        <h5>Receipts</h5>
        {line.receipts.length ? <ul>{line.receipts.map((r, i) => <li key={`${r.invoiceId}:${r.skuId}:${i}`}>
          <a href={`?view=invoices&invoice=${encodeURIComponent(r.invoiceId)}`}>{r.vendor || "Vendor"}{r.invoiceNumber ? ` · ${r.invoiceNumber}` : " · View invoice"}</a>
          {" · "}{gradeDate(r.at)} · {number(r.bottles, 3)} bottles
        </li>)}</ul> : <p className="lq-muted">No receipts in this window.</p>}
      </div>
      <Locations title="Ending count by location" locations={line.closingLocations} batchOz={line.batchClosingOz} />
      <div className="lq-grade-evidence-group">
        <h5>Sales and recipe attribution</h5>
        {line.sales.length ? <ul>{line.sales.map((s, i) => <li key={`${s.productId}:${i}`}>
          <strong>{s.name}</strong> · {number(s.quantity, 3)} rung · {oz(s.attributedOz)} attributed
          {s.recipe.length > 0 && <p className="lq-muted">Recipe: {s.recipe.map(r => `${r.name} ${number(r.oz)} oz`).join("; ")}</p>}
          {s.options.length > 0 && <p className="lq-muted">Options: {s.options.map(o => `${o.label} × ${number(o.quantity, 3)}`).join("; ")}</p>}
        </li>)}</ul> : <p className="lq-muted">No linked sales attributed in this window. Check POS links and recipes before drawing a conclusion about pours.</p>}
      </div>
    </div>
  </details>;
}

function DiscardDays({ model, label }: { model: DiscardSummary; label: string }) {
  return <details className="lq-grade-model-days">
    <summary>{label} · {model.coveredDays} covered day{model.coveredDays === 1 ? "" : "s"}{model.skippedDays ? ` · ${model.skippedDays} not modeled` : ""}</summary>
    <p className="lq-muted">{gradeDate(model.start, true)} – {gradeDate(model.end, true)} · {model.status.replaceAll("_", " ")}. Days without enough evidence stay unmodeled.</p>
    {model.days.length ? <ul className="lq-grade-days">{model.days.map(d => <li key={d.date}>
      <strong>{gradeDate(d.date)}</strong>
      <span>{oz(d.servedOz)} served · {number(d.openedBottles)} opened · {oz(d.expectedDiscardOz)} expected discard</span>
      {(d.reason || !["modeled", "covered"].includes(d.status)) && <span className="lq-muted">{d.reason || d.status.replaceAll("_", " ")}</span>}
    </li>)}</ul> : <p className="lq-muted">No daily model available.</p>}
  </details>;
}

function RisataModel({ evidence }: { evidence: RisataEvidence }) {
  const partialMonth = evidence.month != null && (evidence.month.status !== "complete" || evidence.month.skippedDays > 0);
  const coveredMonthDays = (evidence.month?.days ?? []).filter(d => ["covered", "modeled"].includes(d.status)).map(d => d.date).sort();
  return <section className="lq-grade-section" aria-label="Risata expected discard">
    <h4>Risata · expected discard</h4>
    <p>{evidence.message}</p>
    <dl className="lq-grade-math">
      <div><dt>Inventory used</dt><dd>{oz(evidence.observedUsedOz)}</dd></div>
      <div><dt>Sales / recipes</dt><dd>{oz(evidence.servedOz)}</dd></div>
      <div><dt>Expected discard</dt><dd>{oz(evidence.expectedDiscardOz)}</dd></div>
      <div><dt>Remaining difference</dt><dd>{oz(evidence.residualOz)}</dd></div>
    </dl>
    {evidence.residualCost != null && <p>Remaining difference at cost: {money(evidence.residualCost)}</p>}
    {evidence.period && evidence.period.status !== "complete" && evidence.period.expectedDiscardOz != null && <p className="lq-grade-note">
      <strong>Covered days only:</strong> {oz(evidence.period.expectedDiscardOz)} expected discard from {number(evidence.period.openedBottles)} opened bottles across {evidence.period.coveredDays} days. The full window is incomplete, so this subtotal is not deducted from its inventory difference.
    </p>}
    <p className="lq-muted">This estimates the leftover wine discarded after service; it is not a recorded waste count. The financial grade above and physical recipe quantities are unchanged.</p>
    {evidence.period && <DiscardDays model={evidence.period} label="Daily evidence for this grade window" />}
    {evidence.month && <div className="lq-grade-month">
      <h5>Shared Risata cost per served oz{partialMonth ? " · partial estimate" : ""}</h5>
      <p>{coveredMonthDays.length ? `Fiscal days ${gradeDate(coveredMonthDays[0])} – ${gradeDate(coveredMonthDays[coveredMonthDays.length - 1])}` : "No covered fiscal days"}</p>
      {partialMonth && <p className="lq-grade-note"><strong>Incomplete monthly coverage.</strong> {evidence.month.coveredDays} day{evidence.month.coveredDays === 1 ? "" : "s"} modeled{evidence.month.skippedDays > 0 ? `; ${evidence.month.skippedDays} not modeled` : ""}. This cost describes covered days only.</p>}
      <p className="lq-grade-cost">{money(evidence.month.effectiveCostPerOz)} <span>/ served oz, including modeled discard</span></p>
      <p className="lq-muted">Monthly weighted cost across all linked recipes and measured pours on covered days: {money(evidence.month.poolCost)} for {oz(evidence.month.servedOz)} served. This is the shared ingredient cost, not a single cocktail's cost.</p>
      <DiscardDays model={evidence.month} label="Monthly daily evidence" />
    </div>}
  </section>;
}

export function GradeEvidence({ detail }: { detail: GradeDetailResponse }) {
  const [showAll, setShowAll] = useState(false);
  const snapshot = detail.status === "frozen" ? detail.snapshot : null;
  const published = snapshot ?? detail.published;
  const laterCorrections = detail.corrections.filter(c => c.afterPublication);
  const endingCorrected = laterCorrections.some(c => !snapshot || c.sessionId === snapshot.endingCountId);
  const lines = rankedGradeLines(snapshot?.lines ?? []);
  const visibleLines = showAll ? lines : lines.slice(0, 8);

  return <section className="lq-grade" aria-labelledby="lq-grade-title">
    <div className="lq-grade-heading">
      <div><h3 id="lq-grade-title">{published ? "Published bar grade" : "Bar grade evidence"}</h3>
        {published && <p>{gradeDate(published.windowStart)} – {gradeDate(published.windowEnd)} · {published.windowDays} days</p>}
      </div>
      {published && <strong className="lq-grade-score">{published.letter || "—"}<span>{published.gradePct == null ? "Unavailable" : `${number(published.gradePct)}%`}</span></strong>}
    </div>
    {published && <p>Net difference at inventory cost: <strong>{money(published.netMissingCost)}</strong> · {published.counterName ? `Counted by ${published.counterName}` : "Counter not recorded"}</p>}
    {published && <p className="lq-muted">Published basis saved {gradeDate(published.capturedAt, true)}.</p>}
    {detail.message && <p className="lq-grade-note">{detail.message}</p>}
    {!snapshot && <p className="lq-grade-note">{published ? "Matching per-product evidence for this published grade is unavailable." : "No published grade evidence is available for this count."} The count-to-count report below is a separate comparison and may cover a shorter window.</p>}
    {laterCorrections.length > 0 && <div className="lq-grade-note" role="note">
      <strong>Counts changed after publication</strong>
      <p>The published report keeps its original basis. {endingCorrected ? "Current ending-count rows below include later corrections." : "Review the opening-count corrections separately below."}</p>
      <details><summary>Review {laterCorrections.length} correction{laterCorrections.length === 1 ? "" : "s"}</summary>
        {laterCorrections.map((c, i) => <div className="lq-grade-correction" key={`${c.sessionId}:${c.at}:${i}`}>
          <p><a href={`?view=counts&count=${encodeURIComponent(c.sessionId)}`}>{snapshot && c.sessionId === snapshot.openingCountId ? `Opening count · ${gradeDate(snapshot.windowStart)}` : snapshot && c.sessionId === snapshot.endingCountId ? `Ending count · ${gradeDate(snapshot.windowEnd)}` : "This count"}</a></p>
          <p><strong>{gradeDate(c.at, true)}</strong>{c.by ? ` · ${c.by}` : ""} · {c.reason}</p>
          <ul>{c.changes.map((change, j) => <li key={j}>{change.skuName} · {change.zoneName}: {number(change.before, 3)} → {number(change.after, 3)} bottles</li>)}</ul>
        </div>)}
      </details>
    </div>}
    {snapshot && <>
      <details className="lq-grade-method">
        <summary>How this grade is calculated</summary>
        <p>Recorded sales and recipe ounces are valued at inventory cost, then compared with inventory used within each liquor class. Credited sales are capped at 1.5× used cost per class. Parked and excluded products stay visible below.</p>
        <ul className="lq-grade-classes">{snapshot.graded.classes.map(c => <li key={c.className}>
          <strong>{c.className}</strong><span>{money(c.usedDollars)} used · {money(c.soldDollars)} sales attributed · {money(-c.netDollars)} net difference</span>
        </li>)}</ul>
        {snapshot.caveats.length > 0 && <ul>{snapshot.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>}
      </details>
      <section className="lq-grade-section" aria-label="Product differences">
        <h4>Follow the dollars</h4>
        <p className="lq-muted">Largest differences first, including parked and excluded products. Open a product for the counts, receipts and sales behind it.</p>
        {visibleLines.map(line => <EvidenceLine key={line.skuId} line={line} wholeBottleGap={snapshot.graded.wholeBottleGaps.some(g => g.skuId === line.skuId)} />)}
        {lines.length === 0 && <p className="lq-muted">No product evidence in this snapshot.</p>}
        {lines.length > 8 && <button type="button" className="lq-btn lq-btn-ghost lq-grade-more" onClick={() => setShowAll(v => !v)}>{showAll ? "Show largest 8" : `Show all ${lines.length} products`}</button>}
      </section>
      {snapshot.graded.swaps.length > 0 && <section className="lq-grade-section" aria-label="Possible substitutions">
        <h4>Possible substitution or ring-in mismatch</h4>
        <p className="lq-muted">Opposing differences are review leads. Recheck counts, recipes and POS links before treating a pair as a verified pour.</p>
        <ul className="lq-grade-swaps">{snapshot.graded.swaps.map((s, i) => <li key={i}>
          <strong>{s.overName}</strong> has more use than sales; <strong>{s.underName}</strong> has more sales than use.
          <span>{oz(s.matchedOz)} potentially overlaps · {money(s.dollarDelta)} difference on matched ounces · {s.className}</span>
        </li>)}</ul>
      </section>}
      {snapshot.risata && <RisataModel evidence={snapshot.risata} />}
    </>}
  </section>;
}
