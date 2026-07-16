import { useEffect, useState } from "react";
import { getPourCosts, type PourCostRow } from "../api";

// Pour-cost report — recipe spirit cost (live, invoice-updated) ÷ GoTab menu
// price per cocktail, worst margin first. Ceiling comes from the backend
// (19% per the pricing philosophy: a ceiling, not a midpoint). Tap a row to
// see the per-bottle component costs. Spirit-only basis, same as the pricing
// model — garnish/mixers aren't counted, so true cost runs slightly higher.

const money = (n: number) => `$${n.toFixed(2)}`;

export default function PourCosts({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [ceiling, setCeiling] = useState(19);
  const [rows, setRows] = useState<PourCostRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await getPourCosts();
        if (live) {
          setCeiling(r.ceiling);
          setRows(r.rows);
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

  if (phase === "loading") return <div className="lq-center lq-muted">Computing pour costs…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't load pour costs.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  const over = rows.filter((r) => r.overCeiling).length;

  return (
    <div className="lq-invlist">
      <p className="lq-muted lq-upload-hint">
        Live spirit cost ÷ menu price per cocktail — target ceiling {ceiling}%.
        Costs update with every scanned invoice. {over > 0 ? `${over} over the ceiling.` : "All under the ceiling."}
      </p>
      {rows.length === 0 ? (
        <div className="lq-center">
          <p className="lq-muted" style={{ maxWidth: 320, textAlign: "center" }}>
            No recipes seeded yet — once bar_recipe has rows, every cocktail shows its live margin here.
          </p>
        </div>
      ) : (
        rows.map((r) => {
          const isOpen = open === r.productId;
          const pctTxt = r.pourCostPct != null ? `${r.pourCostPct.toFixed(1)}%` : "—";
          return (
            <div key={r.productId} className="lq-pw-row" onClick={() => setOpen(isOpen ? null : r.productId)}>
              <div className="lq-pw-head">
                <span className="lq-invrow-vendor">
                  {r.name}
                  {r.incomplete && <span className="lq-muted"> · cost incomplete</span>}
                </span>
                <span className={`lq-pw-pct ${r.overCeiling ? "lq-pw-up" : "lq-pw-down"}`}>
                  {r.overCeiling ? "▲ " : ""}{pctTxt}
                </span>
              </div>
              <div className="lq-pw-sub lq-muted">
                {money(r.costUsd)} cost{r.priceUsd != null ? ` ÷ ${money(r.priceUsd)} menu` : " · no menu price found"}
              </div>
              {isOpen && (
                <div className="lq-pw-sub" style={{ marginTop: 6 }}>
                  {r.components.map((c, i) => (
                    <div key={i} className="lq-muted">
                      {c.oz}oz {c.skuName} — {c.costUsd != null ? money(c.costUsd) : "no cost/size on file"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
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
