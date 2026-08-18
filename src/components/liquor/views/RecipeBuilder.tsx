import { useEffect, useState } from "react";
import {
  getCatalog,
  getRecipeGaps,
  getRecipeTemplates,
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
      <p className="lq-muted lq-upload-hint">
        Drinks and options selling with no recipe, so their liquor isn't attributed. Give each one a
        recipe, mark an option a mixer if it pours no liquor, or confirm a swap where one spirit went
        in instead of another.
      </p>
      {err && <p className="lq-error">{err}</p>}

      {nothingToDo && (
        <div className="lq-center">
          <p className="lq-muted" style={{ maxWidth: 340, textAlign: "center" }}>
            Nothing needs a recipe right now. New ones show up here after the daily check finds them.
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
            Classified just now. Tap Undo to send one back to the list above.
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
  const sub = option.likelySubstitution;
  return (
    <div className="lq-pw-row">
      <div className="lq-pw-head">
        <span className="lq-invrow-vendor">{option.optionLabel}</span>
        <span className="lq-muted" style={{ fontSize: 12 }}>{option.count}×</span>
      </div>
      <div className="lq-pw-sub lq-muted" style={{ fontSize: 12 }}>under {option.productName}</div>
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
          Looks like a swap: <strong>{sub.skuName}</strong> poured instead of{" "}
          <strong>{sub.replacesSkuName}</strong> {sub.oz}oz.
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
            className={sub ? "lq-btn lq-btn-ghost" : "lq-btn lq-btn-primary"}
            style={{ padding: "6px 12px", fontSize: 13 }}
            disabled={busy}
            onClick={() => setBuilding(true)}
          >
            Build recipe
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

// ── cocktail row: build-recipe only ──────────────────────────────────────────
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
  return (
    <div className="lq-pw-row">
      <div className="lq-pw-head">
        <span className="lq-invrow-vendor">{cocktail.name}</span>
        <span className="lq-muted" style={{ fontSize: 12 }}>{cocktail.category ?? ""}</span>
      </div>
      {!building ? (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            className="lq-btn lq-btn-primary"
            style={{ padding: "6px 12px", fontSize: 13 }}
            disabled={busy}
            onClick={() => setBuilding(true)}
          >
            Build recipe
          </button>
        </div>
      ) : (
        <RecipeForm
          label={cocktail.name}
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
  catalog,
  busy,
  onSave,
  onCancel,
}: {
  label: string;
  catalog: BarSkuItem[];
  busy: boolean;
  onSave: (components: RecipeComponentInput[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [components, setComponents] = useState<Draft[]>([]);
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<RecipeTemplate[]>([]);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getRecipeTemplates(label)
      .then((t) => {
        if (live) setTemplates(t);
      })
      .catch(() => {
        /* reuse is a nicety — a failure just means no prefill offered */
      });
    return () => {
      live = false;
    };
  }, [label]);

  const results =
    search.trim().length >= 2
      ? catalog
          .filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
          .filter((s) => !components.some((c) => c.skuId === s.id))
          .slice(0, 8)
      : [];

  function addSku(s: BarSkuItem) {
    setComponents((cur) => [...cur, { skuId: s.id, skuName: s.name, sizeMl: s.sizeMl, oz: "1.5" }]);
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
                {t.productName ?? "recipe"} ({t.components.length})
              </button>
            ))}
          </div>
        </div>
      )}

      {components.map((c) => (
        <div key={c.skuId} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ flex: 1, fontSize: 14 }}>
            {c.skuName}
            {c.sizeMl != null ? <span className="lq-muted" style={{ fontSize: 12 }}> ({c.sizeMl}ml)</span> : null}
          </span>
          <input
            className="lq-search"
            inputMode="decimal"
            aria-label={`oz of ${c.skuName}`}
            value={c.oz}
            onChange={(e) => setOz(c.skuId, e.target.value)}
            style={{ width: 68, textAlign: "right", padding: "6px 8px" }}
          />
          <span className="lq-muted" style={{ fontSize: 12 }}>oz</span>
          <button
            type="button"
            className="lq-btn lq-btn-ghost"
            style={{ padding: "4px 8px", fontSize: 13 }}
            onClick={() => removeSku(c.skuId)}
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
