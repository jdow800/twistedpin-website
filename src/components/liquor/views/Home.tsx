import type { BarActor } from "../api";

type Dest = "count" | "keg" | "empties" | "upload" | "invoices" | "counts" | "pricewatch" | "pourcosts" | "mappours";

export default function Home({
  actor,
  onGo,
}: {
  actor: BarActor;
  onGo: (dest: Dest) => void;
}) {
  const first = actor.displayName.split(" ")[0] ?? actor.displayName;
  return (
    <div className="lq-home">
      <p className="lq-hi">Hi, {first}.</p>
      <div className="lq-actions">
        <button type="button" className="lq-action" onClick={() => onGo("count")}>
          <span className="lq-action-emoji" aria-hidden="true">🥃</span>
          <span className="lq-action-title">Count liquor</span>
          <span className="lq-action-sub">Bottles by zone — voice or tap</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("keg")}>
          <span className="lq-action-emoji" aria-hidden="true">🛢️</span>
          <span className="lq-action-title">Count kegs</span>
          <span className="lq-action-sub">Backup / untapped kegs</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("empties")}>
          <span className="lq-action-emoji" aria-hidden="true">♻️</span>
          <span className="lq-action-title">Empty kegs</span>
          <span className="lq-action-sub">What's piling up out back</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("upload")}>
          <span className="lq-action-emoji" aria-hidden="true">🧾</span>
          <span className="lq-action-title">Upload invoice</span>
          <span className="lq-action-sub">Snap the pages — we read it</span>
        </button>

        <p className="lq-section-label">Review</p>
        <button type="button" className="lq-action" onClick={() => onGo("invoices")}>
          <span className="lq-action-emoji" aria-hidden="true">📁</span>
          <span className="lq-action-title">Recent invoices</span>
          <span className="lq-action-sub">What we've read — last 60 days</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("counts")}>
          <span className="lq-action-emoji" aria-hidden="true">📋</span>
          <span className="lq-action-title">Recent counts</span>
          <span className="lq-action-sub">Submitted inventories</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("pricewatch")}>
          <span className="lq-action-emoji" aria-hidden="true">📈</span>
          <span className="lq-action-title">Price watch</span>
          <span className="lq-action-sub">Bottles whose $/oz jumped 5%+</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("pourcosts")}>
          <span className="lq-action-emoji" aria-hidden="true">🍸</span>
          <span className="lq-action-title">Pour cost</span>
          <span className="lq-action-sub">Cocktail margins vs the 19% ceiling</span>
        </button>
        <button type="button" className="lq-action" onClick={() => onGo("mappours")}>
          <span className="lq-action-emoji" aria-hidden="true">🔗</span>
          <span className="lq-action-title">Map pours</span>
          <span className="lq-action-sub">Match spirit buttons to bottles</span>
        </button>
      </div>
    </div>
  );
}
