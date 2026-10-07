import { useMemo, useState } from "react";
import type { WasteCatalog, WasteLine, WasteReviewLine } from "./food-waste-api";
import FoodNumberInput from "./FoodNumberInput";
import { currentCountDefinition } from "./count-definition";
import { foodSearchMatch } from "./FoodReviewCountRow";
import { formatQty } from "./quantity";
import { money } from "./FoodCostReport";

export default function FoodWasteRow({ line, value, catalog, disabled, changed, onEdit, onPhoto }: {
  line: WasteLine; value: WasteReviewLine; catalog: WasteCatalog; disabled: boolean; changed: boolean;
  onEdit: (patch: Partial<WasteReviewLine>) => void; onPhoto: () => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"sku" | "recipe">(value.targetType ?? "sku");
  const sku = catalog.items.find(item => item.id === value.skuId);
  const recipe = catalog.recipes.find(item => item.id === value.recipeId);
  const chosen = value.targetType === "sku" ? sku?.name : recipe?.name;
  const definition = currentCountDefinition(sku);
  const units = value.targetType === "recipe" ? ["portion", "each"]
    : [...new Set([...(definition ? Object.keys(definition.spokenUnits ?? {}) : []), definition?.unitLabel, sku?.countUnit].filter((unit): unit is string => !!unit))];
  const hits = useMemo(() => kind === "sku"
    ? catalog.items.filter(item => search.trim() ? foodSearchMatch(item, search) : line.candidateSkuIds.includes(item.id)).slice(0, 12).map(item => ({ id: item.id, name: item.name }))
    : catalog.recipes.filter(item => search.trim() ? foodSearchMatch({ name: item.name } as typeof catalog.items[number], search) : line.candidateRecipeIds.includes(item.id)).slice(0, 12).map(item => ({ id: item.id, name: item.name })), [catalog, kind, search, line.candidateSkuIds, line.candidateRecipeIds]);
  const choose = (id: string) => {
    // The raw amount and physical noun remain independent answers. A new
    // product cannot silently reinterpret a typed count or borrow its factor.
    onEdit({ targetType: kind, skuId: kind === "sku" ? id : null, recipeId: kind === "recipe" ? id : null, optionRecipeIds: [] });
    setOpen(false); setSearch("");
  };
  return <article className={`lq-fw-row${value.decision === "discard" ? " lq-fw-discarded" : ""}`} data-row-id={line.id}>
    <div className="lq-fw-source"><p>{line.rawText || line.itemText || "Entry added during review"}</p>{line.pageId && <button type="button" className="lq-linkbtn" onClick={onPhoto}>View source photo</button>}</div>
    {value.decision === "discard" ? <><p className="lq-muted">This entry is left out.</p><button type="button" className="lq-linkbtn" disabled={disabled} onClick={() => onEdit({ decision: "include", duplicateDecision: null })}>Restore entry</button></> : <fieldset disabled={disabled}>
      {chosen ? <button type="button" className="lq-chip lq-chip-on lq-fw-match" aria-label={`Change waste item: ${chosen}`} aria-expanded={open} onClick={() => { setKind(value.targetType ?? "sku"); setOpen(!open); }}>✓ {chosen}</button>
        : <button type="button" className="lq-btn" onClick={() => setOpen(!open)}>Choose product or prepared item</button>}
      {(open || !chosen && hits.length > 0) && <div className="lq-fw-pick">
        <div className="lq-fw-kind" role="group" aria-label="Waste item type">
          <button type="button" className={`lq-chip${kind === "sku" ? " lq-chip-on" : ""}`} onClick={() => { setKind("sku"); setSearch(""); }}>Purchased product</button>
          <button type="button" className={`lq-chip${kind === "recipe" ? " lq-chip-on" : ""}`} onClick={() => { setKind("recipe"); setSearch(""); }}>Prepared item</button>
        </div>
        <input className="lq-search" type="search" value={search} aria-label={`Find waste item for ${line.id}`} placeholder={kind === "sku" ? "Search products…" : "Search prepared items…"} onChange={event => setSearch(event.target.value)} />
        <div className="lq-fw-choices">{hits.map(item => <button type="button" className="lq-chip" key={item.id} onClick={() => choose(item.id)}>{item.name}</button>)}</div>
        {search.trim() && hits.length === 0 && <p className="lq-muted">No matching {kind === "sku" ? "product" : "prepared item"}. Check the name or item type.</p>}
      </div>}
      <div className="lq-fw-amount">
        <label>Quantity<FoodNumberInput value={value.quantity ?? undefined} type="number" min="0" step="any" inputMode="decimal" aria-label={`Waste quantity for ${line.id}`} placeholder="Qty"
          onRaw={raw => { const n = Number(raw); onEdit({ quantity: raw.trim() && Number.isFinite(n) && n >= 0 ? n : null }); }} /></label>
        <label>Unit<input type="text" maxLength={40} value={value.unitText ?? ""} aria-label={`Waste unit for ${line.id}`} placeholder={value.targetType === "recipe" ? "portion" : "bag, case or lb"} onChange={event => onEdit({ unitText: event.target.value.trim() || null })} /></label>
      </div>
      {units.length > 0 && <div className="lq-fw-units" role="group" aria-label={`Units for ${line.id}`}>{units.slice(0, 10).map(unit => <button type="button" className={`lq-chip${value.unitText === unit ? " lq-chip-on" : ""}`} key={unit} onClick={() => onEdit({ unitText: unit })}>{unit}</button>)}</div>}
      {recipe && recipe.options.length > 0 && <div className="lq-fw-options"><span>Preparation / size</span>{recipe.requiredVariant && <p className="lq-muted">Choose one size or preparation.</p>}{recipe.options.map(option => <label key={option.id}><input type={option.kind === "variant" ? "radio" : "checkbox"} name={option.kind === "variant" ? `variant-${line.id}` : undefined} checked={value.optionRecipeIds.includes(option.id)} onChange={event => onEdit({ optionRecipeIds: option.kind === "variant" ? [...value.optionRecipeIds.filter(id => !recipe.options.some(candidate => candidate.id === id && candidate.kind === "variant")), option.id] : event.target.checked ? [...value.optionRecipeIds, option.id] : value.optionRecipeIds.filter(id => id !== option.id) })} />{option.name || option.optionLabel}</label>)}</div>}
      {line.reviewNotes.length > 0 && <ul className="lq-fw-notes">{line.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
      {line.duplicateLineIds.length > 0 && <div className="lq-fw-question"><p>This may repeat another entry. Keep both only if they describe separate losses.</p><button type="button" className="lq-chip" onClick={() => onEdit({ duplicateDecision: "keep" })}>{value.duplicateDecision === "keep" ? "✓ Separate loss" : "Keep as a separate loss"}</button><button type="button" className="lq-linkbtn" onClick={() => onEdit({ decision: "discard", duplicateDecision: "discard" })}>Discard repeated entry</button></div>}
      <details className="lq-fw-details"><summary>Date and reason</summary><label>Date written on log (optional)<input type="date" value={value.occurredDate ?? ""} aria-label={`Waste date for ${line.id}`} onChange={event => onEdit({ occurredDate: event.target.value || null })} /></label><label>Reason<input type="text" maxLength={500} value={value.reason ?? ""} aria-label={`Waste reason for ${line.id}`} onChange={event => onEdit({ reason: event.target.value || null })} placeholder="Spoiled, dropped or overprepared" /></label></details>
      {changed ? <p className="lq-muted">Save review to check these changes.</p> : line.issues.length > 0 ? <ul className="lq-fw-issues">{line.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <p className="lq-fw-value">{line.valueCents == null ? "Cost unavailable — recorded as unpriced" : `${money(line.valueCents)} waste cost`}</p>}
      {!changed && line.ingredients.length > 0 && <details className="lq-fw-details"><summary>Cost breakdown</summary>{line.ingredients.map((ingredient, index) => <p key={`${ingredient.skuId}-${index}`}>{ingredient.name}: {formatQty(ingredient.quantity)} {ingredient.unitLabel ?? ingredient.countUnit} · {ingredient.valueCents == null ? "unpriced" : money(ingredient.valueCents)}</p>)}</details>}
      <button type="button" className="lq-linkbtn lq-fw-discard" onClick={() => onEdit({ decision: "discard", duplicateDecision: line.duplicateLineIds.length ? "discard" : value.duplicateDecision })}>Discard entry</button>
    </fieldset>}
  </article>;
}
