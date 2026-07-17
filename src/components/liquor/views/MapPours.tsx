import { useEffect, useMemo, useState } from "react";
import {
  addSkuAlias,
  getCatalog,
  getRecipeGaps,
  type BarSkuItem,
  type MissingRecipe,
  type UnmappedPour,
} from "../api";
import { matchSkus } from "../matcher";

// The fix-it queue behind the daily recipe alerts. Two sections:
//  1. Unmapped pours — spirit option labels ("Buffalo Trace (1.5oz)") whose
//     bottle text doesn't match any catalog bottle. Suggestions come from the
//     same fuzzy matcher the voice count uses; one tap writes the alias and
//     every future sale of that button attributes correctly.
//  2. Missing recipes — cocktails selling with no recipe. Read-only here:
//     recipes live in the pricing sheet (02-Inputs-Recipes) and get re-seeded.
// Backed by GET /admin/bar/recipe-gaps, which re-checks the alert ledger live
// so fixed items disappear on their own.

export default function MapPours({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [pours, setPours] = useState<UnmappedPour[]>([]);
  const [missing, setMissing] = useState<MissingRecipe[]>([]);
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [searchFor, setSearchFor] = useState<string | null>(null); // alertKey with open search
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // alertKey being written
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [gaps, cat] = await Promise.all([getRecipeGaps(), getCatalog()]);
        if (live) {
          setPours(gaps.pours);
          setMissing(gaps.missingRecipes);
          setCatalog(cat.filter((s) => s.trackingMode === "variance"));
          setPhase("ready");
        }
      } catch {
        if (live) setPhase("error");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const suggestions = useMemo(() => {
    const map = new Map<string, BarSkuItem[]>();
    for (const p of pours) {
      map.set(
        p.alertKey,
        matchSkus(p.bottleText, catalog, 3).map((c) => c.sku),
      );
    }
    return map;
  }, [pours, catalog]);

  async function mapPour(p: UnmappedPour, sku: BarSkuItem) {
    setBusy(p.alertKey);
    setErr(null);
    try {
      await addSkuAlias(sku.id, p.bottleText);
      setPours((cur) => cur.filter((x) => x.alertKey !== p.alertKey));
      setSearchFor(null);
      setSearch("");
    } catch {
      setErr(`Couldn't save the mapping for "${p.bottleText}" — try again.`);
    } finally {
      setBusy(null);
    }
  }

  if (phase === "loading") return <div className="lq-center lq-muted">Checking for gaps…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't load the gap list.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  const searchResults =
    searchFor && search.trim().length >= 2
      ? catalog.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8)
      : [];

  return (
    <div className="lq-invlist">
      <p className="lq-muted lq-upload-hint">
        Pour buttons that don't match a bottle yet. Tap the right bottle once and every sale of
        that button counts toward it from then on.
      </p>
      {err && <p className="lq-error">{err}</p>}

      {pours.length === 0 ? (
        <div className="lq-center">
          <p className="lq-muted" style={{ maxWidth: 320, textAlign: "center" }}>
            No unmapped pours — every spirit button currently resolves to a bottle. New ones show
            up here after the daily check finds them.
          </p>
        </div>
      ) : (
        pours.map((p) => {
          const sugg = suggestions.get(p.alertKey) ?? [];
          const isOpen = searchFor === p.alertKey;
          return (
            <div key={p.alertKey} className="lq-pw-row">
              <div className="lq-pw-head">
                <span className="lq-invrow-vendor">{p.label}</span>
                <span className="lq-muted" style={{ fontSize: 12 }}>{p.count}×</span>
              </div>
              {p.products.length > 0 && (
                <div className="lq-pw-sub lq-muted" style={{ fontSize: 12 }}>
                  sold on {p.products.join(", ")}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {sugg.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="lq-btn lq-btn-ghost"
                    style={{ padding: "6px 10px", fontSize: 13 }}
                    disabled={busy === p.alertKey}
                    onClick={() => void mapPour(p, s)}
                  >
                    → {s.name}
                    {s.sizeMl != null ? ` (${s.sizeMl}ml)` : ""}
                  </button>
                ))}
                <button
                  type="button"
                  className="lq-btn lq-btn-ghost"
                  style={{ padding: "6px 10px", fontSize: 13 }}
                  onClick={() => {
                    setSearchFor(isOpen ? null : p.alertKey);
                    setSearch("");
                  }}
                >
                  {isOpen ? "✕ cancel" : "Search…"}
                </button>
              </div>
              {isOpen && (
                <div style={{ marginTop: 8 }}>
                  <input
                    className="lq-search"
                    placeholder="Find the bottle…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {searchResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="lq-btn lq-btn-ghost"
                        style={{ padding: "6px 10px", fontSize: 13 }}
                        disabled={busy === p.alertKey}
                        onClick={() => void mapPour(p, s)}
                      >
                        → {s.name}
                        {s.sizeMl != null ? ` (${s.sizeMl}ml)` : ""}
                      </button>
                    ))}
                    {search.trim().length >= 2 && searchResults.length === 0 && (
                      <span className="lq-muted" style={{ fontSize: 13 }}>
                        Nothing matches — a brand-new bottle appears here after its first invoice.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {missing.length > 0 && (
        <>
          <h3 className="lq-cap-title" style={{ marginTop: 18 }}>Need a recipe (fix in the sheet)</h3>
          <p className="lq-muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
            These sell with no recipe, so their liquor can't be attributed. Add them to
            02-Inputs-Recipes in the pricing sheet and re-seed.
          </p>
          {missing.map((m) => (
            <div key={m.productId} className="lq-pw-row">
              <div className="lq-pw-head">
                <span className="lq-invrow-vendor">{m.name}</span>
                <span className="lq-muted" style={{ fontSize: 12 }}>{m.category ?? ""}</span>
              </div>
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
