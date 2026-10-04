import { useEffect, useRef, useState } from "react";
import {
  getCountHistory,
  getCountDetail,
  getKegCountHistory,
  getKegCountDetail,
  getCountVariance,
  finalizeCountReport,
  type CountSummary,
  type CountDetail,
  type KegCountSummary,
  type KegCountDetail,
  type VarianceReport,
  type Section,
} from "../api";
import { VarianceLines } from "../VarianceLines";
import { CorrectionEditor, CorrectionHistory } from "../CountCorrections";
import { formatQty } from "../quantity";


// Read-only inventory history — recent submitted liquor counts (per-zone
// breakdown) and keg counts (by category), toggled. Full counts also show
// their variance report (grade + per-bottle loss) once the worker writes it.

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
const qty = formatQty;

type Mode = "liquor" | "kegs";
type Detail = { kind: "liquor"; data: CountDetail } | { kind: "kegs"; data: KegCountDetail } | null;

export default function Counts({
  onDone,
  initialCountId,
  section = "bar",
}: {
  onDone: () => void;
  /** From an email deep link (?count=<id>) — open THAT count's detail straight
   *  away, including its variance table, instead of landing on a list the
   *  reader has to search. Mirrors Invoices' initialInvoiceId. */
  initialCountId?: string | null;
  section?: Section;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [mode, setMode] = useState<Mode>("liquor");
  const [liquor, setLiquor] = useState<CountSummary[]>([]);
  const [kegs, setKegs] = useState<KegCountSummary[]>([]);
  const [detail, setDetail] = useState<Detail>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [variance, setVariance] = useState<VarianceReport | null>(null);
  const [showVarianceLines, setShowVarianceLines] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const openedDeepLink = useRef(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [lq, kg] = await Promise.all([getCountHistory(section), section === "bar" ? getKegCountHistory().catch(() => []) : Promise.resolve([])]);
        if (live) {
          setLiquor(lq);
          setKegs(kg);
          setPhase("ready");
          // Consumed once per mount. A stale or purged id falls through to the
          // list quietly rather than erroring — same contract as ?invoice=.
          if (initialCountId && !openedDeepLink.current) {
            openedDeepLink.current = true;
            void openLiquor(initialCountId);
          }
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
    setVariance(null);
    setFinalizeError(null);
    setShowVarianceLines(false);
    setCorrecting(false);
    try {
      const d = await getCountDetail(id);
      const v = (d.session.section ?? section) === "bar" && d.session.status !== "draft" ? await getCountVariance(id).catch(() => null) : null;
      setDetail({ kind: "liquor", data: d });
      setVariance(v);
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
    const foodCount = (s.section ?? section) === "food";
    let lastZone: string | null = null;
    return (
      <div className="lq-invd">
        <button type="button" className="lq-back" onClick={() => setDetail(null)}>‹ All counts</button>
        <h2 className="lq-h2" style={{ textAlign: "left" }}>{s.isFullCount ? "Full inventory" : "Partial count"}</h2>
        {s.status === "draft" && <p className="lq-muted" role="status">Draft · read only</p>}
        <p className="lq-muted lq-invd-meta">
          {when(s.submittedAt || s.startedAt)}{s.countedBy ? ` · ${s.countedBy}` : ""} · {detail.data.lines.length} line{detail.data.lines.length === 1 ? "" : "s"}
        </p>

        {/* After the lock: what was corrected, and the admin's way to correct it
            (CountCorrections.tsx). Only the latest full count can be corrected. */}
        <CorrectionHistory corrections={detail.data.corrections ?? []} />
        {!foodCount && s.status !== "draft" && detail.data.canCorrect && !correcting && (
          <button type="button" className="lq-btn lq-btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }}
            onClick={() => setCorrecting(true)}>
            Correct this count
          </button>
        )}
        {correcting && (
          <CorrectionEditor
            detail={detail.data}
            onCancel={() => setCorrecting(false)}
            onSaved={async () => {
              setCorrecting(false);
              await openLiquor(s.id);
            }}
          />
        )}

        {foodCount && s.isFullCount && s.status !== "draft" && <div className="lq-bv-row">
          <a className="lq-btn" href={`?view=foodcost&section=food&count=${encodeURIComponent(s.id)}`}>Food cost for this count</a>
          <a className="lq-btn" href={`?view=foodvariance&section=food&count=${encodeURIComponent(s.id)}`}>Food variance for this count</a>
        </div>}

        {!foodCount && s.isFullCount && s.status !== "draft" && (
          variance == null ? (
            <p className="lq-muted" style={{ fontSize: 14 }}>Variance report pending. Check again in a minute.</p>
          ) : variance.report.baseline ? (
            <div className="lq-pw-row">
              <div className="lq-pw-head">
                <span className="lq-invrow-vendor">Baseline count</span>
              </div>
              <div className="lq-pw-sub lq-muted">
                Your starting inventory. Variance begins with the next full count.
              </div>
            </div>
          ) : (
            <div className="lq-pw-row">
              {variance.status === "draft" && (
                // Review gate (0136): the window in which 8/07's $730 of
                // clicked-through errors and $321 of invisible ones would have
                // been fixable. Finalize RECOMPUTES from the lines as they
                // stand, so the instruction order matters: fix first, then lock.
                <div className="lq-pw-sub" style={{ marginBottom: 8, padding: "8px 10px", border: "1px solid rgba(230,180,60,0.5)", borderRadius: 6 }}>
                  <strong>Draft report</strong>
                  <p style={{ margin: "6px 0" }}>Correct count errors before locking. Locking sends the summary email. An admin can correct the latest full count after it locks.</p>

                  <div style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className="lq-btn"
                      disabled={finalizing}
                      style={{ padding: "5px 12px", fontSize: 13 }}
                      onClick={async () => {
                        setFinalizing(true);
                        setFinalizeError(null);
                        try {
                          await finalizeCountReport(s.id);
                          // Re-fetch rather than patching state: the recompute
                          // may have CHANGED the grade, and showing the draft's
                          // numbers under a "final" badge would be a lie.
                          setVariance(await getCountVariance(s.id));
                        } catch {
                          setFinalizeError("Couldn't lock the report. Try again.");
                        } finally {
                          setFinalizing(false);
                        }
                      }}
                    >
                      {finalizing ? "Finalizing…" : "Finalize & lock"}
                    </button>
                  </div>
                  {finalizeError && <p className="lq-error" role="alert">{finalizeError}</p>}
                </div>
              )}
              <div className="lq-pw-head">
                <span className="lq-invrow-vendor">
                  Variance grade{" "}
                  <span className="lq-pw-pct" style={{ fontSize: 18 }}>
                    {variance.report.gradePct != null ? `${formatQty(variance.report.gradePct)}%` : "—"}
                  </span>
                </span>
                <button
                  type="button"
                  className="lq-btn lq-btn-ghost"
                  style={{ padding: "4px 10px", fontSize: 13 }}
                  onClick={() => setShowVarianceLines((v) => !v)}
                >
                  {showVarianceLines ? "Hide bottles" : "All bottles"}
                </button>
              </div>
              <div className="lq-pw-sub lq-muted">
                Missing ${variance.report.totals?.missingCost.toFixed(2) ?? "0.00"} · underpour $
                {variance.report.totals?.underpourCredit.toFixed(2) ?? "0.00"} ·{" "}
                {variance.report.totals?.cleanLines ?? 0} clean / {variance.report.totals?.flaggedLines ?? 0} flagged
              </div>
              {(variance.report.caveats ?? []).map((c, i) => (
                <div key={i} className="lq-pw-sub lq-muted" style={{ fontSize: 12 }}>• {c}</div>
              ))}
              {showVarianceLines && (
                // One row per product: two bottle sizes of one product are
                // one row, sizes underneath (VarianceLines.tsx).
                <VarianceLines lines={variance.report.lines ?? []} families={variance.report.families} />

              )}
            </div>
          )
        )}

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
                        {l.source === "correction" && <span className="lq-muted"> · corrected after the lock</span>}
                        {/* Show the case math, not just the product. A line
                            entered as 4 cases x 24 otherwise reads as a bare
                            "96" — and this screen is the only place a wrong
                            multiplier can be caught after the count closes. */}
                        {l.enteredCases != null && l.caseSizeAtEntry != null && Number(l.enteredCases) > 0 && (
                          <span className="lq-muted">
                            {" · "}
                            {formatQty(l.enteredCases)} cs × {l.caseSizeAtEntry}
                            {Number(l.qtyUnits) - Number(l.enteredCases) * l.caseSizeAtEntry > 0 &&
                              ` + ${qty(String(Number(l.qtyUnits) - Number(l.enteredCases) * l.caseSizeAtEntry))}`}
                          </span>
                        )}
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
      <h2 className="lq-h2" style={{ textAlign: "left" }}>{section === "food" ? "Recent food counts" : "Recent counts"}</h2>
      {section === "bar" && <div className="lq-segbar" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "liquor"} className={`lq-seg${mode === "liquor" ? " lq-seg-on" : ""}`} onClick={() => setMode("liquor")}>Liquor</button>
        <button type="button" role="tab" aria-selected={mode === "kegs"} className={`lq-seg${mode === "kegs" ? " lq-seg-on" : ""}`} onClick={() => setMode("kegs")}>Kegs</button>
      </div>}

      {mode === "liquor" ? (
        liquor.length === 0 ? (
          <div className="lq-center"><p className="lq-muted">No {section === "food" ? "food" : "liquor"} counts submitted yet.</p></div>
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
