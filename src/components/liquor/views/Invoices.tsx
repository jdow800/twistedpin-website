import { useEffect, useMemo, useState } from "react";
import {
  getInvoiceHistory,
  getInvoiceDetail,
  getCatalog,
  matchInvoiceLine,
  newSkuFromLine,
  reextractInvoice,
  invoiceImageUrl,
  type InvoiceSummary,
  type InvoiceDetail,
  type InvoiceLine,
  type BarInvoiceStatus,
  type BarSkuItem,
} from "../api";
import { matchSkus } from "../matcher";

/** "1.75L" / "750ML" / "1L" → ml (mirrors the backend parseSizeMl); null if none. */
function parseSizeMl(sizeText: string | null): number | null {
  if (!sizeText) return null;
  const s = sizeText.toUpperCase();
  let m = s.match(/(\d+(?:\.\d+)?)\s*ML/);
  if (m) return Math.round(parseFloat(m[1]!));
  m = s.match(/(\d+(?:\.\d+)?)\s*L(?![A-Z])/);
  if (m) return Math.round(parseFloat(m[1]!) * 1000);
  return null;
}

/** Loose name key for the new-bottle dup-guard: lowercase, alnum-only, collapsed. */
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

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
  const [catalog, setCatalog] = useState<BarSkuItem[]>([]);
  const [reextracting, setReextracting] = useState(false);
  const [reextractMsg, setReextractMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [inv, cat] = await Promise.all([getInvoiceHistory(), getCatalog().catch(() => [])]);
        if (live) {
          setList(inv);
          setCatalog(cat);
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

  // Apply a confirmed match to the open detail (line matched + review cleared;
  // flip the invoice to Confirmed when the server says nothing's left).
  function handleMatched(lineId: string, name: string, confirmed: boolean) {
    setDetail((d) =>
      d
        ? {
            ...d,
            invoice: confirmed ? { ...d.invoice, status: "confirmed" } : d.invoice,
            lines: d.lines.map((x) => (x.id === lineId ? { ...x, matchedName: name, needsReview: false } : x)),
          }
        : d,
    );
  }

  async function open(id: string) {
    setDetailLoading(true);
    setReextractMsg(null);
    try {
      setDetail(await getInvoiceDetail(id));
    } catch {
      /* leave list in place */
    } finally {
      setDetailLoading(false);
    }
  }

  // Re-run extraction on the stored image (e.g. after an extractor fix) — flips
  // the invoice back to 'pending'; the worker re-reads it within ~a minute.
  async function doReextract() {
    if (!detail || reextracting) return;
    setReextracting(true);
    setReextractMsg(null);
    try {
      const r = await reextractInvoice(detail.invoice.id);
      if (r.ok) {
        setReextractMsg("Re-reading now — check back in about a minute, then reopen it.");
        getInvoiceHistory().then(setList).catch(() => {});
      } else {
        setReextractMsg(
          r.error === "images_purged"
            ? "The page image was purged (kept 30 days) — can't re-read this one."
            : "Couldn't re-extract — try again.",
        );
      }
    } catch {
      setReextractMsg("Couldn't re-extract — try again.");
    } finally {
      setReextracting(false);
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
    const p = Number(inv.printedTotal);
    const e = Number(inv.extractedTotal);
    const totalsDelta =
      inv.printedTotal != null && inv.extractedTotal != null && Number.isFinite(p) && Number.isFinite(e)
        ? Math.abs(p - e)
        : 0;
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

        {totalsDelta >= 0.01 && (
          <p className="lq-muted lq-invd-note">
            Totals don't tie ({money(totalsDelta.toFixed(2))}) — usually deposits, fees, or return
            credits, not bottle cost. The line costs are still captured.
          </p>
        )}

        {(inv.status === "flagged" || inv.status === "extracted") && (
          <div className="lq-invd-reextract">
            <button type="button" className="lq-btn lq-btn-ghost" disabled={reextracting} onClick={doReextract}>
              {reextracting ? "Re-reading…" : "Re-extract"}
            </button>
            <span className="lq-muted lq-invd-reextract-hint">
              {reextractMsg ?? "Re-read the image with the latest logic."}
            </span>
          </div>
        )}

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
              {l.needsReview && l.lineType === "product" && (
                <MatchControl invoiceId={detail.invoice.id} line={l} catalog={catalog} onMatched={handleMatched} />
              )}
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

function MatchControl({
  invoiceId,
  line,
  catalog,
  onMatched,
}: {
  invoiceId: string;
  line: InvoiceLine;
  catalog: BarSkuItem[];
  onMatched: (lineId: string, name: string, confirmed: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [newName, setNewName] = useState((line.rawDescription ?? "").trim().slice(0, 120));
  const [newSize, setNewSize] = useState(() => {
    const ml = parseSizeMl(line.sizeText);
    return ml != null ? String(ml) : "";
  });
  const suggestions = useMemo(
    () => matchSkus(line.rawDescription ?? "", catalog).slice(0, 3),
    [line.rawDescription, catalog],
  );
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return catalog.filter((s) => s.name.toLowerCase().includes(t)).slice(0, 6);
  }, [q, catalog]);
  // Dup-guard: an existing bottle with the same name (any size). Creating a
  // near-duplicate silently splits one bottle into several + breaks voice counts,
  // so surface it loudly and offer a one-tap match instead.
  const dupes = useMemo(() => {
    const n = normalizeName(newName);
    if (!n) return [];
    return catalog.filter((s) => normalizeName(s.name) === n);
  }, [newName, catalog]);

  async function pick(skuId: string, name: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await matchInvoiceLine(invoiceId, line.id, skuId);
      onMatched(line.id, r.matchedName || name, r.invoiceConfirmed);
    } catch {
      setErr("Couldn't save — try again.");
      setBusy(false);
    }
  }

  async function createNew() {
    const nm = newName.trim();
    if (!nm) return;
    setBusy(true);
    setErr(null);
    try {
      const n = Number(newSize);
      const sizeMl = newSize.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
      const r = await newSkuFromLine(invoiceId, line.id, nm, sizeMl);
      onMatched(line.id, r.matchedName, r.invoiceConfirmed);
    } catch {
      setErr("Couldn't create — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="lq-match">
      {suggestions.length > 0 && (
        <div className="lq-rev-choices">
          <span className="lq-muted lq-rev-hint">Did you mean</span>
          {suggestions.map((c) => (
            <button key={c.sku.id} type="button" className="lq-chip" disabled={busy} onClick={() => pick(c.sku.id, c.sku.name)}>
              {c.sku.name}{c.sku.sizeMl != null ? ` · ${c.sku.sizeMl}ml` : ""}
            </button>
          ))}
        </div>
      )}
      <div className="lq-rev-assign">
        <input
          className="lq-search lq-rev-search"
          type="search"
          placeholder="Search a bottle to match…"
          value={q}
          disabled={busy}
          onChange={(e) => setQ(e.target.value)}
        />
        {hits.map((s) => (
          <button key={s.id} type="button" className="lq-chip" disabled={busy} onClick={() => pick(s.id, s.name)}>
            {s.name}{s.sizeMl != null ? ` · ${s.sizeMl}ml` : ""}
          </button>
        ))}
      </div>
      {!newMode ? (
        <button type="button" className="lq-linkbtn" disabled={busy} onClick={() => setNewMode(true)}>
          + New bottle (not in the list)
        </button>
      ) : (
        <div className="lq-newsku">
          <input
            className="lq-newsku-name"
            placeholder="Bottle name"
            value={newName}
            disabled={busy}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="lq-newsku-row">
            <input
              className="lq-newsku-size"
              type="number"
              inputMode="numeric"
              placeholder="ml"
              value={newSize}
              disabled={busy}
              onChange={(e) => setNewSize(e.target.value)}
            />
            <span className="lq-muted lq-newsku-hint">size in ml — leave blank if it's not a bottle</span>
          </div>
          {dupes.length > 0 && (
            <div className="lq-newsku-dup">
              <span className="lq-newsku-dup-warn">
                You already have this bottle — match it instead of adding a duplicate?
              </span>
              {dupes.map((s) => (
                <button key={s.id} type="button" className="lq-chip" disabled={busy} onClick={() => pick(s.id, s.name)}>
                  Match “{s.name}{s.sizeMl != null ? ` · ${s.sizeMl}ml` : ""}”
                </button>
              ))}
            </div>
          )}
          <div className="lq-newsku-actions">
            <button type="button" className="lq-btn lq-btn-primary" disabled={busy || !newName.trim()} onClick={createNew}>
              {dupes.length > 0 ? "Add anyway" : "Create + match"}
            </button>
            <button type="button" className="lq-linkbtn" disabled={busy} onClick={() => setNewMode(false)}>cancel</button>
          </div>
        </div>
      )}
      {err && <p className="lq-error">{err}</p>}
    </div>
  );
}
