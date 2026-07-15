import { useEffect, useState } from "react";
import { getPriceWatch, type PriceMover } from "../api";

// Read-only price-watch report — liquor SKUs whose per-ounce cost moved >=5%
// between their two most recent invoices. Per-ounce so bottle sizes compare
// honestly. Cost UP is flagged (bad); cost DOWN reads as a win.

const money = (n: number) => `$${n.toFixed(2)}`;
const perOz = (n: number) => `$${n.toFixed(2)}/oz`;
function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PriceWatch({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [movers, setMovers] = useState<PriceMover[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const m = await getPriceWatch();
        if (live) {
          setMovers(m);
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

  if (phase === "loading") return <div className="lq-center lq-muted">Checking prices…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't load price watch.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  return (
    <div className="lq-invlist">
      <p className="lq-muted lq-upload-hint">
        Bottles whose cost-per-ounce moved 5%+ since the prior invoice. Fills in as invoices come in.
      </p>
      {movers.length === 0 ? (
        <div className="lq-center">
          <p className="lq-muted" style={{ maxWidth: 320, textAlign: "center" }}>
            No price moves of 5%+ yet. Upload a few invoices and this flags any bottle that jumps.
          </p>
        </div>
      ) : (
        movers.map((m) => {
          const up = m.pct > 0;
          return (
            <div key={m.skuId} className="lq-pw-row">
              <div className="lq-pw-head">
                <span className="lq-invrow-vendor">
                  {m.name} <span className="lq-muted">· {m.sizeMl}ml</span>
                </span>
                <span className={`lq-pw-pct ${up ? "lq-pw-up" : "lq-pw-down"}`}>
                  {up ? "▲" : "▼"} {up ? "+" : ""}{m.pct}%
                </span>
              </div>
              <div className="lq-pw-sub lq-muted">
                {perOz(m.oldPpo)} → <strong>{perOz(m.newPpo)}</strong>
                {"  ·  "}bottle {money(m.oldCost)} → {money(m.newCost)}
                {"  ·  "}since {shortDate(m.oldAt)}
              </div>
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
