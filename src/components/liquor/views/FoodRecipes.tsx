import { useEffect, useRef, useState } from "react";
import { BarApiError, ForbiddenError } from "../api";
import { correctFoodYieldReports, getFoodRecipes, getFoodYieldCorrection, saveFoodRecipe, setFoodIngredientYield, setFoodRecipeActive,
  type FoodRecipe, type FoodRecipeCatalog, type FoodRecipeIngredient, type FoodRecipeLine, type FoodYieldBasis, type FoodYieldCorrectionContext } from "../food-recipes-api";
import "../food-recipes.css";

const UNITS = ["oz", "lb", "g", "kg", "floz", "ml", "l", "gal", "qt", "pt", "cup", "each", "slice", "piece", "packet", "portion"];
const scales: Record<string, [string, number]> = { oz: ["weight", 1], lb: ["weight", 16], g: ["weight", 1 / 28.349523125], kg: ["weight", 1000 / 28.349523125],
  floz: ["volume", 1], ml: ["volume", 1 / 29.5735295625], l: ["volume", 1000 / 29.5735295625], gal: ["volume", 128], qt: ["volume", 32], pt: ["volume", 16], cup: ["volume", 8] };
function converted(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;
  const a = scales[from], b = scales[to];
  return a && b && a[0] === b[0] ? qty * a[1] / b[1] : null;
}
export function foodRecipeCost(lines: FoodRecipeLine[], items: FoodRecipeIngredient[]) {
  let dollars = 0;
  const incomplete: string[] = [];
  for (const line of lines) {
    const item = items.find((i) => i.id === line.skuId);
    const qty = item?.recipeUnit ? converted(line.qty, line.unit, item.recipeUnit) : null;
    if (!item || item.physicalBasisValid === false || qty == null || item.yield == null || item.yield <= 0 || item.costPerCountUnit == null) incomplete.push(item?.name ?? line.skuId);
    else dollars += qty * item.costPerCountUnit / item.yield;
  }
  return { dollars, incomplete };
}
function errorText(error: unknown) {
  if (error instanceof ForbiddenError) return "Only an admin can change recipes and yields.";
  if (error instanceof BarApiError) {
    try { const detail = JSON.parse(String(error.body)); if (detail.message) return detail.message as string; } catch { /* fallback */ }
    if (error.status === 409) return "This record changed. Reload it before saving.";
  }
  return "The request did not finish. Reload to check the saved state before trying again.";
}
const basisText = (basis: FoodYieldBasis | null) => basis
  ? `${basis.yield ?? "size unknown"} ${basis.recipeUnit ?? "recipe unit unknown"} per ${basis.unitLabel ?? basis.countUnit ?? "unstamped unit"}` : "No frozen unit stamp";

function HistoricalYieldReview({ sessionId, canManage }: { sessionId: string; canManage: boolean }) {
  const [context, setContext] = useState<FoodYieldCorrectionContext | null>(null);
  const [changes, setChanges] = useState<Record<string, { unit: string; value: string }>>({});
  const [reason, setReason] = useState(""), [verified, setVerified] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = async () => { setChanges({}); setVerified(false); try { setContext(await getFoodYieldCorrection(sessionId)); } catch (e) { setMessage(errorText(e)); } };
  useEffect(() => { let live = true; getFoodYieldCorrection(sessionId).then((c) => { if (live) setContext(c); }).catch((e) => { if (live) setMessage(errorText(e)); }); return () => { live = false; }; }, [sessionId]);
  const entries = Object.entries(changes);
  const valid = entries.length > 0 && entries.every(([, c]) => Number(c.value) > 0 && Number(c.value) <= 1_000_000 && c.unit);
  async function apply() {
    if (!context || !canManage || !verified || !valid || reason.trim().length < 3) return;
    setBusy(true); setMessage(null);
    try {
      const result = await correctFoodYieldReports(context, entries.map(([skuId, c]) => ({ skuId, expectedRevision: context.items.find((i) => i.skuId === skuId)!.revision,
        recipeUnit: c.unit, yield: Number(c.value) })), reason.trim());
      await load(); setReason("");
      setMessage(`Food variance v${result.varianceVersion} and Food cost v${result.cogsVersion} saved together. The originals are preserved.`);
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  return <section className="lq-fr-panel" aria-label="Historical yield correction">
    <h2>Correct a historical yield</h2>
    <p>Review the physical amount in one frozen count unit. This creates new Food variance and Food cost versions together. Later re-runs retain this reviewed yield.</p>
    {context && <><p>{new Date(context.periodStart).toLocaleDateString()} → {new Date(context.periodEnd).toLocaleDateString()} · Food variance v{context.varianceVersion} · Food cost v{context.cogsVersion}</p>
      <fieldset disabled={!canManage || busy}>
        {context.items.map((item) => <div key={item.skuId} className="lq-fr-history-row">
          <label><input type="checkbox" aria-label={`Correct ${item.name}`} checked={!!changes[item.skuId]} disabled={!item.canCorrect}
            onChange={(e) => { const next = { ...changes }; if (e.target.checked) next[item.skuId] = { unit: item.previous?.basis.recipeUnit ?? item.current.recipeUnit ?? "oz", value: String(item.previous?.basis.yield ?? item.current.yield ?? "") }; else delete next[item.skuId]; setChanges(next); setVerified(false); }} /> {item.name}</label>
          <p className="lq-muted">Opening: {basisText(item.opening)} · Closing: {basisText(item.closing)}</p>
          {item.previous && <p>Reviewed yield: {basisText(item.previous.basis)} · {item.previous.reason}</p>}
          {item.unavailableReason && <p>{item.unavailableReason}</p>}
          {changes[item.skuId] && <div className="lq-fr-fields"><label>Corrected amount<input aria-label={`Corrected amount for ${item.name}`} type="number" min="0.0001" max="1000000" step="any" value={changes[item.skuId]!.value}
            onChange={(e) => { setChanges({ ...changes, [item.skuId]: { ...changes[item.skuId]!, value: e.target.value } }); setVerified(false); }} /></label>
            <label>Recipe unit<select aria-label={`Corrected unit for ${item.name}`} value={changes[item.skuId]!.unit}
              onChange={(e) => { setChanges({ ...changes, [item.skuId]: { ...changes[item.skuId]!, unit: e.target.value } }); setVerified(false); }}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
            <span>per frozen {item.closing?.unitLabel ?? item.closing?.countUnit}</span></div>}
        </div>)}
        <label>Why this historical yield is correct<textarea aria-label="Historical correction reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
        <label><input type="checkbox" aria-label="Physical yield verified" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> I verified these amounts describe the physical count units at both ends of this bracket.</label>
        <button className="lq-btn lq-btn-primary" disabled={!valid || !verified || reason.trim().length < 3} onClick={() => void apply()}>{busy ? "Saving both reports…" : "Save both corrected reports"}</button>
      </fieldset>
      <p><a href={`/cogs/?view=foodvariance&count=${encodeURIComponent(sessionId)}`}>Open Food variance</a> · <a href={`/cogs/?view=foodcost&count=${encodeURIComponent(sessionId)}`}>Open Food cost</a></p></>}
    {message && <p role="status">{message}</p>}
    <button type="button" className="lq-btn" disabled={busy} onClick={() => { setMessage(null); void load(); }}>Reload historical review</button>
  </section>;
}

function YieldEditor({ item, canManage, onSaved }: { item: FoodRecipeIngredient; canManage: boolean; onSaved: () => Promise<void> }) {
  const [unit, setUnit] = useState(item.recipeUnit ?? "oz"), [value, setValue] = useState(String(item.yield ?? ""));
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const shownRevision = useRef(item.yieldRevision);
  useEffect(() => {
    if (shownRevision.current === item.yieldRevision) return;
    shownRevision.current = item.yieldRevision;
    setUnit(item.recipeUnit ?? "oz"); setValue(String(item.yield ?? ""));
  }, [item.yieldRevision]);
  return <section className="lq-fr-panel" aria-label="Ingredient yield"><h2>{item.name}: count yield</h2>
    <p>One {item.unitLabel ?? item.countUnit} contains this many recipe units. Case capacity: {item.unitsPerCase ?? "unknown"}. Changing this affects future counts and recipe costing.</p>
    {item.physicalBasisValid === false && <p role="alert">The saved counting definition no longer matches this item's physical unit. Review its counting unit before setting a yield.</p>}
    <fieldset disabled={!canManage || busy || item.physicalBasisValid === false}><div className="lq-fr-fields">
      <label>Amount<input aria-label="Ingredient yield amount" type="number" min="0.0001" max="1000000" step="any" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Unknown" /></label>
      <label>Recipe unit<select aria-label="Ingredient recipe unit" value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></label></div>
      <label>Reason<textarea aria-label="Yield change reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
      <button className="lq-btn lq-btn-primary" disabled={reason.trim().length < 3 || (value !== "" && !(Number(value) > 0 && Number(value) <= 1_000_000))} onClick={async () => {
        setBusy(true); setMessage(null); try { await setFoodIngredientYield(item, unit, value === "" ? null : Number(value), reason.trim()); await onSaved(); setReason(""); setMessage("Yield saved. Existing reports retain their saved basis; use the historical review to correct a bracket."); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
      }}>{busy ? "Saving…" : "Save yield"}</button>
    </fieldset>{message && <p role="status">{message}</p>}
  </section>;
}

type Draft = Omit<FoodRecipe, "id" | "revision" | "name" | "key" | "active" | "labelText">;
const emptyRecipe = (): Draft => ({ namespace: "gotab", productKey: "", optionLabel: "", kind: "dish", productName: "", basis: "", note: "", lines: [] });
export default function FoodRecipes({ onDone, canManage, initialRecipeId, initialRecipeKey, initialSkuId, initialCountId }: {
  onDone: () => void; canManage: boolean; initialRecipeId?: string | null; initialRecipeKey?: string | null; initialSkuId?: string | null; initialCountId?: string | null;
}) {
  const [catalog, setCatalog] = useState<FoodRecipeCatalog | null>(null), [selectedId, setSelectedId] = useState<string | null>(initialRecipeId ?? null);
  // A catalog refresh may update yields and other admins' recipes. The draft
  // retains the recipe and revision it was opened against until explicitly reloaded.
  const [draftRecipe, setDraftRecipe] = useState<FoodRecipe | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null), [dirty, setDirty] = useState(false), [reason, setReason] = useState("");
  const [query, setQuery] = useState(""), [ingredientQuery, setIngredientQuery] = useState(""), [skuId, setSkuId] = useState(initialSkuId ?? "");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null);
  const reload = async () => { const data = await getFoodRecipes(); setCatalog(data); return data; };
  useEffect(() => { let live = true; getFoodRecipes().then((data) => { if (live) {
    setCatalog(data); const recipe = data.recipes.find((r) => r.id === initialRecipeId || (!!initialRecipeKey && r.key === initialRecipeKey));
    if (recipe) { setSelectedId(recipe.id); setDraftRecipe(recipe); setDraft({ ...recipe, lines: recipe.lines.map((l) => ({ ...l })) }); }
    else if (initialRecipeKey) {
      const key = /^(gotab|tprs):(.+?)(?:::(.*))?$/.exec(initialRecipeKey);
      if (key) { const base = data.recipes.find((r) => r.namespace === key[1] && r.productKey === key[2]);
        setDraft({ ...emptyRecipe(), namespace: key[1] as Draft["namespace"], productKey: key[2], optionLabel: key[3] ?? "", kind: key[3] ? "change" : "dish", productName: base?.productName ?? "" });
      }
    }
  } }).catch((e) => { if (live) setMessage(errorText(e)); }); return () => { live = false; }; }, []);
  const selected = draftRecipe;
  const yieldItem = catalog?.items.find((i) => i.id === skuId);
  const edit = (next: Draft) => { setDraft(next); setDirty(true); setMessage(null); };
  const select = (recipe: FoodRecipe) => { setSelectedId(recipe.id); setDraftRecipe(recipe); setDraft({ ...recipe, lines: recipe.lines.map((l) => ({ ...l })) }); setDirty(false); setReason(""); setMessage(null); };
  const cost = draft && catalog ? foodRecipeCost(draft.lines, catalog.items) : null;
  async function save() {
    if (!draft || !canManage || reason.trim().length < 3) return;
    setBusy(true); setMessage(null);
    try {
      const result = await saveFoodRecipe({ ...draft, optionLabel: selected?.labelText ?? draft.optionLabel, productName: draft.productName || undefined,
        basis: draft.basis ?? undefined, note: draft.note ?? undefined,
        lines: draft.lines.map((l) => ({ ...l, basis: l.basis ?? undefined, note: l.note ?? undefined })),
        ...(selected ? { recipeId: selected.id, expectedRevision: selected.revision } : {}), reason: reason.trim() });
      const data = await reload(); select(data.recipes.find((r) => r.id === result.recipe.id)!);
      setMessage("Recipe saved. Historical reports can be re-run explicitly after review.");
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  return <div className="lq-fv lq-fr"><button className="lq-btn" onClick={onDone}>Back</button><h1>Food recipes and yields</h1>
    <p>Recipes map sold dishes and options to ingredients. Only an admin can save changes; every change records a reason.</p>
    {message && <p role="status">{message}</p>}
    {!catalog ? <p>Loading recipes…</p> : <>
      {catalog.problems.length > 0 && <p className="lq-error">{catalog.problems.length} recipe line(s) need a compatible ingredient unit.</p>}
      <div className="lq-fr-layout"><section className="lq-fr-panel"><h2>Recipe book</h2>
        <label>Search recipes<input aria-label="Search food recipes" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        {canManage && <button className="lq-btn" disabled={busy || dirty} onClick={() => { setSelectedId(null); setDraftRecipe(null); setDraft(emptyRecipe()); setDirty(false); setReason(""); }}>New recipe</button>}
        <div className="lq-fr-list">{catalog.recipes.filter((r) => `${r.name} ${r.productKey} ${r.optionLabel}`.toLowerCase().includes(query.toLowerCase())).map((r) => <button key={r.id} className="lq-invrow" disabled={busy || dirty} aria-pressed={selectedId === r.id} onClick={() => select(r)}>{r.name} {r.active ? "" : "(inactive)"}</button>)}</div>
      </section>
      {draft && <section className="lq-fr-panel" aria-label="Recipe editor"><h2>{selected?.name ?? "New recipe"}</h2>
        <fieldset disabled={!canManage || busy}>
          <div className="lq-fr-fields"><label>Sales source<select aria-label="Recipe namespace" value={draft.namespace} disabled={!!selected} onChange={(e) => edit({ ...draft, namespace: e.target.value as Draft["namespace"] })}><option value="gotab">GoTab</option><option value="tprs">TPRS catering</option></select></label>
            <label>Product ID<input aria-label="Recipe product ID" value={draft.productKey} disabled={!!selected} onChange={(e) => edit({ ...draft, productKey: e.target.value })} /></label></div>
          <label>Dish name<input aria-label="Recipe dish name" value={draft.productName ?? ""} onChange={(e) => edit({ ...draft, productName: e.target.value })} /></label>
          <div className="lq-fr-fields"><label>Kind<select aria-label="Recipe kind" value={draft.kind} onChange={(e) => edit({ ...draft, kind: e.target.value as Draft["kind"], optionLabel: e.target.value === "dish" ? "" : draft.optionLabel, lines: e.target.value === "instruction" ? [] : draft.lines })}>{["dish", "variant", "change", "instruction"].filter((k) => !selected || (selected.kind === "dish" ? k === "dish" : k !== "dish")).map((k) => <option key={k}>{k}</option>)}</select></label>
            <label>Option label<input aria-label="Recipe option label" value={draft.optionLabel} disabled={!!selected || draft.kind === "dish"} onChange={(e) => edit({ ...draft, optionLabel: e.target.value })} /></label></div>
          {draft.kind === "instruction" ? <p>An instruction has no ingredient lines.</p> : <>
            <label>Find an ingredient<input aria-label="Find food ingredient" value={ingredientQuery} onChange={(e) => setIngredientQuery(e.target.value)} /></label>
            <select aria-label="Add food ingredient" value="" onChange={(e) => { const item = catalog.items.find((i) => i.id === e.target.value); if (item) edit({ ...draft, lines: [...draft.lines, { skuId: item.id, qty: 1, unit: item.recipeUnit ?? "each", via: "", basis: "", note: "" }] }); }}>
              <option value="">Choose ingredient to add</option>{catalog.items.filter((i) => i.name.toLowerCase().includes(ingredientQuery.toLowerCase())).map((i) => <option key={i.id} value={i.id}>{i.name}{i.active ? "" : " (archived)"}{i.discontinuedAt ? " (no longer bought)" : ""}</option>)}</select>
            {draft.lines.map((line, index) => { const item = catalog.items.find((i) => i.id === line.skuId); const patch = (values: Partial<FoodRecipeLine>) => edit({ ...draft, lines: draft.lines.map((l, i) => i === index ? { ...l, ...values } : l) });
              return <div className="lq-fr-line" key={line.id ?? `${line.skuId}-${index}`}><strong>{item?.name ?? line.skuName ?? line.skuId}</strong>
                <div className="lq-fr-fields"><label>Quantity<input aria-label={`Ingredient quantity ${index + 1}`} type="number" step="any" value={line.qty} onChange={(e) => patch({ qty: Number(e.target.value) })} /></label>
                  <label>Unit<select aria-label={`Ingredient unit ${index + 1}`} value={line.unit} onChange={(e) => patch({ unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></label></div>
                <label>Used through<input aria-label={`Ingredient source ${index + 1}`} value={line.via} onChange={(e) => patch({ via: e.target.value })} /></label>
                <label>Basis<input aria-label={`Ingredient basis ${index + 1}`} value={line.basis ?? ""} onChange={(e) => patch({ basis: e.target.value })} /></label>
                <label>Note<input aria-label={`Ingredient note ${index + 1}`} value={line.note ?? ""} onChange={(e) => patch({ note: e.target.value })} /></label>
                <button className="lq-btn" onClick={() => { setSkuId(line.skuId); }}>Review ingredient yield</button> <button className="lq-btn" onClick={() => edit({ ...draft, lines: draft.lines.filter((_, i) => i !== index) })}>Remove ingredient</button>
              </div>; })}
          </>}
          <label>Recipe basis<input aria-label="Recipe basis" value={draft.basis ?? ""} onChange={(e) => edit({ ...draft, basis: e.target.value })} /></label>
          <label>Recipe note<textarea aria-label="Recipe note" value={draft.note ?? ""} onChange={(e) => edit({ ...draft, note: e.target.value })} /></label>
          {cost && <p role="status">{cost.incomplete.length ? `Partial ingredient cost $${cost.dollars.toFixed(2)}; needs cost or yield: ${cost.incomplete.join(", ")}` : `Ingredient cost $${cost.dollars.toFixed(2)}`}</p>}
          <label>Reason for change<textarea aria-label="Recipe change reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
          <button className="lq-btn lq-btn-primary" disabled={reason.trim().length < 3 || !draft.productKey.trim() || !draft.productName?.trim() || (draft.kind !== "dish" && !draft.optionLabel.trim()) || draft.lines.some((l) => !Number.isFinite(l.qty) || l.qty === 0 || (draft.kind === "dish" && l.qty < 0))} onClick={() => void save()}>{busy ? "Saving…" : "Save recipe"}</button>
          {selected && <button className="lq-btn" disabled={dirty || reason.trim().length < 3} onClick={async () => { setBusy(true); try { await setFoodRecipeActive(selected.id, !selected.active, selected.revision, reason.trim()); const data = await reload(); select(data.recipes.find((r) => r.id === selected.id)!); setMessage(selected.active ? "Recipe deactivated." : "Recipe activated."); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); } }}>{selected.active ? "Deactivate recipe" : "Activate recipe"}</button>}
        </fieldset>
        {dirty && <button className="lq-btn" disabled={busy} onClick={() => { if (selected) select(selected); else { setDraft(null); setDirty(false); } }}>Discard edits</button>}
      </section>}
      </div>
      <section className="lq-fr-panel"><label>Ingredient yields<select aria-label="Select ingredient yield" value={skuId} onChange={(e) => setSkuId(e.target.value)}><option value="">Choose an ingredient</option>{catalog.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label></section>
      {yieldItem && <YieldEditor key={yieldItem.id} item={yieldItem} canManage={canManage} onSaved={async () => { await reload(); }} />}
      <button className="lq-btn" disabled={busy} onClick={async () => { try { const data = await reload(); if (selectedId) { const recipe = data.recipes.find((r) => r.id === selectedId); if (recipe) select(recipe); } setMessage("Recipe book reloaded."); } catch (e) { setMessage(errorText(e)); } }}>Reload recipe book</button>
    </>}
    {initialCountId && <HistoricalYieldReview sessionId={initialCountId} canManage={canManage} />}
  </div>;
}
