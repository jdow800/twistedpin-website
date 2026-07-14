import type { BarActor } from "../api";

type Dest = "count" | "keg" | "upload";

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
        <button type="button" className="lq-action" onClick={() => onGo("upload")}>
          <span className="lq-action-emoji" aria-hidden="true">🧾</span>
          <span className="lq-action-title">Upload invoice</span>
          <span className="lq-action-sub">Snap the pages — we read it</span>
        </button>
      </div>
    </div>
  );
}
