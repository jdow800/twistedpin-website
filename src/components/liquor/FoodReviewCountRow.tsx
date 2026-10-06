import { useState } from "react";
import type { BarSkuItem } from "./api";
import FoodNumberInput from "./FoodNumberInput";
import { compatibleFoodUnits, foodCellQty, readFoodNumber, type FoodCell } from "./food-count-edit";
import { foodCasesOnly, foodCaseSize, foodUnitLabel } from "./food-voice-review";
import { formatQty } from "./quantity";

export function foodSearchMatch(sku: BarSkuItem, query: string): boolean {
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const text = normalize(`${sku.name} ${(sku.aliases ?? []).join(" ")} ${foodUnitLabel(sku, 2)}`);
  return terms.length ? terms.every((part) => text.includes(part)) : !query.trim();
}

export default function FoodReviewCountRow({ zid, sku, cell, shelf, catalog, existing, disabled, quantitiesDisabled, onEdit, onNone, onChangeItem }: {
  zid: string; sku: BarSkuItem; cell: FoodCell; shelf: string; catalog: BarSkuItem[]; existing: Record<string, FoodCell>;
  disabled: boolean; quantitiesDisabled: boolean; onEdit: (field: "cases" | "units" | "packs", raw: string) => void;
  onNone: () => void; onChangeItem: (id: string, mode: "move" | "add" | "replace", amount?: FoodCell) => void;
}) {
  const [changing, setChanging] = useState(false), [query, setQuery] = useState(""), [targetId, setTargetId] = useState(""), [amount, setAmount] = useState("");
  const target = catalog.find((s) => s.id === targetId), targetCell = existing[targetId];
  const casesOnly = foodCasesOnly(sku), caseSize = cell.caseSize ?? foodCaseSize(sku);
  const compatible = !!target && compatibleFoodUnits(sku, target);
  const replacementSize = targetCell?.caseSize ?? foodCaseSize(target);
  const n = readFoodNumber(amount);
  const replacement: FoodCell | undefined = !compatible && target && n != null && (!foodCasesOnly(target) || (replacementSize != null && replacementSize > 0))
    ? { cases: foodCasesOnly(target) ? n : null, caseSize: replacementSize, units: foodCasesOnly(target) ? null : n,
      packs: null, packSize: null, qty: 0, source: "grid", none: n === 0,
      raw: `[corrected: ${n} ${foodCasesOnly(target) ? `cases × ${replacementSize}` : foodUnitLabel(target, n)} for ${target.name}]` } : undefined;
  if (replacement) replacement.qty = foodCellQty(replacement);
  const newQty = compatible ? cell.qty : replacement?.qty;
  const canChange = newQty != null && Number.isFinite(newQty) && newQty >= 0 && !disabled;
  const label = `${sku.name} on ${shelf}`;
  return <div className="lq-review-count-row lq-fc-review-count-row" data-zone-id={zid} data-sku-id={sku.id}>
    <div className="lq-review-count-location"><strong>{shelf}</strong><span>{formatQty(cell.qty)} {foodUnitLabel(sku, cell.qty)} total</span></div>
    <strong>{sku.name}</strong>
    {(cell.cases ?? 0) > 0 && <span>{formatQty(cell.cases)} cases × {formatQty(cell.caseSize)}</span>}
    {(cell.packs ?? 0) > 0 && <span>{formatQty(cell.packs)} packs × {formatQty(cell.packSize)}</span>}
    {cell.raw && <p className="lq-review-heard">Heard: “{cell.raw}”</p>}
    <div className="lq-review-count-inputs">
      {caseSize != null && (sku.countUnit !== "case" || casesOnly || !!cell.cases) && <label className="lq-quantity">Cases ×{formatQty(caseSize)}
        <FoodNumberInput className="lq-qty-input" type="number" inputMode="decimal" step="any" min={0} aria-label={`Cases of ${label}`}
          value={casesOnly ? cell.qty / caseSize : cell.cases ?? undefined} disabled={disabled || quantitiesDisabled}
          onRaw={(raw) => onEdit("cases", raw)} /></label>}
      {!casesOnly && <label className="lq-quantity">Loose {foodUnitLabel(sku, 2)}
        <FoodNumberInput className="lq-qty-input" type="number" inputMode="decimal" step="any" min={0} aria-label={`Loose ${label}`}
          value={cell.units ?? undefined} disabled={disabled || quantitiesDisabled} onRaw={(raw) => onEdit("units", raw)} /></label>}
      {!casesOnly && cell.packSize != null && <label className="lq-quantity">Packs ×{formatQty(cell.packSize)}
        <FoodNumberInput className="lq-qty-input" type="number" inputMode="decimal" step="any" min={0} aria-label={`Packs of ${label}`}
          value={cell.packs ?? undefined} disabled={disabled || quantitiesDisabled} onRaw={(raw) => onEdit("packs", raw)} /></label>}
    </div>
    <button type="button" className="lq-linkbtn" disabled={disabled || quantitiesDisabled} onClick={onNone}>None here</button>
    <button type="button" className="lq-linkbtn" disabled={disabled} onClick={() => setChanging(!changing)}>{changing ? "Cancel item change" : "Change item"}</button>
    {changing && <div className="lq-review-rematch">
      <input type="search" className="lq-search" aria-label={`Find replacement for ${label}`} placeholder="Find the item actually counted…" value={query}
        onChange={(e) => { setQuery(e.target.value); setTargetId(""); setAmount(""); }} />
      <select className="lq-review-replacement" aria-label={`Replacement for ${label}`} value={targetId} onChange={(e) => { setTargetId(e.target.value); setAmount(""); }}>
        <option value="">Choose item and counting unit</option>
        {catalog.filter((s) => s.id !== sku.id && foodSearchMatch(s, query)).map((s) => <option key={s.id} value={s.id}>{s.name} · {foodUnitLabel(s, 2)}</option>)}
      </select>
      {target && <>
        <p>{compatible ? `Move the recorded ${formatQty(cell.qty)} ${foodUnitLabel(sku, cell.qty)} to ${target.name}.` : `This item counts ${foodCasesOnly(target) ? "cases" : foodUnitLabel(target, 2)}. Enter the amount you actually counted; the earlier number is not converted.`}</p>
        {!compatible && <label className="lq-quantity">{foodCasesOnly(target) ? `Cases ×${replacementSize ?? "?"}` : foodUnitLabel(target, 2)}
          <input className="lq-qty-input" type="number" inputMode="decimal" step="any" min={0} aria-label={`Corrected quantity for ${target.name}`}
            value={amount} onChange={(e) => setAmount(e.target.value)} /></label>}
        {foodCasesOnly(target) && !(replacementSize != null && replacementSize > 0) && <p className="lq-error">Confirm this item's case size on its count row before correcting it.</p>}
        {targetCell ? <>
          <p>Already counted here: {formatQty(targetCell.qty)} {foodUnitLabel(target, targetCell.qty)}. Choose how to correct it.</p>
          {((cell.cases && targetCell.cases && cell.caseSize !== targetCell.caseSize) || (cell.packs && targetCell.packs && cell.packSize !== targetCell.packSize)) && <p>Package sizes differ. Adding retains the total as individual counting units.</p>}
          <button type="button" className="lq-btn lq-btn-ghost" disabled={!canChange} onClick={() => onChangeItem(target.id, "add", replacement)}>Add to existing count ({formatQty((newQty ?? 0) + targetCell.qty)})</button>
          <button type="button" className="lq-btn lq-btn-ghost" disabled={!canChange} onClick={() => onChangeItem(target.id, "replace", replacement)}>Replace existing count ({formatQty(newQty)})</button>
        </> : <button type="button" className="lq-btn lq-btn-ghost" disabled={!canChange} onClick={() => onChangeItem(target.id, "move", replacement)}>Move count</button>}
      </>}
    </div>}
  </div>;
}
