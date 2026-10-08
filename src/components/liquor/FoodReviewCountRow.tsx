import { useState } from "react";
import type { BarSkuItem } from "./api";
import FoodNumberInput from "./FoodNumberInput";
import { compatibleFoodCellUnits, canMergeFoodCells, foodCellQty, readFoodNumber, type FoodCell } from "./food-count-edit";
import { foodCaseSize, foodUnitLabel } from "./food-voice-review";
import { formatQty } from "./quantity";
import { foodPhysicalUnit, singleFoodLoose, foodQuantityBasis, sameFoodQuantityBasis } from "./food-quantity";
import { normalizeCountUnit } from "./count-definition";

export function foodSearchMatch(sku: BarSkuItem, query: string): boolean {
  const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const text = normalize(`${sku.name} ${(sku.aliases ?? []).join(" ")} ${foodUnitLabel(sku, 2)}`);
  return terms.length ? terms.every((part) => text.includes(part)) : !query.trim();
}

export default function FoodReviewCountRow({ zid, sku, cell, shelf, catalog, existing, disabled, quantitiesDisabled, onEdit, onEditPhysicalLoose, onEditLegacyLoose, onNone, onChangeItem }: {
  zid: string; sku: BarSkuItem; cell: FoodCell; shelf: string; catalog: BarSkuItem[]; existing: Record<string, FoodCell>;
  disabled: boolean; quantitiesDisabled: boolean; onEdit: (field: "cases" | "units" | "packs", raw: string) => void;
  onEditPhysicalLoose: (index: number, raw: string) => void;
  onEditLegacyLoose: (raw: string) => void;
  onNone: () => void; onChangeItem: (id: string, mode: "move" | "add" | "replace", amount?: FoodCell) => void;
}) {
  const [changing, setChanging] = useState(false), [query, setQuery] = useState(""), [targetId, setTargetId] = useState(""), [amount, setAmount] = useState("");
  const target = catalog.find((s) => s.id === targetId), targetCell = existing[targetId];
  const caseSize = cell.caseSize ?? foodCaseSize(sku);
  const compatible = !!target && compatibleFoodCellUnits(sku, target, cell);
  const replacementSize = targetCell?.caseSize ?? foodCaseSize(target);
  const n = readFoodNumber(amount);
  const replacement: FoodCell | undefined = !compatible && target && n != null
    ? { cases: null, caseSize: replacementSize, units: n,
      packs: null, packSize: null, qty: 0, source: "grid", none: n === 0,
      raw: `[corrected: ${n} ${foodUnitLabel(target, n)} for ${target.name}]` } : undefined;
  if (replacement) replacement.qty = foodCellQty(replacement);
  const newQty = compatible ? cell.qty : replacement?.qty;
  const canChange = newQty != null && Number.isFinite(newQty) && newQty >= 0 && !disabled;
  const canAdd = canChange && (!targetCell || canMergeFoodCells(replacement ?? cell, targetCell));
  const label = `${sku.name} on ${shelf}`;
  const physical = singleFoodLoose(cell.foodQuantity);
  const physicalParts = cell.foodQuantity?.loose.map((part, index) => ({ part, index })) ?? [];
  const looseInputs = physicalParts.length ? [...physicalParts, ...(Number(cell.foodQuantity!.legacyQtyUnits) > 0 ? [{ part: null, index: -1 }] : [])] : [{ part: null, index: -1 }];
  const basisChanged = !!cell.foodQuantity && !sameFoodQuantityBasis(cell.foodQuantity, foodQuantityBasis(sku));
  const simplePhysicalTotal = physical && !cell.cases && !cell.packs;
  return <div className="lq-review-count-row lq-fc-review-count-row" data-zone-id={zid} data-sku-id={sku.id}>
    <div className="lq-review-count-location"><strong>{shelf}</strong><span>{simplePhysicalTotal ? `${physical!.quantity} ${foodPhysicalUnit(physical!)}` : `${formatQty(cell.qty)} ${foodUnitLabel(sku, cell.qty)}`} total</span></div>
    <strong>{sku.name}</strong>
    {(cell.cases ?? 0) > 0 && <span>{formatQty(cell.cases)} cases × {formatQty(cell.caseSize)}</span>}
    {(cell.packs ?? 0) > 0 && <span>{formatQty(cell.packs)} packs × {formatQty(cell.packSize)}</span>}
    {cell.raw && <p className="lq-review-heard">Heard: “{cell.raw}”</p>}
    {!!cell.foodQuantity?.loose.length && !simplePhysicalTotal && <p className="lq-muted">Counted: {cell.foodQuantity!.loose.map(part => `${part.quantity} ${foodPhysicalUnit(part)}`).join(" + ")}{Number(cell.foodQuantity!.legacyQtyUnits) > 0 ? `; previously saved ${cell.foodQuantity!.legacyQtyUnits} ${foodUnitLabel(sku, 2)}` : ""}</p>}
    {basisChanged && <p className="lq-error">The counting unit changed. Clear this amount and recount it.</p>}
    <div className="lq-review-count-inputs">
      {caseSize != null && (sku.countUnit !== "case" || !!cell.cases) && <label className="lq-quantity">Cases ×{formatQty(caseSize)}
        <FoodNumberInput className="lq-qty-input" type="number" inputMode="decimal" step="any" min={0} aria-label={`Cases of ${label}`}
          value={cell.cases ?? undefined} disabled={disabled || quantitiesDisabled || basisChanged}
          onRaw={(raw) => onEdit("cases", raw)} /></label>}
      {looseInputs.map(({ part, index }) => {
        const physicalLabel = part && normalizeCountUnit(part.unit) !== normalizeCountUnit(sku.countUnit ?? "each") ? foodPhysicalUnit({ ...part, quantity: "2" }) : foodUnitLabel(sku, 2);
        const duplicateUnit = part && physicalParts.filter(p => p.part.unit === part.unit).length > 1;
        return <label key={index} className="lq-quantity">{sku.countUnit === "case" ? "" : "Loose "}{physicalLabel}
        {duplicateUnit && <span className="lq-muted">At entry: {part!.numerator}/{part!.denominator} {foodUnitLabel(sku, 2)} each</span>}
        <FoodNumberInput className="lq-qty-input" type="number" inputMode="decimal" step="any" min={0} aria-label={`Loose ${label}`}
          value={part ? Number(part.quantity) : cell.foodQuantity ? Number(cell.foodQuantity.legacyQtyUnits) < 0 ? undefined : Number(cell.foodQuantity.legacyQtyUnits) : cell.units ?? undefined} disabled={disabled || quantitiesDisabled || basisChanged}
          onRaw={(raw) => part ? onEditPhysicalLoose(index, raw) : onEditLegacyLoose(raw)} /></label>;
      })}
      {cell.packSize != null && <label className="lq-quantity">Packs ×{formatQty(cell.packSize)}
        <FoodNumberInput className="lq-qty-input" type="number" inputMode="decimal" step="any" min={0} aria-label={`Packs of ${label}`}
          value={cell.packs ?? undefined} disabled={disabled || quantitiesDisabled || basisChanged} onRaw={(raw) => onEdit("packs", raw)} /></label>}
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
        <p>{compatible ? `Move the recorded ${formatQty(cell.qty)} ${foodUnitLabel(sku, cell.qty)} to ${target.name}.` : `This item counts ${foodUnitLabel(target, 2)}. Enter the amount you actually counted; the earlier number is not converted.`}</p>
        {!compatible && <label className="lq-quantity">{foodUnitLabel(target, 2)}
          <input className="lq-qty-input" type="number" inputMode="decimal" step="any" min={0} aria-label={`Corrected quantity for ${target.name}`}
            value={amount} onChange={(e) => setAmount(e.target.value)} /></label>}
        {targetCell ? <>
          <p>Already counted here: {formatQty(targetCell.qty)} {foodUnitLabel(target, targetCell.qty)}. Choose how to correct it.</p>
          {((cell.cases && targetCell.cases && cell.caseSize !== targetCell.caseSize) || (cell.packs && targetCell.packs && cell.packSize !== targetCell.packSize)) && <p>Package sizes differ. Adding retains the total as individual counting units.</p>}
          {!canAdd && canChange && <p className="lq-error">The earlier count uses a different counting unit. Replace it with a fresh count.</p>}
          <button type="button" className="lq-btn lq-btn-ghost" disabled={!canAdd} onClick={() => onChangeItem(target.id, "add", replacement)}>Add to existing count ({formatQty((newQty ?? 0) + targetCell.qty)})</button>
          <button type="button" className="lq-btn lq-btn-ghost" disabled={!canChange} onClick={() => onChangeItem(target.id, "replace", replacement)}>Replace existing count ({formatQty(newQty)})</button>
        </> : <button type="button" className="lq-btn lq-btn-ghost" disabled={!canChange} onClick={() => onChangeItem(target.id, "move", replacement)}>Move count</button>}
      </>}
    </div>}
  </div>;
}
