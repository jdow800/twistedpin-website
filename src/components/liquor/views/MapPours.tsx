import { useEffect, useMemo, useState } from "react";
import {
  addSkuAlias,
  getAutoAliases,
  getCatalog,
  getRecipeGaps,
  revertAutoAlias,
  type AutoAlias,
  type BarSkuItem,
  type UnmappedPour,
} from "../api";
import { matchSkus } from "../matcher";

// The pour-mapping fix-it queue. Two sections:
//  1. Unmapped pours — spirit option labels ("Buffalo Trace (1.5oz)") whose
//     bottle text doesn't match any catalog bottle. Suggestions come from the
//     same fuzzy matcher the voice count uses; one tap writes the alias and
//     every future sale of that button attributes correctly.
//  2. Mapped automatically — labels the daily check resolved on its own because
//     they covered exactly one bottle. Nothing to do unless one is WRONG, which
//     is the point of showing them: the matcher can't detect the case where the
//     right bottle simply isn't in the catalog yet (a "Jameson" button landing
//     on Jameson Orange), so a human has to be able to see and undo it.
// Backed by GET /admin/bar/recipe-gaps, which re-checks the alert ledger live
// so fixed items disappear on their own. (Products/options that need a RECIPE
// live in the Recipes view, not here — this screen is only bottle mapping.)

export default function MapPours({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [pours, setPours] = useState<UnmappedPour[]>([]);
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [autos, setAutos] = useState<AutoAlias[]>([]);
  const [searchFor, setSearchFor] = useState<string | null>(null); // alertKey with open search
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // alertKey being written
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // Auto-aliases are supplementary — a failure there must not blank the
        // whole fix-it queue, so it degrades to an empty list.
        const [gaps, cat, auto] = await Promise.all([
          getRecipeGaps(),
          getCatalog(),
          getAutoAliases().catch(() => [] as AutoAlias[]),
        ]);
        if (live) {
          setPours(gaps.pours);
          setCatalog(cat.filter((s) => s.trackingMode === "variance"));
          setAutos(auto);
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

  async function undoAuto(a: AutoAlias) {
    setBusy(a.id);
    setErr(null);
    try {
      await revertAutoAlias(a.id);
      setAutos((cur) => cur.filter((x) => x.id !== a.id));
      // It reappears in the unmapped queue after the next daily check, now
      // permanently exempt from auto-mapping so this correction sticks.
    } catch {
      setErr(`Couldn't undo the mapping for "${a.sourceLabel}" — try again.`);
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

      {autos.length > 0 && (
        <>
          <h3 className="lq-cap-title" style={{ marginTop: 18 }}>Mapped automatically</h3>
          <p className="lq-muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
            These matched exactly one bottle, so the daily check mapped them for you. Nothing to do
            — unless one is wrong. Undo sends it back to the list above and stops it being
            auto-mapped again.
          </p>
          {autos.map((a) => (
            <div key={a.id} className="lq-pw-row">
              <div className="lq-pw-head">
                <span className="lq-invrow-vendor">{a.sourceLabel}</span>
                <button
                  type="button"
                  className="lq-btn lq-btn-ghost"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  disabled={busy === a.id}
                  onClick={() => void undoAuto(a)}
                >
                  {busy === a.id ? "…" : "Undo"}
                </button>
              </div>
              <div className="lq-pw-sub lq-muted" style={{ fontSize: 12 }}>
                → {a.skuName}
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
