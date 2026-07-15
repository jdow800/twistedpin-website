import { useEffect, useState } from "react";
import {
  getCountHistory,
  getCountDetail,
  getKegCountHistory,
  getKegCountDetail,
  type CountSummary,
  type CountDetail,
  type KegCountSummary,
  type KegCountDetail,
} from "../api";

// Read-only inventory history — recent submitted liquor counts (per-zone
// breakdown) and keg counts (by category), toggled.

const CAT: Record<string, string> = {
  beer: "Beer", red_wine: "Red wine", white_wine: "White wine", non_alcoholic: "N/A", other: "Other",
};

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

type Mode = "liquor" | "kegs";
type Detail = { kind: "liquor"; data: CountDetail } | { kind: "kegs"; data: KegCountDetail } | null;

export default function Counts({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [mode, setMode] = useState<Mode>("liquor");
  const [liquor, setLiquor] = useState<CountSummary[]>([]);
  const [kegs, setKegs] = useState<KegCountSummary[]>([]);
  const [detail, setDetail] = useState<Detail>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [lq, kg] = await Promise.all([getCountHistory(), getKegCountHistory().catch(() => [])]);
        if (live) {
          setLiquor(lq);
          setKegs(kg);
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

  async function openLiquor(id: string) {
    setDetailLoading(true);
    try {
      setDetail({ kind: "liquor", data: await getCountDetail(id) });
    } catch {
      /* keep list */
    } finally {
      setDetailLoading(false);
    }
  }
  async function openKeg(id: string) {
    setDetailLoading(true);
    try {
      setDetail({ kind: "kegs", data: await getKegCountDetail(id) });
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

  // ── liquor detail (per zone) ──
  if (detail?.kind === "liquor") {
    const s = detail.data.session;
    let lastZone: string | null = null;
    return (
      <div className="lq-invd">
        <button type="button" className="lq-back" onClick={() => setDetail(null)}>‹ All counts</button>
        <h2 className="lq-h2" style={{ textAlign: "left" }}>{s.isFullCount ? "Full inventory" : "Partial count"}</h2>
        <p className="lq-muted lq-invd-meta">
          {when(s.submittedAt || s.startedAt)}{s.countedBy ? ` · ${s.countedBy}` : ""} · {detail.data.lines.length} line{detail.data.lines.length === 1 ? "" : "s"}
        </p>
        {detail.data.lines.length === 0 ? (
          <p className="lq-muted">No lines recorded.</p>
        ) : (
          <div className="lq-invd-lines">
            {detail.data.lines.map((l) => {
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

  // ── keg detail (by category) ──
  if (detail?.kind === "kegs") {
    const s = detail.data.session;
    let lastCat: string | null = null;
    const total = detail.data.lines.reduce((n, l) => n + l.qty, 0);
    return (
      <div className="lq-invd">
        <button type="button" className="lq-back" onClick={() => setDetail(null)}>‹ All counts</button>
        <h2 className="lq-h2" style={{ textAlign: "left" }}>Backup kegs</h2>
        <p className="lq-muted lq-invd-meta">
          {when(s.submittedAt || s.startedAt)}{s.countedBy ? ` · ${s.countedBy}` : ""} · {total} keg{total === 1 ? "" : "s"}
        </p>
        {detail.data.lines.length === 0 ? (
          <p className="lq-muted">No kegs recorded.</p>
        ) : (
          <div className="lq-invd-lines">
            {detail.data.lines.map((l, i) => {
              const catHeader = l.category !== lastCat;
              lastCat = l.category;
              return (
                <div key={`${l.kegName}:${i}`}>
                  {catHeader && <h3 className="lq-cap-title">{CAT[l.category] ?? l.category}</h3>}
                  <div className="lq-invd-line">
                    <div className="lq-invd-line-main">
                      <span className="lq-invd-desc">{l.kegName}</span>
                      <span className="lq-invd-amt">{l.qty}</span>
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

  // ── list (toggle liquor / kegs) ──
  return (
    <div className="lq-invlist">
      <div className="lq-segbar" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "liquor"} className={`lq-seg${mode === "liquor" ? " lq-seg-on" : ""}`} onClick={() => setMode("liquor")}>Liquor</button>
        <button type="button" role="tab" aria-selected={mode === "kegs"} className={`lq-seg${mode === "kegs" ? " lq-seg-on" : ""}`} onClick={() => setMode("kegs")}>Kegs</button>
      </div>

      {mode === "liquor" ? (
        liquor.length === 0 ? (
          <div className="lq-center"><p className="lq-muted">No liquor counts submitted yet.</p></div>
        ) : (
          liquor.map((c) => (
            <button key={c.id} type="button" className="lq-invrow" onClick={() => openLiquor(c.id)} disabled={detailLoading}>
              <div className="lq-invrow-main">
                <span className="lq-invrow-vendor">{c.isFullCount ? "Full inventory" : "Partial count"}</span>
                <span className="lq-badge lq-badge-confirmed">{c.lineCount} line{c.lineCount === 1 ? "" : "s"}</span>
              </div>
              <div className="lq-invrow-sub lq-muted">{when(c.submittedAt)}{c.countedBy ? ` · ${c.countedBy}` : ""}</div>
            </button>
          ))
        )
      ) : kegs.length === 0 ? (
        <div className="lq-center"><p className="lq-muted">No keg counts submitted yet.</p></div>
      ) : (
        kegs.map((c) => (
          <button key={c.id} type="button" className="lq-invrow" onClick={() => openKeg(c.id)} disabled={detailLoading}>
            <div className="lq-invrow-main">
              <span className="lq-invrow-vendor">Backup kegs</span>
              <span className="lq-badge lq-badge-confirmed">{c.totalKegs} keg{c.totalKegs === 1 ? "" : "s"}</span>
            </div>
            <div className="lq-invrow-sub lq-muted">{when(c.submittedAt)}{c.countedBy ? ` · ${c.countedBy}` : ""}</div>
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
