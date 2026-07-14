import { useEffect, useState } from "react";
import {
  getInvoiceHistory,
  getInvoiceDetail,
  invoiceImageUrl,
  type InvoiceSummary,
  type InvoiceDetail,
  type BarInvoiceStatus,
} from "../api";

// Read-only invoice history — see recent uploads + their status, open the
// extracted lines and the page image (images are kept 30 days; the data stays).

const STATUS_LABEL: Record<BarInvoiceStatus, string> = {
  pending: "Reading…",
  extracted: "Read",
  flagged: "Needs review",
  confirmed: "Confirmed",
};

const money = (s: string | null) =>
  s == null || s === ""
    ? "—"
    : `$${Number(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Invoices({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [list, setList] = useState<InvoiceSummary[]>([]);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const inv = await getInvoiceHistory();
        if (live) {
          setList(inv);
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
      setDetail(await getInvoiceDetail(id));
    } catch {
      /* leave list in place */
    } finally {
      setDetailLoading(false);
    }
  }

  if (phase === "loading") return <div className="lq-center lq-muted">Loading invoices…</div>;
  if (phase === "error")
    return (
      <div className="lq-center">
        <p className="lq-error">Couldn't load invoices.</p>
        <button className="lq-btn" onClick={onDone}>Back</button>
      </div>
    );

  // ── detail ──
  if (detail) {
    const inv = detail.invoice;
    return (
      <div className="lq-invd">
        <button type="button" className="lq-back" onClick={() => setDetail(null)}>‹ All invoices</button>
        <h2 className="lq-h2" style={{ textAlign: "left" }}>{inv.vendorText || "Unknown vendor"}</h2>
        <p className="lq-muted lq-invd-meta">
          {inv.invoiceNumber ? `#${inv.invoiceNumber} · ` : ""}
          {inv.invoiceDate || shortDate(inv.createdAt)} ·{" "}
          <span className={`lq-badge lq-badge-${inv.status}`}>{STATUS_LABEL[inv.status]}</span>
        </p>
        <div className="lq-invd-totals">
          <div><span className="lq-muted">Printed</span><strong>{money(inv.printedTotal)}</strong></div>
          <div><span className="lq-muted">Extracted</span><strong>{money(inv.extractedTotal)}</strong></div>
        </div>

        <h3 className="lq-cap-title">Lines <span className="lq-cap-n">{detail.lines.length}</span></h3>
        <div className="lq-invd-lines">
          {detail.lines.map((l) => (
            <div key={l.id} className={`lq-invd-line${l.needsReview ? " lq-invd-line-review" : ""}`}>
              <div className="lq-invd-line-main">
                <span className="lq-invd-desc">{l.rawDescription || "—"}</span>
                <span className="lq-invd-amt">{money(l.extendedAmount)}</span>
              </div>
              <div className="lq-invd-line-sub lq-muted">
                {l.lineType !== "product" && <span className="lq-invd-tag">{l.lineType}</span>}
                {l.matchedName ? (
                  <span>→ {l.matchedName}</span>
                ) : l.lineType === "product" ? (
                  <span className="lq-invd-unmatched">{l.needsReview ? "needs match" : "unmatched"}</span>
                ) : null}
                {l.qtyUnits && <span>· {Number(l.qtyUnits)} × {money(l.unitCost)}</span>}
              </div>
            </div>
          ))}
        </div>

        <h3 className="lq-cap-title">Pages</h3>
        {detail.images.length === 0 ? (
          <p className="lq-muted">Image removed (kept 30 days) — the read above stays on file.</p>
        ) : (
          <div className="lq-invd-imgs">
            {detail.images.map((im) =>
              im.contentType === "application/pdf" ? (
                <a key={im.id} className="lq-btn lq-btn-ghost" href={invoiceImageUrl(im.id)} target="_blank" rel="noreferrer">
                  📄 Open PDF
                </a>
              ) : (
                <a key={im.id} href={invoiceImageUrl(im.id)} target="_blank" rel="noreferrer" className="lq-invd-imglink">
                  <img src={invoiceImageUrl(im.id)} alt={`page ${im.pageNumber ?? ""}`} loading="lazy" />
                </a>
              ),
            )}
          </div>
        )}
      </div>
    );
  }

  // ── list ──
  return (
    <div className="lq-invlist">
      <p className="lq-muted lq-upload-hint">Uploaded in the last 60 days — tap one for the read + image.</p>
      {list.length === 0 ? (
        <div className="lq-center"><p className="lq-muted">No invoices yet.</p></div>
      ) : (
        list.map((inv) => (
          <button key={inv.id} type="button" className="lq-invrow" onClick={() => open(inv.id)} disabled={detailLoading}>
            <div className="lq-invrow-main">
              <span className="lq-invrow-vendor">{inv.vendorText || "Unknown vendor"}</span>
              <span className={`lq-badge lq-badge-${inv.status}`}>{STATUS_LABEL[inv.status]}</span>
            </div>
            <div className="lq-invrow-sub lq-muted">
              {inv.invoiceNumber ? `#${inv.invoiceNumber} · ` : ""}
              {inv.invoiceDate || shortDate(inv.createdAt)} · {money(inv.printedTotal)}
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
