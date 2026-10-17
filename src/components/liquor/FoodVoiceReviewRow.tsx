import { useId, useState } from "react";
import type { BarSkuItem } from "./api";
import FoodNumberInput from "./FoodNumberInput";
import { foodSearchMatch } from "./FoodReviewCountRow";
import { foodHeardAmount, foodQuantityFieldsToConfirm, foodReadingAmount, foodRestateAmount, foodReviewQuantity, foodUnitLabel, foodUnitSizeAnswered, foodUnitSizeQuestion, type FoodReviewItem } from "./food-voice-review";
import { formatQty } from "./quantity";
import FoodCountRecovery, { type FoodCountChoice } from "./FoodCountRecovery";

export default function FoodVoiceReviewRow({ item: r, sku, catalog, ready, concern, blockedReason, onEdit, onChoose, onQuantity, onUnit, onCaseSize, onDiscard, enteredCounts, countLocation, onUseEntered, restate, onRestate }: {
  item: FoodReviewItem; sku: BarSkuItem | undefined; catalog: BarSkuItem[]; ready: boolean; concern: string | null;
  blockedReason?: string;
  onEdit: (patch: Partial<FoodReviewItem>) => void;
  /** `suggested`: one of the row's own suggested products, not a search pick. */
  onChoose: (id: string, suggested?: boolean) => void;
  onQuantity: (field: "cases" | "units", raw: string, replacesAll: boolean) => void;
  onUnit: () => void; onCaseSize: (n: number) => void; onDiscard: () => void;
  enteredCounts?: FoodCountChoice[]; countLocation?: string;
  onUseEntered?: (choice: FoodCountChoice) => boolean;
  /** The shelf already holds this product: Jon's "Ask: add or replace"
   *  (2026-10-09). `answer` is set once answered for this `before`. */
  restate?: { before: number; answer?: "add" | "replace" } | null;
  onRestate?: (answer: "add" | "replace" | undefined) => void;
}) {
  const [productOpen, setProductOpen] = useState(false);
  const [countMode, setCountMode] = useState<"auto" | "single" | "mixed">("auto");
  const q = foodReviewQuantity(r, sku);
  // "How many lb in one bag?" and, once answered, what was answered.
  const sizeAsk = sku && r.spokenUnit && (q.needsUnitSize || foodUnitSizeAnswered(r, sku)) ? foodUnitSizeQuestion(sku, r.spokenUnit) : null;
  const sizeId = useId();
  const [sizeNote, setSizeNote] = useState("");
  const fields = foodQuantityFieldsToConfirm(r);
  const explicitMixed = r.quantityKnown && !r.quantityNeedsReview && q.inputUnit !== "case"
    && (r.cases > 0 && r.units > 0 || !!r.spokenUnit && /\bcases?\b/i.test(r.quantityWords || r.spoken));
  const singleCases = !r.unitNeedsReview && (sku?.countUnit === "case" && !q.inputUnit || q.inputUnit === "case"
    || r.cases > 0 && r.units === 0 && !r.spokenUnit && !explicitMixed);
  const canonicalCaseBasis = sku?.countUnit === "case" && !r.unitNeedsReview && (!q.inputUnit || q.inputUnit === "case");
  const mixed = !canonicalCaseBasis && (countMode === "mixed" || countMode === "auto" && explicitMixed);
  const looseLabel = q.inputUnit === sku?.countUnit ? foodUnitLabel(sku, 2) : q.inputUnit || foodUnitLabel(sku, 2);
  const unit = singleCases && !mixed ? "Cases" : r.unitNeedsReview || q.needsUnitChoice ? "Quantity" : looseLabel;
  const held = !!fields.length || !!r.quantityNeedsReview || !r.quantityKnown;
  // The conversion can be said back: the number is settled and nothing else is being asked.
  const readbackOk = !fields.includes("units") && !r.invalidQuantityFields?.includes("units") && !r.unitNeedsReview && !q.needsUnitSize
    && !q.needsUnitChoice && !q.catalogConflict && Number.isFinite(r.units) && r.units >= 0;
  const caseBreakdown = q.ready && q.cases > 0 && q.caseSize != null && sku?.countUnit !== "case"
    ? `${formatQty(q.cases)} ${q.cases === 1 ? "case" : "cases"} × ${formatQty(q.caseSize)} ${foodUnitLabel(sku, q.caseSize)}`
      + (q.units > 0 ? ` + ${formatQty(q.units)} ${foodUnitLabel(sku, q.units)}` : "")
      + ` = ${formatQty(q.qty)} ${foodUnitLabel(sku, q.qty)}`
    : null;
  const quantityHint = r.quantityReviewReason === "source_revised" ? "You corrected this item. Discard it or enter a separate count."
    : r.quantityReviewReason === "unquantified_remainder" ? `Enter a total number${unit === "Quantity" ? "" : ` in ${unit.toLowerCase()}`}, including the extra.`
    : r.quantityReviewReason === "source_already_used" ? "Source already counted. Discard or enter a separate count."
    : r.quantityReviewReason === "source_not_returned" ? "Heard in your recording. Enter the count for this item."
    // Either box alone is enough once it holds more than 0 (2026-10-17).
    : mixed ? fields.length > 1 && !r.invalidQuantityFields?.length ? "Fill in either box, or both." : "Enter both counts; use 0 for none."
    : `Enter the count${unit === "Quantity" ? "" : ` in ${unit.toLowerCase()}`}.`;
  // The reading "Use N cases" turned down, while the row still holds those N cases.
  const back = r.declinedReading && !r.unitReading && q.cases === r.declinedReading.n && q.units === 0 ? r.declinedReading : undefined;
  const hits = r.search?.trim() ? catalog.filter(s => foodSearchMatch(s, r.search!)).slice(0, 8) : [];
  const pick = (id: string, suggested = false) => { onChoose(id, suggested); setProductOpen(false); setCountMode("auto"); };
  // Jon 2026-10-15: a suggested product shows the amount the recording proved
  // for it, the amount a tap will fill in ("Sauce, Parmesan, Garlic · 4
  // containers"), read through the same rules the row saves with. Not once
  // the counter has typed a number here: that number is theirs.
  const heardFor = (id: string) => !r.typedAmount && r.ifChosen?.[id] ? foodHeardAmount(r, r.ifChosen[id], catalog.find(s => s.id === id)) : null;
  const candidateChip = (c: { id: string; name: string }) => {
    const heard = heardFor(c.id);
    return <button key={c.id} type="button" className="lq-chip" onClick={() => pick(c.id, true)}>{heard ? `${c.name} · ${heard.words}` : c.name}</button>;
  };
  // After a tapped suggestion, the other suggestions stay one tap away in
  // "Change product" while its search box is empty. Once a search is typed
  // the panel lists only the search hits, as plain names, and a pick there
  // asks, before a tap or after it (Jon 2026-10-15: "'Find product…' picks
  // still ask"; review 2026-10-15: a search hit shown as a suggestion filled).
  const panelSuggestions = sku && r.ifChosen && !r.search?.trim() ? r.candidates.filter(c => c.id !== sku.id) : [];
  const anotherWay = () => {
    if (mixed) {
      // A single answer replaces the whole count. Do not guess a reverse
      // conversion or let one old mixed component remain hidden and counted.
      onEdit({ quantityKnown: false, quantityNeedsReview: true, unconfirmedQuantityFields: ["cases", "units"], zeroFilled: undefined });
      setCountMode("single");
    } else {
      if (singleCases && !r.unitNeedsReview && !q.needsUnitChoice) onEdit({ cases: r.cases + r.units, units: 0,
        spokenUnit: sku?.countUnit ?? "each", unitMultiplier: 1, unitChoiceConfirmed: true,
        unconfirmedQuantityFields: fields });
      setCountMode("mixed");
    }
  };
  return <div className={`lq-fc-rev-row lq-fc-voice-review-row${ready ? "" : " lq-fc-rev-row-block"}`}>
    <span className="lq-fc-rev-spoken">“{r.spoken}”</span>
    {sku ? <button type="button" className="lq-chip lq-chip-on lq-rev-chosen lq-fc-rev-match"
      aria-label={`Change product: ${sku.name}`} aria-expanded={productOpen} onClick={() => setProductOpen(!productOpen)}>✓ {sku.name}</button>
      : <div className="lq-rev-choices lq-fc-rev-pick">
        <span className="lq-muted">Choose product</span>
        {r.candidates.map(candidateChip)}
        <button type="button" className="lq-chip" onClick={() => setProductOpen(!productOpen)} aria-expanded={productOpen}>Find product…</button>
      </div>}
    {productOpen && <div className="lq-rev-assign lq-fc-rev-product">
      <input type="search" className="lq-search" aria-label={`Find product for ${r.spoken}`} placeholder="Search the food catalog…"
        value={r.search ?? ""} onChange={e => onEdit({ search: e.target.value })} />
      {panelSuggestions.map(candidateChip)}
      {hits.map(s => <button key={s.id} type="button" className="lq-chip" onClick={() => pick(s.id)}>{s.name}</button>)}
      {r.search?.trim() && hits.length === 0 && <span className="lq-muted">No product on file. Try another name.</span>}
    </div>}
    {!ready && !!enteredCounts?.length && onUseEntered && <FoodCountRecovery choices={enteredCounts}
      location={countLocation ?? "this location"} onResolve={onUseEntered} />}
    {sku && <>
      <div className="lq-fc-rev-quantities">
        {mixed ? <>
          <label>Cases<FoodNumberInput type="number" min={0} step="any" inputMode="decimal" placeholder="Qty"
            aria-label={`Cases for ${sku.name}`} value={!fields.includes("cases") ? r.cases : undefined}
            aria-invalid={r.invalidQuantityFields?.includes("cases") || undefined} onRaw={raw => onQuantity("cases", raw, false)} /></label>
          <label>{unit}<FoodNumberInput type="number" min={0} step="any" inputMode="decimal" placeholder="Qty"
            aria-label={`Loose quantity for ${sku.name}`} value={!fields.includes("units") ? r.units : undefined}
            aria-invalid={r.invalidQuantityFields?.includes("units") || undefined} onRaw={raw => onQuantity("units", raw, false)} /></label>
        </> : <label>{unit}<FoodNumberInput className="lq-qty-input" type="number" min={0} step="any" inputMode="decimal" placeholder="Qty"
          aria-label={`${singleCases ? "Cases" : "Loose quantity"} for ${sku.name}`}
          value={!held ? singleCases ? r.cases + r.units : r.units : undefined}
          aria-invalid={!!r.invalidQuantityFields?.length || undefined}
          onRaw={raw => onQuantity(singleCases ? "cases" : "units", raw, true)} /></label>}
      </div>
      {caseBreakdown && <span className="lq-muted lq-rev-hint lq-fc-rev-case-breakdown">{caseBreakdown}</span>}
      {/* The server read a bare number as pieces because the case reading is
          more than we have ever had (2026-10-10). Its reason, and one tap back
          to cases; the history warning then asks before cases are added. */}
      {r.unitReading && (() => {
        const reading = r.unitReading, n = reading.n;
        return <span className="lq-muted lq-rev-hint lq-fc-rev-reading" role="status">{reading.reason}{" "}
          <button type="button" className="lq-linkbtn" onClick={() => onEdit({ cases: n, units: 0, spokenUnit: null,
            unitChoiceConfirmed: true, unitReading: undefined, declinedReading: reading })}>Use {formatQty(n)} {n === 1 ? "case" : "cases"}</button>
        </span>;
      })()}
      {held && <span className="lq-error lq-rev-hint">{quantityHint}</span>}
      {!!r.invalidQuantityFields?.length && <span className="lq-error lq-rev-hint">Use a number of 0 or more.</span>}
      {q.needsCaseSize && <div className="lq-fc-rev-ask"><label>{foodUnitLabel(sku, 2)} per case?
        <input type="number" min={1} max={10000} inputMode="numeric" aria-label={`Units per case for ${sku.name}`}
          onKeyDown={e => { if (e.key === "Enter") onCaseSize(Number((e.target as HTMLInputElement).value)); }}
          onBlur={e => onCaseSize(Number(e.target.value))} /></label></div>}
      {q.needsUnitChoice && <div className="lq-fc-rev-ask">
        <>
          <span>Which unit?</span>
          <button type="button" className="lq-chip" onClick={() => onEdit({ cases: r.cases + r.units, units: 0, spokenUnit: null, unitMultiplier: undefined, unitNeedsReview: false, unitChoiceConfirmed: true })}>{held ? "Cases" : `${formatQty(r.units)} cases`}</button>
          {sku.countUnit !== "case" && <button type="button" className="lq-chip" onClick={() => onEdit({ spokenUnit: sku.countUnit ?? "each", unitMultiplier: 1, unitNeedsReview: false, unitChoiceConfirmed: true })}>{held ? foodUnitLabel(sku, 2) : `${formatQty(r.units)} ${foodUnitLabel(sku, r.units)}`}</button>}
          {r.unitNeedsReview && <><label>Another unit<input type="text" maxLength={32} aria-label={`Spoken unit for ${sku.name}`} placeholder="bag or tray"
            value={r.unitDraft ?? ""} onChange={e => onEdit({ unitDraft: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter" && r.unitDraft?.trim()) { e.preventDefault(); onUnit(); } }} /></label>
            <button type="button" className="lq-linkbtn" disabled={!r.unitDraft?.trim()} onClick={onUnit}>Use unit</button></>}
        </>
      </div>}
      {q.needsUnitSize && sizeAsk && <div className="lq-fc-rev-ask"><label><span id={`${sizeId}-q`}>{sizeAsk.question}</span>
        <input type="number" min={sizeAsk.minimum} max={10000} step="any" inputMode="decimal" aria-label={`Package size for ${sku.name}`}
          aria-describedby={`${sizeId}-q${sizeAsk.example ? ` ${sizeId}-e` : ""}${sizeNote ? ` ${sizeId}-n` : ""}`} aria-invalid={!!sizeNote || undefined}
          onBlur={e => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n) || n <= 0 || n > 10000) return;
            // A package holds at least one of what is counted in it: 0.2 is the other way round.
            if (n < sizeAsk.minimum) { setSizeNote(`Enter ${sizeAsk.minimum} or more.`); return; }
            setSizeNote("");
            onEdit({ unitMultiplier: sizeAsk.multiplier(n) });
          }}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>
        {sizeAsk.example && <span id={`${sizeId}-e`} className="lq-muted lq-rev-hint">{sizeAsk.example}</span>}
        {sizeNote && <span id={`${sizeId}-n`} className="lq-error lq-rev-hint" role="status">{sizeNote}</span>}</div>}
      {readbackOk && q.unitFromMeasure && <span className="lq-muted lq-rev-hint">{formatQty(r.units)} {r.spokenUnit} = {formatQty(q.units)} {foodUnitLabel(sku, q.units)}</span>}
      {r.unitMultiplier != null && <span className="lq-muted">{readbackOk && <>{formatQty(r.units)} {r.spokenUnit} = {formatQty(q.units)} {foodUnitLabel(sku, q.units)}{sizeAsk && ` (${sizeAsk.said(r.unitMultiplier)})`} </>}<button type="button" className="lq-linkbtn" onClick={() => { setSizeNote(""); onEdit({ unitMultiplier: undefined }); }}>Change package size</button></span>}
      {q.catalogConflict && <span className="lq-error">Correct this product’s case unit before adding.</span>}
      {blockedReason && <span className="lq-error" role="status">{blockedReason}</span>}
      {/* Re-recorded shelf or a repeat mention: the number is never added
          onto what is already here until the counter says which it is. */}
      {restate && q.ready && onRestate && (() => {
        const amount = (n: number) => foodRestateAmount(sku, q, n);
        const total = restate.before + q.qty;
        return restate.answer ? <span className="lq-muted lq-rev-hint lq-fc-rev-restated">
          {restate.answer === "replace" ? `Replaces the ${amount(restate.before)} already here.` : `Adds to the ${amount(restate.before)} already here: ${amount(total)} total.`}{" "}
          <button type="button" className="lq-linkbtn" onClick={() => onRestate(undefined)}>Change</button>
        </span> : <div className="lq-fc-rev-ask lq-fc-rev-restate" role="group" aria-label={`Add or replace ${sku.name}`}>
          <span>Add to the {amount(restate.before)} already here, or replace?</span>
          <div className="lq-rev-choices">
            <button type="button" className="lq-chip" onClick={() => onRestate("add")}>Add: {amount(total)} total</button>
            <button type="button" className="lq-chip" onClick={() => onRestate("replace")}>Replace: {amount(q.qty)}</button>
          </div>
        </div>;
      })()}
      {concern && r.largeCountConfirmed !== concern && <div className="lq-fc-rev-ask" role="status"><span>{concern}</span>
        {/* After "Use N cases" the way back is the reading itself, with its
            reason, on every product, including one counted in cases (pizza
            dough: "Use 30 dough"), which has no "Use N <unit>" of its own. */}
        {back ? <button type="button" className="lq-linkbtn" onClick={() => onEdit({ cases: 0, units: back.n, spokenUnit: back.noun,
            unitMultiplier: undefined, unitNeedsReview: false, unitChoiceConfirmed: true, unitReading: back, declinedReading: undefined })}>Use {foodReadingAmount(back)}</button>
          : q.cases > 0 && q.units === 0 && sku.countUnit !== "case" && <button type="button" className="lq-linkbtn"
          onClick={() => onEdit({ units: q.cases, cases: 0, spokenUnit: sku.countUnit ?? null, unitChoiceConfirmed: true, unitMultiplier: undefined })}>Use {q.cases} {foodUnitLabel(sku, q.cases)}</button>}
        <button type="button" className="lq-linkbtn" onClick={() => onEdit({ largeCountConfirmed: concern })}>Keep as entered</button></div>}
    </>}
    <div className="lq-fc-voice-actions">
      {sku && !canonicalCaseBasis && <button type="button" className="lq-linkbtn" onClick={anotherWay}>{mixed ? "Use one count" : "Count another way"}</button>}
      <button type="button" className="lq-linkbtn" onClick={onDiscard}>Discard item</button>
    </div>
  </div>;
}
