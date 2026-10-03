import { useEffect, useState } from "react";
import {
  getCatalog,
  getRecipeGaps,
  markOptionMixer,
  markOptionSubstitution,
  saveRecipe,
  unclassifyOption,
  type BarSkuItem,
  type MissingRecipe,
  type NeedsClassifyOption,
  type RecipeComponentInput,
  type RecipeTemplate,
} from "../api";
import { RecipeSuggestions, useRecipeSuggestions } from "../RecipeSuggestions";
import { parsePourLabel } from "../pourLabel";
import { formatQty } from "../quantity";


// The recipe home — the write path behind the daily "needs a recipe" alerts.
// Two queues, both actioned in-app (the pricing sheet is retired):
//  1. Options needing a recipe — three shapes, not two. A choose-your-spirit
//     option (Bar Mods → "Vegas Bomb") that carries liquor and needs its own
//     recipe; a mixer (Red Bull) that carries none; or a SPIRIT SWAP on a drink
//     that already has a recipe (a Sling poured with Basil Hayden instead of
//     its Bulleit). The server reads which one it looks like and the swap comes
//     pre-filled — confirming is one tap. Everything else is a short form.
//  2. Cocktails needing a recipe — a fixed drink selling with no recipe. Same
//     builder, stored as a whole-product recipe (option label '').
// Backed by GET /admin/bar/recipe-gaps, which re-checks live so classified
// items drop out on their own. Anything done this session sits in an undo list.

type DoneItem = {
  key: string;
  label: string;
  sub: string;
  productId: string;
  optionLabel: string;
  option?: NeedsClassifyOption; // restore target on undo
  cocktail?: MissingRecipe;
};

export default function RecipeBuilder({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [options, setOptions] = useState<NeedsClassifyOption[]>([]);
  const [cocktails, setCocktails] = useState<MissingRecipe[]>([]);
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [done, setDone] = useState<DoneItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // key being written
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [gaps, cat] = await Promise.all([getRecipeGaps(), getCatalog()]);
        if (!live) return;
        setOptions(gaps.needsClassify);
        setCocktails(gaps.missingRecipes);
        setCatalog(cat.filter((s) => s.trackingMode === "variance"));
        setPhase("ready");
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function classifyMixer(o: NeedsClassifyOption) {
    setBusy(o.alertKey);
    setErr(null);
    try {
      await markOptionMixer(o.productId, o.optionLabel, o.productName);
      setOptions((cur) => cur.filter((x) => x.alertKey !== o.alertKey));
      setDone((d) => [
        { key: o.alertKey, label: o.optionLabel, sub: `mixer · under ${o.productName}`, productId: o.productId, optionLabel: o.optionLabel, option: o },
        ...d,
      ]);
    } catch {
      setErr(`Couldn't mark "${o.optionLabel}" a mixer — try again.`);
    } finally {
      setBusy(null);
    }
  }

  async function classifySubstitution(o: NeedsClassifyOption) {
    const sub = o.likelySubstitution;
    if (!sub) return;
    setBusy(o.alertKey);
    setErr(null);
    try {
      await markOptionSubstitution(o.productId, o.optionLabel, o.productName, sub.replacesSkuId, [
        { skuId: sub.skuId, oz: sub.oz },
      ]);
      setOptions((cur) => cur.filter((x) => x.alertKey !== o.alertKey));
      setDone((d) => [
        {
          key: o.alertKey,
          label: o.optionLabel,
          sub: `${sub.skuName} instead of ${sub.replacesSkuName} · under ${o.productName}`,
          productId: o.productId,
          optionLabel: o.optionLabel,
          option: o,
        },
        ...d,
      ]);
    } catch {
      setErr(`Couldn't record the swap for "${o.optionLabel}" — try again.`);
    } finally {
      setBusy(null);
    }
  }

  async function saveOptionRecipe(o: NeedsClassifyOption, components: RecipeComponentInput[]) {
    setBusy(o.alertKey);
    setErr(null);
    try {
      await saveRecipe(o.productId, o.optionLabel, o.productName, components);
      setOptions((cur) => cur.filter((x) => x.alertKey !== o.alertKey));
      setDone((d) => [
        { key: o.alertKey, label: o.optionLabel, sub: `recipe · under ${o.productName}`, productId: o.productId, optionLabel: o.optionLabel, option: o },
        ...d,
      ]);
    } catch {
      setErr(`Couldn't save the recipe for "${o.optionLabel}" — try again.`);
      throw new Error("save failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveCocktailRecipe(c: MissingRecipe, components: RecipeComponentInput[]) {
    setBusy(c.productId);
    setErr(null);
    try {
      await saveRecipe(c.productId, "", c.name, components);
      setCocktails((cur) => cur.filter((x) => x.productId !== c.productId));
      setDone((d) => [
        { key: `product:${c.productId}`, label: c.name, sub: "cocktail recipe", productId: c.productId, optionLabel: "", cocktail: c },
        ...d,
      ]);
    } catch {
      setErr(`Couldn't save the recipe for "${c.name}" — try again.`);
      throw new Error("save failed");
    } finally {
      setBusy(null);
    }
  }

  async function undo(item: DoneItem) {
    setBusy(item.key);
    setErr(null);
    try {
      await unclassifyOption(item.productId, item.optionLabel);
      setDone((d) => d.filter((x) => x.key !== item.key));
      if (item.option) setOptions((cur) => [item.option!, ...cur]);
      else if (item.cocktail) setCocktails((cur) => [item.cocktail!, ...cur]);
    } catch {
      setErr(`Couldn't undo "${item.label}" — try again.`);
    } finally {
      setBusy(null);
    }
  }

  if (phase === "loading") return <div className="lq-center lq-muted">Checking for gaps…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't load the recipe list.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  const nothingToDo = options.length === 0 && cocktails.length === 0;

  return (
    <div className="lq-invlist">
      <h2 className="lq-h2" style={{ textAlign: "left" }}>Recipes</h2>
      <p className="lq-muted lq-upload-hint">
        Add a recipe, confirm a spirit swap, or mark an option as a mixer with no liquor.
      </p>
      {err && <p className="lq-error">{err}</p>}

      {nothingToDo && (
        <div className="lq-center">
          <p className="lq-muted" style={{ maxWidth: 340, textAlign: "center" }}>
            No recipes need review. New ones appear after the daily check.
          </p>
        </div>
      )}

      {options.length > 0 && (
        <>
          <h3 className="lq-cap-title">Options needing a recipe</h3>
          {options.map((o) => (
            <OptionRow
              key={o.alertKey}
              option={o}
              catalog={catalog}
              busy={busy === o.alertKey}
              onMixer={() => void classifyMixer(o)}
              onSubstitution={() => void classifySubstitution(o)}
              onSave={(comps) => saveOptionRecipe(o, comps)}
            />
          ))}
        </>
      )}

      {cocktails.length > 0 && (
        <>
          <h3 className="lq-cap-title" style={{ marginTop: 18 }}>Cocktails needing a recipe</h3>
          {cocktails.map((c) => (
            <CocktailRow
              key={c.productId}
              cocktail={c}
              catalog={catalog}
              busy={busy === c.productId}
              onSave={(comps) => saveCocktailRecipe(c, comps)}
            />
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <h3 className="lq-cap-title" style={{ marginTop: 18 }}>Done this session</h3>
          <p className="lq-muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
            Tap Undo to review an item again.
          </p>
          {done.map((item) => (
            <div key={item.key} className="lq-pw-row">
              <div className="lq-pw-head">
                <span className="lq-invrow-vendor">{item.label}</span>
                <button
                  type="button"
                  className="lq-btn lq-btn-ghost"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  disabled={busy === item.key}
                  onClick={() => void undo(item)}
                >
                  {busy === item.key ? "…" : "Undo"}
                </button>
              </div>
              <div className="lq-pw-sub lq-muted" style={{ fontSize: 12 }}>{item.sub}</div>
            </div>
          ))}
        </>
      )}

      <div className="lq-footer">
        <div className="lq-savestate" />
        <div className="lq-footer-actions">
          <button type="button" className="lq-btn lq-btn-ghost" onClick={onDone}>Home</button>
        </div>
      </div>
    </div>
  );
}

// ── option row: confirm-swap, mark-mixer, or build-recipe ────────────────────
// The swap only leads when the server is confident (see NeedsClassifyOption
// .likelySubstitution). When it isn't — a typo'd label, an upcharge, two rums
// in the parent — this row is exactly what it was before, because a guess
// presented as an answer is worse than no guess.
function OptionRow({
  option,
  catalog,
  busy,
  onMixer,
  onSubstitution,
  onSave,
}: {
  option: NeedsClassifyOption;
  catalog: BarSkuItem[];
  busy: boolean;
  onMixer: () => void;
  onSubstitution: () => void;
  onSave: (components: RecipeComponentInput[]) => Promise<void>;
}) {
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState<RecipeTemplate | null>(null);
  const { templates, category } = useRecipeSuggestions(option.optionLabel, option.productId);
  const sub = option.likelySubstitution;
  return (
    <div className="lq-pw-row">
      <div className="lq-pw-head">
        <span className="lq-invrow-vendor">{option.optionLabel}</span>
        <span className="lq-muted" style={{ fontSize: 12 }}>{option.count}×</span>
      </div>
      <div className="lq-pw-sub lq-muted" style={{ fontSize: 12 }}>under {[category, option.productName].filter(Boolean).join(" → ")}</div>
      {!building && <RecipeSuggestions label={option.optionLabel} templates={templates} busy={busy}
        onUse={(t) => onSave(t.components)} onEdit={(t) => { setDraft(t); setBuilding(true); }} />}
      {sub && !building && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(45, 212, 191, 0.10)",
            border: "1px solid rgba(45, 212, 191, 0.35)",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          Spirit swap? <strong>{formatQty(sub.oz)}oz {sub.skuName}</strong> instead of{" "}
          <strong>{sub.replacesSkuName}</strong>.
        </div>
      )}
      {!building ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {sub && (
            <button
              type="button"
              className="lq-btn lq-btn-primary"
              style={{ padding: "6px 12px", fontSize: 13 }}
              disabled={busy}
              onClick={onSubstitution}
            >
              {busy ? "…" : "Confirm swap"}
            </button>
          )}
          <button
            type="button"
            className={sub || templates.length ? "lq-btn lq-btn-ghost" : "lq-btn lq-btn-primary"}
            style={{ padding: "6px 12px", fontSize: 13 }}
            disabled={busy}
            onClick={() => { setDraft(null); setBuilding(true); }}
          >
            {templates.length ? "Build a different recipe" : "Build recipe"}
          </button>
          <button
            type="button"
            className="lq-btn lq-btn-ghost"
            style={{ padding: "6px 12px", fontSize: 13 }}
            disabled={busy}
            onClick={onMixer}
          >
            {busy ? "…" : "Mark mixer (no liquor)"}
          </button>
        </div>
      ) : (
        <RecipeForm
          label={option.optionLabel}
          labelPourOz={labelPour(option.optionLabel)}
          templates={templates}
          initialTemplate={draft}
          catalog={catalog}
          busy={busy}
          onSave={async (comps) => {
            await onSave(comps);
          }}
          onCancel={() => setBuilding(false)}
        />
      )}
    </div>
  );
}

// The one pour an option's label states ("Tanqueray 2oz" → 2), or null. A
// browser without regex lookbehind (Safari before 16.4) can't run the parser;
// it gets null too, which only means the form asks for the pour.
function labelPour(label: string): number | null {
  try {
    return parsePourLabel(label).oz;
  } catch {
    return null;
  }
}

// ── cocktail row: build-recipe only ──────────────────────────────────────────
// No labelPourOz here: a number in a drink's name ("Margarita 16oz") is often
// its size, and it never says which ingredient it belongs to.
function CocktailRow({
  cocktail,
  catalog,
  busy,
  onSave,
}: {
  cocktail: MissingRecipe;
  catalog: BarSkuItem[];
  busy: boolean;
  onSave: (components: RecipeComponentInput[]) => Promise<void>;
}) {
  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState<RecipeTemplate | null>(null);
  const { templates } = useRecipeSuggestions(cocktail.name, cocktail.productId);
  return (
    <div className="lq-pw-row">
      <div className="lq-pw-head">
        <span className="lq-invrow-vendor">{cocktail.name}</span>
        <span className="lq-muted" style={{ fontSize: 12 }}>{cocktail.category ?? ""}</span>
      </div>
      {!building && <RecipeSuggestions label={cocktail.name} templates={templates} busy={busy}
        onUse={(t) => onSave(t.components)} onEdit={(t) => { setDraft(t); setBuilding(true); }} />}
      {!building ? (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className={templates.length ? "lq-btn lq-btn-ghost" : "lq-btn lq-btn-primary"}
            style={{ padding: "6px 12px", fontSize: 13 }}
            disabled={busy}
            onClick={() => { setDraft(null); setBuilding(true); }}
          >
            {templates.length ? "Build a different recipe" : "Build recipe"}
          </button>
        </div>
      ) : (
        <RecipeForm
          label={cocktail.name}
          templates={templates}
          initialTemplate={draft}
          catalog={catalog}
          busy={busy}
          onSave={async (comps) => {
            await onSave(comps);
          }}
          onCancel={() => setBuilding(false)}
        />
      )}
    </div>
  );
}

// ── the recipe form: components (sku + oz) + reuse prefill ────────────────────
type Draft = { skuId: string; skuName: string; sizeMl: number | null; oz: string };

function RecipeForm({
  label,
  labelPourOz = null,
  templates,
  initialTemplate,
  catalog,
  busy,
  onSave,
  onCancel,
}: {
  label: string;
  /** The pour an OPTION's label states; null for cocktails and unclear labels. */
  labelPourOz?: number | null;
  templates: RecipeTemplate[];
  initialTemplate: RecipeTemplate | null;
  catalog: BarSkuItem[];
  busy: boolean;
  onSave: (components: RecipeComponentInput[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [components, setComponents] = useState<Draft[]>(() => initialTemplate?.components.map((c) => ({
    skuId: c.skuId, skuName: c.skuName, sizeMl: c.sizeMl, oz: String(c.oz),
  })) ?? []);
  const [search, setSearch] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);

  const results =
    search.trim().length >= 2
      ? catalog
          .filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
          .filter((s) => !components.some((c) => c.skuId === s.id))
          .slice(0, 8)
      : [];

  // No guessed pour. A default saves as if someone measured it, and a wrong one
  // skews the expected usage the variance grade is built on (every bottle used
  // to start at 1.5). Only the first bottle of an option whose label states one
  // pour starts filled in. Every other bottle starts empty, and Save asks for
  // its pour. A saved recipe opened here or reused keeps its own numbers.
  function addSku(s: BarSkuItem) {
    setComponents((cur) => [...cur, {
      skuId: s.id, skuName: s.name, sizeMl: s.sizeMl,
      oz: cur.length === 0 && labelPourOz != null ? String(labelPourOz) : "",
    }]);
    setSearch("");
  }
  function setOz(skuId: string, oz: string) {
    setComponents((cur) => cur.map((c) => (c.skuId === skuId ? { ...c, oz } : c)));
  }
  function removeSku(skuId: string) {
    setComponents((cur) => cur.filter((c) => c.skuId !== skuId));
  }
  function prefill(t: RecipeTemplate) {
    setComponents(
      t.components.map((c) => ({ skuId: c.skuId, skuName: c.skuName, sizeMl: c.sizeMl, oz: String(c.oz) })),
    );
  }

  async function submit() {
    setFormErr(null);
    if (components.length === 0) {
      setFormErr("Add at least one bottle.");
      return;
    }
    const payload: RecipeComponentInput[] = [];
    for (const c of components) {
      const oz = Number(c.oz);
      if (!Number.isFinite(oz) || oz <= 0) {
        setFormErr(`Enter a pour size for ${c.skuName}.`);
        return;
      }
      payload.push({ skuId: c.skuId, oz });
    }
    try {
      await onSave(payload);
    } catch {
      /* parent surfaced the error already; keep the form open to retry */
    }
  }

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--lq-line)", paddingTop: 10 }}>
      {templates.length > 0 && components.length === 0 && (
        <div style={{ marginBottom: 10 }}>
          <div className="lq-muted" style={{ fontSize: 12, marginBottom: 4 }}>Reuse an existing recipe:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {templates.map((t) => (
              <button
                key={t.recipeId}
                type="button"
                className="lq-btn lq-btn-ghost"
                style={{ padding: "6px 10px", fontSize: 13 }}
                onClick={() => prefill(t)}
              >
                {t.recipeName ?? label}: {t.components.map((c) => `${formatQty(c.oz)} oz ${c.skuName}`).join(", ")}
              </button>
            ))}
          </div>
        </div>
      )}

      {components.map((c) => (
        <div key={c.skuId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ flex: "1 1 100%", minWidth: 0, fontSize: 16, overflowWrap: "anywhere" }}>
            {c.skuName}
            {c.sizeMl != null ? <span className="lq-muted" style={{ fontSize: 12 }}> ({c.sizeMl}ml)</span> : null}
          </span>
          <input
            className="lq-search"
            inputMode="decimal"
            aria-label={`oz of ${c.skuName}`}
            placeholder="pour"
            value={c.oz}
            onChange={(e) => setOz(c.skuId, e.target.value)}
            style={{ width: 90, minHeight: 48, flex: "0 0 90px", textAlign: "right", padding: "6px 8px" }}
            disabled={busy}
          />
          <span className="lq-muted" style={{ fontSize: 12 }}>oz</span>
          <button
            type="button"
            className="lq-btn lq-btn-ghost"
            style={{ minWidth: 48, padding: "4px 8px", fontSize: 16 }}
            onClick={() => removeSku(c.skuId)}
            disabled={busy}
            aria-label={`remove ${c.skuName}`}
          >
            ✕
          </button>
        </div>
      ))}

      <input
        className="lq-search"
        placeholder="Add a bottle…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginTop: 6 }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {results.map((s) => (
          <button
            key={s.id}
            type="button"
            className="lq-btn lq-btn-ghost"
            style={{ padding: "6px 10px", fontSize: 13 }}
            onClick={() => addSku(s)}
          >
            + {s.name}
            {s.sizeMl != null ? ` (${s.sizeMl}ml)` : ""}
          </button>
        ))}
        {search.trim().length >= 2 && results.length === 0 && (
          <span className="lq-muted" style={{ fontSize: 13 }}>No bottle matches that.</span>
        )}
      </div>

      {formErr && <p className="lq-error" style={{ marginTop: 8 }}>{formErr}</p>}

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          type="button"
          className="lq-btn lq-btn-primary"
          style={{ padding: "6px 14px", fontSize: 13 }}
          disabled={busy || components.length === 0}
          onClick={() => void submit()}
        >
          {busy ? "Saving…" : "Save recipe"}
        </button>
        <button
          type="button"
          className="lq-btn lq-btn-ghost"
          style={{ padding: "6px 14px", fontSize: 13 }}
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
