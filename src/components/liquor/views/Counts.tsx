import { useEffect, useState } from "react";
import { getCountHistory, getCountDetail, type CountSummary, type CountDetail } from "../api";

// Read-only completed-inventory history — recent submitted liquor counts + a
// per-zone breakdown of what was counted.

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}
const qty = (s: string) => {
  const n = Number(s);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

export default function Counts({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [list, setList] = useState<CountSummary[]>([]);
  const [detail, setDetail] = useState<CountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const c = await getCountHistory();
        if (live) {
          setList(c);
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

  async function open(id: string) {
    setDetailLoading(true);
    try {
      setDetail(await getCountDetail(id));
    } catch {
      /* keep list */
    } finally {
      setDetailLoading(false);
    }
  }

  if (phase === "loading") return <div className="lq-center lq-muted">Loading counts…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't load counts.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  // ── detail ──
  if (detail) {
    const s = detail.session;
    let lastZone: string | null = null;
    return (
      <div className="lq-invd">
        <button type="button" className="lq-back" onClick={() => setDetail(null)}>‹ All counts</button>
        <h2 className="lq-h2" style={{ textAlign: "left" }}>{s.isFullCount ? "Full inventory" : "Partial count"}</h2>
        <p className="lq-muted lq-invd-meta">
          {when(s.submittedAt || s.startedAt)}{s.countedBy ? ` · ${s.countedBy}` : ""} · {detail.lines.length} line{detail.lines.length === 1 ? "" : "s"}
        </p>
        {detail.lines.length === 0 ? (
          <p className="lq-muted">No lines recorded.</p>
        ) : (
          <div className="lq-invd-lines">
            {detail.lines.map((l) => {
              const zoneHeader = l.zoneName !== lastZone;
              lastZone = l.zoneName;
              return (
                <div key={`${l.zoneId}:${l.skuId}`}>
                  {zoneHeader && <h3 className="lq-cap-title">{l.zoneName ?? "—"}</h3>}
                  <div className="lq-invd-line">
                    <div className="lq-invd-line-main">
                      <span className="lq-invd-desc">
                        {l.source === "voice" && <span aria-hidden="true">🎤 </span>}
                        {l.skuName ?? "—"}
                        {l.sizeMl != null && <span className="lq-muted"> · {l.sizeMl}ml</span>}
                      </span>
                      <span className="lq-invd-amt">{qty(l.qtyUnits)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── list ──
  return (
    <div className="lq-invlist">
      <p className="lq-muted lq-upload-hint">Submitted inventories, last 90 days — tap one for the breakdown.</p>
      {list.length === 0 ? (
        <div className="lq-center"><p className="lq-muted">No counts submitted yet.</p></div>
      ) : (
        list.map((c) => (
          <button key={c.id} type="button" className="lq-invrow" onClick={() => open(c.id)} disabled={detailLoading}>
            <div className="lq-invrow-main">
              <span className="lq-invrow-vendor">{c.isFullCount ? "Full inventory" : "Partial count"}</span>
              <span className="lq-badge lq-badge-confirmed">{c.lineCount} line{c.lineCount === 1 ? "" : "s"}</span>
            </div>
            <div className="lq-invrow-sub lq-muted">
              {when(c.submittedAt)}{c.countedBy ? ` · ${c.countedBy}` : ""}
            </div>
          </button>
        ))
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
