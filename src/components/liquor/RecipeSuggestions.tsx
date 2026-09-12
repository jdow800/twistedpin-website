import { useEffect, useState } from "react";
import { getRecipeTemplateSuggestions, type RecipeTemplate } from "./api";

export function useRecipeSuggestions(label: string, productId: string) {
  const [templates, setTemplates] = useState<RecipeTemplate[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setTemplates([]);
    setCategory(null);
    getRecipeTemplateSuggestions(label, productId).then((result) => {
      if (live) { setTemplates(result.matches); setCategory(result.targetCategory ?? null); }
    }).catch(() => { /* manual recipe entry remains available */ });
    return () => { live = false; };
  }, [label, productId]);
  return { templates, category };
}

/** Show the saved pours before the confirmation writes this menu's mapping. */
export function RecipeSuggestions({ label, templates, busy, onUse, onEdit }: {
  label: string; templates: RecipeTemplate[]; busy: boolean;
  onUse: (template: RecipeTemplate) => Promise<void>;
  onEdit: (template: RecipeTemplate) => void;
}) {
  if (!templates.length) return null;
  return <div className="lq-recipe-suggestions" aria-label={`Saved recipes for ${label}`}>
    {templates.map((template) => <div className="lq-recipe-suggestion" key={template.recipeId}>
      <strong>Saved inventory recipe: {template.recipeName ?? label}</strong>
      <div className="lq-muted lq-recipe-source">
        Saved under {template.sources?.map((s) => [s.categoryName, s.productName].filter(Boolean).join(" → ")).join("; ") || template.productName || "another menu item"}
      </div>
      <ul>{template.components.map((c) => <li key={c.skuId}>
        {c.oz} oz {c.skuName}{c.sizeMl != null ? ` (${c.sizeMl} ml bottle)` : ""}
      </li>)}</ul>
      <div className="lq-recipe-actions">
        <button type="button" className="lq-btn lq-btn-primary" disabled={busy}
          onClick={() => { void onUse(template).catch(() => {}); }}>
          {busy ? "Saving…" : "Use this recipe"}
        </button>
        <button type="button" className="lq-btn lq-btn-ghost" disabled={busy} onClick={() => onEdit(template)}>Edit first</button>
      </div>
    </div>)}
  </div>;
}
